// Limits, caps and usage logging for the two Claude calls (MOM-73, docs/LLM_GOVERNANCE.md): lib/services/llm.ts and the
// two places that use it in lib/services/tasks.ts. The model and the database are both replaced: the model by a mock, and
// the usage table and reserve_llm_call() by tests/helpers/fakeLlmUsage.ts, which follows migration 011 rule for rule. The
// real function, grants and RLS are covered by supabase/verify/011_llm_usage_logs.sql.
//
// What these hold the code to:
// - the limit is in the database, so it holds across simulated serverless instances and cold starts, and when several
//   instances ask at the same moment exactly one reaches the model;
// - a tripped limit says WHICH one (20 second spacing, your daily cap, the shared daily cap) and, for a cap, when to try
//   again, and the model is not called;
// - the rebalance falls back to the rule-based proposal, labelled, only for a daily cap or a limit check that cannot be
//   made; plan generation never gets a plan from a limit: a message only, nothing substituted;
// - the usage rows carry counts and an outcome and no content;
// - nothing on the path writes status or completed_at.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LLM_LIMITS,
  TOO_SOON_MESSAGE,
  dailyLimitClause,
  dailyRetrySentence,
  describeWait,
  listMyLlmUsage,
  reportModelResult,
  runWithinBudget,
} from '@/lib/services/llm';
import { generateWeekOnePlan, proposeRebalance, requestModelRebalance } from '@/lib/services/tasks';
import { buildRebalanceProposal } from '@/lib/utils/rebalance';
import { resetUsage, rowsFor, seedUsage, usage } from './helpers/fakeLlmUsage';
import { OTHER_USER, USER, channelRow, db, resetDb, taskRow, type TaskRow } from './helpers/fakeSupabase';

const model = vi.hoisted(() => ({ rebalance: vi.fn(), plan: vi.fn() }));
vi.mock('@/lib/ai/rebalance', () => ({ requestRebalanceFromModel: model.rebalance, REBALANCE_MODEL: 'claude-opus-5-5' }));
vi.mock('@/lib/ai/taskPlan', () => ({ requestWeekOnePlanFromModel: model.plan, TASK_PLAN_MODEL: 'claude-opus-5-5' }));
vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeSupabase');
  return { createSupabaseServerClient };
});
vi.mock('@/lib/supabase/admin', async () => {
  const { createSupabaseAdminClient } = await import('./helpers/fakeLlmUsage');
  return { createSupabaseAdminClient };
});

const MIN = 60_000;
const HOUR = 60 * MIN;
const TODAY = '2026-11-04';
const USAGE = { inputTokens: 1200, outputTokens: 340 };

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const behind = (over: Partial<TaskRow> = {}) => taskRow(2, { title: 'Study cloud concepts', task_type: 'certify', ...over });
const asMicroTasks = (rows: TaskRow[]) => rows as never;
const goodMove = (t: TaskRow) => ({ action: 'carry_over', taskId: t.id, fromWeek: t.week_of, toWeek: 4, reason: 'Unfinished in week 2; week 4 has room.' });
const rebalanceAnswer = (t: TaskRow) => ({ ok: true, raw: { summary: 'Move the work that slipped.', moves: [goodMove(t)], warnings: [] }, model: 'claude-opus-5-5', usage: USAGE });

const wizardInput = () => ({
  title: 'Get my first certification',
  goalType: 'get_certified',
  constraints: ['flexible_hours'],
  pace: 'lighter',
  reviewPrompts: ['took_longer'],
});
const planTask = (over: Record<string, unknown> = {}) => ({ title: 'Study the first exam domain', taskType: 'certify', minutes: 45, weekOf: 1, ...over });
const goodPlanAnswer = () => ({
  ok: true,
  raw: {
    tasks: [
      planTask({ title: 'Pick the certification and book the exam date', minutes: 30 }),
      planTask(),
      planTask({ title: 'Friday review: tick tasks and fill in notes', taskType: 'review', minutes: 30 }),
    ],
  },
  model: 'claude-opus-5-5',
  usage: { inputTokens: 900, outputTokens: 210 },
});

// Twenty calls by the user, the oldest 23 hours ago: the user's cap, freeing up in an hour.
const fillUserCap = (userId = USER) => {
  for (let h = 23; h >= 4; h--) seedUsage(userId, h * HOUR);
};
// Two hundred calls by someone else, the oldest 1005 minutes ago: the shared cap, freeing up in 435 minutes.
const fillSharedCap = () => {
  for (let i = 0; i < LLM_LIMITS.overallDailyCap; i++) seedUsage(OTHER_USER, (10 + i * 5) * MIN);
};

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  model.rebalance.mockReset();
  model.plan.mockReset();
  resetDb([], { id: USER });
  resetUsage();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => consoleError.mockRestore());

// ---------------------------------------------------------------------------
// What the user is told
// ---------------------------------------------------------------------------

