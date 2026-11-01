// The edits behind home's deadline forecast (lib/services/forecastEdits.ts, MOM-138), run against the in-memory goal model fake
// (tests/helpers/fakeEntriesModel.ts), which mirrors migration 013's grants, own-row policies and the CHECKs these writes meet.
// What these pin:
// - one person never changes another's rows, even with row level security switched off in the fake, because the service filters
//   by their id itself;
// - a due date moves only when setup recorded that it can: refused otherwise with no write, and still refused when the date was
//   locked between the read and the write (the same statement filters on it);
// - a ticked step is never renamed or removed, a finished task is never edited, and nothing is guessed (empty is refused);
// - a changed usual time, size or date changes the forecast home says, and no closed week's result moves;
// - a failure is a plain message with no database text.
// Dates are from October 2026: Thursday 2026-10-29, noon in Los Angeles. 2026-10-05 is a Monday.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DATE_LOCKED,
  DATE_PAST,
  NOT_YOUR_KIND,
  NOT_YOUR_STEP,
  NOT_YOUR_TASK,
  SAVE_FAILED,
  SIZE_MISSING,
  STEP_MISSING,
  STEP_TICKED,
  TASK_FINISHED,
  UNIT_MISSING,
} from '@/lib/forecast/edits';
import {
  addTaskStep,
  getDayKindTimes,
  getTaskEdit,
  moveTaskDate,
  removeTaskStep,
  renameTaskStep,
  setDayKindTime,
  setTaskSize,
} from '@/lib/services/forecastEdits';
import { getHomeScoreboard } from '@/lib/services/scoreboard';
import type { ForecastView } from '@/types/home';
import { ME, OTHER, add, gm, newId, resetGoalModel } from './helpers/fakeEntriesModel';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeEntriesModel');
  return { createSupabaseServerClient };
});

const NOW = Date.UTC(2026, 9, 29, 19, 0, 0);
const deps = { now: () => NOW };
const TODAY = '2026-10-29';

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetGoalModel({ id: ME });
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

// A person with a weekly target that has closed weeks, two kinds of days (one with a usual time, one without), and a deadline task
// due Friday 10-30 on two days they set aside. Twenty hours of work against two three-hour days does not fit.
function world(userId: string, over: { canMove?: boolean | null; estimateMinutes?: number | null; completedAt?: string | null; kind?: string } = {}) {
  add('person_settings', { user_id: userId, time_zone: 'America/Los_Angeles', week_start: 1, day_end: '00:00:00', tone: null, celebrations: null });
  const goal = { id: newId(), user_id: userId, title: 'Land the new role', state: 'active', shape: 'ongoing', start_date: '2026-10-05', end_date: null, created_at: '2026-10-05T00:00:00.000Z' };
  add('goals', goal);
  const weekly = {
    id: newId(),
    user_id: userId,
    goal_id: goal.id,
    title: 'Applications sent',
    measure: 'count',
    unit: null,
    role: 'effort',
    period_kind: 'weekly',
    due_date: null,
    slot_weekdays: null,
    floor: 3,
    aspiration: 5,
    qualifying_threshold: null,
    carry_over_kind: 'habit',
    created_at: '2026-10-05T00:00:01.000Z',
  };
  add('targets', weekly);
  const source = { id: newId(), user_id: userId, kind: 'manual', provider: null, label: 'Manual' };
  add('sources', source);
  const log = (day: string, n = 1) => {
    for (let i = 0; i < n; i++) {
      add('entries', { id: newId(), user_id: userId, target_id: weekly.id, source_id: source.id, source_record_id: newId(), work_item_id: null, occurred_at: `${day}T19:00:00+00:00`, value: 1, evidence: {}, created_at: '2026-10-29T00:00:00.000Z' });
    }
  };
  // Closed weeks: met, missed, met.
  log('2026-10-05', 3);
  log('2026-10-12', 1);
  log('2026-10-19', 4);

  const work = add('person_day_types', { id: newId(), user_id: userId, name: 'Work day', capacity_unit: 'hours', capacity_amount: 3, created_at: '2026-10-05T00:00:00.000Z' });
  const rest = add('person_day_types', { id: newId(), user_id: userId, name: 'Rest day', capacity_unit: null, capacity_amount: null, created_at: '2026-10-05T00:00:01.000Z' });
  const kind = over.kind ?? 'deadline_task';
  const task = add('work_items', {
    id: newId(),
    user_id: userId,
    goal_id: goal.id,
    target_id: null,
    kind,
    title: 'Send the application',
    sort_order: 0,
    due_date: kind === 'deadline_task' ? '2026-10-30' : null,
    date_can_move: kind === 'deadline_task' ? (over.canMove === undefined ? true : over.canMove) : null,
    estimate_minutes: over.estimateMinutes === undefined ? 1200 : over.estimateMinutes,
    completed_at: over.completedAt ?? null,
    completed_via: over.completedAt ? 'person' : null,
    created_at: '2026-10-05T00:00:02.000Z',
  });
  const step = (title: string, sortOrder: number) => add('work_item_steps', { id: newId(), user_id: userId, work_item_id: task.id, title, sort_order: sortOrder, completed_at: null, completed_via: null });
  const tick = (stepId: unknown) => add('entries', { id: newId(), user_id: userId, target_id: weekly.id, source_id: source.id, source_record_id: stepId, work_item_id: task.id, occurred_at: '2026-10-28T19:00:00+00:00', value: 1, evidence: {}, created_at: '2026-10-28T19:00:00.000Z' });
  // The two days the task is on, both worked days.
  for (const day of ['2026-10-29', '2026-10-30']) {
    add('week_plan_picks', { id: newId(), user_id: userId, work_item_id: task.id, plan_date: day });
    add('week_plan_day_types', { id: newId(), user_id: userId, plan_date: day, day_type_id: work.id });
  }
  return { goal, weekly, source, work, rest, task, step, tick, log };
}

