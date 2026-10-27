'use server';

import { revalidatePath } from 'next/cache';
import { logNumber, logTap, logTimer, removeEntry, restoreEntry, tickStep, untickStep } from '@/lib/services/entries';
import type { ServiceResult } from '@/lib/services/result';

// Where the controls are for now (MOM-110). MOM-112 moves them to home and changes this one line.
const LOG_PATH = '/log';

type EntryResult = ServiceResult<{ entryId: string }>;

// Every action here runs only when the person taps, types, stops a timer or ticks: nothing in the app logs, removes
// or restores an entry on their behalf. They take `unknown` because a Server Action is reachable by direct POST, so
// the service validates, authenticates through the session cookie and scopes every write to the person's own rows.
// None of them passes a time or a user: an entry's time is the server's clock, and its owner is the session.

async function revalidated(result: EntryResult): Promise<EntryResult> {
  if (result.ok) revalidatePath(LOG_PATH);
  return result;
}

export async function logTapEntry(targetId: unknown): Promise<EntryResult> {
  return revalidated(await logTap(targetId));
}

export async function logNumberEntry(targetId: unknown, value: unknown): Promise<EntryResult> {
  return revalidated(await logNumber(targetId, value));
}

// `startedAt` is when the timer was started, kept in the person's browser. The stop is the server's clock.
export async function logTimerEntry(targetId: unknown, startedAt: unknown): Promise<EntryResult> {
  return revalidated(await logTimer(targetId, startedAt));
}

export async function tickChecklistStep(stepId: unknown): Promise<EntryResult> {
  return revalidated(await tickStep(stepId));
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
