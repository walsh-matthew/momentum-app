// The weekly review's record (migration 018, MOM-113 block 3.2), run against the in-memory goal model fake
// (tests/helpers/fakeEntriesModel.ts), which mirrors 018: select and insert only, one record per person and week, the
// CHECKs, and the trigger that sets finished_at. What these pin: a finished review is stored once and never rewritten; a
// later entry is shown against it in words (RAID R-26); one person never reads or blocks another's; and no screen is
// needed for any of it. Dates are from October 2026 (2026-10-05 is a Monday); case B is Monday 10-26 reviewing 10-19..10-25.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getReviewPrompt, promptWindow, recordFinishedReview, reviewPromptFor } from '@/lib/services/reviewRecords';
import { getWeeklyReviewFacts } from '@/lib/services/review';
import { ME, OTHER, add, gm, resetGoalModel } from './helpers/fakeEntriesModel';
import { CASE_A_NOW, CASE_B_NOW, NOT_DUE_NOW, settingsRow, world } from './helpers/reviewWorld';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeEntriesModel');
  return { createSupabaseServerClient };
});

beforeEach(() => {
  resetGoalModel({ id: ME });
  gm.dbNow = new Date(CASE_B_NOW).toISOString();
});

// A person with a slipping week: weeks 10-05 (met), 10-12 and 10-19 (missed), planning on Mondays. The review of 10-19..10-25
// offers a slipping check-in, so finishing it needs a choice.
function slippingPerson(userId = ME) {
  const mine = world(userId, userId === ME ? 'My' : 'Their');
  mine.log('2026-10-05', 3);
  mine.log('2026-10-12');
  mine.log('2026-10-19');
  add('person_settings', settingsRow(userId, { planning_weekday: 1 }));
  return mine;
}

// A person whose review offers nothing: every week met its floor.
function steadyPerson() {
  const mine = world(ME, 'My');
  mine.log('2026-10-05', 3);
  mine.log('2026-10-12', 3);
  mine.log('2026-10-19', 3);
  add('person_settings', settingsRow(ME, { planning_weekday: 1 }));
  return mine;
}

const records = () => gm.tables.weekly_reviews;

describe('recordFinishedReview: a finished review is stored once', () => {
  it('stores what the recap said, the week, the adjustment offered and the choice, with the database\'s time', async () => {
    const mine = slippingPerson();
    mine.priority('Family time');
    const before = await getWeeklyReviewFacts({ now: () => CASE_B_NOW });
    if (!before.ok || before.data.state !== 'ready') throw new Error('not ready');

    const r = await recordFinishedReview('declined', { now: () => CASE_B_NOW });
    expect(r).toEqual({ ok: true, data: { id: expect.any(String), weekStart: '2026-10-19' } });

    expect(records()).toHaveLength(1);
    expect(records()[0]).toMatchObject({
      user_id: ME,
      week_start: '2026-10-19',
      week_end: '2026-10-25',
      adjustment_kind: 'slipping_check_in',
      adjustment: { kind: 'slipping_check_in', targetId: mine.target.id, periods: 2 },
      adjustment_outcome: 'declined',
      finished_at: '2026-10-26T19:00:00.000Z',
    });
    // What was stored is exactly the recap the screen showed: the engine's numbers, the person's titles and priorities.
    expect(records()[0].recap).toEqual(before.data.recap);
    expect(JSON.stringify(records()[0].recap)).toContain('Family time');
    expect(JSON.stringify(records()[0].recap)).toContain('My workouts');
  });

  it('stores a review that offered nothing with an empty adjustment', async () => {
    steadyPerson();
    const r = await recordFinishedReview(undefined, { now: () => CASE_B_NOW });
    expect(r.ok).toBe(true);
    expect(records()[0]).toMatchObject({ adjustment_kind: null, adjustment: null, adjustment_outcome: null });
  });

  it('refuses a second record for the same week, and keeps the first exactly as it was', async () => {
    slippingPerson();
    expect((await recordFinishedReview('changed', { now: () => CASE_B_NOW })).ok).toBe(true);
    const first = JSON.stringify(records());

    const again = await recordFinishedReview('declined', { now: () => CASE_B_NOW });
    expect(again).toEqual({ ok: false, error: "You already finished this week's review." });
    expect(records()).toHaveLength(1);
    expect(JSON.stringify(records())).toBe(first);
  });

  it('is refused by the database too if a second insert gets past the check (the unique key)', async () => {
    slippingPerson();
    await recordFinishedReview('changed', { now: () => CASE_B_NOW });
    // Straight at the table, as a second session racing the first would: the unique key says no.
    const { createSupabaseServerClient } = await import('./helpers/fakeEntriesModel');
    const db = await createSupabaseServerClient();
    const dup = await db.from('weekly_reviews').insert({ user_id: ME, week_start: '2026-10-19', week_end: '2026-10-25', recap: { v: 1 } });
    expect(dup.error?.code).toBe('23505');
    expect(records()).toHaveLength(1);
  });

  it('never updates or deletes a record: the only writes to the table are inserts, and the person has no such grant', async () => {
    slippingPerson();
    await recordFinishedReview('changed', { now: () => CASE_B_NOW });
    await getWeeklyReviewFacts({ now: () => CASE_B_NOW });
    expect(gm.writes.filter((w) => w.table === 'weekly_reviews')).toEqual([{ table: 'weekly_reviews', op: 'insert' }]);

    const { createSupabaseServerClient } = await import('./helpers/fakeEntriesModel');
    const db = await createSupabaseServerClient();
    const update = await db.from('weekly_reviews').update({ recap: { v: 1, rewritten: true } }).eq('user_id', ME);
    const del = await db.from('weekly_reviews').delete().eq('user_id', ME);
    expect(update.error?.code).toBe('42501');
    expect(del.error?.code).toBe('42501');
    expect(records()).toHaveLength(1);
  });

  it('sets finished_at to the database\'s time, whatever the insert sends', async () => {
    const { createSupabaseServerClient } = await import('./helpers/fakeEntriesModel');
    const db = await createSupabaseServerClient();
    const sent = await db
      .from('weekly_reviews')
      .insert({ user_id: ME, week_start: '2026-10-19', week_end: '2026-10-25', recap: { v: 1 }, finished_at: '2020-01-01T00:00:00.000Z' } as never);
    expect(sent.error).toBeNull();
    expect(records()[0].finished_at).toBe('2026-10-26T19:00:00.000Z');
  });
});

