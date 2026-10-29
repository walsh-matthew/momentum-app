-- MOM-134: remember which saved setup values came from a suggestion the person accepted, so the first weekly review can ask
-- "Still right for you?" (docs/DOMAIN_MODEL.md section 2.1 rule 4 and section 3.2). Until now the app's draft knew this
-- (draft.said, how: 'accepted') and the save dropped it.
--
-- Two changes:
--   1. starting_points: one row per saved value that came from an accepted suggestion. A starting point is never a fact
--      about the person (rule 4): it is a question the review has yet to ask. A said value has no row.
--   2. save_guided_setup(jsonb) as a new version (CREATE OR REPLACE), the same as 016 except that it also reads an
--      optional "starting_points" list (the saved column names) on the person, each day type, goal, target and work item.
--      A payload with no such list saves exactly as it did under 016, so app code from before this migration keeps working
--      while 017 is on production and the pull request has not yet merged.
--
-- Applied migrations 013, 015 and 016 are not edited (CLAUDE.md). The one change to a table 013 made is a unique key on
-- person_day_types (id, user_id), the same shape every other parent table has, so a mark can point at a day type with a
-- composite foreign key and never at another person's.
--
-- Access, in the style of 013:
--   authenticated: SELECT and INSERT on their own rows; UPDATE only of answered_at and outcome (column privilege), and
--                  only while the mark is unanswered (the update policy), so an answer is final and the field a mark names
--                  can never be changed. No DELETE: a mark goes only when the value it marks goes, or with the account.
--   anon, service_role: nothing.

alter table public.person_day_types
  add constraint person_day_types_id_user_unique unique (id, user_id);

create table public.starting_points (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete cascade,
  -- What the marked value belongs to. 'person' is the person's own settings row (one per person, so no id column).
  subject_kind text not null,
  day_type_id  uuid,
  goal_id      uuid,
  target_id    uuid,
  work_item_id uuid,
  -- The saved column that holds the value, for example 'start_date' on a goal or 'floor' on a target.
  field        text not null,
  created_at   timestamptz not null default now(),
  -- Set when the person has been asked at their first review. Both or neither.
  answered_at  timestamptz,
  outcome      text,

  constraint starting_points_day_type_fk foreign key (day_type_id, user_id)
    references public.person_day_types (id, user_id) on delete cascade,
  constraint starting_points_goal_fk foreign key (goal_id, user_id)
    references public.goals (id, user_id) on delete cascade,
  constraint starting_points_target_fk foreign key (target_id, user_id)
    references public.targets (id, user_id) on delete cascade,
  constraint starting_points_work_item_fk foreign key (work_item_id, user_id)
    references public.work_items (id, user_id) on delete cascade,

  constraint starting_points_kind_check check (subject_kind in ('person', 'day_type', 'goal', 'target', 'work_item')),
  -- Exactly the one id that matches the kind, and none for the person's own settings.
  constraint starting_points_subject_matches_kind check (
    (subject_kind = 'person'    and day_type_id is null     and goal_id is null     and target_id is null     and work_item_id is null) or
    (subject_kind = 'day_type'  and day_type_id is not null and goal_id is null     and target_id is null     and work_item_id is null) or
    (subject_kind = 'goal'      and day_type_id is null     and goal_id is not null and target_id is null     and work_item_id is null) or
    (subject_kind = 'target'    and day_type_id is null     and goal_id is null     and target_id is not null and work_item_id is null) or
    (subject_kind = 'work_item' and day_type_id is null     and goal_id is null     and target_id is null     and work_item_id is not null)
  ),
  -- Only the values setup can record where they came from (lib/setup/leaves.ts, PROVENANCE_PATH_FORMS).
  constraint starting_points_field_check check (
    (subject_kind = 'person'    and field in ('day_end', 'week_start', 'planning_weekday', 'planning_time')) or
    (subject_kind = 'day_type'  and field = 'capacity_amount') or
    (subject_kind = 'goal'      and field in ('start_date', 'end_date', 'block_weeks', 'return_date')) or
    (subject_kind = 'target'    and field in ('floor', 'aspiration', 'qualifying_threshold', 'due_date', 'slot_weekdays')) or
    (subject_kind = 'work_item' and field in ('due_date', 'estimate_minutes'))
  ),
  constraint starting_points_outcome_check check (outcome in ('kept', 'changed')),
  constraint starting_points_answered_together check ((answered_at is null) = (outcome is null))
);

