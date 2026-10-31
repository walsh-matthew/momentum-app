// Re-baselining without re-grading (lib/engine/baseline.ts, docs/DOMAIN_MODEL.md §1.7, §3.2): a closed period
// keeps the target it was judged by.

import { describe, expect, it } from 'vitest';
import { changeEffectiveFrom, computeScoreboard, evaluateTarget, nextWeekStart, snapshotPeriod, targetInForce, versionsWithChanges, type TargetChange } from '@/lib/engine';
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

// MOM-146: the person's own change to a target's levels, saved from the weekly review. The target keeps its first version and each
// save adds one from a later period, so no closed week is judged by numbers that came after it.
describe('a change the person saves (versionsWithChanges, nextWeekStart)', () => {
  const base = spec();
  const change = (over: Partial<TargetChange> = {}): TargetChange => ({
    id: 'c1',
    effectiveFrom: '2026-10-26',
    levels: { floor: 4, aspiration: 6 },
    days: null,
    createdAt: '2026-10-25T20:00:00.000000+00:00',
    ...over,
  });
  const withChanges = (changes: TargetChange[], baseSpec = base) => target({ versions: versionsWithChanges('2026-10-05', baseSpec, changes) });

  // Three weeks of three workouts each, then the week of the 26th (still open on the 28th) with two.
  const entries = [
    ...[5, 6, 7].map((d) => entry(`2026-10-0${d}`)),
    ...[12, 13, 14].map((d) => entry(`2026-10-${d}`)),
    ...[19, 20, 21].map((d) => entry(`2026-10-${d}`)),
    ...[26, 27].map((d) => entry(`2026-10-${d}`)),
  ];
  const board = (changes: TargetChange[]) => computeScoreboard(input({ today: '2026-10-28', targets: [withChanges(changes)], entries }));

  it('keeps every closed week at the grade it had and judges the open week by the new numbers', () => {
    const before = board([]);
    const after = board([change()]);
    expect(after.history.map((r) => [r.periodStart, r.floor, r.aspiration, r.level])).toEqual(
      before.history.map((r) => [r.periodStart, r.floor, r.aspiration, r.level]),
    );
    expect(after.history.map((r) => [r.periodStart, r.floor, r.level])).toEqual([
      ['2026-10-05', 3, 'floor'],
      ['2026-10-12', 3, 'floor'],
      ['2026-10-19', 3, 'floor'],
    ]);
    expect(before.results[0]).toMatchObject({ periodStart: '2026-10-26', floor: 3, level: 'partway' });
    expect(after.results[0]).toMatchObject({ periodStart: '2026-10-26', floor: 4, aspiration: 6, level: 'partway' });
  });

  it('does not judge the week in progress by numbers that start the week after', () => {
    const next = change({ effectiveFrom: '2026-11-02' });
    expect(board([next]).results[0]).toMatchObject({ periodStart: '2026-10-26', floor: 3, aspiration: 5 });
  });

  it('lets a second save for the same day replace the first, whichever order they are listed in', () => {
    const first = change({ id: 'a', levels: { floor: 4, aspiration: 6 }, createdAt: '2026-10-25T20:00:00.000000+00:00' });
    const second = change({ id: 'b', levels: { floor: 2, aspiration: null }, createdAt: '2026-10-25T20:05:00.000000+00:00' });
    for (const order of [[first, second], [second, first]]) {
      expect(board(order).results[0]).toMatchObject({ periodStart: '2026-10-26', floor: 2, aspiration: null });
      expect(versionsWithChanges('2026-10-05', base, order).map((v) => [v.effectiveFrom, v.spec.levels])).toEqual([
        ['2026-10-05', { floor: 3, aspiration: 5 }],
        ['2026-10-26', { floor: 2, aspiration: null }],
      ]);
    }
  });

  it('breaks a tie in the save time by the row id, the same way every time', () => {
    const a = change({ id: 'a', levels: { floor: 4, aspiration: null } });
    const b = change({ id: 'b', levels: { floor: 5, aspiration: null } });
    expect(versionsWithChanges('2026-10-05', base, [a, b])[1].spec.levels).toEqual({ floor: 5, aspiration: null });
    expect(versionsWithChanges('2026-10-05', base, [b, a])[1].spec.levels).toEqual({ floor: 5, aspiration: null });
  });

  it('applies later changes in order, each from its own day, and never edits the first version', () => {
    const versions = versionsWithChanges('2026-10-05', base, [
      change({ id: 'x', effectiveFrom: '2026-11-09', levels: { floor: 6, aspiration: null } }),
      change({ id: 'y', effectiveFrom: '2026-10-26' }),
    ]);
    expect(versions.map((v) => [v.effectiveFrom, v.spec.levels])).toEqual([
      ['2026-10-05', { floor: 3, aspiration: 5 }],
      ['2026-10-26', { floor: 4, aspiration: 6 }],
      ['2026-11-09', { floor: 6, aspiration: null }],
    ]);
    expect(base.levels).toEqual({ floor: 3, aspiration: 5 });
  });

  it('leaves out a change dated on or before the target started, instead of refusing the whole target', () => {
    const versions = versionsWithChanges('2026-10-05', base, [change({ effectiveFrom: '2026-10-05' }), change({ id: 'z', effectiveFrom: '2026-10-01' })]);
    expect(versions).toHaveLength(1);
  });

  it('changes a day-slots target\'s days from the change on, and leaves its kind of period alone', () => {
    const slots = spec({ period: { kind: 'day_slots', days: [1, 3, 5] }, levels: { floor: 2, aspiration: 3 } });
    const versions = versionsWithChanges('2026-10-05', slots, [change({ levels: { floor: 2, aspiration: 3 }, days: [2, 4] })]);
    expect(versions.map((v) => v.spec.period)).toEqual([{ kind: 'day_slots', days: [1, 3, 5] }, { kind: 'day_slots', days: [2, 4] }]);
    // Days sent for a weekly target are not used.
    expect(versionsWithChanges('2026-10-05', base, [change({ days: [2, 4] })])[1].spec.period).toEqual({ kind: 'weekly' });
    // And the engine takes the result: the old days judge the old weeks.
    expect(() => targetInForce(withChanges([change({ levels: { floor: 2, aspiration: 3 }, days: [2, 4] })], slots), '2026-10-12')).not.toThrow();
  });

  it('finds the first week that begins after a day', () => {
    // Monday weeks: Sunday the 25th is a week's last day, so the next week starts tomorrow; Wednesday the 21st waits for the 26th.
    expect(nextWeekStart('2026-10-25', 1)).toBe('2026-10-26');
    expect(nextWeekStart('2026-10-21', 1)).toBe('2026-10-26');
    expect(nextWeekStart('2026-10-26', 1)).toBe('2026-11-02');
    // A week that starts on Sunday: Saturday the 24th ends one.
    expect(nextWeekStart('2026-10-24', 0)).toBe('2026-10-25');
    expect(nextWeekStart('2026-10-25', 0)).toBe('2026-11-01');
  });
});