const mine = (table: 'work_items' | 'work_item_steps' | 'person_day_types') => gm.tables[table].filter((r) => r.user_id === ME);
const writes = () => gm.writes.map((w) => `${w.table} ${w.op}`);

async function homeOf() {
  const r = await getHomeScoreboard({ now: () => NOW });
  if (!r.ok || r.data.state !== 'ready') throw new Error('home is not ready');
  return r.data;
}
const forecastOf = async (taskId: unknown): Promise<ForecastView | null> => (await homeOf()).goals[0].milestones.find((m) => m.id === taskId)?.forecast ?? null;

describe("a kind of day's usual time", () => {
  it('is saved as the unit and the amount together, and nothing else is written', async () => {
    const w = world(ME);
    const result = await setDayKindTime(w.rest.id, 'sessions', '2');
    expect(result).toEqual({ ok: true, data: { changed: 1 } });
    expect(w.rest).toMatchObject({ capacity_unit: 'sessions', capacity_amount: 2, name: 'Rest day' });
    expect(writes()).toEqual(['person_day_types update']);
  });

  it('can be changed again, and 0 is a time (a day that gives none)', async () => {
    const w = world(ME);
    expect(await setDayKindTime(w.work.id, 'hours', '0')).toEqual({ ok: true, data: { changed: 1 } });
    expect(w.work).toMatchObject({ capacity_unit: 'hours', capacity_amount: 0 });
  });

  it('is never guessed: no unit, no amount or too much is refused with the plain words and writes nothing', async () => {
    const w = world(ME);
    const before = structuredClone(mine('person_day_types'));
    expect(await setDayKindTime(w.rest.id, '', '3')).toEqual({ ok: false, error: UNIT_MISSING });
    expect(await setDayKindTime(w.rest.id, 'hours', '')).toEqual({ ok: false, error: 'Say how many first.' });
    expect(await setDayKindTime(w.rest.id, 'hours', '30')).toMatchObject({ ok: false });
    expect(await setDayKindTime(w.rest.id, 'hours', '-1')).toMatchObject({ ok: false });
    expect(await setDayKindTime('not-an-id', 'hours', '3')).toEqual({ ok: false, error: NOT_YOUR_KIND });
    expect(writes()).toEqual([]);
    expect(mine('person_day_types')).toEqual(before);
  });

  it("is never another person's kind, even with row level security off", async () => {
    world(ME);
    const theirs = world(OTHER);
    gm.rls = false;
    const before = structuredClone(theirs.work);
    expect(await setDayKindTime(theirs.work.id, 'hours', '9')).toEqual({ ok: false, error: NOT_YOUR_KIND });
    expect(theirs.work).toEqual(before);
    expect(writes()).toEqual([]); // the statement ran and matched no row of mine, so nothing was written
  });

  it('lists only my own kinds, in the order they were made, with what is saved', async () => {
    world(ME);
    world(OTHER);
    const r = await getDayKindTimes();
    expect(r.ok && r.data.map((k) => [k.name, k.unit, k.amount])).toEqual([
      ['Work day', 'hours', 3],
      ['Rest day', null, null],
    ]);
  });
});

