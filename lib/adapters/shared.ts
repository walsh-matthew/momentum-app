// What every provider adapter shares (MOM-38, docs/INTEGRATIONS_SPEC.md §1): a result type, fixed failure words, and
// one function that makes a request and sorts the outcome. An adapter is an HTTP client plus a normalizer: it calls
// the provider with a credential it is GIVEN, checks the answer with Zod, and returns InboundActivityPayload
// objects. It never touches Supabase, never reads an environment variable, never logs, and never decides what to do
// with an activity (the ingestion engine does). It cannot complete a task: nothing here has a task, a status or a
// completed_at (tests/adapters.test.ts checks the source says so).

import type { InboundActivityPayload } from '@/lib/services/integrations';

// Why a call to a provider failed. Fixed words from our own code: nothing the provider wrote is ever passed on.
//   unauthorized  the credential was refused (401/403): the user has to connect again
//   not_found     the provider has no such thing (404), or the id we were given is not a valid id
//   rate_limited  the provider asked us to slow down (429)
//   unavailable   the provider could not be reached, timed out, or had an error (5xx)
//   bad_response  the provider answered, but not in the shape its documentation promises
export const ADAPTER_FAILURES = ['unauthorized', 'not_found', 'rate_limited', 'unavailable', 'bad_response'] as const;
export type AdapterFailure = (typeof ADAPTER_FAILURES)[number];

export type AdapterResult<T> = { ok: true; data: T } | { ok: false; reason: AdapterFailure };

// One item of a provider's answer that could not be normalized, with a fixed reason. The item itself is dropped; the
// rest of the page is still returned.
export interface RejectedItem {
  index: number;
  reason: string;
}

export interface ActivityPage {
  activities: InboundActivityPayload[];
  rejected: RejectedItem[];
}

// Injectable so tests need no network and no clock.
export interface AdapterDeps {
  fetch?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 10_000;
// A provider answer larger than this is refused unread: nothing legitimate is this big, and it bounds memory.
export const MAX_RESPONSE_CHARS = 2_000_000;

// A credential goes into a header, so it must not hold anything that could end the header and start another.
export const HEADER_SAFE = /^[\x21-\x7e]+$/;

// Makes one request and sorts the outcome. Returns the parsed JSON on a 2xx, or a failure word.
export async function requestJson(
  url: string,
  headers: Record<string, string>,
  deps: AdapterDeps,
): Promise<AdapterResult<unknown>> {
  let response: Response;
  try {
    response = await (deps.fetch ?? fetch)(url, {
      method: 'GET',
      headers: { accept: 'application/json', ...headers },
      signal: AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      // A provider redirecting a request that carries a credential is not something to follow.
      redirect: 'manual',
    });
  } catch {
    return { ok: false, reason: 'unavailable' };
  }

  if (response.status === 401 || response.status === 403) return { ok: false, reason: 'unauthorized' };
  if (response.status === 404) return { ok: false, reason: 'not_found' };
  if (response.status === 429) return { ok: false, reason: 'rate_limited' };
  if (response.status >= 500) return { ok: false, reason: 'unavailable' };
  if (!response.ok) return { ok: false, reason: 'bad_response' };

  try {
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARS) return { ok: false, reason: 'bad_response' };
    return { ok: true, data: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, reason: 'bad_response' };
  }
}

const MS_PER_MINUTE = 60_000;
// A task cannot be longer than a day (the ingestion engine's rule); an adapter does not hand over what it would refuse.
export const MAX_ACTIVITY_MINUTES = 24 * 60;

// Whole minutes between two instants, or a reason it cannot be used. Never negative, never longer than a day.
export function minutesBetween(start: Date, end: Date): { ok: true; minutes: number } | { ok: false; reason: string } {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { ok: false, reason: 'The start or end time is not a date.' };
  const minutes = (end.getTime() - start.getTime()) / MS_PER_MINUTE;
  if (minutes < 0) return { ok: false, reason: 'The activity ends before it starts.' };
  if (minutes > MAX_ACTIVITY_MINUTES) return { ok: false, reason: 'The activity is longer than a day.' };
  return { ok: true, minutes: Math.round(minutes * 100) / 100 };
}
