// Maps the goal model's database rows onto the scoreboard engine's types, runs the engine, and shapes what home shows
// (MOM-112). Pure: rows in, a view out, no database and no clock (the caller passes the time). The reads are in
// lib/services/scoreboard.ts.
//
// Every number on the cards is a fact the engine produced (docs/DOMAIN_MODEL.md §4.2 principle 9). This file only maps
// rows to engine inputs and engine outputs to a view. It never adds, ranks or scores anything itself.
//
// Never assume (principle 1): a time anchor that is not set stays null and is never filled in. A target is sent to the
// engine only after the engine's own checks say it can be graded (canGrade, specProblem); otherwise it is shown as
// waiting for its week start, or as tracked and not counted. A person with only deadline goals is never asked for a
// week start (§2.2 step 10).
//
// The deadline forecast of a deadline task is mapped in lib/services/forecastRows.ts from the days the person set aside; the
// engine is given its request here and its verdict is copied onto the milestone. A milestone has none.
//
// What is not mapped yet, and why (BACKLOG.md, MOM-112):
// - a step's planned week: no table stores it, so `steps` is empty in the engine call. A step is done when its tick
//   entry exists and is not hidden; that entry belongs to a checklist target, so the engine raises the step's crossing
//   from that target. A step of an item that feeds no target cannot be ticked yet (BACKLOG.md, MOM-110), so it shows as
//   not done;
// - the person's order of goals and targets, for a goal or target saved before migration 021 (MOM-132): not stored, so a tie for the
//   biggest crossing that involves one names every tied target. Newer rows carry it (setupOrder below).

import {
  biggestCrossings,
  canGrade,
  computeScoreboard,
  entriesPerDay,
  floorsMet,
  localDay,
  specProblem,
  targetInForce,
  versionsWithChanges,
  type TargetChange,
} from '@/lib/engine';
import { DEFAULT_CELEBRATION, DEFAULT_TONE } from '@/lib/home/defaults';
import { forecastViews, planForecasts, type ForecastRows } from './forecastRows';
import type {
  EntryCorrectionRow,
  EntryRow,
  GoalRow,
  PeriodSnapshotRow,
  PersonSettingsRow,
  TargetChangeRow,
  TargetRow,
  WorkItemRow,
  WorkItemStepRow,
} from '@/types/database.types';
import type {
  GoalCardView,
  HeroHeadline,
  HomeHero,
  HomeScoreboard,
  MilestoneView,
  PatternView,
  SlotsView,
  TargetCardView,
} from '@/types/home';
import type {
  Crossing,
  PeriodSnapshot,
  ScoreboardEntry,
  ScoreboardTarget,
  TargetPeriod,
  TargetSpec,
  TimeAnchors,
  Weekday,
} from '@/types/scoreboard';

// The columns the service reads, no more.
export type SettingsRead = Pick<PersonSettingsRow, 'time_zone' | 'week_start' | 'day_end' | 'tone' | 'celebrations'>;
// sort_order (migration 021) is optional on purpose: a row read without it is a row whose place is not stored, never a place of 0.
export type GoalRead = Pick<GoalRow, 'id' | 'title' | 'state' | 'shape' | 'start_date' | 'end_date' | 'created_at'> & { sort_order?: GoalRow['sort_order'] };
// Only a parked goal may lack a shape or a start (migration 014), so an active goal on home always has both.
export type ActiveGoalRead = GoalRead & { shape: NonNullable<GoalRead['shape']>; start_date: string };
const isActiveGoal = (g: GoalRead): g is ActiveGoalRead => g.state === 'active' && g.shape !== null && g.start_date !== null;
export type TargetRead = Pick<
  TargetRow,
  | 'id'
  | 'goal_id'
  | 'title'
  | 'measure'
  | 'unit'
  | 'role'
  | 'period_kind'
  | 'due_date'
  | 'slot_weekdays'
  | 'floor'
  | 'aspiration'
  | 'qualifying_threshold'
  | 'carry_over_kind'
  | 'created_at'