describe("a deadline task's rough size", () => {
  it('is typed in hours and saved as minutes, on the task only', async () => {
    const w = world(ME);
    expect(await setTaskSize(w.task.id, '1.5', deps)).toEqual({ ok: true, data: { changed: 1 } });
    expect(w.task.estimate_minutes).toBe(90);
    expect(writes()).toEqual(['work_items update']);
  });

  it('can be given to a task that had none, and saying the same size again changes nothing', async () => {
    const w = world(ME, { estimateMinutes: null });
    expect(await setTaskSize(w.task.id, '2', deps)).toEqual({ ok: true, data: { changed: 1 } });
    expect(await setTaskSize(w.task.id, '2', deps)).toEqual({ ok: true, data: { changed: 0 } });
    expect(w.task.estimate_minutes).toBe(120);
  });

  it('is never guessed, and never changes a milestone, a finished task or another person’s task', async () => {
    const w = world(ME);
    expect(await setTaskSize(w.task.id, '', deps)).toEqual({ ok: false, error: SIZE_MISSING });
    expect(await setTaskSize(w.task.id, '0', deps)).toMatchObject({ ok: false });
    expect(await setTaskSize('nope', '2', deps)).toEqual({ ok: false, error: NOT_YOUR_TASK });
    expect(writes()).toEqual([]);

    resetGoalModel({ id: ME });
    const milestone = world(ME, { kind: 'milestone', estimateMinutes: null });
    expect(await setTaskSize(milestone.task.id, '2', deps)).toEqual({ ok: false, error: NOT_YOUR_TASK });

    resetGoalModel({ id: ME });
    const done = world(ME, { completedAt: '2026-10-28T10:00:00.000Z' });
    expect(await setTaskSize(done.task.id, '2', deps)).toEqual({ ok: false, error: TASK_FINISHED });
    expect(done.task.estimate_minutes).toBe(1200);

    resetGoalModel({ id: ME });
    world(ME);
    const theirs = world(OTHER);
    gm.rls = false;
    expect(await setTaskSize(theirs.task.id, '2', deps)).toEqual({ ok: false, error: NOT_YOUR_TASK });
    expect(theirs.task.estimate_minutes).toBe(1200);
    expect(writes()).toEqual([]);
  });
});

