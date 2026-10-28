// Guided setup's own Claude limits (runSetupTurn in lib/services/llm.ts; MOM-128, design record §6.2), against the in-memory
// stand-in for the usage table and reserve_llm_call() (tests/helpers/fakeLlmUsage.ts, which follows migration 011 and now
// 014). The model is a stub passed in, and `fetch` is made to throw, so nothing here can reach the network or a key.
//
// What these hold the code to:
// - a scripted 25-turn setup is never cut off by the per-person limits (and the same 25 turns ARE cut off by the old
//   per-call limits, so the test can fail);
// - the one hard shared cap still stops calls, and setup then offers the quick path;
// - going over the per-setup budget (turns or tokens, or a token count that cannot be trusted) falls back to the quick path
//   without a reservation and without a call;
// - every setup call is logged as 'setup', with the model and the tokens, and nothing else is stored;
// - rebalance and the week 1 plan keep exactly the limits they had.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SETUP_MODEL } from '@/lib/ai/setup';
import {
  LLM_LIMITS,
  SETUP_BUDGET,
  SETUP_LIMITS,
  SETUP_QUICK_PATH_MESSAGES,
  TOO_SOON_MESSAGE,
  reportModelResult,
  runSetupTurn,
  runWithinBudget,
  setupBudgetStatus,
} from '@/lib/services/llm';
import { emptyDraft } from '@/lib/setup/draft';
import type { AssistantTurn, Transcript } from '@/types/setup';
import { resetUsage, rowsFor, seedUsage, usage } from './helpers/fakeLlmUsage';
import { USER, OTHER_USER } from './helpers/fakeSupabase';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeSupabase');
  return { createSupabaseServerClient };
});
vi.mock('@/lib/supabase/admin', async () => {
  const { createSupabaseAdminClient } = await import('./helpers/fakeLlmUsage');
  return { createSupabaseAdminClient };
});

const HOUR = 60 * 60 * 1000;
const TURN_MS = 5_000;
const USAGE = { inputTokens: 2000, outputTokens: 300 };

const turn: AssistantTurn = {
  kind: 'question',
  chunk: null,
  skipped: null,
  say: '',
  question: 'What would you like to work on?',
  topic: 'idea',
  options: [],
  draft: emptyDraft(),
};
const answer = (usageOver: { inputTokens: number; outputTokens: number } | null = USAGE) => ({
  ok: true as const,
  raw: turn,
  model: 'claude-opus-5-5',
  usage: usageOver,
});

// A transcript with `n` of Claude's turns so far, each followed by the person's reply.
const transcriptOf = (n: number): Transcript =>
  Array.from({ length: n }, (_, i) => [{ role: 'assistant' as const, turn }, { role: 'person' as const, text: `reply ${i}` }]).flat();

const draft = emptyDraft();
const stubModel = (impl?: () => unknown) => vi.fn(async () => (impl ? impl() : answer()) as never);

let fetchSpy: ReturnType<typeof vi.fn>;
let errorLog: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetUsage();
  fetchSpy = vi.fn(() => {
    throw new Error('the network must not be reached from a unit test');
  });
  vi.stubGlobal('fetch', fetchSpy);
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  errorLog.mockRestore();
});

// Runs `count` turns of one setup the way a screen would: each turn waits for the last, the transcript and the tokens spent
// are handed back in, and the clock moves on by the time a real turn takes.
async function runSetup(count: number, over: { limits?: typeof LLM_LIMITS; userId?: string; model?: string } = {}) {
  const requestTurn = stubModel();
  const results = [];
  let spentTokens = 0;
  for (let i = 0; i < count; i++) {
    const result = await runSetupTurn(
      { userId: over.userId ?? USER, transcript: transcriptOf(i), draft, spentTokens, limits: over.limits, model: over.model },
      { requestTurn },
    );
    results.push(result);
    if (result.kind !== 'answered') break;
    spentTokens = result.spentTokens;
    usage.nowMs += TURN_MS;
  }
  return { results, requestTurn, spentTokens };
}

