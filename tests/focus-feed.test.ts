// The focus card's feed (MOM-36): the task to do now, the ones queued behind it, and the ones just finished,
// which the user can reopen. The builder is pure; the service reads the signed-in user's own tasks through
// the in-memory Supabase fake. Completion stays the user's own act (docs/NINETY_DAY_PLAN_CONTEXT.md §3,
// §5 rule 6): nothing here writes, and the undo goes through the same setTaskStatus as ticking.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFocusFeed } from '@/lib/utils/focusFeed';
import { getPlanSnapshot, setTaskStatus } from '@/lib/services/tasks';
import type { MicroTask } from '@/types/database.types';
import { RECENTLY_DONE_LIMIT, UP_NEXT_LIMIT } from '@/types/focusFeed';
import { OTHER_USER, USER, db, newId, resetDb, taskRow, type TaskRow } from './helpers/fakeSupabase';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeSupabase');
  return { createSupabaseServerClient };
});

const signedIn = { id: USER };
const mt = (r: TaskRow, over: Partial<MicroTask> = {}): MicroTask => ({ ...r, updated_at: r.created_at, ...over }) as unknown as MicroTask;
const todo = (week: number, over: Partial<TaskRow> = {}) => mt(taskRow(week, over));
const done = (week: number, completedAt: string, over: Partial<TaskRow> = {}) =>
  mt(taskRow(week, { status: 'done', completed_at: completedAt, ...over }));
const ids = (tasks: MicroTask[]) => tasks.map((t) => t.id);

// The feed the home page shows for all channels' tasks: read the snapshot, then build the feed from its tasks.
async function getFocusFeed() {
  const r = await getPlanSnapshot();
  return r.ok ? { ok: true as const, data: buildFocusFeed(r.data.tasks) } : r;
}

describe('buildFocusFeed: the order work is done in', () => {
  it('focus is the earliest unfinished task and up next follows in the same order', () => {
    const w3 = todo(3);
    const w1 = todo(1);
    const w2 = todo(2);
    const feed = buildFocusFeed([w3, w1, w2]);
    expect(feed.focus?.id).toBe(w1.id);
    expect(ids(feed.upNext)).toEqual([w2.id, w3.id]);
  });

  it('within a week the earlier due date comes first and undated tasks come last', () => {
    const undated = todo(2, { due_date: null });
    const late = todo(2, { due_date: '2026-10-30' });
    const early = todo(2, { due_date: '2026-10-27' });
    const feed = buildFocusFeed([undated, late, early]);
    expect([feed.focus?.id, ...ids(feed.upNext)]).toEqual([early.id, late.id, undated.id]);
  });

  it('then the oldest first, down to the sub-millisecond, and the id breaks a complete tie', () => {
    const b = todo(2, { created_at: '2026-10-14T00:00:00.000200+00:00', id: 'b' });
    const a = todo(2, { created_at: '2026-10-14T00:00:00.000100+00:00', id: 'a' });
    const older = todo(2, { created_at: '2026-10-13T00:00:00+00:00', id: 'z' });
    const tieB = todo(3, { created_at: '2026-10-14T00:00:00+00:00', id: 'tie-b' });
    const tieA = todo(3, { created_at: '2026-10-14T00:00:00+00:00', id: 'tie-a' });
    const feed = buildFocusFeed([b, tieB, a, tieA, older]);
    expect([feed.focus?.id, ...ids(feed.upNext)]).toEqual(['z', 'a', 'b', 'tie-a', 'tie-b']);
  });

  it('does not depend on the order it is given', () => {
    const tasks = [todo(4), todo(2), todo(3), todo(1), todo(5)];
    const forward = buildFocusFeed(tasks);
    const backward = buildFocusFeed([...tasks].reverse());
    expect(ids([forward.focus!, ...forward.upNext])).toEqual(ids([backward.focus!, ...backward.upNext]));
  });

});