describe("a deadline task's due date", () => {
  it('moves when setup recorded that it can, to today or later, and touches only the task', async () => {
    const w = world(ME, { canMove: true });
    expect(await moveTaskDate(w.task.id, '2026-11-05', deps)).toEqual({ ok: true, data: { changed: 1 } });
    expect(w.task.due_date).toBe('2026-11-05');
    expect(w.task.date_can_move).toBe(true);
    expect(await moveTaskDate(w.task.id, TODAY, deps)).toEqual({ ok: true, data: { changed: 1 } });
    expect(writes()).toEqual(['work_items update', 'work_items update']);
  });

  it('does not move when setup recorded that it cannot: refused, with no write at all', async () => {
    const w = world(ME, { canMove: false });
    expect(await moveTaskDate(w.task.id, '2026-11-05', deps)).toEqual({ ok: false, error: DATE_LOCKED });
    expect(w.task.due_date).toBe('2026-10-30');
    expect(writes()).toEqual([]);
  });

  it('does not move when setup never recorded an answer for it either (nothing is assumed)', async () => {
    // A deadline task always has an answer (013's own rule), so a missing one is only reachable through a stale row: it is locked too.
    const w = world(ME, { canMove: false });
    w.task.date_can_move = false;
    expect(await moveTaskDate(w.task.id, '2026-12-01', deps)).toEqual({ ok: false, error: DATE_LOCKED });
  });

  it('is still refused when the date was locked after it was read: the same statement filters on it', async () => {
    const w = world(ME, { canMove: true });
    gm.beforeWrite = (table) => {
      if (table === 'work_items') w.task.date_can_move = false;
    };
    expect(await moveTaskDate(w.task.id, '2026-11-05', deps)).toEqual({ ok: false, error: DATE_LOCKED });
    expect(w.task.due_date).toBe('2026-10-30');
  });

  it('is never moved to a day that has passed, to an unreal day, or to nothing', async () => {
    const w = world(ME, { canMove: true });
    expect(await moveTaskDate(w.task.id, '2026-10-28', deps)).toEqual({ ok: false, error: DATE_PAST });
    expect(await moveTaskDate(w.task.id, '2026-02-30', deps)).toMatchObject({ ok: false });
    expect(await moveTaskDate(w.task.id, '', deps)).toMatchObject({ ok: false });
    expect(await moveTaskDate(w.task.id, '2026-10-30', deps)).toEqual({ ok: true, data: { changed: 0 } });
    expect(writes()).toEqual([]);
    expect(w.task.due_date).toBe('2026-10-30');
  });

  it('is read in the person’s own days: just after midnight in Los Angeles, yesterday has passed', async () => {
    const w = world(ME, { canMove: true });
    const lateNight = Date.UTC(2026, 9, 29, 8, 30, 0); // 01:30 on the 29th in Los Angeles; in UTC it is the 29th too
    expect(await moveTaskDate(w.task.id, '2026-10-28', { now: () => lateNight })).toEqual({ ok: false, error: DATE_PAST });
    expect(await moveTaskDate(w.task.id, '2026-10-29', { now: () => lateNight })).toEqual({ ok: true, data: { changed: 1 } });
  });

  it("is never another person's task, even with row level security off, and never a finished one", async () => {
    world(ME);
    const theirs = world(OTHER, { canMove: true });
    gm.rls = false;
    expect(await moveTaskDate(theirs.task.id, '2026-11-05', deps)).toEqual({ ok: false, error: NOT_YOUR_TASK });
    expect(theirs.task.due_date).toBe('2026-10-30');

    resetGoalModel({ id: ME });
    const done = world(ME, { canMove: true, completedAt: '2026-10-28T10:00:00.000Z' });
    expect(await moveTaskDate(done.task.id, '2026-11-05', deps)).toEqual({ ok: false, error: TASK_FINISHED });
  });

  it("leaves its target's own date alone (owner decision, 2026-11-01)", async () => {
    const w = world(ME, { canMove: true });
    const deadlineTarget = add('targets', { id: newId(), user_id: ME, goal_id: w.goal.id, title: 'Portfolio ready', measure: 'checklist', unit: null, role: 'effort', period_kind: 'deadline', due_date: '2026-10-30', slot_weekdays: null, floor: null, aspiration: null, qualifying_threshold: null, carry_over_kind: 'cumulative', created_at: '2026-10-05T00:00:02.000Z' });
    w.task.target_id = deadlineTarget.id;
    await moveTaskDate(w.task.id, '2026-11-12', deps);
    expect(w.task.due_date).toBe('2026-11-12');
    expect(deadlineTarget.due_date).toBe('2026-10-30');
    expect(writes()).toEqual(['work_items update']);
  });
});

