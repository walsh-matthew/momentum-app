// Adding to a setup after the first one (lib/services/setup.ts addApprovedGoals and addApprovedTargets, MOM-132, migration 021), against
// the in-memory stand-ins in tests/helpers/fakeSetupSave.ts. The model is not called and nothing here reaches the network or a key.
//
// What these hold the code to (docs/DOMAIN_MODEL.md §1.3 "Start", §1.7, §2.3):
// - a person who has set up can add a goal, or targets to a goal they have, through a save of its own, and nothing already saved
//   changes (compared row by row), not even the person's facts: those are not sent;
// - the order the person gave is stored: the first setup writes it, an added goal goes after the last one, an added target after the
//   goal's last target;
// - a target added to a goal that has started stores the start the person gave, never one the code picked, and a target made with its
//   goal stores none (it counts from its goal);
// - the same approval sent twice writes once and gets the first answer back; the same goal approved as a new approval is refused;
// - one person never reaches another's goals; a refusal says why in plain words and writes nothing; a save that fails part-way keeps
//   nothing, and the same approval can be sent again.
// The SQL itself (constraints, row level security, grants, the lock) is in supabase/verify/021_add_after_setup.sql.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADD_FAILED, ADD_REFUSALS, ADD_SIGN_IN, NO_WEEK_START, START_AFTER_DUE, addApprovedGoals, addApprovedTargets, saveApprovedSetup } from '@/lib/services/setup';
import { runSetupEval } from '@/lib/setup/evals';
import { draftToRows, toAddTargetsPayload } from '@/lib/setup/rows';
import type { SetupSession } from '@/types/setup';
import { SETUP_CASES } from './setup-evals/cases';
import { createSupabaseServerClient, resetFakeSave, fakeSave, rowsOf, seedRow } from './helpers/fakeSetupSave';
import { scriptedModel } from './helpers/setupScript';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeSetupSave');
  return { createSupabaseServerClient };
});

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  resetFakeSave({ id: ME });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const sub = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function caseNamed(id: string) {
  const c = SETUP_CASES.find((x) => x.id === id);
  if (!c) throw new Error(`no case ${id}`);
  const report = await runSetupEval(c, scriptedModel(c.script));
  if (!report.finished || report.finalIssues === null || report.finalIssues.length > 0) throw new Error(`${id} did not finish clean`);
  return { transcript: report.transcript, draft: report.draft };
}
const sessionOf = (c: Awaited<ReturnType<typeof caseNamed>>): SetupSession => ({ transcript: c.transcript, draft: c.draft, spentTokens: 0 });

const SAVED_TABLES = [
  'person_settings',
  'person_day_types',
  'person_priorities',
  'goals',
  'targets',
  'work_items',
  'work_item_steps',
  'sources',
  'target_sources',
  'starting_points',
] as const;
type Saved = Record<(typeof SAVED_TABLES)[number], ReturnType<typeof rowsOf>>;

