// Provider credentials in lib/services/integrations.ts (MOM-37): storage, retrieval and refresh of
// OAuth tokens and API keys, and the isolation between users.
//
// Tokens sit in integration_credentials, which no browser role can read. The service reaches it with
// the service-role client, which bypasses row level security, so these tests are what prove one user
// cannot reach another's tokens. The fakes are in tests/helpers/fakeIntegrations.ts; the real
// table's rules (RLS, grants, constraints) are checked by tests/migrations.test.ts and
// supabase/verify/005_integration_credentials.sql.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  disconnectIntegration,
  getAccessToken,
  getMyAccessToken,
  listIntegrationAccounts,
  saveApiKey,
  saveOAuthTokens,
} from '@/lib/services/integrations';
import { USER_A, USER_B, idb, resetIdb, seedConnection } from './helpers/fakeIntegrations';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeIntegrations');
  return { createSupabaseServerClient };
});
vi.mock('@/lib/supabase/admin', async () => {
  const { createSupabaseAdminClient } = await import('./helpers/fakeIntegrations');
  return { createSupabaseAdminClient };
});

const googleEnv = vi.hoisted(() => ({
  get: vi.fn(() => ({ GOOGLE_CLIENT_ID: 'client-id-123', GOOGLE_CLIENT_SECRET: 'client-secret-456' })),
}));
vi.mock('@/lib/config/env', () => ({ getGoogleOAuthEnv: googleEnv.get }));

const NOW = new Date('2026-11-01T12:00:00.000Z');
const now = () => NOW;
const inSeconds = (s: number) => new Date(NOW.getTime() + s * 1000).toISOString();
const API_KEY = 'hevy-key-0123456789abcdef';

// A fetch stand-in that returns a token endpoint response, and remembers how it was called.
function tokenEndpoint(status: number, body: unknown) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));
}
const refreshed = (over: object = {}) => ({ access_token: 'new-access', expires_in: 3600, token_type: 'Bearer', ...over });

beforeEach(() => {
  resetIdb({ id: USER_A });
  googleEnv.get.mockClear();
});

describe('signed out', () => {
  it('refuses every session-bound call and never reaches the credential store', async () => {
    resetIdb(null);
    const results = await Promise.all([
      saveApiKey('hevy', API_KEY),
      saveOAuthTokens('google_calendar', refreshed()),
      disconnectIntegration('hevy'),
      listIntegrationAccounts(),
      getMyAccessToken('hevy'),
    ]);
    for (const r of results) expect(r.ok).toBe(false);
    expect(idb.adminCalls).toBe(0);
    expect(idb.creds).toHaveLength(0);
  });
});

describe('saveApiKey', () => {
  it('stores the key for the signed-in user and creates their connected app through their own session', async () => {
    const r = await saveApiKey('hevy', API_KEY, { now });
    expect(r.ok && r.data).toMatchObject({ provider: 'hevy', authType: 'api_key', status: 'connected' });
    expect(idb.apps).toHaveLength(1);
    expect(idb.apps[0]).toMatchObject({ user_id: USER_A, provider: 'hevy', is_active: true });
    expect(idb.creds).toHaveLength(1);
    expect(idb.creds[0]).toMatchObject({ user_id: USER_A, provider: 'hevy', auth_type: 'api_key', api_key: API_KEY, access_token: null });
  });

  it('never returns the key', async () => {
    const r = await saveApiKey('hevy', API_KEY, { now });
    expect(JSON.stringify(r)).not.toContain(API_KEY);
  });

  it('trims the key and replaces an earlier one', async () => {
    await saveApiKey('hevy', API_KEY, { now });
    await saveApiKey('hevy', `  ${API_KEY}-v2  `, { now });
    expect(idb.creds).toHaveLength(1);
    expect(idb.creds[0].api_key).toBe(`${API_KEY}-v2`);
  });

  it.each([[undefined], [null], [12345678], [''], ['short'], ['has a space in it'], ['line\nbreak-in-key'], ['x'.repeat(513)]])(
    'rejects the key %j without writing',
    async (key) => {
      const r = await saveApiKey('hevy', key);
      expect(r.ok).toBe(false);
      expect(idb.creds).toHaveLength(0);
      expect(idb.apps).toHaveLength(0);
    },
  );

  it('rejects an unknown provider, and a provider that uses a sign-in instead of a key', async () => {
    expect(await saveApiKey('myspace', API_KEY)).toEqual({ ok: false, error: 'That app is not available yet.' });
    expect(await saveApiKey({}, API_KEY)).toEqual({ ok: false, error: 'That app is not available yet.' });
    const google = await saveApiKey('google_calendar', API_KEY);
    expect(google.ok).toBe(false);
    expect(idb.creds).toHaveLength(0);
  });
});

