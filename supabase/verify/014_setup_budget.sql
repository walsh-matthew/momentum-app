-- Verification for supabase/migrations/014_setup_budget.sql (MOM-128).
-- Run in the Supabase SQL Editor or with `npm run verify:sql` (local) or `supabase db query --linked -f` (hosted).
-- Safe to re-run, and safe against production: it creates two throwaway auth users, writes only their rows, and deletes
-- the users at the end (which removes every row they own). Any unexpected error rolls back the whole block.
--
-- What it proves: a goal that is not parked still needs a shape AND a start date (the check that must be able to fail:
-- remove goals_shape_start_required and the first three checks fail); a parked goal does not; a goal with no shape
-- cannot carry an end date or a first-block length (a CHECK that evaluates to NULL passes, so these are the traps); a
-- parked goal cannot come back without both; and the usage log takes 'setup' and still refuses anything else.

drop table if exists pg_temp.mom128_results;
create temp table mom128_results (n int, check_name text, passed boolean, detail text);

-- Runs one statement as the current role and returns 'ok' or the SQLSTATE of the error.
create or replace function pg_temp.mom128_state(stmt text) returns text
language plpgsql as $$
begin
  execute stmt;
  return 'ok';
exception when others then
  return sqlstate;
end;
$$;

-- One result row.
create or replace function pg_temp.mom128_c(name text, passed boolean, detail text default '') returns jsonb
language sql as $$
  select jsonb_build_object('c', name, 'p', coalesce(passed, false), 'd', coalesce(detail, ''));
$$;

do $$
declare
  a      uuid := gen_random_uuid();   -- owns the goals
  y      uuid := gen_random_uuid();   -- owns the usage rows
  gp     uuid := gen_random_uuid();   -- a parked goal with neither shape nor start date
  s      text;
  v      int;
  w      int;
  v_after int;
  w_after int;
  n_left int;
  r      jsonb;
  res    jsonb := '[]';
