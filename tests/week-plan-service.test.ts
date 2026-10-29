// The week plan's data access (lib/services/weekPlan.ts, MOM-112 block 2), run against the in-memory goal model fake
// (tests/helpers/fakeEntriesModel.ts), which enforces migration 019's keys, owner-pinned foreign keys, row level security
// and the column-only update. What the rules do with the rows is in tests/week-plan-rows.test.ts; this is the service:
// - it reads and writes as the signed-in person, and never anyone else's rows, even with row level security switched off in
//   the fake (the service filters by their id itself),
// - a pick is the person's own tap: putting a thing on a day, taking it off, saying what kind of day a date is, "Same as last
//   week" and "Use these days" are the only writes, and a plain read writes nothing,
// - a thing of another person, a day that has passed, a date that is not real and a kind that is not theirs are refused with
//   nothing written,
// - no time zone or day end means no plan and no write, and no guess,
// - the week's end moves an unfinished step and never a habit.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NOT_FOUND_ITEM,
  NOT_FOUND_KIND,
  NO_DAYS_YET,
  NO_SET_DAYS,
  SIGNED_OUT,
  clearDayKind,
  copyLastWeeksKinds,
  getHomePlan,
  getWeekPlan,
  planItemOnDay,
  planSetDays,
  removeItemFromDay,
  setDayKind,
} from '@/lib/services/weekPlan';
import { ME, OTHER, add, gm, newId, resetGoalModel } from './helpers/fakeEntriesModel';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeEntriesModel');
  return { createSupabaseServerClient };
});

// Thursday 2026-10-29, noon in Los Angeles. The week starts Monday: 10-26 to 11-01.
const NOW = Date.UTC(2026, 9, 29, 19, 0, 0);
const now = () => NOW;
const deps = { now };

interface World {
  goalId: string;
  habit: string;
  milestone: string;
  steps: string[];
  work: string;
  rest: string;
}

// One person's whole plan: their anchors, a goal, a habit on set days (Monday, Wednesday, Friday), a milestone with two
// steps, and two kinds of days. Every nullable column is written as null, as the database would return it.
function world(userId: string, over: { weekStart?: number | null; timeZone?: string | null; dayEnd?: string | null } = {}): World {
  add('person_settings', {
    user_id: userId,
    time_zone: over.timeZone === undefined ? 'America/Los_Angeles' : over.timeZone,
    week_start: over.weekStart === undefined ? 1 : over.weekStart,
    day_end: over.dayEnd === undefined ? '00:00:00' : over.dayEnd,
  });
  const goalId = newId();
  add('goals', { id: goalId, user_id: userId, title: 'Stay fit', state: 'active', created_at: '2026-10-01T00:00:00.000Z' });
  const slotTarget = newId();
  add('targets', {
    id: slotTarget,
    user_id: userId,
    goal_id: goalId,
    title: 'Run',
    period_kind: 'day_slots',
    slot_weekdays: [1, 3, 5],
    due_date: null,
    created_at: '2026-10-01T00:00:01.000Z',
  });
  const base = { user_id: userId, goal_id: goalId, due_date: null, completed_at: null, created_at: '2026-10-01T00:00:02.000Z' };
  const habit = newId();
  add('work_items', { ...base, id: habit, target_id: slotTarget, kind: 'habit', title: 'Go for a run', sort_order: 0 });
  const milestone = newId();
  add('work_items', { ...base, id: milestone, target_id: null, kind: 'milestone', title: 'Prep checklist', sort_order: 1 });
  const steps = [newId(), newId()];
  steps.forEach((id, i) => add('work_item_steps', { id, user_id: userId, work_item_id: milestone, title: `Step ${i + 1}`, sort_order: i }));
  const work = newId();
  const rest = newId();
  add('person_day_types', { id: work, user_id: userId, name: 'Work day', created_at: '2026-10-01T00:00:01.000Z' });
  add('person_day_types', { id: rest, user_id: userId, name: 'Rest day', created_at: '2026-10-01T00:00:02.000Z' });
  return { goalId, habit, milestone, steps, work, rest };
}

