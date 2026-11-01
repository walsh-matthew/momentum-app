-- Verification for supabase/migrations/021_add_after_setup.sql (MOM-132).
-- Run in the Supabase SQL Editor or with `npm run verify:sql` (local) or `supabase db query --linked -f` (hosted).
--
-- LEAVES NOTHING BEHIND, on production or anywhere. Every write this script makes (three throwaway accounts, their setups,
-- goals, targets and additions) is inside one inner BEGIN ... EXCEPTION block that always ends by raising an exception, which
-- makes Postgres undo the whole block, whatever the runner does with the session. The checks' results are kept in a plain
-- variable, which a rolled-back block does not undo, and are copied to the results table afterwards. The last two checks
-- run AFTER the rollback: no throwaway account is left, and no row for any of them remains in any table that holds a user.
--
-- What it proves:
--   - setup_additions has row level security and exactly SELECT and INSERT for a signed-in person, two policies, nothing for
--     anon and service_role, and a stored answer cannot be rewritten or removed;
--   - the new columns are there and are nullable (goals.sort_order, targets.sort_order, targets.start_date);
--   - every function is SECURITY INVOKER with an empty search_path; anon, service_role and PUBLIC cannot execute any of them,
--     and a signed-in person can execute the four callable ones but not the trigger function;
--   - the first-setup save still works, refuses a second setup (MS001), and now writes the order the person gave;
--   - add_goals_after_setup writes a new goal after the last one, leaves every row that existed exactly as it was (a
--     fingerprint of them is the same before and after), leaves the person's settings, day types and priorities alone,
--     answers a repeat of the same submission with the first answer and writes nothing, refuses a duplicate (same title and
--     start, case and spacing aside), refuses before a first setup, refuses a bad payload, and an addition that fails part-way
--     keeps nothing;
--   - add_targets_after_setup stores the target's OWN start, never before the goal's start or after its end, refuses a goal
--     that is parked, not the person's or not there, and a deadline target due before its start;
--   - a target's start can be neither set, changed nor cleared afterwards (all three refused), and an update that leaves it
--     as it is goes through;
--   - one person cannot reach another's goals or answers, directly or through the writer;
--   - additions go with the account.

drop table if exists pg_temp.mom132_results;
create temp table mom132_results (n int, check_name text, passed boolean, detail text);

create or replace function pg_temp.mom132_c(name text, passed boolean, detail text default '') returns jsonb
language sql as $$
  select jsonb_build_object('c', name, 'p', coalesce(passed, false), 'd', coalesce(detail, ''));
$$;

-- One statement, answered 'ok:<rows touched>' or the SQLSTATE it failed with.
create or replace function pg_temp.mom132_do(stmt text) returns text
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

-- One of the save functions with a payload: its answer, or {"error": SQLSTATE}.
create or replace function pg_temp.mom132_run(fn text, payload jsonb) returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  execute format('select public.%I($1)', fn) into r using payload;
  return r;
exception when others then
  return jsonb_build_object('error', sqlstate);
end;
$$;

-- The ids of everything a person owns that has one, and a fingerprint of those rows (and of the person's settings, day types and
-- priorities), so "nothing already saved changed" is a comparison and not a hope.
create or replace function pg_temp.mom132_ids(p_user uuid) returns uuid[]
language sql as $$
  select array_agg(id) from (
    select id from public.goals where user_id = p_user
    union all select id from public.targets where user_id = p_user
    union all select id from public.work_items where user_id = p_user
    union all select id from public.work_item_steps where user_id = p_user
    union all select id from public.sources where user_id = p_user
  ) x;
$$;

create or replace function pg_temp.mom132_fp(p_user uuid, p_ids uuid[]) returns text
language sql as $$
  select md5(coalesce(string_agg(j, '|' order by j), '')) from (
    select to_jsonb(g)::text as j from public.goals g where user_id = p_user and id = any (p_ids)
    union all select to_jsonb(t)::text from public.targets t where user_id = p_user and id = any (p_ids)
    union all select to_jsonb(w)::text from public.work_items w where user_id = p_user and id = any (p_ids)
    union all select to_jsonb(s)::text from public.work_item_steps s where user_id = p_user and id = any (p_ids)
    union all select to_jsonb(o)::text from public.sources o where user_id = p_user and id = any (p_ids)
    union all select to_jsonb(p)::text from public.person_settings p where user_id = p_user
    union all select to_jsonb(d)::text from public.person_day_types d where user_id = p_user
    union all select to_jsonb(r)::text from public.person_priorities r where user_id = p_user
  ) x;
