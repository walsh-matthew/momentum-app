// Integration layer (docs/INTEGRATIONS_SPEC.md). The only place connected_apps is queried
// (CLAUDE.md, Architectural Directive 1). Server-side only: it reads the request's auth cookies.
//
// Phase 1 (MOM-13): the payload contract, mock adapters, and the toggle state in connected_apps.
// MOM-40: turning normalized activity into tasks lives in @/lib/services/ingestion.ts.
// MOM-37: provider tokens and API keys (storage, retrieval, refresh) in integration_credentials. The
// only network request to a third party is the OAuth token refresh in refreshAccessToken().
// MOM-62: the Google consent flow (redirect, callback and code exchange) is in @/lib/services/googleOAuth.ts; the
// Hevy key form and the disconnect button call saveApiKey() and disconnectIntegration() from
// app/actions/integrations.ts.

import { getGoogleOAuthEnv } from '@/lib/config/env';
import { INTEGRATION_CATALOG, SUPPORTED_PROVIDER_IDS, authTypeOf } from '@/lib/integrations/catalog';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type {
  ConnectedAppInsert,
  ConnectedAppPublic,
  CredentialStatus,
  ExternalProviderId,
  IntegrationCredential,
} from '@/types/database.types';
import {
  OAuthErrorResponseSchema,
  parseApiKey,
  parseOAuthTokenResponse,
  type AccessToken,
  type IntegrationAccount,
} from '@/types/integrations';
import type { ServiceResult } from './result';

export type { ExternalProviderId };

// ---------------------------------------------------------------------------
// Normalized contract (INTEGRATIONS_SPEC.md §2)
// ---------------------------------------------------------------------------

export interface InboundActivityPayload {
  externalId: string; // Unique ID from the source provider (e.g. Hevy workout UUID)
  provider: ExternalProviderId; // Source key ('hevy', 'google_calendar', ...)
  timestamp: string; // ISO-8601 UTC timestamp of activity occurrence
  targetGoalChannel: string; // Internal Goal Channel key ('physical_fitness', 'career_pivot')
  activityType: string; // Provider action type ('strength_workout', 'calendar_block')
  title: string; // Presentation label
  durationMinutes: number; // Active duration in minutes
  metrics: {
    volumeLbs?: number; // Weight lifting volume
    setsCompleted?: number; // Completed sets count
    activeCalories?: number; // Caloric burn / energy
    eventCompleted?: boolean; // Binary check for calendar events/tasks
    metadata?: Record<string, unknown>; // Provider-specific extras
  };
}

// Adapter contract: a provider module turns its raw external payload into the normalized one.
// Adapters are pure. They never touch Supabase, and they never mark a task done (the user owns
// completion; docs/NINETY_DAY_PLAN_CONTEXT.md §3).
export interface ProviderAdapter<TRaw = unknown> {
  provider: ExternalProviderId;
  normalize(raw: TRaw): InboundActivityPayload;
}

// ---------------------------------------------------------------------------
// Mock adapters (INTEGRATIONS_SPEC.md §3.A, §3.C). Fixed fixtures, no network.
// ---------------------------------------------------------------------------

// Sample payload from the spec, verbatim.
export function getMockHevyActivity(): InboundActivityPayload {
  return {
    externalId: 'hev_w_8f9a21b',
    provider: 'hevy',
    timestamp: '2026-10-21T07:15:00Z',
    targetGoalChannel: 'physical_fitness',
    activityType: 'strength_workout',
    title: 'Upper Body Strength',
    durationMinutes: 45,
    metrics: {
      volumeLbs: 12450,
      setsCompleted: 16,
      metadata: { primary_muscle: 'chest_shoulders' },
    },
  };
}

// The spec gives mapping rules but no sample for Google Calendar. This follows those rules for
// a finished 60-minute focus block: timestamp is event.end, duration is end minus start.
export function getMockCalendarActivity(): InboundActivityPayload {
  return {
    externalId: 'gcal_e_3c71d0a',
    provider: 'google_calendar',
    timestamp: '2026-10-21T16:00:00Z',
    targetGoalChannel: 'career_pivot',
    activityType: 'calendar_block',
    title: 'Focus Time',
    durationMinutes: 60,
    metrics: {
      eventCompleted: true,
    },
  };
}

