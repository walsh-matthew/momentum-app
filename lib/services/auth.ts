// Authentication data access: the only place supabase.auth is called for sign-in, sign-up, password reset and
// sign-out (CLAUDE.md, Architectural Directive 1). Server-side only: it writes the session cookies. Errors come
// back as values.

import { z } from 'zod';
import { getCaptchaConfig } from '@/lib/config/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ServiceResult } from './result';

const MIN_PASSWORD_LENGTH = 8;

const EmailSchema = z.string({ error: 'Enter a valid email address.' }).trim().toLowerCase().pipe(z.email('Enter a valid email address.'));
const PasswordSchema = z.string().min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);

const CredentialsSchema = z.object({ email: EmailSchema, password: PasswordSchema });

// Fixed messages: none of them depends on whether an account exists, and none repeats what the provider said.
const CAPTCHA_REQUIRED = 'Complete the CAPTCHA check, then try again.';
const CAPTCHA_FAILED = 'The CAPTCHA check did not pass. Try again.';
const RESET_EMAIL_FAILED = 'We could not send the reset email. Try again in a little while.';
const PASSWORD_UPDATE_FAILED = 'We could not set your new password. Request a new reset link and try again.';
const REUSED_PASSWORD = 'Choose a password you have not used before.';

export interface SessionUser {
  id: string;
  email: string | null;
}

export async function getCurrentUser(): Promise<ServiceResult<SessionUser | null>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  // No session is a normal state, not a failure.
  if (error || !data.user) return { ok: true, data: null };
  return { ok: true, data: { id: data.user.id, email: data.user.email ?? null } };
}

// What to send to Supabase Auth for the CAPTCHA. With no site key configured there is nothing to check and no token
// is sent, so the calls behave exactly as before; with one, a call without a token never reaches Supabase.
type CaptchaOptions = { ok: true; captchaToken?: string } | { ok: false; error: string };

function captchaOptions(rawToken: unknown): CaptchaOptions {
  if (getCaptchaConfig() === null) return { ok: true };
  const token = typeof rawToken === 'string' ? rawToken.trim() : '';
  return token === '' ? { ok: false, error: CAPTCHA_REQUIRED } : { ok: true, captchaToken: token };
}

// Supabase reports a rejected token with the code `captcha_failed`; the message check covers an older server.
function isCaptchaError(error: { code?: string; message: string }): boolean {
  return error.code === 'captcha_failed' || /captcha/i.test(error.message);
}

export async function signInWithPassword(rawInput: unknown, captchaToken?: unknown): Promise<ServiceResult<SessionUser>> {
  const parsed = CredentialsSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const captcha = captchaOptions(captchaToken);
  if (!captcha.ok) return captcha;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    ...parsed.data,
    options: { captchaToken: captcha.captchaToken },
  });
  if (error && isCaptchaError(error)) return { ok: false, error: CAPTCHA_FAILED };
  if (error || !data.user) return { ok: false, error: error?.message ?? 'Could not sign in.' };
  return { ok: true, data: { id: data.user.id, email: data.user.email ?? null } };
}

// `confirmationRequired` is true when the project requires email confirmation: the account exists
// but has no session until the user opens the emailed link (handled by exchangeAuthCode).
export async function signUpWithPassword(
  rawInput: unknown,
  emailRedirectTo: string,
  captchaToken?: unknown,
): Promise<ServiceResult<{ confirmationRequired: boolean }>> {
  const parsed = CredentialsSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const captcha = captchaOptions(captchaToken);
  if (!captcha.ok) return captcha;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo, captchaToken: captcha.captchaToken },
  });
  if (error && isCaptchaError(error)) return { ok: false, error: CAPTCHA_FAILED };
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { confirmationRequired: data.session === null } };
}

// Sends the password reset email. The answer is the same whether or not the address has an account (Supabase Auth
// sends nothing for an unknown address and still reports success), so this cannot be used to find out who is
// registered. Only a malformed address, a missing CAPTCHA token or a provider failure comes back as an error, and
// none of those depends on the account. `redirectTo` is where the emailed link lands (/auth/callback/reset).
export async function requestPasswordReset(
  rawEmail: unknown,
  redirectTo: string,
  captchaToken?: unknown,
): Promise<ServiceResult<null>> {
  const parsed = EmailSchema.safeParse(rawEmail);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const captcha = captchaOptions(captchaToken);
  if (!captcha.ok) return captcha;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo,
    captchaToken: captcha.captchaToken,
  });
  if (error && isCaptchaError(error)) return { ok: false, error: CAPTCHA_FAILED };
  if (error) return { ok: false, error: RESET_EMAIL_FAILED };
  return { ok: true, data: null };
}

// True when the current session is the one an emailed recovery link created. Supabase records how a session was
// started in the token's `amr` claim; a session from a normal sign-in carries `password` instead. The claims are
// verified (getClaims checks the token's signature), unlike the cookie contents.
export async function hasRecoverySession(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return false;
  const amr: unknown = data.claims.amr;
  return Array.isArray(amr) && amr.some((entry) => (entry as { method?: unknown } | null)?.method === 'recovery');
}

// Sets the new password for the recovery session, with the same rules as sign-up. A session that did not come from
// a reset link is refused, so /auth/reset cannot be used as a password-change form by a normal sign-in.
export async function updatePassword(rawPassword: unknown): Promise<ServiceResult<null>> {
  const parsed = PasswordSchema.safeParse(rawPassword);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!(await hasRecoverySession())) return { ok: false, error: PASSWORD_UPDATE_FAILED };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error?.code === 'same_password') return { ok: false, error: REUSED_PASSWORD };
  if (error) return { ok: false, error: PASSWORD_UPDATE_FAILED };
  return { ok: true, data: null };
}

// Completes the emailed confirmation link: trades the one-time code for a session cookie.
export async function exchangeAuthCode(code: string): Promise<ServiceResult<null>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

export async function signOut(): Promise<ServiceResult<null>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}
