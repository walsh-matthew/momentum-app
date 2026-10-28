'use server';

import type { ServiceResult } from '@/lib/services/result';
import { saveApprovedSetup, takeSetupTurn } from '@/lib/services/setup';
import type { SetupSaved, SetupTurnView } from '@/types/setupScreen';

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
