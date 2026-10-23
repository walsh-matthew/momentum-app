// The Google consent flow and the Hevy key action (MOM-62), with the network and the databases replaced by fakes:
// state and PKCE, the callback's refusals (no session, wrong state, wrong user, wrong address, expired, denied, a
// failed exchange, a missing permission), that nothing secret is ever returned, redirected with or logged, the
// routes, the proxy, and the boundary that keeps the exchange code out of components.
//
// No request goes to Google: fetch is a stand-in that returns what Google's token endpoint would. Who can read
// the stored tokens is covered in tests/integrations-service.test.ts and supabase/verify/005.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disconnectApp, saveHevyApiKey } from '@/app/actions/integrations';
import { CONNECT_NOTICES, noticeFor } from '@/lib/integrations/connectNotices';
import {
  GOOGLE_AUTH_URL,
  GOOGLE_CALENDAR_SCOPE,
  GOOGLE_CALLBACK_PATH,
  GOOGLE_STATE_COOKIE,
  beginGoogleConnect,
  completeGoogleConnect,
  decodeStateCookie,
  encodeStateCookie,
  pkceChallenge,
  type CallbackInput,
} from '@/lib/services/googleOAuth';
import { GOOGLE_TOKEN_URL } from '@/lib/services/integrations';
import { CONNECT_OUTCOMES } from '@/types/integrations';
import { USER_A, USER_B, idb, resetIdb, seedConnection } from './helpers/fakeIntegrations';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeIntegrations');
  return { createSupabaseServerClient };
});
vi.mock('@/lib/supabase/admin', async () => {
  const { createSupabaseAdminClient } = await import('./helpers/fakeIntegrations');
  return { createSupabaseAdminClient };
});
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// The proxy's own session check (see "the proxy and the new routes" below).
const auth = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: auth.user }, error: null }) } }),
}));
vi.mock('@/lib/config/env', () => ({
  getGoogleOAuthEnv: googleEnv.get,
  getPublicEnv: () => ({ NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' }),
}));

const SECRET = 'client-secret-do-not-leak-456';
const googleEnv = vi.hoisted(() => ({ get: vi.fn() }));

const ORIGIN = 'https://momentum.example.com';
const NOW = new Date('2026-11-01T12:00:00.000Z');
const now = () => NOW;
const ACCESS = 'ya29.access-token-do-not-leak';
const REFRESH = '1//refresh-token-do-not-leak';
const CODE = '4/0Auth-code-from-google-do-not-leak';

// A fixed "random" source, so state and verifier are known.
const random = (n: number) => Buffer.alloc(n, 7);

const goodTokens = (over: object = {}) => ({
  access_token: ACCESS,
  refresh_token: REFRESH,
  expires_in: 3599,
  scope: GOOGLE_CALENDAR_SCOPE,
  token_type: 'Bearer',
  ...over,
});
const tokenEndpoint = (status: number, body: unknown) =>
  vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));

// Starts a flow as USER_A and returns what the browser would hold and send back.
async function started(origin = ORIGIN) {
  const begun = await beginGoogleConnect(origin, { now, random });
  if (!begun.ok) throw new Error('could not start');
  const payload = decodeStateCookie(begun.cookie.value)!;
  return { begun, cookieValue: begun.cookie.value, state: payload.s, verifier: payload.v };
}
const callback = (over: Partial<CallbackInput>, base: Pick<CallbackInput, 'cookieValue' | 'state'>): CallbackInput => ({
  origin: ORIGIN,
  code: CODE,
  error: null,
  ...base,
  ...over,
});

let logged: string[];
beforeEach(() => {
  resetIdb({ id: USER_A });
  googleEnv.get.mockReset();
  googleEnv.get.mockReturnValue({ GOOGLE_CLIENT_ID: 'client-id-123', GOOGLE_CLIENT_SECRET: SECRET });
  logged = [];
  vi.spyOn(console, 'error').mockImplementation((...args) => void logged.push(JSON.stringify(args)));
  vi.spyOn(console, 'log').mockImplementation((...args) => void logged.push(JSON.stringify(args)));
});
afterEach(() => vi.restoreAllMocks());