describe('the numbers', () => {
  it('are the starting budget until live runs set it, and the old limits are untouched', () => {
    expect(SETUP_BUDGET).toEqual({ maxTurns: 40, maxTokens: 1_000_000 });
    expect(LLM_LIMITS).toEqual({ minIntervalSeconds: 20, userDailyCap: 20, overallDailyCap: 200 });
  });

  it('keep per-person limits out of the way and share the one hard cap', () => {
    expect(SETUP_LIMITS.userDailyCap).toBeGreaterThan(SETUP_BUDGET.maxTurns * 1000);
    expect(SETUP_LIMITS.userDailyCap).toBeLessThanOrEqual(2_147_483_647);
    expect(SETUP_LIMITS.minIntervalSeconds).toBe(1);
    expect(SETUP_LIMITS.overallDailyCap).toBe(LLM_LIMITS.overallDailyCap);
  });
});

describe('a scripted 25-turn setup', () => {
  it('is never cut off by the per-person limits', async () => {
    const { results, requestTurn } = await runSetup(25);
    expect(results.map((r) => r.kind)).toEqual(Array(25).fill('answered'));
    expect(requestTurn).toHaveBeenCalledTimes(25);
    expect(rowsFor(USER)).toHaveLength(25);
  });

  it('is cut off by the old per-call limits, so the test above can fail', async () => {
    // 20 seconds apart is the old spacing: turns 5 seconds apart are refused at once.
    const spaced = await runSetup(25, { limits: LLM_LIMITS });
    expect(spaced.results.map((r) => r.kind)).toEqual(['answered', 'wait']);

    // Even spaced out, the old cap of 20 calls a day stops the 21st turn.
    resetUsage();
    const requestTurn = stubModel();
    let kind = 'answered';
    for (let i = 0; i < 25 && kind === 'answered'; i++) {
      const r = await runSetupTurn({ userId: USER, transcript: transcriptOf(i), draft, spentTokens: 0, limits: LLM_LIMITS }, { requestTurn });
      kind = r.kind;
      usage.nowMs += 25_000;
      if (r.kind === 'quick_path') expect(r.reason).toBe('person_cap');
    }
    expect(requestTurn).toHaveBeenCalledTimes(20);
    expect(kind).toBe('quick_path');
  });

  it('is not cut off by the budget either, and carries its tokens from turn to turn', async () => {
    const { results, spentTokens } = await runSetup(25);
    const last = results[24];
    expect(last.kind).toBe('answered');
    if (last.kind === 'answered') expect(last.turns).toBe(25);
    expect(spentTokens).toBe(25 * (USAGE.inputTokens + USAGE.outputTokens));
    expect(spentTokens).toBeLessThan(SETUP_BUDGET.maxTokens);
  });

  it('is not held up by calls from earlier the same day (the person has had setup open before)', async () => {
    for (let i = 0; i < 60; i++) seedUsage(USER, (i + 1) * 60_000, { feature: 'setup' });
    const { results } = await runSetup(25);
    expect(results.every((r) => r.kind === 'answered')).toBe(true);
  });
});

describe('the one hard shared cap', () => {
  const fillSharedCap = () => {
    for (let i = 0; i < LLM_LIMITS.overallDailyCap; i++) seedUsage(OTHER_USER, HOUR + i * 1000);
  };

  it('stops the call, offers the quick path and writes nothing', async () => {
    fillSharedCap();
    const requestTurn = stubModel();
    const result = await runSetupTurn({ userId: USER, transcript: transcriptOf(3), draft, spentTokens: 0 }, { requestTurn });
    expect(result).toEqual({ kind: 'quick_path', reason: 'shared_cap', message: SETUP_QUICK_PATH_MESSAGES.shared_cap });
    expect(result.kind === 'quick_path' && result.message).toMatch(/shared limit for everyone/);
    expect(requestTurn).not.toHaveBeenCalled();
    expect(rowsFor(USER)).toHaveLength(0);
  });

  it('stops a setup in the middle: the turns before the cap are answered, the next is not', async () => {
    const requestTurn = stubModel();
    for (let i = 0; i < LLM_LIMITS.overallDailyCap - 3; i++) seedUsage(OTHER_USER, HOUR + i * 1000);
    const kinds = [];
    for (let i = 0; i < 6; i++) {
      kinds.push((await runSetupTurn({ userId: USER, transcript: transcriptOf(i), draft, spentTokens: 0 }, { requestTurn })).kind);
      usage.nowMs += TURN_MS;
    }
    expect(kinds).toEqual(['answered', 'answered', 'answered', 'quick_path', 'quick_path', 'quick_path']);
    expect(requestTurn).toHaveBeenCalledTimes(3);
  });

  it('counts setup calls like any other, so it also protects spend against setups', async () => {
    for (let i = 0; i < LLM_LIMITS.overallDailyCap - 1; i++) seedUsage(OTHER_USER, HOUR + i * 1000, { feature: 'setup' });
    const requestTurn = stubModel();
    expect((await runSetupTurn({ userId: USER, transcript: [], draft, spentTokens: 0 }, { requestTurn })).kind).toBe('answered');
    usage.nowMs += TURN_MS;
    expect((await runSetupTurn({ userId: USER, transcript: transcriptOf(1), draft, spentTokens: 0 }, { requestTurn })).kind).toBe('quick_path');
  });
});

