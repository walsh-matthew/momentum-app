// Guided setup's server side (lib/services/setup.ts, MOM-111), against the in-memory stand-ins in
// tests/helpers/fakeSetupSave.ts. The model is a stub passed in and nothing here reaches the network or a key.
//
// What these hold the code to:
// - the next turn: a conversation that is not well formed is refused; a reply that is not a turn, or that breaks a hard rule,
//   is thrown away and asked for again (the person sees none of it), counted, and logged by category only; three in a row end
//   in a plain "try again" with nothing lost; the quick path comes back as what was collected, what is missing, and whether it
//   can be saved;
// - the save: a full approved draft writes every row in the signed-in person's name; a save that fails part-way keeps nothing;
//   a second setup is refused (first setup only); one person never writes another's rows; a parked goal with no shape saves;
//   every work item with steps feeds a checklist target; an incomplete draft is refused in plain words and nothing is sent;
// - the payload the app sends and the SQL of migration 015 read the same keys.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALREADY_SET_UP,
  SETUP_FAILURE_MESSAGES,
  MAX_REPLY_RETRIES,
  getSetupStart,
  saveApprovedSetup,
  takeSetupTurn,
} from '@/lib/services/setup';
import type { RunSetupTurnArgs, SetupTurnResult } from '@/lib/services/llm';
import { emptyDraft } from '@/lib/setup/draft';
import { runSetupEval } from '@/lib/setup/evals';
import { toSavePayload, type SetupRows } from '@/lib/setup/rows';
import { MAX_PERSON_CHARS, type AssistantTurn, type SetupSession } from '@/types/setup';
import { SETUP_CASES } from './setup-evals/cases';
import { resetFakeSave, fakeSave, rowsOf, seedRow } from './helpers/fakeSetupSave';
import { scriptedModel } from './helpers/setupScript';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeSetupSave');
  return { createSupabaseServerClient };
});

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const MODEL = 'claude-opus-5-5';

// A whole, validated conversation from the eval set, and a way to stand at any point inside it.
async function fullCase(options: { withWeekStart?: boolean } = {}) {
  for (const c of SETUP_CASES.filter((x) => x.expect === 'clean')) {
    const report = await runSetupEval(c, scriptedModel(c.script));
    if (!report.finished || report.finalIssues === null || report.finalIssues.length > 0) throw new Error('the case did not finish clean');
    // A weekly target needs the person's week start; a person with only deadline goals is never asked for one.
    if (options.withWeekStart && report.draft.model.person.weekStart === null) continue;
    return { script: c.script, transcript: report.transcript, draft: report.draft };
  }
  throw new Error('no clean case matches');
}

// The conversation as it stands after the person's reply to Claude's turn n-1, waiting for turn n.
function sessionBefore(full: Awaited<ReturnType<typeof fullCase>>, n: number): SetupSession {
  const draft = n === 0 ? emptyDraft() : (full.transcript[2 * (n - 1)] as { role: 'assistant'; turn: AssistantTurn }).turn.draft;
  return { transcript: full.transcript.slice(0, 2 * n), draft, spentTokens: 0 };
}

const completeSession = (full: Awaited<ReturnType<typeof fullCase>>): SetupSession => ({ transcript: full.transcript, draft: full.draft, spentTokens: 0 });

type Reply = { raw: unknown } | { reason: 'refused' | 'rate_limited' | 'unavailable' | 'bad_output' | 'not_configured' } | SetupTurnResult;

// A stand-in for runSetupTurn(): answers from a queue, costs 1000 tokens a call, and remembers what it was asked.
function stubTurn(replies: Reply[]) {
  const calls: RunSetupTurnArgs[] = [];
  const run = async (args: RunSetupTurnArgs): Promise<SetupTurnResult> => {
    calls.push(args);
    const next = replies.shift();
    if (!next) throw new Error('the stub ran out of replies');
    if ('kind' in next) return next;
    const result = 'raw' in next ? { ok: true as const, raw: next.raw, model: MODEL, usage: { inputTokens: 900, outputTokens: 100 } } : { ok: false as const, reason: next.reason, usage: null };
    return { kind: 'answered', result, turns: args.transcript.filter((m) => m.role === 'assistant').length + 1, spentTokens: args.spentTokens + 1000 };
  };
  return { run: run as never, calls };
}

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetFakeSave({ id: ME });
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
// The next turn
// ---------------------------------------------------------------------------

