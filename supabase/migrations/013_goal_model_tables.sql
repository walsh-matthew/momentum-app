-- MOM-107: the goal model's tables, beside the old ones (docs/DOMAIN_MODEL.md section 1; design record
-- docs/design/2026-10-26-goal-model-design.md 6.1). Approved by the owner on 2026-10-26.
--
-- New tables: person_settings, person_day_types, person_priorities, person_handling_rules, goals, targets,
-- work_items, work_item_steps, sources, target_sources, entries, entry_corrections, period_snapshots.
-- Nothing old is touched: no change to goal_channels, micro_tasks, task_rebalance_history, connected_apps, any
-- earlier function or any earlier migration. The old model is retired by MOM-115, not here.
--
-- Rules the tables carry:
-- - Never assume (principle 1). Every time anchor and every "How Momentum talks to me" setting is nullable, and null
--   means "not chosen yet". Defaults live in code, so a new default can never overwrite a choice. goals.start_date and
--   work_items.date_can_move have no default: the person answers them. No signup trigger creates a row here; the first
--   setup creates person_settings.
-- - The person's word beats any source (principle 3). entry_corrections is keyed to the source's own record id and has
--   no foreign key to entries, so a resync that deletes or recreates entries cannot undo one. Entries hold the raw
--   value and no computed total (section 1.6, 1.7); the scoreboard is computed from entries.
-- - A checklist tick is an entry too (owner decision, MOM-107): a manual entry whose source_record_id is the step's id.
--   Checklist progress is computed from entries; work_item_steps.completed_at is for display. Un-ticking is a
--   correction (hide) and re-ticking removes it, so the entry row is never edited.
-- - A closed period keeps the target it was judged by (section 1.7). period_snapshots copies the target's values, so
--   changing the target later changes no snapshot, and nothing can update or delete one.
-- - Every table is owned by one person and isolated by RLS. Rows that point at another table use a composite
--   (id, user_id) foreign key, so one person's row can never point at another person's. Foreign keys that point at
--   history have no ON DELETE action (a goal, target, source or work item with history cannot be deleted out from
--   under it; deleting the account still cascades).
--
-- Left out of slice 1 (design 6.1), with the room for each: stretch, safety ceiling and ramping levels are more
-- columns on targets and period_snapshots (ramping a per-week levels table); dated capacity exceptions are a child
-- table beside person_day_types; monthly periods widen the period_kind lists; standing merge rules are a table keyed
-- by sources.id.
--
-- Who can do what (explicit, because new tables here get no grants by default; see 006). TRUNCATE, REFERENCES and
-- TRIGGER, which the default privileges may hand to the API roles, are revoked on every table. anon gets nothing.
--
--   table                    authenticated (RLS: own rows)        service_role
--   person_settings          select, insert, update               -
--   person_day_types         select, insert, update, delete       -
--   person_priorities        select, insert, update, delete       -
--   person_handling_rules    select, insert, update, delete       -
--   goals                    select, insert, update               -   (no delete: a person parks a goal)
--   targets                  select, insert, update               -
--   work_items               select, insert, update, delete       -
--   work_item_steps          select, insert, update, delete       -
--   sources                  select, insert, update, delete       select
--   target_sources           select, insert, delete               select
--   entries                  select, insert (manual sources only) select, insert, update
--   entry_corrections        select, insert, update, delete       -
--   period_snapshots         select, insert                       -   (append-only: no update or delete for anyone)
--
-- service_role is closed on most tables on purpose (MOM-66): it gets only what a job without a session needs, which
-- today is Hevy ingestion (read sources and their bindings, write entries). A job that needs more gets a grant under
-- its own ticket.

-- ---------------------------------------------------------------------------
-- 1. The person (section 1.1, 4.1)
-- ---------------------------------------------------------------------------

