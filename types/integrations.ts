// Integration accounts, connection status and the token contracts (docs/INTEGRATIONS_SPEC.md §3, §5).
//
// Two kinds of type live here, and the split matters:
// - IntegrationAccount and ConnectionStatus are safe for client components: they describe a
//   connection and carry no secret.
// - The token shapes (OAuthTokenResponse, AccessToken) hold secrets. They exist only in server code
//   (lib/services/integrations.ts) and must never be passed to a client component or returned from a
//   Server Action. Tokens are stored in integration_credentials, which no browser role can read
//   (migration 005).

import { z } from 'zod';
import {
  CREDENTIAL_STATUSES,
  INTEGRATION_AUTH_TYPES,
  type ExternalProviderId,
  type IntegrationAuthType,
} from './database.types';

// ---------------------------------------------------------------------------
// Connection status (client-safe)
// ---------------------------------------------------------------------------

// 'not_connected' means no credential is stored. The rest mirror integration_credentials.status.
export const CONNECTION_STATUSES = ['not_connected', ...CREDENTIAL_STATUSES] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

// What a card or settings page may know about a connection. No token, no key, no refresh token.
export interface IntegrationAccount {
  provider: ExternalProviderId;
  // null when not connected.
  authType: IntegrationAuthType | null;
  status: ConnectionStatus;
  connectedAt: string | null;
  lastRefreshedAt: string | null;
  // When the current access token stops working. null for API keys and when not connected.
  expiresAt: string | null;
  scopes: string[];
  // Short, fixed wording set by our own code (never provider text or a token). null when healthy.
  lastError: string | null;
}