describe('takeSetupTurn: what it accepts', () => {
  it('refuses a conversation that is not well formed, without calling Claude', async () => {
    const full = await fullCase();
    const stub = stubTurn([]);
    const good = sessionBefore(full, 2);
    const longText = 'x'.repeat(MAX_PERSON_CHARS + 1);
    const person = good.transcript[1];
    if (person.role !== 'person') throw new Error('fixture');
    const bad: unknown[] = [
      null,
      'hello',
      { ...good, userId: OTHER }, // a request can't name a person
      { ...good, transcript: [...good.transcript, ...good.transcript.slice(-1)] }, // two person messages in a row would be fine, two assistant turns would not
      { ...good, transcript: [{ role: 'person', text: 'Claude should speak first' }] },
      { ...good, transcript: [good.transcript[0], { role: 'person', text: longText }] },
      { ...good, spentTokens: -1 },
      { ...good, today: '2026-13-45' },
      { ...good, transcript: good.transcript.slice(0, 1) }, // ends with Claude's own turn: nothing to answer
    ];
    for (const raw of bad) {
      const result = await takeSetupTurn(raw, { runTurn: stub.run });
      expect(result.ok, JSON.stringify(raw)?.slice(0, 60)).toBe(false);
    }
    expect(stub.calls).toHaveLength(0);
  });

  it('refuses a signed-out request without calling Claude', async () => {
    const full = await fullCase();
    resetFakeSave(null);
    const stub = stubTurn([]);
    const result = await takeSetupTurn(sessionBefore(full, 1), { runTurn: stub.run });
    expect(result).toEqual({ ok: false, error: 'Sign in to set up your goals.' });
    expect(stub.calls).toHaveLength(0);
  });

  it('takes the person from the session, passes the device date as a suggestion and carries the spent tokens', async () => {
    const full = await fullCase();
    const stub = stubTurn([{ raw: full.script[2] }]);
    const result = await takeSetupTurn({ ...sessionBefore(full, 2), spentTokens: 5000, today: '2026-10-28' }, { runTurn: stub.run });
    expect(result).toMatchObject({ ok: true, data: { kind: 'turn', spentTokens: 6000, rejected: 0 } });
    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]).toMatchObject({ userId: ME, spentTokens: 5000, today: '2026-10-28' });
  });

  it('starts with an empty conversation', async () => {
    const full = await fullCase();
    const stub = stubTurn([{ raw: full.script[0] }]);
    const result = await takeSetupTurn({ transcript: [], draft: emptyDraft(), spentTokens: 0 }, { runTurn: stub.run });
    expect(result).toMatchObject({ ok: true, data: { kind: 'turn' } });
  });
});

