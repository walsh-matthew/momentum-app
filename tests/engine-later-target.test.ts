// A target added after its goal started (MOM-132, docs/DOMAIN_MODEL.md §1.3 "Start" and §1.7). The engine already takes a start for each
// target (`startsOn`); migration 021 gives a target added later its own, and these tests hold the engine to what that means:
// - a target is graded only from its own start, never on a week before it existed (RAID R-30);
// - adding it changes nothing already worked out for the targets that were there;
// - a target that starts partway through a week counts entries from its start day, shows that first week, and never counts it as a
//   miss or toward "slipping" (the rule §1.3 states; it is the engine's behaviour today and this pins it).
// The weeks are from October and November 2026 in Los Angeles: 2026-10-05 is a Monday.

import { describe, expect, it } from 'vitest';
import { computeScoreboard, floorsMet } from '@/lib/engine';
import { anchors, entry, input, target } from './helpers/engineFixtures';

describe('a target added to a goal that had already started', () => {
  // The goal started on 2026-09-14; the second target was added later, on Monday 2026-10-19 (its own start).
  const old = target({ id: 'old', startsOn: '2026-09-14', versions: [{ effectiveFrom: '2026-09-14', spec: target().versions[0].spec }] });
  const added = target({ id: 'added', startsOn: '2026-10-19', versions: [{ effectiveFrom: '2026-10-19', spec: target().versions[0].spec }] });
  const TODAY = '2026-10-28';

  it('is graded only from its own start: one closed week, none before it', () => {
    const board = computeScoreboard(input({ today: TODAY, targets: [old, added] }));
    const weeks = [...board.history, ...board.results].filter((r) => r.targetId === 'added').map((r) => r.periodStart);
    expect(weeks).toEqual(['2026-10-19', '2026-10-26']);
  });

  it('has no "slipping" from weeks before it existed, while the older target, which did miss them, does', () => {
    const board = computeScoreboard(input({ today: TODAY, targets: [old, added] }));
    expect(board.patterns.filter((p) => p.targetId === 'added')).toEqual([]);
    expect(board.patterns.filter((p) => p.targetId === 'old').map((p) => p.kind)).toEqual(['slipping']);
  });

  it('counts nothing logged against it before its start', () => {
    const early = [entry('2026-10-14', { targetId: 'added' }), entry('2026-10-15', { targetId: 'added' }), entry('2026-10-16', { targetId: 'added' })];
    const board = computeScoreboard(input({ today: TODAY, targets: [added], entries: early }));
    const counts = [...board.history, ...board.results].map((r) => r.counted);
    expect(counts).toEqual([0, 0]);
  });

  it('changes nothing already worked out for the targets that were there', () => {
    const entries = [entry('2026-10-20', { targetId: 'old' }), entry('2026-10-21', { targetId: 'old' }), entry('2026-10-22', { targetId: 'old' })];
    const without = computeScoreboard(input({ today: TODAY, targets: [old], entries }));
    const withAdded = computeScoreboard(input({ today: TODAY, targets: [old, added], entries }));
    const ofOld = <T extends { targetId: string }>(list: T[]) => list.filter((x) => x.targetId === 'old');
    expect(ofOld(withAdded.results)).toEqual(without.results);
    expect(ofOld(withAdded.history)).toEqual(without.history);
    expect(ofOld(withAdded.crossings.filter((c) => c.kind !== 'step'))).toEqual(without.crossings.filter((c) => c.kind !== 'step'));
    expect(ofOld(withAdded.patterns)).toEqual(without.patterns);
  });

  it('is not started, and nothing is shown for it, before its start day', () => {
    const board = computeScoreboard(input({ today: '2026-10-14', targets: [added] }));
    expect(board.results).toEqual([]);
    expect(board.history).toEqual([]);
  });
});

describe('a target that starts partway through a week (docs/DOMAIN_MODEL.md §1.3 "Start")', () => {
  // Starts Thursday 2026-10-15, in the week of Monday the 12th.
  const midweek = target({ id: 'mid', startsOn: '2026-10-15', versions: [{ effectiveFrom: '2026-10-15', spec: target().versions[0].spec }] });

  it('counts entries from the start day only, and shows that first week', () => {
    const entries = [entry('2026-10-13', { targetId: 'mid' }), entry('2026-10-14', { targetId: 'mid' }), entry('2026-10-15', { targetId: 'mid' }), entry('2026-10-16', { targetId: 'mid' })];
    const board = computeScoreboard(input({ today: '2026-10-20', targets: [midweek], entries }));
    expect(board.history).toHaveLength(1);
    expect(board.history[0]).toMatchObject({ periodStart: '2026-10-12', startedPartway: true, counted: 2 });
  });

  it('never counts that first week as a miss: it is not graded', () => {
    const board = computeScoreboard(input({ today: '2026-10-20', targets: [midweek] }));
    expect(board.history[0]).toMatchObject({ periodStart: '2026-10-12', counted: 0, startedPartway: true, graded: false });
  });

  it('never counts it toward "slipping": one missed whole week after it is not a run of two', () => {
    // Closed: the partial week of the 12th, and the whole week of the 19th (a miss). Today is in the week of the 26th.
    const board = computeScoreboard(input({ today: '2026-10-27', targets: [midweek] }));
    expect(board.history.map((r) => [r.periodStart, r.graded])).toEqual([
      ['2026-10-12', false],
      ['2026-10-19', true],
    ]);
    expect(board.patterns).toEqual([]);
  });

  it('a second missed whole week is the run of two that is slipping', () => {
    const board = computeScoreboard(input({ today: '2026-11-03', targets: [midweek] }));
    expect(board.patterns.map((p) => [p.kind, p.periods])).toEqual([['slipping', 2]]);
  });

  it('is not one of the floors in play for the week it started in', () => {
    const board = computeScoreboard(input({ today: '2026-10-16', targets: [midweek], entries: [entry('2026-10-15', { targetId: 'mid' })] }));
    expect(floorsMet(board, [midweek])).toEqual({ met: [], inPlay: [] });
  });

  it('is graded from the next whole week', () => {
    const board = computeScoreboard(input({ today: '2026-10-21', targets: [midweek] }));
    expect(board.results[0]).toMatchObject({ periodStart: '2026-10-19', startedPartway: false, graded: true });
  });

  it('a target that starts on the first day of the person’s week is not partway', () => {
    const monday = target({ id: 'mon', startsOn: '2026-10-12', versions: [{ effectiveFrom: '2026-10-12', spec: target().versions[0].spec }] });
    const board = computeScoreboard(input({ today: '2026-10-14', targets: [monday], anchors: anchors() }));
    expect(board.results[0]).toMatchObject({ periodStart: '2026-10-12', startedPartway: false, graded: true });
  });
});
