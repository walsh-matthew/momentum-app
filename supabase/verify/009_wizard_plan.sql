-- Verification for supabase/migrations/009_wizard_week_one_plan.sql (MOM-35).
-- Run in the Supabase SQL Editor or with `supabase db query --linked -f`. Safe to re-run.
-- Creates two throwaway auth users, calls create_goal_with_week_one_plan as each, then deletes them.
-- Needs no seed: signup starts accounts empty (migration 010) and this script never calls the seed function.
-- Leaves no data behind: an unexpected error rolls back the whole block.

drop table if exists pg_temp.mom35_results;
create temp table mom35_results (n int, check_name text, passed boolean, detail text);

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  a_goal uuid;
  b_goal uuid;
  gid uuid;
  v int;
  w int;
  c jsonb;
  goals_before int;
  tasks_before int;
  pass boolean;
  detail text;
  titles text;
  t text;
  res jsonb := '[]';
  -- One statement shape for every call, so each case differs only in its arguments.
  call_sql constant text :=
    'select id from public.create_goal_with_week_one_plan(%L, %L, %L, %L::jsonb, %L::jsonb, current_date, current_date + 90, %L::jsonb)';
  good_tasks constant text :=
    '[{"title": "Pick the exam and book the date", "task_type": "certify", "minutes": 30},
      {"title": "Study the first exam domain", "task_type": "certify", "minutes": 45},
      {"title": "Friday review: tick tasks and fill in notes", "task_type": "review", "minutes": 30}]';
  good_criteria constant text :=
    '[{"key": "exam_booked", "label": "The exam is booked, with a date", "done": false}]';
