-- Verification for supabase/migrations/002_completion_guard.sql (MOM-29).
-- Run in the Supabase SQL Editor or with `supabase db query --linked -f`. Safe to re-run.
-- Creates one throwaway auth user, checks who can change a task's completion, then deletes the user.
-- Leaves no data behind: an unexpected error rolls back the whole block.

drop table if exists pg_temp.mom29_results;
create temp table mom29_results (n int, check_name text, passed boolean, detail text);

do $$
declare
  a uuid := gen_random_uuid();
  a_channel uuid;
  a_task uuid;
  v int;
  res jsonb := '[]';
begin
  insert into auth.users (id, email) values (a, 'mom29-verify-a@example.invalid');
  select id into a_channel from public.goal_channels where user_id = a and channel_key = 'career_pivot';
  select id into a_task from public.micro_tasks where user_id = a and task_type = 'build' and week_of = 2;

  -- -------------------------------------------------------------------------
  -- Direct postgres connection with no user (a background worker with a raw connection)
  -- -------------------------------------------------------------------------

  begin
    update public.micro_tasks set status = 'done', completed_at = now() where id = a_task;
    res := res || jsonb_build_object('c', 'No-user connection cannot mark a task done', 'p', false, 'd', 'update succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'No-user connection cannot mark a task done', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;

  begin
    insert into public.micro_tasks (user_id, goal_channel_id, title, task_type, minutes, week_of, status, completed_at)
    values (a, a_channel, 'x', 'build', 10, 1, 'done', now());
    res := res || jsonb_build_object('c', 'No-user connection cannot insert an already-done task', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'No-user connection cannot insert an already-done task', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;

  insert into public.micro_tasks (user_id, goal_channel_id, title, task_type, minutes, week_of)
  values (a, a_channel, 'mom29 unfinished task', 'build', 10, 1);
  get diagnostics v = row_count;
  res := res || jsonb_build_object('c', 'No-user connection can still create an unfinished task', 'p', v = 1, 'd', format('%s rows inserted', v));

  -- -------------------------------------------------------------------------
  -- Service role (rebalance engine, ingestion pipeline, LLM routines)
  -- -------------------------------------------------------------------------

  set local role service_role;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

  begin
    update public.micro_tasks set status = 'done', completed_at = now() where id = a_task;
    res := res || jsonb_build_object('c', 'Service role cannot mark a task done', 'p', false, 'd', 'update succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'Service role cannot mark a task done', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;

  update public.micro_tasks set week_of = 3, carried_from_week = 2 where id = a_task;
  get diagnostics v = row_count;
  res := res || jsonb_build_object('c', 'Service role can still rebalance (week_of, carry-over marker)', 'p', v = 1, 'd', format('%s rows changed', v));

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'service_role')::text, true);
  begin
    update public.micro_tasks set status = 'done', completed_at = now() where id = a_task;
    res := res || jsonb_build_object('c', 'Service role cannot act as the owner by copying their id', 'p', false, 'd', 'update succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'Service role cannot act as the owner by copying their id', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;

  -- -------------------------------------------------------------------------
  -- The owner, signed in
  -- -------------------------------------------------------------------------

  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

  update public.micro_tasks set status = 'done', completed_at = now() where id = a_task;
  get diagnostics v = row_count;
  res := res || jsonb_build_object('c', 'Owner can tick their own task done', 'p', v = 1, 'd', format('%s rows changed', v));

  -- -------------------------------------------------------------------------
  -- Un-ticking is a completion change too
  -- -------------------------------------------------------------------------

  reset role;
  set local role service_role;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

  begin
    update public.micro_tasks set status = 'todo', completed_at = null where id = a_task;
    res := res || jsonb_build_object('c', 'Service role cannot un-tick a done task', 'p', false, 'd', 'update succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'Service role cannot un-tick a done task', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;

  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

  update public.micro_tasks set status = 'todo', completed_at = null where id = a_task;
  get diagnostics v = row_count;
  res := res || jsonb_build_object('c', 'Owner can un-tick their own task', 'p', v = 1, 'd', format('%s rows changed', v));

  -- -------------------------------------------------------------------------
  -- Cleanup (as postgres)
  -- -------------------------------------------------------------------------

  reset role;
  perform set_config('request.jwt.claims', '', true);

  delete from auth.users where id = a;
  select (select count(*) from public.users where id = a)
       + (select count(*) from public.goal_channels where user_id = a)
       + (select count(*) from public.micro_tasks where user_id = a)
    into v;
  res := res || jsonb_build_object('c', 'Throwaway account and its rows are gone', 'p', v = 0, 'd', format('%s rows left', v));

  insert into mom29_results (n, check_name, passed, detail)
  select ord, e ->> 'c', (e ->> 'p')::boolean, e ->> 'd'
  from jsonb_array_elements(res) with ordinality as x(e, ord);
end;
$$;

select * from mom29_results order by n;
