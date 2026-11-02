-- Verification for supabase/migrations/022_cache_tokens.sql (MOM-165).
-- Run in the Supabase SQL Editor or with `npm run verify:sql` (local) or `supabase db query --linked -f` (hosted).
-- Safe to re-run, and safe against production: it creates two throwaway auth users, writes only their usage rows, and
-- deletes the users at the end (which removes every row they own). Any unexpected error rolls back the whole block.
--
-- What it proves: the two cache-token columns exist as nullable integers with no default (the database assumes nothing);
-- the check keeps them with the other token counts (both or neither, never negative, never without input and output
-- tokens, never on a pending row; the check that must be able to fail: drop llm_usage_logs_cache_tokens_check and the
-- four "is rejected" checks fail); a finishing update can carry all four counts, or none; a finished row still cannot
-- change; the access 011 set did not move (a person reads only their own rows, only the service role writes, nobody
-- else reads the owner's view); and the owner's daily view now carries the two sums.

drop table if exists pg_temp.mom165_results;
create temp table mom165_results (n int, check_name text, passed boolean, detail text);

-- Runs one statement as the current role and returns 'ok' or the SQLSTATE of the error.
create or replace function pg_temp.mom165_state(stmt text) returns text
language plpgsql as $$
begin
  execute stmt;
  return 'ok';
exception when others then
  return sqlstate;
end;
$$;

-- One result row.
create or replace function pg_temp.mom165_c(name text, passed boolean, detail text default '') returns jsonb
language sql as $$
  select jsonb_build_object('c', name, 'p', coalesce(passed, false), 'd', coalesce(detail, ''));
$$;

do $$
declare
  a      uuid := gen_random_uuid();   -- owns the usage rows the checks write
  b      uuid := gen_random_uuid();   -- another person, who must not see a's rows
  r      jsonb;
  s      text;
  v      bigint;
  w      bigint;
  v_after int;
  w_after int;
  n_left int;
  res    jsonb := '[]';
begin
  insert into auth.users (id, email)
  values (a, 'mom165-verify-a@example.invalid'), (b, 'mom165-verify-b@example.invalid');

  -- -------------------------------------------------------------------------
  -- The columns (as postgres)
  -- -------------------------------------------------------------------------

  select string_agg(column_name || ':' || data_type || ':' || is_nullable, ', ' order by column_name) into s
  from information_schema.columns
  where table_schema = 'public' and table_name = 'llm_usage_logs' and column_name in ('cache_read_tokens', 'cache_write_tokens');
  res := res || pg_temp.mom165_c('Both cache columns exist as nullable integers',
    s = 'cache_read_tokens:integer:YES, cache_write_tokens:integer:YES', s);

  select string_agg(column_name, ', ' order by column_name) into s
  from information_schema.columns
  where table_schema = 'public' and table_name = 'llm_usage_logs'
    and column_name in ('cache_read_tokens', 'cache_write_tokens') and column_default is not null;
  res := res || pg_temp.mom165_c('Neither has a database default: "not reported" is never guessed as 0', s is null, coalesce(s, 'no defaults'));

  select count(*) into v from pg_constraint
  where conrelid = 'public.llm_usage_logs'::regclass and conname = 'llm_usage_logs_cache_tokens_check';
  res := res || pg_temp.mom165_c('The cache check exists', v = 1, format('%s constraints', v));

  -- 011's three token checks are still there, unchanged in name.
  select count(*) into v from pg_constraint
  where conrelid = 'public.llm_usage_logs'::regclass
    and conname in ('llm_usage_logs_tokens_check', 'llm_usage_logs_latency_check', 'llm_usage_logs_finished_check');
  res := res || pg_temp.mom165_c('011''s token, latency and finished checks are still in place', v = 3, format('%s of 3', v));

  -- -------------------------------------------------------------------------
  -- Writing (as the service role, the only role that writes)
  -- -------------------------------------------------------------------------

  set local role service_role;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

  -- The real path: reserve a call, then finish it with all four counts.
  r := public.reserve_llm_call(a, 'setup', 'test-model', 1, 1000000, 1000000);
  s := pg_temp.mom165_state(format(
    $q$update public.llm_usage_logs set outcome = 'ok', latency_ms = 10, input_tokens = 2000, output_tokens = 300, cache_read_tokens = 1500, cache_write_tokens = 400 where id = %L and user_id = %L$q$,
    r ->> 'log_id', a));
  res := res || pg_temp.mom165_c('A setup call is reserved and finished with all four token counts',
    coalesce((r ->> 'allowed')::boolean, false) and s = 'ok', format('%s / %s', r::text, s));

  select count(*) into v from public.llm_usage_logs
  where id = (r ->> 'log_id')::uuid and input_tokens = 2000 and output_tokens = 300 and cache_read_tokens = 1500 and cache_write_tokens = 400;
  res := res || pg_temp.mom165_c('The row carries input, output, cache-read and cache-write tokens', v = 1, format('%s rows', v));

  s := pg_temp.mom165_state(format($q$update public.llm_usage_logs set cache_read_tokens = 1 where id = %L and user_id = %L$q$, r ->> 'log_id', a));
  res := res || pg_temp.mom165_c('A finished row still cannot change', s = '23514', s);

  -- Not reported: input and output set, both cache counts null.
  s := pg_temp.mom165_state(format(
    $q$insert into public.llm_usage_logs (user_id, feature, model, outcome, latency_ms, input_tokens, output_tokens) values (%L, 'setup', 'm', 'ok', 5, 10, 20)$q$, a));
  res := res || pg_temp.mom165_c('A row with input and output tokens and no cache counts is accepted (not reported)', s = 'ok', s);

  -- Zero is a real report, and is kept as 0.
  s := pg_temp.mom165_state(format(
    $q$insert into public.llm_usage_logs (user_id, feature, model, outcome, latency_ms, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens) values (%L, 'setup', 'm', 'ok', 5, 10, 20, 0, 0)$q$, a));
  res := res || pg_temp.mom165_c('Zero cache tokens are accepted and kept as 0', s = 'ok', s);

  -- A call that got no answer at all: no tokens of any kind.
  s := pg_temp.mom165_state(format(
    $q$insert into public.llm_usage_logs (user_id, feature, model, outcome, latency_ms) values (%L, 'setup', 'm', 'unavailable', 5)$q$, a));
  res := res || pg_temp.mom165_c('A call with no answer carries no tokens of any kind', s = 'ok', s);

  -- The four that must be rejected.
  s := pg_temp.mom165_state(format(
    $q$insert into public.llm_usage_logs (user_id, feature, model, outcome, latency_ms, input_tokens, output_tokens, cache_read_tokens) values (%L, 'setup', 'm', 'ok', 5, 10, 20, 7)$q$, a));
  res := res || pg_temp.mom165_c('A cache-read count without a cache-write count is rejected', s = '23514', s);

  s := pg_temp.mom165_state(format(
    $q$insert into public.llm_usage_logs (user_id, feature, model, outcome, latency_ms, input_tokens, output_tokens, cache_write_tokens) values (%L, 'setup', 'm', 'ok', 5, 10, 20, 7)$q$, a));
  res := res || pg_temp.mom165_c('A cache-write count without a cache-read count is rejected', s = '23514', s);

  s := pg_temp.mom165_state(format(
    $q$insert into public.llm_usage_logs (user_id, feature, model, outcome, latency_ms, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens) values (%L, 'setup', 'm', 'ok', 5, 10, 20, -1, 0)$q$, a));
  res := res || pg_temp.mom165_c('A negative cache count is rejected', s = '23514', s);

  s := pg_temp.mom165_state(format(
    $q$insert into public.llm_usage_logs (user_id, feature, model, outcome, latency_ms, cache_read_tokens, cache_write_tokens) values (%L, 'setup', 'm', 'ok', 5, 3, 4)$q$, a));
  res := res || pg_temp.mom165_c('Cache counts without input and output tokens are rejected', s = '23514', s);

  -- A pending row has no tokens yet, cache tokens included.
  s := pg_temp.mom165_state(format(
    $q$insert into public.llm_usage_logs (user_id, feature, model, cache_read_tokens, cache_write_tokens) values (%L, 'setup', 'm', 3, 4)$q$, a));
  res := res || pg_temp.mom165_c('A pending row cannot carry cache tokens', s = '23514', s);

  -- -------------------------------------------------------------------------
  -- The owner's daily view (service role)
  -- -------------------------------------------------------------------------

  select coalesce(sum(cache_read_tokens), 0), coalesce(sum(cache_write_tokens), 0) into v, w
  from public.llm_usage_daily where feature = 'setup';
  res := res || pg_temp.mom165_c('The daily view sums the cache tokens',
    v >= 1500 and w >= 400
      and v = (select coalesce(sum(cache_read_tokens), 0) from public.llm_usage_logs where feature = 'setup')
      and w = (select coalesce(sum(cache_write_tokens), 0) from public.llm_usage_logs where feature = 'setup'),
    format('read %s, write %s', v, w));

  -- -------------------------------------------------------------------------
  -- Access did not move (as signed-in people and as anon)
  -- -------------------------------------------------------------------------

  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select count(*) into v from public.llm_usage_logs where cache_read_tokens = 1500 and cache_write_tokens = 400;
  res := res || pg_temp.mom165_c('A person reads the cache counts on their own rows', v = 1, format('%s rows', v));

  s := pg_temp.mom165_state(format($q$update public.llm_usage_logs set cache_read_tokens = 0 where user_id = %L$q$, a));
  res := res || pg_temp.mom165_c('A signed-in person cannot write usage, cache counts included', s = '42501', s);

  s := pg_temp.mom165_state($q$select count(*) from public.llm_usage_daily$q$);
  res := res || pg_temp.mom165_c('A signed-in person cannot read the owner''s daily view', s = '42501', s);

  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into v from public.llm_usage_logs where user_id = a;
  res := res || pg_temp.mom165_c('Another person sees none of those rows', v = 0, format('%s rows', v));

  reset role;
  set local role anon;
  perform set_config('request.jwt.claims', '', true);
  s := pg_temp.mom165_state($q$select cache_read_tokens from public.llm_usage_logs$q$);
  res := res || pg_temp.mom165_c('A signed-out client cannot read the table', s = '42501', s);

  -- -------------------------------------------------------------------------
  -- Removal (as postgres): the throwaway accounts take every row with them
  -- -------------------------------------------------------------------------

  reset role;
  perform set_config('request.jwt.claims', '', true);

  select count(*) into v from public.llm_usage_logs where user_id in (a, b);
  delete from auth.users where id in (a, b);
  select count(*) into w_after from public.llm_usage_logs where user_id in (a, b);
  select count(*) into n_left from auth.users where email like 'mom165-verify-%';
  res := res || pg_temp.mom165_c('Deleting the accounts removes their usage rows and leaves nothing behind',
    v > 0 and w_after = 0 and n_left = 0,
    format('%s usage rows before; %s after; %s throwaway users left', v, w_after, n_left));

  insert into mom165_results (n, check_name, passed, detail)
  select ord, e ->> 'c', (e ->> 'p')::boolean, e ->> 'd'
  from jsonb_array_elements(res) with ordinality as x (e, ord);
end;
$$;

select * from mom165_results order by n;
