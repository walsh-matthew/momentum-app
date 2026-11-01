// The edits behind home's deadline forecast (MOM-138): a kind of day's usual time, and a deadline task's rough size, steps and
// due date. The only code that writes these after setup (CLAUDE.md, Architectural Directive 1). Server-side only: it runs as the
// signed-in person through the anon-key client, so row level security limits every read and write to their own rows (013's
// own-row policies on person_day_types, work_items and work_item_steps), and every query also filters by their id. There is no
// actor parameter and no service-role path. No migration: the grants and policies 013 made already cover these writes.
//
// Nothing here is a guess and nothing happens unless the person taps (docs/DOMAIN_MODEL.md §4.2 principle 1):
// - the values are the person's own, checked by lib/forecast/edits.ts (run again here, because a Server Action is reachable by
//   direct POST); an empty or unreadable one is refused, never filled in;
// - a due date moves only when setup recorded that it can (date_can_move is true), checked here and again in the same
//   statement that writes it, and never to a day that has passed;
// - a ticked step is never renamed or removed (its tick is an entry keyed to the step's id), and a finished task is not edited;
// - a deadline task's target keeps its own date: moving the task's date touches only the task (owner decision, 2026-11-01).
// Re-baseline without re-grading (§1.7): none of these columns is read when a closed week is graded, and nothing is stored about
// the forecast, so home simply shows the new one on its next load and no closed week changes. No Claude call.

import {
  DATE_LOCKED,
  NOT_YOUR_KIND,
  NOT_YOUR_STEP,
  NOT_YOUR_TASK,
  RENAME_MISSING,
  SAVE_FAILED,
  STEP_TICKED,
  TASK_FINISHED,
  checkKindTime,
  checkNewDueDate,
  checkSizeHours,
  checkStepTitle,
} from '@/lib/forecast/edits';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { DayKindTimeView, EditChange, TaskEditView } from '@/types/forecastEdits';
import type { ServiceResult } from './result';
import { tickedSteps } from './scoreboardRows';
import { planContext } from './weekPlanRows';

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (value: unknown): value is string => typeof value === 'string' && UUID_PATTERN.test(value);

export const SIGNED_OUT = 'Sign in to change this.';
export const LOAD_FAILED = 'Could not load that.';
export const NEEDS_DAYS = 'Set your time zone and the time your day ends first, so the days are yours. Nothing was changed.';

export interface ForecastEditDeps {
  // The clock, for tests. Never set from a request.
  now?: () => number;
}

async function signedIn(): Promise<{ ok: true; supabase: Client; userId: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { ok: false, error: SIGNED_OUT };
  return { ok: true, supabase, userId: data.user.id };
}

interface LoadedTask extends TaskEditView {
  estimateMinutes: number | null;
}

