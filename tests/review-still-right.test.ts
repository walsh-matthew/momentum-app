// "Still right for you?" (MOM-113 block 3.4, docs/DOMAIN_MODEL.md §2.1 rule 4 and §3.2), from the pure choice of what to ask to the
// finished review, run against the in-memory goal model fake (tests/helpers/fakeEntriesModel.ts). What these hold the code to:
// - only a target's floor, aspiration and days are asked (the numbers MOM-146's form can change); every other mark stays unanswered
//   and untouched until it has an edit path,
// - a mark whose target the person has changed (a saved change) is never asked, and is recorded as changed at the finish, unless the
//   person answered it in the same sitting,
// - the card takes layer 3's place for the sitting, and the engine's adjustment returns the next time,
// - each mark is asked once: answered at the finish, so the next review does not ask again,
// - the server recomputes what was asked and refuses an answer that is missing, malformed or sent beside a choice about an adjustment,
// - nothing the person said is stored with the review (ids, fields and answers only), and one person's marks are never another's.
// Dates are from October 2026 (2026-10-05 is a Monday); case B is Monday 10-26 reviewing 10-19..10-25.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stillRightLabel, stillRightSentence } from '@/components/review/stillRightWording';
import { stillRightMarks } from '@/lib/review/stillRight';
import { getWeeklyReviewFacts } from '@/lib/services/review';
import { recordFinishedReview } from '@/lib/services/reviewRecords';
import type { TargetEdit, UnconfirmedStartingPoint } from '@/types/review';
import { ME, OTHER, add, gm, newId, resetGoalModel } from './helpers/fakeEntriesModel';
import { CASE_B_NOW, settingsRow, world } from './helpers/reviewWorld';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeEntriesModel');
  return { createSupabaseServerClient };
});

const NEXT_PLANNING_DAY = Date.UTC(2026, 10, 2, 19, 0, 0); // Monday 2026-11-02, noon in Los Angeles

beforeEach(() => {
  resetGoalModel({ id: ME });
  gm.dbNow = new Date(CASE_B_NOW).toISOString();
});

// ---------------------------------------------------------------------------
// What to ask: the pure choice
// ---------------------------------------------------------------------------

const edit = (over: Partial<TargetEdit> = {}): TargetEdit => ({
  targetId: 't1',
  title: 'Gym',
  measure: 'count',
  unit: null,
  period: 'weekly',
  floor: 2,
  aspiration: 3,
  days: null,
  weekStartsOn: 1,
  lastCounted: 1,
  effectiveFrom: '2026-10-26',
  today: '2026-10-26',
  ...over,
});

const point = (over: Partial<UnconfirmedStartingPoint> = {}): UnconfirmedStartingPoint => ({
  id: 'm1',
  kind: 'target',
  field: 'floor',
  subject: 'Gym',
  value: '2',
  createdAt: '2026-10-20T12:00:00.000Z',
  targetId: 't1',
  changed: false,
  ...over,
});