-- One row per person. Absent until setup creates it.
create table public.person_settings (
  user_id          uuid primary key references public.users (id) on delete cascade,
  -- Time anchors: all the person's own, no default. week_start is 1 to 7 (Monday is 1) and is only a label.
  time_zone        text,
  week_start       smallint,
  day_end          time,
  -- "How Momentum talks to me". Null means not chosen yet; the code supplies the starting value.
  tone             text,
  reminders        text,
  check_ins        text,
  celebrations     text,
  balance_mentions text,
  review_depth     text,
  review_planning  text,
  -- Null: not asked yet. '[]': asked, and none. The shape of an item is checked by the service.
  quiet_times      jsonb,
  -- Floor missed in this many periods running counts as slipping (section 3.2). Editable per person.
  slipping_periods integer,
  -- The planning moment the weekly review runs at (section 3).
  planning_weekday smallint,
  planning_time    time,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint person_settings_time_zone_not_blank check (time_zone is null or length(trim(time_zone)) > 0),
  constraint person_settings_week_start_check check (week_start between 1 and 7),
  constraint person_settings_tone_check check (tone in ('gentle', 'middle', 'direct')),
  constraint person_settings_reminders_check check (reminders in ('off', 'tied_to_plan')),
  constraint person_settings_check_ins_check check (check_ins in ('never', 'end_of_day', 'end_of_week')),
  constraint person_settings_celebrations_check check (celebrations in ('low_key', 'medium', 'big')),
  constraint person_settings_balance_mentions_check check (balance_mentions in ('weekly_planning', 'near_deadlines', 'leave_to_me')),
  constraint person_settings_review_depth_check check (review_depth in ('recap_only', 'recap_offer', 'full')),
  constraint person_settings_review_planning_check check (review_planning in ('one_sitting', 'separate')),
  constraint person_settings_quiet_times_is_array check (quiet_times is null or jsonb_typeof(quiet_times) = 'array'),
  constraint person_settings_slipping_periods_check check (slipping_periods >= 2),
  constraint person_settings_planning_weekday_check check (planning_weekday between 1 and 7)
);

-- The person's own day types, with their usual capacity and, if they chose one, a reminder time.
create table public.person_day_types (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users (id) on delete cascade,
  name            text not null,
  capacity_unit   text,
  capacity_amount numeric,
  reminder_time   time,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint person_day_types_name_not_blank check (length(trim(name)) > 0),
  constraint person_day_types_capacity_unit_check check (capacity_unit in ('hours', 'sessions')),
  constraint person_day_types_capacity_amount_check check (capacity_amount is null or capacity_amount >= 0),
  constraint person_day_types_capacity_both_or_neither check ((capacity_unit is null) = (capacity_amount is null)),
  constraint person_day_types_user_name_unique unique (user_id, name)
);

-- Life areas the person named as protected, in their own words. Unmeasured.
create table public.person_priorities (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  label      text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint person_priorities_label_not_blank check (length(trim(label)) > 0)
);

create index person_priorities_user_idx on public.person_priorities (user_id, sort_order);

-- Situational rules in the person's words.
create table public.person_handling_rules (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  rule_text  text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint person_handling_rules_text_not_blank check (length(trim(rule_text)) > 0)
);

create index person_handling_rules_user_idx on public.person_handling_rules (user_id);

-- ---------------------------------------------------------------------------
-- 2. Goals and targets (section 1.2, 1.3)
-- ---------------------------------------------------------------------------