describe("a deadline task's steps", () => {
  it('a new step goes at the end, trimmed, as the person wrote it', async () => {
    const w = world(ME);
    w.step('Write the letter', 0);
    w.step('Send it', 1);
    expect(await addTaskStep(w.task.id, '  Get a reference  ', deps)).toEqual({ ok: true, data: { changed: 1 } });
    const steps = mine('work_item_steps').sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
    expect(steps.map((s) => [s.title, s.sort_order])).toEqual([
      ['Write the letter', 0],
      ['Send it', 1],
      ['Get a reference', 2],
    ]);
    expect(steps[2]).toMatchObject({ user_id: ME, work_item_id: w.task.id });
    // A new step is not ticked: a tick is an entry, and nothing here makes one.
    expect(steps[2].completed_at ?? null).toBeNull();
    expect(gm.tables.entries.filter((e) => e.source_record_id === steps[2].id)).toHaveLength(0);
  });

  it('the first step of a task with none is first', async () => {
    const w = world(ME);
    await addTaskStep(w.task.id, 'Start', deps);
    expect(mine('work_item_steps')).toHaveLength(1);
    expect(mine('work_item_steps')[0].sort_order).toBe(0);
  });

  it('is never guessed, and is added only to my own unfinished deadline task', async () => {
    const w = world(ME);
    expect(await addTaskStep(w.task.id, '   ', deps)).toEqual({ ok: false, error: STEP_MISSING });
    expect(await addTaskStep('nope', 'A step', deps)).toEqual({ ok: false, error: NOT_YOUR_TASK });
    expect(writes()).toEqual([]);

    resetGoalModel({ id: ME });
    world(ME);
    const theirs = world(OTHER);
    gm.rls = false;
    expect(await addTaskStep(theirs.task.id, 'Sneaky', deps)).toEqual({ ok: false, error: NOT_YOUR_TASK });
    expect(gm.tables.work_item_steps).toHaveLength(0);

    resetGoalModel({ id: ME });
    const done = world(ME, { completedAt: '2026-10-28T10:00:00.000Z' });
    expect(await addTaskStep(done.task.id, 'More', deps)).toEqual({ ok: false, error: TASK_FINISHED });
  });

  it('a step that is not ticked can be renamed and removed', async () => {
    const w = world(ME);
    const a = w.step('Write the letter', 0);
    const b = w.step('Send it', 1);
    expect(await renameTaskStep(a.id, '  Draft the letter ', deps)).toEqual({ ok: true, data: { changed: 1 } });
    expect(a.title).toBe('Draft the letter');
    expect(await removeTaskStep(b.id, deps)).toEqual({ ok: true, data: { changed: 1 } });
    expect(mine('work_item_steps').map((s) => s.title)).toEqual(['Draft the letter']);
  });

  it('a rename to nothing is asked for in its own words, and changes nothing', async () => {
    const w = world(ME);
    const a = w.step('Write the letter', 0);
    expect(await renameTaskStep(a.id, '   ', deps)).toEqual({ ok: false, error: 'Write the new name first.' });
    expect(await addTaskStep(w.task.id, '   ', deps)).toEqual({ ok: false, error: STEP_MISSING });
    expect(a.title).toBe('Write the letter');
    expect(writes()).toEqual([]);
  });

  it('a ticked step is never renamed or removed: its tick is keyed to the step', async () => {
    const w = world(ME);
    const a = w.step('Write the letter', 0);
    w.step('Send it', 1);
    w.tick(a.id);
    expect(await renameTaskStep(a.id, 'Changed', deps)).toEqual({ ok: false, error: STEP_TICKED });
    expect(await removeTaskStep(a.id, deps)).toEqual({ ok: false, error: STEP_TICKED });
    expect(a.title).toBe('Write the letter');
    expect(mine('work_item_steps')).toHaveLength(2);
    expect(writes()).toEqual([]);
  });

  it('a tick the person hid does not count as ticked', async () => {
    const w = world(ME);
    const a = w.step('Write the letter', 0);
    w.step('Send it', 1);
    w.tick(a.id);
    add('entry_corrections', { id: newId(), user_id: ME, source_id: w.source.id, source_record_id: a.id, action: 'hide' });
    expect(await renameTaskStep(a.id, 'Draft the letter', deps)).toEqual({ ok: true, data: { changed: 1 } });
  });

  it('is never another person’s step, a milestone’s step or a finished task’s step', async () => {
    const w = world(ME);
    w.step('Mine', 0);
    const theirs = world(OTHER);
    const theirStep = theirs.step('Theirs', 0);
    gm.rls = false;
    expect(await renameTaskStep(theirStep.id, 'Hijacked', deps)).toEqual({ ok: false, error: NOT_YOUR_STEP });
    expect(await removeTaskStep(theirStep.id, deps)).toEqual({ ok: false, error: NOT_YOUR_STEP });
    expect(theirStep.title).toBe('Theirs');

    resetGoalModel({ id: ME });
    const milestone = world(ME, { kind: 'milestone', estimateMinutes: null });
    const milestoneStep = milestone.step('A step', 0);
    expect(await renameTaskStep(milestoneStep.id, 'Changed', deps)).toEqual({ ok: false, error: NOT_YOUR_STEP });
    expect(await removeTaskStep(milestoneStep.id, deps)).toEqual({ ok: false, error: NOT_YOUR_STEP });

    resetGoalModel({ id: ME });
    const done = world(ME, { completedAt: '2026-10-28T10:00:00.000Z' });
    const doneStep = done.step('Last step', 0);
    expect(await removeTaskStep(doneStep.id, deps)).toEqual({ ok: false, error: TASK_FINISHED });
    expect(await removeTaskStep('nope', deps)).toEqual({ ok: false, error: NOT_YOUR_STEP });
  });

  it('a task whose every step is ticked is finished, and is not edited', async () => {
    const w = world(ME);
    const a = w.step('Only step', 0);
    w.tick(a.id);
    const view = await getTaskEdit(w.task.id, deps);
    expect(view.ok && view.data.finished).toBe(true);
    expect(await addTaskStep(w.task.id, 'One more', deps)).toEqual({ ok: false, error: TASK_FINISHED });
    expect(await setTaskSize(w.task.id, '3', deps)).toEqual({ ok: false, error: TASK_FINISHED });
    expect(await moveTaskDate(w.task.id, '2026-11-05', deps)).toEqual({ ok: false, error: TASK_FINISHED });
  });
});

