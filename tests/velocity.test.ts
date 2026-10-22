// Velocity score and burnout risk (lib/utils/velocity.ts, docs/NINETY_DAY_PLAN_CONTEXT.md §10):
// derived from ticks and carry-over, never logged hours.

import { describe, expect, it } from 'vitest';
import { computeVelocity, currentPlanWeek, type VelocityMove, type VelocityTask } from '@/lib/utils/velocity';

let n = 0;
const t = (
  week_of: number,
  status: 'todo' | 'done',
  carried_from_week: number | null = null,
  due_date: string | null = null,
  id = `task-${++n}`,
): VelocityTask => ({ id, week_of, status, carried_from_week, due_date });
const move = (task_id: string, source_week: number, target_week: number, shift_type: 'carry_over' | 'pull_forward' = 'carry_over'): VelocityMove => ({
  task_id,
  source_week,
  target_week,
  shift_type,
});
const week = (snapshot: ReturnType<typeof computeVelocity>, w: number) => snapshot.weeks.find((x) => x.week === w);

describe('currentPlanWeek', () => {
  it('is week 2 a week after the start', () => expect(currentPlanWeek('2026-10-14', '2026-10-21')).toBe(2));
  it('is week 1 on the start date', () => expect(currentPlanWeek('2026-10-14', '2026-10-14')).toBe(1));
  it('is week 1 before the start date', () => expect(currentPlanWeek('2026-10-30', '2026-10-21')).toBe(1));
  it('is null for an unparseable date', () => expect(currentPlanWeek('nope', '2026-10-21')).toBeNull());
});

describe('computeVelocity', () => {
  it('has no risk and no score with no tasks', () => {
    const v = computeVelocity([], 2, '2026-10-21');
    expect(v.risk).toBeNull();
    expect(v.score).toBeNull();
  });

  it('counts tasks carried out of a week, and reads carry pressure into a rising risk', () => {
    // w1: 4 tasks, 2 done, 2 carried to w2. w2: 2 carried in + 2 new (1 done), and 3 of its tasks carried
    // to w3, so w2 owed 4 + 3 = 7. w3: those 3 carried in + 1 new.
    // (The scratch version of this test expected 6 for w2, which miscounted its own data.)
    const tasks = [
      t(1, 'done'), t(1, 'done'), t(2, 'todo', 1), t(2, 'todo', 1), t(2, 'done'), t(2, 'todo'),
      t(3, 'todo', 2), t(3, 'todo', 2), t(3, 'todo', 2), t(3, 'todo'),
    ];
    const v = computeVelocity(tasks, 3, '2026-12-01');
    expect(v.weeks.map((w) => [w.week, w.planned, w.done, w.carryPressure])).toEqual([
      [3, 4, 0, true],
      [2, 7, 1, true],
      [1, 4, 2, false],
    ]);
    expect(v.pressureStreak).toBe(2);
    expect(v.risk).toBe('rising');
    expect(v.score).toBe(0);
  });

  it('mid-week, counts only what is due so far', () => {
    const m = computeVelocity(
      [t(2, 'done', null, '2026-10-20'), t(2, 'todo', null, '2026-10-22'), t(2, 'todo', null, '2026-10-21')],
      2,
      '2026-10-21',
    );
    expect(m.weeks[0].planned).toBe(2);
    expect(m.score).toBe(50);
  });

  it('counts the streak from the latest week that has tasks when the current week is not built yet', () => {
    const g = computeVelocity([t(1, 'done'), t(2, 'todo', 1), t(2, 'todo', 1), t(2, 'todo')], 3, '2026-12-01');
    expect(g.weeks[0].week).toBe(2);
    expect(g.risk).toBe('low');
  });

  it('ignores weeks after the current one (work planned ahead is not a miss)', () => {
    const v = computeVelocity([t(2, 'done'), t(5, 'todo')], 2, '2026-10-21');
    expect(v.weeks.map((w) => w.week)).toEqual([2]);
  });
});

describe('carry-out from the move history (MOM-22)', () => {
  // The ticket's case: task "late" was carried 2 -> 3, then 3 -> 5. a and b are done in week 2, c in week 3.
  const tasks = [t(2, 'done', null, null, 'a'), t(2, 'done', null, null, 'b'), t(3, 'done', null, null, 'c'), t(5, 'todo', 3, null, 'late')];
  const history = [move('late', 2, 3), move('late', 3, 5)];

  it('counts a twice-carried task against every week it left', () => {
    const v = computeVelocity(tasks, 5, '2026-12-01', history);
    expect([week(v, 2)?.planned, week(v, 2)?.done, week(v, 2)?.score]).toEqual([3, 2, 67]);
    expect([week(v, 3)?.planned, week(v, 3)?.done, week(v, 3)?.score]).toEqual([2, 1, 50]);
  });

  it('without history, only the last hop is known (week 2 reads too high)', () => {
    const v = computeVelocity(tasks, 5, '2026-12-01');
    expect([week(v, 2)?.planned, week(v, 2)?.score]).toEqual([2, 100]);
    expect([week(v, 3)?.planned, week(v, 3)?.score]).toEqual([2, 50]);
  });

  it('does not double count when the marker and the history agree', () => {
    const v = computeVelocity(tasks, 5, '2026-12-01', [move('late', 3, 5)]);
    expect(week(v, 3)?.planned).toBe(2);
  });

  it('counts a task carried out and pulled back once, in the week it is back in', () => {
    const tasks2 = [t(3, 'todo', null, null, 'x'), t(3, 'done', null, null, 'y')];
    const v = computeVelocity(tasks2, 4, '2026-12-01', [move('x', 3, 5), move('x', 5, 3, 'pull_forward')]);
    expect([week(v, 3)?.planned, week(v, 3)?.done]).toEqual([2, 1]);
  });

  it('ignores a pull-forward as a carry-out', () => {
    const v = computeVelocity([t(2, 'done', null, null, 'p'), t(3, 'todo', null, null, 'q')], 3, '2026-12-01', [move('q', 5, 3, 'pull_forward')]);
    expect(week(v, 3)?.planned).toBe(1);
  });

  it('ignores history for a task it does not have', () => {
    const v = computeVelocity([t(2, 'done', null, null, 'y')], 3, '2026-12-01', [move('ghost', 2, 3)]);
    expect(week(v, 2)?.planned).toBe(1);
  });
});
