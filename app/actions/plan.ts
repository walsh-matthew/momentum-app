'use server';

import { revalidatePath } from 'next/cache';
import { clearDayKind, copyLastWeeksKinds, planItemOnDay, planSetDays, removeItemFromDay, setDayKind } from '@/lib/services/weekPlan';
import type { PlanChange } from '@/types/plan';

// Every action here runs only when the person taps: nothing in the app puts a thing on a day, or says what kind of day a
// date is, on their behalf. They take `unknown` because a Server Action is reachable by direct POST, so the service
// validates, authenticates through the session cookie and scopes every write to the person's own rows. None of them
// passes a user or a time: the owner is the session, and the only thing a person sends about time is a date (YYYY-MM-DD)
// and the week asked for, which the service reads in their own time zone and refuses if it is not real or has passed.

async function revalidated(result: PlanChange): Promise<PlanChange> {
  if (result.ok) {
    revalidatePath('/plan');
    revalidatePath('/');
  }
  return result;
}

export async function planItem(itemId: unknown, date: unknown): Promise<PlanChange> {
  return revalidated(await planItemOnDay(itemId, date));
}

export async function unplanItem(itemId: unknown, date: unknown): Promise<PlanChange> {
  return revalidated(await removeItemFromDay(itemId, date));
}

export async function chooseDayKind(date: unknown, dayTypeId: unknown): Promise<PlanChange> {
  return revalidated(await setDayKind(date, dayTypeId));
}

export async function clearKindOfDay(date: unknown): Promise<PlanChange> {
  return revalidated(await clearDayKind(date));
}

export async function copyKindsFromLastWeek(week: unknown): Promise<PlanChange> {
  return revalidated(await copyLastWeeksKinds(week));
}

export async function planHabitSetDays(itemId: unknown, week: unknown): Promise<PlanChange> {
  return revalidated(await planSetDays(itemId, week));
}
