// Maps the goal model's database rows onto the week plan and the "Your plan" card on home (MOM-112 block 2). Pure: rows
// in, a view out, no database and no clock (the caller passes the time). The reads and writes are in
// lib/services/weekPlan.ts.
//
// The plan is the person's own choice of which things to do on which of their days (docs/DOMAIN_MODEL.md §1.4). Nothing here
// chooses for them:
// - a day is a date in the person's own time zone, and a choice is a thing on a date: never a time, never a slot, and
//   never a guess at how long a day is (principle 12);
// - a time anchor that is not set stays null and is never filled in (principle 1). Without a time zone and a day end the
//   person's days are not known, so there is no plan at all. Without a week start the plan is the next 14 dates from today,
//   and nothing is said about weeks, because that is theirs to set;
// - nothing is pre-filled: a day with no kind stays without one until the person says (or taps "Same as last week");
// - unfinished steps move forward and are never silently cut, and a habit never carries over (principle 11): the carry-
//   forward is the engine's (lib/engine/carryover.ts), and a habit is never put through it.

import { addDays, assertDate, canGrade, carryForwardSteps, dayOfWeek, localDay, weekRange } from '@/lib/engine';
import type { GoalRow, PersonDayTypeRow, TargetRow, WeekPlanDayTypeRow, WeekPlanPickRow, WorkItemRow } from '@/types/database.types';
import type { DayKindOption, HomePlanItem, HomePlanView, PlanDayView, PlanItemView, WeekPlanView } from '@/types/plan';
import type { LocalDate, TimeAnchors, Weekday, WorkStep } from '@/types/scoreboard';
import {
  tickedSteps,
  toAnchors,
  toWeekday,
  type CorrectionRead,
  type EntryRead,
  type SettingsRead,
  type StepRead,
} from './scoreboardRows';

// How many weeks ahead of the current one the person can plan, and how many dates the plan lists without a week start.
export const MAX_WEEKS_AHEAD = 12;
export const ROLLING_DAYS = 14;
// A pick this many days back is still read, so an item left over from last week can be found. Older ones are not.
export const LOOK_BACK_DAYS = 56;

export type PlanSettingsRead = Pick<SettingsRead, 'time_zone' | 'week_start' | 'day_end'>;
export type PlanGoalRead = Pick<GoalRow, 'id' | 'title' | 'state' | 'created_at'>;
export type PlanTargetRead = Pick<TargetRow, 'id' | 'period_kind' | 'slot_weekdays' | 'due_date'>;
export type PlanItemRead = Pick<WorkItemRow, 'id' | 'goal_id' | 'target_id' | 'kind' | 'title' | 'due_date' | 'sort_order' | 'created_at' | 'completed_at'>;
export type PlanTickRead = Pick<EntryRead, 'source_id' | 'source_record_id' | 'occurred_at'>;
export type PlanPickRead = Pick<WeekPlanPickRow, 'work_item_id' | 'plan_date'>;
export type PlanDayKindRead = Pick<WeekPlanDayTypeRow, 'plan_date' | 'day_type_id'>;
export type PlanDayTypeRead = Pick<PersonDayTypeRow, 'id' | 'name' | 'created_at'>;

export interface PlanRows {
  settings: PlanSettingsRead | null;
  goals: PlanGoalRead[];
  targets: PlanTargetRead[];
  items: PlanItemRead[];
  steps: StepRead[];
  // Entries whose record is one of the steps (a step's tick), no others.
  ticks: PlanTickRead[];
  corrections: CorrectionRead[];
  picks: PlanPickRead[];
  dayKinds: PlanDayKindRead[];
  dayTypes: PlanDayTypeRead[];
}

// ---------------------------------------------------------------------------
// The person's days
// ---------------------------------------------------------------------------

export type PlanContext =
  | { ok: true; anchors: TimeAnchors; today: LocalDate }
  | { ok: false; anchor: 'time_zone' | 'day_end'; reason: 'not_set' | 'invalid' };

// Today is the person's own day, which needs the time zone and the day end. Nothing else: a week start is asked for only
// by what needs weeks. Never a default.
export function planContext(settings: PlanSettingsRead | null, nowMs: number): PlanContext {
  const anchors = toAnchors(settings);
  const check = canGrade(anchors, 'deadline');
  if (!check.ok) return { ok: false, anchor: check.anchor === 'time_zone' ? 'time_zone' : 'day_end', reason: check.reason };
  return { ok: true, anchors, today: localDay(new Date(nowMs).toISOString(), anchors) };
}

// A week number from a request: a whole number from 0 (the week that holds today) to MAX_WEEKS_AHEAD; anything else is 0.
export function sanitizeOffset(raw: unknown): number {
  const n = typeof raw === 'string' && /^\d{1,3}$/.test(raw) ? Number(raw) : raw;
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_WEEKS_AHEAD ? n : 0;
}

export interface PlanWindow {
  kind: 'week' | 'next_14_days';
  offset: number;
  start: LocalDate;
  end: LocalDate;
  dates: LocalDate[];
  hasPrevious: boolean;
  hasNext: boolean;
}

