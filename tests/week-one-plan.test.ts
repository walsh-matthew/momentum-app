// The wizard's week 1 plan in lib/services/tasks.ts (MOM-35), against a mocked model and the in-memory
// Supabase fake (tests/helpers/fakeSupabase.ts):
// - generateWeekOnePlan: Claude's raw answer goes through parseTaskPlan() unchanged and is rejected, never
//   repaired, when it is wrong; nothing is saved and nothing is substituted;
// - createGoalWithWeekOnePlan: the goal and its tasks are saved in one database call or not at all, every
//   task is 'todo' in week 1, owned by the signed-in user.
// The real function, RLS and triggers are covered by supabase/verify/009_wizard_plan.sql.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildStubTaskPlan, parseWizardInput } from '@/lib/goals/taskPlan';
import { createGoalWithWeekOnePlan, generateWeekOnePlan, listMicroTasks } from '@/lib/services/tasks';
import { listGoalChannels } from '@/lib/services/goals';
import { OTHER_USER, USER, db, resetDb } from './helpers/fakeSupabase';

const model = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/ai/taskPlan', () => ({ requestWeekOnePlanFromModel: model.request }));
vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeSupabase');
  return { createSupabaseServerClient };
});

const input = (over: Record<string, unknown> = {}) => ({
  title: 'Get my first certification',
  goalType: 'get_certified',
  constraints: ['flexible_hours'],
  pace: 'lighter',
  reviewPrompts: ['took_longer'],
  ...over,
});

const task = (over: Record<string, unknown> = {}) => ({
  title: 'Study the first exam domain',
  taskType: 'certify',
  minutes: 45,
  weekOf: 1,
  ...over,
});
const planOf = (...tasks: unknown[]) => ({ tasks });
const goodPlan = () =>
  planOf(
    task({ title: 'Pick the certification and book the exam date', minutes: 30 }),
    task(),
    task({ title: 'Friday review: tick tasks and fill in notes', taskType: 'review', minutes: 30 }),
  );
const answer = (raw: unknown) => model.request.mockResolvedValueOnce({ ok: true, raw, model: 'claude-opus-5-5' });

let clock = 1_000_000;
const at = () => ({ now: () => (clock += 60_000) });

beforeEach(() => {
  model.request.mockReset();
  resetDb([], { id: USER });
});

describe('generateWeekOnePlan: a valid answer', () => {
  it("returns the model's plan, validated, and saves nothing", async () => {
    answer(goodPlan());
    const r = await generateWeekOnePlan(input(), at());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.model).toBe('claude-opus-5-5');
    expect(r.data.plan.tasks).toHaveLength(3);
    expect(r.data.plan.tasks.every((t) => t.weekOf === 1)).toBe(true);
    // Reading and generating write nothing.
    expect(db.inserts).toHaveLength(0);
    expect(db.rpcCalls).toHaveLength(0);
    expect(db.updates).toHaveLength(0);
    expect(db.tasks).toHaveLength(0);
    expect(db.channels).toHaveLength(0);
  });

  it('gives the model the validated wizard answers and nothing else', async () => {
    answer(goodPlan());
    await generateWeekOnePlan(input({ constraints: ['flexible_hours', 'flexible_hours'] }), at());
    const sent = model.request.mock.calls[0][0];
    expect(Object.keys(sent).sort()).toEqual(['constraints', 'goalType', 'pace', 'reviewPrompts', 'title']);
    expect(sent.title).toBe('Get my first certification');
  });
});

describe('generateWeekOnePlan: output that is not accepted', () => {
  const REJECTED = "Claude's plan did not pass our checks, so none of it was used.";

  it.each([
    ['a plan that is not an object', 'a plan'],
    ['a missing tasks list', {}],
    ['an empty plan', planOf()],
    ['a task missing its minutes', planOf({ title: 'x', taskType: 'build', weekOf: 1 })],
    ['a blank title', planOf(task({ title: '   ' }))],
    ['minutes of zero', planOf(task({ minutes: 0 }))],
    ['fractional minutes', planOf(task({ minutes: 12.5 }))],
    ['an unknown task type', planOf(task({ taskType: 'meditate' }))],
    ['a task already marked done', planOf(task({ status: 'done' }))],
    ['a task with a completion time', planOf(task({ completedAt: '2026-10-23T00:00:00Z' }))],
    ['a task with a status of todo (still an extra field)', planOf(task({ status: 'todo' }))],
    ['week 14, past the plan', planOf(task({ weekOf: 14 }))],
    ['week 0', planOf(task({ weekOf: 0 }))],
    ['week 2, valid for a plan but not for week 1', planOf(task(), task({ weekOf: 2 }))],
    ['more than 100 tasks', planOf(...Array.from({ length: 101 }, () => task()))],
  ])('rejects %s, and nothing is repaired or saved', async (_name, raw) => {
    answer(raw);
    const r = await generateWeekOnePlan(input(), at());
    expect(r).toEqual({ ok: false, error: REJECTED });
    expect(db.inserts).toHaveLength(0);
    expect(db.rpcCalls).toHaveLength(0);
  });
});

