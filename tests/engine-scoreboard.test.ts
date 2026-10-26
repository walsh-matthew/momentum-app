// The scoreboard as one list of facts (lib/engine/scoreboard.ts, docs/DOMAIN_MODEL.md §1.7, §4.2 principles 5
// and 9): computed from entries, outcome trends, no wording, "today" and the anchors as inputs.

import { describe, expect, it } from 'vitest';
import { computeScoreboard, TREND_PERIODS } from '@/lib/engine';
import { anchors, entry, input, target } from './helpers/engineFixtures';
import type { ScoreboardInput } from '@/types/scoreboard';

const outcome = target({ id: 't2' }, { role: 'outcome', levels: null });
const e2 = (date: string) => entry(date, { targetId: 't2' });

describe('a whole scoreboard', () => {
  const deadline = target(
    { id: 't3' },
    { unit: 'items', period: { kind: 'deadline', due: '2026-12-18' }, carryOver: 'cumulative', levels: { floor: 15, aspiration: null } },
  );
  const full: ScoreboardInput = input({
    today: '2026-10-21',
    targets: [target(), outcome, deadline],
    entries: [
      ...['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-12', '2026-10-19'].map((d) => entry(d)),
      ...['2026-10-06', '2026-10-07', '2026-10-13'].map(e2),
      entry('2026-10-08', { targetId: 't3', value: 4 }),
      entry('2026-10-20', { targetId: 't3', value: 2 }),
    ],
    steps: [
      { id: 's1', itemId: 'i1', plannedPeriodStart: '2026-10-05', completedOn: null },
      { id: 's2', itemId: 'i1', plannedPeriodStart: '2026-10-05', completedOn: '2026-10-08' },
    ],
    forecasts: [
      {
        itemId: 'i1',
        dueDate: '2026-10-30',
        canMove: true,
        steps: { total: 4, done: 2 },
        logged: 2,
        estimateRemaining: null,
        availableDays: [
          { date: '2026-10-22', capacity: 1 },
          { date: '2026-10-23', capacity: 1 },
        ],
      },
    ],
  });
  const board = computeScoreboard(full);

  it('gives each target its latest period, and the earlier closed ones as history', () => {
    expect(board.results.map((r) => [r.targetId, r.periodStart, r.status, r.counted])).toEqual([
      ['t1', '2026-10-19', 'open', 1],
      ['t2', '2026-10-19', 'open', 0],
      ['t3', '2026-10-05', 'open', 6],
    ]);
    expect(board.history.map((r) => [r.targetId, r.periodStart])).toEqual([
      ['t1', '2026-10-05'],
      ['t1', '2026-10-12'],
      ['t2', '2026-10-05'],
      ['t2', '2026-10-12'],
    ]);
    expect(board.results[2]).toMatchObject({ unit: 'items', remainingToFloor: 9, owed: 9 });
  });

  it('adds the crossings, the outcome trend, the steps moved forward and the forecast', () => {
    expect(board.crossings).toEqual([
      { kind: 'floor', targetId: 't1', periodStart: '2026-10-05', on: '2026-10-07' },
      { kind: 'step', targetId: null, itemId: 'i1', stepId: 's2', on: '2026-10-08' },
    ]);
    expect(board.trends).toEqual([{ targetId: 't2', counts: [2, 1], direction: 'down' }]);
    expect(board.patterns).toEqual([]);
    expect(board.movedSteps).toEqual([{ stepId: 's1', itemId: 'i1', from: '2026-10-05', to: '2026-10-19' }]);
    expect(board.forecasts).toMatchObject([{ itemId: 'i1', verdict: 'tight' }]);
  });

  describe('is facts only: no wording for the person', () => {
    const KNOWN = new Set([
      // ids and the person's own unit text
      't1', 't2', 't3', 'i1', 's1', 's2', 'items',
      // enums
      'open', 'closed', 'snapshot', 'history', 'current', 'count', 'quantity', 'time', 'checklist',
      'none', 'partway', 'floor', 'aspiration', 'step', 'block_end', 'slipping', 'holding', 'aspiration_repeated',
      'up', 'flat', 'down', 'insufficient', 'fits', 'tight', 'does_not_fit', 'not_enough_data', 'past_due', 'done',
      'logged_pace', 'own_estimate', 'more_time', 'smaller_scope', 'move_date', 'accept_risk',
    ]);
    const isFact = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) || KNOWN.has(s);
    const strings = (value: unknown): string[] =>
      typeof value === 'string'
        ? [value]
        : Array.isArray(value)
          ? value.flatMap(strings)
          : value && typeof value === 'object'
            ? Object.values(value).flatMap(strings)
            : [];

    it('every string in it is an id, a date or a known enum', () => {
      const stray = strings(JSON.parse(JSON.stringify(board))).filter((s) => !isFact(s));
      expect(stray).toEqual([]);
    });

    it('the check itself catches a sentence', () => {
      expect(strings({ note: 'Nice work this week!' }).filter((s) => !isFact(s))).toEqual(['Nice work this week!']);
    });
  });

  it('does not change what it is given', () => {
    const before = structuredClone(full);
    computeScoreboard(full);
    expect(full).toEqual(before);
  });

  it('gives the same facts whatever order the entries arrive in', () => {
    const reversed = computeScoreboard({ ...full, entries: [...full.entries].reverse() });
    expect(JSON.parse(JSON.stringify(reversed))).toEqual(JSON.parse(JSON.stringify(board)));
  });
});

