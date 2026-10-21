'use server';

import { revalidatePath } from 'next/cache';
import { setTaskStatus } from '@/lib/services/tasks';
import type { ServiceResult } from '@/lib/services/result';
import type { MicroTask } from '@/types/database.types';

// Server Actions are reachable by direct POST, so this takes `unknown` and the service validates
// and authenticates (via the session cookie). Only a user's own toggle reaches this action;
// nothing in the app calls it on their behalf.
export async function toggleTaskStatus(taskId: unknown, status: unknown): Promise<ServiceResult<MicroTask>> {
  const result = await setTaskStatus(taskId, status);
  if (result.ok) revalidatePath('/');
  return result;
}
