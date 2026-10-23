-- Verification for supabase/migrations/008_goal_preferences.sql (MOM-34).
-- Run in the Supabase SQL Editor or with `supabase db query --linked -f`. Safe to re-run.
-- Creates two throwaway auth users, checks the seed, the new CHECKs, the insert trigger and RLS as each,
-- then deletes them. Leaves no data behind: an unexpected error rolls back the whole block.

drop table if exists pg_temp.mom34_results;
create temp table mom34_results (n int, check_name text, passed boolean, detail text);

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  a_seed uuid;
  a_goal uuid;
  v int;
  w int;
  t text;
  res jsonb := '[]';
begin
  insert into auth.users (id, email)
  values (a, 'mom34-verify-a@example.invalid'), (b, 'mom34-verify-b@example.invalid');
  select id into a_seed from public.goal_channels where user_id = a and channel_key = 'career_pivot';

  -- -------------------------------------------------------------------------
  -- Existing rows and the signup seed (as postgres)
  -- -------------------------------------------------------------------------

  select count(*) into v from public.goal_channels where user_id = a and goal_type = 'career_pivot' and preferences = '{}'::jsonb and is_default;
  res := res || jsonb_build_object('c', 'The seeded Career Pivot records its goal type and starts with no preferences', 'p', v = 1, 'd', format('%s rows', v));

  select count(*) into v from public.goal_channels where goal_type is null and is_default and channel_key = 'career_pivot';
  res := res || jsonb_build_object('c', 'No seeded Career Pivot anywhere is left without a goal type (backfill)', 'p', v = 0, 'd', format('%s rows', v));

  -- The backfill statement from migration 008 section 3, on rows made to look pre-migration.
  update public.goal_channels set goal_type = null where id = a_seed;
  insert into public.goal_channels (user_id, channel_key, title, criteria)
  values (a, 'older_goal', 'Older goal', '[]');
  update public.goal_channels set goal_type = 'career_pivot'
  where is_default and channel_key = 'career_pivot' and goal_type is null;
  select count(*) into v from public.goal_channels where id = a_seed and goal_type = 'career_pivot';
  res := res || jsonb_build_object('c', 'The backfill sets the seeded default', 'p', v = 1, 'd', format('%s rows', v));
  select count(*) into v from public.goal_channels where user_id = a and channel_key = 'older_goal' and goal_type is null and preferences = '{}'::jsonb;
  res := res || jsonb_build_object('c', 'The backfill leaves other goals with no type and empty preferences', 'p', v = 1, 'd', format('%s rows', v));
  delete from public.goal_channels where user_id = a and channel_key = 'older_goal';

  res := res || jsonb_build_object('c', 'API roles cannot execute the criteria guard function', 'p',
    not has_function_privilege('anon', 'public.goal_channels_guard_new_criteria()', 'execute')
    and not has_function_privilege('authenticated', 'public.goal_channels_guard_new_criteria()', 'execute')
    and not has_function_privilege('service_role', 'public.goal_channels_guard_new_criteria()', 'execute'),
    'd', 'execute privilege checked for anon, authenticated, service_role');

  -- -------------------------------------------------------------------------
  -- Signed in as user A: the wizard path (insert as the user, through RLS)
  -- -------------------------------------------------------------------------

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

  insert into public.goal_channels (user_id, channel_key, title, is_default, target_date, criteria, goal_type, preferences)
  values (a, 'get_certified', 'Get certified', false, current_date + 90,
    '[{"key": "exam_booked", "label": "The exam is booked, with a date", "done": false},
      {"key": "certification_earned", "label": "The certification is earned", "done": false}]'::jsonb,
    'get_certified',
    '{"constraints": ["flexible_hours", "dont_track_hours"], "pace": "lighter"}'::jsonb)
  returning id into a_goal;
  res := res || jsonb_build_object('c', 'The owner can create a wizard goal with a type, preferences and unticked criteria', 'p', a_goal is not null, 'd', coalesce(a_goal::text, 'no row'));

  select count(*) into v from public.goal_channels
  where id = a_goal and goal_type = 'get_certified'
    and preferences -> 'constraints' = '["flexible_hours", "dont_track_hours"]'::jsonb
    and preferences ->> 'pace' = 'lighter'
    and jsonb_array_length(criteria) = 2
    and not exists (select 1 from jsonb_array_elements(criteria) c where (c -> 'done') is distinct from 'false'::jsonb);
  res := res || jsonb_build_object('c', 'The three answers and the criteria reload with the goal', 'p', v = 1, 'd', format('%s rows', v));

  -- -------------------------------------------------------------------------
  -- goal_type CHECK
  -- -------------------------------------------------------------------------

  begin
    insert into public.goal_channels (user_id, channel_key, title, goal_type) values (a, 'bad_type', 'Bad type', 'become_a_wizard');
    res := res || jsonb_build_object('c', 'The CHECK rejects an unknown goal_type', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'The CHECK rejects an unknown goal_type', 'p', sqlstate = '23514', 'd', sqlstate || ' ' || sqlerrm);
  end;

  begin
    insert into public.goal_channels (user_id, channel_key, title, goal_type) values (a, 'bad_case', 'Bad case', 'Career pivot');
    res := res || jsonb_build_object('c', 'goal_type must be the lowercase key, not the label', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'goal_type must be the lowercase key, not the label', 'p', sqlstate = '23514', 'd', sqlstate);
  end;

  v := 0;
  foreach t in array array['career_pivot', 'get_certified', 'portfolio_piece', 'interview_prep', 'grow_network'] loop
    insert into public.goal_channels (user_id, channel_key, title, goal_type) values (a, 'type_' || t, 'Type ' || t, t);
    v := v + 1;
  end loop;
  res := res || jsonb_build_object('c', 'Every goal type the wizard offers is accepted', 'p', v = 5, 'd', format('%s of 5 inserted', v));

  insert into public.goal_channels (user_id, channel_key, title) values (a, 'no_type', 'No type');
  select count(*) into v from public.goal_channels where user_id = a and channel_key = 'no_type' and goal_type is null and preferences = '{}'::jsonb;
  res := res || jsonb_build_object('c', 'A goal with no type and no preferences is allowed (defaults)', 'p', v = 1, 'd', format('%s rows', v));

  -- -------------------------------------------------------------------------
  -- preferences shape CHECK
  -- -------------------------------------------------------------------------

  foreach t in array array[
    '{"theme": "dark"}',
    '{"constraints": ["work_weekends"]}',
    '{"constraints": "flexible_hours"}',
    '{"constraints": [1]}',
    '{"constraints": null}',
    '{"pace": "turbo"}',
    '{"pace": 3}',
    '{"pace": null}',
    '{"pace": ["lighter"]}',
    '["flexible_hours"]',
    '5',
    '"lighter"',
    'null'
  ] loop
    begin
      insert into public.goal_channels (user_id, channel_key, title, preferences) values (a, 'prefs_bad', 'Prefs bad', t::jsonb);
      res := res || jsonb_build_object('c', format('preferences rejects %s', t), 'p', false, 'd', 'insert succeeded');
      delete from public.goal_channels where user_id = a and channel_key = 'prefs_bad';
    exception when others then
      res := res || jsonb_build_object('c', format('preferences rejects %s', t), 'p', sqlstate in ('23514', '23502'), 'd', sqlstate || ' ' || sqlerrm);
    end;
  end loop;

  v := 0;
  foreach t in array array[
    '{}',
    '{"pace": "carry_over"}',
    '{"constraints": ["flexible_dates"]}',
    '{"constraints": [], "pace": "ahead"}',
    '{"constraints": ["flexible_hours", "contract_work_first", "dont_track_hours", "flexible_dates"], "pace": "behind"}'
  ] loop
    insert into public.goal_channels (user_id, channel_key, title, preferences) values (a, 'prefs_ok_' || v, 'Prefs ok', t::jsonb);
    v := v + 1;
  end loop;
  res := res || jsonb_build_object('c', 'Valid preferences, empty to full, are accepted', 'p', v = 5, 'd', format('%s of 5 inserted', v));

  -- -------------------------------------------------------------------------
  -- Criteria cannot arrive ticked (insert trigger), but the owner can tick later
  -- -------------------------------------------------------------------------

  begin
    insert into public.goal_channels (user_id, channel_key, title, criteria)
    values (a, 'ticked', 'Ticked', '[{"key": "a", "label": "A", "done": true}]');
    res := res || jsonb_build_object('c', 'A goal cannot be created with a ticked criterion', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A goal cannot be created with a ticked criterion', 'p', sqlstate = '23514', 'd', sqlstate || ' ' || sqlerrm);
  end;

  begin
    insert into public.goal_channels (user_id, channel_key, title, criteria)
    values (a, 'one_ticked', 'One ticked', '[{"key": "a", "label": "A", "done": false}, {"key": "b", "label": "B", "done": true}]');
    res := res || jsonb_build_object('c', 'One ticked criterion among unticked ones is still rejected', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'One ticked criterion among unticked ones is still rejected', 'p', sqlstate = '23514', 'd', sqlstate);
  end;

  begin
    insert into public.goal_channels (user_id, channel_key, title, criteria)
    values (a, 'no_done', 'No done', '[{"key": "a", "label": "A"}]');
    res := res || jsonb_build_object('c', 'A criterion with no done flag is rejected', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A criterion with no done flag is rejected', 'p', sqlstate = '23514', 'd', sqlstate);
  end;

  begin
    insert into public.goal_channels (user_id, channel_key, title, criteria)
    values (a, 'string_done', 'String done', '[{"key": "a", "label": "A", "done": "false"}]');
    res := res || jsonb_build_object('c', 'A non-boolean done is rejected', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A non-boolean done is rejected', 'p', sqlstate = '23514', 'd', sqlstate);
  end;

  begin
    insert into public.goal_channels (user_id, channel_key, title, criteria) values (a, 'not_array', 'Not array', '{"done": false}');
    res := res || jsonb_build_object('c', 'Criteria that is not an array is still rejected', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'Criteria that is not an array is still rejected', 'p', sqlstate = '23514', 'd', sqlstate || ' ' || sqlerrm);
  end;

  update public.goal_channels
  set criteria = '[{"key": "exam_booked", "label": "The exam is booked, with a date", "done": true},
                   {"key": "certification_earned", "label": "The certification is earned", "done": false}]'::jsonb
  where id = a_goal;
  get diagnostics v = row_count;
  select count(*) into w from public.goal_channels where id = a_goal and criteria -> 0 ->> 'done' = 'true';
  res := res || jsonb_build_object('c', 'The owner can tick a criterion after the goal exists', 'p', v = 1 and w = 1, 'd', format('%s rows changed, %s ticked', v, w));

  -- -------------------------------------------------------------------------
  -- Preferences can be changed later, and stay checked
  -- -------------------------------------------------------------------------

  update public.goal_channels set preferences = '{"pace": "heavier"}'::jsonb where id = a_goal;
  get diagnostics v = row_count;
  res := res || jsonb_build_object('c', 'The owner can change preferences to another valid value', 'p', v = 1, 'd', format('%s rows changed', v));

  begin
    update public.goal_channels set preferences = '{"pace": "turbo"}'::jsonb where id = a_goal;
    res := res || jsonb_build_object('c', 'An update to an invalid preference is rejected', 'p', false, 'd', 'update succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'An update to an invalid preference is rejected', 'p', sqlstate = '23514', 'd', sqlstate);
  end;

  begin
    update public.goal_channels set goal_type = 'nope' where id = a_goal;
    res := res || jsonb_build_object('c', 'An update to an unknown goal_type is rejected', 'p', false, 'd', 'update succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'An update to an unknown goal_type is rejected', 'p', sqlstate = '23514', 'd', sqlstate);
  end;

  -- -------------------------------------------------------------------------
  -- Signed in as user B: RLS still isolates users
  -- -------------------------------------------------------------------------

  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);

  select count(*) into v from public.goal_channels where id = a_goal or user_id = a;
  res := res || jsonb_build_object('c', 'B cannot see any of A''s goals, types or preferences', 'p', v = 0, 'd', format('%s rows visible', v));

  update public.goal_channels set goal_type = 'grow_network', preferences = '{"pace": "ahead"}'::jsonb where id = a_goal;
  get diagnostics v = row_count;
  res := res || jsonb_build_object('c', 'B cannot change A''s goal type or preferences', 'p', v = 0, 'd', format('%s rows changed', v));

  begin
    insert into public.goal_channels (user_id, channel_key, title, goal_type, preferences)
    values (a, 'planted', 'Planted', 'get_certified', '{"pace": "lighter"}');
    res := res || jsonb_build_object('c', 'B cannot create a goal for A', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'B cannot create a goal for A', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;

  select count(*) into v from public.goal_channels where user_id = b;
  res := res || jsonb_build_object('c', 'B still sees exactly their own seeded goal', 'p', v = 1, 'd', format('%s rows visible', v));

  -- -------------------------------------------------------------------------
  -- Signed out: the anon role gets nothing
  -- -------------------------------------------------------------------------

  reset role;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  begin
    perform 1 from public.goal_channels limit 1;
    res := res || jsonb_build_object('c', 'A signed-out client cannot read goals', 'p', false, 'd', 'select succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A signed-out client cannot read goals', 'p', sqlstate = '42501', 'd', sqlstate);
  end;
  reset role;

  -- -------------------------------------------------------------------------
  -- Cleanup (as postgres)
  -- -------------------------------------------------------------------------

  delete from auth.users where id in (a, b);
  select count(*) into v from public.goal_channels where user_id in (a, b);
  res := res || jsonb_build_object('c', 'Deleting an account removes its goals', 'p', v = 0, 'd', format('%s rows left', v));

  insert into mom34_results (n, check_name, passed, detail)
  select ord, e ->> 'c', (e ->> 'p')::boolean, e ->> 'd'
  from jsonb_array_elements(res) with ordinality as x(e, ord);
end;
$$;

select * from mom34_results order by n;