describe('generateWeekOnePlan: the model gives no answer', () => {
  it.each([
    ['refused', "Claude declined to write a plan."],
    ['rate_limited', 'Claude is busy right now.'],
    ['unavailable', 'Claude could not be reached.'],
    ['bad_output', "Claude's answer could not be read."],
    ['not_configured', "Claude plans aren't set up on the server yet."],
  ])('%s: a fixed message, no starter plan substituted', async (reason, message) => {
    model.request.mockResolvedValueOnce({ ok: false, reason });
    const r = await generateWeekOnePlan(input(), at());
    expect(r).toEqual({ ok: false, error: message });
    expect(db.rpcCalls).toHaveLength(0);
  });

  it('never shows provider text: a refusal carrying words of its own still gets our wording', async () => {
    model.request.mockResolvedValueOnce({ ok: false, reason: 'refused', detail: 'sk-ant-secret and the prompt' });
    const r = await generateWeekOnePlan(input(), at());
    expect(JSON.stringify(r)).not.toMatch(/sk-ant|prompt/);
  });
});

describe('generateWeekOnePlan: who may ask, and how often', () => {
  it('refuses when signed out and never calls the model', async () => {
    resetDb([], null);
    const r = await generateWeekOnePlan(input(), at());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Sign in/);
    expect(model.request).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown goal type', { goalType: 'become_a_wizard' }],
    ['a blank title', { title: '  ' }],
    ['an unknown pace', { pace: 'turbo' }],
    ['criteria passed in', { criteria: [{ key: 'a', label: 'A', done: true }] }],
  ])('rejects %s without calling the model or using up the cooldown', async (_name, over) => {
    expect((await generateWeekOnePlan(input(over), at())).ok).toBe(false);
    expect(model.request).not.toHaveBeenCalled();
    answer(goodPlan());
    expect((await generateWeekOnePlan(input(), at())).ok).toBe(true);
  });

  it('allows one request per user per 20 seconds, and counts a failed one', async () => {
    model.request.mockResolvedValueOnce({ ok: false, reason: 'unavailable' });
    const t = (clock += 1_000_000);
    expect((await generateWeekOnePlan(input(), { now: () => t })).ok).toBe(false);

    answer(goodPlan());
    const tooSoon = await generateWeekOnePlan(input(), { now: () => t + 19_000 });
    expect(tooSoon).toEqual({ ok: false, error: 'Please wait a few seconds before asking again.' });
    expect(model.request).toHaveBeenCalledTimes(1);

    expect((await generateWeekOnePlan(input(), { now: () => t + 20_000 })).ok).toBe(true);
    expect(model.request).toHaveBeenCalledTimes(2);
  });

  it('does not make one user wait for another', async () => {
    const t = (clock += 1_000_000);
    answer(goodPlan());
    await generateWeekOnePlan(input(), { now: () => t });
    resetDb([], { id: OTHER_USER });
    answer(goodPlan());
    expect((await generateWeekOnePlan(input(), { now: () => t + 1 })).ok).toBe(true);
  });
});

