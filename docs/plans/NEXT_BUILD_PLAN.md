# 🚀 MOMENTUM BUILD: NEXT-PHASE MASTER EXECUTION PLAN

> **Date:** 2026-10-22 | **Active Epic:** MOM-16 | **Base Commit:** 27cad6d

---

## Executive Overview & Architectural Invariants

This build cycle completes the onboarding demo loop (a new user creates a goal and gets real week-1 tasks), adds browser tests for sign-up, sign-in, route guards and sign-out against a **local** Supabase stack, connects the external provider UIs and real adapters, and protects production with CI and LLM spend governance. Every block preserves the three non-negotiable invariants:

1. **Human-Only Completion:** Only the signed-in owner ever changes a task's `status` or `completed_at`. No background job, webhook, ingestion run or LLM may write them, and nothing creates a task as `done`. Enforced by the `micro_tasks_guard_completion` trigger (migration 002) and by source-level tests.
2. **No-Delete / Carry-Forward:** Unfinished work is never cut or hard-deleted. The only moves are `carry_over` and `pull_forward`; work that cannot fit is named in a `cannot_hold` warning. `task_rebalance_history` is append-only.
3. **Service-Layer RLS Enforcement:** The UI never queries Supabase. All access goes through `lib/services/`, scoped to the signed-in user by RLS. The service-role client lives only in server-only modules and is scoped to a user id the server verified. **Every new table or function needs explicit grants and RLS** (this project grants nothing to API roles by default; the MOM-37 lesson).

## Standing Rules (every prompt below repeats what it needs)

- **Read the Jira ticket first.** If its title, scope or acceptance criteria disagree with the prompt, stop and flag it.
- **Production changes need your approval.** A prompt stops before `supabase db push`, `vercel env`, or any push to `origin`, shows what will happen, and waits. Never use the SQL Editor. Tests never run against production and never use production credentials.
- **Database checks are not part of `npm test`.** The 91 checks live in 6 SQL scripts in `supabase/verify/` and run with `npx supabase db query --linked -f <file> -o table`. After any migration, run **all** of them; every row must show `passed = true`.
- **New migrations** continue the numbering (check `ls supabase/migrations`; the next free number today is 008). Never edit an applied migration.
- **Nothing is pushed inside a block.** Each block merges to `main` locally; the single push happens in the Final Day-End section.

## Session Preflight (run before every block)

```bash
cd C:\Users\matth\momentum-app
git checkout main && git pull --ff-only && git status --short   # expect clean (AGENTS.md may be untracked)
npm run plan -- MOM-<n>                                          # optional: the generator's view of the ticket
```

---

## High-Priority Ticket Sequence & Session Blocks

```text
SESSION 1: CORE DEMO LOOP & CLEAN SIGNUP (MOM-34, MOM-35, MOM-18, MOM-19)
  - Persist wizard answers, persist the Claude-written week-1 plan, real empty states, then drop the signup seed
SESSION 2: E2E AUTH & HYDRATION TESTS (MOM-61)
  - Playwright against a local Supabase stack: sign-up, confirmation, sign-in, route guards, sign-out, hydration at 390px and 1280px
SESSION 3: EXTERNAL INTEGRATIONS & UI (MOM-62, MOM-38)
  - Google consent flow and Hevy key forms, then real adapters and signed webhooks (MOM-38 needs Hevy samples from you)
SESSION 4: CI PROTECTION & COST GOVERNANCE (MOM-67, MOM-73)
  - GitHub Actions CI with a disposable database, then durable LLM rate limits, usage logging and spend caps
```

*Order matters. In Session 1, MOM-19 comes last: the seed must not be removed until a new user can build a plan (MOM-34, MOM-35) and sees a sensible empty state (MOM-18). MOM-62 comes before MOM-38 because the adapters need the connect flows. Safe stopping points: after Block 1.2 (the core loop works), after each session. If the day runs short, stop after Session 2; Block 3.2 is the first to drop (it also waits on Hevy samples from you).*

---

# SESSION 1: CORE DEMO LOOP & CLEAN SIGNUP

## Block 1.1: Persist Wizard Goal Type, Constraints and Pace (MOM-34)

* **Objective & Scope:** The wizard's three answers are collected, shape the preview, and are then thrown away. Store them with the goal (a `goal_type` column and a `preferences` jsonb) and fill the goal's `criteria` from the wizard where it collects them. This is the prerequisite for MOM-35.
* **Core Invariants to Protect:** *Service RLS* (new columns live on an RLS-protected table; writes only through `lib/services/goals.ts`). *Human-Only Completion*: initial `criteria` items start `done: false`; the wizard never ticks one.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-34: persist wizard goal type, constraints and pace.

