// What the layered weekly review shows (MOM-113 block 1, docs/DOMAIN_MODEL.md §3). Built by lib/services/review.ts
// from lib/engine/review.ts's facts, the same split as scoreboard/home: the engine judges, this maps database rows
// and composes. No screen reads this yet (block 3.2) and nothing here is stored or sent to Claude (block 3.3).

import type { Layer1TargetFact, LayerThreeAdjustment, ReviewWindow } from '@/types/scoreboard';

// A priority the person named at setup, in their own words, with no score (§3.1).
export interface PriorityLine {
  id: string;
  label: string;
}

export type WeeklyReviewFacts =
  // No active goal yet: nothing to review.
  | { state: 'no_goals' }
  // Today is not known (time zone or day end not set), same gate as home.
  | { state: 'needs_day_anchors'; anchor: 'time_zone' | 'day_end'; reason: 'not_set' | 'invalid' }
  // The week start or the planning moment has not been chosen yet: nothing is guessed (principle 1).
  | { state: 'needs_planning_setup' }
  // The anchors are set, but today is not the person's planning day: nothing to show yet.
  | { state: 'not_due' }
  | {
      state: 'ready';
      window: ReviewWindow;
      targets: Layer1TargetFact[];
      // Every priority the person named, named whether or not anything was logged against it this week.
      priorities: PriorityLine[];
      // Whether layer 2's one-line reflection offer is shown at all, per the review depth setting. The words of
      // the offer itself are written later (block 3.3); this is only whether to ask.
      offerReflection: boolean;
      adjustment: LayerThreeAdjustment | null;
    };
