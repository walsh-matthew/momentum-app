// The target a period is judged by (docs/DOMAIN_MODEL.md §1.7, §3.2): a re-baseline adds a version that applies
// from a period on, and each closed period keeps the target it was judged by, so history is never re-graded.

import type { JudgedBy, Levels, LocalDate, PeriodSnapshot, ScoreboardTarget, TargetSpec, TargetVersion, Weekday } from '@/types/scoreboard';
import { addDays, weekRange } from './time';

function sortedVersions(target: ScoreboardTarget) {
  if (target.versions.length === 0) throw new Error(`Target ${target.id} has no version.`);
  const versions = [...target.versions].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
  for (let i = 1; i < versions.length; i += 1) {
    if (versions[i].effectiveFrom === versions[i - 1].effectiveFrom) {
      throw new Error(`Target ${target.id} has two versions from ${versions[i].effectiveFrom}.`);
    }
    // A re-baseline changes levels, not what kind of period the target runs in.
    if (versions[i].spec.period.kind !== versions[0].spec.period.kind) {
      throw new Error(`Target ${target.id} changes its period kind between versions.`);
    }
  }
  return versions;
}

// The version in force for a period: the latest that applies from on or before the period's first day. A
// period that began before the first version applies (a target that starts partway through a week) takes the
// first one.
export function targetInForce(target: ScoreboardTarget, periodStart: LocalDate): TargetSpec {
  const versions = sortedVersions(target);
  let found = versions[0];
  for (const v of versions) if (v.effectiveFrom <= periodStart) found = v;
  return found.spec;
}

// What to store when a period closes, so a later re-baseline cannot change how it was judged.
export function snapshotPeriod(target: ScoreboardTarget, periodStart: LocalDate): PeriodSnapshot {
  return { targetId: target.id, periodStart, spec: structuredClone(targetInForce(target, periodStart)) };
}

// The target a period is judged by: a closed period's stored snapshot; failing that, the version history
// (and the result says so); an open period always by the version in force.
export function judgingSpec(
  target: ScoreboardTarget,
  periodStart: LocalDate,
  closed: boolean,
  snapshots: PeriodSnapshot[],
): { spec: TargetSpec; judgedBy: JudgedBy } {
  if (!closed) return { spec: targetInForce(target, periodStart), judgedBy: 'current' };
  const stored = snapshots.find((s) => s.targetId === target.id && s.periodStart === periodStart);
  if (stored) return { spec: stored.spec, judgedBy: 'snapshot' };
  return { spec: targetInForce(target, periodStart), judgedBy: 'history' };
}

// A change the person saved to a target's levels (MOM-146, migration 020): the numbers that apply from a later period on. For a
// day-slots target it carries the days too; null leaves the days as the target has them.
export interface TargetChange {
  id: string;
  effectiveFrom: LocalDate;
  levels: Levels;
  days: Weekday[] | null;
  // When it was saved (the database's own time). Only its order matters.
  createdAt: string;
}

const savedLater = (a: TargetChange, b: TargetChange) => (a.createdAt === b.createdAt ? a.id > b.id : a.createdAt > b.createdAt);

// The target as the first version (what setup saved, from the target's start) plus the person's changes, each from its own day.
// Saves are only ever added, so for one effective day the newest wins: saving again before the day replaces the first save
// without editing a row. A change dated on or before the target's start has no earlier version to replace and is left out.
// The kind of period never changes (a version that changes it is refused above), only the levels and a day-slots target's days.
export function versionsWithChanges(startsOn: LocalDate, base: TargetSpec, changes: readonly TargetChange[]): TargetVersion[] {
  const newest = new Map<LocalDate, TargetChange>();
  for (const c of changes) {
    if (c.effectiveFrom <= startsOn) continue;
    const seen = newest.get(c.effectiveFrom);
    if (seen === undefined || savedLater(c, seen)) newest.set(c.effectiveFrom, c);
  }
  const later = [...newest.values()]
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1))
    .map((c) => ({
      effectiveFrom: c.effectiveFrom,
      spec: { ...base, levels: c.levels, period: base.period.kind === 'day_slots' && c.days !== null ? { kind: 'day_slots' as const, days: c.days } : base.period },
    }));
  return [{ effectiveFrom: startsOn, spec: base }, ...later];
}

// The first day of the first week that begins after the given day. On the last day of the person's week that is tomorrow; on any other
// day it is the next week start.
export function nextWeekStart(day: LocalDate, weekStartsOn: Weekday): LocalDate {
  return addDays(weekRange(day, weekStartsOn).end, 1);
}

// The day a change saved from the weekly review takes effect (docs/DOMAIN_MODEL.md §3: the review's one question "can change next week"):
// the first day of the period right after the reviewed one, but never earlier than the first day of the period that holds the person's
// today. So a review on the first day of the next week changes that week from that day; a review on the reviewed week's own last day
// changes it from tomorrow; and a review that comes late changes the week the person is in (a closed week is never re-graded, because only
// periods starting on or after this day use the new numbers, and what was already logged in that week is judged by them). A target is
// never changed before its own start: one that has not started changes from the week after its first.
export function changeEffectiveFrom(reviewedEnd: LocalDate, today: LocalDate, startsOn: LocalDate, weekStartsOn: Weekday): LocalDate {
  const afterReviewed = addDays(reviewedEnd, 1);
  const thisPeriod = weekRange(today, weekStartsOn).start;
  const wanted = afterReviewed > thisPeriod ? afterReviewed : thisPeriod;
  return wanted > startsOn ? wanted : nextWeekStart(startsOn, weekStartsOn);
}
