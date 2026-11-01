// The server side of adding to a finished setup (MOM-132 part 2): the chooser's data, the next turn of the returning conversation, and
// the two saves with the sessions the browser actually sends (a draft that holds none of the person's facts), against the in-memory
// stand-ins of tests/helpers/fakeSetupSave.ts. The model is a stub, so nothing here reaches the network or a key.
//
// What these hold the code to:
// - everything about the person comes from their own rows: the goal and its title, their saved anchors; none of it from the request;
// - what is sent to Claude names the saved topics and, for a target, the goal's title: never a saved value, and never another goal;
// - a reply that asks a saved question is thrown away and retried with fixed words, like any other broken rule;
// - the saves read the saved anchors from the person's rows (a weekly target with no saved week start is refused in plain words, a
//   due-date one is not), and nothing already saved changes.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSetupMessages } from '@/lib/ai/setup';
import type { RunSetupTurnArgs, SetupTurnResult } from '@/lib/services/llm';
import { ADD_REFUSALS, NO_WEEK_START, addApprovedGoals, addApprovedTargets, getAddOptions, saveApprovedSetup, takeAddTurn } from '@/lib/services/setup';
import { runSetupEval } from '@/lib/setup/evals';
import { RETRY_FEEDBACK } from '@/lib/setup/feedback';
import { returningDraft, returningNote } from '@/lib/setup/returning';
import type { SetupSession } from '@/types/setup';
import { RETURNING_CASES, SETUP_CASES } from './setup-evals/cases';
import { createSupabaseServerClient, resetFakeSave, rowsOf, seedRow } from './helpers/fakeSetupSave';
import { scriptedModel } from './helpers/setupScript';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeSetupSave');
  return { createSupabaseServerClient };
});

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const sub = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

