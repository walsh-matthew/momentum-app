-- MOM-19: new accounts start empty.
-- Migration 001 section 9 seeded the default "Career Pivot" channel and its 11 tasks for every new account
-- as a Phase 1 stand-in, with a note to drop it once the goal wizard existed. The wizard (MOM-11) and its
-- Claude-written week 1 plan (MOM-35) are live, and the empty states (MOM-18) tell a new user what to do, so
-- the signup trigger now only creates the users row.
--
-- Also fixes the wizard key collision: a wizard goal titled "Career pivot" got the key career_pivot_2 because
-- the seeded channel already held career_pivot. With no seed, the first such goal gets career_pivot. The key
-- code (toChannelKey, channelKeyFor) is unchanged.
--
-- Not touched:
-- - Existing users' rows: accounts that already have the seeded channel, its tasks and its history keep them.
--   Nothing here updates or deletes a row.
-- - seed_career_pivot(uuid) stays, unchanged, for dev and test seeding. It is still not callable through the
--   API (migrations 001 and 008) and nothing calls it any more except a postgres connection.
-- - Privileges: CREATE OR REPLACE keeps the function's existing grants, and this file neither grants nor
--   revokes anything. The on_auth_user_created trigger from migration 001 is unchanged and still calls this
--   function by name.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;
