// proposeRebalance with Claude (MOM-47): a model-written proposal is trusted no further than the
// rule-based one. Its raw JSON must pass TaskRebalanceSchema (carry_over and pull_forward only; no
// delete, cut or status) and match the user's real tasks, and anything else falls back to the rule-based
// proposal with a notice. The model is mocked: no network, no key.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PROMPTS, fieldList } from '@/lib/config/privacy';
import { proposeRebalance, requestModelRebalance } from '@/lib/services/tasks';
import { buildRebalanceProposal, buildModelFacts, checkProposalAgainstTasks, MAX_MODEL_TASKS } from '@/lib/utils/rebalance';
import { parseRebalanceProposal } from '@/types/rebalance';
import { fieldPaths } from './helpers/fieldPaths';
import { resetUsage, rowsFor, usage } from './helpers/fakeLlmUsage';
import { OTHER_USER, USER, channelRow, db, newId, resetDb, taskRow, type TaskRow } from './helpers/fakeSupabase';

const model = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/ai/rebalance', () => ({ requestRebalanceFromModel: model.request, REBALANCE_MODEL: 'claude-opus-5-5' }));
vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeSupabase');
  return { createSupabaseServerClient };
});
// The usage limits and log (migration 011) run against the in-memory model of the table and function.
vi.mock('@/lib/supabase/admin', async () => {
  const { createSupabaseAdminClient } = await import('./helpers/fakeLlmUsage');
  return { createSupabaseAdminClient };
});

// Week 4 of a plan that started 2026-10-14; the seeded-style tasks sit in weeks 2 and 3.
const TODAY = '2026-11-04';
const behind = (over: Partial<TaskRow> = {}) => taskRow(2, { title: 'Study cloud concepts', task_type: 'certify', ...over });
const asMicroTasks = (rows: TaskRow[]) => rows as never;

const goodMove = (t: TaskRow, toWeek = 4) => ({ action: 'carry_over', taskId: t.id, fromWeek: t.week_of, toWeek, reason: 'Unfinished in week 2; week 4 has room.' });
const proposalFor = (moves: unknown[], warnings: unknown[] = []) => ({ summary: 'Move the work that slipped.', moves, warnings });
const answer = (raw: unknown) =>
  model.request.mockResolvedValueOnce({ ok: true, raw, model: 'claude-opus-5-5', usage: { inputTokens: 1200, outputTokens: 340 } });
// Whose call it is: in the app this is the verified session's user.
const BUDGET = { userId: USER };

beforeEach(() => {
  model.request.mockReset();
  resetDb([], { id: USER });
  resetUsage();
});

describe('without a user action', () => {
  it('is rule-based and never calls the model', async () => {
    const tasks = [behind(), behind({ title: 'Another' })];
    const r = await proposeRebalance(asMicroTasks(tasks), 4, TODAY);
    expect(r.ok && r.data).toMatchObject({ source: 'rules', model: null, notice: null });
    expect(model.request).not.toHaveBeenCalled();
  });
});