const picks = (userId = ME) => gm.tables.week_plan_picks.filter((r) => r.user_id === userId);
const kinds = (userId = ME) => gm.tables.week_plan_day_types.filter((r) => r.user_id === userId);
const planWrites = () => gm.writes.filter((w) => w.table === 'week_plan_picks' || w.table === 'week_plan_day_types');

async function plan(week: unknown = 0) {
  const r = await getWeekPlan(week, deps);
  if (!r.ok || r.data.state !== 'ready') throw new Error(`no plan: ${JSON.stringify(r)}`);
  return r.data;
}

beforeEach(() => resetGoalModel({ id: ME }));

describe('reading the plan', () => {
  it('shows the person\'s own week and writes nothing', async () => {
    const mine = world(ME);
    const p = await plan();
    expect(p.today).toBe('2026-10-29');
    expect(p.days.map((d) => d.date)[0]).toBe('2026-10-26');
    expect(p.items.map((i) => i.id)).toEqual([mine.habit, mine.milestone]);
    expect(p.dayKinds.map((k) => k.name)).toEqual(['Work day', 'Rest day']);
    // Nothing is on a day and no day has a kind until the person says.
    for (const d of p.days) expect([d.itemIds, d.dayTypeId]).toEqual([[], null]);
    expect(planWrites()).toEqual([]);
  });

  it('returns only their own rows, even with row level security switched off, because it filters by their id itself', async () => {
    world(ME);
    const theirs = world(OTHER);
    add('week_plan_picks', { id: newId(), user_id: OTHER, work_item_id: theirs.milestone, plan_date: '2026-10-30' });
    add('week_plan_day_types', { id: newId(), user_id: OTHER, plan_date: '2026-10-30', day_type_id: theirs.work });
    gm.rls = false;
    const p = await plan();
    expect(p.items.map((i) => i.id)).not.toContain(theirs.milestone);
    expect(p.items).toHaveLength(2);
    for (const d of p.days) expect([d.itemIds, d.dayTypeId]).toEqual([[], null]);
    const card = await getHomePlan(deps);
    expect(card.ok && card.data).toMatchObject({ state: 'ready', todayItems: [], plannedLater: false });
  });

  it('answers that the person is signed out, and reads nothing', async () => {
    world(ME);
    gm.user = null;
    expect(await getWeekPlan(0, deps)).toEqual({ ok: false, error: SIGNED_OUT });
    expect(await getHomePlan(deps)).toEqual({ ok: false, error: SIGNED_OUT });
  });

  it('is an error result when a read fails, never a plan built from part of the rows', async () => {
    world(ME);
    gm.failNextRead = { table: 'work_items', message: 'down' };
    expect(await getWeekPlan(0, deps)).toEqual({ ok: false, error: 'Could not load your plan.' });
  });

  it('steps forward a week when asked, and treats a week it does not understand as this week', async () => {
    world(ME);
    expect((await plan(1)).start).toBe('2026-11-02');
    expect((await plan('1')).start).toBe('2026-11-02');
    for (const bad of [-3, 'x', 99, '2.5', undefined]) expect((await plan(bad)).start, String(bad)).toBe('2026-10-26');
  });
});

describe('no time zone, no day end: no plan and no guess', () => {
  it('builds no plan and no card, and refuses every write with nothing written', async () => {
    const mine = world(ME, { timeZone: null });
    expect(await getWeekPlan(0, deps)).toEqual({ ok: true, data: { state: 'needs_day_anchors', anchor: 'time_zone', reason: 'not_set' } });
    expect(await getHomePlan(deps)).toEqual({ ok: true, data: { state: 'none' } });
    for (const result of [
      await planItemOnDay(mine.habit, '2026-10-30', deps),
      await removeItemFromDay(mine.habit, '2026-10-30', deps),
      await setDayKind('2026-10-30', mine.work, deps),
      await clearDayKind('2026-10-30', deps),
      await copyLastWeeksKinds(0, deps),
      await planSetDays(mine.habit, 0, deps),
    ]) {
      expect(result).toEqual({ ok: false, error: NO_DAYS_YET });
    }
    expect(planWrites()).toEqual([]);
  });

  it('names the day end when that is what is missing', async () => {
    world(ME, { dayEnd: null });
    expect(await getWeekPlan(0, deps)).toMatchObject({ ok: true, data: { state: 'needs_day_anchors', anchor: 'day_end' } });
  });

  it('with no week start still plans the next 14 dates, and says nothing about weeks or moved work', async () => {
    const mine = world(ME, { weekStart: null });
    add('week_plan_picks', { id: newId(), user_id: ME, work_item_id: mine.milestone, plan_date: '2026-10-21' });
    const p = await plan();
    expect(p).toMatchObject({ window: 'next_14_days', start: '2026-10-29', hasNext: false, hasPrevious: false });
    expect(p.days).toHaveLength(14);
    expect(p.items.every((i) => !i.movedFromLastWeek)).toBe(true);
    expect(await planItemOnDay(mine.habit, '2026-11-05', deps)).toEqual({ ok: true, data: { changed: 1 } });
  });
});

