// Unfinished milestone and deadline-task steps move forward, never silently cut (docs/DOMAIN_MODEL.md §1.4,
// §4.2 principle 11). Habits are not handled here: their shortfall is simply never owed (evaluate.ts).

import type { LocalDate, MovedStep, TimeAnchors, Weekday, WorkStep } from '@/types/scoreboard';
import { assertAnchors, weekRange } from './time';

// Every input step comes back, in order. A step planned in a week that has closed and is not finished is
// planned in the current week instead, and listed in `moved` with the week it left.
export function carryForwardSteps(
  steps: WorkStep[],
  today: LocalDate,
  anchors: TimeAnchors,
): { steps: WorkStep[]; moved: MovedStep[] } {
  assertAnchors(anchors, 'weekly');
  const current = weekRange(today, anchors.weekStartsOn as Weekday).start;
  const moved: MovedStep[] = [];
  const out = steps.map((step) => {
    if (step.completedOn !== null || step.plannedPeriodStart >= current) return step;
    moved.push({ stepId: step.id, itemId: step.itemId, from: step.plannedPeriodStart, to: current });
    return { ...step, plannedPeriodStart: current };
  });
  return { steps: out, moved };
}
