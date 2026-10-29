// The layered weekly review's engine-side facts (docs/DOMAIN_MODEL.md §3, design §6.2, MOM-113 block 1). Pure
// functions, no database, no model, no network, no clock: "today" and the person's anchors are inputs, same
// discipline as the rest of lib/engine/. Claude never scores (principle 9): this file only picks facts and the one
// adjustment to raise; the words around them are written later, around these facts.

import type {
  Layer1TargetFact,
  LayerThreeAdjustment,
  LocalDate,
  Pattern,
  RecapComparison,
  ReviewedValue,
  ReviewWindow,
  Scoreboard,
  Weekday,
} from '@/types/scoreboard';
import { addDays, dayOfWeek, weekRange } from './time';

// The week the review covers. The planning moment is the person's own weekday (never a fixed one), and it can land
// on a week's own last day (Sunday evening with a Monday week start reviews the week ending that same day) or any
// other day (reviewing the week that ended before the one holding today began). Both are the same weekly cycle
// looked at from a different offset, so one formula covers both; the cases are told apart by how far the planning
// weekday sits from the week's own last day, not by calling one of them "the previous week".
//
// Returns null when the week start or the planning weekday has not been chosen yet (principle 1: never assume), or
// when today is not the planning day: nothing is guessed at either edge.
export function weeklyReviewWindow(today: LocalDate, weekStartsOn: Weekday | null, planningWeekday: Weekday | null): ReviewWindow | null {
  if (weekStartsOn === null || planningWeekday === null) return null;
  if (dayOfWeek(today) !== planningWeekday) return null;
  // The weekday that ends a week starting on weekStartsOn: the day before it, cyclically.
  const lastDayOfWeek = ((weekStartsOn + 6) % 7) as Weekday;
  // Days from a week's own last day to the planning day that reviews it: 0 when planning falls on the week's own
  // last day, otherwise how far into the next week the planning day sits.
  const offset = (planningWeekday - lastDayOfWeek + 7) % 7;
  return weekRange(addDays(today, -offset), weekStartsOn);
}

// True when the reviewed week's own last day is today or later: the planning day is the week's last day (case A above),
// so the week is complete as the person plans but the engine, which closes a period the day after its last day, still
// calls it open (BACKLOG, RAID I-11).
export const closesEarly = (today: LocalDate, window: ReviewWindow): boolean => window.end >= today;

// The day the review asks the engine about. Normally today. When the week closes early it is the day after the week
// ends, which is exactly what the engine would be asked the next morning: the week is closed and a pattern ending in it
// is found in the same sitting instead of a week late. An entry logged later on that last day is the "later entry" case
// (compareRecapToLive), so the recap says it counts through that day. The engine's own rule is not changed: home keeps it.
export const reviewAsOf = (today: LocalDate, window: ReviewWindow): LocalDate => (closesEarly(today, window) ? addDays(window.end, 1) : today);

// A later entry can land in a week that already has a stored recap (up to 7 local days back, MOM-110). The record is
// never rewritten; this says which targets read differently now, from the engine's own facts for the same week. A target
// compared is one the recap named that still has a closed period in that week; one that does not (it was removed, or the
// person's week start moved) is left out: there is nothing to compare, and nothing is guessed. A target that reads the
// same is left out too.
export function compareRecapToLive(said: Array<{ targetId: string } & ReviewedValue>, live: Layer1TargetFact[]): RecapComparison[] {
  const liveByTarget = new Map(live.map((f) => [f.targetId, f.result]));
  const changes: RecapComparison[] = [];
  for (const before of said) {
    const result = liveByTarget.get(before.targetId);
    if (result === undefined) continue;
    const now: ReviewedValue = { counted: result.counted, level: result.level, graded: result.graded };
    if (now.counted === before.counted && now.level === before.level && now.graded === before.graded) continue;
    changes.push({ targetId: before.targetId, said: { counted: before.counted, level: before.level, graded: before.graded }, now });
  }
  return changes.sort((a, b) => (a.targetId < b.targetId ? -1 : a.targetId > b.targetId ? 1 : 0));
}

