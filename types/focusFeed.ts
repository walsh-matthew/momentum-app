// What the focus card area shows (MOM-36): the task to do now, the ones queued behind it, and the ones the
// user just finished, which they can reopen. Derived from the user's own tasks; nothing here is stored.

import type { MicroTask } from './database.types';

// How many unfinished tasks to list after the focus task, and how many finished ones to offer for undo.
export const UP_NEXT_LIMIT = 5;
export const RECENTLY_DONE_LIMIT = 3;

export interface FocusFeed {
  // The earliest unfinished task, or null when nothing is left.
  focus: MicroTask | null;
  // The next unfinished tasks after `focus`, in the same order, at most UP_NEXT_LIMIT.
  upNext: MicroTask[];
  // The most recently completed tasks, newest first, at most RECENTLY_DONE_LIMIT.
  recentlyDone: MicroTask[];
}

export const EMPTY_FOCUS_FEED: FocusFeed = { focus: null, upNext: [], recentlyDone: [] };
