-- MOM-112 block 2: the week plan (docs/DOMAIN_MODEL.md section 1.4, 3.1; design record in the MOM-112 Jira comments).
-- Two new tables and nothing else (no change to any earlier table, function, policy or grant):
--
--   1. week_plan_picks: the person's own pick of which work items to do on which of their days. A pick is an item on a
--      date. It is never a time or a slot, and nothing here picks a day for the person (principle 12, principle 1).
--   2. week_plan_day_types: which of the person's own day types a date is ("this Thursday is a light day"). Optional per
--      date. It exists so the deadline forecast knows how much time the person has set aside that day; nothing assumes
--      that a weekday is always one kind (principle 1), and a date with no row has no kind.
-- A day-kind row points at the person's own day type with the composite (id, user_id) foreign key every owned table in
-- 013 uses, so one person's row can never point at another person's. The key it points at, person_day_types_id_user_unique,
-- is already there (017, MOM-134).
--
-- The forecast, the home card and the plan screen read these tables; nothing here is sent to Claude.
--
-- A pick is not history: it is a plan, so the rows go with the work item or day type they point at (on delete cascade),
-- and with the account. Picks are added and removed, never edited, so there is no UPDATE grant on them. A date's kind
-- can be changed, so day kinds can be updated, but only the day_type_id column.
--
-- No function is created here, and no function's privileges are changed. The updated_at trigger reuses
-- public.set_updated_at() from 001, as every other table's does.
--
-- Who can do what (explicit, because new tables here get no grants by default; see 006). TRUNCATE, REFERENCES and
-- TRIGGER, which the default privileges may hand to the API roles, are revoked. anon and service_role get nothing.
--
--   table                    authenticated (RLS: own rows)                       service_role
--   week_plan_picks          select, insert, delete                              -
--   week_plan_day_types      select, insert, delete; update of day_type_id only  -

-- ---------------------------------------------------------------------------
-- 1. The tables
-- ---------------------------------------------------------------------------

create table public.week_plan_picks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete cascade,
  work_item_id uuid not null,
  -- The person's own calendar date, in their own time zone. Whether it is a past or a future day is the service's to
  -- say; the database stores what the person chose.
  plan_date    date not null,
  created_at   timestamptz not null default now(),

  -- The item and the pick are the same person's. The pick goes when the person deletes the item.
  constraint week_plan_picks_work_item_fk foreign key (work_item_id, user_id)
    references public.work_items (id, user_id) on delete cascade,
  -- An item is on a given day once.
  constraint week_plan_picks_item_day_unique unique (work_item_id, plan_date)
);

create index week_plan_picks_user_day_idx on public.week_plan_picks (user_id, plan_date);

create table public.week_plan_day_types (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  plan_date   date not null,
  day_type_id uuid not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- The day type and the date's kind are the same person's. The kind goes when the person deletes the day type.
  constraint week_plan_day_types_day_type_fk foreign key (day_type_id, user_id)
    references public.person_day_types (id, user_id) on delete cascade,
  -- A date is one kind of day.
  constraint week_plan_day_types_user_day_unique unique (user_id, plan_date)
);

create trigger week_plan_day_types_set_updated_at before update on public.week_plan_day_types
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Access: row level security, then explicit grants (see the table in the header)
-- ---------------------------------------------------------------------------

alter table public.week_plan_picks     enable row level security;
alter table public.week_plan_day_types enable row level security;

-- Take every default privilege back (including TRUNCATE, REFERENCES and TRIGGER), then give back only what is approved.
revoke all on table public.week_plan_picks, public.week_plan_day_types from anon, authenticated, service_role;

grant select, insert, delete on table public.week_plan_picks to authenticated;
-- A date's kind can be changed but nothing else about the row: UPDATE is granted on day_type_id alone (a column privilege,
-- as on starting_points in 017), so an update can never change the row's owner or its date.
grant select, insert, delete on table public.week_plan_day_types to authenticated;
grant update (day_type_id) on table public.week_plan_day_types to authenticated;

create policy "week_plan_picks_select_own" on public.week_plan_picks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "week_plan_picks_insert_own" on public.week_plan_picks
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "week_plan_picks_delete_own" on public.week_plan_picks
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "week_plan_day_types_select_own" on public.week_plan_day_types
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "week_plan_day_types_insert_own" on public.week_plan_day_types
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "week_plan_day_types_update_own" on public.week_plan_day_types
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "week_plan_day_types_delete_own" on public.week_plan_day_types
  for delete to authenticated using ((select auth.uid()) = user_id);
