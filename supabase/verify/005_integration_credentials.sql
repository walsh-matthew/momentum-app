-- Verification for supabase/migrations/005_integration_credentials.sql (MOM-37, MOM-28).
-- Run in the Supabase SQL Editor or with `supabase db query --linked -f`. Safe to re-run.
-- Creates two throwaway auth users, checks who can reach provider tokens, then deletes them.
-- Leaves no data behind: an unexpected error rolls back the whole block.

drop table if exists pg_temp.mom37_results;
create temp table mom37_results (n int, check_name text, passed boolean, detail text);

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  v int;
  w int;
  res jsonb := '[]';
begin
  insert into auth.users (id, email)
  values (a, 'mom37-verify-a@example.invalid'), (b, 'mom37-verify-b@example.invalid');

  -- Connected apps exist first (the credential table hangs off them).
  insert into public.connected_apps (user_id, provider, is_active)
  values (a, 'hevy', true), (a, 'google_calendar', true), (b, 'hevy', true);

  -- -------------------------------------------------------------------------
  -- The column that used to hold tokens is gone
  -- -------------------------------------------------------------------------

  select count(*) into v from information_schema.columns
  where table_schema = 'public' and table_name = 'connected_apps' and column_name = 'credentials';
  res := res || jsonb_build_object('c', 'connected_apps no longer has a credentials column', 'p', v = 0, 'd', format('%s columns named credentials', v));

  -- -------------------------------------------------------------------------
  -- Service role: the only role that reaches the table
  -- -------------------------------------------------------------------------

  set local role service_role;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

  insert into public.integration_credentials (user_id, provider, auth_type, api_key) values (a, 'hevy', 'api_key', 'hevy-key-for-a-0123456789');
  insert into public.integration_credentials (user_id, provider, auth_type, access_token, refresh_token, expires_at)
  values (a, 'google_calendar', 'oauth2', 'access-a', 'refresh-a', now() + interval '1 hour');
  insert into public.integration_credentials (user_id, provider, auth_type, api_key) values (b, 'hevy', 'api_key', 'hevy-key-for-b-9876543210');
  select count(*) into v from public.integration_credentials where user_id in (a, b);
  res := res || jsonb_build_object('c', 'Service role can store and read credentials', 'p', v = 3, 'd', format('%s rows', v));

  begin
    insert into public.integration_credentials (user_id, provider, auth_type, api_key) values (b, 'google_calendar', 'api_key', 'orphan-key-0123456789');
    res := res || jsonb_build_object('c', 'A credential needs a connected app of the same user', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A credential needs a connected app of the same user', 'p', sqlstate = '23503', 'd', sqlstate || ' ' || sqlerrm);
  end;

  begin
    insert into public.integration_credentials (user_id, provider, auth_type, api_key) values (a, 'hevy', 'api_key', 'second-key-0123456789');
    res := res || jsonb_build_object('c', 'Only one credential per user and provider', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'Only one credential per user and provider', 'p', sqlstate = '23505', 'd', sqlstate || ' ' || sqlerrm);
  end;

  begin
    update public.integration_credentials set access_token = null where user_id = a and provider = 'google_calendar';
    res := res || jsonb_build_object('c', 'An OAuth credential must keep its access token', 'p', false, 'd', 'update succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'An OAuth credential must keep its access token', 'p', sqlstate = '23514', 'd', sqlstate);
  end;

  begin
    update public.integration_credentials set refresh_token = 'x-refresh' where user_id = a and provider = 'hevy';
    res := res || jsonb_build_object('c', 'An API-key credential cannot carry a refresh token', 'p', false, 'd', 'update succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'An API-key credential cannot carry a refresh token', 'p', sqlstate = '23514', 'd', sqlstate);
  end;

  begin
    update public.integration_credentials set status = 'expired' where user_id = a and provider = 'hevy';
    res := res || jsonb_build_object('c', 'Status must be connected, needs_reauth or error', 'p', false, 'd', 'update succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'Status must be connected, needs_reauth or error', 'p', sqlstate = '23514', 'd', sqlstate);
  end;

  begin
    update public.integration_credentials set refresh_token = '' where user_id = a and provider = 'google_calendar';
    res := res || jsonb_build_object('c', 'A blank token is rejected', 'p', false, 'd', 'update succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A blank token is rejected', 'p', sqlstate = '23514', 'd', sqlstate);
  end;

  -- -------------------------------------------------------------------------
  -- Signed-in users, including the owner, cannot reach tokens at all
  -- -------------------------------------------------------------------------

  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

  begin
    perform 1 from public.integration_credentials where user_id = a;
    res := res || jsonb_build_object('c', 'The owner cannot read their own tokens', 'p', false, 'd', 'select succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'The owner cannot read their own tokens', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;

  begin
    insert into public.integration_credentials (user_id, provider, auth_type, api_key) values (a, 'hevy', 'api_key', 'planted-key-0123456789');
    res := res || jsonb_build_object('c', 'The owner cannot write tokens directly', 'p', false, 'd', 'insert succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'The owner cannot write tokens directly', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;

  begin
    update public.integration_credentials set status = 'connected' where user_id = a;
    res := res || jsonb_build_object('c', 'The owner cannot edit tokens', 'p', false, 'd', 'update succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'The owner cannot edit tokens', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;

  begin
    delete from public.integration_credentials where user_id = a;
    res := res || jsonb_build_object('c', 'The owner cannot delete tokens directly', 'p', false, 'd', 'delete succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'The owner cannot delete tokens directly', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;

  begin
    perform credentials from public.connected_apps;
    res := res || jsonb_build_object('c', 'connected_apps cannot be asked for credentials', 'p', false, 'd', 'select succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'connected_apps cannot be asked for credentials', 'p', sqlstate = '42703', 'd', sqlstate || ' ' || sqlerrm);
  end;

  -- The toggle table keeps its row level security.
  select count(*), count(*) filter (where user_id = a) into v, w from public.connected_apps;
  res := res || jsonb_build_object('c', 'The owner still sees only their own connected apps (2)', 'p', v = 2 and w = 2, 'd', format('%s visible, %s are theirs', v, w));

  -- -------------------------------------------------------------------------
  -- Signed-out clients
  -- -------------------------------------------------------------------------

  reset role;
  set local role anon;
  begin
    perform 1 from public.integration_credentials;
    res := res || jsonb_build_object('c', 'A signed-out client cannot read tokens', 'p', false, 'd', 'select succeeded');
  exception when others then
    res := res || jsonb_build_object('c', 'A signed-out client cannot read tokens', 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
  end;

  -- -------------------------------------------------------------------------
  -- Removal (as postgres)
  -- -------------------------------------------------------------------------

  reset role;
  perform set_config('request.jwt.claims', '', true);

  delete from public.connected_apps where user_id = a and provider = 'hevy';
  select count(*) into v from public.integration_credentials where user_id = a and provider = 'hevy';
  res := res || jsonb_build_object('c', 'Removing a connected app removes its credential', 'p', v = 0, 'd', format('%s rows left', v));

  delete from auth.users where id in (a, b);
  select (select count(*) from public.connected_apps where user_id in (a, b))
       + (select count(*) from public.integration_credentials where user_id in (a, b))
    into v;
  res := res || jsonb_build_object('c', 'Deleting an account removes its apps and credentials', 'p', v = 0, 'd', format('%s rows left', v));

  insert into mom37_results (n, check_name, passed, detail)
  select ord, e ->> 'c', (e ->> 'p')::boolean, e ->> 'd'
  from jsonb_array_elements(res) with ordinality as x(e, ord);
end;
$$;

select * from mom37_results order by n;
