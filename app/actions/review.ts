'use server';

import { revalidatePath } from 'next/cache';
import { getReviewLine } from '@/lib/services/reviewReflection';
import { recordFinishedReview, type FinishedReview } from '@/lib/services/reviewRecords';
import type { ServiceResult } from '@/lib/services/result';
import type { ReviewLineResult } from '@/types/review';

// The weekly review's two actions (MOM-113 block 3.3). Both run only when the person taps. They take no user and no time: the
// owner is the session, the week is the one the server works out from their own settings, and the facts sent to Claude are
// built on the server from their own rows. A Server Action is reachable by direct POST, so the services authenticate through
// the session cookie and validate everything they are given (`outcome` arrives as `unknown`).

// One plain sentence about the week from Claude, checked by code, or a plain reason there is none. Not stored.
export async function askForReviewLine(): Promise<ServiceResult<ReviewLineResult>> {
  return getReviewLine();
}

// Finishes this week's review, once, with the person's choice about the one adjustment it offered (or none when nothing was offered).
export async function finishReview(outcome: unknown): Promise<ServiceResult<FinishedReview>> {
  const result = await recordFinishedReview(outcome);
  if (result.ok) {
    revalidatePath('/review');
    revalidatePath('/');
  }
  return result;
}
