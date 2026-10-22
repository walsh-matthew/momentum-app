// Integration account and token contracts (types/integrations.ts). External JSON from a provider is
// untrusted, and an IntegrationAccount is the only shape allowed to reach a client component, so it
// must have no room for a secret.

import { describe, expect, it } from 'vitest';
import { authTypeOf, INTEGRATION_CATALOG } from '@/lib/integrations/catalog';
import {
  ApiKeySchema,
  CONNECTION_STATUSES,
  IntegrationAccountSchema,
  parseApiKey,
  parseOAuthTokenResponse,
} from '@/types/integrations';

describe('ConnectionStatus', () => {
  it('is not_connected plus the stored credential states', () => {
    expect([...CONNECTION_STATUSES]).toEqual(['not_connected', 'connected', 'needs_reauth', 'error']);
  });
});

describe('IntegrationAccount (the client-safe shape)', () => {
  const account = {
    provider: 'google_calendar',
    authType: 'oauth2',
    status: 'connected',
    connectedAt: '2026-11-01T00:00:00Z',
    lastRefreshedAt: null,
    expiresAt: null,
    scopes: ['calendar.readonly'],
    lastError: null,
  };

  it('accepts a valid account', () => expect(IntegrationAccountSchema.safeParse(account).success).toBe(true));
  it.each(['access_token', 'refresh_token', 'api_key', 'credentials'])('rejects an extra %s field', (field) => {
    expect(IntegrationAccountSchema.safeParse({ ...account, [field]: 'secret' }).success).toBe(false);
  });
  it('rejects an unknown status', () => {
    expect(IntegrationAccountSchema.safeParse({ ...account, status: 'expired' }).success).toBe(false);
  });
});

describe('parseOAuthTokenResponse', () => {
  const ok = { access_token: 'a', token_type: 'Bearer' };

  it('accepts a minimal and a full response', () => {
    expect(parseOAuthTokenResponse(ok).ok).toBe(true);
    expect(parseOAuthTokenResponse({ ...ok, refresh_token: 'r', expires_in: 3599, scope: 'x y' }).ok).toBe(true);
  });
  it('accepts any casing of "bearer"', () => {
    expect(parseOAuthTokenResponse({ ...ok, token_type: 'bearer' }).ok).toBe(true);
  });
  it('drops fields it does not know instead of keeping them', () => {
    const r = parseOAuthTokenResponse({ ...ok, id_token: 'jwt', anything: 1 });
    expect(r.ok && Object.keys(r.data).sort()).toEqual(['access_token', 'token_type']);
  });
  it.each([
    ['missing access_token', { token_type: 'Bearer' }],
    ['empty access_token', { access_token: '', token_type: 'Bearer' }],
    ['oversized access_token', { access_token: 'x'.repeat(4097), token_type: 'Bearer' }],
    ['non-bearer type', { access_token: 'a', token_type: 'mac' }],
    ['missing token_type', { access_token: 'a' }],
    ['zero lifetime', { ...ok, expires_in: 0 }],
    ['string lifetime', { ...ok, expires_in: '3600' }],
    ['lifetime over a year', { ...ok, expires_in: 60 * 60 * 24 * 366 }],
    ['non-string refresh token', { ...ok, refresh_token: 5 }],
  ])('rejects %s', (_name, body) => expect(parseOAuthTokenResponse(body).ok).toBe(false));

  it('does not echo the rejected value back', () => {
    const r = parseOAuthTokenResponse({ access_token: 'super-secret-token', token_type: 'mac' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).not.toContain('super-secret-token');
  });
});

describe('API keys', () => {
  it('accept a typical key and trim whitespace around it', () => {
    const r = parseApiKey('  3f2a9c1e-4b7d-4e1a-9c3d-123456789abc \n');
    expect(r.ok && r.data).toBe('3f2a9c1e-4b7d-4e1a-9c3d-123456789abc');
  });
  it.each([[''], ['1234567'], ['has space inside'], ['tab\tinside-key'], ['café-key-12345'], ['x'.repeat(513)]])(
    'reject %j',
    (key) => expect(ApiKeySchema.safeParse(key).success).toBe(false),
  );
  it('do not echo the rejected key back', () => {
    const r = parseApiKey('bad key with spaces');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).not.toContain('bad key');
  });
});

describe('the catalog says how each provider connects', () => {
  it('Hevy uses a key, Google Calendar a sign-in', () => {
    expect(authTypeOf('hevy')).toBe('api_key');
    expect(authTypeOf('google_calendar')).toBe('oauth2');
    expect(authTypeOf('myspace')).toBeUndefined();
  });
  it('every catalog entry has an auth type', () => {
    expect(INTEGRATION_CATALOG.every((e) => e.authType === 'api_key' || e.authType === 'oauth2')).toBe(true);
  });
});
