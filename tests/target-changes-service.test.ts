// The review's edit of a target's numbers (lib/services/targetChanges.ts, migration 020, MOM-146), run against the in-memory goal
// model fake (tests/helpers/fakeEntriesModel.ts), which mirrors 020: select and insert only, the CHECKs, the same-person key and the
// trigger that sets created_at. What these pin:
// - a change is a new row that starts with the period right after the reviewed one (never before the period the person is in), and nothing else is written: the target's own
//   row, every closed week's grade and the stored reviews stay exactly as they were,
// - the numbers are validated again on the server, with the form's own words, and a bad request writes nothing,
// - one person never changes another's target, and a deadline or checklist target is not changed here,
// - a second save for the same day replaces the first (the newest wins), and the review and home read the newest,
// - a failure is a plain message with no database text.
// Dates are from October 2026 (2026-10-05 is a Monday); case B is Monday 10-26 reviewing 10-19..10-25, case A is Sunday 10-25.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHANGE_NOT_READ, CHANGE_PROBLEMS, CHANGE_SAVE_FAILED } from '@/lib/review/targetChange';
import { getWeeklyReviewFacts } from '@/lib/services/review';
import { saveTargetChange } from '@/lib/services/targetChanges';
import { ME, OTHER, add, gm, resetGoalModel } from './helpers/fakeEntriesModel';
import { CASE_A_NOW, CASE_B_NOW, settingsRow, world } from './helpers/reviewWorld';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeEntriesModel');
  return { createSupabaseServerClient };
});

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetGoalModel({ id: ME });
  gm.dbNow = new Date(CASE_B_NOW).toISOString();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

// The week of 10-05 met its floor of 3, the two weeks after missed it: the review of 10-19..10-25 raises the slipping check-in.
function slippingPerson(userId = ME) {
  const mine = world(userId, userId === ME ? 'My' : 'Their');
  mine.log('2026-10-05', 3);
  mine.log('2026-10-12');
  mine.log('2026-10-19');
  add('person_settings', settingsRow(userId, { planning_weekday: 1 }));
  return mine;
}

const send = (targetId: unknown, over: Record<string, unknown> = {}) =>
  saveTargetChange({ targetId, floor: '4', aspiration: '6', days: null, ...over }, { now: () => CASE_B_NOW });
const changes = () => gm.tables.target_changes;
const writes = () => gm.writes.map((w) => `${w.table} ${w.op}`);

