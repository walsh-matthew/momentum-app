-- MOM-37: give the service role the table privileges migration 005 assumed it already had.
-- 005 said service_role "keeps its default grants". It does not: in this project the default
-- privileges for tables created by postgres give the API roles only REFERENCES, TRIGGER and TRUNCATE
-- (see pg_default_acl), not SELECT, INSERT, UPDATE or DELETE. Row level security is bypassed by
-- service_role, but table privileges are not, so without this grant every query the credential
-- service makes fails with 42501. The verify script for 005 caught it.
--
-- Only service_role gets access. anon and authenticated keep nothing, which is the point of the table.
-- Any new table in this project needs its grants written out, the way task_rebalance_history does in 003.

grant select, insert, update, delete on table public.integration_credentials to service_role;
