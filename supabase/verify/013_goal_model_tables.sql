-- Verification for supabase/migrations/013_goal_model_tables.sql (MOM-107).
-- Run in the Supabase SQL Editor or with `npm run verify:sql` (local) or `supabase db query --linked -f` (hosted).
-- Safe to re-run, and safe against production. It creates two throwaway auth users with a few rows in each new table,
-- checks the tables, their constraints and their access rules as each role, then deletes the users (which removes
-- every row they own) and checks that nothing is left. Any unexpected error rolls back the whole block.
--
-- What it checks, in order: the shape (13 tables, RLS on, exactly the approved grants, no default for anything the
-- person must choose, no totals on entries); the constraints; one person cannot read or write another's rows;
-- what a signed-in person, the service role and a signed-out client can and cannot do; and that nothing is left over.

drop table if exists pg_temp.mom107_results;
create temp table mom107_results (n int, check_name text, passed boolean, detail text);

-- Runs one statement as the current role and returns 'ok' or the SQLSTATE of the error.
create or replace function pg_temp.mom107_state(stmt text) returns text
language plpgsql as $$
begin
  execute stmt;
  return 'ok';
exception when others then
  return sqlstate;
end;
$$;

-- One result row.
create or replace function pg_temp.mom107_c(name text, passed boolean, detail text default '') returns jsonb
language sql as $$
  select jsonb_build_object('c', name, 'p', coalesce(passed, false), 'd', coalesce(detail, ''));
$$;

-- Tries to insert a target and returns 'ok' or the SQLSTATE.
create or replace function pg_temp.mom107_target(
  p_user uuid, p_goal uuid, p_measure text, p_unit text, p_role text, p_period text,
  p_due date, p_slots smallint[], p_floor numeric, p_asp numeric, p_thr numeric, p_carry text
) returns text
language plpgsql as $$
begin
  insert into public.targets
    (user_id, goal_id, title, measure, unit, role, period_kind, due_date, slot_weekdays, floor, aspiration,
     qualifying_threshold, carry_over_kind)
  values (p_user, p_goal, 't', p_measure, p_unit, p_role, p_period, p_due, p_slots, p_floor, p_asp, p_thr, p_carry);
  return 'ok';
exception when others then
  return sqlstate;
end;
$$;

do $$
declare
  a      uuid := gen_random_uuid();   -- the person whose rows are read and written
  b      uuid := gen_random_uuid();   -- another person: must see none of a's rows, and a none of theirs
  dta    uuid := gen_random_uuid();
  dtb    uuid := gen_random_uuid();
  ga     uuid := gen_random_uuid();
  gb     uuid := gen_random_uuid();
  ta1    uuid := gen_random_uuid();   -- weekly count, effort, floor 3, aspiration 5
  ta2    uuid := gen_random_uuid();   -- checklist by a deadline
  tq     uuid := gen_random_uuid();   -- weekly quantity (pages)
  tb1    uuid := gen_random_uuid();
  sa_man uuid := gen_random_uuid();   -- a's manual source
  sa_hev uuid := gen_random_uuid();   -- a's synced source
  sb_man uuid := gen_random_uuid();
  wi_h   uuid := gen_random_uuid();   -- a habit
  wi_m   uuid := gen_random_uuid();   -- a milestone with steps
  wi_d   uuid := gen_random_uuid();   -- a deadline task
  wbm    uuid := gen_random_uuid();   -- b's milestone
  st1    uuid := gen_random_uuid();
  st2    uuid := gen_random_uuid();
  st3    uuid := gen_random_uuid();
  stb    uuid := gen_random_uuid();
  tbls   text[] := array[
    'person_settings', 'person_day_types', 'person_priorities', 'person_handling_rules', 'goals', 'targets',
    'work_items', 'work_item_steps', 'sources', 'target_sources', 'entries', 'entry_corrections', 'period_snapshots'];
  t      text;
  v      int;
  w      int;
  s      text;
  st     text;
  n      int;
  res    jsonb := '[]';
