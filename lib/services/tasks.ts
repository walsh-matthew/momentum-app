// Micro-task data access. The only place micro_tasks is queried (CLAUDE.md, Architectural
// Directive 1). Server-side only: it reads the request's auth cookies.
//
// Completion is human-only (docs/NINETY_DAY_PLAN_CONTEXT.md §3, §5 rule 6). Status changes here
// always run as the signed-in user through the anon-key client, so RLS scopes the write to their
// own rows, and there is no actor or "system" parameter. Automated code (rebalancing, ingestion)
// must not call setTaskStatus; it has no session to act as. Migration 002 backs this up in the
// database: a trigger rejects any change to status or completed_at that is not made by the
// authenticated owner, so even the service role cannot complete a task.
//
// Rebalancing moves tasks between weeks and nothing else (§5 rule 1, §10): this module never
// deletes a task, and applyRebalance never touches status or completed_at. Each move also lands in
// task_rebalance_history (migration 003), written by the same database call that moves the task.

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { buildRebalanceProposal, shiftDateByWeeks, summarizeProposalTasks } from '@/lib/utils/rebalance';
import {
  TASK_STATUSES,
  type MicroTask,
  type TaskRebalanceHistory,
  type TaskStatus,
} from '@/types/database.types';
import {
  parseRebalanceProposal,
  type RebalanceApplyResult,
  type RebalanceProposalView,
  type RebalanceSkippedMove,
} from '@/types/rebalance';
import type { ServiceResult } from './result';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Lists the signed-in user's tasks, optionally for one week. Oldest week first, so carried-over
// work comes before newer work.
export async function listMicroTasks(options: { weekOf?: number } = {}): Promise<ServiceResult<MicroTask[]>> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from('micro_tasks').select('*');
  if (options.weekOf !== undefined) query = query.eq('week_of', options.weekOf);
  // RLS limits this to the signed-in user's rows.
  const { data, error } = await query
    .order('week_of', { ascending: true })
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

// The task to do next: the earliest unfinished one, or null when nothing is left.
export async function getFocusTask(): Promise<ServiceResult<MicroTask | null>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('micro_tasks')
    .select('*')
    .eq('status', 'todo')
    .order('week_of', { ascending: true })
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

