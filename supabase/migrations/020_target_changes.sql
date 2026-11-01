-- MOM-146: a change to a target's levels (and, for a day-slots target, its days), from the person's next period on
-- (docs/DOMAIN_MODEL.md section 1.7 and 3.2; the owner approved the design on 2026-10-31). One change and nothing else
-- (no change to any earlier table, function or grant):
--
--   target_changes: append-only. Every save is a new row. The engine reads a target as its first version (the targets row,
--   dated from the goal's start) plus these rows, each effective from its date (lib/engine/baseline.ts), so a closed period
--   keeps the numbers it was judged by and a re-baseline never re-grades history. For the same target and effective_from the
--   newest created_at wins, so saving again before the date replaces the first save without any UPDATE.
--
-- Why the existing tables cannot hold it: targets holds one set of levels, and changing it in place would re-grade every
-- closed week (nothing writes period_snapshots yet, so the engine would judge them by the new numbers), and a change made
-- partway through a week would re-grade that week too. period_snapshots is a copy of a CLOSED period, not a change that
-- starts later.
--
-- Left out on purpose: a target's measure, role, unit, period kind and due date never change here (the engine refuses a
-- period kind that changes between versions, lib/engine/baseline.ts). There is no unique key (a second save for the same
-- date is a second row) and so no upsert and no UPDATE policy.
--
-- Access, in the style of period_snapshots (013):
--   authenticated: SELECT and INSERT on their own rows. No UPDATE and no DELETE grant, so a change can be neither
--                  rewritten nor removed by the person; it goes only with the person's account (on delete cascade).
--   anon, service_role: nothing.

create table public.target_changes (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users (id) on delete cascade,
  target_id      uuid not null,
  -- The first day of the period the new numbers apply from, as the person's own calendar date.
  effective_from date not null,
  -- The new levels, in the same terms as targets: the floor is the least that counts, the aspiration the number hoped for.
  floor          numeric not null,
  aspiration     numeric,
  -- A day-slots target only: the weekdays the person named, 1 to 7 (Monday is 1). Null for a weekly target.
  slot_weekdays  smallint[],
  -- When it was saved. Whatever an insert sends, the trigger below replaces it with the database's own time.
  created_at     timestamptz not null default clock_timestamp(),

  -- No ON DELETE action: a target with changes cannot be deleted out from under them.
  constraint target_changes_target_fk foreign key (target_id, user_id) references public.targets (id, user_id),
  constraint target_changes_floor_positive check (floor > 0),
  constraint target_changes_aspiration_above_floor check (aspiration is null or aspiration >= floor),
  constraint target_changes_slots_valid check (
    slot_weekdays is null
    or (cardinality(slot_weekdays) between 1 and 7 and slot_weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[])
  )
);

create index target_changes_target_idx on public.target_changes (target_id, user_id, effective_from, created_at);

-- The record says when it was saved, so the person's session cannot say so: the insert grant is table-wide (as on
-- period_snapshots and weekly_reviews), and this trigger sets created_at whatever the insert sends. "The newest wins" depends on
-- it. clock_timestamp, not now(), so two saves in one transaction still differ.
--
-- A trigger function is not callable through the API (012, MOM-65): Supabase grants EXECUTE on every new function in
-- public to anon, authenticated and service_role, and a function starts out executable by PUBLIC. Postgres checks EXECUTE
-- on a trigger function when the trigger is created, not when it fires, so taking it away does not stop the trigger.
create function public.target_changes_set_created_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := clock_timestamp();
  return new;
end;
$$;

revoke execute on function public.target_changes_set_created_at() from public, anon, authenticated, service_role;

create trigger target_changes_set_created_at before insert on public.target_changes
  for each row execute function public.target_changes_set_created_at();

alter table public.target_changes enable row level security;

-- Take every default privilege back (including UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER), then give back only
-- what is approved.
revoke all on table public.target_changes from anon, authenticated, service_role;
grant select, insert on table public.target_changes to authenticated;

create policy "target_changes_select_own" on public.target_changes
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "target_changes_insert_own" on public.target_changes
  for insert to authenticated with check ((select auth.uid()) = user_id);
