// Limits, caps and usage logging for every Claude call (MOM-73, docs/LLM_GOVERNANCE.md). Server-side only.
//
// Both places the app calls Claude (the rebalance proposal and the wizard's week 1 plan) go through
// runWithinBudget(). It does three things around the call:
//   1. BEFORE: reserve_llm_call() (migration 011) checks three limits in the database and, if they pass, inserts a
//      'pending' usage row in the same transaction. The limits are therefore the same for every serverless instance
//      and survive a cold start. If one trips, the model is NOT called and the result says which one and when the
//      same ask could next pass.
//   2. DURING: the model call itself, untouched.
//   3. AFTER: the pending row is filled in with the outcome, the token counts the API reported and the latency.
// The usage table has no prompt or answer column, and nothing here passes one: only counts, a model id and an outcome.
//
// It uses the SERVICE-ROLE client, which bypasses row level security, because only server code may reserve calls: if a
// signed-in browser could, one account could use up the shared cap and switch Claude off for everyone. So the user id
// is a parameter that the caller took from the verified session (getUser()), never from a request body, and every
// write here is keyed on it. This is the only module that holds that client for the Claude path; lib/services/tasks.ts
// never imports it (tests/week-one-plan-source.test.ts checks).
//
// Failing closed: if the database cannot be reached or answers in a shape we do not recognise, the model is not
// called. A spend cap that stops working when its counter is down is not a cap.
//
// Nothing here reads or writes a task, a status or completed_at.

import 'server-only';
import { z } from 'zod';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ModelUsage } from '@/lib/ai/usage';
import type { LlmFeature, LlmOutcome, Tables } from '@/types/database.types';
import type { ServiceResult } from './result';

// The limits. Placeholders to be tuned once real usage has been measured (docs/LLM_GOVERNANCE.md): they are a ceiling
// against a runaway, not a forecast. The caps count calls, not tokens, because a count can be enforced before the call
// is made; the tokens are logged so the cost can be worked out and the caps set from it. The 24 hour window is a
// rolling window fixed in the SQL function, so it is not a setting here.
export const LLM_LIMITS = {
  // At least this long between one user's calls.
  minIntervalSeconds: 20,
  // Calls per user in any 24 hours.
  userDailyCap: 20,
  // Calls by everyone together in any 24 hours.
  overallDailyCap: 200,
} as const;

export type LlmLimits = { [K in keyof typeof LLM_LIMITS]: number };

// Which limit stopped a call. Same words as the `reason` reserve_llm_call() returns.
export const LLM_LIMIT_KINDS = ['too_soon', 'user_daily', 'overall_daily'] as const;
export type LlmLimit = (typeof LLM_LIMIT_KINDS)[number];

// What the caller gets back. 'limited' says which limit and how long until the same ask could pass; 'unchecked' means
// the limits could not be checked, so no call was made.
export type BudgetedCall<T> =
  | { kind: 'answered'; result: T }
  | { kind: 'limited'; limit: LlmLimit; retryAfterSeconds: number }
  | { kind: 'unchecked' };

// How a finished call is recorded.
export interface ModelCallReport {
  outcome: LlmOutcome;
  usage: ModelUsage | null;
}

// The shape of a model result as lib/ai/rebalance.ts and lib/ai/taskPlan.ts return it.
export type ModelResultLike =
  | { ok: true; usage?: ModelUsage | null }
  | { ok: false; reason: 'not_configured' | 'refused' | 'rate_limited' | 'unavailable' | 'bad_output'; usage?: ModelUsage | null };

// Turns a model result into what is recorded: the API's own rate limit is recorded as 'provider_rate_limited' to keep it
// apart from our limits.
export function reportModelResult(result: ModelResultLike): ModelCallReport {
  const usage = result.usage ?? null;
  if (result.ok) return { outcome: 'ok', usage };
  return { outcome: result.reason === 'rate_limited' ? 'provider_rate_limited' : result.reason, usage };
}

const ReservationSchema = z.union([
  z.object({ allowed: z.literal(true), log_id: z.uuid() }),
  z.object({ allowed: z.literal(false), reason: z.enum(LLM_LIMIT_KINDS), retry_after_seconds: z.number().int().min(1) }),
]);

export interface RunWithinBudgetArgs<T> {
  // From the verified session. Never from a request.
  userId: string;
  feature: LlmFeature;
  model: string;
  // Makes the model call. It should not throw (lib/ai/* return failures as values); if it does, the call is recorded as
  // 'unavailable' and the error is rethrown.
  call: () => Promise<T>;
  report: (result: T) => ModelCallReport;
  limits?: LlmLimits;
}

export interface BudgetDeps {
  // Swappable in tests; the latency is measured with it.
  nowMs?: () => number;
}

