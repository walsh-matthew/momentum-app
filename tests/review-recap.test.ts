// lib/services/reviewRecap.ts (MOM-113 block 3.2): the engine's layer 1 facts and the person's own titles, mapped onto the
// card home draws for a counted target. Pure, so it is tested here row by row; tests/review-records-service.test.ts runs it
// through the service and the fake database.

import { describe, expect, it } from 'vitest';
import { buildStoredRecap, recapValues } from '@/lib/services/reviewRecap';
import type { ActiveGoalRead, TargetRead } from '@/lib/services/scoreboardRows';
import type { Layer1TargetFact } from '@/types/scoreboard';
import { periodResult } from './helpers/engineFixtures';

const WINDOW = { start: '2026-10-19', end: '2026-10-25' };

const goal = (id: string, title: string): ActiveGoalRead => ({
  id,
  title,
  state: 'active',
  shape: 'ongoing',
  start_date: '2026-10-05',
  end_date: null,
  created_at: `2026-10-05T00:00:0${id.length}.000Z`,
});

const row = (id: string, goalId: string, title: string, over: Partial<TargetRead> = {}): TargetRead => ({
  id,
  goal_id: goalId,
  title,
  measure: 'count',
  unit: null,
  role: 'effort',
  period_kind: 'weekly',
  due_date: null,
  slot_weekdays: null,
  floor: 3,
  aspiration: 5,
  qualifying_threshold: null,
  carry_over_kind: 'habit',
  created_at: `2026-10-05T00:00:${id.padStart(2, '0')}.000Z`,
  ...over,
});

const fact = (targetId: string, over: Partial<Layer1TargetFact> = {}, result: Parameters<typeof periodResult>[1] = {}): Layer1TargetFact => ({
  targetId,
  result: periodResult('floor', { targetId, periodStart: WINDOW.start, periodEnd: WINDOW.end, counted: 3, ...result }),
  crossings: [],
  patterns: [],
  trend: null,
  ...over,
});

const build = (over: Partial<Parameters<typeof buildStoredRecap>[0]> = {}) =>
  buildStoredRecap({
    window: WINDOW,
    closedEarly: false,
    goals: [goal('g1', 'Stay fit')],
    targets: [row('1', 'g1', 'Workouts')],
    facts: [fact('1')],
    priorities: [],
    weekStartsOn: 1,
    ...over,
  });

describe('buildStoredRecap', () => {
  it('carries the engine\'s numbers and the person\'s titles onto the counted card, and the week and how it closed', () => {
    const recap = build({ closedEarly: true, priorities: [{ id: 'p1', label: 'Family time' }] });
    expect(recap.v).toBe(1);
    expect(recap.window).toEqual(WINDOW);
    expect(recap.closedEarly).toBe(true);
    expect(recap.priorities).toEqual([{ id: 'p1', label: 'Family time' }]);
    expect(recap.goals).toEqual([
      {
        id: 'g1',
        title: 'Stay fit',
        targets: [
          expect.objectContaining({ id: '1', title: 'Workouts', status: 'counted', counted: 3, level: 'floor', graded: true, floor: 3, aspiration: 5, pattern: null, trend: null, crossings: [] }),
        ],
      },
    ]);
  });

  it('leaves out a goal with no period closing that week, and a target with no fact', () => {
    const recap = build({
      goals: [goal('g1', 'Stay fit'), goal('g2', 'Read more')],
      targets: [row('1', 'g1', 'Workouts'), row('2', 'g2', 'Pages')],
      facts: [fact('1')],
    });
    expect(recap.goals.map((g) => g.title)).toEqual(['Stay fit']);
  });

  it('orders targets by when they were made and goals as given, never by id', () => {
    const recap = build({
      targets: [row('9', 'g1', 'Second', { created_at: '2026-10-05T00:00:20.000Z' }), row('2', 'g1', 'First', { created_at: '2026-10-05T00:00:10.000Z' })],
      facts: [fact('9'), fact('2')],
    });
    expect(recap.goals[0].targets.map((t) => t.title)).toEqual(['First', 'Second']);
  });

  it('shows only the crossings of a floor, an aspiration or a block end, oldest first', () => {
    const recap = build({
      facts: [
        fact('1', {
          crossings: [
            { kind: 'aspiration', targetId: '1', periodStart: WINDOW.start, on: '2026-10-24' },
            { kind: 'floor', targetId: '1', periodStart: WINDOW.start, on: '2026-10-21' },
            { kind: 'step', targetId: '1', itemId: 'i', stepId: 's', on: '2026-10-22' },
            { kind: 'block_end', targetId: '1', on: '2026-10-25', periodsJudged: 4, floorMet: 3, aspirationMet: 1 },
          ],
        }),
      ],
    });
    expect(recap.goals[0].targets[0].crossings).toEqual([
      { kind: 'floor', on: '2026-10-21' },
      { kind: 'aspiration', on: '2026-10-24' },
      { kind: 'block_end', on: '2026-10-25' },
    ]);
  });

  it('shows one pattern, the slipping one first, and only for a graded target', () => {
    const patterns = [
      { kind: 'holding' as const, targetId: '1', periods: 4, endingPeriodStart: WINDOW.start },
      { kind: 'slipping' as const, targetId: '1', periods: 2, endingPeriodStart: WINDOW.start },
    ];
    expect(build({ facts: [fact('1', { patterns })] }).goals[0].targets[0].pattern).toEqual({ kind: 'slipping', periods: 2 });
    const ungraded = build({ facts: [fact('1', { patterns }, { graded: false })] });
    expect(ungraded.goals[0].targets[0].pattern).toBeNull();
  });

  it('puts the named days of a day-slot target in the order of the person\'s own week', () => {
    const slots = { filled: 2, total: 3, extraEntries: 0 };
    // Database weekdays: Sunday is 7, Monday 1. A Wednesday-start week reads Wed, Fri, Sun, Mon.
    const recap = build({
      weekStartsOn: 3,
      targets: [row('1', 'g1', 'Gym', { period_kind: 'day_slots', slot_weekdays: [1, 7, 3, 5] })],
      facts: [fact('1', {}, { slots })],
    });
    expect(recap.goals[0].targets[0].slots).toEqual({ filled: 2, total: 3, weekdays: [3, 5, 0, 1] });
  });

  it('keeps an outcome target\'s trend and the person\'s unit, and turns numeric strings into numbers', () => {
    const recap = build({
      targets: [row('1', 'g1', 'Distance', { measure: 'quantity', unit: 'km', role: 'outcome', floor: '15' as unknown as number, aspiration: null })],
      facts: [fact('1', { trend: { targetId: '1', counts: [10, 12, 15], direction: 'up' } })],
    });
    expect(recap.goals[0].targets[0]).toMatchObject({ unit: 'km', role: 'outcome', floor: 15, aspiration: null, trend: { counts: [10, 12, 15], direction: 'up' } });
  });
});

describe('recapValues', () => {
  it('lists what each target read, for the comparison with the same week now', () => {
    const recap = build({ facts: [fact('1', {}, { counted: 2 })] });
    expect(recapValues(recap)).toEqual([{ targetId: '1', counted: 2, level: 'floor', graded: true }]);
  });
});
