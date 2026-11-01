// The week at a glance (docs/DOMAIN_MODEL.md §1.3, §1.7; MOM-112): how many floors are met, which crossing was the
// biggest, and how many entries landed on each day. Facts only: a count, a day, an id. The words are written later,
// around them, and Claude adds no number (§4.2 principle 9).

import type { Crossing, LocalDate, Scoreboard, ScoreboardEntry, ScoreboardTarget, TimeAnchors, Weekday } from '@/types/scoreboard';
import { targetInForce } from './baseline';
import { selectEntries } from './entries';
import { addDays, assertAnchors, weekRange } from './time';

export interface FloorTally {
  // The targets whose floor is in play this week, and the ones that have met it (the floor or the aspiration).
  inPlay: string[];
  met: string[];
}

// Floors met this week. It counts only graded effort targets with a weekly or day-slot period that are still open:
// an outcome target is tracked and not judged, a deadline target is not a week's floor, and a target that started
// partway through the week, or has no levels, is not graded, so none of them is in play.
export function floorsMet(scoreboard: Scoreboard, targets: ScoreboardTarget[]): FloorTally {
  const byId = new Map(targets.map((t) => [t.id, t]));
  const inPlay: string[] = [];
  const met: string[] = [];
  for (const result of scoreboard.results) {
    const target = byId.get(result.targetId);
    if (!target) continue;
    const spec = targetInForce(target, result.periodStart);
    if (spec.role !== 'effort' || spec.period.kind === 'deadline') continue;
    if (result.status !== 'open' || !result.graded || result.level === null) continue;
    inPlay.push(result.targetId);
    if (result.level === 'floor' || result.level === 'aspiration') met.push(result.targetId);
  }
  return { inPlay, met };
}

export interface DayCount {
  day: LocalDate;
  count: number;
}

// The entries that count, on each day of the person's week that holds today, from the week's first day to its last.
// A removed entry, a below-threshold entry and an entry before its target started are left out, the same as in a
// target's own total. Needs the week start: ask canGrade(anchors, 'weekly') first.
export function entriesPerDay(input: {
  today: LocalDate;
  anchors: TimeAnchors;
  targets: ScoreboardTarget[];
  entries: ScoreboardEntry[];
}): { start: LocalDate; end: LocalDate; days: DayCount[] } {
  const { today, anchors, targets, entries } = input;
  assertAnchors(anchors, 'weekly');
  const week = weekRange(today, anchors.weekStartsOn as Weekday);
  const days: DayCount[] = Array.from({ length: 7 }, (_, i) => ({ day: addDays(week.start, i), count: 0 }));
  const byDay = new Map(days.map((d) => [d.day, d]));
  for (const target of targets) {
    const from = week.start > target.startsOn ? week.start : target.startsOn;
    if (from > week.end) continue;
    const spec = targetInForce(target, week.start);
    const own = entries.filter((e) => e.targetId === target.id);
    for (const { day } of selectEntries(spec, own, { from, to: week.end }, anchors).counted) {
      const slot = byDay.get(day);
      if (slot) slot.count += 1;
    }
  }
  return { start: week.start, end: week.end, days };
}

// block_end is the biggest, then aspiration, floor, step (§1.7: celebrations scale with the crossing).
const KIND_RANK: Record<Crossing['kind'], number> = { block_end: 4, aspiration: 3, floor: 2, step: 1 };

// The target (or, for a milestone step with no target, the item) a crossing belongs to.
export const crossingKey = (c: Crossing): string => (c.kind === 'step' ? (c.targetId ?? c.itemId ?? '') : c.targetId);

// The week's biggest crossing: the latest day first; on the same day the bigger kind; and if those tie, the person's
// own order from setup, given as a list of target and item ids with the first goal's first target first (migration 021 stores
// it, MOM-132). The order is used only when it places EVERY crossing that is tied: a target whose place was never stored (one
// saved before 021) has none, and an unknown place is not guessed, so it neither wins nor loses a tie against a placed one.
// Otherwise (no order given, or it does not list them all) every tied crossing is returned, in id order, so the caller names
// them all and none is picked. Only crossings on days from week.start to week.end count.
export function biggestCrossings(crossings: Crossing[], week: { start: LocalDate; end: LocalDate }, order: readonly string[] = []): Crossing[] {
  const inWeek = crossings.filter((c) => c.on >= week.start && c.on <= week.end);
  if (inWeek.length === 0) return [];
  // Positive when a is the bigger by day and kind alone.
  const bigger = (a: Crossing, b: Crossing) => (a.on === b.on ? 0 : a.on > b.on ? 1 : -1) || KIND_RANK[a.kind] - KIND_RANK[b.kind];
  const best = inWeek.reduce((top, c) => (bigger(c, top) > 0 ? c : top));
  let tied = inWeek.filter((c) => bigger(c, best) === 0);
  if (tied.length > 1) {
    const places = tied.map((c) => order.indexOf(crossingKey(c)));
    if (places.every((at) => at !== -1)) {
      const first = Math.min(...places);
      tied = tied.filter((_, i) => places[i] === first);
    }
  }
  return tied.sort((a, b) => {
    const keyA = `${crossingKey(a)}|${a.kind === 'step' ? a.stepId : ''}`;
    const keyB = `${crossingKey(b)}|${b.kind === 'step' ? b.stepId : ''}`;
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
  });
}