describe('recordFinishedReview: the choice and the states it needs', () => {
  it('needs a choice when an adjustment was offered, and writes nothing without one', async () => {
    slippingPerson();
    const r = await recordFinishedReview(undefined, { now: () => CASE_B_NOW });
    expect(r).toEqual({ ok: false, error: 'That choice could not be read. Nothing was saved.' });
    expect(records()).toHaveLength(0);
  });

  it('refuses an outcome it does not know', async () => {
    slippingPerson();
    for (const bad of ['maybe', '', 'CHANGED', 7, {}]) {
      expect((await recordFinishedReview(bad, { now: () => CASE_B_NOW })).ok).toBe(false);
    }
    expect(records()).toHaveLength(0);
  });

  it('refuses a choice when nothing was offered: a choice with nothing offered cannot be recorded', async () => {
    steadyPerson();
    const r = await recordFinishedReview('skipped', { now: () => CASE_B_NOW });
    expect(r).toEqual({ ok: false, error: 'That choice could not be read. Nothing was saved.' });
    expect(records()).toHaveLength(0);
  });

  it('accepts each of the three outcomes kill criterion 4 counts', async () => {
    for (const outcome of ['changed', 'declined', 'skipped']) {
      resetGoalModel({ id: ME });
      gm.dbNow = new Date(CASE_B_NOW).toISOString();
      slippingPerson();
      expect((await recordFinishedReview(outcome, { now: () => CASE_B_NOW })).ok).toBe(true);
      expect(records()[0].adjustment_outcome).toBe(outcome);
    }
  });

  it('writes nothing when it is not the planning day', async () => {
    slippingPerson();
    const r = await recordFinishedReview('changed', { now: () => NOT_DUE_NOW });
    expect(r).toEqual({ ok: false, error: 'There is no weekly review to finish right now.' });
    expect(records()).toHaveLength(0);
  });

  it('writes nothing before the week start and the planning day are chosen, and guesses neither', async () => {
    world(ME, 'My');
    add('person_settings', settingsRow(ME)); // planning_weekday stays null
    const r = await recordFinishedReview(undefined, { now: () => CASE_B_NOW });
    expect(r).toEqual({ ok: false, error: 'There is no weekly review to finish right now.' });
    expect(records()).toHaveLength(0);
  });

  it('needs a signed-in person', async () => {
    slippingPerson();
    gm.user = null;
    const r = await recordFinishedReview('changed', { now: () => CASE_B_NOW });
    expect(r).toEqual({ ok: false, error: 'Sign in to finish your weekly review.' });
    expect(records()).toHaveLength(0);
  });

  it('says it could not save, without the database\'s message, when the write fails', async () => {
    slippingPerson();
    gm.failNextWrite = { table: 'weekly_reviews', message: 'duplicate key value violates "Family time" secret' };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await recordFinishedReview('changed', { now: () => CASE_B_NOW });
    expect(r).toEqual({ ok: false, error: 'Could not save your weekly review.' });
    expect(JSON.stringify(error.mock.calls)).not.toContain('secret');
    error.mockRestore();
    expect(records()).toHaveLength(0);
  });

  it('closes the week early in the record when the planning day is the week\'s last day', async () => {
    resetGoalModel({ id: ME });
    gm.dbNow = new Date(CASE_A_NOW).toISOString();
    const mine = world(ME, 'My');
    mine.log('2026-10-05', 3);
    mine.log('2026-10-12', 3);
    mine.log('2026-10-19', 3);
    add('person_settings', settingsRow(ME, { planning_weekday: 7 }));
    expect((await recordFinishedReview(undefined, { now: () => CASE_A_NOW })).ok).toBe(true);
    expect((records()[0].recap as { closedEarly: boolean }).closedEarly).toBe(true);
  });
});