const datesFrom = (start: LocalDate, count: number): LocalDate[] => Array.from({ length: count }, (_, i) => addDays(start, i));

// The dates the person plans: a week from their own week start, or the next 14 dates from today when they have not set
// one. Never a week on a start day they did not choose.
export function planWindow(today: LocalDate, anchors: TimeAnchors, rawOffset: unknown): PlanWindow {
  if (canGrade(anchors, 'weekly').ok) {
    const offset = sanitizeOffset(rawOffset);
    const start = addDays(weekRange(today, anchors.weekStartsOn as Weekday).start, 7 * offset);
    return { kind: 'week', offset, start, end: addDays(start, 6), dates: datesFrom(start, 7), hasPrevious: offset > 0, hasNext: offset < MAX_WEEKS_AHEAD };
  }
  return { kind: 'next_14_days', offset: 0, start: today, end: addDays(today, ROLLING_DAYS - 1), dates: datesFrom(today, ROLLING_DAYS), hasPrevious: false, hasNext: false };
}

export type DateProblem = 'not_a_date' | 'past' | 'too_far';

// Whether a date can take a change: a real date, today or later, and not further ahead than the plan reaches.
export function dateProblem(date: unknown, today: LocalDate): DateProblem | null {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'not_a_date';
  try {
    assertDate(date);
  } catch {
    return 'not_a_date';
  }
  if (date < today) return 'past';
  if (date > addDays(today, 7 * MAX_WEEKS_AHEAD + 13)) return 'too_far';
  return null;
}

// ---------------------------------------------------------------------------
// The things the person can put on a day
// ---------------------------------------------------------------------------

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byCreated = <T extends { created_at: string; id: string }>(a: T, b: T) => byText(a.created_at, b.created_at) || byText(a.id, b.id);

interface Candidate {
  item: PlanItemRead;
  goalTitle: string;
}

// Habits, and milestones and deadline tasks that are not finished, of the person's active goals. Finished work is not
// planned again. An item is finished when the person marked it so, or when every one of its steps has been ticked.
function candidatesOf(rows: PlanRows, ticked: ReadonlyMap<string, unknown>): Candidate[] {
  const goals = rows.goals.filter((g) => g.state === 'active').sort(byCreated);
  const goalRank = new Map(goals.map((g, i) => [g.id, i]));
  const titleOf = new Map(goals.map((g) => [g.id, g.title]));
  const stepsOf = (itemId: string) => rows.steps.filter((s) => s.work_item_id === itemId);
  const finished = (item: PlanItemRead): boolean => {
    if (item.kind === 'habit') return false;
    if (item.completed_at !== null) return true;
    const own = stepsOf(item.id);
    return own.length > 0 && own.every((s) => ticked.has(s.id));
  };
  return rows.items
    .filter((i) => goalRank.has(i.goal_id) && !finished(i))
    .sort((a, b) => (goalRank.get(a.goal_id) ?? 0) - (goalRank.get(b.goal_id) ?? 0) || a.sort_order - b.sort_order || byCreated(a, b))
    .map((item) => ({ item, goalTitle: titleOf.get(item.goal_id) ?? '' }));
}

// The weekdays a habit with set days named, in the order of the person's week (0 is Sunday). Null for anything else.
function setDaysOf(item: PlanItemRead, targets: PlanTargetRead[], anchors: TimeAnchors): number[] | null {
  if (item.kind !== 'habit') return null;
  const target = targets.find((t) => t.id === item.target_id);
  if (target?.period_kind !== 'day_slots' || target.slot_weekdays === null) return null;
  const start = anchors.weekStartsOn ?? 0;
  return [...new Set(target.slot_weekdays.map(toWeekday))].sort((a, b) => ((a - start + 7) % 7) - ((b - start + 7) % 7));
}

function dueOf(item: PlanItemRead, targets: PlanTargetRead[]): LocalDate | null {
  if (item.due_date !== null) return item.due_date;
  const target = item.target_id === null ? undefined : targets.find((t) => t.id === item.target_id);
  return target?.period_kind === 'deadline' ? target.due_date : null;
}

// Items left over from a past week: not finished, put on a day in a week that has closed, and on no day since. The engine's
// carry-forward decides (a step planned in a closed week and not done is planned in the current one), so this is the same
// rule the weekly review uses; each item stands for the one thing the engine moves. A habit is never put through it: a
// missed session is not owed. Needs the person's week start; without one nothing is said to have moved.
function movedItemIds(candidates: Candidate[], picks: PlanPickRead[], today: LocalDate, anchors: TimeAnchors): Set<string> {
  if (!canGrade(anchors, 'weekly').ok) return new Set();
  const weekStartsOn = anchors.weekStartsOn as Weekday;
  const latest = new Map<string, LocalDate>();
  for (const p of picks) {
    const seen = latest.get(p.work_item_id);
    if (seen === undefined || p.plan_date > seen) latest.set(p.work_item_id, p.plan_date);
  }
  const planned: WorkStep[] = candidates
    .filter((c) => c.item.kind !== 'habit' && latest.has(c.item.id))
    .map((c) => ({
      id: c.item.id,
      itemId: c.item.id,
      plannedPeriodStart: weekRange(latest.get(c.item.id) as LocalDate, weekStartsOn).start,
      completedOn: null,
    }));
  return new Set(carryForwardSteps(planned, today, anchors).moved.map((m) => m.itemId));
}