describe('when the user asks Claude', () => {
  it("uses the model's proposal when it is valid, and takes titles from the user's rows", async () => {
    const a = behind({ title: 'My real task title' });
    const b = behind({ title: 'Second real title' });
    answer(proposalFor([goodMove(a), goodMove(b, 5)]));

    const r = await proposeRebalance(asMicroTasks([a, b]), 4, TODAY, { useModel: true, budget: BUDGET });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({ source: 'model', model: 'claude-opus-5-5', notice: null, currentWeek: 4 });
    expect(r.data.proposal.moves.map((m) => [m.taskId, m.toWeek])).toEqual([[a.id, 4], [b.id, 5]]);
    expect(r.data.tasks[a.id].title).toBe('My real task title');
    expect(r.data.tasks[b.id].title).toBe('Second real title');
  });

  it('shows the proposal that passed the schema, with the fields the schema produces', async () => {
    const a = behind();
    answer(proposalFor([goodMove(a)]));
    const r = await proposeRebalance(asMicroTasks([a]), 4, TODAY, { useModel: true, budget: BUDGET });
    expect(r.ok && parseRebalanceProposal(r.data.proposal).ok).toBe(true);
  });

  it('allows a pull-forward and a cannot_hold warning', async () => {
    const early = taskRow(6, { title: 'Later task' });
    const stuck = taskRow(4);
    answer(
      proposalFor(
        [{ action: 'pull_forward', taskId: early.id, fromWeek: 6, toWeek: 5, reason: 'There is room in week 5.' }],
        [{ kind: 'cannot_hold', weeks: [4], taskIds: [stuck.id], message: 'This does not fit before the plan ends.' }],
      ),
    );
    const r = await proposeRebalance(asMicroTasks([early, stuck]), 4, TODAY, { useModel: true, budget: BUDGET });
    expect(r.ok && r.data.source).toBe('model');
  });

  it('tells the model about the plan without any task titles', async () => {
    const a = behind({ title: 'Secret job application notes' });
    answer(proposalFor([goodMove(a)]));
    await proposeRebalance(asMicroTasks([a]), 4, TODAY, { useModel: true, budget: BUDGET });

    const sent = model.request.mock.calls[0][0] as ReturnType<typeof buildModelFacts>;
    expect(JSON.stringify(sent)).not.toContain('Secret job application notes');
    expect(sent.tasks).toEqual([{ id: a.id, week: 2, type: 'certify', dueDate: null }]);
  });

  // MOM-102: the field list is the one the privacy notice prints (lib/config/privacy.ts), so adding a field to what
  // Claude is sent fails here until the config, and with it the notice, says so.
  it('sends exactly the fields the privacy notice lists: no minutes and no velocity', async () => {
    const a = behind();
    answer(proposalFor([goodMove(a)]));
    await proposeRebalance(asMicroTasks([a]), 4, TODAY, { useModel: true, budget: BUDGET });

    const sent = model.request.mock.calls[0][0] as ReturnType<typeof buildModelFacts>;
    expect(fieldPaths(sent)).toEqual(fieldList(PROMPTS.rebalance.sends));
  });

  it('only lists unfinished tasks as movable, and counts the finished ones per week', async () => {
    const todo = behind();
    const done = taskRow(2, { status: 'done', completed_at: '2026-10-20T00:00:00Z' });
    answer(proposalFor([goodMove(todo)]));
    await proposeRebalance(asMicroTasks([todo, done]), 4, TODAY, { useModel: true, budget: BUDGET });
    const sent = model.request.mock.calls[0][0] as ReturnType<typeof buildModelFacts>;
    expect(sent.tasks.map((t) => t.id)).toEqual([todo.id]);
    expect(sent.weeks).toEqual([{ week: 2, unfinished: 1, finished: 1 }]);
  });
});

