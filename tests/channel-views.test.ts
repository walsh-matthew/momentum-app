// Per-channel feeds and velocity (MOM-44): the views the sidebar switches between, built from the user's own
// goals and tasks. The builder is pure; the pipeline test reads through the in-memory Supabase fake the way the
// home page does. Counting never completes, reopens or moves a task (docs/NINETY_DAY_PLAN_CONTEXT.md §3,
// §5 rule 6), and the user's session (RLS) alone decides whose data is read.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPlanSnapshot } from '@/lib/services/tasks';
import { buildChannelViews, resolveChannel } from '@/lib/utils/channelViews';
import { computeVelocity } from '@/lib/utils/velocity';
import { ALL_CHANNELS, EMPTY_CHANNEL_VIEWS } from '@/types/channelViews';
import type { MicroTask } from '@/types/database.types';
import { OTHER_USER, USER, channelRow, db, resetDb, taskRow, type TaskRow } from './helpers/fakeSupabase';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeSupabase');
  return { createSupabaseServerClient };
});

const TODAY = '2026-10-23';
const mt = (r: TaskRow): MicroTask => ({ ...r, updated_at: r.created_at }) as unknown as MicroTask;
const goal = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: `Goal ${id}`,
  status: 'active' as const,
  start_date: '2026-09-23', // 30 days before TODAY: plan week 5
  ...over,
});
const task = (goalId: string, week: number, over: Partial<TaskRow> = {}) =>
  mt(taskRow(week, { goal_channel_id: goalId, ...over }));
const done = (goalId: string, week: number, over: Partial<TaskRow> = {}) =>
  task(goalId, week, { status: 'done', completed_at: '2026-10-22T09:00:00Z', ...over });
const ids = (tasks: MicroTask[]) => tasks.map((t) => t.id);

describe('the all-channels view and each channel\'s view', () => {
  const a1 = task('A', 2, { title: 'A first' });
  const a2 = task('A', 3, { title: 'A second' });
  const b1 = task('B', 1, { title: 'B first' });
  const b2 = task('B', 4, { title: 'B second' });
  const doneB = done('B', 1);
  const views = buildChannelViews([goal('A'), goal('B')], [a2, b2, doneB, a1, b1], [], TODAY);

  it('lists the active goals as channels, in the order given', () => {
    expect(views.channels).toEqual([
      { id: 'A', title: 'Goal A' },
      { id: 'B', title: 'Goal B' },
    ]);
  });

  it('a channel\'s feed holds only that channel\'s tasks', () => {
    const feedA = views.byChannel.A.feed;
    expect([feedA.focus?.id, ...ids(feedA.upNext)]).toEqual([a1.id, a2.id]);
    expect(feedA.recentlyDone).toEqual([]);

    const feedB = views.byChannel.B.feed;
    expect([feedB.focus?.id, ...ids(feedB.upNext)]).toEqual([b1.id, b2.id]);
    expect(ids(feedB.recentlyDone)).toEqual([doneB.id]);
  });

  it('all channels is the default view and holds every active channel\'s tasks in one order', () => {
    const all = views.byChannel[ALL_CHANNELS].feed;
    expect(all.focus?.id).toBe(b1.id); // week 1 comes before week 2
    expect(ids(all.upNext)).toEqual([a1.id, a2.id, b2.id]);
    expect(ids(all.recentlyDone)).toEqual([doneB.id]);
  });

  it('selecting a channel changes the focus task to that channel\'s own', () => {
    expect(views.byChannel[ALL_CHANNELS].feed.focus?.id).toBe(b1.id);
    expect(views.byChannel.A.feed.focus?.id).toBe(a1.id);
  });

  it('does not change the tasks it is given', () => {
    const goals = [goal('A'), goal('B')];
    const tasks = [a2, b1, a1];
    const before = JSON.stringify({ goals, tasks });
    buildChannelViews(goals, tasks, [], TODAY);
    expect(JSON.stringify({ goals, tasks })).toBe(before);
  });

  it('can be sent to the browser as plain data', () => {
    expect(JSON.parse(JSON.stringify(views))).toEqual(views);
  });
});