create table public.goals (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users (id) on delete cascade,
  title           text not null,
  -- In the person's words. Null when the quick path skipped it.
  why             text,
  -- The person's date. Setup proposes today visibly; the database assumes nothing.
  start_date      date not null,
  shape           text not null,
  -- finite: the end date. project: the hard deadline, if there is one. ongoing: none.
  end_date        date,
  -- ongoing only: the length of the first block.
  block_weeks     integer,
  state           text not null default 'active',
  -- A parked goal records how it comes back: a date, a season or condition (in words), or only when asked.
  return_kind     text,
  return_date     date,
  return_note     text,
  -- Defaults for everything inside the goal. Null: not chosen, so the person-level setting or the code default applies.
  completion_mode text,
  tone            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint goals_title_not_blank check (length(trim(title)) > 0),
  constraint goals_why_not_blank check (why is null or length(trim(why)) > 0),
  constraint goals_shape_check check (shape in ('ongoing', 'finite', 'project')),
  constraint goals_state_check check (state in ('active', 'parked')),
  constraint goals_end_date_matches_shape check (
    (shape = 'finite' and end_date is not null)
    or shape = 'project'
    or (shape = 'ongoing' and end_date is null)
  ),
  constraint goals_end_after_start check (end_date is null or end_date > start_date),
  constraint goals_block_weeks_check check (block_weeks is null or (shape = 'ongoing' and block_weeks >= 1)),
  constraint goals_return_kind_check check (return_kind in ('date', 'condition', 'on_request')),
  constraint goals_return_note_not_blank check (return_note is null or length(trim(return_note)) > 0),
  constraint goals_parked_return check (
    (state = 'active' and return_kind is null and return_date is null and return_note is null)
    or (
      state = 'parked'
      and return_kind is not null
      and ((return_kind = 'date') = (return_date is not null))
      and ((return_kind = 'condition') = (return_note is not null))
    )
  ),
  constraint goals_completion_mode_check check (completion_mode in ('auto', 'confirm', 'manual')),
  constraint goals_tone_check check (tone in ('gentle', 'middle', 'direct')),
  -- Target for composite foreign keys that pin child rows to the goal's owner.
  constraint goals_id_user_unique unique (id, user_id)
);

create index goals_user_idx on public.goals (user_id, state);

create table public.targets (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.users (id) on delete cascade,
  goal_id               uuid not null,
  title                 text not null,
  measure               text not null,
  -- The unit of a quantity ('km', 'pages'). Null for every other measure.
  unit                  text,
  role                  text not null,
  period_kind           text not null,
  -- deadline: the date. Null for every other period.
  due_date              date,
  -- day_slots: the weekdays the person named, 1 to 7 (Monday is 1). Each should appear once (the service keeps
  -- the list free of repeats; a CHECK cannot compare elements).
  slot_weekdays         smallint[],
  -- Levels. The floor is required for an effort target; an outcome target has one only if the person names a number.
  floor                 numeric,
  aspiration            numeric,
  -- Entries below this are kept and shown but not counted, unless the person counts one anyway.
  qualifying_threshold  numeric,
  -- habit: a shortfall never rolls into the next period. cumulative: it stays owed until the deadline.
  carry_over_kind       text not null,
  -- Overrides of the goal's defaults. Null: inherit.
  completion_mode       text,
  tone                  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- No ON DELETE action: a goal with targets cannot be deleted out from under them.
  constraint targets_goal_fk foreign key (goal_id, user_id) references public.goals (id, user_id),
  constraint targets_title_not_blank check (length(trim(title)) > 0),
  constraint targets_measure_check check (measure in ('count', 'quantity', 'time', 'checklist')),
  constraint targets_unit_matches_measure check ((measure = 'quantity') = (unit is not null)),
  constraint targets_unit_not_blank check (unit is null or length(trim(unit)) > 0),
  constraint targets_role_check check (role in ('effort', 'outcome')),
  constraint targets_period_kind_check check (period_kind in ('weekly', 'day_slots', 'deadline')),
  constraint targets_due_date_matches_period check ((period_kind = 'deadline') = (due_date is not null)),
  constraint targets_slots_match_period check (
    ((period_kind = 'day_slots') = (slot_weekdays is not null))
    and (
      slot_weekdays is null
      or (cardinality(slot_weekdays) between 1 and 7 and slot_weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[])
    )
  ),
  constraint targets_floor_positive check (floor is null or floor > 0),
  constraint targets_effort_has_floor check (role <> 'effort' or floor is not null),
  constraint targets_aspiration_above_floor check (aspiration is null or (floor is not null and aspiration >= floor)),
  constraint targets_threshold_not_negative check (qualifying_threshold is null or qualifying_threshold >= 0),
  constraint targets_carry_over_kind_check check (carry_over_kind in ('habit', 'cumulative')),
  constraint targets_cumulative_needs_deadline check (carry_over_kind <> 'cumulative' or period_kind = 'deadline'),
  constraint targets_completion_mode_check check (completion_mode in ('auto', 'confirm', 'manual')),
  constraint targets_tone_check check (tone in ('gentle', 'middle', 'direct')),
  constraint targets_id_user_unique unique (id, user_id)
);

