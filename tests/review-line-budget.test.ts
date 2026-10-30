// The weekly review's one line and its own Claude budget (runReviewLine in lib/services/llm.ts; MOM-113 block 3.3,
// docs/LLM_GOVERNANCE.md), against the in-memory stand-in for the usage table and reserve_llm_call()
// (tests/helpers/fakeLlmUsage.ts, which follows migration 011). The model is a stub passed in, and `fetch` throws, so nothing
// here can reach the network or a key.
//
// What these hold the code to:
// - a reply is shown only after code's checks, with one retry that carries code's fixed note, then a line written by code;
// - every call is logged as 'weekly_review' with the model and the tokens, and nothing else is stored;
// - at most 4 review calls per person in 24 hours, counted from the log (so it holds across page loads), and the calls of other
//   people, other features or earlier days do not count against it;
// - every limit (the budget, the shared cap, the person's cap, the spacing, an unreachable counter) stops the call before it is
//   made, and the review goes on without a line;
// - a refusal, an outage or a missing key is not retried and is not dressed up as a line.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REVIEW_MODEL } from '@/lib/ai/review';
import { REFLECTION_FALLBACK_LINES, REFLECTION_RETRY_NOTES, type ReflectionFacts } from '@/lib/review/reflection';
import { LLM_LIMITS, REVIEW_BUDGET, REVIEW_LIMITS, REVIEW_LINE_MESSAGES, TOO_SOON_MESSAGE, runReviewLine } from '@/lib/services/llm';
import { resetUsage, rowsFor, seedUsage, usage } from './helpers/fakeLlmUsage';
import { OTHER_USER, USER } from './helpers/fakeSupabase';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeSupabase');
  return { createSupabaseServerClient };
});
vi.mock('@/lib/supabase/admin', async () => {
  const { createSupabaseAdminClient } = await import('./helpers/fakeLlmUsage');
  return { createSupabaseAdminClient };
});

const HOUR = 60 * 60 * 1000;
const TOKENS = { inputTokens: 900, outputTokens: 40 };

const facts: ReflectionFacts = {
  tone: 'middle',
  targets: [{ title: 'Lift weights', level: 'floor met', crossings: ['floor'], patterns: [], trend: null }],
};

const GOOD = 'You kept Lift weights steady through the week.';
const reply = (line: unknown) => ({ ok: true as const, raw: { line }, model: REVIEW_MODEL, usage: TOKENS });
const failure = (reason: 'not_configured' | 'refused' | 'rate_limited' | 'unavailable' | 'bad_output') => ({ ok: false as const, reason, usage: TOKENS });

// A stub model that answers from a script, one entry per call.
const script = (...answers: unknown[]) => {
  const queue = [...answers];
  return vi.fn(async (..._args: unknown[]) => (queue.length > 1 ? queue.shift() : queue[0]) as never);
};

// What the stub was asked on its nth call: the facts, and the note a retry carries.
const askedOn = (model: ReturnType<typeof script>, n: number) => model.mock.calls[n][0] as { facts: ReflectionFacts; retryFeedback: string[] };

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

const ask = (requestLine: ReturnType<typeof script>, over: { userId?: string; facts?: ReflectionFacts } = {}) =>
  runReviewLine(
    { userId: over.userId ?? USER, facts: over.facts ?? facts },
    {
      requestLine,
      nowMs: () => usage.nowMs,
      // The spacing a retry may land inside is waited out by moving the database's clock on.
      sleep: async (ms) => {
        usage.nowMs += ms;
      },
    },
  );

const reviewRows = (userId = USER) => rowsFor(userId).filter((r) => r.feature === 'weekly_review');

describe('the numbers', () => {
  it('are the approved budget: 4 review calls a day, 2 to an ask, the standard daily cap and the one shared cap', () => {
    expect(REVIEW_BUDGET).toEqual({ maxCallsPer24h: 4, maxCallsPerAsk: 2 });
    expect(REVIEW_LIMITS).toEqual({ minIntervalSeconds: 1, userDailyCap: 20, overallDailyCap: 200 });
    expect(REVIEW_LIMITS.userDailyCap).toBe(LLM_LIMITS.userDailyCap);
    expect(REVIEW_LIMITS.overallDailyCap).toBe(LLM_LIMITS.overallDailyCap);
  });
});

