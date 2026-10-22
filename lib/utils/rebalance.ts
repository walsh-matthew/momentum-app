// Rule-based rebalance proposal (docs/NINETY_DAY_PLAN_CONTEXT.md §5 rules 1 to 4, §10).
//
// Pure functions over task rows: no Supabase, no clock, no side effects. Callers fetch rows through
// @/lib/services and pass `asOf` in. This is the deterministic stand-in for the Phase 2 model; both
// produce a RebalanceProposal that must pass parseRebalanceProposal() (see proposeRebalance in
// @/lib/services/tasks.ts).
//
// What it will and will not do:
// - It only moves unfinished work forward (§5 rule 1). It never proposes cutting a task, and it
//   never ticks one (§3, §5 rule 6): the proposal type has no delete action and no status field.
// - It sizes weeks from what the user actually finished, not from minutes or logged hours (§5 rule 4),
//   and takes the conservative figure when more than one is available (§5 rule 8).
// - Certification slips before a build does (§5 rule 3): when weeks are tight, `certify` tasks are
//   placed last.
// - When work does not fit before the last plan week it is named in a `cannot_hold` warning and left
//   where it is, for the user to decide (§5 rule 1).
// - Pull-forward (§5 rule 2) and "interviews win" (§5 rule 3) need task tags the schema does not have
//   yet (see BACKLOG.md), so the rule-based builder only proposes carry-overs. The schema and the
//   service already support pull-forward.

import { PLAN_WEEKS, type MicroTask, type TaskRebalanceHistory } from '@/types/database.types';
import {
  parseRebalanceProposal,
  type RebalanceMove,
  type RebalanceProposal,
  type RebalanceTaskSummary,
  type TaskMoveChains,
  type TimelineWarning,
} from '@/types/rebalance';

export type RebalanceTask = Pick<
  MicroTask,
  'id' | 'title' | 'task_type' | 'minutes' | 'status' | 'week_of' | 'due_date'
>;

// Groups one history query's rows into a chain per task. Rows are expected oldest first, as
// listRebalanceHistory returns them; the order within each chain is kept as given.
export function groupMovesByTask(
  history: readonly Pick<TaskRebalanceHistory, 'task_id' | 'source_week' | 'target_week' | 'shift_type'>[],
): TaskMoveChains {
  const chains: TaskMoveChains = {};
  for (const row of history) {
    (chains[row.task_id] ??= []).push({
      sourceWeek: row.source_week,
      targetWeek: row.target_week,
      shiftType: row.shift_type,
    });
  }
  return chains;
}

// "Week 2 → 3 → 5" for a task that moved twice. Empty for a task that never moved. Each move adds
// its target week, starting from the first move's source week.
export function describeMoveChain(chain: readonly { sourceWeek: number; targetWeek: number }[]): string {
  if (chain.length === 0) return '';
  return `Week ${[chain[0].sourceWeek, ...chain.map((move) => move.targetWeek)].join(' → ')}`;
}

const MS_PER_DAY = 86_400_000;
const WEEK_DAYS = 7;

// Moves a YYYY-MM-DD date by whole weeks, keeping the weekday. Dates are flexible (§5 rule 2), so a
// task that changes week takes its due date with it. An unparseable date gives null.
export function shiftDateByWeeks(date: string, weeks: number): string | null {
  const time = Date.parse(date);
  if (Number.isNaN(time)) return null;
  return new Date(time + weeks * WEEK_DAYS * MS_PER_DAY).toISOString().slice(0, 10);
}

// Unfinished work that is behind: left over from a week that has ended, or past its due date in the
// current week. Due today is not behind yet, matching how velocity counts what is owed so far.
function isBehind(task: RebalanceTask, currentWeek: number, asOf: string): boolean {
  if (task.status !== 'todo' || task.week_of > PLAN_WEEKS) return false;
  if (task.week_of < currentWeek) return true;
  return task.week_of === currentWeek && task.due_date !== null && task.due_date < asOf;
}

type CapacityBasis = 'finished' | 'planned';