// The day a change saved from the review takes effect (docs/DOMAIN_MODEL.md §3: the one question "can change next week"): the period right
// after the reviewed one, never earlier than the period that holds the person's today. The reviewed week here is Mon Oct 19 to Sun Oct 25.
describe('changeEffectiveFrom: when a change from the review starts', () => {
  const REVIEWED_END = '2026-10-25';
  const START = '2026-10-05';

  it('starts that day when the review is on the first day of the next week', () => {
    expect(changeEffectiveFrom(REVIEWED_END, '2026-10-26', START, 1)).toBe('2026-10-26');
  });

  it("starts tomorrow when the review is on the reviewed week's own last day", () => {
    expect(changeEffectiveFrom(REVIEWED_END, '2026-10-25', START, 1)).toBe('2026-10-26');
  });

  it('starts the week after the reviewed one when the review is a few days into it', () => {
    expect(changeEffectiveFrom(REVIEWED_END, '2026-10-28', START, 1)).toBe('2026-10-26');
  });

  it("starts from the current week's first day when the review is two weeks late, so it never reaches back into a closed week", () => {
    expect(changeEffectiveFrom(REVIEWED_END, '2026-11-09', START, 1)).toBe('2026-11-09');
    expect(changeEffectiveFrom(REVIEWED_END, '2026-11-12', START, 1)).toBe('2026-11-09');
  });

  it("follows the person's own week start, not Monday", () => {
    // Sunday weeks: the reviewed week is Sun Oct 18 to Sat Oct 24; on Mon Oct 26 the current week began Sun Oct 25.
    expect(changeEffectiveFrom('2026-10-24', '2026-10-26', START, 0)).toBe('2026-10-25');
    expect(changeEffectiveFrom('2026-10-24', '2026-10-24', START, 0)).toBe('2026-10-25');
  });

  it("never lands on or before the target's own start: it waits for the week after its first", () => {
    expect(changeEffectiveFrom(REVIEWED_END, '2026-10-26', '2026-11-04', 1)).toBe('2026-11-09');
    expect(changeEffectiveFrom(REVIEWED_END, '2026-10-26', '2026-10-26', 1)).toBe('2026-11-02');
  });

  // Entries for three weeks of three workouts, and two in the week of the 26th, then a change saved from each kind of review.
  const entries = [
    ...[5, 6, 7].map((d) => entry(`2026-10-0${d}`)),
    ...[12, 13, 14].map((d) => entry(`2026-10-${d}`)),
    ...[19, 20, 21].map((d) => entry(`2026-10-${d}`)),
    ...[26, 27].map((d) => entry(`2026-10-${d}`)),
  ];
  const saved = (effectiveFrom: string): TargetChange => ({ id: 'c1', effectiveFrom, levels: { floor: 4, aspiration: 6 }, days: null, createdAt: '2026-10-28T20:00:00.000000+00:00' });
  const judged = (today: string, changeOn: string | null) =>
    computeScoreboard(input({ today, targets: [target({ versions: versionsWithChanges(START, spec(), changeOn === null ? [] : [saved(changeOn)]) })], entries }));

  it('a closed week keeps its grade whichever day the change starts, and the week it starts in is judged by the new numbers', () => {
    // A review on Wed Oct 28 of the week of the 19th: the change starts Mon Oct 26, the week that just began, with two logged in it.
    const from = changeEffectiveFrom(REVIEWED_END, '2026-10-28', START, 1);
    expect(from).toBe('2026-10-26');
    const before = judged('2026-10-28', null);
    const after = judged('2026-10-28', from);
    expect(after.history.map((r) => [r.periodStart, r.floor, r.level])).toEqual(before.history.map((r) => [r.periodStart, r.floor, r.level]));
    expect(after.history.map((r) => [r.periodStart, r.floor, r.level])).toEqual([
      ['2026-10-05', 3, 'floor'],
      ['2026-10-12', 3, 'floor'],
      ['2026-10-19', 3, 'floor'],
    ]);
    // What was already logged in the current week counts against the new numbers.
    expect(before.results[0]).toMatchObject({ periodStart: '2026-10-26', counted: 2, floor: 3 });
    expect(after.results[0]).toMatchObject({ periodStart: '2026-10-26', counted: 2, floor: 4, aspiration: 6 });
  });

  it('a late review changes the current week and leaves the weeks between the reviewed one and now at the grade they had', () => {
    // Reviewing the week of the 19th on Mon Nov 9: the weeks of the 26th and Nov 2 closed unreviewed, and keep their numbers.
    const from = changeEffectiveFrom(REVIEWED_END, '2026-11-09', START, 1);
    expect(from).toBe('2026-11-09');
    const before = judged('2026-11-10', null);
    const after = judged('2026-11-10', from);
    expect(after.history.map((r) => [r.periodStart, r.floor, r.level])).toEqual(before.history.map((r) => [r.periodStart, r.floor, r.level]));
    expect(after.history.map((r) => r.floor)).toEqual([3, 3, 3, 3, 3]);
    expect(after.results[0]).toMatchObject({ periodStart: '2026-11-09', floor: 4 });
  });
});