describe('stillRightMarks: which suggestions are asked', () => {
  const editFor = (id: string) => (id === 't1' ? edit() : id === 'days' ? edit({ targetId: 'days', period: 'day_slots', days: [1, 3] }) : null);

  it("asks a target's floor, aspiration and days, in the order they were made, with the edit of each target once", () => {
    const marks = stillRightMarks(
      [
        point({ id: 'a', field: 'floor' }),
        point({ id: 'b', field: 'aspiration' }),
        point({ id: 'c', field: 'slot_weekdays', targetId: 'days', value: '1,3' }),
      ],
      editFor,
    );
    expect(marks.asking).toEqual([
      { id: 'a', targetId: 't1', field: 'floor' },
      { id: 'b', targetId: 't1', field: 'aspiration' },
      { id: 'c', targetId: 'days', field: 'slot_weekdays' },
    ]);
    expect(marks.edits.map((e) => e.targetId)).toEqual(['t1', 'days']);
    expect(marks.changed).toEqual([]);
  });

  it('asks about nothing that cannot be changed in the app yet: other kinds, other target values, a target the edit does not cover', () => {
    const marks = stillRightMarks(
      [
        point({ id: 'person', kind: 'person', field: 'day_end', subject: null, targetId: null }),
        point({ id: 'daytype', kind: 'day_type', field: 'capacity_amount', targetId: null }),
        point({ id: 'goal', kind: 'goal', field: 'start_date', targetId: null }),
        point({ id: 'item', kind: 'work_item', field: 'due_date', targetId: null }),
        point({ id: 'threshold', field: 'qualifying_threshold' }),
        point({ id: 'due', field: 'due_date' }),
        point({ id: 'deadline', field: 'floor', targetId: 'a-deadline-target' }),
      ],
      editFor,
    );
    expect(marks).toEqual({ asking: [], changed: [], edits: [] });
  });

  it('asks nothing about an aspiration the target does not have, or days a weekly target does not count on', () => {
    const marks = stillRightMarks(
      [point({ id: 'a', field: 'aspiration' }), point({ id: 'd', field: 'slot_weekdays' })],
      () => edit({ aspiration: null, days: null }),
    );
    expect(marks.asking).toEqual([]);
  });

  it('sets aside a mark the person has already changed: not asked, and listed to be recorded as changed', () => {
    const marks = stillRightMarks([point({ id: 'a', field: 'floor', changed: true }), point({ id: 'b', field: 'aspiration' })], editFor);
    expect(marks.asking.map((i) => i.id)).toEqual(['b']);
    expect(marks.changed.map((i) => i.id)).toEqual(['a']);
  });
});

describe("the sentence for each suggestion: the saved value in setup's own words, with the target's name left to the card's heading", () => {
  const item = (field: 'floor' | 'aspiration' | 'slot_weekdays') => ({ id: 'm', targetId: 't1', field });

  it('says a floor as what still counts in a hard week, and never uses the word floor', () => {
    expect(stillRightSentence(item('floor'), edit({ title: 'Workouts', floor: 2 }))).toBe('2 workouts in a hard week still count.');
    expect(stillRightSentence(item('floor'), edit({ title: 'Workouts', floor: 1 }))).toBe('1 workout in a hard week still counts.');
  });

  it('says an aspiration as what the person is hoping for in a week', () => {
    expect(stillRightSentence(item('aspiration'), edit({ title: 'Workouts', aspiration: 3 }))).toBe('Hoping for 3 workouts a week.');
  });

  it('says days in the order of the person\'s own week', () => {
    const days = edit({ title: 'Gym', period: 'day_slots', days: [1, 3, 5] });
    expect(stillRightSentence(item('slot_weekdays'), days)).toBe('Counts on Mon, Wed and Fri.');
    // A week that starts on Sunday puts Sunday first.
    expect(stillRightSentence(item('slot_weekdays'), edit({ title: 'Gym', days: [1, 7], weekStartsOn: 0 }))).toBe('Counts on Sun and Mon.');
    expect(stillRightSentence(item('slot_weekdays'), edit({ title: 'Gym', days: [2], weekStartsOn: 1 }))).toBe('Counts on Tue.');
  });

  it("never repeats the target's name in the sentence, and names it in what a screen reader hears for the answers", () => {
    const floor = edit({ title: 'Workouts', floor: 2 });
    expect(stillRightSentence(item('floor'), floor)).not.toContain('Workouts');
    expect(stillRightLabel(item('floor'), floor)).toBe('Workouts: 2 workouts in a hard week still count');
    expect(stillRightLabel(item('aspiration'), edit({ title: 'Workouts', aspiration: 3 }))).toBe('Workouts: Hoping for 3 workouts a week');
  });

  it('counts a quantity in its unit and never says "aspiration" or "target"', () => {
    const run = edit({ title: 'Distance', measure: 'quantity', unit: 'km', floor: 10, aspiration: 15 });
    for (const field of ['floor', 'aspiration'] as const) {
      const sentence = stillRightSentence(item(field), run);
      expect(sentence).toMatch(/km/);
      expect(sentence).not.toMatch(/aspiration|target|floor/i);
    }
  });
});

