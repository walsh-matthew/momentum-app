// Service-layer invariants for lib/services/tasks.ts, run against the in-memory Supabase fake
// (tests/helpers/fakeSupabase.ts):
// - never cut unfinished work: no delete path, no delete-like action (§5 rule 1, §10),
// - the user owns completion: rebalancing never writes status or completed_at, and only a signed-in
//   user's own session ticks a task (§3, §5 rule 6; MOM-29),
// - every rebalance move is recorded in the same call that moves the task (MOM-22).
// The database side of the same rules (RLS, triggers, the real apply_task_move) is covered by the
// SQL scripts in supabase/verify/.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyRebalance,
  getPlanSnapshot,
  listMicroTasks,
  listRebalanceHistory,
  proposeRebalance,
  setTaskStatus,
} from '@/lib/services/tasks';
import { buildFocusFeed } from '@/lib/utils/focusFeed';
import { OTHER_USER, USER, db, newId, resetDb, taskById, taskRow, type TaskRow } from './helpers/fakeSupabase';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeSupabase');
  return { createSupabaseServerClient };
});

const signedIn = { id: USER };
const carry = (r: TaskRow, toWeek: number) => ({ action: 'carry_over', taskId: r.id, fromWeek: r.week_of, toWeek, reason: 'Unfinished.' });
const pull = (r: TaskRow, toWeek: number) => ({ action: 'pull_forward', taskId: r.id, fromWeek: r.week_of, toWeek, reason: 'Early.' });
const proposal = (moves: unknown[]) => ({ summary: 'Move tasks.', moves, warnings: [] });

beforeEach(() => resetDb());

describe('applyRebalance: signed out and bad input', () => {
  it('refuses when signed out and writes nothing', async () => {
    const a = taskRow(2);
    resetDb([a], null);
    const r = await applyRebalance(proposal([carry(a, 3)]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Sign in/);
    expect(db.rpcCalls).toHaveLength(0);
    expect(db.history).toHaveLength(0);
    expect(taskById(a.id).week_of).toBe(2);
  });

  it.each(['delete', 'cut', 'remove'])('rejects the "%s" action before touching the database', async (action) => {
    const a = taskRow(2);
    resetDb([a], signedIn);
    const r = await applyRebalance(proposal([{ ...carry(a, 3), action }]));
    expect(r.ok).toBe(false);
    expect(db.reads).toBe(0);
    expect(db.rpcCalls).toHaveLength(0);
    expect(db.deleteCalls).toBe(0);
    expect(db.tasks).toHaveLength(1);
  });

  it('rejects an extra deleteTaskIds key', async () => {
    const a = taskRow(2);
    resetDb([a], signedIn);
    const r = await applyRebalance({ ...proposal([carry(a, 3)]), deleteTaskIds: [a.id] });
    expect(r.ok).toBe(false);
    expect(db.rpcCalls).toHaveLength(0);
    expect(db.tasks).toHaveLength(1);
  });

  it('rejects a status on a move (the system never ticks a task)', async () => {
    const a = taskRow(2);
    resetDb([a], signedIn);
    const r = await applyRebalance(proposal([{ ...carry(a, 3), status: 'done' }]));
    expect(r.ok).toBe(false);
    expect(taskById(a.id).status).toBe('todo');
  });

  it('rejects non-object input', async () => {
    expect((await applyRebalance('delete everything')).ok).toBe(false);
  });

  it('an empty proposal is a no-op that needs no auth and no database', async () => {
    resetDb([taskRow(2)], null);
    const r = await applyRebalance(proposal([]));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.moved).toHaveLength(0);
    expect(db.reads).toBe(0);
  });
});