describe('the already-reviewed state', () => {
  it('turns a ready review into a reviewed one, with the record as it was said and the person\'s own finished day', async () => {
    slippingPerson();
    await recordFinishedReview('declined', { now: () => CASE_B_NOW });

    const r = await getWeeklyReviewFacts({ now: () => CASE_B_NOW });
    if (!r.ok || r.data.state !== 'reviewed') throw new Error(`expected reviewed, got ${r.ok ? r.data.state : r.error}`);
    expect(r.data.review.window).toEqual({ start: '2026-10-19', end: '2026-10-25' });
    expect(r.data.review.finishedOn).toBe('2026-10-26');
    expect(r.data.review.adjustment).toEqual({ kind: 'slipping_check_in', outcome: 'declined' });
    expect(r.data.review.recap.goals[0].targets[0]).toMatchObject({ title: 'My workouts', counted: 1, level: 'partway' });
    expect(r.data.changes).toEqual([]);
  });

  it('is not the reviewed state on a different planning day: the last review is still there to read', async () => {
    slippingPerson();
    await recordFinishedReview('declined', { now: () => CASE_B_NOW });
    const r = await getWeeklyReviewFacts({ now: () => NOT_DUE_NOW });
    if (!r.ok || r.data.state !== 'not_due') throw new Error('not not_due');
    expect(r.data.planningWeekday).toBe(1);
    expect(r.data.last?.window).toEqual({ start: '2026-10-19', end: '2026-10-25' });
  });

  it('leaves a record it cannot read out of the screen, and never rewrites it', async () => {
    slippingPerson();
    add('weekly_reviews', {
      id: 'unreadable',
      user_id: ME,
      week_start: '2026-10-19',
      week_end: '2026-10-25',
      recap: { v: 2, somethingNew: true },
      adjustment_kind: null,
      adjustment: null,
      adjustment_outcome: null,
      finished_at: '2026-10-26T19:00:00.000Z',
    });
    const r = await getWeeklyReviewFacts({ now: () => CASE_B_NOW });
    expect(r.ok && r.data.state).toBe('ready');
    // And the table refuses a second record for that week, so finishing it again is refused and nothing is changed.
    expect(await recordFinishedReview('changed', { now: () => CASE_B_NOW })).toEqual({ ok: false, error: "You already finished this week's review." });
    expect(records()).toHaveLength(1);
    expect(records()[0].recap).toEqual({ v: 2, somethingNew: true });
  });
});

