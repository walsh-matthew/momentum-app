// Zod contract for rebalance proposals (types/rebalance.ts). Encodes the plan invariants:
// never cut unfinished work, the user owns completion, and the timeline is never silently overrun
// (docs/NINETY_DAY_PLAN_CONTEXT.md §3, §5 rules 1 and 6, §10).

import { describe, expect, it } from 'vitest';
import { parseRebalanceProposal } from '@/types/rebalance';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const carry = { action: 'carry_over', taskId: A, fromWeek: 2, toWeek: 3, reason: 'Unfinished in week 2.' };
const base = (over: object = {}) => ({ summary: 'Move one task.', moves: [carry], warnings: [], ...over });

function rejects(raw: unknown, message?: RegExp) {
  const result = parseRebalanceProposal(raw);
  expect(result.ok).toBe(false);
  if (!result.ok && message) expect(result.error).toMatch(message);
}

describe('accepted proposals', () => {
  it('a carry-over', () => expect(parseRebalanceProposal(base()).ok).toBe(true));
  it('a pull-forward', () => {
    const move = { action: 'pull_forward', taskId: A, fromWeek: 5, toWeek: 3, reason: 'Early.' };
    expect(parseRebalanceProposal(base({ moves: [move] })).ok).toBe(true);
  });
  it('an empty plan (nothing to move)', () => expect(parseRebalanceProposal(base({ moves: [] })).ok).toBe(true));
  it('a compression warning', () => {
    const warnings = [{ kind: 'compression', weeks: [3], taskIds: [A], message: 'Week 3 is full.' }];
    expect(parseRebalanceProposal(base({ warnings })).ok).toBe(true);
  });
  it('a cannot_hold warning that names tasks which are NOT moved', () => {
    const warnings = [{ kind: 'cannot_hold', weeks: [13], taskIds: [B], message: 'No room.' }];
    expect(parseRebalanceProposal(base({ warnings })).ok).toBe(true);
  });
});

describe('the no-delete invariant (§5 rule 1, §10)', () => {
  it.each(['delete', 'cut', 'remove', 'drop', 'skip', 'cancel', 'archive'])('rejects the action "%s"', (action) => {
    rejects(base({ moves: [{ ...carry, action }] }), /never deleted/);
  });
  it('rejects an extra delete flag on a valid move', () => rejects(base({ moves: [{ ...carry, delete: true }] })));
  it('rejects a top-level deletions array', () => rejects(base({ deletions: [A] })));
  it('rejects a move with no action', () => {
    rejects(base({ moves: [{ taskId: A, fromWeek: 2, toWeek: 3, reason: 'x' }] }));
  });
});

describe('the user owns completion (§3, §5 rule 6)', () => {
  it('rejects a status field on a move', () => rejects(base({ moves: [{ ...carry, status: 'done' }] })));
  it('rejects completed_at-style fields too', () => rejects(base({ moves: [{ ...carry, completed_at: 'now' }] })));
});

describe('move direction matches the database checks (migration 001)', () => {
  it('a carry-over to an earlier week', () => {
    rejects(base({ moves: [{ ...carry, fromWeek: 3, toWeek: 2 }] }), /later week/);
  });
  it('a carry-over to the same week', () => rejects(base({ moves: [{ ...carry, toWeek: 2 }] }), /later week/));
  it('a pull-forward to a later week', () => {
    const move = { action: 'pull_forward', taskId: A, fromWeek: 3, toWeek: 5, reason: 'x' };
    rejects(base({ moves: [move] }), /earlier week/);
  });
});

describe('plan bounds', () => {
  it('rejects a target week past the plan (14)', () => rejects(base({ moves: [{ ...carry, toWeek: 14 }] })));
  it('rejects week 0', () => rejects(base({ moves: [{ ...carry, fromWeek: 0, toWeek: 1 }] })));
  it('rejects a fractional week', () => rejects(base({ moves: [{ ...carry, toWeek: 3.5 }] })));
});

describe('shape', () => {
  it('rejects a bad task id', () => rejects(base({ moves: [{ ...carry, taskId: 'not-an-id' }] })));
  it('rejects a blank reason', () => rejects(base({ moves: [{ ...carry, reason: '   ' }] })));
  it('rejects the same task twice in one proposal', () => {
    rejects(base({ moves: [carry, { ...carry, toWeek: 4 }] }), /only move once/);
  });
  it('rejects more than 100 moves', () => {
    const moves = Array.from({ length: 101 }, (_, i) => ({
      ...carry,
      taskId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    }));
    rejects(base({ moves }));
  });
});

describe("if the timeline can't hold, say so (§5 rule 1)", () => {
  it('a cannot_hold warning must name the tasks that do not fit', () => {
    const warnings = [{ kind: 'cannot_hold', weeks: [13], taskIds: [], message: 'No room.' }];
    rejects(base({ warnings }), /must name the tasks/);
  });
  it('a task that does not fit cannot also be moved', () => {
    const warnings = [{ kind: 'cannot_hold', weeks: [2], taskIds: [A], message: 'No room.' }];
    rejects(base({ warnings }), /cannot also be moved/);
  });
  it('rejects an unknown warning kind', () => {
    rejects(base({ warnings: [{ kind: 'delete_overflow', weeks: [3], taskIds: [], message: 'x' }] }));
  });
});

describe('garbage in', () => {
  it('null', () => rejects(null));
  it('a string', () => rejects('delete everything'));
});