create index targets_goal_idx on public.targets (goal_id, user_id);

-- ---------------------------------------------------------------------------
-- 3. Work items and their steps (section 1.4)
-- ---------------------------------------------------------------------------

create table public.work_items (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users (id) on delete cascade,
  goal_id          uuid not null,
  -- The target the item feeds. Required for a habit.
  target_id        uuid,
  kind             text not null,
  title            text not null,
  sort_order       integer not null default 0,
  -- deadline_task only. The person answers both; there is no default for whether the date can move.
  due_date         date,
  date_can_move    boolean,
  -- A rough size for the deadline forecast, deadline_task only.
  estimate_minutes integer,
  -- Habits are never completed. Set together; completed_via says whether the person or a source did it, so an
  -- automatic completion can be shown and undone (principle 10).
  completed_at     timestamptz,
  completed_via    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint work_items_goal_fk foreign key (goal_id, user_id) references public.goals (id, user_id),
  constraint work_items_target_fk foreign key (target_id, user_id) references public.targets (id, user_id),
  constraint work_items_kind_check check (kind in ('habit', 'milestone', 'deadline_task')),
  constraint work_items_title_not_blank check (length(trim(title)) > 0),
  constraint work_items_habit_has_target check (kind <> 'habit' or target_id is not null),
  constraint work_items_due_date_matches_kind check ((kind = 'deadline_task') = (due_date is not null)),
  constraint work_items_date_can_move_matches_kind check ((kind = 'deadline_task') = (date_can_move is not null)),
  constraint work_items_estimate_check check (estimate_minutes is null or (kind = 'deadline_task' and estimate_minutes > 0)),
  constraint work_items_completed_via_check check (completed_via in ('person', 'source')),
  constraint work_items_completed_together check ((completed_at is null) = (completed_via is null)),
  constraint work_items_habit_never_completes check (kind <> 'habit' or completed_at is null),
  constraint work_items_id_user_unique unique (id, user_id)
);

create index work_items_goal_idx on public.work_items (goal_id, user_id);
create index work_items_target_idx on public.work_items (target_id, user_id);

create table public.work_item_steps (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  work_item_id  uuid not null,
  title         text not null,
  sort_order    integer not null default 0,
  -- For display. Progress on a checklist target is computed from entries (see the header).
  completed_at  timestamptz,
  completed_via text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- The steps of an item go with the item, when the person deletes the item.
  constraint work_item_steps_item_fk foreign key (work_item_id, user_id)
    references public.work_items (id, user_id) on delete cascade,
  constraint work_item_steps_title_not_blank check (length(trim(title)) > 0),
  constraint work_item_steps_completed_via_check check (completed_via in ('person', 'source')),
  constraint work_item_steps_completed_together check ((completed_at is null) = (completed_via is null))
);

create index work_item_steps_item_idx on public.work_item_steps (work_item_id, user_id, sort_order);

-- ---------------------------------------------------------------------------
-- 4. Sources, entries and corrections (section 1.5, 1.6)
-- ---------------------------------------------------------------------------

-- Where entries come from: a synced provider, or the person's own taps, numbers, timers and ticks. There is no
-- foreign key to connected_apps: it would need a change to that old table, and disconnecting an app must not delete
-- history. Connection health is read from connected_apps by the service.
create table public.sources (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  kind       text not null,
  -- ExternalProviderId ('hevy', ...). Required for a synced source, null for a manual one.
  provider   text,
  label      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sources_kind_check check (kind in ('synced', 'manual')),
  constraint sources_provider_matches_kind check ((kind = 'synced') = (provider is not null)),
  constraint sources_provider_format check (provider is null or provider ~ '^[a-z][a-z0-9_]*$'),
  constraint sources_label_not_blank check (length(trim(label)) > 0),
  constraint sources_user_provider_unique unique (user_id, provider),
  constraint sources_id_user_unique unique (id, user_id)
);

