-- MOM-22: make task_rebalance_history complete from day one.
-- Migration 003 records every move made through apply_task_move(). Two sources of markers were not
-- covered, and both leave a carried_from_week / pulled_from_week with no matching history row:
--   1. rows that already existed, and
--   2. tasks created with a marker, such as the carried-over task in the signup seed.
-- Section 1 backfills (1); section 2 keeps (2) covered for the seed and any later insert.

-- ---------------------------------------------------------------------------
-- 1. Backfill: one history row for each marked task that has no history yet
-- ---------------------------------------------------------------------------
-- Idempotent: tasks that already have any history are skipped. The move time is unknown for old
-- rows, so created_at is the task's own created_at.

insert into public.task_rebalance_history (user_id, task_id, source_week, target_week, shift_type, created_at)
select t.user_id,
       t.id,
       coalesce(t.carried_from_week, t.pulled_from_week),
       t.week_of,
       case when t.carried_from_week is not null then 'carry_over' else 'pull_forward' end,
       t.created_at
from public.micro_tasks t
where (t.carried_from_week is not null or t.pulled_from_week is not null)
  and not exists (select 1 from public.task_rebalance_history h where h.task_id = t.id);

-- ---------------------------------------------------------------------------
-- 2. A task created with a move marker records that move
-- ---------------------------------------------------------------------------
-- seed_career_pivot() inserts the certify task already carried from week 2 into week 3. Hooking the
-- insert, instead of rewriting the seed function, covers the seed and any later insert that sets a
-- marker. SECURITY DEFINER because API roles have no INSERT on the history table. The table's own
-- CHECK constraints (direction, weeks) still apply to what it writes.

create or replace function public.micro_tasks_record_initial_move()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.carried_from_week is not null or new.pulled_from_week is not null then
    insert into public.task_rebalance_history (user_id, task_id, source_week, target_week, shift_type)
    values (
      new.user_id,
      new.id,
      coalesce(new.carried_from_week, new.pulled_from_week),
      new.week_of,
      case when new.carried_from_week is not null then 'carry_over' else 'pull_forward' end
    );
  end if;
  return new;
end;
$$;

-- Invoked by the trigger only; nobody needs EXECUTE (see migrations 002 and 003).
revoke execute on function public.micro_tasks_record_initial_move() from public, anon, authenticated, service_role;

-- AFTER INSERT so the task row exists for the history table's foreign key.
create trigger micro_tasks_record_initial_move
  after insert on public.micro_tasks
  for each row execute function public.micro_tasks_record_initial_move();
