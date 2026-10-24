# 🚀 MOMENTUM BUILD: NEXT-PHASE MASTER EXECUTION PLAN

> **Date:** 2026-10-24 | **Active Epic:** MOM-16 | **Base Commit:** 80b0503
>
> **Since the 2026-10-23 plan:** every block of that plan merged through pull requests: MOM-18, MOM-19, MOM-76, MOM-77, MOM-61, MOM-62, MOM-67 and MOM-73 are Done; MOM-38's adapters and session-less ingestion merged but the ticket stays open for the webhook routes (now MOM-98); MOM-75 is In Review until a real `/day-end` has completed (this one was the first). `main` is protected (`checks` and `database` must be green). New tickets from the day-end sync: **MOM-98** (webhook endpoints), **MOM-99** (adapter follow-ups), **MOM-100** (CI hardening), **MOM-101** (LLM usage follow-ups), **MOM-102** (privacy approach) and **MOM-103** (Connected Apps status failure); none is scheduled today except MOM-101, MOM-102 and MOM-103. Production verification is now **231 checks across 9 scripts** in `supabase/verify/`; the next free migration number is **012**; `npm test` runs 1752 tests; production holds exactly one user (the standing smoke-test account).

---

## Today's runbook

**How to run a day.** Type `/day-start` first: it only reads and reports. Then type the command in the table below for each block, in this order, and skip any block whose Jira ticket is already Done. Each command first shows the block's model and effort: if your session differs, it stops and tells you the exact `/model` and `/effort` to type (use the session-only choice in the `/effort` slider, so your saved default is left alone), and you start the command again. When the last block is done, type `/day-end`. Nothing is pushed, merged or applied to production without your explicit OK, and work reaches `main` only through a pull request once both CI jobs are green.

| # | Type | Session setting | What to check at the gate |
| --- | --- | --- | --- |
| 1 | `/run-block MOM-68` | Sonnet / Low | `git check-ignore .env.example` prints nothing while `.env.local` and `.vercel` are still ignored; you answered the question about `AGENTS.md`; the new test passes. |
| 2 | `/run-block MOM-65` | Sonnet / High | You read the findings about both functions before the migration was written; a signed-in role gets "permission denied" calling either; a real sign-up on the local stack still creates the user row; the CLI showed the migration and the dry run and did not push. |
| 3 | `/run-block MOM-66` | Sonnet / High | The new grants check passes on the real tables and you saw it fail on a throwaway table made by hand on the local stack only; the decision about `task_rebalance_history` is written down and nothing was granted without your OK. |
| 4 | `/run-block MOM-93` | Sonnet / Medium | When the plan cannot be read, the home page says so and offers Try again, with no goal wizard prompt; a user with no goals still sees the no-goals state. |
| 5 | `/run-block MOM-103` | Sonnet / Medium | With connection status unreadable, Connected Apps says so and offers Try again and shows none of the old switch-only cards; the desktop side panel is untouched. |
| 6 | `/run-block MOM-57` | Sonnet / Low | The new tests cover refusals and success for turning an app on or off, and the mock payloads are checked against the contract; no app code changed unless a test found a bug and you were told. |
| 7 | `/run-block MOM-45` | Sonnet / High | You chose where the time zone lives before any migration was written; a unit test shows a Los Angeles user still in the old week at 23:30 local while UTC has rolled over; the CLI showed the migration and the dry run and did not push. |
| 8 | `/run-block MOM-101` | Sonnet / High | You chose the retention period and how the purge is scheduled before the migration was written; Settings shows only your own Claude use for the last 24 hours; a test fails when the fake and the real limit function disagree. |
| 9 | `/run-block MOM-64` | Sonnet / High | You set up the CAPTCHA and the redirect address before the block built on them; the password reset works end to end on the local stack; the sidebar shows who is signed in; nothing about the standing smoke-test account was changed. |
| 10 | `/run-block MOM-102` | Sonnet / Medium | The data inventory and the list of what each Claude prompt sends are accurate; you reviewed every `[OWNER TO CONFIRM]` line in the notice; `/privacy` opens without signing in. The delete-my-data criterion is reported as not met. |

If a block needs another ticket's code, `/run-block` checks that code is already in `origin/main`. If it is only on an unmerged branch, it stops and offers two ways forward: push that branch and merge its pull request first, or stack this block on that branch (only with your OK). No block in this plan needs another block's code, so none should stop for that. The three migrations (012, 013, 014) are the one place the blocks touch: see "Migrations are stacked" in the Standing Rules.

---

## Executive Overview & Architectural Invariants

This build cycle makes the app safe to put in front of a first real user. It closes the database and repository loose ends the audit found (Session 1), makes the app say so when it cannot read data instead of showing an empty account (Session 2), fixes the week boundary for users outside UTC (Session 3), and finishes what real users need before an invitation: usage-record retention, password reset with sign-up abuse protection, and a privacy notice (Session 4). The webhook endpoints (MOM-98), adapter follow-ups (MOM-99) and CI hardening (MOM-100) wait for a later day. Every block preserves the three non-negotiable invariants:

1. **Human-Only Completion:** Only the signed-in owner ever changes a task's `status` or `completed_at`. No background job, webhook, ingestion run or LLM may write them, and nothing creates a task as `done`. Enforced by the `micro_tasks_guard_completion` trigger (migration 002) and by source-level tests.
2. **No-Delete / Carry-Forward:** Unfinished work is never cut or hard-deleted. The only moves are `carry_over` and `pull_forward`; work that cannot fit is named in a `cannot_hold` warning. `task_rebalance_history` is append-only.
3. **Service-Layer RLS Enforcement:** The UI never queries Supabase. All access goes through `lib/services/`, scoped to the signed-in user by RLS. The service-role client lives only in server-only modules and is scoped to a user id the server verified. **Every new table or function needs explicit grants and RLS** (this project grants nothing to API roles by default; the MOM-37 lesson).

## Standing Rules (every prompt below repeats what it needs)

- **Read the Jira ticket first.** If its title, scope or acceptance criteria disagree with the prompt, stop and flag it.
- **Production changes need your approval.** A prompt stops before `supabase db push`, `vercel env`, or any push to `origin`, shows what will happen, and waits. Never use the SQL Editor. Tests never run against production and never use production credentials.
- **Database checks are not part of `npm test`.** The 231 checks live in 9 SQL scripts in `supabase/verify/` and run with `npm run verify:sql` (local stack) or, against production, with the step B loop. After any migration, run **all** of them; every row must show `passed = true`.
- **New migrations use the numbers this plan assigns:** MOM-65 takes **012**, MOM-45 takes **013**, MOM-101 takes **014**, so the three branches never choose the same number. Never edit an applied migration.
- **Pull requests, not local merges.** `main` is protected: work reaches it only through a pull request with the CI jobs `checks` and `database` green, merged with a merge commit (CLAUDE.md). A block commits on its feature branch and stops: it never merges into `main` and never pushes. Branches are pushed once, at day-end (step F), after your explicit OK.
- **A migration is applied before its pull request merges.** A block with a migration runs `npm run verify:sql` locally, shows the migration and `npx supabase db push --dry-run`, and stops. At day-end step F, once CI is green on its pull request and you say OK, the production `db push` and then ALL the verify scripts run, before that pull request merges (merging deploys to Vercel, and the new code needs the new schema).
- **Migrations are stacked.** Branches 012, 013 and 014 each carry only their own migration file, because each was cut from `main`. At step F, handle them in numeric order: merge the first pull request, then use GitHub's "Update branch" on the next one (so it carries the earlier migration), wait for CI again, apply its migration to production, merge it, and repeat. Applying a later migration from a branch that lacks an earlier applied one makes `supabase db push` refuse.
- **Standing smoke-test account.** Production keeps ONE standing test account, `smoke-test@momentum-app.test`, created by you in the Supabase dashboard (Authentication → Add user, Auto Confirm User on). Its password lives only in your password manager: Claude never asks for it, prints it or stores it in the repo, and never creates, edits or deletes users on production. Every live sign-in check in this plan says "sign in as the standing smoke-test account". Claude may read its data with **count-only** queries. If its data gets cluttered, you delete and recreate it in the dashboard (it starts empty). The SQL verify scripts create and delete their own passwordless temporary users inside one transaction and leave nothing behind, so production should always hold exactly one user. Browser tests use throwaway users on the **local** stack only.
- **The repo is public.** Anything written to a committed file (logs, docs, tests, fixtures) names categories, never secrets, personal data or exploit steps.

## Session Preflight (run before every block)

`/run-block` does this for you, one command at a time. By hand:

```bash
cd C:\Users\matth\momentum-app
git status --short          # expect only your uncommitted docs/FAILURE_LOG.md and docs/RAID_LOG.md edits, plus untracked AGENTS.md, supabase/.branches/ and supabase/snippets/ (MOM-68 settles this in Block 1.1); anything else stops the block
git fetch origin
git rev-parse main origin/main   # the two must match. If main is only behind: git switch main, then git pull --ff-only (each on its own)
npm run plan -- MOM-<n>           # optional: the generator's view of the ticket
npm run plan:check -- --block MOM-<n>   # optional: what this plan says about the block (config, prompt lines, gate)
```