describe('a model proposal is rejected, and the rule-based one shown with a notice, when', () => {
  const rulesFor = (tasks: TaskRow[]) => buildRebalanceProposal(asMicroTasks(tasks), 4, TODAY);

  async function expectFallback(tasks: TaskRow[], raw: unknown, notice: RegExp) {
    // A minute on from any earlier ask in the same test, so the 20 second spacing does not stop this one.
    usage.nowMs += 60_000;
    answer(raw);
    const r = await proposeRebalance(asMicroTasks(tasks), 4, TODAY, { useModel: true, budget: BUDGET });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.source).toBe('rules');
    expect(r.data.model).toBeNull();
    expect(r.data.notice).toMatch(notice);
    expect(r.data.proposal).toEqual(rulesFor(tasks));
  }

  describe('it tries to cut or complete work', () => {
    it.each(['delete', 'cut', 'remove', 'drop', 'skip', 'cancel', 'archive', 'complete', 'done'])('the action "%s"', async (action) => {
      const a = behind();
      await expectFallback([a], proposalFor([{ ...goodMove(a), action }]), /safety checks/);
    });
    it('a status field on a move', async () => {
      const a = behind();
      await expectFallback([a], proposalFor([{ ...goodMove(a), status: 'done' }]), /safety checks/);
    });
    it('a completed_at field on a move', async () => {
      const a = behind();
      await expectFallback([a], proposalFor([{ ...goodMove(a), completed_at: '2026-11-04T00:00:00Z' }]), /safety checks/);
    });
    it('a deletions list beside the moves', async () => {
      const a = behind();
      await expectFallback([a], { ...proposalFor([goodMove(a)]), deletions: [a.id] }, /safety checks/);
    });
    it('a title the model made up (titles come from the rows, so extra fields are refused)', async () => {
      const a = behind();
      await expectFallback([a], proposalFor([{ ...goodMove(a), title: 'Invented title' }]), /safety checks/);
    });
  });

  describe('it breaks the proposal rules', () => {
    it('a carry-over to an earlier week', async () => {
      const a = behind();
      await expectFallback([a], proposalFor([{ ...goodMove(a), fromWeek: 3, toWeek: 2 }]), /safety checks/);
    });
    it('a week past the end of the plan', async () => {
      const a = behind();
      await expectFallback([a], proposalFor([goodMove(a, 14)]), /safety checks/);
    });
    it('the same task twice', async () => {
      const a = behind();
      await expectFallback([a], proposalFor([goodMove(a, 4), goodMove(a, 5)]), /safety checks/);
    });
    it('a cannot_hold warning that names no tasks', async () => {
      const a = behind();
      await expectFallback([a], proposalFor([], [{ kind: 'cannot_hold', weeks: [4], taskIds: [], message: 'No room.' }]), /safety checks/);
    });
    it('not an object at all', async () => {
      await expectFallback([behind()], 'delete everything', /safety checks/);
      await expectFallback([behind()], null, /safety checks/);
    });
  });

  describe('it does not match the real tasks', () => {
    it('a task that does not exist', async () => {
      const a = behind();
      await expectFallback([a], proposalFor([{ ...goodMove(a), taskId: newId() }]), /safety checks/);
    });
    it('a task the user already finished', async () => {
      const done = taskRow(2, { status: 'done', completed_at: '2026-10-20T00:00:00Z' });
      await expectFallback([done, behind()], proposalFor([goodMove(done)]), /safety checks/);
    });
    it('the wrong current week for a task', async () => {
      const a = behind();
      await expectFallback([a], proposalFor([{ ...goodMove(a), fromWeek: 3 }]), /safety checks/);
    });
    it('a week that has already passed', async () => {
      const a = taskRow(1);
      await expectFallback([a], proposalFor([{ action: 'carry_over', taskId: a.id, fromWeek: 1, toWeek: 3, reason: 'Later.' }]), /safety checks/);
    });
    it('a finished task named as unplaceable', async () => {
      const done = taskRow(2, { status: 'done', completed_at: '2026-10-20T00:00:00Z' });
      await expectFallback([done, behind()], proposalFor([], [{ kind: 'cannot_hold', weeks: [2], taskIds: [done.id], message: 'No room.' }]), /safety checks/);
    });
  });
});