describe('putting a thing on a day, and taking it off', () => {
  it('writes one row in the person\'s own name for the day they chose, and nothing else', async () => {
    const mine = world(ME);
    expect(await planItemOnDay(mine.milestone, '2026-10-30', deps)).toEqual({ ok: true, data: { changed: 1 } });
    expect(picks()).toHaveLength(1);
    expect(picks()[0]).toMatchObject({ user_id: ME, work_item_id: mine.milestone, plan_date: '2026-10-30' });
    expect(Object.keys(picks()[0]).sort()).toEqual(['created_at', 'id', 'plan_date', 'updated_at', 'user_id', 'work_item_id']);
    expect(gm.writes).toEqual([{ table: 'week_plan_picks', op: 'insert' }]);
    const p = await plan();
    expect(p.days.filter((d) => d.itemIds.length > 0).map((d) => d.date)).toEqual(['2026-10-30']);
  });

  it('allows today, any number of days for one thing and any number of things on one day', async () => {
    const mine = world(ME);
    for (const date of ['2026-10-29', '2026-10-30', '2026-11-04']) expect((await planItemOnDay(mine.milestone, date, deps)).ok).toBe(true);
    expect((await planItemOnDay(mine.habit, '2026-10-30', deps)).ok).toBe(true);
    expect(picks()).toHaveLength(4);
  });

  it('is fine to do twice: the second time changes nothing', async () => {
    const mine = world(ME);
    await planItemOnDay(mine.milestone, '2026-10-30', deps);
    expect(await planItemOnDay(mine.milestone, '2026-10-30', deps)).toEqual({ ok: true, data: { changed: 0 } });
    expect(picks()).toHaveLength(1);
  });

  it('takes it off with one tap, and a thing that is not there changes nothing', async () => {
    const mine = world(ME);
    await planItemOnDay(mine.milestone, '2026-10-30', deps);
    expect(await removeItemFromDay(mine.milestone, '2026-10-30', deps)).toEqual({ ok: true, data: { changed: 1 } });
    expect(picks()).toHaveLength(0);
    expect(await removeItemFromDay(mine.milestone, '2026-10-30', deps)).toEqual({ ok: true, data: { changed: 0 } });
  });

  it('refuses a thing that is another person\'s, with nothing written', async () => {
    world(ME);
    const theirs = world(OTHER);
    expect(await planItemOnDay(theirs.milestone, '2026-10-30', deps)).toEqual({ ok: false, error: NOT_FOUND_ITEM });
    // Even with row level security off, the key that pins a pick to its owner's own item refuses it.
    gm.rls = false;
    expect(await planItemOnDay(theirs.milestone, '2026-10-30', deps)).toEqual({ ok: false, error: NOT_FOUND_ITEM });
    expect(planWrites()).toEqual([]);
  });

  it('cannot take off another person\'s pick', async () => {
    world(ME);
    const theirs = world(OTHER);
    add('week_plan_picks', { id: newId(), user_id: OTHER, work_item_id: theirs.milestone, plan_date: '2026-10-30' });
    expect(await removeItemFromDay(theirs.milestone, '2026-10-30', deps)).toEqual({ ok: true, data: { changed: 0 } });
    expect(picks(OTHER)).toHaveLength(1);
  });

  it('refuses a day that has passed, a date that is not real, a date too far ahead and an id that is not an id', async () => {
    const mine = world(ME);
    add('week_plan_picks', { id: newId(), user_id: ME, work_item_id: mine.milestone, plan_date: '2026-10-27' });
    const before = structuredClone(gm.tables.week_plan_picks);
    const past = "That day has already passed, so it can't be changed. Nothing was changed.";
    expect(await planItemOnDay(mine.milestone, '2026-10-28', deps)).toEqual({ ok: false, error: past });
    expect(await removeItemFromDay(mine.milestone, '2026-10-27', deps)).toEqual({ ok: false, error: past });
    for (const bad of ['2026-02-30', 'tomorrow', '', 5, null, undefined]) {
      expect(await planItemOnDay(mine.milestone, bad, deps), String(bad)).toEqual({ ok: false, error: 'That is not a real day. Nothing was changed.' });
    }
    expect(await planItemOnDay(mine.milestone, '2028-01-01', deps)).toEqual({ ok: false, error: 'That day is too far ahead to plan yet. Nothing was changed.' });
    for (const bad of ['not-an-id', '', 7, null, undefined]) expect(await planItemOnDay(bad, '2026-10-30', deps), String(bad)).toEqual({ ok: false, error: NOT_FOUND_ITEM });
    expect(gm.tables.week_plan_picks).toEqual(before);
    expect(gm.writes).toEqual([]);
  });

  it('reports a database failure in words, and keeps nothing', async () => {
    const mine = world(ME);
    gm.failNextWrite = { table: 'week_plan_picks', message: 'duplicate key value violates unique constraint "secret_detail"' };
    const r = await planItemOnDay(mine.milestone, '2026-10-30', deps);
    expect(r).toEqual({ ok: false, error: 'Could not save that. Nothing was changed.' });
    expect(picks()).toHaveLength(0);
  });
});

