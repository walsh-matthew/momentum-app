// getReviewLine (lib/services/reviewReflection.ts, MOM-113 block 3.3): layer 2 of the weekly review against the in-memory goal
// model (tests/helpers/fakeEntriesModel.ts) and the in-memory usage log (tests/helpers/fakeLlmUsage.ts). The model is a stub and
// `fetch` throws. What these hold the service to:
// - Claude is asked only for a review that is ready, whose depth offers a line, and that has something to look back on;
// - what is sent is built on the server from the person's own rows (their target titles, the week's words, the tone) and carries
//   no goal title, priority, count, date, id or another person's data;
// - a refused ask makes no call and no usage row; the line is not stored anywhere.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { REVIEW_MODEL } from '@/lib/ai/review';
import { buildReflectionFacts, type ReflectionFacts } from '@/lib/review/reflection';
import { getReviewLine } from '@/lib/services/reviewReflection';
import { getWeeklyReviewFacts } from '@/lib/services/review';
import { recordFinishedReview } from '@/lib/services/reviewRecords';
import { ME, OTHER, add, gm, newId, resetGoalModel } from './helpers/fakeEntriesModel';
import { resetUsage, rowsFor, usage } from './helpers/fakeLlmUsage';
import { CASE_B_NOW, NOT_DUE_NOW, settingsRow, world } from './helpers/reviewWorld';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeEntriesModel');
  return { createSupabaseServerClient };
});
vi.mock('@/lib/supabase/admin', async () => {
  const { createSupabaseAdminClient } = await import('./helpers/fakeLlmUsage');
  return { createSupabaseAdminClient };
});

const GOOD = 'You kept My workouts moving even in a slower week.';
const stub = (line: unknown = GOOD) =>
  vi.fn(async (..._args: unknown[]) => ({ ok: true as const, raw: { line }, model: REVIEW_MODEL, usage: { inputTokens: 800, outputTokens: 30 } }) as never);

const deps = (requestLine: ReturnType<typeof stub>, now = CASE_B_NOW) => ({
  now: () => now,
  line: { requestLine, nowMs: () => usage.nowMs, sleep: async (ms: number) => void (usage.nowMs += ms) },
});

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  resetGoalModel({ id: ME });
  gm.dbNow = new Date(CASE_B_NOW).toISOString();
  resetUsage();
  fetchSpy = vi.fn(() => {
    throw new Error('the network must not be reached from a unit test');
  });
  vi.stubGlobal('fetch', fetchSpy);
});

// A slipping week for the review of 2026-10-19..10-25 (planning on Mondays, now Monday 2026-10-26).
function slippingPerson(userId = ME, title = 'My') {
  const mine = world(userId, title);
  mine.log('2026-10-05', 3);
  mine.log('2026-10-12');
  mine.log('2026-10-19');
  add('person_settings', settingsRow(userId, { planning_weekday: 1 }));
  return mine;
}

