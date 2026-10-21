// Micro-task data access. The only place micro_tasks is queried (CLAUDE.md, Architectural
// Directive 1). Server-side only: it reads the request's auth cookies.
//
// Completion is human-only (docs/NINETY_DAY_PLAN_CONTEXT.md §3, §5 rule 6). Status changes here
// always run as the signed-in user through the anon-key client, so RLS scopes the write to their
// own rows, and there is no actor or "system" parameter. Automated code (rebalancing, ingestion)
// must not call setTaskStatus; it has no session to act as.

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { TASK_STATUSES, type MicroTask, type TaskStatus } from '@/types/database.types';
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

// Sets a task to done or back to todo on behalf of the signed-in user. Validates its input
// because it is reachable from any caller, including a direct Server Action POST.
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