// Everything a person has saved, as plain data, so "nothing already saved changed" is a comparison and not a hope.
const savedBy = (userId: string): Saved => structuredClone(Object.fromEntries(SAVED_TABLES.map((t) => [t, rowsOf(t, userId)])) as Saved);
const expectUnchanged = (before: Saved, after: Saved) => {
  for (const table of SAVED_TABLES) {
    const kept = after[table].filter((r) => before[table].some((b) => b.id === r.id));
    expect(kept, `${table}: every row that was saved is exactly as it was`).toEqual(before[table]);
  }
};
const daysAfter = (date: string, n: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const lastCall = () => fakeSave.rpcCalls[fakeSave.rpcCalls.length - 1];

// The first setup of every test: one goal, "Run more", with one weekly target "Runs", starting 2026-10-27.
async function firstSetup() {
  const result = await saveApprovedSetup(sessionOf(await caseNamed('run-b-habit-ideas')));
  expect(result.ok).toBe(true);
  return rowsOf('goals', ME)[0];
}

describe('saveApprovedSetup: the order the person gave is stored', () => {
  it('stores each goal by its place in the approved list and its targets by theirs, and no target has a start of its own', async () => {
    const c = await caseNamed('run-h-two-activities');
    expect((await saveApprovedSetup(sessionOf(c))).ok).toBe(true);
    const drafted = draftToRows(c.draft, c.transcript);
    if (!drafted.ok) throw new Error('the case is not final');
    const saved = rowsOf('goals', ME)
      .map((g) => [g.title, g.sort_order])
      .sort((a, b) => (a[1] as number) - (b[1] as number));
    expect(saved).toEqual(drafted.rows.goals.map((g, i) => [g.row.title, i]));
    expect(rowsOf('targets', ME).every((t) => t.sort_order === 0 && t.start_date === null)).toBe(true);
  });
});

describe('addApprovedGoals: a person who has set up adds a goal through its own save', () => {
  it('adds the goal and its targets after the last one, and changes nothing already saved (the person’s facts are not even sent)', async () => {
    await firstSetup();
    const before = savedBy(ME);
    const result = await addApprovedGoals(sessionOf(await caseNamed('run-r-reading-ideas')), { submissionId: sub(1) });
    expect(result).toEqual({ ok: true, data: { goals: 1, targets: 1, replayed: false } });

    const call = lastCall();
    expect(call.fn).toBe('add_goals_after_setup');
    expect(Object.keys(call.args.p_payload as object).sort()).toEqual(['goals', 'submission_id']);
    expect(JSON.stringify(call.args)).not.toMatch(/user_id|userId|time_zone|day_types|priorities/);
    expect(fakeSave.rpcCalls.map((c) => c.fn)).toEqual(['save_guided_setup', 'add_goals_after_setup']);

    expectUnchanged(before, savedBy(ME));
    const added = rowsOf('goals', ME).find((g) => g.sort_order === 1);
    expect(added).toMatchObject({ title: 'Read more books', state: 'active' });
    expect(rowsOf('goals', ME).find((g) => g.sort_order === 0)).toMatchObject({ title: 'Run more' });
    const targets = rowsOf('targets', ME).filter((t) => t.goal_id === added?.id);
    expect(targets).toHaveLength(1);
    // A target made with its goal counts from its goal: it has no start of its own.
    expect(targets[0]).toMatchObject({ sort_order: 0, start_date: null });
  });

  it('the same approval sent twice saves once, and the second tap gets the first answer back', async () => {
    await firstSetup();
    const reading = sessionOf(await caseNamed('run-r-reading-ideas'));
    const first = await addApprovedGoals(reading, { submissionId: sub(1) });
    const before = savedBy(ME);
    const again = await addApprovedGoals(reading, { submissionId: sub(1) });
    expect(first).toEqual({ ok: true, data: { goals: 1, targets: 1, replayed: false } });
    expect(again).toEqual({ ok: true, data: { goals: 1, targets: 1, replayed: true } });
    expect(savedBy(ME)).toEqual(before);
    expect(rowsOf('goals', ME)).toHaveLength(2);
    expect(rowsOf('setup_additions', ME)).toHaveLength(1);
  });

  it('the same goal approved again as a new approval (a second tab) is refused in plain words and nothing is added', async () => {
    await firstSetup();
    const reading = sessionOf(await caseNamed('run-r-reading-ideas'));
    expect((await addApprovedGoals(reading, { submissionId: sub(1) })).ok).toBe(true);
    const before = savedBy(ME);
    expect(await addApprovedGoals(reading, { submissionId: sub(2) })).toEqual({ ok: false, error: ADD_REFUSALS.MS002 });
    expect(savedBy(ME)).toEqual(before);
  });

  it('refuses a person who has not finished their first setup, and writes nothing', async () => {
    const result = await addApprovedGoals(sessionOf(await caseNamed('run-r-reading-ideas')), { submissionId: sub(1) });
    expect(result).toEqual({ ok: false, error: ADD_REFUSALS.MS003 });
    expect(rowsOf('goals', ME)).toEqual([]);
    expect(rowsOf('setup_additions', ME)).toEqual([]);
  });

  it('refuses a request that is not well formed, and a signed-out one, before anything is sent', async () => {
    await firstSetup();
    const reading = sessionOf(await caseNamed('run-r-reading-ideas'));
    const sent = fakeSave.rpcCalls.length;
    expect((await addApprovedGoals(reading, {})).ok).toBe(false);
    expect((await addApprovedGoals(reading, { submissionId: 'not-an-id' })).ok).toBe(false);
    expect((await addApprovedGoals(reading, { submissionId: sub(1), userId: OTHER })).ok).toBe(false);
    expect((await addApprovedGoals({ ...reading, userId: OTHER }, { submissionId: sub(1) })).ok).toBe(false);
    expect(fakeSave.rpcCalls).toHaveLength(sent);
    resetFakeSave(null);
    expect(await addApprovedGoals(reading, { submissionId: sub(1) })).toEqual({ ok: false, error: ADD_SIGN_IN });
    expect(fakeSave.rpcCalls).toEqual([]);
  });

  it('an addition that fails part-way keeps nothing, and the same approval can be sent again', async () => {
    await firstSetup();
    const reading = sessionOf(await caseNamed('run-r-reading-ideas'));
    const before = savedBy(ME);
    fakeSave.failAfterWrites = 2;
    expect(await addApprovedGoals(reading, { submissionId: sub(1) })).toEqual({ ok: false, error: ADD_FAILED });
    expect(savedBy(ME)).toEqual(before);
    expect(rowsOf('setup_additions', ME)).toEqual([]);
    fakeSave.failAfterWrites = null;
    expect(await addApprovedGoals(reading, { submissionId: sub(1) })).toEqual({ ok: true, data: { goals: 1, targets: 1, replayed: false } });
  });

  it('leaves another person’s rows alone', async () => {
    await firstSetup();
    const theirs = seedRow('goals', { user_id: OTHER, title: 'Theirs', state: 'active', shape: 'ongoing', start_date: '2026-10-01' });
    expect((await addApprovedGoals(sessionOf(await caseNamed('run-r-reading-ideas')), { submissionId: sub(1) })).ok).toBe(true);
    expect(rowsOf('goals', OTHER)).toEqual([theirs]);
    expect(rowsOf('goals', ME).every((g) => g.title !== 'Theirs')).toBe(true);
  });

  it('refuses a draft that is not complete, in plain words, and sends nothing', async () => {
    await firstSetup();
    const reading = await caseNamed('run-r-reading-ideas');
    const sent = fakeSave.rpcCalls.length;
    // A part nobody approved: the same final check as the first save stops it.
    const result = await addApprovedGoals({ ...sessionOf(reading), draft: { ...reading.draft, approved: [] } }, { submissionId: sub(1) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/^This setup can't be saved yet\..*Nothing was saved\.$/);
    expect(fakeSave.rpcCalls).toHaveLength(sent);
  });

  it('reads the person’s time anchors from what they saved, not from the draft: a draft that holds none still saves (MOM-132 part 2)', async () => {
    await firstSetup();
    const reading = await caseNamed('run-r-reading-ideas');
    const model = structuredClone(reading.draft.model);
    model.person = { timeZone: null, dayEnd: null, weekStart: null, dayTypes: [], priorities: [], planning: { weekday: null, time: null } };
    const said = reading.draft.said.filter((s) => !s.path.startsWith('person.'));
    const result = await addApprovedGoals({ ...sessionOf(reading), draft: { ...reading.draft, model, said } }, { submissionId: sub(1) });
    expect(result).toEqual({ ok: true, data: { goals: 1, targets: 1, replayed: false } });
  });

  it('refuses a target that repeats each week when no week start is saved, in plain words, and sends nothing', async () => {
    await firstSetup();
    const saved = rowsOf('person_settings', ME)[0];
    saved.week_start = null;
    const before = savedBy(ME);
    const sent = fakeSave.rpcCalls.length;
    expect(await addApprovedGoals(sessionOf(await caseNamed('run-r-reading-ideas')), { submissionId: sub(1) })).toEqual({ ok: false, error: NO_WEEK_START });
    expect(fakeSave.rpcCalls).toHaveLength(sent);
    expect(savedBy(ME)).toEqual(before);
  });

  it('adds a goal whose targets all have due dates when no week start is saved', async () => {
    await firstSetup();
    rowsOf('person_settings', ME)[0].week_start = null;
    const result = await addApprovedGoals(sessionOf(await caseNamed('run-a-deadline-only')), { submissionId: sub(1) });
    expect(result).toEqual({ ok: true, data: { goals: 1, targets: 1, replayed: false } });
  });
});

describe('addApprovedTargets: a target added to a goal that has already started is graded only from its own start', () => {
  // "Run more" started on 2026-10-27; the added target is a deadline target ("Blocks sewn", due 2027-06-14) from another case's goal.
  const START = '2026-11-10';
  const blocks = async () => sessionOf(await caseNamed('run-a-deadline-only'));

  it('stores the start the person gave and the next place, and leaves the goal and its other targets exactly as they were', async () => {
    const goal = await firstSetup();
    const before = savedBy(ME);
    const result = await addApprovedTargets(await blocks(), { submissionId: sub(1), goalId: goal.id, startDate: START });
    expect(result).toEqual({ ok: true, data: { goals: 0, targets: 1, replayed: false } });

    const call = lastCall();
    expect(call.fn).toBe('add_targets_after_setup');
    expect(Object.keys(call.args.p_payload as object).sort()).toEqual(['goal_id', 'items', 'start_date', 'submission_id', 'targets']);
    expect(JSON.stringify(call.args)).not.toMatch(/user_id|userId|time_zone|day_types|priorities|Finish the quilt/);

    expectUnchanged(before, savedBy(ME));
    expect(rowsOf('targets', ME).find((t) => t.title === 'Blocks sewn')).toMatchObject({ goal_id: goal.id, start_date: START, sort_order: 1, period_kind: 'deadline' });
    // The target that was there keeps counting from its goal.
    expect(rowsOf('targets', ME).find((t) => t.title === 'Runs')).toMatchObject({ start_date: null, sort_order: 0 });
    expect(rowsOf('goals', ME)).toHaveLength(1);
  });

  it('the same approval sent twice saves once', async () => {
    const goal = await firstSetup();
    const session = await blocks();
    await addApprovedTargets(session, { submissionId: sub(1), goalId: goal.id, startDate: START });
    expect(await addApprovedTargets(session, { submissionId: sub(1), goalId: goal.id, startDate: START })).toEqual({
      ok: true,
      data: { goals: 0, targets: 1, replayed: true },
    });
    expect(rowsOf('targets', ME).filter((t) => t.title === 'Blocks sewn')).toHaveLength(1);
  });

  it('the same target at the same start under a new approval is refused, and one at another start is a different target', async () => {
    const goal = await firstSetup();
    const session = await blocks();
    await addApprovedTargets(session, { submissionId: sub(1), goalId: goal.id, startDate: START });
    expect(await addApprovedTargets(session, { submissionId: sub(2), goalId: goal.id, startDate: START })).toEqual({ ok: false, error: ADD_REFUSALS.MS002 });
    expect((await addApprovedTargets(session, { submissionId: sub(3), goalId: goal.id, startDate: daysAfter(START, 7) })).ok).toBe(true);
  });

  it('refuses a start before the goal started, and writes nothing', async () => {
    const goal = await firstSetup();
    const before = savedBy(ME);
    const result = await addApprovedTargets(await blocks(), { submissionId: sub(1), goalId: goal.id, startDate: daysAfter(String(goal.start_date), -1) });
    expect(result).toEqual({ ok: false, error: ADD_REFUSALS.MS005 });
    expect(savedBy(ME)).toEqual(before);
  });

  it('refuses a start after a deadline target’s due date in plain words, before anything is sent', async () => {
    const goal = await firstSetup();
    const sent = fakeSave.rpcCalls.length;
    expect(await addApprovedTargets(await blocks(), { submissionId: sub(1), goalId: goal.id, startDate: '2027-07-01' })).toEqual({ ok: false, error: START_AFTER_DUE });
    expect(fakeSave.rpcCalls).toHaveLength(sent);
  });

  it('refuses a goal that is another person’s, one that is not there, and one that is parked', async () => {
    await firstSetup();
    const theirs = seedRow('goals', { user_id: OTHER, title: 'Theirs', state: 'active', shape: 'ongoing', start_date: '2026-10-01' });
    const parked = seedRow('goals', { user_id: ME, title: 'Later', state: 'parked', shape: null, start_date: null });
    const before = savedBy(ME);
    const session = await blocks();
    for (const [n, goalId] of [theirs.id, crypto.randomUUID(), parked.id].entries()) {
      expect(await addApprovedTargets(session, { submissionId: sub(n + 1), goalId, startDate: START })).toEqual({ ok: false, error: ADD_REFUSALS.MS004 });
    }
    expect(savedBy(ME)).toEqual(before);
    expect(rowsOf('targets', OTHER)).toEqual([]);
  });

  it('refuses a person who has not finished their first setup', async () => {
    expect(await addApprovedTargets(await blocks(), { submissionId: sub(1), goalId: crypto.randomUUID(), startDate: START })).toEqual({
      ok: false,
      error: ADD_REFUSALS.MS003,
    });
  });

  it('has no default start: a request without a date, or one that names a person, is refused before anything is sent', async () => {
    const goal = await firstSetup();
    const sent = fakeSave.rpcCalls.length;
    const session = await blocks();
    expect((await addApprovedTargets(session, { submissionId: sub(1), goalId: goal.id })).ok).toBe(false);
    expect((await addApprovedTargets(session, { submissionId: sub(1), goalId: goal.id, startDate: 'next Monday' })).ok).toBe(false);
    expect((await addApprovedTargets(session, { submissionId: sub(1), goalId: goal.id, startDate: START, userId: OTHER })).ok).toBe(false);
    expect(fakeSave.rpcCalls).toHaveLength(sent);
  });

  it('takes the targets of exactly one goal: a draft of two goals, or of a goal with no target, is not what the person approved', async () => {
    const two = await caseNamed('run-h-two-activities');
    const rows2 = draftToRows(two.draft, two.transcript);
    if (!rows2.ok) throw new Error('the case is not final');
    expect(rows2.rows.goals.length).toBeGreaterThan(1);
    expect(toAddTargetsPayload(rows2.rows, crypto.randomUUID(), START, sub(1))).toBeNull();
    const one = await caseNamed('run-b-habit-ideas');
    const rows1 = draftToRows(one.draft, one.transcript);
    if (!rows1.ok) throw new Error('the case is not final');
    expect(toAddTargetsPayload({ ...rows1.rows, targets: [] }, crypto.randomUUID(), START, sub(1))).toBeNull();
    expect(toAddTargetsPayload(rows1.rows, 'goal', START, sub(1))).toMatchObject({ goal_id: 'goal', start_date: START, submission_id: sub(1) });
  });
});
