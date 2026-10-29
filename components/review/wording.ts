// The words the weekly review's recap writes around the engine's facts (MOM-113 block 3.2). Templates in code, never a
// model: every number comes from the engine's own facts, and Claude adds nothing (docs/DOMAIN_MODEL.md §3.3 and §4.2
// principles 5 and 9). The person's titles are kept exactly as they wrote them, and a celebration is never put next to a
// request (principle 8): the recap asks for nothing.

import { formatDay, formatNumber } from '@/components/home/wording';
import type { RecapChange, RecapCrossing } from '@/types/review';
import type { Level, LocalDate } from '@/types/scoreboard';

const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const fullWeekdayName = (weekday: number): string => WEEKDAY_FULL[weekday] ?? '';
export const fullDayName = (day: LocalDate): string => WEEKDAY_FULL[new Date(`${day}T00:00:00Z`).getUTCDay()];

// When a review was finished: "today", "yesterday", or "on Thu, Oct 29".
export function finishedWhen(day: LocalDate, today: LocalDate | null): string {
  const words = formatDay(day, today);
  return words === 'today' || words === 'yesterday' ? words : `on ${words}`;
}

// "Mon, Oct 19 to Sun, Oct 25", the year only when it is not this year.
export const weekLabel = (window: { start: LocalDate; end: LocalDate }, today: LocalDate | null = null): string =>
  `${formatDay(window.start, today, { relative: false })} to ${formatDay(window.end, today, { relative: false })}`;

// Said when the review closes the week early (the planning day is the week's own last day, RAID I-11): the week is counted
// through today, so an entry logged later today is not in this recap. It shows under "Since this recap" once the review
// is finished. Pinned in tests/review-screen.test.tsx.
export function closedEarlyLine(today: LocalDate): string {
  return `This recap counts through today, ${fullDayName(today)}. Anything you log later today will show below under Since this recap.`;
}

// The same fact on a finished review, read back later.
export function closedEarlyReviewedLine(window: { end: LocalDate }): string {
  return `This recap counted through ${fullDayName(window.end)}, the last day of the week. Anything logged for a day in that week after you finished shows below under Since this recap.`;
}

// Where a target stood, in words: never a bare level name, and a target that is not graded never gets a level word.
export function levelWords(value: { level: Level | null; graded: boolean }): string {
  if (!value.graded || value.level === null) return 'tracked, not judged';
  return { none: 'not started', partway: 'partway', floor: 'floor met', aspiration: 'aspiration reached' }[value.level];
}

// One line under "Since this recap": what the recap said, what the engine reads now for the same week, and why. Both
// numbers are the engine's; the record itself is not changed.
export function changeLine(change: RecapChange): string {
  const unit = change.unit ? ` ${change.unit}` : '';
  return `${change.title}: it now reads ${formatNumber(change.now.counted)}${unit} (${levelWords(change.now)}). The recap said ${formatNumber(change.said.counted)}${unit} (${levelWords(change.said)}). An entry logged later for a day in that week changed it.`;
}

export function crossingLine(crossing: RecapCrossing, today: LocalDate | null = null): string {
  const day = formatDay(crossing.on, today, { relative: false });
  switch (crossing.kind) {
    case 'floor':
      return `Reached your floor on ${day}`;
    case 'aspiration':
      return `Reached your aspiration on ${day}`;
    case 'block_end':
      return `Finished your block on ${day}`;
  }
}
