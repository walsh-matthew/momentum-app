-- MOM-35: create a wizard goal and its week 1 tasks in one transaction.
-- Two API calls (insert the goal, then insert its tasks) cannot be all-or-nothing: if the second failed,
-- an empty goal would be left behind, and cleaning it up would mean deleting. One function call is one
-- transaction, so either the goal and every task exist or nothing does.
-- Sources: docs/NINETY_DAY_PLAN_CONTEXT.md §3, §5 rule 6 (the user owns completion), PRODUCT_STRATEGY.md §4.
--
-- Safety, in the same style as apply_task_move (migration 003):
-- - SECURITY INVOKER: the caller's own role runs every statement, so row level security applies as it does
--   for a direct insert. The function grants nothing the caller does not already have.
-- - The owner is auth.uid(). There is no user id or channel id argument, so the rows cannot be made for
--   anyone else, and the new tasks can only attach to the goal created in this same call.
-- - There is no status or completed_at argument and the function never sets either, so every task takes the
--   column default 'todo'. Migration 002's trigger rejects anything else from a non-owner as well.
-- - Every task is in week 1. The wizard plan is the first week; later weeks are the rebalancer's job.

create or replace function public.create_goal_with_week_one_plan(
  p_channel_key text,
  p_title       text,
  p_goal_type   text,
  p_preferences jsonb,
  p_criteria    jsonb,
  p_start_date  date,
  p_target_date date,
  -- Array of { "title": text, "task_type": text, "minutes": integer }, in plan order. No other key.
  p_tasks       jsonb
)
returns public.goal_channels
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_goal public.goal_channels;
begin
  if v_uid is null then
    raise exception 'Sign in to create a goal.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_tasks) is distinct from 'array' then
    raise exception 'p_tasks must be a JSON array of tasks.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_tasks) not between 1 and 100 then
    raise exception 'A week 1 plan needs between 1 and 100 tasks.' using errcode = '22023';
  end if;
  -- Only title, task_type and minutes are read. Refuse any other key rather than ignore it, so a task that
  -- carries a status, a week or a completion time fails loudly. CASE, not AND: Postgres may evaluate AND
  -- operands in any order, and `-` on a non-object raises a different error.
  if exists (
    select 1 from jsonb_array_elements(p_tasks) as t
    where case when jsonb_typeof(t) = 'object'
               then (t - 'title' - 'task_type' - 'minutes') <> '{}'::jsonb
               else true end
  ) then
    raise exception 'Each task may only have title, task_type and minutes.' using errcode = '22023';
  end if;

  -- status and is_default take their column defaults ('active', false).
  insert into public.goal_channels
    (user_id, channel_key, title, start_date, target_date, criteria, goal_type, preferences)
  values
    (v_uid, p_channel_key, p_title, p_start_date, p_target_date, p_criteria, p_goal_type, p_preferences)
  returning * into v_goal;

  -- created_at is spread by one millisecond per task so the plan keeps its order when it is read back
  -- (the focus task is the earliest created_at in the earliest week).
  insert into public.micro_tasks (user_id, goal_channel_id, title, task_type, minutes, week_of, created_at)
  select v_uid, v_goal.id, t.title, t.task_type, t.minutes, 1, now() + t.position * interval '1 millisecond'
  from rows from (jsonb_to_recordset(p_tasks) as (title text, task_type text, minutes integer))
       with ordinality as t(title, task_type, minutes, position);

  return v_goal;
end;
$$;

-- Signed-in users only. Supabase grants EXECUTE to API roles by default (see MOM-60), so revoke first.
-- service_role is revoked on purpose: it has no session to act as, and a plan is the user's own.
revoke execute on function public.create_goal_with_week_one_plan(text, text, text, jsonb, jsonb, date, date, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.create_goal_with_week_one_plan(text, text, text, jsonb, jsonb, date, date, jsonb)
  to authenticated;
