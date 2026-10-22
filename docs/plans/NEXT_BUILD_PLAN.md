> **Date:** 2026-10-22 | **Active Epic:** MOM-16

# 🚀 MOMENTUM BUILD: NEXT-PHASE MASTER EXECUTION PLAN

*Generated 2026-10-22 from `main` @ `32ab616`. Jira: 46 open tickets under MOM-16, none In Progress. Verification baseline: `tsc` clean, 599 unit tests, 91 database checks, production live on Vercel.*

## Executive Overview

**Where we are.** Phase 2 is live: sign-in, rule-based and Claude-written rebalance proposals, full carry-over history, the ingestion engine, the server-only credential store, the database completion guard, a test runner, and CI-ready verify scripts. This plan covers what comes next, in order of dependency:

1. **Block 1: Production hardening.** Close two database privilege gaps found while verifying.
2. **Block 2: Repo hygiene.** Small cleanups that stop silent drift.
3. **Block 3: Quality gates.** CI plus browser and component tests, so every later block ships with a safety net.
4. **Block 4: Wizard persistence and a clean signup.** The product's core loop: a user creates a goal and gets real tasks.
5. **Block 5: Live integrations wiring.** The connect flows. Only after this does MOM-38 (adapters and webhooks) become buildable.
6. **Block 6: Plan correctness.** All-or-nothing rebalance apply and the velocity carry-in fix.

