-- MOM-128: what guided setup needs from the database before the family trial.
-- Two changes, and nothing else (no new table, no new grant, reserve_llm_call() untouched):
--
-- 1. A parked goal may be saved without a shape and without a start date. A set-aside goal has not been planned, and
--    setup should not make the person invent a shape and a date for something they are not doing yet (docs/DOMAIN_MODEL.md
--    §1.2). Any other goal still needs both, and a parked goal that comes back (state -> 'active') must have both in the
--    same update, so a goal can never be active and unshaped.
-- 2. The Claude usage log accepts the feature name 'setup', so a setup call is recorded under its own name (RAID R-22).
--
-- Applied migrations 011 and 013 are not edited: the constraints below are dropped and re-added here.
--
-- A CHECK constraint passes when it evaluates to NULL, and a NULL shape makes the 013 conditions below NULL, not false.
-- Left as they are, a goal with no shape could carry an end date or a first-block length and the database would accept
-- it. So both are re-stated with an explicit branch for "no shape". supabase/verify/014_setup_budget.sql tries each.
--
-- goals_end_after_start is left alone on purpose: with no start date there is nothing to compare, so it passes, which is
-- right.

-- ---------------------------------------------------------------------------
-- 1. Goals: shape and start date are optional for a parked goal only
-- ---------------------------------------------------------------------------

alter table public.goals alter column start_date drop not null;
alter table public.goals alter column shape drop not null;

-- Both stay required for any goal that is not parked.
alter table public.goals add constraint goals_shape_start_required
  check (state = 'parked' or (shape is not null and start_date is not null));

-- No shape means no end date (013 said this only for the three shapes).
alter table public.goals drop constraint goals_end_date_matches_shape;
alter table public.goals add constraint goals_end_date_matches_shape check (
  (shape is null and end_date is null)
  or (shape is not null and (
    (shape = 'finite' and end_date is not null)
    or shape = 'project'
    or (shape = 'ongoing' and end_date is null)
  ))
);

-- No shape means no first-block length (only an ongoing goal has one).
alter table public.goals drop constraint goals_block_weeks_check;
alter table public.goals add constraint goals_block_weeks_check
  check (block_weeks is null or (shape is not null and shape = 'ongoing' and block_weeks >= 1));

-- ---------------------------------------------------------------------------
-- 2. The usage log accepts 'setup'
-- ---------------------------------------------------------------------------

alter table public.llm_usage_logs drop constraint llm_usage_logs_feature_check;
alter table public.llm_usage_logs add constraint llm_usage_logs_feature_check
  check (feature in ('rebalance', 'week_one_plan', 'setup'));