describe('going over the per-setup budget', () => {
  it('falls back to the quick path after the last allowed turn, without a reservation or a call', async () => {
    const requestTurn = stubModel();
    const result = await runSetupTurn({ userId: USER, transcript: transcriptOf(SETUP_BUDGET.maxTurns), draft, spentTokens: 0 }, { requestTurn });
    expect(result).toEqual({ kind: 'quick_path', reason: 'over_turns', message: SETUP_QUICK_PATH_MESSAGES.over_turns });
    expect(requestTurn).not.toHaveBeenCalled();
    expect(usage.reserveCalls).toHaveLength(0);
    expect(rowsFor(USER)).toHaveLength(0);
  });

  it('allows the last turn within the budget, and not the one after', async () => {
    const requestTurn = stubModel();
    const last = await runSetupTurn({ userId: USER, transcript: transcriptOf(SETUP_BUDGET.maxTurns - 1), draft, spentTokens: 0 }, { requestTurn });
    expect(last.kind).toBe('answered');
    usage.nowMs += TURN_MS;
    const next = await runSetupTurn({ userId: USER, transcript: transcriptOf(SETUP_BUDGET.maxTurns), draft, spentTokens: 0 }, { requestTurn });
    expect(next.kind).toBe('quick_path');
  });

  it('falls back when the tokens are used up', async () => {
    const requestTurn = stubModel();
    const result = await runSetupTurn({ userId: USER, transcript: transcriptOf(2), draft, spentTokens: SETUP_BUDGET.maxTokens }, { requestTurn });
    expect(result).toMatchObject({ kind: 'quick_path', reason: 'over_tokens' });
    expect(requestTurn).not.toHaveBeenCalled();
    const under = await runSetupTurn({ userId: USER, transcript: transcriptOf(2), draft, spentTokens: SETUP_BUDGET.maxTokens - 1 }, { requestTurn });
    expect(under.kind).toBe('answered');
  });

  it('takes a budget as an argument, so the numbers can come from the live runs', async () => {
    const requestTurn = stubModel();
    const budget = { maxTurns: 3, maxTokens: 5000 };
    expect((await runSetupTurn({ userId: USER, transcript: transcriptOf(3), draft, spentTokens: 0, budget }, { requestTurn })).kind).toBe('quick_path');
    usage.nowMs += TURN_MS;
    const tokens = await runSetupTurn({ userId: USER, transcript: transcriptOf(1), draft, spentTokens: 5000, budget }, { requestTurn });
    expect(tokens).toMatchObject({ kind: 'quick_path', reason: 'over_tokens' });
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 1.5, Number.MAX_SAFE_INTEGER + 2])(
    'treats a token count it cannot trust (%s) as used up, so a modified client gains nothing by sending one',
    async (spentTokens) => {
      const requestTurn = stubModel();
      const result = await runSetupTurn({ userId: USER, transcript: transcriptOf(1), draft, spentTokens }, { requestTurn });
      expect(result).toMatchObject({ kind: 'quick_path', reason: 'over_tokens' });
      expect(requestTurn).not.toHaveBeenCalled();
    },
  );

  it('reads the turn count from the transcript, not from the person\'s side of it', async () => {
    expect(setupBudgetStatus({ turns: 39, tokens: 0 })).toEqual({ ok: true });
    expect(setupBudgetStatus({ turns: 40, tokens: 0 })).toEqual({ ok: false, over: 'turns' });
    expect(setupBudgetStatus({ turns: 0, tokens: 0 }, { maxTurns: 1, maxTokens: 10 })).toEqual({ ok: true });
    // Forty person messages and no assistant turn is a first call, not a spent budget.
    const personOnly: Transcript = Array.from({ length: 45 }, (_, i) => ({ role: 'person' as const, text: `x${i}` }));
    const result = await runSetupTurn({ userId: USER, transcript: personOnly, draft, spentTokens: 0 }, { requestTurn: stubModel() });
    expect(result.kind).toBe('answered');
  });

  it('says what happened in plain words and offers the quick path with nothing saved', () => {
    for (const message of Object.values(SETUP_QUICK_PATH_MESSAGES)) {
      expect(message).toMatch(/quick path/);
      expect(message).toMatch(/Nothing is saved until you approve it/);
      expect(message).toMatch(/what you have told me so far/);
    }
    expect(SETUP_QUICK_PATH_MESSAGES.over_turns).toMatch(/used its share of Claude's time/);
  });
});

describe('when the limits cannot be checked, or two requests collide', () => {
  it('fails closed to the quick path, with no call, when the counter is unreachable', async () => {
    const requestTurn = stubModel();
    usage.noAdminClient = true;
    expect(await runSetupTurn({ userId: USER, transcript: [], draft, spentTokens: 0 }, { requestTurn })).toEqual({
      kind: 'quick_path',
      reason: 'unchecked',
      message: SETUP_QUICK_PATH_MESSAGES.unchecked,
    });
    usage.noAdminClient = false;
    usage.failReserveWith = 'connection refused';
    expect(await runSetupTurn({ userId: USER, transcript: [], draft, spentTokens: 0 }, { requestTurn })).toMatchObject({ kind: 'quick_path', reason: 'unchecked' });
    expect(requestTurn).not.toHaveBeenCalled();
  });

  it('asks the person to wait, and does not leave the conversation, when two requests land in the same second', async () => {
    const requestTurn = stubModel();
    expect((await runSetupTurn({ userId: USER, transcript: [], draft, spentTokens: 0 }, { requestTurn })).kind).toBe('answered');
    const second = await runSetupTurn({ userId: USER, transcript: transcriptOf(1), draft, spentTokens: 0 }, { requestTurn });
    expect(second).toMatchObject({ kind: 'wait', message: TOO_SOON_MESSAGE });
    expect(requestTurn).toHaveBeenCalledTimes(1);
  });
});

describe('every setup call is logged as setup', () => {
  it('records the feature, the model, the tokens and the outcome, and no content', async () => {
    await runSetup(2);
    const rows = rowsFor(USER);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({ feature: 'setup', model: SETUP_MODEL, input_tokens: 2000, output_tokens: 300, outcome: 'ok' });
      expect(Object.keys(row).sort()).toEqual(
        ['created_at', 'feature', 'id', 'input_tokens', 'latency_ms', 'model', 'outcome', 'output_tokens', 'user_id'],
      );
    }
    expect(usage.reserveCalls.every((c) => c.p_feature === 'setup')).toBe(true);
  });

  it('reserves with the setup limits, never the per-call ones', async () => {
    await runSetup(1);
    expect(usage.reserveCalls[0]).toMatchObject({
      p_min_interval_seconds: SETUP_LIMITS.minIntervalSeconds,
      p_user_daily_cap: SETUP_LIMITS.userDailyCap,
      p_overall_daily_cap: SETUP_LIMITS.overallDailyCap,
    });
  });

  it('records a call the model could not answer with its real outcome, and still counts its tokens', async () => {
    const requestTurn = stubModel(() => ({ ok: false, reason: 'bad_output', usage: { inputTokens: 1500, outputTokens: 4000 } }));
    const result = await runSetupTurn({ userId: USER, transcript: transcriptOf(1), draft, spentTokens: 100 }, { requestTurn });
    expect(result).toMatchObject({ kind: 'answered', turns: 2, spentTokens: 100 + 5500, result: { ok: false, reason: 'bad_output' } });
    expect(rowsFor(USER)[0]).toMatchObject({ outcome: 'bad_output', input_tokens: 1500, output_tokens: 4000 });
  });

  it('records the API\'s own rate limit apart from ours', async () => {
    const requestTurn = stubModel(() => ({ ok: false, reason: 'rate_limited' }));
    await runSetupTurn({ userId: USER, transcript: [], draft, spentTokens: 0 }, { requestTurn });
    expect(rowsFor(USER)[0]).toMatchObject({ outcome: 'provider_rate_limited', input_tokens: null });
  });

  it('records a call that throws as unavailable and lets the error through', async () => {
    const requestTurn = vi.fn(async () => {
      throw new Error('boom');
    });
    await expect(runSetupTurn({ userId: USER, transcript: [], draft, spentTokens: 0 }, { requestTurn })).rejects.toThrow('boom');
    expect(rowsFor(USER)[0]).toMatchObject({ feature: 'setup', outcome: 'unavailable' });
  });

  it('uses the model it is told to for the smaller-model trial, in the call and in the log', async () => {
    const requestTurn = stubModel();
    await runSetupTurn({ userId: USER, transcript: [], draft, spentTokens: 0, model: 'claude-sonnet-5-5' }, { requestTurn });
    expect(requestTurn).toHaveBeenCalledWith({ transcript: [], draft }, expect.objectContaining({ model: 'claude-sonnet-5-5' }));
    expect(rowsFor(USER)[0].model).toBe('claude-sonnet-5-5');
  });

  it('hands the model only the transcript and the draft: no user id', async () => {
    const requestTurn = stubModel();
    await runSetupTurn({ userId: USER, transcript: transcriptOf(1), draft, spentTokens: 0 }, { requestTurn });
    expect(JSON.stringify(requestTurn.mock.calls)).not.toContain(USER);
  });
});