> & {
  // Migration 021 (MOM-132). Optional on purpose: a row read without start_date counts from its goal (never from "today"), and one
  // read without sort_order has no stored place.
  start_date?: TargetRow['start_date'];
  sort_order?: TargetRow['sort_order'];
};
export type ItemRead = Pick<WorkItemRow, 'id' | 'goal_id' | 'target_id' | 'kind' | 'title' | 'due_date' | 'sort_order' | 'created_at'>;
export type StepRead = Pick<WorkItemStepRow, 'id' | 'work_item_id' | 'title' | 'sort_order'>;
export type EntryRead = Pick<EntryRow, 'id' | 'target_id' | 'source_id' | 'source_record_id' | 'occurred_at' | 'value' | 'evidence'>;
export type CorrectionRead = Pick<EntryCorrectionRow, 'source_id' | 'source_record_id' | 'action'>;
export type SnapshotRead = Pick<
  PeriodSnapshotRow,
  | 'target_id'
  | 'period_start'
  | 'period_end'
  | 'measure'
  | 'unit'
  | 'role'
  | 'period_kind'
  | 'slot_weekdays'
  | 'floor'
  | 'aspiration'
  | 'qualifying_threshold'
  | 'carry_over_kind'
>;

// A change the person saved to a target's levels (migration 020, MOM-146).
export type TargetChangeRead = Pick<TargetChangeRow, 'id' | 'target_id' | 'effective_from' | 'floor' | 'aspiration' | 'slot_weekdays' | 'created_at'>;

export interface HomeRows {
  settings: SettingsRead | null;
  goals: GoalRead[];
  targets: TargetRead[];
  items: ItemRead[];
  steps: StepRead[];
  entries: EntryRead[];
  corrections: CorrectionRead[];
  snapshots: SnapshotRead[];
  // Changes to a target's levels from a later period, newest save wins per target and day (lib/engine/baseline.ts).
  changes: TargetChangeRead[];
  // The first day of each week whose weekly review is finished (the latest few), so home does not point at a review that is done.
  reviewedWeeks: string[];
  // The week plan and the deadline tasks' own columns, for the forecast.
  forecast: ForecastRows;
}

// ---------------------------------------------------------------------------
// Rows to engine inputs
// ---------------------------------------------------------------------------

// The database counts weekdays 1 to 7 with Monday as 1; the engine counts 0 to 6 with Sunday as 0 (Date.getUTCDay).
export const toWeekday = (day: number): Weekday => (day % 7) as Weekday;

