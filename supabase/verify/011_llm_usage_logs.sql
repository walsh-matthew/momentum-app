-- Verification for supabase/migrations/011_llm_usage_logs.sql (MOM-73).
-- Run in the Supabase SQL Editor or with `npm run verify:sql` (local) or `supabase db query --linked -f` (hosted).
-- Safe to re-run. Creates five throwaway auth users, checks the table, its access rules, its constraints and the
-- reserve_llm_call limits as each role, then deletes the users (which removes their usage rows).
-- Leaves no data behind: an unexpected error rolls back the whole block.
--
-- It also works on a database that already holds real usage rows (production): the overall cap is tested against
-- the number of rows in the last 24 hours rather than an assumed number, and the throwaway users' rows are the only
-- ones it writes.

drop table if exists pg_temp.mom73_results;
create temp table mom73_results (n int, check_name text, passed boolean, detail text);

do $$
declare
  a uuid := gen_random_uuid();   -- the user whose own rows are read, and who is made to wait
  b uuid := gen_random_uuid();   -- another user: must not see a's rows
  c uuid := gen_random_uuid();   -- a user with three calls from earlier today, for the daily cap
  d uuid := gen_random_uuid();   -- a user whose only calls are more than 24 hours old
  z uuid := gen_random_uuid();   -- a user whose only call is an hour old, for the shared cap
  y uuid := gen_random_uuid();   -- a user with no calls at all, for the bad-feature check
  r jsonb;
  v int;
  w int;
  s text;
  total int;
  secs int;
  log_a uuid;
  res jsonb := '[]';
