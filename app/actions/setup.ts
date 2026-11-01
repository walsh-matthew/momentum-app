'use server';

import type { ServiceResult } from '@/lib/services/result';
import { addApprovedGoals, addApprovedTargets, fillQuickPathItem, saveApprovedSetup, takeAddTurn, takeSetupTurn } from '@/lib/services/setup';
import type { SetupSession } from '@/types/setup';
import type { QuickPathState, SetupAdded, SetupSaved, SetupTurnView } from '@/types/setupScreen';

// Server Actions are reachable by direct POST, so both take `unknown`: the service parses the conversation against the
// schemas, bounds its size, authenticates through the session cookie and never takes a user from the request.

// Runs when the person starts a setup or answers a question: the one place the app asks Claude for a setup turn. Nothing is
// stored; the conversation travels in the request (the owner's 2026-10-27 decision).
export async function askSetupTurn(session: unknown): Promise<ServiceResult<SetupTurnView>> {
  return takeSetupTurn(session);
}

// Runs only when the person taps Save on the final confirmation, or on the quick path screen (`quickPath` true). It saves
// everything they approved in one transaction, or nothing. First setup only.
//
// It deliberately does not call revalidatePath: Next refreshes the page the person is on after a Server Action that does, and
// the refreshed /setup page (which sees that setup is already done) would replace the "Your setup is saved" message at once.
// The pages that show the new goals, / and /log, render per request, so they need no revalidation.
export async function saveSetup(session: unknown, quickPath: unknown): Promise<ServiceResult<SetupSaved>> {
  return saveApprovedSetup(session, quickPath);
}

// Adding to a setup that is already saved (MOM-132 part 2). Each takes `unknown` and leaves the parsing, the sign-in check and every
// read of the person's own rows to the service.

// The next turn of a conversation that adds a goal, or targets for a goal the person has: the request holds the conversation and which
// of the two it is (and the goal's id). Nothing is stored.
export async function askAddTurn(request: unknown): Promise<ServiceResult<SetupTurnView>> {
  return takeAddTurn(request);
}

// Runs only when the person taps "Add it" on a goal's final card. `request` holds the one id the browser made for this approval, so a
// double tap saves once. No revalidatePath, as with the first save: the pages that show goals render per request.
export async function addGoalsAction(session: unknown, request: unknown): Promise<ServiceResult<SetupAdded>> {
  return addApprovedGoals(session, request);
}

// The same for targets: the request also holds the goal's id and the start the person chose.
export async function addTargetsAction(session: unknown, request: unknown): Promise<ServiceResult<SetupAdded>> {
  return addApprovedTargets(session, request);
}

// Runs when the person sets one missing item on the quick path card: no Claude call, nothing stored. It answers with the session
// that holds the value and the card's new state, or why the value was refused.
export async function fillQuickPathItemAction(request: unknown): Promise<ServiceResult<QuickPathState & { session: SetupSession }>> {
  return fillQuickPathItem(request);
}
