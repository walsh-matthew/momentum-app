-- Verification for supabase/migrations/007_task_source_evidence.sql (MOM-40).
-- Run in the Supabase SQL Editor or with `supabase db query --linked -f`. Safe to re-run.
-- Creates two throwaway auth users, creates ingested-style tasks as them, then deletes the users.
-- Signup no longer seeds (migration 010), so postgres seeds Career Pivot by hand where this script needs it.
-- Leaves no data behind: an unexpected error rolls back the whole block.

drop table if exists pg_temp.mom40_results;
create temp table mom40_results (n int, check_name text, passed boolean, detail text);

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  a_channel uuid;
  b_channel uuid;
  v int;
  w int;
  evidence jsonb := '{"activityType":"strength_workout","occurredAt":"2026-10-21T07:15:00Z","durationMinutes":45,"metrics":{"setsCompleted":16}}';
  res jsonb := '[]';
begin
  insert into auth.users (id, email)
  values (a, 'mom40-verify-a@example.invalid'), (b, 'mom40-verify-b@example.invalid');
  perform public.seed_career_pivot(a);
  perform public.seed_career_pivot(b);
  select id into a_channel from public.goal_channels where user_id = a and channel_key = 'career_pivot';
  select id into b_channel from public.goal_channels where user_id = b and channel_key = 'career_pivot';

  -- The seed creates ordinary tasks: none of them has a source.
  select count(*) into v from public.micro_tasks where user_id = a and (source_provider is not null or source_external_id is not null or source_evidence is not null);
  res := res || jsonb_build_object('c', 'Ordinary and seeded tasks have no source', 'p', v = 0, 'd', format('%s tasks with a source', v));

  -- -------------------------------------------------------------------------
  -- Signed in as user A: the pipeline's own path (insert as the user, through RLS)
  -- -------------------------------------------------------------------------

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

  insert into public.micro_tasks (user_id, goal_channel_id, title, task_type, minutes, week_of, due_date, status, source_provider, source_external_id, source_evidence)
  values (a, a_channel, 'Upper Body Strength', 'event', 45, 2, '2026-10-21', 'todo', 'hevy', 'hev_w_8f9a21b', evidence);
  get diagnostics v = row_count;
  res := res || jsonb_build_object('c', 'The owner can create an unfinished ingested task with its evidence', 'p', v = 1, 'd', format('%s rows inserted', v));

  select count(*) into v from public.micro_tasks
  where user_id = a and source_provider = 'hevy' and source_external_id = 'hev_w_8f9a21b'
    and status = 'todo' and completed_at is null and source_evidence ->> 'activityType' = 'strength_workout';
  res := res || jsonb_build_object('c', 'It reads back unfinished, with the evidence intact', 'p', v = 1, 'd', format('%s rows', v));

  begin
    insert into public.micro_tasks (user_id, goal_channel_id, title, task_type, minutes, week_of, source_provider, source_external_id)
    values (a, a_channel, 'Same workout again', 'event', 45, 2, 'hevy', 'hev_w_8f9a21b');
    res := res || jsonb_build_object('c', 'The same external item cannot create a second task', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'The same external item cannot create a second task', 'p', sqlstate = '23505', 'd', sqlstate || ' ' || sqlerrm);
  end;

  insert into public.micro_tasks (user_id, goal_channel_id, title, task_type, minutes, week_of)
  values (a, a_channel, 'Plain task one', 'build', 10, 2), (a, a_channel, 'Plain task two', 'build', 10, 2);
  get diagnostics v = row_count;
  res := res || jsonb_build_object('c', 'Tasks with no source never collide with each other', 'p', v = 2, 'd', format('%s rows inserted', v));

  begin
    insert into public.micro_tasks (user_id, goal_channel_id, title, task_type, minutes, week_of, source_provider)
    values (a, a_channel, 'x', 'event', 10, 2, 'hevy');
    res := res || jsonb_build_object('c', 'A provider without an external id is rejected', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A provider without an external id is rejected', 'p', sqlstate = '23514', 'd', sqlstate);
  end;

  begin
    insert into public.micro_tasks (user_id, goal_channel_id, title, task_type, minutes, week_of, source_external_id)
    values (a, a_channel, 'x', 'event', 10, 2, 'orphan-id');
    res := res || jsonb_build_object('c', 'An external id without a provider is rejected', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'An external id without a provider is rejected', 'p', sqlstate = '23514', 'd', sqlstate);
  end;

  begin
    insert into public.micro_tasks (user_id, goal_channel_id, title, task_type, minutes, week_of, source_evidence)
    values (a, a_channel, 'x', 'event', 10, 2, evidence);
    res := res || jsonb_build_object('c', 'Evidence without a source is rejected', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'Evidence without a source is rejected', 'p', sqlstate = '23514', 'd', sqlstate);
  end;

  begin
    insert into public.micro_tasks (user_id, goal_channel_id, title, task_type, minutes, week_of, source_provider, source_external_id, source_evidence)
    values (a, a_channel, 'x', 'event', 10, 2, 'hevy', 'array-evidence', '["not","an","object"]'::jsonb);
    res := res || jsonb_build_object('c', 'Evidence must be a JSON object', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'Evidence must be a JSON object', 'p', sqlstate = '23514', 'd', sqlstate);
  end;

  begin
    insert into public.micro_tasks (user_id, goal_channel_id, title, task_type, minutes, week_of, source_provider, source_external_id)
    values (a, a_channel, 'x', 'event', 10, 2, 'Hevy', 'upper-case-provider');
    res := res || jsonb_build_object('c', 'A provider key must be lower case', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A provider key must be lower case', 'p', sqlstate = '23514', 'd', sqlstate);
  end;

  begin
    insert into public.micro_tasks (user_id, goal_channel_id, title, task_type, minutes, week_of, source_provider, source_external_id)
    values (a, a_channel, 'x', 'event', 10, 2, 'hevy', '   ');
    res := res || jsonb_build_object('c', 'A blank external id is rejected', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A blank external id is rejected', 'p', sqlstate = '23514', 'd', sqlstate);
  end;

  begin
    insert into public.micro_tasks (user_id, goal_channel_id, title, task_type, minutes, week_of, source_provider, source_external_id)
    values (b, b_channel, 'For someone else', 'event', 10, 2, 'hevy', 'planted-for-b');
    res := res || jsonb_build_object('c', 'A user cannot create an ingested task for another user', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A user cannot create an ingested task for another user', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;

  -- -------------------------------------------------------------------------
  -- Another user may use the same external id: the key is per user
  -- -------------------------------------------------------------------------

  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);

  insert into public.micro_tasks (user_id, goal_channel_id, title, task_type, minutes, week_of, source_provider, source_external_id)
  values (b, b_channel, 'Upper Body Strength', 'event', 45, 2, 'hevy', 'hev_w_8f9a21b');
  get diagnostics v = row_count;
  res := res || jsonb_build_object('c', 'The same external id is allowed for a different user', 'p', v = 1, 'd', format('%s rows inserted', v));

  -- -------------------------------------------------------------------------
  -- Completion stays human-only (migration 002): a worker cannot create a finished ingested task
  -- -------------------------------------------------------------------------

  reset role;
  perform set_config('request.jwt.claims', '', true);

  begin
    insert into public.micro_tasks (user_id, goal_channel_id, title, task_type, minutes, week_of, status, completed_at, source_provider, source_external_id)
    values (a, a_channel, 'Already done', 'event', 10, 2, 'done', now(), 'hevy', 'worker-done');
    res := res || jsonb_build_object('c', 'A worker cannot create an already-finished ingested task', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A worker cannot create an already-finished ingested task', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;

  insert into public.micro_tasks (user_id, goal_channel_id, title, task_type, minutes, week_of, source_provider, source_external_id)
  values (a, a_channel, 'Worker made, unfinished', 'event', 10, 2, 'hevy', 'worker-todo');
  get diagnostics v = row_count;
  res := res || jsonb_build_object('c', 'A worker can create an unfinished one', 'p', v = 1, 'd', format('%s rows inserted', v));

  -- -------------------------------------------------------------------------
  -- Cleanup
  -- -------------------------------------------------------------------------

  delete from auth.users where id in (a, b);
  select count(*) into v from public.micro_tasks where user_id in (a, b);
  res := res || jsonb_build_object('c', 'Deleting an account removes its ingested tasks', 'p', v = 0, 'd', format('%s rows left', v));

  insert into mom40_results (n, check_name, passed, detail)
  select ord, e ->> 'c', (e ->> 'p')::boolean, e ->> 'd'
  from jsonb_array_elements(res) with ordinality as x(e, ord);
end;
$$;

select * from mom40_results order by n;
