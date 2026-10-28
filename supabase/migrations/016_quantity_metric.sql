-- MOM-111 (third block), MOM-109 design review: let a binding name a quantity target's metric, instead of
-- lib/services/syncedEntries.ts's entryValue() guessing it from the target's own unit text (the MOM-109 stopgap).
--
-- One change: target_sources gets a nullable metric column, naming which number a quantity target counts in an app
-- that has more than one (volume in lb or kg, sets, or minutes; Hevy today). Null for a manual source, for a synced
-- source whose app has nothing to choose between (Google Calendar), and for any measure but quantity.
--
-- Applied migration 015 is not edited (CLAUDE.md): save_guided_setup(jsonb) is CREATE OR REPLACE'd here, with the same
-- signature and the same behaviour except for reading and writing this one new field. 015's own file stays as it is.

alter table public.target_sources add column metric text;

alter table public.target_sources add constraint target_sources_metric_check
  check (metric in ('volume_lbs', 'volume_kg', 'sets', 'minutes'));

create or replace function public.save_guided_setup(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_person    jsonb;
  v_goal      jsonb;
  v_target    jsonb;
  v_item      jsonb;
  v_step      jsonb;
  v_src       jsonb;
  v_goal_id   uuid;
  v_target_id uuid;
  v_item_id   uuid;
  v_source_id uuid;
  v_manual_id uuid;
  v_tids      jsonb;
  v_key       text;
  v_provider  text;
  v_metric    text;
  n_goals     integer := 0;
  n_targets   integer := 0;
  n_items     integer := 0;
  n_steps     integer := 0;
  n_bindings  integer := 0;
begin
  if v_uid is null then
    raise exception 'Sign in to save your setup.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'The setup must be a JSON object.' using errcode = '22023';
  end if;
  -- Refuse any other key rather than ignore it. CASE, not AND: Postgres may evaluate AND operands in any order.
  if (p_payload - 'person' - 'day_types' - 'priorities' - 'goals') <> '{}'::jsonb then
    raise exception 'The setup may only have person, day_types, priorities and goals.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload -> 'person') is distinct from 'object'
     or jsonb_typeof(p_payload -> 'day_types') is distinct from 'array'
     or jsonb_typeof(p_payload -> 'priorities') is distinct from 'array'
     or jsonb_typeof(p_payload -> 'goals') is distinct from 'array' then
    raise exception 'The setup is missing a part.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_payload -> 'goals') not between 1 and 12 then
    raise exception 'A setup needs between 1 and 12 goals.' using errcode = '22023';
  end if;

  -- First setup only (see the header).
  if exists (select 1 from public.goals where user_id = v_uid) then
    raise exception 'Setup has already been done for this account.' using errcode = 'MS001';
  end if;

  -- 1. The person's facts and settings. One row per person; the first setup creates it.
  v_person := p_payload -> 'person';
  insert into public.person_settings
    (user_id, time_zone, week_start, day_end, tone, reminders, check_ins, celebrations, balance_mentions,
     review_depth, review_planning, quiet_times, planning_weekday, planning_time)
  values (
    v_uid,
    v_person ->> 'time_zone',
    (v_person ->> 'week_start')::smallint,
    (v_person ->> 'day_end')::time,
    v_person ->> 'tone',
    v_person ->> 'reminders',
    v_person ->> 'check_ins',
    v_person ->> 'celebrations',
    v_person ->> 'balance_mentions',
    v_person ->> 'review_depth',
    v_person ->> 'review_planning',
    case when jsonb_typeof(v_person -> 'quiet_times') = 'array' then v_person -> 'quiet_times' else null end,
    (v_person ->> 'planning_weekday')::smallint,
    (v_person ->> 'planning_time')::time
  )
  on conflict (user_id) do update set
    time_zone = excluded.time_zone, week_start = excluded.week_start, day_end = excluded.day_end,
    tone = excluded.tone, reminders = excluded.reminders, check_ins = excluded.check_ins,
    celebrations = excluded.celebrations, balance_mentions = excluded.balance_mentions,
    review_depth = excluded.review_depth, review_planning = excluded.review_planning,
    quiet_times = excluded.quiet_times, planning_weekday = excluded.planning_weekday,
    planning_time = excluded.planning_time;

  -- 2. Day types and 3. protected priorities.
  insert into public.person_day_types (user_id, name, capacity_unit, capacity_amount)
  select v_uid, d.name, d.capacity_unit, d.capacity_amount
  from jsonb_to_recordset(p_payload -> 'day_types') as d (name text, capacity_unit text, capacity_amount numeric)
  on conflict (user_id, name) do update set
    capacity_unit = excluded.capacity_unit, capacity_amount = excluded.capacity_amount;

  insert into public.person_priorities (user_id, label, sort_order)
  select v_uid, p.label, p.sort_order
  from jsonb_to_recordset(p_payload -> 'priorities') as p (label text, sort_order integer);

  -- 4. Goals, with their targets, work items, steps and bindings.
  for v_goal in select g from jsonb_array_elements(p_payload -> 'goals') as g loop
    insert into public.goals
      (user_id, title, why, start_date, shape, end_date, block_weeks, state,
       return_kind, return_date, return_note, completion_mode, tone)
    values (
      v_uid,
      v_goal ->> 'title',
      v_goal ->> 'why',
      (v_goal ->> 'start_date')::date,
      v_goal ->> 'shape',
      (v_goal ->> 'end_date')::date,
      (v_goal ->> 'block_weeks')::integer,
      v_goal ->> 'state',
      v_goal ->> 'return_kind',
      (v_goal ->> 'return_date')::date,
      v_goal ->> 'return_note',
      v_goal ->> 'completion_mode',
      v_goal ->> 'tone'
    )
    returning id into v_goal_id;
    n_goals := n_goals + 1;
    v_tids := '{}'::jsonb;

    for v_target in select t from jsonb_array_elements(coalesce(v_goal -> 'targets', '[]'::jsonb)) as t loop
      insert into public.targets
        (user_id, goal_id, title, measure, unit, role, period_kind, due_date, slot_weekdays, floor, aspiration,
         qualifying_threshold, carry_over_kind, completion_mode, tone)
      values (
        v_uid,
        v_goal_id,
        v_target ->> 'title',
        v_target ->> 'measure',
        v_target ->> 'unit',
        v_target ->> 'role',
        v_target ->> 'period_kind',
        (v_target ->> 'due_date')::date,
        case when jsonb_typeof(v_target -> 'slot_weekdays') = 'array'
             then array(select jsonb_array_elements_text(v_target -> 'slot_weekdays')::smallint)
             else null end,
        (v_target ->> 'floor')::numeric,
        (v_target ->> 'aspiration')::numeric,
        (v_target ->> 'qualifying_threshold')::numeric,
        v_target ->> 'carry_over_kind',
        v_target ->> 'completion_mode',
        v_target ->> 'tone'
      )
      returning id into v_target_id;
      n_targets := n_targets + 1;
      v_tids := v_tids || jsonb_build_object(v_target ->> 'key', v_target_id::text);

      -- The bindings: where the person says this target is tracked, and which number it counts there.
      for v_src in select s from jsonb_array_elements(coalesce(v_target -> 'sources', '[]'::jsonb)) as s loop
        v_metric := null;
        if v_src ->> 'kind' = 'manual' then
          if v_manual_id is null then
            -- The person's manual source: the oldest one if they have it, else create it (as manual entry does).
            select id into v_manual_id from public.sources
              where user_id = v_uid and kind = 'manual' order by created_at, id limit 1;
            if v_manual_id is null then
              insert into public.sources (user_id, kind, provider, label)
              values (v_uid, 'manual', null, 'Manual')
              returning id into v_manual_id;
            end if;
          end if;
          v_source_id := v_manual_id;
        elsif v_src ->> 'kind' = 'synced' then
          v_provider := v_src ->> 'provider';
          v_metric := v_src ->> 'metric';
          select id into v_source_id from public.sources where user_id = v_uid and provider = v_provider;
          if v_source_id is null then
            insert into public.sources (user_id, kind, provider, label)
            values (v_uid, 'synced', v_provider, coalesce(nullif(trim(v_src ->> 'label'), ''), v_provider))
            returning id into v_source_id;
          end if;
        else
          raise exception 'A source is manual or synced.' using errcode = '22023';
        end if;
        insert into public.target_sources (target_id, source_id, user_id, metric)
        values (v_target_id, v_source_id, v_uid, v_metric)
        on conflict (target_id, source_id) do nothing;
        n_bindings := n_bindings + 1;
      end loop;
    end loop;

    for v_item in select i from jsonb_array_elements(coalesce(v_goal -> 'items', '[]'::jsonb)) as i loop
      v_target_id := null;
      v_key := v_item ->> 'target_key';
      if v_key is not null then
        if not (v_tids ? v_key) then
          raise exception 'A work item feeds a target that is not in its goal.' using errcode = '22023';
        end if;
        v_target_id := (v_tids ->> v_key)::uuid;
      end if;
      insert into public.work_items
        (user_id, goal_id, target_id, kind, title, sort_order, due_date, date_can_move, estimate_minutes)
      values (
        v_uid,
        v_goal_id,
        v_target_id,
        v_item ->> 'kind',
        v_item ->> 'title',
        coalesce((v_item ->> 'sort_order')::integer, 0),
        (v_item ->> 'due_date')::date,
        (v_item ->> 'date_can_move')::boolean,
        (v_item ->> 'estimate_minutes')::integer
      )
      returning id into v_item_id;
      n_items := n_items + 1;

      for v_step in select s from jsonb_array_elements(coalesce(v_item -> 'steps', '[]'::jsonb)) as s loop
        insert into public.work_item_steps (user_id, work_item_id, title, sort_order)
        values (v_uid, v_item_id, v_step ->> 'title', coalesce((v_step ->> 'sort_order')::integer, 0));
        n_steps := n_steps + 1;
      end loop;
    end loop;
  end loop;

  return jsonb_build_object('goals', n_goals, 'targets', n_targets, 'work_items', n_items, 'steps', n_steps, 'bindings', n_bindings);
end;
$$;

-- Signed-in users only, unchanged from 015. Supabase grants EXECUTE to API roles by default (see MOM-60), so revoke
-- first. CREATE OR REPLACE keeps the function's existing grants, but the revoke-then-grant is repeated here so this
-- migration reads correctly on its own and stays correct if the grant defaults ever change.
revoke execute on function public.save_guided_setup(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_guided_setup(jsonb) to authenticated;
