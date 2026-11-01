'use server';

import { revalidatePath } from 'next/cache';
import { addTaskStep, moveTaskDate, removeTaskStep, renameTaskStep, setDayKindTime, setTaskSize } from '@/lib/services/forecastEdits';
import type { EditChange } from '@/types/forecastEdits';

// The edits behind home's deadline forecast (MOM-138). Every action here runs only when the person taps: nothing in the app
// sets a size, a step, a date or a usual time on their behalf. They take `unknown` because a Server Action is reachable by direct
// POST, so the service validates, authenticates through the session cookie and scopes every write to the person's own rows.
// None of them passes a user or a time: the owner is the session, and the only thing a person sends about time is a day
// (YYYY-MM-DD), which the service reads against their own today and refuses if it is not real or has passed.

async function revalidated(result: EditChange): Promise<EditChange> {
  if (result.ok) {
    revalidatePath('/');
    revalidatePath('/plan');
  }
  return result;
}

export async function changeKindTime(dayTypeId: unknown, unit: unknown, amount: unknown): Promise<EditChange> {
  return revalidated(await setDayKindTime(dayTypeId, unit, amount));
}

export async function changeTaskSize(itemId: unknown, hours: unknown): Promise<EditChange> {
  return revalidated(await setTaskSize(itemId, hours));
}

export async function changeTaskDate(itemId: unknown, date: unknown): Promise<EditChange> {
  return revalidated(await moveTaskDate(itemId, date));
}

export async function addStep(itemId: unknown, title: unknown): Promise<EditChange> {
  return revalidated(await addTaskStep(itemId, title));
}

export async function renameStep(stepId: unknown, title: unknown): Promise<EditChange> {
  return revalidated(await renameTaskStep(stepId, title));
}

export async function removeStep(stepId: unknown): Promise<EditChange> {
  return revalidated(await removeTaskStep(stepId));
}