const nothingStored = () => {
  expect(idb.creds).toHaveLength(0);
  expect(idb.apps).toHaveLength(0);
};
const everything = (value: unknown) => JSON.stringify(value);
function expectNoSecrets(text: string, extra: string[] = []) {
  for (const secret of [ACCESS, REFRESH, SECRET, CODE, ...extra]) expect(text, `leaked ${secret.slice(0, 8)}…`).not.toContain(secret);
}

describe('starting the flow', () => {
  it('sends the user to Google with the minimal scope, offline access, state and a PKCE challenge', async () => {
    const { begun, state, verifier } = await started();
    expect(begun.ok).toBe(true);
    if (!begun.ok) return;
    const url = new URL(begun.redirectTo);
    expect(`${url.origin}${url.pathname}`).toBe(GOOGLE_AUTH_URL);
    const p = url.searchParams;
    expect(p.get('client_id')).toBe('client-id-123');
    expect(p.get('redirect_uri')).toBe(`${ORIGIN}${GOOGLE_CALLBACK_PATH}`);
    expect(p.get('response_type')).toBe('code');
    expect(p.get('scope')).toBe('https://www.googleapis.com/auth/calendar.readonly');
    expect(p.get('access_type')).toBe('offline');
    expect(p.get('prompt')).toBe('consent');
    expect(p.get('state')).toBe(state);
    expect(p.get('code_challenge_method')).toBe('S256');
    expect(p.get('code_challenge')).toBe(createHash('sha256').update(verifier).digest('base64url'));
    expect(p.get('code_challenge')).toBe(pkceChallenge(verifier));
  });

  it('asks for read access to the calendar and nothing else', async () => {
    const begun = await beginGoogleConnect(ORIGIN, { now, random });
    if (!begun.ok) throw new Error('could not start');
    const scopes = new URL(begun.redirectTo).searchParams.get('scope')!.split(' ');
    expect(scopes).toEqual([GOOGLE_CALENDAR_SCOPE]);
    expect(scopes[0]).toMatch(/calendar\.readonly$/);
  });

  it('keeps the verifier and the client secret out of the address Google sees', async () => {
    const { begun, verifier } = await started();
    if (!begun.ok) return;
    expect(begun.redirectTo).not.toContain(verifier);
    expect(begun.redirectTo).not.toContain(SECRET);
  });

  it('the cookie holds the state, the verifier, the user and the redirect address, for ten minutes', async () => {
    const { begun } = await started();
    if (!begun.ok) return;
    expect(begun.cookie.name).toBe(GOOGLE_STATE_COOKIE);
    expect(begun.cookie.maxAge).toBe(600);
    expect(decodeStateCookie(begun.cookie.value)).toMatchObject({ u: USER_A, r: `${ORIGIN}${GOOGLE_CALLBACK_PATH}`, t: NOW.getTime() });
    expect(begun.cookie.value).not.toContain(SECRET);
  });

  it('every start has its own state and verifier when the randomness differs', async () => {
    const a = await beginGoogleConnect(ORIGIN, { now });
    const b = await beginGoogleConnect(ORIGIN, { now });
    if (!a.ok || !b.ok) throw new Error('could not start');
    expect(decodeStateCookie(a.cookie.value)!.s).not.toBe(decodeStateCookie(b.cookie.value)!.s);
    expect(decodeStateCookie(a.cookie.value)!.v).not.toBe(decodeStateCookie(b.cookie.value)!.v);
  });

  it('needs a session: signed out it starts nothing', async () => {
    resetIdb(null);
    expect(await beginGoogleConnect(ORIGIN, { now, random })).toEqual({ ok: false, outcome: 'signed_out' });
  });

  it('says so when the Google client is not configured, and starts nothing', async () => {
    googleEnv.get.mockImplementation(() => {
      throw new Error('Invalid Google OAuth environment variables. GOOGLE_CLIENT_ID: required');
    });
    expect(await beginGoogleConnect(ORIGIN, { now, random })).toEqual({ ok: false, outcome: 'not_configured' });
  });
});