describe('saying what kind of day a date is', () => {
  it('writes the kind the person chose for the date, one row a date', async () => {
    const mine = world(ME);
    expect(await setDayKind('2026-10-30', mine.work, deps)).toEqual({ ok: true, data: { changed: 1 } });
    expect(kinds()).toHaveLength(1);
    expect(kinds()[0]).toMatchObject({ user_id: ME, plan_date: '2026-10-30', day_type_id: mine.work });
    expect((await plan()).days.find((d) => d.date === '2026-10-30')?.dayTypeId).toBe(mine.work);
  });

  it('changes the kind by updating only which kind it is, never its date or owner', async () => {
    const mine = world(ME);
    await setDayKind('2026-10-30', mine.work, deps);
    gm.writes = [];
    expect(await setDayKind('2026-10-30', mine.rest, deps)).toEqual({ ok: true, data: { changed: 1 } });
    expect(kinds()).toHaveLength(1);
    expect(kinds()[0]).toMatchObject({ user_id: ME, plan_date: '2026-10-30', day_type_id: mine.rest });
    expect(gm.writes).toEqual([{ table: 'week_plan_day_types', op: 'update' }]);
    // The same kind again changes nothing.
    gm.writes = [];
    expect(await setDayKind('2026-10-30', mine.rest, deps)).toEqual({ ok: true, data: { changed: 0 } });
    expect(gm.writes).toEqual([]);
  });

  it('clears it with one tap, and a date with none changes nothing', async () => {
    const mine = world(ME);
    await setDayKind('2026-10-30', mine.work, deps);
    expect(await clearDayKind('2026-10-30', deps)).toEqual({ ok: true, data: { changed: 1 } });
    expect(kinds()).toHaveLength(0);
    expect(await clearDayKind('2026-10-30', deps)).toEqual({ ok: true, data: { changed: 0 } });
  });

  it('refuses a kind that is not the person\'s own, a day that has passed and a date that is not real', async () => {
    const mine = world(ME);
    const theirs = world(OTHER);
    expect(await setDayKind('2026-10-30', theirs.work, deps)).toEqual({ ok: false, error: NOT_FOUND_KIND });
    gm.rls = false;
    expect(await setDayKind('2026-10-30', theirs.work, deps)).toEqual({ ok: false, error: NOT_FOUND_KIND });
    gm.rls = true;
    expect((await setDayKind('2026-10-28', mine.work, deps)).ok).toBe(false);
    expect((await clearDayKind('2026-10-28', deps)).ok).toBe(false);
    expect((await setDayKind('soon', mine.work, deps)).ok).toBe(false);
    expect(await setDayKind('2026-10-30', 'not-an-id', deps)).toEqual({ ok: false, error: NOT_FOUND_KIND });
    expect(planWrites()).toEqual([]);
  });
});

