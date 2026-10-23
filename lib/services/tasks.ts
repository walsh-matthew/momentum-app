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
// The wizard's week 1 plan is also written here (MOM-35): generateWeekOnePlan asks Claude and saves
// nothing; createGoalWithWeekOnePlan saves the goal and its tasks in one database call. Neither sets
// status or completed_at: every new task is 'todo' and only the user ticks it.
//
// Rebalancing moves tasks between weeks and nothing else (§5 rule 1, §10): this module never
// deletes a task, and applyRebalance never touches status or completed_at. Each move also lands in
// task_rebalance_history (migration 003), written by the same database call that moves the task.

import { requestRebalanceFromModel, type ModelRebalanceFailure } from '@/lib/ai/rebalance';
import { requestWeekOnePlanFromModel, type ModelTaskPlanFailure } from '@/lib/ai/taskPlan';
import { parseWeekOnePlan, parseWizardInput, type TaskPlan } from '@/lib/goals/taskPlan';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { summarizeAllGoalProgress } from '@/lib/utils/progress';
import {
  MAX_MODEL_TASKS,
  buildModelFacts,
  buildRebalanceProposal,
  checkProposalAgainstTasks,
  shiftDateByWeeks,
  summarizeProposalTasks,
  type ModelRebalanceFacts,
} from '@/lib/utils/rebalance';
import { computeVelocity, currentPlanWeek, type VelocitySnapshot } from '@/lib/utils/velocity';
import {
  TASK_STATUSES,
  type GoalChannel,
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
import type { GoalProgress } from '@/types/progress';
import { MAX_KEY_ATTEMPTS, UNIQUE_VIOLATION, buildNewGoalFields, channelKeyFor, listGoalChannels } from './goals';
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

// Everything the home page works from, read once (MOM-44, MOM-84): the signed-in user's goals, tasks and
// rebalance history, and today's date. The channel feeds, each channel's velocity and the rebalance
// proposal are all built from this one snapshot, so the page makes one read of each table. All three reads
// go through the user's own session (RLS scopes them to their rows) and nothing here writes: completing or
// reopening a task is the user's click, through setTaskStatus. Losing the history only drops the move-chain
// detail, so the snapshot still loads without it.
export interface PlanSnapshot {
  goals: GoalChannel[];
  tasks: MicroTask[];
  history: TaskRebalanceHistory[];
  // YYYY-MM-DD, the day the snapshot was taken.
  today: string;
}

export async function getPlanSnapshot(deps: { now?: () => number } = {}): Promise<ServiceResult<PlanSnapshot>> {
  const [goals, tasks, history] = await Promise.all([listGoalChannels(), listMicroTasks(), listRebalanceHistory()]);
  if (!goals.ok) return goals;
  if (!tasks.ok) return tasks;
  const today = new Date((deps.now ?? Date.now)()).toISOString().slice(0, 10);
  return { ok: true, data: { goals: goals.data, tasks: tasks.data, history: history.ok ? history.data : [], today } };
}

// How far along each of the signed-in user's goals is (MOM-86): tasks done of total, the percentage, and the
// plan week today falls in. Two reads through the user's own session (RLS scopes both to their rows), then
// pure counting in summarizeAllGoalProgress. It never writes, so it cannot complete, reopen or move a task;
// that stays the user's own tick (docs/NINETY_DAY_PLAN_CONTEXT.md §3, §5 rule 6). Goals come in the order
// listGoalChannels gives them (the default goal first). A goal with no tasks is listed as 0 of 0.
export async function listGoalProgress(deps: { now?: () => number } = {}): Promise<ServiceResult<GoalProgress[]>> {
  const [goals, tasks] = await Promise.all([listGoalChannels(), listMicroTasks()]);
  if (!goals.ok) return goals;
  if (!tasks.ok) return tasks;
  const today = new Date((deps.now ?? Date.now)()).toISOString().slice(0, 10);
  return { ok: true, data: summarizeAllGoalProgress(goals.data, tasks.data, today) };
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

// Why the user got the rule-based suggestion when they asked for Claude's. Fixed wording from our own
// code: nothing the model or the provider wrote is ever shown as a notice.
const MODEL_FALLBACK_NOTICES: Record<ModelRebalanceFailure | 'invalid' | 'too_large', string> = {
  not_configured: "Claude suggestions aren't set up on the server yet, so this is the rule-based suggestion.",
  refused: 'Claude declined to write a suggestion, so this is the rule-based suggestion.',
  rate_limited: 'Claude is busy right now, so this is the rule-based suggestion. Try again in a minute.',
  unavailable: 'Claude could not be reached, so this is the rule-based suggestion.',
  bad_output: "Claude's answer could not be read, so this is the rule-based suggestion.",
  invalid: "Claude's suggestion did not pass our safety checks, so this is the rule-based suggestion.",
  too_large: 'Your plan is too large to send to Claude, so this is the rule-based suggestion.',
};

// Builds the rebalance proposal the drawer shows. Takes the tasks the caller already fetched so the
// page reads them once. Proposing reads and writes nothing: it never changes a task.
//
// By default the proposal is rule-based (free and instant, so the page can load it every time). Pass
// `useModel` and Claude writes it instead; that is only ever done from an explicit user action
// (requestModelRebalance), never on a page load, because it costs money and takes seconds.
//
// A model proposal is trusted no further than the rule-based one:
// - its raw JSON goes through parseRebalanceProposal() unchanged, which allows only carry_over and
//   pull_forward and rejects any delete, cut or status field;
// - checkProposalAgainstTasks() then checks it against the real tasks (they exist, are unfinished, are
//   in the week it says, and are not sent into the past);
// - titles come from `tasks`, never from the model.
// If anything fails, the user gets the rule-based proposal with a notice saying why, never an error.
export async function proposeRebalance(
  tasks: readonly MicroTask[],
  currentWeek: number,
  asOf: string,
  options: { useModel?: boolean; velocity?: ModelRebalanceFacts['velocity'] } = {},
): Promise<ServiceResult<RebalanceProposalView>> {
  const fromRules = (notice: string | null): ServiceResult<RebalanceProposalView> => {
    let proposal: ReturnType<typeof buildRebalanceProposal>;
    try {
      proposal = buildRebalanceProposal(tasks, currentWeek, asOf);
    } catch {
      // The builder holds itself to the proposal schema, which allows at most MAX_REBALANCE_MOVES moves.
      // A plan with more work behind than that has no valid rule-based proposal; say so, don't crash.
      return { ok: false, error: 'There is too much unfinished work to rebalance in one go.' };
    }
    return {
      ok: true,
      data: {
        proposal,
        source: 'rules',
        model: null,
        notice,
        tasks: summarizeProposalTasks(tasks, proposal),
        currentWeek,
      },
    };
  };
  if (!options.useModel) return fromRules(null);

  if (tasks.filter((t) => t.status === 'todo').length > MAX_MODEL_TASKS) return fromRules(MODEL_FALLBACK_NOTICES.too_large);

  const answer = await requestRebalanceFromModel(buildModelFacts(tasks, currentWeek, asOf, options.velocity ?? null));
  if (!answer.ok) return fromRules(MODEL_FALLBACK_NOTICES[answer.reason]);

  const parsed = parseRebalanceProposal(answer.raw);
  if (!parsed.ok || checkProposalAgainstTasks(parsed.data, tasks, currentWeek) !== null) {
    return fromRules(MODEL_FALLBACK_NOTICES.invalid);
  }
  return {
    ok: true,
    data: {
      proposal: parsed.data,
      source: 'model',
      model: answer.model,
      notice: null,
      tasks: summarizeProposalTasks(tasks, parsed.data),
      currentWeek,
    },
  };
}

// A user asked Claude to write their rebalance proposal. Reachable from a Server Action, so it
// authenticates, loads the user's own plan through RLS, and limits how often one user can call it:
// each call is a paid model request. The limit is per server instance and best effort (BACKLOG.md).
const MODEL_REQUEST_COOLDOWN_MS = 20_000;
const lastModelRequestAt = new Map<string, number>();

export async function requestModelRebalance(
  deps: { now?: () => number } = {},
): Promise<ServiceResult<RebalanceProposalView>> {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return { ok: false, error: 'Sign in to ask for a suggestion.' };

  const now = (deps.now ?? Date.now)();
  const last = lastModelRequestAt.get(auth.user.id);
  if (last !== undefined && now - last < MODEL_REQUEST_COOLDOWN_MS) {
    return { ok: false, error: 'Please wait a few seconds before asking again.' };
  }
  // Set before the call, so a failing or slow request still counts.
  lastModelRequestAt.set(auth.user.id, now);

  const [goals, tasks, history] = await Promise.all([listGoalChannels(), listMicroTasks(), listRebalanceHistory()]);
  if (!goals.ok || !tasks.ok) return { ok: false, error: 'Could not load your plan.' };
  const goal = goals.data.find((g) => g.status === 'active');
  if (!goal) return { ok: false, error: 'Create a goal first.' };
  const today = new Date(now).toISOString().slice(0, 10);
  const week = currentPlanWeek(goal.start_date, today);
  if (week === null) return { ok: false, error: 'Could not work out your plan week.' };

  // Velocity is context for the model; if the history is unavailable the plan still loads without it.
  const snapshot: VelocitySnapshot = computeVelocity(tasks.data, week, today, history.ok ? history.data : []);
  return proposeRebalance(tasks.data, week, today, {
    useModel: true,
    velocity: {
      score: snapshot.score,
      trend: snapshot.trend,
      risk: snapshot.risk,
      pressureStreak: snapshot.pressureStreak,
    },
  });
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

// ---------------------------------------------------------------------------
// The wizard's week 1 plan (MOM-35)
// ---------------------------------------------------------------------------

// Why Claude's plan was not used. Fixed wording from our own code: nothing the model or the provider
// wrote is ever shown. The wizard offers a retry next to every one of these, and a starter plan the
// user can choose themselves; nothing is substituted for them.
const PLAN_FAILURE_MESSAGES: Record<ModelTaskPlanFailure | 'invalid', string> = {
  not_configured: "Claude plans aren't set up on the server yet.",
  refused: 'Claude declined to write a plan.',
  rate_limited: 'Claude is busy right now.',
  unavailable: 'Claude could not be reached.',
  bad_output: "Claude's answer could not be read.",
  invalid: "Claude's plan did not pass our checks, so none of it was used.",
};

// One model request per user per 20 seconds; each call is a paid request. Like requestModelRebalance
// this is per server instance and best effort (BACKLOG.md), and it counts failed requests too.
const PLAN_REQUEST_COOLDOWN_MS = 20_000;
const lastPlanRequestAt = new Map<string, number>();

export interface GeneratedWeekOnePlan {
  plan: TaskPlan;
  model: string;
}

// A user clicked "Generate" in the goal wizard. Reachable from a Server Action, so it validates the
// answers, authenticates and rate-limits. It reads and writes nothing in the database: the plan is only
// shown to the user, and saved later by createGoalWithWeekOnePlan if they confirm it.
//
// The model sees only the wizard's answers. Its raw JSON goes through parseTaskPlan() unchanged (via
// parseWeekOnePlan, which also insists on week 1), so a status, an unknown task type, a week 14 or an
// empty plan is rejected rather than repaired.
export async function generateWeekOnePlan(
  rawInput: unknown,
  deps: { now?: () => number } = {},
): Promise<ServiceResult<GeneratedWeekOnePlan>> {
  const parsedInput = parseWizardInput(rawInput);
  if (!parsedInput.ok) return { ok: false, error: parsedInput.error };

  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return { ok: false, error: 'Sign in to generate a plan.' };

  const now = (deps.now ?? Date.now)();
  const last = lastPlanRequestAt.get(auth.user.id);
  if (last !== undefined && now - last < PLAN_REQUEST_COOLDOWN_MS) {
    return { ok: false, error: 'Please wait a few seconds before asking again.' };
  }
  // Set before the call, so a failing or slow request still counts.
  lastPlanRequestAt.set(auth.user.id, now);

  const answer = await requestWeekOnePlanFromModel(parsedInput.data);
  if (!answer.ok) return { ok: false, error: PLAN_FAILURE_MESSAGES[answer.reason] };

  const plan = parseWeekOnePlan(answer.raw);
  if (!plan.ok) return { ok: false, error: PLAN_FAILURE_MESSAGES.invalid };
  return { ok: true, data: { plan: plan.data, model: answer.model } };
}

export interface CreatedGoalWithPlan {
  goal: GoalChannel;
  tasksSaved: number;
}

// A user confirmed the wizard. Saves the goal and its week 1 tasks together or not at all: one
// create_goal_with_week_one_plan call, which is one database transaction (migration 009). It runs as the
// signed-in user through the anon-key client, so RLS applies, and never as the service role.
//
// Reachable from a Server Action, so both arguments are validated again here, whatever the wizard did.
// The plan may have come from Claude or from the starter plan the user chose; it is held to the same
// rules. Nothing passes a user id, a status or a completion time: the function takes the owner from the
// session and makes every task 'todo' in week 1.
export async function createGoalWithWeekOnePlan(
  rawInput: unknown,
  rawPlan: unknown,
): Promise<ServiceResult<CreatedGoalWithPlan>> {
  const parsedInput = parseWizardInput(rawInput);
  if (!parsedInput.ok) return { ok: false, error: parsedInput.error };
  const parsedPlan = parseWeekOnePlan(rawPlan);
  if (!parsedPlan.ok) return { ok: false, error: parsedPlan.error };
  const input = parsedInput.data;

  const fields = buildNewGoalFields(input);
  if (!fields.ok) return fields;

  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return { ok: false, error: 'Sign in to create a goal.' };

  const tasks = parsedPlan.data.tasks.map((t) => ({ title: t.title, task_type: t.taskType, minutes: t.minutes }));
  for (let attempt = 1; attempt <= MAX_KEY_ATTEMPTS; attempt++) {
    const { data, error } = await supabase.rpc('create_goal_with_week_one_plan', {
      p_channel_key: channelKeyFor(input.title, attempt),
      p_title: fields.data.title,
      p_goal_type: fields.data.goal_type,
      p_preferences: fields.data.preferences,
      p_criteria: fields.data.criteria,
      p_start_date: fields.data.start_date,
      p_target_date: fields.data.target_date,
      p_tasks: tasks,
    });
    if (!error && data) return { ok: true, data: { goal: data, tasksSaved: tasks.length } };
    // A failed call rolled back as a whole, so retrying with another key cannot leave anything behind.
    if (error?.code === UNIQUE_VIOLATION) continue;
    console.error('[wizard-plan] could not save the goal and plan', { code: error?.code ?? 'no_row' });
    return { ok: false, error: 'Could not save your goal and plan. Nothing was saved.' };
  }
  return { ok: false, error: 'You already have goals with similar names. Try a different title.' };
}