describe('a good reply', () => {
  it('is shown after one call, and the call is logged with its model and tokens and no content', async () => {
    const model = script(reply(GOOD));
    const result = await ask(model);
    expect(result).toEqual({ kind: 'line', line: GOOD, source: 'claude', calls: 1 });
    expect(model).toHaveBeenCalledTimes(1);
    expect(model).toHaveBeenCalledWith({ facts, retryFeedback: [] }, { model: REVIEW_MODEL });

    expect(reviewRows()).toHaveLength(1);
    expect(reviewRows()[0]).toMatchObject({ feature: 'weekly_review', model: REVIEW_MODEL, outcome: 'ok', input_tokens: 900, output_tokens: 40 });
    // Only counts, a model id and an outcome: no prompt, no answer, no title.
    expect(Object.keys(reviewRows()[0]).sort()).toEqual(
      ['created_at', 'feature', 'id', 'input_tokens', 'latency_ms', 'model', 'outcome', 'output_tokens', 'user_id'].sort(),
    );
    expect(JSON.stringify(usage.rows)).not.toContain('Lift weights');
    expect(JSON.stringify(usage.rows)).not.toContain(GOOD);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reserves the call with the review limits', async () => {
    await ask(script(reply(GOOD)));
    expect(usage.reserveCalls).toHaveLength(1);
    expect(usage.reserveCalls[0]).toMatchObject({
      p_user_id: USER,
      p_feature: 'weekly_review',
      p_model: REVIEW_MODEL,
      p_min_interval_seconds: 1,
      p_user_daily_cap: 20,
      p_overall_daily_cap: 200,
    });
  });

  it('may name a target whose title holds a digit or a word that looks like an ask', async () => {
    const odd: ReflectionFacts = { ...facts, targets: [{ ...facts.targets[0], title: 'Try a new recipe' }, { ...facts.targets[0], title: 'Run 5k' }] };
    const result = await ask(script(reply('Try a new recipe and Run 5k both held steady.')), { facts: odd });
    expect(result).toMatchObject({ kind: 'line', source: 'claude', calls: 1 });
  });
});

describe('a reply that fails the checks', () => {
  it.each([
    ['a digit', 'You lifted on 3 days.', 'number'],
    ['a question', 'How did the week feel?', 'question'],
    ['an ask', 'You should rest more.', 'ask'],
  ] as const)('is asked for again once, with code\'s note about %s, and the second good reply is shown', async (_name, bad, problem) => {
    const model = script(reply(bad), reply(GOOD));
    const result = await ask(model);
    expect(result).toEqual({ kind: 'line', line: GOOD, source: 'claude', calls: 2 });
    expect(model).toHaveBeenCalledTimes(2);
    expect(askedOn(model, 1)).toEqual({ facts, retryFeedback: [REFLECTION_RETRY_NOTES[problem]] });
    expect(reviewRows()).toHaveLength(2);
    // The note is code's fixed words: nothing Claude wrote or the person typed.
    expect(JSON.stringify(askedOn(model, 1).retryFeedback)).not.toContain(bad);
  });

  it('is replaced by a line written by code after two failures, and says so', async () => {
    const model = script(reply('You lifted on 3 days.'), reply('Is that enough?'));
    const result = await ask(model);
    expect(result).toEqual({ kind: 'line', line: REFLECTION_FALLBACK_LINES.middle, source: 'fallback', calls: 2 });
    expect(model).toHaveBeenCalledTimes(2);
    expect(reviewRows()).toHaveLength(2);
  });

  it('uses the line for the person\'s own tone', async () => {
    const result = await ask(script(reply(1), reply(null)), { facts: { ...facts, tone: 'gentle' } });
    expect(result).toMatchObject({ source: 'fallback', line: REFLECTION_FALLBACK_LINES.gentle });
  });

  it('retries an unreadable reply (cut off or not JSON) with the note about the reply\'s shape', async () => {
    const model = script(failure('bad_output'), reply(GOOD));
    const result = await ask(model);
    expect(result).toEqual({ kind: 'line', line: GOOD, source: 'claude', calls: 2 });
    expect(askedOn(model, 1).retryFeedback).toEqual([REFLECTION_RETRY_NOTES.unreadable]);
    expect(reviewRows().map((r) => r.outcome)).toEqual(['bad_output', 'ok']);
  });

  it('never makes a third call', async () => {
    const model = script(reply('bad 1'), reply('bad 2'), reply(GOOD));
    await ask(model);
    expect(model).toHaveBeenCalledTimes(REVIEW_BUDGET.maxCallsPerAsk);
  });

  it('waits out the spacing when the retry comes inside it, once, and then retries', async () => {
    const sleeps: number[] = [];
    const model = script(reply('bad 1'), reply(GOOD));
    // The first call finished at the very same instant its row was written, so the second is inside the 1 second spacing.
    const result = await runReviewLine(
      { userId: USER, facts },
      {
        requestLine: model,
        nowMs: () => usage.nowMs,
        sleep: async (ms) => {
          sleeps.push(ms);
          usage.nowMs += ms;
        },
      },
    );
    expect(result).toMatchObject({ kind: 'line', source: 'claude', calls: 2 });
    expect(sleeps).toEqual([1000]);
  });
});