describe('describeWait: a wait in words, rounded up so it never promises too early', () => {
  it.each([
    [0, 'in under a minute'],
    [1, 'in under a minute'],
    [59, 'in under a minute'],
    [60, 'in about 1 minute'],
    [61, 'in about 2 minutes'],
    [600, 'in about 10 minutes'],
    [3600, 'in about 60 minutes'],
    [3601, 'in about 61 minutes'],
    [5400, 'in about 90 minutes'],
    [5401, 'in about 2 hours'],
    [7200, 'in about 2 hours'],
    [26100, 'in about 8 hours'],
    [86400, 'in about 24 hours'],
  ])('%i seconds is "%s"', (seconds, words) => {
    expect(describeWait(seconds)).toBe(words);
  });
  it('treats nonsense as the shortest wait rather than printing it', () => {
    expect(describeWait(Number.NaN)).toBe('in under a minute');
    expect(describeWait(-5)).toBe('in under a minute');
  });
});

describe('the wording for each limit', () => {
  it('your own daily cap names the number and says when you can ask again', () => {
    expect(dailyLimitClause('user_daily')).toBe("You've used all 20 of your Claude requests for the last 24 hours");
    expect(dailyRetrySentence('user_daily', 3600)).toBe('You can ask again in about 60 minutes.');
  });
  it('the shared cap says it is shared, and that the time is the earliest, since other people may use the room first', () => {
    expect(dailyLimitClause('overall_daily')).toBe('Claude is at its shared limit for everyone right now');
    expect(dailyRetrySentence('overall_daily', 26100)).toBe('Try again in about 8 hours at the earliest.');
  });
  it('the 20 second spacing says seconds, which is true because the spacing is at most 20 seconds', () => {
    expect(TOO_SOON_MESSAGE).toBe('Please wait a few seconds before asking again.');
    expect(LLM_LIMITS.minIntervalSeconds).toBeLessThanOrEqual(30);
  });
  it('never says "in a moment" or "shortly" for a wait that is hours long', () => {
    for (const text of [dailyRetrySentence('user_daily', 3600), dailyRetrySentence('overall_daily', 26100), dailyLimitClause('user_daily'), dailyLimitClause('overall_daily')]) {
      expect(text).not.toMatch(/moment|shortly|soon|later/i);
    }
  });
});

describe('reportModelResult', () => {
  it('records an answer as ok, with its tokens', () => {
    expect(reportModelResult({ ok: true, usage: USAGE })).toEqual({ outcome: 'ok', usage: USAGE });
  });
  it.each([
    ['refused', 'refused'],
    ['bad_output', 'bad_output'],
    ['unavailable', 'unavailable'],
    ['not_configured', 'not_configured'],
    ['rate_limited', 'provider_rate_limited'],
  ] as const)('records %s as %s, keeping the provider\'s own rate limit apart from ours', (reason, outcome) => {
    expect(reportModelResult({ ok: false, reason, usage: USAGE })).toEqual({ outcome, usage: USAGE });
  });
  it('has no usage when the call never got an answer', () => {
    expect(reportModelResult({ ok: false, reason: 'unavailable' })).toEqual({ outcome: 'unavailable', usage: null });
  });
});

// ---------------------------------------------------------------------------
// runWithinBudget
// ---------------------------------------------------------------------------

