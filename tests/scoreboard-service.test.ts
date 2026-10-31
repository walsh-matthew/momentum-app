// Home's read of the goal model (lib/services/scoreboard.ts, MOM-112), run against the in-memory goal model fake
// (tests/helpers/fakeEntriesModel.ts). What the mapping does with the rows is in tests/scoreboard-rows.test.ts; this is
// the service around it:
// - it reads as the signed-in person and returns only their own rows, even with row level security switched off in the
//   fake, because the service filters by their id itself (principle: service-layer isolation),
// - it reads every entry, a page at a time, so a long history is counted whole,
// - it writes nothing, and a read that fails is an error result, never a scoreboard built from part of the rows.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getHomeScoreboard } from '@/lib/services/scoreboard';
import { ME, OTHER, add, gm, newId, resetGoalModel } from './helpers/fakeEntriesModel';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeEntriesModel');
  return { createSupabaseServerClient };
});

// Thursday 2026-10-29, noon in Los Angeles.
const NOW = Date.UTC(2026, 9, 29, 19, 0, 0);
const now = () => NOW;

function world(userId: string, title: string) {
  add('person_settings', { user_id: userId, time_zone: 'America/Los_Angeles', week_start: 1, day_end: '00:00:00', tone: null, celebrations: null });
  const goal = { id: newId(), user_id: userId, title: `${title} goal`, state: 'active', shape: 'ongoing', start_date: '2026-10-05', end_date: null, created_at: '2026-10-05T00:00:00.000Z' };
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
  return { goal, target, source, log };
}

beforeEach(() => resetGoalModel({ id: ME }));

describe('getHomeScoreboard reads as the signed-in person', () => {
  it('returns the scoreboard of their own goals and numbers from their own entries', async () => {
    const mine = world(ME, 'My');
    mine.log('2026-10-26');
    mine.log('2026-10-28', 2);
    const r = await getHomeScoreboard({ now });
    expect(r.ok).toBe(true);
    if (!r.ok || r.data.state !== 'ready') throw new Error('not ready');
    expect(r.data.today).toBe('2026-10-29');
    expect(r.data.goals).toHaveLength(1);
    expect(r.data.goals[0].title).toBe('My goal');
    const card = r.data.goals[0].targets[0];
    expect(card).toMatchObject({ title: 'My workouts', status: 'counted', counted: 3, level: 'floor', graded: true });
  });

  it('never returns another person’s goals, targets or numbers', async () => {
    const mine = world(ME, 'My');
    const theirs = world(OTHER, 'Their');
    mine.log('2026-10-26');
    theirs.log('2026-10-26', 5);
    const r = await getHomeScoreboard({ now });
    expect(JSON.stringify(r)).not.toContain('Their');
    if (!r.ok || r.data.state !== 'ready') throw new Error('not ready');
    expect(r.data.goals[0].targets[0]).toMatchObject({ counted: 1 });
  });

  it('filters by their own id itself, so another person’s rows stay out even if row level security were off', async () => {
    const mine = world(ME, 'My');
    const theirs = world(OTHER, 'Their');
    mine.log('2026-10-26');
    theirs.log('2026-10-26', 5);
    gm.rls = false;
    const r = await getHomeScoreboard({ now });
    expect(JSON.stringify(r)).not.toContain('Their');
    if (!r.ok || r.data.state !== 'ready') throw new Error('not ready');
    expect(r.data.goals[0].targets[0]).toMatchObject({ counted: 1 });
  });

  it('uses their own time anchors, not another person’s', async () => {
    world(ME, 'My');
    world(OTHER, 'Their');
    // Theirs are set and mine are not: the person with no time zone is asked for it, whatever the other person set.
    gm.tables.person_settings = gm.tables.person_settings.map((row) => (row.user_id === ME ? { ...row, time_zone: null } : row));
    const r = await getHomeScoreboard({ now });
    expect(r).toEqual({ ok: true, data: { state: 'needs_day_anchors', anchor: 'time_zone', reason: 'not_set' } });
  });

  it('a person with no goals in the goal model gets no_goals, and another person\'s goals do not count as their saved setup', async () => {
    world(OTHER, 'Their');
    expect(await getHomeScoreboard({ now })).toEqual({ ok: true, data: { state: 'no_goals', setupSaved: false } });
  });
});

describe('getHomeScoreboard reads every entry, a page at a time', () => {
  it('counts a history longer than one page whole', async () => {
    const mine = world(ME, 'My');
    // 2,350 entries: three pages of 1,000. All on one day of the open week, so all count.
    mine.log('2026-10-28', 2350);
    const r = await getHomeScoreboard({ now });
    if (!r.ok || r.data.state !== 'ready') throw new Error('not ready');
    expect(r.data.goals[0].targets[0]).toMatchObject({ counted: 2350 });
  });

  it('a history of exactly one page is read whole, and a second, empty page ends the read', async () => {
    const mine = world(ME, 'My');
    mine.log('2026-10-28', 1000);
    const r = await getHomeScoreboard({ now });
    if (!r.ok || r.data.state !== 'ready') throw new Error('not ready');
    expect(r.data.goals[0].targets[0]).toMatchObject({ counted: 1000 });
  });
});

