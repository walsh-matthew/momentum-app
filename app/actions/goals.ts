'use server';

import { revalidatePath } from 'next/cache';
import { createGoalChannel } from '@/lib/services/goals';
import type { ServiceResult } from '@/lib/services/result';
import type { GoalChannel } from '@/types/database.types';

// Server Actions are reachable by direct POST, so this takes `unknown` and the service validates
// and authenticates (via the session cookie) before touching the database.
export async function createGoalFromWizard(rawInput: unknown): Promise<ServiceResult<GoalChannel>> {
  const result = await createGoalChannel(rawInput);
  if (result.ok) revalidatePath('/');
  return result;
}