describe('when the model call itself fails', () => {
  it.each([
    ['not_configured', /aren't set up/],
    ['refused', /declined/],
    ['rate_limited', /busy/],
    ['unavailable', /could not be reached/],
    ['bad_output', /could not be read/],
  ])('%s gives the rule-based proposal with a plain-words notice', async (reason, notice) => {
    const tasks = [behind()];
    model.request.mockResolvedValueOnce({ ok: false, reason });
    const r = await proposeRebalance(asMicroTasks(tasks), 4, TODAY, { useModel: true, budget: BUDGET });
    expect(r.ok && r.data).toMatchObject({ source: 'rules', model: null });
    expect(r.ok && r.data.notice).toMatch(notice);
    expect(r.ok && r.data.proposal).toEqual(buildRebalanceProposal(asMicroTasks(tasks), 4, TODAY));
  });

  it('a plan too large to send never reaches the model', async () => {
    // Late in the plan, so none of it is behind and the rule-based proposal is simply empty.
    const tasks = Array.from({ length: MAX_MODEL_TASKS + 1 }, () => taskRow(9));
    const r = await proposeRebalance(asMicroTasks(tasks), 4, TODAY, { useModel: true, budget: BUDGET });
    expect(r.ok && r.data.notice).toMatch(/too large/);
    expect(model.request).not.toHaveBeenCalled();
  });

  it('says so, instead of crashing, when there is more work behind than any proposal can hold', async () => {
    const tasks = Array.from({ length: 150 }, () => taskRow(2));
    const r = await proposeRebalance(asMicroTasks(tasks), 4, TODAY);
    expect(r).toEqual({ ok: false, error: 'There is too much unfinished work to rebalance in one go.' });
  });

  it('a notice is only ever our own wording', async () => {
    model.request.mockResolvedValueOnce({ ok: false, reason: 'unavailable', detail: 'Provider said: <script>alert(1)</script>' });
    const r = await proposeRebalance(asMicroTasks([behind()]), 4, TODAY, { useModel: true, budget: BUDGET });
    expect(r.ok && r.data.notice).not.toContain('script');
  });
});

describe('checkProposalAgainstTasks', () => {
  const a = behind();
  const ok = parseRebalanceProposal(proposalFor([goodMove(a)]));
  const proposal = ok.ok ? ok.data : (undefined as never);

  it('accepts a proposal that matches the tasks', () => expect(checkProposalAgainstTasks(proposal, asMicroTasks([a]), 4)).toBeNull());
  it('accepts an empty proposal', () => {
    const empty = parseRebalanceProposal(proposalFor([]));
    expect(empty.ok && checkProposalAgainstTasks(empty.data, [], 4)).toBeNull();
  });
  it('gives a reason that never echoes the proposal', () => {
    const reason = checkProposalAgainstTasks(proposal, [], 4);
    expect(reason).toMatch(/does not exist/);
    expect(reason).not.toContain(a.id);
  });
});

describe('requestModelRebalance (the "Ask Claude" click, for one goal channel)', () => {
  // The date is 2026-11-04 plus a few minutes: a goal that started 2026-10-14 is in plan week 4, one that started
  // today is in week 1. Each ask moves the clock on by a minute, for the app and for the database's usage clock alike,
  // so asking twice in one test is not stopped by the 20 second spacing; the tests of the limits set the clock themselves.
  let tick = 0;
  const nextNow = () => Date.parse('2026-11-04T12:00:00Z') + ++tick * 60_000;
  const ask = (channelId: unknown) => {
    const t = nextNow();
    usage.nowMs = t;
    return requestModelRebalance(channelId, { now: () => t });
  };
  const NOT_A_CHANNEL = { ok: false, error: 'Choose one of your goal channels.' };

  // A goal for the signed-in user (or another), and a task that belongs to it.
  const goal = (over: Record<string, unknown> = {}) =>
    channelRow({ channel_key: `goal_${++tick}`, start_date: '2026-10-14', ...over } as never);
  const inGoal = (g: { id: string }, over: Partial<TaskRow> = {}) => behind({ goal_channel_id: g.id, ...over });
  function setup(tasks: TaskRow[], channels: ReturnType<typeof goal>[]) {
    resetDb(tasks, { id: USER });
    db.channels = channels;
  }
  const sentFacts = (call = 0) => model.request.mock.calls[call][0] as ReturnType<typeof buildModelFacts>;

  it('refuses when signed out and never calls the model', async () => {
    resetDb([], null);
    expect(await ask(newId())).toEqual({ ok: false, error: 'Sign in to ask for a suggestion.' });
    expect(model.request).not.toHaveBeenCalled();
  });

  it('needs an active goal', async () => {
    const paused = goal({ status: 'paused' });
    setup([inGoal(paused)], [paused]);
    expect(await ask(paused.id)).toEqual({ ok: false, error: 'Create a goal first.' });
    expect(model.request).not.toHaveBeenCalled();
  });

  describe('the channel id is not trusted', () => {
    it.each([
      ['missing', undefined],
      ['null', null],
      ['a number', 7],
      ['an object', { id: 'x' }],
      ['empty', ''],
      ['not a uuid', 'career_pivot'],
      ['a uuid with extra text', '11111111-1111-4111-8111-111111111111; drop table'],
    ])('%s is refused before anything is read or sent', async (_name, bad) => {
      const mine = goal();
      setup([inGoal(mine)], [mine]);
      expect(await ask(bad)).toEqual(NOT_A_CHANNEL);
      expect(model.request).not.toHaveBeenCalled();
    });

    it('an id that is not one of the user\'s goals is refused', async () => {
      const mine = goal();
      setup([inGoal(mine)], [mine]);
      expect(await ask(newId())).toEqual(NOT_A_CHANNEL);
      expect(model.request).not.toHaveBeenCalled();
    });

    it('another user\'s goal is refused like a missing one, and none of their tasks are sent', async () => {
      const mine = goal();
      const theirs = goal({ user_id: OTHER_USER });
      const theirTask = inGoal(theirs, { user_id: OTHER_USER });
      setup([inGoal(mine), theirTask], [mine, theirs]);

      const r = await ask(theirs.id);
      expect(r).toEqual(NOT_A_CHANNEL);
      expect(JSON.stringify(r)).not.toContain(theirTask.id);
      expect(model.request).not.toHaveBeenCalled();
    });

    it('another user\'s goal is refused even with row level security off in the fake', async () => {
      const mine = goal();
      const theirs = goal({ user_id: OTHER_USER });
      setup([inGoal(mine), inGoal(theirs, { user_id: OTHER_USER })], [mine, theirs]);
      db.rls = false;
      // With RLS off the service can see their rows; it must still not send a task that is not the user's goal's.
      answer(proposalFor([]));
      await ask(mine.id);
      const ids = sentFacts().tasks.map((t) => t.id);
      expect(ids).toHaveLength(1);
      expect(ids[0]).toBe(db.tasks.find((t) => t.goal_channel_id === mine.id)!.id);
    });

    it('a paused goal is refused when another goal is active', async () => {
      const live = goal();
      const paused = goal({ status: 'paused' });
      setup([inGoal(live), inGoal(paused)], [live, paused]);
      expect(await ask(paused.id)).toEqual(NOT_A_CHANNEL);
      expect(model.request).not.toHaveBeenCalled();
    });

    it('a refused id does not use up the limit: nothing is reserved, and the next ask at the same moment goes through', async () => {
      const mine = goal();
      setup([inGoal(mine)], [mine]);
      const t = nextNow();
      usage.nowMs = t;
      expect(await requestModelRebalance('nope', { now: () => t })).toEqual(NOT_A_CHANNEL);
      expect(await requestModelRebalance(newId(), { now: () => t })).toEqual(NOT_A_CHANNEL);
      expect(usage.reserveCalls).toHaveLength(0);
      expect(usage.rows).toHaveLength(0);
      answer(proposalFor([]));
      expect((await requestModelRebalance(mine.id, { now: () => t })).ok).toBe(true);
      expect(rowsFor(USER)).toHaveLength(1);
    });
  });

  describe('a channel is rebalanced on its own tasks and its own plan week', () => {
    it('loads the signed-in user\'s own plan, asks Claude once, and returns the checked proposal', async () => {
      const mine = goal();
      const task = inGoal(mine);
      setup([task, inGoal(goal({ user_id: OTHER_USER }), { user_id: OTHER_USER })], [mine]);
      answer(proposalFor([goodMove(task)]));

      const r = await ask(mine.id);
      expect(r.ok && r.data).toMatchObject({ source: 'model', currentWeek: 4 });
      expect(model.request).toHaveBeenCalledTimes(1);
      expect(sentFacts().tasks.map((t) => t.id)).toEqual([task.id]);
      expect(sentFacts().currentWeek).toBe(4);
    });

    it('two goals with different start dates: each request sends only that goal\'s tasks and that goal\'s week', async () => {
      const older = goal({ start_date: '2026-10-14' }); // week 4 on 2026-11-04
      const newer = goal({ start_date: '2026-11-04' }); // week 1
      const olderTask = inGoal(older, { week_of: 2 });
      const newerTask = inGoal(newer, { week_of: 1 });
      setup([olderTask, newerTask], [older, newer]);
      answer(proposalFor([]));
      answer(proposalFor([]));

      await ask(older.id);
      await ask(newer.id);

      expect(sentFacts(0).tasks.map((t) => t.id)).toEqual([olderTask.id]);
      expect(sentFacts(0).currentWeek).toBe(4);
      expect(sentFacts(1).tasks.map((t) => t.id)).toEqual([newerTask.id]);
      expect(sentFacts(1).currentWeek).toBe(1);
    });

    it('the first goal\'s week is not used for the others (the old mistake)', async () => {
      const first = goal({ start_date: '2026-09-01' }); // far along
      const second = goal({ start_date: '2026-11-04' }); // brand new
      // A week 1 task in the new goal is NOT behind; scored against the first goal's week it would be.
      const fresh = inGoal(second, { week_of: 1 });
      setup([inGoal(first, { week_of: 2 }), fresh], [first, second]);
      model.request.mockResolvedValueOnce({ ok: false, reason: 'unavailable' });

      const r = await ask(second.id);
      expect(r.ok && r.data).toMatchObject({ source: 'rules', currentWeek: 1 });
      expect(r.ok && r.data.proposal.moves).toEqual([]);
      expect(r.ok && r.data.proposal.summary).toMatch(/on track/);
    });

    it('the per-week counts the model is told are the channel\'s own, and no velocity is sent', async () => {
      const g = goal();
      const own = [inGoal(g, { week_of: 4, status: 'done', completed_at: '2026-11-03T00:00:00Z' }), inGoal(g, { week_of: 4 })];
      const other = goal();
      setup([...own, inGoal(other, { week_of: 4, status: 'done', completed_at: '2026-11-03T00:00:00Z' })], [g, other]);
      answer(proposalFor([]));
      await ask(g.id);
      expect(sentFacts().weeks).toEqual([{ week: 4, unfinished: 1, finished: 1 }]);
      expect(sentFacts()).not.toHaveProperty('velocity');
    });

    it('a move that names a task from another goal is rejected, and the user gets the rule-based proposal', async () => {
      const a = goal();
      const b = goal();
      const aTask = inGoal(a);
      const bTask = inGoal(b);
      setup([aTask, bTask], [a, b]);
      answer(proposalFor([goodMove(bTask)]));

      const r = await ask(a.id);
      expect(r.ok && r.data).toMatchObject({ source: 'rules' });
      expect(r.ok && r.data.notice).toMatch(/safety checks/);
      expect(JSON.stringify(r)).not.toContain(bTask.id);
    });

    it('titles on screen come from this channel\'s rows only', async () => {
      const a = goal();
      const b = goal();
      const aTask = inGoal(a, { title: 'Alpha title' });
      const bTask = inGoal(b, { title: 'Beta title' });
      setup([aTask, bTask], [a, b]);
      answer(proposalFor([goodMove(aTask)]));
      const r = await ask(a.id);
      expect(r.ok && Object.values(r.data.tasks).map((t) => t.title)).toEqual(['Alpha title']);
      expect(JSON.stringify(sentFacts())).not.toContain('Alpha title');
    });
  });

  describe('edge cases', () => {
    it('a goal with no tasks is rebalanced to an empty, on-track proposal', async () => {
      const empty = goal();
      setup([inGoal(goal())], [empty]);
      answer(proposalFor([]));
      const r = await ask(empty.id);
      expect(r.ok && r.data.proposal.moves).toEqual([]);
      expect(sentFacts().tasks).toEqual([]);
    });

    it('a goal past week 13 is asked about with its real week, and nothing can be placed', async () => {
      const old = goal({ start_date: '2026-01-01' }); // plan week 44 on 2026-11-04
      const task = inGoal(old, { week_of: 12 });
      setup([task], [old]);
      model.request.mockResolvedValueOnce({ ok: false, reason: 'unavailable' });

      const r = await ask(old.id);
      expect(r.ok && r.data.currentWeek).toBe(44);
      expect(r.ok && r.data.proposal.moves).toEqual([]);
      expect(r.ok && r.data.proposal.warnings.map((w) => w.kind)).toEqual(['cannot_hold']);
      // Nothing is cut: the task is named as stuck, where it is.
      expect(r.ok && r.data.proposal.warnings[0].taskIds).toEqual([task.id]);
    });

    it('a goal that has not started yet is week 1, and a week 1 task is not behind', async () => {
      const future = goal({ start_date: '2026-12-01' });
      setup([inGoal(future, { week_of: 1 })], [future]);
      model.request.mockResolvedValueOnce({ ok: false, reason: 'unavailable' });
      const r = await ask(future.id);
      expect(r.ok && r.data).toMatchObject({ currentWeek: 1 });
      expect(r.ok && r.data.proposal.moves).toEqual([]);
    });

    it('a start date that cannot be read is refused with a plain message', async () => {
      const broken = goal({ start_date: 'not a date' });
      setup([inGoal(broken)], [broken]);
      expect(await ask(broken.id)).toEqual({ ok: false, error: 'Could not work out your plan week.' });
      expect(model.request).not.toHaveBeenCalled();
    });

    it('a goal with more unfinished work than the model may be sent falls back to the rule-based proposal', async () => {
      const big = goal();
      const tasks = Array.from({ length: MAX_MODEL_TASKS + 1 }, () => inGoal(big, { week_of: 4 }));
      setup(tasks, [big]);
      const r = await ask(big.id);
      expect(model.request).not.toHaveBeenCalled();
      expect(r.ok && r.data).toMatchObject({ source: 'rules' });
      expect(r.ok && r.data.notice).toMatch(/too large/);
    });

    it('another goal\'s work does not count toward the size limit', async () => {
      const big = goal();
      const small = goal();
      setup([...Array.from({ length: MAX_MODEL_TASKS + 5 }, () => inGoal(big, { week_of: 4 })), inGoal(small)], [big, small]);
      answer(proposalFor([]));
      const r = await ask(small.id);
      expect(model.request).toHaveBeenCalledTimes(1);
      expect(r.ok && r.data).toMatchObject({ source: 'model' });
    });
  });

  it('changes nothing: no insert, update, delete or function call', async () => {
    const mine = goal();
    const task = inGoal(mine);
    setup([task], [mine]);
    answer(proposalFor([goodMove(task)]));
    await ask(mine.id);
    expect(db.inserts).toHaveLength(0);
    expect(db.updates).toHaveLength(0);
    expect(db.rpcCalls).toHaveLength(0);
    expect(db.deleteCalls).toBe(0);
    expect(db.tasks[0]).toMatchObject({ week_of: 2, status: 'todo', completed_at: null });
    // The one thing it records is the usage row for the call (migration 011): counts and an outcome, no content.
    expect(rowsFor(USER)).toHaveLength(1);
    expect(rowsFor(USER)[0]).toMatchObject({ feature: 'rebalance', model: 'claude-opus-5-5', outcome: 'ok', input_tokens: 1200, output_tokens: 340 });
  });

  it('limits one user to a request every 20 seconds across all their channels, and counts a failed request', async () => {
    const a = goal();
    const b = goal();
    setup([inGoal(a), inGoal(b)], [a, b]);
    const start = nextNow();
    model.request.mockResolvedValue({ ok: false, reason: 'unavailable' });
    const askAt = (channelId: string, ms: number) => {
      usage.nowMs = ms;
      return requestModelRebalance(channelId, { now: () => ms });
    };

    expect((await askAt(a.id, start)).ok).toBe(true);
    // Asking about the other channel straight away does not get round the limit.
    expect(await askAt(b.id, start + 19_000)).toEqual({ ok: false, error: 'Please wait a few seconds before asking again.' });
    expect(model.request).toHaveBeenCalledTimes(1);
    expect(rowsFor(USER)).toHaveLength(1);
    expect((await askAt(b.id, start + 21_000)).ok).toBe(true);
    expect(model.request).toHaveBeenCalledTimes(2);
  });

  it('falls back to the rule-based proposal with a notice when Claude fails', async () => {
    const mine = goal();
    setup([inGoal(mine)], [mine]);
    model.request.mockResolvedValueOnce({ ok: false, reason: 'rate_limited' });
    const r = await ask(mine.id);
    expect(r.ok && r.data).toMatchObject({ source: 'rules' });
    expect(r.ok && r.data.notice).toMatch(/busy/);
  });
});
