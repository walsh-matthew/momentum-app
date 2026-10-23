'use server';

import { revalidatePath } from 'next/cache';
import { createGoalWithWeekOnePlan, generateWeekOnePlan } from '@/lib/services/tasks';
import type { CreatedGoalWithPlan, GeneratedWeekOnePlan } from '@/lib/services/tasks';
import type { ServiceResult } from '@/lib/services/result';

// Runs only when the user clicks "Generate" in the goal wizard; it is never called on load or from an
// effect. Server Actions are reachable by direct POST, so this takes `unknown` and the service validates
// the answers, authenticates, rate-limits, and checks the model's plan against the schema. It writes
// nothing to the database.
export async function generateWeekOnePlanAction(rawInput: unknown): Promise<ServiceResult<GeneratedWeekOnePlan>> {
  return generateWeekOnePlan(rawInput);
}

// Runs only when the user confirms the wizard. Takes `unknown` for the same reason: the service
// validates both arguments again, and saves the goal and its week 1 tasks together or not at all.
export async function createGoalWithPlanAction(
  rawInput: unknown,
  rawPlan: unknown,
): Promise<ServiceResult<CreatedGoalWithPlan>> {
  const result = await createGoalWithWeekOnePlan(rawInput, rawPlan);
  if (result.ok) revalidatePath('/');
  return result;
}