describe('what the edit screen reads', () => {
  it('is the task as the person has it, with each step ticked or not, and the size in hours', async () => {
    const w = world(ME, { canMove: false, estimateMinutes: 150 });
    const a = w.step('Write the letter', 0);
    w.step('Send it', 1);
    w.tick(a.id);
    const r = await getTaskEdit(w.task.id, deps);
    expect(r).toEqual({
      ok: true,
      data: {
        id: w.task.id,
        title: 'Send the application',
        goalTitle: 'Land the new role',
        today: TODAY,
        dueOn: '2026-10-30',
        dateCanMove: false,
        estimateHours: 2.5,
        finished: false,
        steps: [
          { id: a.id, title: 'Write the letter', done: true },
          { id: expect.any(String), title: 'Send it', done: false },
        ],
      },
    });
  });

  it('has no size when the person has not given one, and never reads another person’s task', async () => {
    const w = world(ME, { estimateMinutes: null });
    const view = await getTaskEdit(w.task.id, deps);
    expect(view.ok && view.data.estimateHours).toBeNull();
    const theirs = world(OTHER);
    gm.rls = false;
    expect(await getTaskEdit(theirs.task.id, deps)).toEqual({ ok: false, error: NOT_YOUR_TASK });
    expect(await getTaskEdit('nope', deps)).toEqual({ ok: false, error: NOT_YOUR_TASK });
  });

  it('says to set the time zone first when the days are not known, and writes nothing', async () => {
    const w = world(ME);
    gm.tables.person_settings[0].time_zone = null;
    const r = await getTaskEdit(w.task.id, deps);
    expect(r.ok).toBe(false);
    expect(await setTaskSize(w.task.id, '2', deps)).toMatchObject({ ok: false });
    expect(writes()).toEqual([]);
  });

  it('is an error when signed out', async () => {
    gm.user = null;
    expect(await getDayKindTimes()).toMatchObject({ ok: false });
    expect(await setTaskSize(newId(), '2', deps)).toMatchObject({ ok: false });
  });
});

