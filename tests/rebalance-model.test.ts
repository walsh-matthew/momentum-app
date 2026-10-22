// proposeRebalance with Claude (MOM-47): a model-written proposal is trusted no further than the
// rule-based one. Its raw JSON must pass TaskRebalanceSchema (carry_over and pull_forward only; no
// delete, cut or status) and match the user's real tasks, and anything else falls back to the rule-based
// proposal with a notice. The model is mocked: no network, no key.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { proposeRebalance, requestModelRebalance } from '@/lib/services/tasks';
import { buildRebalanceProposal, buildModelFacts, checkProposalAgainstTasks, MAX_MODEL_TASKS } from '@/lib/utils/rebalance';
import { parseRebalanceProposal } from '@/types/rebalance';
import { OTHER_USER, USER, channelRow, db, newId, resetDb, taskRow, type TaskRow } from './helpers/fakeSupabase';

const model = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/ai/rebalance', () => ({ requestRebalanceFromModel: model.request }));
vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeSupabase');
  return { createSupabaseServerClient };
});

// Week 4 of a plan that started 2026-10-14; the seeded-style tasks sit in weeks 2 and 3.
const TODAY = '2026-11-04';
const behind = (over: Partial<TaskRow> = {}) => taskRow(2, { title: 'Study cloud concepts', task_type: 'certify', ...over });
const asMicroTasks = (rows: TaskRow[]) => rows as never;

const goodMove = (t: TaskRow, toWeek = 4) => ({ action: 'carry_over', taskId: t.id, fromWeek: t.week_of, toWeek, reason: 'Unfinished in week 2; week 4 has room.' });
const proposalFor = (moves: unknown[], warnings: unknown[] = []) => ({ summary: 'Move the work that slipped.', moves, warnings });
const answer = (raw: unknown) => model.request.mockResolvedValueOnce({ ok: true, raw, model: 'claude-opus-5-5' });

beforeEach(() => {
  model.request.mockReset();
  resetDb([], { id: USER });
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

    const r = await proposeRebalance(asMicroTasks([a, b]), 4, TODAY, { useModel: true });
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
    const r = await proposeRebalance(asMicroTasks([a]), 4, TODAY, { useModel: true });
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
    const r = await proposeRebalance(asMicroTasks([early, stuck]), 4, TODAY, { useModel: true });
    expect(r.ok && r.data.source).toBe('model');
  });

  it('tells the model about the plan without any task titles', async () => {
    const a = behind({ title: 'Secret job application notes' });
    answer(proposalFor([goodMove(a)]));
    await proposeRebalance(asMicroTasks([a]), 4, TODAY, { useModel: true, velocity: { score: 50, trend: 'flat', risk: 'low', pressureStreak: 0 } });

    const sent = model.request.mock.calls[0][0] as ReturnType<typeof buildModelFacts>;
    expect(JSON.stringify(sent)).not.toContain('Secret job application notes');
    expect(sent.tasks).toEqual([{ id: a.id, week: 2, type: 'certify', minutes: 30, dueDate: null }]);
    expect(sent.velocity).toEqual({ score: 50, trend: 'flat', risk: 'low', pressureStreak: 0 });
  });

  it('only lists unfinished tasks as movable, and counts the finished ones per week', async () => {
    const todo = behind();
    const done = taskRow(2, { status: 'done', completed_at: '2026-10-20T00:00:00Z' });
    answer(proposalFor([goodMove(todo)]));
    await proposeRebalance(asMicroTasks([todo, done]), 4, TODAY, { useModel: true });
    const sent = model.request.mock.calls[0][0] as ReturnType<typeof buildModelFacts>;
    expect(sent.tasks.map((t) => t.id)).toEqual([todo.id]);
    expect(sent.weeks).toEqual([{ week: 2, unfinished: 1, finished: 1 }]);
  });
});