// ---------------------------------------------------------------------------
// Connected apps (toggle state)
// ---------------------------------------------------------------------------

// Explicit column list for the browser-facing row. Provider tokens are not on this table at all: they
// live in integration_credentials, which no browser role can read (INTEGRATIONS_SPEC.md §5).
const PUBLIC_COLUMNS = 'id, user_id, provider, is_active, goal_channel_id, last_synced_at, created_at, updated_at';

export function isSupportedProvider(value: unknown): value is ExternalProviderId {
  return typeof value === 'string' && (SUPPORTED_PROVIDER_IDS as readonly string[]).includes(value);
}

export async function listConnectedApps(): Promise<ServiceResult<ConnectedAppPublic[]>> {
  const supabase = await createSupabaseServerClient();
  // RLS limits this to the signed-in user's rows.
  const { data, error } = await supabase.from('connected_apps').select(PUBLIC_COLUMNS).order('created_at');
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

// Turns a provider on or off for the signed-in user. Only flips the flag: no OAuth, no API key,
// no request to the provider. Validates its input because it is reachable by a direct Server
// Action POST.
export async function setConnectedAppActive(
  provider: unknown,
  isActive: unknown,
): Promise<ServiceResult<ConnectedAppPublic>> {
  if (!isSupportedProvider(provider)) return { ok: false, error: 'That app is not available yet.' };
  if (typeof isActive !== 'boolean') return { ok: false, error: 'Invalid state.' };

  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return { ok: false, error: 'Sign in to connect apps.' };

  // Upsert on (user_id, provider) leaves an existing row's other columns untouched.
  const row: ConnectedAppInsert = { user_id: auth.user.id, provider, is_active: isActive };
  const { data, error } = await supabase
    .from('connected_apps')
    .upsert(row, { onConflict: 'user_id,provider' })
    .select(PUBLIC_COLUMNS)
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// Provider credentials (MOM-37)
// ---------------------------------------------------------------------------
// Tokens and API keys live in integration_credentials (migration 005), which no browser role can
// read: RLS is on with no policies and the API roles have no grants. Only this module touches it,
// through the service-role client, which BYPASSES row level security. So the isolation between users
// is enforced here, in the code, and every query below is keyed on a user id that this module
// verified itself:
// - the session-bound functions take no user id at all; they read it from the verified session
//   (getUser() asks Supabase Auth, not just the cookie), so a caller cannot ask for someone else's;
// - getAccessToken() takes a user id for code with no session (a signed webhook, a sync job). Pass
//   only an id you resolved yourself, never one supplied by a client.
// User-level RLS still applies to the part a user's own session writes: the connected_apps row, and
// integration_credentials has a same-owner foreign key to it, so a credential can only ever sit on a
// connected app of the same user.
// Nothing here logs a token or returns one in an error. Database errors are replaced with fixed
// wording because a failed CHECK reports the offending row, secrets included.

export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
// Refresh a little early so a token does not expire between being handed out and being used.
const EXPIRY_SKEW_MS = 60_000;
const REFRESH_TIMEOUT_MS = 10_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Everything about a credential except the secrets. The only columns a status read selects.
const CREDENTIAL_METADATA_COLUMNS =
  'provider, auth_type, status, last_error, last_refreshed_at, expires_at, scope, created_at';

type CredentialMetadata = Pick<
  IntegrationCredential,
  'provider' | 'auth_type' | 'status' | 'last_error' | 'last_refreshed_at' | 'expires_at' | 'scope' | 'created_at'
>;

// Injectable so tests need no network and no clock.
export interface CredentialDeps {
  fetch?: typeof fetch;
  now?: () => Date;
}

function toAccount(provider: ExternalProviderId, row: CredentialMetadata | null): IntegrationAccount {
  if (!row) {
    return {
      provider,
      authType: null,
      status: 'not_connected',
      connectedAt: null,
      lastRefreshedAt: null,
      expiresAt: null,
      scopes: [],
      lastError: null,
    };
  }
  return {
    provider,
    authType: row.auth_type,
    status: row.status,
    connectedAt: row.created_at,
    lastRefreshedAt: row.last_refreshed_at,
    expiresAt: row.expires_at,
    scopes: row.scope ? row.scope.split(' ').filter(Boolean) : [],
    lastError: row.last_error,
  };
}

type SessionClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type SessionResult = { ok: true; supabase: SessionClient; userId: string } | { ok: false; error: string };

// The signed-in user, verified with Supabase Auth.
async function requireSession(message: string): Promise<SessionResult> {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth.user) return { ok: false, error: message };
  return { ok: true, supabase, userId: auth.user.id };
}

// Makes sure the user's connected_apps row exists and is on, through their own session so RLS applies.
// integration_credentials hangs off this row.
async function ensureConnectedApp(
  supabase: SessionClient,
  userId: string,
  provider: ExternalProviderId,
): Promise<ServiceResult<null>> {
  const row: ConnectedAppInsert = { user_id: userId, provider, is_active: true };
  const { error } = await supabase.from('connected_apps').upsert(row, { onConflict: 'user_id,provider' });
  if (error) return { ok: false, error: 'Could not connect that app.' };
  return { ok: true, data: null };
}

// Connects an API-key provider (Hevy) for the signed-in user. Validates its input because it is
// reachable by a direct Server Action POST. The key is checked for shape only; calling the provider
// to confirm it works belongs to the adapter (see the TODOs below).
export async function saveApiKey(
  provider: unknown,
  apiKey: unknown,
  deps: CredentialDeps = {},
): Promise<ServiceResult<IntegrationAccount>> {
  if (!isSupportedProvider(provider)) return { ok: false, error: 'That app is not available yet.' };
  if (authTypeOf(provider) !== 'api_key') return { ok: false, error: 'That app connects with a sign-in, not a key.' };
  const key = parseApiKey(apiKey);
  if (!key.ok) return { ok: false, error: key.error };

  const session = await requireSession('Sign in to connect apps.');
  if (!session.ok) return session;
  const linked = await ensureConnectedApp(session.supabase, session.userId, provider);
  if (!linked.ok) return linked;

  const now = (deps.now ?? (() => new Date()))().toISOString();
  const { data, error } = await createSupabaseAdminClient()
    .from('integration_credentials')
    .upsert(
      {
        user_id: session.userId,
        provider,
        auth_type: 'api_key',
        api_key: key.data,
        access_token: null,
        refresh_token: null,
        expires_at: null,
        scope: null,
        status: 'connected',
        last_error: null,
        last_refreshed_at: now,
      },
      { onConflict: 'user_id,provider' },
    )
    .select(CREDENTIAL_METADATA_COLUMNS)
    .single();
  if (error) return { ok: false, error: 'Could not save the key.' };
  return { ok: true, data: toAccount(provider, data) };
}

// Stores the token response from an OAuth2 provider's token endpoint (Google) for the signed-in user,
// after the connect flow has exchanged the authorisation code. The response is external JSON, so it
// is validated first. A repeat consent that returns no refresh token keeps the one already stored.
export async function saveOAuthTokens(
  provider: unknown,
  rawTokens: unknown,
  deps: CredentialDeps = {},
): Promise<ServiceResult<IntegrationAccount>> {
  if (!isSupportedProvider(provider)) return { ok: false, error: 'That app is not available yet.' };
  if (authTypeOf(provider) !== 'oauth2') return { ok: false, error: 'That app connects with a key, not a sign-in.' };
  const tokens = parseOAuthTokenResponse(rawTokens);
  if (!tokens.ok) return { ok: false, error: tokens.error };

  const session = await requireSession('Sign in to connect apps.');
  if (!session.ok) return session;
  const linked = await ensureConnectedApp(session.supabase, session.userId, provider);
  if (!linked.ok) return linked;

  const now = (deps.now ?? (() => new Date()))();
  const { access_token, refresh_token, expires_in, scope } = tokens.data;
  const { data, error } = await createSupabaseAdminClient()
    .from('integration_credentials')
    .upsert(
      {
        user_id: session.userId,
        provider,
        auth_type: 'oauth2',
        access_token,
        api_key: null,
        expires_at: expires_in ? new Date(now.getTime() + expires_in * 1000).toISOString() : null,
        status: 'connected',
        last_error: null,
        last_refreshed_at: now.toISOString(),
        // Left out when absent, so an upsert keeps what is already stored.
        ...(refresh_token ? { refresh_token } : {}),
        ...(scope ? { scope } : {}),
      },
      { onConflict: 'user_id,provider' },
    )
    .select(CREDENTIAL_METADATA_COLUMNS)
    .single();
  if (error) return { ok: false, error: 'Could not save the connection.' };
  return { ok: true, data: toAccount(provider, data) };
}

// Disconnects a provider for the signed-in user: deletes the stored credential and switches the app off.
// The credential goes first, because that is the part that matters if the second step fails.
export async function disconnectIntegration(provider: unknown): Promise<ServiceResult<IntegrationAccount>> {
  if (!isSupportedProvider(provider)) return { ok: false, error: 'That app is not available yet.' };
  const session = await requireSession('Sign in to manage apps.');
  if (!session.ok) return session;

  const { error } = await createSupabaseAdminClient()
    .from('integration_credentials')
    .delete()
    .eq('user_id', session.userId)
    .eq('provider', provider);
  if (error) return { ok: false, error: 'Could not disconnect that app.' };

  await session.supabase
    .from('connected_apps')
    .update({ is_active: false })
    .eq('user_id', session.userId)
    .eq('provider', provider);
  return { ok: true, data: toAccount(provider, null) };
}

// Connection status for every supported provider, for the signed-in user. Selects metadata only: the
// result is safe for a client component, and no secret column is ever read here.
export async function listIntegrationAccounts(): Promise<ServiceResult<IntegrationAccount[]>> {
  const session = await requireSession('Sign in to see your apps.');
  if (!session.ok) return session;

  const { data, error } = await createSupabaseAdminClient()
    .from('integration_credentials')
    .select(CREDENTIAL_METADATA_COLUMNS)
    .eq('user_id', session.userId);
  if (error) return { ok: false, error: 'Could not load your connections.' };
  const byProvider = new Map(data.map((row) => [row.provider, row]));
  return {
    ok: true,
    data: INTEGRATION_CATALOG.map((entry) => toAccount(entry.provider, byProvider.get(entry.provider) ?? null)),
  };
}

// The token to call a provider with, for the signed-in user. Server code only.
export async function getMyAccessToken(
  provider: unknown,
  deps: CredentialDeps = {},
): Promise<ServiceResult<AccessToken>> {
  const session = await requireSession('Sign in to use your connected apps.');
  if (!session.ok) return session;
  return getAccessToken(session.userId, provider, deps);
}

// The token to call a provider with, refreshing it first when it has expired. For code that has no
// session: a signed webhook, a sync job. `userId` must be one the caller resolved itself, never one a
// client supplied. Returns an error, and marks the credential, when the user has to connect again.
export async function getAccessToken(
  userId: string,
  provider: unknown,
  deps: CredentialDeps = {},
): Promise<ServiceResult<AccessToken>> {
  if (typeof userId !== 'string' || !UUID_PATTERN.test(userId)) return { ok: false, error: 'Invalid user.' };
  if (!isSupportedProvider(provider)) return { ok: false, error: 'That app is not available yet.' };

  const { data: row, error } = await createSupabaseAdminClient()
    .from('integration_credentials')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();
  if (error) return { ok: false, error: 'Could not load that connection.' };
  if (!row) return { ok: false, error: 'That app is not connected.' };
  if (row.status === 'needs_reauth') return { ok: false, error: 'Connect that app again to continue.' };

  if (row.auth_type === 'api_key') {
    return row.api_key
      ? { ok: true, data: { kind: 'api_key', value: row.api_key, expiresAt: null } }
      : { ok: false, error: 'That connection has no key.' };
  }

  const now = (deps.now ?? (() => new Date()))();
  if (row.access_token && !isExpired(row.expires_at, now)) {
    return { ok: true, data: { kind: 'bearer', value: row.access_token, expiresAt: row.expires_at } };
  }
  return refreshAccessToken(row, deps);
}

function isExpired(expiresAt: string | null, now: Date): boolean {
  if (expiresAt === null) return false;
  return Date.parse(expiresAt) - EXPIRY_SKEW_MS <= now.getTime();
}

interface OAuthRefreshConfig {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
}

function refreshConfigFor(provider: ExternalProviderId): OAuthRefreshConfig | null {
  if (provider !== 'google_calendar') return null;
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = getGoogleOAuthEnv();
  return { tokenUrl: GOOGLE_TOKEN_URL, clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET };
}

// Notes why a credential stopped working. Best effort: a failure here must not hide the real error.
async function markCredential(
  userId: string,
  provider: ExternalProviderId,
  status: Exclude<CredentialStatus, 'connected'>,
  lastError: string,
): Promise<void> {
  await createSupabaseAdminClient()
    .from('integration_credentials')
    .update({ status, last_error: lastError })
    .eq('user_id', userId)
    .eq('provider', provider);
}

// Exchanges the stored refresh token for a new access token and saves it. Providers may rotate the
// refresh token, so a new one in the response replaces the old. The write is conditional on the
// refresh token still being the one we used: if a concurrent refresh already rotated it, this one
// stands down and returns what that refresh saved, instead of overwriting it with a stale token.
async function refreshAccessToken(
  row: IntegrationCredential,
  deps: CredentialDeps,
): Promise<ServiceResult<AccessToken>> {
  const { user_id: userId, provider } = row;
  const doFetch = deps.fetch ?? fetch;
  const now = (deps.now ?? (() => new Date()))();

  if (!row.refresh_token) {
    await markCredential(userId, provider, 'needs_reauth', 'No refresh token is stored.');
    return { ok: false, error: 'Connect that app again to continue.' };
  }

  let config: OAuthRefreshConfig | null;
  try {
    config = refreshConfigFor(provider);
  } catch {
    return { ok: false, error: 'That app is not set up on the server yet.' };
  }
  if (!config) return { ok: false, error: 'That app cannot be refreshed.' };

  let response: Response;
  try {
    response = await doFetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: row.refresh_token,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    });
  } catch {
    await markCredential(userId, provider, 'error', 'The provider could not be reached.');
    return { ok: false, error: 'Could not reach that app. Try again shortly.' };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // A non-JSON body is handled below as an unexpected response.
  }

  if (!response.ok) {
    const parsedError = OAuthErrorResponseSchema.safeParse(body);
    const code =
      parsedError.success && /^[a-z_]{1,40}$/.test(parsedError.data.error) ? parsedError.data.error : 'unknown';
    // invalid_grant: the refresh token was revoked or has expired. Nothing but a new sign-in fixes it.
    if (code === 'invalid_grant') {
      await markCredential(userId, provider, 'needs_reauth', 'The connection was revoked or has expired.');
      return { ok: false, error: 'Connect that app again to continue.' };
    }
    await markCredential(userId, provider, 'error', `The provider refused the refresh (${code}).`);
    return { ok: false, error: 'Could not refresh that connection. Try again shortly.' };
  }

  const tokens = parseOAuthTokenResponse(body);
  if (!tokens.ok) {
    await markCredential(userId, provider, 'error', 'The provider sent an unexpected response.');
    return { ok: false, error: 'Could not refresh that connection. Try again shortly.' };
  }

  const { access_token, refresh_token, expires_in, scope } = tokens.data;
  const expiresAt = expires_in ? new Date(now.getTime() + expires_in * 1000).toISOString() : null;
  const admin = createSupabaseAdminClient();
  const { data: saved, error } = await admin
    .from('integration_credentials')
    .update({
      access_token,
      expires_at: expiresAt,
      status: 'connected',
      last_error: null,
      last_refreshed_at: now.toISOString(),
      ...(refresh_token ? { refresh_token } : {}),
      ...(scope ? { scope } : {}),
    })
    .eq('user_id', userId)
    .eq('provider', provider)
    .eq('refresh_token', row.refresh_token)
    .select('access_token, expires_at')
    .maybeSingle();
  if (error) return { ok: false, error: 'Could not save the refreshed connection.' };
  if (saved?.access_token) {
    return { ok: true, data: { kind: 'bearer', value: saved.access_token, expiresAt: saved.expires_at } };
  }

  // Someone else rotated the refresh token first. Use what they saved.
  const { data: current } = await admin
    .from('integration_credentials')
    .select('access_token, expires_at')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();
  if (current?.access_token && !isExpired(current.expires_at, now)) {
    return { ok: true, data: { kind: 'bearer', value: current.access_token, expiresAt: current.expires_at } };
  }
  return { ok: false, error: 'Could not refresh that connection. Try again shortly.' };
}

// TODO(MOM-Phase2): real HTTP clients in @/lib/adapters/hevy.ts and @/lib/adapters/google.ts.
// TODO(MOM-Phase2): webhook handlers at app/api/webhooks/[provider]/route.ts.