describe('runWithinBudget', () => {
  const ok = { ok: true as const, usage: USAGE };
  const args = (call: () => Promise<typeof ok>, over: Record<string, unknown> = {}) => ({
    userId: USER,
    feature: 'rebalance' as const,
    model: 'claude-opus-5-5',
    call,
    report: reportModelResult,
    ...over,
  });

  it('reserves, makes the call, then records outcome, tokens and latency on the same row', async () => {
    const call = vi.fn(async () => ok);
    const clock = [10_000, 12_250];
    const result = await runWithinBudget(args(call), { nowMs: () => clock.shift()! });

    expect(result).toEqual({ kind: 'answered', result: ok });
    expect(call).toHaveBeenCalledTimes(1);
    expect(rowsFor(USER)).toHaveLength(1);
    expect(rowsFor(USER)[0]).toMatchObject({
      feature: 'rebalance',
      model: 'claude-opus-5-5',
      outcome: 'ok',
      input_tokens: 1200,
      output_tokens: 340,
      latency_ms: 2250,
    });
  });

  it('reserves before the call, so the row is already there (pending) while the model is running', async () => {
    let seenDuringCall: string[] = [];
    await runWithinBudget(args(async () => {
      seenDuringCall = rowsFor(USER).map((r) => r.outcome);
      return ok;
    }));
    expect(seenDuringCall).toEqual(['pending']);
  });

  it('is keyed on the user it was given: the reservation, and the row that is finished', async () => {
    await runWithinBudget(args(async () => ok));
    expect(usage.reserveCalls[0]).toMatchObject({ p_user_id: USER, p_feature: 'rebalance', p_model: 'claude-opus-5-5' });
    expect(usage.rows.every((r) => r.user_id === USER)).toBe(true);
  });

  it('sends the limits it was configured with, and the defaults otherwise', async () => {
    await runWithinBudget(args(async () => ok));
    expect(usage.reserveCalls[0]).toMatchObject({ p_min_interval_seconds: 20, p_user_daily_cap: 20, p_overall_daily_cap: 200 });
    usage.nowMs += HOUR;
    await runWithinBudget(args(async () => ok, { limits: { minIntervalSeconds: 5, userDailyCap: 3, overallDailyCap: 9 } }));
    expect(usage.reserveCalls[1]).toMatchObject({ p_min_interval_seconds: 5, p_user_daily_cap: 3, p_overall_daily_cap: 9 });
  });

  it('records a failure with its tokens when the API answered (a refusal still costs tokens)', async () => {
    const refused = { ok: false as const, reason: 'refused' as const, usage: USAGE };
    await runWithinBudget({ ...args(async () => ok), call: async () => refused });
    expect(rowsFor(USER)[0]).toMatchObject({ outcome: 'refused', input_tokens: 1200, output_tokens: 340 });
  });

  it('records a call that never got an answer with no tokens', async () => {
    await runWithinBudget({ ...args(async () => ok), call: async () => ({ ok: false as const, reason: 'unavailable' as const }) });
    expect(rowsFor(USER)[0]).toMatchObject({ outcome: 'unavailable', input_tokens: null, output_tokens: null });
    expect(rowsFor(USER)[0].latency_ms).not.toBeNull();
  });

  it('records the provider\'s rate limit as provider_rate_limited', async () => {
    await runWithinBudget({ ...args(async () => ok), call: async () => ({ ok: false as const, reason: 'rate_limited' as const }) });
    expect(rowsFor(USER)[0].outcome).toBe('provider_rate_limited');
  });

  it('records a call that throws as unavailable, and lets the error through', async () => {
    await expect(runWithinBudget(args(async () => { throw new Error('boom'); }))).rejects.toThrow('boom');
    expect(rowsFor(USER)[0]).toMatchObject({ outcome: 'unavailable', input_tokens: null });
  });

  describe('a limit trips: the model is not called, nothing is written, and the result says which and when', () => {
    it('the 20 second spacing', async () => {
      seedUsage(USER, 5_000);
      const call = vi.fn(async () => ok);
      const result = await runWithinBudget(args(call));
      expect(result).toEqual({ kind: 'limited', limit: 'too_soon', retryAfterSeconds: 15 });
      expect(call).not.toHaveBeenCalled();
      expect(rowsFor(USER)).toHaveLength(1);
    });

    it('your daily cap, with the wait until your oldest call leaves the 24 hours', async () => {
      fillUserCap();
      const call = vi.fn(async () => ok);
      const result = await runWithinBudget(args(call));
      expect(result).toEqual({ kind: 'limited', limit: 'user_daily', retryAfterSeconds: 3600 });
      expect(call).not.toHaveBeenCalled();
      expect(rowsFor(USER)).toHaveLength(20);
    });

    it('over your cap by two, the wait is until the third oldest call leaves, not the oldest', async () => {
      for (let h = 23; h >= 2; h--) seedUsage(USER, h * HOUR); // 22 calls: 23h, 22h, 21h, ... 2h ago
      const result = await runWithinBudget(args(async () => ok));
      expect(result).toEqual({ kind: 'limited', limit: 'user_daily', retryAfterSeconds: 3 * 3600 });
    });

    it('the shared cap, whoever made the calls', async () => {
      fillSharedCap();
      const call = vi.fn(async () => ok);
      const result = await runWithinBudget(args(call));
      expect(result).toEqual({ kind: 'limited', limit: 'overall_daily', retryAfterSeconds: 26100 });
      expect(call).not.toHaveBeenCalled();
      expect(rowsFor(USER)).toHaveLength(0);
    });

    it('when your cap and the shared cap both trip, your own is reported; the shared cap beats the spacing', async () => {
      fillUserCap();
      for (let i = 0; i < 180; i++) seedUsage(OTHER_USER, (10 + i * 5) * MIN);
      expect((await runWithinBudget(args(async () => ok)))).toMatchObject({ limit: 'user_daily' });

      resetUsage();
      fillSharedCap();
      seedUsage(USER, 1_000);
      expect((await runWithinBudget(args(async () => ok)))).toMatchObject({ limit: 'overall_daily' });
    });

    it('calls older than 24 hours do not count, and the same ask passes once the wait is over', async () => {
      fillUserCap();
      expect((await runWithinBudget(args(async () => ok))).kind).toBe('limited');
      usage.nowMs += 3600 * 1000 + 1000; // the oldest call (23 hours ago) is now over 24 hours old
      expect((await runWithinBudget(args(async () => ok))).kind).toBe('answered');
    });

    it('half way through the wait, the remaining time shrinks to match', async () => {
      fillUserCap();
      usage.nowMs += 30 * MIN;
      expect(await runWithinBudget(args(async () => ok))).toEqual({ kind: 'limited', limit: 'user_daily', retryAfterSeconds: 1800 });
    });

    it('another user\'s calls do not use up your spacing or your cap', async () => {
      seedUsage(OTHER_USER, 1_000);
      for (let h = 23; h >= 4; h--) seedUsage(OTHER_USER, h * HOUR);
      expect((await runWithinBudget(args(async () => ok))).kind).toBe('answered');
    });
  });

  describe('fails closed: if the limits cannot be checked the model is not called', () => {
    it('the database returns an error (only its code is logged, not its message)', async () => {
      usage.failReserveWith = 'connection to 10.0.0.1 failed for role secret_role';
      const call = vi.fn(async () => ok);
      expect(await runWithinBudget(args(call))).toEqual({ kind: 'unchecked' });
      expect(call).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith('[llm] could not reserve a call', { code: 'XX000' });
      expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(/10\.0\.0\.1|secret_role/);
    });

    it.each([
      ['nothing', undefined],
      ['null', null],
      ['a string', 'yes'],
      ['allowed with no row id', { allowed: true }],
      ['allowed with a row id that is not a uuid', { allowed: true, log_id: 'abc' }],
      ['a refusal with an unknown reason', { allowed: false, reason: 'whenever', retry_after_seconds: 5 }],
      ['a refusal with no reason', { allowed: false, retry_after_seconds: 5 }],
      ['a refusal with no wait', { allowed: false, reason: 'user_daily' }],
      ['a refusal with a zero wait', { allowed: false, reason: 'user_daily', retry_after_seconds: 0 }],
    ])('an answer in an unexpected shape (%s)', async (_name, answer) => {
      usage.reserveAnswer = answer ?? null;
      const call = vi.fn(async () => ok);
      expect(await runWithinBudget(args(call))).toEqual({ kind: 'unchecked' });
      expect(call).not.toHaveBeenCalled();
    });

    it('no service-role client in this environment', async () => {
      usage.noAdminClient = true;
      const call = vi.fn(async () => ok);
      expect(await runWithinBudget(args(call))).toEqual({ kind: 'unchecked' });
      expect(call).not.toHaveBeenCalled();
    });
  });

  it('keeps the answer when recording it fails; the row stays pending and still counts as a call', async () => {
    usage.failUpdateWith = 'could not serialize access';
    const result = await runWithinBudget(args(async () => ok));
    expect(result).toEqual({ kind: 'answered', result: ok });
    expect(rowsFor(USER)[0].outcome).toBe('pending');
    expect(consoleError).toHaveBeenCalledWith('[llm] could not record usage', { code: 'XX000' });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('serialize');
    // It counts: asking again at once is too soon.
    expect(await runWithinBudget(args(async () => ok))).toMatchObject({ kind: 'limited', limit: 'too_soon' });
  });
});

