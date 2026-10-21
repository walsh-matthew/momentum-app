-- MOM-9: Core schema for Momentum.
-- Tables: users, goal_channels, micro_tasks, connected_apps.
-- Sources: docs/NINETY_DAY_PLAN_CONTEXT.md §2, §3, §5, §7, §8 and docs/INTEGRATIONS_SPEC.md §2, §5.
-- All statuses and types are stored as lowercase machine keys. Presentation strings live in the UI.

-- ---------------------------------------------------------------------------
-- 1. Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. users: one row per auth.users row, created by the signup trigger (section 6)
-- ---------------------------------------------------------------------------

create table public.users (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. goal_channels: a goal and its checklist of concrete completion criteria
-- ---------------------------------------------------------------------------

create table public.goal_channels (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  -- Internal key matched by InboundActivityPayload.targetGoalChannel (e.g. 'career_pivot').
  channel_key text not null,
  title       text not null,
  status      text not null default 'active',
  is_default  boolean not null default false,
  start_date  date not null default current_date,
  target_date date,
  -- Array of { "key": text, "label": text, "done": boolean }. The user ticks criteria; the system never does.
  criteria    jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint goal_channels_channel_key_format check (channel_key ~ '^[a-z][a-z0-9_]*$'),
  constraint goal_channels_title_not_blank check (length(trim(title)) > 0),
  constraint goal_channels_status_check check (status in ('active', 'paused', 'done')),
  constraint goal_channels_criteria_is_array check (jsonb_typeof(criteria) = 'array'),
  constraint goal_channels_target_after_start check (target_date is null or target_date > start_date),
  constraint goal_channels_user_channel_key_unique unique (user_id, channel_key),
  -- Target for composite foreign keys that pin child rows to the channel's owner.
  constraint goal_channels_id_user_unique unique (id, user_id)
);

create unique index goal_channels_one_default_per_user
  on public.goal_channels (user_id)
  where is_default;

-- ---------------------------------------------------------------------------
-- 4. micro_tasks: timeboxed daily tasks ("Build, 60 min.")
-- ---------------------------------------------------------------------------

create table public.micro_tasks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users (id) on delete cascade,
  goal_channel_id   uuid not null,
  title             text not null,
  task_type         text not null,
  minutes           integer not null,
  status            text not null default 'todo',
  -- Job-search fit ranking (strong / good / stretch). Null for tasks it does not apply to.
  fit               text,
  week_of           integer not null,
  due_date          date,
  carried_from_week integer,
  pulled_from_week  integer,
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Same-owner FK: a task can only attach to a channel its user owns.
  -- No ON DELETE action: a channel with tasks cannot be deleted out from under them
  -- (invariant 1, never cut unfinished work). Deleting the user still cascades.
  constraint micro_tasks_goal_channel_fk
    foreign key (goal_channel_id, user_id) references public.goal_channels (id, user_id),
  constraint micro_tasks_title_not_blank check (length(trim(title)) > 0),
  constraint micro_tasks_task_type_check check (task_type in (
    'job_search', 'interview_fill_in', 'interview_prep', 'build', 'learn', 'certify',
    'position', 'event', 'publish', 'review', 'funnel_check'
  )),
  constraint micro_tasks_minutes_positive check (minutes > 0),
  constraint micro_tasks_status_check check (status in ('todo', 'done')),
  constraint micro_tasks_fit_check check (fit is null or fit in ('strong', 'good', 'stretch')),
  constraint micro_tasks_week_of_positive check (week_of >= 1),
  -- Carry-over moves work later; pull-forward moves it earlier. One hop is recorded (see BACKLOG.md).
  constraint micro_tasks_carried_from_earlier_week
    check (carried_from_week is null or (carried_from_week >= 1 and carried_from_week < week_of)),
  constraint micro_tasks_pulled_from_later_week
    check (pulled_from_week is null or pulled_from_week > week_of),
  constraint micro_tasks_single_move_marker
    check (carried_from_week is null or pulled_from_week is null),
  constraint micro_tasks_completed_at_matches_status
    check ((status = 'done') = (completed_at is not null))
);

create index micro_tasks_user_week_idx on public.micro_tasks (user_id, week_of);
create index micro_tasks_goal_channel_idx on public.micro_tasks (goal_channel_id, user_id);

