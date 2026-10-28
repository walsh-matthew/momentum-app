// Gives a throwaway account the rows home reads (MOM-112): the person's anchors, a goal, targets, a milestone with two
// steps and a few entries made today. Setup (MOM-111) will make these in the real app; until it is merged the spec makes
// them the only way a person can, as that person through row level security with the local anon key. Never the service
// role, and never anything but the local stack (readLocalStackEnv holds the address to localhost). Nothing is printed.
//
// The dates follow the real clock: the goal starts on the Monday of the current week in Los Angeles, so the week is whole
// (not started partway) and every entry made now lands in it, whatever day the spec runs on.

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../../types/database.types';
import { PASSWORD } from '../fixtures';
import { readLocalStackEnv } from './localStack';

export const HOME_TITLES = {
  goal: 'Stay fit',
  workouts: 'Workouts',
  distance: 'Distance',
  prep: 'Prep checklist',
  steps: ['Read the brief', 'Book the room'],
} as const;

export interface HomeSeedOptions {
  // Null leaves person_settings out entirely: a person who has not been through setup.
  timeZone: string | null;
  // 1 to 7, Monday is 1. Null leaves the week start unset.
  weekStart: number | null;
  // Whether the goal has weekly targets. Off: only a milestone and a deadline target, a person with deadline goals only.
  weekly: boolean;
}

const ZONE = 'America/Los_Angeles';

// Today in Los Angeles as YYYY-MM-DD, and the Monday on or before it.
function laDays(): { today: string; monday: string; inSixtyDays: string } {
  const part = (date: Date) => {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
    const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
    return { ymd: `${p.year}-${p.month}-${p.day}`, weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
  };
  const shift = (ymd: string, days: number) => new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10) + days)).toISOString().slice(0, 10);
  const now = part(new Date());
  return { today: now.ymd, monday: shift(now.ymd, -((now.weekday + 6) % 7)), inSixtyDays: shift(now.ymd, 60) };
}

export async function seedHome(email: string, options: HomeSeedOptions): Promise<void> {
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
  const { monday, inSixtyDays } = laDays();

  // The day end is set for everyone who has a time zone: a person with a time zone has been through setup's anchors.
  if (options.timeZone !== null) {
    const settings = await supabase
      .from('person_settings')
      .insert({ user_id: userId, time_zone: options.timeZone, week_start: options.weekStart, day_end: '00:00:00' });
    if (settings.error) throw new Error(`Could not seed the person's settings (code ${settings.error.code}).`);
  }

  const goal = must(
    await supabase.from('goals').insert({ user_id: userId, title: HOME_TITLES.goal, start_date: monday, shape: 'ongoing' }).select('id').single(),
    'a goal',
  );
  const target = async (row: Omit<Database['public']['Tables']['targets']['Insert'], 'user_id' | 'goal_id'>) =>
    must(await supabase.from('targets').insert({ ...row, user_id: userId, goal_id: goal.id }).select('id').single(), `the target ${row.title}`).id;

  const workouts = options.weekly
    ? await target({ title: HOME_TITLES.workouts, measure: 'count', role: 'effort', period_kind: 'weekly', floor: 2, aspiration: 4, carry_over_kind: 'habit' })
    : null;
  const distance = options.weekly
    ? await target({ title: HOME_TITLES.distance, measure: 'quantity', unit: 'km', role: 'effort', period_kind: 'weekly', floor: 10, carry_over_kind: 'habit' })
    : null;
  const prep = await target({ title: HOME_TITLES.prep, measure: 'checklist', role: 'effort', period_kind: 'deadline', due_date: inSixtyDays, floor: 1, carry_over_kind: 'cumulative' });

  const item = must(
    await supabase
      .from('work_items')
      // A plain milestone has no date of its own (work_items_due_date_matches_kind); its due date is its checklist target's.
      .insert({ user_id: userId, goal_id: goal.id, target_id: prep, kind: 'milestone', title: HOME_TITLES.prep })
      .select('id')
      .single(),
    'the milestone',
  );
  const steps = must(
    await supabase
      .from('work_item_steps')
      .insert(HOME_TITLES.steps.map((title, index) => ({ user_id: userId, work_item_id: item.id, title, sort_order: index })))
      .select('id, sort_order'),
    'the steps',
  ).sort((a, b) => a.sort_order - b.sort_order);

  // Entries need a manual source, and a person can only write entries through one (migration 013).
  const source = must(await supabase.from('sources').insert({ user_id: userId, kind: 'manual', label: 'Manual' }).select('id').single(), 'a manual source');
  const now = new Date().toISOString();
  const entry = (targetId: string, value: number, recordId: string = crypto.randomUUID()) => ({
    user_id: userId,
    target_id: targetId,
    source_id: source.id,
    source_record_id: recordId,
    occurred_at: now,
    value,
    evidence: { via: 'seed' },
  });
  const entries = [
    ...(workouts && distance ? [entry(workouts, 1), entry(workouts, 1), entry(distance, 6)] : []),
    // The first step ticked: a tick is an entry whose record id is the step's id.
    entry(prep, 1, steps[0].id),
  ];
  const written = await supabase.from('entries').insert(entries);
  if (written.error) throw new Error(`Could not seed the entries (code ${written.error.code}).`);

  // Local scope only: the default (global) revokes every session the account has, including the browser's.
  await supabase.auth.signOut({ scope: 'local' });
}
