// Goal progress (MOM-86): tasks done of total, the percentage, and the plan week, per goal. The calculation
// is pure (lib/utils/progress.ts); the service reads the signed-in user's own goals and tasks through the
// in-memory Supabase fake. Counting never completes, reopens or changes a task (docs/NINETY_DAY_PLAN_CONTEXT.md
// §3, §5 rule 6), and the user's session (RLS) is the only thing that decides whose data is counted. The real
// RLS policies are covered by supabase/verify/001_initial_schema.sql.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listGoalProgress, setTaskStatus } from '@/lib/services/tasks';
import { percentDone, planTimeline, summarizeAllGoalProgress, summarizeGoalProgress } from '@/lib/utils/progress';
import { currentPlanWeek } from '@/lib/utils/velocity';
import { PLAN_WEEKS } from '@/types/database.types';
import { OTHER_USER, USER, channelRow, db, resetDb, taskRow } from './helpers/fakeSupabase';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeSupabase');
  return { createSupabaseServerClient };
});

const START = '2026-10-14';
const dayAfterStart = (n: number) => new Date(Date.parse(START) + n * 86_400_000).toISOString().slice(0, 10);
const goal = (id: string, over: Record<string, unknown> = {}) => ({ id, title: `Goal ${id}`, status: 'active' as const, start_date: START, ...over });
const t = (goalId: string, status: 'todo' | 'done' = 'todo') => ({ goal_channel_id: goalId, status });

describe('planTimeline: where today falls in the plan', () => {
  it('week 1 starts on the start date and lasts seven days', () => {
    expect(planTimeline(START, dayAfterStart(0))).toEqual({ timeline: 'active', week: 1 });
    expect(planTimeline(START, dayAfterStart(6))).toEqual({ timeline: 'active', week: 1 });
    expect(planTimeline(START, dayAfterStart(7))).toEqual({ timeline: 'active', week: 2 });
  });

  it(`week ${PLAN_WEEKS} is the last, and the day after it is past the plan`, () => {
    const lastDay = PLAN_WEEKS * 7 - 1;
    expect(planTimeline(START, dayAfterStart(lastDay))).toEqual({ timeline: 'active', week: PLAN_WEEKS });
    expect(planTimeline(START, dayAfterStart(lastDay + 1))).toEqual({ timeline: 'past_plan', week: null });
    expect(planTimeline(START, dayAfterStart(400))).toEqual({ timeline: 'past_plan', week: null });
  });

  it('before the start date there is no active week', () => {
    expect(planTimeline(START, dayAfterStart(-1))).toEqual({ timeline: 'not_started', week: null });
    expect(planTimeline(START, dayAfterStart(-60))).toEqual({ timeline: 'not_started', week: null });
  });

  it('a date that cannot be read is unknown, not a guess', () => {
    expect(planTimeline('not a date', dayAfterStart(3))).toEqual({ timeline: 'unknown', week: null });
    expect(planTimeline(START, '')).toEqual({ timeline: 'unknown', week: null });
  });

  it('agrees with the plan week the velocity code uses, for every day of the plan', () => {
    for (let day = 0; day < PLAN_WEEKS * 7; day++) {
      expect(planTimeline(START, dayAfterStart(day)).week).toBe(currentPlanWeek(START, dayAfterStart(day)));
    }
  });
});

describe('percentDone: never flattering', () => {
  it.each([
    [0, 0, 0],
    [0, 5, 0],
    [1, 3, 33],
    [2, 3, 66],
    [199, 200, 99],
    [1, 1000, 0],
    [5, 5, 100],
    [1, 1, 100],
  ])('%i of %i is %i%%', (done, total, expected) => {
    expect(percentDone(done, total)).toBe(expected);
  });

  it('stays inside 0 to 100 even for impossible counts', () => {
    expect(percentDone(7, 5)).toBe(100);
    expect(percentDone(3, -2)).toBe(0);
  });

  it('is 100 only when everything is done', () => {
    for (let total = 1; total <= 60; total++) {
      for (let done = 0; done < total; done++) expect(percentDone(done, total)).toBeLessThan(100);
      expect(percentDone(total, total)).toBe(100);
    }
  });
});