-- ---------------------------------------------------------------------------
-- 5. connected_apps: provider toggles and credentials (INTEGRATIONS_SPEC.md §4, §5)
-- ---------------------------------------------------------------------------

create table public.connected_apps (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users (id) on delete cascade,
  -- ExternalProviderId: 'hevy', 'apple_health', 'google_calendar', 'github', ...
  provider        text not null,
  is_active       boolean not null default false,
  goal_channel_id uuid,
  -- Provider API keys / OAuth tokens. Server-side service code only; never rendered on the client.
  credentials     jsonb not null default '{}'::jsonb,
  last_synced_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint connected_apps_goal_channel_fk
    foreign key (goal_channel_id, user_id) references public.goal_channels (id, user_id)
    on delete set null (goal_channel_id),
  constraint connected_apps_provider_format check (provider ~ '^[a-z][a-z0-9_]*$'),
  constraint connected_apps_credentials_is_object check (jsonb_typeof(credentials) = 'object'),
  constraint connected_apps_user_provider_unique unique (user_id, provider)
);

create index connected_apps_goal_channel_idx on public.connected_apps (goal_channel_id, user_id);

-- ---------------------------------------------------------------------------
-- 6. updated_at triggers
-- ---------------------------------------------------------------------------

create trigger users_set_updated_at before update on public.users
  for each row execute function public.set_updated_at();
create trigger goal_channels_set_updated_at before update on public.goal_channels
  for each row execute function public.set_updated_at();
create trigger micro_tasks_set_updated_at before update on public.micro_tasks
  for each row execute function public.set_updated_at();
create trigger connected_apps_set_updated_at before update on public.connected_apps
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 7. Row Level Security: every row is visible and writable only by its owner
-- ---------------------------------------------------------------------------

alter table public.users          enable row level security;
alter table public.goal_channels  enable row level security;
alter table public.micro_tasks    enable row level security;
alter table public.connected_apps enable row level security;

-- Signed-out clients get nothing, even before RLS is evaluated.
revoke all on table public.users, public.goal_channels, public.micro_tasks, public.connected_apps from anon;

-- users: the primary key is the owner id. Rows are created by the signup trigger and
-- removed by the auth.users cascade, so clients get select and update only.
create policy "users_select_own" on public.users
  for select to authenticated using ((select auth.uid()) = id);
create policy "users_update_own" on public.users
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "goal_channels_select_own" on public.goal_channels
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "goal_channels_insert_own" on public.goal_channels
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "goal_channels_update_own" on public.goal_channels
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "goal_channels_delete_own" on public.goal_channels
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "micro_tasks_select_own" on public.micro_tasks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "micro_tasks_insert_own" on public.micro_tasks
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "micro_tasks_update_own" on public.micro_tasks
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "micro_tasks_delete_own" on public.micro_tasks
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "connected_apps_select_own" on public.connected_apps
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "connected_apps_insert_own" on public.connected_apps
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "connected_apps_update_own" on public.connected_apps
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "connected_apps_delete_own" on public.connected_apps
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 8. Seed: default "Career Pivot" channel (NINETY_DAY_PLAN_CONTEXT.md §1, §8)
-- ---------------------------------------------------------------------------
-- Seeds per user rather than as static rows, because every row needs an owner for RLS.
-- Idempotent: returns the existing channel if the user already has one.
-- Every task is seeded as 'todo': the user owns completion (invariant 6).

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
    (user_id, channel_key, title, status, is_default, start_date, target_date, criteria)
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
    ]'::jsonb
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

-- ---------------------------------------------------------------------------
-- 9. Signup trigger: create the users row and seed the default channel
-- ---------------------------------------------------------------------------
-- Phase 1 only: once the MOM-11 wizard exists, drop the seed call so new users start empty.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id) values (new.id) on conflict (id) do nothing;
  perform public.seed_career_pivot(new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill any accounts that signed up before this migration.
do $$
declare
  r record;
begin
  for r in select id from auth.users loop
    insert into public.users (id) values (r.id) on conflict (id) do nothing;
    perform public.seed_career_pivot(r.id);
  end loop;
end;
$$;
