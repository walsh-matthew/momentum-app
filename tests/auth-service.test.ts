// lib/services/auth.ts against a fake Supabase Auth client (MOM-64): the password reset request gives one answer
// whether or not the address has an account, the new password follows the sign-up rules and needs the recovery
// session, and the CAPTCHA token is required, and passed on, only when a site key is configured. The real behaviour
// of Supabase Auth (the email, the recovery session, an unknown address) is exercised by tests/e2e/password-reset.spec.ts.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptchaConfig } from '@/types/auth';

interface AuthError {
  code?: string;
  message: string;
}

const fake = vi.hoisted(() => ({
  captcha: null as CaptchaConfig | null,
  // Addresses that have an account. Supabase Auth reports success for the others too, so the fake does as well.
  accounts: new Set<string>(),
  // What the next call returns as an error, if anything.
  error: null as AuthError | null,
  // The `amr` claim of the current session: how it was started.
  amr: [{ method: 'password', timestamp: 1 }] as { method: string; timestamp: number }[] | undefined,
  claimsError: null as AuthError | null,
  calls: [] as { name: string; args: unknown[] }[],
}));

vi.mock('@/lib/config/env', () => ({ getCaptchaConfig: () => fake.captcha }));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      resetPasswordForEmail: async (...args: unknown[]) => {
        fake.calls.push({ name: 'resetPasswordForEmail', args });
        return { data: {}, error: fake.error };
      },
      signInWithPassword: async (...args: unknown[]) => {
        fake.calls.push({ name: 'signInWithPassword', args });
        if (fake.error) return { data: { user: null }, error: fake.error };
        return { data: { user: { id: 'u1', email: 'a@example.com' } }, error: null };
      },
      signUp: async (...args: unknown[]) => {
        fake.calls.push({ name: 'signUp', args });
        return { data: { session: null }, error: fake.error };
      },
      getClaims: async () => {
        if (fake.claimsError) return { data: null, error: fake.claimsError };
        return { data: { claims: { amr: fake.amr } }, error: null };
      },
      updateUser: async (...args: unknown[]) => {
        fake.calls.push({ name: 'updateUser', args });
        return { data: {}, error: fake.error };
      },
    },
  }),
}));

import {
  hasRecoverySession,
  requestPasswordReset,
  signInWithPassword,
  signUpWithPassword,
  updatePassword,
} from '@/lib/services/auth';

const REDIRECT = 'https://momentum.example/auth/callback/reset';
const TURNSTILE: CaptchaConfig = { provider: 'turnstile', siteKey: 'public-site-key' };
const RECOVERY = [{ method: 'recovery', timestamp: 1 }];
const called = (name: string) => fake.calls.filter((c) => c.name === name);

beforeEach(() => {
  fake.captcha = null;
  fake.accounts = new Set(['known@example.com']);
  fake.error = null;
  fake.amr = [{ method: 'password', timestamp: 1 }];
  fake.claimsError = null;
  fake.calls = [];
});

describe('requestPasswordReset', () => {
  it('gives the same answer for an address with an account and one without', async () => {
    const known = await requestPasswordReset('known@example.com', REDIRECT);
    const unknown = await requestPasswordReset('nobody@example.com', REDIRECT);
    expect(known).toEqual({ ok: true, data: null });
    expect(unknown).toEqual(known);
    expect(called('resetPasswordForEmail')).toHaveLength(2);
  });

  it('lowercases and trims the address and sends the redirect to the callback', async () => {
    await requestPasswordReset('  Known@Example.COM ', REDIRECT);
    expect(called('resetPasswordForEmail')[0].args).toEqual([
      'known@example.com',
      { redirectTo: REDIRECT, captchaToken: undefined },
    ]);
  });

  it('refuses a malformed address without calling Supabase', async () => {
    for (const bad of ['', 'not-an-email', null, undefined, 42]) {
      expect(await requestPasswordReset(bad, REDIRECT)).toEqual({ ok: false, error: 'Enter a valid email address.' });
    }
    expect(fake.calls).toEqual([]);
  });

  it('answers a provider failure with one fixed message that repeats nothing the provider said', async () => {
    fake.error = { code: 'over_email_send_rate_limit', message: 'email rate limit exceeded for known@example.com' };
    const result = await requestPasswordReset('known@example.com', REDIRECT);
    expect(result).toEqual({ ok: false, error: 'We could not send the reset email. Try again in a little while.' });
  });
});