describe('takeSetupTurn: replies that are thrown away', () => {
  const badQuestion = (turn: AssistantTurn): AssistantTurn => ({ ...turn, question: 'What is your goal and how often will you work on it?' });

  it('asks again after a reply that is not a turn or that breaks a hard rule, counts them, and shows the person only the good one', async () => {
    const full = await fullCase();
    const good = full.script[2];
    const stub = stubTurn([{ raw: { kind: 'question' } }, { raw: badQuestion(good) }, { raw: good }]);
    const result = await takeSetupTurn(sessionBefore(full, 2), { runTurn: stub.run });
    expect(result).toMatchObject({ ok: true, data: { kind: 'turn', rejected: 2, spentTokens: 3000 } });
    if (!result.ok || result.data.kind !== 'turn') throw new Error('expected a turn');
    expect(result.data.turn).toEqual(good);
    expect(stub.calls.map((c) => c.spentTokens)).toEqual([0, 1000, 2000]);
  });

  it('logs the category and rule names only, never any of the reply', async () => {
    const full = await fullCase();
    const stub = stubTurn([{ raw: { kind: 'question' } }, { raw: badQuestion(full.script[2]) }, { raw: full.script[2] }]);
    await takeSetupTurn(sessionBefore(full, 2), { runTurn: stub.run });
    expect(warn.mock.calls).toEqual([
      ['[setup] a reply was thrown away', { category: 'schema' }],
      ['[setup] a reply was thrown away', { category: 'rules', rules: ['one_question'] }],
    ]);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('how often');
  });

  it('after three unusable replies in a row says to try again, and keeps what was said', async () => {
    const full = await fullCase();
    const stub = stubTurn([{ raw: {} }, { raw: [] }, { raw: badQuestion(full.script[2]) }]);
    const session = sessionBefore(full, 2);
    const result = await takeSetupTurn(session, { runTurn: stub.run });
    expect(MAX_REPLY_RETRIES).toBe(2);
    expect(stub.calls).toHaveLength(3);
    expect(result).toEqual({ ok: true, data: { kind: 'failed', message: SETUP_FAILURE_MESSAGES.unusable, rejected: 3 } });
    // The conversation is the browser's, and nothing was stored, so nothing is lost on the server's side either.
    expect(fakeSave.rpcCalls).toEqual([]);
    expect(rowsOf('goals')).toEqual([]);
  });

  it('stops after two replies in a row that broke the same rules, since a third is the same call again', async () => {
    const full = await fullCase();
    const stub = stubTurn([{ raw: badQuestion(full.script[2]) }, { raw: badQuestion(full.script[2]) }, { raw: full.script[2] }]);
    const result = await takeSetupTurn(sessionBefore(full, 2), { runTurn: stub.run });
    expect(stub.calls).toHaveLength(2);
    expect(result).toEqual({ ok: true, data: { kind: 'failed', message: SETUP_FAILURE_MESSAGES.unusable, rejected: 2 } });
  });

  it('keeps all three tries when the rejections differ', async () => {
    const full = await fullCase();
    const stub = stubTurn([{ raw: badQuestion(full.script[2]) }, { raw: {} }, { raw: badQuestion(full.script[2]) }]);
    await takeSetupTurn(sessionBefore(full, 2), { runTurn: stub.run });
    expect(stub.calls).toHaveLength(3);
  });

  it('counts a reply Claude could not complete as unusable and asks again', async () => {
    const full = await fullCase();
    const stub = stubTurn([{ reason: 'bad_output' }, { raw: full.script[2] }]);
    const result = await takeSetupTurn(sessionBefore(full, 2), { runTurn: stub.run });
    expect(result).toMatchObject({ ok: true, data: { kind: 'turn', rejected: 1 } });
    expect(warn).toHaveBeenCalledWith('[setup] a reply was thrown away', { category: 'output' });
  });

  it.each(['refused', 'rate_limited', 'unavailable', 'not_configured'] as const)('does not retry when Claude says %s', async (reason) => {
    const full = await fullCase();
    const stub = stubTurn([{ reason }]);
    const result = await takeSetupTurn(sessionBefore(full, 2), { runTurn: stub.run });
    expect(result).toEqual({ ok: true, data: { kind: 'failed', message: SETUP_FAILURE_MESSAGES[reason], rejected: 0 } });
    expect(stub.calls).toHaveLength(1);
  });
});

