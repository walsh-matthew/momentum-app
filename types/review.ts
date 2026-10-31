// What the layered weekly review shows and stores (MOM-113, docs/DOMAIN_MODEL.md §3). Built by lib/services/review.ts
// from lib/engine/review.ts's facts, the same split as scoreboard/home: the engine judges, this maps database rows
// and composes. The recap screen (components/review/) lays out what is here; nothing on it is a number Claude made
// (principle 9). The finished review's record (migration 018) holds a StoredRecap, written once and never rewritten.

import type { Measure, ReviewAdjustmentKind, ReviewAdjustmentOutcome, ReviewPlanningMode, StartingPointKind, Tone } from '@/types/database.types';
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

// What the review's edit needs to know about the target the adjustment named (MOM-146): the numbers it will have from the next period
// (the newest saved, or the ones in force when nothing is saved), and the week just reviewed. Null in the facts when the target cannot be
// edited here (a deadline or checklist target, or one with no numbers).
export interface TargetEdit {
  targetId: string;
  title: string;
  measure: Measure;
  unit: string | null;
  period: 'weekly' | 'day_slots';
  floor: number;
  aspiration: number | null;
  // A day-slots target's days, 1 to 7 with Monday as 1; null for a weekly target.
  days: number[] | null;
  // The weekday a week starts on (0 is Sunday), so the days are listed in the order of the person's week.
  weekStartsOn: Weekday;
  // What the reviewed week came to, the engine's own count.
  lastCounted: number | null;
  // The first day the new numbers would apply from.
  effectiveFrom: LocalDate;
  // The person's own today, so the day it starts reads without a year when it is this year.
  today: LocalDate;
}

// What a saved change to a target's numbers comes to (lib/services/targetChanges.ts): the target, the first day the numbers apply from, and
// the numbers and days as saved.
export interface SavedTargetChange {
  targetId: string;
  effectiveFrom: LocalDate;
  floor: number;
  aspiration: number | null;
  // A day-slots target's days, 1 to 7 with Monday as 1; null for a weekly target.
  days: number[] | null;
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
  // `today` in each of the states below is the person's own date, so a date on screen reads the casual way (MOM-111 finding 7).
  | { state: 'not_due'; tone: Tone; today: LocalDate; planningWeekday: Weekday; last: StoredReview | null; changes: RecapChange[] }
  // Today is the planning day and this week's review is already finished: the record as it was said, and the changes since.
  // `planning` is the person's setting for planning the week in the same sitting or separately (MOM-113 block 3.3).
  | { state: 'reviewed'; tone: Tone; today: LocalDate; review: StoredReview; changes: RecapChange[]; planning: ReviewPlanningMode }
  | {
      state: 'ready';
      tone: Tone;
      today: LocalDate;
      window: ReviewWindow;
      targets: Layer1TargetFact[];
      // Layer 1 as the screen shows it, and as a finished review would store it.
      recap: StoredRecap;
      // Every priority the person named, named whether or not anything was logged against it this week.
      priorities: PriorityLine[];
      // Whether layer 2's one-line look back is offered at all, per the review depth setting. The line itself is asked for
      // only when the person taps for it (lib/services/reviewReflection.ts); this is only whether to show the button.
      offerReflection: boolean;
      // The engine's one adjustment. Null while "Still right for you?" has something to ask: that card takes layer 3's place for the
      // sitting, and the engine's adjustment is found again at the next review (patterns are recomputed each time).
      adjustment: LayerThreeAdjustment | null;
      // The edit the adjustment's "change" choice opens, when it names a target that can be edited here (MOM-146).
      edit: TargetEdit | null;
      // Setup suggestions to ask about (MOM-113 block 3.4).
      stillRight: StillRightMarks;
      // Earlier finished reviews that a later entry has changed since.
      changes: RecapChange[];
    };

// Why Claude's one-line look back (layer 2) was not asked for, or came back as no line: each ends in a plain sentence that says the
// review goes on without it (lib/services/llm.ts, REVIEW_LINE_MESSAGES).
export type ReviewLineUnavailable = 'review_budget' | 'shared_cap' | 'person_cap' | 'too_soon' | 'unchecked' | 'model';

// What one ask for the review's line comes to (lib/services/llm.ts, runReviewLine): a line, with who wrote it ('claude', or
// 'fallback' when code did after Claude's reply failed its checks twice), or the plain reason there is none. Not stored.
export type ReviewLineResult =
  | { kind: 'line'; line: string; source: 'claude' | 'fallback'; calls: number }
  | { kind: 'unavailable'; reason: ReviewLineUnavailable; message: string };

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
  // The target a target's mark belongs to; null for every other kind.
  targetId: string | null;
  // True when the person has since changed this value themselves (MOM-113 block 3.4): a target's floor, aspiration or days with a
  // saved change (migration 020, MOM-146). A mark they changed is theirs to skip, never asked about again.
  changed: boolean;
}

// The three target values the review's edit can change today (MOM-146), and so the only starting points "Still right for you?" asks
// about. A mark on any other value stays unanswered until the app can change it (MOM-113 block 3.4 decision, 2026-10-31).
export const STILL_RIGHT_FIELDS = ['floor', 'aspiration', 'slot_weekdays'] as const;
export type StillRightField = (typeof STILL_RIGHT_FIELDS)[number];

// One setup suggestion to ask about: the mark, the target it belongs to and which of its values it names.
export interface StillRightItem {
  id: string;
  targetId: string;
  field: StillRightField;
}

// The marks of a ready review (docs/DOMAIN_MODEL.md §3.2, "a suggestion taken at setup"). `asking` is what the card shows, oldest first.
// `changed` are marks whose value the person has already changed: never asked, recorded as changed when the review is finished.
// `edits` are the edits of the targets being asked about, so "No, change it" opens MOM-146's form.
export interface StillRightMarks {
  asking: StillRightItem[];
  changed: StillRightItem[];
  edits: TargetEdit[];
}
