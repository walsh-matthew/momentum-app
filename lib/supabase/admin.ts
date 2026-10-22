// Service-role Supabase client. It BYPASSES row level security, so it is the one place that can
// read provider tokens (integration_credentials, migration 005), and every caller must scope its
// queries to a user id it has verified itself (a session user, or a signed webhook it resolved).
// Only service modules in @/lib/services/ import this (CLAUDE.md, Architectural Directive 1).
// `server-only` fails the build if a Client Component ever imports it, which keeps the service role
// key out of browser bundles.

import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { getPublicEnv, getSupabaseServiceRoleKey } from '@/lib/config/env';
import type { Database } from '@/types/database.types';

export function createSupabaseAdminClient() {
  return createClient<Database>(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL, getSupabaseServiceRoleKey(), {
    // A server-side client with no user: no stored session, no token refresh timers.
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