begin
  insert into auth.users (id, email)
  values (a, 'mom128-verify-a@example.invalid'), (y, 'mom128-verify-y@example.invalid');

  -- -------------------------------------------------------------------------
  -- The columns
  -- -------------------------------------------------------------------------

  select string_agg(column_name || '=' || is_nullable, ', ' order by column_name) into s
  from information_schema.columns
  where table_schema = 'public' and table_name = 'goals' and column_name in ('shape', 'start_date');
  res := res || pg_temp.mom128_c('A goal''s shape and start date can be null in the table', s = 'shape=YES, start_date=YES', s);

  select string_agg(column_name, ', ' order by column_name) into s
  from information_schema.columns
  where table_schema = 'public' and table_name = 'goals' and column_name in ('shape', 'start_date') and column_default is not null;
  res := res || pg_temp.mom128_c('Neither has a database default: the database assumes nothing', s is null, coalesce(s, 'no defaults'));

  -- -------------------------------------------------------------------------
  -- A goal that is not parked still needs both
  -- -------------------------------------------------------------------------

  s := pg_temp.mom128_state(format($q$insert into public.goals (user_id, title, start_date) values (%L, 'g', date '2026-01-05')$q$, a));
  res := res || pg_temp.mom128_c('An active goal without a shape is rejected', s = '23514', s);

  s := pg_temp.mom128_state(format($q$insert into public.goals (user_id, title, shape) values (%L, 'g', 'ongoing')$q$, a));
  res := res || pg_temp.mom128_c('An active goal without a start date is rejected', s = '23514', s);

  s := pg_temp.mom128_state(format($q$insert into public.goals (user_id, title) values (%L, 'g')$q$, a));
  res := res || pg_temp.mom128_c('An active goal with neither is rejected', s = '23514', s);

  s := pg_temp.mom128_state(format($q$insert into public.goals (user_id, title, start_date, shape) values (%L, 'g', date '2026-01-05', 'ongoing')$q$, a));
  res := res || pg_temp.mom128_c('An active goal with both is saved', s = 'ok', s);

  s := pg_temp.mom128_state(format($q$update public.goals set shape = null where user_id = %L and title = 'g'$q$, a));
  res := res || pg_temp.mom128_c('An active goal cannot have its shape taken away', s = '23514', s);

  s := pg_temp.mom128_state(format($q$update public.goals set start_date = null where user_id = %L and title = 'g'$q$, a));
  res := res || pg_temp.mom128_c('An active goal cannot have its start date taken away', s = '23514', s);

  -- -------------------------------------------------------------------------
  -- A parked goal does not
  -- -------------------------------------------------------------------------

  insert into public.goals (id, user_id, title, state, return_kind) values (gp, a, 'Set aside', 'parked', 'on_request');
  select count(*) into v from public.goals where id = gp and shape is null and start_date is null;
  res := res || pg_temp.mom128_c('A parked goal saves with no shape and no start date', v = 1, format('%s rows', v));

  s := pg_temp.mom128_state(format($q$insert into public.goals (user_id, title, state, return_kind, shape) values (%L, 'p2', 'parked', 'on_request', 'project')$q$, a));
  res := res || pg_temp.mom128_c('A parked goal can have a shape and no start date', s = 'ok', s);

  s := pg_temp.mom128_state(format($q$insert into public.goals (user_id, title, state, return_kind, start_date) values (%L, 'p3', 'parked', 'on_request', date '2026-01-05')$q$, a));
  res := res || pg_temp.mom128_c('A parked goal can have a start date and no shape', s = 'ok', s);

  -- A parked goal still says how it comes back (013 is unchanged).
  s := pg_temp.mom128_state(format($q$insert into public.goals (user_id, title, state) values (%L, 'p4', 'parked')$q$, a));
  res := res || pg_temp.mom128_c('A parked goal still has to say how it comes back', s = '23514', s);

  -- -------------------------------------------------------------------------
  -- The NULL traps: no shape, so no end date and no first-block length
  -- -------------------------------------------------------------------------

  s := pg_temp.mom128_state(format($q$insert into public.goals (user_id, title, state, return_kind, end_date) values (%L, 'p5', 'parked', 'on_request', date '2026-06-01')$q$, a));
  res := res || pg_temp.mom128_c('A goal with no shape cannot have an end date', s = '23514', s);

  s := pg_temp.mom128_state(format($q$insert into public.goals (user_id, title, state, return_kind, block_weeks) values (%L, 'p6', 'parked', 'on_request', 10)$q$, a));
  res := res || pg_temp.mom128_c('A goal with no shape cannot have a first-block length', s = '23514', s);

  -- The three shapes behave as they did in 013.
  s := pg_temp.mom128_state(format($q$insert into public.goals (user_id, title, start_date, shape) values (%L, 'f1', date '2026-01-05', 'finite')$q$, a));
  res := res || pg_temp.mom128_c('A finite goal still needs an end date', s = '23514', s);

  s := pg_temp.mom128_state(format($q$insert into public.goals (user_id, title, start_date, shape, end_date) values (%L, 'o1', date '2026-01-05', 'ongoing', date '2026-06-01')$q$, a));
  res := res || pg_temp.mom128_c('An ongoing goal still has no end date', s = '23514', s);

  s := pg_temp.mom128_state(format($q$insert into public.goals (user_id, title, start_date, shape, end_date, block_weeks) values (%L, 'f2', date '2026-01-05', 'finite', date '2026-06-01', 10)$q$, a));
  res := res || pg_temp.mom128_c('A first-block length still belongs to an ongoing goal only', s = '23514', s);

  s := pg_temp.mom128_state(format($q$insert into public.goals (user_id, title, start_date, shape, block_weeks) values (%L, 'o2', date '2026-01-05', 'ongoing', 10)$q$, a));
  res := res || pg_temp.mom128_c('An ongoing goal can have a first-block length', s = 'ok', s);

  s := pg_temp.mom128_state(format($q$insert into public.goals (user_id, title, start_date, shape) values (%L, 'pr1', date '2026-01-05', 'project')$q$, a));
  res := res || pg_temp.mom128_c('A project may have no deadline', s = 'ok', s);

  s := pg_temp.mom128_state(format($q$insert into public.goals (user_id, title, start_date, shape) values (%L, 'x1', date '2026-01-05', 'forever')$q$, a));
  res := res || pg_temp.mom128_c('An unknown shape is still rejected', s = '23514', s);

  -- -------------------------------------------------------------------------
  -- A parked goal comes back only with both
  -- -------------------------------------------------------------------------

  s := pg_temp.mom128_state(format($q$update public.goals set state = 'active', return_kind = null where id = %L$q$, gp));
  res := res || pg_temp.mom128_c('A parked goal with no shape and start date cannot come back as it is', s = '23514', s);

  s := pg_temp.mom128_state(format($q$update public.goals set state = 'active', return_kind = null, shape = 'ongoing' where id = %L$q$, gp));
  res := res || pg_temp.mom128_c('It cannot come back with a shape alone', s = '23514', s);

  s := pg_temp.mom128_state(format($q$update public.goals set state = 'active', return_kind = null, shape = 'ongoing', start_date = date '2026-02-02' where id = %L$q$, gp));
  res := res || pg_temp.mom128_c('It comes back when the same update gives both', s = 'ok', s);

  -- -------------------------------------------------------------------------
  -- The usage log takes 'setup' (as the service role, the only role that writes)
  -- -------------------------------------------------------------------------

  set local role service_role;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

  r := public.reserve_llm_call(y, 'setup', 'test-model', 1, 1000000, 1000000);
  select count(*) into v from public.llm_usage_logs
  where id = (r ->> 'log_id')::uuid and user_id = y and feature = 'setup' and outcome = 'pending';
  res := res || pg_temp.mom128_c('A setup call can be reserved and is logged under ''setup''', coalesce((r ->> 'allowed')::boolean, false) and v = 1, r::text);

  s := pg_temp.mom128_state(format($q$insert into public.llm_usage_logs (user_id, feature, model, outcome, latency_ms) values (%L, 'setup', 'm', 'ok', 5)$q$, y));
  res := res || pg_temp.mom128_c('A finished setup row can be written', s = 'ok', s);

  s := pg_temp.mom128_state(format($q$insert into public.llm_usage_logs (user_id, feature, model, outcome, latency_ms) values (%L, 'chat', 'm', 'ok', 5)$q$, y));
  res := res || pg_temp.mom128_c('An unknown feature is still rejected', s = '23514', s);

  s := pg_temp.mom128_state(format($q$insert into public.llm_usage_logs (user_id, feature, model, outcome, latency_ms) values (%L, 'rebalance', 'm', 'ok', 5)$q$, y));
  res := res || pg_temp.mom128_c('rebalance is still accepted', s = 'ok', s);

  s := pg_temp.mom128_state(format($q$insert into public.llm_usage_logs (user_id, feature, model, outcome, latency_ms) values (%L, 'week_one_plan', 'm', 'ok', 5)$q$, y));
  res := res || pg_temp.mom128_c('week_one_plan is still accepted', s = 'ok', s);

  select coalesce(sum(calls), 0) into v from public.llm_usage_daily where feature = 'setup';
  select count(*) into w from public.llm_usage_logs where feature = 'setup';
  res := res || pg_temp.mom128_c('The owner''s daily view counts setup calls', v = w and w >= 2, format('view %s, table %s', v, w));

  -- -------------------------------------------------------------------------
  -- Removal (as postgres): the throwaway accounts take every row with them
  -- -------------------------------------------------------------------------

  reset role;
  perform set_config('request.jwt.claims', '', true);

  select count(*) into v from public.goals where user_id in (a, y);
  select count(*) into w from public.llm_usage_logs where user_id in (a, y);
  delete from auth.users where id in (a, y);
  select count(*) into v_after from public.goals where user_id in (a, y);
  select count(*) into w_after from public.llm_usage_logs where user_id in (a, y);
  select count(*) into n_left from auth.users where email like 'mom128-verify-%';
  res := res || pg_temp.mom128_c('Deleting the accounts removes their goals and usage rows and leaves nothing behind',
    v > 0 and w > 0 and v_after = 0 and w_after = 0 and n_left = 0,
    format('%s goals and %s usage rows before; %s and %s after; %s throwaway users left', v, w, v_after, w_after, n_left));

  insert into mom128_results (n, check_name, passed, detail)
  select ord, e ->> 'c', (e ->> 'p')::boolean, e ->> 'd'
  from jsonb_array_elements(res) with ordinality as x (e, ord);
end;
$$;

select * from mom128_results order by n;