Task Instructions:
1. Read ticket MOM-34 in Jira first; its acceptance criteria are the definition of done. If it disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, docs/NINETY_DAY_PLAN_CONTEXT.md, lib/goals/taskPlan.ts, lib/goals/vocabulary.ts, lib/services/goals.ts, components/goals/GoalBuilderWizard.tsx and types/database.types.ts.
3. Create the feature branch `feature/MOM-34-persist-wizard-answers` off a clean `main`.
4. Design before coding: tell me the columns you propose (goal_type with a CHECK list matching the TypeScript GOAL_TYPES, preferences jsonb with a shape check) and how existing rows (the seeded Career Pivot goal) are treated (nullable / default). Wait for my OK on the design.
5. Write the next migration and update types/database.types.ts, the wizard input schema and createGoalChannel so the three answers persist and reload with the goal. Initial criteria come from the wizard where it collects them, all with done: false.
6. Add tests (service, schema, types) and supabase/verify/<n>_goal_preferences.sql: RLS still isolates users, the CHECK rejects an unknown goal_type, and criteria cannot arrive ticked from the wizard path.
7. STOP before production. Show me the migration and `npx supabase db push --dry-run`, wait for my go-ahead, then push and run ALL scripts in supabase/verify/ (91 checks plus yours); all must pass.
8. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass.
9. Update BACKLOG.md for MOM-34 (tick resolved items, add findings with Jira keys).
10. Commit with "feat(MOM-34): persist wizard goal type, constraints and pace" and merge into main with --no-ff. Do not push.
11. Update MOM-34 in Jira: Done only if both acceptance criteria are met (comment what shipped and how verified); otherwise say what is unmet.

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes; committed with the feat/fix(MOM-X) format; merged to main; Jira updated.
```

* **User Verification Gate:**
  - [ ] You approved the column design before any migration was written.
  - [ ] The verify total is all passing.
  - [ ] After the day-end push: create a goal in the wizard on the live site, reopen it, and the three answers are there.

---

## Block 1.2: Persist the Wizard Week-1 Plan and Replace the Stub with Claude (MOM-35)

* **Objective & Scope:** Confirming the wizard must write the week-1 tasks, owned by the user, all unfinished. Replace `buildStubTaskPlan` with a Claude generator whose output passes `parseTaskPlan` unchanged, with a user-visible retry on invalid output. The model fires only from the user's confirm click.
* **Core Invariants to Protect:** *Human-Only Completion*: no task is ever created `done`. *Service RLS*: tasks are inserted through the user's session with `user_id` from the verified session, into a channel the user owns. *No-Delete*: a retry creates nothing partial; a plan is written all at once or not at all.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-35: persist the wizard week 1 plan and replace the stub generator with Claude.

Task Instructions:
1. Read ticket MOM-35 in Jira first; its acceptance criteria are the definition of done. NOTE: the ticket says "Vercel AI SDK"; this repo standardised on the official @anthropic-ai/sdk in lib/ai/rebalance.ts (CLAUDE.md allows "Claude API / Vercel AI SDK"). Follow lib/ai/rebalance.ts and say so; do not add a second SDK. If anything else disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, PRODUCT_STRATEGY.md section 4, docs/NINETY_DAY_PLAN_CONTEXT.md, lib/goals/taskPlan.ts, lib/ai/rebalance.ts, tests/rebalance-ai.test.ts, tests/rebalance-model.test.ts, lib/services/tasks.ts and components/goals/GoalBuilderWizard.tsx. MOM-34 must already be merged; if not, stop and tell me.
3. Create the feature branch `feature/MOM-35-wizard-week-one-plan` off a clean `main`.
4. Persist: add a service function in lib/services/tasks.ts (there is no lib/services/plans.ts; do not create one) that inserts the validated week-1 plan for the signed-in user in ONE database call (all tasks or none), status 'todo', week_of 1, in a goal channel the user owns. The wizard flow creates the goal and its tasks together or fails with no partial data. Use the user's session client (RLS), never the service role. Creating the goal and its tasks atomically will most likely need a Postgres function (see step 9).
5. Generate: add a server-only module lib/ai/taskPlan.ts modelled on lib/ai/rebalance.ts: official SDK, claude-opus-5-5, structured output, raw JSON through parseTaskPlan() unchanged, no `thinking` setting, no forced tool_choice, a fixed system prompt, and a rate limit like requestModelRebalance. Fire it only from the wizard's confirm/generate click, never on load. The model sees only what the user typed into the wizard; say so on screen.
6. Invalid or refused model output is rejected with a user-visible message and a retry button. The rule-based stub (buildStubTaskPlan) may remain as an explicit fallback only if the user chooses it. Never silently substitute.
7. Tests: mocked model (valid; schema-invalid; a plan trying status 'done'; unknown task type; week 14; empty plan; refusal; API errors), the persist function (all-or-nothing, every row todo, owned by the session user), a source-level test that nothing in the plan path writes status or completed_at, and a boundary test that no component imports the new AI module.
8. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass. Check the build output contains no key or prompt text.
9. A migration is expected: two separate inserts through the API cannot be all-or-nothing. Design before coding and wait for my OK: a function in the next migration that creates the goal channel and its week-1 tasks in one transaction, SECURITY INVOKER (so RLS applies) with search_path = '', user_id taken from auth.uid() and never from an argument, no status or completed_at parameter (every row is 'todo'), EXECUTE revoked from public, anon and service_role and granted to authenticated only. Update types/database.types.ts and the fake in tests/helpers/fakeSupabase.ts, and add supabase/verify/<n>_wizard_plan.sql (another user's channel is refused, a failing task rolls back the goal, no row arrives done). STOP before production: show the migration and `npx supabase db push --dry-run`, wait for my go-ahead, then push and run ALL scripts in supabase/verify/; all must pass. If you find a way that needs no migration, explain it and wait for my OK.
10. Update BACKLOG.md for MOM-35 (tick resolved items, add findings with Jira keys).
11. Commit with "feat(MOM-35): persist the wizard week 1 plan and generate it with Claude" and merge into main with --no-ff. Do not push.
12. Update MOM-35 in Jira: Done only if all acceptance criteria are met; say clearly that the live model call is unverified until I run the smoke test, and leave the ticket open until I confirm it.

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes; committed with the feat/fix(MOM-X) format; merged to main; Jira updated.
```

