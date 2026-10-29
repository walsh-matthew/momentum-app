// Layer 1 of the weekly review as the screen shows it and a finished review stores it (MOM-113 block 3.2). Pure: it maps
// the engine's facts for the reviewed week (lib/engine/review.ts's buildLayer1Facts) and the person's own titles onto
// the card home already draws for a counted target, so the same words are written around the same numbers. Nothing here
// adds, grades or reads a clock: every number was the engine's before it got here (docs/DOMAIN_MODEL.md §4.2 principle 9).

import type { PriorityLine, RecapCrossing, RecapGoal, RecapTarget, StoredRecap } from '@/types/review';
import type { Layer1TargetFact, Pattern, ReviewedValue, ReviewWindow, Weekday } from '@/types/scoreboard';
import { toWeekday, type ActiveGoalRead, type TargetRead } from './scoreboardRows';

// Slipping outranks the positive patterns for display; an aspiration repeated is the stronger of the two good ones
// (the same order home uses).
const PATTERN_ORDER = ['slipping', 'aspiration_repeated', 'holding'] as const;

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byCreated = (a: { created_at: string; id: string }, b: { created_at: string; id: string }) =>
  byText(a.created_at, b.created_at) || byText(a.id, b.id);

export interface RecapInput {
  window: ReviewWindow;
  closedEarly: boolean;
  goals: ActiveGoalRead[];
  targets: TargetRead[];
  facts: Layer1TargetFact[];
  priorities: PriorityLine[];
  weekStartsOn: Weekday | null;
}

function targetOf(fact: Layer1TargetFact, row: TargetRead, weekStartsOn: Weekday | null): RecapTarget {
  const { result } = fact;
  const own = fact.patterns.filter((p): p is Pattern => p.targetId === row.id);
  const found = PATTERN_ORDER.map((kind) => own.find((p) => p.kind === kind)).find((p) => p !== undefined);
  const crossings: RecapCrossing[] = fact.crossings
    .flatMap((c) => (c.kind === 'floor' || c.kind === 'aspiration' || c.kind === 'block_end' ? [{ kind: c.kind, on: c.on }] : []))
    .sort((a, b) => byText(a.on, b.on) || byText(a.kind, b.kind));
  return {
    id: row.id,
    title: row.title,
    measure: row.measure,
    unit: row.unit,
    role: row.role,
    period: row.period_kind,
    dueOn: row.due_date,
    floor: row.floor === null ? null : Number(row.floor),
    aspiration: row.aspiration === null ? null : Number(row.aspiration),
    status: 'counted',
    counted: result.counted,
    graded: result.graded,
    startedPartway: result.startedPartway,
    level: result.level,
    remainingToFloor: result.remainingToFloor,
    remainingToAspiration: result.remainingToAspiration,
    owed: result.owed,
    belowThreshold: result.belowThreshold.length,
    slots: result.slots
      ? {
          filled: result.slots.filled,
          total: result.slots.total,
          // The days the person named, in the order of their own week.
          weekdays: [...new Set((row.slot_weekdays ?? []).map(toWeekday))].sort(
            (a, b) => ((a - (weekStartsOn ?? 0) + 7) % 7) - ((b - (weekStartsOn ?? 0) + 7) % 7),
          ),
        }
      : null,
    // Only a graded target has a pattern.
    pattern: result.graded && found ? { kind: found.kind, periods: found.periods } : null,
    trend: fact.trend ? { counts: fact.trend.counts, direction: fact.trend.direction } : null,
    crossings,
  };
}

export function buildStoredRecap(input: RecapInput): StoredRecap {
  const rowById = new Map(input.targets.map((t) => [t.id, t]));
  const factsByTarget = new Map(input.facts.map((f) => [f.targetId, f]));
  const goals: RecapGoal[] = [];
  for (const goal of input.goals) {
    // The person's order of targets is not stored, so they follow when each was created.
    const targets = input.targets
      .filter((t) => t.goal_id === goal.id)
      .sort(byCreated)
      .flatMap((t) => {
        const fact = factsByTarget.get(t.id);
        const row = rowById.get(t.id);
        return fact && row ? [targetOf(fact, row, input.weekStartsOn)] : [];
      });
    // A goal with no period closing that week has nothing to say, and is left out rather than shown empty.
    if (targets.length > 0) goals.push({ id: goal.id, title: goal.title, targets });
  }
  return { v: 1, window: input.window, closedEarly: input.closedEarly, goals, priorities: input.priorities };
}

// What each target in a recap read, for the comparison with the same week now (lib/engine/review.ts, compareRecapToLive).
export function recapValues(recap: StoredRecap): Array<{ targetId: string } & ReviewedValue> {
  return recap.goals.flatMap((g) => g.targets.map((t) => ({ targetId: t.id, counted: t.counted, level: t.level, graded: t.graded })));
}
