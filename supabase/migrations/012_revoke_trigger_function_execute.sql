-- MOM-65: the two trigger functions are not callable through the API.
-- Supabase grants EXECUTE on every new function in public to anon, authenticated and service_role by default (see
-- MOM-60), and a function also starts out executable by PUBLIC. Migrations 002 and 004 revoked that for their trigger
-- functions and 011 for reserve_llm_call; handle_new_user() (001, replaced by 010 with CREATE OR REPLACE, which keeps
-- existing grants) and rls_auto_enable() were left open. Neither takes arguments and both exist only to fire from a
-- trigger, so no API role needs to run either one.
--
-- handle_new_user(): fired by on_auth_user_created, an AFTER INSERT trigger on auth.users. Postgres checks EXECUTE on
-- a trigger function when the trigger is created, not when it fires, so signing up does not depend on any grant. The
-- role that inserts into auth.users (supabase_auth_admin) gets an explicit grant anyway: it holds EXECUTE today
-- through PUBLIC, so this keeps what it has rather than adding to it. The owner (postgres) keeps EXECUTE as owner.
--
-- rls_auto_enable(): not created by any migration here and absent from a database built from them (local, CI). It
-- exists on the hosted project, owned by postgres, as the function behind an event trigger that turns row level
-- security on for each new table in public. Like a table trigger, an event trigger is checked for EXECUTE when it is
-- created, not when it fires (tried on the local stack: a role with no EXECUTE still creates a table, and RLS is
-- switched on), so the revoke does not stop it. The revoke runs only when the function is there. If the role running
-- this migration cannot take the privilege away, the check at the end stops the migration with an error and nothing
-- is applied, rather than leaving an open function behind a migration that looks applied.
--
-- Not touched: users, goals, tasks or any other row; no policy; no other function; no table privilege.
-- security definer and the empty search_path on handle_new_user() are unchanged.

revoke execute on function public.handle_new_user() from public, anon, authenticated, service_role;
grant execute on function public.handle_new_user() to supabase_auth_admin;

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable' and p.pronargs = 0
  ) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated, service_role;

    if has_function_privilege('anon', 'public.rls_auto_enable()', 'execute')
       or has_function_privilege('authenticated', 'public.rls_auto_enable()', 'execute')
       or has_function_privilege('service_role', 'public.rls_auto_enable()', 'execute') then
      raise exception 'public.rls_auto_enable() is still executable by an API role after the revoke; this role cannot change it.'
        using errcode = '42501';
    end if;
  end if;
end;
$$;
