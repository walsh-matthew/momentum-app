// Rebalance proposal contract (docs/NINETY_DAY_PLAN_CONTEXT.md §5 rules 1 and 2, §10).
//
// Every proposal, rule-based today and model-written in Phase 2, goes through
// parseRebalanceProposal() before it is shown or applied (PRODUCT_STRATEGY.md §4, AI Guardrails).
//
// Invariants encoded here:
// - Never cut unfinished work (§5 rule 1, §10). The only actions are `carry_over` and `pull_forward`;
//   there is no delete, cut, drop or skip action. Every object is strict, so a stray key such as
//   `delete: true` is rejected instead of silently ignored.
// - The user owns completion (§3, §5 rule 6). There is no `status` field, so a proposal cannot tick
//   a task, and `.strict()` rejects one that tries.
// - If the timeline can't hold, say so and let the user decide (§5 rule 1). Work that does not fit
//   before the last plan week must be named in a `cannot_hold` warning and stays where it is; it is
//   never dropped and never pushed past the plan.

import { z } from 'zod';
import { PLAN_WEEKS, type ShiftType, type TaskType } from './database.types';

export const REBALANCE_ACTIONS = ['carry_over', 'pull_forward'] as const;
export type RebalanceAction = (typeof REBALANCE_ACTIONS)[number];

// `compression`: a week that takes moved work ends with no slack. `cannot_hold`: work that does not
// fit before the plan ends, so the user has to decide what happens to it.
export const TIMELINE_WARNING_KINDS = ['compression', 'cannot_hold'] as const;
export type TimelineWarningKind = (typeof TIMELINE_WARNING_KINDS)[number];

// Who wrote a proposal. 'rules' is the deterministic builder (lib/utils/rebalance.ts); 'model' is Claude
// (lib/ai/rebalance.ts). Both must pass TaskRebalanceSchema before anyone sees them.
export const REBALANCE_SOURCES = ['rules', 'model'] as const;
export type RebalanceSource = (typeof REBALANCE_SOURCES)[number];

export const MAX_REBALANCE_MOVES = 100;
const MAX_WARNINGS = 20;

const WeekSchema = z.number().int().min(1).max(PLAN_WEEKS);
// guid(), not uuid(): accepts any 8-4-4-4-12 hex id, like the pattern the task service checks.
const TaskIdSchema = z.guid();
const TextSchema = (max: number) => z.string().trim().min(1).max(max);

const moveFields = {
  taskId: TaskIdSchema,
  fromWeek: WeekSchema,
  toWeek: WeekSchema,
  // Why this task moves, in plain language. Shown to the user next to the move.
  reason: TextSchema(300),
};

// Direction is part of the contract: micro_tasks requires carried_from_week < week_of and
// pulled_from_week > week_of (migration 001), so a move that points the wrong way could never save.
const CarryOverMoveSchema = z
  .strictObject({ action: z.literal('carry_over'), ...moveFields })
  .refine((m) => m.toWeek > m.fromWeek, {
    message: 'A carry-over must move work to a later week.',
    path: ['toWeek'],
  });

const PullForwardMoveSchema = z
  .strictObject({ action: z.literal('pull_forward'), ...moveFields })
  .refine((m) => m.toWeek < m.fromWeek, {
    message: 'A pull-forward must move work to an earlier week.',
    path: ['toWeek'],
  });

export const RebalanceMoveSchema = z.discriminatedUnion('action', [CarryOverMoveSchema, PullForwardMoveSchema], {
  error: 'A move must carry work over or pull it forward. Tasks are never deleted.',
});
export type RebalanceMove = z.infer<typeof RebalanceMoveSchema>;

export const TimelineWarningSchema = z.strictObject({
  kind: z.enum(TIMELINE_WARNING_KINDS),
  // The weeks the warning is about: the full receiving weeks, or the weeks the stuck work sits in.
  weeks: z.array(WeekSchema).min(1).max(PLAN_WEEKS),
  taskIds: z.array(TaskIdSchema).max(MAX_REBALANCE_MOVES),
  message: TextSchema(300),
});
export type TimelineWarning = z.infer<typeof TimelineWarningSchema>;

export const TaskRebalanceSchema = z
  .strictObject({
    // One or two sentences on what the proposal does overall.
    summary: TextSchema(400),
    moves: z.array(RebalanceMoveSchema).max(MAX_REBALANCE_MOVES),
    warnings: z.array(TimelineWarningSchema).max(MAX_WARNINGS),
  })
  .superRefine((proposal, ctx) => {
    const moved = new Set<string>();
    proposal.moves.forEach((move, i) => {
      if (moved.has(move.taskId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'A task can only move once per proposal.',
          path: ['moves', i, 'taskId'],
        });
      }
      moved.add(move.taskId);
    });

    proposal.warnings.forEach((warning, i) => {
      if (warning.kind !== 'cannot_hold') return;
      if (warning.taskIds.length === 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'A warning that the timeline cannot hold must name the tasks that do not fit.',
          path: ['warnings', i, 'taskIds'],
        });
      }
      if (warning.taskIds.some((id) => moved.has(id))) {
        ctx.addIssue({
          code: 'custom',
          message: 'A task that does not fit the timeline cannot also be moved.',
          path: ['warnings', i, 'taskIds'],
        });
      }
    });
  });
export type RebalanceProposal = z.infer<typeof TaskRebalanceSchema>;

export type RebalanceParseResult = { ok: true; data: RebalanceProposal } | { ok: false; error: string };

// Entry point for any proposal generator's output, rule-based or model, and for a proposal that
// comes back from the client on apply.
export function parseRebalanceProposal(raw: unknown): RebalanceParseResult {
  const parsed = TaskRebalanceSchema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join(' ') };
}

// ---------------------------------------------------------------------------
// View and result shapes (not part of the model contract)
// ---------------------------------------------------------------------------

// Display details for a task a proposal names. Read from the database, never from model output, so
// a model cannot relabel a task.
// One move a task has made, as the UI needs it. Read from task_rebalance_history (migration 003),
// never from model output.
export interface TaskMove {
  sourceWeek: number;
  targetWeek: number;
  shiftType: ShiftType;
}

// Every move of every task, keyed by task id, oldest move first. Built once per page load from a
// single history query, so no card or drawer row needs its own query.
export type TaskMoveChains = Record<string, TaskMove[]>;

export interface RebalanceTaskSummary {
  id: string;
  title: string;
  taskType: TaskType;
  minutes: number;
}

export interface RebalanceProposalView {
  proposal: RebalanceProposal;
  source: RebalanceSource;
  // The model that wrote it when source is 'model', for attribution in the drawer. Otherwise null.
  model: string | null;
  // Set when the user asked for a model suggestion and got the rule-based one instead, with the reason
  // in plain words. Fixed wording from our own code, never model or provider text.
  notice: string | null;
  // Every task the proposal names, keyed by task id.
  tasks: Record<string, RebalanceTaskSummary>;
  currentWeek: number;
}

export interface RebalanceSkippedMove {
  taskId: string;
  reason: string;
}

// What applying a proposal did. A move is skipped, not failed, when the task changed since the
// proposal was made; the rest still apply.
export interface RebalanceApplyResult {
  moved: string[];
  skipped: RebalanceSkippedMove[];
}