describe('createGoalWithWeekOnePlan: saved together', () => {
  it('saves the goal and every task in one database call', async () => {
    const r = await createGoalWithWeekOnePlan(input(), goodPlan());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.tasksSaved).toBe(3);
    expect(r.data.goal).toMatchObject({ user_id: USER, goal_type: 'get_certified', is_default: false, status: 'active' });

    expect(db.rpcCalls).toHaveLength(1);
    expect(db.rpcCalls[0].fn).toBe('create_goal_with_week_one_plan');
    // No separate inserts into either table: the one call did it all.
    expect(db.inserts).toHaveLength(0);
    expect(db.channels).toHaveLength(1);
    expect(db.tasks).toHaveLength(3);
  });

  it('every task is todo, in week 1, owned by the signed-in user and attached to the new goal', async () => {
    const r = await createGoalWithWeekOnePlan(input(), goodPlan());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const t of db.tasks) {
      expect(t).toMatchObject({
        user_id: USER,
        goal_channel_id: r.data.goal.id,
        status: 'todo',
        completed_at: null,
        week_of: 1,
        carried_from_week: null,
        pulled_from_week: null,
        source_provider: null,
      });
    }
    expect(db.tasks.map((t) => t.title)).toEqual(goodPlan().tasks.map((t) => (t as { title: string }).title));
    expect(db.tasks.map((t) => [t.task_type, t.minutes])).toEqual([['certify', 30], ['certify', 45], ['review', 30]]);
  });

  it('sends the function no user id, no status and no completion time', async () => {
    await createGoalWithWeekOnePlan(input(), goodPlan());
    const args = db.rpcCalls[0].args;
    expect(Object.keys(args).sort()).toEqual([
      'p_channel_key', 'p_criteria', 'p_goal_type', 'p_preferences', 'p_start_date', 'p_target_date', 'p_tasks', 'p_title',
    ]);
    for (const t of args.p_tasks as Array<Record<string, unknown>>) {
      expect(Object.keys(t).sort()).toEqual(['minutes', 'task_type', 'title']);
    }
  });

  it('the goal keeps the wizard answers and unticked starting criteria, and both reload', async () => {
    const r = await createGoalWithWeekOnePlan(input({ constraints: ['flexible_dates', 'flexible_dates'], pace: 'heavier' }), goodPlan());
    expect(r.ok).toBe(true);
    const goals = await listGoalChannels();
    const tasks = await listMicroTasks({ weekOf: 1 });
    expect(goals.ok && goals.data).toHaveLength(1);
    if (!goals.ok || !tasks.ok) return;
    expect(goals.data[0]).toMatchObject({ goal_type: 'get_certified', preferences: { constraints: ['flexible_dates'], pace: 'heavier' } });
    expect(goals.data[0].criteria.length).toBeGreaterThan(0);
    expect(goals.data[0].criteria.every((c) => c.done === false)).toBe(true);
    expect(tasks.data).toHaveLength(3);
    expect(tasks.data.every((t) => t.status === 'todo')).toBe(true);
  });

  it('accepts the starter plan the user chose, held to the same rules', async () => {
    const wizard = parseWizardInput(input());
    if (!wizard.ok) throw new Error(wizard.error);
    const starter = buildStubTaskPlan(wizard.data);
    const r = await createGoalWithWeekOnePlan(input(), starter);
    expect(r.ok && r.data.tasksSaved).toBe(starter.tasks.length);
    expect(db.tasks.every((t) => t.status === 'todo' && t.week_of === 1)).toBe(true);
  });

  it('gives a second goal with the same title a numbered key, with nothing left from the failed try', async () => {
    const a = await createGoalWithWeekOnePlan(input(), goodPlan());
    const b = await createGoalWithWeekOnePlan(input(), goodPlan());
    expect(a.ok && a.data.goal.channel_key).toBe('get_my_first_certification');
    expect(b.ok && b.data.goal.channel_key).toBe('get_my_first_certification_2');
    expect(db.rpcCalls).toHaveLength(3);
    expect(db.channels).toHaveLength(2);
    expect(db.tasks).toHaveLength(6);
  });
});

describe('createGoalWithWeekOnePlan: all or nothing', () => {
  it('a task that fails after the goal row exists leaves no goal and no tasks', async () => {
    db.failTaskAt = 1;
    const r = await createGoalWithWeekOnePlan(input(), goodPlan());
    expect(r).toEqual({ ok: false, error: 'Could not save your goal and plan. Nothing was saved.' });
    expect(db.channels).toHaveLength(0);
    expect(db.tasks).toHaveLength(0);
  });

  it('a database error on the goal leaves nothing either, and shows our wording, not the database text', async () => {
    db.failNextInsert = 'boom: row (secret) violates something';
    const r = await createGoalWithWeekOnePlan(input(), goodPlan());
    expect(r).toEqual({ ok: false, error: 'Could not save your goal and plan. Nothing was saved.' });
    expect(JSON.stringify(r)).not.toContain('secret');
    expect(db.channels).toHaveLength(0);
    expect(db.tasks).toHaveLength(0);
  });

  it('a failure on one user never touches another user\'s data', async () => {
    resetDb([], { id: OTHER_USER });
    await createGoalWithWeekOnePlan(input({ title: 'Theirs' }), goodPlan());
    db.user = { id: USER };
    db.failTaskAt = 0;
    await createGoalWithWeekOnePlan(input(), goodPlan());
    expect(db.channels.map((c) => c.user_id)).toEqual([OTHER_USER]);
    expect(db.tasks.every((t) => t.user_id === OTHER_USER)).toBe(true);
  });

  it('refuses when signed out and calls nothing', async () => {
    resetDb([], null);
    const r = await createGoalWithWeekOnePlan(input(), goodPlan());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Sign in/);
    expect(db.rpcCalls).toHaveLength(0);
  });
});