describe('saving a change', () => {
  it('adds one row that starts the day after the reviewed week, and writes nothing else', async () => {
    const mine = slippingPerson();
    const targetBefore = structuredClone(mine.target);
    const result = await send(mine.target.id);
    expect(result).toEqual({ ok: true, data: { targetId: mine.target.id, effectiveFrom: '2026-10-26', floor: 4, aspiration: 6, days: null } });
    expect(changes()).toHaveLength(1);
    expect(changes()[0]).toMatchObject({ user_id: ME, target_id: mine.target.id, effective_from: '2026-10-26', floor: 4, aspiration: 6, slot_weekdays: null });
    expect(writes()).toEqual(['target_changes insert']);
    // The target keeps what setup saved: the new numbers live only in the new row.
    expect(gm.tables.targets[0]).toEqual(targetBefore);
  });

  it('starts tomorrow when the planning day is the week\'s own last day', async () => {
    const mine = slippingPerson();
    gm.tables.person_settings[0] = { ...gm.tables.person_settings[0], planning_weekday: 7 };
    const result = await saveTargetChange({ targetId: mine.target.id, floor: '4', aspiration: '', days: null }, { now: () => CASE_A_NOW });
    expect(result).toMatchObject({ ok: true, data: { effectiveFrom: '2026-10-26', floor: 4, aspiration: null } });
  });

  it('starts after the target\'s own first week when its goal has not started yet', async () => {
    const mine = slippingPerson();
    gm.tables.goals[0] = { ...gm.tables.goals[0], start_date: '2026-11-04' };
    const result = await send(mine.target.id);
    expect(result).toMatchObject({ ok: true, data: { effectiveFrom: '2026-11-09' } });
  });

  it('starts with the week the person is in when no review is due (a late save): a closed week is never reached back into', async () => {
    const mine = slippingPerson();
    // Thursday 10-29 is not the planning day, so the last closed week (10-19..10-25) stands in for the reviewed one: the week of the 26th.
    const wed = await saveTargetChange({ targetId: mine.target.id, floor: '4', aspiration: '', days: null }, { now: () => Date.UTC(2026, 9, 29, 19, 0, 0) });
    expect(wed).toMatchObject({ ok: true, data: { effectiveFrom: '2026-10-26' } });
    // Two weeks on, Thursday 11-12: the week in progress began Monday 11-09, and that is where the change starts.
    const late = await saveTargetChange({ targetId: mine.target.id, floor: '4', aspiration: '', days: null }, { now: () => Date.UTC(2026, 10, 12, 20, 0, 0) });
    expect(late).toMatchObject({ ok: true, data: { effectiveFrom: '2026-11-09' } });
  });

  it('takes no day, no user and no date from the request: a week start of Sunday moves the start to a Sunday', async () => {
    const mine = slippingPerson();
    gm.tables.person_settings[0] = { ...gm.tables.person_settings[0], week_start: 7 };
    const result = await send(mine.target.id);
    expect(result).toMatchObject({ ok: true, data: { effectiveFrom: '2026-10-25' } });
    const forged = await saveTargetChange({ targetId: mine.target.id, floor: '4', aspiration: '', days: null, userId: OTHER, effectiveFrom: '2020-01-01' }, { now: () => CASE_B_NOW });
    expect(forged.ok).toBe(true);
    expect(changes().at(-1)).toMatchObject({ user_id: ME, effective_from: '2026-10-25' });
  });

  it('keeps a decimal for a quantity and refuses one for a count', async () => {
    const mine = slippingPerson();
    expect(await send(mine.target.id, { floor: '2.5' })).toEqual({ ok: false, error: CHANGE_PROBLEMS.floorWhole });
    gm.tables.targets[0] = { ...gm.tables.targets[0], measure: 'quantity', unit: 'km' };
    expect(await send(mine.target.id, { floor: '2.5', aspiration: '7.5' })).toMatchObject({ ok: true, data: { floor: 2.5, aspiration: 7.5 } });
  });

  it('stores a day-slots target\'s days, in order and once each, and needs at least one', async () => {
    const mine = slippingPerson();
    gm.tables.targets[0] = { ...gm.tables.targets[0], period_kind: 'day_slots', slot_weekdays: [1, 3, 5], floor: 2, aspiration: null };
    expect(await send(mine.target.id, { floor: '2', aspiration: '', days: [5, 2, 2, 4] })).toMatchObject({ ok: true, data: { days: [2, 4, 5] } });
    expect(changes()[0].slot_weekdays).toEqual([2, 4, 5]);
    for (const days of [[], null, [0, 8]]) {
      expect(await send(mine.target.id, { floor: '2', aspiration: '', days })).toEqual({ ok: false, error: CHANGE_PROBLEMS.days });
    }
    expect(changes()).toHaveLength(1);
  });

  it('ignores days sent for a weekly target', async () => {
    const mine = slippingPerson();
    expect(await send(mine.target.id, { days: [1, 2] })).toMatchObject({ ok: true, data: { days: null } });
    expect(changes()[0].slot_weekdays).toBeNull();
  });
});