describe('takeSetupTurn: when Claude is no longer used', () => {
  it('returns the wait as it is', async () => {
    const full = await fullCase();
    const stub = stubTurn([{ kind: 'wait', retryAfterSeconds: 2, message: 'Please wait a few seconds before asking again.' }]);
    const result = await takeSetupTurn(sessionBefore(full, 2), { runTurn: stub.run });
    expect(result).toEqual({ ok: true, data: { kind: 'wait', message: 'Please wait a few seconds before asking again.', retryAfterSeconds: 2 } });
  });

  it('plays back every part so far, says in plain words what is missing, and cannot be saved yet', async () => {
    const full = await fullCase();
    const stub = stubTurn([{ kind: 'quick_path', reason: 'over_turns', message: 'This setup has used its share of Claude\'s time.' }]);
    const result = await takeSetupTurn(sessionBefore(full, 3), { runTurn: stub.run });
    if (!result.ok || result.data.kind !== 'quick_path') throw new Error('expected the quick path');
    expect(result.data.reason).toBe('over_turns');
    expect(result.data.sections.map((s) => s.chunk)).toEqual(['goals', 'targets', 'planning', 'talk']);
    expect(result.data.canSave).toBe(false);
    expect(result.data.missing.length).toBeGreaterThan(0);
    // Plain words: no field paths, no instructions to Claude.
    for (const line of result.data.missing) expect(line).not.toMatch(/goals\.|person\.|Ask |draft/);
  });

  it('can be saved when the draft is complete, because saving there is the approval of every part shown', async () => {
    const full = await fullCase();
    const done = completeSession(full);
    const session: SetupSession = { ...done, transcript: [...done.transcript, { role: 'person', text: 'Looks fine.' }] };
    const stub = stubTurn([{ kind: 'quick_path', reason: 'shared_cap', message: 'Claude is at its shared limit for everyone right now.' }]);
    const result = await takeSetupTurn(session, { runTurn: stub.run });
    if (!result.ok || result.data.kind !== 'quick_path') throw new Error('expected the quick path');
    expect(result.data).toMatchObject({ canSave: true, missing: [] });
  });
});

// ---------------------------------------------------------------------------
// The save
// ---------------------------------------------------------------------------

const countsOf = (userId: string) => ({
  settings: rowsOf('person_settings', userId).length,
  goals: rowsOf('goals', userId).length,
  targets: rowsOf('targets', userId).length,
  items: rowsOf('work_items', userId).length,
  steps: rowsOf('work_item_steps', userId).length,
  sources: rowsOf('sources', userId).length,
  bindings: rowsOf('target_sources', userId).length,
});

