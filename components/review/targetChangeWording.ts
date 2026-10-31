// The words of the review's edit of a target's numbers (MOM-146). Templates in code, plain language (docs/DOMAIN_MODEL.md §2.1: a
// number is asked for by what it is for, with the person's own counted thing, and "floor", "aspiration" and "target" are never
// said on their own). The questions are the setup's own (lib/setup/numbers.ts), so a number is asked the same way after setup as in it.

import { formatDay } from '@/components/home/wording';
import { countedThing, numberQuestion } from '@/lib/setup/numbers';
import { amount, amountOf } from '@/lib/setup/playback';
import type { TargetDraft } from '@/types/setup';
import type { LocalDate } from '@/types/scoreboard';

// What the words need to know about a target: how the person named it and how it is counted.
export interface ChangeTarget {
  title: string;
  measure: TargetDraft['measure'];
  unit: string | null;
}

// The setup's number questions read a whole draft target; only these fields are used for a weekly or day-slots one.
const asDraft = (t: ChangeTarget): TargetDraft => ({ title: t.title, measure: t.measure, unit: t.unit, period: { kind: 'weekly' } }) as TargetDraft;

export const floorQuestion = (t: ChangeTarget): string => numberQuestion('floor', asDraft(t), null);
export const aspirationQuestion = (t: ChangeTarget): string => numberQuestion('aspiration', asDraft(t), null);
export const counted = (t: ChangeTarget): string => countedThing(asDraft(t));

export const ASPIRATION_HINT = 'You can leave this empty.';
export const DAYS_QUESTION = 'Which days?';
export const DAYS_HINT = 'The days a week counts on.';

// "Now: 3." and, when the week just reviewed is known, "Last week you did 2." The second is the engine's own count.
export const nowLine = (value: number): string => `Now: ${value}.`;
export const lastWeekLine = (n: number): string => `Last week you did ${n}.`;

export const SAVE_BUTTON = 'Save the change';
export const SAVING = 'Saving…';
export const NEVER_MIND = 'Never mind';
export const CHANGE_AGAIN = 'Change it again';

// "4 runs in a hard week, hoping for 6" (the hoping-for part left out when there is no such number).
export function levelsInWords(t: ChangeTarget, floor: number, aspiration: number | null): string {
  const draft = asDraft(t);
  return `${amountOf(draft, floor)} in a hard week${aspiration === null ? '' : `, hoping for ${amount(draft, aspiration)}`}`;
}

// "Mon, Nov 2", never "today" or "tomorrow": the day a change starts is read the same on the day it is saved and after. The year
// is left out when it is the person's this year (their own today).
const startDay = (day: LocalDate, today: LocalDate | null): string => formatDay(day, today, { relative: false });

// What the form says under the numbers, before it is saved.
export const startsLine = (day: LocalDate, today: LocalDate | null): string => `This starts ${startDay(day, today)}. Weeks before that keep the numbers they had.`;

// After it is saved, and on home until it takes effect: the same words, so what was promised is what is shown.
export const savedLine = (day: LocalDate, t: ChangeTarget, floor: number, aspiration: number | null, today: LocalDate | null): string =>
  `Saved. From ${startDay(day, today)}: ${levelsInWords(t, floor, aspiration)}.`;
export const homeChangeLine = (day: LocalDate, t: ChangeTarget, floor: number, aspiration: number | null, today: LocalDate | null): string =>
  `From ${startDay(day, today)}: ${levelsInWords(t, floor, aspiration)}.`;
