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
- [ ] Layout: add shadcn/ui (not installed yet) and replace the hand-rolled tab buttons in `ConnectedStackPanel` and `MobileTabBar` with its primitives. *Source: MOM-10.*
- [ ] Layout: `NavSidebar` items and `MainFeed` content are placeholders; wire them to `@/lib/services/goals` and `tasks` (MOM-11/MOM-14). *Source: MOM-10.*
- [ ] Layout: mobile view state is local to `AppShell` and resets on reload. Consider a URL param or route per view so back/forward and deep links work. *Source: MOM-10.*
- [ ] Layout: the Connected Stack / AI Assistant panel is a shared tab; split into two when the assistant chat (Vercel AI SDK) ships. *Source: MOM-10.*
- [ ] Layout: dark mode follows `prefers-color-scheme` only; add a manual toggle. *Source: MOM-10.*
- [ ] Layout: add an automated hydration check (Playwright console assertion at 390px and 1280px). Verified manually via headless Chrome for MOM-10. *Source: MOM-10.*
- [ ] Wizard: no sign-in flow exists, so `createGoalChannel` returns "Sign in to create a goal." until auth ships. The insert path is unverified against a live Supabase project. *Source: MOM-11.*
- [ ] Wizard: goal type, constraints and pace are not stored (no columns on `goal_channels`); they only shape the stub plan. Decide whether to add `goal_type` and a `preferences` jsonb. Wizard goals also start with empty `criteria`. *Source: MOM-11.*
- [ ] Wizard: the generated week 1 task plan is validated and previewed but not saved. Persist it through `@/lib/services/tasks.ts` (MOM-14), and replace `buildStubTaskPlan` with the Claude generator, which must pass `parseTaskPlan`. *Source: MOM-11, `PRODUCT_STRATEGY.md` §4.*
- [ ] Wizard: `NavSidebar` still lists placeholder channels. Wire it to `listGoalChannels()` (fetch in a server component, pass down) so a created goal appears. *Source: MOM-11.*
- [ ] Wizard: the `Adjust Weekly Pace` chip (`NINETY_DAY_PLAN_CONTEXT.md` §9) does not exist in the UI yet. Build it with MOM-15, using the carry-over language from §5 rule 1. *Source: MOM-11.*
- [ ] Wizard: `handle_new_user()` still seeds Career Pivot. Now that the wizard exists, drop the seed call in a new migration (see the MOM-9 item above). A wizard "Career pivot" goal currently gets key `career_pivot_2` next to the seeded one. *Source: MOM-11.*
- [ ] Wizard: no automated tests (no runner installed). Add unit tests for `lib/goals/taskPlan.ts` and `toChannelKey`, and a Playwright pass over the modal at 390px and 1280px. *Source: MOM-11.*