// ---------------------------------------------------------------------------
// "Same as last week" and "Use the set days"
// ---------------------------------------------------------------------------

// The kinds "Same as last week" would give: for each date in the window from today on that has no kind yet, the kind its
// date a week earlier had. A date that already has a kind keeps it, and a date a week earlier with no kind gives nothing.
export function kindsToCopy(dayKinds: PlanDayKindRead[], dates: LocalDate[], today: LocalDate): { date: LocalDate; dayTypeId: string }[] {
  const kindOf = new Map(dayKinds.map((k) => [k.plan_date, k.day_type_id]));
  return dates.flatMap((date) => {
    const earlier = kindOf.get(addDays(date, -7));
    return date >= today && !kindOf.has(date) && earlier !== undefined ? [{ date, dayTypeId: earlier }] : [];
  });
}

// The dates in the window that fall on a habit's set days, from today on. The habit's own days, which the person named:
// a date is never chosen for them.
export function setDayDates(setDays: number[], dates: LocalDate[], today: LocalDate): LocalDate[] {
  return dates.filter((d) => d >= today && setDays.includes(dayOfWeek(d)));
}

// ---------------------------------------------------------------------------
// The plan screen
// ---------------------------------------------------------------------------

export function buildWeekPlan(rows: PlanRows, nowMs: number, rawOffset: unknown = 0): WeekPlanView {
  const ctx = planContext(rows.settings, nowMs);
  if (!ctx.ok) return { state: 'needs_day_anchors', anchor: ctx.anchor, reason: ctx.reason };
  const { anchors, today } = ctx;
  const window = planWindow(today, anchors, rawOffset);

  const ticked = tickedSteps({ steps: rows.steps, entries: rows.ticks, corrections: rows.corrections }, anchors);
  const candidates = candidatesOf(rows, ticked);
  const moved = movedItemIds(candidates, rows.picks, today, anchors);
  const items: PlanItemView[] = candidates.map(({ item, goalTitle }) => ({
    id: item.id,
    goalId: item.goal_id,
    goalTitle,
    title: item.title,
    kind: item.kind,
    dueOn: dueOf(item, rows.targets),
    setDays: setDaysOf(item, rows.targets, anchors),
    movedFromLastWeek: moved.has(item.id),
  }));

  const listed = new Set(items.map((i) => i.id));
  const kindOf = new Map(rows.dayKinds.map((k) => [k.plan_date, k.day_type_id]));
  const days: PlanDayView[] = window.dates.map((date) => ({
    date,
    isToday: date === today,
    isPast: date < today,
    dayTypeId: kindOf.get(date) ?? null,
    itemIds: items.filter((i) => rows.picks.some((p) => p.plan_date === date && p.work_item_id === i.id && listed.has(i.id))).map((i) => i.id),
  }));

  // The order the person gave their kinds of days in is not stored (BACKLOG.md, MOM-132 for goals and targets), and kinds saved
  // together in setup share one creation time, so ties are broken by name: a predictable order, not a guess at their wish.
  const dayKinds: DayKindOption[] = [...rows.dayTypes]
    .sort((a, b) => byText(a.created_at, b.created_at) || byText(a.name, b.name) || byText(a.id, b.id))
    .map((d) => ({ id: d.id, name: d.name }));
  return {
    state: 'ready',
    today,
    window: window.kind,
    offset: window.offset,
    hasPrevious: window.hasPrevious,
    hasNext: window.hasNext,
    start: window.start,
    end: window.end,
    days,
    items,
    dayKinds,
    copyableKinds: kindsToCopy(rows.dayKinds, window.dates, today).length,
  };
}

// ---------------------------------------------------------------------------
// The "Your plan" card on home
// ---------------------------------------------------------------------------

export function buildHomePlan(rows: PlanRows, nowMs: number): HomePlanView {
  const ctx = planContext(rows.settings, nowMs);
  if (!ctx.ok) return { state: 'none' };
  const { anchors, today } = ctx;

  const ticked = tickedSteps({ steps: rows.steps, entries: rows.ticks, corrections: rows.corrections }, anchors);
  const candidates = candidatesOf(rows, ticked);
  if (candidates.length === 0) return { state: 'none' };

  const card = (c: Candidate): HomePlanItem => ({ id: c.item.id, title: c.item.title, goalTitle: c.goalTitle });
  const todayIds = new Set(rows.picks.filter((p) => p.plan_date === today).map((p) => p.work_item_id));
  const laterIds = new Set(rows.picks.filter((p) => p.plan_date > today).map((p) => p.work_item_id));
  const moved = movedItemIds(candidates, rows.picks, today, anchors);
  return {
    state: 'ready',
    today,
    todayItems: candidates.filter((c) => todayIds.has(c.item.id)).map(card),
    plannedLater: candidates.some((c) => laterIds.has(c.item.id)),
    moved: candidates.filter((c) => moved.has(c.item.id)).map(card),
  };
}
