-- MOM-113 block 3.2: the weekly review's record, and the usage log's feature name for the review's Claude call.
-- Two changes (plus the one trigger function that finishes the first), and nothing else (no change to any earlier table,
-- function or grant):
--
--   1. weekly_reviews: one row per finished weekly review, written once and never changed. It keeps what the recap said
--      (layer 1, as shown), which week it covered, the one adjustment the review offered and what the person chose. A later
--      entry for a day in that week can make the live numbers differ from what was said; this row is what was said, so
--      the review shows the difference in words and never rewrites the record (RAID R-26, docs/DOMAIN_MODEL.md section 3).
--   2. The Claude usage log accepts the feature name 'weekly_review', ready for block 3.3's reflection call, so that block
--      needs no migration (the same step 014 took for 'setup').
--
-- The review's Claude call, the finish button that writes a row, and week planning are block 3.3. Nothing here is sent to
-- Claude. Applied migrations 011 and 013 are not edited: the feature check is dropped and re-added, as 014 did.
--
-- Access, in the style of period_snapshots (013):
--   authenticated: SELECT and INSERT on their own rows. No UPDATE and no DELETE grant, so a record can be neither
--                  rewritten nor removed by the person; it goes only with the account (on delete cascade).
--   anon, service_role: nothing.

create table public.weekly_reviews (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.users (id) on delete cascade,
  -- The week reviewed, as the person's own calendar dates: seven days, whatever day their week starts on.
  week_start         date not null,
  week_end           date not null,
  -- What layer 1 showed for that week, copied as shown: each target's title, goal title, result, crossings, patterns and
  -- trend, and the priorities in the person's own words. Titles are copied so a later rename never changes what was said.
  -- Facts only: every number in it is the engine's, and Claude never scored it (principle 9).
  recap              jsonb not null,
  -- The one adjustment layer 3 offered and what the person did with it; all three null when nothing was offered. The
  -- kinds are the six of section 3.2 (three are built; the rest are named here so a later block needs no migration).
  adjustment_kind    text,
  adjustment         jsonb,
  adjustment_outcome text,
  -- When the sitting ended. Whatever an insert sends, the trigger below replaces it with the database's own time.
  finished_at        timestamptz not null default now(),

  constraint weekly_reviews_week_is_seven_days check (week_end = week_start + 6),
  constraint weekly_reviews_recap_is_object check (jsonb_typeof(recap) = 'object'),
  constraint weekly_reviews_adjustment_kind_check check (
    adjustment_kind in ('deadline_forecast', 'slipping_check_in', 'rebaseline', 'priority_changed', 'handling_preference', 'still_right')
  ),
  constraint weekly_reviews_adjustment_is_object check (adjustment is null or jsonb_typeof(adjustment) = 'object'),
  constraint weekly_reviews_adjustment_outcome_check check (adjustment_outcome in ('changed', 'declined', 'skipped')),
  -- Offered means all three are there, not offered means none: a choice with nothing offered cannot exist.
  constraint weekly_reviews_adjustment_together check (
    (adjustment_kind is null) = (adjustment is null) and (adjustment_kind is null) = (adjustment_outcome is null)
  ),
  -- Written once per finished sitting: a second record for the same week is refused.
  constraint weekly_reviews_user_week_unique unique (user_id, week_start)
);

-- The record says when it was finished, so the person's session cannot say so: the insert grant is table-wide (as on
-- period_snapshots), and this trigger sets finished_at to now() whatever the insert sends.
--
-- A trigger function is not callable through the API (012, MOM-65): Supabase grants EXECUTE on every new function in
-- public to anon, authenticated and service_role, and a function starts out executable by PUBLIC. Postgres checks EXECUTE
-- on a trigger function when the trigger is created, not when it fires, so taking it away does not stop the trigger.
create function public.weekly_reviews_set_finished_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.finished_at := now();
  return new;
end;
$$;

revoke execute on function public.weekly_reviews_set_finished_at() from public, anon, authenticated, service_role;

create trigger weekly_reviews_set_finished_at before insert on public.weekly_reviews
  for each row execute function public.weekly_reviews_set_finished_at();

alter table public.weekly_reviews enable row level security;

-- Take every default privilege back (including UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER), then give back only
-- what is approved.
revoke all on table public.weekly_reviews from anon, authenticated, service_role;
grant select, insert on table public.weekly_reviews to authenticated;

create policy "weekly_reviews_select_own" on public.weekly_reviews
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "weekly_reviews_insert_own" on public.weekly_reviews
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- The usage log accepts 'weekly_review'
-- ---------------------------------------------------------------------------

alter table public.llm_usage_logs drop constraint llm_usage_logs_feature_check;
alter table public.llm_usage_logs add constraint llm_usage_logs_feature_check
  check (feature in ('rebalance', 'week_one_plan', 'setup', 'weekly_review'));