// The signed-in user's rebalance history, oldest move first, optionally for one task. A task's whole
// chain reads in order (for example 2 to 3, then 3 to 5), unlike carried_from_week, which keeps only
// the last hop. RLS limits this to their own rows; the table is append-only.
export async function listRebalanceHistory(
  options: { taskId?: string } = {},
): Promise<ServiceResult<TaskRebalanceHistory[]>> {
  if (options.taskId !== undefined && !UUID_PATTERN.test(options.taskId)) {
    return { ok: false, error: 'Invalid task.' };
  }
  const supabase = await createSupabaseServerClient();
  let query = supabase.from('task_rebalance_history').select('*');
  if (options.taskId !== undefined) query = query.eq('task_id', options.taskId);
  const { data, error } = await query.order('created_at', { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

// Sets a task to done or back to todo on behalf of the signed-in user. Validates its input
// because it is reachable from any caller, including a direct Server Action POST. The session is
// re-verified with getUser() (which asks Supabase Auth, not just the cookie) before any write, and
// the write is filtered to that user's id as well as scoped by RLS.
export async function setTaskStatus(taskId: unknown, status: unknown): Promise<ServiceResult<MicroTask>> {
  if (typeof taskId !== 'string' || !UUID_PATTERN.test(taskId)) {
    return { ok: false, error: 'Invalid task.' };
  }
  if (typeof status !== 'string' || !(TASK_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: 'Invalid status.' };
  }
  const nextStatus = status as TaskStatus;

  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return { ok: false, error: 'Sign in to update tasks.' };

  // The table requires completed_at to be set exactly when status is done (migration 001).
  const { data, error } = await supabase
    .from('micro_tasks')
    .update({
      status: nextStatus,
      completed_at: nextStatus === 'done' ? new Date().toISOString() : null,
    })
    .eq('id', taskId)
    .eq('user_id', auth.user.id)
    .select()
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Task not found.' };
  return { ok: true, data };
}

// Builds the rebalance proposal the drawer shows. Takes the tasks the caller already fetched so the
// page reads them once. Proposing reads and writes nothing: it never changes a task.
export async function proposeRebalance(
  tasks: readonly MicroTask[],
  currentWeek: number,
  asOf: string,
): Promise<ServiceResult<RebalanceProposalView>> {
  // TODO(MOM-Phase2): live LLM orchestration trigger. Replace buildRebalanceProposal with a Claude
  // call (Vercel AI SDK, ANTHROPIC_API_KEY read here on the server only) that is given the task ids,
  // weeks and velocity and returns a proposal. Pass its raw output through parseRebalanceProposal()
  // unchanged, and keep titles coming from `tasks`, never from the model. Fire it from an explicit
  // user action (the drawer or the Adjust Weekly Pace chip), not on every page load, and decide
  // whether to store the proposal so Apply can approve it by id (BACKLOG.md).
  const proposal = buildRebalanceProposal(tasks, currentWeek, asOf);
  return { ok: true, data: { proposal, tasks: summarizeProposalTasks(tasks, proposal), currentWeek } };
}

// Applies a proposal the user approved. For each move it updates week_of, the carry-over or
// pull-forward marker and the due date, and nothing else: it never deletes a task and never touches
// status or completed_at, so it does not go through setTaskStatus. Validates its input because it
// is reachable from any caller, including a direct Server Action POST.
export async function applyRebalance(rawProposal: unknown): Promise<ServiceResult<RebalanceApplyResult>> {
  const parsed = parseRebalanceProposal(rawProposal);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const { moves } = parsed.data;
  if (moves.length === 0) return { ok: true, data: { moved: [], skipped: [] } };

  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return { ok: false, error: 'Sign in to rebalance your plan.' };
  const userId = auth.user.id;

  const { data: rows, error: readError } = await supabase
    .from('micro_tasks')
    .select('id, status, week_of, due_date')
    .eq('user_id', userId)
    .in(
      'id',
      moves.map((move) => move.taskId),
    );
  if (readError) return { ok: false, error: readError.message };
  const current = new Map(rows.map((row) => [row.id, row]));

  // Each move touches one row and leaves the plan valid on its own, so they run independently and one
  // stale task does not hold up the rest. The set is not atomic (see BACKLOG.md).
  const outcomes = await Promise.all(
    moves.map(async (move): Promise<RebalanceSkippedMove | null> => {
      const skip = (reason: string): RebalanceSkippedMove => ({ taskId: move.taskId, reason });
      const row = current.get(move.taskId);
      if (!row) return skip('Task not found.');
      if (row.status !== 'todo') return skip('Already done, so it stays where it is.');
      if (row.week_of !== move.fromWeek) return skip('It moved since this was proposed.');

      // One database call moves the task and records it in task_rebalance_history, in the same
      // transaction (migration 003). It sets week_of, one move marker (clearing the other) and the due
      // date, and nothing else: no status, no completed_at, no delete. It re-checks that the task is
      // the signed-in user's, still unfinished and still in fromWeek, so a stale proposal comes back false.
      const { data: applied, error } = await supabase.rpc('apply_task_move', {
        p_task_id: move.taskId,
        p_from_week: move.fromWeek,
        p_to_week: move.toWeek,
        p_action: move.action,
        // Dates are flexible (§5 rule 2): the due date keeps its weekday and moves with the task.
        p_due_date:
          row.due_date === null
            ? null
            : (shiftDateByWeeks(row.due_date, move.toWeek - move.fromWeek) ?? row.due_date),
      });
      if (error) return skip(error.message);
      if (!applied) return skip('It changed since this was proposed.');
      return null;
    }),
  );

  const skipped = outcomes.filter((outcome): outcome is RebalanceSkippedMove => outcome !== null);
  const skippedIds = new Set(skipped.map((s) => s.taskId));
  const moved = moves.map((move) => move.taskId).filter((id) => !skippedIds.has(id));
  return { ok: true, data: { moved, skipped } };
}
