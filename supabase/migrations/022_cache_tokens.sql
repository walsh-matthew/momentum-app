-- MOM-165: log the prompt-cache tokens of every Claude call, so the family trial's cost can be read per turn.
--
-- The usage log (011) records input and output tokens only. Anthropic reports cache reads and cache writes separately from
-- input_tokens, so a turn that used the prompt cache would be under-counted, and cost could not be worked out from the log.
-- This adds the two counts. Caching is off today; the columns are ready for when it is turned on.
--
-- What changes:
--   1. llm_usage_logs.cache_read_tokens and cache_write_tokens, both nullable integers. Null means "the API did not report
--      them" (never guessed as 0). They come from the API's cache_read_input_tokens and cache_creation_input_tokens.
--   2. A check that keeps them consistent with 011's llm_usage_logs_tokens_check: set together or both null, never negative,
--      and only on a row that also has input and output tokens. A pending row has no tokens at all (011's finished check),
--      so it has no cache tokens either.
--   3. The owner's daily view gets the two sums, appended at the end so its existing columns do not move.
--
-- Access is unchanged and no grant is written here: the table-level grants of 011 already cover a new column (authenticated
-- reads its own rows; service_role selects, inserts and updates; nobody deletes), and the guard trigger still lets a pending
-- row be given only its result. The view keeps security_invoker and its service_role-only SELECT.
-- Applied migration 011 is not edited (CLAUDE.md). No data is written and nothing is dropped.

alter table public.llm_usage_logs
  add column cache_read_tokens  integer,
  add column cache_write_tokens integer;

alter table public.llm_usage_logs
  add constraint llm_usage_logs_cache_tokens_check check (
    (cache_read_tokens is null) = (cache_write_tokens is null)
    and (cache_read_tokens is null
         or (cache_read_tokens >= 0 and cache_write_tokens >= 0 and input_tokens is not null))
  );

create or replace view public.llm_usage_daily with (security_invoker = true) as
select
  (created_at at time zone 'utc')::date as day,
  feature,
  model,
  count(*)::integer                                  as calls,
  (count(*) filter (where outcome = 'ok'))::integer  as ok_calls,
  coalesce(sum(input_tokens), 0)::bigint             as input_tokens,
  coalesce(sum(output_tokens), 0)::bigint            as output_tokens,
  round(avg(latency_ms))::integer                    as avg_latency_ms,
  coalesce(sum(cache_read_tokens), 0)::bigint        as cache_read_tokens,
  coalesce(sum(cache_write_tokens), 0)::bigint       as cache_write_tokens
from public.llm_usage_logs
group by 1, 2, 3;