describe('the callback', () => {
  it('exchanges the code on the server with the verifier, the secret and the same redirect address, then stores the tokens', async () => {
    const flow = await started();
    const fetchMock = tokenEndpoint(200, goodTokens());

    const outcome = await completeGoogleConnect(callback({}, flow), { fetch: fetchMock as never, now });

    expect(outcome).toBe('connected');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(GOOGLE_TOKEN_URL);
    expect(init?.method).toBe('POST');
    const body = new URLSearchParams(String(init?.body));
    expect(Object.fromEntries(body)).toEqual({
      grant_type: 'authorization_code',
      code: CODE,
      redirect_uri: `${ORIGIN}${GOOGLE_CALLBACK_PATH}`,
      client_id: 'client-id-123',
      client_secret: SECRET,
      code_verifier: flow.verifier,
    });
    // Stored for the signed-in user only, on the server side of the table.
    expect(idb.creds).toHaveLength(1);
    expect(idb.creds[0]).toMatchObject({
      user_id: USER_A,
      provider: 'google_calendar',
      auth_type: 'oauth2',
      access_token: ACCESS,
      refresh_token: REFRESH,
      scope: GOOGLE_CALENDAR_SCOPE,
      status: 'connected',
    });
    expect(idb.apps[0]).toMatchObject({ user_id: USER_A, provider: 'google_calendar', is_active: true });
  });

  it('accepts a response with no scope field (the token endpoint may omit it)', async () => {
    const flow = await started();
    const { scope: _omit, ...withoutScope } = goodTokens();
    expect(await completeGoogleConnect(callback({}, flow), { fetch: tokenEndpoint(200, withoutScope) as never, now })).toBe('connected');
  });

  describe('refused before any request to Google', () => {
    async function refused(input: CallbackInput, why: string) {
      const fetchMock = tokenEndpoint(200, goodTokens());
      const outcome = await completeGoogleConnect(input, { fetch: fetchMock as never, now });
      expect(outcome).toBe(why);
      expect(fetchMock, 'no request to Google').not.toHaveBeenCalled();
      nothingStored();
      expectNoSecrets(logged.join(''));
    }

    it('a state that does not match', async () => {
      const flow = await started();
      await refused(callback({ state: 'a-different-state-value-0123456789abcdef' }, flow), 'bad_state');
    });

    it('a state that is almost right', async () => {
      const flow = await started();
      await refused(callback({ state: `${flow.state.slice(0, -1)}X` }, flow), 'bad_state');
    });

    it('no state in the address', async () => {
      const flow = await started();
      await refused(callback({ state: null }, flow), 'bad_state');
      await refused(callback({ state: '' }, flow), 'bad_state');
    });

    it('a state without the cookie: someone else\'s flow, or a stale tab', async () => {
      const flow = await started();
      await refused(callback({ cookieValue: undefined }, flow), 'expired');
    });

    it.each([['garbage', 'not-a-cookie'], ['empty', ''], ['json that is not the payload', Buffer.from('{"s":"x"}').toString('base64url')]])(
      'a damaged cookie (%s)',
      async (_name, cookieValue) => {
        const flow = await started();
        await refused(callback({ cookieValue }, flow), 'expired');
      },
    );

    it('a flow that took more than ten minutes', async () => {
      const flow = await started();
      const late = () => new Date(NOW.getTime() + 601_000);
      const fetchMock = tokenEndpoint(200, goodTokens());
      expect(await completeGoogleConnect(callback({}, flow), { fetch: fetchMock as never, now: late })).toBe('expired');
      expect(fetchMock).not.toHaveBeenCalled();
      nothingStored();
    });

    it('a cookie dated in the future', async () => {
      const flow = await started();
      const early = () => new Date(NOW.getTime() - 3_600_000);
      const fetchMock = tokenEndpoint(200, goodTokens());
      expect(await completeGoogleConnect(callback({}, flow), { fetch: fetchMock as never, now: early })).toBe('expired');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('no session: nothing is exchanged and nothing is stored', async () => {
      const flow = await started();
      resetIdb(null);
      await refused(callback({}, flow), 'signed_out');
    });

    it('a different signed-in user than the one who started it', async () => {
      const flow = await started();
      resetIdb({ id: USER_B });
      await refused(callback({}, flow), 'bad_state');
    });

    it('a different address than the one the flow started on', async () => {
      const flow = await started();
      await refused(callback({ origin: 'https://evil.example.com' }, flow), 'bad_state');
    });

    it('a cookie whose redirect address was changed to point elsewhere', async () => {
      const flow = await started();
      const payload = decodeStateCookie(flow.cookieValue)!;
      const tampered = encodeStateCookie({ ...payload, r: 'https://evil.example.com/api/auth/callback/google' });
      await refused(callback({ cookieValue: tampered }, flow), 'bad_state');
    });
  });

  describe('denial', () => {
    it('the user said no: a friendly outcome, no exchange, nothing stored', async () => {
      const flow = await started();
      const fetchMock = tokenEndpoint(200, goodTokens());
      const outcome = await completeGoogleConnect(callback({ code: null, error: 'access_denied' }, flow), { fetch: fetchMock as never, now });
      expect(outcome).toBe('denied');
      expect(fetchMock).not.toHaveBeenCalled();
      nothingStored();
    });

    it('any other error from Google is a plain failure, without its wording', async () => {
      const flow = await started();
      const outcome = await completeGoogleConnect(callback({ code: null, error: 'server_error: <script>alert(1)</script>' }, flow), { now });
      expect(outcome).toBe('failed');
      expect(logged.join('')).not.toContain('script');
    });

    it('a denial with the wrong state is not trusted either', async () => {
      const flow = await started();
      const outcome = await completeGoogleConnect(callback({ code: null, error: 'access_denied', state: 'forged-forged-forged-forged-forged-12' }, flow), { now });
      expect(outcome).toBe('bad_state');
    });

    it('a callback with neither a code nor an error fails without calling Google', async () => {
      const flow = await started();
      const fetchMock = tokenEndpoint(200, goodTokens());
      expect(await completeGoogleConnect(callback({ code: null }, flow), { fetch: fetchMock as never, now })).toBe('failed');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('an absurdly long code is refused unread', async () => {
      const flow = await started();
      const fetchMock = tokenEndpoint(200, goodTokens());
      expect(await completeGoogleConnect(callback({ code: 'x'.repeat(5000) }, flow), { fetch: fetchMock as never, now })).toBe('failed');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('the exchange fails', () => {
    async function failing(fetchImpl: unknown, expected: string) {
      const flow = await started();
      const outcome = await completeGoogleConnect(callback({}, flow), { fetch: fetchImpl as never, now });
      expect(outcome).toBe(expected);
      nothingStored();
      const text = logged.join('') + everything(outcome);
      expectNoSecrets(text, [flow.verifier, flow.state]);
    }

    it('Google refuses the code (invalid_grant)', async () => {
      await failing(tokenEndpoint(400, { error: 'invalid_grant', error_description: 'Bad Request ' + ACCESS }), 'failed');
    });
    it('Google refuses the client (invalid_client)', async () => {
      await failing(tokenEndpoint(401, { error: 'invalid_client' }), 'failed');
    });
    it('Google cannot be reached', async () => {
      await failing(vi.fn(async () => { throw new TypeError('fetch failed ' + SECRET); }), 'failed');
    });
    it('Google answers with something that is not JSON', async () => {
      await failing(vi.fn(async () => new Response('<html>oops</html>', { status: 200 })), 'failed');
    });
    it('a success with no access token', async () => {
      await failing(tokenEndpoint(200, { token_type: 'Bearer', expires_in: 3600 }), 'failed');
    });
    it('a success with an unsupported token type', async () => {
      await failing(tokenEndpoint(200, goodTokens({ token_type: 'mac' })), 'failed');
    });
    it('a success whose token is absurdly long', async () => {
      await failing(tokenEndpoint(200, goodTokens({ access_token: 'x'.repeat(5000) })), 'failed');
    });
    it('storing the tokens is refused', async () => {
      const flow = await started();
      idb.failNextAdminWrite = `duplicate key value violates ... (${REFRESH})`;
      const outcome = await completeGoogleConnect(callback({}, flow), { fetch: tokenEndpoint(200, goodTokens()) as never, now });
      expect(outcome).toBe('failed');
      expectNoSecrets(logged.join('') + outcome);
    });
    it('the Google client is not configured', async () => {
      const flow = await started();
      googleEnv.get.mockImplementation(() => { throw new Error('missing'); });
      const fetchMock = tokenEndpoint(200, goodTokens());
      expect(await completeGoogleConnect(callback({}, flow), { fetch: fetchMock as never, now })).toBe('not_configured');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('the permission the user granted', () => {
    it('refuses a connection that was not given read access to the calendar, and stores nothing', async () => {
      const flow = await started();
      const outcome = await completeGoogleConnect(callback({}, flow), {
        fetch: tokenEndpoint(200, goodTokens({ scope: 'openid email' })) as never,
        now,
      });
      expect(outcome).toBe('scope');
      nothingStored();
    });

    it('accepts the calendar permission among others', async () => {
      const flow = await started();
      const outcome = await completeGoogleConnect(callback({}, flow), {
        fetch: tokenEndpoint(200, goodTokens({ scope: `openid ${GOOGLE_CALENDAR_SCOPE}` })) as never,
        now,
      });
      expect(outcome).toBe('connected');
    });
  });

  it('a repeat consent that returns no refresh token keeps the one already stored', async () => {
    seedConnection(USER_A, 'google_calendar', { auth_type: 'oauth2', access_token: 'old', refresh_token: 'kept-refresh', status: 'needs_reauth' });
    const flow = await started();
    const { refresh_token: _omit, ...noRefresh } = goodTokens();
    expect(await completeGoogleConnect(callback({}, flow), { fetch: tokenEndpoint(200, noRefresh) as never, now })).toBe('connected');
    expect(idb.creds).toHaveLength(1);
    expect(idb.creds[0]).toMatchObject({ access_token: ACCESS, refresh_token: 'kept-refresh', status: 'connected' });
  });

  it('only ever answers with one of the fixed outcome codes', async () => {
    const flow = await started();
    const answers = await Promise.all([
      completeGoogleConnect(callback({}, flow), { fetch: tokenEndpoint(200, goodTokens()) as never, now }),
      completeGoogleConnect(callback({ state: 'nope' }, flow), { now }),
      completeGoogleConnect(callback({ error: 'access_denied' }, flow), { now }),
      completeGoogleConnect(callback({ cookieValue: undefined }, flow), { now }),
    ]);
    for (const a of answers) expect(CONNECT_OUTCOMES).toContain(a);
  });
});

describe('the routes', () => {
  const stubFetch = (impl: ReturnType<typeof tokenEndpoint>) => vi.stubGlobal('fetch', impl);
  afterEach(() => vi.unstubAllGlobals());

  async function startRoute() {
    const { POST } = await import('@/app/api/integrations/google/start/route');
    return POST(new NextRequest(`${ORIGIN}/api/integrations/google/start`, { method: 'POST' }));
  }
  async function callbackRoute(query: string, cookie?: string) {
    const { GET } = await import('@/app/api/auth/callback/google/route');
    return GET(
      new NextRequest(`${ORIGIN}${GOOGLE_CALLBACK_PATH}${query}`, {
        headers: cookie ? { cookie: `${GOOGLE_STATE_COOKIE}=${cookie}` } : {},
      }),
    );
  }

  it('start: redirects to Google and sets one httpOnly, SameSite=Lax cookie scoped to the callback path', async () => {
    const res = await startRoute();
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get('location')!).origin).toBe('https://accounts.google.com');
    const cookie = res.cookies.get(GOOGLE_STATE_COOKIE);
    expect(cookie).toBeDefined();
    const header = res.headers.get('set-cookie')!;
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=lax/i);
    expect(header).toContain('Path=/api/auth/callback/google');
    expect(header).toContain('Max-Age=600');
    expect(header).not.toContain(SECRET);
  });

  it('start: signed out, it goes to /login and sets no cookie', async () => {
    resetIdb(null);
    const res = await startRoute();
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/login');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('start: with the client not configured it returns to the page with a fixed code', async () => {
    googleEnv.get.mockImplementation(() => { throw new Error('missing'); });
    const res = await startRoute();
    expect(new URL(res.headers.get('location')!).search).toBe('?google=not_configured');
  });

  it('callback: connects, redirects with only a fixed code, and clears the state cookie', async () => {
    const start = await startRoute();
    const cookieValue = start.cookies.get(GOOGLE_STATE_COOKIE)!.value;
    const state = decodeStateCookie(cookieValue)!.s;
    stubFetch(tokenEndpoint(200, goodTokens()));

    const res = await callbackRoute(`?code=${encodeURIComponent(CODE)}&state=${state}`, cookieValue);

    expect(res.status).toBe(303);
    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe('/connections');
    expect(location.search).toBe('?google=connected');
    expectNoSecrets(res.headers.get('location')!, [state]);
    expectNoSecrets(res.headers.get('set-cookie') ?? '', [state]);
    expect(res.headers.get('set-cookie')).toMatch(/Max-Age=0/i);
    expect(idb.creds).toHaveLength(1);
  });

  it.each([
    ['a wrong state', (state: string) => `?code=${CODE}&state=${state}x`, 'bad_state'],
    ['a denial', (state: string) => `?error=access_denied&state=${state}`, 'denied'],
    ['no state', () => `?code=${CODE}`, 'bad_state'],
  ])('callback: %s redirects with a fixed code, exchanges nothing and shows no Google text', async (_name, query, expected) => {
    const start = await startRoute();
    const cookieValue = start.cookies.get(GOOGLE_STATE_COOKIE)!.value;
    const fetchMock = tokenEndpoint(200, goodTokens());
    stubFetch(fetchMock);

    const res = await callbackRoute(query(decodeStateCookie(cookieValue)!.s), cookieValue);

    expect(new URL(res.headers.get('location')!).search).toBe(`?google=${expected}`);
    expect(fetchMock).not.toHaveBeenCalled();
    nothingStored();
    expect(res.headers.get('set-cookie')).toMatch(/Max-Age=0/i);
  });

  it('callback: signed out, it goes to /login and carries no code', async () => {
    const start = await startRoute();
    const cookieValue = start.cookies.get(GOOGLE_STATE_COOKIE)!.value;
    resetIdb(null);
    const res = await callbackRoute(`?code=${CODE}&state=${decodeStateCookie(cookieValue)!.s}`, cookieValue);
    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe('/login');
    expect(location.search).toBe('');
  });

  it('callback: a failed exchange redirects with a fixed code and leaks nothing', async () => {
    const start = await startRoute();
    const cookieValue = start.cookies.get(GOOGLE_STATE_COOKIE)!.value;
    stubFetch(tokenEndpoint(400, { error: 'invalid_grant', error_description: ACCESS }));
    const res = await callbackRoute(`?code=${CODE}&state=${decodeStateCookie(cookieValue)!.s}`, cookieValue);
    expect(new URL(res.headers.get('location')!).search).toBe('?google=failed');
    expectNoSecrets(res.headers.get('location')! + logged.join(''));
  });
});

describe('the Hevy key action', () => {
  const KEY = 'hevy-key-0123456789abcdef-do-not-echo';
  const form = (value: FormDataEntryValue | null) => {
    const f = new FormData();
    if (value !== null) f.set('apiKey', value);
    return f;
  };
  const blank = { error: null, notice: null };

  it('stores the key for the signed-in user, and answers with a message that does not contain it', async () => {
    const state = await saveHevyApiKey(blank, form(KEY));
    expect(state).toEqual({ error: null, notice: 'Hevy is connected.' });
    expect(idb.creds[0]).toMatchObject({ user_id: USER_A, provider: 'hevy', auth_type: 'api_key', api_key: KEY, status: 'connected' });
    expect(everything(state)).not.toContain(KEY);
  });

  it.each([
    ['too short', 'abc'],
    ['spaces', 'a key with spaces inside it'],
    ['a newline', 'abcdefgh\nijklmnop'],
    ['non-ASCII', 'clé-clé-clé-clé-clé'],
  ])('rejects a key that is %s with a message, storing nothing and not echoing it', async (_name, key) => {
    const state = await saveHevyApiKey(blank, form(key));
    expect(state.error).toBeTruthy();
    expect(state.notice).toBeNull();
    expect(everything(state)).not.toContain(key);
    nothingStored();
  });

  it.each([['missing', null], ['empty', ''], ['blank', '   '], ['a file', new File(['x'], 'x.txt')]])(
    'asks for a key when it is %s',
    async (_name, value) => {
      expect(await saveHevyApiKey(blank, form(value))).toEqual({ error: 'Paste your Hevy API key.', notice: null });
      nothingStored();
    },
  );

  it('signed out: refuses, stores nothing and does not echo the key', async () => {
    resetIdb(null);
    const state = await saveHevyApiKey(blank, form(KEY));
    expect(state.error).toBe('Sign in to connect apps.');
    expect(everything(state)).not.toContain(KEY);
    expect(idb.creds).toHaveLength(0);
  });

  it('the provider is fixed: a provider field in the form is ignored', async () => {
    const f = form(KEY);
    f.set('provider', 'google_calendar');
    await saveHevyApiKey(blank, f);
    expect(idb.creds.map((c) => c.provider)).toEqual(['hevy']);
  });

  it('a storage failure shows fixed wording that holds neither the key nor the database\'s message', async () => {
    idb.failNextAdminWrite = `new row for relation violates check constraint (${KEY})`;
    const state = await saveHevyApiKey(blank, form(KEY));
    expect(state.error).toBe('Could not save the key.');
    expect(everything(state)).not.toContain(KEY);
  });
});

describe('the disconnect action', () => {
  it('deletes the signed-in user\'s credential and switches the app off, and returns no secret', async () => {
    seedConnection(USER_A, 'google_calendar', { auth_type: 'oauth2', access_token: ACCESS, refresh_token: REFRESH });
    seedConnection(USER_B, 'google_calendar', { auth_type: 'oauth2', access_token: 'b-access', refresh_token: 'b-refresh' });
    const result = await disconnectApp('google_calendar');
    expect(result.ok && result.data).toMatchObject({ provider: 'google_calendar', status: 'not_connected' });
    expect(idb.creds.map((c) => c.user_id)).toEqual([USER_B]);
    expectNoSecrets(everything(result));
  });

  it('refuses an unknown app and a signed-out caller', async () => {
    expect((await disconnectApp('jira')).ok).toBe(false);
    resetIdb(null);
    expect((await disconnectApp('hevy')).ok).toBe(false);
  });
});

describe('the sentences for each outcome', () => {
  it('every outcome the user can land on has one, and signed_out (which goes to /login) has none', () => {
    for (const outcome of CONNECT_OUTCOMES) {
      if (outcome === 'signed_out') expect(noticeFor(outcome)).toBeNull();
      else expect(noticeFor(outcome), outcome).toBe(CONNECT_NOTICES[outcome]);
    }
  });

  it('only "connected" reads as success; the rest say what to do and none says "Google said"', () => {
    for (const [outcome, notice] of Object.entries(CONNECT_NOTICES)) {
      expect(notice.tone).toBe(outcome === 'connected' ? 'ok' : 'problem');
      expect(notice.text).not.toMatch(/https?:|<|>|token|secret|error_description/i);
    }
  });

  it.each([undefined, '', 'nope', '<script>alert(1)</script>', 'connected ', 'CONNECTED', '__proto__', 'constructor', ['connected'], ['a', 'b']])(
    'shows nothing for %j in the address',
    (value) => {
      expect(noticeFor(value as string)).toBeNull();
    },
  );
});

describe('the proxy and the new routes', () => {
  async function visit(path: string, method = 'GET') {
    const { updateSession } = await import('@/lib/supabase/proxy');
    return updateSession(new NextRequest(`http://localhost:3000${path}`, { method }));
  }

  it.each([GOOGLE_CALLBACK_PATH, '/api/integrations/google/start'])('%s sends a signed-out visitor to /login', async (path) => {
    auth.user = null;
    const res = await visit(path);
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/login');
  });

  it.each([GOOGLE_CALLBACK_PATH, '/api/integrations/google/start'])('%s lets a signed-in user through', async (path) => {
    auth.user = { id: USER_A };
    expect((await visit(path)).headers.get('location')).toBeNull();
  });

  it('neither route is a public path', () => {
    const proxy = readFileSync(join(process.cwd(), 'lib', 'supabase', 'proxy.ts'), 'utf8');
    const publicPaths = /const PUBLIC_PATHS = \[([^\]]*)\]/.exec(proxy)?.[1] ?? '';
    expect(publicPaths).not.toMatch(/api|google|connections/);
  });
});

describe('the boundary', () => {
  const root = process.cwd();
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (['node_modules', '.next', 'tests', 'test-results'].includes(name)) return [];
      return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
    });
  const rel = (f: string) => f.slice(root.length + 1).replace(/\\/g, '/');
  const source = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
  const files = [...walk(join(root, 'app')), ...walk(join(root, 'components')), ...walk(join(root, 'lib')), ...walk(join(root, 'types'))];

  it('no component imports the Google exchange code, or anything from the services', () => {
    const offenders = walk(join(root, 'components'))
      .filter((f) => /googleOAuth|lib\/services\//.test(source(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('no client file anywhere imports it, and none names Google\'s endpoints or the client secret', () => {
    const clients = files.filter((f) => /^\s*['"]use client['"]/.test(source(f)));
    expect(clients.length).toBeGreaterThan(5);
    const offenders = clients
      .filter((f) => /googleOAuth|GOOGLE_CLIENT_SECRET|GOOGLE_CLIENT_ID|oauth2\.googleapis\.com|accounts\.google\.com|getGoogleOAuthEnv/.test(source(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('only the two routes import the exchange module, and only server modules name Google\'s endpoints', () => {
    const importers = files.filter((f) => /from '@\/lib\/services\/googleOAuth'/.test(source(f))).map(rel).sort();
    expect(importers).toEqual(['app/api/auth/callback/google/route.ts', 'app/api/integrations/google/start/route.ts']);
    const endpointUsers = files.filter((f) => /oauth2\.googleapis\.com|accounts\.google\.com/.test(source(f))).map(rel).sort();
    expect(endpointUsers).toEqual(['lib/services/googleOAuth.ts', 'lib/services/integrations.ts']);
  });

  it('the exchange module is server-only and the routes use no client directive', () => {
    expect(source(join(root, 'lib', 'services', 'googleOAuth.ts'))).toContain("import 'server-only'");
    for (const route of ['app/api/auth/callback/google/route.ts', 'app/api/integrations/google/start/route.ts']) {
      expect(source(join(root, route))).not.toMatch(/['"]use client['"]/);
    }
  });

  it('the connect flow TODO is gone from the integrations service', () => {
    expect(source(join(root, 'lib', 'services', 'integrations.ts'))).not.toMatch(/TODO\(MOM-Phase2\): the OAuth connect flow/);
  });

  it('nothing logs a token, a code or a provider message: the module logs fixed words and numbers only', () => {
    const logs = source(join(root, 'lib', 'services', 'googleOAuth.ts')).match(/console\.\w+\([^;]*;/g) ?? [];
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("'[google-oauth] connect failed'");
    // The arguments are the fixed message, the reason word and an optional status number: nothing from a request.
    const call = logs[0] ?? '';
    const args = call.slice(call.indexOf('(') + 1);
    expect(args).not.toMatch(/code|token|body|response|input|error/i);
  });
});