begin
  insert into auth.users (id, email)
  values (a, 'mom107-verify-a@example.invalid'), (b, 'mom107-verify-b@example.invalid');

  -- -------------------------------------------------------------------------
  -- Fixtures: a row in every table for each person (as postgres)
  -- -------------------------------------------------------------------------

  -- Setup writes only the user id: nothing about the person is assumed.
  insert into public.person_settings (user_id) values (a), (b);
  insert into public.person_day_types (id, user_id, name, capacity_unit, capacity_amount, reminder_time)
  values (dta, a, 'Work day', 'hours', 8, null), (dtb, b, 'Work day', 'hours', 6, null);
  insert into public.person_priorities (user_id, label) values (a, 'Family'), (b, 'Sleep');
  insert into public.person_handling_rules (user_id, rule_text) values (a, 'Ask me first'), (b, 'Ask me first');
  insert into public.goals (id, user_id, title, start_date, shape)
  values (ga, a, 'Get fit', date '2026-01-05', 'ongoing'), (gb, b, 'Read more', date '2026-01-05', 'ongoing');
  insert into public.targets (id, user_id, goal_id, title, measure, role, period_kind, floor, aspiration, carry_over_kind)
  values (ta1, a, ga, 'Workouts', 'count', 'effort', 'weekly', 3, 5, 'habit'),
         (tb1, b, gb, 'Reading days', 'count', 'effort', 'weekly', 4, null, 'habit');
  insert into public.targets (id, user_id, goal_id, title, measure, unit, role, period_kind, floor, carry_over_kind)
  values (tq, a, ga, 'Pages', 'quantity', 'pages', 'effort', 'weekly', 100, 'habit');
  insert into public.targets (id, user_id, goal_id, title, measure, role, period_kind, due_date, floor, carry_over_kind)
  values (ta2, a, ga, 'Prep checklist', 'checklist', 'effort', 'deadline', date '2026-03-01', 3, 'cumulative');
  insert into public.sources (id, user_id, kind, provider, label)
  values (sa_man, a, 'manual', null, 'My taps'), (sa_hev, a, 'synced', 'hevy', 'Hevy'), (sb_man, b, 'manual', null, 'My taps');
  insert into public.target_sources (target_id, source_id, user_id)
  values (ta1, sa_hev, a), (ta1, sa_man, a), (ta2, sa_man, a), (tb1, sb_man, b);
  insert into public.work_items (id, user_id, goal_id, target_id, kind, title)
  values (wi_h, a, ga, ta1, 'habit', 'Gym session'), (wi_m, a, ga, ta2, 'milestone', 'Prepare'),
         (wbm, b, gb, null, 'milestone', 'Finish a book');
  insert into public.work_items (id, user_id, goal_id, kind, title, due_date, date_can_move, estimate_minutes)
  values (wi_d, a, ga, 'deadline_task', 'Send the form', date '2026-02-01', false, 90);
  insert into public.work_item_steps (id, user_id, work_item_id, title, sort_order)
  values (st1, a, wi_m, 'Read the brief', 1), (st2, a, wi_m, 'Draft', 2), (st3, a, wi_m, 'Review', 3), (stb, b, wbm, 'Pick one', 1);
  insert into public.entries (user_id, target_id, source_id, source_record_id, work_item_id, occurred_at, value)
  values (a, ta1, sa_hev, 'hevy-1', wi_h, now() - interval '2 days', 1), (b, tb1, sb_man, 'b-1', null, now() - interval '1 day', 1);
  -- A correction for a record that has no entry row (a resync can delete and recreate entries).
  insert into public.entry_corrections (user_id, source_id, source_record_id, action)
  values (a, sa_hev, 'hevy-9', 'hide'), (b, sb_man, 'b-1', 'hide');
  insert into public.period_snapshots
    (user_id, target_id, period_start, period_end, time_zone, week_start, measure, role, period_kind, floor, aspiration, carry_over_kind)
  values (a, ta1, date '2026-01-05', date '2026-01-11', 'America/Los_Angeles', 1, 'count', 'effort', 'weekly', 3, 5, 'habit'),
         (b, tb1, date '2026-01-05', date '2026-01-11', 'America/New_York', 1, 'count', 'effort', 'weekly', 4, null, 'habit');

  -- -------------------------------------------------------------------------
  -- The shape
  -- -------------------------------------------------------------------------

  select count(*), count(*) filter (where relrowsecurity) into v, w
  from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname = any (tbls);
  res := res || pg_temp.mom107_c('All 13 new tables exist and every one has row level security on', v = 13 and w = 13,
    format('%s tables, %s with RLS', v, w));

  with exp (rel, anon_p, auth_p, svc_p) as (values
    ('person_settings',       '', 'SELECT,INSERT,UPDATE',        ''),
    ('person_day_types',      '', 'SELECT,INSERT,UPDATE,DELETE', ''),
    ('person_priorities',     '', 'SELECT,INSERT,UPDATE,DELETE', ''),
    ('person_handling_rules', '', 'SELECT,INSERT,UPDATE,DELETE', ''),
    ('goals',                 '', 'SELECT,INSERT,UPDATE',        ''),
    ('targets',               '', 'SELECT,INSERT,UPDATE',        ''),
    ('work_items',            '', 'SELECT,INSERT,UPDATE,DELETE', ''),
    ('work_item_steps',       '', 'SELECT,INSERT,UPDATE,DELETE', ''),
    ('sources',               '', 'SELECT,INSERT,UPDATE,DELETE', 'SELECT'),
    ('target_sources',        '', 'SELECT,INSERT,DELETE',        'SELECT'),
    ('entries',               '', 'SELECT,INSERT',               'SELECT,INSERT,UPDATE'),
    ('entry_corrections',     '', 'SELECT,INSERT,UPDATE,DELETE', ''),
    ('period_snapshots',      '', 'SELECT,INSERT',               '')),
  long as (
    select rel, 'anon' as role, anon_p as privs from exp
    union all select rel, 'authenticated', auth_p from exp
    union all select rel, 'service_role', svc_p from exp),
  act as (
    select l.rel, l.role, l.privs as expected,
           coalesce((select string_agg(d.p, ',' order by d.o)
                     from (values (1, 'SELECT'), (2, 'INSERT'), (3, 'UPDATE'), (4, 'DELETE')) d (o, p)
                     where has_table_privilege(l.role, format('public.%I', l.rel), d.p)), '') as actual
    from long l)
  select string_agg(format('%s %s has %s, approved %s', rel, role, coalesce(nullif(actual, ''), 'nothing'),
                           coalesce(nullif(expected, ''), 'nothing')), '; ')
  into s from act where actual <> expected;
  res := res || pg_temp.mom107_c('API-role grants are exactly the approved ones (39 role and table pairs)', s is null,
    coalesce(s, 'all match'));

  select string_agg(distinct x.t || ' ' || ro.r || ' ' || pr.p, ', ') into s
  from unnest(tbls) as x (t)
  cross join unnest(array['anon', 'authenticated', 'service_role']) as ro (r)
  cross join unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER']) as pr (p)
  where has_table_privilege(ro.r, 'public.' || x.t, pr.p);
  res := res || pg_temp.mom107_c('No API role has TRUNCATE, REFERENCES or TRIGGER on a new table', s is null, coalesce(s, 'none'));

  select string_agg(column_name, ',' order by ordinal_position) into s
  from information_schema.columns where table_schema = 'public' and table_name = 'entries';
  res := res || pg_temp.mom107_c('Entries have exactly the approved columns', s =
    'id,user_id,target_id,source_id,source_record_id,work_item_id,occurred_at,value,evidence,created_at,updated_at', s);

  select string_agg(column_name, ',' order by column_name) into s
  from information_schema.columns
  where table_schema = 'public' and table_name = 'entries' and data_type in ('numeric', 'integer', 'bigint', 'smallint', 'double precision', 'real');
  res := res || pg_temp.mom107_c('The only number on an entry is its raw value: it carries no computed total', s = 'value', s);

  select string_agg(column_name, ',' order by ordinal_position) into s
  from information_schema.columns where table_schema = 'public' and table_name = 'period_snapshots';
  res := res || pg_temp.mom107_c('Snapshots hold the target and the anchors in force, and no totals or results', s =
    'id,user_id,target_id,period_start,period_end,time_zone,week_start,day_end,measure,unit,role,period_kind,slot_weekdays,floor,aspiration,qualifying_threshold,carry_over_kind,created_at', s);

  select string_agg(table_name || '.' || column_name, ', ') into s
  from information_schema.columns
  where table_schema = 'public' and column_default is not null and (
    (table_name = 'person_settings' and column_name not in ('created_at', 'updated_at'))
    or (table_name = 'goals' and column_name = 'start_date')
    or (table_name = 'work_items' and column_name = 'date_can_move')
    or (table_name = 'person_day_types' and column_name in ('capacity_unit', 'capacity_amount', 'reminder_time'))
    or (table_name = 'period_snapshots' and column_name in ('time_zone', 'week_start', 'day_end')));
  res := res || pg_temp.mom107_c('No time zone, week start, day end, setting, goal start or "date can move" has a database default',
    s is null, coalesce(s, 'none have one'));

  select count(*) into v from public.person_settings
  where user_id = a and time_zone is null and week_start is null and day_end is null and tone is null and reminders is null
    and check_ins is null and celebrations is null and balance_mentions is null and review_depth is null
    and review_planning is null and quiet_times is null and slipping_periods is null
    and planning_weekday is null and planning_time is null;
  res := res || pg_temp.mom107_c('A new person row has no time anchor and no setting chosen', v = 1, format('%s rows', v));

  -- -------------------------------------------------------------------------
  -- Constraints (as postgres: RLS does not apply, the checks do)
  -- -------------------------------------------------------------------------

  -- person_settings
  res := res || pg_temp.mom107_c('Week start 0 is rejected', pg_temp.mom107_state(format('update public.person_settings set week_start = 0 where user_id = %L', a)) = '23514');
  res := res || pg_temp.mom107_c('Week start 8 is rejected', pg_temp.mom107_state(format('update public.person_settings set week_start = 8 where user_id = %L', a)) = '23514');
  res := res || pg_temp.mom107_c('An unknown tone is rejected', pg_temp.mom107_state(format($q$update public.person_settings set tone = 'loud' where user_id = %L$q$, a)) = '23514');
  res := res || pg_temp.mom107_c('Quiet times must be a list', pg_temp.mom107_state(format($q$update public.person_settings set quiet_times = '{}'::jsonb where user_id = %L$q$, a)) = '23514');
  res := res || pg_temp.mom107_c('Slipping after fewer than 2 periods is rejected', pg_temp.mom107_state(format('update public.person_settings set slipping_periods = 1 where user_id = %L', a)) = '23514');
  res := res || pg_temp.mom107_c('A blank time zone is rejected', pg_temp.mom107_state(format($q$update public.person_settings set time_zone = '  ' where user_id = %L$q$, a)) = '23514');
  res := res || pg_temp.mom107_c('A planning weekday outside 1 to 7 is rejected', pg_temp.mom107_state(format('update public.person_settings set planning_weekday = 9 where user_id = %L', a)) = '23514');

  -- person_day_types
  res := res || pg_temp.mom107_c('A day type needs a capacity unit and amount together',
    pg_temp.mom107_state(format('update public.person_day_types set capacity_amount = null where id = %L', dta)) = '23514');
  res := res || pg_temp.mom107_c('A negative capacity is rejected', pg_temp.mom107_state(format('update public.person_day_types set capacity_amount = -1 where id = %L', dta)) = '23514');
  res := res || pg_temp.mom107_c('An unknown capacity unit is rejected', pg_temp.mom107_state(format($q$update public.person_day_types set capacity_unit = 'days' where id = %L$q$, dta)) = '23514');
  res := res || pg_temp.mom107_c('Two day types with the same name are rejected',
    pg_temp.mom107_state(format($q$insert into public.person_day_types (user_id, name) values (%L, 'Work day')$q$, a)) = '23505');

  -- goals
  res := res || pg_temp.mom107_c('A finite goal needs an end date', pg_temp.mom107_state(format($q$insert into public.goals (user_id, title, start_date, shape) values (%L, 'g', date '2026-01-05', 'finite')$q$, a)) = '23514');
  res := res || pg_temp.mom107_c('An ongoing goal has no end date', pg_temp.mom107_state(format($q$insert into public.goals (user_id, title, start_date, shape, end_date) values (%L, 'g', date '2026-01-05', 'ongoing', date '2026-06-01')$q$, a)) = '23514');
  res := res || pg_temp.mom107_c('A project may have no deadline', pg_temp.mom107_state(format($q$insert into public.goals (user_id, title, start_date, shape) values (%L, 'g', date '2026-01-05', 'project')$q$, a)) = 'ok');
  res := res || pg_temp.mom107_c('A goal cannot end before it starts', pg_temp.mom107_state(format($q$insert into public.goals (user_id, title, start_date, shape, end_date) values (%L, 'g', date '2026-01-05', 'finite', date '2026-01-05')$q$, a)) = '23514');
  -- Migration 014 (MOM-128) made the column nullable for a parked goal, so an active goal without one now fails the
  -- goals_shape_start_required check (23514), not the not-null rule (23502).
  res := res || pg_temp.mom107_c('An active goal has no start date unless the person gives one', pg_temp.mom107_state(format($q$insert into public.goals (user_id, title, shape) values (%L, 'g', 'ongoing')$q$, a)) = '23514');
  res := res || pg_temp.mom107_c('A first block length belongs to an ongoing goal only', pg_temp.mom107_state(format($q$insert into public.goals (user_id, title, start_date, shape, end_date, block_weeks) values (%L, 'g', date '2026-01-05', 'finite', date '2026-06-01', 10)$q$, a)) = '23514');
  res := res || pg_temp.mom107_c('An ongoing goal can have a first block length', pg_temp.mom107_state(format($q$insert into public.goals (user_id, title, start_date, shape, block_weeks) values (%L, 'g', date '2026-01-05', 'ongoing', 10)$q$, a)) = 'ok');
  res := res || pg_temp.mom107_c('An unknown shape is rejected', pg_temp.mom107_state(format($q$insert into public.goals (user_id, title, start_date, shape) values (%L, 'g', date '2026-01-05', 'forever')$q$, a)) = '23514');
  res := res || pg_temp.mom107_c('A parked goal must say how it comes back', pg_temp.mom107_state(format($q$insert into public.goals (user_id, title, start_date, shape, state) values (%L, 'g', date '2026-01-05', 'ongoing', 'parked')$q$, a)) = '23514');
  res := res || pg_temp.mom107_c('A goal parked until a date needs the date', pg_temp.mom107_state(format($q$insert into public.goals (user_id, title, start_date, shape, state, return_kind) values (%L, 'g', date '2026-01-05', 'ongoing', 'parked', 'date')$q$, a)) = '23514');
  res := res || pg_temp.mom107_c('A goal parked until a condition needs it in words', pg_temp.mom107_state(format($q$insert into public.goals (user_id, title, start_date, shape, state, return_kind) values (%L, 'g', date '2026-01-05', 'ongoing', 'parked', 'condition')$q$, a)) = '23514');
  res := res || pg_temp.mom107_c('An active goal has no return condition', pg_temp.mom107_state(format($q$insert into public.goals (user_id, title, start_date, shape, return_kind) values (%L, 'g', date '2026-01-05', 'ongoing', 'on_request')$q$, a)) = '23514');
  res := res || pg_temp.mom107_c('A goal can be parked until the person asks', pg_temp.mom107_state(format($q$insert into public.goals (user_id, title, start_date, shape, state, return_kind) values (%L, 'g', date '2026-01-05', 'ongoing', 'parked', 'on_request')$q$, a)) = 'ok');
  res := res || pg_temp.mom107_c('A goal can be parked until a date', pg_temp.mom107_state(format($q$insert into public.goals (user_id, title, start_date, shape, state, return_kind, return_date) values (%L, 'g', date '2026-01-05', 'ongoing', 'parked', 'date', date '2026-09-01')$q$, a)) = 'ok');

  -- targets
  res := res || pg_temp.mom107_c('A quantity needs a unit', pg_temp.mom107_target(a, ga, 'quantity', null, 'effort', 'weekly', null, null, 3, null, null, 'habit') = '23514');
  res := res || pg_temp.mom107_c('A count has no unit', pg_temp.mom107_target(a, ga, 'count', 'km', 'effort', 'weekly', null, null, 3, null, null, 'habit') = '23514');
  res := res || pg_temp.mom107_c('An unknown measure is rejected', pg_temp.mom107_target(a, ga, 'minutes', null, 'effort', 'weekly', null, null, 3, null, null, 'habit') = '23514');
  res := res || pg_temp.mom107_c('An effort target needs a floor', pg_temp.mom107_target(a, ga, 'count', null, 'effort', 'weekly', null, null, null, null, null, 'habit') = '23514');
  res := res || pg_temp.mom107_c('An outcome target needs no level', pg_temp.mom107_target(a, ga, 'count', null, 'outcome', 'weekly', null, null, null, null, null, 'habit') = 'ok');
  res := res || pg_temp.mom107_c('A floor of zero is rejected', pg_temp.mom107_target(a, ga, 'count', null, 'effort', 'weekly', null, null, 0, null, null, 'habit') = '23514');
  res := res || pg_temp.mom107_c('An aspiration below the floor is rejected', pg_temp.mom107_target(a, ga, 'count', null, 'effort', 'weekly', null, null, 3, 2, null, 'habit') = '23514');
  res := res || pg_temp.mom107_c('An aspiration without a floor is rejected', pg_temp.mom107_target(a, ga, 'count', null, 'outcome', 'weekly', null, null, null, 5, null, 'habit') = '23514');
  res := res || pg_temp.mom107_c('A negative qualifying threshold is rejected', pg_temp.mom107_target(a, ga, 'quantity', 'km', 'effort', 'weekly', null, null, 3, null, -1, 'habit') = '23514');
  res := res || pg_temp.mom107_c('A deadline target needs its date', pg_temp.mom107_target(a, ga, 'count', null, 'effort', 'deadline', null, null, 3, null, null, 'cumulative') = '23514');
  res := res || pg_temp.mom107_c('A weekly target has no deadline date', pg_temp.mom107_target(a, ga, 'count', null, 'effort', 'weekly', date '2026-03-01', null, 3, null, null, 'habit') = '23514');
  res := res || pg_temp.mom107_c('Named day slots need the days', pg_temp.mom107_target(a, ga, 'count', null, 'effort', 'day_slots', null, null, 3, null, null, 'habit') = '23514');
  res := res || pg_temp.mom107_c('A day slot outside 1 to 7 is rejected', pg_temp.mom107_target(a, ga, 'count', null, 'effort', 'day_slots', null, array[1, 8]::smallint[], 2, null, null, 'habit') = '23514');
  res := res || pg_temp.mom107_c('An empty list of day slots is rejected', pg_temp.mom107_target(a, ga, 'count', null, 'effort', 'day_slots', null, array[]::smallint[], 2, null, null, 'habit') = '23514');
  res := res || pg_temp.mom107_c('A weekly target has no day slots', pg_temp.mom107_target(a, ga, 'count', null, 'effort', 'weekly', null, array[1, 3]::smallint[], 2, null, null, 'habit') = '23514');
  res := res || pg_temp.mom107_c('Named day slots are accepted', pg_temp.mom107_target(a, ga, 'count', null, 'effort', 'day_slots', null, array[1, 3, 5]::smallint[], 3, null, null, 'habit') = 'ok');
  res := res || pg_temp.mom107_c('A cumulative target needs a deadline', pg_temp.mom107_target(a, ga, 'count', null, 'effort', 'weekly', null, null, 3, null, null, 'cumulative') = '23514');
  res := res || pg_temp.mom107_c('A cumulative deadline target is accepted', pg_temp.mom107_target(a, ga, 'quantity', 'items', 'effort', 'deadline', date '2026-12-20', null, 15, null, null, 'cumulative') = 'ok');
  res := res || pg_temp.mom107_c('A target cannot hang off another person''s goal', pg_temp.mom107_target(a, gb, 'count', null, 'effort', 'weekly', null, null, 3, null, null, 'habit') = '23503');

  -- work items and steps
  res := res || pg_temp.mom107_c('A habit needs a target', pg_temp.mom107_state(format($q$insert into public.work_items (user_id, goal_id, kind, title) values (%L, %L, 'habit', 'h')$q$, a, ga)) = '23514');
  res := res || pg_temp.mom107_c('A deadline task needs a date', pg_temp.mom107_state(format($q$insert into public.work_items (user_id, goal_id, kind, title, date_can_move) values (%L, %L, 'deadline_task', 'd', false)$q$, a, ga)) = '23514');
  res := res || pg_temp.mom107_c('A deadline task must say whether its date can move', pg_temp.mom107_state(format($q$insert into public.work_items (user_id, goal_id, kind, title, due_date) values (%L, %L, 'deadline_task', 'd', date '2026-02-01')$q$, a, ga)) = '23514');
  res := res || pg_temp.mom107_c('A milestone has no due date', pg_temp.mom107_state(format($q$insert into public.work_items (user_id, goal_id, kind, title, due_date) values (%L, %L, 'milestone', 'm', date '2026-02-01')$q$, a, ga)) = '23514');
  res := res || pg_temp.mom107_c('A milestone has no "date can move" answer', pg_temp.mom107_state(format($q$insert into public.work_items (user_id, goal_id, kind, title, date_can_move) values (%L, %L, 'milestone', 'm', true)$q$, a, ga)) = '23514');
  res := res || pg_temp.mom107_c('An estimate belongs to a deadline task only', pg_temp.mom107_state(format($q$insert into public.work_items (user_id, goal_id, kind, title, estimate_minutes) values (%L, %L, 'milestone', 'm', 30)$q$, a, ga)) = '23514');
  res := res || pg_temp.mom107_c('A habit is never completed', pg_temp.mom107_state(format('update public.work_items set completed_at = now(), completed_via = %L where id = %L', 'person', wi_h)) = '23514');
  res := res || pg_temp.mom107_c('A completion records who did it, and both are set together', pg_temp.mom107_state(format('update public.work_items set completed_at = now() where id = %L', wi_m)) = '23514');
  res := res || pg_temp.mom107_c('A completion by the person or a source is accepted', pg_temp.mom107_state(format($q$update public.work_items set completed_at = now(), completed_via = 'source' where id = %L$q$, wi_d)) = 'ok');
  res := res || pg_temp.mom107_c('A work item cannot point at another person''s target', pg_temp.mom107_state(format($q$insert into public.work_items (user_id, goal_id, target_id, kind, title) values (%L, %L, %L, 'habit', 'h')$q$, a, ga, tb1)) = '23503');
  res := res || pg_temp.mom107_c('A work item cannot hang off another person''s goal', pg_temp.mom107_state(format($q$insert into public.work_items (user_id, goal_id, kind, title) values (%L, %L, 'milestone', 'm')$q$, a, gb)) = '23503');
  res := res || pg_temp.mom107_c('A step cannot hang off another person''s work item', pg_temp.mom107_state(format($q$insert into public.work_item_steps (user_id, work_item_id, title) values (%L, %L, 's')$q$, a, wbm)) = '23503');

  -- sources and bindings
  res := res || pg_temp.mom107_c('A synced source needs a provider', pg_temp.mom107_state(format($q$insert into public.sources (user_id, kind, label) values (%L, 'synced', 'x')$q$, a)) = '23514');
  res := res || pg_temp.mom107_c('A manual source has no provider', pg_temp.mom107_state(format($q$insert into public.sources (user_id, kind, provider, label) values (%L, 'manual', 'hevy', 'x')$q$, a)) = '23514');
  res := res || pg_temp.mom107_c('A provider is a lowercase key', pg_temp.mom107_state(format($q$insert into public.sources (user_id, kind, provider, label) values (%L, 'synced', 'Hevy', 'x')$q$, a)) = '23514');
  res := res || pg_temp.mom107_c('A person has one source per provider', pg_temp.mom107_state(format($q$insert into public.sources (user_id, kind, provider, label) values (%L, 'synced', 'hevy', 'again')$q$, a)) = '23505');
  res := res || pg_temp.mom107_c('A person may have several manual sources', pg_temp.mom107_state(format($q$insert into public.sources (user_id, kind, label) values (%L, 'manual', 'My timer')$q$, a)) = 'ok');
  res := res || pg_temp.mom107_c('A person cannot bind another person''s source to their target', pg_temp.mom107_state(format('insert into public.target_sources (target_id, source_id, user_id) values (%L, %L, %L)', tq, sb_man, a)) = '23503');

  -- entries and corrections
  res := res || pg_temp.mom107_c('An entry of zero is rejected', pg_temp.mom107_state(format($q$insert into public.entries (user_id, target_id, source_id, source_record_id, occurred_at, value) values (%L, %L, %L, 'z', now(), 0)$q$, a, ta1, sa_man)) = '23514');
  res := res || pg_temp.mom107_c('An entry needs the source''s record id', pg_temp.mom107_state(format($q$insert into public.entries (user_id, target_id, source_id, source_record_id, occurred_at, value) values (%L, %L, %L, ' ', now(), 1)$q$, a, ta1, sa_man)) = '23514');
  res := res || pg_temp.mom107_c('An entry''s evidence must be an object', pg_temp.mom107_state(format($q$insert into public.entries (user_id, target_id, source_id, source_record_id, occurred_at, value, evidence) values (%L, %L, %L, 'ev', now(), 1, '[]'::jsonb)$q$, a, ta1, sa_man)) = '23514');
  res := res || pg_temp.mom107_c('The same record for the same target and source is the same entry (a resync cannot double it)',
    pg_temp.mom107_state(format($q$insert into public.entries (user_id, target_id, source_id, source_record_id, occurred_at, value) values (%L, %L, %L, 'hevy-1', now(), 1)$q$, a, ta1, sa_hev)) = '23505');
  res := res || pg_temp.mom107_c('An entry cannot use another person''s source', pg_temp.mom107_state(format($q$insert into public.entries (user_id, target_id, source_id, source_record_id, occurred_at, value) values (%L, %L, %L, 'x', now(), 1)$q$, a, ta1, sb_man)) = '23503');
  res := res || pg_temp.mom107_c('An entry cannot count toward another person''s target', pg_temp.mom107_state(format($q$insert into public.entries (user_id, target_id, source_id, source_record_id, occurred_at, value) values (%L, %L, %L, 'x', now(), 1)$q$, a, tb1, sa_man)) = '23503');
  res := res || pg_temp.mom107_c('Only one correction per source and source record id', pg_temp.mom107_state(format($q$insert into public.entry_corrections (user_id, source_id, source_record_id, action) values (%L, %L, 'hevy-9', 'count_anyway')$q$, a, sa_hev)) = '23505');
  res := res || pg_temp.mom107_c('An unknown correction action is rejected', pg_temp.mom107_state(format($q$insert into public.entry_corrections (user_id, source_id, source_record_id, action) values (%L, %L, 'hevy-8', 'delete')$q$, a, sa_hev)) = '23514');

  -- A resync that deletes and recreates the entry must not undo the person's word.
  insert into public.entries (user_id, target_id, source_id, source_record_id, occurred_at, value)
  values (a, ta1, sa_hev, 'hevy-9', now(), 1);
  insert into public.entry_corrections (user_id, source_id, source_record_id, action) values (a, sa_hev, 'hevy-7', 'count_anyway');
  delete from public.entries where user_id = a and source_record_id = 'hevy-9';
  select count(*) into v from public.entry_corrections where user_id = a and source_id = sa_hev and source_record_id = 'hevy-9';
  res := res || pg_temp.mom107_c('A correction survives its entry being deleted and recreated by a resync', v = 1, format('%s corrections', v));

  -- Deleting a work item removes its steps and leaves its entries, which still count toward the target.
  insert into public.work_items (id, user_id, goal_id, kind, title) values (gen_random_uuid(), a, ga, 'milestone', 'Temporary');
  insert into public.work_item_steps (user_id, work_item_id, title) select a, id, 'tmp step' from public.work_items where user_id = a and title = 'Temporary';
  insert into public.entries (user_id, target_id, source_id, source_record_id, work_item_id, occurred_at, value)
  select a, ta1, sa_man, 'tmp-entry', id, now(), 1 from public.work_items where user_id = a and title = 'Temporary';
  delete from public.work_items where user_id = a and title = 'Temporary';
  select count(*) into v from public.work_item_steps where user_id = a and title = 'tmp step';
  select count(*) into w from public.entries where user_id = a and source_record_id = 'tmp-entry' and work_item_id is null;
  res := res || pg_temp.mom107_c('Deleting a work item removes its steps and keeps its entries', v = 0 and w = 1, format('%s steps left, %s entries kept', v, w));

  -- History is never cut out from under its entries and snapshots.
  res := res || pg_temp.mom107_c('A goal with targets cannot be deleted', pg_temp.mom107_state(format('delete from public.goals where id = %L', ga)) = '23503');
  res := res || pg_temp.mom107_c('A target with entries or snapshots cannot be deleted', pg_temp.mom107_state(format('delete from public.targets where id = %L', ta1)) = '23503');
  res := res || pg_temp.mom107_c('A source with entries cannot be deleted', pg_temp.mom107_state(format('delete from public.sources where id = %L', sa_hev)) = '23503');

  -- Snapshots
  res := res || pg_temp.mom107_c('A closed period is recorded once per target',
    pg_temp.mom107_state(format($q$insert into public.period_snapshots (user_id, target_id, period_start, period_end, time_zone, week_start, measure, role, period_kind, floor, carry_over_kind)
      values (%L, %L, date '2026-01-05', date '2026-01-11', 'UTC', 1, 'count', 'effort', 'weekly', 3, 'habit')$q$, a, ta1)) = '23505');
  res := res || pg_temp.mom107_c('A period cannot end before it starts',
    pg_temp.mom107_state(format($q$insert into public.period_snapshots (user_id, target_id, period_start, period_end, time_zone, week_start, measure, role, period_kind, floor, carry_over_kind)
      values (%L, %L, date '2026-02-05', date '2026-02-01', 'UTC', 1, 'count', 'effort', 'weekly', 3, 'habit')$q$, a, ta1)) = '23514');
  res := res || pg_temp.mom107_c('A snapshot records the time zone it was judged in',
    pg_temp.mom107_state(format($q$insert into public.period_snapshots (user_id, target_id, period_start, period_end, week_start, measure, role, period_kind, floor, carry_over_kind)
      values (%L, %L, date '2026-02-05', date '2026-02-11', 1, 'count', 'effort', 'weekly', 3, 'habit')$q$, a, ta1)) = '23502');
  res := res || pg_temp.mom107_c('A weekly snapshot records the week start in force',
    pg_temp.mom107_state(format($q$insert into public.period_snapshots (user_id, target_id, period_start, period_end, time_zone, measure, role, period_kind, floor, carry_over_kind)
      values (%L, %L, date '2026-02-05', date '2026-02-11', 'UTC', 'count', 'effort', 'weekly', 3, 'habit')$q$, a, ta1)) = '23514');
  res := res || pg_temp.mom107_c('A deadline snapshot needs no week start',
    pg_temp.mom107_state(format($q$insert into public.period_snapshots (user_id, target_id, period_start, period_end, time_zone, measure, role, period_kind, floor, carry_over_kind)
      values (%L, %L, date '2026-01-05', date '2026-03-01', 'UTC', 'checklist', 'effort', 'deadline', 3, 'cumulative')$q$, a, ta2)) = 'ok');

  -- -------------------------------------------------------------------------
  -- A signed-in person: their own rows, nothing of anyone else's
  -- -------------------------------------------------------------------------

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

  s := null; w := 0;
  foreach t in array tbls loop
    execute format('select count(*) from public.%I where user_id <> %L', t, a) into v;
    if v > 0 then s := coalesce(s || ', ', '') || t; end if;
    execute format('select count(*) from public.%I where user_id = %L', t, a) into v;
    if v > 0 then w := w + 1; end if;
  end loop;
  res := res || pg_temp.mom107_c('A person reads none of another person''s rows in any of the 13 tables', s is null, coalesce(s, 'none visible'));
  res := res || pg_temp.mom107_c('A person reads their own rows in all 13 tables', w = 13, format('%s of 13 tables', w));

  -- Writing as, or onto, another person.
  res := res || pg_temp.mom107_c('A person cannot create settings for someone else', pg_temp.mom107_state(format('insert into public.person_settings (user_id) values (%L)', b)) = '42501');
  res := res || pg_temp.mom107_c('A person cannot create a goal for someone else', pg_temp.mom107_state(format($q$insert into public.goals (user_id, title, start_date, shape) values (%L, 'x', date '2026-01-05', 'ongoing')$q$, b)) = '42501');
  res := res || pg_temp.mom107_c('A person cannot create a target for someone else', pg_temp.mom107_target(b, gb, 'count', null, 'effort', 'weekly', null, null, 3, null, null, 'habit') = '42501');
  res := res || pg_temp.mom107_c('A person cannot create a source for someone else', pg_temp.mom107_state(format($q$insert into public.sources (user_id, kind, label) values (%L, 'manual', 'x')$q$, b)) = '42501');
  res := res || pg_temp.mom107_c('A person cannot create a work item for someone else', pg_temp.mom107_state(format($q$insert into public.work_items (user_id, goal_id, kind, title) values (%L, %L, 'milestone', 'x')$q$, b, gb)) = '42501');
  res := res || pg_temp.mom107_c('A person cannot create a correction for someone else', pg_temp.mom107_state(format($q$insert into public.entry_corrections (user_id, source_id, source_record_id, action) values (%L, %L, 'x', 'hide')$q$, b, sb_man)) = '42501');
  res := res || pg_temp.mom107_c('A person cannot create an entry for someone else', pg_temp.mom107_state(format($q$insert into public.entries (user_id, target_id, source_id, source_record_id, occurred_at, value) values (%L, %L, %L, 'x', now(), 1)$q$, b, tb1, sb_man)) = '42501');
  res := res || pg_temp.mom107_c('A person cannot create a snapshot for someone else',
    pg_temp.mom107_state(format($q$insert into public.period_snapshots (user_id, target_id, period_start, period_end, time_zone, week_start, measure, role, period_kind, floor, carry_over_kind)
      values (%L, %L, date '2026-02-05', date '2026-02-11', 'UTC', 1, 'count', 'effort', 'weekly', 4, 'habit')$q$, b, tb1)) = '42501');
  res := res || pg_temp.mom107_c('A person cannot hand their own row to someone else', pg_temp.mom107_state(format('update public.goals set user_id = %L where id = %L', b, ga)) = '42501');

  s := null;
  foreach t in array tbls loop
    if has_table_privilege('authenticated', 'public.' || t, 'UPDATE') then
      execute format('update public.%I set user_id = user_id where user_id = %L', t, b);
      get diagnostics n = row_count;
      if n > 0 then s := coalesce(s || ', ', '') || t; end if;
    end if;
  end loop;
  res := res || pg_temp.mom107_c('A person updates none of another person''s rows', s is null, coalesce(s, 'no row reached'));

  s := null;
  foreach t in array tbls loop
    if has_table_privilege('authenticated', 'public.' || t, 'DELETE') then
      execute format('delete from public.%I where user_id = %L', t, b);
      get diagnostics n = row_count;
      if n > 0 then s := coalesce(s || ', ', '') || t; end if;
    end if;
  end loop;
  res := res || pg_temp.mom107_c('A person deletes none of another person''s rows', s is null, coalesce(s, 'no row reached'));

  -- Entries: only through their own manual sources.
  res := res || pg_temp.mom107_c('A person can add an entry through their own manual source',
    pg_temp.mom107_state(format($q$insert into public.entries (user_id, target_id, source_id, source_record_id, occurred_at, value) values (%L, %L, %L, 'tap-1', now(), 1)$q$, a, ta1, sa_man)) = 'ok');
  res := res || pg_temp.mom107_c('A person cannot write a record that claims to come from a synced source',
    pg_temp.mom107_state(format($q$insert into public.entries (user_id, target_id, source_id, source_record_id, occurred_at, value) values (%L, %L, %L, 'forged', now(), 1)$q$, a, ta1, sa_hev)) = '42501');
  res := res || pg_temp.mom107_c('A person cannot write an entry through another person''s manual source',
    pg_temp.mom107_state(format($q$insert into public.entries (user_id, target_id, source_id, source_record_id, occurred_at, value) values (%L, %L, %L, 'x', now(), 1)$q$, a, ta1, sb_man)) = '42501');
  res := res || pg_temp.mom107_c('A person cannot change an entry (a removal is a correction)', pg_temp.mom107_state(format('update public.entries set value = 9 where user_id = %L', a)) = '42501');
  res := res || pg_temp.mom107_c('A person cannot delete an entry', pg_temp.mom107_state(format('delete from public.entries where user_id = %L', a)) = '42501');

  -- A checklist tick is a manual entry whose record id is the step's id; un-ticking is a correction, re-ticking removes it.
  res := res || pg_temp.mom107_c('A checklist tick is an entry whose source record id is the step id',
    pg_temp.mom107_state(format($q$insert into public.entries (user_id, target_id, source_id, source_record_id, work_item_id, occurred_at, value) values (%L, %L, %L, %L, %L, now(), 1)$q$, a, ta2, sa_man, st1::text, wi_m)) = 'ok');
  res := res || pg_temp.mom107_c('Un-ticking is a hide correction',
    pg_temp.mom107_state(format($q$insert into public.entry_corrections (user_id, source_id, source_record_id, action) values (%L, %L, %L, 'hide')$q$, a, sa_man, st1::text)) = 'ok');
  select count(*) into v from public.entries where user_id = a and target_id = ta2 and source_record_id = st1::text;
  select count(*) into w from public.entry_corrections where user_id = a and source_record_id = st1::text;
  res := res || pg_temp.mom107_c('The tick stays as an entry while it is hidden', v = 1 and w = 1, format('%s entries, %s corrections', v, w));
  delete from public.entry_corrections where user_id = a and source_record_id = st1::text;
  get diagnostics n = row_count;
  res := res || pg_temp.mom107_c('Re-ticking removes the correction (restore)', n = 1, format('%s corrections removed', n));

  -- Goals and targets are parked and re-baselined, never deleted.
  res := res || pg_temp.mom107_c('A person cannot delete a goal', pg_temp.mom107_state(format('delete from public.goals where id = %L', ga)) = '42501');
  res := res || pg_temp.mom107_c('A person cannot delete a target', pg_temp.mom107_state(format('delete from public.targets where id = %L', ta1)) = '42501');
  res := res || pg_temp.mom107_c('A person cannot empty a table', pg_temp.mom107_state('truncate public.goals') = '42501');

  -- Snapshots: the person's session writes them; nobody changes or deletes one. A re-baseline never re-grades history.
  res := res || pg_temp.mom107_c('A person records a closed period in their own session',
    pg_temp.mom107_state(format($q$insert into public.period_snapshots (user_id, target_id, period_start, period_end, time_zone, week_start, measure, role, period_kind, floor, aspiration, carry_over_kind)
      values (%L, %L, date '2026-01-12', date '2026-01-18', 'America/Los_Angeles', 1, 'count', 'effort', 'weekly', 3, 5, 'habit')$q$, a, ta1)) = 'ok');
  res := res || pg_temp.mom107_c('A snapshot cannot point at another person''s target',
    pg_temp.mom107_state(format($q$insert into public.period_snapshots (user_id, target_id, period_start, period_end, time_zone, week_start, measure, role, period_kind, floor, carry_over_kind)
      values (%L, %L, date '2026-02-05', date '2026-02-11', 'UTC', 1, 'count', 'effort', 'weekly', 4, 'habit')$q$, a, tb1)) = '23503');
  update public.targets set floor = 5, aspiration = 8 where id = ta1;
  select count(*) into v from public.period_snapshots where target_id = ta1 and floor = 3 and aspiration = 5;
  select count(*) into w from public.targets where id = ta1 and floor = 5 and aspiration = 8;
  res := res || pg_temp.mom107_c('A closed period keeps the target it was judged by after the target changes', v >= 2 and w = 1,
    format('%s snapshots still at floor 3 and aspiration 5; target now 5 and 8: %s', v, w));
  res := res || pg_temp.mom107_c('A person cannot change a snapshot', pg_temp.mom107_state(format('update public.period_snapshots set floor = 9 where user_id = %L', a)) = '42501');
  res := res || pg_temp.mom107_c('A person cannot delete a snapshot', pg_temp.mom107_state(format('delete from public.period_snapshots where user_id = %L', a)) = '42501');

  -- -------------------------------------------------------------------------
  -- The service role: ingestion for a person without a session, and nothing else
  -- -------------------------------------------------------------------------

  reset role;
  set local role service_role;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

  select count(*) into v from public.sources where id = sa_hev;
  select count(*) into w from public.target_sources where source_id = sa_hev;
  res := res || pg_temp.mom107_c('The service role reads sources and their bindings', v = 1 and w = 1, format('%s sources, %s bindings', v, w));

  res := res || pg_temp.mom107_c('The service role writes an entry for a synced source',
    pg_temp.mom107_state(format($q$insert into public.entries (user_id, target_id, source_id, source_record_id, occurred_at, value) values (%L, %L, %L, 'hevy-2', now(), 1)$q$, a, ta1, sa_hev)) = 'ok');
  res := res || pg_temp.mom107_c('A resync of the same record updates the entry instead of adding one',
    pg_temp.mom107_state(format($q$insert into public.entries (user_id, target_id, source_id, source_record_id, occurred_at, value) values (%L, %L, %L, 'hevy-2', now(), 2)
      on conflict (target_id, source_id, source_record_id) do update set value = excluded.value$q$, a, ta1, sa_hev)) = 'ok');
  select count(*), max(value)::int into v, w from public.entries where user_id = a and source_record_id = 'hevy-2';
  res := res || pg_temp.mom107_c('...and there is still one entry, with the new value', v = 1 and w = 2, format('%s entries, value %s', v, w));
  res := res || pg_temp.mom107_c('The service role cannot delete an entry', pg_temp.mom107_state(format('delete from public.entries where user_id = %L', a)) = '42501');

  s := null;
  foreach t in array array['person_settings', 'person_day_types', 'person_priorities', 'person_handling_rules', 'goals', 'targets',
                           'work_items', 'work_item_steps', 'entry_corrections', 'period_snapshots'] loop
    if pg_temp.mom107_state(format('select 1 from public.%I limit 1', t)) <> '42501' then s := coalesce(s || ', ', '') || t; end if;
  end loop;
  res := res || pg_temp.mom107_c('The service role cannot read the tables it has no job in', s is null, coalesce(s, 'all ten are closed'));
  res := res || pg_temp.mom107_c('The service role cannot write a snapshot',
    pg_temp.mom107_state(format($q$insert into public.period_snapshots (user_id, target_id, period_start, period_end, time_zone, week_start, measure, role, period_kind, floor, carry_over_kind)
      values (%L, %L, date '2026-03-05', date '2026-03-11', 'UTC', 1, 'count', 'effort', 'weekly', 3, 'habit')$q$, a, ta1)) = '42501');
  res := res || pg_temp.mom107_c('The service role cannot change a source or a binding',
    pg_temp.mom107_state(format('update public.sources set label = %L where id = %L', 'x', sa_hev)) = '42501'
    and pg_temp.mom107_state(format('delete from public.target_sources where source_id = %L', sa_hev)) = '42501');

  -- -------------------------------------------------------------------------
  -- A signed-out client: nothing
  -- -------------------------------------------------------------------------

  reset role;
  set local role anon;
  perform set_config('request.jwt.claims', '', true);

  s := null;
  foreach t in array tbls loop
    if pg_temp.mom107_state(format('select 1 from public.%I limit 1', t)) <> '42501' then s := coalesce(s || ', ', '') || t; end if;
  end loop;
  res := res || pg_temp.mom107_c('A signed-out client cannot read any of the 13 tables', s is null, coalesce(s, 'all closed'));

  -- -------------------------------------------------------------------------
  -- Removal (as postgres): the people's rows go with them, and nothing is left
  -- -------------------------------------------------------------------------

  reset role;
  perform set_config('request.jwt.claims', '', true);

  select count(*) into v from public.entries where user_id in (a, b);
  delete from auth.users where id in (a, b);

  s := null;
  foreach t in array tbls loop
    execute format('select count(*) from public.%I where user_id in (%L, %L)', t, a, b) into w;
    if w > 0 then s := coalesce(s || ', ', '') || t; end if;
  end loop;
  select count(*) into w from auth.users where email like 'mom107-verify-%';
  res := res || pg_temp.mom107_c('Deleting the accounts removes every row in all 13 tables and leaves nothing behind',
    v > 0 and s is null and w = 0, coalesce(s, format('%s entries before, no rows after, %s throwaway users left', v, w)));

  insert into mom107_results (n, check_name, passed, detail)
  select ord, e ->> 'c', (e ->> 'p')::boolean, e ->> 'd'
  from jsonb_array_elements(res) with ordinality as x (e, ord);
end;
$$;

select * from mom107_results order by n;
