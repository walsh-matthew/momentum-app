// The checks behind the forecast's edits (lib/forecast/edits.ts, MOM-138). Pure: a value in, a number or a plain message out.
// What these pin:
// - nothing is guessed: an empty or unreadable value is refused with the plain words, never filled in;
// - a size is typed in hours and saved as whole minutes, above 0 and within a sensible bound;
// - a kind of day's usual time needs a unit the person chose and an amount from 0 to a day;
// - a new due date is a real day, today or later in the person's own days;
// - the approved screen words are exactly the owner's (MOM-138 design comment, 2026-11-01).

import { describe, expect, it } from 'vitest';
import {
  AMOUNT_MISSING,
  AMOUNT_UNREADABLE,
  DATE_MISSING,
  DATE_PAST,
  DATE_UNREADABLE,
  RENAME_MISSING,
  SAVE_FAILED,
  SIZE_MISSING,
  SIZE_UNREADABLE,
  STEP_MISSING,
  STEP_TOO_LONG,
  UNIT_MISSING,
  checkKindTime,
  checkNewDueDate,
  checkSizeHours,
  checkStepTitle,
  hoursText,
} from '@/lib/forecast/edits';

describe('the approved words', () => {
  it('are the ones the owner approved', () => {
    expect(SIZE_MISSING).toBe('Say roughly how many hours first.');
    expect(STEP_MISSING).toBe('Write the step first.');
    expect(UNIT_MISSING).toBe('Choose hours or sessions first.');
    expect(AMOUNT_MISSING).toBe('Say how many first.');
    expect(DATE_PAST).toBe('That day has passed. Pick a day from today on.');
    expect(SAVE_FAILED).toBe('Could not save that. Nothing was changed.');
  });
});

describe('a rough size', () => {
  it('is typed in hours and saved as whole minutes', () => {
    expect(checkSizeHours('2')).toEqual({ ok: true, value: 120 });
    expect(checkSizeHours('1.5')).toEqual({ ok: true, value: 90 });
    expect(checkSizeHours(' 0,25 ')).toEqual({ ok: true, value: 15 });
    expect(checkSizeHours(3)).toEqual({ ok: true, value: 180 });
    expect(checkSizeHours('1000')).toEqual({ ok: true, value: 60000 });
  });

  it('is never filled in: empty says what is missing', () => {
    for (const empty of ['', '   ', null, undefined]) expect(checkSizeHours(empty)).toEqual({ ok: false, error: SIZE_MISSING });
  });

  it('refuses what is not a number of hours above 0', () => {
    for (const bad of ['0', '0.00', '-2', '2h', 'two', '1e3', '1.234', '1,2,3', '1001', '99999', NaN, Infinity, {}, [], true]) {
      expect(checkSizeHours(bad), String(bad)).toEqual({ ok: false, error: SIZE_UNREADABLE });
    }
  });
});

describe("a kind of day's usual time", () => {
  it('needs the unit the person chose and an amount', () => {
    expect(checkKindTime('hours', '3')).toEqual({ ok: true, value: { unit: 'hours', amount: 3 } });
    expect(checkKindTime('sessions', '2')).toEqual({ ok: true, value: { unit: 'sessions', amount: 2 } });
    expect(checkKindTime('hours', '2.5')).toEqual({ ok: true, value: { unit: 'hours', amount: 2.5 } });
  });

  it('allows 0 (a day that gives none) and a whole day, and nothing past it', () => {
    expect(checkKindTime('hours', '0')).toEqual({ ok: true, value: { unit: 'hours', amount: 0 } });
    expect(checkKindTime('hours', '24')).toEqual({ ok: true, value: { unit: 'hours', amount: 24 } });
    expect(checkKindTime('hours', '24.5')).toEqual({ ok: false, error: AMOUNT_UNREADABLE });
    expect(checkKindTime('hours', '25')).toEqual({ ok: false, error: AMOUNT_UNREADABLE });
  });

  it('asks for the unit first, then the amount, and never chooses either', () => {
    expect(checkKindTime(null, '3')).toEqual({ ok: false, error: UNIT_MISSING });
    expect(checkKindTime('', '3')).toEqual({ ok: false, error: UNIT_MISSING });
    expect(checkKindTime('minutes', '3')).toEqual({ ok: false, error: UNIT_MISSING });
    expect(checkKindTime(null, '')).toEqual({ ok: false, error: UNIT_MISSING });
    expect(checkKindTime('hours', '')).toEqual({ ok: false, error: AMOUNT_MISSING });
    expect(checkKindTime('hours', '   ')).toEqual({ ok: false, error: AMOUNT_MISSING });
  });

  it('refuses a negative or unreadable amount', () => {
    for (const bad of ['-1', 'three', '1e1', '2.555']) expect(checkKindTime('hours', bad), bad).toEqual({ ok: false, error: AMOUNT_UNREADABLE });
  });
});

describe('a step', () => {
  it('is trimmed and kept as written', () => {
    expect(checkStepTitle('  Write the letter  ')).toEqual({ ok: true, value: 'Write the letter' });
    expect(checkStepTitle('Gym + study (am)')).toEqual({ ok: true, value: 'Gym + study (am)' });
  });

  it('a rename asks for the new name, in its own words, and a new step for the step', () => {
    expect(RENAME_MISSING).toBe('Write the new name first.');
    expect(checkStepTitle('  ', RENAME_MISSING)).toEqual({ ok: false, error: 'Write the new name first.' });
    expect(checkStepTitle('  ')).toEqual({ ok: false, error: 'Write the step first.' });
    expect(checkStepTitle('New name', RENAME_MISSING)).toEqual({ ok: true, value: 'New name' });
  });

  it('is never filled in, and is not longer than a line', () => {
    for (const empty of ['', '   ', null, undefined, 5]) expect(checkStepTitle(empty)).toEqual({ ok: false, error: STEP_MISSING });
    expect(checkStepTitle('x'.repeat(200)).ok).toBe(true);
    expect(checkStepTitle('x'.repeat(201))).toEqual({ ok: false, error: STEP_TOO_LONG });
  });
});

describe('a new due date', () => {
  const TODAY = '2026-11-01';

  it('is a real day, today or later', () => {
    expect(checkNewDueDate('2026-11-01', TODAY)).toEqual({ ok: true, value: '2026-11-01' });
    expect(checkNewDueDate('2026-12-24', TODAY)).toEqual({ ok: true, value: '2026-12-24' });
    expect(checkNewDueDate('2028-02-29', TODAY)).toEqual({ ok: true, value: '2028-02-29' });
  });

  it('refuses a day that has passed, with the approved words', () => {
    expect(checkNewDueDate('2026-10-31', TODAY)).toEqual({ ok: false, error: DATE_PAST });
  });

  it('refuses an empty or unreal day', () => {
    expect(checkNewDueDate('', TODAY)).toEqual({ ok: false, error: DATE_MISSING });
    expect(checkNewDueDate(null, TODAY)).toEqual({ ok: false, error: DATE_MISSING });
    for (const bad of ['2026-02-30', '2027-02-29', '11/20/2026', '2026-13-01', 'tomorrow', 20261120, {}]) {
      expect(checkNewDueDate(bad, TODAY), String(bad)).toEqual({ ok: false, error: DATE_UNREADABLE });
    }
  });
});

describe('hours as a person reads them', () => {
  it('has no trailing zero and at most two decimals', () => {
    expect(hoursText(2)).toBe('2');
    expect(hoursText(1.5)).toBe('1.5');
    expect(hoursText(2 / 3)).toBe('0.67');
    expect(hoursText(0)).toBe('0');
  });
});
