-- Verification for supabase/migrations/020_target_changes.sql (MOM-146).
-- Run in the Supabase SQL Editor or with `npm run verify:sql` (local) or `supabase db query --linked -f` (hosted).
--
-- LEAVES NOTHING BEHIND, on production or anywhere. Every write this script makes (two throwaway accounts, their goals,
-- targets and changes) is inside one inner BEGIN ... EXCEPTION block that always ends by raising an exception, which makes
-- Postgres undo the whole block, whatever the runner does with the session. The checks' results are kept in a plain
-- variable, which a rolled-back block does not undo, and are copied to the results table afterwards. The last two checks
-- run AFTER the rollback: no throwaway account is left, and no row for either account remains in any table that holds a user.
--
-- What it proves:
--   - target_changes exists with row level security, and the grants are exactly SELECT and INSERT for a signed-in person
--     and nothing for anon and service_role;
--   - a person can write a change for their own target, and several for the same date (a second save is a second row, no
--     unique key), and the newest created_at is the one that wins;
--   - the database, not the app, says when it was saved, whatever an insert sends;
--   - the checks that can fail: a floor of 0, an aspiration below the floor, an empty or out-of-range or repeated-day list;
--   - a change for another person's target is refused (the composite foreign key), as is one in another person's name (RLS);
--   - a person reads only their own changes, and can neither rewrite nor delete one;
--   - the trigger function is not callable through the API;
--   - changes go with the account.

drop table if exists pg_temp.mom146_results;
create temp table mom146_results (n int, check_name text, passed boolean, detail text);

create or replace function pg_temp.mom146_c(name text, passed boolean, detail text default '') returns jsonb
language sql as $$
  select jsonb_build_object('c', name, 'p', coalesce(passed, false), 'd', coalesce(detail, ''));
$$;

-- One statement, answered 'ok:<rows touched>' or the SQLSTATE it failed with.
create or replace function pg_temp.mom146_do(stmt text) returns text
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
  a uuid := gen_random_uuid();   -- writes and reads their own changes
  b uuid := gen_random_uuid();   -- another person, with a target of their own
  goal_a uuid;
  goal_b uuid;
  t_a uuid;       -- a's weekly target
  t_slots uuid;   -- a's day-slots target
  t_b uuid;       -- b's target
  s text;
  v int;
  w int;
  first_id uuid;
  second_id uuid;
  n_left int;
  res jsonb := '[]';