describe('saveApprovedSetup: a full approved setup', () => {
  it('writes every row, all in the signed-in person\'s name, and sends no user id', async () => {
    const full = await fullCase();
    const session = completeSession(full);
    const result = await saveApprovedSetup(session);
    expect(result.ok).toBe(true);

    const goals = full.draft.model.goals;
    const targets = goals.flatMap((g) => g.targets);
    const items = goals.flatMap((g) => g.items);
    expect(countsOf(ME)).toMatchObject({
      settings: 1,
      goals: goals.length,
      targets: targets.length,
      items: items.length,
      bindings: targets.reduce((n, t) => n + t.sources.length, 0),
    });
    if (result.ok) expect(result.data).toEqual({ goals: goals.length, targets: targets.length });

    // Every row of every table belongs to the caller, and the payload names nobody.
    for (const table of ['person_settings', 'person_day_types', 'person_priorities', 'goals', 'targets', 'work_items', 'sources'] as const) {
      for (const row of rowsOf(table)) expect(row.user_id, table).toBe(ME);
    }
    expect(fakeSave.rpcCalls).toHaveLength(1);
    expect(fakeSave.rpcCalls[0].fn).toBe('save_guided_setup');
    expect(JSON.stringify(fakeSave.rpcCalls[0].args)).not.toMatch(/user_id|userId/);
  });

  it('binds every target to the sources the person named, the manual one being the person\'s own', async () => {
    const full = await fullCase();
    await saveApprovedSetup(completeSession(full));
    const manual = rowsOf('sources', ME).filter((s) => s.kind === 'manual');
    expect(manual).toHaveLength(1);
    const manualTargets = full.draft.model.goals.flatMap((g) => g.targets).filter((t) => t.sources.some((s) => s.kind === 'manual'));
    expect(manualTargets.length).toBeGreaterThan(0);
    const boundToManual = rowsOf('target_sources', ME).filter((b) => b.source_id === manual[0].id);
    expect(boundToManual).toHaveLength(manualTargets.length);
    // Each target of every goal has at least one binding: none is left without a source.
    for (const target of rowsOf('targets', ME)) {
      expect(rowsOf('target_sources', ME).some((b) => b.target_id === target.id), String(target.title)).toBe(true);
    }
  });

  it('feeds every work item with steps to a checklist target', async () => {
    const full = await fullCase({ withWeekStart: true });
    const model = structuredClone(full.draft.model);
    const g = model.goals[0];
    g.targets.push({
      key: 'prep', title: 'Prep list', measure: 'checklist', unit: null, role: 'outcome', period: { kind: 'weekly' },
      floor: null, aspiration: null, qualifyingThreshold: null, carryOver: 'habit', completionMode: null, tone: null,
      sources: [{ kind: 'manual' }],
    });
    g.items.push({ key: 'list', kind: 'milestone', title: 'Get ready', targetKey: 'prep', dueDate: null, dateCanMove: null, estimateMinutes: null, steps: ['Pack', 'Plan'] });
    const session: SetupSession = { ...completeSession(full), draft: { ...full.draft, model } };
    expect((await saveApprovedSetup(session)).ok).toBe(true);

    const checklist = rowsOf('targets', ME).find((t) => t.title === 'Prep list');
    const item = rowsOf('work_items', ME).find((i) => i.title === 'Get ready');
    expect(item?.target_id).toBe(checklist?.id);
    expect(rowsOf('work_item_steps', ME).filter((s) => s.work_item_id === item?.id).map((s) => s.title)).toEqual(['Pack', 'Plan']);
  });

  it('refuses a work item with steps that feeds no checklist target, and sends nothing', async () => {
    const full = await fullCase();
    const model = structuredClone(full.draft.model);
    model.goals[0].items.push({ key: 'list', kind: 'milestone', title: 'Get ready', targetKey: null, dueDate: null, dateCanMove: null, estimateMinutes: null, steps: ['Pack'] });
    const result = await saveApprovedSetup({ ...completeSession(full), draft: { ...full.draft, model } });
    expect(result.ok).toBe(false);
    expect(fakeSave.rpcCalls).toEqual([]);
    expect(countsOf(ME).goals).toBe(0);
  });
});

describe('saveApprovedSetup: a save that fails keeps nothing', () => {
  it('leaves every table as it was when the database fails part-way', async () => {
    const full = await fullCase();
    fakeSave.failAfterWrites = 5; // after the settings, a goal and some of its targets were written
    const result = await saveApprovedSetup(completeSession(full));
    expect(result).toEqual({ ok: false, error: 'Could not save your setup. Nothing was saved.' });
    expect(fakeSave.rpcCalls).toHaveLength(1);
    expect(countsOf(ME)).toEqual({ settings: 0, goals: 0, targets: 0, items: 0, steps: 0, sources: 0, bindings: 0 });
    // The failure is logged by its code only.
    expect(error).toHaveBeenCalledWith('[setup] could not save a setup', { code: '23514' });
    // Nothing was used up: the same setup saves once the failure is gone.
    fakeSave.failAfterWrites = null;
    expect((await saveApprovedSetup(completeSession(full))).ok).toBe(true);
    expect(countsOf(ME).goals).toBeGreaterThan(0);
  });
});