describe('a later entry is shown against the stored record in words, never by rewriting it (R-26)', () => {
  it('lists what changed, with both the stored and the live numbers, and leaves the record as it was', async () => {
    const mine = slippingPerson();
    await recordFinishedReview('declined', { now: () => CASE_B_NOW });
    const stored = JSON.stringify(records());

    // A late entry for a day in the reviewed week (10-19..10-25): two more workouts, taking it from 1 to 3, the floor.
    mine.log('2026-10-21', 2);

    const r = await getWeeklyReviewFacts({ now: () => CASE_B_NOW });
    if (!r.ok || r.data.state !== 'reviewed') throw new Error('not reviewed');
    expect(r.data.changes).toEqual([
      {
        weekStart: '2026-10-19',
        weekEnd: '2026-10-25',
        targetId: mine.target.id,
        title: 'My workouts',
        unit: null,
        said: { counted: 1, level: 'partway', graded: true },
        now: { counted: 3, level: 'floor', graded: true },
      },
    ]);
    // The record says exactly what it said, and the table was not written again.
    expect(JSON.stringify(records())).toBe(stored);
    expect(gm.writes.filter((w) => w.table === 'weekly_reviews')).toHaveLength(1);
    expect(r.data.review.recap.goals[0].targets[0]).toMatchObject({ counted: 1, level: 'partway' });
  });

  it('says nothing when no entry changed the week, and when the entry is for another week', async () => {
    const mine = slippingPerson();
    await recordFinishedReview('declined', { now: () => CASE_B_NOW });
    mine.log('2026-10-26'); // today, in the week after the reviewed one
    const r = await getWeeklyReviewFacts({ now: () => CASE_B_NOW });
    if (!r.ok || r.data.state !== 'reviewed') throw new Error('not reviewed');
    expect(r.data.changes).toEqual([]);
  });

  it('shows the change on a day that is not the planning day, beside the last review', async () => {
    const mine = slippingPerson();
    await recordFinishedReview('declined', { now: () => CASE_B_NOW });
    mine.log('2026-10-22', 2);
    const r = await getWeeklyReviewFacts({ now: () => NOT_DUE_NOW });
    if (!r.ok || r.data.state !== 'not_due') throw new Error('not not_due');
    expect(r.data.changes).toHaveLength(1);
    expect(r.data.changes[0]).toMatchObject({ said: { counted: 1 }, now: { counted: 3 } });
  });

  it('shows it at the next review too, as one of the earlier recaps that changed', async () => {
    const mine = slippingPerson();
    await recordFinishedReview('declined', { now: () => CASE_B_NOW });
    mine.log('2026-10-22', 2);
    // A week later (Monday 11-02), the review of 10-26..11-01 is ready and still names the week before's change.
    const NEXT = Date.UTC(2026, 10, 2, 19, 0, 0);
    const r = await getWeeklyReviewFacts({ now: () => NEXT });
    if (!r.ok || r.data.state !== 'ready') throw new Error('not ready');
    expect(r.data.window).toEqual({ start: '2026-10-26', end: '2026-11-01' });
    expect(r.data.changes).toHaveLength(1);
    expect(r.data.changes[0]).toMatchObject({ weekStart: '2026-10-19', now: { counted: 3, level: 'floor' } });
  });

  it('shows an entry logged later on the last day after a review that closed the week early', async () => {
    resetGoalModel({ id: ME });
    gm.dbNow = new Date(CASE_A_NOW).toISOString();
    const mine = world(ME, 'My');
    mine.log('2026-10-05', 3);
    mine.log('2026-10-12', 3);
    mine.log('2026-10-19', 2); // partway when the recap is shown on Sunday 10-25
    add('person_settings', settingsRow(ME, { planning_weekday: 7 }));
    expect((await recordFinishedReview(undefined, { now: () => CASE_A_NOW })).ok).toBe(true);

    // Later the same Sunday: one more workout, taking it to the floor. The recap said it counted through today.
    mine.log('2026-10-25');
    const r = await getWeeklyReviewFacts({ now: () => CASE_A_NOW });
    if (!r.ok || r.data.state !== 'reviewed') throw new Error('not reviewed');
    expect(r.data.review.recap.closedEarly).toBe(true);
    expect(r.data.changes).toHaveLength(1);
    expect(r.data.changes[0]).toMatchObject({ said: { counted: 2, level: 'partway' }, now: { counted: 3, level: 'floor' } });
  });
});