describe('applyRebalance: carry-over', () => {
  it('moves the week, sets the marker, shifts the due date and records each move', async () => {
    const a = taskRow(2, { due_date: '2026-10-21' });
    const b = taskRow(2);
    resetDb([a, b], signedIn);
    const r = await applyRebalance(proposal([carry(a, 4), carry(b, 3)]));

    expect(r.ok && r.data.moved.length === 2 && r.data.skipped.length === 0).toBe(true);
    expect(taskById(a.id)).toMatchObject({ week_of: 4, carried_from_week: 2, pulled_from_week: null, due_date: '2026-11-04' });
    expect(taskById(b.id)).toMatchObject({ week_of: 3, carried_from_week: 2, due_date: null });
    expect(db.history.map((h) => [h.task_id, h.source_week, h.target_week, h.shift_type])).toEqual([
      [a.id, 2, 4, 'carry_over'],
      [b.id, 2, 3, 'carry_over'],
    ]);
  });

  it('never writes status or completed_at, and never deletes', async () => {
    const a = taskRow(2);
    const b = taskRow(2);
    resetDb([a, b], signedIn);
    await applyRebalance(proposal([carry(a, 3), carry(b, 3)]));

    expect(taskById(a.id)).toMatchObject({ status: 'todo', completed_at: null });
    // The service no longer updates rows itself; every change goes through one function whose
    // arguments name only the week, the action, the due date and the task.
    expect(db.updates).toHaveLength(0);
    for (const call of db.rpcCalls) {
      expect(call.fn).toBe('apply_task_move');
      expect(Object.keys(call.args).sort()).toEqual(['p_action', 'p_due_date', 'p_from_week', 'p_task_id', 'p_to_week']);
    }
    expect(db.deleteCalls).toBe(0);
    expect(db.tasks).toHaveLength(2);
  });
});

describe('applyRebalance: pull-forward and repeated moves', () => {
  it('a pull-forward moves earlier, swaps the marker and shifts the due date back', async () => {
    const a = taskRow(5, { due_date: '2026-11-18' });
    resetDb([a], signedIn);
    const r = await applyRebalance(proposal([pull(a, 3)]));
    expect(r.ok).toBe(true);
    expect(taskById(a.id)).toMatchObject({ week_of: 3, pulled_from_week: 5, carried_from_week: null, due_date: '2026-11-04' });
    expect(db.history[0]).toMatchObject({ source_week: 5, target_week: 3, shift_type: 'pull_forward' });
  });

  it('a second carry-over overwrites the marker (last hop) but the history keeps the whole chain', async () => {
    const a = taskRow(2);
    resetDb([a], signedIn);
    await applyRebalance(proposal([carry(a, 3)]));
    const moved = { ...carry({ ...taskById(a.id) }, 5) };
    await applyRebalance(proposal([moved]));

    expect(taskById(a.id)).toMatchObject({ week_of: 5, carried_from_week: 3, pulled_from_week: null });
    expect(db.history.map((h) => `${h.source_week}>${h.target_week}`)).toEqual(['2>3', '3>5']);
  });

  it('a pull-forward after a carry-over clears the carried marker (the single-marker CHECK holds)', async () => {
    const a = taskRow(3, { carried_from_week: 2 });
    resetDb([a], signedIn);
    await applyRebalance(proposal([pull(a, 1)]));
    expect(taskById(a.id)).toMatchObject({ week_of: 1, pulled_from_week: 3, carried_from_week: null });
  });
});