describe('validating again on the server', () => {
  it.each([
    [{ floor: '' }, CHANGE_PROBLEMS.floor],
    [{ floor: '0' }, CHANGE_PROBLEMS.floor],
    [{ floor: '-3' }, CHANGE_PROBLEMS.floor],
    [{ floor: '1e3' }, CHANGE_PROBLEMS.floor],
    [{ floor: '3 workouts' }, CHANGE_PROBLEMS.floor],
    [{ floor: '2.5' }, CHANGE_PROBLEMS.floorWhole],
    [{ aspiration: 'lots' }, CHANGE_PROBLEMS.aspiration],
    [{ aspiration: '0' }, CHANGE_PROBLEMS.aspiration],
    [{ aspiration: '5.5' }, CHANGE_PROBLEMS.aspirationWhole],
    [{ floor: '5', aspiration: '4' }, CHANGE_PROBLEMS.aspirationBelow],
  ])('refuses %j in the form\'s own words and writes nothing', async (over, message) => {
    const mine = slippingPerson();
    expect(await send(mine.target.id, over)).toEqual({ ok: false, error: message });
    expect(changes()).toHaveLength(0);
    expect(gm.writes).toHaveLength(0);
  });

  it('accepts a number hoped for that equals the one that still counts', async () => {
    const mine = slippingPerson();
    expect(await send(mine.target.id, { floor: '4', aspiration: '4' })).toMatchObject({ ok: true });
  });

  it.each([
    [{ targetId: 'not-an-id' }],
    [{ floor: 4 }],
    [{ aspiration: null }],
    [{ days: 'mon' }],
    [{ floor: '4'.repeat(40) }],
  ])('refuses a request that is not the right shape, %j, without looking anything up', async (over) => {
    const mine = slippingPerson();
    expect(await saveTargetChange({ targetId: mine.target.id, floor: '4', aspiration: '6', days: null, ...over })).toEqual({ ok: false, error: CHANGE_NOT_READ });
    expect(await saveTargetChange(null)).toEqual({ ok: false, error: CHANGE_NOT_READ });
    expect(changes()).toHaveLength(0);
  });
});

describe('whose target, and which targets', () => {
  it('never changes another person\'s target, whether row level security is on or the service has to filter by user id itself', async () => {
    const theirs = slippingPerson(OTHER);
    expect(await send(theirs.target.id)).toEqual({ ok: false, error: "That target couldn't be found. Nothing was changed." });
    gm.rls = false;
    expect(await send(theirs.target.id)).toEqual({ ok: false, error: "That target couldn't be found. Nothing was changed." });
    expect(changes()).toHaveLength(0);
  });

  it('says nothing was changed for a target that does not exist', async () => {
    slippingPerson();
    expect(await send('99999999-9999-4999-8999-999999999999')).toEqual({ ok: false, error: "That target couldn't be found. Nothing was changed." });
  });

  it.each([
    ['a deadline target', { period_kind: 'deadline', due_date: '2026-12-01' }],
    ['a checklist target', { measure: 'checklist' }],
    ['a target with no numbers', { floor: null, aspiration: null, role: 'outcome' }],
  ])('does not change %s here', async (_name, over) => {
    const mine = slippingPerson();
    gm.tables.targets[0] = { ...gm.tables.targets[0], ...over };
    expect(await send(mine.target.id)).toEqual({ ok: false, error: "That target can't be changed here. Nothing was changed." });
    expect(changes()).toHaveLength(0);
  });

  it('does not change a target of a parked goal', async () => {
    const mine = slippingPerson();
    gm.tables.goals[0] = { ...gm.tables.goals[0], state: 'parked' };
    expect(await send(mine.target.id)).toEqual({ ok: false, error: "That target can't be changed here. Nothing was changed." });
  });

  it('asks for the week start first, and guesses none', async () => {
    const mine = slippingPerson();
    gm.tables.person_settings[0] = { ...gm.tables.person_settings[0], week_start: null };
    expect(await send(mine.target.id)).toEqual({ ok: false, error: 'Set the day your week starts in settings first. Nothing was changed.' });
    expect(changes()).toHaveLength(0);
  });

  it('needs a signed-in person', async () => {
    const mine = slippingPerson();
    gm.user = null;
    expect(await send(mine.target.id)).toEqual({ ok: false, error: 'Sign in to change a target.' });
  });
});