// How many tasks a week can hold. Preferred: what the user ticked off in the most recent finished
// week that had any ticks. Part-way through the current week is left out because it would understate
// the figure, and the earlier week is the conservative one (§5 rule 8). With no history, fall back to
// the busiest week the plan already holds, so a rebalance never builds a week bigger than the plan did.
function weekCapacity(
  tasks: readonly RebalanceTask[],
  currentWeek: number,
): { capacity: number; basis: CapacityBasis } {
  for (let week = Math.min(currentWeek - 1, PLAN_WEEKS); week >= 1; week--) {
    const finished = tasks.filter((t) => t.week_of === week && t.status === 'done').length;
    if (finished > 0) return { capacity: finished, basis: 'finished' };
  }
  const perWeek = new Map<number, number>();
  for (const t of tasks) perWeek.set(t.week_of, (perWeek.get(t.week_of) ?? 0) + 1);
  return { capacity: Math.max(1, ...perWeek.values()), basis: 'planned' };
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

// Starts a sentence: "Week 4" or "Weeks 4, 5 and 6".
function weekList(weeks: readonly number[]): string {
  if (weeks.length === 1) return `Week ${weeks[0]}`;
  return `Weeks ${weeks.slice(0, -1).join(', ')} and ${weeks[weeks.length - 1]}`;
}

// The "why" for one move. The week-to-week arrow and the summary already say where it goes and that
// nothing is cut, so this only gives the cause, plus why it did not land in the next open week.
function buildReason(from: number, earliest: number, target: number): string {
  if (target === earliest) return `Unfinished in week ${from}.`;
  const full =
    target === earliest + 1 ? `Week ${earliest} is full` : `Weeks ${earliest} to ${target - 1} are full`;
  return `Unfinished in week ${from}. ${full}, so week ${target} fits best.`;
}

// Builds a proposal for the plan as of `asOf` (YYYY-MM-DD), where `currentWeek` is the plan week
// that date falls in. Always returns a valid proposal: an empty one when nothing is behind.
export function buildRebalanceProposal(
  tasks: readonly RebalanceTask[],
  currentWeek: number,
  asOf: string,
): RebalanceProposal {
  const behind = tasks.filter((t) => isBehind(t, currentWeek, asOf));
  const behindIds = new Set(behind.map((t) => t.id));
  const { capacity, basis } = weekCapacity(tasks, currentWeek);

  // Tasks already planned in each week, not counting the ones about to move out of it.
  const load = new Map<number, number>();
  for (const t of tasks) {
    if (!behindIds.has(t.id)) load.set(t.week_of, (load.get(t.week_of) ?? 0) + 1);
  }

  // Array.prototype.sort is stable, so within each group the input order (oldest week first) holds.
  const ordered = [...behind].sort(
    (a, b) => Number(a.task_type === 'certify') - Number(b.task_type === 'certify'),
  );

  const moves: RebalanceMove[] = [];
  const stuck: RebalanceTask[] = [];
  const receivedBy = new Map<number, string[]>();

  for (const task of ordered) {
    // Never into the past, and always after the week it is leaving.
    const earliest = Math.max(task.week_of + 1, currentWeek);
    let target: number | null = null;
    for (let week = earliest; week <= PLAN_WEEKS; week++) {
      if ((load.get(week) ?? 0) < capacity) {
        target = week;
        break;
      }
    }
    if (target === null) {
      stuck.push(task);
      continue;
    }
    load.set(target, (load.get(target) ?? 0) + 1);
    receivedBy.set(target, [...(receivedBy.get(target) ?? []), task.id]);
    moves.push({
      action: 'carry_over',
      taskId: task.id,
      fromWeek: task.week_of,
      toWeek: target,
      reason: buildReason(task.week_of, earliest, target),
    });
  }

  // Easiest to read grouped by where the work lands, then where it came from.
  moves.sort((a, b) => a.toWeek - b.toWeek || a.fromWeek - b.fromWeek);

  // Say what the limit is based on, so a warning is never an unexplained claim.
  const pace =
    basis === 'finished'
      ? `your recent pace of ${capacity} finished ${plural(capacity, 'task', 'tasks')} a week`
      : `the busiest week in your plan (${capacity} ${plural(capacity, 'task', 'tasks')})`;

  const warnings: TimelineWarning[] = [];

  const fullWeeks = [...receivedBy.keys()].filter((w) => (load.get(w) ?? 0) >= capacity).sort((a, b) => a - b);
  if (fullWeeks.length > 0) {
    warnings.push({
      kind: 'compression',
      weeks: fullWeeks,
      taskIds: fullWeeks.flatMap((w) => receivedBy.get(w) ?? []),
      message: `${weekList(fullWeeks)} would be filled to ${pace}, leaving no slack. Anything else that slips has little room left.`,
    });
  }

  if (stuck.length > 0) {
    warnings.push({
      kind: 'cannot_hold',
      weeks: [...new Set(stuck.map((t) => t.week_of))].sort((a, b) => a - b),
      taskIds: stuck.map((t) => t.id),
      message: `${stuck.length} ${plural(stuck.length, 'task does', 'tasks do')} not fit before week ${PLAN_WEEKS} at ${pace}. Nothing is cut and ${plural(stuck.length, 'it stays', 'they stay')} where ${plural(stuck.length, 'it is', 'they are')}. Decide whether to move the day-90 checkpoint or re-plan ${plural(stuck.length, 'it', 'them')}.`,
    });
  }

  const summary =
    behind.length === 0
      ? 'Your plan is on track. No unfinished work needs to move.'
      : [
          moves.length > 0
            ? `${moves.length} unfinished ${plural(moves.length, 'task can', 'tasks can')} be carried over. Nothing is cut.`
            : 'No unfinished work can be placed before the plan ends.',
          stuck.length > 0 && moves.length > 0
            ? `${stuck.length} more ${plural(stuck.length, 'does', 'do')} not fit before week ${PLAN_WEEKS}; you decide what happens to ${plural(stuck.length, 'it', 'them')}.`
            : '',
        ]
          .filter(Boolean)
          .join(' ');

  // Hold our own output to the same contract a model's output must meet.
  const parsed = parseRebalanceProposal({ summary, moves, warnings });
  if (!parsed.ok) throw new Error(`Rebalance proposal failed validation: ${parsed.error}`);
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Model-written proposals (MOM-47)
// ---------------------------------------------------------------------------

// The most unfinished tasks sent to the model in one request. A plan holds a few dozen; this keeps a
// runaway account from producing a huge prompt.
export const MAX_MODEL_TASKS = 200;

// What the model is told about the plan. Ids, weeks, types, minutes and dates only: no titles, since
// the model does not need them to decide what moves, and the titles on screen come from the rows
// anyway (summarizeProposalTasks). Only unfinished tasks are listed, since only they can move.
export interface ModelRebalanceFacts {
  currentWeek: number;
  planWeeks: number;
  today: string;
  velocity: { score: number | null; trend: string | null; risk: string | null; pressureStreak: number } | null;
  // Every week that has tasks: how many are unfinished and how many the user finished.
  weeks: Array<{ week: number; unfinished: number; finished: number }>;
  tasks: Array<{ id: string; week: number; type: string; minutes: number; dueDate: string | null }>;
}

export function buildModelFacts(
  tasks: readonly RebalanceTask[],
  currentWeek: number,
  asOf: string,
  velocity: ModelRebalanceFacts['velocity'] = null,
): ModelRebalanceFacts {
  const perWeek = new Map<number, { unfinished: number; finished: number }>();
  for (const t of tasks) {
    const counts = perWeek.get(t.week_of) ?? { unfinished: 0, finished: 0 };
    if (t.status === 'done') counts.finished++;
    else counts.unfinished++;
    perWeek.set(t.week_of, counts);
  }
  return {
    currentWeek,
    planWeeks: PLAN_WEEKS,
    today: asOf,
    velocity,
    weeks: [...perWeek.entries()].sort((a, b) => a[0] - b[0]).map(([week, c]) => ({ week, ...c })),
    tasks: tasks
      .filter((t) => t.status === 'todo')
      .map((t) => ({ id: t.id, week: t.week_of, type: t.task_type, minutes: t.minutes, dueDate: t.due_date })),
  };
}

// Checks a proposal that already passed TaskRebalanceSchema against the user's actual tasks, which the
// schema cannot see. A model can write a well-formed proposal that names a task that does not exist,
// one the user already finished, one in a different week than it says, or a week in the past. Returns
// null when it is safe to show, otherwise a short reason (never the proposal's own text). Apply
// re-checks every task again, so this is about not showing the user a proposal that cannot work.
export function checkProposalAgainstTasks(
  proposal: RebalanceProposal,
  tasks: readonly RebalanceTask[],
  currentWeek: number,
): string | null {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const move of proposal.moves) {
    const task = byId.get(move.taskId);
    if (!task) return 'It named a task that does not exist.';
    if (task.status !== 'todo') return 'It tried to move a task that is already done.';
    if (task.week_of !== move.fromWeek) return 'It got the current week of a task wrong.';
    if (move.toWeek < currentWeek) return 'It placed work in a week that has already passed.';
  }
  for (const warning of proposal.warnings) {
    for (const id of warning.taskIds) {
      const task = byId.get(id);
      if (!task) return 'It named a task that does not exist.';
      if (task.status !== 'todo') return 'It named a finished task as unplaceable.';
    }
  }
  return null;
}

// Display details for every task a proposal names, keyed by id. Taken from the rows, never from the
// proposal, so the titles on screen are always the user's own.
export function summarizeProposalTasks(
  tasks: readonly RebalanceTask[],
  proposal: RebalanceProposal,
): Record<string, RebalanceTaskSummary> {
  const named = new Set<string>([
    ...proposal.moves.map((m) => m.taskId),
    ...proposal.warnings.flatMap((w) => w.taskIds),
  ]);
  const summaries: Record<string, RebalanceTaskSummary> = {};
  for (const t of tasks) {
    if (named.has(t.id)) {
      summaries[t.id] = { id: t.id, title: t.title, taskType: t.task_type, minutes: t.minutes };
    }
  }
  return summaries;
}
