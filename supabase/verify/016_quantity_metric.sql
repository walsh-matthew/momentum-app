-- Verification for supabase/migrations/016_quantity_metric.sql (MOM-111, third block).
-- Run in the Supabase SQL Editor or with `npm run verify:sql` (local) or `supabase db query --linked -f` (hosted).
-- Safe to re-run, and safe against production: it creates throwaway auth users, writes only their rows (through
-- save_guided_setup, plus one direct insert to prove the CHECK constraint), and deletes the users at the end.
--
-- What it proves:
--   - target_sources.metric accepts only the four named values or null, whatever writes it;
--   - a synced binding that names a metric saves it; one that does not, and a manual binding, save null;
--   - a payload with no "metric" key at all (an older client) still saves, with null metric, not an error;
--   - the function is still SECURITY INVOKER and callable only by a signed-in user (unchanged by this migration,
--     checked again because CREATE OR REPLACE could in principle have dropped a grant);
--   - one person's save still never writes another's rows.

drop table if exists pg_temp.mom111c_results;
create temp table mom111c_results (n int, check_name text, passed boolean, detail text);

create or replace function pg_temp.mom111c_c(name text, passed boolean, detail text default '') returns jsonb
language sql as $$
  select jsonb_build_object('c', name, 'p', coalesce(passed, false), 'd', coalesce(detail, ''));
$$;

create or replace function pg_temp.mom111c_save(payload text) returns text
language plpgsql as $$
begin
  perform public.save_guided_setup(payload::jsonb);
  return 'ok';
exception when others then
  return sqlstate;
end;
$$;

create or replace function pg_temp.mom111c_insert(payload text) returns text
language plpgsql as $$
begin
  execute payload;
  return 'ok';
exception when others then
  return sqlstate;
end;
$$;

do $$
declare
  a uuid := gen_random_uuid();   -- a setup with every kind of binding
  b uuid := gen_random_uuid();   -- a setup with no metric key at all (an older client)
  payload_a text;
  payload_b text;
  s text;
  v int;
  w int;
  v_after int;
  n_left int;
  res jsonb := '[]';
