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
- [ ] Focus card: only the earliest `todo` task is shown (`getFocusTask`). After completing it the feed moves to the next one, so there is no undo from the UI yet; the service already supports `todo` via `setTaskStatus`. Add an "Up next" list and a recently-done undo. *Source: MOM-12.*
- [ ] Focus card: the empty state in `MainFeed` is a placeholder (`// TODO(MOM-Phase2)`). It cannot tell signed-out, no tasks, and all done apart until auth ships. Nothing can sign in yet, so the card and `setTaskStatus` are unverified against a live Supabase project. *Source: MOM-12.*
- [ ] Focus card: human-only completion is enforced in `@/lib/services/tasks.ts` (session user only, anon key, no actor parameter) but not in the database. A `micro_tasks` trigger or column-level grant that blocks `status`/`completed_at` changes by `service_role` would close it. MOM-14/MOM-15 code must not call `setTaskStatus`. *Source: MOM-12, extends the MOM-9 item above.*
- [ ] Focus card: `carried_from_week` and `pulled_from_week` show one hop only (see the carry-over history item above). *Source: MOM-12.*
- [ ] Focus card: no automated tests (no runner installed). Add tests for `setTaskStatus` input validation and a component pass for the carry-over marker and toggle error state. *Source: MOM-12.*
- [ ] Integrations: real OAuth2 (Google Calendar consent, token exchange, refresh rotation) and Hevy API-key entry are not built. Toggles only flip `connected_apps.is_active`. Tagged `// TODO(MOM-Phase2)` in `lib/services/integrations.ts`. *Source: MOM-13, `docs/INTEGRATIONS_SPEC.md` §4.*
- [ ] Integrations: real HTTP clients (`lib/adapters/hevy.ts`, `lib/adapters/google.ts`) and webhook routes (`app/api/webhooks/[provider]/route.ts`) are Phase 2. Apple Health and GitHub (and Garmin) have no card or adapter yet. *Source: MOM-13.*
- [ ] Integrations: the mock adapters (`getMockHevyActivity`, `getMockCalendarActivity`) are not wired to an ingestion engine. Pass normalized payloads to `tasks.ts`/`velocity.ts` in MOM-14, without calling `setTaskStatus`. The Google Calendar mock is invented from the §3.C mapping rules (the spec has no sample). *Source: MOM-13.*
- [ ] Integrations: a toggle on a Hevy or Google Calendar card creates the `connected_apps` row with no `goal_channel_id` and no credentials, so an "active" app syncs nothing yet. Decide how a provider maps to a goal channel (`physical_fitness`, `career_pivot` keys vs. `goal_channels.channel_key`). *Source: MOM-13.*
- [ ] Integrations: `toggleConnectedApp` needs a signed-in user and none can sign in yet, so the upsert path is unverified against a live Supabase project. No automated tests (no runner installed): add tests for `setConnectedAppActive` validation and the mock payload shapes. *Source: MOM-13.*
- [ ] Velocity: the carry-over chain is one hop (`carried_from_week`), so a task carried twice only counts against the week it was last carried out of, and the earlier week's score reads too high. Revisit with the carry-over history item above. *Source: MOM-14, `lib/utils/velocity.ts`.*
- [ ] Velocity: the weights are untuned guesses (`CARRY_DRAG`, `PRESSURE_MIN_CARRIED`, `PRESSURE_MIN_SHARE`, `RISING_STREAK`, `HIGH_STREAK`, `TREND_THRESHOLD`). Tune them against real weekly history once a user has several weeks of ticks. *Source: MOM-14.*
- [ ] Velocity: all task types weigh the same. Consider weighting by task type (a `build` or `certify` miss vs. a 10-minute `job_search`), without using logged hours (§5 rule 4). *Source: MOM-14.*
- [ ] Velocity: burnout risk uses carry-over volume only. Add signals such as a falling score across consecutive weeks, the Friday review notes ("what made this week heavier"), and skipped days, once the review-notes record exists. *Source: MOM-14, `docs/NINETY_DAY_PLAN_CONTEXT.md` §6, §10.*
- [ ] Velocity: it is computed across all of the user's tasks against the first active goal's `start_date`. With several active goals, compute per goal channel and let the hero follow the selected channel. *Source: MOM-14.*
- [ ] Velocity: the current week is derived from `goal_channels.start_date` and the server's UTC date, so it can be off by one around midnight in other time zones. Store a user time zone, or the week boundary, explicitly. *Source: MOM-14.*
- [ ] Velocity: `due_date` is optional, so undated tasks count as due all week. Pace the current week by weekday for those. Integration activity (§3.C mapping) could also feed velocity, as evidence only, never as a tick (MOM-13 ingestion item). *Source: MOM-14.*
- [ ] Velocity: add a trend sparkline over `VelocitySnapshot.weeks`, and a link from the high-risk badge to the `Adjust Weekly Pace` flow once MOM-15 ships. *Source: MOM-14.*
- [ ] Velocity: no automated tests (no runner installed). Add unit tests for `computeVelocity` and `currentPlanWeek` (carried-out counting, mid-week due-so-far, streak across an unbuilt week) and a component pass for each risk level. The hero is also unverified against live data until sign-in ships. *Source: MOM-14.*