-- The person binds sources to targets; templates only suggest. Bindings are settings, so they go with either end.
create table public.target_sources (
  target_id  uuid not null,
  source_id  uuid not null,
  user_id    uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint target_sources_pkey primary key (target_id, source_id),
  constraint target_sources_target_fk foreign key (target_id, user_id)
    references public.targets (id, user_id) on delete cascade,
  constraint target_sources_source_fk foreign key (source_id, user_id)
    references public.sources (id, user_id) on delete cascade
);

create index target_sources_source_idx on public.target_sources (source_id, user_id);

-- One raw record counted toward one target: a workout, a time session, a tap, a checklist tick. Never edited by the
-- engine; there is no total here, the scoreboard is computed. A source bound to two targets writes one entry per
-- target, and a correction (keyed to the record, not the entry) applies to all of them.
create table public.entries (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users (id) on delete cascade,
  target_id        uuid not null,
  source_id        uuid not null,
  -- The source's own id for the record. A manual entry gets a generated one; a checklist tick uses the step's id.
  source_record_id text not null,
  work_item_id     uuid,
  -- When it happened. The period it falls in is worked out from the person's own time anchors, never stored here.
  occurred_at      timestamptz not null,
  -- The raw amount: 1 for a count or a tick, the number for a quantity, minutes for time.
  value            numeric not null,
  -- What the source said, for the person to see why it counted. An object.
  evidence         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- No ON DELETE action on target and source: history is never cut out from under its entries.
  constraint entries_target_fk foreign key (target_id, user_id) references public.targets (id, user_id),
  constraint entries_source_fk foreign key (source_id, user_id) references public.sources (id, user_id),
  -- Deleting a work item leaves its entries, which still count toward the target.
  constraint entries_work_item_fk foreign key (work_item_id, user_id)
    references public.work_items (id, user_id) on delete set null (work_item_id),
  constraint entries_record_id_not_blank check (length(trim(source_record_id)) > 0),
  constraint entries_value_positive check (value > 0),
  constraint entries_evidence_is_object check (jsonb_typeof(evidence) = 'object'),
  -- A resync of the same record is the same entry.
  constraint entries_target_source_record_unique unique (target_id, source_id, source_record_id)
);

create index entries_target_time_idx on public.entries (target_id, occurred_at);
create index entries_source_record_idx on public.entries (source_id, source_record_id);

-- The person's word on one source record: hide it (remove, restorable) or count it anyway (below the threshold).
-- Restoring deletes the row. Keyed to the source's own record id with no foreign key to entries, so a resync that
-- deletes or recreates the entry cannot undo it.
create table public.entry_corrections (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users (id) on delete cascade,
  source_id        uuid not null,
  source_record_id text not null,
  action           text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint entry_corrections_source_fk foreign key (source_id, user_id)
    references public.sources (id, user_id) on delete cascade,
  constraint entry_corrections_record_id_not_blank check (length(trim(source_record_id)) > 0),
  constraint entry_corrections_action_check check (action in ('hide', 'count_anyway')),
  constraint entry_corrections_source_record_unique unique (source_id, source_record_id)
);

-- ---------------------------------------------------------------------------
-- 5. Closed-period snapshots (section 1.7)
-- ---------------------------------------------------------------------------