describe('applyRebalance: stale or unsafe moves are skipped, the rest still apply', () => {
  it('applies only the valid move and explains each skip', async () => {
    const ok = taskRow(2);
    const moved = taskRow(3);
    const done = taskRow(2, { status: 'done', completed_at: '2026-10-20T10:00:00Z' });
    const foreign = taskRow(2, { user_id: OTHER_USER });
    const ghost = taskRow(2); // proposed but not in the database
    resetDb([ok, moved, done, foreign], signedIn);

    const r = await applyRebalance(proposal([carry(ok, 3), { ...carry(moved, 4), fromWeek: 2 }, carry(done, 3), carry(foreign, 3), carry(ghost, 3)]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const reasons = Object.fromEntries(r.data.skipped.map((s) => [s.taskId, s.reason]));

    expect(r.data.moved).toEqual([ok.id]);
    expect(taskById(ok.id).week_of).toBe(3);
    expect(reasons[moved.id]).toMatch(/moved since/);
    expect(taskById(moved.id)).toMatchObject({ week_of: 3, carried_from_week: null });
    expect(reasons[done.id]).toMatch(/Already done/);
    expect(taskById(done.id)).toMatchObject({ week_of: 2, status: 'done' });
    expect(reasons[foreign.id]).toMatch(/not found/);
    expect(taskById(foreign.id).week_of).toBe(2);
    expect(reasons[ghost.id]).toMatch(/not found/);
    expect(db.history).toHaveLength(1);
  });

  it('a task ticked between the read and the move is not moved, keeps its completion, and is not recorded', async () => {
    const a = taskRow(2);
    resetDb([a], signedIn);
    db.afterRead = () => {
      const row = taskById(a.id);
      row.status = 'done';
      row.completed_at = '2026-10-21T09:00:00Z';
    };
    const r = await applyRebalance(proposal([carry(a, 3)]));
    expect(r.ok && r.data.moved.length === 0 && r.data.skipped.length === 1).toBe(true);
    expect(taskById(a.id)).toMatchObject({ week_of: 2, status: 'done' });
    expect(db.history).toHaveLength(0);
  });
});

describe('proposeRebalance', () => {
  it('reads and writes nothing, and takes titles from the rows', async () => {
    const rows = [taskRow(2, { title: 'Real title A' }), taskRow(2, { title: 'Real title B', task_type: 'certify' }), taskRow(4)];
    resetDb(rows, signedIn);
    const before = JSON.stringify(db.tasks);
    const r = await proposeRebalance(db.tasks as never, 4, '2026-11-04');

    expect(r.ok && r.data.proposal.moves.length === 2 && r.data.currentWeek === 4).toBe(true);
    if (r.ok) {
      expect(r.data.tasks[rows[0].id].title).toBe('Real title A');
      expect(r.data.tasks[rows[1].id].taskType).toBe('certify');
    }
    expect(db.reads).toBe(0);
    expect(db.updates).toHaveLength(0);
    expect(db.rpcCalls).toHaveLength(0);
    expect(JSON.stringify(db.tasks)).toBe(before);
  });
});

describe('setTaskStatus: only the signed-in owner ticks a task (MOM-29)', () => {
  it.each([[undefined], [null], [123], ['not-a-uuid'], ['']])('rejects the task id %j', async (id) => {
    resetDb([taskRow(2)], signedIn);
    const r = await setTaskStatus(id, 'done');
    expect(r).toEqual({ ok: false, error: 'Invalid task.' });
    expect(db.updates).toHaveLength(0);
  });

  it.each([['completed'], ['DONE'], ['skipped'], [5], [null], [undefined]])('rejects the status %j', async (status) => {
    const a = taskRow(2);
    resetDb([a], signedIn);
    const r = await setTaskStatus(a.id, status);
    expect(r).toEqual({ ok: false, error: 'Invalid status.' });
    expect(db.updates).toHaveLength(0);
  });

  it('refuses when signed out and writes nothing', async () => {
    const a = taskRow(2);
    resetDb([a], null);
    const r = await setTaskStatus(a.id, 'done');
    expect(r).toEqual({ ok: false, error: 'Sign in to update tasks.' });
    expect(db.updates).toHaveLength(0);
    expect(taskById(a.id).status).toBe('todo');
  });

  it('ticking sets status and completed_at together; un-ticking clears both', async () => {
    const a = taskRow(2);
    resetDb([a], signedIn);
    const ticked = await setTaskStatus(a.id, 'done');
    expect(ticked.ok && ticked.data.status === 'done' && ticked.data.completed_at !== null).toBe(true);

    const unticked = await setTaskStatus(a.id, 'todo');
    expect(unticked.ok && unticked.data.status === 'todo' && unticked.data.completed_at === null).toBe(true);
  });

  it('writes only status and completed_at', async () => {
    const a = taskRow(2);
    resetDb([a], signedIn);
    await setTaskStatus(a.id, 'done');
    expect(db.updates.flatMap((u) => Object.keys(u)).sort()).toEqual(['completed_at', 'status']);
  });

  it("cannot reach another user's task, even if row level security were off", async () => {
    const theirs = taskRow(2, { user_id: OTHER_USER });
    resetDb([theirs], signedIn);
    db.rls = false;
    const r = await setTaskStatus(theirs.id, 'done');
    expect(r).toEqual({ ok: false, error: 'Task not found.' });
    expect(taskById(theirs.id)).toMatchObject({ status: 'todo', completed_at: null });
  });

  it('reports a task that does not exist', async () => {
    resetDb([], signedIn);
    expect(await setTaskStatus(newId(), 'done')).toEqual({ ok: false, error: 'Task not found.' });
  });
});

describe('reads', () => {
  it('lists only the signed-in user, oldest week first, and filters by week', async () => {
    const w3 = taskRow(3);
    const w1 = taskRow(1);
    const w2 = taskRow(2);
    resetDb([w3, w1, w2, taskRow(2, { user_id: OTHER_USER })], signedIn);

    const all = await listMicroTasks();
    expect(all.ok && all.data.map((t) => t.week_of)).toEqual([1, 2, 3]);
    const two = await listMicroTasks({ weekOf: 2 });
    expect(two.ok && two.data.map((t) => t.id)).toEqual([w2.id]);
  });

  it('the focus task is the earliest unfinished one, or null when nothing is left', async () => {
    const done = taskRow(1, { status: 'done', completed_at: '2026-10-20T00:00:00Z' });
    const next = taskRow(2);
    resetDb([taskRow(3), next, done], signedIn);
    const focus = await getPlanSnapshot();
    expect(focus.ok && buildFocusFeed(focus.data.tasks).focus?.id).toBe(next.id);

    resetDb([done], signedIn);
    const none = await getPlanSnapshot();
    expect(none.ok && buildFocusFeed(none.data.tasks).focus).toBeNull();
  });
});

describe('listRebalanceHistory (MOM-22)', () => {
  it('returns the signed-in user\'s moves oldest first, one query for all tasks', async () => {
    const a = taskRow(2);
    const b = taskRow(2);
    resetDb([a, b], signedIn);
    await applyRebalance(proposal([carry(a, 3), carry(b, 3)]));
    await applyRebalance(proposal([{ ...carry(taskById(a.id), 5) }]));

    db.reads = 0;
    const r = await listRebalanceHistory();
    expect(db.reads).toBe(1);
    expect(r.ok && r.data.map((h) => `${h.source_week}>${h.target_week}`)).toEqual(['2>3', '2>3', '3>5']);
  });

  it('filters to one task and hides another user\'s rows', async () => {
    const a = taskRow(2);
    resetDb([a], signedIn);
    await applyRebalance(proposal([carry(a, 3)]));
    db.history.push({ id: 'x', user_id: OTHER_USER, task_id: newId(), source_week: 1, target_week: 2, shift_type: 'carry_over', created_at: '2026-01-02T00:00:00Z' });

    const mine = await listRebalanceHistory({ taskId: a.id });
    expect(mine.ok && mine.data).toHaveLength(1);
    const all = await listRebalanceHistory();
    expect(all.ok && all.data.every((h) => h.user_id === USER)).toBe(true);
  });

  it('rejects a malformed task id without querying', async () => {
    resetDb([], signedIn);
    expect(await listRebalanceHistory({ taskId: 'nope' })).toEqual({ ok: false, error: 'Invalid task.' });
    expect(db.reads).toBe(0);
  });
});
