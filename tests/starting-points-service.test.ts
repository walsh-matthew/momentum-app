// lib/services/startingPoints.ts (MOM-134): the weekly review's read of a person's unanswered starting points, and the
// answer write, against tests/helpers/fakeStartingPoints.ts. What this holds the code to:
// - the read returns only the signed-in person's unanswered starting points, oldest first, each with what it is about and
//   what is saved there now; another person's, an answered one and a mark whose row is gone are never returned;
// - the answer write records kept or changed once, for the person's own unanswered mark, and sets nothing else;
// - a failure is a plain message with no database text; nothing here reaches the network or Claude.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { answerStartingPoint, listUnconfirmedStartingPoints } from '@/lib/services/startingPoints';
import { ENFORCED_NAMES, ME, OTHER, add, markRow, newId, resetStartingPoints, sp } from './helpers/fakeStartingPoints';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeStartingPoints');
  return { createSupabaseServerClient };
});

let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetStartingPoints({ id: ME });
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

// One person's saved setup with a starting point on every kind of row. Titles and values are the person's.
function seedSetup(userId: string, tag = '') {
  const goalId = newId();
  const targetId = newId();
  const itemId = newId();
  const dayTypeId = newId();
  add('goals', { id: goalId, user_id: userId, title: `Get fit${tag}`, start_date: '2026-10-29', end_date: null, block_weeks: 10, return_date: null });
  add('targets', { id: targetId, user_id: userId, goal_id: goalId, title: `Gym${tag}`, floor: 2, aspiration: 3, qualifying_threshold: null, due_date: null, slot_weekdays: [1, 3] });
  add('work_items', { id: itemId, user_id: userId, goal_id: goalId, title: `Book a trainer${tag}`, due_date: '2026-11-15', estimate_minutes: 60 });
  add('person_day_types', { id: dayTypeId, user_id: userId, name: `Work day${tag}`, capacity_amount: 2 });
  add('person_settings', { user_id: userId, day_end: '21:00:00', week_start: 1, planning_weekday: 7, planning_time: '18:00:00' });
  return {
    goalId,
    marks: [
      add('starting_points', markRow(userId, { subject_kind: 'person' }, 'day_end')),
      add('starting_points', markRow(userId, { subject_kind: 'day_type', day_type_id: dayTypeId }, 'capacity_amount')),
      add('starting_points', markRow(userId, { subject_kind: 'goal', goal_id: goalId }, 'start_date')),
      add('starting_points', markRow(userId, { subject_kind: 'target', target_id: targetId }, 'slot_weekdays')),
      add('starting_points', markRow(userId, { subject_kind: 'work_item', work_item_id: itemId }, 'estimate_minutes')),
    ],
  };
}

