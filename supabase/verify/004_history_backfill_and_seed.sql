-- Verification for supabase/migrations/004_history_backfill_and_seed.sql (MOM-22).
-- Run in the Supabase SQL Editor or with `supabase db query --linked -f`. Safe to re-run.
-- Creates one throwaway auth user, checks the seed's history and the backfill, then deletes the user.
-- Leaves no data behind: an unexpected error rolls back the whole block.

drop table if exists pg_temp.mom22b_results;
create temp table mom22b_results (n int, check_name text, passed boolean, detail text);

do $$
declare
  a uuid := gen_random_uuid();
  a_channel uuid;
  a_task uuid;
  a_marked uuid;
  v int;
  w int;
  res jsonb := '[]';
begin
  insert into auth.users (id, email) values (a, 'mom22-verify-004@example.invalid');
  select id into a_channel from public.goal_channels where user_id = a and channel_key = 'career_pivot';
  select id into a_task from public.micro_tasks where user_id = a and task_type = 'build' and week_of = 2;

  -- -------------------------------------------------------------------------
  -- Signup seed
  -- -------------------------------------------------------------------------

  select count(*) into v from public.task_rebalance_history where user_id = a;
  select count(*) into w from public.task_rebalance_history h
  join public.micro_tasks t on t.id = h.task_id
  where h.user_id = a and t.task_type = 'certify' and t.week_of = 3
    and h.source_week = 2 and h.target_week = 3 and h.shift_type = 'carry_over';
  res := res || jsonb_build_object('c', 'Seed records its one carry-over (certify, week 2 to 3)', 'p', v = 1 and w = 1,
    'd', format('%s history rows, %s matching the certify task', v, w));

  perform public.seed_career_pivot(a);
  select count(*) into v from public.task_rebalance_history where user_id = a;
  res := res || jsonb_build_object('c', 'Re-running the seed does not duplicate history', 'p', v = 1, 'd', format('%s rows', v));

  -- -------------------------------------------------------------------------
  -- Any insert with a marker records it; an unmarked insert records nothing
  -- -------------------------------------------------------------------------

  insert into public.micro_tasks (user_id, goal_channel_id, title, task_type, minutes, week_of, pulled_from_week)
  values (a, a_channel, 'mom22 pulled task', 'build', 10, 4, 6)
  returning id into a_marked;
  select count(*) into v from public.task_rebalance_history
  where task_id = a_marked and source_week = 6 and target_week = 4 and shift_type = 'pull_forward';
  res := res || jsonb_build_object('c', 'A task inserted with pulled_from_week records a pull-forward', 'p', v = 1, 'd', format('%s rows', v));

  insert into public.micro_tasks (user_id, goal_channel_id, title, task_type, minutes, week_of)
  values (a, a_channel, 'mom22 plain task', 'build', 10, 4);
  select count(*) into v from public.task_rebalance_history where user_id = a;
  res := res || jsonb_build_object('c', 'A task inserted with no marker records nothing', 'p', v = 2, 'd', format('%s rows for the user', v));

  -- -------------------------------------------------------------------------
  -- Backfill statement (same as migration 004 section 1) on rows that lost their history
  -- -------------------------------------------------------------------------

  delete from public.task_rebalance_history where user_id = a;

  insert into public.task_rebalance_history (user_id, task_id, source_week, target_week, shift_type, created_at)
  select t.user_id, t.id, coalesce(t.carried_from_week, t.pulled_from_week), t.week_of,
         case when t.carried_from_week is not null then 'carry_over' else 'pull_forward' end, t.created_at
  from public.micro_tasks t
  where (t.carried_from_week is not null or t.pulled_from_week is not null)
    and not exists (select 1 from public.task_rebalance_history h where h.task_id = t.id);
  select count(*) into v from public.task_rebalance_history where user_id = a;
  res := res || jsonb_build_object('c', 'Backfill restores one row per marked task (2 marked)', 'p', v = 2, 'd', format('%s rows', v));

  insert into public.task_rebalance_history (user_id, task_id, source_week, target_week, shift_type, created_at)
  select t.user_id, t.id, coalesce(t.carried_from_week, t.pulled_from_week), t.week_of,
         case when t.carried_from_week is not null then 'carry_over' else 'pull_forward' end, t.created_at
  from public.micro_tasks t
  where (t.carried_from_week is not null or t.pulled_from_week is not null)
    and not exists (select 1 from public.task_rebalance_history h where h.task_id = t.id);
  select count(*) into v from public.task_rebalance_history where user_id = a;
  res := res || jsonb_build_object('c', 'Backfill is idempotent (second run adds nothing)', 'p', v = 2, 'd', format('%s rows', v));

  -- -------------------------------------------------------------------------
  -- The trigger function is not callable by API roles
  -- -------------------------------------------------------------------------

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  begin
    perform public.micro_tasks_record_initial_move();
    res := res || jsonb_build_object('c', 'Signed-in users cannot call the trigger function', 'p', false, 'd', 'call succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'Signed-in users cannot call the trigger function', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;

  -- -------------------------------------------------------------------------
  -- Cleanup (as postgres)
  -- -------------------------------------------------------------------------

  reset role;
  perform set_config('request.jwt.claims', '', true);

  delete from auth.users where id = a;
  select (select count(*) from public.micro_tasks where user_id = a)
       + (select count(*) from public.task_rebalance_history where user_id = a)
    into v;
  res := res || jsonb_build_object('c', 'Deleting the account removes its tasks and history', 'p', v = 0, 'd', format('%s rows left', v));

  insert into mom22b_results (n, check_name, passed, detail)
  select ord, e ->> 'c', (e ->> 'p')::boolean, e ->> 'd'
  from jsonb_array_elements(res) with ordinality as x(e, ord);
end;
$$;

select * from mom22b_results order by n;