// ---------------------------------------------------------------------------
// The rebalance call site
// ---------------------------------------------------------------------------

describe('rebalance (Ask Claude): what each limit does', () => {
  const task = behind();
  const rules = () => buildRebalanceProposal(asMicroTasks([task]), 4, TODAY);
  const ask = () => proposeRebalance(asMicroTasks([task]), 4, TODAY, { useModel: true, budget: { userId: USER } });

  async function expectRulesWithNotice(notice: string) {
    const r = await ask();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Labelled, never silent: the source says rules, there is no model, and the notice says why.
    expect(r.data.source).toBe('rules');
    expect(r.data.model).toBeNull();
    expect(r.data.notice).toBe(notice);
    expect(r.data.proposal).toEqual(rules());
    expect(model.rebalance).not.toHaveBeenCalled();
  }

  it('within the limits it asks Claude and shows the model\'s checked proposal', async () => {
    model.rebalance.mockResolvedValueOnce(rebalanceAnswer(task));
    const r = await ask();
    expect(r.ok && r.data).toMatchObject({ source: 'model', model: 'claude-opus-5-5', notice: null });
    expect(rowsFor(USER)).toHaveLength(1);
  });

  it('your daily cap: the rule-based proposal, labelled with your cap and when you can ask again', async () => {
    fillUserCap();
    await expectRulesWithNotice(
      "You've used all 20 of your Claude requests for the last 24 hours, so this is the rule-based suggestion. You can ask again in about 60 minutes.",
    );
    expect(rowsFor(USER)).toHaveLength(20);
  });

  it('the shared daily cap: the rule-based proposal, labelled as everyone\'s limit with the earliest time', async () => {
    fillSharedCap();
    await expectRulesWithNotice(
      'Claude is at its shared limit for everyone right now, so this is the rule-based suggestion. Try again in about 8 hours at the earliest.',
    );
  });

  it('the notice tracks the clock: later in the wait it says less time', async () => {
    fillUserCap();
    usage.nowMs += 45 * MIN;
    await expectRulesWithNotice(
      "You've used all 20 of your Claude requests for the last 24 hours, so this is the rule-based suggestion. You can ask again in about 15 minutes.",
    );
  });

  it('the 20 second spacing is an error, as before, not a fallback: asking twice in a row is not a reason to switch', async () => {
    seedUsage(USER, 4_000);
    expect(await ask()).toEqual({ ok: false, error: 'Please wait a few seconds before asking again.' });
    expect(model.rebalance).not.toHaveBeenCalled();
  });

  it('limits that cannot be checked: the rule-based proposal with a notice, and no model call (fail closed)', async () => {
    usage.failReserveWith = 'down';
    await expectRulesWithNotice("Claude's usage limits could not be checked, so this is the rule-based suggestion.");
  });

  it('asking for the model with no user to charge it to does nothing: no code path reaches Claude unmetered', async () => {
    const r = await proposeRebalance(asMicroTasks([task]), 4, TODAY, { useModel: true });
    expect(r.ok && r.data).toMatchObject({ source: 'rules', notice: "Claude's usage limits could not be checked, so this is the rule-based suggestion." });
    expect(model.rebalance).not.toHaveBeenCalled();
    expect(usage.reserveCalls).toHaveLength(0);
  });

  it('end to end from the click: a user at their cap gets the labelled rule-based proposal for their goal', async () => {
    const goal = channelRow({ channel_key: 'g1', start_date: '2026-10-14' });
    db.channels = [goal];
    db.tasks = [behind({ goal_channel_id: goal.id })];
    fillUserCap();
    const r = await requestModelRebalance(goal.id, { now: () => usage.nowMs });
    expect(r.ok && r.data).toMatchObject({ source: 'rules', model: null });
    expect(r.ok && r.data.notice).toMatch(/^You've used all 20 of your Claude requests for the last 24 hours, so this is the rule-based suggestion\. You can ask again in about 60 minutes\.$/);
    expect(model.rebalance).not.toHaveBeenCalled();
  });

  it('never reaches a decision about any task: a limit changes no task, week or status', async () => {
    const goal = channelRow({ channel_key: 'g1', start_date: '2026-10-14' });
    db.channels = [goal];
    db.tasks = [behind({ goal_channel_id: goal.id })];
    const before = JSON.stringify(db.tasks);
    fillUserCap();
    await requestModelRebalance(goal.id, { now: () => usage.nowMs });
    expect(JSON.stringify(db.tasks)).toBe(before);
    expect(db.updates).toHaveLength(0);
    expect(db.rpcCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// The wizard's plan call site
// ---------------------------------------------------------------------------

describe('plan generation (the wizard): what each limit does', () => {
  async function expectMessageOnly(message: string) {
    const r = await generateWeekOnePlan(wizardInput());
    // A limit never becomes a plan. The wizard keeps the starter plan as the person's own choice.
    expect(r).toEqual({ ok: false, error: message });
    expect(model.plan).not.toHaveBeenCalled();
    expect(db.rpcCalls).toHaveLength(0);
    expect(db.tasks).toHaveLength(0);
    expect(db.channels).toHaveLength(0);
  }

  it('within the limits it asks Claude and returns the validated plan', async () => {
    model.plan.mockResolvedValueOnce(goodPlanAnswer());
    const r = await generateWeekOnePlan(wizardInput());
    expect(r.ok && r.data.plan.tasks).toHaveLength(3);
    expect(rowsFor(USER)).toHaveLength(1);
    expect(rowsFor(USER)[0]).toMatchObject({ feature: 'week_one_plan', outcome: 'ok', input_tokens: 900, output_tokens: 210 });
  });

  it('your daily cap: a message with your cap and when you can ask again, and no plan', async () => {
    fillUserCap();
    await expectMessageOnly("You've used all 20 of your Claude requests for the last 24 hours. You can ask again in about 60 minutes.");
  });

  it('the shared daily cap: a message that it is everyone\'s limit, with the earliest time, and no plan', async () => {
    fillSharedCap();
    await expectMessageOnly('Claude is at its shared limit for everyone right now. Try again in about 8 hours at the earliest.');
  });

  it('the 20 second spacing: the same short message as before', async () => {
    seedUsage(USER, 4_000);
    await expectMessageOnly('Please wait a few seconds before asking again.');
  });

  it('limits that cannot be checked: a message, no plan, no model call (fail closed)', async () => {
    usage.failReserveWith = 'down';
    await expectMessageOnly("Claude plans can't be used right now because their usage limits could not be checked.");
  });

  it('every message ends with a full stop, so the wizard\'s "Nothing was saved or substituted." reads as a second sentence', async () => {
    const messages: string[] = [];
    for (const setup of [fillUserCap, fillSharedCap, () => seedUsage(USER, 4_000), () => (usage.failReserveWith = 'down')]) {
      resetUsage();
      setup();
      const r = await generateWeekOnePlan(wizardInput());
      expect(r.ok).toBe(false);
      if (!r.ok) messages.push(r.error);
    }
    expect(messages).toHaveLength(4);
    for (const m of messages) expect(m).toMatch(/[a-z]\.$/);
  });

  it('a bad input is refused before anything is reserved, so it never uses up a limit', async () => {
    expect((await generateWeekOnePlan({ ...wizardInput(), goalType: 'become_a_wizard' })).ok).toBe(false);
    expect(usage.reserveCalls).toHaveLength(0);
    expect(usage.rows).toHaveLength(0);
  });

  it('signed out: refused before anything is reserved', async () => {
    resetDb([], null);
    expect((await generateWeekOnePlan(wizardInput())).ok).toBe(false);
    expect(usage.reserveCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Across instances and cold starts
// ---------------------------------------------------------------------------

describe('the limit holds across serverless instances and cold starts', () => {
  // Each call to this loads a fresh copy of the service with none of the earlier copy's memory, which is what a second
  // instance, or the same one after a cold start, has. They share only the database (the usage fake keeps it on globalThis).
  async function freshInstance() {
    vi.resetModules();
    const tasks = await import('@/lib/services/tasks');
    const fake = await import('./helpers/fakeSupabase');
    fake.resetDb([], { id: USER });
    return tasks;
  }

  it('a second instance asking within 20 seconds is refused, because the first one\'s call is in the database', async () => {
    model.plan.mockResolvedValue(goodPlanAnswer());
    const first = await freshInstance();
    expect((await first.generateWeekOnePlan(wizardInput())).ok).toBe(true);

    const second = await freshInstance();
    expect(await second.generateWeekOnePlan(wizardInput())).toEqual({ ok: false, error: TOO_SOON_MESSAGE });
    expect(model.plan).toHaveBeenCalledTimes(1);
  });

  it('a cold start does not reset it: the same user, a brand new copy of the service, still waits', async () => {
    model.plan.mockResolvedValue(goodPlanAnswer());
    expect((await (await freshInstance()).generateWeekOnePlan(wizardInput())).ok).toBe(true);
    usage.nowMs += 10_000;
    expect((await (await freshInstance()).generateWeekOnePlan(wizardInput())).ok).toBe(false);
    usage.nowMs += 10_001; // 20.001 seconds after the first
    expect((await (await freshInstance()).generateWeekOnePlan(wizardInput())).ok).toBe(true);
    expect(model.plan).toHaveBeenCalledTimes(2);
  });

  it('five instances asking at the same moment: exactly one reaches the model, and the rest are told to wait', async () => {
    model.plan.mockResolvedValue(goodPlanAnswer());
    const instances = [];
    for (let i = 0; i < 5; i++) instances.push(await freshInstance());
    const results = await Promise.all(instances.map((s) => s.generateWeekOnePlan(wizardInput())));

    expect(model.plan).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.error === TOO_SOON_MESSAGE)).toHaveLength(4);
    expect(rowsFor(USER)).toHaveLength(1);
  });

  it('the daily cap is shared by the instances too: one instance\'s calls count against another\'s', async () => {
    fillUserCap();
    const instance = await freshInstance();
    const r = await instance.generateWeekOnePlan(wizardInput());
    expect(r).toEqual({ ok: false, error: "You've used all 20 of your Claude requests for the last 24 hours. You can ask again in about 60 minutes." });
    expect(model.plan).not.toHaveBeenCalled();
  });

  it('the shared cap holds across instances and users: the cap is reached by many users, and each is refused', async () => {
    fillSharedCap();
    const instance = await freshInstance();
    const r = await instance.generateWeekOnePlan(wizardInput());
    expect(r.ok).toBe(false);
    expect(model.plan).not.toHaveBeenCalled();
  });

  it('keeps no memory of its own: no module-level state in the service files that could differ between instances', () => {
    for (const file of ['tasks.ts', 'llm.ts']) {
      const code = withoutComments(read('lib', 'services', file));
      expect(code, file).not.toMatch(/^(let|var)\s/m);
      expect(code, file).not.toMatch(/^(export )?const \w+\s*=\s*new (Map|Set|WeakMap)\b/m);
    }
  });
});

// ---------------------------------------------------------------------------
// Usage rows carry no content
// ---------------------------------------------------------------------------

describe('usage rows carry counts and an outcome, and no content', () => {
  const COLUMNS = ['created_at', 'feature', 'id', 'input_tokens', 'latency_ms', 'model', 'outcome', 'output_tokens', 'user_id'];

  it('after a rebalance and a plan, every row has exactly the approved columns, all plain values', async () => {
    const secretTitle = 'My secret job application notes';
    const t = behind({ title: secretTitle });
    model.rebalance.mockResolvedValueOnce(rebalanceAnswer(t));
    await proposeRebalance(asMicroTasks([t]), 4, TODAY, { useModel: true, budget: { userId: USER } });
    usage.nowMs += MIN;
    model.plan.mockResolvedValueOnce(goodPlanAnswer());
    await generateWeekOnePlan({ ...wizardInput(), title: 'My private goal about changing careers' });

    expect(rowsFor(USER)).toHaveLength(2);
    for (const row of usage.rows) {
      expect(Object.keys(row).sort()).toEqual(COLUMNS);
      for (const value of Object.values(row)) expect(['string', 'number'].includes(typeof value) || value === null).toBe(true);
      expect(row.model).toBe('claude-opus-5-5');
    }
    const everything = JSON.stringify(usage.rows) + JSON.stringify(usage.updates) + JSON.stringify(usage.reserveCalls);
    for (const secret of [secretTitle, 'My private goal', 'changing careers', 'Study the first exam domain', 'Friday review', t.id, 'Unfinished in week 2']) {
      expect(everything).not.toContain(secret);
    }
  });

  it('a refused, a cut-off and a failed call are recorded the same way: counts and an outcome only', async () => {
    model.plan.mockResolvedValueOnce({ ok: false, reason: 'refused', usage: { inputTokens: 300, outputTokens: 0 } });
    await generateWeekOnePlan(wizardInput());
    usage.nowMs += MIN;
    model.plan.mockResolvedValueOnce({ ok: false, reason: 'unavailable', detail: 'sk-ant-secret and the whole prompt' });
    await generateWeekOnePlan(wizardInput());
    expect(rowsFor(USER).map((r) => r.outcome)).toEqual(['refused', 'unavailable']);
    expect(JSON.stringify(usage.rows)).not.toMatch(/sk-ant|prompt|secret/);
    for (const row of usage.rows) expect(Object.keys(row).sort()).toEqual(COLUMNS);
  });

  it('what is written when a call finishes has only the four result fields', async () => {
    model.plan.mockResolvedValueOnce(goodPlanAnswer());
    await generateWeekOnePlan(wizardInput());
    expect(usage.updates).toHaveLength(1);
    expect(Object.keys(usage.updates[0]).sort()).toEqual(['input_tokens', 'latency_ms', 'outcome', 'output_tokens']);
  });

  it('the reservation is made from the user, the feature and the model id, and the four limits, nothing else', async () => {
    model.plan.mockResolvedValueOnce(goodPlanAnswer());
    await generateWeekOnePlan(wizardInput());
    expect(Object.keys(usage.reserveCalls[0]).sort()).toEqual([
      'p_feature',
      'p_min_interval_seconds',
      'p_model',
      'p_overall_daily_cap',
      'p_user_daily_cap',
      'p_user_id',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Reading usage
// ---------------------------------------------------------------------------

describe('usage can be read', () => {
  it('a signed-in user reads their own rows, newest first, and none of anyone else\'s', async () => {
    seedUsage(USER, 3 * HOUR);
    seedUsage(USER, 1 * HOUR);
    seedUsage(OTHER_USER, 2 * HOUR);
    const r = await listMyLlmUsage();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toHaveLength(2);
    expect(r.data.every((row) => row.user_id === USER)).toBe(true);
    expect(r.data.map((row) => row.created_at)).toEqual([...r.data.map((row) => row.created_at)].sort().reverse());
  });

  it('asks only for the columns it shows: counts, an outcome, a model id, a feature and a time', async () => {
    seedUsage(USER, HOUR);
    const r = await listMyLlmUsage();
    expect(r.ok && Object.keys(r.data[0]).sort()).toEqual(['created_at', 'feature', 'id', 'input_tokens', 'latency_ms', 'model', 'outcome', 'output_tokens', 'user_id']);
  });

  it('still returns only their own rows when the fake\'s row level security is off (the user filter is in the query)', async () => {
    seedUsage(USER, HOUR);
    seedUsage(OTHER_USER, HOUR);
    db.rls = false;
    const r = await listMyLlmUsage();
    expect(r.ok && r.data.map((row) => row.user_id)).toEqual([USER]);
  });

  it('limits how many rows it returns', async () => {
    for (let i = 1; i <= 60; i++) seedUsage(USER, i * MIN);
    expect((await listMyLlmUsage()).ok && (await listMyLlmUsage({ limit: 5 })).ok).toBe(true);
    const five = await listMyLlmUsage({ limit: 5 });
    expect(five.ok && five.data).toHaveLength(5);
    const dflt = await listMyLlmUsage();
    expect(dflt.ok && dflt.data).toHaveLength(50);
    const zero = await listMyLlmUsage({ limit: 0 });
    expect(zero.ok && zero.data).toHaveLength(1);
    const odd = await listMyLlmUsage({ limit: 2.5 });
    expect(odd.ok && odd.data).toHaveLength(50);
  });

  it('refuses when signed out', async () => {
    resetDb([], null);
    expect(await listMyLlmUsage()).toEqual({ ok: false, error: 'Sign in to see your Claude usage.' });
  });
});

// ---------------------------------------------------------------------------
// The source
// ---------------------------------------------------------------------------

const root = process.cwd();
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');
const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1').replace(/--.*$/gm, '');
// The AI modules read `error.status`, an HTTP code, to tell failures apart; a task's status is something else.
const withoutHttpStatus = (code: string) => code.replace(/\berror\.status\b/g, '');

describe('the source: no way to complete a task, no unmetered model call, no content in the log', () => {
  const llm = withoutComments(read('lib', 'services', 'llm.ts'));
  const tasks = withoutComments(read('lib', 'services', 'tasks.ts'));
  const migration = withoutComments(read('supabase', 'migrations', '011_llm_usage_logs.sql'));

  // The files this ticket added. (lib/ai/rebalance.ts and taskPlan.ts name "status" in their prompts, to forbid it; the plan
  // path is guarded by tests/week-one-plan-source.test.ts, and the rebalance path by 'changes nothing' in rebalance-model.test.ts.)
  it.each([
    ['lib/services/llm.ts', llm],
    ['lib/ai/usage.ts', withoutComments(read('lib', 'ai', 'usage.ts'))],
    ['migration 011', migration],
  ])('%s never writes status or completed_at and touches no task table', (_name, code) => {
    expect(withoutHttpStatus(code)).not.toMatch(/\bstatus\b|completed_at|completedAt|setTaskStatus/i);
    expect(code).not.toMatch(/micro_tasks|task_rebalance_history|goal_channels/);
  });

  it('the AI modules read only the two token counts off a response, and report them without any text', () => {
    const usageSource = withoutComments(read('lib', 'ai', 'usage.ts'));
    expect([...usageSource.matchAll(/\busage\??\.([a-z_]+)/g)].map((m) => m[1]).sort()).toEqual(['input_tokens', 'output_tokens']);
    for (const file of ['rebalance.ts', 'taskPlan.ts']) {
      const code = withoutComments(read('lib', 'ai', file));
      expect(code, file).toContain('readUsage(response)');
      // The usage handed back is the tokens; nothing from the request or the answer text goes into it.
      expect(code, file).not.toMatch(/usage:\s*\{[^}]*(text|content|prompt|raw)/);
    }
  });

  it('llm.ts writes one table, with one update, and only the four result fields', () => {
    expect([...llm.matchAll(/\.from\('([a-z_]+)'\)/g)].map((m) => m[1])).toEqual(['llm_usage_logs', 'llm_usage_logs']);
    expect([...llm.matchAll(/\.update\(/g)]).toHaveLength(1);
    expect([...llm.matchAll(/\.(insert|upsert|delete)\(/g)]).toHaveLength(0);
    const patch = /\.update\(\{([\s\S]*?)\}\)/.exec(llm)![1];
    expect([...patch.matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]).sort()).toEqual(['input_tokens', 'latency_ms', 'outcome', 'output_tokens']);
  });

  it('llm.ts reserves with a fixed set of arguments, none of which can carry a prompt or an answer', () => {
    const rpc = /\.rpc\('reserve_llm_call', \{([\s\S]*?)\}\)/.exec(llm)![1];
    expect([...rpc.matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]).sort()).toEqual([
      'p_feature',
      'p_min_interval_seconds',
      'p_model',
      'p_overall_daily_cap',
      'p_user_daily_cap',
      'p_user_id',
    ]);
  });

  it('every call to either model function is inside runWithinBudget, and nothing else in lib/ or app/ calls them', () => {
    const inside = [...tasks.matchAll(/call: \(\) => (requestRebalanceFromModel|requestWeekOnePlanFromModel)\(/g)];
    const all = [...tasks.matchAll(/\b(requestRebalanceFromModel|requestWeekOnePlanFromModel)\(/g)];
    expect(inside).toHaveLength(2);
    expect(all).toHaveLength(2);

    const callers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (/\.(ts|tsx)$/.test(entry.name) && /\b(requestRebalanceFromModel|requestWeekOnePlanFromModel)\(/.test(withoutComments(read(...rel.split('/'))))) callers.push(rel);
      }
    };
    for (const dir of ['lib', 'app', 'components']) walk(dir);
    expect(callers.sort()).toEqual(['lib/ai/rebalance.ts', 'lib/ai/taskPlan.ts', 'lib/services/tasks.ts']);
  });

  it('tasks.ts does not hold the service-role client: only llm.ts does', () => {
    expect(tasks).not.toMatch(/supabase\/admin|createSupabaseAdminClient|SERVICE_ROLE/);
    expect(llm).toContain("from '@/lib/supabase/admin'");
  });

  it('the old in-memory cooldowns are gone', () => {
    expect(tasks).not.toMatch(/lastModelRequestAt|lastPlanRequestAt|COOLDOWN_MS/);
  });

  it('the user id in each call comes from the verified session', () => {
    expect(tasks).toMatch(/budget: \{ userId: auth\.user\.id \}/);
    expect(tasks).toMatch(/userId: auth\.user\.id,\n\s+feature: 'week_one_plan'/);
  });
});
