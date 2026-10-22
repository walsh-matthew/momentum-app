// Server-side Supabase client bound to the request's auth cookies. Only service modules in
// @/lib/services/ import this (CLAUDE.md, Architectural Directive 1).
// Uses the anon key: RLS decides what the signed-in user can touch. The service role key is
// deliberately not used here.

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getPublicEnv } from '@/lib/config/env';
import type { Database } from '@/types/database.types';

export async function createSupabaseServerClient() {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey } = getPublicEnv();

  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        // Cookies can only be written from a Server Action or Route Handler. A read-only render
        // throws here, which is safe to ignore: proxy.ts refreshes the session on every request.
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {}
      },
    },
  });
}
