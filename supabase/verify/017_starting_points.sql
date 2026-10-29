-- Verification for supabase/migrations/017_starting_points.sql (MOM-134).
-- Run in the Supabase SQL Editor or with `npm run verify:sql` (local) or `supabase db query --linked -f` (hosted).
--
-- LEAVES NOTHING BEHIND, on production or anywhere. Every write this script makes (four throwaway accounts and everything
-- saved for them) is inside one inner BEGIN ... EXCEPTION block that always ends by raising an exception, which makes
-- Postgres undo the whole block, whatever the runner does with the session. The checks' results are kept in a plain
-- variable, which a rolled-back block does not undo, and are copied to the results table afterwards. The last two checks
-- run AFTER the rollback: no row for any of the four accounts remains in any table, and no throwaway account is left.
-- Because earlier checks count rows that did exist for those accounts, "none remain" can only be true if the rollback worked.
--
-- What it proves:
--   - starting_points exists with row level security, and the grants are exactly the intended ones, down to the columns;
--   - an accepted value is marked on the right row and a said value is not;
--   - an older payload with no starting_points saves exactly as under 016, with no marks (named check);
--   - a bad mark (an unknown field, a repeat, a field of another kind, a list that is not a list, a top-level key) keeps nothing;
--   - a second setup is still refused;
--   - a person reads and writes only their own marks, can answer a mark once, and can change nothing else about it;
--   - every field the app can send is accepted for its kind;
--   - marks go with the value they mark and with the account;
--   - the function is still SECURITY INVOKER and callable only by a signed-in user.

drop table if exists pg_temp.mom134_results;
create temp table mom134_results (n int, check_name text, passed boolean, detail text);

create or replace function pg_temp.mom134_c(name text, passed boolean, detail text default '') returns jsonb
language sql as $$
  select jsonb_build_object('c', name, 'p', coalesce(passed, false), 'd', coalesce(detail, ''));
$$;

-- The save, answered as { ok, result } or { ok: false, code } (the SQLSTATE).
create or replace function pg_temp.mom134_save(payload text) returns jsonb
language plpgsql as $$
begin
  return jsonb_build_object('ok', true, 'result', public.save_guided_setup(payload::jsonb));
exception when others then
  return jsonb_build_object('ok', false, 'code', sqlstate);
end;
$$;

-- One statement, answered 'ok:<rows touched>' or the SQLSTATE it failed with.
create or replace function pg_temp.mom134_do(stmt text) returns text
language plpgsql as $$
declare n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return 'ok:' || n;
exception when others then
  return sqlstate;
end;
$$;

do $$
declare
  a uuid := gen_random_uuid();   -- a full setup with marks
  b uuid := gen_random_uuid();   -- a small setup with one mark
  e uuid := gen_random_uuid();   -- an older app's payload: no starting_points anywhere
  c uuid := gen_random_uuid();   -- only bad saves
  payload_a text;
  payload_b text;
  payload_old text;
  r jsonb;
  s text;
  v int;
  w int;
  m_a uuid;     -- one of a's marks
  m_a2 uuid;    -- another of a's marks
  m_b uuid;
  goal_a uuid;
  item_a uuid;
  n_left int;
  res jsonb := '[]';
