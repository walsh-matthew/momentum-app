-- MOM-22: carry-over history and rebalance audit trail.
-- micro_tasks.carried_from_week / pulled_from_week keep only the last hop. This table keeps every
-- move a task has made, so a task carried twice reads 2 -> 3, 3 -> 5. Those columns stay as the
-- "where did this come from" marker the UI shows (docs/NINETY_DAY_PLAN_CONTEXT.md §3, §7).
--
-- The trail is append-only and written only by apply_task_move() below, in the same transaction as
-- the week change, so a move and its record cannot drift apart. Clients can read their own rows and
-- nothing else; no API role can insert, edit or delete history directly.

-- ---------------------------------------------------------------------------
-- 1. Same-owner FK target (same pattern as goal_channels_id_user_unique in migration 001)
-- ---------------------------------------------------------------------------

alter table public.micro_tasks
  add constraint micro_tasks_id_user_unique unique (id, user_id);

-- ---------------------------------------------------------------------------
-- 2. task_rebalance_history
-- ---------------------------------------------------------------------------

create table public.task_rebalance_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  task_id     uuid not null,
  source_week integer not null,
  target_week integer not null,
  shift_type  text not null,
  -- clock_timestamp(), not now(): two moves in one transaction still sort in the order they happened.
  created_at  timestamptz not null default clock_timestamp(),

  -- Same-owner FK. The history of a task goes with the task (and with the account).
  constraint task_rebalance_history_task_fk
    foreign key (task_id, user_id) references public.micro_tasks (id, user_id) on delete cascade,
  constraint task_rebalance_history_shift_type_check check (shift_type in ('carry_over', 'pull_forward')),
  constraint task_rebalance_history_weeks_positive check (source_week >= 1 and target_week >= 1),
  -- Direction is part of the record: a carry-over moves work later, a pull-forward earlier.
  constraint task_rebalance_history_direction check (
    (shift_type = 'carry_over' and target_week > source_week)
    or (shift_type = 'pull_forward' and target_week < source_week)
  )
);

create index task_rebalance_history_task_idx on public.task_rebalance_history (task_id, created_at);
create index task_rebalance_history_user_idx on public.task_rebalance_history (user_id, created_at);

alter table public.task_rebalance_history enable row level security;

-- Append-only for API roles: read your own rows, nothing else. Supabase grants new tables to every
-- API role by default, so take them all back and give back only what is needed.
revoke all on table public.task_rebalance_history from anon, authenticated, service_role;
grant select on table public.task_rebalance_history to authenticated;

create policy "task_rebalance_history_select_own" on public.task_rebalance_history
  for select to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 3. apply_task_move: move one unfinished task and record it, atomically
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER because clients have no INSERT on the history table. It acts only for the
-- signed-in user (auth.uid()), only on that user's own task, only while the task is still unfinished
-- and still in the week the caller saw. It changes week_of, the move markers and due_date, and
-- nothing else: it never touches status or completed_at (human-only completion, migration 002) and
-- never deletes. Returns false when the task is not eligible, so the caller can report a stale move.

create or replace function public.apply_task_move(
  p_task_id   uuid,
  p_from_week integer,
  p_to_week   integer,
  p_action    text,
  p_due_date  date
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in to rebalance your plan.' using errcode = '42501';
  end if;
  if p_action not in ('carry_over', 'pull_forward') then
    raise exception 'Unknown rebalance action.' using errcode = '22023';
  end if;

  update public.micro_tasks
  set week_of           = p_to_week,
      carried_from_week = case when p_action = 'carry_over'   then p_from_week end,
      pulled_from_week  = case when p_action = 'pull_forward' then p_from_week end,
      due_date          = p_due_date
  where id = p_task_id
    and user_id = v_uid
    and status = 'todo'
    and week_of = p_from_week;

  if not found then
    return false;
  end if;

  insert into public.task_rebalance_history (user_id, task_id, source_week, target_week, shift_type)
  values (v_uid, p_task_id, p_from_week, p_to_week, p_action);

  return true;
end;
$$;

-- Signed-in users only. Supabase grants EXECUTE to API roles by default (see MOM-60), so revoke first.
revoke execute on function public.apply_task_move(uuid, integer, integer, text, date)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_task_move(uuid, integer, integer, text, date) to authenticated;