describe('a call that fails', () => {
  it.each([
    ['refused', 'refused'],
    ['unavailable', 'unavailable'],
    ['not_configured', 'not_configured'],
    ['rate_limited', 'provider_rate_limited'],
  ] as const)('%s is not retried, is logged, and is no line', async (reason, outcome) => {
    const model = script(failure(reason));
    const result = await ask(model);
    expect(result).toEqual({ kind: 'unavailable', reason: 'model', message: REVIEW_LINE_MESSAGES.model });
    expect(model).toHaveBeenCalledTimes(1);
    expect(reviewRows().map((r) => r.outcome)).toEqual([outcome]);
  });

  it('is no line after a good call too: a refusal on the retry is not dressed up', async () => {
    const result = await ask(script(reply('You lifted on 3 days.'), failure('refused')));
    expect(result).toEqual({ kind: 'unavailable', reason: 'model', message: REVIEW_LINE_MESSAGES.model });
  });
});

describe("the review's own budget", () => {
  it('stops at 4 review calls in 24 hours, before any reservation or call', async () => {
    for (let i = 0; i < 4; i++) seedUsage(USER, (i + 2) * HOUR, { feature: 'weekly_review' });
    const model = script(reply(GOOD));
    const result = await ask(model);
    expect(result).toEqual({ kind: 'unavailable', reason: 'review_budget', message: REVIEW_LINE_MESSAGES.review_budget });
    expect(model).not.toHaveBeenCalled();
    expect(usage.reserveCalls).toHaveLength(0);
  });

  it('lets a third call through, and after it a retry is stopped by the count and code writes the line', async () => {
    for (let i = 0; i < 3; i++) seedUsage(USER, (i + 2) * HOUR, { feature: 'weekly_review' });
    const model = script(reply('You lifted on 3 days.'), reply(GOOD));
    const result = await ask(model);
    expect(model).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ kind: 'line', line: REFLECTION_FALLBACK_LINES.middle, source: 'fallback', calls: 1 });
  });

  it('counts across asks, so reloading the page and asking again does not reset it', async () => {
    const results = [];
    for (let i = 0; i < 3; i++) {
      results.push(await ask(script(reply('You lifted on 3 days.'), reply('Why?'))));
      usage.nowMs += 60_000;
    }
    expect(results.map((r) => (r.kind === 'line' ? r.source : r.reason))).toEqual(['fallback', 'fallback', 'review_budget']);
    expect(reviewRows()).toHaveLength(4);
  });

  it('forgets calls older than 24 hours', async () => {
    for (let i = 0; i < 4; i++) seedUsage(USER, 24 * HOUR + (i + 1) * HOUR, { feature: 'weekly_review' });
    expect(await ask(script(reply(GOOD)))).toMatchObject({ kind: 'line', source: 'claude' });
  });

  it("does not count other people's calls, or the person's calls to other features", async () => {
    for (let i = 0; i < 4; i++) seedUsage(OTHER_USER, (i + 2) * HOUR, { feature: 'weekly_review' });
    for (let i = 0; i < 4; i++) seedUsage(USER, (i + 2) * HOUR, { feature: 'setup' });
    expect(await ask(script(reply(GOOD)))).toMatchObject({ kind: 'line', source: 'claude' });
  });
});