begin
  begin
    insert into auth.users (id, email)
    values (a, 'mom134-verify-a@example.invalid'), (b, 'mom134-verify-b@example.invalid'),
           (e, 'mom134-verify-e@example.invalid'), (c, 'mom134-verify-c@example.invalid');

    -- -----------------------------------------------------------------------
    -- The table and what the API roles may do with it
    -- -----------------------------------------------------------------------

    select count(*) into v from pg_class
    where oid = 'public.starting_points'::regclass and relrowsecurity;
    res := res || pg_temp.mom134_c('starting_points exists and has row level security on', v = 1);

    select count(*) into v from pg_constraint where conname = 'person_day_types_id_user_unique';
    res := res || pg_temp.mom134_c('person_day_types has a unique (id, user_id) key for the marks to point at', v = 1);

    select string_agg(p, ',' order by p) into s
    from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
    where has_table_privilege('authenticated', 'public.starting_points', p);
    res := res || pg_temp.mom134_c('A signed-in person has table privileges SELECT and INSERT only', s = 'INSERT,SELECT', coalesce(s, 'none'));

    select string_agg(col, ',' order by col) into s
    from (values ('id'), ('user_id'), ('subject_kind'), ('day_type_id'), ('goal_id'), ('target_id'), ('work_item_id'),
                 ('field'), ('created_at'), ('answered_at'), ('outcome')) as t (col)
    where has_column_privilege('authenticated', 'public.starting_points', col, 'UPDATE');
    res := res || pg_temp.mom134_c('A signed-in person may update only answered_at and outcome', s = 'answered_at,outcome', coalesce(s, 'none'));

    select count(*) into v from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
    where has_table_privilege('anon', 'public.starting_points', p) or has_table_privilege('service_role', 'public.starting_points', p);
    res := res || pg_temp.mom134_c('anon and service_role have no privilege on it', v = 0, format('%s privileges found', v));

    -- -----------------------------------------------------------------------
    -- A full setup with marks (user a): an accepted value is marked, a said value is not
    -- -----------------------------------------------------------------------

    -- Marked: the person's day_end and planning_weekday, the Work day's capacity_amount, the goal's start_date and
    -- block_weeks, the target's floor and slot_weekdays, the item's due_date and estimate_minutes (9 marks).
    -- Said, so not marked: week_start, planning_time, the Rest day's capacity, the target's aspiration, date_can_move.
    payload_a := $j${
      "person": {"time_zone": "America/Chicago", "week_start": 1, "day_end": "21:00:00", "planning_weekday": 7,
        "planning_time": "18:00:00", "starting_points": ["day_end", "planning_weekday"]},
      "day_types": [
        {"name": "Work day", "capacity_unit": "hours", "capacity_amount": 2, "starting_points": ["capacity_amount"]},
        {"name": "Rest day", "capacity_unit": "hours", "capacity_amount": 4}],
      "priorities": [{"label": "Family", "sort_order": 0}],
      "goals": [{"key": "g", "title": "Lift more", "start_date": "2026-10-29", "shape": "ongoing", "block_weeks": 10,
        "state": "active", "starting_points": ["start_date", "block_weeks"],
        "targets": [{"key": "gym", "title": "Gym visits", "measure": "count", "role": "effort", "period_kind": "day_slots",
          "slot_weekdays": [1, 3], "floor": 2, "aspiration": 3, "carry_over_kind": "habit",
          "starting_points": ["floor", "slot_weekdays"], "sources": [{"kind": "manual"}]}],
        "items": [{"key": "plan", "kind": "deadline_task", "title": "Book a trainer", "due_date": "2026-11-15",
          "date_can_move": false, "estimate_minutes": 60, "starting_points": ["due_date", "estimate_minutes"], "steps": []}]}]}$j$;

    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    r := pg_temp.mom134_save(payload_a);
    reset role;
    res := res || pg_temp.mom134_c('A setup with marks on every kind of row saves', (r ->> 'ok') = 'true', r::text);
    res := res || pg_temp.mom134_c('The save''s answer is the same five counts as under 016, marks or not',
      (r -> 'result') = jsonb_build_object('goals', 1, 'targets', 1, 'work_items', 1, 'steps', 0, 'bindings', 1), (r -> 'result')::text);

    select count(*) into v from public.starting_points where user_id = a and answered_at is null and outcome is null;
    res := res || pg_temp.mom134_c('Nine marks were stored, all still unanswered', v = 9, v::text);

    select count(*) into v from public.starting_points sp
      join public.person_day_types d on d.id = sp.day_type_id and d.user_id = sp.user_id
    where sp.user_id = a and sp.subject_kind = 'day_type' and sp.field = 'capacity_amount' and d.name = 'Work day';
    select count(*) into w from public.starting_points where user_id = a and subject_kind = 'person' and field in ('day_end', 'planning_weekday');
    res := res || pg_temp.mom134_c('The person facts and the Work day are marked, on the right rows', v = 1 and w = 2, format('%s, %s', v, w));

    select count(*) into v from public.starting_points sp
      join public.goals g on g.id = sp.goal_id and g.user_id = sp.user_id
    where sp.user_id = a and sp.subject_kind = 'goal' and g.title = 'Lift more' and sp.field in ('start_date', 'block_weeks');
    select count(*) into w from public.starting_points sp
      join public.targets t on t.id = sp.target_id and t.user_id = sp.user_id
    where sp.user_id = a and sp.subject_kind = 'target' and t.title = 'Gym visits' and sp.field in ('floor', 'slot_weekdays');
    res := res || pg_temp.mom134_c('The goal and the target values are marked, on the right rows', v = 2 and w = 2, format('%s, %s', v, w));

    select count(*) into v from public.starting_points sp
      join public.work_items i on i.id = sp.work_item_id and i.user_id = sp.user_id
    where sp.user_id = a and sp.subject_kind = 'work_item' and i.title = 'Book a trainer' and sp.field in ('due_date', 'estimate_minutes');
    res := res || pg_temp.mom134_c('The work item values are marked, on the right row', v = 2, v::text);

    -- A said value has no mark. The second half keeps the check from passing on a value that was never saved.
    select count(*) into v from public.starting_points
    where user_id = a and field in ('week_start', 'planning_time', 'aspiration', 'date_can_move');
    select count(*) into w from public.starting_points sp
      join public.person_day_types d on d.id = sp.day_type_id and d.user_id = sp.user_id
    where sp.user_id = a and d.name = 'Rest day';
    res := res || pg_temp.mom134_c('A value the person said is saved but has no mark', v = 0 and w = 0, format('%s, %s', v, w));

    select count(*) into v from public.person_settings where user_id = a and week_start = 1 and planning_time = '18:00:00';
    select count(*) into w from public.targets where user_id = a and aspiration = 3;
    res := res || pg_temp.mom134_c('The unmarked values are there to be marked, so the check above is not empty', v = 1 and w = 1, format('%s, %s', v, w));

    select id into m_a from public.starting_points where user_id = a and subject_kind = 'person' and field = 'day_end';
    select id into m_a2 from public.starting_points where user_id = a and subject_kind = 'person' and field = 'planning_weekday';
    select id into goal_a from public.goals where user_id = a;
    select id into item_a from public.work_items where user_id = a;

    -- First setup only, as before.
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    r := pg_temp.mom134_save(payload_a);
    reset role;
    select count(*) into v from public.starting_points where user_id = a;
    res := res || pg_temp.mom134_c('A second setup by the same person is still refused, and adds no mark',
      (r ->> 'code') = 'MS001' and v = 9, format('%s, %s marks', r ->> 'code', v));

    -- -----------------------------------------------------------------------
    -- An older app's payload (user e): the pull request has not merged yet, so this is what production still sends
    -- -----------------------------------------------------------------------

    payload_old := $j${
      "person": {"time_zone": "America/Chicago", "week_start": 1, "day_end": "21:00:00", "planning_weekday": 7,
        "planning_time": "18:00:00"},
      "day_types": [{"name": "Work day", "capacity_unit": "hours", "capacity_amount": 2}],
      "priorities": [],
      "goals": [{"key": "g", "title": "Lift more", "start_date": "2026-10-29", "shape": "ongoing", "block_weeks": 10,
        "state": "active",
        "targets": [{"key": "gym", "title": "Gym visits", "measure": "count", "role": "effort", "period_kind": "day_slots",
          "slot_weekdays": [1, 3], "floor": 2, "aspiration": 3, "carry_over_kind": "habit", "sources": [{"kind": "manual"}]}],
        "items": [{"key": "plan", "kind": "deadline_task", "title": "Book a trainer", "due_date": "2026-11-15",
          "date_can_move": false, "estimate_minutes": 60, "steps": []}]}]}$j$;

    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
    r := pg_temp.mom134_save(payload_old);
    reset role;
    res := res || pg_temp.mom134_c('An older payload with no starting_points saves exactly as before', (r ->> 'ok') = 'true', r::text);
    res := res || pg_temp.mom134_c('Its answer is the same as under 016',
      (r -> 'result') = jsonb_build_object('goals', 1, 'targets', 1, 'work_items', 1, 'steps', 0, 'bindings', 1),
      (r -> 'result')::text);

    select count(*) into v from public.person_settings where user_id = e;
    select count(*) into w from public.person_day_types where user_id = e;
    res := res || pg_temp.mom134_c('Every row of it was written, and no mark',
      v = 1 and w = 1
        and (select count(*) from public.goals where user_id = e) = 1
        and (select count(*) from public.targets where user_id = e) = 1
        and (select count(*) from public.work_items where user_id = e) = 1
        and (select count(*) from public.starting_points where user_id = e) = 0);

    -- Every field the app can send is accepted for its kind (16 in all: 4 + 1 + 4 + 5 + 2).
    insert into public.starting_points (user_id, subject_kind, day_type_id, goal_id, target_id, work_item_id, field)
    select e, 'person', null::uuid, null::uuid, null::uuid, null::uuid, f from unnest(array['day_end', 'week_start', 'planning_weekday', 'planning_time']) f
    union all select e, 'day_type', (select id from public.person_day_types where user_id = e), null::uuid, null::uuid, null::uuid, 'capacity_amount'
    union all select e, 'goal', null::uuid, g.id, null::uuid, null::uuid, f from public.goals g, unnest(array['start_date', 'end_date', 'block_weeks', 'return_date']) f where g.user_id = e
    union all select e, 'target', null::uuid, null::uuid, t.id, null::uuid, f from public.targets t, unnest(array['floor', 'aspiration', 'qualifying_threshold', 'due_date', 'slot_weekdays']) f where t.user_id = e
    union all select e, 'work_item', null::uuid, null::uuid, null::uuid, i.id, f from public.work_items i, unnest(array['due_date', 'estimate_minutes']) f where i.user_id = e;
    select count(*) into v from public.starting_points where user_id = e;
    res := res || pg_temp.mom134_c('Every field setup can record is accepted for its kind (16 of them)', v = 16, v::text);

    -- -----------------------------------------------------------------------
    -- A bad mark keeps nothing (user c)
    -- -----------------------------------------------------------------------

    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);

    r := pg_temp.mom134_save(replace(payload_a, '"starting_points": ["start_date", "block_weeks"]', '"starting_points": ["start_date", "title"]'));
    res := res || pg_temp.mom134_c('A goal mark for a field setup cannot record (title) is refused by the CHECK', (r ->> 'code') = '23514', r::text);

    r := pg_temp.mom134_save(replace(payload_a, '"starting_points": ["start_date", "block_weeks"]', '"starting_points": ["start_date", "start_date"]'));
    res := res || pg_temp.mom134_c('The same mark twice is refused by the unique index', (r ->> 'code') = '23505', r::text);

    r := pg_temp.mom134_save(replace(payload_a, '"starting_points": ["day_end", "planning_weekday"]', '"starting_points": ["floor"]'));
    res := res || pg_temp.mom134_c('A person mark for a target field (floor) is refused by the CHECK', (r ->> 'code') = '23514', r::text);

    r := pg_temp.mom134_save(replace(payload_a, '"starting_points": ["start_date", "block_weeks"]', '"starting_points": "start_date"'));
    res := res || pg_temp.mom134_c('A starting_points that is not a list is refused', (r ->> 'ok') = 'false', coalesce(r ->> 'code', 'saved'));

    r := pg_temp.mom134_save('{"starting_points": ["start_date"], "person": {}, "day_types": [], "priorities": [], "goals": []}');
    res := res || pg_temp.mom134_c('A starting_points at the top of the payload is still refused as an unknown key', (r ->> 'code') = '22023', r::text);
    reset role;

    select count(*) into v from public.person_settings where user_id = c;
    select count(*) into w from public.person_day_types where user_id = c;
    res := res || pg_temp.mom134_c('Nothing of any refused save was kept: no settings, day type, goal, target, item or mark',
      v = 0 and w = 0
        and (select count(*) from public.goals where user_id = c) = 0
        and (select count(*) from public.targets where user_id = c) = 0
        and (select count(*) from public.work_items where user_id = c) = 0
        and (select count(*) from public.starting_points where user_id = c) = 0);

    -- -----------------------------------------------------------------------
    -- A person reads and writes only their own marks (b has one of their own)
    -- -----------------------------------------------------------------------

    payload_b := $j${
      "person": {"time_zone": "America/Chicago"}, "day_types": [], "priorities": [],
      "goals": [{"key": "g", "title": "Read more", "start_date": "2026-10-29", "shape": "ongoing", "state": "active",
        "starting_points": ["start_date"], "targets": [], "items": []}]}$j$;
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    r := pg_temp.mom134_save(payload_b);
    reset role;
    res := res || pg_temp.mom134_c('A second person can save their own setup with a mark', (r ->> 'ok') = 'true', r::text);
    select id into m_b from public.starting_points where user_id = b;

    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    select count(*) into v from public.starting_points;
    select count(*) into w from public.starting_points where id = m_b;
    res := res || pg_temp.mom134_c('A person reads their own 9 marks and none of anyone else''s', v = 9 and w = 0, format('%s, %s', v, w));

    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    select count(*) into v from public.starting_points;
    select count(*) into w from public.starting_points where id = m_a;
    res := res || pg_temp.mom134_c('The other person reads their own 1 mark and none of the first''s', v = 1 and w = 0, format('%s, %s', v, w));

    s := pg_temp.mom134_do(format($q$insert into public.starting_points (user_id, subject_kind, goal_id, field) values (%L, 'goal', %L, 'end_date')$q$, a, goal_a));
    res := res || pg_temp.mom134_c('Writing a mark in another person''s name is refused by row level security', s = '42501', s);

    s := pg_temp.mom134_do(format($q$insert into public.starting_points (user_id, subject_kind, goal_id, field) values (%L, 'goal', %L, 'end_date')$q$, b, goal_a));
    res := res || pg_temp.mom134_c('Pointing a mark of one''s own at another person''s goal is refused by the composite foreign key', s = '23503', s);

    s := pg_temp.mom134_do(format($q$update public.starting_points set answered_at = now(), outcome = 'kept' where id = %L$q$, m_a));
    reset role;
    select count(*) into v from public.starting_points where id = m_a and answered_at is null and outcome is null;
    res := res || pg_temp.mom134_c('Answering another person''s mark touches no row, and it stays unanswered', s = 'ok:0' and v = 1, format('%s, %s', s, v));

    -- -----------------------------------------------------------------------
    -- Answering: once, and nothing else about a mark can change (user a)
    -- -----------------------------------------------------------------------

    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

    s := pg_temp.mom134_do(format($q$update public.starting_points set answered_at = now(), outcome = 'kept' where id = %L$q$, m_a));
    res := res || pg_temp.mom134_c('A person can answer their own mark', s = 'ok:1', s);

    s := pg_temp.mom134_do(format($q$update public.starting_points set answered_at = now(), outcome = 'changed' where id = %L$q$, m_a));
    reset role;
    select count(*) into v from public.starting_points where id = m_a and outcome = 'kept';
    res := res || pg_temp.mom134_c('An answered mark cannot be answered again: the first answer stands', s = 'ok:0' and v = 1, format('%s, %s', s, v));

    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

    s := pg_temp.mom134_do(format($q$update public.starting_points set field = 'week_start' where id = %L$q$, m_a2));
    res := res || pg_temp.mom134_c('The field a mark names cannot be changed (no column privilege)', s = '42501', s);

    s := pg_temp.mom134_do(format($q$update public.starting_points set goal_id = %L where id = %L$q$, goal_a, m_a2));
    res := res || pg_temp.mom134_c('The row a mark points at cannot be changed either', s = '42501', s);

    s := pg_temp.mom134_do(format($q$update public.starting_points set answered_at = now(), outcome = 'maybe' where id = %L$q$, m_a2));
    res := res || pg_temp.mom134_c('An outcome other than kept or changed is refused', s = '23514', s);

    s := pg_temp.mom134_do(format($q$update public.starting_points set answered_at = now() where id = %L$q$, m_a2));
    res := res || pg_temp.mom134_c('An answered_at without an outcome is refused', s = '23514', s);

    s := pg_temp.mom134_do(format($q$delete from public.starting_points where id = %L$q$, m_a2));
    res := res || pg_temp.mom134_c('A person cannot delete a mark', s = '42501', s);

    s := pg_temp.mom134_do(format($q$insert into public.starting_points (user_id, subject_kind, goal_id, field, answered_at, outcome) values (%L, 'goal', %L, 'end_date', now(), 'kept')$q$, a, goal_a));
    res := res || pg_temp.mom134_c('A new mark cannot be born answered', s = '42501', s);

    s := pg_temp.mom134_do(format($q$insert into public.starting_points (user_id, subject_kind, goal_id, field) values (%L, 'goal', %L, 'start_date')$q$, a, goal_a));
    res := res || pg_temp.mom134_c('A value cannot be marked twice', s = '23505', s);

    s := pg_temp.mom134_do(format($q$insert into public.starting_points (user_id, subject_kind, goal_id, field) values (%L, 'goal', %L, 'floor')$q$, a, goal_a));
    res := res || pg_temp.mom134_c('A field that does not belong to the kind is refused (floor on a goal)', s = '23514', s);

    s := pg_temp.mom134_do(format($q$insert into public.starting_points (user_id, subject_kind, goal_id, work_item_id, field) values (%L, 'goal', %L, %L, 'end_date')$q$, a, goal_a, item_a));
    res := res || pg_temp.mom134_c('A mark that names two subjects is refused', s = '23514', s);

    s := pg_temp.mom134_do(format($q$insert into public.starting_points (user_id, subject_kind, goal_id, field) values (%L, 'goal', %L, 'end_date')$q$, a, goal_a));
    res := res || pg_temp.mom134_c('A person can add a mark of their own to their own goal', s = 'ok:1', s);

    -- anon and service_role cannot read the table at all.
    set local role anon;
    s := pg_temp.mom134_do('select count(*) from public.starting_points');
    res := res || pg_temp.mom134_c('anon cannot read it', s = '42501', s);
    reset role;
    set local role service_role;
    s := pg_temp.mom134_do('select count(*) from public.starting_points');
    res := res || pg_temp.mom134_c('service_role cannot read it', s = '42501', s);
    reset role;

    -- -----------------------------------------------------------------------
    -- Marks go with the value they mark, and with the account
    -- -----------------------------------------------------------------------

    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    s := pg_temp.mom134_do(format($q$delete from public.work_items where id = %L$q$, item_a));
    reset role;
    select count(*) into v from public.starting_points where work_item_id = item_a;
    res := res || pg_temp.mom134_c('Deleting a work item removes its marks', s = 'ok:1' and v = 0, format('%s, %s left', s, v));

    -- The throwaway accounts exist to be removed: counted first so "none remain" is not an empty claim.
    select count(*) into v from public.starting_points where user_id in (a, b, c, e);
    delete from auth.users where id in (a, b, c, e);
    select count(*) into w from public.starting_points where user_id in (a, b, c, e);
    res := res || pg_temp.mom134_c('Deleting the accounts removes every mark they had', v > 0 and w = 0, format('%s before; %s after', v, w));

    -- -----------------------------------------------------------------------
    -- Unchanged from 015 and 016: who may call the save
    -- -----------------------------------------------------------------------

    select string_agg(ro.rolname, ', ' order by ro.rolname) into s
    from pg_roles ro
    where ro.rolname in ('anon', 'authenticated', 'service_role')
      and has_function_privilege(ro.rolname, 'public.save_guided_setup(jsonb)', 'execute');
    res := res || pg_temp.mom134_c('Only signed-in users can execute the save, same as 015 and 016', s = 'authenticated', coalesce(s, 'nobody'));

    select count(*) into v from pg_proc where oid = 'public.save_guided_setup(jsonb)'::regprocedure and prosecdef;
    res := res || pg_temp.mom134_c('The save is still SECURITY INVOKER after CREATE OR REPLACE', v = 0);

    -- Undo every write above. The handler below expects exactly this exception.
    raise exception 'mom134_rollback';
  exception when others then
    if sqlerrm <> 'mom134_rollback' then
      res := res || pg_temp.mom134_c('The script ran to its end with no unexpected error', false, sqlstate || ' ' || sqlerrm);
    end if;
  end;

  -- -------------------------------------------------------------------------
  -- After the rollback: nothing is left
  -- -------------------------------------------------------------------------

  select count(*) into n_left from auth.users where email like 'mom134-verify-%';
  res := res || pg_temp.mom134_c('The rollback left no throwaway account behind', n_left = 0, format('%s left', n_left));

  select (select count(*) from public.users where id in (a, b, c, e))
       + (select count(*) from public.person_settings where user_id in (a, b, c, e))
       + (select count(*) from public.person_day_types where user_id in (a, b, c, e))
       + (select count(*) from public.person_priorities where user_id in (a, b, c, e))
       + (select count(*) from public.goals where user_id in (a, b, c, e))
       + (select count(*) from public.targets where user_id in (a, b, c, e))
       + (select count(*) from public.work_items where user_id in (a, b, c, e))
       + (select count(*) from public.work_item_steps where user_id in (a, b, c, e))
       + (select count(*) from public.sources where user_id in (a, b, c, e))
       + (select count(*) from public.target_sources where user_id in (a, b, c, e))
       + (select count(*) from public.starting_points where user_id in (a, b, c, e))
  into v;
  res := res || pg_temp.mom134_c('The rollback left no row for any of them in any table the script wrote to', v = 0, format('%s rows left', v));

  insert into mom134_results (n, check_name, passed, detail)
  select ord, e2 ->> 'c', (e2 ->> 'p')::boolean, e2 ->> 'd'
  from jsonb_array_elements(res) with ordinality as x (e2, ord);
end;
$$;

select * from mom134_results order by n;