describe('saveApprovedSetup: first setup only', () => {
  it('refuses a second setup and writes nothing more', async () => {
    const full = await fullCase();
    expect((await saveApprovedSetup(completeSession(full))).ok).toBe(true);
    const before = countsOf(ME);
    const again = await saveApprovedSetup(completeSession(full));
    expect(again).toEqual({ ok: false, error: ALREADY_SET_UP });
    expect(countsOf(ME)).toEqual(before);
  });

  it('getSetupStart says whether the person already has a goal', async () => {
    expect(await getSetupStart()).toEqual({ ok: true, data: { alreadySetUp: false } });
    seedRow('goals', { user_id: ME, title: 'Existing', state: 'active', shape: 'ongoing', start_date: '2026-10-01' });
    expect(await getSetupStart()).toEqual({ ok: true, data: { alreadySetUp: true } });
    seedRow('goals', { user_id: OTHER, title: 'Someone else\'s', state: 'active', shape: 'ongoing', start_date: '2026-10-01' });
    resetFakeSave({ id: OTHER });
    expect(await getSetupStart()).toEqual({ ok: true, data: { alreadySetUp: false } });
  });
});

describe('saveApprovedSetup: one person never writes another\'s rows', () => {
  it('leaves another person\'s rows alone, and one person\'s setup is not blocked by another\'s goals', async () => {
    const full = await fullCase();
    const theirs = seedRow('goals', { user_id: OTHER, title: 'Theirs', state: 'active', shape: 'ongoing', start_date: '2026-10-01' });
    expect((await saveApprovedSetup(completeSession(full))).ok).toBe(true);
    expect(rowsOf('goals', OTHER)).toEqual([theirs]);
    expect(rowsOf('goals', ME).every((g) => g.title !== 'Theirs')).toBe(true);
  });

  it('refuses a request that names a person, and a signed-out one', async () => {
    const full = await fullCase();
    expect((await saveApprovedSetup({ ...completeSession(full), userId: OTHER })).ok).toBe(false);
    resetFakeSave(null);
    expect(await saveApprovedSetup(completeSession(full))).toEqual({ ok: false, error: 'Sign in to set up your goals.' });
    expect(fakeSave.rpcCalls).toEqual([]);
  });
});