describe('the CAPTCHA token', () => {
  it('is not required, and not sent, when no site key is configured', async () => {
    expect(await requestPasswordReset('a@example.com', REDIRECT)).toEqual({ ok: true, data: null });
    expect(await signInWithPassword({ email: 'a@example.com', password: 'long-enough-1' })).toMatchObject({ ok: true });
    expect(await signUpWithPassword({ email: 'a@example.com', password: 'long-enough-1' }, 'https://x/cb')).toMatchObject({
      ok: true,
    });
    // A token that arrives anyway is dropped, so nothing changes for a deployment that has not switched CAPTCHA on.
    await signInWithPassword({ email: 'a@example.com', password: 'long-enough-1' }, 'stray-token');
    expect(called('signInWithPassword').map((c) => (c.args[0] as { options: unknown }).options)).toEqual([
      { captchaToken: undefined },
      { captchaToken: undefined },
    ]);
    expect(called('resetPasswordForEmail')[0].args[1]).toEqual({ redirectTo: REDIRECT, captchaToken: undefined });
    expect(called('signUp')[0].args[0]).toMatchObject({ options: { captchaToken: undefined } });
  });

  it('is required on sign-in, sign-up and the reset request once a site key is set, and Supabase is not called without it', async () => {
    fake.captcha = TURNSTILE;
    const expected = { ok: false, error: 'Complete the CAPTCHA check, then try again.' };
    for (const token of [undefined, null, '', '   ', 7]) {
      expect(await signInWithPassword({ email: 'a@example.com', password: 'long-enough-1' }, token)).toEqual(expected);
      expect(await signUpWithPassword({ email: 'a@example.com', password: 'long-enough-1' }, 'https://x/cb', token)).toEqual(expected);
      expect(await requestPasswordReset('a@example.com', REDIRECT, token)).toEqual(expected);
    }
    expect(fake.calls).toEqual([]);
  });

  it('is passed to Supabase Auth when present', async () => {
    fake.captcha = TURNSTILE;
    await signInWithPassword({ email: 'a@example.com', password: 'long-enough-1' }, 'tok-in');
    await signUpWithPassword({ email: 'a@example.com', password: 'long-enough-1' }, 'https://x/cb', ' tok-up ');
    await requestPasswordReset('a@example.com', REDIRECT, 'tok-reset');
    expect(called('signInWithPassword')[0].args[0]).toMatchObject({ options: { captchaToken: 'tok-in' } });
    expect(called('signUp')[0].args[0]).toMatchObject({ options: { captchaToken: 'tok-up', emailRedirectTo: 'https://x/cb' } });
    expect(called('resetPasswordForEmail')[0].args[1]).toEqual({ redirectTo: REDIRECT, captchaToken: 'tok-reset' });
  });

  it('a token Supabase rejects gets one fixed message', async () => {
    fake.captcha = TURNSTILE;
    fake.error = { code: 'captcha_failed', message: 'captcha protection: request disallowed (timeout-or-duplicate)' };
    const failed = { ok: false, error: 'The CAPTCHA check did not pass. Try again.' };
    expect(await signInWithPassword({ email: 'a@example.com', password: 'long-enough-1' }, 't')).toEqual(failed);
    expect(await signUpWithPassword({ email: 'a@example.com', password: 'long-enough-1' }, 'https://x/cb', 't')).toEqual(failed);
    expect(await requestPasswordReset('a@example.com', REDIRECT, 't')).toEqual(failed);
  });

  it('still checks the credentials first, so a bad password is reported as before', async () => {
    fake.captcha = TURNSTILE;
    expect(await signUpWithPassword({ email: 'a@example.com', password: 'short' }, 'https://x/cb')).toEqual({
      ok: false,
      error: 'Password must be at least 8 characters.',
    });
  });
});

describe('hasRecoverySession', () => {
  it('is true only for a session a reset link started', async () => {
    fake.amr = RECOVERY;
    expect(await hasRecoverySession()).toBe(true);
    fake.amr = [{ method: 'password', timestamp: 1 }];
    expect(await hasRecoverySession()).toBe(false);
    fake.amr = undefined;
    expect(await hasRecoverySession()).toBe(false);
    fake.claimsError = { message: 'no session' };
    expect(await hasRecoverySession()).toBe(false);
  });
});

describe('updatePassword', () => {
  it('refuses a weak password with the sign-up rule, before looking at the session', async () => {
    fake.amr = RECOVERY;
    expect(await updatePassword('short')).toEqual({ ok: false, error: 'Password must be at least 8 characters.' });
    expect(await updatePassword(undefined)).toMatchObject({ ok: false });
    expect(called('updateUser')).toEqual([]);
  });

  it('sets the password for a recovery session', async () => {
    fake.amr = RECOVERY;
    expect(await updatePassword('a-brand-new-password')).toEqual({ ok: true, data: null });
    expect(called('updateUser')[0].args).toEqual([{ password: 'a-brand-new-password' }]);
  });

  it('refuses a session that a normal sign-in started, and never calls Supabase to change anything', async () => {
    expect(await updatePassword('a-brand-new-password')).toEqual({
      ok: false,
      error: 'We could not set your new password. Request a new reset link and try again.',
    });
    expect(called('updateUser')).toEqual([]);
  });

  it('says so when the new password is the old one, and otherwise gives one fixed message', async () => {
    fake.amr = RECOVERY;
    fake.error = { code: 'same_password', message: 'New password should be different from the old password.' };
    expect(await updatePassword('a-brand-new-password')).toEqual({ ok: false, error: 'Choose a password you have not used before.' });
    fake.error = { code: 'weak_password', message: 'Password is known to be weak and easy to guess' };
    expect(await updatePassword('a-brand-new-password')).toEqual({
      ok: false,
      error: 'We could not set your new password. Request a new reset link and try again.',
    });
  });
});