describe('home shows the new forecast, and no closed week moves', () => {
  it('starts short: twenty hours against two three-hour days, and the date can move', async () => {
    const w = world(ME);
    expect(await forecastOf(w.task.id)).toMatchObject({ state: 'does_not_fit', options: expect.arrayContaining(['smaller_scope', 'move_date']) });
  });

  it('a longer usual time for the kind of day changes the verdict', async () => {
    const w = world(ME);
    await setDayKindTime(w.work.id, 'hours', '12');
    expect(await forecastOf(w.task.id)).toEqual({ state: 'tight' });
    await setDayKindTime(w.work.id, 'hours', '20');
    expect(await forecastOf(w.task.id)).toEqual({ state: 'fits', soFar: false });
  });

  it('a kind with no usual time is said so, and giving it one clears that', async () => {
    const w = world(ME);
    for (const day of ['2026-10-29', '2026-10-30']) gm.tables.week_plan_day_types.find((k) => k.plan_date === day)!.day_type_id = w.rest.id;
    expect(await forecastOf(w.task.id)).toMatchObject({ state: 'kind_without_time', kindName: 'Rest day', kindId: w.rest.id });
    await setDayKindTime(w.rest.id, 'hours', '20');
    expect(await forecastOf(w.task.id)).toMatchObject({ state: 'fits' });
  });

  it('a smaller size changes the verdict, and a task with no size says there is not enough to say', async () => {
    const w = world(ME);
    await setTaskSize(w.task.id, '2', deps);
    expect(await forecastOf(w.task.id)).toEqual({ state: 'fits', soFar: false });

    resetGoalModel({ id: ME });
    const none = world(ME, { estimateMinutes: null });
    expect(await forecastOf(none.task.id)).toEqual({ state: 'not_enough_data' });
    await setTaskSize(none.task.id, '2', deps);
    expect(await forecastOf(none.task.id)).toEqual({ state: 'fits', soFar: false });
  });

  it('a later date changes the verdict: the days set aside so far are not yet the whole story', async () => {
    const w = world(ME, { canMove: true });
    await moveTaskDate(w.task.id, '2026-11-12', deps);
    expect(await forecastOf(w.task.id)).toEqual({ state: 'planned_so_far', days: 2, through: '2026-10-30' });
    const milestone = (await homeOf()).goals[0].milestones.find((m) => m.id === w.task.id)!;
    expect(milestone.dueOn).toBe('2026-11-12');
    expect(milestone.dateCanMove).toBe(true);
  });

  it('a date that cannot move does not change on home whatever is sent', async () => {
    const w = world(ME, { canMove: false });
    await moveTaskDate(w.task.id, '2026-11-12', deps);
    const milestone = (await homeOf()).goals[0].milestones.find((m) => m.id === w.task.id)!;
    expect(milestone.dueOn).toBe('2026-10-30');
    expect(milestone.dateCanMove).toBe(false);
  });

  it('adding a step to a task changes its steps on home, and nothing about a closed week', async () => {
    const w = world(ME);
    w.step('Write the letter', 0);
    await addTaskStep(w.task.id, 'Send it', deps);
    const milestone = (await homeOf()).goals[0].milestones.find((m) => m.id === w.task.id)!;
    expect(milestone.steps.map((s) => s.title)).toEqual(['Write the letter', 'Send it']);
    expect(milestone.stepsDone).toBe(0);
  });

  it('every edit leaves the weekly target and its closed weeks exactly as they were', async () => {
    const w = world(ME, { canMove: true });
    w.step('Write the letter', 0);
    const before = JSON.stringify((await homeOf()).goals[0].targets);
    const snapshotsBefore = structuredClone(gm.tables.period_snapshots);
    const targetsBefore = structuredClone(gm.tables.targets);
    const entriesBefore = structuredClone(gm.tables.entries);

    await setDayKindTime(w.work.id, 'hours', '1');
    await setTaskSize(w.task.id, '9', deps);
    await moveTaskDate(w.task.id, '2026-12-24', deps);
    await addTaskStep(w.task.id, 'One more', deps);
    await renameTaskStep(mine('work_item_steps')[0].id, 'Renamed', deps);
    await removeTaskStep(mine('work_item_steps')[1].id, deps);

    expect(JSON.stringify((await homeOf()).goals[0].targets)).toBe(before);
    expect(gm.tables.period_snapshots).toEqual(snapshotsBefore);
    expect(gm.tables.targets).toEqual(targetsBefore);
    expect(gm.tables.entries).toEqual(entriesBefore);
    // Only the three tables the person edits were written to.
    expect([...new Set(gm.writes.map((x) => x.table))].sort()).toEqual(['person_day_types', 'work_item_steps', 'work_items']);
  });
});

describe('a failure', () => {
  it('is a plain message with no database text, and only the code is logged', async () => {
    const w = world(ME);
    gm.failNextWrite = { table: 'work_items', message: 'duplicate key value violates "Send the application"' };
    const result = await setTaskSize(w.task.id, '2', deps);
    expect(result).toEqual({ ok: false, error: SAVE_FAILED });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('Send the application');
    expect(consoleError).toHaveBeenCalledWith('[forecast-edits] could not save', { what: 'task-size', code: 'XX000' });
  });

  it('a read that fails is an error, never a screen built from part of the rows', async () => {
    const w = world(ME);
    gm.failNextRead = { table: 'work_item_steps', message: 'boom' };
    const r = await getTaskEdit(w.task.id, deps);
    expect(r).toEqual({ ok: false, error: 'Could not load that.' });
  });
});

describe('the SQL these edits rely on', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '013_goal_model_tables.sql'), 'utf8').replace(/--.*$/gm, '');

  it('already lets a person update their own day types, items and steps, so no migration is needed', () => {
    expect(sql).toContain('grant select, insert, update, delete on table public.person_day_types to authenticated;');
    expect(sql).toContain('grant select, insert, update, delete on table public.work_items to authenticated;');
    expect(sql).toContain('grant select, insert, update, delete on table public.work_item_steps to authenticated;');
    for (const policy of ['person_day_types_update_own', 'work_items_update_own', 'work_item_steps_insert_own', 'work_item_steps_update_own', 'work_item_steps_delete_own']) {
      expect(sql).toMatch(new RegExp(`create policy "${policy}"`));
    }
  });
});
