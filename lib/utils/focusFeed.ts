// Builds the focus card's feed from the user's tasks (MOM-36). Pure: no database, no clock, no writes. It
// only orders and slices what it is given, so it can never complete, reopen or change a task
// (docs/NINETY_DAY_PLAN_CONTEXT.md §3, §5 rule 6). Completion and undo are the user's own clicks.

import type { MicroTask } from '@/types/database.types';
import { RECENTLY_DONE_LIMIT, UP_NEXT_LIMIT, type FocusFeed } from '@/types/focusFeed';

// Timestamps from one source share a format, but millisecond parsing alone would call two tasks created
// within the same millisecond equal, so equal parses fall back to comparing the text.
function compareTimestamps(a: string, b: string): number {
  const diff = Date.parse(a) - Date.parse(b);
  if (Number.isFinite(diff) && diff !== 0) return diff < 0 ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

// The order the plan is worked in, matching listMicroTasks: earliest week first, then the earliest due
// date (undated tasks last), then the oldest. The id is only a final tie-break so the order is stable
// when the database gives several tasks the same created_at (seed_career_pivot and the wizard's week 1 plan insert them together).
export function compareUnfinished(a: MicroTask, b: MicroTask): number {
  if (a.week_of !== b.week_of) return a.week_of - b.week_of;
  if (a.due_date !== b.due_date) {
    if (a.due_date === null) return 1;
    if (b.due_date === null) return -1;
    return a.due_date < b.due_date ? -1 : 1;
  }
  const created = compareTimestamps(a.created_at, b.created_at);
  if (created !== 0) return created;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// Newest completion first. completed_at is set exactly when a task is done (migration 001), so it is
// only missing on bad data; such a task sorts last rather than breaking the list.
function compareRecentlyDone(a: MicroTask, b: MicroTask): number {
  if (a.completed_at !== b.completed_at) {
    if (a.completed_at === null) return 1;
    if (b.completed_at === null) return -1;
    return compareTimestamps(b.completed_at, a.completed_at);
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildFocusFeed(tasks: readonly MicroTask[]): FocusFeed {
  const unfinished = tasks.filter((t) => t.status === 'todo').sort(compareUnfinished);
  const recentlyDone = tasks.filter((t) => t.status === 'done').sort(compareRecentlyDone);
  return {
    focus: unfinished[0] ?? null,
    upNext: unfinished.slice(1, 1 + UP_NEXT_LIMIT),
    recentlyDone: recentlyDone.slice(0, RECENTLY_DONE_LIMIT),
  };
}
