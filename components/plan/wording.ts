// The words the week plan and the "Your plan" card on home use (MOM-112 block 2). Templates in code, never a model. They
// follow the plain-language rule (docs/DOMAIN_MODEL.md §2.1): everyday words only, a short reason where the person is
// asked for something, and the person's own names for their kinds of days. No internal word (pick, day type, capacity,
// slot, target, milestone) is ever on screen; tests/plan-plain-words.test.tsx fails if one is.
//
// The person's titles are kept exactly as they wrote them.

import { formatDay } from '@/components/home/wording';
import type { PlanItemView, WeekPlanView } from '@/types/plan';

export type ReadyPlan = Extract<WeekPlanView, { state: 'ready' }>;

export const PLAN_HEADING = 'Plan your week';
export const PLAN_LINK = 'Plan your week';
export const BACK_HOME = 'Back to home';

export const WHAT_TO_DO_HEADING = 'What you will do, day by day';
export const WHAT_TO_DO_HELP = 'Tap a day to put something on it, and tap it again to take it off. You choose every day; nothing is chosen for you.';

export const KINDS_HEADING = 'What kind of day is each one?';
// The reason for asking, in a few words (the plain-language rule: say why).
export const KINDS_REASON = 'This is so the forecast knows how much time you have.';
export const KINDS_NONE_YET = "You haven't described your kinds of days yet, so there is nothing to choose from.";
export const KINDS_NOT_SET = 'Not set';
export const COPY_KINDS = 'Same as last week';

export const NO_ITEMS = 'You have no steps or habits to plan yet. When you set up a goal, they show up here.';

export const USE_SET_DAYS = 'Use these days';
export const LEFT_OVER = 'Left over from last week';
export const LEFT_OVER_HELP = 'Unfinished steps move forward, and nothing is cut. Choose a day for it when you are ready.';

export const NEEDS_DAYS_TIME_ZONE = 'Set your time zone to plan your week, so the days are yours. Nothing is planned until you do, and nothing is guessed.';
export const NEEDS_DAYS_DAY_END = 'Set the time your day ends to plan your week, so the days are yours. Nothing is planned until you do, and nothing is guessed.';
export const NEEDS_DAYS_INVALID = 'The time zone or day end you saved is not one Momentum can use. Set it again to plan your week.';

export const LOAD_FAILED_PLAN = 'Could not load your plan.';

export function needsDaysText(plan: Extract<WeekPlanView, { state: 'needs_day_anchors' }>): string {
  if (plan.reason === 'invalid') return NEEDS_DAYS_INVALID;
  return plan.anchor === 'time_zone' ? NEEDS_DAYS_TIME_ZONE : NEEDS_DAYS_DAY_END;
}

// "Oct 26 to Nov 1": the span of the dates shown, with no year and no weekday.
function shortDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// Which stretch of days is on screen. Without a week start it is the next 14 days: dates, not weeks.
export function windowTitle(plan: ReadyPlan): string {
  if (plan.window === 'next_14_days') return 'The next 14 days';
  const span = `${shortDay(plan.start)} to ${shortDay(plan.end)}`;
  if (plan.offset === 0) return `This week · ${span}`;
  if (plan.offset === 1) return `Next week · ${span}`;
  return `In ${plan.offset} weeks · ${span}`;
}

export const PREVIOUS_WEEK = 'Earlier week';
export const NEXT_WEEK = 'Later week';

// What a thing is, in a word a first-time person knows, with its due date when it has one.
export function itemChips(item: PlanItemView): string[] {
  const chips: string[] = [];
  if (item.kind === 'habit') chips.push('Repeats');
  else if (item.kind === 'milestone') chips.push('One-off');
  if (item.dueOn) chips.push(`Due ${formatDay(item.dueOn)}`);
  return chips;
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const setDaysText = (days: number[]): string => `Your set days: ${days.map((d) => WEEKDAY_SHORT[d]).join(', ')}`;

// "Prep checklist, Mon, Nov 2": what a day button is for, read aloud.
export const dayButtonLabel = (title: string, date: string): string => `${title}, ${formatDay(date)}`;
export const kindSelectLabel = (date: string): string => `${formatDay(date)}: what kind of day`;

// The "Your plan" card on home.
export const CARD_HEADING = 'Your plan';
export const CARD_TODAY = 'Today';
export const CARD_NOTHING_TODAY = 'Nothing planned for today yet.';
export const CARD_NOT_PLANNED = "You haven't planned your week yet.";
export const CARD_PLANNED_LATER = 'You have planned days ahead as well.';
export const CARD_CHOOSE_DAY = 'Choose a day';
