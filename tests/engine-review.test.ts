// The weekly review's engine-side facts (lib/engine/review.ts, docs/DOMAIN_MODEL.md §3, MOM-113 block 1). Dates are
// from October 2026: 2026-10-05 is a Monday (tests/helpers/engineFixtures.ts), so a Monday-start week runs 05 to 11.

import { describe, expect, it } from 'vitest';
import { buildLayer1Facts, selectLayerThreeAdjustment, weeklyReviewWindow } from '@/lib/engine';
import { periodResult } from './helpers/engineFixtures';
import type { Crossing, DeadlineForecast, Pattern, ReviewWindow, Trend } from '@/types/scoreboard';

const WINDOW: ReviewWindow = { start: '2026-10-05', end: '2026-10-11' };

describe('weeklyReviewWindow', () => {
  it('covers the week ending today when the planning day is a week’s own last day', () => {
    // Monday week start (1): the week’s own last day is Sunday (0). Planning on that Sunday reviews it, same day.
    expect(weeklyReviewWindow('2026-10-11', 1, 0)).toEqual(WINDOW);
  });

  it('covers the week that ended before this one started when the planning day is not the last day', () => {
    // Planning on the following Monday (1), the first day of the next week, reviews the week that ended yesterday.
    expect(weeklyReviewWindow('2026-10-12', 1, 1)).toEqual(WINDOW);
  });

  it('covers the week ending a few days before a mid-week planning day', () => {
    // Planning on Wednesday (3) reviews the Monday-start week that ended the Sunday before.
    expect(weeklyReviewWindow('2026-10-14', 1, 3)).toEqual(WINDOW);
  });

  it('is null when the week start has not been chosen yet', () => {
    expect(weeklyReviewWindow('2026-10-11', null, 0)).toBeNull();
  });

  it('is null when the planning day has not been chosen yet', () => {
    expect(weeklyReviewWindow('2026-10-11', 1, null)).toBeNull();
  });

  it('is null and guesses nothing when today is not the planning day', () => {
    expect(weeklyReviewWindow('2026-10-07', 1, 0)).toBeNull();
  });
});

describe('buildLayer1Facts', () => {
  it('shows a target whose period closed in the reviewed week, with its crossings, patterns and trend', () => {
    const result = periodResult('floor', { targetId: 't1', periodStart: '2026-10-05', periodEnd: '2026-10-11' });
    const inWindow: Crossing = { kind: 'floor', targetId: 't1', periodStart: '2026-10-05', on: '2026-10-07' };
    const beforeWindow: Crossing = { kind: 'floor', targetId: 't1', periodStart: '2026-09-28', on: '2026-09-30' };
    const pattern: Pattern = { kind: 'slipping', targetId: 't1', periods: 2, endingPeriodStart: '2026-10-05' };
    const trend: Trend = { targetId: 't1', counts: [1, 2, 3], direction: 'up' };

    const facts = buildLayer1Facts(
      { results: [result], history: [], crossings: [inWindow, beforeWindow], patterns: [pattern], trends: [trend] },
      WINDOW,
    );

    expect(facts).toEqual([{ targetId: 't1', result, crossings: [inWindow], patterns: [pattern], trend }]);
  });

  it('leaves out a target whose period did not close in the reviewed week', () => {
    const olderWeek = periodResult('none', { targetId: 't2', periodStart: '2026-09-28', periodEnd: '2026-10-04' });
    const facts = buildLayer1Facts({ results: [], history: [olderWeek], crossings: [], patterns: [], trends: [] }, WINDOW);
    expect(facts).toEqual([]);
  });

  it('sorts by target id so the same inputs always come back in the same order', () => {
    const b = periodResult('floor', { targetId: 'tB', periodStart: '2026-10-05', periodEnd: '2026-10-11' });
    const a = periodResult('floor', { targetId: 'tA', periodStart: '2026-10-05', periodEnd: '2026-10-11' });
    const facts = buildLayer1Facts({ results: [b, a], history: [], crossings: [], patterns: [], trends: [] }, WINDOW);
    expect(facts.map((f) => f.targetId)).toEqual(['tA', 'tB']);
  });

  it('shows a target that is tracked but not graded (started partway), never as a miss', () => {
    const result = periodResult(null, { targetId: 't1', periodStart: '2026-10-05', periodEnd: '2026-10-11', startedPartway: true, graded: false });
    const facts = buildLayer1Facts({ results: [result], history: [], crossings: [], patterns: [], trends: [] }, WINDOW);
    expect(facts).toEqual([{ targetId: 't1', result, crossings: [], patterns: [], trend: null }]);
  });
});

