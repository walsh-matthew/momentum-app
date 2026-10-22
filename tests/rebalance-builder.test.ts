// The rule-based rebalance proposal builder (lib/utils/rebalance.ts, docs/NINETY_DAY_PLAN_CONTEXT.md
// §5 rules 1 to 4, §10): never cuts work, sizes weeks from finished tasks, keeps certification last,
// and names work that cannot fit instead of dropping it.

import { describe, expect, it } from 'vitest';
import {
  buildRebalanceProposal,
  describeMoveChain,
  groupMovesByTask,
  shiftDateByWeeks,
  summarizeProposalTasks,
  type RebalanceTask,
} from '@/lib/utils/rebalance';
import type { TaskType } from '@/types/database.types';
import { parseRebalanceProposal } from '@/types/rebalance';

let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const task = (title: string, task_type: TaskType, week_of: number, over: Partial<RebalanceTask> = {}): RebalanceTask => ({
  id: id(),
  title,
  task_type,
  minutes: 30,
  status: 'todo',
  week_of,
  due_date: null,
  ...over,
});
const byTitle = (ts: RebalanceTask[], title: string) => ts.find((t) => t.title === title)!;

// The seeded Career Pivot plan (migration 001 §8), all todo.
function seed(): RebalanceTask[] {
  return [
    task('Run the daily job search', 'job_search', 2),
    task('Answer one interview question', 'interview_fill_in', 2),
    task('Build the core flow', 'build', 2),
    task('Study cloud concepts', 'certify', 2),
    task('Watch the video', 'learn', 2),
    task('Register for events', 'position', 2),
    task('Friday review', 'review', 2),
    task('Record a demo', 'build', 3),
    task('Finish cloud study block', 'certify', 3),
    task('Write the case study', 'build', 4),
    task('Take the practice exam', 'certify', 4),
  ];
}

describe('on track', () => {
  it('week 2 with nothing behind gives an empty, valid proposal', () => {
    const p = buildRebalanceProposal(seed(), 2, '2026-10-21');
    expect(p.moves).toHaveLength(0);
    expect(p.warnings).toHaveLength(0);
  });
});

describe('the seeded plan seen from week 4', () => {
  const tasks = seed();
  const p = buildRebalanceProposal(tasks, 4, '2026-11-04');
  const moved = new Map(p.moves.map((m) => [m.taskId, m]));

  it('places all 9 behind tasks, with nothing stuck', () => {
    expect(p.moves).toHaveLength(9);
    expect(p.warnings.some((w) => w.kind === 'cannot_hold')).toBe(false);
  });
  it('never lands work before the current week, and every move goes later', () => {
    expect(p.moves.every((m) => m.toWeek >= 4)).toBe(true);
    expect(p.moves.every((m) => m.toWeek > m.fromWeek)).toBe(true);
  });
  it('only past work moves (week 4 tasks stay)', () => {
    expect(moved.has(byTitle(tasks, 'Write the case study').id)).toBe(false);
    expect(moved.has(byTitle(tasks, 'Take the practice exam').id)).toBe(false);
  });
  it('certification slips before a build does (§5 rule 3)', () => {
    const certWeeks = tasks.filter((t) => t.task_type === 'certify' && moved.has(t.id)).map((t) => moved.get(t.id)!.toWeek);
    const otherWeeks = p.moves
      .filter((m) => tasks.find((t) => t.id === m.taskId)!.task_type !== 'certify')
      .map((m) => m.toWeek);
    expect(Math.min(...certWeeks)).toBeGreaterThanOrEqual(Math.max(...otherWeeks));
  });
  it('warns that week 4 is filled to the planned maximum', () => {
    const compression = p.warnings.find((w) => w.kind === 'compression');
    expect(compression?.weeks).toContain(4);
  });
  it('re-validates through the schema', () => expect(parseRebalanceProposal(p).ok).toBe(true));
  it('takes titles from the rows, not the proposal', () => {
    const sums = summarizeProposalTasks(tasks, p);
    expect(Object.keys(sums)).toHaveLength(9);
    expect(sums[byTitle(tasks, 'Build the core flow').id].title).toBe('Build the core flow');
  });
});