describe('saveOAuthTokens', () => {
  const tokens = { access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600, scope: 'calendar.readonly calendar.events', token_type: 'Bearer' };

  it('stores the tokens, works out the expiry and splits the scopes', async () => {
    const r = await saveOAuthTokens('google_calendar', tokens, { now });
    expect(r.ok && r.data).toMatchObject({
      provider: 'google_calendar',
      authType: 'oauth2',
      status: 'connected',
      expiresAt: inSeconds(3600),
      scopes: ['calendar.readonly', 'calendar.events'],
    });
    expect(idb.creds[0]).toMatchObject({ user_id: USER_A, access_token: 'access-1', refresh_token: 'refresh-1', api_key: null });
  });

  it('never returns a token', async () => {
    const text = JSON.stringify(await saveOAuthTokens('google_calendar', tokens, { now }));
    expect(text).not.toContain('access-1');
    expect(text).not.toContain('refresh-1');
  });

  it('a repeat consent with no refresh token keeps the one already stored', async () => {
    await saveOAuthTokens('google_calendar', tokens, { now });
    await saveOAuthTokens('google_calendar', { access_token: 'access-2', expires_in: 3600, token_type: 'Bearer' }, { now });
    expect(idb.creds).toHaveLength(1);
    expect(idb.creds[0]).toMatchObject({ access_token: 'access-2', refresh_token: 'refresh-1', scope: 'calendar.readonly calendar.events' });
  });

  it('reconnecting clears an earlier needs_reauth state', async () => {
    seedConnection(USER_A, 'google_calendar', { auth_type: 'oauth2', access_token: 'old', refresh_token: 'old-r', status: 'needs_reauth', last_error: 'revoked' });
    const r = await saveOAuthTokens('google_calendar', tokens, { now });
    expect(r.ok && r.data.status).toBe('connected');
    expect(idb.creds[0].last_error).toBeNull();
  });

  it.each([
    ['no access token', { token_type: 'Bearer' }],
    ['an empty access token', { access_token: '', token_type: 'Bearer' }],
    ['an unsupported token type', { access_token: 'a', token_type: 'mac' }],
    ['a negative lifetime', { access_token: 'a', expires_in: -5, token_type: 'Bearer' }],
    ['a fractional lifetime', { access_token: 'a', expires_in: 1.5, token_type: 'Bearer' }],
    ['a non-object', 'access_token=abc'],
    ['null', null],
  ])('rejects a response with %s, and writes nothing', async (_name, body) => {
    const r = await saveOAuthTokens('google_calendar', body);
    expect(r.ok).toBe(false);
    expect(idb.creds).toHaveLength(0);
    expect(idb.apps).toHaveLength(0);
  });

  it('does not store fields it did not ask for', async () => {
    await saveOAuthTokens('google_calendar', { ...tokens, id_token: 'identity-jwt', extra: 'x' }, { now });
    expect(JSON.stringify(idb.creds)).not.toContain('identity-jwt');
  });

  it('rejects an API-key provider and an unknown provider', async () => {
    expect((await saveOAuthTokens('hevy', tokens)).ok).toBe(false);
    expect((await saveOAuthTokens('myspace', tokens)).ok).toBe(false);
    expect(idb.creds).toHaveLength(0);
  });
});

describe('errors never carry a secret', () => {
  it('replaces a database error, which would quote the row, with fixed wording', async () => {
    idb.failNextAdminWrite = 'new row violates check constraint. Failing row contains (secret-token-xyz)';
    const r = await saveOAuthTokens('google_calendar', { access_token: 'secret-token-xyz', token_type: 'Bearer' });
    expect(r).toEqual({ ok: false, error: 'Could not save the connection.' });
  });

  it('does the same for an API key', async () => {
    idb.failNextAdminWrite = 'Failing row contains (hevy-key-0123456789abcdef)';
    const r = await saveApiKey('hevy', API_KEY);
    expect(JSON.stringify(r)).not.toContain(API_KEY);
  });
});

