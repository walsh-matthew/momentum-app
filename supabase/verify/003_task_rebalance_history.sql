-- Verification for supabase/migrations/003_task_rebalance_history.sql (MOM-22).
-- Run in the Supabase SQL Editor or with `supabase db query --linked -f`. Safe to re-run.
-- Creates two throwaway auth users, moves tasks as user A, checks the history, then deletes them.
-- Signup no longer seeds (migration 010), so postgres seeds Career Pivot by hand where this script needs it.
-- Leaves no data behind: an unexpected error rolls back the whole block.

drop table if exists pg_temp.mom22_results;
create temp table mom22_results (n int, check_name text, passed boolean, detail text);

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  a_task uuid;
  a_done_task uuid;
  b_task uuid;
  tasks_before int;
  tasks_after int;
  moved boolean;
  v int;
  w int;
  t text;
  res jsonb := '[]';
begin
  insert into auth.users (id, email)
  values (a, 'mom22-verify-a@example.invalid'), (b, 'mom22-verify-b@example.invalid');
  perform public.seed_career_pivot(a);
  perform public.seed_career_pivot(b);

  -- Seeded Career Pivot tasks: week 2 has 7 unfinished tasks, due dates null or set by the seed.
  select id into a_task from public.micro_tasks where user_id = a and task_type = 'build' and week_of = 2;
  select id into a_done_task from public.micro_tasks where user_id = a and task_type = 'learn' and week_of = 2;
  select id into b_task from public.micro_tasks where user_id = b and task_type = 'build' and week_of = 2;
  select count(*) into tasks_before from public.micro_tasks where user_id in (a, b);

  -- -------------------------------------------------------------------------
  -- Who can call it
  -- -------------------------------------------------------------------------

  set local role anon;
  begin
    perform public.apply_task_move(a_task, 2, 3, 'carry_over', null);
    res := res || jsonb_build_object('c', 'Signed-out role cannot call apply_task_move', 'p', false, 'd', 'call succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'Signed-out role cannot call apply_task_move', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;
  reset role;

  set local role service_role;
  begin
    perform public.apply_task_move(a_task, 2, 3, 'carry_over', null);
    res := res || jsonb_build_object('c', 'Service role cannot call apply_task_move', 'p', false, 'd', 'call succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'Service role cannot call apply_task_move', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;
  reset role;

  -- -------------------------------------------------------------------------
  -- Signed in as user A
  -- -------------------------------------------------------------------------

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

  -- A tick done first, so check 8 has a finished task to try to move.
  update public.micro_tasks set status = 'done', completed_at = now() where id = a_done_task;

  moved := public.apply_task_move(a_task, 2, 3, 'carry_over', null);
  select count(*) into v from public.micro_tasks
  where id = a_task and week_of = 3 and carried_from_week = 2 and pulled_from_week is null and status = 'todo' and completed_at is null;
  select count(*) into w from public.task_rebalance_history
  where task_id = a_task and user_id = a and source_week = 2 and target_week = 3 and shift_type = 'carry_over';
  res := res || jsonb_build_object('c', 'Carry-over moves the task and writes one history row', 'p', moved and v = 1 and w = 1,
    'd', format('moved %s, task rows %s, history rows %s', moved, v, w));

  moved := public.apply_task_move(a_task, 3, 5, 'carry_over', null);
  select string_agg(format('%s>%s', source_week, target_week), ' ' order by created_at) into t
  from public.task_rebalance_history where task_id = a_task;
  select carried_from_week into v from public.micro_tasks where id = a_task;
  res := res || jsonb_build_object('c', 'A second carry-over keeps the whole chain (2>3 then 3>5)', 'p', moved and t = '2>3 3>5' and v = 3,
    'd', format('chain %s, carried_from_week %s', t, v));

  moved := public.apply_task_move(a_task, 5, 4, 'pull_forward', null);
  select count(*) into v from public.micro_tasks
  where id = a_task and week_of = 4 and pulled_from_week = 5 and carried_from_week is null;
  select count(*) into w from public.task_rebalance_history where task_id = a_task and shift_type = 'pull_forward' and source_week = 5 and target_week = 4;
  res := res || jsonb_build_object('c', 'Pull-forward moves earlier, swaps the marker and is recorded', 'p', moved and v = 1 and w = 1,
    'd', format('moved %s, task rows %s, history rows %s', moved, v, w));

  select count(*) into v from public.task_rebalance_history where task_id = a_task;
  moved := public.apply_task_move(a_task, 2, 3, 'carry_over', null);
  select count(*) into w from public.task_rebalance_history where task_id = a_task;
  res := res || jsonb_build_object('c', 'A stale move (wrong from-week) is refused and not recorded', 'p', moved = false and v = w,
    'd', format('moved %s, history rows %s -> %s', moved, v, w));

  moved := public.apply_task_move(a_done_task, 2, 3, 'carry_over', null);
  select count(*) into v from public.micro_tasks where id = a_done_task and week_of = 2 and status = 'done' and completed_at is not null;
  select count(*) into w from public.task_rebalance_history where task_id = a_done_task;
  res := res || jsonb_build_object('c', 'A finished task is never moved, and stays done', 'p', moved = false and v = 1 and w = 0,
    'd', format('moved %s, task rows %s, history rows %s', moved, v, w));

  moved := public.apply_task_move(b_task, 2, 3, 'carry_over', null);
  res := res || jsonb_build_object('c', 'A cannot move B''s task', 'p', moved = false, 'd', format('moved %s', moved));

  begin
    perform public.apply_task_move(a_task, 4, 3, 'carry_over', null);
    res := res || jsonb_build_object('c', 'A carry-over to an earlier week is rejected', 'p', false, 'd', 'call succeeded');
  exception when others then
    select count(*) into w from public.task_rebalance_history where task_id = a_task;
    res := res || jsonb_build_object('c', 'A carry-over to an earlier week is rejected', 'p', sqlstate = '23514' and w = 3,
      'd', sqlstate || ' ' || sqlerrm || format(' (history rows still %s)', w));
  end;

  -- -------------------------------------------------------------------------
  -- Reading, and the append-only guarantee
  -- -------------------------------------------------------------------------

  -- A's rows: 1 from the seed's carry-over (migration 004) plus the 3 moves made above.
  select count(*), count(*) filter (where user_id = a) into v, w from public.task_rebalance_history;
  res := res || jsonb_build_object('c', 'A reads only their own history (4 rows: 1 seed + 3 moves)', 'p', v = 4 and w = 4,
    'd', format('%s rows visible, %s are A''s', v, w));

  begin
    insert into public.task_rebalance_history (user_id, task_id, source_week, target_week, shift_type)
    values (a, a_task, 2, 3, 'carry_over');
    res := res || jsonb_build_object('c', 'A cannot write a history row directly', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A cannot write a history row directly', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;

  begin
    update public.task_rebalance_history set target_week = 9 where task_id = a_task;
    res := res || jsonb_build_object('c', 'A cannot edit history', 'p', false, 'd', 'update succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A cannot edit history', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;

  begin
    delete from public.task_rebalance_history where task_id = a_task;
    res := res || jsonb_build_object('c', 'A cannot delete history', 'p', false, 'd', 'delete succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A cannot delete history', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;

  -- -------------------------------------------------------------------------
  -- Signed in as user B: sees none of A's history, and B's task did not move
  -- -------------------------------------------------------------------------

  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);

  -- B sees their own seed row (migration 004) and none of A's.
  select count(*), count(*) filter (where user_id = a) into v, w from public.task_rebalance_history;
  res := res || jsonb_build_object('c', 'B cannot see A''s history (sees only their own 1 seed row)', 'p', v = 1 and w = 0,
    'd', format('%s rows visible, %s are A''s', v, w));

  select count(*) into v from public.micro_tasks where id = b_task and week_of = 2 and carried_from_week is null;
  res := res || jsonb_build_object('c', 'B''s task did not move', 'p', v = 1, 'd', format('%s rows unchanged', v));

  -- -------------------------------------------------------------------------
  -- Nothing was deleted; cleanup (as postgres)
  -- -------------------------------------------------------------------------

  reset role;
  perform set_config('request.jwt.claims', '', true);

  select count(*) into tasks_after from public.micro_tasks where user_id in (a, b);
  res := res || jsonb_build_object('c', 'No task was deleted by any move', 'p', tasks_before = tasks_after,
    'd', format('%s tasks before, %s after', tasks_before, tasks_after));

  delete from auth.users where id in (a, b);
  select (select count(*) from public.micro_tasks where user_id in (a, b))
       + (select count(*) from public.task_rebalance_history where user_id in (a, b))
    into v;
  res := res || jsonb_build_object('c', 'Deleting an account removes its tasks and history', 'p', v = 0, 'd', format('%s rows left', v));

  insert into mom22_results (n, check_name, passed, detail)
  select ord, e ->> 'c', (e ->> 'p')::boolean, e ->> 'd'
  from jsonb_array_elements(res) with ordinality as x(e, ord);
end;
$$;

select * from mom22_results order by n;