describe('asking for the review line', () => {
  it('asks Claude once, with the facts built on the server from the person\'s own rows, and returns the line', async () => {
    const mine = slippingPerson();
    mine.priority('Family time');
    const read = await getWeeklyReviewFacts({ now: () => CASE_B_NOW });
    if (!read.ok || read.data.state !== 'ready') throw new Error('not ready');

    const model = stub();
    const result = await getReviewLine(deps(model));
    expect(result).toEqual({ ok: true, data: { kind: 'line', line: GOOD, source: 'claude', calls: 1 } });

    const expected: ReflectionFacts = buildReflectionFacts(read.data.recap, read.data.targets, read.data.tone);
    expect(model).toHaveBeenCalledTimes(1);
    expect(model.mock.calls[0][0]).toEqual({ facts: expected, retryFeedback: [] });
    expect(expected.targets).toEqual([{ title: 'My workouts', level: 'partway', crossings: [], patterns: ['slipping'], trend: null }]);
    expect(expected.tone).toBe(read.data.tone);

    // What was sent: the title and words, never the goal's title, a priority, a count, a date or an id.
    const sent = JSON.stringify(model.mock.calls[0][0]);
    expect(sent).toContain('My workouts');
    expect(sent).not.toContain('My goal');
    expect(sent).not.toContain('Family time');
    expect(sent).not.toMatch(/\d/);
    expect(sent).not.toContain(mine.target.id);
    expect(sent).not.toContain(ME);

    expect(rowsFor(ME).map((r) => [r.feature, r.outcome])).toEqual([['weekly_review', 'ok']]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('writes nothing to the review record or anywhere else: the line is not stored', async () => {
    slippingPerson();
    await getReviewLine(deps(stub()));
    expect(gm.tables.weekly_reviews).toHaveLength(0);
    expect(gm.writes).toEqual([]);
  });

  it('never sends another person\'s data, and never reads it', async () => {
    slippingPerson();
    const theirs = slippingPerson(OTHER, 'Their');
    theirs.priority('Their secret');
    const model = stub();
    await getReviewLine(deps(model));
    const sent = JSON.stringify(model.mock.calls[0][0]);
    expect(sent).toContain('My workouts');
    expect(sent).not.toContain('Their');
    expect(sent).not.toContain(OTHER);
    expect(rowsFor(OTHER)).toEqual([]);
  });

  it('shows a line written by code when Claude\'s reply fails its checks twice', async () => {
    slippingPerson();
    const model = stub('You lifted on 3 days.');
    const result = await getReviewLine(deps(model));
    expect(result).toMatchObject({ ok: true, data: { kind: 'line', source: 'fallback', calls: 2 } });
    expect(model).toHaveBeenCalledTimes(2);
  });

  it('tells the screen a limit stopped it, in words, when the budget is used', async () => {
    slippingPerson();
    // Two asks of two calls each use the day's four; the clock moves on between them, past the 1 second spacing.
    for (let i = 0; i < 2; i++) {
      await getReviewLine(deps(stub('Is that enough?')));
      usage.nowMs += 60_000;
    }
    const model = stub();
    const result = await getReviewLine(deps(model));
    expect(result).toMatchObject({ ok: true, data: { kind: 'unavailable', reason: 'review_budget' } });
    expect(model).not.toHaveBeenCalled();
  });
});

describe('when no line is asked for', () => {
  const refusedWithNoCall = async (model: ReturnType<typeof stub>, error: string) => {
    const result = await getReviewLine(deps(model));
    expect(result).toEqual({ ok: false, error });
    expect(model).not.toHaveBeenCalled();
    expect(usage.reserveCalls).toHaveLength(0);
    expect(usage.rows).toHaveLength(0);
  };

  it('is signed out', async () => {
    resetGoalModel(null);
    await refusedWithNoCall(stub(), 'Sign in to get a line for your weekly review.');
  });

  it('is not the planning day, so no review is ready', async () => {
    slippingPerson();
    const model = stub();
    const result = await getReviewLine(deps(model, NOT_DUE_NOW));
    expect(result).toEqual({ ok: false, error: 'There is no weekly review to add a line to right now.' });
    expect(model).not.toHaveBeenCalled();
    expect(usage.rows).toHaveLength(0);
  });

  it('has no goals', async () => {
    add('person_settings', settingsRow(ME, { planning_weekday: 1 }));
    await refusedWithNoCall(stub(), 'There is no weekly review to add a line to right now.');
  });

  it('is a review already finished for the week', async () => {
    slippingPerson();
    expect((await recordFinishedReview('declined', { now: () => CASE_B_NOW })).ok).toBe(true);
    await refusedWithNoCall(stub(), 'There is no weekly review to add a line to right now.');
  });

  it('follows the review depth: recap only offers no line', async () => {
    const mine = world(ME, 'My');
    mine.log('2026-10-05', 3);
    mine.log('2026-10-12');
    mine.log('2026-10-19');
    add('person_settings', settingsRow(ME, { planning_weekday: 1, review_depth: 'recap_only' }));
    await refusedWithNoCall(stub(), 'Your review depth is set to the recap only, so no line is offered.');
  });

  it('offers a line for the other two depths', async () => {
    for (const depth of ['recap_offer', 'full']) {
      resetGoalModel({ id: ME });
      resetUsage();
      const mine = world(ME, 'My');
      mine.log('2026-10-05', 3);
      add('person_settings', settingsRow(ME, { planning_weekday: 1, review_depth: depth }));
      expect(await getReviewLine(deps(stub()))).toMatchObject({ ok: true, data: { kind: 'line' } });
    }
  });

  it('has nothing to look back on: a goal with no target that finished a week', async () => {
    add('goals', {
      id: newId(),
      user_id: ME,
      title: 'Empty goal',
      state: 'active',
      shape: 'ongoing',
      start_date: '2026-10-05',
      end_date: null,
      created_at: '2026-10-05T00:00:00.000Z',
    });
    add('person_settings', settingsRow(ME, { planning_weekday: 1 }));
    await refusedWithNoCall(stub(), 'No target finished a week in this period, so there is nothing for a line to look back on.');
  });

  it('cannot read the review', async () => {
    slippingPerson();
    gm.failNextRead = { table: 'goals', message: 'connection refused' };
    const model = stub();
    const result = await getReviewLine(deps(model));
    expect(result.ok).toBe(false);
    expect(model).not.toHaveBeenCalled();
  });
});