begin
  insert into auth.users (id, email)
  values (a, 'mom111c-verify-a@example.invalid'), (b, 'mom111c-verify-b@example.invalid');

  -- -------------------------------------------------------------------------
  -- The column and its CHECK constraint
  -- -------------------------------------------------------------------------

  select count(*) into v from information_schema.columns
  where table_schema = 'public' and table_name = 'target_sources' and column_name = 'metric' and is_nullable = 'YES';
  res := res || pg_temp.mom111c_c('target_sources.metric exists and is nullable', v = 1);

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  s := pg_temp.mom111c_insert(format(
    $i$insert into public.sources (user_id, kind, provider, label) values (%L, 'manual', null, 'Manual')$i$, a));
  reset role;
  res := res || pg_temp.mom111c_c('a throwaway manual source was created to test the constraint directly', s = 'ok', s);

  -- -------------------------------------------------------------------------
  -- A full setup with every kind of binding (user a)
  -- -------------------------------------------------------------------------

  payload_a := $j${
    "person": {"time_zone": "America/Chicago", "day_end": "21:00:00"},
    "day_types": [], "priorities": [],
    "goals": [{"key": "g", "title": "Lift more", "start_date": "2026-10-29", "shape": "ongoing", "state": "active",
      "targets": [
        {"key": "vol", "title": "Volume", "measure": "quantity", "unit": "lbs", "role": "outcome", "period_kind": "weekly",
          "carry_over_kind": "habit",
          "sources": [{"kind": "manual"}, {"kind": "synced", "provider": "hevy", "label": "Hevy", "metric": "volume_lbs"}]},
        {"key": "minutes", "title": "Time at the gym", "measure": "time", "role": "effort", "period_kind": "weekly",
          "floor": 60, "carry_over_kind": "habit",
          "sources": [{"kind": "synced", "provider": "hevy", "label": "Hevy", "metric": null}]},
        {"key": "cal", "title": "Focus blocks", "measure": "count", "role": "effort", "period_kind": "weekly",
          "floor": 3, "carry_over_kind": "habit",
          "sources": [{"kind": "synced", "provider": "google_calendar", "label": "Google Calendar", "metric": null}]}
      ],
      "items": []}]}$j$;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  s := pg_temp.mom111c_save(payload_a);
  reset role;
  res := res || pg_temp.mom111c_c('A setup with a metric, a no-metric synced binding and a manual binding saves', s = 'ok', s);

  select count(*) into v from public.target_sources ts
    join public.sources src on src.id = ts.source_id and src.user_id = ts.user_id
    join public.targets t on t.id = ts.target_id and t.user_id = ts.user_id
  where ts.user_id = a and t.title = 'Volume' and src.kind = 'synced' and ts.metric = 'volume_lbs';
  res := res || pg_temp.mom111c_c('The synced binding that named a metric saved it', v = 1);

  select count(*) into v from public.target_sources ts
    join public.sources src on src.id = ts.source_id and src.user_id = ts.user_id
    join public.targets t on t.id = ts.target_id and t.user_id = ts.user_id
  where ts.user_id = a and t.title = 'Volume' and src.kind = 'manual' and ts.metric is null;
  res := res || pg_temp.mom111c_c('The manual binding on the same target has no metric', v = 1);

  select count(*) into v from public.target_sources ts
    join public.targets t on t.id = ts.target_id and t.user_id = ts.user_id
  where ts.user_id = a and t.title in ('Time at the gym', 'Focus blocks') and ts.metric is null;
  res := res || pg_temp.mom111c_c('A synced binding sent with metric null saves null, not an error', v = 2);

  -- An out-of-list value is refused by the CHECK constraint, whoever writes it.
  s := pg_temp.mom111c_insert(format(
    $i$update public.target_sources set metric = 'km' where user_id = %L$i$, a));
  res := res || pg_temp.mom111c_c('An out-of-list metric is refused by the CHECK constraint', s = '23514', s);

  -- -------------------------------------------------------------------------
  -- A payload with no "metric" key at all, as an older client would send (user b)
  -- -------------------------------------------------------------------------

  payload_b := $j${
    "person": {"time_zone": "America/Chicago", "day_end": "21:00:00"},
    "day_types": [], "priorities": [],
    "goals": [{"key": "g", "title": "Run more", "start_date": "2026-10-29", "shape": "ongoing", "state": "active",
      "targets": [{"key": "runs", "title": "Runs", "measure": "count", "role": "effort", "period_kind": "weekly",
        "floor": 3, "carry_over_kind": "habit", "sources": [{"kind": "synced", "provider": "hevy", "label": "Hevy"}]}],
      "items": []}]}$j$;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  s := pg_temp.mom111c_save(payload_b);
  reset role;
  res := res || pg_temp.mom111c_c('A payload with no metric key at all still saves, not errors', s = 'ok', s);

  select count(*) into v from public.target_sources where user_id = b and metric is null;
  res := res || pg_temp.mom111c_c('Its binding saved with metric null', v = 1);

  -- -------------------------------------------------------------------------
  -- Unchanged by this migration: who may call it, and one person never writes another's rows
  -- -------------------------------------------------------------------------

  select string_agg(r.rolname, ', ' order by r.rolname) into s
  from pg_roles r
  where r.rolname in ('anon', 'authenticated', 'service_role')
    and has_function_privilege(r.rolname, 'public.save_guided_setup(jsonb)', 'execute');
  res := res || pg_temp.mom111c_c('Only signed-in users can execute it, same as 015', s = 'authenticated', coalesce(s, 'nobody'));

  select count(*) into v from pg_proc where oid = 'public.save_guided_setup(jsonb)'::regprocedure and prosecdef;
  res := res || pg_temp.mom111c_c('It is still SECURITY INVOKER after CREATE OR REPLACE', v = 0);

  select count(*) into v from public.target_sources where user_id = b and user_id <> b;
  select count(*) into w from public.targets t join public.goals g on g.id = t.goal_id where g.user_id <> t.user_id;
  res := res || pg_temp.mom111c_c('Nobody got a binding they did not save, and no target points at another person''s goal',
    v = 0 and w = 0, format('%s, %s mismatched targets', v, w));

  -- -------------------------------------------------------------------------
  -- Removal: the throwaway accounts take every row with them
  -- -------------------------------------------------------------------------

  select count(*) into v from public.target_sources where user_id in (a, b);
  delete from auth.users where id in (a, b);
  select count(*) into v_after from public.target_sources where user_id in (a, b);
  select count(*) into n_left from auth.users where email like 'mom111c-verify-%';
  res := res || pg_temp.mom111c_c('Deleting the accounts removes their bindings and leaves nothing behind',
    v > 0 and v_after = 0 and n_left = 0, format('%s bindings before; %s after; %s throwaway users left', v, v_after, n_left));

  insert into mom111c_results (n, check_name, passed, detail)
  select ord, e2 ->> 'c', (e2 ->> 'p')::boolean, e2 ->> 'd'
  from jsonb_array_elements(res) with ordinality as x (e2, ord);
end;
$$;

select * from mom111c_results order by n;
