// Gives a throwaway account the rows manual entry needs (MOM-110): a goal, a target of each measure, a milestone
// feeding the checklist target with two steps, and optionally the person's time zone and day end. Setup (MOM-111) will make
// these in the real app; until it exists the spec makes them the only way a person can, as that person, through row
// level security with the local anon key. Never the service role, and never anything but the local stack: the address
// is held to localhost by readLocalStackEnv. Nothing is printed.

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../../types/database.types';
import { PASSWORD } from '../fixtures';
import { readLocalStackEnv } from './localStack';

export interface SeededGoalModel {
  targets: { count: string; quantity: string; time: string; checklist: string };
  steps: { id: string; title: string }[];
}

export const SEED_TITLES = {
  count: 'Workouts',
  quantity: 'Distance',
  time: 'Study time',
  checklist: 'Prep',
  unit: 'km',
  steps: ['Read the brief', 'Book the room'],
} as const;

// The date (YYYY-MM-DD, UTC) this many days from today. A negative number is in the past.
export function dateFromToday(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export interface SeedOptions {
  // The goal's start date. Defaults to 30 days ago, so no day the specs log on is before it.
  startDate?: string;
  // The person's day end as a time ("22:00:00"), or null for a person who has not set one. Defaults to 22:00, an
  // evening day end that leaves the day boundary at midnight.
  dayEnd?: string | null;
}

// Signs in as the throwaway account and writes its rows. `timeZone` null leaves person_settings out entirely, which
// is the state of a person who has not been through setup: logging must then refuse.
export async function seedGoalModel(email: string, timeZone: string | null, options: SeedOptions = {}): Promise<SeededGoalModel> {
  const startDate = options.startDate ?? dateFromToday(-30);
  const dayEnd = options.dayEnd === undefined ? '22:00:00' : options.dayEnd;
  const { serverEnv } = readLocalStackEnv();
  const supabase = createClient<Database>(serverEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const signedIn = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error || !signedIn.data.user) throw new Error('Could not sign the throwaway account in to seed it.');
  const userId = signedIn.data.user.id;
  const must = <T>(result: { data: T; error: { code?: string } | null }, what: string): NonNullable<T> => {
    if (result.error || result.data === null || result.data === undefined) {
      throw new Error(`Could not seed ${what} (code ${result.error?.code ?? 'no row'}).`);
    }
    return result.data;
  };

  if (timeZone !== null) {
    const settings = await supabase.from('person_settings').insert({ user_id: userId, time_zone: timeZone, day_end: dayEnd });
    if (settings.error) throw new Error(`Could not seed the time zone (code ${settings.error.code}).`);
  }

  const goal = must(
    await supabase.from('goals').insert({ user_id: userId, title: 'Stay fit', start_date: startDate, shape: 'ongoing' }).select('id').single(),
    'a goal',
  );
  const target = async (title: string, measure: 'count' | 'quantity' | 'time' | 'checklist') =>
    must(
      await supabase
        .from('targets')
        .insert({
          user_id: userId,
          goal_id: goal.id,
          title,
          measure,
          unit: measure === 'quantity' ? SEED_TITLES.unit : null,
          role: 'effort',
          period_kind: measure === 'checklist' ? 'deadline' : 'weekly',
          due_date: measure === 'checklist' ? '2026-12-31' : null,
          floor: measure === 'checklist' ? 2 : 3,
          carry_over_kind: measure === 'checklist' ? 'cumulative' : 'habit',
        })
        .select('id')
        .single(),
      `the ${measure} target`,
    ).id;

  const targets = {
    count: await target(SEED_TITLES.count, 'count'),
    quantity: await target(SEED_TITLES.quantity, 'quantity'),
    time: await target(SEED_TITLES.time, 'time'),
    checklist: await target(SEED_TITLES.checklist, 'checklist'),
  };

  const item = must(
    await supabase
      .from('work_items')
      .insert({ user_id: userId, goal_id: goal.id, target_id: targets.checklist, kind: 'milestone', title: 'Prep checklist' })
      .select('id')
      .single(),
    'the milestone',
  );
  const steps = must(
    await supabase
      .from('work_item_steps')
      .insert(SEED_TITLES.steps.map((title, index) => ({ user_id: userId, work_item_id: item.id, title, sort_order: index })))
      .select('id, title, sort_order'),
    'the steps',
  )
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(({ id, title }) => ({ id, title }));

  // Local scope only: the default (global) revokes every session the account has, including the browser's.
  await supabase.auth.signOut({ scope: 'local' });
  return { targets, steps };
}
