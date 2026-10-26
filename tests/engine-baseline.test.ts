// Re-baselining without re-grading (lib/engine/baseline.ts, docs/DOMAIN_MODEL.md §1.7, §3.2): a closed period
// keeps the target it was judged by.

import { describe, expect, it } from 'vitest';
import { computeScoreboard, evaluateTarget, snapshotPeriod, targetInForce } from '@/lib/engine';
import { anchors, entry, input, spec, target } from './helpers/engineFixtures';

// Floor 3 from the start; a re-baseline to floor 5 (aspiration 7) from the week of the 19th.
const rebaselined = target({
  versions: [
    { effectiveFrom: '2026-10-05', spec: spec() },
    { effectiveFrom: '2026-10-19', spec: spec({ levels: { floor: 5, aspiration: 7 } }) },
  ],
});

describe('targetInForce', () => {
  it('is the latest version that applies from on or before the period', () => {
    expect(targetInForce(rebaselined, '2026-10-12').levels).toEqual({ floor: 3, aspiration: 5 });
    expect(targetInForce(rebaselined, '2026-10-19').levels).toEqual({ floor: 5, aspiration: 7 });
    expect(targetInForce(rebaselined, '2026-11-02').levels).toEqual({ floor: 5, aspiration: 7 });
  });

  it('takes the first version for a period that began before it applied', () => {
    expect(targetInForce(rebaselined, '2026-10-01').levels).toEqual({ floor: 3, aspiration: 5 });
  });

  it('does not depend on the order the versions are listed in', () => {
    const shuffled = { ...rebaselined, versions: [...rebaselined.versions].reverse() };
    expect(targetInForce(shuffled, '2026-10-12').levels).toEqual({ floor: 3, aspiration: 5 });
  });

  it('refuses a target with no version, two versions from one day, or a changed period kind', () => {
    expect(() => targetInForce({ ...rebaselined, versions: [] }, '2026-10-12')).toThrow(/no version/);
    const twice = { ...rebaselined, versions: [rebaselined.versions[0], { ...rebaselined.versions[1], effectiveFrom: '2026-10-05' }] };
    expect(() => targetInForce(twice, '2026-10-12')).toThrow(/two versions/);
    const kind = {
      ...rebaselined,
      versions: [rebaselined.versions[0], { effectiveFrom: '2026-10-19', spec: spec({ period: { kind: 'day_slots', days: [1] } }) }],
    };
    expect(() => targetInForce(kind, '2026-10-12')).toThrow(/period kind/);
  });
});

describe('a target changed mid-block', () => {
  const entries = [
    ...[5, 6, 7].map((d) => entry(`2026-10-0${d}`)), // week 1: 3
    ...[12, 13, 14].map((d) => entry(`2026-10-${d}`)), // week 2: 3
    ...[19, 20, 21].map((d) => entry(`2026-10-${d}`)), // week 3: 3
  ];
  const board = computeScoreboard(input({ today: '2026-10-22', targets: [rebaselined], entries }));

  it('judges the weeks before the change by the old target and the week after by the new one', () => {
    expect(board.history.map((r) => [r.periodStart, r.floor, r.level])).toEqual([
      ['2026-10-05', 3, 'floor'],
      ['2026-10-12', 3, 'floor'],
    ]);
    expect(board.results[0]).toMatchObject({ periodStart: '2026-10-19', floor: 5, level: 'partway', judgedBy: 'current' });
  });

  it('says when a closed week was judged from the version history because it has no snapshot', () => {
    expect(board.history.every((r) => r.judgedBy === 'history')).toBe(true);
  });
});

describe('a closed week keeps its result after a target change', () => {
  const entries = [entry('2026-10-05'), entry('2026-10-06'), entry('2026-10-07')];
  const original = target();
  const snapshot = snapshotPeriod(original, '2026-10-05');
  // Someone raises the floor from the start, which would re-grade week 1 if the stored target were not used.
  const raised = target({}, { levels: { floor: 5, aspiration: 7 } });
  const judge = (snapshots: typeof snapshot[], entryList = entries) =>
    evaluateTarget({ target: raised, periodStart: '2026-10-05', today: '2026-10-14', anchors: anchors(), entries: entryList, snapshots });

  it('is judged by the stored target, not the changed one', () => {
    expect(judge([snapshot])).toMatchObject({ floor: 3, level: 'floor', judgedBy: 'snapshot' });
    expect(judge([])).toMatchObject({ floor: 5, level: 'partway' });
  });

  it('still takes a later correction to its entries: the result is computed, never stored', () => {
    const removed = [entries[0], entries[1], { ...entries[2], removed: true }];
    expect(judge([snapshot], removed)).toMatchObject({ counted: 2, floor: 3, level: 'partway' });
  });

  it('is a copy, so changing it cannot change the target', () => {
    const copy = snapshotPeriod(original, '2026-10-05');
    copy.spec.levels = { floor: 99, aspiration: null };
    expect(targetInForce(original, '2026-10-05').levels).toEqual({ floor: 3, aspiration: 5 });
  });
});