describe('saveApprovedSetup: parked goals and incomplete drafts', () => {
  const parkedOnly = (): SetupSession => {
    const draft = emptyDraft();
    draft.model.goals.push({
      key: 'later', title: 'Learn piano', why: null, startDate: null, shape: null, endDate: null, blockWeeks: null, state: 'parked',
      returnWhen: { kind: 'on_request' }, completionMode: null, tone: null, targets: [], items: [],
    });
    return { transcript: [{ role: 'assistant', turn: { kind: 'final', chunk: null, skipped: null, say: '', question: null, topic: null, options: [], draft } }], draft, spentTokens: 0 };
  };

  it('saves a parked goal with no shape and no start date (from the quick path, which approves every part shown)', async () => {
    const result = await saveApprovedSetup(parkedOnly(), true);
    expect(result).toEqual({ ok: true, data: { goals: 1, targets: 0 } });
    expect(rowsOf('goals', ME)[0]).toMatchObject({ title: 'Learn piano', state: 'parked', shape: null, start_date: null, return_kind: 'on_request' });
  });

  it('does not count the quick path\'s approval unless it says so', async () => {
    const result = await saveApprovedSetup(parkedOnly(), false);
    expect(result.ok).toBe(false);
    expect(fakeSave.rpcCalls).toEqual([]);
  });

  it('refuses an incomplete draft in plain words, sends nothing, and writes nothing', async () => {
    const full = await fullCase();
    const model = structuredClone(full.draft.model);
    model.person.timeZone = null;
    model.person.dayEnd = null;
    const result = await saveApprovedSetup({ ...completeSession(full), draft: { ...full.draft, model } }, true);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Your time zone.');
    expect(result.error).toContain('When your day ends.');
    expect(result.error).toMatch(/Nothing was saved\.$/);
    expect(fakeSave.rpcCalls).toEqual([]);
    expect(countsOf(ME).goals).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The payload and the SQL read the same keys
// ---------------------------------------------------------------------------

describe('the payload and migrations 015 and 016 agree', () => {
  // 016 redefines save_guided_setup (CREATE OR REPLACE) to also read "metric"; 015's own file is untouched, but the
  // function it created is superseded, so both files together say what the deployed function actually reads.
  const sql = ['015_save_guided_setup.sql', '016_quantity_metric.sql']
    .map((f) => readFileSync(join(process.cwd(), 'supabase', 'migrations', f), 'utf8').replace(/--.*$/gm, ''))
    .join('\n');

  // Every key of the payload at every level, from a setup that uses every column once.
  const rows: SetupRows = {
    personSettings: {
      time_zone: 'America/Chicago', week_start: 1, day_end: '21:00:00', tone: 'gentle', reminders: 'off', check_ins: 'end_of_week',
      celebrations: 'low_key', balance_mentions: 'weekly_planning', review_depth: 'recap_offer', review_planning: 'one_sitting',
      quiet_times: [{ text: 'Sundays' }], planning_weekday: 7, planning_time: '18:00:00',
    },
    dayTypes: [{ name: 'Work day', capacity_unit: 'hours', capacity_amount: 2 }],
    priorities: [{ label: 'Family', sort_order: 0 }],
    goals: [
      { key: 'g', row: { title: 'G', why: 'w', start_date: '2026-10-28', shape: 'ongoing', end_date: null, block_weeks: 10, state: 'active', return_kind: null, return_date: null, return_note: null, completion_mode: 'manual', tone: 'gentle' } },
    ],
    targets: [
      { key: 't', goalKey: 'g', row: { title: 'T', measure: 'count', unit: null, role: 'effort', period_kind: 'day_slots', due_date: null, slot_weekdays: [1, 3], floor: 2, aspiration: 3, qualifying_threshold: 1, carry_over_kind: 'habit', completion_mode: 'manual', tone: 'gentle' } },
    ],
    workItems: [
      { key: 'i', goalKey: 'g', targetKey: 't', row: { kind: 'milestone', title: 'I', sort_order: 0, due_date: '2026-11-01', date_can_move: false, estimate_minutes: 60 } },
    ],
    steps: [{ goalKey: 'g', itemKey: 'i', row: { title: 'S', sort_order: 0 } }],
    targetSources: [
      { goalKey: 'g', targetKey: 't', source: { kind: 'manual' } },
      { goalKey: 'g', targetKey: 't', source: { kind: 'synced', provider: 'hevy', metric: 'volume_lbs' } },
    ],
  };

  // quiet_times is stored whole as JSON, so what is inside it is data, not keys the function reads.
  const OPAQUE = new Set(['quiet_times']);
  const keysOf = (value: unknown, into = new Set<string>()): Set<string> => {
    if (Array.isArray(value)) value.forEach((v) => keysOf(v, into));
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        into.add(k);
        if (!OPAQUE.has(k)) keysOf(v, into);
      }
    }
    return into;
  };

  // The keys the function reads: ->> 'x' and -> 'x', and the columns named in its jsonb_to_recordset lists.
  const sqlKeys = (): Set<string> => {
    const out = new Set<string>();
    for (const m of sql.matchAll(/->>?\s*'([a-z_]+)'/g)) out.add(m[1]);
    for (const m of sql.matchAll(/as \w+ \(([^)]*)\)/g)) {
      for (const column of m[1].split(',')) out.add(column.trim().split(/\s+/)[0]);
    }
    return out;
  };

  it('every key the function reads is one the app sends, and every key the app sends is one the function reads', () => {
    const payload = toSavePayload(rows);
    const sent = keysOf(payload);
    const read = sqlKeys();
    expect([...read].filter((k) => !sent.has(k)).sort(), 'read by the SQL but never sent').toEqual([]);
    expect([...sent].filter((k) => !read.has(k)).sort(), 'sent by the app but never read by the SQL').toEqual([]);
  });

  it('names a synced source by its catalog name, carries the bound metric, and carries no user id', () => {
    const payload = toSavePayload(rows);
    expect(payload.goals[0].targets[0].sources).toEqual([
      { kind: 'manual' },
      { kind: 'synced', provider: 'hevy', label: 'Hevy', metric: 'volume_lbs' },
    ]);
    expect(JSON.stringify(payload)).not.toMatch(/user_id/);
  });
});