-- The target a closed period was judged by, copied at the moment it closed, so a re-baseline never re-grades history.
-- No totals or results: those are computed from entries and these values. The person's session writes a snapshot
-- before it applies a re-baseline. Append-only: no update or delete for any API role.
create table public.period_snapshots (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.users (id) on delete cascade,
  target_id            uuid not null,
  -- The period, as the person's own calendar dates (a deadline period ends on its due date).
  period_start         date not null,
  period_end           date not null,
  -- The time anchors in force when it closed. week_start is null for a deadline period.
  time_zone            text not null,
  week_start           smallint,
  day_end              time,
  -- A copy of the target in force.
  measure              text not null,
  unit                 text,
  role                 text not null,
  period_kind          text not null,
  slot_weekdays        smallint[],
  floor                numeric,
  aspiration           numeric,
  qualifying_threshold numeric,
  carry_over_kind      text not null,
  created_at           timestamptz not null default now(),

  -- No ON DELETE action: a target with closed periods cannot be deleted out from under them.
  constraint period_snapshots_target_fk foreign key (target_id, user_id) references public.targets (id, user_id),
  constraint period_snapshots_period_order check (period_end >= period_start),
  constraint period_snapshots_time_zone_not_blank check (length(trim(time_zone)) > 0),
  constraint period_snapshots_week_start_check check (week_start between 1 and 7),
  constraint period_snapshots_week_start_needed check (period_kind = 'deadline' or week_start is not null),
  constraint period_snapshots_measure_check check (measure in ('count', 'quantity', 'time', 'checklist')),
  constraint period_snapshots_unit_matches_measure check ((measure = 'quantity') = (unit is not null)),
  constraint period_snapshots_role_check check (role in ('effort', 'outcome')),
  constraint period_snapshots_period_kind_check check (period_kind in ('weekly', 'day_slots', 'deadline')),
  constraint period_snapshots_slots_match_period check (
    ((period_kind = 'day_slots') = (slot_weekdays is not null))
    and (
      slot_weekdays is null
      or (cardinality(slot_weekdays) between 1 and 7 and slot_weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[])
    )
  ),
  constraint period_snapshots_floor_positive check (floor is null or floor > 0),
  constraint period_snapshots_effort_has_floor check (role <> 'effort' or floor is not null),
  constraint period_snapshots_aspiration_above_floor check (aspiration is null or (floor is not null and aspiration >= floor)),
  constraint period_snapshots_threshold_not_negative check (qualifying_threshold is null or qualifying_threshold >= 0),
  constraint period_snapshots_carry_over_kind_check check (carry_over_kind in ('habit', 'cumulative')),
  constraint period_snapshots_target_period_unique unique (target_id, period_start)
);

-- ---------------------------------------------------------------------------
-- 6. updated_at triggers
-- ---------------------------------------------------------------------------

create trigger person_settings_set_updated_at before update on public.person_settings
  for each row execute function public.set_updated_at();
create trigger person_day_types_set_updated_at before update on public.person_day_types
  for each row execute function public.set_updated_at();
create trigger person_priorities_set_updated_at before update on public.person_priorities
  for each row execute function public.set_updated_at();
create trigger person_handling_rules_set_updated_at before update on public.person_handling_rules
  for each row execute function public.set_updated_at();
create trigger goals_set_updated_at before update on public.goals
  for each row execute function public.set_updated_at();
create trigger targets_set_updated_at before update on public.targets
  for each row execute function public.set_updated_at();
create trigger work_items_set_updated_at before update on public.work_items
  for each row execute function public.set_updated_at();
create trigger work_item_steps_set_updated_at before update on public.work_item_steps
  for each row execute function public.set_updated_at();
create trigger sources_set_updated_at before update on public.sources
  for each row execute function public.set_updated_at();
create trigger entries_set_updated_at before update on public.entries
  for each row execute function public.set_updated_at();
create trigger entry_corrections_set_updated_at before update on public.entry_corrections
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 7. Access: row level security, then explicit grants (see the table in the header)
-- ---------------------------------------------------------------------------

alter table public.person_settings        enable row level security;
alter table public.person_day_types       enable row level security;
alter table public.person_priorities      enable row level security;
alter table public.person_handling_rules  enable row level security;
alter table public.goals                  enable row level security;
alter table public.targets                enable row level security;
alter table public.work_items             enable row level security;
alter table public.work_item_steps        enable row level security;
alter table public.sources                enable row level security;
alter table public.target_sources         enable row level security;
alter table public.entries                enable row level security;
alter table public.entry_corrections      enable row level security;
alter table public.period_snapshots       enable row level security;

-- Take every default privilege back (including TRUNCATE, REFERENCES and TRIGGER), then give back only what is needed.
revoke all on table
  public.person_settings, public.person_day_types, public.person_priorities, public.person_handling_rules,
  public.goals, public.targets, public.work_items, public.work_item_steps,
  public.sources, public.target_sources, public.entries, public.entry_corrections, public.period_snapshots
  from anon, authenticated, service_role;