begin
  insert into auth.users (id, email)
  values (a, 'mom35-verify-a@example.invalid'), (b, 'mom35-verify-b@example.invalid');

  -- -------------------------------------------------------------------------
  -- Who may call it (as postgres: privileges and definition)
  -- -------------------------------------------------------------------------

  res := res || jsonb_build_object('c', 'Only signed-in users can execute it: not public, anon or service_role', 'p',
    has_function_privilege('authenticated', 'public.create_goal_with_week_one_plan(text, text, text, jsonb, jsonb, date, date, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.create_goal_with_week_one_plan(text, text, text, jsonb, jsonb, date, date, jsonb)', 'execute')
    and not has_function_privilege('service_role', 'public.create_goal_with_week_one_plan(text, text, text, jsonb, jsonb, date, date, jsonb)', 'execute')
    and not exists (
      select 1 from pg_proc p, aclexplode(p.proacl) acl
      where p.oid = 'public.create_goal_with_week_one_plan(text, text, text, jsonb, jsonb, date, date, jsonb)'::regprocedure
        and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'),
    'd', 'execute privilege checked for authenticated, anon, service_role and public');

  select count(*) into v from pg_proc p
  where p.oid = 'public.create_goal_with_week_one_plan(text, text, text, jsonb, jsonb, date, date, jsonb)'::regprocedure
    and not p.prosecdef
    and exists (select 1 from unnest(p.proconfig) cfg where replace(cfg, ' ', '') in ('search_path=""', 'search_path=')) ;
  res := res || jsonb_build_object('c', 'It runs as the caller (security invoker) with an empty search_path', 'p', v = 1, 'd', format('%s matching definitions', v));

  select count(*) into v from pg_proc p, unnest(p.proargnames) arg
  where p.oid = 'public.create_goal_with_week_one_plan(text, text, text, jsonb, jsonb, date, date, jsonb)'::regprocedure
    and (arg ilike '%user%' or arg ilike '%status%' or arg ilike '%complet%' or arg ilike '%done%' or arg ilike '%week%');
  res := res || jsonb_build_object('c', 'It has no user, status, completion or week parameter', 'p', v = 0, 'd', format('%s such parameters', v));

  -- Postgres itself has no session, so there is no owner to create for.
  begin
    execute format(call_sql, 'no_session', 'No session', 'get_certified', '{}', good_criteria, good_tasks) into gid;
    res := res || jsonb_build_object('c', 'With no signed-in user it refuses', 'p', false, 'd', 'call succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'With no signed-in user it refuses', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;

  -- -------------------------------------------------------------------------
  -- Other roles cannot call it
  -- -------------------------------------------------------------------------

  set local role anon;
  begin
    execute format(call_sql, 'anon_try', 'Anon try', 'get_certified', '{}', good_criteria, good_tasks) into gid;
    res := res || jsonb_build_object('c', 'A signed-out client (anon) cannot call it', 'p', false, 'd', 'call succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A signed-out client (anon) cannot call it', 'p', sqlstate = '42501', 'd', sqlstate);
  end;
  reset role;

  set local role service_role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'service_role')::text, true);
  begin
    execute format(call_sql, 'service_try', 'Service try', 'get_certified', '{}', good_criteria, good_tasks) into gid;
    res := res || jsonb_build_object('c', 'The service role cannot call it, even carrying a user id', 'p', false, 'd', 'call succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'The service role cannot call it, even carrying a user id', 'p', sqlstate = '42501', 'd', sqlstate);
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
  begin
    execute format(call_sql, 'no_sub', 'No sub', 'get_certified', '{}', good_criteria, good_tasks) into gid;
    res := res || jsonb_build_object('c', 'An authenticated token with no user id is refused', 'p', false, 'd', 'call succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'An authenticated token with no user id is refused', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;
  reset role;

  -- -------------------------------------------------------------------------
  -- Signed in as user A: the goal and its tasks arrive together, all unfinished
  -- -------------------------------------------------------------------------

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

  select count(*) into goals_before from public.goal_channels where user_id = a;
  select count(*) into tasks_before from public.micro_tasks where user_id = a;

  execute format(call_sql, 'get_certified', 'Get certified', 'get_certified',
    '{"constraints": ["flexible_hours"], "pace": "lighter"}', good_criteria, good_tasks) into a_goal;
  res := res || jsonb_build_object('c', 'The owner can create a goal with its week 1 tasks in one call', 'p', a_goal is not null, 'd', coalesce(a_goal::text, 'no row'));

  select count(*) into v from public.goal_channels where user_id = a;
  select count(*) into w from public.micro_tasks where goal_channel_id = a_goal;
  res := res || jsonb_build_object('c', 'It created exactly one goal and three tasks', 'p', v = goals_before + 1 and w = 3, 'd', format('%s goals added, %s tasks', v - goals_before, w));

  select count(*) into v from public.goal_channels
  where id = a_goal and user_id = a and goal_type = 'get_certified' and status = 'active' and not is_default
    and preferences = '{"constraints": ["flexible_hours"], "pace": "lighter"}'::jsonb
    and jsonb_array_length(criteria) = 1 and criteria -> 0 ->> 'done' = 'false';
  res := res || jsonb_build_object('c', 'The goal is the user''s, active, not default, with its answers and unticked criteria', 'p', v = 1, 'd', format('%s rows', v));

  select count(*) into v from public.micro_tasks
  where goal_channel_id = a_goal and user_id = a and status = 'todo' and completed_at is null and week_of = 1
    and carried_from_week is null and pulled_from_week is null and source_provider is null;
  res := res || jsonb_build_object('c', 'Every task is the user''s, todo, never completed, in week 1', 'p', v = 3, 'd', format('%s of 3 rows', v));

  select count(*) into v from public.micro_tasks where user_id = a and goal_channel_id = a_goal and status <> 'todo';
  res := res || jsonb_build_object('c', 'No row arrives done', 'p', v = 0, 'd', format('%s done rows', v));

  select string_agg(title, ' | ' order by created_at) into titles from public.micro_tasks where goal_channel_id = a_goal;
  res := res || jsonb_build_object('c', 'The plan keeps its order when read back', 'p',
    titles = 'Pick the exam and book the date | Study the first exam domain | Friday review: tick tasks and fill in notes', 'd', titles);

  -- -------------------------------------------------------------------------
  -- Anything wrong rolls the whole call back: no goal, no tasks
  -- -------------------------------------------------------------------------
  -- Each case is a separate call. After it, user A must have exactly the goals and tasks they had before.

  select count(*) into goals_before from public.goal_channels where user_id = a;
  select count(*) into tasks_before from public.micro_tasks where user_id = a;

  for c in
    select * from jsonb_array_elements($cases$[
      {"n": "a task carrying a status", "s": "22023",
       "t": [{"title": "A", "task_type": "build", "minutes": 10, "status": "done"}]},
      {"n": "a task carrying a completion time", "s": "22023",
       "t": [{"title": "A", "task_type": "build", "minutes": 10, "completed_at": "2026-10-23T00:00:00Z"}]},
      {"n": "a task carrying a week", "s": "22023",
       "t": [{"title": "A", "task_type": "build", "minutes": 10, "week_of": 3}]},
      {"n": "a task carrying a user id", "s": "22023",
       "t": [{"title": "A", "task_type": "build", "minutes": 10, "user_id": "00000000-0000-4000-8000-000000000000"}]},
      {"n": "a task that is not an object", "s": "22023", "t": ["A task as a bare string"]},
      {"n": "an empty plan", "s": "22023", "t": []},
      {"n": "a plan that is not an array", "s": "22023", "t": {"title": "A", "task_type": "build", "minutes": 10}},
      {"n": "more than 100 tasks", "s": "22023",
       "t": "GENERATED"},
      {"n": "an unknown task type in the second task (goal already inserted)", "s": "23514",
       "t": [{"title": "A", "task_type": "build", "minutes": 10}, {"title": "B", "task_type": "meditate", "minutes": 10}]},
      {"n": "a blank title in the last task", "s": "23514",
       "t": [{"title": "A", "task_type": "build", "minutes": 10}, {"title": "B", "task_type": "build", "minutes": 10}, {"title": "  ", "task_type": "build", "minutes": 10}]},
      {"n": "zero minutes in the second task", "s": "23514",
       "t": [{"title": "A", "task_type": "build", "minutes": 10}, {"title": "B", "task_type": "build", "minutes": 0}]},
      {"n": "a task with no title", "s": "23502",
       "t": [{"title": "A", "task_type": "build", "minutes": 10}, {"task_type": "build", "minutes": 10}]},
      {"n": "minutes that are not a number", "s": "22P02",
       "t": [{"title": "A", "task_type": "build", "minutes": 10}, {"title": "B", "task_type": "build", "minutes": "lots"}]},
      {"n": "a ticked criterion on the new goal", "s": "23514", "c": [{"key": "a", "label": "A", "done": true}],
       "t": [{"title": "A", "task_type": "build", "minutes": 10}]},
      {"n": "an unknown preference", "s": "23514", "p": {"theme": "dark"},
       "t": [{"title": "A", "task_type": "build", "minutes": 10}]},
      {"n": "an unknown pace", "s": "23514", "p": {"pace": "turbo"},
       "t": [{"title": "A", "task_type": "build", "minutes": 10}]},
      {"n": "an unknown goal type", "s": "23514", "g": "become_a_wizard",
       "t": [{"title": "A", "task_type": "build", "minutes": 10}]},
      {"n": "a channel key that is already taken", "s": "23505", "k": "get_certified",
       "t": [{"title": "A", "task_type": "build", "minutes": 10}]}
    ]$cases$::jsonb)
  loop
    begin
      execute format(call_sql,
        coalesce(c ->> 'k', 'case_' || md5(c ->> 'n')),
        'Case',
        coalesce(c ->> 'g', 'get_certified'),
        coalesce((c -> 'p')::text, '{}'),
        coalesce((c -> 'c')::text, good_criteria),
        case when c ->> 't' = 'GENERATED'
             then (select jsonb_agg(jsonb_build_object('title', 'T' || i, 'task_type', 'build', 'minutes', 5))::text from generate_series(1, 101) i)
             else (c -> 't')::text end
      ) into gid;
      pass := false;
      detail := 'call succeeded';
    exception when others then
      pass := sqlstate = c ->> 's';
      detail := sqlstate || ' ' || left(sqlerrm, 80);
    end;
    res := res || jsonb_build_object('c', 'Rejected: ' || (c ->> 'n'), 'p', pass, 'd', detail);
  end loop;

  select count(*) into v from public.goal_channels where user_id = a;
  select count(*) into w from public.micro_tasks where user_id = a;
  res := res || jsonb_build_object('c', 'After every failed call the user has the same goals and tasks as before', 'p',
    v = goals_before and w = tasks_before, 'd', format('goals %s -> %s, tasks %s -> %s', goals_before, v, tasks_before, w));

  select count(*) into v from public.micro_tasks where user_id = a and status <> 'todo';
  res := res || jsonb_build_object('c', 'Still no row done', 'p', v = 0, 'd', format('%s done rows', v));

  -- A named argument that is not in the signature cannot smuggle in an owner.
  begin
    execute format('select id from public.create_goal_with_week_one_plan(p_channel_key := %L, p_title := %L, p_goal_type := %L, p_preferences := %L::jsonb, p_criteria := %L::jsonb, p_start_date := current_date, p_target_date := current_date + 90, p_tasks := %L::jsonb, p_user_id := %L)',
      'smuggle', 'Smuggle', 'get_certified', '{}', good_criteria, good_tasks, b) into gid;
    res := res || jsonb_build_object('c', 'There is no way to pass a user id', 'p', false, 'd', 'call succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'There is no way to pass a user id', 'p', sqlstate = '42883', 'd', sqlstate);
  end;

  -- -------------------------------------------------------------------------
  -- Signed in as user B: users stay separate
  -- -------------------------------------------------------------------------

  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);

  select count(*) into v from public.goal_channels where id = a_goal;
  select count(*) into w from public.micro_tasks where goal_channel_id = a_goal;
  res := res || jsonb_build_object('c', 'B cannot see A''s new goal or its tasks', 'p', v = 0 and w = 0, 'd', format('%s goals, %s tasks visible', v, w));

  -- New in MOM-19: B signed up empty, so a wizard goal titled "Career pivot" gets the plain key career_pivot.
  -- Before 010 the signup seed already held that key, and the wizard's retry gave career_pivot_2.
  select count(*) into v from public.goal_channels where user_id = b;
  res := res || jsonb_build_object('c', 'A fresh account has no goals before its first wizard goal', 'p', v = 0, 'd', format('%s goals', v));

  detail := null; -- the rejection loop above left its last message here
  begin
    execute format(call_sql, 'career_pivot', 'Career pivot', 'career_pivot', '{}', good_criteria, good_tasks) into gid;
  exception when others then
    gid := null;
    detail := sqlstate || ' ' || sqlerrm;
  end;
  select count(*), min(channel_key) into v, t from public.goal_channels where user_id = b;
  select count(*) into w from public.micro_tasks where goal_channel_id = gid and user_id = b and status = 'todo' and week_of = 1;
  res := res || jsonb_build_object('c', 'A wizard Career pivot goal on a fresh account gets exactly the key career_pivot', 'p',
    gid is not null and v = 1 and t = 'career_pivot' and w = 3, 'd', coalesce(detail, format('%s goal, key %s, %s tasks', v, t, w)));

  -- The same key as A's goal is fine: keys are per user.
  execute format(call_sql, 'get_certified', 'Get certified', 'get_certified', '{}', good_criteria, good_tasks) into b_goal;
  select count(*) into v from public.goal_channels where id = b_goal and user_id = b;
  select count(*) into w from public.micro_tasks where goal_channel_id = b_goal and user_id = b and status = 'todo' and week_of = 1;
  res := res || jsonb_build_object('c', 'B''s call creates B''s own goal and tasks, even with the same key as A''s', 'p', v = 1 and w = 3, 'd', format('%s goals, %s tasks', v, w));

  -- Another user's channel is refused: B cannot attach a task to A's goal, or write one as A.
  begin
    insert into public.micro_tasks (user_id, goal_channel_id, title, task_type, minutes, week_of)
    values (b, a_goal, 'Into A''s goal', 'build', 10, 1);
    res := res || jsonb_build_object('c', 'B cannot add a task to A''s goal', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'B cannot add a task to A''s goal', 'p', sqlstate = '23503', 'd', sqlstate || ' ' || sqlerrm);
  end;

  begin
    insert into public.micro_tasks (user_id, goal_channel_id, title, task_type, minutes, week_of)
    values (a, a_goal, 'As A', 'build', 10, 1);
    res := res || jsonb_build_object('c', 'B cannot write a task as A', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'B cannot write a task as A', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;

  reset role;
  select count(*) into v from public.micro_tasks where goal_channel_id = a_goal and user_id = a;
  select count(*) into w from public.goal_channels where user_id = a and id <> a_goal and channel_key like 'case\_%';
  res := res || jsonb_build_object('c', 'A''s goal still has exactly its three tasks, and no failed case left a goal', 'p', v = 3 and w = 0, 'd', format('%s tasks, %s leftover goals', v, w));

  -- -------------------------------------------------------------------------
  -- Cleanup (as postgres)
  -- -------------------------------------------------------------------------

  perform set_config('request.jwt.claims', '', true);
  delete from auth.users where id in (a, b);
  select (select count(*) from public.goal_channels where user_id in (a, b))
       + (select count(*) from public.micro_tasks where user_id in (a, b))
    into v;
  res := res || jsonb_build_object('c', 'Deleting an account removes its plan goals and tasks', 'p', v = 0, 'd', format('%s rows left', v));

  insert into mom35_results (n, check_name, passed, detail)
  select ord, e ->> 'c', (e ->> 'p')::boolean, e ->> 'd'
  from jsonb_array_elements(res) with ordinality as x(e, ord);
end;
$$;

select * from mom35_results order by n;