-- One mark per saved value. The id expression is whichever subject id is set; a person's own settings use the person.
create unique index starting_points_subject_field_unique on public.starting_points
  (user_id, subject_kind, field, coalesce(day_type_id, goal_id, target_id, work_item_id, user_id));
create index starting_points_day_type_idx on public.starting_points (day_type_id, user_id) where day_type_id is not null;
create index starting_points_goal_idx on public.starting_points (goal_id, user_id) where goal_id is not null;
create index starting_points_target_idx on public.starting_points (target_id, user_id) where target_id is not null;
create index starting_points_work_item_idx on public.starting_points (work_item_id, user_id) where work_item_id is not null;

alter table public.starting_points enable row level security;

revoke all on table public.starting_points from anon, authenticated, service_role;
grant select, insert on table public.starting_points to authenticated;
grant update (answered_at, outcome) on table public.starting_points to authenticated;

create policy "starting_points_select_own" on public.starting_points
  for select to authenticated using ((select auth.uid()) = user_id);
-- A new mark is unanswered; answering is a separate, later step.
create policy "starting_points_insert_own" on public.starting_points
  for insert to authenticated
  with check ((select auth.uid()) = user_id and answered_at is null and outcome is null);
-- Only an unanswered mark can be answered: an answer, once given, is not rewritten.
create policy "starting_points_update_own" on public.starting_points
  for update to authenticated
  using ((select auth.uid()) = user_id and answered_at is null)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- save_guided_setup, new version. Everything is as in 016 except the starting_points lists (marked "017" below) and
-- the day types, which are inserted one at a time (was one statement) so each one's id is known to mark it.
-- ---------------------------------------------------------------------------

create or replace function public.save_guided_setup(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_person    jsonb;
  v_day_type  jsonb;
  v_goal      jsonb;
  v_target    jsonb;
  v_item      jsonb;
  v_step      jsonb;
  v_src       jsonb;
  v_goal_id   uuid;
  v_target_id uuid;
  v_item_id   uuid;
  v_dt_id     uuid;
  v_source_id uuid;
  v_manual_id uuid;
  v_tids      jsonb;
  v_key       text;
  v_provider  text;
  v_metric    text;
  v_mark      text;
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

  -- First setup only (see 015's header).
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

  -- 017: the person's own facts that came from an accepted suggestion.
  for v_mark in select jsonb_array_elements_text(coalesce(v_person -> 'starting_points', '[]'::jsonb)) loop
    insert into public.starting_points (user_id, subject_kind, field) values (v_uid, 'person', v_mark);
  end loop;

  -- 2. Day types (017: one at a time, to know each id) and 3. protected priorities.
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

    for v_mark in select jsonb_array_elements_text(coalesce(v_goal -> 'starting_points', '[]'::jsonb)) loop
      insert into public.starting_points (user_id, subject_kind, goal_id, field) values (v_uid, 'goal', v_goal_id, v_mark);
    end loop;

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

      for v_mark in select jsonb_array_elements_text(coalesce(v_item -> 'starting_points', '[]'::jsonb)) loop
        insert into public.starting_points (user_id, subject_kind, work_item_id, field) values (v_uid, 'work_item', v_item_id, v_mark);
      end loop;

      for v_step in select s from jsonb_array_elements(coalesce(v_item -> 'steps', '[]'::jsonb)) as s loop
        insert into public.work_item_steps (user_id, work_item_id, title, sort_order)
        values (v_uid, v_item_id, v_step ->> 'title', coalesce((v_step ->> 'sort_order')::integer, 0));
        n_steps := n_steps + 1;
      end loop;
    end loop;
  end loop;

  -- The answer is exactly 016's: how many marks were written is not in it (the table has them), so nothing that reads
  -- the answer, or a verify script written against it, changes.
  return jsonb_build_object('goals', n_goals, 'targets', n_targets, 'work_items', n_items, 'steps', n_steps, 'bindings', n_bindings);
end;
$$;

-- Signed-in users only, unchanged from 015 and 016. Supabase grants EXECUTE to API roles by default (see MOM-60), so
-- revoke first; repeated here so this migration reads correctly on its own.
revoke execute on function public.save_guided_setup(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_guided_setup(jsonb) to authenticated;