describe('isolation between users', () => {
  it('each user stores and lists only their own connection', async () => {
    await saveApiKey('hevy', 'key-for-user-a-12345', { now });
    resetIdbKeepData(USER_B);
    await saveApiKey('hevy', 'key-for-user-b-67890', { now });

    expect(idb.creds.map((c) => [c.user_id, c.api_key])).toEqual([
      [USER_A, 'key-for-user-a-12345'],
      [USER_B, 'key-for-user-b-67890'],
    ]);
    const mine = await listIntegrationAccounts();
    expect(mine.ok && mine.data.find((a) => a.provider === 'hevy')?.status).toBe('connected');
  });

  it("one user's connection does not show as connected for another", async () => {
    seedConnection(USER_A, 'hevy', { auth_type: 'api_key', api_key: API_KEY });
    resetIdbKeepData(USER_B);
    const list = await listIntegrationAccounts();
    expect(list.ok && list.data.every((a) => a.status === 'not_connected')).toBe(true);
  });

  it("disconnecting removes only the caller's credential", async () => {
    seedConnection(USER_A, 'hevy', { auth_type: 'api_key', api_key: 'key-for-user-a-12345' });
    seedConnection(USER_B, 'hevy', { auth_type: 'api_key', api_key: 'key-for-user-b-67890' });
    const r = await disconnectIntegration('hevy');
    expect(r.ok && r.data.status).toBe('not_connected');
    expect(idb.creds.map((c) => c.user_id)).toEqual([USER_B]);
    // The app is switched off for the caller only.
    expect(idb.apps.find((a) => a.user_id === USER_A)?.is_active).toBe(false);
    expect(idb.apps.find((a) => a.user_id === USER_B)?.is_active).toBe(true);
  });

  it("getAccessToken for one user cannot reach another's connection", async () => {
    seedConnection(USER_A, 'hevy', { auth_type: 'api_key', api_key: API_KEY });
    expect(await getAccessToken(USER_B, 'hevy')).toEqual({ ok: false, error: 'That app is not connected.' });
    const a = await getAccessToken(USER_A, 'hevy');
    expect(a.ok && a.data.value).toBe(API_KEY);
  });

  it('the session-bound read uses the verified session user, not anything the caller passes', async () => {
    seedConnection(USER_A, 'hevy', { auth_type: 'api_key', api_key: 'key-for-user-a-12345' });
    seedConnection(USER_B, 'hevy', { auth_type: 'api_key', api_key: 'key-for-user-b-67890' });
    const mine = await getMyAccessToken('hevy');
    expect(mine.ok && mine.data.value).toBe('key-for-user-a-12345');
  });

  it.each([[''], ['not-a-uuid'], [`${USER_A}' or '1'='1`], [undefined as unknown as string]])(
    'getAccessToken rejects the user id %j before reading anything',
    async (id) => {
      expect(await getAccessToken(id, 'hevy')).toEqual({ ok: false, error: 'Invalid user.' });
      expect(idb.adminCalls).toBe(0);
    },
  );
});

describe('listIntegrationAccounts', () => {
  it('lists every supported provider, not connected by default', async () => {
    const r = await listIntegrationAccounts();
    expect(r.ok && r.data.map((a) => [a.provider, a.status])).toEqual([
      ['hevy', 'not_connected'],
      ['google_calendar', 'not_connected'],
    ]);
  });

  it('reads metadata columns only, and the result holds no secret', async () => {
    seedConnection(USER_A, 'google_calendar', { auth_type: 'oauth2', access_token: 'access-secret', refresh_token: 'refresh-secret', expires_at: inSeconds(100), scope: 'a b' });
    seedConnection(USER_A, 'hevy', { auth_type: 'api_key', api_key: API_KEY });
    const r = await listIntegrationAccounts();

    for (const columns of idb.credSelects) {
      expect(columns).not.toBe('*');
      expect(columns).not.toMatch(/token|api_key/);
    }
    const text = JSON.stringify(r);
    for (const secret of ['access-secret', 'refresh-secret', API_KEY]) expect(text).not.toContain(secret);
    expect(r.ok && r.data.find((a) => a.provider === 'google_calendar')).toMatchObject({ status: 'connected', scopes: ['a', 'b'] });
  });

  it('shows a connection that needs the user to connect again', async () => {
    seedConnection(USER_A, 'google_calendar', { auth_type: 'oauth2', access_token: 'x', refresh_token: 'y', status: 'needs_reauth', last_error: 'The connection was revoked or has expired.' });
    const r = await listIntegrationAccounts();
    expect(r.ok && r.data.find((a) => a.provider === 'google_calendar')).toMatchObject({ status: 'needs_reauth', lastError: 'The connection was revoked or has expired.' });
  });
});

