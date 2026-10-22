'use server';

import { revalidatePath } from 'next/cache';
import { applyRebalance, requestModelRebalance, setTaskStatus } from '@/lib/services/tasks';
import type { ServiceResult } from '@/lib/services/result';
import type { MicroTask } from '@/types/database.types';
import type { RebalanceApplyResult, RebalanceProposalView } from '@/types/rebalance';

// Server Actions are reachable by direct POST, so this takes `unknown` and the service validates
// and authenticates (via the session cookie). Only a user's own toggle reaches this action;
// nothing in the app calls it on their behalf.
export async function toggleTaskStatus(taskId: unknown, status: unknown): Promise<ServiceResult<MicroTask>> {
  const result = await setTaskStatus(taskId, status);
  if (result.ok) revalidatePath('/');
  return result;
}

// Runs only when the user clicks Apply in the rebalance drawer; nothing applies a proposal on their
// behalf. Takes `unknown` for the same reason as above: the service validates the proposal against
// the schema (no delete action exists), authenticates, and re-checks each task before moving it.
export async function applyRebalanceProposal(rawProposal: unknown): Promise<ServiceResult<RebalanceApplyResult>> {
  const result = await applyRebalance(rawProposal);
  if (result.ok && result.data.moved.length > 0) revalidatePath('/');
  return result;
}

// Runs only when the user clicks "Ask Claude" in the rebalance drawer; it is never called on a page load.
// It takes no input at all, so there is nothing for a direct POST to tamper with: the service
// authenticates, loads the signed-in user's own plan, rate-limits, and returns a proposal that has
// passed TaskRebalanceSchema and been checked against their tasks. It changes nothing in the database.
export async function askClaudeToRebalance(): Promise<ServiceResult<RebalanceProposalView>> {
  return requestModelRebalance();
}
