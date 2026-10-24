-- MOM-73: a durable record of every Claude call, and the limits that are computed from it.
-- Until now "one request per user per 20 seconds" lived in server memory, so it was per serverless instance and
-- reset on a cold start, nothing capped spend, and nothing recorded tokens or latency. This table is the one place
-- all instances agree on. See docs/LLM_GOVERNANCE.md.
--
-- What it holds: who asked (user_id), which feature, which model, token counts, latency and how the call ended.
-- It holds NO prompt and NO answer: there is no column that could carry either, and tests/verify check that.
--
-- How a call is limited: the server calls reserve_llm_call() BEFORE the model. In one transaction, under one lock,
-- it counts rows and inserts a 'pending' row for the call, or refuses and says which limit tripped and when it
-- frees up. Because the check and the insert are atomic, two instances cannot both pass. After the model answers,
-- the server fills in the pending row (tokens, latency, outcome). A row left 'pending' (a crash) still counts as a
-- call, which is the safe way round for a spend cap. Refused attempts are NOT logged, so a user who keeps clicking
-- cannot extend their own wait.
--
-- Who can do what (explicit, because new tables here get no grants by default; see 006):
-- - anon: nothing.
-- - authenticated: read their OWN rows (RLS). No insert, update or delete: the browser cannot write usage, and cannot
--   call reserve_llm_call(), so one account cannot fill the shared cap and switch Claude off for everyone.
-- - service_role: read, insert and update, from server code that took the user id from the verified session.
-- Safety: nothing here touches tasks, status or completed_at.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

create table public.llm_usage_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  feature       text not null,
  model         text not null,
  -- Null until the call finishes, and null for a call that never got an answer (no key, network error).
  input_tokens  integer,
  output_tokens integer,
  latency_ms    integer,
  outcome       text not null default 'pending',
  created_at    timestamptz not null default now(),

  constraint llm_usage_logs_feature_check check (feature in ('rebalance', 'week_one_plan')),
  -- A model id, not a place to put text: the length limit keeps anything prompt-sized out.
  constraint llm_usage_logs_model_check check (length(model) between 1 and 100),
  constraint llm_usage_logs_outcome_check check (
    outcome in ('pending', 'ok', 'refused', 'provider_rate_limited', 'unavailable', 'bad_output', 'not_configured')
  ),
  constraint llm_usage_logs_tokens_check check (
    (input_tokens is null) = (output_tokens is null)
    and (input_tokens is null or (input_tokens >= 0 and output_tokens >= 0))
  ),
  constraint llm_usage_logs_latency_check check (latency_ms is null or latency_ms >= 0),
  -- Pending exactly when there is no latency yet, and a pending row has no tokens yet.
  constraint llm_usage_logs_finished_check check (
    (outcome = 'pending') = (latency_ms is null)
    and (outcome <> 'pending' or input_tokens is null)
  )
);

-- The limits count recent rows: all of them (overall) and one user's (per user and spacing).
create index llm_usage_logs_created_at_idx on public.llm_usage_logs (created_at);
create index llm_usage_logs_user_created_idx on public.llm_usage_logs (user_id, created_at);

-- ---------------------------------------------------------------------------
-- 2. A row can only be finished once, and only by filling in the result
-- ---------------------------------------------------------------------------

create function public.llm_usage_logs_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.outcome <> 'pending' then
    raise exception 'A finished usage row cannot change.' using errcode = '23514';
  end if;
  if new.id <> old.id or new.user_id <> old.user_id or new.feature <> old.feature
     or new.model <> old.model or new.created_at <> old.created_at then
    raise exception 'Only the result of a call can be recorded on a usage row.' using errcode = '23514';
  end if;
  if new.outcome = 'pending' then
    raise exception 'Record how the call ended.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger llm_usage_logs_guard before update on public.llm_usage_logs
  for each row execute function public.llm_usage_logs_guard();

-- ---------------------------------------------------------------------------
-- 3. Access
-- ---------------------------------------------------------------------------

alter table public.llm_usage_logs enable row level security;

revoke all on table public.llm_usage_logs from anon, authenticated, service_role;
grant select on table public.llm_usage_logs to authenticated;
grant select, insert, update on table public.llm_usage_logs to service_role;

create policy "llm_usage_logs_select_own" on public.llm_usage_logs
  for select to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 4. The limits
-- ---------------------------------------------------------------------------