describe('listUnconfirmedStartingPoints: what the review reads', () => {
  it('returns each unanswered starting point with what it is about and what is saved there now, oldest first', async () => {
    const mine = seedSetup(ME);
    const result = await listUnconfirmedStartingPoints();
    expect(result).toEqual({
      ok: true,
      data: [
        { id: mine.marks[0].id, kind: 'person', field: 'day_end', subject: null, value: '21:00:00', createdAt: mine.marks[0].created_at },
        { id: mine.marks[1].id, kind: 'day_type', field: 'capacity_amount', subject: 'Work day', value: '2', createdAt: mine.marks[1].created_at },
        { id: mine.marks[2].id, kind: 'goal', field: 'start_date', subject: 'Get fit', value: '2026-10-29', createdAt: mine.marks[2].created_at },
        { id: mine.marks[3].id, kind: 'target', field: 'slot_weekdays', subject: 'Gym', value: '1,3', createdAt: mine.marks[3].created_at },
        { id: mine.marks[4].id, kind: 'work_item', field: 'estimate_minutes', subject: 'Book a trainer', value: '60', createdAt: mine.marks[4].created_at },
      ],
    });
  });

  it('reads once for each kind that has a mark, never once for each mark', async () => {
    seedSetup(ME);
    add('starting_points', markRow(ME, { subject_kind: 'person' }, 'planning_weekday'));
    add('starting_points', markRow(ME, { subject_kind: 'goal', goal_id: sp.tables.goals[0].id }, 'block_weeks'));
    await listUnconfirmedStartingPoints();
    expect(sp.reads).toEqual({ starting_points: 1, person_day_types: 1, goals: 1, targets: 1, work_items: 1, person_settings: 1 });
  });

  it('returns only the signed-in person\'s, whoever else has marks', async () => {
    const mine = seedSetup(ME);
    seedSetup(OTHER, ' (theirs)');
    const result = await listUnconfirmedStartingPoints();
    expect(result.ok && result.data.map((p) => p.id)).toEqual(mine.marks.map((m) => m.id));
    // With row level security off, the service's own user filter still keeps the other person's out.
    sp.rls = false;
    const unfiltered = await listUnconfirmedStartingPoints();
    expect(unfiltered.ok && unfiltered.data.map((p) => p.id)).toEqual(mine.marks.map((m) => m.id));
    expect(unfiltered.ok && JSON.stringify(unfiltered.data)).not.toContain('theirs');
  });

  it('leaves out a starting point that has been answered', async () => {
    const mine = seedSetup(ME);
    mine.marks[0].answered_at = '2026-11-02T10:00:00.000Z';
    mine.marks[0].outcome = 'kept';
    const result = await listUnconfirmedStartingPoints();
    expect(result.ok && result.data.map((p) => p.id)).toEqual(mine.marks.slice(1).map((m) => m.id));
  });

  it('leaves out a mark whose row is gone, and says nothing is saved where the value has been cleared', async () => {
    const mine = seedSetup(ME);
    sp.tables.goals = sp.tables.goals.filter((g) => g.id !== mine.goalId);
    const result = await listUnconfirmedStartingPoints();
    expect(result.ok && result.data.map((p) => p.kind)).toEqual(['person', 'day_type', 'target', 'work_item']);
    sp.tables.person_settings[0].day_end = null;
    const cleared = await listUnconfirmedStartingPoints();
    expect(cleared.ok && cleared.data[0]).toMatchObject({ kind: 'person', field: 'day_end', value: null });
  });

  it('is empty for a person with none, and makes no further read', async () => {
    seedSetup(OTHER);
    expect(await listUnconfirmedStartingPoints()).toEqual({ ok: true, data: [] });
    expect(sp.reads).toEqual({ starting_points: 1 });
  });

  it('asks a signed-out visitor to sign in, and reads nothing', async () => {
    seedSetup(ME);
    resetStartingPoints(null);
    expect(await listUnconfirmedStartingPoints()).toEqual({ ok: false, error: 'Sign in to see your starting points.' });
    expect(sp.reads).toEqual({});
  });

  it('answers a failed read in plain words, without the database\'s text', async () => {
    seedSetup(ME);
    sp.failNext = { table: 'goals', message: 'could not read row {"title":"Get fit"}' };
    const result = await listUnconfirmedStartingPoints();
    expect(result).toEqual({ ok: false, error: 'Could not load your starting points.' });
    expect(JSON.stringify(result)).not.toContain('Get fit');
  });
});

