// One target's result for one period (docs/DOMAIN_MODEL.md §1.3 targets, partial credit and carry-over; §1.7
// computed from entries and the target in force). The result is computed every time and never stored.

import type {
  LocalDate,
  PeriodSnapshot,
  ScoreboardEntry,
  ScoreboardTarget,
  TargetResult,
  TargetSpec,
  TimeAnchors,
  Weekday,
} from '@/types/scoreboard';
import { judgingSpec, targetInForce } from './baseline';
import { measureTotal, selectEntries, type CountedEntry, type Tally } from './entries';
import { addDays, assertAnchors, assertDate, weekRange } from './time';

export interface PeriodEvaluation {
  result: TargetResult;
  spec: TargetSpec;
  counted: CountedEntry[];
  tally: Tally;
}

// Why a spec contradicts the domain model, or null when the rest of the engine can rely on it. A caller asks this
// before it grades, for the cases the database does not stop (a habit with a deadline period, a checklist with no
// steps yet), so a target set up wrongly is shown as not counted and never takes the page down.
export function specProblem(spec: TargetSpec): string | null {
  const { levels, period } = spec;
  if (spec.role === 'effort' && levels === null) return 'An effort target needs a floor.';
  if (levels !== null) {
    if (!(levels.floor > 0)) return 'A floor must be more than 0.';
    if (levels.aspiration !== null && levels.aspiration < levels.floor) return 'An aspiration cannot be below the floor.';
  }
  if (spec.qualifyingThreshold !== null && !(spec.qualifyingThreshold >= 0)) return 'A qualifying threshold cannot be negative.';
  if (spec.carryOver === 'cumulative' && period.kind !== 'deadline') {
    return 'A cumulative target is owed until a deadline, so it needs a deadline period.';
  }
  if (spec.carryOver === 'habit' && period.kind === 'deadline') return 'A habit repeats in periods; a deadline period is cumulative.';
  if (spec.measure === 'checklist' && (spec.stepIds === null || spec.stepIds.length === 0)) return 'A checklist target needs its steps.';
  if (period.kind === 'day_slots' && period.days.length === 0) return 'Day slots need at least one day.';
  return null;
}

// A spec the rest of the engine can rely on. Throws on one that contradicts the domain model.
export function assertSpec(spec: TargetSpec): void {
  const problem = specProblem(spec);
  if (problem !== null) throw new Error(problem);
}

// The days of a period, both ends inclusive. A repeating period is one of the person's weeks; a deadline
// period runs from the day the target starts to its due date.
export function periodRange(
  spec: TargetSpec,
  periodStart: LocalDate,
  startsOn: LocalDate,
  anchors: TimeAnchors,
): { start: LocalDate; end: LocalDate } {
  if (spec.period.kind === 'deadline') {
    assertDate(spec.period.due);
    return { start: startsOn, end: spec.period.due };
  }
  const week = weekRange(periodStart, anchors.weekStartsOn as Weekday);
  if (week.start !== periodStart) {
    throw new Error(`${periodStart} is not the first day of one of the person's weeks.`);
  }
  return { start: week.start, end: week.end };
}

export interface EvaluateInput {
  target: ScoreboardTarget;
  // The first day of the period: the start of a week, or for a deadline target the day it starts.
  periodStart: LocalDate;
  today: LocalDate;
  anchors: TimeAnchors;
  entries: ScoreboardEntry[];
  snapshots: PeriodSnapshot[];
}

export function evaluatePeriod(input: EvaluateInput): PeriodEvaluation {
  const { target, periodStart, today, anchors } = input;
  assertDate(today);
  assertDate(target.startsOn);

  // Whether the period is closed decides which target judges it, so find the range with the version in force.
  const inForce = targetInForce(target, periodStart);
  assertAnchors(anchors, inForce.period.kind);
  const closed = today > periodRange(inForce, periodStart, target.startsOn, anchors).end;
  const { spec, judgedBy } = judgingSpec(target, periodStart, closed, input.snapshots);
  assertSpec(spec);
  assertAnchors(anchors, spec.period.kind);

  const range = periodRange(spec, periodStart, target.startsOn, anchors);
  const from = range.start > target.startsOn ? range.start : target.startsOn;
  const selection = selectEntries(
    spec,
    input.entries.filter((e) => e.targetId === target.id),
    { from, to: range.end },
    anchors,
  );
  const tally = measureTotal(spec, selection.counted);

  const levels = spec.levels;
  const counted = tally.total;
  const startedPartway = spec.period.kind !== 'deadline' && range.start < target.startsOn;
  const remainingToFloor = levels ? Math.max(0, levels.floor - counted) : null;
  const remainingToAspiration = levels && levels.aspiration !== null ? Math.max(0, levels.aspiration - counted) : null;

  let level: TargetResult['level'] = null;
  if (levels) {
    if (levels.aspiration !== null && counted >= levels.aspiration) level = 'aspiration';
    else if (counted >= levels.floor) level = 'floor';
    else level = counted > 0 ? 'partway' : 'none';
  }

  const result: TargetResult = {
    targetId: target.id,
    periodStart: range.start,
    periodEnd: range.end,
    status: closed ? 'closed' : 'open',
    judgedBy,
    startedPartway,
    graded: levels !== null && !startedPartway,
    measure: spec.measure,
    unit: spec.unit,
    counted,
    belowThreshold: selection.belowThreshold,
    floor: levels ? levels.floor : null,
    aspiration: levels ? levels.aspiration : null,
    fractionOfFloor: levels ? counted / levels.floor : null,
    remainingToFloor,
    remainingToAspiration,
    level,
    // A habit never carries a shortfall forward; a cumulative target owes it until its deadline (§1.3, §1.4).
    owed: spec.carryOver === 'cumulative' && !closed && remainingToFloor !== null ? remainingToFloor : 0,
    slots:
      spec.period.kind === 'day_slots'
        ? { filled: counted, total: new Set(spec.period.days).size, extraEntries: tally.extraEntries }
        : null,
  };
  return { result, spec, counted: selection.counted, tally };
}

export const evaluateTarget = (input: EvaluateInput): TargetResult => evaluatePeriod(input).result;

// The first day of each period a target has had up to today: every week from the one holding its start, or the
// one deadline period.
export function periodStarts(spec: TargetSpec, startsOn: LocalDate, today: LocalDate, anchors: TimeAnchors): LocalDate[] {
  if (spec.period.kind === 'deadline') return [startsOn];
  const weekStart = anchors.weekStartsOn as Weekday;
  const starts: LocalDate[] = [];
  const last = weekRange(today, weekStart).start;
  for (let s = weekRange(startsOn, weekStart).start; s <= last; s = addDays(s, 7)) starts.push(s);
  return starts;
}
