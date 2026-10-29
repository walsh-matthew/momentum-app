// Gives a throwaway account what the week plan reads (MOM-112 block 2), on top of what home already needs (homeSeed.ts: the
// person's anchors, a goal, a milestone "Prep checklist" with two steps and the first ticked): a habit "Go for a run" with
// set days (Monday, Wednesday, Friday), two kinds of days in the person's own words, and optionally a kind a week ago and a
// step put on a day last week. Made the only way a person can before setup is finished in the browser: as that person through
// row level security with the local anon key. Never the service role, and never anything but the local stack. Nothing is printed.
//
// The dates follow the real clock in Los Angeles, because the app reads it.

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../../types/database.types';
import { PASSWORD } from '../fixtures';
import { HOME_TITLES, seedHome, type HomeSeedOptions } from './homeSeed';
import { laToday, shiftDay } from './reviewSeed';
import { readLocalStackEnv } from './localStack';

export const PLAN_TITLES = { ...HOME_TITLES, habit: 'Go for a run', work: 'Work day', rest: 'Rest day' } as const;

export interface PlanSeedOptions extends HomeSeedOptions {
  // A kind of day on the date a week before today: "Same as last week" has something to copy onto today.
  lastWeekKind?: boolean;
  // The milestone put on a day last week and left unfinished: it is left over.
  leftOver?: boolean;
}

export async function seedPlan(email: string, options: PlanSeedOptions): Promise<{ today: string }> {
  await seedHome(email, options);
  const { today } = laToday();
  // A person with no time zone has no days; there is nothing more to give them.
  if (options.timeZone === null) return { today };

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

  const goal = must(await supabase.from('goals').select('id').eq('user_id', userId).eq('title', HOME_TITLES.goal).single(), 'the goal');
  const milestone = must(await supabase.from('work_items').select('id').eq('user_id', userId).eq('title', HOME_TITLES.prep).single(), 'the milestone');

  // The habit's set days are the target's named days: Monday, Wednesday and Friday (the database counts Monday as 1).
  const run = must(
    await supabase
      .from('targets')
      .insert({
        user_id: userId,
        goal_id: goal.id,
        title: 'Runs',
        measure: 'count',
        role: 'effort',
        period_kind: 'day_slots',
        slot_weekdays: [1, 3, 5],
        floor: 3,
        carry_over_kind: 'habit',
      })
      .select('id')
      .single(),
    'the day-slot target',
  );
  must(
    await supabase.from('work_items').insert({ user_id: userId, goal_id: goal.id, target_id: run.id, kind: 'habit', title: PLAN_TITLES.habit }).select('id').single(),
    'the habit',
  );

  const kinds = must(
    await supabase
      .from('person_day_types')
      .insert([
        { user_id: userId, name: PLAN_TITLES.work, capacity_unit: 'hours', capacity_amount: 3 },
        { user_id: userId, name: PLAN_TITLES.rest, capacity_unit: 'hours', capacity_amount: 1 },
      ])
      .select('id, name'),
    'the kinds of days',
  );
  const work = kinds.find((k) => k.name === PLAN_TITLES.work);
  if (!work) throw new Error('Could not seed the kinds of days.');

  if (options.lastWeekKind) {
    const written = await supabase.from('week_plan_day_types').insert({ user_id: userId, plan_date: shiftDay(today, -7), day_type_id: work.id });
    if (written.error) throw new Error(`Could not seed last week's kind (code ${written.error.code}).`);
  }
  if (options.leftOver) {
    const written = await supabase.from('week_plan_picks').insert({ user_id: userId, work_item_id: milestone.id, plan_date: shiftDay(today, -7) });
    if (written.error) throw new Error(`Could not seed last week's step (code ${written.error.code}).`);
  }

  // Local scope only: the default (global) revokes every session the account has, including the browser's.
  await supabase.auth.signOut({ scope: 'local' });
  return { today };
}