describe('buildFocusFeed: up next', () => {
  it(`lists at most ${UP_NEXT_LIMIT} tasks after the focus task`, () => {
    const tasks = Array.from({ length: 12 }, (_, i) => todo(i + 1));
    const feed = buildFocusFeed(tasks);
    expect(feed.focus?.week_of).toBe(1);
    expect(feed.upNext).toHaveLength(UP_NEXT_LIMIT);
    expect(feed.upNext.map((t) => t.week_of)).toEqual([2, 3, 4, 5, 6]);
  });

  it('never repeats the focus task and holds only unfinished tasks', () => {
    const finished = done(1, '2026-10-20T00:00:00Z');
    const feed = buildFocusFeed([finished, todo(2), todo(3)]);
    expect(feed.upNext.every((t) => t.status === 'todo')).toBe(true);
    expect(ids(feed.upNext)).not.toContain(feed.focus?.id);
    expect(ids(feed.upNext)).not.toContain(finished.id);
  });

  it('is empty when only one task is left', () => {
    const feed = buildFocusFeed([todo(2)]);
    expect(feed.focus).not.toBeNull();
    expect(feed.upNext).toEqual([]);
  });
});

describe('buildFocusFeed: recently done', () => {
  it(`offers the ${RECENTLY_DONE_LIMIT} most recently completed tasks, newest first`, () => {
    const a = done(1, '2026-10-20T08:00:00Z');
    const b = done(1, '2026-10-22T08:00:00Z');
    const c = done(2, '2026-10-21T08:00:00Z');
    const d = done(2, '2026-10-19T08:00:00Z');
    const feed = buildFocusFeed([a, b, c, d]);
    expect(ids(feed.recentlyDone)).toEqual([b.id, c.id, a.id]);
    expect(feed.recentlyDone).toHaveLength(RECENTLY_DONE_LIMIT);
  });

  it('puts nothing unfinished in the list, and keeps working when nothing is left to do', () => {
    const only = done(1, '2026-10-20T00:00:00Z');
    const feed = buildFocusFeed([only]);
    expect(feed.focus).toBeNull();
    expect(feed.upNext).toEqual([]);
    expect(ids(feed.recentlyDone)).toEqual([only.id]);
  });
});

describe('buildFocusFeed: edges', () => {
  it('an empty plan gives an empty feed', () => {
    expect(buildFocusFeed([])).toEqual({ focus: null, upNext: [], recentlyDone: [] });
  });

  it('does not change the tasks it is given, or their order', () => {
    const tasks = [todo(3), todo(1), done(1, '2026-10-20T00:00:00Z'), todo(2)];
    const before = JSON.stringify(tasks);
    buildFocusFeed(tasks);
    expect(JSON.stringify(tasks)).toBe(before);
  });

  it('puts a done task with no completion time last rather than failing', () => {
    const odd = done(1, '2026-10-20T00:00:00Z', { completed_at: null });
    const normal = done(1, '2026-10-21T00:00:00Z');
    expect(ids(buildFocusFeed([odd, normal]).recentlyDone)).toEqual([normal.id, odd.id]);
  });
});

describe('the feed built from the plan snapshot (the service)', () => {
  beforeEach(() => resetDb([], signedIn));

  it('reads goals, tasks and history once each and writes nothing', async () => {
    resetDb([todo(1) as unknown as TaskRow, todo(2) as unknown as TaskRow], signedIn);
    const r = await getFocusFeed();
    expect(r.ok && r.data.focus?.week_of).toBe(1);
    expect(db.reads).toBe(3);
    expect(db.updates).toHaveLength(0);
    expect(db.inserts).toHaveLength(0);
    expect(db.rpcCalls).toHaveLength(0);
    expect(db.deleteCalls).toBe(0);
  });

  it("is the signed-in user's tasks only: another user's earlier task never becomes the focus", async () => {
    const mine = taskRow(3);
    const theirs = taskRow(1, { user_id: OTHER_USER });
    const theirsDone = taskRow(1, { user_id: OTHER_USER, status: 'done', completed_at: '2026-10-21T00:00:00Z' });
    resetDb([mine, theirs, theirsDone], signedIn);
    const r = await getFocusFeed();
    expect(r.ok && r.data.focus?.id).toBe(mine.id);
    expect(r.ok && r.data.upNext).toEqual([]);
    expect(r.ok && r.data.recentlyDone).toEqual([]);
  });

  it('shows nothing to a signed-out client', async () => {
    resetDb([taskRow(1)], null);
    const r = await getFocusFeed();
    expect(r).toEqual({ ok: true, data: { focus: null, upNext: [], recentlyDone: [] } });
  });
});

