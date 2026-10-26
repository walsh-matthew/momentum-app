// The target a period is judged by (docs/DOMAIN_MODEL.md §1.7, §3.2): a re-baseline adds a version that applies
// from a period on, and each closed period keeps the target it was judged by, so history is never re-graded.

import type { JudgedBy, LocalDate, PeriodSnapshot, ScoreboardTarget, TargetSpec } from '@/types/scoreboard';

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
