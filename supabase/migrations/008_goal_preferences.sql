-- MOM-34: persist the wizard's goal type, constraints and pace on goal_channels.
-- The three answers only shaped the stub plan before; now they are stored and reload with the goal.
-- Sources: lib/goals/vocabulary.ts (the key lists), docs/NINETY_DAY_PLAN_CONTEXT.md §1, §3, §5 rule 6, §9.
-- Machine keys are lowercase; presentation strings stay in the UI.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
-- goal_type is nullable: NULL means the goal was created before this migration recorded a type.
-- preferences holds the answers the user gave and nothing else: { "constraints": [...], "pace": "..." }.
-- An unset pace is omitted. Review prompts are not stored; they only shape the Friday review task.

alter table public.goal_channels
  add column goal_type   text,
  add column preferences jsonb not null default '{}'::jsonb;

-- The lists below mirror GOAL_TYPES, CONSTRAINTS and PACES in types/database.types.ts;
-- tests/migrations.test.ts fails if either side changes alone.
-- A CHECK passes on NULL, so goal_type needs no `is null` branch.
alter table public.goal_channels
  add constraint goal_channels_goal_type_check check (goal_type in (
    'career_pivot', 'get_certified', 'portfolio_piece', 'interview_prep', 'grow_network'
  )),
  -- CASE, not AND: Postgres may evaluate AND operands in any order, and `-` on a scalar raises an
  -- error instead of failing the check.
  add constraint goal_channels_preferences_shape check (
    case when jsonb_typeof(preferences) = 'object' then
      -- No keys other than the two answers.
      (preferences - 'constraints' - 'pace') = '{}'::jsonb
      -- constraints: an array whose every element is a known constraint (jsonb containment, so the
      -- check needs no subquery).
      and (
        not (preferences ? 'constraints')
        or (
          case when jsonb_typeof(preferences -> 'constraints') = 'array'
            then (preferences -> 'constraints') <@ '["flexible_hours", "contract_work_first", "dont_track_hours", "flexible_dates"]'::jsonb
            else false
          end
        )
      )
      -- pace: a string naming a known pace.
      and (
        not (preferences ? 'pace')
        or (
          case when jsonb_typeof(preferences -> 'pace') = 'string'
            then (preferences ->> 'pace') in ('lighter', 'heavier', 'ahead', 'behind', 'carry_over')
            else false
          end
        )
      )
    else false end
  );

-- ---------------------------------------------------------------------------
-- 2. A goal is created with nothing ticked
-- ---------------------------------------------------------------------------
-- The user ticks criteria; the system never does (§3, §5 rule 6). A CHECK would also block the user
-- ticking one later, so this is a BEFORE INSERT trigger: updates stay open to the owner. Every
-- criterion on a new goal must carry done = false; a missing or non-boolean `done` is rejected too.

create or replace function public.goal_channels_guard_new_criteria()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Nested, not AND: a non-array is left to goal_channels_criteria_is_array to reject.
  if jsonb_typeof(new.criteria) = 'array' then
    if exists (
      select 1 from jsonb_array_elements(new.criteria) as c
      where (c -> 'done') is distinct from 'false'::jsonb
    ) then
      raise exception 'A new goal''s criteria must all start unticked.'
        using errcode = '23514',
              hint = 'The user ticks criteria; the system never does (NINETY_DAY_PLAN_CONTEXT.md §3).';
    end if;
  end if;
  return new;
end;
$$;

-- Invoked by the trigger only; nobody needs EXECUTE (see migrations 002 and 004).
revoke execute on function public.goal_channels_guard_new_criteria() from public, anon, authenticated, service_role;

create trigger goal_channels_guard_new_criteria
  before insert on public.goal_channels
  for each row execute function public.goal_channels_guard_new_criteria();

-- ---------------------------------------------------------------------------
-- 3. Existing rows
-- ---------------------------------------------------------------------------
-- The seeded Career Pivot channel is a career pivot. Wizard goals made before this migration, if any,
-- keep NULL: their type was never recorded and is not guessed from the title.

update public.goal_channels
set goal_type = 'career_pivot'
where is_default and channel_key = 'career_pivot' and goal_type is null;

-- ---------------------------------------------------------------------------
-- 4. Signup seed records the type
-- ---------------------------------------------------------------------------
-- Same function as migration 001 section 8 with goal_type added, so accounts created from now on match
-- the backfill. MOM-19 will drop the seed from signup; this keeps the data consistent until then.
-- CREATE OR REPLACE keeps the existing privileges; the revoke is repeated so the file stands alone.

create or replace function public.seed_career_pivot(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_channel_id uuid;
  -- Start one week back so the seeded user sits in week 2 (§2 current position).
  v_start_date date := current_date - 7;
begin
  select id into v_channel_id
  from public.goal_channels
  where user_id = p_user_id and channel_key = 'career_pivot';

  if found then
    return v_channel_id;
  end if;

  insert into public.goal_channels
    (user_id, channel_key, title, status, is_default, start_date, target_date, criteria, goal_type)
  values (
    p_user_id,
    'career_pivot',
    'Career Pivot',
    'active',
    true,
    v_start_date,
    v_start_date + 90,
    '[
      {"key": "prototype_with_demo",      "label": "A working prototype used by a real user, with a recorded demo",                 "done": false},
      {"key": "model_prototype_with_api", "label": "A second prototype with a model inside it, reachable through the user''s own API", "done": false},
      {"key": "eval_before_after",        "label": "An eval for it: labeled test set, scoring rubric, before/after accuracy",        "done": false},
      {"key": "two_model_comparison",     "label": "A two-model comparison on accuracy and cost per item",                         "done": false},
      {"key": "risk_register",            "label": "A risk register for it",                                                       "done": false},
      {"key": "two_certifications",       "label": "Two professional certifications",                                              "done": false},
      {"key": "pro_bono_and_resume",      "label": "One dated pro bono engagement and a resume entry that starts in the current year", "done": false}
    ]'::jsonb,
    'career_pivot'
  )
  returning id into v_channel_id;

  insert into public.micro_tasks
    (user_id, goal_channel_id, title, task_type, minutes, week_of, carried_from_week)
  values
    (p_user_id, v_channel_id, 'Run the daily job search and triage the results',                     'job_search',        10, 2, null),
    (p_user_id, v_channel_id, 'Answer one open interview question from my own evidence',             'interview_fill_in', 15, 2, null),
    (p_user_id, v_channel_id, 'Build the core flow of the first prototype end to end',               'build',             60, 2, null),
    (p_user_id, v_channel_id, 'Study cloud concepts and security for the first certification',       'certify',           45, 2, null),
    (p_user_id, v_channel_id, 'Watch the second half of the model-internals video',                  'learn',             45, 2, null),
    (p_user_id, v_channel_id, 'Register for two networking events',                                  'position',          15, 2, null),
    (p_user_id, v_channel_id, 'Friday review: tick tasks and fill in notes',                         'review',            30, 2, null),
    (p_user_id, v_channel_id, 'Record a two-minute demo on invented data',                           'build',             30, 3, null),
    (p_user_id, v_channel_id, 'Finish the cloud security study block for the first certification',   'certify',           45, 3, 2),
    (p_user_id, v_channel_id, 'Write the one-page case study',                                       'build',             60, 4, null),
    (p_user_id, v_channel_id, 'Take the official practice exam, then review weak areas',             'certify',           60, 4, null);

  return v_channel_id;
end;
$$;

-- Internal only: must not be callable through the PostgREST RPC endpoint with an arbitrary user id.
revoke execute on function public.seed_career_pivot(uuid) from public, anon, authenticated;
