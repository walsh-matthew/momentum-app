'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requestPasswordReset, signInWithPassword, signOut, signUpWithPassword, updatePassword } from '@/lib/services/auth';
import { CAPTCHA_FIELD, type AuthFormState, type PasswordFormState } from '@/types/auth';

// The reset email says the same thing whether or not the address has an account.
const RESET_REQUESTED = 'If that email has an account, we have sent a link to set a new password.';
const PASSWORDS_DIFFER = 'The two passwords do not match.';

// Where this request came from, for the links in emails: the Origin header when the browser sent one.
async function requestOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get('host');
  return requestHeaders.get('origin') ?? `${requestHeaders.get('x-forwarded-proto') ?? 'http'}://${host}`;
}

// Server Actions are reachable by direct POST, so the service validates the credentials.
// The submit button's name/value pair says which of the two buttons was used.
export async function authenticate(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const credentials = { email: formData.get('email'), password: formData.get('password') };
  const captchaToken = formData.get(CAPTCHA_FIELD);

  if (formData.get('intent') === 'signup') {
    const result = await signUpWithPassword(credentials, `${await requestOrigin()}/auth/callback`, captchaToken);
    if (!result.ok) return { error: result.error, notice: null };
    if (result.data.confirmationRequired) {
      // The create-account card shows its "Check your email" state for this address (MOM-150).
      const sentTo = typeof credentials.email === 'string' ? credentials.email.trim() : '';
      return { error: null, notice: null, sentTo };
    }
    redirect('/');
  }

  const result = await signInWithPassword(credentials, captchaToken);
  if (!result.ok) return { error: result.error, notice: null };
  redirect('/');
}

// The "forgot password" form on /login. The link in the email lands on /auth/callback/reset, which trades its code
// for the recovery session and sends the person to /auth/reset.
export async function requestPasswordResetAction(_previous: PasswordFormState, formData: FormData): Promise<PasswordFormState> {
  const result = await requestPasswordReset(
    formData.get('email'),
    `${await requestOrigin()}/auth/callback/reset`,
    formData.get(CAPTCHA_FIELD),
  );
  if (!result.ok) return { error: result.error, notice: null };
  return { error: null, notice: RESET_REQUESTED };
}

// The "set a new password" form on /auth/reset.
export async function updatePasswordAction(_previous: PasswordFormState, formData: FormData): Promise<PasswordFormState> {
  const password = formData.get('password');
  if (password !== formData.get('confirmPassword')) return { error: PASSWORDS_DIFFER, notice: null };
  const result = await updatePassword(password);
  if (!result.ok) return { error: result.error, notice: null };
  redirect('/');
}

export async function signOutAction(): Promise<void> {
  await signOut();
  redirect('/login');
}
