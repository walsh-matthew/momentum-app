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