export async function runWithinBudget<T>(args: RunWithinBudgetArgs<T>, deps: BudgetDeps = {}): Promise<BudgetedCall<T>> {
  const limits = args.limits ?? LLM_LIMITS;
  const nowMs = deps.nowMs ?? Date.now;

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    // The service-role key is not set in this environment: the counter cannot be reached.
    console.error('[llm] usage limits could not be checked: no service-role client');
    return { kind: 'unchecked' };
  }

  const { data, error } = await admin.rpc('reserve_llm_call', {
    p_user_id: args.userId,
    p_feature: args.feature,
    p_model: args.model,
    p_min_interval_seconds: limits.minIntervalSeconds,
    p_user_daily_cap: limits.userDailyCap,
    p_overall_daily_cap: limits.overallDailyCap,
  });
  if (error) {
    // The code only: the message can quote what was sent.
    console.error('[llm] could not reserve a call', { code: error.code ?? 'none' });
    return { kind: 'unchecked' };
  }
  const reservation = ReservationSchema.safeParse(data);
  if (!reservation.success) {
    console.error('[llm] the limit check answered in an unexpected shape');
    return { kind: 'unchecked' };
  }
  if (!reservation.data.allowed) {
    return { kind: 'limited', limit: reservation.data.reason, retryAfterSeconds: reservation.data.retry_after_seconds };
  }
  const logId = reservation.data.log_id;

  const started = nowMs();
  let result: T;
  try {
    result = await args.call();
  } catch (callError) {
    await finish(admin, args.userId, logId, { outcome: 'unavailable', usage: null }, nowMs() - started);
    throw callError;
  }
  // A failure to record does not lose the answer. The row stays 'pending', which still counts as a call.
  await finish(admin, args.userId, logId, args.report(result), nowMs() - started);
  return { kind: 'answered', result };
}

async function finish(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  logId: string,
  report: ModelCallReport,
  elapsedMs: number,
): Promise<void> {
  const { error } = await admin
    .from('llm_usage_logs')
    .update({
      outcome: report.outcome,
      input_tokens: report.usage ? report.usage.inputTokens : null,
      output_tokens: report.usage ? report.usage.outputTokens : null,
      latency_ms: Math.max(0, Math.round(elapsedMs)),
    })
    .eq('id', logId)
    .eq('user_id', userId);
  if (error) console.error('[llm] could not record usage', { code: error.code ?? 'none' });
}

// ---------------------------------------------------------------------------
// Reading usage
// ---------------------------------------------------------------------------

export type LlmUsageRow = Tables<'llm_usage_logs'>;

const DEFAULT_USAGE_ROWS = 50;
const MAX_USAGE_ROWS = 200;

// The signed-in user's own recent calls, newest first: feature, model, tokens, latency and outcome. Row level security
// already limits the table to their rows; the user filter says so again. There is no prompt or answer to show.
export async function listMyLlmUsage(options: { limit?: number } = {}): Promise<ServiceResult<LlmUsageRow[]>> {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return { ok: false, error: 'Sign in to see your Claude usage.' };

  const requested = options.limit ?? DEFAULT_USAGE_ROWS;
  const limit = Number.isInteger(requested) ? Math.min(MAX_USAGE_ROWS, Math.max(1, requested)) : DEFAULT_USAGE_ROWS;
  const { data, error } = await supabase
    .from('llm_usage_logs')
    .select('id, user_id, feature, model, input_tokens, output_tokens, latency_ms, outcome, created_at')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { ok: false, error: 'Could not load your Claude usage.' };
  return { ok: true, data: data ?? [] };
}

// ---------------------------------------------------------------------------
// What to tell the user
// ---------------------------------------------------------------------------

// A wait in words, rounded UP so it never promises a time before the limit frees up. Minutes up to 90, then hours.
export function describeWait(seconds: number): string {
  // Anything that is not a usable number is treated as the shortest wait, never printed.
  const s = Number.isFinite(seconds) ? Math.max(1, Math.ceil(seconds)) : 1;
  if (s < 60) return 'in under a minute';
  const minutes = Math.ceil(s / 60);
  if (minutes <= 90) return minutes === 1 ? 'in about 1 minute' : `in about ${minutes} minutes`;
  const hours = Math.ceil(s / 3600);
  return hours === 1 ? 'in about 1 hour' : `in about ${hours} hours`;
}

// The spacing limit is at most 20 seconds, so "a few seconds" is accurate for it.
export const TOO_SOON_MESSAGE = 'Please wait a few seconds before asking again.';

// What happened, for the two daily limits, without a final full stop so a caller can continue the sentence.
export function dailyLimitClause(limit: 'user_daily' | 'overall_daily', limits: LlmLimits = LLM_LIMITS): string {
  return limit === 'user_daily'
    ? `You've used all ${limits.userDailyCap} of your Claude requests for the last 24 hours`
    : 'Claude is at its shared limit for everyone right now';
}

// When the same ask could pass. For your own limit that is exact; for the shared one other people may use the room that
// frees up first, so it is an earliest time.
export function dailyRetrySentence(limit: 'user_daily' | 'overall_daily', retryAfterSeconds: number): string {
  const when = describeWait(retryAfterSeconds);
  return limit === 'user_daily' ? `You can ask again ${when}.` : `Try again ${when} at the earliest.`;
}