describe('capacity comes from what was finished, not minutes (§5 rules 4 and 8)', () => {
  const tasks: RebalanceTask[] = [
    ...Array.from({ length: 3 }, (_, i) => task(`w1 done ${i}`, 'build', 1, { status: 'done', minutes: 480 })),
    ...Array.from({ length: 4 }, (_, i) => task(`w2 todo ${i}`, 'build', 2)),
    task('w3 planned', 'learn', 3),
  ];
  const p = buildRebalanceProposal(tasks, 3, '2026-11-01');

  it('week 3 holds 3 (1 planned + 2 moved) and the rest spill to week 4', () => {
    expect(p.moves.filter((m) => m.toWeek === 3)).toHaveLength(2);
    expect(p.moves.some((m) => m.toWeek === 4)).toBe(true);
  });
  it('the warning names the finished pace', () => {
    expect(p.warnings.some((w) => /recent pace of 3 finished tasks/.test(w.message))).toBe(true);
  });
});

describe('the end of the plan', () => {
  it('exact fit: all 6 behind tasks are placed, nothing stuck', () => {
    const tasks = [
      ...Array.from({ length: 6 }, (_, i) => task(`late ${i}`, 'build', 10)),
      ...Array.from({ length: 4 }, (_, i) => task(`wk12 ${i}`, 'learn', 12)),
    ];
    const p = buildRebalanceProposal(tasks, 12, '2027-01-10');
    expect(p.moves).toHaveLength(6);
    expect(p.warnings.some((w) => w.kind === 'cannot_hold')).toBe(false);
  });

  describe('overflow when the last two weeks are already full', () => {
    const tasks = [
      ...Array.from({ length: 6 }, (_, i) => task(`late ${i}`, 'build', 10)),
      ...Array.from({ length: 6 }, (_, i) => task(`wk12 ${i}`, 'learn', 12)),
      ...Array.from({ length: 5 }, (_, i) => task(`wk13 ${i}`, 'learn', 13)),
    ];
    const p = buildRebalanceProposal(tasks, 12, '2027-01-10');
    const stuck = p.warnings.find((w) => w.kind === 'cannot_hold');

    it('raises a cannot_hold warning', () => expect(stuck).toBeDefined());
    it('every behind task is either moved or named, none vanish (never cut work)', () => {
      expect(p.moves.length + (stuck?.taskIds.length ?? 0)).toBe(6);
    });
    it('uses only the one free slot in week 13 and places nothing past it', () => {
      expect(p.moves).toHaveLength(1);
      expect(p.moves[0].toWeek).toBe(13);
      expect(p.moves.every((m) => m.toWeek <= 13)).toBe(true);
    });
    it('stuck tasks are not also moved, and the warning names their week', () => {
      expect(stuck?.taskIds.some((tid) => p.moves.some((m) => m.taskId === tid))).toBe(false);
      expect(stuck?.weeks).toEqual([10]);
    });
    it('the summary says the user decides', () => expect(p.summary).toMatch(/you decide/));
  });

  it('overflow on a finished-pace basis: all stuck, none moved, message names the pace', () => {
    const tasks = [
      task('done a', 'build', 9, { status: 'done' }),
      task('done b', 'build', 9, { status: 'done' }),
      ...Array.from({ length: 3 }, (_, i) => task(`late ${i}`, 'build', 10)),
      ...Array.from({ length: 2 }, (_, i) => task(`wk11 ${i}`, 'learn', 11, { status: 'done' })),
      ...Array.from({ length: 2 }, (_, i) => task(`wk12 ${i}`, 'learn', 12)),
      ...Array.from({ length: 2 }, (_, i) => task(`wk13 ${i}`, 'learn', 13)),
    ];
    const p = buildRebalanceProposal(tasks, 12, '2027-01-10');
    const stuck = p.warnings.find((w) => w.kind === 'cannot_hold');
    expect(p.moves).toHaveLength(0);
    expect(stuck?.taskIds).toHaveLength(3);
    expect(stuck?.message).toMatch(/recent pace of 2 finished tasks/);
    expect(p.summary).toMatch(/No unfinished work can be placed/);
  });

  it('past the end of the plan: everything unfinished is named, nothing is cut', () => {
    const p = buildRebalanceProposal([task('left over', 'build', 13), task('also left', 'learn', 11)], 14, '2027-02-01');
    expect(p.moves).toHaveLength(0);
    expect(p.warnings.find((w) => w.kind === 'cannot_hold')?.taskIds).toHaveLength(2);
  });
});