$$;

do $$
declare
  a uuid := gen_random_uuid();   -- first setup, then additions
  b uuid := gen_random_uuid();   -- another person with a goal of their own
  c uuid := gen_random_uuid();   -- has not set up yet
  goal_run uuid;                 -- a's ongoing goal, first in the list
  goal_proj uuid;                -- a's finite goal, with an end date
  goal_park uuid;                -- a's parked goal
  goal_b uuid;                   -- b's goal
  t_runs uuid;                   -- a target made with its goal (start_date null)
  t_swim uuid;                   -- a target added later (start_date set)
  setup_payload jsonb;
  add_goal_payload jsonb;
  add_target_payload jsonb;
  r jsonb;
  s text;
  v int;
  w int;
  ids_before uuid[];
  fp_before text;
  n_additions int;
  n_left int;
  fn text;
  res jsonb := '[]';
begin
  begin
    insert into auth.users (id, email)
    values (a, 'mom132-verify-a@example.invalid'), (b, 'mom132-verify-b@example.invalid'), (c, 'mom132-verify-c@example.invalid');

    -- b already has a goal (written directly as the owner role, before anyone is impersonated).
    insert into public.goals (user_id, title, start_date, shape) values (b, 'verify goal b', '2026-10-05', 'ongoing') returning id into goal_b;

    -- -----------------------------------------------------------------------
    -- The table, the columns, and what the API roles may do
    -- -----------------------------------------------------------------------

    select count(*) into v from pg_class where oid = 'public.setup_additions'::regclass and relrowsecurity;
    res := res || pg_temp.mom132_c('setup_additions exists and has row level security on', v = 1);

    select string_agg(p, ',' order by p) into s
    from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
    where has_table_privilege('authenticated', 'public.setup_additions', p);
    res := res || pg_temp.mom132_c('A signed-in person has table privileges SELECT and INSERT only', s = 'INSERT,SELECT', coalesce(s, 'none'));

    select count(*) into v from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'setup_additions' and grantee = 'authenticated' and privilege_type in ('UPDATE', 'DELETE');
    res := res || pg_temp.mom132_c('No column of it can be updated by a signed-in person either', v = 0, format('%s columns', v));

    select count(*) into v from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
    where has_table_privilege('anon', 'public.setup_additions', p) or has_table_privilege('service_role', 'public.setup_additions', p);
    res := res || pg_temp.mom132_c('anon and service_role have no privilege on it', v = 0, format('%s privileges found', v));

    select string_agg(cmd || ' to ' || roles::text, '; ' order by cmd) into s
    from pg_policies where schemaname = 'public' and tablename = 'setup_additions';
    res := res || pg_temp.mom132_c('It has exactly two policies: SELECT and INSERT, both for authenticated only',
      s = 'INSERT to {authenticated}; SELECT to {authenticated}', coalesce(s, 'none'));

    select count(*) into v from information_schema.columns
    where table_schema = 'public' and is_nullable = 'YES'
      and ((table_name = 'goals' and column_name = 'sort_order')
        or (table_name = 'targets' and column_name in ('sort_order', 'start_date')));
    res := res || pg_temp.mom132_c('goals.sort_order, targets.sort_order and targets.start_date exist and can be null (null = not stored / from the goal)', v = 3, format('%s of 3', v));

    -- -----------------------------------------------------------------------
    -- The functions: who may execute them, and how they run
    -- -----------------------------------------------------------------------

    select string_agg(p.proname, ', ' order by p.proname) into s
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('save_guided_setup', 'add_goals_after_setup', 'add_targets_after_setup', 'write_setup_targets', 'targets_freeze_start_date')
      and (p.prosecdef or not exists (select 1 from unnest(p.proconfig) as cfg (setting) where cfg.setting = 'search_path=""'));
    res := res || pg_temp.mom132_c('All five are SECURITY INVOKER with an empty search_path', s is null, coalesce(s, 'all five'));

    select count(*) into v from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('save_guided_setup', 'add_goals_after_setup', 'add_targets_after_setup', 'write_setup_targets', 'targets_freeze_start_date');
    res := res || pg_temp.mom132_c('There is exactly one version of each of the five (no old signature left executable)', v = 5, format('%s functions', v));

    select string_agg(x.fn || ' for ' || ro.role_name, ', ' order by x.fn, ro.role_name) into s
    from unnest(array['public.save_guided_setup(jsonb)', 'public.add_goals_after_setup(jsonb)', 'public.add_targets_after_setup(jsonb)',
                      'public.write_setup_targets(uuid,jsonb,jsonb,date,integer)', 'public.targets_freeze_start_date()']) as x (fn)
    cross join unnest(array['anon', 'service_role']) as ro (role_name)
    where has_function_privilege(ro.role_name, x.fn, 'execute');
    res := res || pg_temp.mom132_c('anon and service_role cannot execute any of the five', s is null, coalesce(s, 'none can'));

    select count(*) into v from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('save_guided_setup', 'add_goals_after_setup', 'add_targets_after_setup', 'write_setup_targets', 'targets_freeze_start_date')
      and acl.grantee = 0 and acl.privilege_type = 'EXECUTE';
    res := res || pg_temp.mom132_c('PUBLIC cannot execute any of the five', v = 0, format('%s PUBLIC grants', v));

    select string_agg(x.fn, ', ' order by x.fn) into s
    from unnest(array['public.save_guided_setup(jsonb)', 'public.add_goals_after_setup(jsonb)', 'public.add_targets_after_setup(jsonb)',
                      'public.write_setup_targets(uuid,jsonb,jsonb,date,integer)']) as x (fn)
    where not has_function_privilege('authenticated', x.fn, 'execute');
    res := res || pg_temp.mom132_c('A signed-in person can execute the four callable functions', s is null, coalesce(s, 'all four'));

    res := res || pg_temp.mom132_c('A signed-in person cannot execute the trigger function',
      not has_function_privilege('authenticated', 'public.targets_freeze_start_date()', 'execute'));

    select string_agg(ro.role_name || ' ' || x.fn, ', ' order by ro.role_name, x.fn) into s
    from unnest(array['anon', 'service_role']) as ro (role_name)
    cross join unnest(array['add_goals_after_setup', 'add_targets_after_setup', 'save_guided_setup']) as x (fn)
    where pg_temp.mom132_do(format('set local role %I; select public.%I(%L::jsonb)', ro.role_name, x.fn, '{}')) <> '42501';
    reset role;
    res := res || pg_temp.mom132_c('Calling a save directly as anon or service_role is refused by privilege', s is null, coalesce(s, 'refused for all'));

    -- -----------------------------------------------------------------------
    -- The first-setup save still works, still refuses a second setup, and now writes the order the person gave (user a)
    -- -----------------------------------------------------------------------

    setup_payload := $j${
      "person": {"time_zone": "America/Chicago", "week_start": 1, "day_end": "21:00:00"},
      "day_types": [{"name": "Work day", "capacity_unit": "hours", "capacity_amount": 2}],
      "priorities": [{"label": "Family", "sort_order": 0}],
      "goals": [
        {"key": "run", "title": "Run more", "why": "to feel strong", "start_date": "2026-10-05", "shape": "ongoing",
         "block_weeks": 10, "state": "active",
         "targets": [
           {"key": "runs", "title": "Runs", "measure": "count", "role": "effort", "period_kind": "weekly", "floor": 3,
            "carry_over_kind": "habit", "sources": [{"kind": "manual"}]},
           {"key": "long", "title": "Long run", "measure": "count", "role": "effort", "period_kind": "weekly", "floor": 1,
            "carry_over_kind": "habit", "sources": [{"kind": "manual"}]}],
         "items": [{"key": "h", "kind": "habit", "title": "Go for a run", "target_key": "runs", "sort_order": 0}]},
        {"key": "proj", "title": "Write the report", "start_date": "2026-10-05", "shape": "finite", "end_date": "2026-12-01", "state": "active",
         "targets": [
           {"key": "d", "title": "Draft", "measure": "count", "role": "effort", "period_kind": "deadline", "due_date": "2026-11-30",
            "floor": 1, "carry_over_kind": "cumulative", "sources": [{"kind": "manual"}]}],
         "items": []},
        {"key": "later", "title": "Learn piano", "state": "parked", "return_kind": "on_request", "targets": [], "items": []}
      ]}$j$::jsonb;

    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

    r := pg_temp.mom132_run('save_guided_setup', setup_payload);
    res := res || pg_temp.mom132_c('The first-setup save still works and answers as it did',
      r = '{"goals": 3, "targets": 3, "work_items": 1, "steps": 0, "bindings": 3}'::jsonb, r::text);

    select id into goal_run from public.goals where user_id = a and title = 'Run more';
    select id into goal_proj from public.goals where user_id = a and title = 'Write the report';
    select id into goal_park from public.goals where user_id = a and title = 'Learn piano';

    select string_agg(title || '=' || coalesce(sort_order::text, 'null'), ', ' order by sort_order) into s from public.goals where user_id = a;
    res := res || pg_temp.mom132_c('It wrote the goals in the order they came: 0, 1, 2', s = 'Run more=0, Write the report=1, Learn piano=2', s);

    select string_agg(title || '=' || coalesce(sort_order::text, 'null'), ', ' order by title) into s from public.targets where goal_id = goal_run;
    res := res || pg_temp.mom132_c('...and each goal''s targets in the order they came', s = 'Long run=1, Runs=0', s);

    select count(*) into v from public.targets where user_id = a and start_date is not null;
    res := res || pg_temp.mom132_c('A target made with its goal has no start of its own (it counts from its goal)', v = 0, format('%s with a start', v));

    r := pg_temp.mom132_run('save_guided_setup', setup_payload);
    res := res || pg_temp.mom132_c('A second first-setup save is still refused (MS001)', r = '{"error": "MS001"}'::jsonb, r::text);

    -- -----------------------------------------------------------------------
    -- Adding a goal (user a)
    -- -----------------------------------------------------------------------

    ids_before := pg_temp.mom132_ids(a);
    fp_before := pg_temp.mom132_fp(a, ids_before);

    add_goal_payload := $j${
      "submission_id": "00000000-0000-4000-8000-000000000001",
      "goals": [
        {"key": "read", "title": "Read more", "start_date": "2026-11-02", "shape": "ongoing", "block_weeks": 8, "state": "active",
         "targets": [
           {"key": "pages", "title": "Pages", "measure": "quantity", "unit": "pages", "role": "effort", "period_kind": "weekly",
            "floor": 50, "carry_over_kind": "habit", "sources": [{"kind": "manual"}]},
           {"key": "sess", "title": "Sessions", "measure": "count", "role": "effort", "period_kind": "weekly", "floor": 3,
            "carry_over_kind": "habit", "sources": [{"kind": "manual"}]}],
         "items": [{"key": "hh", "kind": "habit", "title": "Read", "target_key": "pages", "sort_order": 0}]}
      ]}$j$::jsonb;

    r := pg_temp.mom132_run('add_goals_after_setup', add_goal_payload);
    res := res || pg_temp.mom132_c('A person who has set up can add a goal; it answers with what it wrote',
      r = '{"goals": 1, "targets": 2, "work_items": 1, "steps": 0, "bindings": 2}'::jsonb, r::text);

    select string_agg(title || '=' || coalesce(sort_order::text, 'null'), ', ' order by sort_order) into s from public.goals where user_id = a;
    res := res || pg_temp.mom132_c('The new goal goes after the last one (place 3)',
      s = 'Run more=0, Write the report=1, Learn piano=2, Read more=3', s);

    select string_agg(title || '=' || coalesce(sort_order::text, 'null') || '/' || coalesce(start_date::text, 'goal'), ', ' order by sort_order)
      into s from public.targets where user_id = a and title in ('Pages', 'Sessions');
    res := res || pg_temp.mom132_c('Its targets have their own places (0, 1) and no start of their own',
      s = 'Pages=0/goal, Sessions=1/goal', s);

    res := res || pg_temp.mom132_c('Every row that existed is exactly as it was, and so are the person''s settings, day types and priorities',
      pg_temp.mom132_fp(a, ids_before) = fp_before);

    select count(*) into v from public.sources where user_id = a and kind = 'manual';
    res := res || pg_temp.mom132_c('The person''s one manual source was reused, not made again', v = 1, format('%s manual sources', v));

    -- A second tap, or a retry after a lost reply, is the same approval.
    r := pg_temp.mom132_run('add_goals_after_setup', add_goal_payload);
    select count(*) into v from public.goals where user_id = a and title = 'Read more';
    select count(*) into w from public.targets where user_id = a and title in ('Pages', 'Sessions');
    res := res || pg_temp.mom132_c('A repeat of the same submission returns the first answer, marked replayed, and writes nothing',
      r = '{"goals": 1, "targets": 2, "work_items": 1, "steps": 0, "bindings": 2, "replayed": true}'::jsonb and v = 1 and w = 2,
      format('%s; %s goal, %s targets', r, v, w));

    select count(*) into n_additions from public.setup_additions where user_id = a;
    res := res || pg_temp.mom132_c('...and only one answer is stored for it', n_additions = 1, format('%s stored', n_additions));

    -- The same goal as a different approval (a second tab): same title and start, case and spacing aside.
    r := pg_temp.mom132_run('add_goals_after_setup',
      jsonb_set(jsonb_set(add_goal_payload, '{submission_id}', '"00000000-0000-4000-8000-000000000002"'), '{goals,0,title}', '"  READ MORE "'));
    select count(*) into v from public.goals where user_id = a and lower(trim(title)) = 'read more';
    res := res || pg_temp.mom132_c('The same title and start under a new submission is refused (MS002) and nothing is added',
      r = '{"error": "MS002"}'::jsonb and v = 1, format('%s; %s goals', r, v));

    -- The same title with another start is a different goal.
    r := pg_temp.mom132_run('add_goals_after_setup',
      jsonb_set(jsonb_set(add_goal_payload, '{submission_id}', '"00000000-0000-4000-8000-000000000003"'), '{goals,0,start_date}', '"2026-12-07"'));
    res := res || pg_temp.mom132_c('The same title with another start date is allowed (the person''s choice)', (r ->> 'goals') = '1', r::text);

    -- Refusals that leave nothing behind.
    select count(*) into v from public.setup_additions where user_id = a;
    r := pg_temp.mom132_run('add_goals_after_setup', add_goal_payload - 'submission_id');
    res := res || pg_temp.mom132_c('No submission id is refused (22023)', r = '{"error": "22023"}'::jsonb, r::text);
    r := pg_temp.mom132_run('add_goals_after_setup', jsonb_set(add_goal_payload, '{submission_id}', '"not-a-uuid"'));
    res := res || pg_temp.mom132_c('A submission id that is not a uuid is refused (22023)', r = '{"error": "22023"}'::jsonb, r::text);
    r := pg_temp.mom132_run('add_goals_after_setup', add_goal_payload || '{"person": {}}'::jsonb);
    res := res || pg_temp.mom132_c('A payload with any other key (for example "person") is refused (22023)', r = '{"error": "22023"}'::jsonb, r::text);
    r := pg_temp.mom132_run('add_goals_after_setup', jsonb_set(add_goal_payload, '{goals}', '[]'));
    res := res || pg_temp.mom132_c('No goals is refused (22023)', r = '{"error": "22023"}'::jsonb, r::text);

    -- Part-way: the second goal's item feeds a target that is not in its goal, after the first goal was written in the same call.
    r := pg_temp.mom132_run('add_goals_after_setup', jsonb_build_object('submission_id', '00000000-0000-4000-8000-000000000004', 'goals', jsonb_build_array(
      jsonb_build_object('key', 'x1', 'title', 'Half a goal', 'start_date', '2026-11-02', 'shape', 'ongoing', 'state', 'active', 'targets', '[]'::jsonb, 'items', '[]'::jsonb),
      jsonb_build_object('key', 'x2', 'title', 'Broken goal', 'start_date', '2026-11-02', 'shape', 'ongoing', 'state', 'active', 'targets', '[]'::jsonb,
        'items', jsonb_build_array(jsonb_build_object('key', 'i', 'kind', 'milestone', 'title', 'Orphan', 'target_key', 'nope'))))));
    select count(*) into v from public.goals where user_id = a and title in ('Half a goal', 'Broken goal');
    select count(*) into w from public.setup_additions where user_id = a and id = '00000000-0000-4000-8000-000000000004';
    res := res || pg_temp.mom132_c('An addition that fails part-way keeps nothing: no goal, and no stored answer',
      r = '{"error": "22023"}'::jsonb and v = 0 and w = 0, format('%s; %s goals, %s answers', r, v, w));

    -- -----------------------------------------------------------------------
    -- Adding a target to a goal that has already started (user a)
    -- -----------------------------------------------------------------------

    ids_before := pg_temp.mom132_ids(a);
    fp_before := pg_temp.mom132_fp(a, ids_before);

    add_target_payload := jsonb_build_object(
      'submission_id', '00000000-0000-4000-8000-000000000010', 'goal_id', goal_run, 'start_date', '2026-11-09',
      'targets', jsonb_build_array(jsonb_build_object('key', 'swim', 'title', 'Swims', 'measure', 'count', 'role', 'effort',
        'period_kind', 'weekly', 'floor', 1, 'carry_over_kind', 'habit', 'sources', jsonb_build_array(jsonb_build_object('kind', 'manual')))),
      'items', jsonb_build_array(jsonb_build_object('key', 'sw', 'kind', 'habit', 'title', 'Swim', 'target_key', 'swim', 'sort_order', 0)));

    r := pg_temp.mom132_run('add_targets_after_setup', add_target_payload);
    res := res || pg_temp.mom132_c('A target can be added to a goal that has already started',
      r = '{"goals": 0, "targets": 1, "work_items": 1, "steps": 0, "bindings": 1}'::jsonb, r::text);

    select id into t_swim from public.targets where user_id = a and title = 'Swims';
    select count(*) into v from public.targets where id = t_swim and start_date = '2026-11-09' and sort_order = 2 and goal_id = goal_run;
    res := res || pg_temp.mom132_c('It stores the start the person gave, and goes after the goal''s last target (place 2)', v = 1, v::text);

    res := res || pg_temp.mom132_c('Every row that existed is exactly as it was (the goal''s start and its other targets included)',
      pg_temp.mom132_fp(a, ids_before) = fp_before);

    r := pg_temp.mom132_run('add_targets_after_setup', add_target_payload);
    select count(*) into v from public.targets where user_id = a and title = 'Swims';
    res := res || pg_temp.mom132_c('A repeat of the same submission writes nothing and answers the same, marked replayed',
      (r ->> 'replayed') = 'true' and (r ->> 'targets') = '1' and v = 1, format('%s; %s targets', r, v));

    r := pg_temp.mom132_run('add_targets_after_setup', jsonb_set(add_target_payload, '{submission_id}', '"00000000-0000-4000-8000-000000000011"'));
    res := res || pg_temp.mom132_c('The same title and start under a new submission is refused (MS002)', r = '{"error": "MS002"}'::jsonb, r::text);

    r := pg_temp.mom132_run('add_targets_after_setup', jsonb_set(jsonb_set(add_target_payload, '{submission_id}', '"00000000-0000-4000-8000-000000000012"'), '{start_date}', '"2026-10-01"'));
    res := res || pg_temp.mom132_c('A start before the goal started is refused (MS005)', r = '{"error": "MS005"}'::jsonb, r::text);

    r := pg_temp.mom132_run('add_targets_after_setup', jsonb_set(jsonb_set(add_target_payload, '{submission_id}', '"00000000-0000-4000-8000-000000000013"'), '{goal_id}', to_jsonb(goal_proj::text)) || '{"start_date": "2026-12-15"}'::jsonb);
    res := res || pg_temp.mom132_c('A start after the goal ends is refused (MS005)', r = '{"error": "MS005"}'::jsonb, r::text);

    r := pg_temp.mom132_run('add_targets_after_setup', jsonb_set(jsonb_set(add_target_payload, '{submission_id}', '"00000000-0000-4000-8000-000000000014"'), '{goal_id}', to_jsonb(goal_park::text)));
    res := res || pg_temp.mom132_c('A parked goal is refused (MS004)', r = '{"error": "MS004"}'::jsonb, r::text);

    r := pg_temp.mom132_run('add_targets_after_setup', jsonb_set(jsonb_set(add_target_payload, '{submission_id}', '"00000000-0000-4000-8000-000000000015"'), '{goal_id}', to_jsonb(goal_b::text)));
    res := res || pg_temp.mom132_c('Another person''s goal is refused (MS004)', r = '{"error": "MS004"}'::jsonb, r::text);

    r := pg_temp.mom132_run('add_targets_after_setup', jsonb_set(jsonb_set(add_target_payload, '{submission_id}', '"00000000-0000-4000-8000-000000000016"'), '{goal_id}', to_jsonb(gen_random_uuid()::text)));
    res := res || pg_temp.mom132_c('A goal that does not exist is refused (MS004)', r = '{"error": "MS004"}'::jsonb, r::text);

    r := pg_temp.mom132_run('add_targets_after_setup', (add_target_payload - 'start_date') || '{"submission_id": "00000000-0000-4000-8000-000000000017"}'::jsonb);
    res := res || pg_temp.mom132_c('No start date is refused: there is no default (22023)', r = '{"error": "22023"}'::jsonb, r::text);

    r := pg_temp.mom132_run('add_targets_after_setup', jsonb_set(jsonb_set(add_target_payload, '{submission_id}', '"00000000-0000-4000-8000-000000000018"'), '{targets,0}',
      '{"key": "dl", "title": "Race entry", "measure": "count", "role": "effort", "period_kind": "deadline", "due_date": "2026-11-01", "floor": 1, "carry_over_kind": "cumulative"}'::jsonb) - 'items');
    select count(*) into v from public.targets where user_id = a and title = 'Race entry';
    res := res || pg_temp.mom132_c('A deadline target due before its start is refused (23514) and nothing is kept', r = '{"error": "23514"}'::jsonb and v = 0, format('%s; %s rows', r, v));

    -- -----------------------------------------------------------------------
    -- A target's start: set once, never changed (user a, as a signed-in person with the table-wide UPDATE of 013)
    -- -----------------------------------------------------------------------

    select id into t_runs from public.targets where user_id = a and title = 'Runs';

    s := pg_temp.mom132_do(format($q$update public.targets set start_date = '2026-11-16' where id = %L$q$, t_swim));
    res := res || pg_temp.mom132_c('A start that was set cannot be changed to another date', s = '23514', s);

    s := pg_temp.mom132_do(format($q$update public.targets set start_date = null where id = %L$q$, t_swim));
    res := res || pg_temp.mom132_c('A start that was set cannot be cleared', s = '23514', s);

    s := pg_temp.mom132_do(format($q$update public.targets set start_date = '2026-11-16' where id = %L$q$, t_runs));
    res := res || pg_temp.mom132_c('A target with no start of its own cannot be given one later (that would re-grade its weeks)', s = '23514', s);

    s := pg_temp.mom132_do(format($q$update public.targets set start_date = start_date, title = 'Swims, renamed' where id = %L$q$, t_swim));
    res := res || pg_temp.mom132_c('An update that leaves the start as it is goes through', s = 'ok:1', s);

    select count(*) into v from public.targets where id = t_swim and start_date = '2026-11-09';
    res := res || pg_temp.mom132_c('The start is still the one the person gave', v = 1, v::text);

    s := pg_temp.mom132_do(format($q$delete from public.targets where id = %L$q$, t_swim));
    res := res || pg_temp.mom132_c('A target cannot be deleted and written again with another start', s = '42501', s);

    -- -----------------------------------------------------------------------
    -- Nobody sets up through the add functions, and nobody reaches another person's rows (users c, then b)
    -- -----------------------------------------------------------------------

    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);

    r := pg_temp.mom132_run('add_goals_after_setup', jsonb_set(add_goal_payload, '{submission_id}', '"00000000-0000-4000-8000-000000000020"'));
    select count(*) into v from public.goals where user_id = c;
    res := res || pg_temp.mom132_c('A person with no first setup cannot add a goal (MS003)', r = '{"error": "MS003"}'::jsonb and v = 0, format('%s; %s goals', r, v));

    r := pg_temp.mom132_run('add_targets_after_setup', jsonb_set(add_target_payload, '{submission_id}', '"00000000-0000-4000-8000-000000000021"'));
    res := res || pg_temp.mom132_c('...nor add a target (MS003)', r = '{"error": "MS003"}'::jsonb, r::text);

    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);

    select count(*) into v from public.setup_additions;
    res := res || pg_temp.mom132_c('Another person reads none of a''s stored answers', v = 0, v::text);

    s := pg_temp.mom132_do(format($q$insert into public.setup_additions (id, user_id, kind, result) values (gen_random_uuid(), %L, 'goals', '{}')$q$, a));
    res := res || pg_temp.mom132_c('Writing a stored answer in another person''s name is refused by row level security', s = '42501', s);

    s := pg_temp.mom132_do(format($q$select public.write_setup_targets(%L, '[]'::jsonb, '[]'::jsonb, null, 0)$q$, goal_run));
    res := res || pg_temp.mom132_c('The writer, called directly with another person''s goal, is refused (MS004)', s = 'MS004', s);

    -- b can add to their own goal, and it does not touch a's.
    r := pg_temp.mom132_run('add_targets_after_setup', jsonb_build_object('submission_id', '00000000-0000-4000-8000-000000000022', 'goal_id', goal_b, 'start_date', '2026-10-12',
      'targets', jsonb_build_array(jsonb_build_object('key', 't', 'title', 'Verify b target', 'measure', 'count', 'role', 'effort', 'period_kind', 'weekly', 'floor', 2, 'carry_over_kind', 'habit'))));
    select count(*) into v from public.targets where user_id = b;
    res := res || pg_temp.mom132_c('Another person can add a target to their own goal', (r ->> 'targets') = '1' and v = 1, format('%s; %s targets', r, v));

    -- -----------------------------------------------------------------------
    -- A stored answer is what was saved: it cannot be rewritten or removed (user a)
    -- -----------------------------------------------------------------------

    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

    s := pg_temp.mom132_do(format($q$update public.setup_additions set result = '{}' where user_id = %L$q$, a));
    res := res || pg_temp.mom132_c('A person cannot rewrite a stored answer', s = '42501', s);
    s := pg_temp.mom132_do(format($q$delete from public.setup_additions where user_id = %L$q$, a));
    res := res || pg_temp.mom132_c('A person cannot delete a stored answer', s = '42501', s);

    -- -----------------------------------------------------------------------
    -- Additions go with the account (counted first so "none remain" is not an empty claim)
    -- -----------------------------------------------------------------------

    reset role;
    select count(*) into v from public.setup_additions where user_id in (a, b, c);
    delete from auth.users where id in (a, b, c);
    res := res || pg_temp.mom132_c('Deleting the accounts removes every stored answer they had',
      v >= 4 and (select count(*) from public.setup_additions where user_id in (a, b, c)) = 0, format('%s answers before', v));

    -- Undo every write above. The handler below expects exactly this exception.
    raise exception 'mom132_rollback';
  exception when others then
    if sqlerrm <> 'mom132_rollback' then
      res := res || pg_temp.mom132_c('The script ran to its end with no unexpected error', false, sqlstate || ' ' || sqlerrm);
    end if;
  end;

  -- -------------------------------------------------------------------------
  -- After the rollback: nothing is left
  -- -------------------------------------------------------------------------

  select count(*) into n_left from auth.users where email like 'mom132-verify-%';
  res := res || pg_temp.mom132_c('The rollback left no throwaway account behind', n_left = 0, format('%s left', n_left));

  select (select count(*) from public.users where id in (a, b, c))
       + (select count(*) from public.goals where user_id in (a, b, c))
       + (select count(*) from public.targets where user_id in (a, b, c))
       + (select count(*) from public.work_items where user_id in (a, b, c))
       + (select count(*) from public.sources where user_id in (a, b, c))
       + (select count(*) from public.person_settings where user_id in (a, b, c))
       + (select count(*) from public.setup_additions where user_id in (a, b, c))
  into v;
  res := res || pg_temp.mom132_c('The rollback left no goal, target, item, source, setting, answer or user row for any of them', v = 0, format('%s rows left', v));

  insert into mom132_results (n, check_name, passed, detail)
  select ord, e2 ->> 'c', (e2 ->> 'p')::boolean, e2 ->> 'd'
  from jsonb_array_elements(res) with ordinality as x (e2, ord);
end;
$$;

select * from mom132_results order by n;