describe('createGoalWithWeekOnePlan: it re-checks what it is given', () => {
  it.each([
    ['a task already marked done', planOf(task({ status: 'done' }))],
    ['a completion time', planOf(task({ completedAt: '2026-10-23T00:00:00Z' }))],
    ['an unknown task type', planOf(task({ taskType: 'meditate' }))],
    ['week 14', planOf(task({ weekOf: 14 }))],
    ['week 2', planOf(task({ weekOf: 2 }))],
    ['an empty plan', planOf()],
    ['no plan at all', undefined],
  ])('rejects %s before any database call', async (_name, plan) => {
    const r = await createGoalWithWeekOnePlan(input(), plan);
    expect(r.ok).toBe(false);
    expect(db.rpcCalls).toHaveLength(0);
    expect(db.channels).toHaveLength(0);
    expect(db.tasks).toHaveLength(0);
  });

  it.each([
    ['an unknown goal type', { goalType: 'become_a_wizard' }],
    ['a blank title', { title: '' }],
    ['criteria passed in, ticked', { criteria: [{ key: 'a', label: 'A', done: true }] }],
  ])('rejects %s before any database call', async (_name, over) => {
    const r = await createGoalWithWeekOnePlan(input(over), goodPlan());
    expect(r.ok).toBe(false);
    expect(db.rpcCalls).toHaveLength(0);
  });
});

describe('the fake keeps the database function honest', () => {
  // These call the stand-in directly, as a caller that skipped the service would, to show the rules the
  // real function enforces (supabase/verify/009_wizard_plan.sql runs them against Postgres).
  async function call(args: Record<string, unknown>) {
    const { createSupabaseServerClient } = await import('./helpers/fakeSupabase');
    const supabase = (await createSupabaseServerClient()) as unknown as {
      rpc: (fn: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
    return supabase.rpc('create_goal_with_week_one_plan', {
      p_channel_key: 'direct',
      p_title: 'Direct',
      p_goal_type: 'get_certified',
      p_preferences: {},
      p_criteria: [],
      p_start_date: '2026-10-23',
      p_target_date: '2027-01-21',
      p_tasks: [{ title: 'A', task_type: 'build', minutes: 10 }],
      ...args,
    });
  }

  it('rejects a task carrying a status, a week or a user id, and saves nothing', async () => {
    for (const extra of [{ status: 'done' }, { week_of: 3 }, { user_id: OTHER_USER }, { completed_at: 'now' }]) {
      const r = await call({ p_tasks: [{ title: 'A', task_type: 'build', minutes: 10, ...extra }] });
      expect(r.error).not.toBeNull();
    }
    expect(db.channels).toHaveLength(0);
    expect(db.tasks).toHaveLength(0);
  });

  it('rejects an empty or non-array task list', async () => {
    expect((await call({ p_tasks: [] })).error).not.toBeNull();
    expect((await call({ p_tasks: { title: 'A' } })).error).not.toBeNull();
    expect(db.channels).toHaveLength(0);
  });

  it('an unknown task type in the second task rolls the goal back', async () => {
    const r = await call({
      p_tasks: [{ title: 'A', task_type: 'build', minutes: 10 }, { title: 'B', task_type: 'meditate', minutes: 10 }],
    });
    expect(r.error?.message).toMatch(/micro_tasks_task_type_check/);
    expect(db.channels).toHaveLength(0);
    expect(db.tasks).toHaveLength(0);
  });

  it('a ticked criterion on the new goal rolls the whole call back', async () => {
    const r = await call({ p_criteria: [{ key: 'a', label: 'A', done: true }] });
    expect(r.error).not.toBeNull();
    expect(db.tasks).toHaveLength(0);
  });

  it('signed out, it refuses', async () => {
    db.user = null;
    expect((await call({})).error?.message).toMatch(/Sign in/);
  });

  it('whoever the arguments name, the rows belong to the signed-in user', async () => {
    const r = await call({ p_user_id: OTHER_USER });
    expect(r.error).toBeNull();
    expect(db.channels.map((c) => c.user_id)).toEqual([USER]);
    expect(db.tasks.map((t) => t.user_id)).toEqual([USER]);
  });
});
