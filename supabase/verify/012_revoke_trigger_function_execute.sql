-- Verification for supabase/migrations/012_revoke_trigger_function_execute.sql (MOM-65).
-- Run in the Supabase SQL Editor or with `npm run verify:sql` (local) or `supabase db query --linked -f` (hosted).
-- Safe to re-run, and safe against production: it creates two throwaway auth users, checks the execute privileges
-- on handle_new_user() and on every function named rls_auto_enable, tries to call each as a signed-in and a
-- signed-out role, signs the throwaway users up, then deletes them. It writes nothing else.
-- Leaves no data behind: an unexpected error rolls back the whole block.
--
-- rls_auto_enable() exists on the hosted project but not in a database built from the migrations.
-- Where it exists, anon, authenticated, service_role and PUBLIC must all be unable to execute it, in whatever
-- schema it is found, or this script fails. Where it does not exist, that is stated in the check's detail.

drop table if exists pg_temp.mom65_results;
create temp table mom65_results (n int, check_name text, passed boolean, detail text);

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  hnu constant regprocedure := 'public.handle_new_user()'::regprocedure;
  f record;
  r text;
  v int;
  w int;
  x int;
  found_rls int := 0;
  rls_public_callable boolean := false;   -- a zero-argument public.rls_auto_enable() that an API role can still run
  rls_public_exists boolean := false;
  res jsonb := '[]';