describe('selectLayerThreeAdjustment', () => {
  const slipping = (targetId: string, periods: number, endingPeriodStart = WINDOW.start): Pattern => ({
    kind: 'slipping',
    targetId,
    periods,
    endingPeriodStart,
  });
  const aspirationRepeated = (targetId: string, periods: number): Pattern => ({
    kind: 'aspiration_repeated',
    targetId,
    periods,
    endingPeriodStart: WINDOW.start,
  });
  const forecast = (over: Partial<DeadlineForecast> = {}): DeadlineForecast => ({
    itemId: 'i1',
    verdict: 'tight',
    basis: 'logged_pace',
    stepsRemaining: 2,
    daysLeft: 5,
    canMove: false,
    options: ['more_time', 'smaller_scope'],
    ...over,
  });

  it('is null when nothing is raised', () => {
    expect(selectLayerThreeAdjustment({ patterns: [], forecasts: [] }, WINDOW)).toBeNull();
  });

  it('raises a slipping pattern ending in the reviewed week', () => {
    expect(selectLayerThreeAdjustment({ patterns: [slipping('t1', 2)], forecasts: [] }, WINDOW)).toEqual({
      kind: 'slipping_check_in',
      targetId: 't1',
      periods: 2,
    });
  });

  it('raises an aspiration hit repeatedly when nothing is slipping', () => {
    expect(selectLayerThreeAdjustment({ patterns: [aspirationRepeated('t1', 3)], forecasts: [] }, WINDOW)).toEqual({
      kind: 'rebaseline',
      targetId: 't1',
      periods: 3,
    });
  });

  it('ignores a pattern whose run does not end in the reviewed week', () => {
    expect(selectLayerThreeAdjustment({ patterns: [slipping('t1', 2, '2026-09-28')], forecasts: [] }, WINDOW)).toBeNull();
  });

  it('prefers a strained deadline forecast over a slipping pattern or a re-baseline', () => {
    const out = selectLayerThreeAdjustment(
      { patterns: [slipping('t1', 2), aspirationRepeated('t2', 3)], forecasts: [forecast()] },
      WINDOW,
    );
    expect(out).toEqual({ kind: 'deadline_forecast', itemId: 'i1', verdict: 'tight', options: ['more_time', 'smaller_scope'] });
  });

  it('ignores a forecast that still fits', () => {
    expect(selectLayerThreeAdjustment({ patterns: [slipping('t1', 2)], forecasts: [forecast({ verdict: 'fits' })] }, WINDOW)).toEqual({
      kind: 'slipping_check_in',
      targetId: 't1',
      periods: 2,
    });
  });

  it('breaks a forecast tie on severity, then the fewest days left, then the item id', () => {
    const worse = forecast({ itemId: 'i-tight-far', verdict: 'tight', daysLeft: 10 });
    const worst = forecast({ itemId: 'i-does-not-fit', verdict: 'does_not_fit', daysLeft: 20 });
    const closer = forecast({ itemId: 'i-tight-near', verdict: 'tight', daysLeft: 3 });
    const out = selectLayerThreeAdjustment({ patterns: [], forecasts: [worse, worst, closer] }, WINDOW);
    expect(out).toMatchObject({ itemId: 'i-does-not-fit' });

    const tiedSeverity = selectLayerThreeAdjustment({ patterns: [], forecasts: [worse, closer] }, WINDOW);
    expect(tiedSeverity).toMatchObject({ itemId: 'i-tight-near' });
  });

  it('breaks a pattern tie on the longest run, then the target id', () => {
    const out = selectLayerThreeAdjustment({ patterns: [slipping('tB', 2), slipping('tA', 4), slipping('tC', 4)], forecasts: [] }, WINDOW);
    expect(out).toEqual({ kind: 'slipping_check_in', targetId: 'tA', periods: 4 });
  });
});
