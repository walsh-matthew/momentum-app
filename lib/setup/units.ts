// MOM-176. Only a quantity (an amount like pages or pounds) has a unit; a count, a time and a checklist have none
// (lib/setup/validate.ts, UNIT_EXTRA_MESSAGE). Claude sometimes writes one anyway ("sessions" on a count). That is a slip with
// one right fix and no judgment in it, so code makes the fix on Claude's draft before the turn is checked, instead of throwing
// the turn away and spending a retry on it. The person sees nothing different.
//
// It does exactly one thing: sets `unit` to null on a target whose measure is not 'quantity'. It never touches a quantity, never
// fills a missing unit (a quantity with no unit stays a real check that asks the person, `draft.unit_missing`), and never
// changes a title or any other field. `unit` is not a provenance leaf (lib/setup/leaves.ts), so no "said" entry depends on
// it and the "said" list is left as it is. `draft.unit_extra` in validate.ts stays as the safety net for a saved session and
// the final save check.

import type { AssistantTurn } from '@/types/setup';

export interface ClearedUnits {
  turn: AssistantTurn;
  // How many targets had their unit cleared. A count only: never the unit, the title or a path.
  cleared: number;
}

// Pure. Returns the same turn object when there is nothing to clear; otherwise a copy, never changing the one it was given.
export function clearStrayUnits(turn: AssistantTurn): ClearedUnits {
  let cleared = 0;
  const goals = turn.draft.model.goals.map((goal) => {
    if (!goal.targets.some((t) => t.measure !== 'quantity' && t.unit !== null)) return goal;
    return {
      ...goal,
      targets: goal.targets.map((t) => {
        if (t.measure === 'quantity' || t.unit === null) return t;
        cleared += 1;
        return { ...t, unit: null };
      }),
    };
  });
  if (cleared === 0) return { turn, cleared };
  return { turn: { ...turn, draft: { ...turn.draft, model: { ...turn.draft.model, goals } } }, cleared };
}