// One deadline task of the signed-in person, with its steps and which of them are ticked. A tick is an entry whose record id is
// the step's id (migration 013), hidden by a "hide" correction, the same reading the week plan and home use (tickedSteps).
async function loadTask(supabase: Client, userId: string, itemId: string, nowMs: number): Promise<{ ok: true; task: LoadedTask } | { ok: false; error: string; missing?: true }> {
  const settings = await supabase.from('person_settings').select('time_zone, week_start, day_end').eq('user_id', userId).maybeSingle();
  if (settings.error) return { ok: false, error: LOAD_FAILED };
  const ctx = planContext(settings.data, nowMs);
  if (!ctx.ok) return { ok: false, error: NEEDS_DAYS };

  const item = await supabase
    .from('work_items')
    .select('id, goal_id, title, due_date, date_can_move, estimate_minutes, completed_at')
    .eq('id', itemId)
    .eq('user_id', userId)
    .eq('kind', 'deadline_task')
    .maybeSingle();
  if (item.error) return { ok: false, error: LOAD_FAILED };
  if (item.data === null || item.data.due_date === null) return { ok: false, error: NOT_YOUR_TASK, missing: true };
  const row = item.data;
  const dueOn: string = item.data.due_date;

  const [goal, steps] = await Promise.all([
    supabase.from('goals').select('title').eq('id', row.goal_id).eq('user_id', userId).maybeSingle(),
    supabase.from('work_item_steps').select('id, work_item_id, title, sort_order').eq('user_id', userId).eq('work_item_id', itemId),
  ]);
  if (goal.error || steps.error) return { ok: false, error: LOAD_FAILED };

  const ids = steps.data.map((s) => s.id);
  const entries: { source_id: string; source_record_id: string; occurred_at: string }[] = [];
  const corrections: { source_id: string; source_record_id: string; action: 'hide' | 'count_anyway' }[] = [];
  if (ids.length > 0) {
    const [ticks, hides] = await Promise.all([
      supabase.from('entries').select('source_id, source_record_id, occurred_at').eq('user_id', userId).in('source_record_id', ids),
      supabase.from('entry_corrections').select('source_id, source_record_id, action').eq('user_id', userId).in('source_record_id', ids),
    ]);
    if (ticks.error || hides.error) return { ok: false, error: LOAD_FAILED };
    entries.push(...ticks.data);
    corrections.push(...hides.data);
  }
  const ticked = tickedSteps({ steps: steps.data, entries, corrections }, ctx.anchors);

  const ordered = [...steps.data].sort((a, b) => a.sort_order - b.sort_order || (a.id < b.id ? -1 : 1));
  const stepViews = ordered.map((s) => ({ id: s.id, title: s.title, done: ticked.has(s.id) }));
  const finished = row.completed_at !== null || (stepViews.length > 0 && stepViews.every((s) => s.done));
  return {
    ok: true,
    task: {
      id: row.id,
      title: row.title,
      goalTitle: goal.data?.title ?? '',
      today: ctx.today,
      dueOn,
      dateCanMove: row.date_can_move === true,
      estimateMinutes: row.estimate_minutes,
      estimateHours: row.estimate_minutes === null ? null : row.estimate_minutes / 60,
      finished,
      steps: stepViews,
    },
  };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

// One deadline task for its edit screen. Read only.
export async function getTaskEdit(itemId: unknown, deps: ForecastEditDeps = {}): Promise<ServiceResult<TaskEditView>> {
  const session = await signedIn();
  if (!session.ok) return session;
  if (!isId(itemId)) return { ok: false, error: NOT_YOUR_TASK };
  const loaded = await loadTask(session.supabase, session.userId, itemId, (deps.now ?? Date.now)());
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { estimateMinutes, ...view } = loaded.task;
  void estimateMinutes;
  return { ok: true, data: view };
}

// The person's own kinds of days and the usual time each one has, in the order they were made. Read only.
export async function getDayKindTimes(): Promise<ServiceResult<DayKindTimeView[]>> {
  const session = await signedIn();
  if (!session.ok) return session;
  const { data, error } = await session.supabase
    .from('person_day_types')
    .select('id, name, capacity_unit, capacity_amount, created_at')
    .eq('user_id', session.userId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) return { ok: false, error: LOAD_FAILED };
  return {
    ok: true,
    data: data.map((k) => ({
      id: k.id,
      name: k.name,
      unit: k.capacity_unit,
      amount: k.capacity_amount === null ? null : Number(k.capacity_amount),
    })),
  };
}

// ---------------------------------------------------------------------------
// Writing: every write is the person's own tap
// ---------------------------------------------------------------------------

const changed = (n: number): EditChange => ({ ok: true, data: { changed: n } });

// A kind of day's usual time: the unit and the amount are saved together (the table allows both or neither).
export async function setDayKindTime(dayTypeId: unknown, unit: unknown, amount: unknown): Promise<EditChange> {
  const session = await signedIn();
  if (!session.ok) return session;
  const checked = checkKindTime(unit, amount);
  if (!checked.ok) return checked;
  if (!isId(dayTypeId)) return { ok: false, error: NOT_YOUR_KIND };

  const { data, error } = await session.supabase
    .from('person_day_types')
    .update({ capacity_unit: checked.value.unit, capacity_amount: checked.value.amount })
    .eq('id', dayTypeId)
    .eq('user_id', session.userId)
    .select('id');
  if (error) return failed('day-kind-time', error.code);
  return data.length === 0 ? { ok: false, error: NOT_YOUR_KIND } : changed(1);
}

// A deadline task's own rough size, typed in hours and saved as minutes.
export async function setTaskSize(itemId: unknown, hours: unknown, deps: ForecastEditDeps = {}): Promise<EditChange> {
  const session = await signedIn();
  if (!session.ok) return session;
  const checked = checkSizeHours(hours);
  if (!checked.ok) return checked;
  if (!isId(itemId)) return { ok: false, error: NOT_YOUR_TASK };

  const loaded = await loadTask(session.supabase, session.userId, itemId, (deps.now ?? Date.now)());
  if (!loaded.ok) return { ok: false, error: loaded.error };
  if (loaded.task.finished) return { ok: false, error: TASK_FINISHED };

  const { data, error } = await session.supabase
    .from('work_items')
    .update({ estimate_minutes: checked.value })
    .eq('id', itemId)
    .eq('user_id', session.userId)
    .eq('kind', 'deadline_task')
    .select('id');
  if (error) return failed('task-size', error.code);
  return data.length === 0 ? { ok: false, error: NOT_YOUR_TASK } : changed(loaded.task.estimateMinutes === checked.value ? 0 : 1);
}

// A deadline task's due date, only when setup recorded that it can move, and never to a day that has passed. The same statement
// that writes it filters on date_can_move, so a task whose date cannot move is never changed whatever was read first.
export async function moveTaskDate(itemId: unknown, date: unknown, deps: ForecastEditDeps = {}): Promise<EditChange> {
  const session = await signedIn();
  if (!session.ok) return session;
  if (!isId(itemId)) return { ok: false, error: NOT_YOUR_TASK };

  const loaded = await loadTask(session.supabase, session.userId, itemId, (deps.now ?? Date.now)());
  if (!loaded.ok) return { ok: false, error: loaded.error };
  if (loaded.task.finished) return { ok: false, error: TASK_FINISHED };
  if (!loaded.task.dateCanMove) return { ok: false, error: DATE_LOCKED };
  const checked = checkNewDueDate(date, loaded.task.today);
  if (!checked.ok) return checked;
  if (checked.value === loaded.task.dueOn) return changed(0);

  const { data, error } = await session.supabase
    .from('work_items')
    .update({ due_date: checked.value })
    .eq('id', itemId)
    .eq('user_id', session.userId)
    .eq('kind', 'deadline_task')
    .eq('date_can_move', true)
    .select('id');
  if (error) return failed('task-date', error.code);
  return data.length === 0 ? { ok: false, error: DATE_LOCKED } : changed(1);
}

// A new step at the end of an unfinished deadline task's steps.
export async function addTaskStep(itemId: unknown, title: unknown, deps: ForecastEditDeps = {}): Promise<EditChange> {
  const session = await signedIn();
  if (!session.ok) return session;
  const checked = checkStepTitle(title);
  if (!checked.ok) return checked;
  if (!isId(itemId)) return { ok: false, error: NOT_YOUR_TASK };

  const loaded = await loadTask(session.supabase, session.userId, itemId, (deps.now ?? Date.now)());
  if (!loaded.ok) return { ok: false, error: loaded.error };
  if (loaded.task.finished) return { ok: false, error: TASK_FINISHED };

  const last = await session.supabase
    .from('work_item_steps')
    .select('sort_order')
    .eq('user_id', session.userId)
    .eq('work_item_id', itemId)
    .order('sort_order', { ascending: false })
    .limit(1);
  if (last.error) return failed('step-add', last.error.code);
  const sortOrder = last.data.length === 0 ? 0 : last.data[0].sort_order + 1;

  const { error } = await session.supabase
    .from('work_item_steps')
    .insert({ user_id: session.userId, work_item_id: itemId, title: checked.value, sort_order: sortOrder });
  if (error) return failed('step-add', error.code);
  return changed(1);
}

// The step, and the unfinished deadline task it belongs to, when both are the person's and the step is not ticked.
async function editableStep(session: { supabase: Client; userId: string }, stepId: unknown, nowMs: number): Promise<{ ok: true; stepId: string } | { ok: false; error: string }> {
  if (!isId(stepId)) return { ok: false, error: NOT_YOUR_STEP };
  const step = await session.supabase.from('work_item_steps').select('id, work_item_id').eq('id', stepId).eq('user_id', session.userId).maybeSingle();
  if (step.error) return { ok: false, error: SAVE_FAILED };
  if (step.data === null) return { ok: false, error: NOT_YOUR_STEP };

  const loaded = await loadTask(session.supabase, session.userId, step.data.work_item_id, nowMs);
  // A step of something that is not a deadline task is not edited here.
  if (!loaded.ok) return { ok: false, error: loaded.missing ? NOT_YOUR_STEP : loaded.error };
  if (loaded.task.finished) return { ok: false, error: TASK_FINISHED };
  if (loaded.task.steps.find((s) => s.id === stepId)?.done) return { ok: false, error: STEP_TICKED };
  return { ok: true, stepId };
}

// New words for a step that is not ticked.
export async function renameTaskStep(stepId: unknown, title: unknown, deps: ForecastEditDeps = {}): Promise<EditChange> {
  const session = await signedIn();
  if (!session.ok) return session;
  const checked = checkStepTitle(title, RENAME_MISSING);
  if (!checked.ok) return checked;
  const step = await editableStep(session, stepId, (deps.now ?? Date.now)());
  if (!step.ok) return step;

  const { data, error } = await session.supabase
    .from('work_item_steps')
    .update({ title: checked.value })
    .eq('id', step.stepId)
    .eq('user_id', session.userId)
    .select('id');
  if (error) return failed('step-rename', error.code);
  return data.length === 0 ? { ok: false, error: NOT_YOUR_STEP } : changed(1);
}

// Takes away a step that is not ticked. A ticked step is never removed: its tick would be left pointing at nothing.
export async function removeTaskStep(stepId: unknown, deps: ForecastEditDeps = {}): Promise<EditChange> {
  const session = await signedIn();
  if (!session.ok) return session;
  const step = await editableStep(session, stepId, (deps.now ?? Date.now)());
  if (!step.ok) return step;

  const { data, error } = await session.supabase.from('work_item_steps').delete().eq('id', step.stepId).eq('user_id', session.userId).select('id');
  if (error) return failed('step-remove', error.code);
  return data.length === 0 ? { ok: false, error: NOT_YOUR_STEP } : changed(1);
}

// The code only is logged: a database message can quote the row (the same rule as the other services).
function failed(what: string, code: string | undefined): EditChange {
  console.error('[forecast-edits] could not save', { what, code: code ?? 'none' });
  return { ok: false, error: SAVE_FAILED };
}
