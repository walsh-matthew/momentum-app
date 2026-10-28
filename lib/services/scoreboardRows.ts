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
// What is not mapped yet, and why (BACKLOG.md, MOM-112):
// - the deadline forecast: it needs the days the person has set aside, which come with the weekly plan, so a milestone
//   shows its steps and due date and no verdict, and the engine is given no forecast request;
// - a step's planned week: no table stores it, so `steps` is empty in the engine call. A step is done when its tick
//   entry exists and is not hidden; that entry belongs to a checklist target, so the engine raises the step's crossing
//   from that target. A step of an item that feeds no target cannot be ticked yet (BACKLOG.md, MOM-110), so it shows as
//   not done;
// - the person's order of goals and targets: not stored, so a tie for the biggest crossing names every tied target.

import {
  biggestCrossings,
  canGrade,
  computeScoreboard,
  entriesPerDay,
  floorsMet,
  localDay,
  specProblem,
} from '@/lib/engine';
import { DEFAULT_CELEBRATION, DEFAULT_TONE } from '@/lib/home/defaults';
import type {
  EntryCorrectionRow,
  EntryRow,
  GoalRow,
  PeriodSnapshotRow,
  PersonSettingsRow,
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
export type GoalRead = Pick<GoalRow, 'id' | 'title' | 'state' | 'shape' | 'start_date' | 'end_date' | 'created_at'>;
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
>;
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

export interface HomeRows {
  settings: SettingsRead | null;
  goals: GoalRead[];
  targets: TargetRead[];
  items: ItemRead[];
  steps: StepRead[];
  entries: EntryRead[];
  corrections: CorrectionRead[];
  snapshots: SnapshotRead[];
}

// ---------------------------------------------------------------------------
// Rows to engine inputs
// ---------------------------------------------------------------------------

// The database counts weekdays 1 to 7 with Monday as 1; the engine counts 0 to 6 with Sunday as 0 (Date.getUTCDay).
const toWeekday = (day: number): Weekday => (day % 7) as Weekday;

// 'HH:MM:SS' to minutes after midnight, or null when not set.
function dayEndMinutes(time: string | null): number | null {
  if (time === null) return null;
  const match = /^(\d{2}):(\d{2})/.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

// Each anchor is the person's own or null. Nothing is filled in.
export function toAnchors(settings: SettingsRead | null): TimeAnchors {
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

// A target counts from its goal's start date: the tables store no start of their own for a target. That is right while
// every target is made at first setup; a target added later must store its own start or it would be graded on weeks it
// did not exist (BACKLOG.md, MOM-112). blockEndsOn is the goal's stored end date, never computed here.
export function toScoreboardTarget(t: TargetRead, goal: GoalRead, stepIds: string[]): ScoreboardTarget {
  return {
    id: t.id,
    startsOn: goal.start_date,
    blockEndsOn: goal.end_date,
    versions: [{ effectiveFrom: goal.start_date, spec: toSpec(t, stepIds) }],
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

  const goals = rows.goals.filter((g) => g.state === 'active' && g.start_date).sort(byCreated);
  if (goals.length === 0) return { state: 'no_goals' };
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
    const target = toScoreboardTarget(t, goalById.get(t.goal_id) as GoalRead, stepIds);
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

  // A step is done when its tick exists and is not hidden, as in the log panel. The step row's own marker is not read.
  const hidden = new Set(rows.corrections.filter((c) => c.action === 'hide').map((c) => correctionKey(c.source_id, c.source_record_id)));
  const allStepIds = new Set(rows.steps.map((s) => s.id));
  const tickedOn = new Map<string, { at: string; day: string }>();
  for (const e of rows.entries) {
    if (!allStepIds.has(e.source_record_id) || hidden.has(correctionKey(e.source_id, e.source_record_id))) continue;
    const seen = tickedOn.get(e.source_record_id);
    if (!seen || e.occurred_at < seen.at) tickedOn.set(e.source_record_id, { at: e.occurred_at, day: localDay(e.occurred_at, anchors) });
  }

  // The engine is given no steps and no forecast request (see the header).
  const scoreboard = computeScoreboard({ today, anchors, targets: engineTargets, entries, snapshots, steps: [], forecasts: [] });
  const crossings: Crossing[] = scoreboard.crossings;

  const targetById = new Map(targets.map((t) => [t.id, t]));
  const stepTitleById = new Map(rows.steps.map((s) => [s.id, s.title]));

  // ---- Milestones: steps done and the due date, no forecast verdict -------------------------------------------
  const milestoneOf = (item: ItemRead): MilestoneView => {
    const steps = stepsOfItem(item.id).map((s) => ({ id: s.id, title: s.title, done: tickedOn.has(s.id) }));
    const feeding = item.target_id === null ? undefined : targetById.get(item.target_id);
    return {
      id: item.id,
      goalId: item.goal_id,
      goalTitle: (goalById.get(item.goal_id) as GoalRead).title,
      title: item.title,
      kind: item.kind as MilestoneView['kind'],
      dueOn: item.due_date ?? (feeding?.period_kind === 'deadline' ? feeding.due_date : null),
      steps,
      stepsDone: steps.filter((s) => s.done).length,
    };
  };
  const milestones = items.map(milestoneOf);
  // A checklist target that a milestone feeds is shown as that milestone, with its steps and due date.
  const shownAsMilestone = new Set(items.flatMap((i) => (i.target_id === null ? [] : [i.target_id])));

  // ---- Target cards --------------------------------------------------------------------------------------------
  const weekStartsOn = anchors.weekStartsOn;
  const cardOf = (t: TargetRead): TargetCardView => {
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
    } as const;
    const wait = waiting.get(t.id);
    if (wait) return { ...base, status: wait };
    const result = scoreboard.results.find((r) => r.targetId === t.id);
    // A target that starts after today has no result yet; it is not shown as graded or as a miss.
    if (!result) return { ...base, status: 'not_started', startsOn: (goalById.get(t.goal_id) as GoalRead).start_date };

    const pattern: PatternView | null = result.graded
      ? (() => {
          const own = scoreboard.patterns.filter((p) => p.targetId === t.id);
          const found = PATTERN_ORDER.map((kind) => own.find((p) => p.kind === kind)).find((p) => p !== undefined);
          return found ? { kind: found.kind, periods: found.periods } : null;
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
      // The person's order of goals and targets is not stored, so none is passed: every tied crossing is returned and
      // named, in title then id order, and none is picked.
      const biggest = biggestCrossings(crossings, { start: week.start, end: week.end });
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