describe('summarizeGoalProgress', () => {
  const asOf = dayAfterStart(9); // week 2

  it('counts finished and total tasks and the percentage', () => {
    const p = summarizeGoalProgress(goal('a'), [t('a', 'done'), t('a', 'done'), t('a'), t('a')], asOf);
    expect(p).toMatchObject({ goalId: 'a', title: 'Goal a', status: 'active', done: 2, total: 4, remaining: 2, percent: 50 });
    expect(p).toMatchObject({ completion: 'in_progress', timeline: 'active', week: 2 });
  });

  it('a goal with no tasks is empty at 0%, not an error', () => {
    const p = summarizeGoalProgress(goal('a'), [], asOf);
    expect(p).toMatchObject({ done: 0, total: 0, remaining: 0, percent: 0, completion: 'empty' });
    expect(Number.isNaN(p.percent)).toBe(false);
  });

  it('a goal whose tasks are all done is complete at 100%', () => {
    const p = summarizeGoalProgress(goal('a'), [t('a', 'done'), t('a', 'done'), t('a', 'done')], asOf);
    expect(p).toMatchObject({ done: 3, total: 3, remaining: 0, percent: 100, completion: 'complete' });
  });

  it('one open task keeps a goal from being complete or 100%', () => {
    const p = summarizeGoalProgress(goal('a'), [...Array.from({ length: 199 }, () => t('a', 'done')), t('a')], asOf);
    expect(p).toMatchObject({ percent: 99, completion: 'in_progress', remaining: 1 });
  });

  it('only that goal\'s tasks count', () => {
    const p = summarizeGoalProgress(goal('a'), [t('a', 'done'), t('b', 'done'), t('b'), t('c', 'done')], asOf);
    expect(p).toMatchObject({ done: 1, total: 1, percent: 100 });
  });

  it('counts tasks, not minutes: a short task weighs the same as a long one', () => {
    const short = { ...t('a', 'done'), minutes: 5 };
    const long = { ...t('a'), minutes: 120 };
    expect(summarizeGoalProgress(goal('a'), [short, long], asOf)).toMatchObject({ done: 1, total: 2, percent: 50 });
  });

  it('counts tasks in every week of a multi-week plan, and a carried-over task once', () => {
    const tasks = [1, 2, 2, 3, 5, 13].map((week, i) => ({ ...t('a', i % 2 === 0 ? 'done' : 'todo'), week_of: week }));
    const carried = { ...t('a', 'done'), week_of: 4, carried_from_week: 2 };
    expect(summarizeGoalProgress(goal('a'), [...tasks, carried], asOf)).toMatchObject({ done: 4, total: 7, percent: 57 });
  });

  it('a goal that has not started still shows its tasks, with no active week', () => {
    const p = summarizeGoalProgress(goal('a', { start_date: dayAfterStart(30) }), [t('a'), t('a', 'done')], asOf);
    expect(p).toMatchObject({ done: 1, total: 2, timeline: 'not_started', week: null });
  });

  it('a goal past week 13 keeps its counts and has no active week', () => {
    const p = summarizeGoalProgress(goal('a'), [t('a'), t('a', 'done')], dayAfterStart(PLAN_WEEKS * 7 + 5));
    expect(p).toMatchObject({ done: 1, total: 2, percent: 50, timeline: 'past_plan', week: null });
  });

  it('a paused or finished goal is still counted, and says so', () => {
    expect(summarizeGoalProgress(goal('a', { status: 'paused' }), [t('a', 'done')], asOf)).toMatchObject({ status: 'paused', percent: 100 });
    expect(summarizeGoalProgress(goal('a', { status: 'done' }), [], asOf)).toMatchObject({ status: 'done', completion: 'empty' });
  });
});

