'use server';

import { revalidatePath } from 'next/cache';
import { saveTargetChange } from '@/lib/services/targetChanges';
import type { SavedTargetChange } from '@/types/review';
import type { ServiceResult } from '@/lib/services/result';

// The weekly review's edit of a target's numbers (MOM-146). It runs only when the person taps "Save the change". It takes no user and no
// date: the owner is the session and the day it starts is worked out on the server from their own settings. A Server Action is reachable by
// direct POST, so the service authenticates through the session cookie and validates everything it is given (`input` arrives as `unknown`).
export async function changeTarget(input: unknown): Promise<ServiceResult<SavedTargetChange>> {
  const result = await saveTargetChange(input);
  if (result.ok) {
    revalidatePath('/review');
    revalidatePath('/');
  }
  return result;
}
