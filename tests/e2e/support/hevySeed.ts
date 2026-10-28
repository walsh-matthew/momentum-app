// Gives a throwaway account what "Sync now" needs to count a Hevy workout (MOM-129): a goal, a count target, a Hevy
// source and the binding between them, which guided setup (MOM-111) will make in the real app. Written as that person
// through row level security with the local anon key, like tests/e2e/support/goalModelSeed.ts: never the service role,
// and never anything but the local stack (readLocalStackEnv holds the address to localhost). Nothing is printed.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../types/database.types';
import { PASSWORD } from '../fixtures';
import { readLocalStackEnv } from './localStack';

async function signedIn(email: string): Promise<{ supabase: SupabaseClient<Database>; userId: string }> {
  const { serverEnv } = readLocalStackEnv();
  const supabase = createClient<Database>(serverEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (result.error || !result.data.user) throw new Error('Could not sign the throwaway account in.');
  return { supabase, userId: result.data.user.id };
}

// A goal with one weekly count target. With `bindHevy`, also the Hevy source bound to that target; without it the
// person has a target but nothing counts Hevy workouts.
export async function seedHevyBinding(email: string, bindHevy: boolean): Promise<void> {
  const { supabase, userId } = await signedIn(email);
  const fail = (what: string, code?: string) => new Error(`Could not seed ${what} (code ${code ?? 'no row'}).`);

  const goal = await supabase.from('goals').insert({ user_id: userId, title: 'Stay fit', start_date: '2026-10-26', shape: 'ongoing' }).select('id').single();
  if (goal.error || !goal.data) throw fail('a goal', goal.error?.code);
  const target = await supabase
    .from('targets')
    .insert({ user_id: userId, goal_id: goal.data.id, title: 'Workouts', measure: 'count', role: 'effort', period_kind: 'weekly', floor: 3, carry_over_kind: 'habit' })
    .select('id')
    .single();
  if (target.error || !target.data) throw fail('a target', target.error?.code);

  if (bindHevy) {
    const source = await supabase.from('sources').insert({ user_id: userId, kind: 'synced', provider: 'hevy', label: 'Hevy' }).select('id').single();
    if (source.error || !source.data) throw fail('the Hevy source', source.error?.code);
    const link = await supabase.from('target_sources').insert({ user_id: userId, target_id: target.data.id, source_id: source.data.id });
    if (link.error) throw fail('the binding', link.error.code);
  }
  await supabase.auth.signOut({ scope: 'local' });
}

// How many entries the person has, read as that person (row level security shows only their own).
export async function countEntries(email: string): Promise<number> {
  const { supabase } = await signedIn(email);
  const result = await supabase.from('entries').select('id', { count: 'exact', head: true });
  await supabase.auth.signOut({ scope: 'local' });
  if (result.error || result.count === null) throw new Error(`Could not count entries (code ${result.error?.code ?? 'no count'}).`);
  return result.count;
}
