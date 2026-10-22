-- MOM-40: where an ingested task came from, and the evidence it carries.
-- The ingestion pipeline (lib/services/ingestion.ts) turns an external activity (a Hevy workout, a
-- finished calendar block) into an UNFINISHED task. The user ticks it; the system never does
-- (docs/NINETY_DAY_PLAN_CONTEXT.md §3, migration 002). Two things need a home:
-- - which external item created the task, so a webhook retry or an overlapping poll cannot create it
--   twice, and
-- - the normalized activity itself (type, time, duration, metrics), kept as evidence the user can see
--   when deciding to tick.
-- Tasks the user creates, and the signup seed, leave all three columns null.

alter table public.micro_tasks
  add column source_provider    text,
  add column source_external_id text,
  add column source_evidence    jsonb;

-- A source is a provider plus that provider's id for the item: both or neither.
alter table public.micro_tasks
  add constraint micro_tasks_source_pair
    check ((source_provider is null) = (source_external_id is null)),
  add constraint micro_tasks_source_provider_format
    check (source_provider is null or source_provider ~ '^[a-z][a-z0-9_]*$'),
  add constraint micro_tasks_source_external_id_not_blank
    check (source_external_id is null or length(trim(source_external_id)) > 0),
  -- Evidence only describes an ingested task, and is an object so it can be extended later.
  add constraint micro_tasks_source_evidence_object
    check (source_evidence is null or (source_provider is not null and jsonb_typeof(source_evidence) = 'object')),
  -- One task per external item per user. Null source columns never collide, so ordinary tasks are
  -- unaffected. A plain constraint (not a partial index) so an insert can name it in ON CONFLICT.
  add constraint micro_tasks_source_unique
    unique (user_id, source_provider, source_external_id);
