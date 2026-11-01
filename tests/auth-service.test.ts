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
  // The id of the user the current session belongs to (the `sub` claim), and of the user verifyOtp signs in.
  sub: 'user-a' as string | undefined,
  // RECOVERY_COOKIE_SECRET as the env getter reports it: null when missing or too short.
  secret: 'test-secret-test-secret-test-secret-0001' as string | null,
  // The request's cookies, and the names the service deleted.
  jar: new Map<string, string>(),
  deleted: [] as string[],
  calls: [] as { name: string; args: unknown[] }[],
}));

vi.mock('@/lib/config/env', () => ({ getCaptchaConfig: () => fake.captcha, getRecoveryCookieSecret: () => fake.secret }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (fake.jar.has(name) ? { name, value: fake.jar.get(name) } : undefined),
    delete: (name: string) => {
      fake.jar.delete(name);
      fake.deleted.push(name);
    },
  }),
}));
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
        return { data: { claims: { amr: fake.amr, sub: fake.sub } }, error: null };
      },
      verifyOtp: async (...args: unknown[]) => {
        fake.calls.push({ name: 'verifyOtp', args });
        if (fake.error) return { data: { user: null }, error: fake.error };
        return { data: { user: { id: fake.sub } }, error: null };
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
  verifyRecoveryToken,
} from '@/lib/services/auth';
import { RECOVERY_COOKIE, recoveryMarkerCookie } from '@/lib/services/recoveryMarker';

const REDIRECT = 'https://momentum.example/auth/callback/reset';
const TURNSTILE: CaptchaConfig = { provider: 'turnstile', siteKey: 'public-site-key' };
const RECOVERY = [{ method: 'recovery', timestamp: 1 }];
const OTP = [{ method: 'otp', timestamp: 1 }];
const SECRET = 'test-secret-test-secret-test-secret-0001';
const called = (name: string) => fake.calls.filter((c) => c.name === name);
// Puts a marker for `userId`, made with `secret` at `at`, in the request's cookies.
const setMarker = (userId = 'user-a', secret = SECRET, at = new Date()) =>
  fake.jar.set(RECOVERY_COOKIE, recoveryMarkerCookie(userId, secret, at).value);