describe('answerStartingPoint: the person\'s answer', () => {
  const NOW = Date.UTC(2026, 10, 2, 17, 0, 0);

  it('records that the person kept the value, from the clock, and sets nothing else', async () => {
    const mine = seedSetup(ME);
    const result = await answerStartingPoint(mine.marks[2].id, 'kept', { now: () => NOW });
    expect(result).toEqual({ ok: true, data: { id: mine.marks[2].id, outcome: 'kept' } });
    expect(mine.marks[2]).toMatchObject({ answered_at: new Date(NOW).toISOString(), outcome: 'kept', field: 'start_date' });
    expect(sp.updates).toEqual([['answered_at', 'outcome']]);
    // The others are untouched, and the answered one is no longer waiting.
    expect(mine.marks.filter((m) => m.answered_at !== null)).toHaveLength(1);
    const left = await listUnconfirmedStartingPoints();
    expect(left.ok && left.data).toHaveLength(4);
  });

  it('records that the person changed it', async () => {
    const mine = seedSetup(ME);
    expect((await answerStartingPoint(mine.marks[0].id, 'changed', { now: () => NOW })).ok).toBe(true);
    expect(mine.marks[0].outcome).toBe('changed');
  });

  it('answers once: the second answer is refused and the first stands', async () => {
    const mine = seedSetup(ME);
    await answerStartingPoint(mine.marks[0].id, 'kept', { now: () => NOW });
    const again = await answerStartingPoint(mine.marks[0].id, 'changed', { now: () => NOW + 1000 });
    expect(again).toEqual({ ok: false, error: 'That question is not waiting for an answer.' });
    expect(mine.marks[0]).toMatchObject({ outcome: 'kept', answered_at: new Date(NOW).toISOString() });
  });

  it('cannot answer another person\'s starting point, with row level security or without it', async () => {
    const theirs = seedSetup(OTHER);
    expect(await answerStartingPoint(theirs.marks[0].id, 'kept')).toEqual({ ok: false, error: 'That question is not waiting for an answer.' });
    sp.rls = false;
    expect(await answerStartingPoint(theirs.marks[0].id, 'kept')).toEqual({ ok: false, error: 'That question is not waiting for an answer.' });
    expect(theirs.marks.every((m) => m.answered_at === null && m.outcome === null)).toBe(true);
  });

  it('refuses an id that is not an id and an answer that is neither kept nor changed, and writes nothing', async () => {
    const mine = seedSetup(ME);
    for (const [id, outcome] of [
      ['not-an-id', 'kept'],
      [undefined, 'kept'],
      [mine.marks[0].id, 'maybe'],
      [mine.marks[0].id, undefined],
      [mine.marks[0].id, { outcome: 'kept' }],
    ] as const) {
      const result = await answerStartingPoint(id, outcome);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error).toBe('That answer could not be read. Nothing was saved.');
    }
    expect(sp.updates).toEqual([]);
    expect(mine.marks.every((m) => m.answered_at === null)).toBe(true);
  });

  it('asks a signed-out visitor to sign in, and writes nothing', async () => {
    const mine = seedSetup(ME);
    resetStartingPoints(null);
    expect(await answerStartingPoint(mine.marks[0].id, 'kept')).toEqual({ ok: false, error: 'Sign in to see your starting points.' });
    expect(sp.updates).toEqual([]);
  });

  it('says only that it could not save, and logs the code alone, when the database fails', async () => {
    const mine = seedSetup(ME);
    sp.failNext = { table: 'starting_points', message: 'failed on row {"field":"start_date"}' };
    const result = await answerStartingPoint(mine.marks[2].id, 'kept');
    expect(result).toEqual({ ok: false, error: 'Could not save your answer.' });
    expect(error).toHaveBeenCalledWith('[starting-points] could not save an answer', { code: 'XX000' });
    expect(JSON.stringify(error.mock.calls)).not.toContain('start_date');
    expect(mine.marks[2].answered_at).toBeNull();
  });
});

describe('the starting points fake matches migration 017', () => {
  // Statements only: comments quote the same names.
  const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '017_starting_points.sql'), 'utf8').replace(/--.*$/gm, '');

  it.each([...ENFORCED_NAMES])('%s exists in the SQL', (name) => {
    expect(sql).toMatch(new RegExp(`(constraint|policy)\\s+"?${name}"?\\b`, 'i'));
  });

  it('the person may update only answered_at and outcome, and only an unanswered mark', () => {
    expect(sql).toContain('grant update (answered_at, outcome) on table public.starting_points to authenticated;');
    expect(sql).toMatch(/starting_points_update_own[\s\S]*?using \(\(select auth\.uid\(\)\) = user_id and answered_at is null\)/);
  });
});