describe("the limits that stop a call (the review goes on without a line)", () => {
  it('the one shared cap, across every feature and person', async () => {
    for (let i = 0; i < LLM_LIMITS.overallDailyCap; i++) seedUsage(OTHER_USER, 2 * HOUR, { feature: 'rebalance' });
    const model = script(reply(GOOD));
    const result = await ask(model);
    expect(result).toEqual({ kind: 'unavailable', reason: 'shared_cap', message: REVIEW_LINE_MESSAGES.shared_cap });
    expect(model).not.toHaveBeenCalled();
    expect(REVIEW_LINE_MESSAGES.shared_cap).toContain('Your review goes on without it.');
  });

  it("the person's daily cap across every feature", async () => {
    for (let i = 0; i < LLM_LIMITS.userDailyCap; i++) seedUsage(USER, 2 * HOUR + i, { feature: 'rebalance' });
    const model = script(reply(GOOD));
    const result = await ask(model);
    expect(result).toMatchObject({ kind: 'unavailable', reason: 'person_cap' });
    expect(result.kind === 'unavailable' && result.message).toContain('all 20 of your Claude requests');
    expect(model).not.toHaveBeenCalled();
  });

  it('the spacing, with the plain wait message', async () => {
    seedUsage(USER, 300, { feature: 'rebalance' });
    const model = script(reply(GOOD));
    const result = await ask(model);
    expect(result).toEqual({ kind: 'unavailable', reason: 'too_soon', message: TOO_SOON_MESSAGE });
    expect(model).not.toHaveBeenCalled();
  });

  it('a counter that cannot be reached, whether the key is missing or the check fails', async () => {
    usage.noAdminClient = true;
    const first = script(reply(GOOD));
    expect(await ask(first)).toEqual({ kind: 'unavailable', reason: 'unchecked', message: REVIEW_LINE_MESSAGES.unchecked });
    expect(first).not.toHaveBeenCalled();

    usage.noAdminClient = false;
    usage.failReserveWith = 'connection refused';
    const second = script(reply(GOOD));
    expect(await ask(second)).toEqual({ kind: 'unavailable', reason: 'unchecked', message: REVIEW_LINE_MESSAGES.unchecked });
    expect(second).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('every message says the review goes on', () => {
    for (const [reason, message] of Object.entries(REVIEW_LINE_MESSAGES)) {
      if (reason === 'too_soon') continue;
      expect(message).toContain('Your review goes on without');
    }
  });
});

describe('who can call it', () => {
  // lib/ai/review.ts holds the request to Claude; only lib/services/llm.ts may use it, so no call goes uncounted.
  const importers = (dir: string, found: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) importers(path, found);
      else if (/\.(ts|tsx)$/.test(name) && /from '@\/lib\/ai\/review'/.test(readFileSync(path, 'utf8'))) found.push(path.replaceAll('\\', '/'));
    }
    return found;
  };

  it('is imported by the budget module only, outside tests', () => {
    const found = ['lib', 'app', 'components'].flatMap((dir) => importers(dir)).filter((p) => !p.endsWith('lib/ai/review.ts'));
    expect(found).toEqual(['lib/services/llm.ts']);
  });

  it('is never imported by a component or a page', () => {
    const found = ['app', 'components'].flatMap((dir) => importers(dir));
    expect(found).toEqual([]);
  });
});