describe('a model proposal is rejected, and the rule-based one shown with a notice, when', () => {
  const rulesFor = (tasks: TaskRow[]) => buildRebalanceProposal(asMicroTasks(tasks), 4, TODAY);

  async function expectFallback(tasks: TaskRow[], raw: unknown, notice: RegExp) {
    answer(raw);
    const r = await proposeRebalance(asMicroTasks(tasks), 4, TODAY, { useModel: true });
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
    const r = await proposeRebalance(asMicroTasks(tasks), 4, TODAY, { useModel: true });
    expect(r.ok && r.data).toMatchObject({ source: 'rules', model: null });
    expect(r.ok && r.data.notice).toMatch(notice);
    expect(r.ok && r.data.proposal).toEqual(buildRebalanceProposal(asMicroTasks(tasks), 4, TODAY));
  });

  it('a plan too large to send never reaches the model', async () => {
    // Late in the plan, so none of it is behind and the rule-based proposal is simply empty.
    const tasks = Array.from({ length: MAX_MODEL_TASKS + 1 }, () => taskRow(9));
    const r = await proposeRebalance(asMicroTasks(tasks), 4, TODAY, { useModel: true });
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
    const r = await proposeRebalance(asMicroTasks([behind()]), 4, TODAY, { useModel: true });
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

describe('requestModelRebalance (the "Ask Claude" click)', () => {
  // Distinct clock values keep the per-user cooldown from leaking between tests.
  let tick = 0;
  const nextNow = () => Date.parse('2026-11-04T12:00:00Z') + ++tick * 60_000;

  function setup(tasks: TaskRow[], channels = [channelRow({ channel_key: 'career_pivot', start_date: '2026-10-14' })]) {
    resetDb(tasks, { id: USER });
    db.channels = channels;
  }

  it('refuses when signed out and never calls the model', async () => {
    resetDb([], null);
    expect(await requestModelRebalance({ now: nextNow })).toEqual({ ok: false, error: 'Sign in to ask for a suggestion.' });
    expect(model.request).not.toHaveBeenCalled();
  });

  it('needs an active goal', async () => {
    setup([behind()], [channelRow({ status: 'paused' })]);
    expect(await requestModelRebalance({ now: nextNow })).toEqual({ ok: false, error: 'Create a goal first.' });
    expect(model.request).not.toHaveBeenCalled();
  });

  it('loads the signed-in user’s own plan, asks Claude once, and returns the checked proposal', async () => {
    const mine = behind();
    const theirs = behind({ user_id: OTHER_USER });
    setup([mine, theirs]);
    answer(proposalFor([goodMove(mine)]));

    const r = await requestModelRebalance({ now: nextNow });
    expect(r.ok && r.data).toMatchObject({ source: 'model', currentWeek: 4 });
    expect(model.request).toHaveBeenCalledTimes(1);
    const sent = model.request.mock.calls[0][0] as ReturnType<typeof buildModelFacts>;
    expect(sent.tasks.map((t) => t.id)).toEqual([mine.id]);
    expect(sent.currentWeek).toBe(4);
    expect(sent.velocity).not.toBeNull();
  });

  it('changes nothing: no insert, update, delete or function call', async () => {
    const mine = behind();
    setup([mine]);
    answer(proposalFor([goodMove(mine)]));
    await requestModelRebalance({ now: nextNow });
    expect(db.inserts).toHaveLength(0);
    expect(db.updates).toHaveLength(0);
    expect(db.rpcCalls).toHaveLength(0);
    expect(db.deleteCalls).toBe(0);
    expect(db.tasks[0]).toMatchObject({ week_of: 2, status: 'todo', completed_at: null });
  });

  it('limits one user to a request every 20 seconds, and the limit counts a failed request', async () => {
    setup([behind()]);
    const start = nextNow();
    model.request.mockResolvedValue({ ok: false, reason: 'unavailable' });

    expect((await requestModelRebalance({ now: () => start })).ok).toBe(true);
    expect(await requestModelRebalance({ now: () => start + 19_000 })).toEqual({
      ok: false,
      error: 'Please wait a few seconds before asking again.',
    });
    expect(model.request).toHaveBeenCalledTimes(1);
    expect((await requestModelRebalance({ now: () => start + 21_000 })).ok).toBe(true);
    expect(model.request).toHaveBeenCalledTimes(2);
  });

  it('falls back to the rule-based proposal with a notice when Claude fails', async () => {
    setup([behind()]);
    model.request.mockResolvedValueOnce({ ok: false, reason: 'rate_limited' });
    const r = await requestModelRebalance({ now: nextNow });
    expect(r.ok && r.data).toMatchObject({ source: 'rules' });
    expect(r.ok && r.data.notice).toMatch(/busy/);
  });
});