export const IntegrationAccountSchema = z.strictObject({
  provider: z.string().min(1),
  authType: z.enum(INTEGRATION_AUTH_TYPES).nullable(),
  status: z.enum(CONNECTION_STATUSES),
  connectedAt: z.string().nullable(),
  lastRefreshedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  scopes: z.array(z.string()),
  lastError: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Connect flow results (client-safe)
// ---------------------------------------------------------------------------

// Every way the Google consent flow can end, and the only words that ever travel in an address or a log
// (lib/services/googleOAuth.ts, MOM-62). The Connected Apps page turns each into a sentence
// (lib/integrations/connectNotices.ts). No token, no code and no provider wording is ever one of these.
export const CONNECT_OUTCOMES = [
  'connected',
  'denied',
  'expired',
  'bad_state',
  'scope',
  'failed',
  'not_configured',
  'signed_out',
] as const;
export type ConnectOutcome = (typeof CONNECT_OUTCOMES)[number];

// What a connect form (the Hevy key) shows after it runs. Never holds the key: a rejected key is not echoed back.
export interface ConnectFormState {
  error: string | null;
  notice: string | null;
}

// ---------------------------------------------------------------------------
// Token contracts (server only)
// ---------------------------------------------------------------------------

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

function parseWith<T>(schema: z.ZodType<T>, raw: unknown, fallback: string): ParseResult<T> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  // Report which field was wrong and why, never the value: it may be a secret.
  return { ok: false, error: parsed.error.issues.map((i) => i.message).join(' ') || fallback };
}

const MAX_TOKEN_LENGTH = 4096;

// A successful response from a provider's token endpoint (RFC 6749 §5.1), for the connect step and
// for a refresh. External JSON is untrusted, so it is validated before anything is stored. Unknown
// fields (id_token, and so on) are ignored, not stored.
export const OAuthTokenResponseSchema = z.object({
  access_token: z.string().min(1, 'The provider sent no access token.').max(MAX_TOKEN_LENGTH),
  // Absent on a refresh when the provider does not rotate it, and sometimes on a repeat consent.
  refresh_token: z.string().min(1).max(MAX_TOKEN_LENGTH).optional(),
  // Seconds until the access token expires.
  expires_in: z.number().int().positive().max(60 * 60 * 24 * 365).optional(),
  scope: z.string().max(2048).optional(),
  token_type: z.string().refine((t) => t.toLowerCase() === 'bearer', 'The provider sent an unsupported token type.'),
});
export type OAuthTokenResponse = z.infer<typeof OAuthTokenResponseSchema>;

// An error from the token endpoint (RFC 6749 §5.2). Only the code is read.
export const OAuthErrorResponseSchema = z.object({ error: z.string().max(200) });

// A pasted API key (Hevy): printable ASCII with no spaces, so a stray newline or a pasted sentence is
// rejected instead of stored.
export const ApiKeySchema = z
  .string()
  .trim()
  .min(8, 'That does not look like an API key.')
  .max(512, 'That does not look like an API key.')
  .regex(/^[\x21-\x7e]+$/, 'An API key has no spaces or special characters.');

export const parseOAuthTokenResponse = (raw: unknown) =>
  parseWith(OAuthTokenResponseSchema, raw, 'The provider sent an unexpected response.');
export const parseApiKey = (raw: unknown) => parseWith(ApiKeySchema, raw, 'Invalid API key.');

// What server code gets back to call a provider with. Holds a secret.
export interface AccessToken {
  // 'bearer' goes in `Authorization: Bearer ...`; 'api_key' goes where the provider wants it (Hevy:
  // the `api-key` header).
  kind: 'bearer' | 'api_key';
  value: string;
  // null for API keys.
  expiresAt: string | null;
}

// ---------------------------------------------------------------------------
// Ingestion results (lib/services/ingestion.ts, MOM-40)
// ---------------------------------------------------------------------------
// What happened to each activity in a batch. Safe for client components: they name the item and the
// outcome, and never echo a payload back.

// Why a well-formed activity was set aside. Each is a fixed, deterministic rule, so the same activity
// always gets the same answer.
export const INGESTION_SKIP_REASONS = [
  'unsupported_provider',
  'activity_not_completed',
  'no_matching_channel',
  'channel_not_active',
  'before_plan_start',
  'after_plan_end',
] as const;
export type IngestionSkipReason = (typeof INGESTION_SKIP_REASONS)[number];

// created: a new unfinished task now carries this activity. duplicate: that provider and id already
// made a task, so nothing changed. skipped: valid but not ingestible (see the reason). invalid: failed
// the payload contract. failed: a valid activity that could not be saved; try the batch again.
export const INGESTION_OUTCOMES = ['created', 'duplicate', 'skipped', 'invalid', 'failed'] as const;
export type IngestionOutcome = (typeof INGESTION_OUTCOMES)[number];

export interface IngestionItemResult {
  // Position in the submitted batch.
  index: number;
  provider: string | null;
  externalId: string | null;
  outcome: IngestionOutcome;
  // Set for skipped (an IngestionSkipReason) and invalid (what was wrong with the payload).
  reason: string | null;
  taskId: string | null;
  weekOf: number | null;
}

export interface IngestionSummary {
  created: number;
  duplicate: number;
  skipped: number;
  invalid: number;
  failed: number;
  results: IngestionItemResult[];
}

// ---------------------------------------------------------------------------
// Synced entries (lib/services/syncedEntries.ts, MOM-109)
// ---------------------------------------------------------------------------
// What happened to each synced record, per target it was bound to. Safe for client components: they name the
// record and the outcome, and never echo a payload back.

// Why a well-formed record made no entry. Each is a fixed rule, so the same record always gets the same answer.
export const SYNC_SKIP_REASONS = [
  'no_source',
  'no_bound_target',
  'measure_not_supported',
  'unit_not_supported',
  'no_value_for_measure',
] as const;
export type SyncSkipReason = (typeof SYNC_SKIP_REASONS)[number];

// The words a screen can show for each reason (principle 5: say what happened, plainly).
export const SYNC_SKIP_MESSAGES: Record<SyncSkipReason, string> = {
  no_source: 'This app is not set up as a source yet, so nothing was counted.',
  no_bound_target: 'No target uses this app yet, so nothing was counted. Bind it to a target to count it.',
  measure_not_supported: 'This target counts checklist steps, which a workout cannot tick.',
  unit_not_supported: "This target's unit is not one a workout can be measured in, so nothing was counted.",
  no_value_for_measure: 'The workout has nothing to count for this target, so nothing was counted.',
};

// created: a new entry now holds this record. updated: the source changed the record and the entry followed.
// unchanged: the entry already matched. skipped: valid but made no entry (see the reason). invalid: failed the
// payload contract. failed: could not be saved; sync again.
export const SYNC_OUTCOMES = ['created', 'updated', 'unchanged', 'skipped', 'invalid', 'failed'] as const;
export type SyncOutcome = (typeof SYNC_OUTCOMES)[number];

export interface SyncedEntryResult {
  // Position in the submitted batch.
  index: number;
  externalId: string | null;
  // The target the entry is for. Null when the record never reached a target.
  targetId: string | null;
  outcome: SyncOutcome;
  // A SyncSkipReason for skipped; what was wrong with the payload for invalid.
  reason: string | null;
  // Plain wording for the person, set for skipped and failed.
  message: string | null;
}

export interface SyncedEntrySummary {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  invalid: number;
  failed: number;
  results: SyncedEntryResult[];
}
