// Gives a throwaway account the rows the weekly review reads (MOM-113 block 3.2): the person's anchors and planning day, a goal
// with a weekly target, a named priority, entries in the week being reviewed, and optionally a finished review's record. Made
// the only way a person can before setup is finished in the browser: as that person through row level security with the local
// anon key. Never the service role, and never anything but the local stack. Nothing is printed.
//
// The dates follow the real clock in Los Angeles, because the app reads it: the person's planning day is today's weekday, and
// the week start is chosen so that the reviewed week is the one that ended yesterday (`closesEarly: false`) or the one that
// ends today (`closesEarly: true`, the last-day case, RAID I-11), whatever day the spec runs on.

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../../types/database.types';
import { PASSWORD } from '../fixtures';
import { readLocalStackEnv } from './localStack';

export const REVIEW_TITLES = { goal: 'Stay fit', workouts: 'Workouts', priority: 'Family time' } as const;

const ZONE = 'America/Los_Angeles';
export const shiftDay = (ymd: string, days: number) =>
  new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10) + days)).toISOString().slice(0, 10);

// Today in Los Angeles and its weekday (0 is Sunday).
export function laToday(): { today: string; weekday: number } {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
  const p = Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { today: `${p.year}-${p.month}-${p.day}`, weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
}

// The database counts weekdays 1 to 7 with Monday as 1; the engine counts 0 to 6 with Sunday as 0.
const toDb = (weekday: number) => (weekday === 0 ? 7 : weekday);

export interface ReviewSeedOptions {
  // False: the week ended yesterday. True: the week ends today, so the review closes it early.
  closesEarly: boolean;
  // Null leaves the planning day unset: a person who has not chosen one.
  planning: 'today' | 'tomorrow' | null;
  // Null leaves person_settings out of the time zone: a person with no time zone.
  timeZone: string | null;
  // A finished review's record for the reviewed week, saying the workouts count was 1 (partway) when the live count is 2.
  finished: boolean;
  // 'floor' (the default): two workouts in the reviewed week, at the floor, so nothing is raised for layer 3. 'none': no workout
  // in it, so the floor is missed three weeks running and layer 3 raises a slipping check-in (MOM-113 block 3.3).
  week?: 'floor' | 'none';
  // The review depth and the way review and planning go together, as the person chose them. Unset: not chosen (the defaults).
  reviewDepth?: 'recap_only' | 'recap_offer' | 'full';
  reviewPlanning?: 'one_sitting' | 'separate';
}

export interface ReviewSeed {
  window: { start: string; end: string };
  today: string;
  weekday: number;
}

export async function seedReview(email: string, options: ReviewSeedOptions): Promise<ReviewSeed> {
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

  const { today, weekday } = laToday();
  // The week starts today when it ended yesterday; it starts tomorrow when it ends today.
  const weekStartsOn = options.closesEarly ? (weekday + 1) % 7 : weekday;
  const window = options.closesEarly ? { start: shiftDay(today, -6), end: today } : { start: shiftDay(today, -7), end: shiftDay(today, -1) };
  const planningWeekday = options.planning === 'tomorrow' ? (weekday + 1) % 7 : weekday;

  if (options.timeZone !== null || options.planning !== null) {
    const settings = await supabase.from('person_settings').insert({
      user_id: userId,
      time_zone: options.timeZone,
      week_start: toDb(weekStartsOn),
      day_end: options.timeZone === null ? null : '00:00:00',
      planning_weekday: options.planning === null ? null : toDb(planningWeekday),
      review_depth: options.reviewDepth ?? null,
      review_planning: options.reviewPlanning ?? null,
    });
    if (settings.error) throw new Error(`Could not seed the person's settings (code ${settings.error.code}).`);
  }

  // Two weeks before the reviewed one, so earlier weeks exist; the goal starts on a whole week.
  const goal = must(
    await supabase
      .from('goals')
      .insert({ user_id: userId, title: REVIEW_TITLES.goal, start_date: shiftDay(window.start, -14), shape: 'ongoing' })
      .select('id')
      .single(),
    'a goal',
  );
  const target = must(
    await supabase
      .from('targets')
      .insert({
        user_id: userId,
        goal_id: goal.id,
        title: REVIEW_TITLES.workouts,
        measure: 'count',
        role: 'effort',
        period_kind: 'weekly',
        floor: 2,
        aspiration: 4,
        carry_over_kind: 'habit',
      })
      .select('id')
      .single(),
    'the target',
  );
  must(await supabase.from('person_priorities').insert({ user_id: userId, label: REVIEW_TITLES.priority, sort_order: 0 }).select('id').single(), 'a priority');

  // Two workouts in the reviewed week: its floor is 2, so the week ends at the floor, 2 short of the aspiration. 20:00 UTC is
  // noon or 1pm in Los Angeles, the same calendar day either side of the clocks changing.
  const source = must(await supabase.from('sources').insert({ user_id: userId, kind: 'manual', label: 'Manual' }).select('id').single(), 'a manual source');
  const entry = (day: string) => ({
    user_id: userId,
    target_id: target.id,
    source_id: source.id,
    source_record_id: crypto.randomUUID(),
    occurred_at: `${day}T20:00:00Z`,
    value: 1,
    evidence: { via: 'seed' },
  });
  if ((options.week ?? 'floor') === 'floor') {
    const written = await supabase.from('entries').insert([entry(shiftDay(window.start, 1)), entry(shiftDay(window.start, 2))]);
    if (written.error) throw new Error(`Could not seed the entries (code ${written.error.code}).`);
  }

  if (options.finished) {
    // What the recap said when it was finished: one workout, partway. Two are logged now, so a later entry changed the week.
    const recap = {
      v: 1,
      window,
      closedEarly: options.closesEarly,
      goals: [
        {
          id: goal.id,
          title: REVIEW_TITLES.goal,
          targets: [
            {
              id: target.id,
              title: REVIEW_TITLES.workouts,
              measure: 'count',
              unit: null,
              role: 'effort',
              period: 'weekly',
              dueOn: null,
              floor: 2,
              aspiration: 4,
              status: 'counted',
              counted: 1,
              graded: true,
              startedPartway: false,
              level: 'partway',
              remainingToFloor: 1,
              remainingToAspiration: 3,
              owed: 0,
              belowThreshold: 0,
              slots: null,
              pattern: null,
              trend: null,
              crossings: [],
            },
          ],
        },
      ],
      priorities: [],
    };
    const record = await supabase.from('weekly_reviews').insert({ user_id: userId, week_start: window.start, week_end: window.end, recap });
    if (record.error) throw new Error(`Could not seed the finished review (code ${record.error.code}).`);
  }

  // Local scope only: the default (global) revokes every session the account has, including the browser's.
  await supabase.auth.signOut({ scope: 'local' });
  return { window, today, weekday };
}

// The finished reviews a throwaway account has stored, read back as that person through row level security with the local anon
// key (never the service role): how many, and the one adjustment each offered with the choice made. Nothing else is read.
export async function readFinishedReviews(email: string): Promise<Array<{ week_start: string; adjustment_kind: string | null; adjustment_outcome: string | null }>> {
  const { serverEnv } = readLocalStackEnv();
  const supabase = createClient<Database>(serverEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error || !signedIn.data.user) throw new Error('Could not sign the throwaway account in to read its reviews.');
  const rows = await supabase.from('weekly_reviews').select('week_start, adjustment_kind, adjustment_outcome').order('week_start');
  await supabase.auth.signOut({ scope: 'local' });
  if (rows.error) throw new Error(`Could not read the finished reviews (code ${rows.error.code}).`);
  return rows.data;
}