describe('"Same as last week"', () => {
  it('copies last week\'s kinds only onto dates from today on that have none, and only when the person taps it', async () => {
    const mine = world(ME);
    add('week_plan_day_types', { id: newId(), user_id: ME, plan_date: '2026-10-22', day_type_id: mine.work });
    add('week_plan_day_types', { id: newId(), user_id: ME, plan_date: '2026-10-23', day_type_id: mine.rest });
    add('week_plan_day_types', { id: newId(), user_id: ME, plan_date: '2026-10-19', day_type_id: mine.work });
    add('week_plan_day_types', { id: newId(), user_id: ME, plan_date: '2026-10-31', day_type_id: mine.rest });

    // Reading, even reading the plan with the button on it, copies nothing.
    const before = await plan();
    expect(before.copyableKinds).toBe(2);
    expect(kinds()).toHaveLength(4);
    expect(planWrites()).toEqual([]);

    expect(await copyLastWeeksKinds(0, deps)).toEqual({ ok: true, data: { changed: 2 } });
    const byDate = Object.fromEntries(kinds().map((k) => [k.plan_date, k.day_type_id]));
    // Thursday took Thursday's kind, Friday took Friday's. Monday (passed) took nothing; Saturday kept its own.
    expect(byDate).toMatchObject({ '2026-10-29': mine.work, '2026-10-30': mine.rest, '2026-10-31': mine.rest });
    expect(byDate['2026-10-26']).toBeUndefined();
    expect(kinds()).toHaveLength(6);
    expect((await plan()).copyableKinds).toBe(0);
    // Again: nothing left to copy, nothing written.
    gm.writes = [];
    expect(await copyLastWeeksKinds(0, deps)).toEqual({ ok: true, data: { changed: 0 } });
    expect(gm.writes).toEqual([]);
  });

  it('copies from the week before the week shown, not before the current one', async () => {
    const mine = world(ME);
    add('week_plan_day_types', { id: newId(), user_id: ME, plan_date: '2026-10-27', day_type_id: mine.work });
    expect(await copyLastWeeksKinds(1, deps)).toEqual({ ok: true, data: { changed: 1 } });
    expect(kinds().map((k) => k.plan_date).sort()).toEqual(['2026-10-27', '2026-11-03']);
  });

  it('does not copy another person\'s kinds', async () => {
    world(ME);
    const theirs = world(OTHER);
    add('week_plan_day_types', { id: newId(), user_id: OTHER, plan_date: '2026-10-22', day_type_id: theirs.work });
    gm.rls = false;
    expect(await copyLastWeeksKinds(0, deps)).toEqual({ ok: true, data: { changed: 0 } });
    expect(kinds(ME)).toHaveLength(0);
    expect(kinds(OTHER)).toHaveLength(1);
  });
});