describe('what counts as behind in the current week', () => {
  it('moves an overdue task, not one due today, undated or in a later week', () => {
    const tasks = [
      task('overdue', 'build', 5, { due_date: '2026-11-02' }),
      task('due today', 'build', 5, { due_date: '2026-11-03' }),
      task('undated', 'build', 5),
      task('future', 'build', 6, { due_date: '2026-10-01' }),
    ];
    const p = buildRebalanceProposal(tasks, 5, '2026-11-03');
    expect(p.moves.map((m) => tasks.find((t) => t.id === m.taskId)!.title)).toEqual(['overdue']);
    expect(p.moves[0].toWeek).toBe(6);
  });
  it('done work and future weeks are never touched', () => {
    const p = buildRebalanceProposal([task('ticked', 'build', 1, { status: 'done' }), task('later', 'build', 9)], 5, '2026-11-03');
    expect(p.moves).toHaveLength(0);
    expect(p.warnings).toHaveLength(0);
  });
  it('uses singular wording for one task', () => {
    const p = buildRebalanceProposal([task('one', 'build', 1)], 2, '2026-10-28');
    expect(p.summary).toMatch(/^1 unfinished task can be carried over\./);
  });
});

describe('shiftDateByWeeks keeps the weekday', () => {
  it.each([
    ['2026-10-21', 1, '2026-10-28'],
    ['2026-10-21', 2, '2026-11-04'],
    ['2026-10-21', -1, '2026-10-14'],
    ['2026-12-28', 1, '2027-01-04'],
  ])('%s %+d week(s) -> %s', (date, weeks, want) => expect(shiftDateByWeeks(date, weeks)).toBe(want));
  it('gives null for a bad date', () => expect(shiftDateByWeeks('nope', 1)).toBeNull());
});

describe('the output carries no way to delete or complete anything', () => {
  it('has no delete or status vocabulary', () => {
    const text = JSON.stringify(buildRebalanceProposal(seed(), 4, '2026-11-04'));
    expect(text).not.toMatch(/delete|"status"|"done"/i);
  });
});

describe('move chains (MOM-22)', () => {
  const row = (task_id: string, source_week: number, target_week: number, shift_type: 'carry_over' | 'pull_forward' = 'carry_over') => ({
    task_id,
    source_week,
    target_week,
    shift_type,
  });

  it('groups one flat history result into a chain per task, keeping the order given', () => {
    const chains = groupMovesByTask([row('a', 2, 3), row('b', 4, 5), row('a', 3, 5), row('a', 5, 4, 'pull_forward')]);
    expect(Object.keys(chains).sort()).toEqual(['a', 'b']);
    expect(chains.a).toEqual([
      { sourceWeek: 2, targetWeek: 3, shiftType: 'carry_over' },
      { sourceWeek: 3, targetWeek: 5, shiftType: 'carry_over' },
      { sourceWeek: 5, targetWeek: 4, shiftType: 'pull_forward' },
    ]);
    expect(chains.b).toHaveLength(1);
  });
  it('is empty for no history', () => expect(groupMovesByTask([])).toEqual({}));
  it('describes a path from the first source through every target', () => {
    expect(describeMoveChain([{ sourceWeek: 2, targetWeek: 3 }, { sourceWeek: 3, targetWeek: 5 }])).toBe('Week 2 → 3 → 5');
    expect(describeMoveChain([{ sourceWeek: 2, targetWeek: 3 }])).toBe('Week 2 → 3');
  });
  it('describes a task that never moved as an empty string', () => expect(describeMoveChain([])).toBe(''));
});
