// Threshold crossings (docs/DOMAIN_MODEL.md §1.7): step, floor, aspiration and block end. Each is a dated fact,
// scaled and worded later; the engine only says that it happened and when.

import type { Crossing, ScoreboardTarget, TargetResult, WorkStep } from '@/types/scoreboard';
import type { PeriodEvaluation } from './evaluate';

// The day a level was reached is the day of the entry that took the running total to it.
export function levelCrossings(evaluation: PeriodEvaluation): Crossing[] {
  const { result, spec, tally } = evaluation;
  const out: Crossing[] = [];
  const levels = spec.levels;
  if (levels) {
    const reached = (at: number) => tally.steps.find((s) => s.total >= at);
    const floor = reached(levels.floor);
    if (floor) out.push({ kind: 'floor', targetId: result.targetId, periodStart: result.periodStart, on: floor.day });
    const aspiration = levels.aspiration === null ? undefined : reached(levels.aspiration);
    if (aspiration) {
      out.push({ kind: 'aspiration', targetId: result.targetId, periodStart: result.periodStart, on: aspiration.day });
    }
  }
  // Each checklist step ticked for the first time is a step (design D4).
  if (spec.measure === 'checklist' && spec.period.kind !== 'day_slots') {
    for (const s of tally.steps) {
      if (s.stepId !== null) out.push({ kind: 'step', targetId: result.targetId, itemId: null, stepId: s.stepId, on: s.day });
    }
  }
  return out;
}

// A milestone or deadline-task step the person finished.
export function stepCompletions(steps: WorkStep[]): Crossing[] {
  return steps.flatMap((s) =>
    s.completedOn === null ? [] : [{ kind: 'step' as const, targetId: null, itemId: s.itemId, stepId: s.id, on: s.completedOn }],
  );
}

// Once the last day of a block is past: how the block's periods went. A block is a run of the person's weeks,
// so a deadline target (one period) has no block end.
export function blockEndCrossing(
  target: ScoreboardTarget,
  results: TargetResult[],
  today: string,
  repeating: boolean,
): Crossing | null {
  const end = target.blockEndsOn;
  if (end === null || !repeating || today <= end) return null;
  const judged = results.filter((r) => r.status === 'closed' && r.graded && r.periodEnd <= end);
  if (judged.length === 0) return null;
  return {
    kind: 'block_end',
    targetId: target.id,
    on: end,
    periodsJudged: judged.length,
    floorMet: judged.filter((r) => r.level === 'floor' || r.level === 'aspiration').length,
    aspirationMet: judged.filter((r) => r.level === 'aspiration').length,
  };
}
