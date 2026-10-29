-- Verification for supabase/migrations/018_weekly_reviews.sql (MOM-113 block 3.2).
-- Run in the Supabase SQL Editor or with `npm run verify:sql` (local) or `supabase db query --linked -f` (hosted).
--
-- LEAVES NOTHING BEHIND, on production or anywhere. Every write this script makes (two throwaway accounts, their weekly
-- reviews and their usage-log rows) is inside one inner BEGIN ... EXCEPTION block that always ends by raising an
-- exception, which makes Postgres undo the whole block, whatever the runner does with the session. The checks' results
-- are kept in a plain variable, which a rolled-back block does not undo, and are copied to the results table afterwards.
-- The last two checks run AFTER the rollback: no throwaway account is left, and no row for either account remains in
-- weekly_reviews, llm_usage_logs or any table that holds a user. Because earlier checks count rows that did exist for
-- those accounts, "none remain" can only be true if the rollback worked.
--
-- What it proves:
--   - weekly_reviews exists with row level security, and the grants are exactly SELECT and INSERT for a signed-in person
--     and nothing for anon and service_role;
--   - a finished review is written once per week: a second record for the same week is refused, another week is not;
--   - the checks that can fail: a week that is not seven days, a recap that is not an object, an adjustment that is
--     half there, an unknown kind, an unknown outcome, a non-object adjustment; and each of the six kinds and three
--     outcomes of section 3.2 is accepted;
--   - the database, not the app, says when it was finished;
--   - a person reads only their own records, writes only in their own name, and can neither change nor delete one (the
--     record is what was said, never rewritten: R-26);
--   - the usage log accepts 'weekly_review', still accepts the three it had, and still refuses any other;
--   - records go with the account.

drop table if exists pg_temp.mom113_results;
create temp table mom113_results (n int, check_name text, passed boolean, detail text);

create or replace function pg_temp.mom113_c(name text, passed boolean, detail text default '') returns jsonb
language sql as $$
  select jsonb_build_object('c', name, 'p', coalesce(passed, false), 'd', coalesce(detail, ''));
$$;

-- One statement, answered 'ok:<rows touched>' or the SQLSTATE it failed with.
create or replace function pg_temp.mom113_do(stmt text) returns text
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
  a uuid := gen_random_uuid();   -- writes and reads their own records
  b uuid := gen_random_uuid();   -- another person, with a record of their own
  s text;
  v int;
  w int;
  i int;
  wk text;
  wk_end text;
  k text;
  rec_a uuid;     -- a's first record
  rec_b uuid;     -- b's record
  recap_before jsonb;
  n_left int;
  res jsonb := '[]';
