-- Verification for supabase/migrations/015_save_guided_setup.sql (MOM-111).
-- Run in the Supabase SQL Editor or with `npm run verify:sql` (local) or `supabase db query --linked -f` (hosted).
-- Safe to re-run, and safe against production: it creates throwaway auth users, writes only their rows (through the
-- function under test, plus one manual source for one of them), and deletes the users at the end (which removes every
-- row they own). Any unexpected error rolls back the whole block.
--
-- What it proves:
--   - a full approved setup saves every kind of row, in the signed-in person's name, with the bindings the person chose
--     (a manual one points at their manual source, a synced one creates its source row), and a work item with steps
--     feeds its checklist target;
--   - a save that fails part-way leaves NOTHING behind in any of the nine tables (the second goal is rejected after the
--     first goal, its targets, items and steps were written, and the first goal is gone with it). A call made through
--     the API is one transaction, so an error rolls it all back; the helper below runs it in a subtransaction, which
--     rolls back the same way;
--   - first setup only: a second call by the same person is refused (MS001) and adds nothing;
--   - a parked goal with no shape and no start date saves;
--   - one person's save never writes another's rows (the payload has no user id; every row belongs to the caller);
--   - only a signed-in person can call it: not a signed-out client, not the service role.

drop table if exists pg_temp.mom111_results;
create temp table mom111_results (n int, check_name text, passed boolean, detail text);

-- Runs one statement as the current role and returns 'ok' or the SQLSTATE of the error.
create or replace function pg_temp.mom111_state(stmt text) returns text
language plpgsql as $$
begin
  execute stmt;
  return 'ok';
exception when others then
  return sqlstate;
end;
$$;

-- One result row.
create or replace function pg_temp.mom111_c(name text, passed boolean, detail text default '') returns jsonb
language sql as $$
  select jsonb_build_object('c', name, 'p', coalesce(passed, false), 'd', coalesce(detail, ''));
$$;

-- Calls the function with a payload and returns 'ok' or the SQLSTATE.
create or replace function pg_temp.mom111_save(payload text) returns text
language plpgsql as $$
begin
  perform public.save_guided_setup(payload::jsonb);
  return 'ok';
exception when others then
  return sqlstate;
end;
$$;

-- How many rows of the nine tables a user owns, as one number per table, in one string.
create or replace function pg_temp.mom111_rows(p_user uuid) returns text
language sql as $$
  select concat_ws(', ',
    'settings=' || (select count(*) from public.person_settings where user_id = p_user),
    'day_types=' || (select count(*) from public.person_day_types where user_id = p_user),
    'priorities=' || (select count(*) from public.person_priorities where user_id = p_user),
    'goals=' || (select count(*) from public.goals where user_id = p_user),
    'targets=' || (select count(*) from public.targets where user_id = p_user),
    'items=' || (select count(*) from public.work_items where user_id = p_user),
    'steps=' || (select count(*) from public.work_item_steps where user_id = p_user),
    'sources=' || (select count(*) from public.sources where user_id = p_user),
    'bindings=' || (select count(*) from public.target_sources where user_id = p_user));
$$;

do $$
declare
  a      uuid := gen_random_uuid();   -- a full setup
  b      uuid := gen_random_uuid();   -- a setup that fails part-way
  c      uuid := gen_random_uuid();   -- a parked goal only
  e      uuid := gen_random_uuid();   -- already has a manual source
  full_payload text;
  bad_payload  text;
  parked_payload text;
  manual_payload text;
  s      text;
  v      int;
  w      int;
  v_after int;
  n_left int;
  r      jsonb;
  res    jsonb := '[]';
  src_e  uuid;
