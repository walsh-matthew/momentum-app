// When a manual entry and a synced record look like the same event (lib/entries/mergeSuggestions.ts, MOM-109,
// docs/DOMAIN_MODEL.md §1.6): one suggestion per group, never a merge, never about a hidden entry.

import { describe, expect, it } from 'vitest';
import {
  MERGE_VALUE_TOLERANCE,
  MERGE_WINDOW_HOURS,
  looksLikeSameEvent,
  suggestMerges,
  type MergeCandidate,
} from '@/lib/entries/mergeSuggestions';
import type { Measure } from '@/types/database.types';

const T = 'target-1';
const HEVY = 'source-hevy';
const MANUAL = 'source-manual';

let n = 0;
const entry = (kind: 'manual' | 'synced', at: string, over: Partial<MergeCandidate> = {}): MergeCandidate => ({
  id: `e${String(++n).padStart(3, '0')}`,
  targetId: T,
  sourceId: kind === 'manual' ? MANUAL : HEVY,
  sourceKind: kind,
  occurredAt: at,
  value: 1,
  hidden: false,
  ...over,
});
const measures = (m: Measure = 'count', id = T) => new Map<string, Measure>([[id, m]]);

const AT = '2026-10-19T18:12:38Z';
const plusHours = (h: number) => new Date(Date.parse(AT) + h * 3_600_000).toISOString();

describe('the two numbers live in one place', () => {
  it('are named constants', () => {
    expect(MERGE_WINDOW_HOURS).toBe(4);
    expect(MERGE_VALUE_TOLERANCE).toBe(0.25);
  });
});

describe('what looks like the same event', () => {
  it('a manual and a synced count within the window', () => {
    expect(suggestMerges([entry('manual', plusHours(1)), entry('synced', AT)], measures())).toHaveLength(1);
  });

  it('the window is four hours, both ways', () => {
    expect(looksLikeSameEvent(entry('manual', plusHours(4)), entry('synced', AT), 'count')).toBe(true);
    expect(looksLikeSameEvent(entry('manual', plusHours(-4)), entry('synced', AT), 'count')).toBe(true);
    expect(looksLikeSameEvent(entry('manual', plusHours(4.01)), entry('synced', AT), 'count')).toBe(false);
    expect(looksLikeSameEvent(entry('manual', plusHours(-5)), entry('synced', AT), 'count')).toBe(false);
  });

  it('time and quantity also need values within a quarter of each other', () => {
    for (const measure of ['time', 'quantity'] as const) {
      expect(looksLikeSameEvent(entry('manual', AT, { value: 45 }), entry('synced', AT, { value: 60 }), measure)).toBe(true);
      expect(looksLikeSameEvent(entry('manual', AT, { value: 45 }), entry('synced', AT, { value: 61 }), measure)).toBe(false);
      expect(looksLikeSameEvent(entry('manual', AT, { value: 61 }), entry('synced', AT, { value: 45 }), measure)).toBe(false);
    }
  });

  it('a count has no size to compare', () => {
    expect(looksLikeSameEvent(entry('manual', AT, { value: 1 }), entry('synced', AT, { value: 5 }), 'count')).toBe(true);
  });

  it('a checklist never matches', () => {
    expect(suggestMerges([entry('manual', AT), entry('synced', AT)], measures('checklist'))).toEqual([]);
  });

  it('two synced records, or two manual ones, are never a pair', () => {
    expect(suggestMerges([entry('synced', AT), entry('synced', plusHours(1))], measures())).toEqual([]);
    expect(suggestMerges([entry('manual', AT), entry('manual', plusHours(1))], measures())).toEqual([]);
  });

  it('a different target is a different event', () => {
    const other = new Map<string, Measure>([[T, 'count'], ['target-2', 'count']]);
    expect(suggestMerges([entry('manual', AT), entry('synced', AT, { targetId: 'target-2' })], other)).toEqual([]);
  });

  it('an unreadable time never matches', () => {
    expect(suggestMerges([entry('manual', 'not a time'), entry('synced', AT)], measures())).toEqual([]);
  });

  it('an entry on a target it knows nothing about is left out', () => {
    expect(suggestMerges([entry('manual', AT), entry('synced', AT)], new Map())).toEqual([]);
  });
});

describe('a hidden entry is out of the question', () => {
  it('the person removed it, so there is nothing to suggest', () => {
    expect(suggestMerges([entry('manual', AT), entry('synced', AT, { hidden: true })], measures())).toEqual([]);
    expect(suggestMerges([entry('manual', AT, { hidden: true }), entry('synced', AT)], measures())).toEqual([]);
  });
});

describe('one prompt per group, not one per pair', () => {
  it('two workouts from one source that both match one manual entry are one suggestion', () => {
    const manual = entry('manual', plusHours(1));
    const a = entry('synced', AT);
    const b = entry('synced', plusHours(2));
    const out = suggestMerges([manual, a, b], measures());
    expect(out).toHaveLength(1);
    expect(out[0].manualEntryIds).toEqual([manual.id]);
    expect(out[0].syncedEntryIds).toEqual([a.id, b.id].sort());
  });

  it('two manual entries that match one workout are one suggestion', () => {
    const out = suggestMerges([entry('manual', AT), entry('manual', plusHours(1)), entry('synced', plusHours(0.5))], measures());
    expect(out).toHaveLength(1);
    expect(out[0].manualEntryIds).toHaveLength(2);
  });

  it('entries that match through a third share a group', () => {
    // m1 and m2 are six hours apart, so they do not match each other, but each matches the workout between them.
    const s1 = entry('synced', AT);
    const m1 = entry('manual', plusHours(-3));
    const m2 = entry('manual', plusHours(3));
    expect(suggestMerges([m1, s1, m2], measures())).toHaveLength(1);
  });

  it('separate events on separate days are separate suggestions, earliest first', () => {
    const later = [entry('manual', plusHours(48)), entry('synced', plusHours(48))];
    const earlier = [entry('manual', AT), entry('synced', AT)];
    const out = suggestMerges([...later, ...earlier], measures());
    expect(out).toHaveLength(2);
    expect(out[0].syncedEntryIds).toEqual([earlier[1].id]);
    expect(out[1].syncedEntryIds).toEqual([later[1].id]);
  });

  it('a different synced source is its own group', () => {
    const manual = entry('manual', AT);
    const other = entry('synced', AT, { sourceId: 'source-other' });
    const out = suggestMerges([manual, entry('synced', AT), other], measures());
    expect(out.map((s) => s.syncedSourceId).sort()).toEqual([HEVY, 'source-other'].sort());
  });
});

describe('it only suggests', () => {
  it('gives the same answer every time and does not change what it was given', () => {
    const input = [entry('manual', AT), entry('synced', plusHours(1))];
    const before = JSON.stringify(input);
    expect(suggestMerges(input, measures())).toEqual(suggestMerges([...input].reverse(), measures()));
    expect(JSON.stringify(input)).toBe(before);
  });

  it('returns ids and nothing that merges: no value, no verb', () => {
    const [s] = suggestMerges([entry('manual', AT), entry('synced', AT)], measures());
    expect(Object.keys(s).sort()).toEqual(['manualEntryIds', 'syncedEntryIds', 'syncedSourceId', 'targetId']);
  });
});
