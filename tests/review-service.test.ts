// lib/services/review.ts (MOM-113 block 1), run against the in-memory goal model fake
// (tests/helpers/fakeEntriesModel.ts). Dates are from October 2026: 2026-10-05 is a Monday.
//
// Case A and case B from lib/engine/review.ts's weeklyReviewWindow are both exercised here through real database
// rows: case B (planning the Monday after the reviewed week) lands on a week the engine has already marked closed;
// case A (planning on the reviewed week's own last day) lands on a week the engine still calls open, so the review asks
// it about the day after (reviewAsOf) and both cases find the same pattern (RAID I-11). The finished review's record, the
// "already reviewed" state and the later-entry comparison are in tests/review-records-service.test.ts.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getWeeklyReviewFacts } from '@/lib/services/review';
import { ME, OTHER, add, resetGoalModel } from './helpers/fakeEntriesModel';
import { CASE_A_NOW, CASE_B_NOW, NOT_DUE_NOW, settingsRow, world } from './helpers/reviewWorld';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeEntriesModel');
  return { createSupabaseServerClient };
});

beforeEach(() => resetGoalModel({ id: ME }));

describe('getWeeklyReviewFacts: states before "ready"', () => {
  it('is no_goals with no active goal', async () => {
    add('person_settings', settingsRow(ME));
    const r = await getWeeklyReviewFacts({ now: () => CASE_B_NOW });
    expect(r).toEqual({ ok: true, data: { state: 'no_goals' } });
  });

  it('is needs_day_anchors with no time zone', async () => {
    world(ME, 'My');
    add('person_settings', settingsRow(ME, { time_zone: null }));
    const r = await getWeeklyReviewFacts({ now: () => CASE_B_NOW });
    expect(r).toEqual({ ok: true, data: { state: 'needs_day_anchors', anchor: 'time_zone', reason: 'not_set' } });
  });

  it('is needs_planning_setup with no planning weekday chosen, and guesses nothing', async () => {
    world(ME, 'My');
    add('person_settings', settingsRow(ME)); // planning_weekday stays null
    const r = await getWeeklyReviewFacts({ now: () => CASE_B_NOW });
    expect(r).toEqual({ ok: true, data: { state: 'needs_planning_setup' } });
  });

  it('is needs_planning_setup with no week start chosen, even if a planning weekday was', async () => {
    world(ME, 'My');
    add('person_settings', settingsRow(ME, { week_start: null, planning_weekday: 1 }));
    const r = await getWeeklyReviewFacts({ now: () => CASE_B_NOW });
    expect(r).toEqual({ ok: true, data: { state: 'needs_planning_setup' } });
  });

  it('is not_due when today is not the planning day', async () => {
    world(ME, 'My');
    add('person_settings', settingsRow(ME, { planning_weekday: 1 }));
    const r = await getWeeklyReviewFacts({ now: () => NOT_DUE_NOW });
    // Nothing finished before, so there is no last review and nothing to compare.
    expect(r).toEqual({ ok: true, data: { state: 'not_due', tone: 'middle', today: '2026-10-21', planningWeekday: 1, last: null, changes: [] } });
  });
});

describe('getWeeklyReviewFacts: ready, case B (planning the day after the reviewed week ends)', () => {
  it('shows the recap, every named priority and a slipping adjustment', async () => {
    const mine = world(ME, 'My');
    mine.priority('Family time');
    mine.priority('Deep work');
    // Week 1 (10-05..10-11): meets the floor. Weeks 2 and 3 (10-12..10-18, 10-19..10-25): miss it, two running.
    mine.log('2026-10-05');
    mine.log('2026-10-06');
    mine.log('2026-10-07');
    mine.log('2026-10-12');
    mine.log('2026-10-19');
    add('person_settings', settingsRow(ME, { planning_weekday: 1, review_depth: 'recap_only' }));

    const r = await getWeeklyReviewFacts({ now: () => CASE_B_NOW });
    expect(r.ok).toBe(true);
    if (!r.ok || r.data.state !== 'ready') throw new Error('not ready');

    expect(r.data.window).toEqual({ start: '2026-10-19', end: '2026-10-25' });
    expect(r.data.priorities).toEqual([
      { id: expect.any(String), label: 'Family time' },
      { id: expect.any(String), label: 'Deep work' },
    ]);
    expect(r.data.offerReflection).toBe(false); // recap_only
    expect(r.data.targets).toHaveLength(1);
    expect(r.data.targets[0]).toMatchObject({ targetId: mine.target.id, result: { counted: 1, level: 'partway' } });
    expect(r.data.adjustment).toEqual({ kind: 'slipping_check_in', targetId: mine.target.id, periods: 2 });
  });

  it('shows a priority even when nothing was logged against its goal this week', async () => {
    const mine = world(ME, 'My');
    mine.priority('Something I never touched');
    add('person_settings', settingsRow(ME, { planning_weekday: 1 }));

    const r = await getWeeklyReviewFacts({ now: () => CASE_B_NOW });
    if (!r.ok || r.data.state !== 'ready') throw new Error('not ready');
    expect(r.data.priorities.map((p) => p.label)).toEqual(['Something I never touched']);
  });

  it('defaults review depth to recap plus offer when the person has not chosen one', async () => {
    world(ME, 'My');
    add('person_settings', settingsRow(ME, { planning_weekday: 1 })); // review_depth stays null
    const r = await getWeeklyReviewFacts({ now: () => CASE_B_NOW });
    if (!r.ok || r.data.state !== 'ready') throw new Error('not ready');
    expect(r.data.offerReflection).toBe(true);
  });

  it('follows the person’s own slipping run length', async () => {
    const mine = world(ME, 'My');
    mine.log('2026-10-05', 3); // week 1 meets the floor
    mine.log('2026-10-12'); // week 2 misses
    mine.log('2026-10-19'); // week 3 misses
    add('person_settings', settingsRow(ME, { planning_weekday: 1, slipping_periods: 3 }));
    const r = await getWeeklyReviewFacts({ now: () => CASE_B_NOW });
    if (!r.ok || r.data.state !== 'ready') throw new Error('not ready');
    // Only two periods missed running; a run of 3 is required, so nothing is raised.
    expect(r.data.adjustment).toBeNull();
  });
});

