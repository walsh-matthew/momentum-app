// Threshold crossings (lib/engine/crossings.ts, docs/DOMAIN_MODEL.md §1.7): floor, aspiration, step, block end.

import { describe, expect, it } from 'vitest';
import { computeScoreboard, stepCompletions } from '@/lib/engine';
import { entry, input, target } from './helpers/engineFixtures';
import type { Crossing } from '@/types/scoreboard';

const kinds = (crossings: Crossing[], kind: Crossing['kind']) => crossings.filter((c) => c.kind === kind);

describe('floor and aspiration', () => {
  it('are dated at the entry that reached the level', () => {
    const entries = [
      entry('2026-10-12'),
      entry('2026-10-13'),
      entry('2026-10-15'), // the third: floor
      entry('2026-10-16'),
      entry('2026-10-17'), // the fifth: aspiration
    ];
    const { crossings } = computeScoreboard(input({ today: '2026-10-18', entries }));
    expect(crossings).toEqual([
      { kind: 'floor', targetId: 't1', periodStart: '2026-10-12', on: '2026-10-15' },
      { kind: 'aspiration', targetId: 't1', periodStart: '2026-10-12', on: '2026-10-17' },
    ]);
  });

  it('are both reported, on the same day, when one entry reaches both', () => {
    const { crossings } = computeScoreboard(input({ today: '2026-10-14', entries: [entry('2026-10-13', { value: 5 })] }));
    expect(crossings.map((c) => [c.kind, c.kind === 'floor' || c.kind === 'aspiration' ? c.on : null])).toEqual([
      ['floor', '2026-10-13'],
      ['aspiration', '2026-10-13'],
    ]);
  });

  it('are not reported below the floor', () => {
    const { crossings } = computeScoreboard(input({ today: '2026-10-14', entries: [entry('2026-10-12'), entry('2026-10-13')] }));
    expect(crossings).toEqual([]);
  });

  it('are not reached by a removed entry', () => {
    const entries = [entry('2026-10-12'), entry('2026-10-13'), entry('2026-10-14', { removed: true })];
    expect(computeScoreboard(input({ today: '2026-10-15', entries })).crossings).toEqual([]);
  });

  it('are reported for every period, so the review can pick the ones since its last', () => {
    const entries = [entry('2026-10-05', { value: 3 }), entry('2026-10-12', { value: 3 })];
    const { crossings } = computeScoreboard(input({ today: '2026-10-14', entries }));
    expect(kinds(crossings, 'floor').map((c) => c.kind === 'floor' && c.periodStart)).toEqual(['2026-10-05', '2026-10-12']);
  });
});

describe('steps', () => {
  it('a finished milestone or deadline-task step is a crossing', () => {
    const steps = [
      { id: 's1', itemId: 'i1', plannedPeriodStart: '2026-10-12', completedOn: '2026-10-13' },
      { id: 's2', itemId: 'i1', plannedPeriodStart: '2026-10-12', completedOn: null },
    ];
    expect(stepCompletions(steps)).toEqual([{ kind: 'step', targetId: null, itemId: 'i1', stepId: 's1', on: '2026-10-13' }]);
  });

  it('a checklist step ticked for the first time is a crossing', () => {
    const t = target({}, { measure: 'checklist', stepIds: ['a', 'b'], levels: { floor: 2, aspiration: null } });
    const entries = [entry('2026-10-12', { stepId: 'a' }), entry('2026-10-13', { stepId: 'a' }), entry('2026-10-14', { stepId: 'b' })];
    const { crossings } = computeScoreboard(input({ today: '2026-10-15', targets: [t], entries }));
    expect(kinds(crossings, 'step')).toEqual([
      { kind: 'step', targetId: 't1', itemId: null, stepId: 'a', on: '2026-10-12' },
      { kind: 'step', targetId: 't1', itemId: null, stepId: 'b', on: '2026-10-14' },
    ]);
  });
});

describe('block end', () => {
  const t = target({ blockEndsOn: '2026-10-18' });
  const entries = [
    entry('2026-10-05', { value: 3 }), // week 1: floor
    entry('2026-10-12', { value: 5 }), // week 2: aspiration
  ];

  it('reports how the block went once its last day is past', () => {
    const { crossings } = computeScoreboard(input({ today: '2026-10-19', targets: [t], entries }));
    expect(kinds(crossings, 'block_end')).toEqual([
      { kind: 'block_end', targetId: 't1', on: '2026-10-18', periodsJudged: 2, floorMet: 2, aspirationMet: 1 },
    ]);
  });

  it('says nothing on the last day itself, or when the target has no block', () => {
    expect(kinds(computeScoreboard(input({ today: '2026-10-18', targets: [t], entries })).crossings, 'block_end')).toEqual([]);
    expect(kinds(computeScoreboard(input({ today: '2026-10-19', entries })).crossings, 'block_end')).toEqual([]);
  });

  it('leaves a partial first week out of what it judged', () => {
    const late = target({ startsOn: '2026-10-08', blockEndsOn: '2026-10-18' });
    const board = computeScoreboard(input({ today: '2026-10-19', targets: [late], entries }));
    expect(kinds(board.crossings, 'block_end')).toMatchObject([{ periodsJudged: 1 }]);
  });
});
