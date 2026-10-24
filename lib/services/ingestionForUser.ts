// Ingestion for code with no signed-in session (MOM-38): a verified webhook, a sync job. Server-side only.
//
// It runs the same engine as ingestActivities() (lib/services/ingestion.ts), with the same checks, using the
// service-role client. That client BYPASSES row level security, so nothing in the database protects one user from
// another here. What does: every query in the shared core filters on the user id it is given, every insert sets
// it, and the task table's same-owner foreign key refuses a goal channel that belongs to someone else. The engine
// only inserts, and every task it creates is 'todo' with no completed_at, so even this client cannot complete
// anything (docs/NINETY_DAY_PLAN_CONTEXT.md §3, §5 rule 6; migration 002 refuses it as well).
//
// This is the only ingestion file that holds the service-role client; ingestion.ts is checked for never using it.

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { IngestionSummary } from '@/types/integrations';
import { refuseBadBatch, runBatch, type Db } from './ingestion';
import type { ServiceResult } from './result';

// A user id that came from verified credentials: a webhook's checked token, a sync job's own record. The type is
// a reminder at every call site, and asVerifiedUserId() is the only way to make one, so a search for it finds
// every place that vouches for an id. Never make one from a request body, a header or an address.
export type VerifiedUserId = string & { readonly __verifiedUserId: true };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// null unless `value` is a UUID. It only checks the shape: the caller is vouching that it resolved the id from
// verified credentials.
export function asVerifiedUserId(value: unknown): VerifiedUserId | null {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? (value as VerifiedUserId) : null;
}

// Ingests a batch of normalized activities for `userId`, with the signed-in path's rules. The batch is checked
// before the service-role client is made, so a bad batch never reaches the database.
export async function ingestActivitiesForUser(
  userId: VerifiedUserId,
  rawActivities: unknown,
): Promise<ServiceResult<IngestionSummary>> {
  if (!asVerifiedUserId(userId)) return { ok: false, error: 'Invalid user.' };
  const refused = refuseBadBatch(rawActivities);
  if (refused) return refused;
  if ((rawActivities as unknown[]).length === 0) return runBatch(null, userId, rawActivities as unknown[]);
  return runBatch(createSupabaseAdminClient() as unknown as Db, userId, rawActivities as unknown[]);
}
