# Momentum Backlog

Working list of tasks not yet scheduled into a Jira epic. Items move to Jira (`MOM` project) once they are picked up. Source of truth for upcoming work is Jira; this file captures what was found along the way.

## Discovered In-Flight

Items found while working on tickets. Add new items at the bottom with the ticket they came from.

- [ ] Phases and gates have no table. Add a `phases` table, or `phase_label` and `gate_note` on `micro_tasks`. *Source: `docs/NINETY_DAY_PLAN_CONTEXT.md` §7.*
- [ ] Weekly review notes need a record (week plus the eight feedback-loop note fields). *Source: `docs/NINETY_DAY_PLAN_CONTEXT.md` §6, §7.*
- [ ] Carry-over history: `carried_from_week` records one hop only. Decide whether to keep a chain. *Source: `docs/NINETY_DAY_PLAN_CONTEXT.md` §7.*
- [ ] Failure log entries (dated: asked, model got wrong, why) and lane tracking have no table. *Source: `docs/NINETY_DAY_PLAN_CONTEXT.md` §6, §7.*
- [ ] Add `SUPABASE_SERVICE_ROLE_KEY` handling check: confirm no `NEXT_PUBLIC_` prefix is ever used for it. *Source: MOM-8 `.env.example`.*
- [ ] Remove the Career Pivot seed from signup. `handle_new_user()` calls `seed_career_pivot()` for every new account; once the MOM-11 wizard ships, new users should start empty. *Source: MOM-9 migration §9.*
- [ ] Lock down `connected_apps.credentials` before Phase 2 stores real tokens. RLS lets the owner's browser session read the column; move credentials to a server-only table, Supabase Vault, or column-level grants. *Source: MOM-9 migration §5, `docs/INTEGRATIONS_SPEC.md` §5.*
- [ ] Lane tags (`lane_1`, `lane_2`) are not in the schema. §2 maps lane to "a tag on a channel or task". *Source: MOM-9, `docs/NINETY_DAY_PLAN_CONTEXT.md` §2, §4.*
- [ ] "The system never marks a task done" is not enforced in the database: the service role bypasses RLS. Enforce it in `@/lib/services/tasks.ts` (MOM-14/MOM-15). *Source: MOM-9, `docs/NINETY_DAY_PLAN_CONTEXT.md` §3, §5.*
- [ ] Completion criteria live in `goal_channels.criteria` (jsonb). Move to a `goal_criteria` table if per-criterion history, evidence links, or velocity scoring need it. *Source: MOM-9.*
- [ ] Replace the hand-written `Database` block in `types/database.types.ts` with `supabase gen types typescript` output once the Supabase CLI is set up; keep the domain aliases. *Source: MOM-9.*
