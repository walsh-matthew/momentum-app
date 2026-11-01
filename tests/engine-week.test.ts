// The week at a glance (lib/engine/week.ts, MOM-112): floors met, entries per day and the week's biggest crossing.
// Facts only, from the same engine as every other number; the owner's rules (2026-10-28) are each a test here.

import { describe, expect, it } from 'vitest';
import { biggestCrossings, computeScoreboard, entriesPerDay, floorsMet } from '@/lib/engine';
import { anchors, entry, input, target } from './helpers/engineFixtures';
import type { Crossing } from '@/types/scoreboard';

// Today is Wednesday 2026-10-14; the person's week is Monday 12th to Sunday 18th.
const TODAY = '2026-10-14';
const WEEK = { start: '2026-10-12', end: '2026-10-18' };
const on = (targetId: string, ...dates: string[]) => dates.map((d) => entry(d, { targetId }));

describe('floorsMet counts only graded effort targets with a weekly or day-slot period', () => {
  const workouts = target({ id: 'workouts' }, { levels: { floor: 3, aspiration: 5 } });
  const reading = target({ id: 'reading' }, { levels: { floor: 5, aspiration: null } });
  const slots = target({ id: 'slots' }, { period: { kind: 'day_slots', days: [1, 3] }, levels: { floor: 2, aspiration: null } });
  // Not in play: an outcome target (even with a number the person named), a deadline target, a target with no
  // levels, and a target that started partway through the week.
  const outcome = target({ id: 'outcome' }, { role: 'outcome', levels: { floor: 1, aspiration: null } });
  const deadline = target({ id: 'deadline' }, { period: { kind: 'deadline', due: '2026-12-18' }, carryOver: 'cumulative', levels: { floor: 5, aspiration: null } });
  const unlevelled = target({ id: 'unlevelled' }, { role: 'outcome', levels: null });
  const midweek = target({ id: 'midweek', startsOn: '2026-10-13' }, { levels: { floor: 1, aspiration: null } });
  const targets = [workouts, reading, slots, outcome, deadline, unlevelled, midweek];

  const entries = [
    ...on('workouts', '2026-10-12', '2026-10-13', '2026-10-14'), // floor met
    ...on('reading', '2026-10-12', '2026-10-13'), // partway
    ...on('slots', '2026-10-12', '2026-10-14'), // both named days filled: floor met
    ...on('outcome', '2026-10-12'),
    ...on('deadline', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-14', '2026-10-14'),
    ...on('unlevelled', '2026-10-12'),
    ...on('midweek', '2026-10-13'),
  ];
  const scoreboard = computeScoreboard(input({ today: TODAY, targets, entries }));

  it('puts the graded effort targets in play and counts the ones at their floor', () => {
    const tally = floorsMet(scoreboard, targets);
    expect([...tally.inPlay].sort()).toEqual(['reading', 'slots', 'workouts']);
    expect([...tally.met].sort()).toEqual(['slots', 'workouts']);
  });

  it('leaves out the outcome, deadline, unlevelled and started-midweek targets, even when they are at a level', () => {
    const tally = floorsMet(scoreboard, targets);
    for (const id of ['outcome', 'deadline', 'unlevelled', 'midweek']) expect(tally.inPlay).not.toContain(id);
    // The started-midweek target has a level in its result: the tally must still skip it because it is not graded.
    const result = scoreboard.results.find((r) => r.targetId === 'midweek');
    expect(result?.level).toBe('floor');
    expect(result?.graded).toBe(false);
  });

  it('counts an aspiration as a floor met', () => {
    const board = computeScoreboard(input({ today: TODAY, targets: [workouts], entries: on('workouts', '2026-10-12', '2026-10-13', '2026-10-13', '2026-10-14', '2026-10-14') }));
    expect(floorsMet(board, [workouts])).toEqual({ inPlay: ['workouts'], met: ['workouts'] });
  });

  it('is empty when nothing is in play', () => {
    const board = computeScoreboard(input({ today: TODAY, targets: [outcome], entries: [] }));
    expect(floorsMet(board, [outcome])).toEqual({ inPlay: [], met: [] });
  });
});

describe('entriesPerDay: entries that count, on each day of the person’s week', () => {
  const workouts = target({ id: 'workouts' }, { qualifyingThreshold: 20 });
  const other = target({ id: 'other' });

  it('returns the seven days of the week from its first day, with the count on each', () => {
    const week = entriesPerDay({
      today: TODAY,
      anchors: anchors(),
      targets: [other],
      entries: [...on('other', '2026-10-12', '2026-10-12', '2026-10-14'), ...on('other', '2026-10-05', '2026-10-19')],
    });
    expect(week.start).toBe('2026-10-12');
    expect(week.end).toBe('2026-10-18');
    expect(week.days).toEqual([
      { day: '2026-10-12', count: 2 },
      { day: '2026-10-13', count: 0 },
      { day: '2026-10-14', count: 1 },
      { day: '2026-10-15', count: 0 },
      { day: '2026-10-16', count: 0 },
      { day: '2026-10-17', count: 0 },
      { day: '2026-10-18', count: 0 },
    ]);
  });

  it('adds the entries of every target together', () => {
    const week = entriesPerDay({ today: TODAY, anchors: anchors(), targets: [workouts, other], entries: [...on('other', '2026-10-13'), entry('2026-10-13', { targetId: 'workouts', size: 30 })] });
    expect(week.days[1].count).toBe(2);
  });

  it('leaves out a removed entry and an entry below the qualifying threshold, and keeps one counted anyway', () => {
    const week = entriesPerDay({
      today: TODAY,
      anchors: anchors(),
      targets: [workouts],
      entries: [
        entry('2026-10-12', { targetId: 'workouts', size: 30, removed: true }),
        entry('2026-10-13', { targetId: 'workouts', size: 10 }),
        entry('2026-10-14', { targetId: 'workouts', size: 10, countAnyway: true }),
        entry('2026-10-14', { targetId: 'workouts', size: 40 }),
      ],
    });
    expect(week.days.map((d) => d.count)).toEqual([0, 0, 2, 0, 0, 0, 0]);
  });

  it('leaves out entries from before the target started', () => {
    const late = target({ id: 'late', startsOn: '2026-10-14' });
    const week = entriesPerDay({ today: TODAY, anchors: anchors(), targets: [late], entries: on('late', '2026-10-12', '2026-10-14') });
    expect(week.days.map((d) => d.count)).toEqual([0, 0, 1, 0, 0, 0, 0]);
  });

  it('puts an entry on the person’s own day, not the server’s', () => {
    // 21:00 on the 13th in Los Angeles is the 14th in UTC.
    const week = entriesPerDay({ today: TODAY, anchors: anchors(), targets: [other], entries: [entry('2026-10-13', { targetId: 'other', occurredAt: '2026-10-13T21:00:00-07:00' })] });
    expect(week.days[1].count).toBe(1);
    expect(week.days[2].count).toBe(0);
  });

  it('starts the week on the person’s own week start', () => {
    const week = entriesPerDay({ today: TODAY, anchors: anchors({ weekStartsOn: 0 }), targets: [other], entries: [] });
    expect(week.start).toBe('2026-10-11');
    expect(week.days[0].day).toBe('2026-10-11');
  });

  it('refuses without a week start: the caller asks canGrade first', () => {
    expect(() => entriesPerDay({ today: TODAY, anchors: anchors({ weekStartsOn: null }), targets: [other], entries: [] })).toThrow(/week start/);
  });
});

describe('biggestCrossings: the week’s biggest crossing, never a ranking made up', () => {
  const floor = (targetId: string, day: string): Crossing => ({ kind: 'floor', targetId, periodStart: WEEK.start, on: day });
  const aspiration = (targetId: string, day: string): Crossing => ({ kind: 'aspiration', targetId, periodStart: WEEK.start, on: day });
  const step = (itemId: string, stepId: string, day: string): Crossing => ({ kind: 'step', targetId: null, itemId, stepId, on: day });
  const blockEnd = (targetId: string, day: string): Crossing => ({ kind: 'block_end', targetId, on: day, periodsJudged: 10, floorMet: 8, aspirationMet: 2 });

  it('is empty when nothing crossed in the week', () => {
    expect(biggestCrossings([], WEEK)).toEqual([]);
    expect(biggestCrossings([floor('a', '2026-10-05'), floor('b', '2026-10-19')], WEEK)).toEqual([]);
  });

  it('takes the latest day first, even over a bigger crossing on an earlier day', () => {
    const result = biggestCrossings([aspiration('a', '2026-10-13'), floor('b', '2026-10-14')], WEEK);
    expect(result).toEqual([floor('b', '2026-10-14')]);
  });

  it('on the same day, the bigger crossing wins: block end, then aspiration, then floor, then step', () => {
    const day = '2026-10-14';
    expect(biggestCrossings([step('i', 's', day), floor('a', day), aspiration('b', day), blockEnd('c', day)], WEEK)).toEqual([blockEnd('c', day)]);
    expect(biggestCrossings([step('i', 's', day), floor('a', day), aspiration('b', day)], WEEK)).toEqual([aspiration('b', day)]);
    expect(biggestCrossings([step('i', 's', day), floor('a', day)], WEEK)).toEqual([floor('a', day)]);
  });

  it('still tied: the person’s own order from setup decides, first goal and first target first', () => {
    const day = '2026-10-14';
    const crossings = [floor('run', day), floor('workouts', day), floor('apps', day)];
    expect(biggestCrossings(crossings, WEEK, ['workouts', 'run', 'apps'])).toEqual([floor('workouts', day)]);
    // An order that leaves one of the tied targets out (its place was never stored) is not used: all three stay tied (MOM-132).
    expect(biggestCrossings(crossings, WEEK, ['apps', 'workouts'])).toEqual([floor('apps', day), floor('run', day), floor('workouts', day)]);
    expect(biggestCrossings(crossings, WEEK, ['apps', 'workouts', 'run'])).toEqual([floor('apps', day)]);
  });

  it('with no order given, returns every tied crossing in a stable order and picks none', () => {
    const day = '2026-10-14';
    const a = biggestCrossings([floor('run', day), floor('apps', day), floor('workouts', day)], WEEK);
    const b = biggestCrossings([floor('workouts', day), floor('run', day), floor('apps', day)], WEEK);
    expect(a.map((c) => (c.kind === 'floor' ? c.targetId : ''))).toEqual(['apps', 'run', 'workouts']);
    expect(b).toEqual(a);
  });

  // MOM-132 (migration 021): a row saved before the order was stored has no place, and an unknown place is not guessed. Before, a
  // listed target outranked an unlisted one, which would have let a new goal beat an old one for the headline.
  it('an order that places only some of the tied crossings is not used: every tied crossing is returned and none is picked', () => {
    const day = '2026-10-14';
    const result = biggestCrossings([floor('run', day), floor('workouts', day)], WEEK, ['workouts']);
    expect(result).toEqual([floor('run', day), floor('workouts', day)]);
  });

  it('the order decides only between crossings that are tied on day and kind', () => {
    const day = '2026-10-14';
    const order = ['run', 'workouts'];
    expect(biggestCrossings([floor('run', day), aspiration('workouts', day)], WEEK, order)).toEqual([aspiration('workouts', day)]);
    expect(biggestCrossings([floor('run', '2026-10-13'), floor('workouts', day)], WEEK, order)).toEqual([floor('workouts', day)]);
  });

  it('two crossings of the same target stay tied with each other when the order places that target', () => {
    const day = '2026-10-14';
    const result = biggestCrossings([step('prep', 's1', day), step('prep', 's2', day), step('other', 's3', day)], WEEK, ['prep', 'other']);
    expect(result).toEqual([step('prep', 's1', day), step('prep', 's2', day)]);
  });

  it('ignores a crossing outside the week', () => {
    expect(biggestCrossings([blockEnd('a', '2026-10-19'), floor('b', '2026-10-12')], WEEK)).toEqual([floor('b', '2026-10-12')]);
  });

  it('a step of a milestone with no target is ranked by its item', () => {
    const day = '2026-10-14';
    const result = biggestCrossings([step('portfolio', 's1', day), step('prep', 's2', day)], WEEK, ['prep', 'portfolio']);
    expect(result).toEqual([step('prep', 's2', day)]);
  });
});