describe('"Use these days" for a habit with set days', () => {
  it('puts the habit on its own named days in the week shown, from today on, and on no other day', async () => {
    const mine = world(ME);
    // Monday, Wednesday and Friday were named; Monday and Wednesday have passed.
    expect(await planSetDays(mine.habit, 0, deps)).toEqual({ ok: true, data: { changed: 1 } });
    expect(picks().map((p) => p.plan_date)).toEqual(['2026-10-30']);
    // The next week has all three.
    expect(await planSetDays(mine.habit, 1, deps)).toEqual({ ok: true, data: { changed: 3 } });
    expect(picks().map((p) => p.plan_date).sort()).toEqual(['2026-10-30', '2026-11-02', '2026-11-04', '2026-11-06']);
    // Already there: nothing more.
    expect(await planSetDays(mine.habit, 1, deps)).toEqual({ ok: true, data: { changed: 0 } });
  });

  it('refuses a thing with no set days, and a thing that is not the person\'s', async () => {
    const mine = world(ME);
    const theirs = world(OTHER);
    expect(await planSetDays(mine.milestone, 0, deps)).toEqual({ ok: false, error: NO_SET_DAYS });
    expect(await planSetDays(theirs.habit, 0, deps)).toEqual({ ok: false, error: NOT_FOUND_ITEM });
    expect(planWrites()).toEqual([]);
  });
});

describe('the week\'s end', () => {
  const lastWeek = '2026-10-21';

  it('moves an unfinished step forward and lists it, and never moves a habit', async () => {
    const mine = world(ME);
    add('week_plan_picks', { id: newId(), user_id: ME, work_item_id: mine.milestone, plan_date: lastWeek });
    add('week_plan_picks', { id: newId(), user_id: ME, work_item_id: mine.habit, plan_date: lastWeek });
    const p = await plan();
    expect(p.items.find((i) => i.id === mine.milestone)?.movedFromLastWeek).toBe(true);
    expect(p.items.find((i) => i.id === mine.habit)?.movedFromLastWeek).toBe(false);
    const card = await getHomePlan(deps);
    expect(card.ok && card.data).toMatchObject({ state: 'ready', moved: [{ id: mine.milestone, title: 'Prep checklist' }] });
    // Moving it is a reading, not a write: it is not put on a day for the person.
    expect(picks()).toHaveLength(2);
    expect(planWrites()).toEqual([]);
  });

  it('stops listing it once the person puts it on a day this week', async () => {
    const mine = world(ME);
    add('week_plan_picks', { id: newId(), user_id: ME, work_item_id: mine.milestone, plan_date: lastWeek });
    await planItemOnDay(mine.milestone, '2026-10-31', deps);
    expect((await plan()).items.find((i) => i.id === mine.milestone)?.movedFromLastWeek).toBe(false);
  });

  it('drops it once every step is ticked, reading the ticks as the home scoreboard does', async () => {
    const mine = world(ME);
    add('week_plan_picks', { id: newId(), user_id: ME, work_item_id: mine.milestone, plan_date: lastWeek });
    const source = { id: newId(), user_id: ME, kind: 'manual', provider: null, label: 'Manual' };
    add('sources', source);
    const target = newId();
    add('targets', { id: target, user_id: ME, goal_id: mine.goalId, title: 'Checklist', period_kind: 'deadline', slot_weekdays: null, due_date: '2026-12-01', created_at: '2026-10-01T00:00:03.000Z' });
    const tick = (stepId: string) =>
      add('entries', { id: newId(), user_id: ME, target_id: target, source_id: source.id, source_record_id: stepId, work_item_id: null, occurred_at: '2026-10-27T19:00:00.000Z', value: 1, evidence: {} });
    tick(mine.steps[0]);
    expect((await plan()).items.map((i) => i.id)).toContain(mine.milestone);
    tick(mine.steps[1]);
    expect((await plan()).items.map((i) => i.id)).not.toContain(mine.milestone);
    // A hidden tick is not a tick.
    add('entry_corrections', { id: newId(), user_id: ME, source_id: source.id, source_record_id: mine.steps[1], action: 'hide' });
    expect((await plan()).items.map((i) => i.id)).toContain(mine.milestone);
  });
});

describe('the card at home', () => {
  it('lists what the person put on today and whether days ahead are planned', async () => {
    const mine = world(ME);
    await planItemOnDay(mine.habit, '2026-10-29', deps);
    await planItemOnDay(mine.milestone, '2026-10-31', deps);
    const card = await getHomePlan(deps);
    expect(card).toEqual({
      ok: true,
      data: { state: 'ready', today: '2026-10-29', todayItems: [{ id: mine.habit, title: 'Go for a run', goalTitle: 'Stay fit' }], plannedLater: true, moved: [] },
    });
  });
});