grant select, insert, update on table public.person_settings to authenticated;
grant select, insert, update, delete on table public.person_day_types to authenticated;
grant select, insert, update, delete on table public.person_priorities to authenticated;
grant select, insert, update, delete on table public.person_handling_rules to authenticated;
grant select, insert, update on table public.goals to authenticated;
grant select, insert, update on table public.targets to authenticated;
grant select, insert, update, delete on table public.work_items to authenticated;
grant select, insert, update, delete on table public.work_item_steps to authenticated;
grant select, insert, update, delete on table public.sources to authenticated;
grant select, insert, delete on table public.target_sources to authenticated;
grant select, insert on table public.entries to authenticated;
grant select, insert, update, delete on table public.entry_corrections to authenticated;
grant select, insert on table public.period_snapshots to authenticated;

-- Ingestion for a person without a session (Hevy): read sources and their bindings, write entries.
grant select on table public.sources to service_role;
grant select on table public.target_sources to service_role;
grant select, insert, update on table public.entries to service_role;

-- person_settings: the primary key is the owner id.
create policy "person_settings_select_own" on public.person_settings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "person_settings_insert_own" on public.person_settings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "person_settings_update_own" on public.person_settings
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "person_day_types_select_own" on public.person_day_types
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "person_day_types_insert_own" on public.person_day_types
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "person_day_types_update_own" on public.person_day_types
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "person_day_types_delete_own" on public.person_day_types
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "person_priorities_select_own" on public.person_priorities
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "person_priorities_insert_own" on public.person_priorities
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "person_priorities_update_own" on public.person_priorities
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "person_priorities_delete_own" on public.person_priorities
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "person_handling_rules_select_own" on public.person_handling_rules
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "person_handling_rules_insert_own" on public.person_handling_rules
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "person_handling_rules_update_own" on public.person_handling_rules
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "person_handling_rules_delete_own" on public.person_handling_rules
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "goals_select_own" on public.goals
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "goals_insert_own" on public.goals
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "goals_update_own" on public.goals
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "targets_select_own" on public.targets
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "targets_insert_own" on public.targets
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "targets_update_own" on public.targets
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "work_items_select_own" on public.work_items
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "work_items_insert_own" on public.work_items
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "work_items_update_own" on public.work_items
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "work_items_delete_own" on public.work_items
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "work_item_steps_select_own" on public.work_item_steps
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "work_item_steps_insert_own" on public.work_item_steps
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "work_item_steps_update_own" on public.work_item_steps
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "work_item_steps_delete_own" on public.work_item_steps
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "sources_select_own" on public.sources
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "sources_insert_own" on public.sources
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "sources_update_own" on public.sources
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "sources_delete_own" on public.sources
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "target_sources_select_own" on public.target_sources
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "target_sources_insert_own" on public.target_sources
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "target_sources_delete_own" on public.target_sources
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "entries_select_own" on public.entries
  for select to authenticated using ((select auth.uid()) = user_id);
-- A person writes entries only through their own manual sources. A synced record can only come from the sync, so a
-- browser cannot forge one. (entries.user_id is qualified: inside the subquery a bare user_id means sources.user_id.)
create policy "entries_insert_own_manual" on public.entries
  for insert to authenticated
  with check (
    (select auth.uid()) = entries.user_id
    and exists (
      select 1 from public.sources s
      where s.id = entries.source_id and s.user_id = entries.user_id and s.kind = 'manual'
    )
  );

create policy "entry_corrections_select_own" on public.entry_corrections
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "entry_corrections_insert_own" on public.entry_corrections
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "entry_corrections_update_own" on public.entry_corrections
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "entry_corrections_delete_own" on public.entry_corrections
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "period_snapshots_select_own" on public.period_snapshots
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "period_snapshots_insert_own" on public.period_snapshots
  for insert to authenticated with check ((select auth.uid()) = user_id);