begin
  -- -------------------------------------------------------------------------
  -- Privileges: handle_new_user()
  -- -------------------------------------------------------------------------

  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    res := res || jsonb_build_object('c', format('%s cannot execute handle_new_user()', r), 'p',
      not has_function_privilege(r, hnu, 'execute'), 'd', 'has_function_privilege');
  end loop;

  select count(*) into v
  from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where p.oid = hnu and a.grantee = 0 and a.privilege_type = 'EXECUTE';
  res := res || jsonb_build_object('c', 'PUBLIC cannot execute handle_new_user()', 'p', v = 0, 'd', format('%s PUBLIC grants', v));

  res := res || jsonb_build_object('c', 'The sign-up role (supabase_auth_admin) and the owner keep EXECUTE on handle_new_user()', 'p',
    has_function_privilege('supabase_auth_admin', hnu, 'execute') and has_function_privilege('postgres', hnu, 'execute'),
    'd', 'supabase_auth_admin and postgres');

  select count(*) into v from pg_proc p
  where p.oid = hnu
    and p.prosecdef
    and exists (select 1 from unnest(p.proconfig) cfg where replace(cfg, ' ', '') in ('search_path=""', 'search_path='))
    and p.prosrc ilike '%insert into public.users%'
    and p.prosrc not ilike '%seed%';
  res := res || jsonb_build_object('c', 'handle_new_user() is still security definer with an empty search_path, and creates the users row only', 'p',
    v = 1, 'd', format('%s matching definitions', v));

  select count(*) into v from pg_trigger t
  where t.tgname = 'on_auth_user_created' and t.tgrelid = 'auth.users'::regclass and t.tgfoid = hnu
    and t.tgenabled = 'O' and not t.tgisinternal;
  res := res || jsonb_build_object('c', 'on_auth_user_created is still an enabled trigger on auth.users that runs handle_new_user()', 'p',
    v = 1, 'd', format('%s matching triggers', v));

  -- -------------------------------------------------------------------------
  -- Privileges: every function named rls_auto_enable, in any schema
  -- -------------------------------------------------------------------------

  for f in
    select p.oid, n.nspname, pg_get_function_identity_arguments(p.oid) as args, p.pronargs
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'rls_auto_enable'
    order by n.nspname, p.oid
  loop
    found_rls := found_rls + 1;
    foreach r in array array['anon', 'authenticated', 'service_role'] loop
      res := res || jsonb_build_object('c', format('%s cannot execute %s.rls_auto_enable(%s)', r, f.nspname, f.args), 'p',
        not has_function_privilege(r, f.oid, 'execute'), 'd', 'has_function_privilege');
    end loop;
    select count(*) into v
    from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = f.oid and a.grantee = 0 and a.privilege_type = 'EXECUTE';
    res := res || jsonb_build_object('c', format('PUBLIC cannot execute %s.rls_auto_enable(%s)', f.nspname, f.args), 'p',
      v = 0, 'd', format('%s PUBLIC grants', v));
    if f.nspname = 'public' and f.pronargs = 0 then
      rls_public_exists := true;
      rls_public_callable := has_function_privilege('anon', f.oid, 'execute')
        or has_function_privilege('authenticated', f.oid, 'execute')
        or has_function_privilege('service_role', f.oid, 'execute');
    end if;
  end loop;

  if found_rls = 0 then
    res := res || jsonb_build_object('c', 'rls_auto_enable does not exist in this database, so there is nothing for an API role to execute', 'p',
      true, 'd', 'not present (a database built from the migrations does not have it; the hosted project does)');
  end if;

  -- -------------------------------------------------------------------------
  -- Signing up still creates the users row, and nothing else
  -- -------------------------------------------------------------------------
  -- Inserted as postgres: postgres cannot assume supabase_auth_admin, the role the auth service signs up with. That
  -- path (the real form, the real service) is covered by the browser sign-up spec; here the trigger, its function
  -- and the privilege that role needs are checked directly (above).

  insert into auth.users (id, email)
  values (a, 'mom65-verify-a@example.invalid'), (b, 'mom65-verify-b@example.invalid');

  select count(*) into v from public.users where id in (a, b);
  res := res || jsonb_build_object('c', 'Signing up creates a users row for each throwaway account', 'p', v = 2, 'd', format('%s of 2', v));

  select count(*) into v from public.goal_channels where user_id in (a, b);
  select count(*) into w from public.micro_tasks where user_id in (a, b);
  select count(*) into x from public.task_rebalance_history where user_id in (a, b);
  res := res || jsonb_build_object('c', 'A fresh signup has no goal channels, tasks or history rows', 'p', v = 0 and w = 0 and x = 0,
    'd', format('%s channels, %s tasks, %s history rows', v, w, x));

  -- -------------------------------------------------------------------------
  -- Calling the functions by hand as a signed-in user and a signed-out client
  -- -------------------------------------------------------------------------

  foreach r in array array['authenticated', 'anon'] loop
    execute format('set local role %I', r);
    perform set_config('request.jwt.claims', case when r = 'authenticated' then json_build_object('sub', a, 'role', 'authenticated')::text else '' end, true);

    begin
      perform public.handle_new_user();
      res := res || jsonb_build_object('c', format('%s calling handle_new_user() is refused with 42501', r), 'p', false, 'd', 'call succeeded');
    exception when others then
      res := res || jsonb_build_object('c', format('%s calling handle_new_user() is refused with 42501', r), 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
    end;

    -- Only called when the privilege is already gone, so a failing run never runs the platform's function by hand.
    if rls_public_exists and not rls_public_callable then
      begin
        execute 'select public.rls_auto_enable()';
        res := res || jsonb_build_object('c', format('%s calling rls_auto_enable() is refused with 42501', r), 'p', false, 'd', 'call succeeded');
      exception when others then
        res := res || jsonb_build_object('c', format('%s calling rls_auto_enable() is refused with 42501', r), 'p', sqlstate = '42501', 'd', sqlstate || ' ' || sqlerrm);
      end;
    elsif rls_public_exists then
      res := res || jsonb_build_object('c', format('%s calling rls_auto_enable() is refused with 42501', r), 'p', false,
        'd', 'not tried: an API role can still execute it (see the privilege checks above)');
    end if;

    reset role;
    perform set_config('request.jwt.claims', '', true);
  end loop;

  -- -------------------------------------------------------------------------
  -- Removal (as postgres)
  -- -------------------------------------------------------------------------

  delete from auth.users where id in (a, b);
  select (select count(*) from public.users where id in (a, b))
       + (select count(*) from auth.users where id in (a, b)) into v;
  res := res || jsonb_build_object('c', 'Deleting the throwaway accounts leaves no rows behind', 'p', v = 0, 'd', format('%s rows left', v));

  insert into mom65_results (n, check_name, passed, detail)
  select ord, e ->> 'c', (e ->> 'p')::boolean, e ->> 'd'
  from jsonb_array_elements(res) with ordinality as x(e, ord);
end;
$$;

select * from mom65_results order by n;
