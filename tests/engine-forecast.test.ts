// The deadline forecast (lib/engine/forecast.ts, docs/DOMAIN_MODEL.md §1.4, §3.2, principle 12): whether the work
// left fits the time left, from rough data, with no slot and no free time in what it returns.

import { describe, expect, it } from 'vitest';
import { forecastDeadline } from '@/lib/engine';
import type { ForecastRequest } from '@/types/scoreboard';

const TODAY = '2026-10-14';

// `n` consecutive days from today, each with the same capacity for this item.
const days = (n: number, capacity: number, from = TODAY) =>
  Array.from({ length: n }, (_, i) => ({
    date: new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10),
    capacity,
  }));

// 10 steps, 4 done, 8 logged: 2 a step, so about 12 left, between 9 and 15 allowing for rough data.
const request = (over: Partial<ForecastRequest> = {}): ForecastRequest => ({
  itemId: 'i1',
  dueDate: '2026-10-31',
  canMove: false,
  steps: { total: 10, done: 4 },
  logged: 8,
  estimateRemaining: null,
  availableDays: days(8, 2),
  ...over,
});

describe('the verdict', () => {
  it('fits when even the larger estimate of the work fits the capacity', () => {
    expect(forecastDeadline(request({ availableDays: days(8, 2) }), TODAY)).toMatchObject({ verdict: 'fits', basis: 'logged_pace' });
  });

  it('is tight when the work could go either way, because the data is rough', () => {
    expect(forecastDeadline(request({ availableDays: days(6, 2) }), TODAY).verdict).toBe('tight');
  });

  it('does not fit when even the smaller estimate of the work is more than the capacity', () => {
    expect(forecastDeadline(request({ availableDays: days(4, 2) }), TODAY).verdict).toBe('does_not_fit');
  });

  it('counts only the days from today to the due date', () => {
    const outside = [{ date: '2026-10-13', capacity: 100 }, ...days(4, 2), { date: '2026-11-02', capacity: 100 }];
    expect(forecastDeadline(request({ availableDays: outside }), TODAY)).toMatchObject({ verdict: 'does_not_fit', daysLeft: 4 });
  });

  it('is done when no step is left, even after the due date', () => {
    expect(forecastDeadline(request({ steps: { total: 3, done: 3 }, dueDate: '2026-10-10' }), TODAY).verdict).toBe('done');
  });

  it('is past due when the date has passed with steps left', () => {
    expect(forecastDeadline(request({ dueDate: '2026-10-10' }), TODAY)).toMatchObject({ verdict: 'past_due', stepsRemaining: 6 });
  });

  it('says so when there is nothing to go on', () => {
    const r = request({ steps: { total: 10, done: 0 }, logged: 0 });
    expect(forecastDeadline(r, TODAY)).toMatchObject({ verdict: 'not_enough_data', basis: 'none', options: [] });
  });
});

describe('rough data', () => {
  it('works from one finished step and a rough amount logged', () => {
    const r = request({ steps: { total: 4, done: 1 }, logged: 1, availableDays: days(5, 1) });
    // 3 steps left at about 1 each: between 2.25 and 3.75, against 5.
    expect(forecastDeadline(r, TODAY).verdict).toBe('fits');
  });

  it('uses the person’s own estimate when nothing is logged', () => {
    const r = request({ steps: { total: 3, done: 0 }, logged: 0, estimateRemaining: { low: 5, high: 8 }, availableDays: days(5, 2) });
    expect(forecastDeadline(r, TODAY)).toMatchObject({ verdict: 'fits', basis: 'own_estimate' });
  });

  it('falls back to the estimate when time is logged but no step is finished', () => {
    const r = request({ steps: { total: 3, done: 0 }, logged: 4, estimateRemaining: { low: 5, high: 8 } });
    expect(forecastDeadline(r, TODAY).basis).toBe('own_estimate');
  });

  it('works for an item with no steps when the person gave an estimate', () => {
    const r = request({ steps: { total: 0, done: 0 }, logged: 0, estimateRemaining: { low: 1, high: 2 }, availableDays: days(2, 2) });
    expect(forecastDeadline(r, TODAY).verdict).toBe('fits');
  });
});

describe('the options on a forecast that no longer fits', () => {
  const noFit = { availableDays: days(4, 2) };

  it('offers more time, a smaller scope and accepting the risk', () => {
    expect(forecastDeadline(request({ ...noFit, canMove: false }), TODAY).options).toEqual(['more_time', 'smaller_scope', 'accept_risk']);
  });

  it('offers moving the date only when setup recorded that it can move', () => {
    expect(forecastDeadline(request({ ...noFit, canMove: true }), TODAY).options).toEqual([
      'more_time',
      'smaller_scope',
      'move_date',
      'accept_risk',
    ]);
  });

  it('offers none for a forecast that fits or is tight', () => {
    expect(forecastDeadline(request({ canMove: true }), TODAY).options).toEqual([]);
    expect(forecastDeadline(request({ canMove: true, availableDays: days(6, 2) }), TODAY).options).toEqual([]);
  });
});

describe('never a slot, never free minutes', () => {
  it('returns only the verdict and counts of steps and days', () => {
    const forecast = forecastDeadline(request({ availableDays: days(8, 7777) }), TODAY);
    expect(Object.keys(forecast).sort()).toEqual(['basis', 'canMove', 'daysLeft', 'itemId', 'options', 'stepsRemaining', 'verdict']);
  });

  it('carries no capacity figure and nothing that names a slot or free time', () => {
    const json = JSON.stringify(forecastDeadline(request({ availableDays: days(8, 7777) }), TODAY));
    expect(json).not.toMatch(/slot|free|minute|hour|capacity/i);
    expect(json).not.toContain('7777');
    expect(json).not.toContain('62216'); // 8 days of 7777
  });
});

describe('bad input is refused', () => {
  it('steps done above the total', () => {
    expect(() => forecastDeadline(request({ steps: { total: 2, done: 3 } }), TODAY)).toThrow(/steps/);
  });
  it('negative logged work or capacity', () => {
    expect(() => forecastDeadline(request({ logged: -1 }), TODAY)).toThrow(/logged/);
    expect(() => forecastDeadline(request({ availableDays: [{ date: TODAY, capacity: -1 }] }), TODAY)).toThrow(/capacity/);
  });
  it('an estimate that is not low to high', () => {
    expect(() => forecastDeadline(request({ estimateRemaining: { low: 5, high: 2 } }), TODAY)).toThrow(/estimate/);
  });
  it('a due date that is not a date', () => {
    expect(() => forecastDeadline(request({ dueDate: 'soon' }), TODAY)).toThrow(/not a date/);
  });
});