---

## High-Priority Ticket Sequence & Session Blocks

```text
SESSION 1: REPOSITORY AND DATABASE HYGIENE (MOM-68, MOM-65, MOM-66)
  - Ignore rules for secret env files, then revoke API-role EXECUTE on the two trigger functions (migration 012), then a check that every public table has the grants its role needs
SESSION 2: HONEST FAILURE STATES AND TESTS (MOM-93, MOM-103, MOM-57)
  - A could-not-load state on the home page, the same on Connected Apps, then the missing integration tests
SESSION 3: TIME ZONE (MOM-45)
  - The plan week rolls over at the user's local midnight (migration 013 if the zone is stored in the database)
SESSION 4: WHAT REAL USERS NEED (MOM-101, MOM-64, MOM-102)
  - Usage-record retention and a Settings readout (migration 014), password reset with sign-up abuse protection, then the privacy approach and notice
```

*Order matters. In Session 1, MOM-68 is a no-risk warm-up, MOM-65 comes before MOM-66 so the grants work starts from the revoked state (the grants check itself does not need MOM-65's code). Session 2 puts MOM-93 first so its wording sets the pattern MOM-103 follows, and MOM-57 last because it only adds tests. MOM-45 is its own session because it touches how every "today" is computed and may add a column. In Session 4, MOM-101 comes first because the retention period it decides is a fact the privacy notice states; MOM-64 sits between them because it needs you to set up a CAPTCHA first, which gives you time; MOM-102 comes last because the notice describes everything else. Safe stopping points: after Session 1, after Session 2, after each block of Session 4. If the day runs short, MOM-102 drops first (it is the only block that needs several of your decisions), then MOM-64.*

---

# SESSION 1: REPOSITORY AND DATABASE HYGIENE

**Your prerequisites before this session:** none for Block 1.1. Docker Desktop must be running for Blocks 1.2 and 1.3 (they use the local Supabase stack, `npx supabase start`), and `npm run dev` stopped when a block runs the browser tests. Block 1.1 asks you one question about `AGENTS.md`. Nothing on production is touched in this session; the migration in Block 1.2 is applied at day-end step F.

## Block 1.1: Narrow the .env Ignore Pattern and Settle the Untracked Files (MOM-68)

* **Objective & Scope:** `vercel link` added `.env*` to `.gitignore`, which also matches the tracked `.env.example`, so edits to it never show in `git status` and a new variable can be forgotten. Narrow the pattern while keeping every secret file ignored, and settle the three paths that always show as untracked (`AGENTS.md`, `supabase/.branches/`, `supabase/snippets/`).
* **Core Invariants to Protect:** *Security (CLAUDE.md)*: `.env.local` and every other secret env file stays ignored; nothing secret may become trackable. *Service RLS*: no app code changes.
* **CLI Session Config:** Model: Sonnet | Effort: Low

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-68: narrow the .gitignore .env* pattern so .env.example edits show in git status.

Task Instructions:
1. Read ticket MOM-68 in Jira first; its acceptance criteria are the definition of done. If it disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md (the "Environment Files" rule and the daily-loop paragraph that lists the files never to stage), .gitignore, .env.example, and the BACKLOG.md items under MOM-68. Run `git check-ignore -v .env.example .env.local .vercel` and show me the current result.
3. Create the feature branch `feature/MOM-68-gitignore-env-example` off an up-to-date `main`.
4. Replace the `.env*` line in .gitignore with patterns that still ignore every secret env file (`.env`, `.env.*`) but not the tracked example (`!.env.example`). Keep `.env.local`, `.env*.local` and `.vercel`. Prove it with `git check-ignore -v` for `.env`, `.env.local`, `.env.production`, `.env.development.local`, `.vercel` (all must be ignored) and `.env.example` (must print nothing).
5. Add `supabase/.branches/` and `supabase/snippets/` to .gitignore (local-only folders the Supabase CLI writes), after showing me the one-line reason for each.
6. STOP and ask me one question about AGENTS.md: it is rewritten by `next dev` and shows as untracked. Options: commit it, or ignore it. Give your recommendation and the reason. Apply only my answer. If I choose to ignore it, add it to .gitignore; if I choose to commit it, stage it by name.
7. Search .claude/commands/, CLAUDE.md and docs/plans/NEXT_BUILD_PLAN.md for wording that says these paths "always show as untracked" or must never be staged, and list each place. Change nothing there without my OK (the wording is harmless if the paths are now ignored).
8. Add tests/gitignore.test.ts: it runs `git check-ignore -q <path>` (with the child process API, no shell) and asserts the exit code for each path in step 4, so a future edit that makes the example ignored, or a secret file trackable, fails `npm test`.
9. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass. Edit .env.example by adding and then removing a blank line to show `git status` notices the change; leave the file as it was.
10. Update BACKLOG.md for MOM-68 (tick the two items and note my AGENTS.md answer). Comment on MOM-68 in Jira with what changed and which acceptance criteria are met; do not move it to Done (Done follows the merge at day-end).
11. Commit with "chore(MOM-68): ignore secret env files but not .env.example, and settle the untracked files". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented.
```

* **User Verification Gate:**
  - [ ] `git check-ignore .env.example` prints nothing, and `.env.local` and `.vercel` are still ignored.
  - [ ] You answered the `AGENTS.md` question and the CLI applied only your answer.
  - [ ] `npm test` passes, including the new ignore test.
  - [ ] `git status` is quieter on the branch (the Supabase folders no longer show as untracked).

---

## Block 1.2: Revoke API-Role EXECUTE on handle_new_user and rls_auto_enable (MOM-65)

* **Objective & Scope:** On production both functions are executable by API roles. Neither takes arguments and both exist to fire from triggers; the same drift once let any signed-in user call `seed_career_pivot`. Find out what each function is and who owns it, then revoke EXECUTE from every API role in migration **012**, without breaking sign-up. The ticket's second acceptance criterion predates MOM-19 ("signing up still seeds the default goal"): since migration 010 a new account has no goals, so it should read "signing up still creates the `users` row, and a fresh signup has no goals". Do not edit the ticket's criteria; comment.
* **Core Invariants to Protect:** *Service RLS*: grants must narrow, never widen; `handle_new_user` stays SECURITY DEFINER with a pinned `search_path`. *No-Delete*: nothing touches existing users' data. A Supabase-owned object is not to be worked around: if the migration cannot revoke it, stop and report.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-65: revoke API-role EXECUTE on handle_new_user and rls_auto_enable.

Task Instructions:
1. Read ticket MOM-65 in Jira first; its acceptance criteria are the definition of done. Read its comments: if nobody has yet noted that acceptance criterion 2 is out of date (signing up no longer seeds a goal since migration 010), add a Jira comment saying it should now read "signing up still creates the users row, and a fresh signup has no goals". Do not edit the criteria. If anything else disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, migration 001 (handle_new_user, seed_career_pivot and their REVOKEs), migration 010, migration 011 (how grants are written today), supabase/verify/001 and 011, the comment above `Functions` in types/database.types.ts, and the BACKLOG.md items that mention MOM-65.
3. Create the feature branch `feature/MOM-65-revoke-trigger-functions` off an up-to-date `main`.
4. Investigate first, read-only, on the LOCAL stack (`npx supabase start`; `npx supabase db reset --local` for a clean database): who owns each function, what each is (a trigger function on auth.users? an event trigger function installed by Supabase?), which role fires the trigger on a sign-up (supabase_auth_admin?) and so needs EXECUTE, and the current privileges with has_function_privilege for public, anon, authenticated, service_role and supabase_auth_admin. Show me a table and your proposed revoke list. STOP and wait for my OK.
5. Write supabase/migrations/012_revoke_trigger_function_execute.sql (the number is fixed by the plan; do not pick another) that revokes EXECUTE on both functions from public, anon, authenticated and service_role, and keeps whatever step 4 showed the sign-up trigger needs. If the migration role cannot revoke a Supabase-owned function, do not work around it: stop, report the exact error and what you would propose, and wait.
6. Add supabase/verify/012_revoke_trigger_function_execute.sql in the style of the existing scripts (one transaction, rolled back, no leftover rows, safe to run against production): has_function_privilege is false for anon, authenticated and service_role on both; calling each as `authenticated` fails with 42501; a row inserted into auth.users still produces its public.users row and no goals; the sign-up trigger's role keeps what it needs. All 231 existing checks stay.
7. Make the false statement in the types/database.types.ts comment true or correct it, whichever matches the migration. Tests: extend tests/migrations.test.ts only if it checks migration files by number or contents.
8. Verify locally: `npx supabase db reset --local`, then `npm run verify:sql`; all scripts must pass. Because the sign-up path is touched, also run `npm run test:e2e` (Docker running, `npm run dev` stopped); the auth spec signs up through the real form and must pass.
9. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass.
10. STOP before production, and do NOT run `supabase db push`. Show me the migration and `npx supabase db push --dry-run`. Say plainly: the production push and then ALL the verify scripts run at day-end step F, after CI is green on this branch's pull request and I say OK, and before the pull request merges.
11. Update BACKLOG.md for MOM-65 (tick the two items about these functions). Comment on MOM-65 in Jira with what changed, each acceptance criterion met or unmet and how verified; do not move it to Done.
12. Commit with "fix(MOM-65): revoke API-role EXECUTE on handle_new_user and rls_auto_enable". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes; npm run verify:sql and npm run test:e2e pass locally; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented.
```

* **User Verification Gate:**
  - [ ] You read the findings about both functions and approved the revoke list before the migration was written.
  - [ ] `npm run verify:sql` passes with the new script; calling either function as a signed-in role gives "permission denied"; the sign-up browser spec still passes.
  - [ ] You saw the migration and the dry run, and nothing was pushed.
  - [ ] After day-end step F applies it: every production verify script passes, and a count-only catalogue query shows no EXECUTE for anon, authenticated or service_role on either function. Real sign-up is proven on the local stack only; do not create a second user on production.

---

## Block 1.3: Check That Every Public Table Has the Grants Its Role Needs (MOM-66)

* **Objective & Scope:** New tables here get no SELECT, INSERT, UPDATE or DELETE for any API role by default, and migration 005 once forgot that. Add a verify check that fails when a public table has no grant for the role that must use it, with an explicit allow-list for tables that are deliberately closed (for example `task_rebalance_history` for `service_role`), and record a decision on whether any no-session job needs to read `task_rebalance_history`.
* **Core Invariants to Protect:** *Service RLS*: the check only reads the catalogue. *No-Delete*: `task_rebalance_history` stays append-only; do not grant anything on it without my explicit OK. The check must be safe against production: no DDL, no data written.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-66: check that every public table has the grants its role needs, and decide service_role access to task_rebalance_history.

Task Instructions:
1. Read ticket MOM-66 in Jira first; its acceptance criteria are the definition of done. If it disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, migrations 003, 005, 006 and 011 (how each table's grants were written), supabase/verify/005 and 011 (script style), scripts/run-sql-verify.ts and tests/migrations.test.ts (whether a verify script must pair with a migration number; follow whatever convention they enforce and tell me what you found), and the BACKLOG.md items under MOM-66.
3. Create the feature branch `feature/MOM-66-table-grants-check` off an up-to-date `main`.
4. List every table in the public schema on the local stack with its RLS flag and each API role's privileges (anon, authenticated, service_role). Show me the matrix and, for each table, the role(s) that must use it, taken from the code (lib/services/) and the migrations, not guessed.
5. Write the check as supabase/verify/015_table_grants.sql unless step 2 says another name is required. It holds an explicit allow-list of (table, role, privileges expected), including tables deliberately closed to a role, and fails when: a public table is missing from the list (so a new table cannot ship unchecked), a listed grant is missing, or a grant exists that the list does not expect. It must be read-only and safe to run against production: it does not create tables, rows or users.
6. Prove the check fails on a table with no grants WITHOUT putting that into the script: on the local stack only, by hand, create a throwaway table with no grants, run the script, show me the failing row, then drop the table. Do this only against the local database, never production.
7. Decision on task_rebalance_history and service_role: look for any no-session job in the code or the plan (the Friday weekly-plan build, ingestion, the usage purge planned for MOM-101) that needs to read it. Write a recommendation (my default expectation: keep it closed, because nothing reads it without a session today) and STOP for my OK. Record the decision in BACKLOG.md and as a comment inside the allow-list. If I decide a grant is needed, do not write a migration here: record it as a BACKLOG item for a separate ticket.
8. Verify: `npm run verify:sql` passes locally with the new script and the others unchanged.
9. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass.
10. Update BACKLOG.md for MOM-66 (the schema-grants item and the rebalance-history item). Comment on MOM-66 in Jira with each acceptance criterion met or unmet and how verified; do not move it to Done.
11. Commit with "test(MOM-66): check that every public table has the grants its role needs". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes; npm run verify:sql passes locally; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented.
```

* **User Verification Gate:**
  - [ ] The matrix of tables and roles was shown, and the new check passes on the real tables.
  - [ ] You saw the check fail on a throwaway table made by hand on the local stack, and the table was dropped.
  - [ ] The decision about `task_rebalance_history` is written in BACKLOG.md and nothing was granted without your OK.
  - [ ] After day-end step F: the new script runs against production and reports every check `true`, none `false` (it writes nothing).

---

# SESSION 2: HONEST FAILURE STATES AND TESTS

**Your prerequisites before this session:** none. Docker Desktop running if you want the CLI to run `npm run test:e2e` (it will say when it needs it), and `npm run dev` stopped when it does. No migration, nothing on production.

## Block 2.1: Show a Could-Not-Load State Instead of "No Goals Yet" (MOM-93)

* **Objective & Scope:** When the home page cannot read the plan (for example the database is unreachable) it falls back to the empty views, so a user who has goals is told "No goals yet" and invited to set up a first goal. Give that case its own state: a plain message, a Try again action and no wizard call to action. A successful read that finds no goals must still show the no-goals state.
* **Core Invariants to Protect:** *Human-Only Completion*: a failed read shows nothing that can be ticked and writes nothing. *Service RLS*: the page tells "read failed" from "read found nothing" by the service result, and no component calls Supabase. Never invent data to fill the gap.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-93: show a read-failed state instead of "No goals yet" when the plan cannot be loaded.

Task Instructions:
1. Read ticket MOM-93 in Jira first; its acceptance criteria are the definition of done. If it disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, app/page.tsx (the catch blocks that fall back to EMPTY_CHANNEL_VIEWS), types/channelViews.ts (FeedState, EMPTY_CHANNEL_VIEWS, SIGNED_OUT_CHANNEL_VIEWS), lib/utils/channelViews.ts, components/layout/MainFeed.tsx, AppShell.tsx and NavSidebar.tsx, the state components in components/tasks/, tests/channel-selection.test.tsx and the existing empty-state tests, RAID_LOG.md I-04, and the BACKLOG.md items under MOM-93.
3. Create the feature branch `feature/MOM-93-read-failed-state` off an up-to-date `main`.
4. State: add a 'load_failed' member to FeedState and a LOAD_FAILED_CHANNEL_VIEWS constant, used only when the snapshot read returns an error or throws. A read that succeeds with zero goals must still produce 'no_goals'. The UI never infers the state from emptiness.
5. Component: LoadFailedState in components/tasks (exported ...Props interface, no Supabase or service imports) with a plain message ("We couldn't load your plan"), a Try again button that refreshes the route (router.refresh, no data fetched in the component) and no goal wizard call to action. While the state is load_failed, the sidebar's "+ New Goal Wizard", the rebalance nudge and Adjust Weekly Pace must not offer actions that need data that was not loaded; show them disabled or hide them, and tell me which you chose and why.
6. Wording: keep the message short and calm and reuse it later for MOM-103; do not name internal causes (no table or key names) in what the user sees.
7. Tests: the page-level choice (read error and thrown error give 'load_failed'; success with no goals gives 'no_goals'), jsdom tests for LoadFailedState (message, Try again calls router.refresh, no wizard prompt anywhere in the output), and MainFeed choosing it. Update any test that asserted the old fallback and list each change.
8. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass.
9. Update BACKLOG.md for MOM-93 and RAID_LOG.md I-04 only by adding the word "built" in the Status of that row if you are certain it is fixed; otherwise leave the RAID row alone and tell me. Comment on MOM-93 in Jira with each acceptance criterion met or unmet and how verified; do not move it to Done.
10. Commit with "fix(MOM-93): show a could-not-load state instead of No goals yet". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented.
```

* **User Verification Gate:**
  - [ ] `npm test` passes and the CLI listed every test it changed.
  - [ ] You can see in the tests that a read failure gives the could-not-load state with Try again and no goal prompt, and a successful empty read still gives the no-goals state.
  - [ ] The CLI said how the sidebar actions behave while the state is shown.
  - [ ] After the push, signed in as the standing smoke-test account, the home page still loads normally (the failure path cannot be triggered on production without breaking it, so it is covered by the tests).

---

## Block 2.2: Show a Visible Error When Connection Status Cannot Be Read (MOM-103)

* **Objective & Scope:** The Connected Apps page silently falls back to the old switch-only cards when connection status cannot be read (a missing server key did exactly that in the MOM-62 live test). Show a "couldn't load connection status" message with Try again instead, and never the cards whose "Connected" only means "switched on". The desktop side panel's old cards are a separate item (MOM-95) and stay as they are.
* **Core Invariants to Protect:** *Service RLS / secrets*: the page must not import or print any secret; a missing server setting is reported as a fixed message, never as the setting's name. A failed read renders no controls that would write.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-103: Connected Apps hides a status read failure behind the old switch-only cards.

Task Instructions:
1. Read ticket MOM-103 in Jira first; its acceptance criteria are the definition of done. If it disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, app/connections/page.tsx (its two try/catch fallbacks), components/integrations/IntegrationCardList.tsx and ConnectionControls.tsx, lib/services/integrations.ts (listConnectedApps, listIntegrationAccounts), tests/connect-ui.test.tsx, tests/e2e/connections.spec.ts, and the BACKLOG.md items under MOM-62 and MOM-95. If Block 2.1 (MOM-93) has already merged to origin/main, reuse its wording and look; if not, write the message yourself with the same calm wording ("We couldn't load connection status") and add a BACKLOG item to share one component later.
3. Create the feature branch `feature/MOM-103-connections-status-error` off an up-to-date `main`.
4. Behaviour: distinguish a status read that fails (error or throw) from one that succeeds with no connections. On failure show the message and a Try again (refresh the route); do not render the switch-only fallback cards or any connect, disconnect or toggle control. On success with no connections, behaviour is unchanged. Do not touch the desktop side panel (components/layout/ConnectedStackPanel.tsx).
5. The visible message must be fixed text: it never includes the thrown error, a setting name or a key.
6. Tests: jsdom tests that a failed status read shows the message and Try again and none of the old cards or controls, and that a successful read is unchanged; update any assertion that relied on the silent fallback and list each change. If tests/e2e can pin the server key empty for one run the way tests/e2e/wizard.spec.ts pins the model key empty, add a browser spec for the real failure; if not, say so and rely on the component tests.
7. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass. If you added a browser spec, run `npm run test:e2e` (Docker running, `npm run dev` stopped).
8. Update BACKLOG.md for MOM-103 (tick the silent-fallback item). Comment on MOM-103 in Jira with each acceptance criterion met or unmet and how verified; do not move it to Done.
9. Commit with "fix(MOM-103): show a visible error when connection status cannot be read". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented.
```

* **User Verification Gate:**
  - [ ] `npm test` passes and the CLI listed every test it changed.
  - [ ] With status unreadable, the page shows the message and Try again and none of the switch-only cards or controls; with status readable, the page is unchanged.
  - [ ] The visible text names no setting, key or error text.
  - [ ] The desktop side panel is untouched.

---

## Block 2.3: Add Tests for Integrations (MOM-57)

* **Objective & Scope:** `setConnectedAppActive` has no test (it is only called from the Server Action), and the mock adapter payloads are not asserted against the ingestion contract. The real Hevy and Google adapters are already checked against `InboundActivityPayloadSchema` in `tests/adapters.test.ts`. Add what is missing so both acceptance criteria are met.
* **Core Invariants to Protect:** *Human-Only Completion*: nothing under test may write `status` or `completed_at`. *Service RLS*: tests use the in-memory Supabase fake; none uses production credentials or a network.
* **CLI Session Config:** Model: Sonnet | Effort: Low

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-57: add tests for integrations (setConnectedAppActive validation, payload shapes).

Task Instructions:
1. Read ticket MOM-57 in Jira first, including today's comment on what is already covered; its acceptance criteria are the definition of done. If it disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, lib/services/integrations.ts (setConnectedAppActive, isSupportedProvider, getMockHevyActivity, getMockCalendarActivity), app/actions/integrations.ts, lib/services/ingestion.ts (InboundActivityPayloadSchema), tests/integrations-service.test.ts, tests/adapters.test.ts and the Supabase fake under tests/helpers/.
3. Create the feature branch `feature/MOM-57-integration-tests` off an up-to-date `main`.
4. Tests for setConnectedAppActive: an unsupported provider and a non-boolean state are refused with the fixed messages and touch nothing; a signed-out caller is refused; a signed-in caller turning an app on and then off writes one row scoped to their own user id (upsert on user and provider), leaves other columns untouched and returns only the public columns; a database error comes back as a failed result. Add them to tests/integrations-service.test.ts or a new file, following the existing style.
5. Contract tests: getMockHevyActivity() and getMockCalendarActivity() each pass InboundActivityPayloadSchema and carry the fields the spec requires (docs/INTEGRATIONS_SPEC.md). Read the spec and say if the mocks and the spec disagree; do not change either silently.
6. Change no application code. If a test exposes a bug, stop and tell me what it found before fixing anything.
7. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass.
8. Update BACKLOG.md for MOM-57 (the integrations-tests item under MOM-13). Comment on MOM-57 in Jira with each acceptance criterion met or unmet and how verified; do not move it to Done.
9. Commit with "test(MOM-57): cover setConnectedAppActive and the mock payload contract". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented.
```

* **User Verification Gate:**
  - [ ] `npm test` passes and the CLI listed the new tests by name.
  - [ ] Refusals (bad provider, bad state, signed out) and the success path are all covered.
  - [ ] The mock payloads are asserted against the contract.
  - [ ] No application code changed, or the CLI told you before it changed any.

---

# SESSION 3: TIME ZONE

**Your prerequisites before this session:** Docker Desktop running (the verify scripts and the browser tests use the local stack), and `npm run dev` stopped when the block runs the browser tests. The block stops for your design OK before writing any migration. If you choose to store the zone in the database it adds migration 013, applied at day-end step F.

## Block 3.1: Roll the Plan Week Over at the User's Local Midnight (MOM-45)

* **Objective & Scope:** The current plan week comes from the goal's `start_date` and the server's UTC date, so it is off by one around midnight for a user in Pacific time (about 5 pm local for the week boundary to flip early). Store the user's time zone (or an explicit week boundary), compute "today" in it, and use that everywhere a "today" is taken on the server: the week, the due-so-far logic, goal progress, and the rebalance proposal.
* **Core Invariants to Protect:** *Human-Only Completion*: nothing here writes a task's status. *Service RLS*: a user can set only their own zone, and an invalid zone is refused and never stored; an unknown or missing zone falls back to UTC and says so in a comment. *No-Delete*: the move history and `carried_from_week` markers do not change; only the arithmetic for "today" does.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-45: the current plan week can be off by one around midnight outside UTC.

Task Instructions:
1. Read ticket MOM-45 in Jira first; its acceptance criteria are the definition of done. If it disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, lib/utils/velocity.ts (currentPlanWeek, computeVelocity), lib/utils/progress.ts (planTimeline), lib/utils/channelViews.ts, lib/services/tasks.ts (every place that builds `today` from the UTC date, around lines 87, 100 and 275), lib/services/goals.ts (isoDate), lib/services/ingestion.ts (the week from the activity's own day: that one is the activity's UTC day and belongs to MOM-71, leave it), app/page.tsx, lib/services/auth.ts, migrations 001 and 008 (how public.users is defined and granted), the BACKLOG.md items on the current week and the date line, and RAID_LOG.md I-02.
3. Create the feature branch `feature/MOM-45-user-time-zone` off an up-to-date `main`.
4. Design before coding. Compare (A) a nullable IANA time-zone column on public.users, set by the signed-in user through a service and a Server Action, with the browser supplying its own zone, against (B) a cookie the browser sets and the server reads. Recommend one with reasons (my expectation: A, because the ticket says "store" and a cookie is per device), including how a first visit with no zone behaves (UTC, until the browser reports one), how an invalid zone string is refused, and every call site that takes a "today" and what it will use. Wait for my OK.
5. Implement a pure helper (for example todayInZone(nowMs, timeZone) in lib/utils/) that returns YYYY-MM-DD in the zone using Intl, with UTC as the documented fallback for a missing or invalid zone, and use it at every call site from step 4. Keep currentPlanWeek's signature (it already takes `asOf`); change what callers pass.
6. If the design is A: write supabase/migrations/013_user_time_zone.sql (the number is fixed by the plan; do not pick another) adding the nullable column with explicit grants (a signed-in user may update only their own row's zone, never read or write another's, nothing for anon), and supabase/verify/013_user_time_zone.sql in the style of the others (one transaction, rolled back, safe on production): own update works, another user's row is untouched, an over-long or empty value is rejected, all existing checks unchanged. Add the typed column to types/database.types.ts.
7. Tests: the helper at a UTC-versus-Los-Angeles boundary (for example 2026-10-24 06:30 UTC is still 2026-10-23 in America/Los_Angeles; the week rolls at local midnight, not at UTC midnight), across a daylight-saving change, with an invalid zone and with no zone; the service refusing another user's id and an invalid zone; the page/service call sites passing the zone through. Update any test that fixed `today` as a UTC string and list each change.
8. Verify locally: `npx supabase db reset --local`, then `npm run verify:sql`; all scripts must pass. Because pages change, also run `npm run test:e2e` (Docker running, `npm run dev` stopped).
9. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass.
10. STOP before production, and do NOT run `supabase db push`. If there is a migration, show me it and `npx supabase db push --dry-run`. Say plainly: the production push and then ALL the verify scripts run at day-end step F, after CI is green on this branch's pull request and I say OK, and before it merges.
11. Update BACKLOG.md for MOM-45 and I-02 wording (tick the week item; the date line stays under MOM-45 as a follow-up). Comment on MOM-45 in Jira with each acceptance criterion met or unmet and how verified; do not move it to Done.
12. Commit with "fix(MOM-45): roll the plan week over at the user's local midnight". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes; npm run verify:sql and npm run test:e2e pass locally; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented.
```

* **User Verification Gate:**
  - [ ] You chose where the zone lives before any migration was written.
  - [ ] A unit test shows a Los Angeles user still in the previous week at 23:30 local while UTC has already rolled over, and the week rolls at local midnight.
  - [ ] `npm run verify:sql` and `npm run test:e2e` pass; the CLI listed every test it changed.
  - [ ] After day-end step F applies the migration: signed in as the standing smoke-test account, a count-only query shows its zone is now set (print the count of accounts with a zone, never the value), and the home page week matches your local date.

---

# SESSION 4: WHAT REAL USERS NEED

**Your prerequisites before this session:** (1) For Block 4.1, be ready to decide a retention period for Claude usage records and how the purge runs; the CLI recommends and waits. (2) For Block 4.2, **before the block builds on them**: pick a CAPTCHA provider that Supabase Auth supports (Cloudflare Turnstile or hCaptcha) and create a site; you will paste the **secret** into the Supabase dashboard (Authentication → Attack Protection) yourself, and the **site key** (public by design) goes in as an environment variable that the CLI names for you. Also add `https://momentum-app-eight-chi.vercel.app/auth/reset` and `http://localhost:3000/auth/reset` to the Auth redirect allow-list. The CLI never sees the secret. (3) For Block 4.3, have a view on who the first invited users are, because the notice states what they are told. (4) Docker Desktop running; `npm run dev` stopped when a block runs the browser tests. Migration 014 (Block 4.1) is applied at day-end step F.

## Block 4.1: Purge Old Claude Usage Records and Show a Person Their Own Use (MOM-101)

* **Objective & Scope:** Nothing deletes old `llm_usage_logs` rows, so a person's pattern of Claude use stays tied to their account indefinitely (RAID R-11). Decide a retention period and run a scheduled purge; add a Settings readout of the signed-in person's own use in the last 24 hours (`listMyLlmUsage()` has no screen); and make a change to `reserve_llm_call()` that is not mirrored in the test fake fail a test. Record the "one lock per reservation" note as accepted unless you find a reason not to.
* **Core Invariants to Protect:** *Service RLS*: the purge function is SECURITY DEFINER with a pinned `search_path`, executable only by the role that runs the schedule, never by an API role; the readout shows only the signed-in person's own rows and no prompt or answer content (none is stored). *Governance*: the retention period must stay longer than the 24-hour windows the caps are computed from, so a purge can never relax a cap.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-101: LLM usage follow-ups: purge old usage rows, show a person their own use, keep the fake in step.

Task Instructions:
1. Read ticket MOM-101 in Jira first; its acceptance criteria are the definition of done. If it disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, docs/LLM_GOVERNANCE.md, migration 011 and supabase/verify/011_llm_usage_logs.sql, lib/services/llm.ts (runWithinBudget, listMyLlmUsage, LLM_LIMITS), tests/helpers/fakeLlmUsage.ts, tests/llm-governance.test.ts, tests/migrations.test.ts, app/settings/page.tsx, components/layout/PageFrame.tsx, RAID_LOG.md R-11 and R-06, and the BACKLOG.md items under MOM-73 and MOM-101.
3. Create the feature branch `feature/MOM-101-llm-usage-followups` off an up-to-date `main`.
4. Design before coding, then STOP for my answers: (a) the retention period (recommend one with reasons; it must be longer than the longest cap window, and long enough to measure cost per call and tune the caps, which BACKLOG says needs about a week of real use); (b) how the purge runs: check read-only whether pg_cron is available on this Supabase project (a catalogue query with `npx supabase db query --linked`, nothing written), and otherwise propose a protected Vercel Cron route, saying what secret it would need and that setting it is a `vercel env` step I must approve; (c) the wording of the Settings readout ("Your Claude use, last 24 hours": counts per feature and outcome, tokens and the time of the last call; no content). Wait for my answers.
5. Migration 014: supabase/migrations/014_llm_usage_retention.sql (the number is fixed by the plan; do not pick another): a purge function that deletes rows older than the chosen retention, SECURITY DEFINER, search_path pinned, EXECUTE granted only to the role that runs the schedule and revoked from public, anon and authenticated, plus the schedule itself if pg_cron is the choice. Add supabase/verify/014_llm_usage_retention.sql (one transaction, rolled back, safe on production): old rows go, recent rows stay, a row inside the longest cap window is never purged, API roles cannot call the function. If the choice is a Vercel Cron route, build the route in lib/ and app/api/ following the webhook rules in docs/INTEGRATIONS_SPEC.md (secret checked first, one generic 401, nothing logged), add its path to PUBLIC_PATHS in lib/supabase/proxy.ts, and do not set any environment variable yourself.
6. Readout: add a service function that returns a summary of the signed-in person's own calls in the last 24 hours (use listMyLlmUsage or a sibling in lib/services/llm.ts; no new Supabase call in a component), and a small component under components/settings/ for app/settings/page.tsx. It shows nothing about anyone else and no content, and says plainly when there was no use.
7. Keep the fake in step: add a test that fails when the SQL of reserve_llm_call() and tests/helpers/fakeLlmUsage.ts disagree. For example, drive one table of scenarios (spacing, per-user cap, overall cap, refused call that must not use up the limit) through the fake in a unit test AND emit the same table into a verify check run by `npm run verify:sql`, or parse the constants out of the migration; choose the sturdier option and explain why. The test must fail if you change a limit in only one place (show it failing once, then revert).
8. Record the lock note in BACKLOG.md as accepted at the current scale, with the revisit trigger.
9. Verify locally: `npx supabase db reset --local`, then `npm run verify:sql`; all scripts must pass. Settings changes a page, so also run `npm run test:e2e` (Docker running, `npm run dev` stopped).
10. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass.
11. STOP before production, and do NOT run `supabase db push`. Show me the migration and `npx supabase db push --dry-run`. Say plainly: the production push and then ALL the verify scripts run at day-end step F, after CI is green on this branch's pull request and I say OK, and before it merges.
12. Update BACKLOG.md for MOM-101 and RAID_LOG.md R-11 (only its Status, and only if the purge is actually scheduled; otherwise leave the row and tell me). Tell me the retention period you built so I can quote it in the privacy notice (Block 4.3). Comment on MOM-101 in Jira with each acceptance criterion met or unmet and how verified; do not move it to Done.
13. Commit with "feat(MOM-101): purge old Claude usage records and show a person their own use". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes; npm run verify:sql and npm run test:e2e pass locally; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented.
```

* **User Verification Gate:**
  - [ ] You chose the retention period and how the purge is scheduled before any migration was written.
  - [ ] Settings shows only your own Claude use for the last 24 hours, with no content; nobody else's rows can appear.
  - [ ] A test fails when the limit function and the fake disagree (you saw it fail once).
  - [ ] After day-end step F applies the migration: every production verify script passes, and a count-only query shows no usage row older than the retention period. If the purge is a Vercel Cron route, you approved the secret and its first run.

---

## Block 4.2: Password Reset, Sign-Up Abuse Protection and a Signed-In Indicator (MOM-64)

* **Objective & Scope:** Sign-in is email and password only: a user who forgets their password has no way back, sign-up has no throttling or CAPTCHA, and the sidebar does not show who is signed in (Settings already shows the email; check what the sidebar and mobile header do). Build the password reset (request form on `/login`, emailed link, a page to set a new password), CAPTCHA support on sign-up and sign-in that switches on only when its public site key is configured, and the signed-in indicator. OAuth providers are out of scope.
* **Core Invariants to Protect:** *Security*: the reset request gives the same answer whether or not the email has an account (no account enumeration); the reset page works only with the recovery session the emailed link creates; no secret in the repo, the browser or a log; the CAPTCHA secret lives only in the Supabase dashboard. *Service RLS*: all Supabase Auth calls go through `lib/services/auth.ts`, never from a component.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-64: complete auth with password reset, sign-up abuse protection and a signed-in indicator.

Task Instructions:
1. Read ticket MOM-64 in Jira first; its acceptance criteria are the definition of done. If it disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, lib/services/auth.ts, app/actions/auth.ts, app/login/page.tsx, components/auth/SignInForm.tsx and SignOutButton.tsx, app/auth/callback/, lib/supabase/proxy.ts (PUBLIC_PATHS), components/layout/NavSidebar.tsx, WorkspaceSidebar.tsx, MobileHeader.tsx and PageFrame.tsx (what already shows the signed-in email), supabase/config.toml (local auth settings and redirect URLs), tests/e2e/auth.spec.ts and its support files (Mailpit), and the BACKLOG.md items under MOM-64.
3. Create the feature branch `feature/MOM-64-complete-auth` off an up-to-date `main`.
4. Prerequisites check, by name only: ask me to confirm I created a CAPTCHA site (Cloudflare Turnstile or hCaptcha), added the reset address to the Supabase Auth redirect allow-list and, if I want it live, set the CAPTCHA secret in the Supabase dashboard. Tell me the name of the public site-key environment variable you will read (never its value). The build must work with the key absent (no CAPTCHA shown, no behaviour change) so local development and the browser tests are unaffected. Do not ask me for a secret and never print one.
5. Password reset, in lib/services/auth.ts: requestPasswordReset(email) validated like sign-in input, calling Supabase Auth's reset email with a redirect to `/auth/reset` through the existing callback; it always returns the same neutral success result whether or not the account exists, and a fixed message on failure. updatePassword(newPassword) for the signed-in recovery session, with the same strength rules as sign-up. Server Actions in app/actions/auth.ts. UI: a "Forgot password?" request form on /login; a page at app/auth/reset that needs the recovery session (do not add it to PUBLIC_PATHS: the emailed link signs the user in through the callback first) and sets the new password, then sends the user to the app. A stale or invalid link shows a fixed message and a way to request another.
6. Abuse protection: show the CAPTCHA widget on sign-up and sign-in only when the site key is set, pass its token to the Supabase Auth calls through the service, and show a fixed message when it fails. Do not add your own rate limiter; Supabase Auth's built-in limits are dashboard settings, so list for me which ones to review (sign-up and sign-in rate, email rate) and wait for me to say they are set.
7. Signed-in indicator: show who is signed in (the email) and the sign-out button in the places the sidebar and mobile header are missing it, reading the email through lib/services/auth.ts. Reuse what PageFrame already does.
8. Tests: the services with a fake auth client (neutral result for known and unknown email, weak password refused, no CAPTCHA key = no token required), jsdom tests for the forms and the indicator, and a browser spec on the local stack with a throwaway user: request a reset, read the email in Mailpit, follow the link, set a new password, sign in with it. Never use the standing smoke-test account in a test.
9. Local config: add the reset redirect to supabase/config.toml for the local stack, with CAPTCHA left off locally.
10. Run `npx tsc --noEmit`, `npm test`, `npm run build` and `npm run test:e2e` (Docker running, `npm run dev` stopped); all must pass.
11. Update BACKLOG.md for MOM-64 (the auth item and the signed-out-fallback item that mentions the indicator). Comment on MOM-64 in Jira with each acceptance criterion met or unmet and how verified: criterion 2 (throttling or CAPTCHA) is met only once I confirm the dashboard settings; say so plainly. Do not move it to Done.
12. Commit with "feat(MOM-64): add password reset, sign-up abuse protection and a signed-in indicator". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes; npm run test:e2e passes locally; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented.
```

* **User Verification Gate:**
  - [ ] You created the CAPTCHA site, added the reset address to the redirect allow-list and set the dashboard limits, and the CLI never saw a secret.
  - [ ] The reset works end to end on the local stack in the browser spec (request, Mailpit email, new password, sign-in); asking for a reset for an unknown address gives the same answer as for a known one.
  - [ ] The sidebar and the mobile header show who is signed in.
  - [ ] After the push, signed in as the standing smoke-test account, you see the indicator; the CAPTCHA appears on `/login` if the site key is set in Vercel. The reset email is not walked on production, because that would need a second account; this gate item is intentionally local-only.

---

## Block 4.3: Write the Privacy Approach and Notice Before Real Users (MOM-102)

* **Objective & Scope:** Health data is a sensitive category, and goal and task text is sent to the Claude API (RAID R-03, R-04). Audit and write down what is stored from Hevy and Google and what each Claude prompt contains, draft a plain-language privacy notice at `/privacy` (readable without signing in and linked from the sign-in and sign-up page), and mark every statement that needs your decision `[OWNER TO CONFIRM]`. The ticket also asks for a way to delete synced activity; that interacts with the No-Delete invariant and needs its own design, so this block writes the design note and a BACKLOG item and reports that criterion as **not met**.
* **Core Invariants to Protect:** *No-Delete*: do not build any deletion here. *Honesty*: the notice states only what the code does today (for example that provider tokens are stored as plain text protected by the database's disk encryption, not by field-level encryption, and that call counts are kept for the retention period). *Public repo*: the inventory names categories and fields in general terms; no secrets, no keys, no personal data. This is a plain-language draft, not legal advice.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-102: write the privacy approach for health data and Claude prompts before real users.

Task Instructions:
1. Read ticket MOM-102 in Jira first; its acceptance criteria are the definition of done. If it disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, docs/RAID_LOG.md (R-02, R-03, R-04, R-11, A-02, I-05), docs/INTEGRATIONS_SPEC.md, docs/LLM_GOVERNANCE.md, the migrations that create the tables holding provider credentials, ingested activity and usage records, lib/services/ingestion.ts and lib/adapters/ (what a synced activity keeps), lib/ai/rebalance.ts and lib/ai/taskPlan.ts (exactly what each prompt contains), lib/supabase/proxy.ts (PUBLIC_PATHS), app/login/page.tsx and components/auth/SignInForm.tsx, and the BACKLOG.md privacy items.
3. Create the feature branch `feature/MOM-102-privacy-notice` off an up-to-date `main`.
4. Audit, read-only: write docs/PRIVACY_APPROACH.md with (a) a data inventory by category: what is stored from sign-up, goals and tasks, provider connections (what is kept, how it is protected, what disconnecting removes), synced activity (the summary fields kept; confirm no raw biometrics, route maps or heart-rate series are stored, quoting the adapter code), and usage records; (b) for each Claude call, the exact fields sent and the fields never sent (tokens, emails, health detail), checked against the prompt-building code; (c) the Anthropic data-use statement: write [OWNER TO CONFIRM] and the question to check on the provider's current terms rather than stating terms from memory; (d) retention: use the period I tell you was decided in Block 4.1, and ask me for it now (it may exist only on that block's unmerged branch); (e) the open gaps (no field-level encryption: MOM-70; no way for a user to delete synced activity or the account: new item; Google Testing-mode refresh tokens expire after about 7 days).
5. Deletion design note, same file: describe how a user could delete their synced activity without breaking the No-Delete rule (which protects the user's own unfinished plan work, not evidence the system added), the options (delete evidence rows only; delete system-created tasks the user has not touched; export first), a recommendation, and the migration and tests it would need. Build nothing. Add a BACKLOG.md item for it with the source "MOM-102" (it gets a Jira key at day-end), and say in the Jira comment that acceptance criterion "a user can delete their synced activity" is not met.
6. Draft app/privacy/page.tsx (a server component, no data fetching) in plain language from the inventory: what we collect and why, who it goes to (Supabase, Vercel, Anthropic, and Google or Hevy only when the user connects them), how long usage records are kept, what we do not do, and how to ask for deletion today (a [OWNER TO CONFIRM] contact route). Put every statement that needs my decision in a visibly marked [OWNER TO CONFIRM] line. Add `/privacy` to PUBLIC_PATHS in lib/supabase/proxy.ts and link it from the sign-in and sign-up page.
7. STOP and show me the full notice text and every [OWNER TO CONFIRM] line. Apply my answers. Any line I leave unanswered stays marked, and the notice must not be called ready: say so in the Jira comment.
8. Tests: the page renders without a session; `/privacy` is a public path; the sign-in page links to it; a source-level test that the page imports no service and calls no Supabase; a test that no [OWNER TO CONFIRM] marker is hidden (the page may keep markers, but the test lists how many remain so the count is visible in the output).
9. Run `npx tsc --noEmit`, `npm test`, `npm run build` and `npm run test:e2e` (Docker running, `npm run dev` stopped); all must pass.
10. Update BACKLOG.md for MOM-102 (the two privacy items) and RAID_LOG.md R-03 and R-04 only by adding a pointer to docs/PRIVACY_APPROACH.md in the Response column if I approve it. Comment on MOM-102 in Jira with each acceptance criterion met or unmet and how verified; do not move it to Done.
11. Commit with "feat(MOM-102): add the privacy approach document and notice page". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes; npm run test:e2e passes locally; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented.
```

* **User Verification Gate:**
  - [ ] The data inventory and the list of what each Claude prompt sends match the code you were shown.
  - [ ] You reviewed every `[OWNER TO CONFIRM]` line and answered or kept it marked; the notice is not called ready while any remain.
  - [ ] The deletion design note exists, nothing was deleted or built, and the "delete my synced activity" criterion is reported as not met.
  - [ ] After the push, without signing in, `https://momentum-app-eight-chi.vercel.app/privacy` returns 200 and the sign-in page links to it.

---

# FINAL DAY-END BUILD VERIFICATION & PULL REQUESTS

Run after the last block of the day, or type `/day-end` and let it run these in this order: **A, B, D, E, then F (the one push, after your OK), then C (live checks, after the pull requests have merged and Vercel has deployed)**. Stop on the first failure.

## A. Build and repository checks (PowerShell or Git Bash)

`/day-end` runs this. A feature branch is checked on its own, because nothing has been merged into `main` locally. List the day's branches, then check each one in turn; docs-only branches (D and E) need only `npm test` and `npm run plan`.

```bash
cd C:\Users\matth\momentum-app
git status --short                                  # only your uncommitted logs, AGENTS.md, supabase/.branches/ and supabase/snippets/
git branch --no-merged origin/main                   # the day's feature branches: work not yet in origin/main
# then, on each of those branches, one at a time:
git switch <branch>
npx tsc --noEmit                                    # expect no output
npm test                                            # expect all passing
npm run build                                       # expect "Compiled successfully"
npm run plan                                        # expect "Every open item has a Jira key."
```

`npm run test:e2e` and `npm run verify:sql` also run in CI on every pull request. Run them here too for a branch that changed pages, auth, the wizard, the drawer or a migration (stop `npm run dev` first).

## B. Database verification (production), only if migrations were applied today

A migration is applied to production inside its own block (after CI is green on its pull request and your OK, before that pull request merges). B is the day's re-check of production once all blocks are done. **Git Bash only.** This loop uses `/tmp`, `grep`, `$(...)` and `for ... done`, which do not work in PowerShell. `npm test` does **not** run these scripts. Every script must report `false 0` and a non-zero `true` count (0 and 0 means the script errored).

```bash
npx supabase migration list                         # local and remote columns must match for every migration
T=0; F=0
for f in supabase/verify/*.sql; do
  npx supabase db query --linked -f "$f" -o table > /tmp/v.txt 2>&1
  t=$(grep -cE '│ true ' /tmp/v.txt); fl=$(grep -cE '│ false ' /tmp/v.txt)
  echo "$(basename $f): true $t false $fl"; T=$((T+t)); F=$((F+fl))
done; echo "TOTAL true $T false $F"                 # expect false 0 and true = every check in supabase/verify/ (231 across 9 scripts after migration 011, plus any added today)
npx supabase db query --linked -o table "select count(*) as users from auth.users"   # expect 1: only the standing smoke-test account
```


## D. Automated End-of-Day Backlog, Obsolescence & Jira Sync (copy-paste)

```text
Perform end-of-day backlog synchronization, obsolescence audit, and ticket generation.

Task Instructions:
1. Scan BACKLOG.md, ROADMAP.md, code TODO tags and today's commits (`git log --since=midnight --no-merges`) for newly discovered gaps, TODOs or deferred items. Run `npm run plan` and treat every open item without a Jira key as un-ticketed.
2. Audit the "To Do" and "In Progress" tickets in Jira under the active Phase epic against the code on main:
   a. Read each candidate ticket's acceptance criteria and check them against the code and tests before judging. A ticket is obsolete, redundant or fully satisfied only if EVERY criterion is met or moot. Partly satisfied is not obsolete: add a comment saying what is done and what remains.
   b. Propose truly obsolete or redundant tickets for "Closed" (the pause in step 6 applies) with a brief comment explaining why. Never transition anything to "Done" in this step: step D runs before the day's pull requests have merged, so nothing is delivered yet. Done transitions are made in step F, after the merge.
   c. Annotate or remove the matching entries in BACKLOG.md (tick resolved items, re-key items pinned to closed tickets to the ticket that now owns the work).
   d. Check every epic in the MOM project, including the Phase 1 epics MOM-4 to MOM-7, and note which would have every child Done or Closed once today's merged tickets are Done. Do not transition an epic here: step F lists those epic transitions after the merge. Leave an epic with any open child alone. Do not re-parent tickets.
3. Confirm the active Phase Epic key and that every ticket created today is its child.
4. For each un-ticketed item found, group related items, then:
   a. Write the ticket in our format (Title, Summary, Technical Scope, Acceptance Criteria);
   b. Create it in Jira under the active Phase Epic (check for duplicates first; if a call times out, search before retrying);
   c. Add the new Jira key to the item in BACKLOG.md and to the ticket table.
5. Audit today's tickets: list what was finished today with its branch and pull request (it becomes Done in step F, after the merge); anything with unmet acceptance criteria must say so in a comment. Report any mismatch between a Jira ticket's real scope and its key in BACKLOG.md instead of guessing.
6. PAUSE before any Jira transition. In this step the only one allowed is "Closed" for an obsolete or redundant ticket: list every transition you intend to make, with the reason that justifies it, and wait for my OK. Comments and ticket creation do not need the pause. Never move a ticket or an epic to "Done" in step D.
7. RAID and failure log review (MOM-92; rules in CLAUDE.md, "RAID and Failure Logs"):
   a. From today's sessions (corrections I made, failed checks, claims that proved false, today's commits and new BACKLOG items), draft any missing entries in docs/FAILURE_LOG.md and docs/RAID_LOG.md, marked `unreviewed`. Keep RAID rows general: the repo is public.
   b. Show me every unreviewed entry as a short numbered list: for a failure, one line on what went wrong and your draft of why, then "predicted it? yes / no / partly"; for a RAID row, the row with your suggested owner, trigger, response and NIST function.
   c. Wait for my plain-language reply (for example "ok all", "drop 2", "3: partly"). Apply it, remove the `unreviewed` marks on approved entries, and record my predicted answer. Never ask me to edit the files or run a command. If I skip, leave the entries unreviewed for the next day-end; nothing unreviewed is committed. If some entries are approved and others are not, stage only the approved entries (never the whole file), so that no unreviewed entry is committed; the working copy keeps the rest.
   d. A RAID response that needs build work gets a BACKLOG.md item, ticketed by step 4 above.
8. Create a feature branch off an up-to-date `main` (`feature/MOM-16-eod-backlog-sync`; if it already exists and is fully merged into origin/main, delete it with `git branch -d` and create it again) and commit BACKLOG.md (ROADMAP.md if changed, and only the docs/RAID_LOG.md and docs/FAILURE_LOG.md entries I approved in step 7) with "chore(MOM-16): sync end-of-day backlog, prune obsolete tickets, and update Jira", staging files by name. Do not merge it into main and do not push: it is pushed with the day's other branches at step F and merged through its pull request.

Definition of Done: tsc --noEmit passes; npm test passes; npm run plan reports every open item has a Jira key; committed on its feature branch (not merged, not pushed).
```


## E. Day-End Master Plan Generator for Tomorrow (copy-paste)

```text
Audit the current repository state, BACKLOG.md, ROADMAP.md, and Jira board to generate our next Master Execution Plan.

Task Instructions:
1. Scan the codebase for remaining open items, deferred features, and active Jira tickets in "To Do" or "In Progress". Verify every file, function, route, provider and script a prompt names actually exists (or is created by an earlier block) before writing the prompt.
2. If new phase or follow-up tickets are needed, list them and wait for my OK before creating them under the active Phase Epic in Jira; then update BACKLOG.md with their keys.
3. Order the first session around the carry-overs I name, in dependency order. Keep the standing smoke-test account rule (one standing account on production, never ask for its password, "sign in as the standing smoke-test account" in every live gate, users = 1 in the day-end check).
4. Generate the complete "🚀 MOMENTUM BUILD: NEXT-PHASE MASTER EXECUTION PLAN" strictly following our established structure:
   - Metadata Header at the top: `> **Date:** YYYY-MM-DD | **Active Epic:** MOM-XX | **Base Commit:** <SHORT_HASH>`
   - Executive Overview & Architectural Invariants, and the Standing Rules (Jira first, production approval, verify scripts, no pushes inside blocks, standing smoke-test account).
   - A "Today's runbook" section near the top, after the metadata header and before the first block: a table with one row per block, in order, giving `/run-block MOM-n`, the session setting (model / effort) and, in plain words, what to check at the gate. It also says that `/day-start` comes first and `/day-end` last.
   - Logical Session Blocks grouping high-priority tickets, in dependency order, each in the format `npm run plan:check` enforces: a heading `## Block <n>.<m>: <title> (MOM-<n>)` with exactly one ticket key (unique in the plan); a `* **CLI Session Config:** Model: X | Effort: Y` line; exactly one fenced `text` prompt that names its ticket and carries a commit message `type(MOM-n): ...`; and a `* **User Verification Gate:**` checklist. Before each session's first block, a `**Your prerequisites before this session:**` note (it may say none).
   - Block prompts that follow the pull-request workflow (CLAUDE.md): create the feature branch off an up-to-date `main`; commit on it with the Jira key; do NOT merge into `main` and do NOT push (the one push is at day-end, step F, after my OK); end with "Definition of Done: ...; committed on the feature branch." A block with a migration says: run `npm run verify:sql` locally, show the migration and `npx supabase db push --dry-run`, and run production `db push` and then ALL the verify scripts only after CI is green on its pull request and I say OK, and before that pull request merges (merging deploys to Vercel). A block that needs another ticket's code says it "must already be in origin/main" and stops if it is not.
   - Dynamic CLI Session Config (Sonnet / High for architecture, security and database work; Sonnet / Medium or Low for standard UI and tests).
   - Copy-pasteable prompts including tsc --noEmit, npm test, npm run build, feature branching, merging to main (--no-ff), BACKLOG.md and Jira updates.
   - User Verification Gates for each block.
   - Final Day-End Build Verification & Pull Requests section (steps A, B, D, E, then F the one push, then C the live checks after the merge), with the step B verify loop marked Git Bash only, step D never moving a ticket or an epic to Done (it only comments, creates tickets and proposes Closed, with a pause for my OK), step F ending with a post-merge list of Done transitions that waits for my OK, and step D's RAID and failure log review (MOM-92) carried over word for word, including this instruction in step E.
   - An updated Open Decisions and Risks table.
5. Archive the finished plan first: copy the current `docs/plans/NEXT_BUILD_PLAN.md` to `docs/plans/archive/YYYY-MM-DD.md`, using its own metadata date (create the folder if needed). Then save the generated plan to `docs/plans/NEXT_BUILD_PLAN.md` and run `npm run plan:check -- --strict`; fix the plan until it reports no errors and no warnings.
6. Create a feature branch `feature/MOM-XX-next-build-plan-doc` off an up-to-date `main` (before step 5 writes any file) and commit the archive file and `docs/plans/NEXT_BUILD_PLAN.md` with "docs(MOM-XX): add generated next build plan" (MOM-XX is the active Phase Epic), staging files by name. Do not merge it and do not push; show me `git log origin/main..<branch> --oneline` and wait. It is pushed with the day's other branches at step F.
```


## F. Push the day's branches and merge the pull requests (the one push)

This is the day's single push and it needs your explicit OK. Nothing here pushes `main`: work reaches `main` only through pull requests.

```bash
git log origin/main..<branch> --oneline            # for EACH of the day's feature branches, including the step D and E branches: exactly what will be published
git push -u origin <branch>                         # after your OK, one branch at a time; never main. The link to open the pull request is printed
```

1. Open a pull request for each branch (the link printed by the push; `gh pr create` only if `gh` is installed and you say yes).
2. Wait for CI: both jobs, `checks` and `database`, must be green on every pull request.
3. For a branch with a migration: production `npx supabase db push --dry-run`, then `db push`, then ALL the verify scripts (step B's loop), only after CI is green and your OK, and **before** that pull request merges.
4. Merge each pull request with a merge commit (the GitHub button, or `gh pr merge` after your OK), in dependency order.
5. Then update your copy and tidy up:

```bash
git switch main
git pull --ff-only
git branch -d <branch>                              # only -d, for each merged branch; -D is never used
```

6. **Jira: Done transitions, only for what has merged.** For each ticket whose pull request merged today (the merge commits on `origin/main` since midnight, and the `(MOM-n):` commit prefixes), list the proposed transition to "Done" with the ticket's acceptance criteria, each marked met or unmet with its evidence (a test, a commit, a production check, a gate item). A ticket with an unmet criterion or a live gate still pending stays open, with a comment saying what remains. List any epic whose children are now all Done or Closed, with those children. Wait for my OK, then make exactly the transitions I approved and comment what shipped. Never move a ticket to Done before its pull request has merged.

## C. Live checks (after the last pull request has merged and Vercel has deployed)

```bash
npx vercel ls --prod                                # needs the Vercel CLI (npx works); otherwise check the deployment in the Vercel dashboard. The newest production deployment must reach "Ready"
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://momentum-app-eight-chi.vercel.app/    # 307 to /login
curl -s -o /dev/null -w "%{http_code}\n" https://momentum-app-eight-chi.vercel.app/login               # 200
```

- [ ] Sign in as the standing smoke-test account and walk the flows you touched today.
- [ ] Only the standing smoke-test account exists (`users = 1` in step B, until real users exist). If its data is cluttered, delete and recreate it in the Supabase dashboard (Add user, Auto Confirm); never share or store its password.
- [ ] Walk every item in `docs/plans/.pending-live-checks.md` (the post-push checks the blocks deferred), then clear the file.

---

## Open Decisions and Risks (read before starting)

| Item | Why it matters |
| --- | --- |
| **Three migrations on three branches** | Blocks 1.2 (012), 3.1 (013, only if the time zone is stored in the database) and 4.1 (014) each add a migration, each branch is cut from `main`, and nothing is pushed until day-end. Step F therefore handles them in numeric order: merge the first pull request, use GitHub's "Update branch" on the next so it carries the earlier migration, wait for CI again, apply its migration to production, then merge. Applying 014 from a branch that lacks 012 would make `supabase db push` refuse. If Block 3.1 chooses the cookie design, 013 is not used and 014 stays 014. |
| **MOM-65 may be partly blocked** | `rls_auto_enable` may be owned by Supabase, in which case a migration run as the project role may not be able to revoke it. The block stops and reports instead of working around it; the ticket then stays open for the part that can be done. |
| **MOM-45 design choice** | A time-zone column on the users table is clean but adds a migration and a way for the browser to report its zone; a cookie is simpler but per device. The block recommends and waits. Whichever is chosen, a user with no zone yet is treated as UTC. |
| **MOM-101 retention and scheduling** | You decide how long Claude usage records are kept (it must exceed the longest cap window) and whether the purge runs on the database's own scheduler or a protected Vercel Cron route. The Cron route would need a new secret, set with `vercel env` only with your approval. |
| **MOM-64 needs your accounts and settings** | A CAPTCHA site (Cloudflare Turnstile or hCaptcha), its secret in the Supabase dashboard, its public key in Vercel, the reset address in the redirect allow-list and the Auth rate limits are all dashboard work only you can do. Without them, the code is built and dormant, and criterion 2 (throttling or CAPTCHA) stays unmet. The reset email is proven on the local stack only: walking it on production would need a second account. |
| **MOM-102 is a draft, not legal advice** | The notice states what the code does today, with every open question marked `[OWNER TO CONFIRM]`. Have it reviewed before real users are invited. The ticket's "delete my synced activity" criterion is reported as not met: it needs a design that respects the No-Delete rule, so the block writes the note and a BACKLOG item and builds nothing. |
| **Standing smoke-test account** | `smoke-test@momentum-app.test` exists on production and starts empty (recreated after migration 010). Every live gate signs in as it; its password stays in your password manager. Production must hold exactly one user at day-end step B; no block creates a second one. |
| **MOM-75 closes only after you say so** | Today's day-end is the first real run of `/day-end`. MOM-75 stays In Review until you have walked it end to end, including the push, the merges and the live checks, and tell me it is finished. |
| **Dark only until MOM-30** | The app is dark regardless of the device setting. Light mode with a follow-device default is MOM-30, not scheduled. |
| **Live Claude paths** | Production has never seen the failure path of the plan generator or of Ask Claude (no key, limit reached). The local browser tests cover it. MOM-73's caps are placeholders sized as ceilings; read `llm_usage_daily` after a week of real use and set them from the measured cost. |
| **Not scheduled, but queued with keys** | **MOM-98** (webhook endpoints: a migration and two public routes, tested on a deployed URL; Google needs a verified domain), **MOM-99** (adapter follow-ups: validate the Hevy key, confirm the set-count rule, a real Google fixture), **MOM-100** (CI: pin actions by SHA, one Node version, fewer duplicate runs). |
| **Not scheduled, still recommended** | MOM-74 (retire `HEVY_API_KEY`; delete it from Vercel Production afterwards), MOM-91 (`connection()` instead of `force-dynamic`; the selected-channel URL depends on the page being rendered per request), MOM-95 (duplicated desktop controls), MOM-96 (audit jsdom tests for races on server-action results), MOM-97 (revoke at Google on disconnect, sign the state cookie), MOM-70 (field-level encryption of stored provider secrets). |
| **Not scheduled, product decisions** | MOM-79 (tick a goal criterion; also the only way to make the 7 criteria real), MOM-80 (review the drafted criteria), MOM-81 (plan-shape rules, including giving the generator the goal's criteria), MOM-82 (unused `createGoalChannel`), MOM-85 (reopen older completed tasks), MOM-89 (paused and finished goals are invisible), MOM-90 with MOM-53 (move the day-90 checkpoint when the plan cannot hold), MOM-20 to MOM-26 (schema), MOM-33 (AI chat), MOM-71 and MOM-72 (workout task type, matching activity to planned tasks). |
| **Product risks live in the RAID log** | This table covers decisions for this build cycle. Product risks, assumptions, issues and dependencies (privacy of goal data, stored tokens and health data, model cost, CI, automated sync acting without a session) are in `docs/RAID_LOG.md`, and AI misses in `docs/FAILURE_LOG.md`; both are reviewed in step D every day-end (MOM-92). |
| **Pull requests, not direct pushes** | `main` is protected (MOM-67): every change reaches it through a pull request with `checks` and `database` green, merged with a merge commit. `/run-block` commits on a feature branch and never merges; `/day-end` pushes the day's branches once, after your OK. A production migration is applied before its pull request merges (merging deploys to Vercel). |
