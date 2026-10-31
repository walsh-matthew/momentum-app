// @vitest-environment node
// The emailed reset link's landing route (MOM-122) against a fake auth service: a token link (token_hash with type
// recovery) is verified and goes on to /auth/reset; a bad or incomplete one goes back to /login with the reset
// error; the older code link still works. The real Auth server is exercised by tests/e2e/password-reset.spec.ts.

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServiceResult } from '@/lib/services/result';

const MARKER = { name: 'momentum_recovery', value: '1793390000.signature', maxAge: 900 };

const fake = vi.hoisted(() => ({
  verify: { ok: true, data: { cookie: { name: 'momentum_recovery', value: '1793390000.signature', maxAge: 900 } } } as {
    ok: boolean;
    data?: { cookie: { name: string; value: string; maxAge: number } };
    error?: string;
  },
  exchange: { ok: true, data: null } as { ok: boolean; data?: null; error?: string },
  calls: [] as { name: string; arg: string }[],
}));

vi.mock('@/lib/services/auth', () => ({
  verifyRecoveryToken: async (tokenHash: string) => {
    fake.calls.push({ name: 'verifyRecoveryToken', arg: tokenHash });
    return fake.verify as ServiceResult<{ cookie: typeof MARKER }>;
  },
  exchangeAuthCode: async (code: string): Promise<ServiceResult<null>> => {
    fake.calls.push({ name: 'exchangeAuthCode', arg: code });
    return fake.exchange as ServiceResult<null>;
  },
}));

import { GET } from '@/app/auth/callback/reset/route';

const ORIGIN = 'https://momentum.example';
const BAD = { ok: false, error: 'Email link is invalid or has expired' };

async function visit(query: string, origin = ORIGIN) {
  const response = await GET(new NextRequest(`${origin}/auth/callback/reset${query}`));
  expect(response.status).toBe(307);
  return response;
}

async function open(query: string): Promise<string> {
  return (await visit(query)).headers.get('location') ?? '';
}

beforeEach(() => {
  fake.verify = { ok: true, data: { cookie: MARKER } };
  fake.exchange = { ok: true, data: null };
  fake.calls = [];
});

describe('/auth/callback/reset', () => {
  it('verifies a token link and goes on to the new-password page', async () => {
    expect(await open('?token_hash=hash-1&type=recovery')).toBe(`${ORIGIN}/auth/reset`);
    expect(fake.calls).toEqual([{ name: 'verifyRecoveryToken', arg: 'hash-1' }]);
  });

  it('sets the signed marker cookie on a good token: HttpOnly, Lax, 15 minutes, Secure over https', async () => {
    const cookie = (await visit('?token_hash=hash-1&type=recovery')).cookies.get(MARKER.name);
    expect(cookie).toMatchObject({ value: MARKER.value, httpOnly: true, sameSite: 'lax', maxAge: 900, path: '/', secure: true });
  });

  it('does not ask for Secure on a plain-http address (local development)', async () => {
    const response = await visit('?token_hash=hash-1&type=recovery', 'http://127.0.0.1:3100');
    expect(response.cookies.get(MARKER.name)).toMatchObject({ httpOnly: true, sameSite: 'lax', secure: false });
  });

  it('sets no marker for a bad token, a refused token or the older code link', async () => {
    fake.verify = BAD;
    expect((await visit('?token_hash=hash-1&type=recovery')).cookies.get(MARKER.name)).toBeUndefined();
    expect((await visit('?token_hash=hash-1&type=signup')).cookies.get(MARKER.name)).toBeUndefined();
    expect((await visit('?code=code-1')).cookies.get(MARKER.name)).toBeUndefined();
  });

  it('sends a used or expired token, or one refused for want of a secret, back to /login with the reset error', async () => {
    fake.verify = BAD;
    expect(await open('?token_hash=hash-1&type=recovery')).toBe(`${ORIGIN}/login?error=reset`);
    fake.verify = { ok: false, error: 'Token reset links are not available.' };
    expect(await open('?token_hash=hash-1&type=recovery')).toBe(`${ORIGIN}/login?error=reset`);
  });

  it('refuses a token with the wrong type or none, without calling the service', async () => {
    for (const query of ['?token_hash=hash-1&type=signup', '?token_hash=hash-1&type=magiclink', '?token_hash=hash-1']) {
      expect(await open(query)).toBe(`${ORIGIN}/login?error=reset`);
    }
    expect(fake.calls).toEqual([]);
  });

  it('does not fall back to a code when a token is present but refused', async () => {
    expect(await open('?token_hash=hash-1&type=signup&code=code-1')).toBe(`${ORIGIN}/login?error=reset`);
    expect(fake.calls).toEqual([]);
  });

  it('still accepts the older code link', async () => {
    expect(await open('?code=code-1')).toBe(`${ORIGIN}/auth/reset`);
    expect(fake.calls).toEqual([{ name: 'exchangeAuthCode', arg: 'code-1' }]);
    fake.exchange = BAD;
    expect(await open('?code=code-2')).toBe(`${ORIGIN}/login?error=reset`);
  });

  it('sends a link with nothing in it back to /login', async () => {
    expect(await open('')).toBe(`${ORIGIN}/login?error=reset`);
    expect(fake.calls).toEqual([]);
  });

  it('drops the token from the address it redirects to', async () => {
    expect(await open('?token_hash=hash-1&type=recovery')).not.toContain('token_hash');
    fake.verify = BAD;
    expect(await open('?token_hash=hash-1&type=recovery')).not.toContain('token_hash');
  });
});
