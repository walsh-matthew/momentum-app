// What the week plan shows (MOM-112 block 2): the person's own choice of which things to do on which of their days, and
// which of their own kinds of days each date is. Built on the server by lib/services/weekPlan.ts through
// lib/plan/weekPlan.ts. A choice is a thing on a day: never a time and never a slot, and nothing here picks a day for
// the person (docs/DOMAIN_MODEL.md §1.4, §4.2 principles 1 and 12). Wording is written in components/plan/wording.ts.

import type { WorkItemKind } from '@/types/database.types';
import type { LocalDate } from '@/types/scoreboard';

// What a change to the plan answers: how many days it touched (zero when it was already so), or why it was refused. The same
// shape as ServiceResult, written here so a component can use it without importing from the services.
export type PlanChange = { ok: true; data: { changed: number } } | { ok: false; error: string };

// A habit, a milestone or a deadline task the person can put on a day.
export interface PlanItemView {
  id: string;
  goalId: string;
  goalTitle: string;
  // The person's own words, kept as written.
  title: string;
  kind: WorkItemKind;
  // A deadline task's own date, or the due date of the deadline target a milestone feeds; null when it has none.
  dueOn: LocalDate | null;
  // A habit with set days: the weekdays the person named (0 is Sunday), in the order of their week. Null otherwise.
  setDays: number[] | null;
  // Left over from a past week and not put on a day since (the engine's carry-forward). Habits are never moved.
  movedFromLastWeek: boolean;
}

export interface PlanDayView {
  date: LocalDate;
  isToday: boolean;
  // A day that has passed can be read but not changed.
  isPast: boolean;
  // The id of the person's own kind of day this date was given, or null when they have not said.
  dayTypeId: string | null;
  // The things the person put on this day.
  itemIds: string[];
}

// One of the person's own kinds of days, named in their words.
export interface DayKindOption {
  id: string;
  name: string;
}

export type WeekPlanView =
  // The time zone or the day end is not set, so the person's days are not known. No plan is built and no day is guessed.
  | { state: 'needs_day_anchors'; anchor: 'time_zone' | 'day_end'; reason: 'not_set' | 'invalid' }
  | {
      state: 'ready';
      today: LocalDate;
      // A week from the person's week start; or, when they have not set one, the next 14 days from today (dates, not weeks).
      window: 'week' | 'next_14_days';
      // Which week, counted from the one that holds today (0). Always 0 for the next-14-days window.
      offset: number;
      hasPrevious: boolean;
      hasNext: boolean;
      start: LocalDate;
      end: LocalDate;
      days: PlanDayView[];
      items: PlanItemView[];
      dayKinds: DayKindOption[];
      // How many dates "Same as last week" would give a kind to: those from today on with no kind yet, whose date a week
      // earlier has one. Zero hides the button.
      copyableKinds: number;
    };

// The "Your plan" card on home.
export interface HomePlanItem {
  id: string;
  title: string;
  goalTitle: string;
}

export type HomePlanView =
  // Nothing to show: no day anchors, or nothing the person could put on a day.
  | { state: 'none' }
  | {
      state: 'ready';
      today: LocalDate;
      // What the person put on today.
      todayItems: HomePlanItem[];
      // Whether anything is on a day from tomorrow on, so the card can say the week is planned beyond today.
      plannedLater: boolean;
      // Left over from a past week, with no day yet. Needs the person's week start, so it is empty without one.
      moved: HomePlanItem[];
    };