describe('summarizeAllGoalProgress', () => {
  const asOf = dayAfterStart(2);

  it('keeps the goals in the order given, and lists a goal with no tasks', () => {
    const out = summarizeAllGoalProgress([goal('b'), goal('a'), goal('empty')], [t('a', 'done'), t('b'), t('b')], asOf);
    expect(out.map((p) => p.goalId)).toEqual(['b', 'a', 'empty']);
    expect(out.map((p) => [p.done, p.total])).toEqual([[0, 2], [1, 1], [0, 0]]);
  });

  it('keeps goals independent, with their own start dates', () => {
    const out = summarizeAllGoalProgress(
      [goal('a'), goal('b', { start_date: dayAfterStart(-20) })],
      [t('a', 'done'), t('b', 'done'), t('b')],
      asOf,
    );
    expect(out[0]).toMatchObject({ percent: 100, week: 1 });
    expect(out[1]).toMatchObject({ percent: 50, week: 4 });
  });

  it('ignores tasks whose goal is not in the list', () => {
    const out = summarizeAllGoalProgress([goal('a')], [t('a'), t('stranger', 'done'), t('stranger')], asOf);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ done: 0, total: 1 });
  });

  it('gives the same answer as summarizing each goal on its own', () => {
    const goals = [goal('a'), goal('b'), goal('c')];
    const tasks = [t('a', 'done'), t('a'), t('b'), t('c', 'done'), t('c', 'done')];
    expect(summarizeAllGoalProgress(goals, tasks, asOf)).toEqual(goals.map((g) => summarizeGoalProgress(g, tasks, asOf)));
  });

  it('does not change what it is given', () => {
    const goals = [goal('a')];
    const tasks = [t('a', 'done'), t('a')];
    const before = JSON.stringify({ goals, tasks });
    summarizeAllGoalProgress(goals, tasks, asOf);
    expect(JSON.stringify({ goals, tasks })).toBe(before);
  });

  it('handles no goals and no tasks', () => {
    expect(summarizeAllGoalProgress([], [], asOf)).toEqual([]);
    expect(summarizeAllGoalProgress([], [t('a')], asOf)).toEqual([]);
  });
});