// 'HH:MM:SS' to minutes after midnight, or null when not set.
function dayEndMinutes(time: string | null): number | null {
  if (time === null) return null;
  const match = /^(\d{2}):(\d{2})/.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

// Each anchor is the person's own or null. Nothing is filled in. Takes only the three day-anchor columns, so a
// caller that reads a different slice of person_settings (lib/services/review.ts) can reuse it too.
export function toAnchors(settings: Pick<SettingsRead, 'time_zone' | 'week_start' | 'day_end'> | null): TimeAnchors {
  const zone = settings?.time_zone ?? null;
  return {
    timeZone: zone === null || zone.trim() === '' ? null : zone,
    dayEndMinutes: dayEndMinutes(settings?.day_end ?? null),
    weekStartsOn: settings?.week_start == null ? null : toWeekday(settings.week_start),
  };
}

function toPeriod(kind: TargetRead['period_kind'], slotWeekdays: number[] | null, due: string | null): TargetPeriod {
  if (kind === 'weekly') return { kind: 'weekly' };
  if (kind === 'day_slots') return { kind: 'day_slots', days: (slotWeekdays ?? []).map(toWeekday) };
  return { kind: 'deadline', due: due ?? '' };
}

export function toSpec(t: TargetRead, stepIds: string[]): TargetSpec {
  return {
    measure: t.measure,
    unit: t.unit,
    role: t.role,
    period: toPeriod(t.period_kind, t.slot_weekdays, t.due_date),
    levels: t.floor === null ? null : { floor: Number(t.floor), aspiration: t.aspiration === null ? null : Number(t.aspiration) },
    qualifyingThreshold: t.qualifying_threshold === null ? null : Number(t.qualifying_threshold),
    carryOver: t.carry_over_kind,
    stepIds: t.measure === 'checklist' ? stepIds : null,
  };
}

// The day a target starts counting (docs/DOMAIN_MODEL.md §1.3 "Start"): its OWN start when it has one (a target added to a goal that
// had already started stores the date the person gave, migration 021), else its goal's start (every target made with its goal, and
// every target saved before 021). Every place that needs "when did this target start" reads it here, so a target added later is never
// graded, noticed or changed on weeks before it existed (RAID R-30).
export function targetStart(t: Pick<TargetRead, 'start_date'>, goal: Pick<ActiveGoalRead, 'start_date'>): string {
  return t.start_date ?? goal.start_date;
}

// blockEndsOn is the goal's stored end date, never computed here.
export function toScoreboardTarget(t: TargetRead, goal: ActiveGoalRead, stepIds: string[], changes: readonly TargetChangeRead[] = []): ScoreboardTarget {
  const startsOn = targetStart(t, goal);
  return {
    id: t.id,
    startsOn,
    blockEndsOn: goal.end_date,
    versions: versionsWithChanges(startsOn, toSpec(t, stepIds), toEngineChanges(changes, t.id)),
  };
}

// The person's order as the ranking of the week's biggest crossing reads it (lib/engine/week.ts): target and item ids, the first goal's
// first target first. Only what was stored is listed: a goal with no stored place (saved before migration 021), or a target with no
// place, is left out, and the engine then names every tied target instead of picking one (an unknown order is never guessed). A goal's
// targets come first, then its items that feed no target (their step crossings are ranked by the item).
export function setupOrder(goals: readonly GoalRead[], targets: readonly TargetRead[], items: readonly ItemRead[]): string[] {
  const placed = <T extends { id: string; sort_order?: number | null }>(rows: readonly T[]) =>
    rows
      .filter((r): r is T & { sort_order: number } => typeof r.sort_order === 'number')
      .sort((a, b) => a.sort_order - b.sort_order || byText(a.id, b.id));
  return placed(goals).flatMap((g) => [
    ...placed(targets.filter((t) => t.goal_id === g.id)).map((t) => t.id),
    ...placed(items.filter((i) => i.goal_id === g.id && i.target_id === null)).map((i) => i.id),
  ]);
}

// The saved changes of one target, as the engine reads them. The database counts weekdays 1 to 7 from Monday; the engine 0 to 6 from Sunday.
export function toEngineChanges(rows: readonly TargetChangeRead[], targetId: string): TargetChange[] {
  return rows
    .filter((c) => c.target_id === targetId)
    .map((c) => ({
      id: c.id,
      effectiveFrom: c.effective_from,
      levels: { floor: Number(c.floor), aspiration: c.aspiration === null ? null : Number(c.aspiration) },
      days: c.slot_weekdays === null ? null : [...new Set(c.slot_weekdays.map(toWeekday))],
      createdAt: c.created_at,
    }));
}

// The target's row with the levels (and a day-slots target's days) of one version of it, for the screens that show a row.
export function rowInForce<T extends Pick<TargetRead, 'floor' | 'aspiration' | 'slot_weekdays'>>(row: T, spec: TargetSpec): T {
  return {
    ...row,
    floor: spec.levels === null ? null : spec.levels.floor,
    aspiration: spec.levels === null ? null : spec.levels.aspiration,
    slot_weekdays: spec.period.kind === 'day_slots' ? spec.period.days.map((d) => (d === 0 ? 7 : d)) : row.slot_weekdays,
  };
}

// The target a closed period was judged by, from its stored snapshot. A snapshot holds no step list, so a checklist
// takes the target's current steps.
export function toSnapshot(s: SnapshotRead, stepIds: string[]): PeriodSnapshot {
  return {
    targetId: s.target_id,
    periodStart: s.period_start,
    spec: {
      measure: s.measure,
      unit: s.unit,
      role: s.role,
      period: toPeriod(s.period_kind, s.slot_weekdays, s.period_end),
      levels: s.floor === null ? null : { floor: Number(s.floor), aspiration: s.aspiration === null ? null : Number(s.aspiration) },
      qualifyingThreshold: s.qualifying_threshold === null ? null : Number(s.qualifying_threshold),
      carryOver: s.carry_over_kind,
      stepIds: s.measure === 'checklist' ? stepIds : null,
    },
  };
}

const correctionKey = (sourceId: string, recordId: string) => `${sourceId}\u0000${recordId}`;

// What a qualifying threshold is compared with: a synced workout's duration, when the source said it (the Hevy path
// stores it as evidence.durationMinutes). Null when there is none; the engine then falls back to the value.
function sizeOf(entry: EntryRead): number | null {
  const minutes = entry.evidence?.durationMinutes;
  return typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

// An entry after the person's corrections (§1.6): a hide removes it, count anyway lifts a threshold. A correction is
// keyed to the source's own record id, so it applies to every target that source wrote an entry for.
// An entry's quantity is stored in `value` (a number for a quantity, minutes for time, 1 for a tap or a tick) and is
// mapped as is.
export function toScoreboardEntries(
  entries: EntryRead[],
  corrections: CorrectionRead[],
  measureOf: ReadonlyMap<string, TargetRead['measure']>,
): ScoreboardEntry[] {
  const actions = new Map(corrections.map((c) => [correctionKey(c.source_id, c.source_record_id), c.action]));
  return entries.flatMap((e) => {
    const measure = measureOf.get(e.target_id);
    if (measure === undefined) return [];
    const action = actions.get(correctionKey(e.source_id, e.source_record_id));
    return [
      {
        id: e.id,
        targetId: e.target_id,
        occurredAt: e.occurred_at,
        value: Number(e.value),
        size: sizeOf(e),
        // A checklist tick's record id is the step's id (migration 013).
        stepId: measure === 'checklist' ? e.source_record_id : null,
        removed: action === 'hide',
        countAnyway: action === 'count_anyway',
      },
    ];
  });
}

// A step is done when its tick exists and is not hidden, as in the log panel. The step row's own marker is not read. Each
// done step is mapped to its first tick: the instant, and the person's own day it falls on. Shared with the week plan
// (lib/plan/weekPlan.ts), so both say "done" the same way. Needs the time zone and day end in `anchors`.
export function tickedSteps(
  rows: { steps: Pick<StepRead, 'id'>[]; entries: Pick<EntryRead, 'source_id' | 'source_record_id' | 'occurred_at'>[]; corrections: CorrectionRead[] },
  anchors: TimeAnchors,
): Map<string, { at: string; day: string }> {
  const hidden = new Set(rows.corrections.filter((c) => c.action === 'hide').map((c) => correctionKey(c.source_id, c.source_record_id)));
  const allStepIds = new Set(rows.steps.map((s) => s.id));
  const tickedOn = new Map<string, { at: string; day: string }>();
  for (const e of rows.entries) {
    if (!allStepIds.has(e.source_record_id) || hidden.has(correctionKey(e.source_id, e.source_record_id))) continue;
    const seen = tickedOn.get(e.source_record_id);
    if (!seen || e.occurred_at < seen.at) tickedOn.set(e.source_record_id, { at: e.occurred_at, day: localDay(e.occurred_at, anchors) });
  }
  return tickedOn;
}

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

const byCreated = <T extends { created_at: string; id: string }>(a: T, b: T) =>
  a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// Slipping outranks the positive patterns for display; an aspiration repeated is the stronger of the two good ones.
const PATTERN_ORDER = ['slipping', 'aspiration_repeated', 'holding'] as const;

export function buildHomeScoreboard(rows: HomeRows, nowMs: number): HomeScoreboard {
  const anchors = toAnchors(rows.settings);

  const goals = rows.goals.filter(isActiveGoal).sort(byCreated);
  if (goals.length === 0) return { state: 'no_goals', setupSaved: rows.goals.length > 0 };
  const goalById = new Map(goals.map((g) => [g.id, g]));

  // Today is the person's own day, which needs the time zone and the day end. A deadline period never asks for a week
  // start, so this check names only those two.
  const dayCheck = canGrade(anchors, 'deadline');
  if (!dayCheck.ok) {
    return { state: 'needs_day_anchors', anchor: dayCheck.anchor === 'time_zone' ? 'time_zone' : 'day_end', reason: dayCheck.reason };
  }
  const today = localDay(new Date(nowMs).toISOString(), anchors);

  const targets = rows.targets.filter((t) => goalById.has(t.goal_id)).sort(byCreated);
  const items = rows.items
    .filter((i) => goalById.has(i.goal_id) && i.kind !== 'habit')
    .sort((a, b) => a.sort_order - b.sort_order || byCreated(a, b));
  const stepsOfItem = (itemId: string) =>
    rows.steps.filter((s) => s.work_item_id === itemId).sort((a, b) => a.sort_order - b.sort_order || byText(a.id, b.id));
  const stepIdsOfTarget = (targetId: string) =>
    rows.items.filter((i) => i.target_id === targetId).flatMap((i) => stepsOfItem(i.id).map((s) => s.id));

  // Which targets the engine can grade, and why the others wait.
  type Waiting = 'needs_week_start' | 'not_counted';
  const waiting = new Map<string, Waiting>();
  const engineTargets: ScoreboardTarget[] = [];
  const stepIdsByTarget = new Map<string, string[]>();
  for (const t of targets) {
    const stepIds = stepIdsOfTarget(t.id);
    stepIdsByTarget.set(t.id, stepIds);
    const target = toScoreboardTarget(t, goalById.get(t.goal_id) as ActiveGoalRead, stepIds, rows.changes);
    const spec = target.versions[0].spec;
    const grade = canGrade(anchors, spec.period.kind);
    if (!grade.ok) waiting.set(t.id, 'needs_week_start');
    else if (specProblem(spec) !== null) waiting.set(t.id, 'not_counted');
    else engineTargets.push(target);
  }
  const engineIds = new Set(engineTargets.map((t) => t.id));

  const measureOf = new Map(targets.filter((t) => engineIds.has(t.id)).map((t) => [t.id, t.measure]));
  const entries = toScoreboardEntries(rows.entries, rows.corrections, measureOf);
  const snapshots = rows.snapshots.filter((s) => engineIds.has(s.target_id)).map((s) => toSnapshot(s, stepIdsByTarget.get(s.target_id) ?? []));

  const tickedOn = tickedSteps(rows, anchors);

  // Time logged against a target that counts time, in minutes, with the person's hides applied. It is the size of work done
  // so far for a deadline task whose target counts time; any other target logs none. A step's tick is a tick, not minutes.
  const timeTargets = new Map(targets.filter((t) => t.measure === 'time').map((t) => [t.id, t.measure]));
  const stepIdSet = new Set(rows.steps.map((s) => s.id));
  const loggedMinutes = new Map<string, number>();
  const timeEntries = rows.entries.filter((e) => !stepIdSet.has(e.source_record_id));
  for (const e of toScoreboardEntries(timeEntries, rows.corrections, timeTargets)) {
    if (!e.removed) loggedMinutes.set(e.targetId, (loggedMinutes.get(e.targetId) ?? 0) + e.value);
  }
  // Every item of an active goal, habits too: a habit on a day shares that day's time with a deadline task.
  const things = rows.items
    .filter((i) => goalById.has(i.goal_id))
    .map((i) => {
      const own = stepsOfItem(i.id);
      return { id: i.id, kind: i.kind, dueOn: i.due_date, targetId: i.target_id, stepCount: own.length, stepsDone: own.filter((s) => tickedOn.has(s.id)).length };
    });
  const planned = planForecasts({ today, rows: rows.forecast, things, loggedMinutes });

  // The engine is given no steps (see the header) and a forecast request for each unfinished deadline task.
  const scoreboard = computeScoreboard({ today, anchors, targets: engineTargets, entries, snapshots, steps: [], forecasts: planned.requests });
  const forecasts = forecastViews(planned, scoreboard.forecasts);
  const crossings: Crossing[] = scoreboard.crossings;

  const targetById = new Map(targets.map((t) => [t.id, t]));
  const stepTitleById = new Map(rows.steps.map((s) => [s.id, s.title]));

  // ---- Milestones: steps done and the due date, and a deadline task's forecast ---------------------------------
  const canMoveById = new Map(rows.forecast.items.map((i) => [i.id, i.date_can_move === true]));
  const milestoneOf = (item: ItemRead): MilestoneView => {
    const steps = stepsOfItem(item.id).map((s) => ({ id: s.id, title: s.title, done: tickedOn.has(s.id) }));
    const feeding = item.target_id === null ? undefined : targetById.get(item.target_id);
    return {
      id: item.id,
      goalId: item.goal_id,
      goalTitle: (goalById.get(item.goal_id) as ActiveGoalRead).title,
      title: item.title,
      kind: item.kind as MilestoneView['kind'],
      dueOn: item.due_date ?? (feeding?.period_kind === 'deadline' ? feeding.due_date : null),
      steps,
      stepsDone: steps.filter((s) => s.done).length,
      dateCanMove: item.kind === 'deadline_task' && canMoveById.get(item.id) === true,
      forecast: forecasts.get(item.id) ?? null,
    };
  };
  const milestones = items.map(milestoneOf);
  // A checklist target that a milestone feeds is shown as that milestone, with its steps and due date.
  const shownAsMilestone = new Set(items.flatMap((i) => (i.target_id === null ? [] : [i.target_id])));

  // ---- Target cards --------------------------------------------------------------------------------------------
  const weekStartsOn = anchors.weekStartsOn;
  const engineById = new Map(engineTargets.map((e) => [e.id, e]));
  const cardOf = (source: TargetRead): TargetCardView => {
    // The levels and days in force for the period the card is about, and a change that has not taken effect yet.
    const engineTarget = engineById.get(source.id);
    const current = scoreboard.results.find((r) => r.targetId === source.id);
    const t = engineTarget && current ? rowInForce(source, targetInForce(engineTarget, current.periodStart)) : source;
    const coming = engineTarget?.versions.slice(1).filter((v) => v.effectiveFrom > today).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1)).pop();
    const change = coming?.spec.levels ? { from: coming.effectiveFrom, floor: coming.spec.levels.floor, aspiration: coming.spec.levels.aspiration } : null;
    const base = {
      id: t.id,
      title: t.title,
      measure: t.measure,
      unit: t.unit,
      role: t.role,
      period: t.period_kind,
      dueOn: t.due_date,
      floor: t.floor === null ? null : Number(t.floor),
      aspiration: t.aspiration === null ? null : Number(t.aspiration),
      change,
    } as const;
    const wait = waiting.get(t.id);
    if (wait) return { ...base, status: wait };
    const result = scoreboard.results.find((r) => r.targetId === t.id);
    // A target that starts after today has no result yet; it is not shown as graded or as a miss.
    if (!result) return { ...base, status: 'not_started', startsOn: targetStart(source, goalById.get(t.goal_id) as ActiveGoalRead) };

    const pattern: PatternView | null = result.graded
      ? (() => {
          const own = scoreboard.patterns.filter((p) => p.targetId === t.id);
          const found = PATTERN_ORDER.map((kind) => own.find((p) => p.kind === kind)).find((p) => p !== undefined);
          return found ? { kind: found.kind, periods: found.periods, reviewed: rows.reviewedWeeks.includes(found.endingPeriodStart) } : null;
        })()
      : null;
    const trend = scoreboard.trends.find((x) => x.targetId === t.id);
    const slots: SlotsView | null = result.slots
      ? {
          filled: result.slots.filled,
          total: result.slots.total,
          weekdays: [...new Set((t.slot_weekdays ?? []).map(toWeekday))].sort(
            (a, b) => (a - (weekStartsOn ?? 0) + 7) % 7 - ((b - (weekStartsOn ?? 0) + 7) % 7),
          ),
        }
      : null;
    return {
      ...base,
      status: 'counted',
      counted: result.counted,
      graded: result.graded,
      startedPartway: result.startedPartway,
      level: result.level,
      remainingToFloor: result.remainingToFloor,
      remainingToAspiration: result.remainingToAspiration,
      owed: result.owed,
      belowThreshold: result.belowThreshold.length,
      slots,
      pattern,
      trend: trend ? { counts: trend.counts, direction: trend.direction } : null,
    };
  };

  const goalCards: GoalCardView[] = goals.map((g) => ({
    id: g.id,
    title: g.title,
    shape: g.shape,
    targets: targets.filter((t) => t.goal_id === g.id && !(t.measure === 'checklist' && shownAsMilestone.has(t.id))).map(cardOf),
    milestones: milestones.filter((m) => m.goalId === g.id),
  }));

  // ---- The hero ------------------------------------------------------------------------------------------------
  const hasWeekly = targets.some((t) => t.period_kind !== 'deadline');
  let hero: HomeHero | null = null;
  if (hasWeekly) {
    // The only place the person is asked for a week start: they have a weekly or day-slot target.
    if (!canGrade(anchors, 'weekly').ok) {
      hero = { kind: 'needs_week_start' };
    } else {
      const tally = floorsMet(scoreboard, engineTargets);
      const week = entriesPerDay({ today, anchors, targets: engineTargets, entries });
      // The person's order from setup breaks a tie only where it was stored for every tied target (migration 021); otherwise every
      // tied crossing is returned and named, in title then id order, and none is picked.
      const biggest = biggestCrossings(crossings, { start: week.start, end: week.end }, setupOrder(goals, targets, rows.items));
      const named = biggest
        .map((c) => {
          const id = c.kind === 'step' ? c.stepId : c.targetId;
          const title = c.kind === 'step' ? (stepTitleById.get(c.stepId) ?? '') : (targetById.get(c.targetId)?.title ?? '');
          return { id, title };
        })
        .sort((a, b) => byText(a.title, b.title) || byText(a.id, b.id));
      const headline: HeroHeadline | null = biggest.length === 0 ? null : { kind: biggest[0].kind, titles: named.map((n) => n.title) };
      hero = {
        kind: 'week',
        start: week.start,
        end: week.end,
        floorsMet: tally.met.length,
        floorsInPlay: tally.inPlay.length,
        headline,
        days: week.days.map((d) => ({ day: d.day, count: d.count, isToday: d.day === today, isFuture: d.day > today })),
        empty: week.days.every((d) => d.count === 0),
      };
    }
  } else if (milestones.length > 0) {
    const dated = (m: MilestoneView) => m.dueOn ?? '9999-12-31';
    hero = { kind: 'deadlines', items: [...milestones].sort((a, b) => byText(dated(a), dated(b)) || byText(a.title, b.title) || byText(a.id, b.id)) };
  }

  return {
    state: 'ready',
    today,
    hero,
    goals: goalCards,
    tone: rows.settings?.tone ?? DEFAULT_TONE,
    celebration: rows.settings?.celebrations ?? DEFAULT_CELEBRATION,
  };
}