// Layer 1 (§3.1): per target, the period that closed in the reviewed week, what crossed in it, its pattern streaks
// as of then (both directions), and an outcome target's trend. A target whose period did not close that week (for
// example a deadline target mid-way through a longer one) has nothing to show and is left out; it is not a miss.
export function buildLayer1Facts(
  scoreboard: Pick<Scoreboard, 'results' | 'history' | 'crossings' | 'patterns' | 'trends'>,
  window: ReviewWindow,
): Layer1TargetFact[] {
  const closedThisWeek = [...scoreboard.history, ...scoreboard.results].filter((r) => r.periodStart === window.start);
  const trendByTarget = new Map(scoreboard.trends.map((t) => [t.targetId, t]));
  const facts = closedThisWeek.map((result) => ({
    targetId: result.targetId,
    result,
    crossings: scoreboard.crossings.filter((c) => c.targetId === result.targetId && c.on >= window.start && c.on <= window.end),
    patterns: scoreboard.patterns.filter((p) => p.targetId === result.targetId && p.endingPeriodStart === window.start),
    trend: trendByTarget.get(result.targetId) ?? null,
  }));
  return facts.sort((a, b) => (a.targetId < b.targetId ? -1 : a.targetId > b.targetId ? 1 : 0));
}

const byTargetId = (a: Pattern, b: Pattern) => (a.targetId < b.targetId ? -1 : a.targetId > b.targetId ? 1 : 0);

// The one adjustment a review raises (§3.2), picked by a fixed priority: a deadline forecast that no longer fits
// comes first (time-sensitive: waiting narrows the choices), then a slipping pattern (catching a slide early), then
// an aspiration hit repeatedly (an opportunity, never urgent). Only one is ever returned, so a week with several
// candidates still asks one question. Ties break deterministically, so the same inputs always pick the same one:
// a forecast on "does not fit" over "tight", then the fewest days left, then the item id; a pattern on the longest
// run, then the target id.
//
// Deadline forecasts are only as good as what the caller hands in: lib/services/scoreboard.ts passes an empty list
// today (BACKLOG.md, MOM-108/MOM-112), so this candidate does not fire yet in production, but is written and
// tested here so it starts working the day that mapping exists, with no change to this function.
export function selectLayerThreeAdjustment(scoreboard: Pick<Scoreboard, 'patterns' | 'forecasts'>, window: ReviewWindow): LayerThreeAdjustment | null {
  const severity = (v: (typeof scoreboard.forecasts)[number]['verdict']) => (v === 'does_not_fit' ? 0 : 1);
  const strained = scoreboard.forecasts
    .filter((f) => f.verdict === 'does_not_fit' || f.verdict === 'tight')
    .sort((a, b) => severity(a.verdict) - severity(b.verdict) || a.daysLeft - b.daysLeft || (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0));
  if (strained.length > 0) {
    const f = strained[0];
    return { kind: 'deadline_forecast', itemId: f.itemId, verdict: f.verdict, options: f.options };
  }

  const endingThisWeek = (kind: Pattern['kind']) =>
    scoreboard.patterns.filter((p) => p.kind === kind && p.endingPeriodStart === window.start).sort((a, b) => b.periods - a.periods || byTargetId(a, b));

  const slipping = endingThisWeek('slipping');
  if (slipping.length > 0) return { kind: 'slipping_check_in', targetId: slipping[0].targetId, periods: slipping[0].periods };

  const aspirationRepeated = endingThisWeek('aspiration_repeated');
  if (aspirationRepeated.length > 0) return { kind: 'rebaseline', targetId: aspirationRepeated[0].targetId, periods: aspirationRepeated[0].periods };

  return null;
}
