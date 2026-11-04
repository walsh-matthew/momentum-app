// Test day 1 (MOM-180 B1): "2 hours" a week of writing was saved and played back as "at least 2 minutes spent writing a week". A time
// amount (a leaf of kind `minutes`) said as hours is n*60; the bare number no longer passes unless the text also names minutes.

import { describe, expect, it } from 'vitest';
import type { Leaf } from '@/lib/setup/leaves';
import { textSaysLeaf } from '@/lib/setup/validate';

const minutes = (value: number): Leaf => ({ path: 'goals.g1.targets.t1.floor', kind: 'minutes', value });

describe('a time amount said in hours', () => {
  it('passes only as the number times 60', () => {
    expect(textSaysLeaf(minutes(120), 'At least 2 hours a week.')).toBe(true);
    expect(textSaysLeaf(minutes(120), 'two hours')).toBe(true);
    expect(textSaysLeaf(minutes(90), 'an hour and a half, 1.5 hours')).toBe(true);
  });

  it('no longer lets the bare number through: "2 hours" does not say 2 minutes', () => {
    expect(textSaysLeaf(minutes(2), 'At least 2 hours a week of writing.')).toBe(false);
    expect(textSaysLeaf(minutes(2), 'two hours')).toBe(false);
    expect(textSaysLeaf(minutes(2), 'about 2 hrs')).toBe(false);
  });

  it('keeps the bare number when the text names minutes too, or neither unit', () => {
    expect(textSaysLeaf(minutes(30), '2 hours, or 30 minutes on a hard week')).toBe(true);
    expect(textSaysLeaf(minutes(120), '2 hours, or 30 minutes on a hard week')).toBe(true);
    expect(textSaysLeaf(minutes(45), '45 minutes')).toBe(true);
    expect(textSaysLeaf(minutes(45), '45')).toBe(true);
  });
});
