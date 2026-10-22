-- MOM-29: only the signed-in owner can change a task's completion.
-- docs/NINETY_DAY_PLAN_CONTEXT.md §3 and §5 rule 6: the user ticks their own tasks; the system never
-- marks a task done on their behalf. RLS cannot enforce this alone, because the service role bypasses
-- it and RLS policies cannot see which columns changed. This trigger closes that gap.
--
-- A change to status or completed_at (on update), or an insert that starts a task as anything other
-- than an unfinished one, is allowed only when the caller is the `authenticated` role and its JWT
-- subject is the task's owner. That rejects the service role (rebalance engine, ingestion pipeline,
-- LLM routines), direct postgres connections, and a service-role call that carries a copied user id.
-- Everything else stays open to them: creating unfinished tasks (signup seed) and rebalancing
-- (week_of, due date and the carry-over markers) never touch the guarded columns.
--
-- A superuser can still disable the trigger. That is a deliberate admin action, not a code path.

create or replace function public.micro_tasks_guard_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and (new.status <> 'todo' or new.completed_at is not null))
     or (tg_op = 'UPDATE' and (new.status is distinct from old.status
                               or new.completed_at is distinct from old.completed_at))
  then
    if current_user <> 'authenticated' or auth.uid() is distinct from new.user_id then
      raise exception 'Only the task owner can change a task''s completion.'
        using errcode = '42501',
              hint = 'Completion is human-only (NINETY_DAY_PLAN_CONTEXT.md §3).';
    end if;
  end if;
  return new;
end;
$$;

-- Invoked by the trigger only. Firing a trigger needs no EXECUTE grant, so nobody should hold one
-- (same lesson as seed_career_pivot in MOM-60: Supabase grants EXECUTE to API roles by default).
revoke execute on function public.micro_tasks_guard_completion() from public, anon, authenticated, service_role;

create trigger micro_tasks_guard_completion
  before insert or update on public.micro_tasks
  for each row execute function public.micro_tasks_guard_completion();