describe('when the database fails', () => {
  it('says nothing was changed with no database text, and logs the code only', async () => {
    const mine = slippingPerson();
    gm.failNextWrite = { table: 'target_changes', message: 'duplicate key value violates "Workouts" row' };
    expect(await send(mine.target.id)).toEqual({ ok: false, error: CHANGE_SAVE_FAILED });
    expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(/Workouts|duplicate key/);
    expect(changes()).toHaveLength(0);
  });

  it('says the same when the target cannot be read', async () => {
    const mine = slippingPerson();
    gm.failNextRead = { table: 'targets', message: 'connection refused to db at 10.0.0.1' };
    const result = await send(mine.target.id);
    expect(result).toEqual({ ok: false, error: CHANGE_SAVE_FAILED });
  });
});

describe('what the review reads after a change (the engine decides, never the form)', () => {
  const ready = async () => {
    const read = await getWeeklyReviewFacts({ now: () => CASE_B_NOW });
    if (!read.ok || read.data.state !== 'ready') throw new Error('not ready');
    return read.data;
  };

  it('offers the edit for the slipping target with what the week came to and when a change would start', async () => {
    const mine = slippingPerson();
    const facts = await ready();
    expect(facts.adjustment).toMatchObject({ kind: 'slipping_check_in', targetId: mine.target.id });
    expect(facts.edit).toEqual({
      targetId: mine.target.id,
      title: 'My workouts',
      measure: 'count',
      unit: null,
      period: 'weekly',
      floor: 3,
      aspiration: 5,
      days: null,
      weekStartsOn: 1,
      lastCounted: 1,
      effectiveFrom: '2026-10-26',
      today: '2026-10-26',
    });
  });

  it('keeps the reviewed week at the numbers it was judged by, and offers the newest numbers to change again', async () => {
    const mine = slippingPerson();
    const before = await ready();
    await send(mine.target.id, { floor: '2', aspiration: '' });
    await send(mine.target.id, { floor: '4', aspiration: '6' });
    const after = await ready();
    // The recap, the engine's facts and the stored shape of the reviewed week are the same as before the change.
    expect(after.recap).toEqual(before.recap);
    expect(after.targets).toEqual(before.targets);
    expect(after.adjustment).toEqual(before.adjustment);
    // The second save for the same day replaced the first.
    expect(after.edit).toMatchObject({ floor: 4, aspiration: 6, effectiveFrom: '2026-10-26' });
    expect(changes()).toHaveLength(2);
  });

  it('never changes a finished review: what was said stays what was said', async () => {
    const mine = slippingPerson();
    add('weekly_reviews', {
      id: 'r1',
      user_id: ME,
      week_start: '2026-10-12',
      week_end: '2026-10-18',
      recap: { v: 1, window: { start: '2026-10-12', end: '2026-10-18' }, closedEarly: false, goals: [], priorities: [] },
      adjustment_kind: null,
      adjustment: null,
      adjustment_outcome: null,
      finished_at: '2026-10-19T19:00:00.000Z',
    });
    const stored = structuredClone(gm.tables.weekly_reviews);
    await send(mine.target.id);
    expect(gm.tables.weekly_reviews).toEqual(stored);
  });

  it('gives no edit where the adjustment names a target the edit does not cover', async () => {
    slippingPerson();
    gm.tables.targets[0] = { ...gm.tables.targets[0], measure: 'checklist' };
    const read = await getWeeklyReviewFacts({ now: () => CASE_B_NOW });
    // A checklist with no steps is not graded, so nothing is offered at all.
    expect(read.ok && read.data.state === 'ready' ? read.data.edit : null).toBeNull();
  });
});
