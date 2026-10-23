// The Google Calendar consent flow (MOM-62): the redirect that starts it and the callback that finishes it, for
// the signed-in user (docs/INTEGRATIONS_SPEC.md §3.C, §5). Server-side only: `server-only` fails the build if a
// Client Component imports this, and tests/connect-flows.test.ts fails if one does.
//
// What protects the flow:
// - state: a random value kept in a short-lived httpOnly cookie and sent to Google; the callback refuses any
//   request whose state does not match it, so a forged callback cannot connect someone else's Google account;
// - PKCE: the code verifier stays in that cookie and is sent only to Google's token endpoint, so a stolen
//   authorisation code is useless;
// - the cookie also holds the user id and the redirect URI, and the callback refuses a different signed-in user
//   or a different address;
// - the exchange happens here, on the server, with the client secret; the browser only ever carries the
//   authorisation code Google puts in the address, which is single-use and useless without the verifier.
//
// Nothing a provider wrote, and no token, ever leaves this module: every result is one of a fixed set of outcome
// codes (CONNECT_OUTCOMES), which is also all that goes into a redirect address or a log line. The tokens go
// straight to saveOAuthTokens(), which validates and stores them (migration 005).

import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { getGoogleOAuthEnv } from '@/lib/config/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { parseOAuthTokenResponse, type ConnectOutcome } from '@/types/integrations';
import { GOOGLE_TOKEN_URL, saveOAuthTokens } from './integrations';

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
// The smallest scope that reads events: no write access, and nothing about contacts, mail or files.
export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
export const GOOGLE_CALLBACK_PATH = '/api/auth/callback/google';
export const GOOGLE_STATE_COOKIE = 'momentum_google_oauth';
// Long enough to read the consent screen, short enough that a stale tab cannot finish a flow hours later.
export const GOOGLE_STATE_MAX_AGE_SECONDS = 600;
const EXCHANGE_TIMEOUT_MS = 10_000;

// What the browser holds between the redirect and the callback.
const StatePayloadSchema = z.strictObject({
  s: z.string().min(32).max(128), // state
  v: z.string().min(43).max(128), // PKCE code verifier
  u: z.string().uuid(), // the user who started it
  r: z.url(), // the redirect URI sent to Google, repeated in the exchange
  t: z.number().int().positive(), // when it started (ms since the epoch)
});
type StatePayload = z.infer<typeof StatePayloadSchema>;

export interface FlowDeps {
  fetch?: typeof fetch;
  now?: () => Date;
  // Replaceable so tests can fix the random values.
  random?: (bytes: number) => Buffer;
}

const base64url = (buffer: Buffer) => buffer.toString('base64url');
export const encodeStateCookie = (payload: StatePayload) => base64url(Buffer.from(JSON.stringify(payload), 'utf8'));

export function decodeStateCookie(value: string | undefined): StatePayload | null {
  if (!value || value.length > 2048) return null;
  try {
    const parsed = StatePayloadSchema.safeParse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// PKCE S256 (RFC 7636): the challenge sent to Google is the hash of the verifier kept in the cookie.
export const pkceChallenge = (verifier: string) => base64url(createHash('sha256').update(verifier).digest());

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  // getUser() asks Supabase Auth, not just the cookie.
  const { data, error } = await supabase.auth.getUser();
  return error || !data.user ? null : data.user.id;
}

export const googleRedirectUri = (origin: string) => `${origin}${GOOGLE_CALLBACK_PATH}`;

export type BeginResult =
  | { ok: true; redirectTo: string; cookie: { name: string; value: string; maxAge: number } }
  | { ok: false; outcome: Extract<ConnectOutcome, 'signed_out' | 'not_configured'> };

// Starts the flow for the signed-in user: the address to send them to on Google, and the cookie to set. `origin` is
// the address this app is being served from (it must be one of the redirect URIs registered for the Google client).
export async function beginGoogleConnect(origin: string, deps: FlowDeps = {}): Promise<BeginResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, outcome: 'signed_out' };

  let clientId: string;
  try {
    clientId = getGoogleOAuthEnv().GOOGLE_CLIENT_ID;
  } catch {
    return { ok: false, outcome: 'not_configured' };
  }

  const random = deps.random ?? randomBytes;
  const redirectUri = googleRedirectUri(origin);
  const payload: StatePayload = {
    s: base64url(random(32)),
    v: base64url(random(48)),
    u: userId,
    r: redirectUri,
    t: (deps.now ?? (() => new Date()))().getTime(),
  };

  const url = new URL(GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_CALENDAR_SCOPE,
    // A refresh token, so a sync can run when the user is not here, and consent every time so Google sends one
    // even when the user has connected before.
    access_type: 'offline',
    prompt: 'consent',
    state: payload.s,
    code_challenge: pkceChallenge(payload.v),
    code_challenge_method: 'S256',
  }).toString();

  return {
    ok: true,
    redirectTo: url.toString(),
    cookie: { name: GOOGLE_STATE_COOKIE, value: encodeStateCookie(payload), maxAge: GOOGLE_STATE_MAX_AGE_SECONDS },
  };
}

