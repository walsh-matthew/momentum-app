// Velocity score and burnout-risk signal (docs/NINETY_DAY_PLAN_CONTEXT.md §10).
//
// Pure functions over task rows: no Supabase, no clock, no side effects. Callers fetch rows through
// @/lib/services and pass `asOf` in. Velocity comes from completion ticks and carry-over, never
// logged hours (§5 rule 4), so `minutes` is deliberately not an input. Nothing here marks a task
// done or proposes cutting one (§3, §5 rules 1 and 6).

import type { MicroTask } from '@/types/database.types';

export type VelocityTask = Pick<MicroTask, 'week_of' | 'status' | 'due_date' | 'carried_from_week'>;

export type BurnoutRisk = 'low' | 'rising' | 'high';
export type VelocityTrend = 'up' | 'down' | 'flat';

export interface WeekVelocity {
  week: number;
  // Tasks the week owed: those in the week (due so far, for the current week) plus those carried
  // out of it, which still count as unfinished there.
  planned: number;
  done: number;
  // Tasks that arrived in this week carried over from an earlier one.
  carriedIn: number;
  // Of carriedIn, how many are still not ticked.
  carriedInOpen: number;
  // 0 to 100, or null when the week owed nothing yet.
  score: number | null;
  // True when carry-over volume alone is heavy enough to count toward burnout risk.
  carryPressure: boolean;
}

export interface VelocitySnapshot {
  currentWeek: number;
  // Score of the latest week that has tasks (the current week once it is built); null when there
  // is nothing to score yet.
  score: number | null;
  trend: VelocityTrend | null;
  // null when there are no tasks at all, so the UI shows an empty state instead of a number.
  risk: BurnoutRisk | null;
  // Consecutive weeks of carry pressure, counted back from the latest week that has tasks.
  pressureStreak: number;
  // Current week first, then earlier weeks; weeks with no tasks are left out.
  weeks: WeekVelocity[];
}

// Open carried-over tasks lower the score by this share of their weight, on top of not being
// ticked. Carry-over is the leading sign of an overloaded plan, so it costs more than a plain miss.
export const CARRY_DRAG = 0.5;

// A week has carry pressure when at least this many tasks, making up at least this share of the
// week, arrived carried over. The count floor stops a 1-of-3 week from reading as pressure.
export const PRESSURE_MIN_CARRIED = 2;
export const PRESSURE_MIN_SHARE = 0.25;

// Consecutive pressured weeks needed for each level.
export const RISING_STREAK = 2;
export const HIGH_STREAK = 3;

// A score change smaller than this many points reads as flat.
export const TREND_THRESHOLD = 5;

const MS_PER_DAY = 86_400_000;
const WEEK_DAYS = 7;

// The plan week (1-based) that `asOf` falls in, for a plan starting on `startDate`. Both are
// YYYY-MM-DD. Before the start date this is week 1; an unparseable date gives null.
export function currentPlanWeek(startDate: string, asOf: string): number | null {
  const start = Date.parse(startDate);
  const now = Date.parse(asOf);
  if (Number.isNaN(start) || Number.isNaN(now)) return null;
  const days = Math.floor((now - start) / MS_PER_DAY);
  return Math.max(1, Math.floor(days / WEEK_DAYS) + 1);
}

function scoreWeek(
  week: number,
  tasks: readonly VelocityTask[],
  currentWeek: number,
  asOf: string,
): WeekVelocity | null {
  const inWeek = tasks.filter((t) => t.week_of === week);
  const carriedOut = tasks.filter((t) => t.carried_from_week === week && t.week_of > week);
  if (inWeek.length === 0 && carriedOut.length === 0) return null;

  // Part-way through the current week, only what is due so far (or already ticked) counts. Without
  // this a Monday would read as 0% for tasks that are not due yet.
  const owed =
    week === currentWeek
      ? inWeek.filter((t) => t.status === 'done' || t.due_date === null || t.due_date <= asOf)
      : inWeek;

  const planned = owed.length + carriedOut.length;
  const done = owed.filter((t) => t.status === 'done').length;

  const carriedInAll = inWeek.filter((t) => t.carried_from_week !== null);
  const carriedInOpen = owed.filter((t) => t.carried_from_week !== null && t.status !== 'done').length;

  let score: number | null = null;
  if (planned > 0) {
    const completion = done / planned;
    const drag = (CARRY_DRAG * carriedInOpen) / planned;
    score = Math.round(100 * Math.min(1, Math.max(0, completion - drag)));
  }

  return {
    week,
    planned,
    done,
    carriedIn: carriedInAll.length,
    carriedInOpen,
    score,
    carryPressure:
      carriedInAll.length >= PRESSURE_MIN_CARRIED &&
      carriedInAll.length / inWeek.length >= PRESSURE_MIN_SHARE,
  };
}

function riskForStreak(streak: number): BurnoutRisk {
  if (streak >= HIGH_STREAK) return 'high';
  if (streak >= RISING_STREAK) return 'rising';
  return 'low';
}

// Builds the snapshot for plan week `currentWeek` as of `asOf` (YYYY-MM-DD). Weeks after
// `currentWeek` are ignored: work pulled forward or planned ahead is not a miss.
export function computeVelocity(
  tasks: readonly VelocityTask[],
  currentWeek: number,
  asOf: string,
): VelocitySnapshot {
  const weeks: WeekVelocity[] = [];
  for (let week = currentWeek; week >= 1; week--) {
    const scored = scoreWeek(week, tasks, currentWeek, asOf);
    if (scored) weeks.push(scored);
  }

  if (weeks.length === 0) {
    return { currentWeek, score: null, trend: null, risk: null, pressureStreak: 0, weeks };
  }

  // The Friday rebuild creates next week's tab, so the current week can be empty for a while.
  // Count the streak from the latest week that has tasks so a gap does not reset it.
  let pressureStreak = 0;
  let expected = weeks[0].week;
  for (const w of weeks) {
    if (w.week !== expected || !w.carryPressure) break;
    pressureStreak++;
    expected--;
  }

  const latest = weeks[0];
  const previous = weeks.find((w) => w.week === latest.week - 1);
  let trend: VelocityTrend | null = null;
  if (latest.score !== null && previous?.score != null) {
    const delta = latest.score - previous.score;
    trend = delta >= TREND_THRESHOLD ? 'up' : delta <= -TREND_THRESHOLD ? 'down' : 'flat';
  }

  return {
    currentWeek,
    score: latest.score,
    trend,
    risk: riskForStreak(pressureStreak),
    pressureStreak,
    weeks,
  };
}