// ---------------------------------------------------------------------------
// The review's facts, and the finish
// ---------------------------------------------------------------------------

// A person with a slipping week (weeks 10-12 and 10-19 missed), planning on Mondays: the engine offers a slipping check-in.
function slippingPerson(userId = ME) {
  const mine = world(userId, userId === ME ? 'My' : 'Their');
  mine.log('2026-10-05', 3);
  mine.log('2026-10-12');
  mine.log('2026-10-19');
  add('person_settings', settingsRow(userId, { planning_weekday: 1 }));
  return mine;
}

// A setup suggestion the person took, on the world's target.
function mark(userId: string, targetId: unknown, field: string, over: Record<string, unknown> = {}) {
  return add('starting_points', {
    id: newId(),
    user_id: userId,
    subject_kind: 'target',
    day_type_id: null,
    goal_id: null,
    target_id: targetId,
    work_item_id: null,
    field,
    created_at: `2026-10-0${5 + gm.tables.starting_points.length}T12:00:00.000Z`,
    answered_at: null,
    outcome: null,
    ...over,
  });
}

const ready = async (now = CASE_B_NOW) => {
  const r = await getWeeklyReviewFacts({ now: () => now });
  if (!r.ok || r.data.state !== 'ready') throw new Error('not ready');
  return r.data;
};
const marksOf = (userId = ME) => gm.tables.starting_points.filter((m) => m.user_id === userId);
const change = (targetId: unknown, over: Record<string, unknown> = {}) =>
  add('target_changes', { id: newId(), user_id: ME, target_id: targetId, effective_from: '2026-11-02', floor: 2, aspiration: 4, slot_weekdays: null, ...over });

describe('the review asks "Still right for you?" in layer 3\'s place', () => {
  it("asks the target's floor and aspiration, and holds the engine's adjustment back for the sitting", async () => {
    const mine = slippingPerson();
    const floor = mark(ME, mine.target.id, 'floor');
    const aspiration = mark(ME, mine.target.id, 'aspiration');
    const data = await ready();
    expect(data.stillRight.asking.map((i) => i.id)).toEqual([floor.id, aspiration.id]);
    expect(data.stillRight.edits.map((e) => e.targetId)).toEqual([mine.target.id]);
    // Layer 3's one question comes back next review: the pattern is still there then.
    expect(data.adjustment).toBeNull();
    expect(data.edit).toBeNull();
  });

  it("raises the engine's adjustment as before when there is nothing to ask", async () => {
    slippingPerson();
    const data = await ready();
    expect(data.stillRight).toEqual({ asking: [], changed: [], edits: [] });
    expect(data.adjustment).toMatchObject({ kind: 'slipping_check_in' });
  });

  it('does not ask about marks that have no edit path yet, and does not touch them', async () => {
    const mine = slippingPerson();
    add('starting_points', {
      id: newId(),
      user_id: ME,
      subject_kind: 'person',
      day_type_id: null,
      goal_id: null,
      target_id: null,
      work_item_id: null,
      field: 'day_end',
      created_at: '2026-10-05T12:00:00.000Z',
      answered_at: null,
      outcome: null,
    });
    mark(ME, mine.target.id, 'qualifying_threshold');
    const data = await ready();
    expect(data.stillRight.asking).toEqual([]);
    expect(data.adjustment).toMatchObject({ kind: 'slipping_check_in' });
    expect(await recordFinishedReview('declined', { now: () => CASE_B_NOW })).toMatchObject({ ok: true });
    expect(marksOf().every((m) => m.answered_at === null && m.outcome === null)).toBe(true);
  });

  it('does not ask about a mark that was answered, or that belongs to someone else', async () => {
    const mine = slippingPerson();
    mark(ME, mine.target.id, 'floor', { answered_at: '2026-10-12T12:00:00.000Z', outcome: 'kept' });
    const theirs = world(OTHER, 'Their');
    mark(OTHER, theirs.target.id, 'floor');
    const data = await ready();
    expect(data.stillRight.asking).toEqual([]);
  });

  it("does not ask about a target the person has changed: the mark is theirs to skip (MOM-146's saved change counts)", async () => {
    const mine = slippingPerson();
    const floor = mark(ME, mine.target.id, 'floor');
    mark(ME, mine.target.id, 'aspiration');
    change(mine.target.id);
    const data = await ready();
    expect(data.stillRight.asking).toEqual([]);
    expect(data.stillRight.changed.map((i) => i.id)).toContain(floor.id);
    expect(data.adjustment).toMatchObject({ kind: 'slipping_check_in' });
  });
});

