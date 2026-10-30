// What home shows of the goal model (MOM-112): the week's hero and each goal with its scoreboard. Built on the
// server by lib/services/scoreboard.ts from the engine's output (lib/engine/), so every number here is a fact the
// engine produced and the components only lay it out (docs/DOMAIN_MODEL.md §4.2 principle 9, "Claude never scores").
// Wording is written later, in components/home/wording.ts, around these facts and the person's own titles.

import type { CelebrationLevel, GoalShape, Measure, Tone, WorkItemKind } from '@/types/database.types';
import type { ForecastOption, Level, LocalDate, PatternKind, TargetRole, TrendDirection } from '@/types/scoreboard';

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

// What home says about whether a deadline task fits the days the person has set aside for it (docs/DOMAIN_MODEL.md §1.4).
// A fact about those days, never a promise (RAID A-07). The verdicts are the engine's; the states after `past_due` are the
// reasons the engine was not asked, or its answer was not used, because a day, a kind of day or a size was not the person's
// to be guessed at (principle 1). Built by lib/services/forecastRows.ts.
export type ForecastView =
  // The days set aside are enough. `soFar` is true when the due date is later than the last day the person has planned, so
  // the days to come are not counted.
  | { state: 'fits'; soFar: boolean }
  | { state: 'tight' }
  | { state: 'does_not_fit'; options: ForecastOption[] }
  // The days set aside so far are not enough, but the plan does not reach the due date yet: no tight or short claim. `days`
  // is how many days are set aside for this task, `through` the last day the person has planned.
  | { state: 'planned_so_far'; days: number; through: LocalDate }
  | { state: 'past_due' }
  // No rough size and no pace from logged time.
  | { state: 'not_enough_data' }
  | { state: 'nothing_set_aside' }
  // A day the task is on has no kind, or its kind has no usual time: the capacity is not known.
  | { state: 'day_without_kind'; date: LocalDate }
  | { state: 'kind_without_time'; date: LocalDate; kindName: string }
  // The person counts their time in sessions, and a task is sized in minutes.
  | { state: 'counted_in_sessions' };

// A milestone or a deadline task, with its steps. Only a deadline task has a forecast; a milestone is null.
export interface MilestoneView {
  id: string;
  goalId: string;
  goalTitle: string;
  title: string;
  kind: Exclude<WorkItemKind, 'habit'>;
  dueOn: LocalDate | null;
  steps: StepView[];
  stepsDone: number;
  forecast: ForecastView | null;
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
  // No active goal in the goal model: nothing to show. setupSaved is true when the person has a goal row that is not active (parked,
  // archived), which still means their first setup is saved (MOM-143: home offers setup only when it is false). The builder always
  // sets it; a missing value counts as not saved.
  | { state: 'no_goals'; setupSaved?: boolean }
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