begin
  insert into auth.users (id, email)
  values (a, 'mom73-verify-a@example.invalid'), (b, 'mom73-verify-b@example.invalid'),
         (c, 'mom73-verify-c@example.invalid'), (d, 'mom73-verify-d@example.invalid'),
         (z, 'mom73-verify-z@example.invalid'), (y, 'mom73-verify-y@example.invalid');

  -- -------------------------------------------------------------------------
  -- The shape of the table: nothing that could hold a prompt or an answer
  -- -------------------------------------------------------------------------

  select string_agg(column_name, ',' order by ordinal_position) into s
  from information_schema.columns where table_schema = 'public' and table_name = 'llm_usage_logs';
  res := res || jsonb_build_object('c', 'The table has exactly the approved columns', 'p',
    s = 'id,user_id,feature,model,input_tokens,output_tokens,latency_ms,outcome,created_at', 'd', s);

  select string_agg(column_name, ',' order by column_name) into s
  from information_schema.columns
  where table_schema = 'public' and table_name = 'llm_usage_logs' and data_type in ('text', 'character varying', 'character');
  res := res || jsonb_build_object('c', 'The only text columns are feature, model and outcome (no content column)', 'p',
    s = 'feature,model,outcome', 'd', s);

  select count(*) into v
  from information_schema.columns
  where table_schema = 'public' and table_name = 'llm_usage_logs'
    and data_type in ('json', 'jsonb', 'bytea', 'ARRAY', 'xml', 'USER-DEFINED');
  res := res || jsonb_build_object('c', 'There is no json, bytea, array or xml column to carry content', 'p', v = 0, 'd', format('%s such columns', v));

  select relrowsecurity into strict v from (select relrowsecurity::int from pg_class where oid = 'public.llm_usage_logs'::regclass) x;
  res := res || jsonb_build_object('c', 'Row level security is on', 'p', v = 1, 'd', format('relrowsecurity=%s', v));

  -- -------------------------------------------------------------------------
  -- Table privileges
  -- -------------------------------------------------------------------------

  res := res || jsonb_build_object('c', 'anon has no privilege on the table', 'p',
    not (has_table_privilege('anon', 'public.llm_usage_logs', 'select') or has_table_privilege('anon', 'public.llm_usage_logs', 'insert')
      or has_table_privilege('anon', 'public.llm_usage_logs', 'update') or has_table_privilege('anon', 'public.llm_usage_logs', 'delete')),
    'd', 'checked select, insert, update, delete');

  res := res || jsonb_build_object('c', 'authenticated can read the table and nothing else', 'p',
    has_table_privilege('authenticated', 'public.llm_usage_logs', 'select')
      and not (has_table_privilege('authenticated', 'public.llm_usage_logs', 'insert')
        or has_table_privilege('authenticated', 'public.llm_usage_logs', 'update')
        or has_table_privilege('authenticated', 'public.llm_usage_logs', 'delete')),
    'd', 'select only');

  res := res || jsonb_build_object('c', 'service_role can read, insert and update but not delete', 'p',
    has_table_privilege('service_role', 'public.llm_usage_logs', 'select')
      and has_table_privilege('service_role', 'public.llm_usage_logs', 'insert')
      and has_table_privilege('service_role', 'public.llm_usage_logs', 'update')
      and not has_table_privilege('service_role', 'public.llm_usage_logs', 'delete'),
    'd', 'select, insert, update');

  res := res || jsonb_build_object('c', 'Only service_role can reach the daily view', 'p',
    has_table_privilege('service_role', 'public.llm_usage_daily', 'select')
      and not has_table_privilege('anon', 'public.llm_usage_daily', 'select')
      and not has_table_privilege('authenticated', 'public.llm_usage_daily', 'select'),
    'd', 'view privileges');

  res := res || jsonb_build_object('c', 'Only service_role can run reserve_llm_call', 'p',
    has_function_privilege('service_role', 'public.reserve_llm_call(uuid,text,text,integer,integer,integer)', 'execute')
      and not has_function_privilege('anon', 'public.reserve_llm_call(uuid,text,text,integer,integer,integer)', 'execute')
      and not has_function_privilege('authenticated', 'public.reserve_llm_call(uuid,text,text,integer,integer,integer)', 'execute'),
    'd', 'execute privileges');

  -- -------------------------------------------------------------------------
  -- Constraints (as the only role that can write)
  -- -------------------------------------------------------------------------

  set local role service_role;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

  begin
    insert into public.llm_usage_logs (user_id, feature, model, outcome, latency_ms) values (a, 'chat', 'm', 'ok', 5);
    res := res || jsonb_build_object('c', 'An unknown feature is rejected', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'An unknown feature is rejected', 'p', sqlstate = '23514', 'd', sqlstate);
  end;

  begin
    insert into public.llm_usage_logs (user_id, feature, model, outcome, latency_ms) values (a, 'rebalance', 'm', 'great', 5);
    res := res || jsonb_build_object('c', 'An unknown outcome is rejected', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'An unknown outcome is rejected', 'p', sqlstate = '23514', 'd', sqlstate);
  end;

  begin
    insert into public.llm_usage_logs (user_id, feature, model, outcome, latency_ms) values (a, 'rebalance', '', 'ok', 5);
    res := res || jsonb_build_object('c', 'An empty model is rejected', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'An empty model is rejected', 'p', sqlstate = '23514', 'd', sqlstate);
  end;

  begin
    insert into public.llm_usage_logs (user_id, feature, model, outcome, latency_ms) values (a, 'rebalance', repeat('x', 101), 'ok', 5);
    res := res || jsonb_build_object('c', 'A model longer than 100 characters is rejected', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A model longer than 100 characters is rejected', 'p', sqlstate = '23514', 'd', sqlstate);
  end;

  begin
    insert into public.llm_usage_logs (user_id, feature, model, outcome, latency_ms, input_tokens, output_tokens)
    values (a, 'rebalance', 'm', 'ok', 5, -1, 3);
    res := res || jsonb_build_object('c', 'Negative tokens are rejected', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'Negative tokens are rejected', 'p', sqlstate = '23514', 'd', sqlstate);
  end;

  begin
    insert into public.llm_usage_logs (user_id, feature, model, outcome, latency_ms, input_tokens, output_tokens)
    values (a, 'rebalance', 'm', 'ok', 5, 10, null);
    res := res || jsonb_build_object('c', 'Input and output tokens are recorded together or not at all', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'Input and output tokens are recorded together or not at all', 'p', sqlstate = '23514', 'd', sqlstate);
  end;

  begin
    insert into public.llm_usage_logs (user_id, feature, model, outcome, latency_ms) values (a, 'rebalance', 'm', 'pending', 5);
    res := res || jsonb_build_object('c', 'A pending call has no latency yet', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A pending call has no latency yet', 'p', sqlstate = '23514', 'd', sqlstate);
  end;

  begin
    insert into public.llm_usage_logs (user_id, feature, model, outcome) values (a, 'rebalance', 'm', 'ok');
    res := res || jsonb_build_object('c', 'A finished call must record its latency', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A finished call must record its latency', 'p', sqlstate = '23514', 'd', sqlstate);
  end;

  begin
    insert into public.llm_usage_logs (user_id, feature, model, input_tokens, output_tokens) values (a, 'rebalance', 'm', 1, 1);
    res := res || jsonb_build_object('c', 'A pending call has no tokens yet', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A pending call has no tokens yet', 'p', sqlstate = '23514', 'd', sqlstate);
  end;

  begin
    insert into public.llm_usage_logs (user_id, feature, model, outcome, latency_ms) values (gen_random_uuid(), 'rebalance', 'm', 'ok', 5);
    res := res || jsonb_build_object('c', 'A row needs a real user', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A row needs a real user', 'p', sqlstate = '23503', 'd', sqlstate);
  end;

  -- A call that never got an answer (no key, network error) has no tokens: that is allowed.
  insert into public.llm_usage_logs (user_id, feature, model, outcome, latency_ms, created_at)
  values (z, 'week_one_plan', 'm', 'unavailable', 12, now() - interval '1 hour');
  select count(*) into v from public.llm_usage_logs where user_id = z and outcome = 'unavailable' and input_tokens is null;
  res := res || jsonb_build_object('c', 'A call with no answer is recorded without tokens', 'p', v = 1, 'd', format('%s rows', v));

  -- -------------------------------------------------------------------------
  -- reserve_llm_call: allow, space, count, cap
  -- -------------------------------------------------------------------------

  -- Three calls from earlier today for c, and old calls for d (outside the 24 hour window).
  insert into public.llm_usage_logs (user_id, feature, model, outcome, latency_ms, input_tokens, output_tokens, created_at) values
    (c, 'rebalance',     'm', 'ok', 900, 100, 50, now() - interval '23 hours'),
    (c, 'week_one_plan', 'm', 'ok', 800, 100, 50, now() - interval '22 hours'),
    (c, 'rebalance',     'm', 'ok', 700, 100, 50, now() - interval '21 hours'),
    (d, 'rebalance',     'm', 'ok', 900, 100, 50, now() - interval '25 hours'),
    (d, 'rebalance',     'm', 'ok', 900, 100, 50, now() - interval '30 hours');

  -- A first call is allowed and reserves a pending row.
  r := public.reserve_llm_call(a, 'rebalance', 'test-model', 20, 5, 1000000);
  log_a := (r ->> 'log_id')::uuid;
  select count(*) into v from public.llm_usage_logs where id = log_a and user_id = a and feature = 'rebalance'
    and model = 'test-model' and outcome = 'pending' and latency_ms is null and input_tokens is null;
  res := res || jsonb_build_object('c', 'A first call is allowed and reserves a pending row', 'p', (r ->> 'allowed')::boolean and v = 1, 'd', r::text);

  -- Asking again at once is too soon, and says how long to wait.
  r := public.reserve_llm_call(a, 'rebalance', 'test-model', 20, 5, 1000000);
  secs := (r ->> 'retry_after_seconds')::int;
  res := res || jsonb_build_object('c', 'A second call within 20 seconds is refused as too_soon, with a wait of 1 to 20 seconds', 'p',
    not (r ->> 'allowed')::boolean and r ->> 'reason' = 'too_soon' and secs between 1 and 20, 'd', r::text);

  select count(*) into v from public.llm_usage_logs where user_id = a;
  res := res || jsonb_build_object('c', 'A refused call is not logged, so asking again cannot extend the wait', 'p', v = 1, 'd', format('%s rows for the user', v));

  -- Spacing is per user.
  r := public.reserve_llm_call(b, 'week_one_plan', 'test-model', 20, 5, 1000000);
  res := res || jsonb_build_object('c', 'Another user is not held back by someone else''s spacing', 'p', (r ->> 'allowed')::boolean, 'd', r::text);

  -- The per-user cap counts the last 24 hours and says when the oldest call leaves the window.
  r := public.reserve_llm_call(c, 'rebalance', 'test-model', 20, 3, 1000000);
  secs := (r ->> 'retry_after_seconds')::int;
  res := res || jsonb_build_object('c', 'At the per-user cap the reason is user_daily, and the wait is until the oldest call leaves (about 1 hour)', 'p',
    not (r ->> 'allowed')::boolean and r ->> 'reason' = 'user_daily' and abs(secs - 3600) <= 30, 'd', r::text);

  r := public.reserve_llm_call(c, 'rebalance', 'test-model', 20, 2, 1000000);
  secs := (r ->> 'retry_after_seconds')::int;
  res := res || jsonb_build_object('c', 'Over the cap by one more, the wait is until the second oldest call leaves (about 2 hours)', 'p',
    r ->> 'reason' = 'user_daily' and abs(secs - 7200) <= 30, 'd', r::text);

  select count(*) into v from public.llm_usage_logs where user_id = c;
  res := res || jsonb_build_object('c', 'A refused call writes nothing at the cap either', 'p', v = 3, 'd', format('%s rows for the user', v));

  r := public.reserve_llm_call(c, 'rebalance', 'test-model', 20, 4, 1000000);
  res := res || jsonb_build_object('c', 'One call under the cap is allowed', 'p', (r ->> 'allowed')::boolean, 'd', r::text);

  -- Calls older than 24 hours do not count.
  r := public.reserve_llm_call(d, 'rebalance', 'test-model', 20, 1, 1000000);
  res := res || jsonb_build_object('c', 'Calls more than 24 hours old do not count towards the cap', 'p', (r ->> 'allowed')::boolean, 'd', r::text);

  -- The shared cap counts everyone, whatever else is in the table.
  select count(*) into total from public.llm_usage_logs where created_at > now() - interval '24 hours';
  r := public.reserve_llm_call(z, 'rebalance', 'test-model', 20, 1000, total);
  secs := (r ->> 'retry_after_seconds')::int;
  res := res || jsonb_build_object('c', 'At the shared cap the reason is overall_daily, with a wait between 1 second and 24 hours', 'p',
    not (r ->> 'allowed')::boolean and r ->> 'reason' = 'overall_daily' and secs between 1 and 86400, 'd', r::text);

  r := public.reserve_llm_call(z, 'rebalance', 'test-model', 20, 1000, total + 1);
  res := res || jsonb_build_object('c', 'One call under the shared cap is allowed', 'p', (r ->> 'allowed')::boolean, 'd', r::text);

  -- Which reason wins when several limits trip at once: the user's own cap, then the shared cap, then spacing.
  select count(*) into total from public.llm_usage_logs where created_at > now() - interval '24 hours';
  r := public.reserve_llm_call(c, 'rebalance', 'test-model', 20, 2, total);
  res := res || jsonb_build_object('c', 'When the user cap and the shared cap both trip, user_daily is reported', 'p', r ->> 'reason' = 'user_daily', 'd', r::text);

  r := public.reserve_llm_call(a, 'rebalance', 'test-model', 20, 1000, total);
  res := res || jsonb_build_object('c', 'When the shared cap and spacing both trip, overall_daily is reported', 'p', r ->> 'reason' = 'overall_daily', 'd', r::text);

  -- Bad arguments are refused, and write nothing.
  select count(*) into v from public.llm_usage_logs;
  begin
    perform public.reserve_llm_call(a, 'rebalance', 'test-model', 20, 0, 1000);
    res := res || jsonb_build_object('c', 'A zero cap is refused', 'p', false, 'd', 'call succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A zero cap is refused', 'p', sqlstate = '22023', 'd', sqlstate);
  end;
  begin
    perform public.reserve_llm_call(null, 'rebalance', 'test-model', 20, 5, 1000);
    res := res || jsonb_build_object('c', 'A missing user is refused', 'p', false, 'd', 'call succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A missing user is refused', 'p', sqlstate = '22023', 'd', sqlstate);
  end;
  begin
    perform public.reserve_llm_call(gen_random_uuid(), 'rebalance', 'test-model', 20, 5, 1000000);
    res := res || jsonb_build_object('c', 'A user that does not exist is refused', 'p', false, 'd', 'call succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A user that does not exist is refused', 'p', sqlstate = '23503', 'd', sqlstate);
  end;
  begin
    perform public.reserve_llm_call(y, 'chat', 'test-model', 20, 1000, 1000000);
    res := res || jsonb_build_object('c', 'An unknown feature is refused by the function too', 'p', false, 'd', 'call succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'An unknown feature is refused by the function too', 'p', sqlstate = '23514', 'd', sqlstate);
  end;
  select count(*) into w from public.llm_usage_logs;
  res := res || jsonb_build_object('c', 'Refused arguments leave the table unchanged', 'p', v = w, 'd', format('%s rows before, %s after', v, w));

  -- -------------------------------------------------------------------------
  -- Finishing a row, and the guard that stops anything else
  -- -------------------------------------------------------------------------

  update public.llm_usage_logs
  set outcome = 'ok', input_tokens = 1200, output_tokens = 340, latency_ms = 8123
  where id = log_a;
  select count(*) into v from public.llm_usage_logs
  where id = log_a and outcome = 'ok' and input_tokens = 1200 and output_tokens = 340 and latency_ms = 8123;
  res := res || jsonb_build_object('c', 'A pending row can be finished with tokens, latency and outcome', 'p', v = 1, 'd', format('%s rows', v));

  begin
    update public.llm_usage_logs set output_tokens = 1 where id = log_a;
    res := res || jsonb_build_object('c', 'A finished row cannot change', 'p', false, 'd', 'update succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A finished row cannot change', 'p', sqlstate = '23514', 'd', sqlstate || ' ' || sqlerrm);
  end;

  begin
    update public.llm_usage_logs set user_id = a
    where user_id = b and outcome = 'pending';
    res := res || jsonb_build_object('c', 'A pending row cannot be handed to another user', 'p', false, 'd', 'update succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A pending row cannot be handed to another user', 'p', sqlstate = '23514', 'd', sqlstate);
  end;

  begin
    update public.llm_usage_logs set created_at = now() - interval '2 days'
    where user_id = b and outcome = 'pending';
    res := res || jsonb_build_object('c', 'A pending row cannot be backdated to dodge the limits', 'p', false, 'd', 'update succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A pending row cannot be backdated to dodge the limits', 'p', sqlstate = '23514', 'd', sqlstate);
  end;

  begin
    update public.llm_usage_logs set input_tokens = 5, output_tokens = 5, latency_ms = 5
    where user_id = b and outcome = 'pending';
    res := res || jsonb_build_object('c', 'A pending row must be given an outcome when it is finished', 'p', false, 'd', 'update succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A pending row must be given an outcome when it is finished', 'p', sqlstate = '23514', 'd', sqlstate);
  end;

  begin
    delete from public.llm_usage_logs where user_id = z;
    res := res || jsonb_build_object('c', 'service_role cannot delete usage rows', 'p', false, 'd', 'delete succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'service_role cannot delete usage rows', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;

  -- The owner's view adds up.
  select coalesce(sum(calls), 0) into v from public.llm_usage_daily;
  select count(*) into w from public.llm_usage_logs;
  res := res || jsonb_build_object('c', 'The daily view counts every row', 'p', v = w and w > 0, 'd', format('view %s, table %s', v, w));

  -- -------------------------------------------------------------------------
  -- Signed-in users: read their own rows, nothing else
  -- -------------------------------------------------------------------------

  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

  select count(*) into v from public.llm_usage_logs;
  select count(*) into w from public.llm_usage_logs where user_id <> a;
  res := res || jsonb_build_object('c', 'A user reads their own usage rows and none of anyone else''s', 'p', v >= 1 and w = 0, 'd', format('%s visible, %s of them not theirs', v, w));

  begin
    insert into public.llm_usage_logs (user_id, feature, model, outcome, latency_ms) values (a, 'rebalance', 'm', 'ok', 5);
    res := res || jsonb_build_object('c', 'A signed-in user cannot write a usage row', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A signed-in user cannot write a usage row', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;

  begin
    update public.llm_usage_logs set latency_ms = 1 where user_id = a;
    res := res || jsonb_build_object('c', 'A signed-in user cannot change a usage row', 'p', false, 'd', 'update succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A signed-in user cannot change a usage row', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;

  begin
    delete from public.llm_usage_logs where user_id = a;
    res := res || jsonb_build_object('c', 'A signed-in user cannot delete a usage row', 'p', false, 'd', 'delete succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A signed-in user cannot delete a usage row', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;

  begin
    perform public.reserve_llm_call(a, 'rebalance', 'test-model', 20, 5, 1000000);
    res := res || jsonb_build_object('c', 'A signed-in user cannot reserve calls (it would let one account use up the shared cap)', 'p', false, 'd', 'call succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A signed-in user cannot reserve calls (it would let one account use up the shared cap)', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;

  begin
    perform 1 from public.llm_usage_daily;
    res := res || jsonb_build_object('c', 'A signed-in user cannot read the all-users daily view', 'p', false, 'd', 'select succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A signed-in user cannot read the all-users daily view', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;

  -- -------------------------------------------------------------------------
  -- Signed-out clients: nothing
  -- -------------------------------------------------------------------------

  reset role;
  set local role anon;
  perform set_config('request.jwt.claims', '', true);

  begin
    perform 1 from public.llm_usage_logs;
    res := res || jsonb_build_object('c', 'A signed-out client cannot read usage rows', 'p', false, 'd', 'select succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A signed-out client cannot read usage rows', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;

  begin
    perform public.reserve_llm_call(a, 'rebalance', 'test-model', 20, 5, 1000000);
    res := res || jsonb_build_object('c', 'A signed-out client cannot reserve calls', 'p', false, 'd', 'call succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A signed-out client cannot reserve calls', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;

  -- -------------------------------------------------------------------------
  -- Removal (as postgres)
  -- -------------------------------------------------------------------------

  reset role;
  perform set_config('request.jwt.claims', '', true);

  select count(*) into v from public.llm_usage_logs where user_id in (a, b, c, d, z, y);
  delete from auth.users where id in (a, b, c, d, z, y);
  select count(*) into w from public.llm_usage_logs where user_id in (a, b, c, d, z, y);
  res := res || jsonb_build_object('c', 'Deleting an account removes its usage rows', 'p', v > 0 and w = 0, 'd', format('%s rows before, %s after', v, w));

  insert into mom73_results (n, check_name, passed, detail)
  select ord, e ->> 'c', (e ->> 'p')::boolean, e ->> 'd'
  from jsonb_array_elements(res) with ordinality as x(e, ord);
end;
$$;

select * from mom73_results order by n;
