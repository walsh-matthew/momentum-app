// Gives a throwaway account a deadline task and the days it was set aside (MOM-112 slice 2), on top of what home already
// needs (homeSeed.ts): a kind of day "Work day" worth 3 hours, a deadline task "Send the application" that can move, a rough
// size, and the days the person put it on, each with or without a kind. Made the only way a person can before setup is
// finished in the browser: as that person through row level security with the local anon key. Never the service role, and
// never anything but the local stack. Nothing is printed.
//
// The dates follow the real clock in Los Angeles, because the app reads it.

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../../types/database.types';
import { PASSWORD } from '../fixtures';
import { HOME_TITLES, seedHome, type HomeSeedOptions } from './homeSeed';
import { readLocalStackEnv } from './localStack';
import { laToday, shiftDay } from './reviewSeed';

export const FORECAST_TITLES = { ...HOME_TITLES, task: 'Send the application', work: 'Work day' } as const;

export interface ForecastSeedOptions extends HomeSeedOptions {
  // The task is due this many days from today.
  dueInDays: number;
  // The person's own rough size; null leaves it out.
  estimateMinutes: number | null;
  // The days the task is put on, as days from today, and whether the person said what kind of day each is.
  plannedDays: { offset: number; kind: boolean }[];
}

// Returns today and the due date, in the person's own days.
export async function seedForecast(email: string, options: ForecastSeedOptions): Promise<{ today: string; dueOn: string }> {
  await seedHome(email, options);
  const { today } = laToday();
  const dueOn = shiftDay(today, options.dueInDays);

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
  const kind = must(
    await supabase.from('person_day_types').insert({ user_id: userId, name: FORECAST_TITLES.work, capacity_unit: 'hours', capacity_amount: 3 }).select('id').single(),
    'the kind of day',
  );
  const task = must(
    await supabase
      .from('work_items')
      .insert({
        user_id: userId,
        goal_id: goal.id,
        kind: 'deadline_task',
        title: FORECAST_TITLES.task,
        due_date: dueOn,
        date_can_move: true,
        estimate_minutes: options.estimateMinutes,
      })
      .select('id')
      .single(),
    'the deadline task',
  );

  if (options.plannedDays.length > 0) {
    const picks = await supabase
      .from('week_plan_picks')
      .insert(options.plannedDays.map((d) => ({ user_id: userId, work_item_id: task.id, plan_date: shiftDay(today, d.offset) })));
    if (picks.error) throw new Error(`Could not seed the days set aside (code ${picks.error.code}).`);
  }
  const withKind = options.plannedDays.filter((d) => d.kind);
  if (withKind.length > 0) {
    const kinds = await supabase
      .from('week_plan_day_types')
      .insert(withKind.map((d) => ({ user_id: userId, plan_date: shiftDay(today, d.offset), day_type_id: kind.id })));
    if (kinds.error) throw new Error(`Could not seed the kinds of days (code ${kinds.error.code}).`);
  }

  // Local scope only: the default (global) revokes every session the account has, including the browser's.
  await supabase.auth.signOut({ scope: 'local' });
  return { today, dueOn };
}