describe('which goals are channels', () => {
  it('leaves paused and finished goals, and their tasks, out of every view', () => {
    const paused = task('P', 1, { title: 'Paused goal task' });
    const finishedGoalTask = done('F', 1);
    const live = task('A', 2);
    const v = buildChannelViews(
      [goal('P', { status: 'paused' }), goal('F', { status: 'done' }), goal('A')],
      [paused, finishedGoalTask, live],
      [],
      TODAY,
    );
    expect(v.channels.map((c) => c.id)).toEqual(['A']);
    expect(Object.keys(v.byChannel).sort()).toEqual([ALL_CHANNELS, 'A'].sort());
    expect(v.byChannel[ALL_CHANNELS].feed.focus?.id).toBe(live.id);
    expect(v.byChannel[ALL_CHANNELS].feed.recentlyDone).toEqual([]);
  });

  it('a goal with no tasks is still a channel, with an empty feed and nothing to score', () => {
    const v = buildChannelViews([goal('A'), goal('empty')], [task('A', 5)], [], TODAY);
    expect(v.channels.map((c) => c.id)).toEqual(['A', 'empty']);
    expect(v.byChannel.empty.feed).toEqual({ focus: null, upNext: [], recentlyDone: [] });
    // The existing velocity code gives an unscored snapshot (the hero says it appears once the week has tasks).
    expect(v.byChannel.empty.velocity).toMatchObject({ score: null, risk: null, weeks: [] });
  });

  it('ignores tasks whose goal is not in the list', () => {
    const v = buildChannelViews([goal('A')], [task('A', 1), task('stranger', 1), done('stranger', 1)], [], TODAY);
    expect(v.byChannel[ALL_CHANNELS].feed.upNext).toEqual([]);
    expect(v.byChannel[ALL_CHANNELS].feed.recentlyDone).toEqual([]);
  });

  it('no goals at all gives a single empty all-channels view', () => {
    const v = buildChannelViews([], [task('A', 1)], [], TODAY);
    expect(v.channels).toEqual([]);
    expect(v.byChannel).toEqual(EMPTY_CHANNEL_VIEWS.byChannel);
  });
});

describe('velocity is per channel, from the channel\'s own start date', () => {
  // A started 30 days ago (plan week 5) and is going well; B started today (plan week 1) and has barely begun.
  const goals = [goal('A', { start_date: '2026-09-23' }), goal('B', { start_date: '2026-10-23' })];
  const aTasks = [done('A', 5), done('A', 5)];
  const bTasks = [done('B', 1), task('B', 1), task('B', 1), task('B', 1)];
  const views = buildChannelViews(goals, [...aTasks, ...bTasks], [], TODAY);

  it('two goals with different start dates have independent weeks and scores', () => {
    const a = views.byChannel.A.velocity!;
    const b = views.byChannel.B.velocity!;
    expect(a.currentWeek).toBe(5);
    expect(b.currentWeek).toBe(1);
    expect(a.score).toBe(100);
    expect(b.score).toBe(25);
    expect(a.weeks[0]).toMatchObject({ week: 5, done: 2, planned: 2 });
    expect(b.weeks[0]).toMatchObject({ week: 1, done: 1, planned: 4 });
  });

  it('each channel scores exactly as its own tasks would on their own', () => {
    expect(views.byChannel.A.velocity).toEqual(computeVelocity(aTasks, 5, TODAY, []));
    expect(views.byChannel.B.velocity).toEqual(computeVelocity(bTasks, 1, TODAY, []));
  });

  it('ticking tasks in one channel does not move the other\'s score', () => {
    const more = bTasks.map((t) => ({ ...t, status: 'done' as const, completed_at: '2026-10-23T08:00:00Z' }));
    const after = buildChannelViews(goals, [...aTasks, ...more], [], TODAY);
    expect(after.byChannel.B.velocity?.score).toBe(100);
    expect(after.byChannel.A.velocity).toEqual(views.byChannel.A.velocity);
  });

  it('the old mistake is gone: B is not scored against A\'s start date', () => {
    // Against A's start date B's tasks (week 1) would sit four weeks in the past and read as week 5 of a plan.
    expect(views.byChannel.B.velocity?.currentWeek).not.toBe(5);
  });

  it('one channel\'s rebalance history does not touch another\'s carry-over', () => {
    const moved = task('B', 2, { carried_from_week: 1 });
    const history = [{ task_id: moved.id, source_week: 1, target_week: 2, shift_type: 'carry_over' as const }];
    const v = buildChannelViews(goals, [...aTasks, ...bTasks, moved], history, TODAY);
    expect(v.byChannel.A.velocity).toEqual(views.byChannel.A.velocity);
    expect(v.byChannel.B.velocity).not.toEqual(views.byChannel.B.velocity);
  });

  it('a start date that cannot be read gives no velocity, not a made-up one', () => {
    const v = buildChannelViews([goal('A', { start_date: 'not a date' })], [task('A', 1)], [], TODAY);
    expect(v.byChannel.A.velocity).toBeNull();
    expect(v.byChannel.A.feed.focus).not.toBeNull();
  });
});

