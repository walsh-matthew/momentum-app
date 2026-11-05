// Test day 1 (MOM-180 B1): a 2-hours-a-week writing floor read "Floor 120 a week" on the Home card. A time target is stored in minutes
// and has no unit text, so Home now says the unit the way the setup playback does. Display only.

import { describe, expect, it } from 'vitest';
import { amountText, levelsText, toAspirationLine } from '@/components/home/wording';
import { amount, amountOf } from '@/lib/setup/playback';

const time = (title: string, floor: number, aspiration: number | null = null) =>
  ({ title, measure: 'time', unit: null, floor, aspiration, period: 'weekly', dueOn: null }) as never;

describe('Home shows a time target in hours or minutes, never a bare number', () => {
  it('120 minutes reads "2 hours", 45 reads "45 minutes"', () => {
    expect(amountText(time('Writing', 0), 120)).toBe('2 hours');
    expect(amountText(time('Writing', 0), 45)).toBe('45 minutes');
    expect(amountText(time('Writing', 0), 60)).toBe('1 hour');
    expect(amountText(time('Writing', 0), 1)).toBe('1 minute');
  });

  it('the floor line, the aspiration and what is left to it', () => {
    expect(levelsText(time('Writing', 120))).toBe('Floor 2 hours a week');
    expect(levelsText(time('Writing', 45))).toBe('Floor 45 minutes a week');
    expect(levelsText(time('Writing', 120, 180))).toBe('Floor 2 hours a week · aspiration 3 hours');
    expect(toAspirationLine({ ...(time('Writing', 120, 180) as object), status: 'counted', graded: true, level: 'floor', remainingToAspiration: 30 } as never)).toBe(
      '30 minutes more to reach your aspiration',
    );
  });

  it('words that name hours read in hours; words that name minutes keep minutes', () => {
    expect(amountText(time('Hours of reading', 0), 90)).toBe('1.5 hours');
    expect(amountText(time('Minutes of practice', 0), 120)).toBe('120 minutes');
  });

  it('a target that is not a time keeps its number and unit', () => {
    expect(levelsText({ title: 'Pounds lifted', measure: 'quantity', unit: 'pounds', floor: 15, aspiration: 20, period: 'weekly', dueOn: null } as never)).toBe(
      'Floor 15 pounds a week · aspiration 20 pounds',
    );
    expect(levelsText({ title: 'Runs', measure: 'count', unit: null, floor: 3, aspiration: null, period: 'weekly', dueOn: null } as never)).toBe('Floor 3 a week');
  });
});

// The setup playback follows the same rule (MOM-180 B1): whole hours read in hours, otherwise minutes; words that name hours always read in hours.
describe('the setup playback reads a time the same way', () => {
  const writing = { title: 'Writing', measure: 'time' as const, unit: null };

  it('120 minutes of writing reads "2 hours", 45 reads "45 minutes"', () => {
    expect(amount(writing, 120)).toBe('2 hours');
    expect(amount(writing, 60)).toBe('1 hour');
    expect(amount(writing, 45)).toBe('45 minutes');
    expect(amountOf(writing, 120)).toBe('2 hours of writing');
    expect(amountOf(writing, 45)).toBe('45 minutes of writing');
  });

  it('words that name hours always read in hours; words that name minutes keep minutes', () => {
    expect(amountOf({ ...writing, title: 'Hours of reading' }, 90)).toBe('1.5 hours of reading');
    expect(amountOf({ ...writing, title: 'Minutes of practice' }, 120)).toBe('120 minutes of practice');
  });

  it('Home and the playback agree on the same amounts', () => {
    for (const n of [45, 60, 120, 150]) {
      const home = amountText(time('Writing', 0), n);
      expect(amount(writing, n), `${n}`).toBe(home);
    }
  });
});