describe('getWeeklyReviewFacts: ready, case A (planning on the reviewed week’s own last day)', () => {
  it('closes the week early, so the slipping check-in is found in the same sitting (RAID I-11)', async () => {
    const mine = world(ME, 'My');
    mine.log('2026-10-12'); // week 2 misses the floor
    mine.log('2026-10-19'); // week 3 (reviewed) misses the floor too
    add('person_settings', settingsRow(ME, { planning_weekday: 7 })); // 7 = Sunday in the database's convention

    const r = await getWeeklyReviewFacts({ now: () => CASE_A_NOW });
    if (!r.ok || r.data.state !== 'ready') throw new Error('not ready');
    expect(r.data.window).toEqual({ start: '2026-10-19', end: '2026-10-25' });
    expect(r.data.targets[0]).toMatchObject({ result: { counted: 1, level: 'partway' } });
    // Today is the week's own last day, which the engine still calls open. The review asks it about the day after, as
    // it would be asked the next morning (reviewAsOf), so the week is closed and the run that ends in it is found now:
    // weeks 1, 2 and 3 all missed the floor. Before this was fixed the adjustment was null here (I-11).
    expect(r.data.adjustment).toEqual({ kind: 'slipping_check_in', targetId: mine.target.id, periods: 3 });
    // The recap says it closed early, so the screen can say it counts through today.
    expect(r.data.recap.closedEarly).toBe(true);
  });

  it('gives the same pattern the next morning that it gave on the last day itself', async () => {
    const mine = world(ME, 'My');
    mine.log('2026-10-12');
    mine.log('2026-10-19');
    const settings = add('person_settings', settingsRow(ME, { planning_weekday: 7 }));
    const sunday = await getWeeklyReviewFacts({ now: () => CASE_A_NOW });
    // The same person, planning on Mondays instead: the same week, now already closed for the engine.
    settings.planning_weekday = 1;
    const monday = await getWeeklyReviewFacts({ now: () => CASE_B_NOW });
    if (!sunday.ok || sunday.data.state !== 'ready' || !monday.ok || monday.data.state !== 'ready') throw new Error('not ready');
    expect(sunday.data.adjustment).toEqual(monday.data.adjustment);
    expect(sunday.data.targets).toEqual(monday.data.targets);
    expect(sunday.data.recap.closedEarly).toBe(true);
    expect(monday.data.recap.closedEarly).toBe(false);
  });
});

describe('getWeeklyReviewFacts reads as the signed-in person', () => {
  it('never returns another person’s priorities or targets', async () => {
    const mine = world(ME, 'My');
    const theirs = world(OTHER, 'Their');
    mine.priority('Mine');
    theirs.priority('Theirs');
    theirs.log('2026-10-19', 5);
    add('person_settings', settingsRow(ME, { planning_weekday: 1 }));
    add('person_settings', settingsRow(OTHER, { planning_weekday: 1 }));

    const r = await getWeeklyReviewFacts({ now: () => CASE_B_NOW });
    expect(JSON.stringify(r)).not.toContain('Their');
    if (!r.ok || r.data.state !== 'ready') throw new Error('not ready');
    expect(r.data.priorities.map((p) => p.label)).toEqual(['Mine']);
  });
});