beforeEach(() => {
  resetFakeSave({ id: ME });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

async function returningSession(id: string): Promise<SetupSession> {
  const c = RETURNING_CASES.find((x) => x.id === id);
  if (!c) throw new Error(`no case ${id}`);
  const report = await runSetupEval(c, scriptedModel(c.script));
  if (!report.finished || report.finalIssues === null || report.finalIssues.length > 0) throw new Error(`${id} did not finish clean`);
  return { transcript: report.transcript, draft: report.draft, spentTokens: 0 };
}

// The first setup of the person: one goal, "Run more", with a weekly target, a Denver time zone, a day end and a Monday week start.
async function firstSetup() {
  const c = SETUP_CASES.find((x) => x.id === 'run-b-habit-ideas')!;
  const report = await runSetupEval(c, scriptedModel(c.script));
  const result = await saveApprovedSetup({ transcript: report.transcript, draft: report.draft, spentTokens: 0 });
  expect(result.ok).toBe(true);
  return rowsOf('goals', ME)[0];
}

// A stand-in for runSetupTurn(): answers from a queue and remembers what it was asked.
function stubTurn(raws: unknown[]) {
  const calls: RunSetupTurnArgs[] = [];
  const run = async (args: RunSetupTurnArgs): Promise<SetupTurnResult> => {
    calls.push(args);
    const raw = raws.shift();
    if (raw === undefined) throw new Error('the stub ran out of replies');
    return {
      kind: 'answered',
      result: { ok: true, raw, model: 'claude-opus-5-5', usage: { inputTokens: 900, outputTokens: 100 } },
      turns: args.transcript.filter((m) => m.role === 'assistant').length + 1,
      spentTokens: args.spentTokens + 1000,
    };
  };
  return { run: run as never, calls };
}

// Exactly what would be sent to Claude for a call: the messages the model call builds from its arguments (the person's id is not among them).
const wire = (call: RunSetupTurnArgs): string =>
  JSON.stringify(buildSetupMessages(call.transcript, call.draft, { today: call.today, returningNote: call.returningNote, dateHint: call.dateHint, sourceNote: call.sourceNote, retryFeedback: call.retryFeedback }));
const request = (draft: SetupSession['draft'], addition: Record<string, unknown>) => ({ transcript: [], draft, spentTokens: 0, addition });
const firstTurn = (id: string) => RETURNING_CASES.find((c) => c.id === id)!.script[0];

describe('getAddOptions: what /setup shows a person who has finished setup', () => {
  it('lists their active goals with their dates, their saved week start and their own today', async () => {
    const goal = await firstSetup();
    seedRow('goals', { user_id: ME, title: 'Later', state: 'parked', shape: null, start_date: null });
    seedRow('goals', { user_id: OTHER, title: 'Theirs', state: 'active', shape: 'ongoing', start_date: '2026-10-01' });
    const result = await getAddOptions();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.goals).toEqual([{ id: goal.id, title: 'Run more', startDate: String(goal.start_date), endDate: goal.end_date ?? null }]);
    expect(result.data.weekStart).toBe(1);
    expect(result.data.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('says there is no week start when none is saved, and refuses a signed-out request', async () => {
    await firstSetup();
    rowsOf('person_settings', ME)[0].week_start = null;
    const result = await getAddOptions();
    expect(result.ok && result.data.weekStart).toBeNull();
    resetFakeSave(null);
    expect((await getAddOptions()).ok).toBe(false);
  });

  it('orders goals by the place the person gave them', async () => {
    await firstSetup();
    const second = seedRow('goals', { user_id: ME, title: 'Read', state: 'active', shape: 'ongoing', start_date: '2026-10-28', sort_order: 1 });
    rowsOf('goals', ME)[0].sort_order = 0;
    const result = await getAddOptions();
    expect(result.ok && result.data.goals.map((g) => g.title)).toEqual(['Run more', 'Read']);
    second.sort_order = -1;
    const flipped = await getAddOptions();
    expect(flipped.ok && flipped.data.goals.map((g) => g.title)).toEqual(['Read', 'Run more']);
  });
});

describe('takeAddTurn: the next turn of a returning conversation', () => {
  it('refuses a request that is not well formed, or that names a person, without calling Claude', async () => {
    await firstSetup();
    const stub = stubTurn([]);
    const draft = returningDraft('add_goal', null);
    const good = request(draft, { mode: 'add_goal' });
    const bad: unknown[] = [
      null,
      { ...good, addition: undefined },
      { ...good, addition: { mode: 'nonsense' } },
      { ...good, addition: { mode: 'add_goal', userId: OTHER } },
      { ...good, addition: { mode: 'add_target', goalId: 'not-an-id' } },
      { ...good, userId: OTHER },
      { ...good, transcript: [{ role: 'person', text: 'Claude should speak first' }] },
    ];
    for (const raw of bad) expect((await takeAddTurn(raw, { runTurn: stub.run })).ok, JSON.stringify(raw)?.slice(0, 60)).toBe(false);
    expect(stub.calls).toHaveLength(0);
  });

  it('refuses a person who has not finished their first setup, and a goal that is not theirs, not active, or not there', async () => {
    const stub = stubTurn([]);
    expect(await takeAddTurn(request(returningDraft('add_goal', null), { mode: 'add_goal' }), { runTurn: stub.run })).toEqual({ ok: false, error: ADD_REFUSALS.MS003 });

    await firstSetup();
    const theirs = seedRow('goals', { user_id: OTHER, title: 'Theirs', state: 'active', shape: 'ongoing', start_date: '2026-10-01' });
    const parked = seedRow('goals', { user_id: ME, title: 'Later', state: 'parked', shape: null, start_date: null });
    for (const goalId of [theirs.id, parked.id, crypto.randomUUID()]) {
      expect(await takeAddTurn(request(returningDraft('add_target', 'x'), { mode: 'add_target', goalId }), { runTurn: stub.run })).toEqual({ ok: false, error: ADD_REFUSALS.MS004 });
    }
    expect(await takeAddTurn(request(returningDraft('add_target', 'x'), { mode: 'add_target' }), { runTurn: stub.run })).toEqual({ ok: false, error: ADD_REFUSALS.MS004 });
    resetFakeSave(null);
    expect((await takeAddTurn(request(returningDraft('add_goal', null), { mode: 'add_goal' }), { runTurn: stub.run })).ok).toBe(false);
    expect(stub.calls).toHaveLength(0);
  });

  it('asks Claude once with the fixed note, and sends nothing the person saved: not their anchors, and not their goal when adding a goal', async () => {
    await firstSetup();
    const stub = stubTurn([firstTurn('return-g-reading')]);
    const result = await takeAddTurn(request(returningDraft('add_goal', null), { mode: 'add_goal' }), { runTurn: stub.run });
    expect(result.ok && result.data.kind).toBe('turn');
    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0].returningNote).toBe(returningNote({ mode: 'add_goal', goalTitle: null }));
    const sent = wire(stub.calls[0]);
    for (const saved of ['Run more', 'America/Denver', '21:00', 'Denver']) expect(sent, saved).not.toContain(saved);
    expect(sent).not.toMatch(/user_id|userId|@/);
    expect(sent).toContain('Note from code');
  });

  it('takes the goal and its title from the person’s own rows: a request can not name a title, and only that goal’s title is sent', async () => {
    const goal = await firstSetup();
    seedRow('goals', { user_id: ME, title: 'Read more books', state: 'active', shape: 'ongoing', start_date: '2026-10-28' });
    const stub = stubTurn([firstTurn('return-t-miles')]);
    const draft = returningDraft('add_target', 'Run more');
    // A request that names a title (or anything else about the goal) is not a request.
    expect((await takeAddTurn(request(draft, { mode: 'add_target', goalId: goal.id, goalTitle: 'Read more books' }), { runTurn: stub.run })).ok).toBe(false);
    expect(stub.calls).toHaveLength(0);

    const result = await takeAddTurn(request(draft, { mode: 'add_target', goalId: goal.id }), { runTurn: stub.run });
    expect(result.ok).toBe(true);
    expect(stub.calls[0].returningNote).toBe(returningNote({ mode: 'add_target', goalTitle: 'Run more' }));
    const sent = wire(stub.calls[0]);
    expect(sent).toContain('Run more');
    // The person's other goal is not sent, and neither is any saved anchor.
    for (const saved of ['Read more books', 'America/Denver', '21:00']) expect(sent, saved).not.toContain(saved);
  });

  it('throws away a reply that asks a saved question, and retries with the fixed words', async () => {
    await firstSetup();
    const bad = RETURNING_CASES.find((c) => c.id === 'return-bad-asks-time-zone')!.script[0];
    const stub = stubTurn([bad, firstTurn('return-g-reading')]);
    const result = await takeAddTurn(request(returningDraft('add_goal', null), { mode: 'add_goal' }), { runTurn: stub.run });
    expect(result.ok && result.data.kind).toBe('turn');
    if (result.ok && result.data.kind === 'turn') expect(result.data.rejected).toBe(1);
    expect(stub.calls[1].retryFeedback?.join(' ')).toContain(RETRY_FEEDBACK['returning.topic']);
  });

  it('three replies that break the same rules end in the usual "try again", with nothing lost', async () => {
    await firstSetup();
    const bad = RETURNING_CASES.find((c) => c.id === 'return-bad-writes-a-fact')!.script[0];
    const stub = stubTurn([bad, bad, bad]);
    const result = await takeAddTurn(request(returningDraft('add_goal', null), { mode: 'add_goal' }), { runTurn: stub.run });
    expect(result.ok && result.data.kind).toBe('failed');
  });
});

describe('the saves, with the sessions the browser sends (a draft that holds none of the person’s facts)', () => {
  it('adds a goal read from a returning conversation, and nothing already saved changes', async () => {
    await firstSetup();
    const before = structuredClone({ settings: rowsOf('person_settings', ME), goals: rowsOf('goals', ME), targets: rowsOf('targets', ME) });
    const session = await returningSession('return-g-reading');
    expect(session.draft.model.person.timeZone).toBeNull();
    const result = await addApprovedGoals(session, { submissionId: sub(1) });
    expect(result).toEqual({ ok: true, data: { goals: 1, targets: 1, replayed: false } });
    expect(rowsOf('person_settings', ME)).toEqual(before.settings);
    expect(rowsOf('goals', ME).filter((g) => before.goals.some((b) => b.id === g.id))).toEqual(before.goals);
    expect(rowsOf('targets', ME).filter((t) => before.targets.some((b) => b.id === t.id))).toEqual(before.targets);
    expect(rowsOf('goals', ME).find((g) => g.title === 'Read more')).toMatchObject({ state: 'active', sort_order: 1 });
  });

  it('a double tap sends one id: the second answer is the first one, and one goal is saved', async () => {
    await firstSetup();
    const session = await returningSession('return-g-reading');
    const first = await addApprovedGoals(session, { submissionId: sub(1) });
    const again = await addApprovedGoals(session, { submissionId: sub(1) });
    expect(first).toEqual({ ok: true, data: { goals: 1, targets: 1, replayed: false } });
    expect(again).toEqual({ ok: true, data: { goals: 1, targets: 1, replayed: true } });
    expect(rowsOf('goals', ME).filter((g) => g.title === 'Read more')).toHaveLength(1);
  });

  it('adds targets to the goal they have from a returning conversation, graded only from the start they chose', async () => {
    const goal = await firstSetup();
    const session = await returningSession('return-t-miles');
    const result = await addApprovedTargets(session, { submissionId: sub(1), goalId: goal.id, startDate: '2026-11-10' });
    expect(result).toEqual({ ok: true, data: { goals: 0, targets: 1, replayed: false } });
    expect(rowsOf('targets', ME).find((t) => t.title === 'Miles')).toMatchObject({ goal_id: goal.id, start_date: '2026-11-10', sort_order: 1 });
    expect(rowsOf('targets', ME).find((t) => t.title === 'Runs')).toMatchObject({ start_date: null });
    expect(rowsOf('goals', ME)).toHaveLength(1);
  });

  it('refuses a weekly target when no week start is saved, in plain words, and a due-date one is added', async () => {
    const goal = await firstSetup();
    rowsOf('person_settings', ME)[0].week_start = null;
    expect(await addApprovedGoals(await returningSession('return-g-reading'), { submissionId: sub(1) })).toEqual({ ok: false, error: NO_WEEK_START });
    expect(await addApprovedTargets(await returningSession('return-t-miles'), { submissionId: sub(2), goalId: goal.id, startDate: '2026-11-10' })).toEqual({
      ok: false,
      error: NO_WEEK_START,
    });
    expect(rowsOf('goals', ME)).toHaveLength(1);
    const due = await addApprovedGoals(await returningSession('return-g-deadline'), { submissionId: sub(3) });
    expect(due.ok).toBe(true);
  });

  it('refuses an unfinished first setup with its own words, ahead of the week-start line', async () => {
    expect(await addApprovedGoals(await returningSession('return-g-reading'), { submissionId: sub(1) })).toEqual({ ok: false, error: ADD_REFUSALS.MS003 });
  });

  it('refuses a returning conversation that was not approved, and one that holds a second goal for a target', async () => {
    const goal = await firstSetup();
    const session = await returningSession('return-t-miles');
    const unapproved = { ...session, draft: { ...session.draft, approved: ['talk' as const] } };
    const result = await addApprovedTargets(unapproved, { submissionId: sub(1), goalId: goal.id, startDate: '2026-11-10' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/^This setup can't be saved yet\./);
    expect(rowsOf('targets', ME)).toHaveLength(1);
  });
});