describe('undo goes through the same human-only switch as ticking', () => {
  it('completing the focus task moves it to recently done, and reopening puts the feed back', async () => {
    const a = taskRow(1, { id: 'aaaa0000-0000-4000-8000-000000000001' });
    const b = taskRow(2, { id: 'bbbb0000-0000-4000-8000-000000000002' });
    const c = taskRow(3, { id: 'cccc0000-0000-4000-8000-000000000003' });
    resetDb([a, b, c], signedIn);
    const before = await getFocusFeed();
    expect(before.ok && before.data.focus?.id).toBe(a.id);

    expect((await setTaskStatus(a.id, 'done')).ok).toBe(true);
    const afterDone = await getFocusFeed();
    expect(afterDone.ok && afterDone.data.focus?.id).toBe(b.id);
    expect(afterDone.ok && ids(afterDone.data.upNext)).toEqual([c.id]);
    expect(afterDone.ok && ids(afterDone.data.recentlyDone)).toEqual([a.id]);

    expect((await setTaskStatus(a.id, 'todo')).ok).toBe(true);
    const afterUndo = await getFocusFeed();
    expect(afterUndo.ok && afterUndo.data.focus?.id).toBe(a.id);
    expect(afterUndo.ok && ids(afterUndo.data.upNext)).toEqual([b.id, c.id]);
    expect(afterUndo.ok && afterUndo.data.recentlyDone).toEqual([]);
    // A reopened task is genuinely unfinished again: no completion time left behind.
    expect(db.tasks.find((t) => t.id === a.id)).toMatchObject({ status: 'todo', completed_at: null });
  });

  it("cannot reopen another user's task, and a signed-out client cannot reopen anything", async () => {
    const theirs = taskRow(1, { user_id: OTHER_USER, status: 'done', completed_at: '2026-10-21T00:00:00Z' });
    resetDb([theirs], signedIn);
    expect(await setTaskStatus(theirs.id, 'todo')).toEqual({ ok: false, error: 'Task not found.' });
    expect(db.tasks[0].status).toBe('done');

    resetDb([taskRow(1, { id: newId(), status: 'done', completed_at: '2026-10-21T00:00:00Z' })], null);
    const r = await setTaskStatus(db.tasks[0].id, 'todo');
    expect(r.ok).toBe(false);
    expect(db.tasks[0].status).toBe('done');
  });
});

describe('source-level: nothing completes or reopens a task on the user\'s behalf', () => {
  const root = process.cwd();
  const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

  it('the feed builder and the type file hold no write, no clock and no network', () => {
    for (const code of [strip(read('lib', 'utils', 'focusFeed.ts')), strip(read('types', 'focusFeed.ts'))]) {
      expect(code).not.toMatch(/supabase|fetch\(|\.insert\(|\.update\(|\.rpc\(|\.delete\(|Date\.now|new Date\(\)|setTaskStatus|completed_at\s*(:|=(?!=))/);
    }
  });

  it('getPlanSnapshot only reads', () => {
    const tasks = read('lib', 'services', 'tasks.ts');
    const start = tasks.indexOf('export async function getPlanSnapshot');
    const body = strip(tasks.slice(start, tasks.indexOf('\n}\n', start) + 3));
    expect(body).toContain('listMicroTasks()');
    expect(body).not.toMatch(/\.insert\(|\.update\(|\.rpc\(|\.delete\(|setTaskStatus/);
  });

  it('the lists reach the database only through the toggle action, from a click', () => {
    const hook = strip(read('components', 'tasks', 'useTaskToggle.ts'));
    expect(hook).toContain("from '@/app/actions/tasks'");
    expect([...hook.matchAll(/toggleTaskStatus\(/g)]).toHaveLength(1);

    for (const file of ['FocusTaskCard.tsx', 'RecentlyDoneList.tsx', 'UpNextList.tsx']) {
      const code = strip(read('components', 'tasks', file));
      expect(code).not.toMatch(/@\/lib\/services|@\/lib\/supabase|setTaskStatus|supabase/);
      expect(code).not.toMatch(/useEffect|useLayoutEffect/);
    }
    // The reopen switch is wired to a button click, and the up next list has no controls at all.
    expect(strip(read('components', 'tasks', 'RecentlyDoneList.tsx'))).toMatch(/onClick=\{\(\) => toggle\('todo'\)\}/);
    expect(strip(read('components', 'tasks', 'UpNextList.tsx'))).not.toMatch(/<button|onClick|toggle/);
  });
});
