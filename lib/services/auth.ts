// Authentication data access: the only place supabase.auth is called for sign-in, sign-up and
// sign-out (CLAUDE.md, Architectural Directive 1). Server-side only: it writes the session
// cookies. Errors come back as values.

import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ServiceResult } from './result';

const MIN_PASSWORD_LENGTH = 8;

const CredentialsSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.')),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`),
});

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

export async function signInWithPassword(rawInput: unknown): Promise<ServiceResult<SessionUser>> {
  const parsed = CredentialsSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { ok: false, error: error?.message ?? 'Could not sign in.' };
  return { ok: true, data: { id: data.user.id, email: data.user.email ?? null } };
}

// `confirmationRequired` is true when the project requires email confirmation: the account exists
// but has no session until the user opens the emailed link (handled by exchangeAuthCode).
export async function signUpWithPassword(
  rawInput: unknown,
  emailRedirectTo: string,
): Promise<ServiceResult<{ confirmationRequired: boolean }>> {
  const parsed = CredentialsSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({ ...parsed.data, options: { emailRedirectTo } });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { confirmationRequired: data.session === null } };
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