begin
  begin
    insert into auth.users (id, email)
    values (a, 'mom113-verify-a@example.invalid'), (b, 'mom113-verify-b@example.invalid');

    -- -----------------------------------------------------------------------
    -- The table and what the API roles may do with it
    -- -----------------------------------------------------------------------

    select count(*) into v from pg_class
    where oid = 'public.weekly_reviews'::regclass and relrowsecurity;
    res := res || pg_temp.mom113_c('weekly_reviews exists and has row level security on', v = 1);

    select string_agg(p, ',' order by p) into s
    from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
    where has_table_privilege('authenticated', 'public.weekly_reviews', p);
    res := res || pg_temp.mom113_c('A signed-in person has table privileges SELECT and INSERT only', s = 'INSERT,SELECT', coalesce(s, 'none'));

    select count(*) into v from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'weekly_reviews' and grantee = 'authenticated' and privilege_type = 'UPDATE';
    res := res || pg_temp.mom113_c('No column of it can be updated by a signed-in person either', v = 0, format('%s columns', v));

    select count(*) into v from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
    where has_table_privilege('anon', 'public.weekly_reviews', p) or has_table_privilege('service_role', 'public.weekly_reviews', p);
    res := res || pg_temp.mom113_c('anon and service_role have no privilege on it', v = 0, format('%s privileges found', v));

    -- -----------------------------------------------------------------------
    -- A finished review is written once per week (user a)
    -- -----------------------------------------------------------------------

    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

    s := pg_temp.mom113_do(format($q$insert into public.weekly_reviews (user_id, week_start, week_end, recap) values (%L, '2026-10-19', '2026-10-25', '{"v": 1, "targets": []}')$q$, a));
    res := res || pg_temp.mom113_c('A person can write a finished review for their own week, with nothing offered', s = 'ok:1', s);

    select id into rec_a from public.weekly_reviews where user_id = a and week_start = '2026-10-19';
    select recap into recap_before from public.weekly_reviews where user_id = a and week_start = '2026-10-19';
    select count(*) into v from public.weekly_reviews
    where id = rec_a and finished_at = now() and adjustment_kind is null and adjustment is null and adjustment_outcome is null;
    res := res || pg_temp.mom113_c('The database sets when it was finished, and nothing offered leaves the adjustment empty', v = 1, v::text);

    s := pg_temp.mom113_do(format($q$insert into public.weekly_reviews (user_id, week_start, week_end, recap) values (%L, '2026-10-19', '2026-10-25', '{"v": 1, "targets": []}')$q$, a));
    res := res || pg_temp.mom113_c('A second record for the same week is refused by the unique key', s = '23505', s);

    s := pg_temp.mom113_do(format($q$insert into public.weekly_reviews (user_id, week_start, week_end, recap, adjustment_kind, adjustment, adjustment_outcome) values (%L, '2026-10-26', '2026-11-01', '{"v": 1}', 'slipping_check_in', '{"targetId": "t", "periods": 2}', 'declined')$q$, a));
    res := res || pg_temp.mom113_c('The next week can be written, with the adjustment offered and declined', s = 'ok:1', s);

    -- Each of the six kinds (section 3.2) is accepted, one per week.
    for i in 1..6 loop
      wk := (date '2026-11-02' + 7 * i)::text;
      wk_end := (date '2026-11-02' + 7 * i + 6)::text;
      k := (array['deadline_forecast', 'slipping_check_in', 'rebaseline', 'priority_changed', 'handling_preference', 'still_right'])[i];
      s := pg_temp.mom113_do(format($q$insert into public.weekly_reviews (user_id, week_start, week_end, recap, adjustment_kind, adjustment, adjustment_outcome) values (%L, %L, %L, '{"v": 1}', %L, '{"k": 1}', 'changed')$q$, a, wk, wk_end, k));
      res := res || pg_temp.mom113_c('The adjustment kind ' || k || ' is accepted', s = 'ok:1', s);
    end loop;

    select count(*) into v from public.weekly_reviews where user_id = a and adjustment_outcome = 'changed';
    res := res || pg_temp.mom113_c('All six were stored', v = 6, v::text);

    -- The three outcomes are all accepted (skipped is the one not used above).
    s := pg_temp.mom113_do(format($q$insert into public.weekly_reviews (user_id, week_start, week_end, recap, adjustment_kind, adjustment, adjustment_outcome) values (%L, '2026-12-21', '2026-12-27', '{"v": 1}', 'rebaseline', '{"targetId": "t", "periods": 3}', 'skipped')$q$, a));
    res := res || pg_temp.mom113_c('A skipped adjustment is accepted', s = 'ok:1', s);

    -- -----------------------------------------------------------------------
    -- When it was finished is the database's to say, whatever an insert sends
    -- -----------------------------------------------------------------------

    s := pg_temp.mom113_do(format($q$insert into public.weekly_reviews (user_id, week_start, week_end, recap, finished_at) values (%L, '2027-03-01', '2027-03-07', '{"v": 1}', now() - interval '7 days')$q$, a));
    res := res || pg_temp.mom113_c('An insert that sends a finished_at a week in the past is accepted', s = 'ok:1', s);

    select count(*) into v from public.weekly_reviews
    where user_id = a and week_start = '2027-03-01' and abs(extract(epoch from now() - finished_at)) < 60;
    res := res || pg_temp.mom113_c('It reads back within a minute of now, not a week ago', v = 1, v::text);

    s := pg_temp.mom113_do(format($q$insert into public.weekly_reviews (user_id, week_start, week_end, recap, finished_at) values (%L, '2027-03-08', '2027-03-14', '{"v": 1}', now() + interval '7 days')$q$, a));
    select count(*) into v from public.weekly_reviews
    where user_id = a and week_start = '2027-03-08' and abs(extract(epoch from now() - finished_at)) < 60;
    res := res || pg_temp.mom113_c('A finished_at a week ahead is replaced too', s = 'ok:1' and v = 1, format('%s, %s', s, v));

    -- -----------------------------------------------------------------------
    -- The checks that can fail
    -- -----------------------------------------------------------------------

    s := pg_temp.mom113_do(format($q$insert into public.weekly_reviews (user_id, week_start, week_end, recap) values (%L, '2027-01-04', '2027-01-09', '{"v": 1}')$q$, a));
    res := res || pg_temp.mom113_c('A week that is not seven days is refused', s = '23514', s);

    s := pg_temp.mom113_do(format($q$insert into public.weekly_reviews (user_id, week_start, week_end, recap) values (%L, '2027-01-04', '2027-01-10', '[]')$q$, a));
    res := res || pg_temp.mom113_c('A recap that is not an object is refused', s = '23514', s);

    s := pg_temp.mom113_do(format($q$insert into public.weekly_reviews (user_id, week_start, week_end, recap) values (%L, '2027-01-04', '2027-01-10', null)$q$, a));
    res := res || pg_temp.mom113_c('A record with no recap is refused', s = '23502', s);

    s := pg_temp.mom113_do(format($q$insert into public.weekly_reviews (user_id, week_start, week_end, recap, adjustment_kind) values (%L, '2027-01-04', '2027-01-10', '{"v": 1}', 'rebaseline')$q$, a));
    res := res || pg_temp.mom113_c('A kind with no adjustment and no outcome is refused', s = '23514', s);

    s := pg_temp.mom113_do(format($q$insert into public.weekly_reviews (user_id, week_start, week_end, recap, adjustment_outcome) values (%L, '2027-01-04', '2027-01-10', '{"v": 1}', 'changed')$q$, a));
    res := res || pg_temp.mom113_c('A choice with nothing offered is refused', s = '23514', s);

    s := pg_temp.mom113_do(format($q$insert into public.weekly_reviews (user_id, week_start, week_end, recap, adjustment_kind, adjustment, adjustment_outcome) values (%L, '2027-01-04', '2027-01-10', '{"v": 1}', 'a_guess', '{"k": 1}', 'changed')$q$, a));
    res := res || pg_temp.mom113_c('An unknown adjustment kind is refused', s = '23514', s);

    s := pg_temp.mom113_do(format($q$insert into public.weekly_reviews (user_id, week_start, week_end, recap, adjustment_kind, adjustment, adjustment_outcome) values (%L, '2027-01-04', '2027-01-10', '{"v": 1}', 'rebaseline', '{"k": 1}', 'maybe')$q$, a));
    res := res || pg_temp.mom113_c('An unknown outcome is refused', s = '23514', s);

    s := pg_temp.mom113_do(format($q$insert into public.weekly_reviews (user_id, week_start, week_end, recap, adjustment_kind, adjustment, adjustment_outcome) values (%L, '2027-01-04', '2027-01-10', '{"v": 1}', 'rebaseline', '[]', 'changed')$q$, a));
    res := res || pg_temp.mom113_c('An adjustment that is not an object is refused', s = '23514', s);

    -- Nothing refused above left a row behind: 10-19, 10-26, six more, the skipped one and the two with a sent finished_at.
    select count(*) into v from public.weekly_reviews where user_id = a;
    res := res || pg_temp.mom113_c('Only the eleven good records exist, none of the refused ones', v = 11, v::text);

    -- -----------------------------------------------------------------------
    -- A person reads and writes only their own records (b has one of their own)
    -- -----------------------------------------------------------------------

    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);

    s := pg_temp.mom113_do(format($q$insert into public.weekly_reviews (user_id, week_start, week_end, recap) values (%L, '2026-10-19', '2026-10-25', '{"v": 1}')$q$, b));
    res := res || pg_temp.mom113_c('Another person can write their own record for the same week as the first', s = 'ok:1', s);

    select count(*) into v from public.weekly_reviews;
    select count(*) into w from public.weekly_reviews where id = rec_a;
    res := res || pg_temp.mom113_c('A person reads their own 1 record and none of anyone else''s', v = 1 and w = 0, format('%s, %s', v, w));
    select id into rec_b from public.weekly_reviews where user_id = b;

    s := pg_temp.mom113_do(format($q$insert into public.weekly_reviews (user_id, week_start, week_end, recap) values (%L, '2027-02-01', '2027-02-07', '{"v": 1}')$q$, a));
    res := res || pg_temp.mom113_c('Writing a record in another person''s name is refused by row level security', s = '42501', s);

    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    select count(*) into v from public.weekly_reviews;
    select count(*) into w from public.weekly_reviews where id = rec_b;
    res := res || pg_temp.mom113_c('The first person reads their own 11 records and none of the other''s', v = 11 and w = 0, format('%s, %s', v, w));

    -- -----------------------------------------------------------------------
    -- A record is what was said: it cannot be changed or removed (R-26)
    -- -----------------------------------------------------------------------

    s := pg_temp.mom113_do(format($q$update public.weekly_reviews set recap = '{"v": 1, "rewritten": true}' where id = %L$q$, rec_a));
    res := res || pg_temp.mom113_c('A person cannot rewrite their own record', s = '42501', s);

    s := pg_temp.mom113_do(format($q$update public.weekly_reviews set adjustment_outcome = 'changed' where id = %L$q$, rec_a));
    res := res || pg_temp.mom113_c('A person cannot change the outcome of their own record', s = '42501', s);

    s := pg_temp.mom113_do(format($q$delete from public.weekly_reviews where id = %L$q$, rec_a));
    res := res || pg_temp.mom113_c('A person cannot delete their own record', s = '42501', s);

    select count(*) into v from public.weekly_reviews where id = rec_a and recap = recap_before;
    res := res || pg_temp.mom113_c('The record is exactly as it was written', v = 1, v::text);

    -- anon and service_role cannot read the table at all.
    reset role;
    set local role anon;
    s := pg_temp.mom113_do('select count(*) from public.weekly_reviews');
    res := res || pg_temp.mom113_c('anon cannot read it', s = '42501', s);
    reset role;
    set local role service_role;
    s := pg_temp.mom113_do('select count(*) from public.weekly_reviews');
    res := res || pg_temp.mom113_c('service_role cannot read it', s = '42501', s);
    reset role;

    -- -----------------------------------------------------------------------
    -- The trigger function is not callable through the API (the rule of 012)
    -- -----------------------------------------------------------------------

    select count(*) into v from pg_trigger t
    where t.tgrelid = 'public.weekly_reviews'::regclass and t.tgname = 'weekly_reviews_set_finished_at'
      and t.tgenabled = 'O' and not t.tgisinternal
      and (t.tgtype & 1) = 1 and (t.tgtype & 2) = 2 and (t.tgtype & 4) = 4
      and t.tgfoid = 'public.weekly_reviews_set_finished_at()'::regprocedure;
    res := res || pg_temp.mom113_c('weekly_reviews_set_finished_at is an enabled BEFORE INSERT row trigger that runs the function', v = 1, format('%s matching triggers', v));

    select string_agg(r, ', ' order by r) into s
    from unnest(array['anon', 'authenticated', 'service_role']) r
    where has_function_privilege(r, 'public.weekly_reviews_set_finished_at()', 'execute');
    res := res || pg_temp.mom113_c('anon, authenticated and service_role cannot execute the trigger function', s is null, coalesce(s, 'none can'));

    select count(*) into v from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where p.oid = 'public.weekly_reviews_set_finished_at()'::regprocedure and acl.grantee = 0 and acl.privilege_type = 'EXECUTE';
    res := res || pg_temp.mom113_c('PUBLIC cannot execute the trigger function either', v = 0, format('%s PUBLIC grants', v));

    select string_agg(r, ', ' order by r) into s
    from unnest(array['anon', 'authenticated', 'service_role']) r
    where pg_temp.mom113_do(format('set local role %I; select public.weekly_reviews_set_finished_at()', r)) <> '42501';
    reset role;
    res := res || pg_temp.mom113_c('Calling the trigger function directly is refused by privilege for each of the three', s is null, coalesce(s, 'refused for all'));

    -- -----------------------------------------------------------------------
    -- The usage log accepts 'weekly_review' and still refuses a feature it does not know
    -- -----------------------------------------------------------------------

    select pg_get_constraintdef(oid) into s from pg_constraint where conname = 'llm_usage_logs_feature_check';
    res := res || pg_temp.mom113_c('The usage log''s feature check lists all four features',
      s like '%rebalance%' and s like '%week_one_plan%' and s like '%setup%' and s like '%weekly_review%', coalesce(s, 'missing'));

    s := pg_temp.mom113_do(format($q$insert into public.llm_usage_logs (user_id, feature, model) values (%L, 'weekly_review', 'verify-model')$q$, a));
    res := res || pg_temp.mom113_c('A weekly_review call is accepted by the usage log', s = 'ok:1', s);

    s := pg_temp.mom113_do(format($q$insert into public.llm_usage_logs (user_id, feature, model) values (%L, 'setup', 'verify-model')$q$, a));
    res := res || pg_temp.mom113_c('A setup call is still accepted', s = 'ok:1', s);

    s := pg_temp.mom113_do(format($q$insert into public.llm_usage_logs (user_id, feature, model) values (%L, 'a_guess', 'verify-model')$q$, a));
    res := res || pg_temp.mom113_c('Any other feature name is still refused', s = '23514', s);

    -- -----------------------------------------------------------------------
    -- Records go with the account. The throwaway accounts exist to be removed: counted first so "none remain" is not an
    -- empty claim.
    -- -----------------------------------------------------------------------

    select count(*) into v from public.weekly_reviews where user_id in (a, b);
    select count(*) into w from public.llm_usage_logs where user_id in (a, b);
    delete from auth.users where id in (a, b);
    res := res || pg_temp.mom113_c('Deleting the accounts removes every record and usage row they had',
      v = 12 and w = 2
        and (select count(*) from public.weekly_reviews where user_id in (a, b)) = 0
        and (select count(*) from public.llm_usage_logs where user_id in (a, b)) = 0,
      format('%s records and %s usage rows before', v, w));

    -- Undo every write above. The handler below expects exactly this exception.
    raise exception 'mom113_rollback';
  exception when others then
    if sqlerrm <> 'mom113_rollback' then
      res := res || pg_temp.mom113_c('The script ran to its end with no unexpected error', false, sqlstate || ' ' || sqlerrm);
    end if;
  end;

  -- -------------------------------------------------------------------------
  -- After the rollback: nothing is left
  -- -------------------------------------------------------------------------

  select count(*) into n_left from auth.users where email like 'mom113-verify-%';
  res := res || pg_temp.mom113_c('The rollback left no throwaway account behind', n_left = 0, format('%s left', n_left));

  select (select count(*) from public.users where id in (a, b))
       + (select count(*) from public.weekly_reviews where user_id in (a, b))
       + (select count(*) from public.llm_usage_logs where user_id in (a, b))
  into v;
  res := res || pg_temp.mom113_c('The rollback left no weekly_reviews row, usage row or user row for either of them', v = 0, format('%s rows left', v));

  insert into mom113_results (n, check_name, passed, detail)
  select ord, e2 ->> 'c', (e2 ->> 'p')::boolean, e2 ->> 'd'
  from jsonb_array_elements(res) with ordinality as x (e2, ord);
end;
$$;

select * from mom113_results order by n;