begin
  insert into auth.users (id, email)
  values (a, 'mom111-verify-a@example.invalid'), (b, 'mom111-verify-b@example.invalid'),
         (c, 'mom111-verify-c@example.invalid'), (e, 'mom111-verify-e@example.invalid');

  full_payload := $j${
    "person": {"time_zone": "America/Chicago", "week_start": 1, "day_end": "02:00:00", "tone": "gentle", "reminders": "off",
      "check_ins": "end_of_week", "celebrations": "low_key", "balance_mentions": "weekly_planning",
      "review_depth": "recap_offer", "review_planning": "one_sitting", "quiet_times": [{"text": "Sunday mornings"}],
      "planning_weekday": 7, "planning_time": "18:00:00"},
    "day_types": [{"name": "Work day", "capacity_unit": "hours", "capacity_amount": 2}],
    "priorities": [{"label": "Family", "sort_order": 0}],
    "goals": [
      {"key": "run", "title": "Run more", "why": "to feel strong", "start_date": "2026-10-28", "shape": "ongoing",
       "end_date": null, "block_weeks": 10, "state": "active", "return_kind": null, "return_date": null, "return_note": null,
       "targets": [
         {"key": "runs", "title": "Runs", "measure": "count", "unit": null, "role": "effort", "period_kind": "weekly",
          "due_date": null, "slot_weekdays": null, "floor": 3, "aspiration": 4, "qualifying_threshold": null,
          "carry_over_kind": "habit", "sources": [{"kind": "manual"}, {"kind": "synced", "provider": "hevy", "label": "Hevy"}]},
         {"key": "km", "title": "Distance", "measure": "quantity", "unit": "km", "role": "outcome", "period_kind": "weekly",
          "due_date": null, "slot_weekdays": null, "floor": null, "aspiration": null, "qualifying_threshold": null,
          "carry_over_kind": "habit", "sources": [{"kind": "manual"}]},
         {"key": "prep", "title": "Race prep", "measure": "checklist", "unit": null, "role": "effort", "period_kind": "deadline",
          "due_date": "2026-12-01", "slot_weekdays": null, "floor": 3, "aspiration": null, "qualifying_threshold": null,
          "carry_over_kind": "cumulative", "sources": [{"kind": "manual"}]}
       ],
       "items": [
         {"key": "habit", "kind": "habit", "title": "Go for a run", "target_key": "runs", "sort_order": 0, "steps": []},
         {"key": "list", "kind": "milestone", "title": "Get ready", "target_key": "prep", "sort_order": 1,
          "steps": [{"title": "Shoes", "sort_order": 0}, {"title": "Entry form", "sort_order": 1}, {"title": "Plan the route", "sort_order": 2}]},
         {"key": "entry", "kind": "deadline_task", "title": "Register", "target_key": null, "sort_order": 2,
          "due_date": "2026-11-15", "date_can_move": false, "estimate_minutes": 120, "steps": []}
       ]},
      {"key": "later", "title": "Learn piano", "why": null, "start_date": null, "shape": null, "end_date": null,
       "block_weeks": null, "state": "parked", "return_kind": "on_request", "return_date": null, "return_note": null,
       "targets": [], "items": []}
    ]}$j$;

  -- The second goal is active with no shape: the database rejects it AFTER the first goal, its three targets, its
  -- three work items, its steps, its bindings, the settings and the sources were all written in the same call.
  bad_payload := replace(full_payload,
    '"key": "later", "title": "Learn piano", "why": null, "start_date": null, "shape": null, "end_date": null,
       "block_weeks": null, "state": "parked", "return_kind": "on_request"',
    '"key": "later", "title": "Learn piano", "why": null, "start_date": null, "shape": null, "end_date": null,
       "block_weeks": null, "state": "active", "return_kind": null');

  parked_payload := $j${
    "person": {"time_zone": null, "week_start": null, "day_end": null},
    "day_types": [], "priorities": [],
    "goals": [{"key": "later", "title": "Learn piano", "state": "parked", "return_kind": "on_request", "targets": [], "items": []}]}$j$;

  manual_payload := $j${
    "person": {"time_zone": "America/Chicago", "day_end": "21:00:00"},
    "day_types": [], "priorities": [],
    "goals": [{"key": "g", "title": "Read", "start_date": "2026-10-28", "shape": "ongoing", "state": "active",
      "targets": [{"key": "t", "title": "Pages", "measure": "quantity", "unit": "pages", "role": "outcome", "period_kind": "weekly",
        "carry_over_kind": "habit", "sources": [{"kind": "manual"}]}], "items": []}]}$j$;

  -- Throwaway user e already has a manual source (as after a first manual entry).
  insert into public.sources (user_id, kind, provider, label) values (e, 'manual', null, 'Manual') returning id into src_e;

  -- -------------------------------------------------------------------------
  -- Who may call it
  -- -------------------------------------------------------------------------

  select string_agg(r.rolname, ', ' order by r.rolname) into s
  from pg_roles r
  where r.rolname in ('anon', 'authenticated', 'service_role')
    and has_function_privilege(r.rolname, 'public.save_guided_setup(jsonb)', 'execute');
  res := res || pg_temp.mom111_c('Only signed-in users can execute it', s = 'authenticated', coalesce(s, 'nobody'));

  select count(*) into v from pg_proc where oid = 'public.save_guided_setup(jsonb)'::regprocedure and prosecdef;
  res := res || pg_temp.mom111_c('It is SECURITY INVOKER, so row level security applies', v = 0);

  set local role anon;
  perform set_config('request.jwt.claims', '', true);
  s := pg_temp.mom111_save(full_payload);
  res := res || pg_temp.mom111_c('A signed-out client cannot call it', s = '42501', s);

  reset role;
  set local role service_role;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  s := pg_temp.mom111_save(full_payload);
  res := res || pg_temp.mom111_c('The service role cannot call it', s = '42501', s);

  reset role;

  -- -------------------------------------------------------------------------
  -- A full setup (user a)
  -- -------------------------------------------------------------------------

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

  s := pg_temp.mom111_save(replace(full_payload, '"goals": [', '"extra": 1, "goals": ['));
  res := res || pg_temp.mom111_c('A payload with a key the function does not know is refused', s = '22023', s);

  s := pg_temp.mom111_save('{"person": {}, "day_types": [], "priorities": [], "goals": []}');
  res := res || pg_temp.mom111_c('A setup with no goal is refused', s = '22023', s);

  r := public.save_guided_setup(full_payload::jsonb);
  res := res || pg_temp.mom111_c('A full setup saves and says what it wrote',
    r = '{"goals": 2, "steps": 3, "targets": 3, "bindings": 4, "work_items": 3}'::jsonb, r::text);

  reset role;

  select pg_temp.mom111_rows(a) into s;
  res := res || pg_temp.mom111_c('Every kind of row is there',
    s = 'settings=1, day_types=1, priorities=1, goals=2, targets=3, items=3, steps=3, sources=2, bindings=4', s);

  select count(*) into v from public.person_settings
  where user_id = a and time_zone = 'America/Chicago' and day_end = time '02:00' and week_start = 1
    and tone = 'gentle' and planning_weekday = 7 and planning_time = time '18:00'
    and quiet_times = '[{"text": "Sunday mornings"}]'::jsonb;
  res := res || pg_temp.mom111_c('The person''s facts and settings are as approved', v = 1);

  select count(*) into v from public.goals
  where user_id = a and title = 'Run more' and shape = 'ongoing' and start_date = date '2026-10-28'
    and block_weeks = 10 and state = 'active';
  res := res || pg_temp.mom111_c('The active goal is as approved', v = 1);

  select count(*) into v from public.goals
  where user_id = a and title = 'Learn piano' and state = 'parked' and shape is null and start_date is null and return_kind = 'on_request';
  res := res || pg_temp.mom111_c('The parked goal saved with no shape and no start date', v = 1);

  select count(*) into v from public.targets t
  where t.user_id = a and t.goal_id = (select id from public.goals where user_id = a and title = 'Run more');
  res := res || pg_temp.mom111_c('Every target belongs to its own goal', v = 3);

  select count(*) into v from public.work_items i
  join public.targets t on t.id = i.target_id and t.user_id = i.user_id
  where i.user_id = a and i.title = 'Get ready' and t.measure = 'checklist';
  res := res || pg_temp.mom111_c('A work item with steps feeds its checklist target', v = 1);

  select count(*) into v from public.work_item_steps s2
  join public.work_items i on i.id = s2.work_item_id and i.user_id = s2.user_id
  where s2.user_id = a and i.title = 'Get ready';
  res := res || pg_temp.mom111_c('Its three steps are saved under it', v = 3);

  select count(*) into v from public.work_items
  where user_id = a and kind = 'deadline_task' and due_date = date '2026-11-15' and date_can_move = false and estimate_minutes = 120;
  res := res || pg_temp.mom111_c('A deadline task keeps the person''s answer to "can the date move"', v = 1);

  select count(*) into v from public.sources where user_id = a and kind = 'manual' and provider is null;
  select count(*) into w from public.sources where user_id = a and kind = 'synced' and provider = 'hevy' and label = 'Hevy';
  res := res || pg_temp.mom111_c('One manual source was created, and one synced source row for the provider the person named',
    v = 1 and w = 1, format('%s manual, %s synced', v, w));

  select count(*) into v from public.target_sources ts
  join public.sources s2 on s2.id = ts.source_id and s2.user_id = ts.user_id
  join public.targets t on t.id = ts.target_id and t.user_id = ts.user_id
  where ts.user_id = a and t.title in ('Runs', 'Distance', 'Race prep') and s2.kind = 'manual';
  res := res || pg_temp.mom111_c('Every manual target is bound to the person''s manual source', v = 3);

  select count(*) into v from public.target_sources ts
  join public.sources s2 on s2.id = ts.source_id and s2.user_id = ts.user_id
  join public.targets t on t.id = ts.target_id and t.user_id = ts.user_id
  where ts.user_id = a and t.title = 'Runs' and s2.provider = 'hevy';
  res := res || pg_temp.mom111_c('A target that names a provider is bound to that source', v = 1);

  select count(*) into v from public.entries where user_id = a;
  res := res || pg_temp.mom111_c('Saving a setup logs nothing: no entry exists', v = 0);

  -- -------------------------------------------------------------------------
  -- First setup only
  -- -------------------------------------------------------------------------

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  s := pg_temp.mom111_save(full_payload);
  reset role;
  res := res || pg_temp.mom111_c('A second setup by the same person is refused', s = 'MS001', s);

  select pg_temp.mom111_rows(a) into s;
  res := res || pg_temp.mom111_c('The refused second setup added nothing',
    s = 'settings=1, day_types=1, priorities=1, goals=2, targets=3, items=3, steps=3, sources=2, bindings=4', s);

  -- -------------------------------------------------------------------------
  -- A save that fails part-way leaves nothing (user b)
  -- -------------------------------------------------------------------------

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  s := pg_temp.mom111_save(bad_payload);
  reset role;
  res := res || pg_temp.mom111_c('The second goal is rejected by the database (an active goal needs a shape)', s = '23514', s);

  select pg_temp.mom111_rows(b) into s;
  res := res || pg_temp.mom111_c('Nothing of the failed setup was kept in any of the nine tables',
    s = 'settings=0, day_types=0, priorities=0, goals=0, targets=0, items=0, steps=0, sources=0, bindings=0', s);

  -- The same person can then save a corrected setup: a failure does not use up their one setup.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  s := pg_temp.mom111_save(full_payload);
  reset role;
  res := res || pg_temp.mom111_c('After a failed save the corrected setup saves', s = 'ok', s);

  -- -------------------------------------------------------------------------
  -- A parked goal only (user c), and the manual source that already exists (user e)
  -- -------------------------------------------------------------------------

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  s := pg_temp.mom111_save(parked_payload);
  reset role;
  res := res || pg_temp.mom111_c('A setup with only a parked goal and no person facts saves', s = 'ok', s);

  select count(*) into v from public.goals where user_id = c and state = 'parked' and shape is null and start_date is null;
  select count(*) into w from public.sources where user_id = c;
  res := res || pg_temp.mom111_c('It made no source and no target', v = 1 and w = 0, format('%s goal, %s sources', v, w));

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  s := pg_temp.mom111_save(manual_payload);
  reset role;
  select count(*) into v from public.sources where user_id = e and kind = 'manual';
  select count(*) into w from public.target_sources where user_id = e and source_id = src_e;
  res := res || pg_temp.mom111_c('A person who already has a manual source gets no second one, and the target is bound to the existing one',
    s = 'ok' and v = 1 and w = 1, format('%s, %s manual sources, %s bound to the existing one', s, v, w));

  -- -------------------------------------------------------------------------
  -- One person's save never writes another's rows
  -- -------------------------------------------------------------------------

  -- Each goal title was saved only by the people whose payload held it: c and e never saved "Run more", and a, b and e
  -- never saved "Learn piano" for c. (The payload carries no user id, so a row can only be the caller's.)
  select count(*) into v from public.goals where title = 'Run more' and user_id in (c, e);
  select count(*) into w from public.goals where title = 'Read' and user_id in (a, b, c);
  select count(*) into v_after from public.targets t
  join public.goals g on g.id = t.goal_id where g.user_id <> t.user_id;
  res := res || pg_temp.mom111_c('Nobody got rows they did not save, and no target points at another person''s goal',
    v = 0 and w = 0 and v_after = 0, format('%s, %s stray goals, %s mismatched targets', v, w, v_after));

  -- -------------------------------------------------------------------------
  -- Removal (as postgres): the throwaway accounts take every row with them
  -- -------------------------------------------------------------------------

  select count(*) into v from public.goals where user_id in (a, b, c, e);
  select count(*) into w from public.sources where user_id in (a, b, c, e);
  delete from auth.users where id in (a, b, c, e);
  select count(*) into v_after from public.goals where user_id in (a, b, c, e);
  select count(*) into n_left from auth.users where email like 'mom111-verify-%';
  res := res || pg_temp.mom111_c('Deleting the accounts removes their goals and sources and leaves nothing behind',
    v > 0 and w > 0 and v_after = 0 and n_left = 0,
    format('%s goals and %s sources before; %s goals after; %s throwaway users left', v, w, v_after, n_left));

  insert into mom111_results (n, check_name, passed, detail)
  select ord, e2 ->> 'c', (e2 ->> 'p')::boolean, e2 ->> 'd'
  from jsonb_array_elements(res) with ordinality as x (e2, ord);
end;
$$;

select * from mom111_results order by n;