begin
  begin
    insert into auth.users (id, email)
    values (a, 'mom146-verify-a@example.invalid'), (b, 'mom146-verify-b@example.invalid');

    insert into public.goals (user_id, title, start_date, shape) values (a, 'verify goal a', '2026-10-05', 'ongoing') returning id into goal_a;
    insert into public.goals (user_id, title, start_date, shape) values (b, 'verify goal b', '2026-10-05', 'ongoing') returning id into goal_b;
    insert into public.targets (user_id, goal_id, title, measure, role, period_kind, floor, aspiration, carry_over_kind)
    values (a, goal_a, 'verify workouts', 'count', 'effort', 'weekly', 3, 5, 'habit') returning id into t_a;
    insert into public.targets (user_id, goal_id, title, measure, role, period_kind, slot_weekdays, floor, carry_over_kind)
    values (a, goal_a, 'verify walks', 'count', 'effort', 'day_slots', array[1, 3, 5]::smallint[], 2, 'habit') returning id into t_slots;
    insert into public.targets (user_id, goal_id, title, measure, role, period_kind, floor, carry_over_kind)
    values (b, goal_b, 'verify b workouts', 'count', 'effort', 'weekly', 2, 'habit') returning id into t_b;

    -- -----------------------------------------------------------------------
    -- The table and what the API roles may do with it
    -- -----------------------------------------------------------------------

    select count(*) into v from pg_class
    where oid = 'public.target_changes'::regclass and relrowsecurity;
    res := res || pg_temp.mom146_c('target_changes exists and has row level security on', v = 1);

    select string_agg(p, ',' order by p) into s
    from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
    where has_table_privilege('authenticated', 'public.target_changes', p);
    res := res || pg_temp.mom146_c('A signed-in person has table privileges SELECT and INSERT only', s = 'INSERT,SELECT', coalesce(s, 'none'));

    select count(*) into v from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'target_changes' and grantee = 'authenticated' and privilege_type in ('UPDATE', 'DELETE');
    res := res || pg_temp.mom146_c('No column of it can be updated by a signed-in person either', v = 0, format('%s columns', v));

    select count(*) into v from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
    where has_table_privilege('anon', 'public.target_changes', p) or has_table_privilege('service_role', 'public.target_changes', p);
    res := res || pg_temp.mom146_c('anon and service_role have no privilege on it', v = 0, format('%s privileges found', v));

    select count(*) into v from pg_indexes
    where schemaname = 'public' and tablename = 'target_changes' and indexdef ilike '%unique%' and indexname <> 'target_changes_pkey';
    res := res || pg_temp.mom146_c('It has no unique key besides its primary key: a second save for the same date is a second row', v = 0, format('%s unique indexes', v));

    -- -----------------------------------------------------------------------
    -- A person writes changes for their own targets (user a)
    -- -----------------------------------------------------------------------

    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

    s := pg_temp.mom146_do(format($q$insert into public.target_changes (user_id, target_id, effective_from, floor, aspiration) values (%L, %L, '2026-11-02', 4, 6)$q$, a, t_a));
    res := res || pg_temp.mom146_c('A person can write a change for their own weekly target', s = 'ok:1', s);

    s := pg_temp.mom146_do(format($q$insert into public.target_changes (user_id, target_id, effective_from, floor, aspiration) values (%L, %L, '2026-11-02', 3, null)$q$, a, t_a));
    res := res || pg_temp.mom146_c('A second change for the same target and date is accepted (no unique key, no upsert)', s = 'ok:1', s);

    select count(*) into v from public.target_changes where target_id = t_a and effective_from = '2026-11-02';
    res := res || pg_temp.mom146_c('Both rows are kept', v = 2, v::text);

    select id into first_id from public.target_changes where user_id = a and target_id = t_a and effective_from = '2026-11-02' order by created_at, id limit 1;
    select id into second_id from public.target_changes where user_id = a and target_id = t_a and effective_from = '2026-11-02' order by created_at desc, id desc limit 1;
    select count(*) into v from public.target_changes where id = second_id and floor = 3 and aspiration is null;
    res := res || pg_temp.mom146_c('The newest created_at is the second save, so it is the one that wins', v = 1 and first_id <> second_id, v::text);

    s := pg_temp.mom146_do(format($q$insert into public.target_changes (user_id, target_id, effective_from, floor, aspiration, slot_weekdays) values (%L, %L, '2026-11-02', 2, 3, array[1, 2, 4]::smallint[])$q$, a, t_slots));
    res := res || pg_temp.mom146_c('A change to a day-slots target can name its days', s = 'ok:1', s);

    -- -----------------------------------------------------------------------
    -- When it was saved is the database's to say, whatever an insert sends
    -- -----------------------------------------------------------------------

    s := pg_temp.mom146_do(format($q$insert into public.target_changes (user_id, target_id, effective_from, floor, created_at) values (%L, %L, '2026-11-09', 5, now() - interval '7 days')$q$, a, t_a));
    res := res || pg_temp.mom146_c('An insert that sends a created_at a week in the past is accepted', s = 'ok:1', s);

    select count(*) into v from public.target_changes
    where target_id = t_a and effective_from = '2026-11-09' and abs(extract(epoch from now() - created_at)) < 60;
    res := res || pg_temp.mom146_c('It reads back within a minute of now, not a week ago', v = 1, v::text);

    s := pg_temp.mom146_do(format($q$insert into public.target_changes (user_id, target_id, effective_from, floor, created_at) values (%L, %L, '2026-11-16', 5, now() + interval '7 days')$q$, a, t_a));
    select count(*) into v from public.target_changes
    where target_id = t_a and effective_from = '2026-11-16' and abs(extract(epoch from now() - created_at)) < 60;
    res := res || pg_temp.mom146_c('A created_at a week ahead is replaced too', s = 'ok:1' and v = 1, format('%s, %s', s, v));

    -- -----------------------------------------------------------------------
    -- The checks that can fail
    -- -----------------------------------------------------------------------

    s := pg_temp.mom146_do(format($q$insert into public.target_changes (user_id, target_id, effective_from, floor) values (%L, %L, '2026-12-07', 0)$q$, a, t_a));
    res := res || pg_temp.mom146_c('A floor of 0 is refused', s = '23514', s);

    s := pg_temp.mom146_do(format($q$insert into public.target_changes (user_id, target_id, effective_from, floor) values (%L, %L, '2026-12-07', -1)$q$, a, t_a));
    res := res || pg_temp.mom146_c('A negative floor is refused', s = '23514', s);

    s := pg_temp.mom146_do(format($q$insert into public.target_changes (user_id, target_id, effective_from, floor) values (%L, %L, '2026-12-07', null)$q$, a, t_a));
    res := res || pg_temp.mom146_c('A change with no floor is refused', s = '23502', s);

    s := pg_temp.mom146_do(format($q$insert into public.target_changes (user_id, target_id, effective_from, floor, aspiration) values (%L, %L, '2026-12-07', 4, 3)$q$, a, t_a));
    res := res || pg_temp.mom146_c('An aspiration below the floor is refused', s = '23514', s);

    s := pg_temp.mom146_do(format($q$insert into public.target_changes (user_id, target_id, effective_from, floor, slot_weekdays) values (%L, %L, '2026-12-07', 2, array[]::smallint[])$q$, a, t_slots));
    res := res || pg_temp.mom146_c('An empty list of days is refused', s = '23514', s);

    s := pg_temp.mom146_do(format($q$insert into public.target_changes (user_id, target_id, effective_from, floor, slot_weekdays) values (%L, %L, '2026-12-07', 2, array[1, 8]::smallint[])$q$, a, t_slots));
    res := res || pg_temp.mom146_c('A day outside 1 to 7 is refused', s = '23514', s);

    s := pg_temp.mom146_do(format($q$insert into public.target_changes (user_id, target_id, effective_from, floor) values (%L, %L, null, 2)$q$, a, t_a));
    res := res || pg_temp.mom146_c('A change with no date is refused', s = '23502', s);

    -- Nothing refused above left a row behind: two for 11-02 on the weekly target, one for the slots target, two sent created_at.
    select count(*) into v from public.target_changes where user_id = a;
    res := res || pg_temp.mom146_c('Only the five good changes exist, none of the refused ones', v = 5, v::text);

    -- -----------------------------------------------------------------------
    -- A person reads and writes only their own changes (b has a target, and then a change, of their own)
    -- -----------------------------------------------------------------------

    s := pg_temp.mom146_do(format($q$insert into public.target_changes (user_id, target_id, effective_from, floor) values (%L, %L, '2026-12-07', 2)$q$, a, t_b));
    res := res || pg_temp.mom146_c('A change for another person''s target, in one''s own name, is refused by the composite foreign key', s = '23503', s);

    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);

    s := pg_temp.mom146_do(format($q$insert into public.target_changes (user_id, target_id, effective_from, floor) values (%L, %L, '2026-11-02', 3)$q$, b, t_b));
    res := res || pg_temp.mom146_c('Another person can write a change for their own target', s = 'ok:1', s);

    select count(*) into v from public.target_changes;
    select count(*) into w from public.target_changes where target_id in (t_a, t_slots);
    res := res || pg_temp.mom146_c('A person reads their own 1 change and none of anyone else''s', v = 1 and w = 0, format('%s, %s', v, w));

    s := pg_temp.mom146_do(format($q$insert into public.target_changes (user_id, target_id, effective_from, floor) values (%L, %L, '2026-12-07', 2)$q$, a, t_a));
    res := res || pg_temp.mom146_c('Writing a change in another person''s name is refused by row level security', s = '42501', s);

    s := pg_temp.mom146_do(format($q$insert into public.target_changes (user_id, target_id, effective_from, floor) values (%L, %L, '2026-12-07', 2)$q$, b, t_a));
    res := res || pg_temp.mom146_c('Writing a change for another person''s target, in one''s own name, is refused too', s = '23503', s);

    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    select count(*) into v from public.target_changes;
    select count(*) into w from public.target_changes where target_id = t_b;
    res := res || pg_temp.mom146_c('The first person reads their own 5 changes and none of the other''s', v = 5 and w = 0, format('%s, %s', v, w));

    -- -----------------------------------------------------------------------
    -- A change is what was saved: it cannot be rewritten or removed
    -- -----------------------------------------------------------------------

    s := pg_temp.mom146_do(format($q$update public.target_changes set floor = 9 where id = %L$q$, first_id));
    res := res || pg_temp.mom146_c('A person cannot rewrite their own change', s = '42501', s);

    s := pg_temp.mom146_do(format($q$delete from public.target_changes where id = %L$q$, first_id));
    res := res || pg_temp.mom146_c('A person cannot delete their own change', s = '42501', s);

    select count(*) into v from public.target_changes where id = first_id and floor = 4 and aspiration = 6;
    res := res || pg_temp.mom146_c('The change is exactly as it was written', v = 1, v::text);

    -- anon and service_role cannot read the table at all.
    reset role;
    set local role anon;
    s := pg_temp.mom146_do('select count(*) from public.target_changes');
    res := res || pg_temp.mom146_c('anon cannot read it', s = '42501', s);
    reset role;
    set local role service_role;
    s := pg_temp.mom146_do('select count(*) from public.target_changes');
    res := res || pg_temp.mom146_c('service_role cannot read it', s = '42501', s);
    reset role;

    -- -----------------------------------------------------------------------
    -- The trigger function is not callable through the API (the rule of 012)
    -- -----------------------------------------------------------------------

    select count(*) into v from pg_trigger t
    where t.tgrelid = 'public.target_changes'::regclass and t.tgname = 'target_changes_set_created_at'
      and t.tgenabled = 'O' and not t.tgisinternal
      and (t.tgtype & 1) = 1 and (t.tgtype & 2) = 2 and (t.tgtype & 4) = 4
      and t.tgfoid = 'public.target_changes_set_created_at()'::regprocedure;
    res := res || pg_temp.mom146_c('target_changes_set_created_at is an enabled BEFORE INSERT row trigger that runs the function', v = 1, format('%s matching triggers', v));

    select string_agg(r, ', ' order by r) into s
    from unnest(array['anon', 'authenticated', 'service_role']) r
    where has_function_privilege(r, 'public.target_changes_set_created_at()', 'execute');
    res := res || pg_temp.mom146_c('anon, authenticated and service_role cannot execute the trigger function', s is null, coalesce(s, 'none can'));

    select count(*) into v from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where p.oid = 'public.target_changes_set_created_at()'::regprocedure and acl.grantee = 0 and acl.privilege_type = 'EXECUTE';
    res := res || pg_temp.mom146_c('PUBLIC cannot execute the trigger function either', v = 0, format('%s PUBLIC grants', v));

    select string_agg(r, ', ' order by r) into s
    from unnest(array['anon', 'authenticated', 'service_role']) r
    where pg_temp.mom146_do(format('set local role %I; select public.target_changes_set_created_at()', r)) <> '42501';
    reset role;
    res := res || pg_temp.mom146_c('Calling the trigger function directly is refused by privilege for each of the three', s is null, coalesce(s, 'refused for all'));

    -- -----------------------------------------------------------------------
    -- Changes go with the account. The throwaway accounts exist to be removed: counted first so "none remain" is not an
    -- empty claim.
    -- -----------------------------------------------------------------------

    select count(*) into v from public.target_changes where user_id in (a, b);
    delete from auth.users where id in (a, b);
    res := res || pg_temp.mom146_c('Deleting the accounts removes every change they had',
      v = 6 and (select count(*) from public.target_changes where user_id in (a, b)) = 0,
      format('%s changes before', v));

    -- Undo every write above. The handler below expects exactly this exception.
    raise exception 'mom146_rollback';
  exception when others then
    if sqlerrm <> 'mom146_rollback' then
      res := res || pg_temp.mom146_c('The script ran to its end with no unexpected error', false, sqlstate || ' ' || sqlerrm);
    end if;
  end;

  -- -------------------------------------------------------------------------
  -- After the rollback: nothing is left
  -- -------------------------------------------------------------------------

  select count(*) into n_left from auth.users where email like 'mom146-verify-%';
  res := res || pg_temp.mom146_c('The rollback left no throwaway account behind', n_left = 0, format('%s left', n_left));

  select (select count(*) from public.users where id in (a, b))
       + (select count(*) from public.goals where user_id in (a, b))
       + (select count(*) from public.targets where user_id in (a, b))
       + (select count(*) from public.target_changes where user_id in (a, b))
  into v;
  res := res || pg_temp.mom146_c('The rollback left no goal, target, change or user row for either of them', v = 0, format('%s rows left', v));

  insert into mom146_results (n, check_name, passed, detail)
  select ord, e2 ->> 'c', (e2 ->> 'p')::boolean, e2 ->> 'd'
  from jsonb_array_elements(res) with ordinality as x (e2, ord);
end;
$$;

select * from mom146_results order by n;
