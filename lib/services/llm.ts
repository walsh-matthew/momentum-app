// Limits, caps and usage logging for every Claude call (MOM-73, docs/LLM_GOVERNANCE.md). Server-side only.
//
// Every place the app calls Claude (the rebalance proposal, the wizard's week 1 plan and, since MOM-128, a turn of guided
// setup through runSetupTurn() below) goes through runWithinBudget(). It does three things around the call:
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
import { requestSetupTurnFromModel, SETUP_MODEL, type ModelSetupDeps, type ModelSetupResult } from '@/lib/ai/setup';
import type { ModelUsage } from '@/lib/ai/usage';
import type { LlmFeature, LlmOutcome, Tables } from '@/types/database.types';
import type { SetupDraft, Transcript } from '@/types/setup';
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
// Guided setup (MOM-128, design record §6.2)
// ---------------------------------------------------------------------------
//
// A setup is one conversation from its first turn to the person's save or their walking away: about 20 to 25 Claude calls,
// each a turn, close together. The per-call limits above (20 calls a day, 20 seconds apart) would stop a real setup
// partway, so setup has its own, and the old model keeps LLM_LIMITS untouched.
//
// Three rules, each in one place below:
// 1. Per-person limits are LOG-ONLY during the family trial. They are set so high that reserve_llm_call() never refuses on
//    them; every setup call still lands in llm_usage_logs as 'setup', and that table is the log that shows where
//    production limits belong (docs/LLM_GOVERNANCE.md has the query). The row it writes is the same as any other call's.
// 2. One hard shared cap stays on: everyone's calls together, across all features. It protects spend if sign-up is abused.
// 3. A per-setup BUDGET in turns and tokens. When a setup has used it, the call is not made and nothing is reserved: setup
//    falls back to the quick path. These numbers are placeholders until live eval runs set them (90th percentile plus a
//    margin the owner approves); they are not measurements.
//
// The budget is carried by the caller: the turn count is read from the transcript it passes, and the tokens spent so far
// come back from each call for the caller to hand in again. Nothing stores a setup, so a modified client could reset its
// own budget. That is acceptable here because the budget is a fairness and cost control for honest testers; the hard
// shared cap is the backstop that cannot be reset from the client (BACKLOG, MOM-128).

export const SETUP_LIMITS: LlmLimits = {
  // The function's own minimum. Spacing is log-only; this only stops two requests landing in the same second.
  minIntervalSeconds: 1,
  // Log-only: far beyond any real setup, still a whole number the database accepts.
  userDailyCap: 1_000_000,
  // The one hard cap, the same shared number as every other feature.
  overallDailyCap: LLM_LIMITS.overallDailyCap,
};

export interface SetupBudget {
  // Claude replies in one setup.
  maxTurns: number;
  // Input plus output tokens, summed over every call in one setup.
  maxTokens: number;
}

// STARTING numbers (MOM-128). Replace them with the 90th percentile of the live eval runs plus the approved margin.
export const SETUP_BUDGET: SetupBudget = { maxTurns: 40, maxTokens: 1_000_000 };

export type SetupOverBudget = 'turns' | 'tokens';

// Is there room for one more call? `tokens` comes from the caller, so a value that is not a whole, non-negative number is
// treated as used up: the budget fails closed.
export function setupBudgetStatus(
  spend: { turns: number; tokens: number },
  budget: SetupBudget = SETUP_BUDGET,
): { ok: true } | { ok: false; over: SetupOverBudget } {
  if (!Number.isSafeInteger(spend.tokens) || spend.tokens < 0 || spend.tokens >= budget.maxTokens) return { ok: false, over: 'tokens' };
  if (!Number.isSafeInteger(spend.turns) || spend.turns < 0 || spend.turns >= budget.maxTurns) return { ok: false, over: 'turns' };
  return { ok: true };
}

// Why setup stopped using Claude and offered the quick path instead.
export type SetupQuickPathReason = 'over_turns' | 'over_tokens' | 'shared_cap' | 'person_cap' | 'unchecked';

// What the person is offered: what they have said so far (played back by code from the validated draft), then the quick
// path, which is sensible defaults they can see and change. Nothing is saved until they approve (DOMAIN_MODEL §2.3).
const QUICK_PATH_OFFER =
  'Here is what you have told me so far. You can check it and finish with the quick path: sensible defaults you can change later. Nothing is saved until you approve it.';