// A deadline task due tomorrow with a rough size of 6 hours (360 minutes), and the days the person set aside for it.
function deadlineTask(userId: string, goalId: unknown, over: { pickToday?: boolean; kindToday?: boolean } = {}) {
  const { pickToday = true, kindToday = true } = over;
  const item = {
    id: newId(),
    user_id: userId,
    goal_id: goalId,
    target_id: null,
    kind: 'deadline_task',
    title: `${userId === ME ? 'My' : 'Their'} application`,
    sort_order: 0,
    due_date: '2026-10-30',
    date_can_move: true,
    estimate_minutes: 360,
    completed_at: null,
    created_at: '2026-10-05T00:00:02.000Z',
  };
  add('work_items', item);
  const kind = { id: newId(), user_id: userId, name: 'Work day', capacity_unit: 'hours', capacity_amount: 4 };
  add('person_day_types', kind);
  if (pickToday) add('week_plan_picks', { id: newId(), user_id: userId, work_item_id: item.id, plan_date: '2026-10-29' });
  add('week_plan_picks', { id: newId(), user_id: userId, work_item_id: item.id, plan_date: '2026-10-30' });
  if (kindToday) add('week_plan_day_types', { id: newId(), user_id: userId, plan_date: '2026-10-29', day_type_id: kind.id });
  add('week_plan_day_types', { id: newId(), user_id: userId, plan_date: '2026-10-30', day_type_id: kind.id });
  return { item, kind };
}

const forecastOfMine = async () => {
  const r = await getHomeScoreboard({ now });
  if (!r.ok || r.data.state !== 'ready') throw new Error('not ready');
  return r.data.goals[0].milestones[0]?.forecast;
};

describe('getHomeScoreboard gives a deadline task its forecast from the person’s own week plan', () => {
  it('reads their picks, their kinds of days and their usual time', async () => {
    const mine = world(ME, 'My');
    deadlineTask(ME, mine.goal.id);
    // 360 minutes is 270 to 450, and two four-hour days give 480.
    expect(await forecastOfMine()).toEqual({ state: 'fits', soFar: false });
  });

  it('never uses another person’s picks, kinds or usual time, even with row level security off', async () => {
    const mine = world(ME, 'My');
    const theirs = world(OTHER, 'Their');
    // Mine has a pick and no kind for today; theirs has everything. Theirs must not fill in my day.
    deadlineTask(ME, mine.goal.id, { kindToday: false });
    deadlineTask(OTHER, theirs.goal.id);
    expect(await forecastOfMine()).toEqual({ state: 'day_without_kind', date: '2026-10-29' });
    gm.rls = false;
    expect(await forecastOfMine()).toEqual({ state: 'day_without_kind', date: '2026-10-29' });
  });

  it('says nothing is set aside when the person has not put the task on a day', async () => {
    const mine = world(ME, 'My');
    deadlineTask(ME, mine.goal.id);
    gm.tables.week_plan_picks = [];
    expect(await forecastOfMine()).toEqual({ state: 'nothing_set_aside' });
  });

  it('writes nothing', async () => {
    const mine = world(ME, 'My');
    deadlineTask(ME, mine.goal.id);
    await getHomeScoreboard({ now });
    expect(gm.writes).toEqual([]);
  });

  it.each(['week_plan_picks', 'week_plan_day_types', 'person_day_types', 'work_items'] as const)(
    'is an error result, not a scoreboard without its forecast, when %s cannot be read',
    async (table) => {
      const mine = world(ME, 'My');
      deadlineTask(ME, mine.goal.id);
      gm.failNextRead = { table, message: 'connection reset' };
      expect(await getHomeScoreboard({ now })).toEqual({ ok: false, error: 'Could not load your scoreboard.' });
    },
  );
});

describe('getHomeScoreboard does not write, and does not guess', () => {
  it('writes nothing', async () => {
    world(ME, 'My').log('2026-10-28');
    await getHomeScoreboard({ now });
    expect(gm.writes).toEqual([]);
  });

  it('is an error result, not a partial scoreboard, when a read fails', async () => {
    world(ME, 'My').log('2026-10-28');
    gm.failNextRead = { table: 'targets', message: 'connection reset' };
    const r = await getHomeScoreboard({ now });
    expect(r).toEqual({ ok: false, error: 'Could not load your scoreboard.' });
  });

  it('is an error result when the entries cannot be read', async () => {
    world(ME, 'My').log('2026-10-28');
    gm.failNextRead = { table: 'entries', message: 'connection reset' };
    expect(await getHomeScoreboard({ now })).toEqual({ ok: false, error: 'Could not load your scoreboard.' });
  });

  it('asks for sign-in, and reads nothing, when nobody is signed in', async () => {
    world(ME, 'My');
    gm.user = null;
    expect(await getHomeScoreboard({ now })).toEqual({ ok: false, error: 'Sign in to see your scoreboard.' });
  });
});