describe('listGoalProgress (the service)', () => {
  const NOW = Date.parse('2026-10-23T12:00:00Z'); // 9 days after START: week 2
  const signedIn = { id: USER };
  let created = 0;
  const chan = (key: string, over: Record<string, unknown> = {}) =>
    channelRow({ channel_key: key, title: key, created_at: `2026-10-14T00:00:${String(++created % 60).padStart(2, '0')}Z`, ...over } as never);

  beforeEach(() => resetDb([], signedIn));

  it('gives one summary per goal, default goal first, from the user\'s own tasks', async () => {
    const main = chan('career_pivot', { is_default: true, goal_type: 'career_pivot' });
    const side = chan('side_project');
    db.channels = [side, main];
    db.tasks = [
      taskRow(1, { goal_channel_id: main.id, status: 'done', completed_at: '2026-10-20T00:00:00Z' }),
      taskRow(2, { goal_channel_id: main.id }),
      taskRow(2, { goal_channel_id: side.id }),
    ];
    const r = await listGoalProgress({ now: () => NOW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.map((p) => p.goalId)).toEqual([main.id, side.id]);
    expect(r.data[0]).toMatchObject({ done: 1, total: 2, percent: 50, completion: 'in_progress', timeline: 'active', week: 2 });
    expect(r.data[1]).toMatchObject({ done: 0, total: 1, percent: 0 });
  });

  it('lists a goal with no tasks as 0 of 0', async () => {
    const empty = chan('empty_goal');
    db.channels = [empty];
    const r = await listGoalProgress({ now: () => NOW });
    expect(r.ok && r.data).toEqual([
      expect.objectContaining({ goalId: empty.id, done: 0, total: 0, percent: 0, completion: 'empty' }),
    ]);
  });

  it('reports a finished goal as complete', async () => {
    const g = chan('finished');
    db.channels = [g];
    db.tasks = [1, 2, 3].map((w) => taskRow(w, { goal_channel_id: g.id, status: 'done', completed_at: '2026-10-20T00:00:00Z' }));
    const r = await listGoalProgress({ now: () => NOW });
    expect(r.ok && r.data[0]).toMatchObject({ done: 3, total: 3, percent: 100, completion: 'complete', remaining: 0 });
  });

  it('works out the week from the date it is given', async () => {
    const g = chan('dated', { start_date: '2026-10-14' });
    db.channels = [g];
    const early = await listGoalProgress({ now: () => Date.parse('2026-10-10T12:00:00Z') });
    const late = await listGoalProgress({ now: () => Date.parse('2027-03-01T12:00:00Z') });
    expect(early.ok && early.data[0]).toMatchObject({ timeline: 'not_started', week: null });
    expect(late.ok && late.data[0]).toMatchObject({ timeline: 'past_plan', week: null });
  });

  describe('one user never sees or counts another\'s data', () => {
    it('leaves out another user\'s goals and tasks', async () => {
      const mine = chan('mine');
      const theirs = chan('theirs', { user_id: OTHER_USER });
      db.channels = [mine, theirs];
      db.tasks = [
        taskRow(1, { goal_channel_id: mine.id }),
        taskRow(1, { user_id: OTHER_USER, goal_channel_id: theirs.id, status: 'done', completed_at: '2026-10-20T00:00:00Z' }),
        taskRow(1, { user_id: OTHER_USER, goal_channel_id: theirs.id }),
      ];
      const r = await listGoalProgress({ now: () => NOW });
      expect(r.ok && r.data.map((p) => p.goalId)).toEqual([mine.id]);
      expect(r.ok && r.data[0]).toMatchObject({ done: 0, total: 1 });
    });

    it('shows the other user their own numbers, not this user\'s', async () => {
      const mine = chan('mine');
      const theirs = chan('theirs', { user_id: OTHER_USER });
      db.channels = [mine, theirs];
      db.tasks = [taskRow(1, { goal_channel_id: mine.id }), taskRow(1, { user_id: OTHER_USER, goal_channel_id: theirs.id })];
      db.user = { id: OTHER_USER };
      const r = await listGoalProgress({ now: () => NOW });
      expect(r.ok && r.data.map((p) => p.goalId)).toEqual([theirs.id]);
    });

    it('shows a signed-out client nothing', async () => {
      db.channels = [chan('mine')];
      db.tasks = [taskRow(1)];
      db.user = null;
      expect(await listGoalProgress({ now: () => NOW })).toEqual({ ok: true, data: [] });
    });
  });

  it('only reads: two selects, no write, no rpc, no delete', async () => {
    const g = chan('read_only');
    db.channels = [g];
    db.tasks = [taskRow(1, { goal_channel_id: g.id }), taskRow(2, { goal_channel_id: g.id })];
    const before = JSON.stringify(db.tasks);
    await listGoalProgress({ now: () => NOW });
    expect(db.reads).toBe(2);
    expect(db.updates).toHaveLength(0);
    expect(db.inserts).toHaveLength(0);
    expect(db.rpcCalls).toHaveLength(0);
    expect(db.deleteCalls).toBe(0);
    expect(JSON.stringify(db.tasks)).toBe(before);
  });

  it('moves only when the user ticks a task: their own tick raises the count, nothing else does', async () => {
    const g = chan('ticked');
    db.channels = [g];
    const a = taskRow(1, { goal_channel_id: g.id });
    db.tasks = [a, taskRow(2, { goal_channel_id: g.id })];
    const first = await listGoalProgress({ now: () => NOW });
    const again = await listGoalProgress({ now: () => NOW });
    expect(first).toEqual(again);
    expect(first.ok && first.data[0].done).toBe(0);

    expect((await setTaskStatus(a.id, 'done')).ok).toBe(true);
    const after = await listGoalProgress({ now: () => NOW });
    expect(after.ok && after.data[0]).toMatchObject({ done: 1, total: 2, percent: 50 });

    expect((await setTaskStatus(a.id, 'todo')).ok).toBe(true);
    const undone = await listGoalProgress({ now: () => NOW });
    expect(undone.ok && undone.data[0]).toMatchObject({ done: 0, percent: 0 });
  });
});

describe('source-level: aggregation never writes', () => {
  const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

  it('the calculation and its types hold no database, network, clock or task write', () => {
    for (const code of [strip(read('lib', 'utils', 'progress.ts')), strip(read('types', 'progress.ts'))]) {
      expect(code).not.toMatch(/supabase|fetch\(|\.insert\(|\.update\(|\.rpc\(|\.delete\(|Date\.now|new Date\(|setTaskStatus|completed_at/);
    }
  });

  it('listGoalProgress makes two reads and no write', () => {
    const tasks = read('lib', 'services', 'tasks.ts');
    const start = tasks.indexOf('export async function listGoalProgress');
    const body = strip(tasks.slice(start, tasks.indexOf('\n}\n', start) + 3));
    expect(body).toContain('listGoalChannels()');
    expect(body).toContain('listMicroTasks()');
    expect(body).not.toMatch(/\.insert\(|\.update\(|\.rpc\(|\.delete\(|\.upsert\(|setTaskStatus|from\(/);
    expect(body).not.toMatch(/supabase\/admin|SERVICE_ROLE/);
  });
});