describe('velocity for all channels', () => {
  it('with one active goal it is that goal\'s velocity, so a single-goal user sees no change', () => {
    const v = buildChannelViews([goal('A')], [done('A', 5), task('A', 5)], [], TODAY);
    expect(v.byChannel[ALL_CHANNELS].velocity).toEqual(v.byChannel.A.velocity);
    expect(v.byChannel[ALL_CHANNELS].velocity).not.toBeNull();
    expect(v.byChannel[ALL_CHANNELS].velocityHint).toBeNull();
  });

  it('with several active goals there is no single number, and it says to choose a channel', () => {
    const v = buildChannelViews([goal('A'), goal('B')], [done('A', 5), done('B', 5)], [], TODAY);
    expect(v.byChannel[ALL_CHANNELS].velocity).toBeNull();
    expect(v.byChannel[ALL_CHANNELS].velocityHint).toBe('choose_channel');
    expect(v.byChannel.A.velocityHint).toBeNull();
  });

  it('with no active goal there is nothing to say', () => {
    const v = buildChannelViews([goal('P', { status: 'paused' })], [task('P', 1)], [], TODAY);
    expect(v.byChannel[ALL_CHANNELS]).toMatchObject({ velocity: null, velocityHint: null });
  });

  it('a paused goal does not count toward the several that need a choice', () => {
    const v = buildChannelViews([goal('A'), goal('P', { status: 'paused' })], [done('A', 5)], [], TODAY);
    expect(v.byChannel[ALL_CHANNELS].velocityHint).toBeNull();
    expect(v.byChannel[ALL_CHANNELS].velocity).not.toBeNull();
  });
});

describe('resolveChannel: the selection that is actually shown', () => {
  const views = buildChannelViews([goal('A'), goal('B')], [], [], TODAY);

  it('keeps a selection that is still a channel, and all channels', () => {
    expect(resolveChannel(views, 'A')).toBe('A');
    expect(resolveChannel(views, 'B')).toBe('B');
    expect(resolveChannel(views, ALL_CHANNELS)).toBe(ALL_CHANNELS);
  });

  it('falls back to all channels when the channel is gone, unknown or not a real key', () => {
    for (const gone of ['C', '', 'toString', '__proto__', 'constructor', 'hasOwnProperty']) {
      expect(resolveChannel(views, gone)).toBe(ALL_CHANNELS);
    }
  });

  it('with no channels at all, the only view is all channels', () => {
    expect(resolveChannel(EMPTY_CHANNEL_VIEWS, 'A')).toBe(ALL_CHANNELS);
  });
});

