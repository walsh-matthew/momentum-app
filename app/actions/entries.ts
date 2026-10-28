'use server';

import { revalidatePath } from 'next/cache';
import {
  logMinutes,
  logNumber,
  logTap,
  logTimer,
  removeEntry,
  restoreEntry,
  tickStep,
  untickStep,
  type LogResult,
} from '@/lib/services/entries';
import type { ServiceResult } from '@/lib/services/result';

// Where the controls are for now (MOM-110). MOM-112 moves them to home and changes this one line.
const LOG_PATH = '/log';

type EntryResult = ServiceResult<{ entryId: string }>;

// Every action here runs only when the person taps, types, stops a timer or ticks: nothing in the app logs, removes
// or restores an entry on their behalf. They take `unknown` because a Server Action is reachable by direct POST, so
// the service validates, authenticates through the session cookie and scopes every write to the person's own rows.
// None of them passes an instant or a user: an entry's time is the server's clock, or noon on a day the person chose,
// and its owner is the session. The only thing a person sends about time is `day`, a local date (YYYY-MM-DD), which
// the service reads in their own time zone and refuses if it is not real, in the future or more than 7 days back.

async function revalidated<T extends EntryResult | LogResult>(result: T): Promise<T> {
  if (result.ok) revalidatePath(LOG_PATH);
  return result;
}

export async function logTapEntry(targetId: unknown, day?: unknown): Promise<LogResult> {
  return revalidated(await logTap(targetId, { when: day }));
}

export async function logNumberEntry(targetId: unknown, value: unknown, day?: unknown): Promise<LogResult> {
  return revalidated(await logNumber(targetId, value, { when: day }));
}

// Typed minutes on a time target: whole minutes, as typed.
export async function logMinutesEntry(targetId: unknown, minutes: unknown, day?: unknown): Promise<LogResult> {
  return revalidated(await logMinutes(targetId, minutes, { when: day }));
}

// `startedAt` is when the timer was started, kept in the person's browser. The stop is the server's clock. A timer
// takes no day: it logs the time that ran.
export async function logTimerEntry(targetId: unknown, startedAt: unknown): Promise<LogResult> {
  return revalidated(await logTimer(targetId, startedAt));
}

// `day` matters only for a step's first tick; a tick after an un-tick keeps the entry's first time.
export async function tickChecklistStep(stepId: unknown, day?: unknown): Promise<LogResult> {
  return revalidated(await tickStep(stepId, { when: day }));
}

export async function untickChecklistStep(stepId: unknown): Promise<EntryResult> {
  return revalidated(await untickStep(stepId));
}

export async function removeLoggedEntry(entryId: unknown): Promise<EntryResult> {
  return revalidated(await removeEntry(entryId));
}

export async function restoreLoggedEntry(entryId: unknown): Promise<EntryResult> {
  return revalidated(await restoreEntry(entryId));
}