-- Reserves one Claude call for p_user_id, or says which limit stopped it. Returns a jsonb object:
--   { "allowed": true,  "log_id": <uuid> }                                       the call may go ahead
--   { "allowed": false, "reason": "user_daily" | "overall_daily" | "too_soon",   a limit tripped
--     "retry_after_seconds": <integer, at least 1> }                              earliest the same ask could pass
-- The limits, checked in this order so the most useful reason is the one reported:
--   user_daily     this user has made p_user_daily_cap calls in the last 24 hours
--   overall_daily  everyone together has made p_overall_daily_cap calls in the last 24 hours
--   too_soon       this user's last call was less than p_min_interval_seconds ago
-- Every row counts, finished or pending, whatever its outcome: a failed call is still a call. The 24 hours is a
-- rolling window, not a calendar day. retry_after_seconds for a cap is when the oldest call that matters leaves the
-- window; for the overall cap other users may use the freed room first, so it is an earliest time.
--
-- One advisory lock covers the whole check-and-insert, so concurrent callers (other serverless instances) queue and
-- each sees the others' reservations. It is held for a few milliseconds and released at the end of the transaction.
-- The clock is the database's, so instances with different clocks cannot disagree.
--
-- SECURITY INVOKER: it runs as the caller, who must have the table grants above. Only service_role can call it.
create function public.reserve_llm_call(
  p_user_id              uuid,
  p_feature              text,
  p_model                text,
  p_min_interval_seconds integer,
  p_user_daily_cap       integer,
  p_overall_daily_cap    integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now      timestamptz := clock_timestamp();
  v_window   constant interval := interval '24 hours';
  v_interval interval;
  v_count    integer;
  v_free_at  timestamptz;
  v_last     timestamptz;
  v_id       uuid;
begin
  if p_user_id is null
     or p_min_interval_seconds is null or p_min_interval_seconds < 1
     or p_user_daily_cap is null or p_user_daily_cap < 1
     or p_overall_daily_cap is null or p_overall_daily_cap < 1 then
    raise exception 'A user and positive limits are required.' using errcode = '22023';
  end if;
  v_interval := make_interval(secs => p_min_interval_seconds);

  perform pg_advisory_xact_lock(hashtextextended('public.llm_usage_logs', 0));

  -- This user's cap.
  select count(*) into v_count from public.llm_usage_logs
  where user_id = p_user_id and created_at > v_now - v_window;
  if v_count >= p_user_daily_cap then
    -- Room opens when the (count - cap + 1)th oldest call leaves the window.
    select created_at into v_free_at from public.llm_usage_logs
    where user_id = p_user_id and created_at > v_now - v_window
    order by created_at asc offset (v_count - p_user_daily_cap) limit 1;
    return jsonb_build_object(
      'allowed', false,
      'reason', 'user_daily',
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_free_at + v_window - v_now)))::integer)
    );
  end if;

  -- The shared cap.
  select count(*) into v_count from public.llm_usage_logs where created_at > v_now - v_window;
  if v_count >= p_overall_daily_cap then
    select created_at into v_free_at from public.llm_usage_logs
    where created_at > v_now - v_window
    order by created_at asc offset (v_count - p_overall_daily_cap) limit 1;
    return jsonb_build_object(
      'allowed', false,
      'reason', 'overall_daily',
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_free_at + v_window - v_now)))::integer)
    );
  end if;

  -- Spacing between this user's calls.
  select max(created_at) into v_last from public.llm_usage_logs where user_id = p_user_id;
  if v_last is not null and v_last > v_now - v_interval then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'too_soon',
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_last + v_interval - v_now)))::integer)
    );
  end if;

  insert into public.llm_usage_logs (user_id, feature, model, created_at)
  values (p_user_id, p_feature, p_model, v_now)
  returning id into v_id;
  return jsonb_build_object('allowed', true, 'log_id', v_id);
end;
$$;

-- Server code only. Supabase grants EXECUTE to API roles by default (see MOM-60), so revoke first. A signed-in
-- browser must not be able to reserve calls: that would let one account use up everyone's shared cap.
revoke execute on function public.reserve_llm_call(uuid, text, text, integer, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.reserve_llm_call(uuid, text, text, integer, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Reading the usage, for the owner
-- ---------------------------------------------------------------------------
-- Calls, tokens and average latency per UTC day, feature and model: what to look at to turn tokens into a bill and
-- to tune the caps. Read it in the SQL editor (as postgres) or with the service role; the API roles get nothing.
-- A person reads their own individual rows straight from llm_usage_logs, through the policy above.

create view public.llm_usage_daily with (security_invoker = true) as
select
  (created_at at time zone 'utc')::date as day,
  feature,
  model,
  count(*)::integer                                  as calls,
  (count(*) filter (where outcome = 'ok'))::integer  as ok_calls,
  coalesce(sum(input_tokens), 0)::bigint             as input_tokens,
  coalesce(sum(output_tokens), 0)::bigint            as output_tokens,
  round(avg(latency_ms))::integer                    as avg_latency_ms
from public.llm_usage_logs
group by 1, 2, 3;

revoke all on table public.llm_usage_daily from anon, authenticated, service_role;
grant select on table public.llm_usage_daily to service_role;
