-- Verification that every table and view in the public schema has exactly the grants its role needs (MOM-66).
-- Run with `npm run verify:sql` (local), or in the Supabase SQL Editor / `supabase db query --linked -f` (hosted).
-- Not tied to one migration, so it takes the next free verify number rather than a migration's.
--
-- Read-only and safe against production: it only reads the catalogue. The one thing it creates is the temporary
-- results table every verify script uses (it lives in this session's pg_temp and is gone at disconnect). It adds no
-- table, row or user to any real schema, and changes no privilege.
--
-- Why it exists: in this project a new table gets no SELECT, INSERT, UPDATE or DELETE for an API role unless the
-- migration grants it. Migration 005 assumed otherwise and left service_role unable to use integration_credentials
-- until 006. The allow-list below is the only place that says who may use what, so the check fails when:
--   - a table or view in public is missing from the list (a new table cannot ship unchecked),
--   - a listed table is gone (the list has gone stale),
--   - a role has a privilege the list does not expect, or lacks one it does (including deliberately closed tables),
--   - a table has row level security off.
-- Only SELECT, INSERT, UPDATE and DELETE are compared. TRUNCATE, REFERENCES and TRIGGER are not (see BACKLOG.md).
--
-- Adding a table: add three lines (anon, authenticated, service_role) to allow_list. An empty string means the role
-- is deliberately closed out.

drop table if exists pg_temp.mom66_results;
create temp table mom66_results (n int, check_name text, passed boolean, detail text);

insert into mom66_results (n, check_name, passed, detail)
with
allow_list (rel, role, privs) as (values
  -- Signed-in users reach their own rows through RLS policies (001). No policy exists for INSERT or DELETE on users,
  -- so those two grants do nothing; removing them needs a migration (BACKLOG.md, MOM-66).
  ('users',                   'anon',          ''),
  ('users',                   'authenticated', 'SELECT,INSERT,UPDATE,DELETE'),
  ('users',                   'service_role',  'SELECT,INSERT,UPDATE,DELETE'),

  ('goal_channels',           'anon',          ''),
  ('goal_channels',           'authenticated', 'SELECT,INSERT,UPDATE,DELETE'),
  ('goal_channels',           'service_role',  'SELECT,INSERT,UPDATE,DELETE'),   -- ingestion for a user, no session

  ('micro_tasks',             'anon',          ''),
  ('micro_tasks',             'authenticated', 'SELECT,INSERT,UPDATE,DELETE'),
  ('micro_tasks',             'service_role',  'SELECT,INSERT,UPDATE,DELETE'),   -- ingestion for a user, no session

  ('connected_apps',          'anon',          ''),
  ('connected_apps',          'authenticated', 'SELECT,INSERT,UPDATE,DELETE'),
  ('connected_apps',          'service_role',  'SELECT,INSERT,UPDATE,DELETE'),

  -- Provider tokens: no browser role at all (005); service_role was granted in 006.
  ('integration_credentials', 'anon',          ''),
  ('integration_credentials', 'authenticated', ''),
  ('integration_credentials', 'service_role',  'SELECT,INSERT,UPDATE,DELETE'),

  -- LLM usage (011): users read their own rows; the server writes them; nobody deletes.
  ('llm_usage_logs',          'anon',          ''),
  ('llm_usage_logs',          'authenticated', 'SELECT'),
  ('llm_usage_logs',          'service_role',  'SELECT,INSERT,UPDATE'),

  ('llm_usage_daily',         'anon',          ''),
  ('llm_usage_daily',         'authenticated', ''),
  ('llm_usage_daily',         'service_role',  'SELECT'),

  -- Append-only history (003): users read it, nobody writes it directly (apply_task_move does).
  -- Decision (MOM-66, 2026-10-26): service_role stays CLOSED. No job without a session reads it today (the only
  -- reader is lib/services/tasks.ts, on the user's session), and a table-wide SELECT would let any bug that uses the
  -- admin client read every user's moves. If a no-session job needs it later, give it a narrow SECURITY DEFINER
  -- function under its own ticket, not a grant here.
  ('task_rebalance_history',  'anon',          ''),
  ('task_rebalance_history',  'authenticated', 'SELECT'),
  ('task_rebalance_history',  'service_role',  '')
),
roles (role) as (values ('anon'), ('authenticated'), ('service_role')),
dml (ord, priv) as (values (1, 'SELECT'), (2, 'INSERT'), (3, 'UPDATE'), (4, 'DELETE')),
rels as (
  select c.oid, c.relname::text as rel, c.relkind, c.relrowsecurity
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f')
),
actual as (
  select r.rel, ro.role,
         coalesce(string_agg(d.priv, ',' order by d.ord) filter (where has_table_privilege(ro.role, r.oid, d.priv)), '') as privs
  from rels r cross join roles ro cross join dml d
  group by r.rel, ro.role
),
checks (grp, sub, check_name, passed, detail) as (
  select 1, '', 'Every table and view in public is in the allow-list',
         not exists (select 1 from rels where rel not in (select rel from allow_list)),
         coalesce((select 'not in the list: ' || string_agg(rel, ', ' order by rel) from rels where rel not in (select rel from allow_list)),
                  format('%s relations, all listed', (select count(*) from rels)))

  union all
  select 2, '', 'Every allow-list entry names a table or view that exists',
         not exists (select 1 from allow_list where rel not in (select rel from rels)),
         coalesce((select 'no such relation: ' || string_agg(distinct rel, ', ' order by rel) from allow_list where rel not in (select rel from rels)),
                  'none missing')

  union all
  select 3, '', 'Every listed relation has exactly one line for each of anon, authenticated and service_role',
         not exists (
           select 1 from allow_list group by rel
           having count(*) <> 3 or count(distinct role) <> 3 or bool_or(role not in (select role from roles))
         ),
         coalesce((select 'check the lines for: ' || string_agg(rel, ', ' order by rel) from (
                     select rel from allow_list group by rel
                     having count(*) <> 3 or count(distinct role) <> 3 or bool_or(role not in (select role from roles))
                   ) bad),
                  'three lines each')

  union all
  select 4, '', 'Row level security is on for every table',
         not exists (select 1 from rels where relkind in ('r', 'p') and not relrowsecurity),
         coalesce((select 'RLS off: ' || string_agg(rel, ', ' order by rel) from rels where relkind in ('r', 'p') and not relrowsecurity),
                  format('%s tables, all on', (select count(*) from rels where relkind in ('r', 'p'))))

  union all
  select 5, a.rel || ' ' || a.role,
         a.rel || ': ' || a.role || case when e.privs = '' then ' has no privilege' else ' has exactly ' || e.privs end,
         a.privs = e.privs,
         case when a.privs = e.privs then 'has ' || coalesce(nullif(a.privs, ''), 'nothing')
              else format('has %s; missing: %s; unexpected: %s',
                          coalesce(nullif(a.privs, ''), 'nothing'),
                          coalesce(nullif(array_to_string(array(
                            select x from unnest(string_to_array(e.privs, ',')) x where x <> '' and x <> all (string_to_array(a.privs, ','))), ','), ''), 'none'),
                          coalesce(nullif(array_to_string(array(
                            select x from unnest(string_to_array(a.privs, ',')) x where x <> '' and x <> all (string_to_array(e.privs, ','))), ','), ''), 'none'))
         end
  from allow_list e join actual a on a.rel = e.rel and a.role = e.role
)
select row_number() over (order by grp, sub)::int, check_name, passed, detail
from checks;

select * from mom66_results order by n;
