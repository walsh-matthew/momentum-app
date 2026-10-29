// lib/services/review.ts (MOM-113 block 1), run against the in-memory goal model fake
// (tests/helpers/fakeEntriesModel.ts). Dates are from October 2026: 2026-10-05 is a Monday.
//
// Case A and case B from lib/engine/review.ts's weeklyReviewWindow are both exercised here through real database
// rows: case B (planning the Monday after the reviewed week) lands on a week the engine has already marked closed,
// so a slipping pattern can be detected; case A (planning on the reviewed week's own last day) lands on a week the
// engine still calls open (it closes the day after its last day, not on it), so layer 1's numbers are complete but
// no pattern-based adjustment can fire yet — see RAID I-11.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getWeeklyReviewFacts } from '@/lib/services/review';
import { ME, OTHER, add, newId, resetGoalModel } from './helpers/fakeEntriesModel';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeEntriesModel');
  return { createSupabaseServerClient };
});

// Monday-start week, planning the following Monday (DB value 1 both ways): reviews 10-19..10-25, already closed.
const CASE_B_NOW = Date.UTC(2026, 9, 26, 19, 0, 0); // Monday 2026-10-26, noon in Los Angeles
// Same week start and planning weekday as DB value 7 (Sunday): reviews the same week on its own last day, 10-25.
const CASE_A_NOW = Date.UTC(2026, 9, 25, 19, 0, 0); // Sunday 2026-10-25, noon in Los Angeles
// A Wednesday: not the planning day under either setting above.
const NOT_DUE_NOW = Date.UTC(2026, 9, 21, 19, 0, 0);

const settingsRow = (userId: string, over: Record<string, unknown> = {}) => ({
  user_id: userId,
  time_zone: 'America/Los_Angeles',
  week_start: 1,
  day_end: '00:00:00',
  planning_weekday: null,
  review_depth: null,
  slipping_periods: null,
  ...over,
});

function world(userId: string, title: string) {
  const goal = {
    id: newId(),
    user_id: userId,
    title: `${title} goal`,
    state: 'active',
    shape: 'ongoing',
    start_date: '2026-10-05',
    end_date: null,
    created_at: '2026-10-05T00:00:00.000Z',
  };
  add('goals', goal);
  const target = {
    id: newId(),
    user_id: userId,
    goal_id: goal.id,
    title: `${title} workouts`,
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
  add('targets', target);
  const source = { id: newId(), user_id: userId, kind: 'manual', provider: null, label: 'Manual' };
  add('sources', source);
  const log = (day: string, n = 1) => {
    for (let i = 0; i < n; i++) {
      add('entries', {
        id: newId(),
        user_id: userId,
        target_id: target.id,
        source_id: source.id,
        source_record_id: newId(),
        work_item_id: null,
        occurred_at: `${day}T19:00:00+00:00`,
        value: 1,
        evidence: {},
        created_at: '2026-10-29T00:00:00.000Z',
      });
    }
  };
  const priority = (label: string) => add('person_priorities', { id: newId(), user_id: userId, label, sort_order: 0, created_at: '2026-10-01T00:00:00.000Z' });
  return { goal, target, source, log, priority };
}

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
    expect(r).toEqual({ ok: true, data: { state: 'not_due' } });
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
  it('shows the recap for the week ending today, with no pattern-based adjustment yet (RAID I-11)', async () => {
    const mine = world(ME, 'My');
    mine.log('2026-10-12'); // week 2 misses the floor
    mine.log('2026-10-19'); // week 3 (reviewed) misses the floor too
    add('person_settings', settingsRow(ME, { planning_weekday: 7 })); // 7 = Sunday in the database's convention

    const r = await getWeeklyReviewFacts({ now: () => CASE_A_NOW });
    if (!r.ok || r.data.state !== 'ready') throw new Error('not ready');
    expect(r.data.window).toEqual({ start: '2026-10-19', end: '2026-10-25' });
    expect(r.data.targets[0]).toMatchObject({ result: { counted: 1, level: 'partway' } });
    // The week being reviewed is numerically final but still "open" (today is not yet past its last day), so the
    // engine has not folded it into a pattern run. See RAID I-11.
    expect(r.data.adjustment).toBeNull();
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
