-- MOM-132: let a person add a goal, or a target to a goal they already have, after their first setup, each through its
-- own save (owner decision, MOM-111 design stop, 2026-10-28: never a loosening of the first-setup save). The design was
-- approved on 2026-11-01.
--
-- What changes (docs/DOMAIN_MODEL.md section 1.7: a re-baseline never re-grades history; section 2.1 rule 2: nothing is
-- assumed about the person):
--
--   1. targets.start_date: a target's OWN start. Null means "from its goal's start", which is what every target saved so far
--      does, so no saved row changes and nothing already graded moves (RAID R-30). A target added to a goal that has already
--      started takes the date the person gives; it can never be earlier than its goal's start. It is set once: a trigger
--      refuses to change it afterwards, because changing it would re-grade weeks.
--   2. goals.sort_order and targets.sort_order: the person's order, as they gave it in setup (RAID A-08). Null means "not
--      stored", which is every row saved before this migration; nothing can recover an order there (a setup's rows all
--      share one transaction time, and their ids are random), and none is invented.
--   3. setup_additions: one row per approved addition, keyed by the id the browser made for that approval, holding the
--      answer. A second tap, or a retry after a lost reply, finds its row and gets the same answer back without writing again.
--   4. write_setup_targets(): the one place that writes a goal's targets, bindings, work items and steps, so the first
--      setup and the two additions cannot drift apart. It takes the person from auth.uid(), as the saves do.
--   5. save_guided_setup(jsonb), a new version: exactly 017's, except that it writes the order (goals by their place in
--      the list, targets by theirs) and calls write_setup_targets(). Its answer, its refusal of a second setup and its
--      grants are unchanged, so app code from before this migration keeps working.
--   6. add_goals_after_setup(jsonb) and add_targets_after_setup(jsonb): the two new saves.
--
-- Applied migrations 013 to 020 are not edited (CLAUDE.md). Everything runs as the signed-in person (security invoker), so
-- row level security still limits every row to their own.
--
-- Access:
--   setup_additions: authenticated SELECT and INSERT on their own rows (the saves write it in the person's session); no
--                    UPDATE, no DELETE; anon and service_role nothing.
--   The functions: executable by authenticated only. write_setup_targets() has to be executable by authenticated too,
--                  because it is called from functions that run as the person; it can only write the person's own rows, and
--                  the person can already insert those rows directly (013 grants INSERT on goals, targets and the rest).
--
-- Refusal codes (the app maps each to plain words; the message can quote what was sent, so the app logs only the code):
--   MS001 already set up (first save, unchanged)   MS002 that goal or target is already saved
--   MS003 no first setup yet                       MS004 the goal is not the person's, or is parked
--   MS005 the target's start is outside its goal's dates

-- ---------------------------------------------------------------------------
-- 1 and 2. The columns
-- ---------------------------------------------------------------------------

alter table public.targets
  add column start_date date,
  add column sort_order integer,
  add constraint targets_sort_order_check check (sort_order is null or sort_order >= 0),
  add constraint targets_start_before_due check (start_date is null or due_date is null or start_date <= due_date);

alter table public.goals
  add column sort_order integer,
  add constraint goals_sort_order_check check (sort_order is null or sort_order >= 0);

-- A target's start is set when it is saved and never again: not changed, not cleared, and not set on a row where it is null
-- (a null start means "from the goal's start", and giving it a date later would re-grade weeks just the same). IS DISTINCT
-- FROM treats a null and a date as different, so all three are refused. There is no DELETE on targets (013), so a row cannot
-- be removed and written again with another start. (UPDATE on targets is table-wide since 013, so the rule is kept by this
-- trigger, not by a privilege.) Trigger functions are not callable through the API (012).
create function public.targets_freeze_start_date()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.start_date is distinct from old.start_date then
    raise exception 'A target''s start cannot be set or changed after it is saved.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.targets_freeze_start_date() from public, anon, authenticated, service_role;

create trigger targets_freeze_start_date before update of start_date on public.targets
  for each row execute function public.targets_freeze_start_date();

-- ---------------------------------------------------------------------------
-- 3. One row per approved addition
-- ---------------------------------------------------------------------------

create table public.setup_additions (
  -- Made by the browser when the person starts adding, sent with the save. It says "this one approval".
  id         uuid not null,
  user_id    uuid not null references public.users (id) on delete cascade,
  kind       text not null,
  -- What the save answered, so a repeat gets it back.
  result     jsonb not null,
  created_at timestamptz not null default now(),

  primary key (user_id, id),
  constraint setup_additions_kind_check check (kind in ('goals', 'targets'))
);

alter table public.setup_additions enable row level security;

revoke all on table public.setup_additions from anon, authenticated, service_role;
grant select, insert on table public.setup_additions to authenticated;

create policy "setup_additions_select_own" on public.setup_additions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "setup_additions_insert_own" on public.setup_additions
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 4. The one writer of a goal's targets, their bindings, work items and steps (017's code, moved here unchanged except
--    for the order and the target's own start).
--    p_target_start: null for a target made with its goal (it counts from its goal's start); the person's own date for a
--    target added later.
--    p_first_position: the place of the first target in the list, so later ones follow it.
-- ---------------------------------------------------------------------------

create function public.write_setup_targets(
  p_goal_id        uuid,
  p_targets        jsonb,
  p_items          jsonb,
  p_target_start   date,
  p_first_position integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_target    jsonb;
  v_item      jsonb;
  v_step      jsonb;
  v_src       jsonb;
  v_ord       bigint;
  v_target_id uuid;
  v_item_id   uuid;
  v_source_id uuid;
  v_manual_id uuid;
  v_tids      jsonb := '{}'::jsonb;
  v_key       text;
  v_provider  text;
  v_metric    text;
  v_mark      text;
  n_targets   integer := 0;
  n_items     integer := 0;
  n_steps     integer := 0;
  n_bindings  integer := 0;
begin
  if v_uid is null then
    raise exception 'Sign in to save your setup.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.goals where id = p_goal_id and user_id = v_uid) then
    raise exception 'That goal was not found.' using errcode = 'MS004';
  end if;

  for v_target, v_ord in
    select x.t, x.o from jsonb_array_elements(coalesce(p_targets, '[]'::jsonb)) with ordinality as x (t, o)
  loop
    insert into public.targets
      (user_id, goal_id, title, measure, unit, role, period_kind, due_date, slot_weekdays, floor, aspiration,
       qualifying_threshold, carry_over_kind, completion_mode, tone, start_date, sort_order)
    values (
      v_uid,
      p_goal_id,
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
      v_target ->> 'tone',
      p_target_start,
      p_first_position + (v_ord - 1)::integer
    )
    returning id into v_target_id;
    n_targets := n_targets + 1;
    v_tids := v_tids || jsonb_build_object(v_target ->> 'key', v_target_id::text);

    for v_mark in select jsonb_array_elements_text(coalesce(v_target -> 'starting_points', '[]'::jsonb)) loop
      insert into public.starting_points (user_id, subject_kind, target_id, field) values (v_uid, 'target', v_target_id, v_mark);
    end loop;

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

  for v_item in select i from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as i loop
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
      p_goal_id,
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

    for v_mark in select jsonb_array_elements_text(coalesce(v_item -> 'starting_points', '[]'::jsonb)) loop
      insert into public.starting_points (user_id, subject_kind, work_item_id, field) values (v_uid, 'work_item', v_item_id, v_mark);
    end loop;

    for v_step in select s from jsonb_array_elements(coalesce(v_item -> 'steps', '[]'::jsonb)) as s loop
      insert into public.work_item_steps (user_id, work_item_id, title, sort_order)
      values (v_uid, v_item_id, v_step ->> 'title', coalesce((v_step ->> 'sort_order')::integer, 0));
      n_steps := n_steps + 1;
    end loop;
  end loop;

  return jsonb_build_object('targets', n_targets, 'work_items', n_items, 'steps', n_steps, 'bindings', n_bindings);
end;
$$;

revoke execute on function public.write_setup_targets(uuid, jsonb, jsonb, date, integer) from public, anon, authenticated, service_role;
grant execute on function public.write_setup_targets(uuid, jsonb, jsonb, date, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. save_guided_setup, new version. As 017, plus: the order of goals and of targets, and the targets written by
--    write_setup_targets(). First setup only, as before.
-- ---------------------------------------------------------------------------

create or replace function public.save_guided_setup(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_person   jsonb;
  v_day_type jsonb;
  v_goal     jsonb;
  v_ord      bigint;
  v_goal_id  uuid;
  v_dt_id    uuid;
  v_counts   jsonb;
  v_mark     text;
  n_goals    integer := 0;
  n_targets  integer := 0;
  n_items    integer := 0;
  n_steps    integer := 0;
  n_bindings integer := 0;
begin
  if v_uid is null then
    raise exception 'Sign in to save your setup.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'The setup must be a JSON object.' using errcode = '22023';
  end if;
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

  -- First setup only (see 015's header). Adding later is add_goals_after_setup().
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

  for v_mark in select jsonb_array_elements_text(coalesce(v_person -> 'starting_points', '[]'::jsonb)) loop
    insert into public.starting_points (user_id, subject_kind, field) values (v_uid, 'person', v_mark);
  end loop;

  -- 2. Day types and 3. protected priorities.
  for v_day_type in select d from jsonb_array_elements(p_payload -> 'day_types') as d loop
    insert into public.person_day_types (user_id, name, capacity_unit, capacity_amount)
    values (v_uid, v_day_type ->> 'name', v_day_type ->> 'capacity_unit', (v_day_type ->> 'capacity_amount')::numeric)
    on conflict (user_id, name) do update set
      capacity_unit = excluded.capacity_unit, capacity_amount = excluded.capacity_amount
    returning id into v_dt_id;

    for v_mark in select jsonb_array_elements_text(coalesce(v_day_type -> 'starting_points', '[]'::jsonb)) loop
      insert into public.starting_points (user_id, subject_kind, day_type_id, field) values (v_uid, 'day_type', v_dt_id, v_mark);
    end loop;
  end loop;

  insert into public.person_priorities (user_id, label, sort_order)
  select v_uid, p.label, p.sort_order
  from jsonb_to_recordset(p_payload -> 'priorities') as p (label text, sort_order integer);

  -- 4. Goals, in the order the person gave them (021), each with its targets, work items, steps and bindings.
  for v_goal, v_ord in
    select x.g, x.o from jsonb_array_elements(p_payload -> 'goals') with ordinality as x (g, o)
  loop
    insert into public.goals
      (user_id, title, why, start_date, shape, end_date, block_weeks, state,
       return_kind, return_date, return_note, completion_mode, tone, sort_order)
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
      v_goal ->> 'tone',
      (v_ord - 1)::integer
    )
    returning id into v_goal_id;
    n_goals := n_goals + 1;

    for v_mark in select jsonb_array_elements_text(coalesce(v_goal -> 'starting_points', '[]'::jsonb)) loop
      insert into public.starting_points (user_id, subject_kind, goal_id, field) values (v_uid, 'goal', v_goal_id, v_mark);
    end loop;

    v_counts := public.write_setup_targets(v_goal_id, v_goal -> 'targets', v_goal -> 'items', null, 0);
    n_targets := n_targets + (v_counts ->> 'targets')::integer;
    n_items := n_items + (v_counts ->> 'work_items')::integer;
    n_steps := n_steps + (v_counts ->> 'steps')::integer;
    n_bindings := n_bindings + (v_counts ->> 'bindings')::integer;
  end loop;

  -- The answer is exactly 016's and 017's.
  return jsonb_build_object('goals', n_goals, 'targets', n_targets, 'work_items', n_items, 'steps', n_steps, 'bindings', n_bindings);
end;
$$;

revoke execute on function public.save_guided_setup(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_guided_setup(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6a. Add one or more goals after the first setup.
--     Payload: { "submission_id": uuid, "goals": [ a goal as in save_guided_setup, with its targets and items ] }.
--     Refuses: no first setup yet (MS003); a goal already saved with the same title and start (MS002). A repeat of the
--     same submission_id gives back the first answer ("replayed": true) and writes nothing.
--     Touches no person fact, day type or priority, and no row that exists.
-- ---------------------------------------------------------------------------

create function public.add_goals_after_setup(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_sub      uuid;
  v_prior    jsonb;
  v_goal     jsonb;
  v_ord      bigint;
  v_base     integer;
  v_goal_id  uuid;
  v_counts   jsonb;
  v_mark     text;
  v_result   jsonb;
  n_goals    integer := 0;
  n_targets  integer := 0;
  n_items    integer := 0;
  n_steps    integer := 0;
  n_bindings integer := 0;
begin
  if v_uid is null then
    raise exception 'Sign in to add a goal.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'The goals must be a JSON object.' using errcode = '22023';
  end if;
  if (p_payload - 'submission_id' - 'goals') <> '{}'::jsonb then
    raise exception 'Adding goals may only have submission_id and goals.' using errcode = '22023';
  end if;
  begin
    v_sub := (p_payload ->> 'submission_id')::uuid;
  exception when others then
    v_sub := null;
  end;
  if v_sub is null then
    raise exception 'A submission id is needed.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload -> 'goals') is distinct from 'array'
     or jsonb_array_length(p_payload -> 'goals') not between 1 and 12 then
    raise exception 'Add between 1 and 12 goals.' using errcode = '22023';
  end if;

  -- One addition at a time per person, so two taps at once are two turns and the second sees the first.
  perform pg_advisory_xact_lock(hashtextextended('momentum:add_setup:' || v_uid::text, 0));

  select result into v_prior from public.setup_additions where user_id = v_uid and id = v_sub;
  if found then
    return v_prior || jsonb_build_object('replayed', true);
  end if;

  if not exists (select 1 from public.goals where user_id = v_uid) then
    raise exception 'Set up your first goals before adding more.' using errcode = 'MS003';
  end if;

  -- After the person's last goal. A row saved before 021 has no place; the next one starts at 0 and nothing is invented.
  select coalesce(max(sort_order), -1) + 1 into v_base from public.goals where user_id = v_uid;

  for v_goal, v_ord in
    select x.g, x.o from jsonb_array_elements(p_payload -> 'goals') with ordinality as x (g, o)
  loop
    if exists (
      select 1 from public.goals
      where user_id = v_uid
        and lower(trim(title)) = lower(trim(v_goal ->> 'title'))
        and start_date is not distinct from (v_goal ->> 'start_date')::date
    ) then
      raise exception 'That goal is already saved. Nothing was added.' using errcode = 'MS002';
    end if;

    insert into public.goals
      (user_id, title, why, start_date, shape, end_date, block_weeks, state,
       return_kind, return_date, return_note, completion_mode, tone, sort_order)
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
      v_goal ->> 'tone',
      v_base + (v_ord - 1)::integer
    )
    returning id into v_goal_id;
    n_goals := n_goals + 1;

    for v_mark in select jsonb_array_elements_text(coalesce(v_goal -> 'starting_points', '[]'::jsonb)) loop
      insert into public.starting_points (user_id, subject_kind, goal_id, field) values (v_uid, 'goal', v_goal_id, v_mark);
    end loop;

    -- A target made with its goal counts from its goal's start (start_date stays null), as at first setup.
    v_counts := public.write_setup_targets(v_goal_id, v_goal -> 'targets', v_goal -> 'items', null, 0);
    n_targets := n_targets + (v_counts ->> 'targets')::integer;
    n_items := n_items + (v_counts ->> 'work_items')::integer;
    n_steps := n_steps + (v_counts ->> 'steps')::integer;
    n_bindings := n_bindings + (v_counts ->> 'bindings')::integer;
  end loop;

  v_result := jsonb_build_object('goals', n_goals, 'targets', n_targets, 'work_items', n_items, 'steps', n_steps, 'bindings', n_bindings);
  insert into public.setup_additions (id, user_id, kind, result) values (v_sub, v_uid, 'goals', v_result);
  return v_result;
end;
$$;

revoke execute on function public.add_goals_after_setup(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.add_goals_after_setup(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6b. Add one or more targets to a goal the person already has.
--     Payload: { "submission_id": uuid, "goal_id": uuid, "start_date": date, "targets": [...], "items": [...] }.
--     start_date is the person's own: there is no default. It cannot be before the goal's start or after the goal's end,
--     and a deadline target's due date cannot be before it (the table's check). Refuses: no first setup (MS003); a goal
--     that is not theirs or is parked (MS004); a start outside the goal's dates (MS005); a target with the same title
--     and start already on the goal (MS002).
-- ---------------------------------------------------------------------------

create function public.add_targets_after_setup(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_sub      uuid;
  v_prior    jsonb;
  v_goal_id  uuid;
  v_goal     record;
  v_start    date;
  v_base     integer;
  v_target   jsonb;
  v_counts   jsonb;
  v_result   jsonb;
begin
  if v_uid is null then
    raise exception 'Sign in to add a target.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'The targets must be a JSON object.' using errcode = '22023';
  end if;
  if (p_payload - 'submission_id' - 'goal_id' - 'start_date' - 'targets' - 'items') <> '{}'::jsonb then
    raise exception 'Adding targets may only have submission_id, goal_id, start_date, targets and items.' using errcode = '22023';
  end if;
  begin
    v_sub := (p_payload ->> 'submission_id')::uuid;
    v_goal_id := (p_payload ->> 'goal_id')::uuid;
    v_start := (p_payload ->> 'start_date')::date;
  exception when others then
    v_sub := null;
  end;
  if v_sub is null or v_goal_id is null or v_start is null then
    raise exception 'A submission id, a goal and a start date are needed.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload -> 'targets') is distinct from 'array'
     or jsonb_array_length(p_payload -> 'targets') not between 1 and 12 then
    raise exception 'Add between 1 and 12 targets.' using errcode = '22023';
  end if;
  if p_payload ? 'items' and jsonb_typeof(p_payload -> 'items') is distinct from 'array' then
    raise exception 'The items must be a list.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('momentum:add_setup:' || v_uid::text, 0));

  select result into v_prior from public.setup_additions where user_id = v_uid and id = v_sub;
  if found then
    return v_prior || jsonb_build_object('replayed', true);
  end if;

  if not exists (select 1 from public.goals where user_id = v_uid) then
    raise exception 'Set up your first goals before adding more.' using errcode = 'MS003';
  end if;

  select id, state, start_date, end_date into v_goal from public.goals where id = v_goal_id and user_id = v_uid;
  if not found or v_goal.state <> 'active' or v_goal.start_date is null then
    raise exception 'That goal was not found, or it is parked.' using errcode = 'MS004';
  end if;
  if v_start < v_goal.start_date or (v_goal.end_date is not null and v_start > v_goal.end_date) then
    raise exception 'A target cannot start outside its goal''s dates.' using errcode = 'MS005';
  end if;

  for v_target in select t from jsonb_array_elements(p_payload -> 'targets') as t loop
    if exists (
      select 1 from public.targets
      where user_id = v_uid and goal_id = v_goal_id
        and lower(trim(title)) = lower(trim(v_target ->> 'title'))
        and coalesce(start_date, v_goal.start_date) = v_start
    ) then
      raise exception 'That target is already saved. Nothing was added.' using errcode = 'MS002';
    end if;
  end loop;

  select coalesce(max(sort_order), -1) + 1 into v_base from public.targets where user_id = v_uid and goal_id = v_goal_id;

  v_counts := public.write_setup_targets(v_goal_id, p_payload -> 'targets', p_payload -> 'items', v_start, v_base);
  v_result := jsonb_build_object('goals', 0) || v_counts;
  insert into public.setup_additions (id, user_id, kind, result) values (v_sub, v_uid, 'targets', v_result);
  return v_result;
end;
$$;

revoke execute on function public.add_targets_after_setup(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.add_targets_after_setup(jsonb) to authenticated;