beforeEach(() => {
  fake.captcha = null;
  fake.accounts = new Set(['known@example.com']);
  fake.error = null;
  fake.amr = [{ method: 'password', timestamp: 1 }];
  fake.claimsError = null;
  fake.sub = 'user-a';
  fake.secret = SECRET;
  fake.jar = new Map();
  fake.deleted = [];
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

describe('sign-in and the password length (MOM-150)', () => {
  it('sends a 6-character password to Supabase: accounts made while production allowed 6 can still sign in', async () => {
    expect(await signInWithPassword({ email: 'a@example.com', password: 'abc123' })).toMatchObject({ ok: true });
    expect(called('signInWithPassword')[0].args[0]).toMatchObject({ email: 'a@example.com', password: 'abc123' });
  });

  it('still refuses an empty password before calling Supabase, and sign-up keeps the 8-character rule', async () => {
    expect(await signInWithPassword({ email: 'a@example.com', password: '' })).toEqual({ ok: false, error: 'Enter your password.' });
    expect(called('signInWithPassword')).toEqual([]);
    expect(await signUpWithPassword({ email: 'a@example.com', password: 'abc123' }, 'https://x/cb')).toEqual({
      ok: false,
      error: 'Password must be at least 8 characters.',
    });
  });
});

describe('signing up again inside the resend window (MOM-150)', () => {
  it('says so in plain words instead of passing on Supabase\'s "you can only request this after N seconds"', async () => {
    const expected = { ok: false, error: 'We just sent you a link. Wait a minute, then try again.' };
    fake.error = { code: 'over_email_send_rate_limit', message: 'For security purposes, you can only request this after 42 seconds.' };
    expect(await signUpWithPassword({ email: 'a@example.com', password: 'long-enough-1' }, 'https://x/cb')).toEqual(expected);
    // An older Supabase sends the same message with no code.
    fake.error = { message: 'For security purposes, you can only request this after 0 seconds.' };
    expect(await signUpWithPassword({ email: 'a@example.com', password: 'long-enough-1' }, 'https://x/cb')).toEqual(expected);
  });

  it('still passes on any other sign-up error as it was', async () => {
    fake.error = { code: 'weak_password', message: 'Password is known to be weak.' };
    expect(await signUpWithPassword({ email: 'a@example.com', password: 'long-enough-1' }, 'https://x/cb')).toEqual({
      ok: false,
      error: 'Password is known to be weak.',
    });
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

describe('verifyRecoveryToken', () => {
  it('verifies the token hash as a recovery token and returns the signed marker for that user', async () => {
    const result = await verifyRecoveryToken('hash-1');
    expect(called('verifyOtp')[0].args).toEqual([{ token_hash: 'hash-1', type: 'recovery' }]);
    expect(result).toMatchObject({ ok: true, data: { cookie: { name: RECOVERY_COOKIE, maxAge: 900 } } });

    // The marker it returns is the one hasRecoverySession accepts for an `otp` session of that same user.
    if (!result.ok) throw new Error('expected ok');
    fake.amr = OTP;
    fake.jar.set(RECOVERY_COOKIE, result.data.cookie.value);
    expect(await hasRecoverySession()).toBe(true);
  });

  it('is refused, without using up the token, when RECOVERY_COOKIE_SECRET is missing, and logs only the name', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    fake.secret = null;
    expect(await verifyRecoveryToken('hash-1')).toMatchObject({ ok: false });
    expect(called('verifyOtp')).toEqual([]);
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toContain('RECOVERY_COOKIE_SECRET');
    expect(String(log.mock.calls[0][0])).not.toContain('hash-1');
    log.mockRestore();
  });

  it('is refused when the verified token started no user', async () => {
    fake.sub = undefined;
    expect(await verifyRecoveryToken('hash-1')).toMatchObject({ ok: false });
  });

  it('refuses an empty token without calling Supabase', async () => {
    for (const empty of ['', '   ']) {
      expect(await verifyRecoveryToken(empty)).toMatchObject({ ok: false });
    }
    expect(fake.calls).toEqual([]);
  });

  it('comes back as an error for a used or expired token', async () => {
    fake.error = { code: 'otp_expired', message: 'Email link is invalid or has expired' };
    expect(await verifyRecoveryToken('hash-1')).toEqual({ ok: false, error: 'Email link is invalid or has expired' });
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

  it('accepts the older recovery session with no marker', async () => {
    fake.amr = RECOVERY;
    expect(await hasRecoverySession()).toBe(true);
    fake.secret = null;
    expect(await hasRecoverySession()).toBe(true);
  });

  it('accepts an otp session with a valid marker for the same user', async () => {
    fake.amr = OTP;
    setMarker();
    expect(await hasRecoverySession()).toBe(true);
  });

  it('refuses an otp session with no marker', async () => {
    fake.amr = OTP;
    expect(await hasRecoverySession()).toBe(false);
  });

  it('refuses a forged marker', async () => {
    fake.amr = OTP;
    for (const forged of ['9999999999.forged', 'garbage', '', '9999999999.']) {
      fake.jar.set(RECOVERY_COOKIE, forged);
      expect(await hasRecoverySession(), forged).toBe(false);
    }
    // A real marker signed with a different secret is a forgery too.
    setMarker('user-a', 'another-secret-another-secret-0000002');
    expect(await hasRecoverySession()).toBe(false);
  });

  it('refuses an expired marker', async () => {
    fake.amr = OTP;
    setMarker('user-a', SECRET, new Date(Date.now() - 16 * 60 * 1000));
    expect(await hasRecoverySession()).toBe(false);
  });

  it("refuses another user's marker", async () => {
    fake.amr = OTP;
    setMarker('user-b');
    expect(await hasRecoverySession()).toBe(false);
  });

  it('refuses an otp session when the secret is missing, even with a marker made earlier', async () => {
    fake.amr = OTP;
    setMarker();
    fake.secret = null;
    expect(await hasRecoverySession()).toBe(false);
  });

  it('never accepts a password sign-in, marker or not', async () => {
    fake.amr = [{ method: 'password', timestamp: 1 }];
    setMarker();
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

  it('sets the password for a token-link session and clears the marker afterwards', async () => {
    fake.amr = OTP;
    setMarker();
    expect(await updatePassword('a-brand-new-password')).toEqual({ ok: true, data: null });
    expect(called('updateUser')).toHaveLength(1);
    expect(fake.deleted).toEqual([RECOVERY_COOKIE]);
    expect(await hasRecoverySession()).toBe(false);
  });

  it('keeps the marker when the password was not changed, and refuses an otp session without one', async () => {
    fake.amr = OTP;
    setMarker();
    fake.error = { code: 'weak_password', message: 'weak' };
    expect(await updatePassword('a-brand-new-password')).toMatchObject({ ok: false });
    expect(fake.deleted).toEqual([]);

    fake.error = null;
    fake.jar.clear();
    expect(await updatePassword('a-brand-new-password')).toMatchObject({ ok: false });
    expect(called('updateUser')).toHaveLength(1);
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
