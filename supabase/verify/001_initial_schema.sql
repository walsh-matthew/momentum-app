-- Verification for supabase/migrations/001_initial_schema.sql (MOM-9).
-- Run in the Supabase SQL Editor. Safe to re-run.
-- Creates two throwaway auth users, checks that signup starts them empty (MOM-19), seeds Career Pivot for each
-- explicitly as postgres to test the seed function and RLS as each, then deletes them.
-- Leaves no data behind: the users are deleted at the end, and an unexpected error rolls back the whole block.

drop table if exists pg_temp.mom9_results;
create temp table mom9_results (n int, check_name text, passed boolean, detail text);

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  a_channel uuid;
  b_channel uuid;
  a_task uuid;
  a_task_2 uuid;
  v int;
  w int;
  x int;
  t text;
  res jsonb := '[]';
begin
  -- -------------------------------------------------------------------------
  -- Signup trigger (as postgres), then the seed function called by hand
  -- -------------------------------------------------------------------------

  -- Was "every existing account has a users row and Career Pivot". Signup no longer seeds (migration 010), so an
  -- account created after it has no channel; the users row is what every account has.
  select count(*) into v from auth.users;
  select count(*) into w from auth.users u
  where exists (select 1 from public.users p where p.id = u.id);
  res := res || jsonb_build_object('c', 'Backfill: every existing account has a users row', 'p', v = w, 'd', format('%s of %s', w, v));

  insert into auth.users (id, email)
  values (a, 'mom9-verify-a@example.invalid'), (b, 'mom9-verify-b@example.invalid');

  select count(*) into v from public.users where id in (a, b);
  res := res || jsonb_build_object('c', 'Signup trigger creates users rows', 'p', v = 3, 'd', format('%s of 2', v));

  -- New in MOM-19: a fresh signup starts empty.
  select count(*) into v from public.goal_channels where user_id in (a, b);
  select count(*) into w from public.micro_tasks where user_id in (a, b);
  select count(*) into x from public.task_rebalance_history where user_id in (a, b);
  res := res || jsonb_build_object('c', 'A fresh signup has no goal channels, tasks or history rows', 'p', v = 0 and w = 0 and x = 0,
    'd', format('%s channels, %s tasks, %s history rows', v, w, x));

  -- New in MOM-19: the signup trigger function creates the users row and nothing else.
  select count(*) into v from pg_proc p
  where p.oid = 'public.handle_new_user()'::regprocedure
    and p.prosecdef
    and exists (select 1 from unnest(p.proconfig) cfg where replace(cfg, ' ', '') in ('search_path=""', 'search_path='))
    and p.prosrc not ilike '%seed%'
    and p.prosrc ilike '%insert into public.users%';
  res := res || jsonb_build_object('c', 'handle_new_user inserts the users row only: security definer, empty search_path, no seed call', 'p', v = 1, 'd', format('%s matching definitions', v));

  -- New in MOM-19: the seed function stays for dev seeding, and the API still cannot run it.
  res := res || jsonb_build_object('c', 'seed_career_pivot still exists but anon and signed-in users cannot execute it', 'p',
    exists (select 1 from pg_proc where oid = 'public.seed_career_pivot(uuid)'::regprocedure)
    and not has_function_privilege('anon', 'public.seed_career_pivot(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.seed_career_pivot(uuid)', 'execute'),
    'd', 'execute privilege checked for anon and authenticated');

  -- The seed is now an explicit step, as in a dev environment: postgres seeds each throwaway account.
  perform public.seed_career_pivot(a);
  perform public.seed_career_pivot(b);

  select count(*) into v from public.goal_channels
  where user_id in (a, b) and channel_key = 'career_pivot' and title = 'Career Pivot' and status = 'active' and is_default;
  res := res || jsonb_build_object('c', 'One active default Career Pivot channel per user', 'p', v = 2, 'd', format('%s of 2', v));

  select id into a_channel from public.goal_channels where user_id = a;
  select id into b_channel from public.goal_channels where user_id = b;

  select jsonb_array_length(criteria),
         (select count(*) from jsonb_array_elements(criteria) e where (e ->> 'done')::boolean)
    into v, w
  from public.goal_channels where id = a_channel;
  res := res || jsonb_build_object('c', '7 criteria, none ticked', 'p', v = 7 and w = 0, 'd', format('%s criteria, %s ticked', v, w));

  select count(*) into v from public.goal_channels
  where id = a_channel and start_date = current_date - 7 and target_date = start_date + 90;
  res := res || jsonb_build_object('c', 'Start date puts user in week 2; target is start + 90 days', 'p', v = 1, 'd', '');

  select count(*), count(*) filter (where status <> 'todo' or completed_at is not null)
    into v, w
  from public.micro_tasks where user_id = a;
  res := res || jsonb_build_object('c', '11 seeded tasks, all todo', 'p', v = 11 and w = 0, 'd', format('%s tasks, %s not todo', v, w));

  select string_agg(format('w%s:%s', week_of, n), ' ' order by week_of) into t
  from (select week_of, count(*) n from public.micro_tasks where user_id = a group by week_of) s;
  res := res || jsonb_build_object('c', 'Tasks by week: 7 in week 2, 2 in week 3, 2 in week 4', 'p', t = 'w2:7 w3:2 w4:2', 'd', t);

  select count(*) into v from public.micro_tasks
  where user_id = a and task_type = 'certify' and week_of = 3 and carried_from_week = 2;
  res := res || jsonb_build_object('c', 'Carry-over record: certify task in week 3, carried from week 2', 'p', v = 1, 'd', format('%s found', v));

  perform public.seed_career_pivot(a);
  select count(*) into v from public.goal_channels where user_id = a;
  select count(*) into w from public.micro_tasks where user_id = a;
  res := res || jsonb_build_object('c', 'Seed is idempotent', 'p', v = 1 and w = 11, 'd', format('%s channels, %s tasks after re-run', v, w));

  select id into a_task from public.micro_tasks where user_id = a and task_type = 'build' and week_of = 2;
  select id into a_task_2 from public.micro_tasks where user_id = a and task_type = 'learn';

  -- -------------------------------------------------------------------------
  -- RLS and constraints, signed in as user A
  -- -------------------------------------------------------------------------

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

  select (select count(*) from public.users),
         (select count(*) from public.goal_channels) + (select count(*) from public.micro_tasks)
    into v, w;
  res := res || jsonb_build_object('c', 'A sees only own rows (1 user, 1 channel + 11 tasks)', 'p', v = 1 and w = 12, 'd', format('users %s, channel+tasks %s', v, w));

  update public.micro_tasks set minutes = 99 where user_id = b;
  get diagnostics v = row_count;
  res := res || jsonb_build_object('c', 'A cannot update B''s tasks', 'p', v = 0, 'd', format('%s rows changed', v));

  delete from public.goal_channels where user_id = b;
  get diagnostics v = row_count;
  res := res || jsonb_build_object('c', 'A cannot delete B''s channel', 'p', v = 0, 'd', format('%s rows deleted', v));

  begin
    insert into public.micro_tasks (user_id, goal_channel_id, title, task_type, minutes, week_of)
    values (b, b_channel, 'x', 'build', 10, 1);
    res := res || jsonb_build_object('c', 'A cannot insert a task owned by B', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A cannot insert a task owned by B', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;

  begin
    update public.micro_tasks set user_id = b where id = a_task;
    res := res || jsonb_build_object('c', 'A cannot hand own task to B', 'p', false, 'd', 'update succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A cannot hand own task to B', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;

  begin
    insert into public.micro_tasks (user_id, goal_channel_id, title, task_type, minutes, week_of)
    values (a, b_channel, 'x', 'build', 10, 1);
    res := res || jsonb_build_object('c', 'A cannot attach own task to B''s channel', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A cannot attach own task to B''s channel', 'p', sqlstate = '23503', 'd', sqlstate || ' ' || sqlerrm);
  end;

  begin
    insert into public.micro_tasks (user_id, goal_channel_id, title, task_type, minutes, week_of)
    values (a, a_channel, 'x', 'Build', 10, 1);
    res := res || jsonb_build_object('c', 'Non-lowercase task_type rejected', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'Non-lowercase task_type rejected', 'p', sqlstate = '23514', 'd', sqlstate || ' ' || sqlerrm);
  end;

  begin
    insert into public.micro_tasks (user_id, goal_channel_id, title, task_type, minutes, week_of, carried_from_week)
    values (a, a_channel, 'x', 'build', 10, 2, 3);
    res := res || jsonb_build_object('c', 'carried_from_week must be earlier than week_of', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'carried_from_week must be earlier than week_of', 'p', sqlstate = '23514', 'd', sqlstate || ' ' || sqlerrm);
  end;

  begin
    update public.micro_tasks set status = 'done' where id = a_task_2;
    res := res || jsonb_build_object('c', 'done requires completed_at', 'p', false, 'd', 'update succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'done requires completed_at', 'p', sqlstate = '23514', 'd', sqlstate || ' ' || sqlerrm);
  end;

  begin
    delete from public.goal_channels where id = a_channel;
    res := res || jsonb_build_object('c', 'Channel with tasks cannot be deleted (never cut work)', 'p', false, 'd', 'delete succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'Channel with tasks cannot be deleted (never cut work)', 'p', sqlstate = '23503', 'd', sqlstate || ' ' || sqlerrm);
  end;

  begin
    perform public.seed_career_pivot(a);
    res := res || jsonb_build_object('c', 'Signed-in users cannot call seed_career_pivot', 'p', false, 'd', 'call succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'Signed-in users cannot call seed_career_pivot', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;

  -- New in MOM-19: the signup trigger function is a trigger function, so calling it by hand does nothing
  -- (its EXECUTE grants are a separate question, MOM-65).
  begin
    perform public.handle_new_user();
    res := res || jsonb_build_object('c', 'handle_new_user cannot be run by hand by a signed-in user', 'p', false, 'd', 'call succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'handle_new_user cannot be run by hand by a signed-in user', 'p', sqlstate in ('0A000', '42501'), 'd', sqlstate || ' ' || sqlerrm);
  end;

  update public.micro_tasks set status = 'done', completed_at = now() where id = a_task;
  get diagnostics v = row_count;
  res := res || jsonb_build_object('c', 'A can tick own task done', 'p', v = 1, 'd', format('%s rows changed', v));

  insert into public.connected_apps (user_id, provider, is_active, goal_channel_id)
  values (a, 'hevy', true, a_channel);
  get diagnostics v = row_count;
  res := res || jsonb_build_object('c', 'A can add own connected app', 'p', v = 1, 'd', format('%s rows inserted', v));

  -- -------------------------------------------------------------------------
  -- Cleanup (as postgres)
  -- -------------------------------------------------------------------------

  reset role;
  perform set_config('request.jwt.claims', '', true);

  delete from auth.users where id in (a, b);
  select (select count(*) from public.users where id in (a, b))
       + (select count(*) from public.goal_channels where user_id in (a, b))
       + (select count(*) from public.micro_tasks where user_id in (a, b))
       + (select count(*) from public.connected_apps where user_id in (a, b))
    into v;
  res := res || jsonb_build_object('c', 'Deleting an account cascades to all its rows', 'p', v = 0, 'd', format('%s rows left', v));

  insert into mom9_results (n, check_name, passed, detail)
  select ord, e ->> 'c', (e ->> 'p')::boolean, e ->> 'd'
  from jsonb_array_elements(res) with ordinality as x(e, ord);
end;
$$;

select * from mom9_results order by n;
