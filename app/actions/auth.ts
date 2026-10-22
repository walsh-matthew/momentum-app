'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { signInWithPassword, signOut, signUpWithPassword } from '@/lib/services/auth';
import type { AuthFormState } from '@/types/auth';

// Server Actions are reachable by direct POST, so the service validates the credentials.
// The submit button's name/value pair says which of the two buttons was used.
export async function authenticate(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const credentials = { email: formData.get('email'), password: formData.get('password') };

  if (formData.get('intent') === 'signup') {
    const requestHeaders = await headers();
    const host = requestHeaders.get('host');
    const origin = requestHeaders.get('origin') ?? `${requestHeaders.get('x-forwarded-proto') ?? 'http'}://${host}`;
    const result = await signUpWithPassword(credentials, `${origin}/auth/callback`);
    if (!result.ok) return { error: result.error, notice: null };
    if (result.data.confirmationRequired) {
      return { error: null, notice: 'Check your email for a confirmation link, then sign in.' };
    }
    redirect('/');
  }

  const result = await signInWithPassword(credentials);
  if (!result.ok) return { error: result.error, notice: null };
  redirect('/');
}

export async function signOutAction(): Promise<void> {
  await signOut();
  redirect('/login');
}