describe('getAccessToken: retrieval', () => {
  it('returns an API key as it is', async () => {
    seedConnection(USER_A, 'hevy', { auth_type: 'api_key', api_key: API_KEY });
    expect(await getAccessToken(USER_A, 'hevy')).toEqual({ ok: true, data: { kind: 'api_key', value: API_KEY, expiresAt: null } });
  });

  it('returns a fresh access token without calling the provider', async () => {
    seedConnection(USER_A, 'google_calendar', { auth_type: 'oauth2', access_token: 'fresh', refresh_token: 'r', expires_at: inSeconds(3600) });
    const fetchSpy = tokenEndpoint(200, refreshed());
    const r = await getAccessToken(USER_A, 'google_calendar', { fetch: fetchSpy as typeof fetch, now });
    expect(r).toEqual({ ok: true, data: { kind: 'bearer', value: 'fresh', expiresAt: inSeconds(3600) } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('treats a token with no expiry as usable', async () => {
    seedConnection(USER_A, 'google_calendar', { auth_type: 'oauth2', access_token: 'forever', refresh_token: 'r', expires_at: null });
    const r = await getAccessToken(USER_A, 'google_calendar', { now });
    expect(r.ok && r.data.value).toBe('forever');
  });

  it('reports a provider that is not connected, and an unknown one', async () => {
    expect(await getAccessToken(USER_A, 'hevy')).toEqual({ ok: false, error: 'That app is not connected.' });
    expect(await getAccessToken(USER_A, 'myspace')).toEqual({ ok: false, error: 'That app is not available yet.' });
  });

  it('refuses a connection that needs the user to connect again, without calling the provider', async () => {
    seedConnection(USER_A, 'google_calendar', { auth_type: 'oauth2', access_token: 'x', refresh_token: 'r', expires_at: inSeconds(-10), status: 'needs_reauth' });
    const fetchSpy = tokenEndpoint(200, refreshed());
    const r = await getAccessToken(USER_A, 'google_calendar', { fetch: fetchSpy as typeof fetch, now });
    expect(r.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('getAccessToken: refresh', () => {
  const expired = () =>
    seedConnection(USER_A, 'google_calendar', { auth_type: 'oauth2', access_token: 'stale', refresh_token: 'refresh-1', expires_at: inSeconds(-60), scope: 'calendar.readonly' });

  it('exchanges the refresh token at the provider and saves the new access token', async () => {
    expired();
    const fetchSpy = tokenEndpoint(200, refreshed());
    const r = await getAccessToken(USER_A, 'google_calendar', { fetch: fetchSpy as typeof fetch, now });

    expect(r).toEqual({ ok: true, data: { kind: 'bearer', value: 'new-access', expiresAt: inSeconds(3600) } });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    expect(init?.method).toBe('POST');
    const form = new URLSearchParams(String(init?.body));
    expect(Object.fromEntries(form)).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'refresh-1',
      client_id: 'client-id-123',
      client_secret: 'client-secret-456',
    });
    expect(idb.creds[0]).toMatchObject({ access_token: 'new-access', expires_at: inSeconds(3600), status: 'connected', last_error: null });
  });

  it('keeps the old refresh token when the provider does not rotate it, and takes a new one when it does', async () => {
    expired();
    await getAccessToken(USER_A, 'google_calendar', { fetch: tokenEndpoint(200, refreshed()) as typeof fetch, now });
    expect(idb.creds[0].refresh_token).toBe('refresh-1');

    idb.creds[0].expires_at = inSeconds(-60);
    await getAccessToken(USER_A, 'google_calendar', { fetch: tokenEndpoint(200, refreshed({ refresh_token: 'refresh-2' })) as typeof fetch, now });
    expect(idb.creds[0].refresh_token).toBe('refresh-2');
  });

  it('refreshes a token that is about to expire', async () => {
    seedConnection(USER_A, 'google_calendar', { auth_type: 'oauth2', access_token: 'almost', refresh_token: 'r', expires_at: inSeconds(30) });
    const fetchSpy = tokenEndpoint(200, refreshed());
    const r = await getAccessToken(USER_A, 'google_calendar', { fetch: fetchSpy as typeof fetch, now });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(r.ok && r.data.value).toBe('new-access');
  });

  it('marks the connection needs_reauth when the provider says the grant is invalid, and stops calling it', async () => {
    expired();
    const r = await getAccessToken(USER_A, 'google_calendar', { fetch: tokenEndpoint(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }) as typeof fetch, now });
    expect(r).toEqual({ ok: false, error: 'Connect that app again to continue.' });
    expect(idb.creds[0]).toMatchObject({ status: 'needs_reauth', last_error: 'The connection was revoked or has expired.' });

    const next = tokenEndpoint(200, refreshed());
    const again = await getAccessToken(USER_A, 'google_calendar', { fetch: next as typeof fetch, now });
    expect(again.ok).toBe(false);
    expect(next).not.toHaveBeenCalled();
  });

  it('marks a provider failure as an error, and the next call retries and recovers', async () => {
    expired();
    const failed = await getAccessToken(USER_A, 'google_calendar', { fetch: tokenEndpoint(503, { error: 'temporarily_unavailable' }) as typeof fetch, now });
    expect(failed.ok).toBe(false);
    expect(idb.creds[0]).toMatchObject({ status: 'error', last_error: 'The provider refused the refresh (temporarily_unavailable).' });

    const recovered = await getAccessToken(USER_A, 'google_calendar', { fetch: tokenEndpoint(200, refreshed()) as typeof fetch, now });
    expect(recovered.ok && recovered.data.value).toBe('new-access');
    expect(idb.creds[0]).toMatchObject({ status: 'connected', last_error: null });
  });

  it('does not copy provider-written text into the stored error', async () => {
    expired();
    await getAccessToken(USER_A, 'google_calendar', { fetch: tokenEndpoint(400, { error: 'oops <script>refresh-1</script>' }) as typeof fetch, now });
    expect(idb.creds[0].last_error).toBe('The provider refused the refresh (unknown).');
  });

  it('marks an unreachable provider as an error', async () => {
    expired();
    const down = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const r = await getAccessToken(USER_A, 'google_calendar', { fetch: down as unknown as typeof fetch, now });
    expect(r.ok).toBe(false);
    expect(idb.creds[0]).toMatchObject({ status: 'error', last_error: 'The provider could not be reached.' });
  });

  it('rejects a malformed token response and keeps the old token', async () => {
    expired();
    const r = await getAccessToken(USER_A, 'google_calendar', { fetch: tokenEndpoint(200, { nope: true }) as typeof fetch, now });
    expect(r.ok).toBe(false);
    expect(idb.creds[0]).toMatchObject({ access_token: 'stale', status: 'error' });
  });

  it('needs the user to connect again when no refresh token was ever stored', async () => {
    seedConnection(USER_A, 'google_calendar', { auth_type: 'oauth2', access_token: 'stale', refresh_token: null, expires_at: inSeconds(-60) });
    const fetchSpy = tokenEndpoint(200, refreshed());
    const r = await getAccessToken(USER_A, 'google_calendar', { fetch: fetchSpy as typeof fetch, now });
    expect(r.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(idb.creds[0].status).toBe('needs_reauth');
  });

  it('does not overwrite a refresh token another request already rotated', async () => {
    expired();
    // While our request is at the provider, a concurrent refresh saves a new token pair.
    const racing = vi.fn(async () => {
      Object.assign(idb.creds[0], { access_token: 'winner-access', refresh_token: 'winner-refresh', expires_at: inSeconds(3000) });
      return new Response(JSON.stringify(refreshed({ access_token: 'loser-access', refresh_token: 'loser-refresh' })), { status: 200 });
    });
    const r = await getAccessToken(USER_A, 'google_calendar', { fetch: racing as unknown as typeof fetch, now });
    expect(r.ok && r.data.value).toBe('winner-access');
    expect(idb.creds[0]).toMatchObject({ access_token: 'winner-access', refresh_token: 'winner-refresh' });
  });

  it('says the app is not set up when the Google client credentials are missing, without marking the user', async () => {
    expired();
    googleEnv.get.mockImplementationOnce(() => {
      throw new Error('Invalid Google OAuth environment variables.');
    });
    const fetchSpy = tokenEndpoint(200, refreshed());
    const r = await getAccessToken(USER_A, 'google_calendar', { fetch: fetchSpy as typeof fetch, now });
    expect(r).toEqual({ ok: false, error: 'That app is not set up on the server yet.' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(idb.creds[0].status).toBe('connected');
  });

  it('never puts a token in an error', async () => {
    expired();
    const results = await Promise.all([
      getAccessToken(USER_A, 'google_calendar', { fetch: tokenEndpoint(400, { error: 'invalid_grant' }) as typeof fetch, now }),
      getAccessToken(USER_A, 'google_calendar', { fetch: tokenEndpoint(500, 'refresh-1 stale') as typeof fetch, now }),
    ]);
    for (const r of results) {
      const text = JSON.stringify(r);
      expect(text).not.toContain('refresh-1');
      expect(text).not.toContain('stale');
      expect(text).not.toContain('client-secret-456');
    }
  });
});

// Swaps the signed-in user but keeps the stored apps and credentials, to model two users sharing one database.
function resetIdbKeepData(userId: string): void {
  idb.user = { id: userId };
  idb.adminCalls = 0;
  idb.credSelects = [];
}