export const SETUP_QUICK_PATH_MESSAGES: Record<SetupQuickPathReason, string> = {
  over_turns: `This setup has used its share of Claude's time. ${QUICK_PATH_OFFER}`,
  over_tokens: `This setup has used its share of Claude's time. ${QUICK_PATH_OFFER}`,
  shared_cap: `Claude is at its shared limit for everyone right now. ${QUICK_PATH_OFFER}`,
  // Unreachable while per-person limits are log-only, but it must say something true if the sentinel is ever reached.
  person_cap: `Claude cannot take more requests from you right now. ${QUICK_PATH_OFFER}`,
  unchecked: `Claude's usage limits could not be checked, so setup cannot go on with Claude. ${QUICK_PATH_OFFER}`,
};

export type SetupTurnResult =
  // Claude was asked. `result` may still be a failure (refused, unavailable, bad output): the caller decides what to show.
  // `turns` and `spentTokens` are what the caller hands back on the next call.
  | { kind: 'answered'; result: ModelSetupResult; turns: number; spentTokens: number }
  // The call was not made. The screen shows `message`, the playback of the draft so far, and the quick path.
  | { kind: 'quick_path'; reason: SetupQuickPathReason; message: string }
  // Two requests within a second of each other. Not a reason to leave the conversation: ask again.
  | { kind: 'wait'; retryAfterSeconds: number; message: string };

export interface RunSetupTurnArgs {
  // From the verified session. Never from a request.
  userId: string;
  transcript: Transcript;
  draft: SetupDraft;
  // Input plus output tokens used by this setup's earlier calls; 0 for the first.
  spentTokens: number;
  // The date on the person's device, YYYY-MM-DD, offered to Claude as a suggestion for a start date (MOM-111).
  today?: string;
  // The smaller-model trial runs the same path on another model.
  model?: string;
  // Tests and the eval runner only. The app uses the constants above.
  budget?: SetupBudget;
  limits?: LlmLimits;
}

export interface RunSetupTurnDeps extends BudgetDeps {
  modelDeps?: ModelSetupDeps;
  // Swappable in tests so no network call is made.
  requestTurn?: typeof requestSetupTurnFromModel;
}

const quickPath = (reason: SetupQuickPathReason): SetupTurnResult => ({
  kind: 'quick_path',
  reason,
  message: SETUP_QUICK_PATH_MESSAGES[reason],
});

// One turn of guided setup, the only way the app asks Claude for one: the budget check, then the reservation under
// 'setup' with the setup limits, then the call, then the record. Everything that makes it stop is a value, not a throw.
export async function runSetupTurn(args: RunSetupTurnArgs, deps: RunSetupTurnDeps = {}): Promise<SetupTurnResult> {
  const turns = args.transcript.filter((m) => m.role === 'assistant').length;
  const room = setupBudgetStatus({ turns, tokens: args.spentTokens }, args.budget);
  if (!room.ok) return quickPath(room.over === 'turns' ? 'over_turns' : 'over_tokens');

  const model = args.model ?? SETUP_MODEL;
  const requestTurn = deps.requestTurn ?? requestSetupTurnFromModel;
  const budgeted = await runWithinBudget(
    {
      userId: args.userId,
      feature: 'setup',
      model,
      limits: args.limits ?? SETUP_LIMITS,
      call: () => requestTurn({ transcript: args.transcript, draft: args.draft, today: args.today }, { ...deps.modelDeps, model }),
      report: reportModelResult,
    },
    deps,
  );

  switch (budgeted.kind) {
    case 'unchecked':
      return quickPath('unchecked');
    case 'limited':
      if (budgeted.limit === 'too_soon') {
        return { kind: 'wait', retryAfterSeconds: budgeted.retryAfterSeconds, message: TOO_SOON_MESSAGE };
      }
      return quickPath(budgeted.limit === 'overall_daily' ? 'shared_cap' : 'person_cap');
    case 'answered': {
      const usage = budgeted.result.usage ?? null;
      const used = usage ? usage.inputTokens + usage.outputTokens : 0;
      return { kind: 'answered', result: budgeted.result, turns: turns + 1, spentTokens: args.spentTokens + used };
    }
  }
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