describe('one person never reads or blocks another\'s record', () => {
  it('reads only its own records, and its own review is not "already reviewed" because someone else\'s is', async () => {
    slippingPerson(ME);
    slippingPerson(OTHER);
    // The other person finishes their review of the same week.
    add('weekly_reviews', {
      id: 'theirs',
      user_id: OTHER,
      week_start: '2026-10-19',
      week_end: '2026-10-25',
      recap: { v: 1, secret: 'Their recap' },
      adjustment_kind: null,
      adjustment: null,
      adjustment_outcome: null,
      finished_at: '2026-10-26T19:00:00.000Z',
    });

    const r = await getWeeklyReviewFacts({ now: () => CASE_B_NOW });
    expect(JSON.stringify(r)).not.toContain('Their');
    expect(r.ok && r.data.state).toBe('ready');
    expect((await getReviewPrompt({ now: () => CASE_B_NOW })).state).toBe('due');

    // Finishing one's own is allowed, and leaves theirs alone.
    expect((await recordFinishedReview('changed', { now: () => CASE_B_NOW })).ok).toBe(true);
    expect(records().filter((x) => x.user_id === OTHER)).toHaveLength(1);
    expect(records().filter((x) => x.user_id === ME)).toHaveLength(1);
  });

  it('shows nothing of the other person with row level security off, because the service filters by user id itself', async () => {
    slippingPerson(ME);
    add('weekly_reviews', {
      id: 'theirs',
      user_id: OTHER,
      week_start: '2026-10-12',
      week_end: '2026-10-18',
      recap: { v: 1, secret: 'Their recap' },
      adjustment_kind: null,
      adjustment: null,
      adjustment_outcome: null,
      finished_at: '2026-10-19T19:00:00.000Z',
    });
    gm.rls = false;
    const r = await getWeeklyReviewFacts({ now: () => NOT_DUE_NOW });
    expect(JSON.stringify(r)).not.toContain('Their');
    if (!r.ok || r.data.state !== 'not_due') throw new Error('not not_due');
    expect(r.data.last).toBeNull();
  });
});

describe('home\'s one line about the review', () => {
  it('is due on the planning day, reviewed after it is finished, and nothing on any other day', async () => {
    slippingPerson();
    expect(await getReviewPrompt({ now: () => CASE_B_NOW })).toEqual({ state: 'due' });
    expect(await getReviewPrompt({ now: () => NOT_DUE_NOW })).toEqual({ state: 'none' });
    await recordFinishedReview('declined', { now: () => CASE_B_NOW });
    expect(await getReviewPrompt({ now: () => CASE_B_NOW })).toEqual({ state: 'reviewed' });
    expect(await getReviewPrompt({ now: () => NOT_DUE_NOW })).toEqual({ state: 'none' });
  });

  it('is nothing before the planning day is chosen, with no goal, or signed out, and fails to nothing', async () => {
    world(ME, 'My');
    add('person_settings', settingsRow(ME));
    expect(await getReviewPrompt({ now: () => CASE_B_NOW })).toEqual({ state: 'none' });

    resetGoalModel({ id: ME });
    add('person_settings', settingsRow(ME, { planning_weekday: 1 }));
    expect(await getReviewPrompt({ now: () => CASE_B_NOW })).toEqual({ state: 'none' });

    resetGoalModel(null);
    expect(await getReviewPrompt({ now: () => CASE_B_NOW })).toEqual({ state: 'none' });

    resetGoalModel({ id: ME });
    world(ME, 'My');
    add('person_settings', settingsRow(ME, { planning_weekday: 1 }));
    gm.failNextRead = { table: 'person_settings', message: 'down' };
    expect(await getReviewPrompt({ now: () => CASE_B_NOW })).toEqual({ state: 'none' });
  });

  it('reviewPromptFor and promptWindow guess nothing when an anchor is missing', () => {
    const base = { time_zone: 'America/Los_Angeles', week_start: 1, day_end: '00:00:00', planning_weekday: 1 };
    expect(promptWindow(base, CASE_B_NOW)).toEqual({ start: '2026-10-19', end: '2026-10-25' });
    expect(promptWindow({ ...base, week_start: null }, CASE_B_NOW)).toBeNull();
    expect(promptWindow({ ...base, planning_weekday: null }, CASE_B_NOW)).toBeNull();
    expect(promptWindow({ ...base, time_zone: null }, CASE_B_NOW)).toBeNull();
    expect(promptWindow(null, CASE_B_NOW)).toBeNull();
    expect(reviewPromptFor({ settings: base, hasActiveGoal: false, reviewedWeekStarts: [] }, CASE_B_NOW)).toEqual({ state: 'none' });
    expect(reviewPromptFor({ settings: base, hasActiveGoal: true, reviewedWeekStarts: ['2026-10-12'] }, CASE_B_NOW)).toEqual({ state: 'due' });
    expect(reviewPromptFor({ settings: base, hasActiveGoal: true, reviewedWeekStarts: ['2026-10-19'] }, CASE_B_NOW)).toEqual({ state: 'reviewed' });
  });
});