describe('finishing a review that asked "Still right for you?"', () => {
  async function asked() {
    const mine = slippingPerson();
    const floor = mark(ME, mine.target.id, 'floor');
    const aspiration = mark(ME, mine.target.id, 'aspiration');
    return { mine, floor, aspiration };
  }
  const finish = (outcome: unknown, answers: unknown) => recordFinishedReview(outcome, { now: () => CASE_B_NOW }, answers);

  it("records each answer through answerStartingPoint, and stores the review as 'still_right' with ids, fields and answers only", async () => {
    const { floor, aspiration } = await asked();
    const result = await finish(null, { [floor.id as string]: 'kept', [aspiration.id as string]: 'changed' });
    expect(result.ok).toBe(true);
    expect(marksOf().map((m) => [m.id, m.outcome])).toEqual([
      [floor.id, 'kept'],
      [aspiration.id, 'changed'],
    ]);
    expect(marksOf().every((m) => typeof m.answered_at === 'string')).toBe(true);
    const [record] = gm.tables.weekly_reviews;
    expect(record).toMatchObject({ adjustment_kind: 'still_right', adjustment_outcome: 'changed' });
    expect(record.adjustment).toEqual({
      v: 1,
      items: [
        { id: floor.id, field: 'floor', outcome: 'kept' },
        { id: aspiration.id, field: 'aspiration', outcome: 'changed' },
      ],
    });
    // Nothing the person said: the exact shape above holds no title and no number, and the target's title is not in it.
    expect(JSON.stringify(record.adjustment)).not.toContain('workouts');
  });

  it("counts a review where everything fits as 'declined' (nothing was changed)", async () => {
    const { floor, aspiration } = await asked();
    await finish(null, { [floor.id as string]: 'kept', [aspiration.id as string]: 'kept' });
    expect(gm.tables.weekly_reviews[0]).toMatchObject({ adjustment_kind: 'still_right', adjustment_outcome: 'declined' });
  });

  it('needs an answer for every suggestion that was asked, and writes nothing without one', async () => {
    const { floor } = await asked();
    expect(await finish(null, { [floor.id as string]: 'kept' })).toEqual({ ok: false, error: 'That choice could not be read. Nothing was saved.' });
    expect(await finish(null, undefined)).toMatchObject({ ok: false });
    expect(gm.tables.weekly_reviews).toEqual([]);
    expect(marksOf().every((m) => m.answered_at === null)).toBe(true);
  });

  it("refuses a choice about layer 3's adjustment beside the card: the card took its place", async () => {
    const { floor, aspiration } = await asked();
    const result = await finish('declined', { [floor.id as string]: 'kept', [aspiration.id as string]: 'kept' });
    expect(result).toMatchObject({ ok: false });
    expect(gm.tables.weekly_reviews).toEqual([]);
  });

  it('refuses an answer that is neither kept nor changed, and answers that are not a plain object', async () => {
    const { floor, aspiration } = await asked();
    for (const bad of [{ [floor.id as string]: 'maybe', [aspiration.id as string]: 'kept' }, 'kept', ['kept'], { [floor.id as string]: { outcome: 'kept' } }]) {
      expect(await finish(null, bad)).toMatchObject({ ok: false });
    }
    expect(gm.tables.weekly_reviews).toEqual([]);
  });

  it("ignores an id that is not one of this review's suggestions, so it can touch no one else's mark", async () => {
    const { floor, aspiration } = await asked();
    const theirs = world(OTHER, 'Their');
    const theirMark = mark(OTHER, theirs.target.id, 'floor');
    const result = await finish(null, { [floor.id as string]: 'kept', [aspiration.id as string]: 'kept', [theirMark.id as string]: 'changed', 'not-an-id': 'kept' });
    expect(result.ok).toBe(true);
    expect(theirMark.answered_at).toBeNull();
    expect(theirMark.outcome).toBeNull();
  });

  it("asks each suggestion once: the next review does not ask again, and layer 3's question is back", async () => {
    const { floor, aspiration } = await asked();
    await finish(null, { [floor.id as string]: 'kept', [aspiration.id as string]: 'kept' });
    const next = await ready(NEXT_PLANNING_DAY);
    expect(next.stillRight.asking).toEqual([]);
  });

  it("records a suggestion the person already changed as changed, and takes the person's own answer over that when they gave one", async () => {
    const { mine, floor, aspiration } = await asked();
    // They changed the target in the form (saved a change), but said the aspiration still fits.
    change(mine.target.id);
    const result = await finish(null, { [floor.id as string]: 'changed', [aspiration.id as string]: 'kept' });
    expect(result.ok).toBe(true);
    expect(marksOf().map((m) => [m.id, m.outcome])).toEqual([
      [floor.id, 'changed'],
      [aspiration.id, 'kept'],
    ]);
    expect(gm.tables.weekly_reviews[0]).toMatchObject({ adjustment_kind: 'still_right', adjustment_outcome: 'changed' });
  });

  it("is still the card's review when the person's own change moved every suggestion out of the asked list, and takes no choice about an adjustment", async () => {
    const { mine, floor, aspiration } = await asked();
    change(mine.target.id);
    // The engine's slipping adjustment is back in the facts now, but the card is what this sitting showed.
    expect(await finish('declined', { [floor.id as string]: 'changed', [aspiration.id as string]: 'changed' })).toMatchObject({ ok: false });
    const result = await finish(null, { [floor.id as string]: 'changed', [aspiration.id as string]: 'changed' });
    expect(result.ok).toBe(true);
    expect(gm.tables.weekly_reviews[0]).toMatchObject({ adjustment_kind: 'still_right', adjustment_outcome: 'changed' });
  });

  it("records an earlier change as changed even when nothing was asked, and the review keeps the engine's adjustment", async () => {
    const mine = slippingPerson();
    const floor = mark(ME, mine.target.id, 'floor');
    change(mine.target.id);
    const result = await finish('declined', undefined);
    expect(result.ok).toBe(true);
    expect(floor.outcome).toBe('changed');
    expect(gm.tables.weekly_reviews[0]).toMatchObject({ adjustment_kind: 'slipping_check_in', adjustment_outcome: 'declined' });
  });

  it('still finishes the review when an answer cannot be written, logs only a code, and leaves that suggestion to be asked again', async () => {
    const { floor, aspiration } = await asked();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    gm.failNextWrite = { table: 'starting_points', message: 'could not write row {"title":"My workouts"}' };
    const result = await finish(null, { [floor.id as string]: 'kept', [aspiration.id as string]: 'kept' });
    expect(result.ok).toBe(true);
    expect(gm.tables.weekly_reviews).toHaveLength(1);
    expect(marksOf().filter((m) => m.answered_at === null)).toHaveLength(1);
    expect(JSON.stringify(error.mock.calls)).not.toContain('My workouts');
    error.mockRestore();
  });

  it('adds no suggestion to the review that did not ask one: finishing as before records no answers', async () => {
    slippingPerson();
    expect((await finish('skipped', undefined)).ok).toBe(true);
    expect(gm.tables.weekly_reviews[0]).toMatchObject({ adjustment_kind: 'slipping_check_in', adjustment_outcome: 'skipped' });
    expect(gm.writes.filter((w) => w.table === 'starting_points')).toEqual([]);
  });
});