* **User Verification Gate:**
  - [ ] Locally (the URL `npm run dev` prints): complete the wizard; the generated week-1 tasks appear in the main view, **none ticked**.
  - [ ] After the day-end push, on the live site: the same, and the screen says Claude wrote the plan. Ask the CLI to create and later delete a throwaway user for this smoke test, as for MOM-47.
  - [ ] A forced failure shows the error and a retry. Only then close MOM-35 in Jira.

---

## Block 1.3: Distinguish Signed-Out, No-Tasks and All-Done Empty States (MOM-18)

* **Objective & Scope:** Replace the placeholder in `MainFeed` (and its `TODO(MOM-Phase2)`) with three real states driven by a discriminated result from the focus-task service: signed out (sign-in prompt), zero tasks (link to the wizard), everything done (completion state).
* **Core Invariants to Protect:** *Human-Only Completion*: "all done" is derived from the user's own ticks, never set by the system. *Service RLS*: the UI receives a typed result; no Supabase call in a component.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-18: distinguish signed-out, no-tasks and all-done empty states in MainFeed.

Task Instructions:
1. Read ticket MOM-18 in Jira first; its acceptance criteria are the definition of done. If it disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, components/layout/MainFeed.tsx, app/page.tsx, lib/services/tasks.ts (getFocusTask) and components/tasks/.
3. Create the feature branch `feature/MOM-18-empty-states` off a clean `main`.
4. Make getFocusTask return a discriminated result (signed_out | empty | all_done | task) computed in the service, not inferred by the UI. Add three typed empty-state components under components/tasks (exported props interfaces, no Supabase calls). Remove the TODO(MOM-Phase2) comment in MainFeed.
5. "Empty" links to the goal wizard; "all done" shows a completion state; "signed out" shows a sign-in call to action.
6. Tests: the service result for each case (another user's tasks do not count) and render tests for each component.
7. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass.
8. Update BACKLOG.md for MOM-18 (tick resolved items).
9. Commit with "feat(MOM-18): distinguish signed-out, no-tasks and all-done empty states" and merge into main with --no-ff. Do not push.
10. Update MOM-18 in Jira: Done only if all acceptance criteria are met.

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes; committed with the feat/fix(MOM-X) format; merged to main; Jira updated.
```

* **User Verification Gate:**
  - [ ] Locally: signed out shows the sign-in prompt; an account with no tasks shows the wizard link; an account with every task ticked shows the completion state.

---

## Block 1.4: Remove the Career Pivot Seed from New-Account Signup (MOM-19)

* **Objective & Scope:** A new account starts empty and uses the wizard. Drop the `seed_career_pivot()` call from `handle_new_user()` in a **new** migration. Existing accounts keep their data. **Hazard:** verify scripts 001, 002, 003, 004 and 007 rely on the signup seed to create their fixtures; each must be rewritten to build its own fixtures with every check preserved.
* **Core Invariants to Protect:** *Service RLS*: `handle_new_user` stays SECURITY DEFINER with `search_path` pinned; its grants must not widen (MOM-65 owns closing them). *No-Delete*: nothing deletes existing users' goals or tasks.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-19: remove the Career Pivot seed from new-account signup.

Task Instructions:
1. Read ticket MOM-19 in Jira first; its acceptance criteria are the definition of done. MOM-34, MOM-35 and MOM-18 must already be merged so a new user can build a plan and sees a wizard link; if not, stop and tell me. If the ticket disagrees with these instructions, stop and flag it. Also read MOM-65: if it is still open, its second acceptance criterion ("signing up still seeds the default goal") stops being true after this ticket. Add a Jira comment on MOM-65 saying that criterion should now read "signing up still creates the users row, and a fresh signup has no goals", and leave MOM-65 otherwise unchanged.
2. Read CLAUDE.md, docs/NINETY_DAY_PLAN_CONTEXT.md (seed data section; if the docs say the seed is required, flag it), migration 001 (seed_career_pivot and handle_new_user), migrations 002 to the latest, and every file in supabase/verify/.
3. Create the feature branch `feature/MOM-19-remove-signup-seed` off a clean `main`.
4. Inventory first: list every verify script and unit test that depends on the seeded Career Pivot channel or its 11 tasks. Show me the list.
5. Write a NEW migration (never edit an applied one) that replaces handle_new_user() without the seed call, keeping security definer and search_path = ''. `create or replace` keeps the existing grants; do not widen them. Keep seed_career_pivot() itself for dev seeding, still not executable by API roles. Do not touch existing users' rows.
6. Rewrite the dependent verify scripts so each creates its own fixtures as postgres (a goal channel and tasks) instead of relying on signup. All 91 existing checks must still be present and pass. Add checks that a fresh signup has zero goal channels and zero tasks, and that a wizard-created goal can use the key career_pivot (no _2 suffix).
7. STOP before production. Show me the migration, the diff of every verify script, and `npx supabase db push --dry-run`. Wait for my go-ahead, then push and run ALL scripts in supabase/verify/; all must pass.
8. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass.
9. Update BACKLOG.md for MOM-19 and any seed-related items.
10. Commit with "feat(MOM-19): remove the Career Pivot seed from new-account signup" and merge into main with --no-ff. Do not push.
11. Update MOM-19 in Jira: Done only if all acceptance criteria are met.

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes; committed with the feat/fix(MOM-X) format; merged to main; Jira updated.
```

* **User Verification Gate:**
  - [ ] You reviewed the verify-script diff: the same checks, now with explicit fixtures.
  - [ ] After the push: the verify total is all passing; the CLI creates and deletes a throwaway user and shows **zero** goals and tasks for it; your existing account still has its data.

---

# SESSION 2: E2E AUTH & HYDRATION TESTS

## Block 2.1: Playwright E2E, Hydration Checks and Component Tests (MOM-61)

* **Objective & Scope:** Jira's three criteria: Playwright with `npm run test:e2e`; a console check that fails on any hydration error at 390px and 1280px; Testing Library with jsdom for component tests. This plan adds auth specs on top: sign-up, email confirmation, sign-in, protected-route guards and sign-out, run **only against a local Supabase stack** (`supabase start`, which needs Docker; confirmation emails are read from the local mail inbox). It never signs up real users on production.
* **Core Invariants to Protect:** *Service RLS*: tests never use production URLs, keys or the real service-role key; the config refuses to run unless the Supabase URL is local. Protected routes must reject unauthenticated sessions. *Human-Only Completion*: component tests prove the UI offers no control that completes a task other than the owner's own toggle.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-61: Playwright E2E, hydration checks and component tests, plus local auth specs.

Task Instructions:
1. Read ticket MOM-61 in Jira first (its description is three bullets; treat them as the criteria). Also read MOM-54 and MOM-55 to MOM-59 and the BACKLOG.md "Tests" items. The auth specs below are an extension agreed in the build plan: add a Jira comment on MOM-61 saying so. If anything else disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, package.json, vitest.config.mts, tests/rebalance-drawer.test.tsx, components/, app/login/page.tsx, app/auth/callback/route.ts and lib/supabase/proxy.ts (PUBLIC_PATHS). The repo has no supabase/config.toml today, and `supabase start` needs one: run `npx supabase init` (do not run `supabase link` or change the linked project), enable local email confirmations and keep the local inbox on, and commit the generated supabase/config.toml. Show me the file before committing; it must hold no secrets or production project ref.
3. Create the feature branch `feature/MOM-61-e2e-and-component-tests` off a clean `main`.
4. Component tests: add jsdom and Testing Library to Vitest (a separate environment for *.test.tsx files, keeping node for the rest). Cover FocusTaskCard (carry-over marker, move-chain line, toggle error state), the risk badge at each level, and RebalanceDrawer including clicking "Ask Claude to review" with the server action mocked.
5. Playwright: install it and add `npm run test:e2e`. The hydration check loads /login at 390px and 1280px and fails on any console error or warning that mentions hydration.
6. Auth specs in tests/e2e/auth.spec.ts, against a local Supabase stack only: sign up with a unique throwaway email, read the confirmation link from the local mail inbox, land signed in, confirm the protected route "/" redirects to /login when signed out, sign out, sign in again. The Playwright config starts `next dev` with env from `npx supabase status -o env` (never printed), and throws if NEXT_PUBLIC_SUPABASE_URL is not localhost or 127.0.0.1; add a unit test for that guard. Do NOT point any spec at production and do not use real secrets.
7. If Docker or the local stack is unavailable, tell me, still ship steps 4, 5 and the guard, and list exactly which auth specs are blocked and why. Do not fake them.
8. Prove the hydration check can fail: temporarily introduce a mismatch, show the test failing, then revert.
9. Keep `npm test` fast and independent of Playwright. Propose wording to add both commands to CLAUDE.md's Definition of Done and apply it only if I approve.
10. Run `npx tsc --noEmit`, `npm test`, `npm run test:e2e` and `npm run build`; all must pass.
11. Update BACKLOG.md. Comment on Jira tickets MOM-55 to MOM-59 saying which of their remaining criteria are now covered; close none unless every criterion is covered (obsolete or redundant: move to Closed with a reason).
12. Commit with "test(MOM-61): add Playwright hydration checks, component tests and local auth specs" and merge into main with --no-ff. Do not push.
13. Update MOM-61 in Jira: Done only if all three Jira bullets are met; otherwise say what is blocked and leave it open.

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes; committed with the type(MOM-X) format; merged to main; Jira updated.
```

* **User Verification Gate:**
  - [ ] `npm test` and `npm run test:e2e` both pass locally (Docker running).
  - [ ] You watched the hydration test **fail** on the deliberately broken page.
  - [ ] The CLI showed the guard refusing a non-local Supabase URL, and listed any auth specs still blocked.

---

# SESSION 3: EXTERNAL INTEGRATIONS & UI

**Your prerequisites before this session:** (1) a Google Cloud OAuth client (Web application, Calendar read-only scope) with redirect URIs `https://momentum-app-eight-chi.vercel.app/api/auth/callback/google` and `http://localhost:3000/api/auth/callback/google`, yourself added as a test user; (2) `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` set in Vercel Production and in `.env.local`; (3) for Block 3.2, a **redacted real Hevy API response** or the Hevy API documentation saved in the repo, and a Hevy Pro API key.

## Block 3.1: Google OAuth Consent Flow and Hevy API-Key Forms (MOM-62)

* **Objective & Scope:** The Google consent redirect and callback route `/api/auth/callback/google`, a Hevy key form, and connect/disconnect buttons wired to `lib/services/integrations.ts`, shown on the existing integration cards in `components/integrations/`. Token storage, retrieval and refresh already exist (MOM-37). The provider catalog has two providers, Hevy and Google Calendar; there is no Jira provider and no settings page, so no new settings page or drawer is added.
* **Core Invariants to Protect:** *Service RLS / secrets*: no token, key or client secret reaches the browser (only `IntegrationAccount` does); the callback requires a verified session and takes the user id from it, never the request; `state` is checked. *Human-Only Completion*: connecting an app creates and completes no tasks.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-62: build the Google OAuth consent flow and Hevy API key UI forms.

Task Instructions:
1. Read ticket MOM-62 in Jira first (the description is a bullet list; treat each bullet as a criterion). If anything disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, docs/INTEGRATIONS_SPEC.md (sections 3.C and 5), lib/services/integrations.ts (saveApiKey, saveOAuthTokens, disconnectIntegration, listIntegrationAccounts), types/integrations.ts, components/integrations/, app/actions/integrations.ts and lib/supabase/proxy.ts. Confirm GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set locally (names only; never print values) or tell me what is missing.
3. Create the feature branch `feature/MOM-62-connect-flows` off a clean `main`.
4. Google: a route that starts the consent redirect (state and PKCE in an httpOnly short-lived cookie, minimal scope calendar.readonly, access_type=offline) and the callback at app/api/auth/callback/google/route.ts that requires a signed-in session, verifies state, exchanges the code server-side, validates the response and calls saveOAuthTokens(). The callback is an authenticated route: do NOT add it to PUBLIC_PATHS. Handle denial, bad state and exchange failure with a friendly message and no token or provider text in URLs or logs.
5. Hevy: a Server Action form that calls saveApiKey(); the key is never echoed back or stored client-side.
6. UI: connect and disconnect buttons on each existing card from listIntegrationAccounts() (IntegrationAccount only), including a "needs reconnect" state for status needs_reauth. Only Google Calendar and Hevy exist as providers; do not add Jira, a settings page or a drawer. If you think one is needed, stop and ask.
7. Remove the TODO(MOM-Phase2) comment about the connect flow.
8. Tests: state mismatch, missing session, exchange failure, denial, no token or secret in any returned value, and a boundary test that no component imports the Google exchange code. Mock the network.
9. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass. Confirm the client output contains no secret names or values.
10. Update BACKLOG.md for MOM-62 (tick resolved items, add findings with Jira keys).
11. Commit with "feat(MOM-62): build the Google consent flow and Hevy key forms" and merge into main with --no-ff. Do not push.
12. Update MOM-62 in Jira: leave it open until I confirm both connections work live; comment what shipped and what I must test.

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes; committed with the feat/fix(MOM-X) format; merged to main; Jira updated.
```

* **User Verification Gate:** *(after the day-end push and deploy)*
  - [ ] Connect Google Calendar with your real account: the card shows connected. Revoke access in your Google account, trigger a refresh, and the card shows "needs reconnect".
  - [ ] Connect Hevy with your real key, then disconnect; ask the CLI for a **count-only** query confirming the credential row is gone.
  - [ ] In the browser Network tab during connect, no token, key or client secret appears in any response.

---

## Block 3.2: Hevy and Google HTTP Adapters and Signed Webhook Routes (MOM-38)

* **Objective & Scope:** Real clients in `lib/adapters/hevy.ts` and `lib/adapters/google.ts` whose output matches `InboundActivityPayload` (`docs/INTEGRATIONS_SPEC.md`), plus `app/api/webhooks/[provider]/route.ts` with signature verification. Adapters only normalize; they hand results to the existing ingestion engine (`lib/services/ingestion.ts`), and only services touch Supabase. **This block cannot be built honestly for Hevy without Hevy's real API documentation or a redacted sample response; the prompt stops if none is provided.**
* **Core Invariants to Protect:** *Human-Only Completion*: ingestion writes evidence and never `status` or `completed_at`, and never completes or creates a completed task. *Service RLS*: the Hevy key is **per user**, read server-side from `integration_credentials` via the integrations service; the global `HEVY_API_KEY` env var is vestigial (MOM-74) and must not be used. The webhook rejects unsigned or invalid requests before touching the database.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-38: Hevy and Google HTTP clients and provider webhook routes.

Task Instructions:
1. Read ticket MOM-38 in Jira first; its acceptance criteria are the definition of done. MOM-62 must already be merged; if not, stop and tell me. If anything disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, docs/INTEGRATIONS_SPEC.md (the InboundActivityPayload contract, sections 3, 5 and 6), lib/services/integrations.ts, lib/services/ingestion.ts and tests/ingestion.test.ts.
3. Ask me for the Hevy API documentation or a redacted real /v1/workouts response. If I have not provided one, STOP before writing the Hevy adapter and tell me; do not invent field names. The Google Calendar adapter may proceed from Google's public API.
4. Create the feature branch `feature/MOM-38-real-adapters-and-webhooks` off a clean `main`.
5. Write lib/adapters/hevy.ts and lib/adapters/google.ts (HTTP clients; Zod-validate every response; output valid InboundActivityPayload objects). The Hevy key comes from the user's stored credential through the integrations service, sent as the `api-key` header. Do NOT read HEVY_API_KEY. Adapters never touch Supabase.
6. Write app/api/webhooks/[provider]/route.ts: verify the provider's signature or token (per the spec; if the spec does not define it for a provider, stop and ask) BEFORE any database access, reject unsigned or invalid requests with a generic 401, resolve the user from the verified payload and hand the normalized activities to the ingestion engine. Never log payload bodies or secrets.
7. Remove both TODO(MOM-Phase2) comments in lib/services/integrations.ts.
8. Tests (network mocked, using the redacted sample): each adapter returns valid payloads for real-shaped responses and rejects malformed ones; the webhook rejects unsigned, mis-signed and replayed requests; a source-level test that nothing in the adapter or webhook path writes status or completed_at.
9. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass.
10. No migration is expected; if one is needed, stop and ask me.
11. Update BACKLOG.md for MOM-38 (tick resolved items, add findings with Jira keys).
12. Commit with "feat(MOM-38): build Hevy and Google adapters and signed webhook routes" and merge into main with --no-ff. Do not push.
13. Update MOM-38 in Jira: Done only if all three acceptance criteria are met; otherwise comment what is unmet and leave it open.

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes; committed with the feat/fix(MOM-X) format; merged to main; Jira updated.
```

* **User Verification Gate:**
  - [ ] You provided the Hevy sample before the Hevy adapter was written.
  - [ ] An unsigned `curl` POST to the webhook route returns 401 and changes nothing.
  - [ ] After the push, a real activity from your connected account shows up as evidence and **no task changes state**.

---

# SESSION 4: CI PROTECTION & COST GOVERNANCE

## Block 4.1: GitHub Actions CI with a Disposable Database (MOM-67)

* **Objective & Scope:** `.github/workflows/ci.yml` with two jobs. Job 1 runs `npx tsc --noEmit`, `npm test` and `npm run build` on every push and PR. Job 2 starts a **local** Supabase stack, applies every migration, and runs every file in `supabase/verify/`, failing on any `passed = false` or error. If MOM-61 is merged, Job 1 also runs `npm run test:e2e`.
* **Core Invariants to Protect:** All three; this ticket exists to guard them. CI must **never** hold production credentials or the production project ref.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-67: run the SQL verify scripts, type check, tests and build in CI.

Task Instructions:
1. Read ticket MOM-67 in Jira first; its acceptance criteria are the definition of done. If it disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, package.json, supabase/config.toml, every file in supabase/verify/ and supabase/migrations/, and how the scripts report results (a table with a `passed` column). If supabase/config.toml is missing (MOM-61 normally adds it), run `npx supabase init` without linking, show me the file, and commit it; `supabase start` in CI needs it.
3. Create the feature branch `feature/MOM-67-ci-pipeline` off a clean `main`.
4. Add .github/workflows/ci.yml with two jobs. Job 1: install, `npx tsc --noEmit`, `npm test`, `npm run build` with dummy NEXT_PUBLIC_SUPABASE_* values and no real secrets (add `npm run test:e2e` if it exists, against the local stack). Job 2: supabase/setup-cli plus `supabase start`, apply every migration, run every file in supabase/verify/ against the local database, and fail if any script returns passed = false or errors. No production credentials, tokens or project ref anywhere in the workflow.
5. Put the verify runner in scripts/ (not inline YAML) so it runs locally too, with a test of its pass/fail parsing.
6. Verify what you can locally (run the runner against a local stack if Docker is available; say what you could not test). Do not push or open a PR.
7. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass.
8. CLAUDE.md currently describes direct merges to main. Propose wording for a PR-based workflow with branch protection and show me the diff; apply it only if I approve.
9. Update BACKLOG.md (tick the CI item, add anything new with Jira keys).
10. Commit with "feat(MOM-67): run type check, tests, build and SQL verify scripts in CI" and merge into main with --no-ff. Do not push. Tell me exactly which steps need me: pushing, opening a PR, and turning on branch protection in GitHub.
11. Update MOM-67 in Jira: leave it open until I confirm the workflow ran green on GitHub and a failing check blocks a merge; comment what is done and what is waiting on me.

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes; committed with the feat/fix(MOM-X) format; merged to main; Jira updated.
```

* **User Verification Gate:**
  - [ ] Push a throwaway branch and open a PR: both jobs run **green**.
  - [ ] Break one verify check on purpose: the PR goes **red** and cannot merge.
  - [ ] Enable branch protection requiring both checks on `main`; the ticket stays open until you do.
  - [ ] No production secret exists in the repository's Actions secrets.

---

## Block 4.2: LLM Rate Limiting, Usage Logging and Spend Caps (MOM-73)

* **Objective & Scope:** Jira's scope: a durable per-user rate limit and a daily cap per user and overall; per-call token and latency records with no prompt or answer content, and a way to read them; a written decision on the SDK choice and on server-side fallbacks. Applies to both Claude call sites: `requestModelRebalance` and the MOM-35 plan generator.
* **Core Invariants to Protect:** *Service RLS*: the new `llm_usage_logs` table needs RLS and **explicit grants** (a signed-in user may read only their own rows; only server-only code scoped to a verified user id may write), plus a verify script. *Human-Only Completion*: governance code never touches tasks. A tripped limit must not silently substitute output: rebalance may fall back to the existing rule-based proposal, clearly labelled; the plan generator shows the limit message and offers the rule-based stub only as the user's explicit choice.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-73: harden the Claude calls with a durable rate limit, spend cap, usage logging and an SDK and fallback decision.

Task Instructions:
1. Read ticket MOM-73 in Jira first; its acceptance criteria are the definition of done. If it disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, lib/ai/rebalance.ts, lib/ai/taskPlan.ts, lib/services/tasks.ts (requestModelRebalance and its in-memory limit), lib/supabase/admin.ts, migrations 005 and 006 (how a server-only table is granted) and supabase/verify/005.
3. Create the feature branch `feature/MOM-73-llm-governance` off a clean `main`.
4. Design before coding: the llm_usage_logs table (user_id, feature, model, input_tokens, output_tokens, latency_ms, outcome, created_at; NO prompt or answer content), who can read and write it, how the durable per-user limit and the daily per-user and overall caps are computed from it, and the fallback behaviour for each call site. Wait for my OK.
5. Implement lib/services/llm.ts (server-only) wrapping both Claude call sites: check the limit and caps before calling, record usage after, and return a typed "limited" result. Apply the fallback rules exactly: rebalance may use the rule-based proposal, labelled; plan generation shows the message and offers the stub only as the user's explicit choice. Never silently substitute.
6. Write the next migration with RLS, explicit grants, and nothing for anon. Add supabase/verify/<n>_llm_usage_logs.sql: a user cannot read another user's rows, API roles cannot write directly, and the content columns do not exist.
7. STOP before production. Show me the migration and `npx supabase db push --dry-run`, wait for my go-ahead, then push and run ALL scripts in supabase/verify/; all must pass.
8. Write the SDK and fallback decision in docs (keep @anthropic-ai/sdk unless you find a reason; server-side fallbacks need a beta header, so do not enable them without testing against the real API, which needs my approval because it costs money).
9. Tests: the limit holds across simulated instances, the cap trips and falls back as specified, usage rows carry no content, and nothing in the path writes status or completed_at.
10. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass.
11. Update BACKLOG.md for MOM-73 and its three related items.
12. Commit with "feat(MOM-73): add durable rate limiting, usage logging and spend caps for LLM calls" and merge into main with --no-ff. Do not push.
13. Update MOM-73 in Jira: Done only if all three acceptance criteria are met.

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes; committed with the feat/fix(MOM-X) format; merged to main; Jira updated.
```

* **User Verification Gate:**
  - [ ] You approved the table design and the fallback rules before any migration was written.
  - [ ] The verify total is all passing.
  - [ ] After the push, two rapid "Ask Claude" clicks from two browser tabs: the second is refused. Ask the CLI for a **count-only** query showing usage rows exist and contain no text.

---

# FINAL DAY-END BUILD VERIFICATION & REMOTE PUSH

Run after the last block of the day. Stop on the first failure.

## A. Build and repository checks (PowerShell or Git Bash)

```bash
cd C:\Users\matth\momentum-app
git checkout main && git status --short            # clean (AGENTS.md may be untracked)
npx tsc --noEmit                                    # expect no output
npm test                                            # expect all passing (599+)
npm run build                                       # expect "Compiled successfully"
npm run plan                                        # expect "Every open item has a Jira key."
```

## B. Database verification (production), only if migrations were applied today

`npm test` does **not** run these. Every script must report `false 0` and a non-zero `true` count (0 and 0 means the script errored).

```bash
npx supabase migration list                         # local and remote columns must match for every migration
T=0; F=0
for f in supabase/verify/*.sql; do
  npx supabase db query --linked -f "$f" -o table > /tmp/v.txt 2>&1
  t=$(grep -cE '│ true ' /tmp/v.txt); fl=$(grep -cE '│ false ' /tmp/v.txt)
  echo "$(basename $f): true $t false $fl"; T=$((T+t)); F=$((F+fl))
done; echo "TOTAL true $T false $F"
npx supabase db query --linked -o table "select count(*) as users from auth.users"   # no leftover throwaway users
```

## C. Remote push and live check

```bash
git log origin/main..main --oneline                 # review exactly what will be published
git push origin main
npx vercel ls --prod                                # newest deployment must reach "Ready"
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://momentum-app-eight-chi.vercel.app/    # 307 to /login
curl -s -o /dev/null -w "%{http_code}\n" https://momentum-app-eight-chi.vercel.app/login               # 200
```

- [ ] Sign in on the live site and walk the flows you touched today.
- [ ] No test accounts or throwaway credentials remain.

## D. Automated End-of-Day Backlog, Obsolescence & Jira Sync (copy-paste)

```text
Perform end-of-day backlog synchronization, obsolescence audit, and ticket generation.

Task Instructions:
1. Scan BACKLOG.md, ROADMAP.md, code TODO tags and today's commits (`git log --since=midnight --no-merges`) for newly discovered gaps, TODOs or deferred items. Run `npm run plan` and treat every open item without a Jira key as un-ticketed.
2. Audit the "To Do" and "In Progress" tickets in Jira under the active Phase epic against the code on main:
   a. Read each candidate ticket's acceptance criteria and check them against the code and tests before judging. A ticket is obsolete, redundant or fully satisfied only if EVERY criterion is met or moot. Partly satisfied is not obsolete: add a comment saying what is done and what remains.
   b. Transition truly obsolete or redundant tickets to "Closed" with a brief comment explaining why; use "Done" only for delivered work.
   c. Annotate or remove the matching entries in BACKLOG.md (tick resolved items, re-key items pinned to closed tickets to the ticket that now owns the work).
   d. Check every epic in the MOM project, including the Phase 1 epics MOM-4 to MOM-7: if every child is Done or Closed, move the epic to Done with a comment listing its children. Leave an epic with any open child alone.
3. Confirm the active Phase Epic key and that every ticket created today is its child.
4. For each un-ticketed item found, group related items, then:
   a. Write the ticket in our format (Title, Summary, Technical Scope, Acceptance Criteria);
   b. Create it in Jira under the active Phase Epic (check for duplicates first; if a call times out, search before retrying);
   c. Add the new Jira key to the item in BACKLOG.md and to the ticket table.
5. Audit today's tickets: everything finished today must be Done in Jira; anything with unmet acceptance criteria must say so in a comment. Report any mismatch between a Jira ticket's real scope and its key in BACKLOG.md instead of guessing.
6. Create a feature branch (`feature/MOM-16-eod-backlog-sync`), commit BACKLOG.md (and ROADMAP.md if changed) with "chore(MOM-16): sync end-of-day backlog, prune obsolete tickets, and update Jira", merge into main with --no-ff. Do not push; the push is step E.

Definition of Done: tsc --noEmit passes; npm test passes; npm run plan reports every open item has a Jira key; merged to main.
```

## E. Day-End Master Plan Generator for Tomorrow (copy-paste)

```text
Audit the current repository state, BACKLOG.md, ROADMAP.md, and Jira board to generate our next Master Execution Plan.

Task Instructions:
1. Scan the codebase for remaining open items, deferred features, and active Jira tickets in "To Do" or "In Progress". Verify every file, route, provider and script a prompt names actually exists (or is created by an earlier block) before writing the prompt.
2. If new phase or follow-up tickets are needed, create them under the active Phase Epic in Jira and update BACKLOG.md with their keys.
3. Generate the complete "🚀 MOMENTUM BUILD: NEXT-PHASE MASTER EXECUTION PLAN" strictly following our established structure:
   - Metadata Header at the top: `> **Date:** YYYY-MM-DD | **Active Epic:** MOM-XX | **Base Commit:** <SHORT_HASH>`
   - Executive Overview & Architectural Invariants, and the Standing Rules (Jira first, production approval, verify scripts, no pushes inside blocks).
   - Logical Session Blocks grouping high-priority tickets, in dependency order.
   - Dynamic CLI Session Config (Sonnet / High for architecture, security and database work; Sonnet / Medium or Low for standard UI and tests).
   - Copy-pasteable prompts including tsc --noEmit, npm test, npm run build, feature branching, merging to main (--no-ff), BACKLOG.md and Jira updates.
   - User Verification Gates for each block.
   - Final Day-End Build Verification & Remote Push section.
4. Save the generated plan to `docs/plans/NEXT_BUILD_PLAN.md`.
5. Create a feature branch `feature/MOM-XX-next-build-plan-doc`, commit `docs/plans/NEXT_BUILD_PLAN.md` with "docs(MOM-XX): add generated next build plan" (MOM-XX is the active Phase Epic), merge to main (--no-ff). Do not push; the push is step F.
```

## F. Synchronize Remote Repository (PowerShell)

```powershell
git checkout main
git status
git push origin main
```

---

## Open Decisions and Risks (read before starting)

| Item | Why it matters |
| --- | --- |
| **Hevy API samples** | Block 3.2 cannot build the Hevy adapter honestly without Hevy's API docs or a redacted `/v1/workouts` response. The prompt stops without them. |
| **Docker** | Blocks 2.1 and 4.1 need Docker for a local Supabase stack, and the repo has no `supabase/config.toml` yet (Block 2.1 creates it with `supabase init`). Without Docker, the auth specs and the CI database job cannot be tested locally. |
| **MOM-35 migration** | Saving the goal and its week-1 tasks all-or-nothing needs a Postgres function, so Block 1.2 will stop for your approval of a migration. |
| **Google verification** | Calendar read-only is a sensitive scope. Testing mode (test users) is fine for you; wider use needs Google's app verification and a verified domain. |
| **MOM-19 touches every verify script** | The 91 checks currently rely on the signup seed. The prompt makes the CLI rewrite them first; review that diff. |
| **Not scheduled today, still recommended** | MOM-65 (revoke EXECUTE on `handle_new_user` and `rls_auto_enable`; low risk, since `handle_new_user` returns `trigger` and cannot be called directly. Block 1.4 comments on its outdated seed criterion), MOM-66 (table grants check), MOM-68 (`.env*` gitignore), MOM-74 (retire `HEVY_API_KEY`; delete it from Vercel Production afterwards). |
| **Direct pushes to `main`** | Today every change is merged and pushed to `main` by hand. After MOM-67 and branch protection are on, step C becomes a pull request. |
| **Model cost** | MOM-35's generator and MOM-47's rebalance call Claude Opus 5.5 per click; MOM-73 is what bounds that. Until it ships, do not invite real users. |
