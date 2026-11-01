// The start question for a target added to a goal the person already has (MOM-132 part 2, docs/DOMAIN_MODEL.md §1.3 "Start"). Code
// proposes; the person chooses. Pure: dates are calendar dates (YYYY-MM-DD), read as such, so no time zone moves one.
//
// - The proposal is the person's own today. Next week's start is a second choice only when their week start is saved and today is not it.
// - A start before the goal started, or after it ends, is refused in words before anything is sent (the database refuses it too,
//   MS005). A target made later is graded only from its start, and never counts a week before it.
// - A start that is partway through a week shows that first week but never counts it as a miss; it is graded from the next whole week.

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

const msOf = (iso: string): number => {
  const m = ISO.exec(iso);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : Number.NaN;
};
const isoOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

// The weekday of a date as Momentum numbers it: Monday is 1, Sunday is 7.
export function weekdayOf(iso: string): number {
  const day = new Date(msOf(iso)).getUTCDay();
  return day === 0 ? 7 : day;
}

// The first day of the next week: the next date after `today` that falls on the person's saved week start. Null when no week start is
// saved (nothing is assumed), and when today is itself the week's first day, since "today" is then already the start of a week.
export function nextWeekStart(today: string, weekStart: number | null): string | null {
  if (weekStart === null || Number.isNaN(msOf(today)) || weekdayOf(today) === weekStart) return null;
  const ahead = (weekStart - weekdayOf(today) + 7) % 7;
  return isoOf(msOf(today) + ahead * MS_PER_DAY);
}

// Whether a start falls partway through a week. False when no week start is saved: nothing is assumed about the person's week.
export const startsMidWeek = (date: string, weekStart: number | null): boolean => weekStart !== null && weekdayOf(date) !== weekStart;

export type StartProblem = 'too_early' | 'too_late';

// What is wrong with a chosen start, given the goal's own dates. A goal with no end date has no latest start.
export function startProblem(date: string, goal: { startDate: string; endDate: string | null }): StartProblem | null {
  if (date < goal.startDate) return 'too_early';
  if (goal.endDate !== null && date > goal.endDate) return 'too_late';
  return null;
}
