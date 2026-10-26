// Which entries count and what they add up to (lib/engine/entries.ts, docs/DOMAIN_MODEL.md §1.3 and §1.6).

import { describe, expect, it } from 'vitest';
import { measureTotal, selectEntries } from '@/lib/engine';
import { anchors, entry, spec } from './helpers/engineFixtures';

const WEEK = { from: '2026-10-05', to: '2026-10-11' };
const total = (s: ReturnType<typeof spec>, entries: ReturnType<typeof entry>[]) =>
  measureTotal(s, selectEntries(s, entries, WEEK, anchors()).counted).total;

describe('measures sum the entries’ values', () => {
  it('a count sums values, a tap being 1', () => {
    const taps = [entry('2026-10-05'), entry('2026-10-06'), entry('2026-10-07')];
    expect(total(spec(), taps)).toBe(3);
    // An entry that carries more than a tap adds its value, not 1.
    expect(total(spec(), [...taps, entry('2026-10-08', { value: 2 })])).toBe(5);
  });

  it('a quantity sums the numbers', () => {
    const s = spec({ measure: 'quantity', unit: 'km' });
    expect(total(s, [entry('2026-10-05', { value: 3.5 }), entry('2026-10-06', { value: 1.5 })])).toBe(5);
  });

  it('time sums the minutes', () => {
    const s = spec({ measure: 'time', unit: 'min' });
    expect(total(s, [entry('2026-10-05', { value: 30 }), entry('2026-10-06', { value: 45 })])).toBe(75);
  });

  it('a checklist counts distinct steps ticked, ignoring a repeat, an unknown step and a tick with no step', () => {
    const s = spec({ measure: 'checklist', stepIds: ['s1', 's2', 's3'] });
    const ticks = [
      entry('2026-10-05', { stepId: 's1' }),
      entry('2026-10-06', { stepId: 's2' }),
      entry('2026-10-07', { stepId: 's1' }),
      entry('2026-10-08', { stepId: 'other' }),
      entry('2026-10-09', { stepId: null }),
    ];
    expect(total(s, ticks)).toBe(2);
  });

  it('day slots count the slots filled, one per named day, and show the rest as extra', () => {
    const s = spec({ period: { kind: 'day_slots', days: [1, 3, 5] } });
    const tally = measureTotal(
      s,
      selectEntries(
        s,
        [entry('2026-10-05'), entry('2026-10-05'), entry('2026-10-06'), entry('2026-10-07')], // Mon, Mon, Tue, Wed
        WEEK,
        anchors(),
      ).counted,
    );
    expect(tally.total).toBe(2);
    expect(tally.extraEntries).toBe(1);
  });

  it('refuses a value that is not a number from 0 up', () => {
    for (const value of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      expect(() => selectEntries(spec(), [entry('2026-10-05', { value })], WEEK, anchors())).toThrow(/value/);
    }
  });

  it('gives the same total whatever order the entries arrive in', () => {
    const list = [entry('2026-10-07', { value: 2 }), entry('2026-10-05'), entry('2026-10-06', { value: 4 })];
    const forward = selectEntries(spec(), list, WEEK, anchors()).counted.map((c) => c.entry.id);
    const backward = selectEntries(spec(), [...list].reverse(), WEEK, anchors()).counted.map((c) => c.entry.id);
    expect(backward).toEqual(forward);
  });
});

describe('removed entries are left out', () => {
  it('does not count a removed entry', () => {
    expect(total(spec(), [entry('2026-10-05'), entry('2026-10-06', { removed: true })])).toBe(1);
  });

  it('keeps a removed entry out even when it was counted anyway', () => {
    expect(total(spec(), [entry('2026-10-05', { removed: true, countAnyway: true })])).toBe(0);
  });
});

describe('the qualifying threshold and count anyway', () => {
  const threshold = spec({ qualifyingThreshold: 20 });

  it('counts an entry at or above the threshold, and one with no size', () => {
    const entries = [
      entry('2026-10-05', { id: 'over', size: 25 }),
      entry('2026-10-06', { id: 'exact', size: 20 }),
      entry('2026-10-07', { id: 'nosize', size: null }),
    ];
    const selection = selectEntries(threshold, entries, WEEK, anchors());
    expect(selection.counted.map((c) => c.entry.id)).toEqual(['over', 'exact', 'nosize']);
    expect(selection.belowThreshold).toEqual([]);
  });

  it('keeps an entry below the threshold and lists it, without counting it', () => {
    const selection = selectEntries(threshold, [entry('2026-10-05', { id: 'short', size: 19 })], WEEK, anchors());
    expect(selection.counted).toEqual([]);
    expect(selection.belowThreshold).toEqual(['short']);
  });

  it('counts a below-threshold entry the person counted anyway', () => {
    const selection = selectEntries(threshold, [entry('2026-10-05', { id: 'short', size: 19, countAnyway: true })], WEEK, anchors());
    expect(selection.counted.map((c) => c.entry.id)).toEqual(['short']);
    expect(selection.belowThreshold).toEqual([]);
  });

  it('judges a quantity or time entry by its value when it has no size', () => {
    const s = spec({ measure: 'quantity', unit: 'km', qualifyingThreshold: 5 });
    const selection = selectEntries(
      s,
      [entry('2026-10-05', { id: 'four', value: 4 }), entry('2026-10-06', { id: 'five', value: 5 })],
      WEEK,
      anchors(),
    );
    expect(selection.belowThreshold).toEqual(['four']);
    expect(selection.counted.map((c) => c.entry.id)).toEqual(['five']);
  });
});

describe('an entry belongs to the period of its local day', () => {
  it('counts the first and last day and not the days either side', () => {
    const entries = [
      entry('2026-10-04', { id: 'before' }),
      entry('2026-10-05', { id: 'first' }),
      entry('2026-10-11', { id: 'last' }),
      entry('2026-10-12', { id: 'after' }),
    ];
    const ids = selectEntries(spec(), entries, WEEK, anchors()).counted.map((c) => c.entry.id);
    expect(ids).toEqual(['first', 'last']);
  });
});
