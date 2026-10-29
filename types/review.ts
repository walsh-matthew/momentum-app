// What the layered weekly review shows and stores (MOM-113, docs/DOMAIN_MODEL.md §3). Built by lib/services/review.ts
// from lib/engine/review.ts's facts, the same split as scoreboard/home: the engine judges, this maps database rows
// and composes. The recap screen (components/review/) lays out what is here; nothing on it is a number Claude made
// (principle 9). The finished review's record (migration 018) holds a StoredRecap, written once and never rewritten.

import type { ReviewAdjustmentKind, ReviewAdjustmentOutcome, StartingPointKind, Tone } from '@/types/database.types';
import type { TargetCardView } from '@/types/home';
import type { Layer1TargetFact, LayerThreeAdjustment, LocalDate, ReviewedValue, ReviewWindow, Weekday } from '@/types/scoreboard';

// A priority the person named at setup, in their own words, with no score (§3.1).
export interface PriorityLine {
  id: string;
  label: string;
}

// What crossed in the reviewed week, in words on the screen. Steps are not in a recap: the review reads no steps yet.
export interface RecapCrossing {
  kind: 'floor' | 'aspiration' | 'block_end';
  on: LocalDate;
}

// One target as the recap showed it: the card home draws for a counted target (so the same words are written around it),
// plus what crossed that week. The titles are the person's own words as they were then, kept in the record.
export type RecapTarget = Extract<TargetCardView, { status: 'counted' }> & { crossings: RecapCrossing[] };

export interface RecapGoal {
  id: string;
  title: string;
  targets: RecapTarget[];
}

// Layer 1 as it was shown for one week: what a finished review stores (weekly_reviews.recap) and what the screen draws.
export interface StoredRecap {
  v: 1;
  window: ReviewWindow;
  // True when the review closed the week early: the planning day was the week's own last day, so the recap counts
  // through that day and an entry logged later the same day can still arrive (docs/DOMAIN_MODEL.md §3, RAID I-11).
  closedEarly: boolean;
  goals: RecapGoal[];
  // Every priority the person named, named whether or not anything was logged against it this week.
  priorities: PriorityLine[];
}

// A finished review as read back: the week, what was said, and when it was finished (the person's own day).
export interface StoredReview {
  id: string;
  window: ReviewWindow;
  recap: StoredRecap;
  // The one adjustment offered and what the person chose; null when none was offered. Layer 3's screen is block 3.3.
  adjustment: { kind: ReviewAdjustmentKind; outcome: ReviewAdjustmentOutcome } | null;
  finishedOn: LocalDate;
}

// A later entry changed a week that already has a stored recap. The record is never touched; this is said beside it, in
// words, under "Since this recap" (R-26). `said` comes from the record, `now` from the engine over the same week.
export interface RecapChange {
  weekStart: LocalDate;
  weekEnd: LocalDate;
  targetId: string;
  title: string;
  unit: string | null;
  // What the target read in the recap, and what the engine reads for the same week now: its own numbers, never a new grade.
  said: ReviewedValue;
  now: ReviewedValue;
}

export type WeeklyReviewFacts =
  // No active goal yet: nothing to review.
  | { state: 'no_goals' }
  // Today is not known (time zone or day end not set), same gate as home.
  | { state: 'needs_day_anchors'; anchor: 'time_zone' | 'day_end'; reason: 'not_set' | 'invalid' }
  // The week start or the planning moment has not been chosen yet: nothing is guessed (principle 1).
  | { state: 'needs_planning_setup' }
  // The anchors are set, but today is not the person's planning day: nothing to review yet. The last finished review,
  // if there is one, is still there to read, with anything a later entry changed since.
  | { state: 'not_due'; tone: Tone; planningWeekday: Weekday; last: StoredReview | null; changes: RecapChange[] }
  // Today is the planning day and this week's review is already finished: the record as it was said, and the changes since.
  | { state: 'reviewed'; tone: Tone; review: StoredReview; changes: RecapChange[] }
  | {
      state: 'ready';
      tone: Tone;
      window: ReviewWindow;
      targets: Layer1TargetFact[];
      // Layer 1 as the screen shows it, and as a finished review would store it.
      recap: StoredRecap;
      // Every priority the person named, named whether or not anything was logged against it this week.
      priorities: PriorityLine[];
      // Whether layer 2's one-line reflection offer is shown at all, per the review depth setting. The words of
      // the offer itself are written later (block 3.3); this is only whether to ask.
      offerReflection: boolean;
      adjustment: LayerThreeAdjustment | null;
      // Earlier finished reviews that a later entry has changed since.
      changes: RecapChange[];
    };

// What home shows about the review: nothing, a way in when it is due, or a way back to the finished one.
export type ReviewPrompt = { state: 'none' } | { state: 'due' } | { state: 'reviewed' };

// A setup value the person took from a suggestion, not yet asked about (MOM-134, migration 017). The weekly review's
// "Still right for you?" is built from these at the first review (MOM-113 block 3.4). Read by
// lib/services/startingPoints.ts; a starting point is a question to ask, never a fact about the person (§2.1 rule 4).
export interface UnconfirmedStartingPoint {
  id: string;
  // What the value belongs to, and which saved column holds it (migration 017's starting_points_field_check).
  kind: StartingPointKind;
  field: string;
  // The goal's, target's or work item's title or the day type's name, as the person wrote it. Null for the person's own facts.
  subject: string | null;
  // What is saved there now, as text; null when nothing is.
  value: string | null;
  createdAt: string;
}