describe('the home page pipeline: the snapshot, then the views (one user\'s session)', () => {
  const signedIn = { id: USER };
  const NOW = Date.parse('2026-10-23T12:00:00Z');
  let n = 0;
  const chan = (key: string, over: Record<string, unknown> = {}) =>
    channelRow({
      channel_key: key,
      title: key,
      start_date: '2026-09-23',
      created_at: `2026-10-14T00:00:${String(++n % 60).padStart(2, '0')}Z`,
      ...over,
    } as never);

  beforeEach(() => resetDb([], signedIn));

  async function viewsFor() {
    const snap = await getPlanSnapshot({ now: () => NOW });
    if (!snap.ok) throw new Error(snap.error);
    return buildChannelViews(snap.data.goals, snap.data.tasks, snap.data.history, snap.data.today);
  }

  it('builds the user\'s channels and feeds, and leaves another user\'s goals and tasks out of every view', async () => {
    const mine = chan('mine');
    const side = chan('side', { start_date: '2026-10-23' });
    const theirs = chan('theirs', { user_id: OTHER_USER });
    db.channels = [mine, side, theirs];
    db.tasks = [
      taskRow(5, { goal_channel_id: mine.id, title: 'mine task' }),
      taskRow(1, { goal_channel_id: side.id, title: 'side task' }),
      taskRow(1, { user_id: OTHER_USER, goal_channel_id: theirs.id, title: 'their task' }),
      taskRow(1, { user_id: OTHER_USER, goal_channel_id: theirs.id, status: 'done', completed_at: '2026-10-22T00:00:00Z' }),
    ];
    const v = await viewsFor();

    expect(v.channels.map((c) => c.id).sort()).toEqual([mine.id, side.id].sort());
    expect(JSON.stringify(v)).not.toContain('their task');
    expect(JSON.stringify(v)).not.toContain(theirs.id);
    expect(v.byChannel[mine.id].velocity?.currentWeek).toBe(5);
    expect(v.byChannel[side.id].velocity?.currentWeek).toBe(1);
    expect(v.byChannel[ALL_CHANNELS].feed.recentlyDone).toEqual([]);
  });

  it('shows the other user their own channels, not this user\'s', async () => {
    const mine = chan('mine');
    const theirs = chan('theirs', { user_id: OTHER_USER });
    db.channels = [mine, theirs];
    db.tasks = [taskRow(5, { goal_channel_id: mine.id }), taskRow(1, { user_id: OTHER_USER, goal_channel_id: theirs.id })];
    db.user = { id: OTHER_USER };
    const v = await viewsFor();
    expect(v.channels.map((c) => c.id)).toEqual([theirs.id]);
  });

  it('shows a signed-out client no channels and an empty feed', async () => {
    db.channels = [chan('mine')];
    db.tasks = [taskRow(5)];
    db.user = null;
    const v = await viewsFor();
    expect(v.channels).toEqual([]);
    expect(v.byChannel[ALL_CHANNELS].feed.focus).toBeNull();
  });

  it('reads goals, tasks and history once each, and writes nothing', async () => {
    const g = chan('only');
    db.channels = [g];
    db.tasks = [taskRow(5, { goal_channel_id: g.id })];
    await viewsFor();
    expect(db.reads).toBe(3);
    expect(db.updates).toHaveLength(0);
    expect(db.inserts).toHaveLength(0);
    expect(db.rpcCalls).toHaveLength(0);
    expect(db.deleteCalls).toBe(0);
  });
});

describe('source-level: building the views never writes', () => {
  const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

  it('the builder and its types hold no database, network, clock or task write', () => {
    for (const code of [strip(read('lib', 'utils', 'channelViews.ts')), strip(read('types', 'channelViews.ts'))]) {
      expect(code).not.toMatch(/supabase|fetch\(|\.insert\(|\.update\(|\.rpc\(|\.delete\(|Date\.now|new Date\(|setTaskStatus|completed_at/);
    }
  });

  it('getPlanSnapshot reads three tables and writes nothing', () => {
    const tasks = read('lib', 'services', 'tasks.ts');
    const start = tasks.indexOf('export async function getPlanSnapshot');
    const body = strip(tasks.slice(start, tasks.indexOf('\n}\n', start) + 3));
    for (const read of ['listGoalChannels()', 'listMicroTasks()', 'listRebalanceHistory()']) expect(body).toContain(read);
    expect(body).not.toMatch(/\.insert\(|\.update\(|\.rpc\(|\.delete\(|\.upsert\(|setTaskStatus|from\(/);
    expect(body).not.toMatch(/supabase\/admin|SERVICE_ROLE/);
  });

  it('the page builds the views from the one snapshot, and never from a selection it was sent', () => {
    const page = strip(read('app', 'page.tsx'));
    expect(page).toContain('getPlanSnapshot()');
    expect(page).toContain('buildChannelViews(');
    expect(page).not.toMatch(/searchParams|cookies\(|headers\(/);
    expect([...page.matchAll(/getPlanSnapshot\(/g)]).toHaveLength(1);
  });
});
