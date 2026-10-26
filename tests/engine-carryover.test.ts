// Carry-over (lib/engine/carryover.ts, docs/DOMAIN_MODEL.md §1.4, principle 11): steps move forward and are
// never silently cut; a habit shortfall is never owed the next period.

import { describe, expect, it } from 'vitest';
import { carryForwardSteps, computeScoreboard } from '@/lib/engine';
import { anchors, entry, input } from './helpers/engineFixtures';
import type { WorkStep } from '@/types/scoreboard';

const step = (id: string, plannedPeriodStart: string, completedOn: string | null = null): WorkStep => ({
  id,
  itemId: 'item-1',
  plannedPeriodStart,
  completedOn,
});

describe('carryForwardSteps', () => {
  const steps = [
    step('old-open', '2026-10-05'),
    step('old-done', '2026-10-05', '2026-10-08'),
    step('this-week', '2026-10-12'),
    step('later', '2026-10-19'),
  ];

  it('plans an unfinished step from a closed week in the current week, and says where it came from', () => {
    const { moved } = carryForwardSteps(steps, '2026-10-14', anchors());
    expect(moved).toEqual([{ stepId: 'old-open', itemId: 'item-1', from: '2026-10-05', to: '2026-10-12' }]);
  });

  it('leaves finished steps, this week’s steps and later steps where they are', () => {
    const out = carryForwardSteps(steps, '2026-10-14', anchors()).steps;
    expect(out.map((s) => [s.id, s.plannedPeriodStart])).toEqual([
      ['old-open', '2026-10-12'],
      ['old-done', '2026-10-05'],
      ['this-week', '2026-10-12'],
      ['later', '2026-10-19'],
    ]);
  });

  it('cuts nothing: every step comes back, in order, and the input is not changed', () => {
    const before = structuredClone(steps);
    const out = carryForwardSteps(steps, '2026-11-30', anchors()).steps;
    expect(out.map((s) => s.id)).toEqual(steps.map((s) => s.id));
    expect(steps).toEqual(before);
  });

  it('moves a step again each week it is still unfinished', () => {
    const first = carryForwardSteps([step('s', '2026-10-05')], '2026-10-14', anchors());
    const second = carryForwardSteps(first.steps, '2026-10-21', anchors());
    expect(second.moved).toEqual([{ stepId: 's', itemId: 'item-1', from: '2026-10-12', to: '2026-10-19' }]);
  });

  it('needs the week start, because steps are planned in the person’s weeks', () => {
    expect(() => carryForwardSteps(steps, '2026-10-14', anchors({ weekStartsOn: null }))).toThrow(/week start/);
  });
});

describe('a habit shortfall is not owed the next week', () => {
  it('week 2 still asks for 3, not 4, after 2 of 3 in week 1', () => {
    const board = computeScoreboard(
      input({ today: '2026-10-14', entries: [entry('2026-10-05'), entry('2026-10-06')] }),
    );
    const [week1] = board.history;
    const [week2] = board.results;
    expect(week1).toMatchObject({ periodStart: '2026-10-05', counted: 2, remainingToFloor: 1, owed: 0 });
    expect(week2).toMatchObject({ periodStart: '2026-10-12', floor: 3, remainingToFloor: 3, owed: 0 });
  });
});