**Parked, with reasons:** MOM-38 (needs Hevy's API spec or real samples, plus Block 5), MOM-70 (secret encryption), MOM-71 to MOM-73 (ingestion and Claude follow-ups), and the remaining 25 or so velocity, rebalance, layout and schema tickets. `npm run plan` lists them all.

## Core Invariants to Protect

| Invariant | What it means here | How it is enforced today |
| --- | --- | --- |
| **Human-Only Completion** | Only the signed-in owner ever changes a task's `status` or `completed_at`. Ingestion, rebalancing and every model write nothing there, and nothing creates a task as `done`. | Trigger `micro_tasks_guard_completion` (migration 002) rejects any other caller; the rebalance and ingestion code has no write path to those columns; `tests/ingestion.test.ts` asserts it from the source; `supabase/verify/002`. |
| **No-Delete / Carry-Forward** | Unfinished work is never cut. The only moves are `carry_over` and `pull_forward`. Work that cannot fit is named in a `cannot_hold` warning and left alone. History is append-only. | `TaskRebalanceSchema` has no delete action; `apply_task_move` never deletes; `task_rebalance_history` has no write grant for API roles; `tests/rebalance-*.test.ts`. |
| **Service RLS** | The UI never queries Supabase. All access goes through `lib/services/`, scoped to the signed-in user by RLS. The service-role client lives only in server-only modules and is scoped to a user id the server verified. Secrets never reach the client. | `server-only` imports plus boundary tests; user-owned tables have RLS; **every new table or function needs explicit grants and RLS** (the MOM-37 lesson: this project grants nothing by default). |

## Standing Rules (apply to every prompt below; each prompt repeats what it needs)

- **Read the Jira ticket first.** If the title or scope disagrees with the prompt, stop and flag it (this is how we caught MOM-28 and MOM-35).
- **Production changes need your approval.** A prompt stops before `supabase db push`, `vercel env`, or any push to `origin`, shows what will happen, and waits for your go-ahead. Never use the SQL Editor.
- **After any database change,** re-run all verify scripts. Today that is 91 checks, plus whatever the ticket adds.
- **New migrations** continue the numbering (the next free number is 008; check `ls supabase/migrations`).

## Session Preflight (run before every block)

```bash
cd C:\Users\matth\momentum-app
git checkout main && git pull --ff-only && git status --short   # expect clean (AGENTS.md may be untracked)
npm run plan -- MOM-<n>                                          # optional: the generator's view of the ticket
```

---

# BLOCK 1: PRODUCTION HARDENING (database; needs your approval to apply)

## 1.1 MOM-65: Bug: revoke API-role EXECUTE on `handle_new_user` and `rls_auto_enable`

**Objective & Scope.** On production both functions grant EXECUTE to `authenticated`. They take no arguments and exist only to fire from triggers. Same class of drift as `seed_career_pivot` (MOM-60). Find out what `rls_auto_enable` is and who owns it (Supabase may install it), revoke from the API roles if safe, and add verify checks.

**Core Invariants to Protect.** *Service RLS* (privilege hygiene). Signup must still create the `users` row and seed the default goal, or every new account breaks.

**CLI Session Config.** Model: Sonnet 5.5 · Effort: High

**Exact Copy-Paste Prompt**
```text
Implement MOM-65: revoke API-role EXECUTE on handle_new_user and rls_auto_enable.

Task Instructions:
1. Read ticket MOM-65 in Jira first and use its acceptance criteria as the definition of done. If the ticket and these instructions disagree, stop and flag it.
2. Read CLAUDE.md, supabase/migrations/001 to 007 (especially how seed_career_pivot and its REVOKE were written) and supabase/verify/001_initial_schema.sql.
3. Create the feature branch `feature/MOM-65-revoke-trigger-function-execute` off a clean `main`.
4. Investigate read-only first: with `npx supabase db query --linked`, show me the owner, definition, arguments, and ACL of both functions, and what depends on them (triggers, event triggers). Report whether rls_auto_enable is installed by Supabase. Stop and tell me if revoking could break anything.
5. Write migration 008 that revokes EXECUTE on both functions from public, anon, authenticated and service_role (triggers fire without an EXECUTE grant). Do not edit applied migrations. Add supabase/verify/008_trigger_function_execute.sql: as a signed-in role and as anon, calling each function fails with 42501; signup still creates the users row and seeds the default goal.
6. Add a static check to tests/migrations.test.ts that migration 008 revokes both.
7. STOP before production. Show me the migration and `npx supabase db push --dry-run`, and wait for my go-ahead. Then run `npx supabase db push`, then every script in supabase/verify/ (currently 91 checks plus your new ones). All must pass.
8. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass.
9. Update BACKLOG.md: tick the item for MOM-65 and add anything new, each ending with its Jira key.
10. Commit with "fix(MOM-65): revoke API-role EXECUTE on handle_new_user and rls_auto_enable" and merge into main with --no-ff. Do not push.
11. Update MOM-65 in Jira: Done only if all acceptance criteria are met, with a comment listing what shipped and how it was verified; otherwise say what is unmet and leave it open. If it turns out obsolete, move it to Closed with a comment.

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes; committed with the feat/fix(MOM-X) format; merged to main; Jira updated.
```

**User Verification Gate.**
- [ ] Before approving the push, read the migration: only `REVOKE`, nothing else.
- [ ] After: the verify total is **all passing** (expect 91 + new).
- [ ] Production sign-up still works (ask the CLI to create and then delete a throwaway user via the Auth admin API, as in the MOM-47 smoke test).

## 1.2 MOM-66: Check that every public table has the grants its role needs; decide `service_role` access to `task_rebalance_history`

**Objective & Scope.** New tables here get no read/write for any API role by default, which broke `integration_credentials` until migration 006. Add a verify check that fails when a public table lacks the grants its role needs (with an allow-list for deliberately closed tables), and record a decision on whether no-session jobs may read `task_rebalance_history`.

**Core Invariants to Protect.** *Service RLS*; *No-Delete / Carry-Forward* (history stays append-only; any grant to `service_role` must be SELECT only).

**CLI Session Config.** Model: Sonnet 5.5 · Effort: High

**Exact Copy-Paste Prompt**
```text
Implement MOM-66: check that every public table has the grants its role needs, and decide service_role access to task_rebalance_history.

Task Instructions:
1. Read ticket MOM-66 in Jira first; its acceptance criteria are the definition of done. If it disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, migrations 003, 005, 006 (grants) and the BACKLOG.md items on grants.
3. Create the feature branch `feature/MOM-66-table-grants-check` off a clean `main`.
4. Query production read-only (`npx supabase db query --linked`) for the current grants on every public table and report them to me as a table: table, role, privileges.
5. Write supabase/verify/table_grants.sql: it lists public tables and fails (a row with passed = false) for any table with no grant for the role that must use it. Use an explicit allow-list for tables that are deliberately closed (task_rebalance_history for service_role, integration_credentials for anon and authenticated). Show that it FAILS on a throwaway table created with no grants (create it inside a transaction that you roll back), and that it passes on the real schema.
6. Recommend, with reasons, whether service_role should get SELECT on task_rebalance_history. Default recommendation: no, until a no-session job needs it. Record the decision in BACKLOG.md and docs/INTEGRATIONS_SPEC.md or docs/NINETY_DAY_PLAN_CONTEXT.md, whichever fits. Only add a grant if I approve, and then SELECT only, in a new migration.
7. Add tests/migrations.test.ts checks for anything you add. Run the script against production read-only (it creates nothing outside the rolled-back transaction) and tell me the result.
8. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass.
9. Update BACKLOG.md for MOM-66 (tick resolved items, add findings with Jira keys).
10. Commit with "feat(MOM-66): add a table grants check and record the service_role decision" and merge into main with --no-ff. Do not push. If a migration was added, stop for my approval before `supabase db push`, then run all verify scripts.
11. Update MOM-66 in Jira: Done only if every acceptance criterion is met (comment what shipped and how verified); otherwise leave it open and say what is unmet.

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes; committed with the type(MOM-X) format; merged to main; Jira updated.
```

**User Verification Gate.**
- [ ] The CLI showed the check **failing** on the throwaway table, then passing on the real schema.
- [ ] You agree with the recorded `task_rebalance_history` decision (default: keep closed).

---

# BLOCK 2: REPO HYGIENE (no production impact)

## 2.1 MOM-68: Narrow the `.gitignore` `.env*` pattern

**Objective & Scope.** `vercel link` added `.env*`, which also hides the tracked `.env.example`. Replace it with specific patterns so edits to `.env.example` show in `git status`.

**Core Invariants to Protect.** *Service RLS* (secrets stay server-only): `.env.local` and `.vercel` must remain ignored.

**CLI Session Config.** Model: Sonnet 5.5 · Effort: High

**Exact Copy-Paste Prompt**
```text
Implement MOM-68: narrow the .gitignore .env* pattern so .env.example edits show in git status.

Task Instructions:
1. Read ticket MOM-68 in Jira first; its acceptance criteria are the definition of done. If it disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md (Environment Files rule: `.env.local` must stay ignored) and .gitignore.
3. Create the feature branch `feature/MOM-68-narrow-env-gitignore` off a clean `main`.
4. Replace `.env*` with the specific patterns needed. `.env.local`, `.env*.local` and `.vercel` must stay ignored; `.env.example` must not be ignored. Do not weaken any existing secret pattern.
5. Prove it: `git check-ignore -v` for .env.example (must print nothing), .env.local, .env.production.local and .vercel (must be ignored). Show the output.
6. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass.
7. Update BACKLOG.md (tick the .gitignore item).
8. Commit with "chore(MOM-68): narrow the .env* gitignore pattern" and merge into main with --no-ff. Do not push.
9. Update MOM-68 in Jira: Done only if both acceptance criteria are met, with a comment showing the check-ignore output.

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes; committed with the type(MOM-X) format; merged to main; Jira updated.
```

**User Verification Gate.**
- [ ] `git check-ignore .env.example` prints nothing; `.env.local` and `.vercel` are still ignored.
- [ ] The diff touches only `.gitignore`, `BACKLOG.md`.

## 2.2 MOM-74: Retire the global `HEVY_API_KEY` env var and list the real server secrets

**Objective & Scope.** Hevy keys are per user, so the global variable is dead weight that `getServerEnv()` still demands. Remove it from the env schema, `.env.example` and the docs; list `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `CLAUDE.md`.

**Core Invariants to Protect.** *Service RLS* (secrets server-only; the env module must keep failing loudly, and without printing values, when a required secret is missing).

**CLI Session Config.** Model: Sonnet 5.5 · Effort: High

**Exact Copy-Paste Prompt**
```text
Implement MOM-74: retire the global HEVY_API_KEY env var and list the real server secrets.

Task Instructions:
1. Read ticket MOM-74 in Jira first; its acceptance criteria are the definition of done. If it disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, lib/config/env.ts, tests/env-and-admin.test.ts, .env.example and docs/INTEGRATIONS_SPEC.md section 3.A and section 5.
3. Create the feature branch `feature/MOM-74-retire-hevy-env-var` off a clean `main`.
4. Confirm by search that nothing reads HEVY_API_KEY or calls getServerEnv() outside tests and the env module. If something does, stop and tell me.
5. Remove HEVY_API_KEY from serverSchema/getServerEnv, .env.example, CLAUDE.md, ROADMAP.md and docs/INTEGRATIONS_SPEC.md (section 3.A: the Hevy key is per user, stored server-side in integration_credentials and sent as the `api-key` header). In CLAUDE.md list the server secrets that really exist, including GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. If code and docs disagree anywhere else, flag it rather than guessing.
6. Update tests/env-and-admin.test.ts and any test that sets the variable. Add a test that getServerEnv() succeeds without HEVY_API_KEY and still fails, naming the variable and never its value, when SUPABASE_SERVICE_ROLE_KEY or ANTHROPIC_API_KEY is missing.
7. Run `npx tsc --noEmit`, `npm test` and `npm run build` with HEVY_API_KEY unset; all must pass.
8. Update BACKLOG.md (tick the HEVY_API_KEY item).
9. Commit with "chore(MOM-74): retire the global HEVY_API_KEY and list the real server secrets" and merge into main with --no-ff. Do not push. Remind me that deleting HEVY_API_KEY from Vercel Production is my manual step after this deploys.
10. Update MOM-74 in Jira: Done only if all acceptance criteria are met; say that the Vercel cleanup is the owner's step.

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes; committed with the type(MOM-X) format; merged to main; Jira updated.
```

**User Verification Gate.**
- [ ] `grep -r HEVY_API_KEY` returns nothing in code or docs.
- [ ] After the deploy is live and you have confirmed it works, **delete `HEVY_API_KEY` from Vercel Production** (Project, Settings, Environment Variables).

---

# BLOCK 3: QUALITY GATES

## 3.1 MOM-67: Run the SQL verify scripts, type check, tests and build in CI

**Objective & Scope.** The database rules are checked only by scripts you run by hand against production. Add a CI workflow that runs the type check, tests and build on every push and pull request, and applies all migrations to a **disposable** database and runs every verify script.

**Core Invariants to Protect.** All three: this ticket exists to guard them. CI must **never** hold production credentials.

**CLI Session Config.** Model: Sonnet 5.5 · Effort: High

**Exact Copy-Paste Prompt**
```text
Implement MOM-67: run the SQL verify scripts, type check, tests and build in CI.

Task Instructions:
1. Read ticket MOM-67 in Jira first; its acceptance criteria are the definition of done. If it disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, package.json, every file in supabase/verify/ and supabase/migrations/, and how the scripts report results (a table with a `passed` column).
3. Create the feature branch `feature/MOM-67-ci-pipeline` off a clean `main`.
4. Add .github/workflows/ci.yml with two jobs. Job 1: install, `npx tsc --noEmit`, `npm test`, `npm run build` (use dummy NEXT_PUBLIC_SUPABASE_* values; no real secrets). Job 2: start a LOCAL Supabase stack (supabase/setup-cli plus `supabase start`), apply every migration, run every file in supabase/verify/ against the local database, and fail the job if any script returns a row with passed = false or errors. The job must never receive production credentials or the production project ref.
5. Make the verify runner a small script in scripts/ (not inline YAML) so it can be run locally too, with a test of its pass/fail parsing.
6. Verify what you can locally: run the verify runner against a local stack if Docker is available (tell me if it is not, and what you could not test). Do not push anything or create a pull request yet.
7. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass.
8. Update BACKLOG.md (tick the CI item, add anything new with Jira keys).
9. Commit with "feat(MOM-67): run type check, tests, build and SQL verify scripts in CI" and merge into main with --no-ff. Do not push. Tell me exactly which steps need me: pushing, opening a PR, and turning on branch protection in GitHub.
10. Update MOM-67 in Jira: leave it open until I confirm the workflow ran green on GitHub and a failing check blocks a merge; comment what is done and what is waiting on me.

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes; committed with the type(MOM-X) format; merged to main; Jira updated.
```

**User Verification Gate.**
- [ ] Push a throwaway branch and open a PR: both jobs run **green**.
- [ ] Break something on purpose (e.g. flip one expected value in a verify script): the PR goes **red** and cannot merge.
- [ ] In GitHub, enable branch protection requiring both checks on `main`. The ticket stays open until you have done this.
- [ ] Confirm no production secret exists in the repository's Actions secrets.

## 3.2 MOM-61: Set up Playwright E2E, hydration checks and component tests

**Objective & Scope.** `npm run test:e2e` with Playwright, a check that fails on any hydration error in the console at 390px and 1280px, and jsdom plus Testing Library for component tests. This unblocks the "still open" halves of MOM-55 to MOM-59.

**Core Invariants to Protect.** *Service RLS*: tests must never use production credentials or the real service-role key. *Human-Only Completion*: add component tests proving the UI offers no control that completes a task other than the owner's own toggle.

**CLI Session Config.** Model: Sonnet 5.5 · Effort: High

**Exact Copy-Paste Prompt**
```text
Implement MOM-61: set up Playwright E2E, hydration checks and component tests.

Task Instructions:
1. Read ticket MOM-61 in Jira first (its description is a bullet list, no acceptance section; treat the three bullets as the criteria). Also read the Jira tickets MOM-55 to MOM-59 and the BACKLOG.md "Tests" items. If anything disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, package.json, vitest.config.mts, tests/rebalance-drawer.test.tsx and components/.
3. Create the feature branch `feature/MOM-61-e2e-and-component-tests` off a clean `main`.
4. Component tests: add jsdom and Testing Library to Vitest (a separate environment for *.test.tsx files, keeping the node environment for the rest). Cover FocusTaskCard (carry-over marker, move-chain line, toggle error state), the risk badge at each level, and RebalanceDrawer including clicking "Ask Claude to review" with the server action mocked.
5. Playwright: install it, add `npm run test:e2e`, and write the hydration check: load /login at 390px and 1280px and fail on any console error or warning that mentions hydration. Authenticated pages need a user; do NOT point tests at production and do not use real secrets. Propose how to authenticate (for example a local Supabase stack) and implement what you can without credentials; list what is blocked.
6. Prove the hydration check can fail: temporarily introduce a hydration mismatch, show the test failing, then revert.
7. Keep `npm test` fast and independent of Playwright. Document both commands in CLAUDE.md's Definition of Done only if I approve the wording.
8. Run `npx tsc --noEmit`, `npm test`, `npm run test:e2e` and `npm run build`; all must pass.
9. Update BACKLOG.md. Comment on Jira tickets MOM-55 to MOM-59 saying which of their remaining criteria are now covered; close none unless every criterion is covered (if one is obsolete or redundant, move it to Closed with a reason).
10. Commit with "test(MOM-61): add Playwright hydration checks and component tests" and merge into main with --no-ff. Do not push.
11. Update MOM-61 in Jira: Done only if all three bullets are met; otherwise say what is blocked and leave it open.

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes; committed with the type(MOM-X) format; merged to main; Jira updated.
```

**User Verification Gate.**
- [ ] `npm test` and `npm run test:e2e` both pass locally from a clean checkout.
- [ ] You watched the hydration test **fail** on the deliberately broken page.
- [ ] The CLI listed which authenticated flows are still blocked and why.

---

# BLOCK 4: WIZARD PERSISTENCE AND A CLEAN SIGNUP (the core loop)

*Order matters: 4.1 then 4.2 then 4.3 then 4.4. The seed must not be removed (4.4) until a new user can build a plan (4.2) and sees a sensible empty state (4.3).*

## 4.1 MOM-34: Persist wizard goal type, constraints and pace

**Objective & Scope.** The wizard's three answers are collected, shape the preview, and are then thrown away. Store them with the goal (a `goal_type` column and a `preferences` jsonb) and fill the goal's `criteria` from the wizard where it collects them.

**Core Invariants to Protect.** *Service RLS* (the new columns live on an RLS-protected table; writes only through `lib/services/goals.ts`). *Human-Only Completion*: initial `criteria` items start with `done: false`; the wizard never ticks one.

**CLI Session Config.** Model: Sonnet 5.5 · Effort: High

**Exact Copy-Paste Prompt**
```text
Implement MOM-34: persist wizard goal type, constraints and pace.

Task Instructions:
1. Read ticket MOM-34 in Jira first; its acceptance criteria are the definition of done. If it disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, docs/NINETY_DAY_PLAN_CONTEXT.md, lib/goals/taskPlan.ts, lib/goals/vocabulary.ts, lib/services/goals.ts, components/goals/GoalBuilderWizard.tsx and types/database.types.ts.
3. Create the feature branch `feature/MOM-34-persist-wizard-answers` off a clean `main`.
4. Design before coding: tell me the columns you propose (goal_type with a CHECK list that matches the TypeScript GOAL_TYPES, preferences jsonb with a shape check) and how existing rows (the seeded Career Pivot goal) are treated (nullable / default). Wait for my OK on the design.
5. Write the next migration (check `ls supabase/migrations`) and update types/database.types.ts, the wizard input schema and createGoalChannel so the three answers persist and reload with the goal. Initial criteria come from the wizard where it collects them, all with done: false.
6. Add tests (service, schema, types) and supabase/verify/<n>_goal_preferences.sql: RLS still isolates users, the CHECK rejects an unknown goal_type, and criteria cannot arrive ticked from the wizard path.
7. STOP before production. Show the migration and `npx supabase db push --dry-run`, wait for my go-ahead, then push and run ALL verify scripts (currently 91 checks plus yours); all must pass.
8. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass.
9. Update BACKLOG.md for MOM-34 (tick resolved items, add findings with Jira keys).
10. Commit with "feat(MOM-34): persist wizard goal type, constraints and pace" and merge into main with --no-ff. Do not push.
11. Update MOM-34 in Jira: Done only if both acceptance criteria are met (comment what shipped and how verified); otherwise say what is unmet.

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes; committed with the type(MOM-X) format; merged to main; Jira updated.
```

**User Verification Gate.**
- [ ] You approved the column design before any migration was written.
- [ ] Create a goal in the wizard on the live site (after the push): reopen it, and the three answers are there.
- [ ] Verify total is all passing.

## 4.2 MOM-35: Persist the wizard week 1 plan and replace the stub generator with Claude  *(High priority)*

**Objective & Scope.** Confirming the wizard must write the week-1 tasks, owned by the user, all unfinished. Replace `buildStubTaskPlan` with a Claude generator whose output must pass `parseTaskPlan` unchanged, with a user-visible retry on invalid output. Fire the model only from the user's confirm click.

**Core Invariants to Protect.** *Human-Only Completion*: no task is ever created `done` (the schema has no status field, and the DB trigger refuses a non-owner). *Service RLS*: tasks are inserted through the user's session, `user_id` from the verified session, channel owned by the user. *No-Delete*: a retry creates nothing partial; a plan is written all at once or not at all.

**CLI Session Config.** Model: Sonnet 5.5 · Effort: High

**Exact Copy-Paste Prompt**
```text
Implement MOM-35: persist the wizard week 1 plan and replace the stub generator with Claude.

Task Instructions:
1. Read ticket MOM-35 in Jira first; its acceptance criteria are the definition of done. NOTE: the ticket says "Vercel AI SDK"; this repo standardised on the official @anthropic-ai/sdk in lib/ai/rebalance.ts (CLAUDE.md allows "Claude API / Vercel AI SDK"). Follow lib/ai/rebalance.ts and say so; do not add a second SDK. If anything else disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, PRODUCT_STRATEGY.md section 4, docs/NINETY_DAY_PLAN_CONTEXT.md, lib/goals/taskPlan.ts, lib/ai/rebalance.ts, tests/rebalance-ai.test.ts and tests/rebalance-model.test.ts, lib/services/tasks.ts and components/goals/GoalBuilderWizard.tsx. MOM-34 should already be merged; if not, stop and tell me.
3. Create the feature branch `feature/MOM-35-wizard-week-one-plan` off a clean `main`.
4. Persist: add a service function in lib/services/tasks.ts that inserts the validated week-1 plan for the signed-in user in ONE database call (all tasks or none), status 'todo', week_of 1, in a goal channel the user owns. Confirm the wizard flow creates the goal and its tasks together, or fail with no partial data. Use the user's session client (RLS), never the service role.
5. Generate: add a server-only module lib/ai/taskPlan.ts modelled on lib/ai/rebalance.ts: official SDK, claude-opus-5-5, structured output, raw JSON through parseTaskPlan() unchanged, no `thinking` setting, no forced tool_choice, fixed system prompt, a rate limit like requestModelRebalance. Fire it only from the wizard's confirm/generate click, never on load. The model sees only what the user typed into the wizard; tell the user that on screen.
6. Invalid or refused model output must be rejected with a user-visible message and a retry button; the rule-based stub (buildStubTaskPlan) may remain as an explicit fallback only if the user chooses it. Never silently substitute.
7. Tests: mocked model (valid; schema-invalid; a plan trying status 'done'; unknown task type; week 14; empty plan; refusal; API errors), the persist function (all-or-nothing, every row todo, owned by the session user, RLS-off still scoped), and a source-level test that nothing in the plan path writes status or completed_at. Add a boundary test that no component imports the new AI module.
8. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass. Check the build output contains no key or prompt text.
9. No database migration is expected. If you find one is needed, stop and ask me before writing it.
10. Update BACKLOG.md for MOM-35 (tick resolved items, add findings with Jira keys).
11. Commit with "feat(MOM-35): persist the wizard week 1 plan and generate it with Claude" and merge into main with --no-ff. Do not push.
12. Update MOM-35 in Jira: Done only if all three acceptance criteria are met; say clearly that the live model call is unverified until I run the smoke test, and leave the ticket open until I confirm it.

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes; committed with the type(MOM-X) format; merged to main; Jira updated.
```

**User Verification Gate.** *(after the push and deploy)*
- [ ] On the live site, create a new goal: its week-1 tasks appear, **none ticked**, and they belong to your account.
- [ ] The drawer/wizard shows that Claude wrote the plan; a forced failure (ask the CLI for a way to trigger one in a test account) shows the error and a retry.
- [ ] Ask the CLI to create and later delete a throwaway user for this smoke test, as for MOM-47.
- [ ] Only then close MOM-35 in Jira.

## 4.3 MOM-18: Distinguish signed-out, no-tasks and all-done empty states

**Objective & Scope.** Replace the placeholder in `MainFeed` (and its `TODO(MOM-Phase2)`) with three real states driven by a discriminated result from the focus-task service: signed out (sign-in prompt), zero tasks (link to the wizard), everything done (completion state).

**Core Invariants to Protect.** *Human-Only Completion*: the "all done" state is derived from the user's own ticks, never set by the system. *Service RLS*: the UI receives a typed result from the service; no Supabase call in a component.

**CLI Session Config.** Model: Sonnet 5.5 · Effort: High

**Exact Copy-Paste Prompt**
```text
Implement MOM-18: distinguish signed-out, no-tasks and all-done empty states in MainFeed.

Task Instructions:
1. Read ticket MOM-18 in Jira first; its acceptance criteria are the definition of done. If it disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, components/layout/MainFeed.tsx, app/page.tsx, lib/services/tasks.ts (getFocusTask) and components/tasks/. Sign-in (MOM-17) is done.
3. Create the feature branch `feature/MOM-18-empty-states` off a clean `main`.
4. Make getFocusTask return a discriminated result (signed_out | empty | all_done | task) computed in the service, not inferred by the UI. Add three typed empty-state components under components/tasks (props interfaces exported, no inline Supabase). Remove the TODO(MOM-Phase2) comment in MainFeed.
5. "Empty" links to the goal wizard; "all done" shows a completion state; "signed out" shows a sign-in call to action. The all-done state is read from the user's own ticks only.
6. Tests: service result for each case (RLS-scoped, another user's tasks do not count), and render tests for each component (renderToStaticMarkup is fine; add Testing Library tests if MOM-61 is merged).
7. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass.
8. Update BACKLOG.md for MOM-18 (tick resolved items).
9. Commit with "feat(MOM-18): distinguish signed-out, no-tasks and all-done empty states" and merge into main with --no-ff. Do not push.
10. Update MOM-18 in Jira: Done only if all four acceptance criteria are met.

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes; committed with the type(MOM-X) format; merged to main; Jira updated.
```

**User Verification Gate.**
- [ ] On the live site: signed out shows the sign-in prompt; a fresh account with no tasks shows the wizard link; an account with every task ticked shows the completion state.

## 4.4 MOM-19: Remove the Career Pivot seed from new-account signup  *(touches signup and every verify script)*

**Objective & Scope.** A new account should start empty and use the wizard. Drop the `seed_career_pivot()` call from `handle_new_user()` in a **new** migration. Existing accounts keep their data.

**Core Invariants to Protect.** *Service RLS*: `handle_new_user` stays SECURITY DEFINER with `search_path` pinned and EXECUTE closed to API roles (see MOM-65). *No-Delete*: nothing deletes existing users' goals or tasks. **Hazard:** verify scripts 001, 002, 003, 004 and 007 rely on the signup seed to create their fixtures; they must be rewritten to build their own.

**CLI Session Config.** Model: Sonnet 5.5 · Effort: High

**Exact Copy-Paste Prompt**
```text
Implement MOM-19: remove the Career Pivot seed from new-account signup.

Task Instructions:
1. Read ticket MOM-19 in Jira first; its acceptance criteria are the definition of done. MOM-34, MOM-35 and MOM-18 should already be merged so a new user can build a plan and sees a wizard link; if they are not, stop and tell me. If the ticket disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, docs/NINETY_DAY_PLAN_CONTEXT.md (seed data section; if the docs say the seed is required, flag it), migration 001 sections on seed_career_pivot and handle_new_user, migrations 002 to 007, and every file in supabase/verify/.
3. Create the feature branch `feature/MOM-19-remove-signup-seed` off a clean `main`.
4. Inventory first: list every verify script and unit test that depends on the seeded Career Pivot channel or its 11 tasks (several verify scripts do). Show me the list.
5. Write a NEW migration (never edit an applied one) that replaces handle_new_user() without the seed call, keeping security definer, search_path = '' and closed EXECUTE grants. Keep seed_career_pivot() itself for dev seeding, still not executable by API roles. Do not touch existing users' rows.
6. Rewrite the dependent verify scripts so each creates its own fixtures as postgres (a goal channel and tasks), rather than relying on signup. All existing checks must still be present and pass (91 today); add checks that a fresh signup has zero goal channels and zero tasks, and that a wizard-created goal can use the key career_pivot (no _2 suffix).
7. STOP before production. Show me the migration, the diff of every verify script, and `npx supabase db push --dry-run`. Wait for my go-ahead, then push and run ALL verify scripts; all must pass.
8. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass.
9. Update BACKLOG.md for MOM-19 and any seed-related items.
10. Commit with "feat(MOM-19): remove the Career Pivot seed from new-account signup" and merge into main with --no-ff. Do not push.
11. Update MOM-19 in Jira: Done only if all three acceptance criteria are met.

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes; committed with the type(MOM-X) format; merged to main; Jira updated.
```

**User Verification Gate.**
- [ ] You reviewed the verify-script diff: the same checks, now with explicit fixtures.
- [ ] After the push: verify total is all passing; a fresh production signup (CLI creates and deletes a throwaway user) has **zero** goals and tasks, and the wizard flow then produces a goal with the key `career_pivot`.
- [ ] Your existing production account still has its data.

---

# BLOCK 5: LIVE INTEGRATIONS WIRING

**User prerequisites (you, before this block):**
1. Create a Google Cloud OAuth client (Web application) with the Calendar read-only scope. Redirect URI: `https://momentum-app-eight-chi.vercel.app/api/auth/callback/google`, plus `http://localhost:3000/api/auth/callback/google` for local use. While the app is in Testing mode, add yourself as a test user.
2. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Vercel **Production** (and local `.env.local` for testing).
3. Have a real **Hevy API key** ready (needs Hevy Pro).

## 5.1 MOM-62: Build the Google OAuth consent flow and Hevy API key UI forms

**Objective & Scope.** The consent redirect and callback route `/api/auth/callback/google`, a Hevy key form, and connect/disconnect buttons wired to `lib/services/integrations.ts`. Token storage, retrieval and refresh already exist (MOM-37).

**Core Invariants to Protect.** *Service RLS / secrets*: no token, key or client secret ever reaches the browser (only `IntegrationAccount` does); the callback requires a verified session and takes the user id from it, never from the request; `state` is checked. *Human-Only Completion*: connecting an app does not create or complete tasks.

**CLI Session Config.** Model: Sonnet 5.5 · Effort: High

**Exact Copy-Paste Prompt**
```text
Implement MOM-62: build the Google OAuth consent flow and Hevy API key UI forms.

Task Instructions:
1. Read ticket MOM-62 in Jira first (the description is a bullet list; treat each bullet as a criterion). If anything disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, docs/INTEGRATIONS_SPEC.md (sections 3.C and 5), lib/services/integrations.ts (saveApiKey, saveOAuthTokens, disconnectIntegration, listIntegrationAccounts), types/integrations.ts, components/integrations/, app/actions/integrations.ts and lib/supabase/proxy.ts. Confirm that GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set locally (names only; never print values) or tell me what is missing.
3. Create the feature branch `feature/MOM-62-connect-flows` off a clean `main`.
4. Google: a route that starts the consent redirect (state and PKCE stored in an httpOnly, short-lived cookie, minimal scope calendar.readonly, access_type=offline) and the callback at app/api/auth/callback/google/route.ts that requires a signed-in session, verifies state, exchanges the code server-side, validates the response, and calls saveOAuthTokens(). The callback is an authenticated route: do NOT add it to PUBLIC_PATHS. Handle denial, bad state, and exchange failure with a friendly message and no token or provider text in URLs or logs.
5. Hevy: a form (Server Action) that calls saveApiKey(); the key is never echoed back or stored client-side.
6. UI: connect and disconnect buttons on each card from listIntegrationAccounts() (IntegrationAccount only), including a "needs reconnect" state for status needs_reauth.
7. Remove the TODO(MOM-Phase2) comment about the connect flow.
8. Tests: state mismatch, missing session, exchange failure, denial, no token or secret in any returned value, and a boundary test that no component imports the Google exchange code. Mock the network.
9. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass. Confirm the client output contains no secret names or values.
10. Update BACKLOG.md for MOM-62 (tick resolved items, add findings with Jira keys).
11. Commit with "feat(MOM-62): build the Google consent flow and Hevy key forms" and merge into main with --no-ff. Do not push.
12. Update MOM-62 in Jira: leave it open until I confirm both connections work live; comment what shipped and what I must test.

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes; committed with the type(MOM-X) format; merged to main; Jira updated.
```

**User Verification Gate.** *(after the push and deploy)*
- [ ] Connect Google Calendar with your real account: the card shows connected; revoke access in your Google account settings, then trigger a refresh path and confirm the card shows "needs reconnect".
- [ ] Connect Hevy with your real key; disconnect; confirm the credential row is gone (ask the CLI for a count query only, never to print secrets).
- [ ] Open the browser dev tools Network tab during connect: no token, key or client secret appears in any response.

## 5.2 MOM-41: Bug: connecting an app creates a `connected_apps` row with no goal channel or credentials

**Objective & Scope.** An app must not read "active" until it can sync. Map each provider to a goal channel, require it at connect time, and show "needs setup" otherwise.

**Core Invariants to Protect.** *Service RLS*: the same-owner foreign key from `connected_apps` to `goal_channels` stays. *Human-Only Completion*: nothing here touches tasks.

**CLI Session Config.** Model: Sonnet 5.5 · Effort: High

**Exact Copy-Paste Prompt**
```text
Implement MOM-41: an app must not be active until it has a goal channel and valid credentials.

Task Instructions:
1. Read ticket MOM-41 in Jira first; its acceptance criteria are the definition of done. MOM-62 should already be merged; if not, stop and tell me. If the ticket disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, docs/INTEGRATIONS_SPEC.md (target channels per provider), lib/services/integrations.ts (ensureConnectedApp, setConnectedAppActive, listIntegrationAccounts), lib/services/ingestion.ts (how targetGoalChannel is matched) and the connected_apps table in migration 001.
3. Create the feature branch `feature/MOM-41-connect-needs-setup` off a clean `main`.
4. Propose the provider-to-channel mapping (spec: Hevy to physical_fitness, Google Calendar to career_pivot) and what happens when the user has no such goal. Wait for my OK on the design.
5. Implement it in the service layer: connecting requires or creates the mapping (goal_channel_id set), an app is reported active only when it has a channel AND a connected credential, and the UI shows "needs setup" otherwise. If a migration is needed, STOP and ask before writing it.
6. Tests for each state (no channel, no credential, both, credential needs_reauth), RLS scoping, and that toggling never creates credentials or tasks.
7. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass.
8. Update BACKLOG.md for MOM-41.
9. Commit with "fix(MOM-41): require a goal channel before an app is active" and merge into main with --no-ff. Do not push.
10. Update MOM-41 in Jira: Done only if both acceptance criteria are met.

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes; committed with the type(MOM-X) format; merged to main; Jira updated.
```

**User Verification Gate.**
- [ ] You approved the mapping design first.
- [ ] On the live site, a connected app without a matching goal shows "needs setup", not "active".

> **After Block 5:** MOM-38 (adapters and webhooks) becomes buildable. It still needs **Hevy's real API spec or a redacted `/v1/workouts` response**, which I could not fetch. Run `npm run plan -- MOM-38` when you are ready, and bring those samples to that session.

---

# BLOCK 6: PLAN CORRECTNESS

## 6.1 MOM-49: Make `applyRebalance` atomic via a Postgres function

**Objective & Scope.** Today each move is atomic with its history row, but the set of moves is not: a failing move leaves earlier ones applied. Move the whole apply into one function that applies all moves or none, keeping every re-check, and make the drawer report one clear result.

**Core Invariants to Protect.** *No-Delete / Carry-Forward*: only `week_of`, the move markers and `due_date` change; the function never deletes; history rows are written with every move. *Human-Only Completion*: no `status` or `completed_at` write. *Service RLS*: closed EXECUTE (only signed-in users), acts for `auth.uid()` only, explicit grants.

**CLI Session Config.** Model: Sonnet 5.5 · Effort: High

**Exact Copy-Paste Prompt**
```text
Implement MOM-49: make applyRebalance atomic via a Postgres function.

Task Instructions:
1. Read ticket MOM-49 in Jira first; its acceptance criteria are the definition of done. If it disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, docs/NINETY_DAY_PLAN_CONTEXT.md section 5, migration 003 (apply_task_move and its grants), lib/services/tasks.ts (applyRebalance), types/rebalance.ts, components/rebalance/RebalanceDrawer.tsx, tests/tasks-service.test.ts and tests/helpers/fakeSupabase.ts (the fake mirrors apply_task_move).
3. Create the feature branch `feature/MOM-49-atomic-rebalance-apply` off a clean `main`.
4. Design before coding: a function that takes the whole set of moves and applies all or none, reusing apply_task_move's checks (own task, still todo, still in fromWeek, direction and week constraints) and writing every history row in the same transaction. Decide and tell me what a stale task does now: reject the whole apply with one clear message so the user re-requests a fresh proposal (this changes today's skip-and-continue behaviour). Wait for my OK.
5. Write the next migration (SECURITY DEFINER, search_path = '', auth.uid() only, EXECUTE revoked from public, anon, service_role and granted to authenticated only; never touch status or completed_at; never delete). Update the service to pass the whole proposal in one call, the drawer to show success or one failure, the Database types, and the fake in tests/helpers/fakeSupabase.ts to mirror the new function.
6. Tests: one failing move rolls back every move and writes no history; stale, done and foreign tasks are rejected; success writes every move and history row; a source-level check that the function text has no delete and no status assignment. Add supabase/verify/<n>_atomic_rebalance.sql covering the same against the real database.
7. STOP before production. Show me the migration and `npx supabase db push --dry-run`, wait for my go-ahead, then push and run ALL verify scripts; all must pass.
8. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass.
9. Update BACKLOG.md for MOM-49 and the related atomicity item.
10. Commit with "feat(MOM-49): apply a rebalance proposal all-or-nothing in one function" and merge into main with --no-ff. Do not push.
11. Update MOM-49 in Jira: Done only if all three acceptance criteria are met.

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes; committed with the type(MOM-X) format; merged to main; Jira updated.
```

**User Verification Gate.**
- [ ] You approved the stale-task behaviour change.
- [ ] Verify total is all passing.
- [ ] On the live site (a test account with tasks behind): Apply moves every selected task; applying the same proposal twice reports a single clear failure and changes nothing.

## 6.2 MOM-69: Count velocity carry-in and carry pressure from `task_rebalance_history`

**Objective & Scope.** After MOM-22, carry-out uses the whole move chain, but carry-in and burnout pressure still read the one-hop marker. Count arrivals from the history. Pure TypeScript, no production impact.

**Core Invariants to Protect.** *Human-Only Completion*: velocity is computed from the user's own ticks and carry-over, never from hours or system actions; the functions stay pure and write nothing. *No-Delete / Carry-Forward*: the history is read, never changed.

**CLI Session Config.** Model: Sonnet 5.5 · Effort: High

**Exact Copy-Paste Prompt**
```text
Implement MOM-69: count velocity carry-in and carry pressure from task_rebalance_history.

Task Instructions:
1. Read ticket MOM-69 in Jira first; its acceptance criteria are the definition of done. If it disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, docs/NINETY_DAY_PLAN_CONTEXT.md section 10, lib/utils/velocity.ts and tests/velocity.test.ts (especially the "carry-out from the move history" cases).
3. Create the feature branch `feature/MOM-69-velocity-carry-in-history` off a clean `main`.
4. Design the arrival rule and the pressure denominator (tasks currently in the week plus tasks that arrived and left) and tell me the exact definition and one worked example before coding. Wait for my OK.
5. Implement in lib/utils/velocity.ts. Keep it pure: no Supabase, no clock. A task carried 2 to 3 to 5 counts as arriving in weeks 3 and 5. Where history and the one-hop marker agree, existing results must not change; keep the marker as a fallback when history is missing, de-duplicated by task id.
6. Tests: the chain case, a task pulled back, a done task, no history (falls back), and every existing velocity test still passing unchanged.
7. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass. No migration and no production change is needed; stop and ask if you think one is.
8. Update BACKLOG.md for MOM-69 and the velocity items it affects.
9. Commit with "feat(MOM-69): count velocity carry-in from the move history" and merge into main with --no-ff. Do not push.
10. Update MOM-69 in Jira: Done only if all three acceptance criteria are met.

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes; committed with the type(MOM-X) format; merged to main; Jira updated.
```

**User Verification Gate.**
- [ ] You approved the arrival rule and the worked example.
- [ ] The existing velocity tests pass unchanged (the CLI should say so explicitly).

---

# FINAL DAY-END BUILD VERIFICATION & REMOTE PUSH

Run after the last block of the day. Stop on the first failure.

## A. Build and repository checks

```bash
cd C:\Users\matth\momentum-app
git checkout main && git status --short            # clean (AGENTS.md may be untracked)
npx tsc --noEmit                                    # expect no output
npm test                                            # expect all passing (599+)
npm run build                                       # expect "Compiled successfully"
npm run plan                                        # expect "Every open item has a Jira key."
```

## B. Database verification (production) — only if migrations were applied today

```bash
npx supabase migration list                         # local and remote columns must match for every migration
S=/tmp; T=0; F=0
for f in supabase/verify/*.sql; do
  npx supabase db query --linked -f "$f" -o table > "$S/v.txt" 2>&1
  t=$(grep -cE '│ true ' "$S/v.txt"); fl=$(grep -cE '│ false ' "$S/v.txt")
  echo "$(basename $f): true $t false $fl"; T=$((T+t)); F=$((F+fl))
done; echo "TOTAL true $T false $F"                 # false must be 0; a script with 0 true AND 0 false errored
npx supabase db query --linked -o table "select (select count(*) from auth.users) users"   # no leftover test users
```

## C. Remote push and live check

```bash
git log origin/main..main --oneline                 # review exactly what will be published
git push origin main
npx vercel ls --prod                                # newest deployment must reach "Ready"
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://momentum-app-eight-chi.vercel.app/            # 307 to /login
curl -s -o /dev/null -w "%{http_code}\n" https://momentum-app-eight-chi.vercel.app/login                       # 200
```

- [ ] Sign in on the live site and walk the flows you touched today.
- [ ] Check that no test accounts or throwaway credentials remain.

## D. Automated End-of-Day Backlog, Obsolescence & Jira Sync (copy-paste)

```text
Perform end-of-day backlog synchronization, obsolescence audit, and ticket generation.

Task Instructions:
1. Scan BACKLOG.md, ROADMAP.md, code TODO tags and today's commits (`git log --since=midnight --no-merges`) for newly discovered gaps, TODOs or deferred items. Run `npm run plan` and treat every open item without a Jira key as un-ticketed.
2. Audit the "To Do" and "In Progress" tickets in Jira under the active Phase epic (currently MOM-16) against the code on main:
   a. Read each candidate ticket's acceptance criteria and check them against the code and tests before judging. A ticket is obsolete, redundant or fully satisfied only if EVERY criterion is met or moot. Partly satisfied is not obsolete: add a comment saying what is done and what remains.
   b. Transition truly obsolete or redundant tickets to "Closed" with a brief comment explaining why; use "Done" only for delivered work.
   c. Annotate or remove the matching entries in BACKLOG.md (tick resolved items, re-key items pinned to closed tickets to the ticket that now owns the work).
3. Confirm the active Phase Epic key (MOM-16 for Phase 2) and that every ticket created today is its child.
4. For each un-ticketed item found, group related items, then:
   a. write the ticket in our format (Title, Summary, Technical Scope, Acceptance Criteria);
   b. create it in Jira under the active Phase Epic (check for duplicates first; if a call times out, search before retrying);
   c. add the new Jira key to the item in BACKLOG.md and to the ticket table.
5. Audit today's tickets: everything finished today must be Done in Jira; anything with unmet acceptance criteria must say so in a comment. Report any mismatch between a Jira ticket's real scope and its key in BACKLOG.md instead of guessing.
6. Create a feature branch (`feature/MOM-16-eod-backlog-sync`), commit BACKLOG.md (and ROADMAP.md if changed) with "chore: sync end-of-day backlog, prune obsolete tickets, and update Jira", merge into main with --no-ff, and push to origin/main.

Definition of Done: tsc --noEmit passes; npm test passes; npm run plan reports every open item has a Jira key; merged to main; pushed.
```

---

## Open Decisions and Risks (read before starting)

| Item | Why it matters |
| --- | --- |
| **Hevy API samples** | MOM-38 cannot be built honestly without Hevy's real API docs or a redacted `/v1/workouts` response; the public docs site did not render for me. |
| **Google verification** | Calendar read-only is a sensitive scope. Testing mode (test users) is fine for you; wider use needs Google's app verification and a verified domain. |
| **MOM-19 touches every verify script** | The 91 database checks currently rely on the signup seed. The prompt makes the CLI rewrite them first; do not skip that review. |
| **Direct pushes to `main`** | Today every change is merged and pushed to `main` by hand. MOM-67 introduces CI; once branch protection is on, the push step in each block becomes a pull request. |
| **Model cost** | "Ask Claude" (MOM-47) and the new plan generator (MOM-35) call Claude Opus 5.5 per click. MOM-73 (durable rate limit, spend cap, usage logging) is parked but should come before real users do. |