export interface CallbackInput {
  // The address this app is being served from, to check against the one the flow started on.
  origin: string;
  // The query Google sent back. Only these three are read, and none is ever echoed.
  code: string | null;
  state: string | null;
  error: string | null;
  // The value of the state cookie, if the browser sent one.
  cookieValue: string | undefined;
}

function logFailure(reason: string, detail: Record<string, string | number> = {}) {
  // Fixed words and numbers only: never a code, a token, a provider message or an address.
  console.error('[google-oauth] connect failed', { reason, ...detail });
}

// Finishes the flow. Always returns an outcome and never throws; the caller redirects with it and clears the
// state cookie (it is single-use, whatever the outcome).
export async function completeGoogleConnect(input: CallbackInput, deps: FlowDeps = {}): Promise<ConnectOutcome> {
  const userId = await currentUserId();
  if (!userId) return 'signed_out';

  const saved = decodeStateCookie(input.cookieValue);
  if (!saved) return 'expired';
  const now = (deps.now ?? (() => new Date()))().getTime();
  if (now - saved.t > GOOGLE_STATE_MAX_AGE_SECONDS * 1000 || saved.t > now + 60_000) return 'expired';

  // The state must match, the flow must have been started by this user, on this address.
  if (!input.state || !sameSecret(input.state, saved.s)) return 'bad_state';
  if (saved.u !== userId) return 'bad_state';
  if (saved.r !== googleRedirectUri(input.origin)) return 'bad_state';

  // The user said no, or Google refused. Only the fact is kept, never Google's wording.
  if (input.error) return input.error === 'access_denied' ? 'denied' : 'failed';
  if (!input.code || input.code.length > 2048) return 'failed';

  let clientId: string;
  let clientSecret: string;
  try {
    ({ GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret } = getGoogleOAuthEnv());
  } catch {
    return 'not_configured';
  }

  let response: Response;
  try {
    response = await (deps.fetch ?? fetch)(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: input.code,
        redirect_uri: saved.r,
        client_id: clientId,
        client_secret: clientSecret,
        code_verifier: saved.v,
      }),
      signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS),
    });
  } catch {
    logFailure('exchange_unreachable');
    return 'failed';
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Handled below as an unexpected response.
  }
  if (!response.ok) {
    logFailure('exchange_refused', { httpCode: response.status });
    return 'failed';
  }

  const tokens = parseOAuthTokenResponse(body);
  if (!tokens.ok) {
    logFailure('exchange_unexpected_response');
    return 'failed';
  }
  // Google lets the user untick a permission on the consent screen. Without read access to the calendar there is
  // nothing to connect, and nothing is stored.
  if (tokens.data.scope !== undefined && !tokens.data.scope.split(' ').includes(GOOGLE_CALENDAR_SCOPE)) return 'scope';

  const stored = await saveOAuthTokens('google_calendar', tokens.data, deps.now ? { now: deps.now } : {});
  if (!stored.ok) {
    logFailure('save_refused');
    return 'failed';
  }
  return 'connected';
}
