-- MOM-37 (and MOM-28): a server-only home for provider tokens.
-- connected_apps.credentials sat behind RLS, which let the owner's browser session SELECT it. Anything
-- that runs in that session (an XSS bug, a leaked cookie) could read OAuth tokens and API keys. Tokens
-- now live in a table no browser role can touch. Only server code holding the service role key reads
-- and writes it, and every call there is keyed on the verified session user (or, for a signed webhook
-- or sync job, on the user id it resolved itself). connected_apps keeps the user-visible toggle.
-- INTEGRATIONS_SPEC.md §5.2 describes this design.

-- ---------------------------------------------------------------------------
-- 1. Remove the browser-readable column
-- ---------------------------------------------------------------------------
-- It was never written by any code (Phase 1 stored toggles only), so there is nothing to move.

alter table public.connected_apps drop constraint connected_apps_credentials_is_object;
alter table public.connected_apps drop column credentials;

-- ---------------------------------------------------------------------------
-- 2. integration_credentials
-- ---------------------------------------------------------------------------

create table public.integration_credentials (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null,
  provider          text not null,
  -- 'oauth2': access_token (+ refresh_token and expires_at when the provider issues them).
  -- 'api_key': api_key only (Hevy).
  auth_type         text not null,
  access_token      text,
  refresh_token     text,
  api_key           text,
  expires_at        timestamptz,
  scope             text,
  -- connected: usable. needs_reauth: the provider refused the refresh token, so the user must
  -- connect again. error: the last attempt failed for another reason; retrying may work.
  status            text not null default 'connected',
  last_error        text,
  last_refreshed_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Same-owner FK: a credential belongs to a connected app of the same user and goes with it.
  constraint integration_credentials_app_fk
    foreign key (user_id, provider) references public.connected_apps (user_id, provider) on delete cascade,
  constraint integration_credentials_user_provider_unique unique (user_id, provider),
  constraint integration_credentials_auth_type_check check (auth_type in ('oauth2', 'api_key')),
  constraint integration_credentials_status_check check (status in ('connected', 'needs_reauth', 'error')),
  -- Each auth type carries exactly the secrets it needs and none of the other's.
  constraint integration_credentials_secret_matches_type check (
    (auth_type = 'oauth2'  and access_token is not null and api_key is null)
    or
    (auth_type = 'api_key' and api_key is not null and access_token is null and refresh_token is null
       and expires_at is null)
  ),
  constraint integration_credentials_secrets_not_blank check (
    (access_token is null or length(access_token) > 0)
    and (refresh_token is null or length(refresh_token) > 0)
    and (api_key is null or length(api_key) > 0)
  )
);

create trigger integration_credentials_set_updated_at before update on public.integration_credentials
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. No browser access at all
-- ---------------------------------------------------------------------------
-- RLS is on with no policies, so any role subject to it sees and changes nothing, and the grants are
-- taken back from the API roles as a second lock. service_role bypasses RLS and keeps its default
-- grants; it is the only role that reads or writes this table.

alter table public.integration_credentials enable row level security;
revoke all on table public.integration_credentials from anon, authenticated;