describe('outcome trends', () => {
  const counts = (weeks: number[][], over: Partial<ScoreboardInput> = {}, startsOn = '2026-10-05') => {
    const entries = weeks.flatMap((days, i) => days.map(() => e2(`2026-10-${String(5 + i * 7).padStart(2, '0')}`)));
    return computeScoreboard(input({ targets: [{ ...outcome, startsOn, versions: [{ ...outcome.versions[0], effectiveFrom: startsOn }] }], entries, ...over })).trends[0];
  };

  it('goes up, flat or down from the last closed period to the one before', () => {
    expect(counts([[1], [1, 2]], { today: '2026-10-21' })).toMatchObject({ counts: [1, 2], direction: 'up' });
    expect(counts([[1, 2], [1, 2]], { today: '2026-10-21' })).toMatchObject({ counts: [2, 2], direction: 'flat' });
    expect(counts([[1, 2], [1]], { today: '2026-10-21' })).toMatchObject({ counts: [2, 1], direction: 'down' });
  });

  it('has no direction with one closed period', () => {
    expect(counts([[1]], { today: '2026-10-14' })).toEqual({ targetId: 't2', counts: [1], direction: 'insufficient' });
  });

  it('leaves out the open period and a partial first week', () => {
    // Starts on the 8th: the week of the 5th is partial; the 12th is closed; the 19th is open.
    expect(counts([[], [1, 2]], { today: '2026-10-21' }, '2026-10-08')).toMatchObject({ counts: [2], direction: 'insufficient' });
  });

  it('looks at the latest periods only', () => {
    const trend = counts([], { today: '2026-12-07' });
    expect(trend.counts).toHaveLength(TREND_PERIODS);
  });
});

describe('inputs, not assumptions', () => {
  it('shows nothing for a target that has not started', () => {
    const later = target({ startsOn: '2026-11-02', versions: [{ effectiveFrom: '2026-11-02', spec: target().versions[0].spec }] });
    expect(computeScoreboard(input({ today: '2026-10-21', targets: [later] })).results).toEqual([]);
  });

  it('takes "today" as an input: the same entries, a later day, a closed week', () => {
    const entries = [entry('2026-10-05')];
    expect(computeScoreboard(input({ today: '2026-10-11', entries })).results[0].status).toBe('open');
    expect(computeScoreboard(input({ today: '2026-10-12', entries })).history[0].status).toBe('closed');
  });

  it('needs a week start for a weekly target', () => {
    expect(() => computeScoreboard(input({ anchors: anchors({ weekStartsOn: null }) }))).toThrow(/week start/);
  });

  it('asks a person with only deadline targets for no week start', () => {
    const deadline = target({}, { period: { kind: 'deadline', due: '2026-12-18' }, carryOver: 'cumulative', levels: { floor: 5, aspiration: null } });
    const board = computeScoreboard(input({ targets: [deadline], anchors: anchors({ weekStartsOn: null }), entries: [entry('2026-10-06')] }));
    expect(board.results[0]).toMatchObject({ counted: 1, owed: 4 });
  });

  it('still needs the day end for a deadline target', () => {
    const deadline = target({}, { period: { kind: 'deadline', due: '2026-12-18' }, carryOver: 'cumulative', levels: { floor: 5, aspiration: null } });
    expect(() => computeScoreboard(input({ targets: [deadline], anchors: anchors({ weekStartsOn: null, dayEndMinutes: null }) }))).toThrow(/day end/);
  });
});
