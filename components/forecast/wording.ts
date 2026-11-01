// The words the two edit screens behind home's forecast lines use (MOM-138): how much time each kind of day gives (/plan/kinds),
// and a deadline task's size, steps and due date (/task/<id>). The approved words are the owner's of 2026-11-01 and are in the
// MOM-138 Jira comment; they follow the plain-language rule (docs/DOMAIN_MODEL.md §2.1): everyday words only, the person's own
// names for their kinds of days and their titles kept as written. Templates in code, never a model. No internal word (capacity,
// day type, slot, target, milestone, forecast) is ever on screen; tests/forecast-edit-words.test.tsx fails if one is.

import { formatDay } from '@/components/home/wording';
import { hoursText } from '@/lib/forecast/edits';
import type { CapacityUnit } from '@/types/database.types';
import type { LocalDate } from '@/types/scoreboard';

// ---- Both screens ---------------------------------------------------------------------------------------------------------

export const SAVING = 'Saving…';
export const SAVED = 'Saved.';
export const SEE_ON_HOME = 'See it on home.';
export const LOAD_FAILED = 'Could not load that.';

// ---- How much time each kind of day gives (/plan/kinds) -------------------------------------------------------------------

export const KINDS_PAGE_HEADING = 'How much time each kind of day gives';
export const KINDS_PAGE_HELP =
  "For each kind of day, say how much time you usually have. Momentum uses this only to tell whether the days you've set aside look like enough for a deadline. It never fills in a day for you.";
export const NO_KINDS_YET = "You haven't named any kinds of day yet.";
export const NO_USUAL_TIME = 'No usual time yet';
export const HOURS = 'Hours';
export const SESSIONS = 'Sessions';
export const AMOUNT_LABEL = 'How many?';
export const SESSIONS_NOTE = "If you count in sessions, a deadline sized in hours can't be checked against that kind of day.";
// The link from the week plan's own kinds-of-day section.
export const CHANGE_KIND_TIMES = 'Change how much time each kind gives';

export const unitWord = (unit: CapacityUnit, amount: number): string => {
  if (unit === 'hours') return amount === 1 ? 'hour' : 'hours';
  return amount === 1 ? 'session' : 'sessions';
};
export const usuallyText = (unit: CapacityUnit | null, amount: number | null): string =>
  unit === null || amount === null ? NO_USUAL_TIME : `Usually ${hoursText(amount)} ${unitWord(unit, amount)}`;
export const saveKindTime = (name: string): string => `Save time for “${name}”`;

// ---- A deadline task (/task/<id>) -----------------------------------------------------------------------------------------

export const goalLine = (goalTitle: string): string => `Goal: ${goalTitle}`;

export const SIZE_HEADING = 'How big is this?';
export const SIZE_HELP = "A rough guess is fine. It's only used to say whether the days you've set aside look like enough. You can change it any time.";
export const SIZE_LABEL = 'Rough size, in hours';
export const SAVE_SIZE = 'Save size';

export const STEPS_HEADING = 'Steps';
export const STEPS_HELP = "Steps are the smaller pieces of this. A step you've ticked stays as it is.";
export const STEP_DONE = 'Done';
export const RENAME = 'Rename';
export const REMOVE = 'Remove';
export const ADD_STEP_LABEL = 'Add a step';
export const ADD_STEP = 'Add step';
// The two small words the inline rename needs beyond the approved ones.
export const SAVE_NAME = 'Save name';
export const NEVER_MIND = 'Never mind';

export const DATE_HEADING = 'Due date';
export const MOVE_DATE_LABEL = 'Move the date to';
export const MOVE_DATE = 'Move date';
// "Due Fri, Nov 20. You said this date can move." / "... can't move." The weekday and date as everywhere else, never "today".
export const dueLine = (dueOn: LocalDate, today: LocalDate, canMove: boolean): string =>
  `Due ${formatDay(dueOn, today, { relative: false })}. ${canMove ? 'You said this date can move.' : "You said this date can't move."}`;

export const TASK_FINISHED = 'This one is finished.';
