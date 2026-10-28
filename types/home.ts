// What home shows of the goal model (MOM-112): the week's hero and each goal with its scoreboard. Built on the
// server by lib/services/scoreboard.ts from the engine's output (lib/engine/), so every number here is a fact the
// engine produced and the components only lay it out (docs/DOMAIN_MODEL.md §4.2 principle 9, "Claude never scores").
// Wording is written later, in components/home/wording.ts, around these facts and the person's own titles.

import type { CelebrationLevel, GoalShape, Measure, Tone, WorkItemKind } from '@/types/database.types';
import type { Level, LocalDate, PatternKind, TargetRole, TrendDirection } from '@/types/scoreboard';

export type TargetPeriodView = 'weekly' | 'day_slots' | 'deadline';

export interface TargetCardBase {
  id: string;
  // The person's own words, kept as written.
  title: string;
  measure: Measure;
  unit: string | null;
  role: TargetRole;
  period: TargetPeriodView;
  // A deadline target's due date.
  dueOn: LocalDate | null;
  floor: number | null;
  aspiration: number | null;
}

// Day slots: how many of the person's named days are filled this week, and which days they named (0 is Sunday),
// in the order of the person's week.
export interface SlotsView {
  filled: number;
  total: number;
  weekdays: number[];
}

export interface PatternView {
  kind: PatternKind;
  // How many closed weeks running.
  periods: number;
}

export interface TrendView {
  // The latest closed weeks, oldest first.
  counts: number[];
  direction: TrendDirection;
}

export type TargetCardView = TargetCardBase &
  (
    // A weekly or day-slot target when the person has not set the day their week starts: shown with its levels and
    // no count, never graded. A target with another period is never in this state.
    | { status: 'needs_week_start' }
    // A target the engine cannot judge as it was set up (for example a checklist with no steps yet): tracked, not
    // counted yet.
    | { status: 'not_counted' }
    // Its goal starts after today, so there is nothing to count or grade yet.
    | { status: 'not_started'; startsOn: LocalDate }
    | {
        status: 'counted';
        counted: number;
        // Whether the engine graded it. A target with levels that started partway through its first week has a
        // level in the result but is not graded: the card must key on this and not on `level`.
        graded: boolean;
        startedPartway: boolean;
        level: Level | null;
        remainingToFloor: number | null;
        remainingToAspiration: number | null;
        owed: number;
        // Entries kept and shown but not counted (below the person's threshold).
        belowThreshold: number;
        slots: SlotsView | null;
        // Only a graded target has one.
        pattern: PatternView | null;
        // An outcome target's last closed weeks.
        trend: TrendView | null;
      }
  );

export interface StepView {
  id: string;
  title: string;
  done: boolean;
}

// A milestone or a deadline task, with its steps. There is no forecast verdict yet: it needs the days the person
// has set aside, which come with the weekly plan (BACKLOG.md, MOM-112).
export interface MilestoneView {
  id: string;
  goalId: string;
  goalTitle: string;
  title: string;
  kind: Exclude<WorkItemKind, 'habit'>;
  dueOn: LocalDate | null;
  steps: StepView[];
  stepsDone: number;
}

export interface GoalCardView {
  id: string;
  title: string;
  shape: GoalShape;
  targets: TargetCardView[];
  milestones: MilestoneView[];
}

export interface WeekDayView {
  day: LocalDate;
  count: number;
  isToday: boolean;
  isFuture: boolean;
}

// The week's biggest crossing. When several tie on day and size and the person's order is not stored, every one is
// named, in title then id order, and none is picked.
export interface HeroHeadline {
  kind: 'floor' | 'aspiration' | 'block_end' | 'step';
  // The target's title, or the step's title for a step.
  titles: string[];
}

export type HomeHero =
  | {
      kind: 'week';
      start: LocalDate;
      end: LocalDate;
      floorsMet: number;
      floorsInPlay: number;
      headline: HeroHeadline | null;
      days: WeekDayView[];
      // Nothing counted yet this week: a calm empty state, never 0%.
      empty: boolean;
    }
  // The person has a weekly or day-slot target and no week start: the only case the hero asks for one.
  | { kind: 'needs_week_start' }
  // The person has no weekly or day-slot target (deadline goals only): never asked for a week start. The hero shows
  // their milestones.
  | { kind: 'deadlines'; items: MilestoneView[] };

export type HomeScoreboard =
  // No active goal in the goal model yet: nothing to show.
  | { state: 'no_goals' }
  // The time zone or the day end is not set, so today is not known and nothing can be graded.
  | { state: 'needs_day_anchors'; anchor: 'time_zone' | 'day_end'; reason: 'not_set' | 'invalid' }
  | {
      state: 'ready';
      today: LocalDate;
      hero: HomeHero | null;
      goals: GoalCardView[];
      // How Momentum talks to this person, from their settings, or the code's starting value when they have not
      // chosen one (lib/home/defaults.ts).
      tone: Tone;
      celebration: CelebrationLevel;
    };
