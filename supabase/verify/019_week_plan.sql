-- Verification for supabase/migrations/019_week_plan.sql (MOM-112 block 2).
-- Run in the Supabase SQL Editor or with `npm run verify:sql` (local) or `supabase db query --linked -f` (hosted).
--
-- LEAVES NOTHING BEHIND, on production or anywhere. Every write this script makes (two throwaway accounts, their goals,
-- work items, day types, picks and day kinds) is inside one inner BEGIN ... EXCEPTION block that always ends by raising
-- an exception, which makes Postgres undo the whole block, whatever the runner does with the session. The checks' results
-- are kept in a plain variable, which a rolled-back block does not undo, and are copied to the results table afterwards.
-- The last two checks run AFTER the rollback: no throwaway account is left, and no row for either account remains in
-- week_plan_picks, week_plan_day_types or any table the script wrote to. Because earlier checks count rows that did exist
-- for those accounts, "none remain" can only be true if the rollback worked.
--
-- What it proves:
--   - both tables exist with row level security, and the grants are exactly the intended ones (picks: SELECT, INSERT and
--     DELETE; day kinds: those, and UPDATE of the day_type_id column only; nothing for anon and service_role, not even on a
--     column), with person_day_types' own grants unchanged;
--   - the key a day kind points at (person_day_types' unique key on (id, user_id), added by 017) is there, and the day-kind
--     trigger exists and runs the existing set_updated_at, and 019 created no function of its own (so no new function is
--     executable by an API role, 012's rule);
--   - an item is picked for a day once, on as many days as the person likes, and a day holds as many items as they like;
--   - a pick cannot point at another person's item and cannot be written in another person's name;
--   - a pick can be removed but not edited; a date is one kind of day, the kind can be changed and cleared (but never the
--     date or the owner), and it cannot point at another person's day type or be written in another person's name;
--   - a person reads and removes only their own picks and day kinds;
--   - deleting an item removes its picks, deleting a day type removes its dates' kinds, and the account removes the rest.

drop table if exists pg_temp.mom112_results;
create temp table mom112_results (n int, check_name text, passed boolean, detail text);

create or replace function pg_temp.mom112_c(name text, passed boolean, detail text default '') returns jsonb
language sql as $$
  select jsonb_build_object('c', name, 'p', coalesce(passed, false), 'd', coalesce(detail, ''));
$$;

-- One statement, answered 'ok:<rows touched>' or the SQLSTATE it failed with.
create or replace function pg_temp.mom112_do(stmt text) returns text
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
  a uuid := gen_random_uuid();   -- plans their own week
  b uuid := gen_random_uuid();   -- another person, with a plan of their own
  s text;
  v int;
  w int;
  goal_a uuid;
  goal_b uuid;
  item_a1 uuid;   -- a milestone
  item_a2 uuid;   -- a deadline task
  item_b uuid;
  dt_a1 uuid;     -- 'Full day'
  dt_a2 uuid;     -- 'Light day'
  dt_b uuid;
  pick_a1 uuid;
  pick_a2 uuid;
  kind_a1 uuid;
  kind_b uuid;
  n_left int;
  res jsonb := '[]';
begin
  begin
    insert into auth.users (id, email)
    values (a, 'mom112-verify-a@example.invalid'), (b, 'mom112-verify-b@example.invalid');

    -- -----------------------------------------------------------------------
    -- The tables and what the API roles may do with them
    -- -----------------------------------------------------------------------

    select count(*) into v from pg_class
    where oid in ('public.week_plan_picks'::regclass, 'public.week_plan_day_types'::regclass) and relrowsecurity;
    res := res || pg_temp.mom112_c('week_plan_picks and week_plan_day_types exist and have row level security on', v = 2, format('%s of 2', v));

    select string_agg(p, ',' order by p) into s
    from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
    where has_table_privilege('authenticated', 'public.week_plan_picks', p);
    res := res || pg_temp.mom112_c('A signed-in person has table privileges SELECT, INSERT and DELETE only on picks', s = 'DELETE,INSERT,SELECT', coalesce(s, 'none'));

    select count(*) into v from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'week_plan_picks' and grantee = 'authenticated' and privilege_type = 'UPDATE';
    res := res || pg_temp.mom112_c('No column of a pick can be updated by a signed-in person either', v = 0, format('%s columns', v));

    select string_agg(p, ',' order by p) into s
    from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
    where has_table_privilege('authenticated', 'public.week_plan_day_types', p);
    res := res || pg_temp.mom112_c('A signed-in person has table privileges SELECT, INSERT and DELETE only on day kinds (UPDATE is by column)', s = 'DELETE,INSERT,SELECT', coalesce(s, 'none'));

    select string_agg(attname::text, ',' order by attname) into s
    from pg_attribute
    where attrelid = 'public.week_plan_day_types'::regclass and attnum > 0 and not attisdropped
      and has_column_privilege('authenticated', attrelid, attnum, 'UPDATE');
    res := res || pg_temp.mom112_c('A signed-in person may update only the day_type_id of a day kind', s = 'day_type_id', coalesce(s, 'none'));

    select count(*) into v from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p, unnest(array['public.week_plan_picks', 'public.week_plan_day_types']) t
    where has_table_privilege('anon', t, p) or has_table_privilege('service_role', t, p);
    select count(*) into w from unnest(array['SELECT', 'INSERT', 'UPDATE']) p, unnest(array['public.week_plan_picks', 'public.week_plan_day_types']) t
    where has_any_column_privilege('anon', t, p) or has_any_column_privilege('service_role', t, p);
    res := res || pg_temp.mom112_c('anon and service_role have no privilege on either table, not even on a column', v = 0 and w = 0, format('%s table and %s column privileges found', v, w));

    select count(*) into v from pg_policies
    where schemaname = 'public' and tablename = 'week_plan_picks' and roles = '{authenticated}';
    select count(*) into w from pg_policies
    where schemaname = 'public' and tablename = 'week_plan_day_types' and roles = '{authenticated}';
    res := res || pg_temp.mom112_c('Picks have three owner policies (select, insert, delete) and day kinds four, all for signed-in people', v = 3 and w = 4, format('%s and %s', v, w));

    select string_agg(p, ',' order by p) into s
    from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
    where has_table_privilege('authenticated', 'public.person_day_types', p);
    res := res || pg_temp.mom112_c('person_day_types has the same grants as before', s = 'DELETE,INSERT,SELECT,UPDATE', coalesce(s, 'none'));

    select count(*) into v from pg_constraint
    where conrelid = 'public.person_day_types'::regclass and contype = 'u' and conname = 'person_day_types_id_user_unique'
      and (select array_agg(attname::text order by attname) from pg_attribute where attrelid = conrelid and attnum = any (conkey)) = array['id', 'user_id'];
    res := res || pg_temp.mom112_c('person_day_types has the unique key on (id, user_id) that a day kind points at (from 017)', v = 1, v::text);

    select count(*) into v from pg_trigger
    where tgrelid = 'public.week_plan_day_types'::regclass and tgname = 'week_plan_day_types_set_updated_at' and tgenabled = 'O' and not tgisinternal;
    res := res || pg_temp.mom112_c('The day-kind table has its updated_at trigger', v = 1, v::text);

    -- 019 creates no function: the trigger reuses public.set_updated_at() from 001, so there is no new function for an API
    -- role to be able to execute (012's rule). set_updated_at()'s own privileges are not changed here (BACKLOG.md).
    select count(*) into v from pg_trigger
    where tgrelid = 'public.week_plan_day_types'::regclass and tgname = 'week_plan_day_types_set_updated_at'
      and tgfoid = 'public.set_updated_at()'::regprocedure;
    select count(*) into w from pg_proc where pronamespace = 'public'::regnamespace and proname like 'week_plan%';
    res := res || pg_temp.mom112_c('The trigger runs the existing public.set_updated_at, and no function of its own was created', v = 1 and w = 0, format('%s matching triggers, %s new functions', v, w));

    -- -----------------------------------------------------------------------
    -- Each person's own goal, items and day types (as themselves)
    -- -----------------------------------------------------------------------

    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

    s := pg_temp.mom112_do(format($q$insert into public.goals (user_id, title, start_date, shape) values (%L, 'Verify goal A', '2026-10-01', 'ongoing')$q$, a));
    select id into goal_a from public.goals where user_id = a;
    s := s || ',' || pg_temp.mom112_do(format($q$insert into public.work_items (user_id, goal_id, kind, title) values (%L, %L, 'milestone', 'Prep')$q$, a, goal_a));
    s := s || ',' || pg_temp.mom112_do(format($q$insert into public.work_items (user_id, goal_id, kind, title, due_date, date_can_move) values (%L, %L, 'deadline_task', 'File taxes', '2026-12-01', true)$q$, a, goal_a));
    s := s || ',' || pg_temp.mom112_do(format($q$insert into public.person_day_types (user_id, name, capacity_unit, capacity_amount) values (%L, 'Full day', 'hours', 3), (%L, 'Light day', 'sessions', 1)$q$, a, a));
    select id into item_a1 from public.work_items where user_id = a and kind = 'milestone';
    select id into item_a2 from public.work_items where user_id = a and kind = 'deadline_task';
    select id into dt_a1 from public.person_day_types where user_id = a and name = 'Full day';
    select id into dt_a2 from public.person_day_types where user_id = a and name = 'Light day';
    res := res || pg_temp.mom112_c('The first person can set up a goal, two items and two day types of their own', s = 'ok:1,ok:1,ok:1,ok:2', s);

    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);

    s := pg_temp.mom112_do(format($q$insert into public.goals (user_id, title, start_date, shape) values (%L, 'Verify goal B', '2026-10-01', 'ongoing')$q$, b));
    select id into goal_b from public.goals where user_id = b;
    s := s || ',' || pg_temp.mom112_do(format($q$insert into public.work_items (user_id, goal_id, kind, title) values (%L, %L, 'milestone', 'Their prep')$q$, b, goal_b));
    s := s || ',' || pg_temp.mom112_do(format($q$insert into public.person_day_types (user_id, name, capacity_unit, capacity_amount) values (%L, 'Full day', 'hours', 2)$q$, b));
    select id into item_b from public.work_items where user_id = b;
    select id into dt_b from public.person_day_types where user_id = b;
    res := res || pg_temp.mom112_c('The second person can set up a goal, an item and a day type of their own', s = 'ok:1,ok:1,ok:1', s);

    -- -----------------------------------------------------------------------
    -- Picks (user a): an item on a day, once; many days; many items on a day
    -- -----------------------------------------------------------------------

    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

    s := pg_temp.mom112_do(format($q$insert into public.week_plan_picks (user_id, work_item_id, plan_date) values (%L, %L, '2026-11-02')$q$, a, item_a1));
    res := res || pg_temp.mom112_c('A person can pick their own item for a day', s = 'ok:1', s);

    s := pg_temp.mom112_do(format($q$insert into public.week_plan_picks (user_id, work_item_id, plan_date) values (%L, %L, '2026-11-02')$q$, a, item_a1));
    res := res || pg_temp.mom112_c('The same item on the same day twice is refused by the unique key', s = '23505', s);

    s := pg_temp.mom112_do(format($q$insert into public.week_plan_picks (user_id, work_item_id, plan_date) values (%L, %L, '2026-11-03')$q$, a, item_a1));
    res := res || pg_temp.mom112_c('The same item on another day is fine', s = 'ok:1', s);

    s := pg_temp.mom112_do(format($q$insert into public.week_plan_picks (user_id, work_item_id, plan_date) values (%L, %L, '2026-11-02')$q$, a, item_a2));
    res := res || pg_temp.mom112_c('Another item on the same day is fine', s = 'ok:1', s);

    s := pg_temp.mom112_do(format($q$insert into public.week_plan_picks (user_id, work_item_id, plan_date) values (%L, %L, '2026-11-04')$q$, a, item_b));
    res := res || pg_temp.mom112_c('A pick of another person''s item is refused by the composite foreign key', s = '23503', s);

    s := pg_temp.mom112_do(format($q$insert into public.week_plan_picks (user_id, work_item_id, plan_date) values (%L, %L, '2026-11-04')$q$, b, item_b));
    res := res || pg_temp.mom112_c('Writing a pick in another person''s name is refused by row level security', s = '42501', s);

    select id into pick_a1 from public.week_plan_picks where user_id = a and work_item_id = item_a1 and plan_date = '2026-11-02';
    select id into pick_a2 from public.week_plan_picks where user_id = a and work_item_id = item_a1 and plan_date = '2026-11-03';

    s := pg_temp.mom112_do(format($q$update public.week_plan_picks set plan_date = '2026-11-09' where id = %L$q$, pick_a1));
    res := res || pg_temp.mom112_c('A pick cannot be edited, only added and removed', s = '42501', s);

    select count(*) into v from public.week_plan_picks;
    res := res || pg_temp.mom112_c('Only the three good picks exist, none of the refused ones', v = 3, v::text);

    -- -----------------------------------------------------------------------
    -- Picks: each person reads and removes only their own (b has one of their own)
    -- -----------------------------------------------------------------------

    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);

    s := pg_temp.mom112_do(format($q$insert into public.week_plan_picks (user_id, work_item_id, plan_date) values (%L, %L, '2026-11-02')$q$, b, item_b));
    res := res || pg_temp.mom112_c('The other person can pick their own item for the same date', s = 'ok:1', s);

    select count(*) into v from public.week_plan_picks;
    select count(*) into w from public.week_plan_picks where id in (pick_a1, pick_a2);
    res := res || pg_temp.mom112_c('A person reads their own 1 pick and none of anyone else''s', v = 1 and w = 0, format('%s, %s', v, w));

    s := pg_temp.mom112_do(format($q$delete from public.week_plan_picks where id = %L$q$, pick_a1));
    res := res || pg_temp.mom112_c('Removing another person''s pick touches no row', s = 'ok:0', s);

    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

    select count(*) into v from public.week_plan_picks;
    res := res || pg_temp.mom112_c('The first person still has all three picks', v = 3, v::text);

    s := pg_temp.mom112_do(format($q$delete from public.week_plan_picks where id = %L$q$, pick_a2));
    select count(*) into v from public.week_plan_picks;
    res := res || pg_temp.mom112_c('A person can remove their own pick', s = 'ok:1' and v = 2, format('%s, %s', s, v));

    -- -----------------------------------------------------------------------
    -- Day kinds (user a): a date is one kind, which can be changed and cleared
    -- -----------------------------------------------------------------------

    s := pg_temp.mom112_do(format($q$insert into public.week_plan_day_types (user_id, plan_date, day_type_id) values (%L, '2026-11-02', %L)$q$, a, dt_a1));
    res := res || pg_temp.mom112_c('A person can say what kind of day one of their dates is, from their own day types', s = 'ok:1', s);

    s := pg_temp.mom112_do(format($q$insert into public.week_plan_day_types (user_id, plan_date, day_type_id) values (%L, '2026-11-02', %L)$q$, a, dt_a2));
    res := res || pg_temp.mom112_c('A second kind for the same date is refused by the unique key', s = '23505', s);

    select id into kind_a1 from public.week_plan_day_types where user_id = a and plan_date = '2026-11-02';
    s := pg_temp.mom112_do(format($q$update public.week_plan_day_types set day_type_id = %L where id = %L$q$, dt_a2, kind_a1));
    select count(*) into v from public.week_plan_day_types where id = kind_a1 and day_type_id = dt_a2;
    res := res || pg_temp.mom112_c('The kind of a date can be changed', s = 'ok:1' and v = 1, format('%s, %s', s, v));

    -- Only the kind can change: not the date, not the owner, and not the kind along with either.
    s := pg_temp.mom112_do(format($q$update public.week_plan_day_types set plan_date = '2026-11-09' where id = %L$q$, kind_a1));
    res := res || pg_temp.mom112_c('Updating the date of a day kind is refused', s = '42501', s);

    s := pg_temp.mom112_do(format($q$update public.week_plan_day_types set user_id = %L where id = %L$q$, b, kind_a1));
    res := res || pg_temp.mom112_c('Updating the owner of a day kind is refused', s = '42501', s);

    s := pg_temp.mom112_do(format($q$update public.week_plan_day_types set day_type_id = %L, plan_date = '2026-11-09' where id = %L$q$, dt_a1, kind_a1));
    select count(*) into v from public.week_plan_day_types where id = kind_a1 and user_id = a and plan_date = '2026-11-02' and day_type_id = dt_a2;
    res := res || pg_temp.mom112_c('A change of kind that also changes the date is refused whole, and the row is as it was', s = '42501' and v = 1, format('%s, %s', s, v));

    s := pg_temp.mom112_do(format($q$insert into public.week_plan_day_types (user_id, plan_date, day_type_id) values (%L, '2026-11-03', %L)$q$, a, dt_b));
    res := res || pg_temp.mom112_c('A kind that points at another person''s day type is refused by the composite foreign key', s = '23503', s);

    s := pg_temp.mom112_do(format($q$insert into public.week_plan_day_types (user_id, plan_date, day_type_id) values (%L, '2026-11-03', %L)$q$, b, dt_b));
    res := res || pg_temp.mom112_c('Writing a kind in another person''s name is refused by row level security', s = '42501', s);

    s := pg_temp.mom112_do(format($q$update public.week_plan_day_types set day_type_id = %L where id = %L$q$, dt_b, kind_a1));
    select count(*) into v from public.week_plan_day_types where id = kind_a1 and day_type_id = dt_a2;
    res := res || pg_temp.mom112_c('Changing a kind to point at another person''s day type is refused too, and the kind is as it was', s = '23503' and v = 1, format('%s, %s', s, v));

    s := pg_temp.mom112_do(format($q$insert into public.week_plan_day_types (user_id, plan_date, day_type_id) values (%L, '2026-11-03', %L)$q$, a, dt_a1));
    s := pg_temp.mom112_do(format($q$delete from public.week_plan_day_types where user_id = %L and plan_date = '2026-11-03'$q$, a));
    select count(*) into v from public.week_plan_day_types;
    res := res || pg_temp.mom112_c('A person can clear the kind of a date', s = 'ok:1' and v = 1, format('%s, %s', s, v));

    -- Each person reads and changes only their own (b has a kind of their own)
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);

    s := pg_temp.mom112_do(format($q$insert into public.week_plan_day_types (user_id, plan_date, day_type_id) values (%L, '2026-11-02', %L)$q$, b, dt_b));
    res := res || pg_temp.mom112_c('The other person can say what kind of day the same date is for them', s = 'ok:1', s);
    select id into kind_b from public.week_plan_day_types where user_id = b;

    select count(*) into v from public.week_plan_day_types;
    select count(*) into w from public.week_plan_day_types where id = kind_a1;
    res := res || pg_temp.mom112_c('A person reads their own 1 day kind and none of anyone else''s', v = 1 and w = 0, format('%s, %s', v, w));

    s := pg_temp.mom112_do(format($q$update public.week_plan_day_types set day_type_id = %L where id = %L$q$, dt_b, kind_a1));
    res := res || pg_temp.mom112_c('Changing another person''s day kind touches no row', s = 'ok:0', s);

    s := pg_temp.mom112_do(format($q$delete from public.week_plan_day_types where id = %L$q$, kind_a1));
    res := res || pg_temp.mom112_c('Clearing another person''s day kind touches no row', s = 'ok:0', s);

    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    select count(*) into v from public.week_plan_day_types where id = kind_a1 and day_type_id = dt_a2;
    res := res || pg_temp.mom112_c('The first person''s day kind is as they left it', v = 1, v::text);

    -- anon and service_role cannot read either table at all.
    reset role;
    set local role anon;
    s := pg_temp.mom112_do('select count(*) from public.week_plan_picks');
    res := res || pg_temp.mom112_c('anon cannot read picks', s = '42501', s);
    s := pg_temp.mom112_do('select count(*) from public.week_plan_day_types');
    res := res || pg_temp.mom112_c('anon cannot read day kinds', s = '42501', s);
    reset role;
    set local role service_role;
    s := pg_temp.mom112_do('select count(*) from public.week_plan_picks');
    res := res || pg_temp.mom112_c('service_role cannot read picks', s = '42501', s);
    s := pg_temp.mom112_do('select count(*) from public.week_plan_day_types');
    res := res || pg_temp.mom112_c('service_role cannot read day kinds', s = '42501', s);
    reset role;

    -- -----------------------------------------------------------------------
    -- A pick goes with its item, a day kind with its day type (the person deletes them as themselves)
    -- -----------------------------------------------------------------------

    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

    select count(*) into v from public.week_plan_picks where work_item_id = item_a2;
    s := pg_temp.mom112_do(format($q$delete from public.work_items where id = %L$q$, item_a2));
    select count(*) into w from public.week_plan_picks where work_item_id = item_a2;
    res := res || pg_temp.mom112_c('Deleting an item removes its picks', s = 'ok:1' and v = 1 and w = 0, format('%s, %s before, %s after', s, v, w));

    select count(*) into v from public.week_plan_day_types where day_type_id = dt_a2;
    s := pg_temp.mom112_do(format($q$delete from public.person_day_types where id = %L$q$, dt_a2));
    select count(*) into w from public.week_plan_day_types where day_type_id = dt_a2;
    res := res || pg_temp.mom112_c('Deleting a day type removes the kinds that used it', s = 'ok:1' and v = 1 and w = 0, format('%s, %s before, %s after', s, v, w));

    reset role;

    -- -----------------------------------------------------------------------
    -- Everything goes with the account. The throwaway accounts exist to be removed: counted first so "none remain" is not
    -- an empty claim.
    -- -----------------------------------------------------------------------

    select count(*) into v from public.week_plan_picks where user_id in (a, b);
    select count(*) into w from public.week_plan_day_types where user_id in (a, b);
    delete from auth.users where id in (a, b);
    res := res || pg_temp.mom112_c('Deleting the accounts removes every pick and day kind they had',
      v = 2 and w = 1
        and (select count(*) from public.week_plan_picks where user_id in (a, b)) = 0
        and (select count(*) from public.week_plan_day_types where user_id in (a, b)) = 0,
      format('%s picks and %s day kinds before', v, w));

    -- Undo every write above. The handler below expects exactly this exception.
    raise exception 'mom112_rollback';
  exception when others then
    if sqlerrm <> 'mom112_rollback' then
      res := res || pg_temp.mom112_c('The script ran to its end with no unexpected error', false, sqlstate || ' ' || sqlerrm);
    end if;
  end;

  -- -------------------------------------------------------------------------
  -- After the rollback: nothing is left
  -- -------------------------------------------------------------------------

  select count(*) into n_left from auth.users where email like 'mom112-verify-%';
  res := res || pg_temp.mom112_c('The rollback left no throwaway account behind', n_left = 0, format('%s left', n_left));

  select (select count(*) from public.users where id in (a, b))
       + (select count(*) from public.week_plan_picks where user_id in (a, b))
       + (select count(*) from public.week_plan_day_types where user_id in (a, b))
       + (select count(*) from public.person_day_types where user_id in (a, b))
       + (select count(*) from public.work_items where user_id in (a, b))
       + (select count(*) from public.goals where user_id in (a, b))
  into v;
  res := res || pg_temp.mom112_c('The rollback left no row for either of them in any table the script wrote to', v = 0, format('%s rows left', v));

  insert into mom112_results (n, check_name, passed, detail)
  select ord, e2 ->> 'c', (e2 ->> 'p')::boolean, e2 ->> 'd'
  from jsonb_array_elements(res) with ordinality as x (e2, ord);
end;
$$;

select * from mom112_results order by n;