describe('the old model keeps its limits', () => {
  it('rebalance and week_one_plan are still limited to 20 calls a day and 20 seconds apart', async () => {
    for (let i = 0; i < 20; i++) seedUsage(USER, (i + 1) * 60 * 60 * 1000 / 4);
    const call = vi.fn(async () => ({ ok: true as const }));
    for (const feature of ['rebalance', 'week_one_plan'] as const) {
      const result = await runWithinBudget({ userId: USER, feature, model: 'm', call, report: reportModelResult });
      expect(result).toMatchObject({ kind: 'limited', limit: 'user_daily' });
    }
    expect(call).not.toHaveBeenCalled();
  });

  it('counts a person\'s setup calls toward that cap (known; BACKLOG: MOM-115 retires those features)', async () => {
    await runSetup(25);
    usage.nowMs += 60_000;
    const call = vi.fn(async () => ({ ok: true as const }));
    const result = await runWithinBudget({ userId: USER, feature: 'rebalance', model: 'm', call, report: reportModelResult });
    expect(result).toMatchObject({ kind: 'limited', limit: 'user_daily' });
  });
});

describe('what may call the setup model', () => {
  const SKIP = new Set(['node_modules', '.next', 'tests', 'docs', 'supabase', '.git']);
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (SKIP.has(name)) return [];
      if (statSync(path).isDirectory()) return sources(path);
      return /\.(ts|tsx)$/.test(name) ? [path] : [];
    });

  it('only lib/services/llm.ts imports requestSetupTurnFromModel, so no setup call goes uncounted', () => {
    const users = ['lib', 'app', 'components']
      .flatMap((d) => (statSync(join(process.cwd(), d), { throwIfNoEntry: false }) ? sources(join(process.cwd(), d)) : []))
      .filter((f) => /requestSetupTurnFromModel/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(process.cwd().length + 1).replaceAll('\\', '/'))
      .sort();
    expect(users).toEqual(['lib/ai/setup.ts', 'lib/services/llm.ts']);
  });

  it('nothing in this file reached the network', () => {
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
