# 🚀 MOMENTUM BUILD: NEXT-PHASE MASTER EXECUTION PLAN

> **Date:** 2026-10-27 | **Active Epic:** MOM-105 | **Base Commit:** a1ce411

> **Since the 2026-10-24 plan:** the five safe blocks were built on 2026-10-26 and go through pull requests at that day-end: MOM-68 (ignore rules), MOM-65 (migration 012, revoke EXECUTE on two trigger functions), MOM-66 (`supabase/verify/900_table_grants.sql`), MOM-93 (could-not-load state on home) and MOM-103 (could-not-load state on Connected Apps). The goal model (`docs/DOMAIN_MODEL.md`, EPIC 6 MOM-105) was approved the same day; this is **build day 1 of N = 5** for its thin slice, with a checkpoint at the end of build day 3. New tickets from the day-end sync: **MOM-119** (tighten API-role table grants; not scheduled) and **MOM-120** (the e2e "destination stream errored" noise). Once migration 012 is applied, production verification is **272 checks across 11 scripts** in `supabase/verify/`; the next free migration number is **013**; production holds exactly one user (the standing smoke-test account).

---

## Today's runbook

**How to run a day.** Type `/day-start` first: it only reads and reports. Then type the command in the table below for each block, in this order, and skip any block whose Jira ticket is already Done. Each command first shows the block's model and effort: if your session differs, it stops and tells you the exact `/model` and `/effort` to type (use the session-only choice in the `/effort` slider, so your saved default is left alone), and you start the command again. Run `/clear` between blocks. When the last block is done, type `/day-end`. Nothing is pushed, merged or applied to production without your explicit OK, and work reaches `main` only through a pull request once both CI jobs are green.

| # | Type | Session setting | What to check at the gate |
| --- | --- | --- | --- |
| 0 | `/day-start` | Sonnet / Low | It reports a clean tree, `main` matching `origin/main` with all of 2026-10-26's pull requests merged, no leftover branches, the plan passing its format check, and no missing environment variable names. |
| 1 | `/run-block MOM-107` | Sonnet / High | You approved the table design before the migration was written; every new table has row level security, explicit grants and an entry in the grants allow-list; the local verify scripts pass; the CLI showed migration 013 and the dry run and did not push. |
| 2 | `/run-block MOM-108` | Sonnet / High | You approved the rule list before coding; every rule in `docs/DOMAIN_MODEL.md` §1.3, §1.4 and §1.7 maps to at least one unit test; the engine has no database, network, Claude or clock call; a habit shortfall is never owed the next week. |
| 3 | `/run-block MOM-116` | Sonnet / Medium | Every service a trial tester touches is listed with its minimum age and the source it came from; nothing personal about any tester is written down; you decided what the findings mean for the trial. |
| 4 | `/run-block MOM-64` | Sonnet / High | You set up the CAPTCHA and the redirect address before the block built on them; the password reset works end to end on the local stack; asking for a reset for an unknown address gives the same answer; the sidebar shows who is signed in. |
| 5 | `/run-block MOM-104` | Sonnet / Medium | Each of the eight friction points is fixed or explicitly left with a reason; `npm run plan` fails when an open item has no key (or step A hands such items to step D); `/run-block`'s close-out names the next command; the plan check wants the `/day-start` and `/day-end` rows. |
| 6 | `/run-block MOM-120` | Sonnet / Medium | The cause of "destination stream errored" is written on the ticket; three browser-test runs show no such line; the wizard specs still cover the same behaviour. |
| 7 | `/day-end` | Opus / High | The day's branches pass their checks, migration 013 is applied to production after CI is green and your OK and before its pull request merges, and every verify script passes on production. |

If a block needs another ticket's code, `/run-block` checks that code is already in `origin/main`. If it is only on an unmerged branch, it stops and offers two ways forward: push that branch and merge its pull request first, or stack this block on that branch (only with your OK). Session 1 needs 2026-10-26's pull requests merged (migration 012 and the grants check); no block in this plan needs another block of this plan.

---

## Executive Overview & Architectural Invariants

This build day starts the goal-model thin slice: the smallest build that lets three people run kill criteria 1 to 4 in a two-week family trial (`docs/design/2026-10-26-goal-model-design.md` §6.1). Session 1 lays the two foundations every later piece stands on: the new tables (MOM-107) and the engine that computes the scoreboard from entries (MOM-108). They are independent today, because the engine takes plain inputs and a later piece (MOM-112) maps rows onto them. Session 2 starts the trial prerequisites: the age-terms check for a minor tester (MOM-116) and password reset with sign-up protection (MOM-64). Session 3 sits outside N: it removes the day-loop friction found so far (MOM-104) and the e2e noise (MOM-120). The privacy notice (MOM-102) waits until the new tables have merged, because it states what they store.

`docs/DOMAIN_MODEL.md` is binding for all new code. The old model stays in the code until MOM-115 retires it, so new code is built beside the old tables, never into them. Every block preserves these invariants:

1. **Claude never scores.** The engine computes every number from entries and the target in force; nothing in `lib/engine/` or the new tables calls Claude, and no Claude output is stored as a number (DOMAIN_MODEL §1.7, principle 9).
2. **The person's word beats any source.** Entries are never edited by the engine; corrections are keyed to the source's own record id, so a resync never undoes them (§1.5, §1.6).
3. **Never assume anything about a person's life.** Time zone, week start and day end are the person's to set: the engine takes them as required inputs and the tables have no silent default for them (principle 1).
4. **Unfinished work moves, habits never carry over.** Milestone and deadline-task steps move forward and are never cut silently; a habit shortfall is never owed the next period (§1.4, principle 11).
5. **Service-layer RLS enforcement.** The UI never queries Supabase. Every new table has row level security keyed to its owner, explicit grants (this project grants nothing to API roles by default, the MOM-37 lesson) and an entry in `supabase/verify/900_table_grants.sql`'s allow-list, which fails on an unlisted table.
6. **The old model's guards stay until MOM-115.** The completion guard (migrations 002 and 008) and the append-only `task_rebalance_history` keep protecting the old tables; nothing today edits an applied migration or an old table.

## Standing Rules (every prompt below repeats what it needs)

- **Read the Jira ticket first.** If its title, scope or acceptance criteria disagree with the prompt, or the prompt disagrees with `docs/DOMAIN_MODEL.md`, stop and flag it.
- **Production changes need your approval.** A prompt stops before `supabase db push`, `vercel env`, or any push to `origin`, shows what will happen, and waits. Never use the SQL Editor. Tests never run against production and never use production credentials.
- **Database checks are not part of `npm test`.** The 272 checks live in 11 SQL scripts in `supabase/verify/` and run with `npm run verify:sql` (local stack) or, against production, with the step B loop. After any migration, run **all** of them; every row must show `passed = true`.
- **New migrations use the numbers this plan assigns:** MOM-107 takes **013**. No other block in this plan adds a migration. Never edit an applied migration.
- **Pull requests, not local merges.** `main` is protected: work reaches it only through a pull request with the CI jobs `checks` and `database` green, merged with a merge commit (CLAUDE.md). A block commits on its feature branch and stops: it never merges into `main` and never pushes. Branches are pushed once, at day-end (step F), after your explicit OK.
- **A migration is applied before its pull request merges.** A block with a migration runs `npm run verify:sql` locally, shows the migration and `npx supabase db push --dry-run`, and stops. At day-end step F, once CI is green on its pull request and you say OK, the production `db push` and then ALL the verify scripts run, before that pull request merges (merging deploys to Vercel, and the new code needs the new schema).
- **Backlog edits can collide.** Each block edits `BACKLOG.md` on its own branch. Add new items next to the block's own ticket's items, not all at the very end, so two branches do not edit neighbouring lines. If two pull requests still conflict, day-end step F merges `origin/main` into the later branch locally, keeps both sides, and pushes that with your OK.
- **Known noise (until MOM-120 is done).** `npm run test:e2e` makes the dev server print "The destination stream errored while writing data" (digest 3200485758) during the wizard specs. It predates 2026-10-26 and the tests pass. Report it as known noise, not as a failure; any other server error in the same output is still a failure.
- **Standing smoke-test account.** Production keeps ONE standing test account, `smoke-test@momentum-app.test`, created by you in the Supabase dashboard (Authentication → Add user, Auto Confirm User on). Its password lives only in your password manager: Claude never asks for it, prints it or stores it in the repo, and never creates, edits or deletes users on production. Every live sign-in check in this plan says "sign in as the standing smoke-test account". Claude may read its data with **count-only** queries. If its data gets cluttered, you delete and recreate it in the dashboard (it starts empty). The SQL verify scripts create and delete their own passwordless temporary users inside one transaction and leave nothing behind, so production should always hold exactly one user. Browser tests use throwaway users on the **local** stack only.
- **The repo is public.** Anything written to a committed file (logs, docs, tests, fixtures) names categories, never secrets, personal data or exploit steps. Trial testers are described by role only ("the owner", "two household testers, one a minor").

## Session Preflight (run before every block)

`/run-block` does this for you, one command at a time. By hand:

```bash
cd C:\Users\matth\momentum-app
git status --short          # expect a clean tree (AGENTS.md and the Supabase folders are git-ignored since MOM-68); only your uncommitted docs/FAILURE_LOG.md and docs/RAID_LOG.md may also show; anything else, even an untracked file, stops the block
git fetch origin
git rev-parse main origin/main   # the two must match. If main is only behind: git switch main, then git pull --ff-only (each on its own)
npm run plan -- MOM-<n>           # optional: the generator's view of the ticket
npm run plan:check -- --block MOM-<n>   # optional: what this plan says about the block (config, prompt lines, gate)
```

---

## High-Priority Ticket Sequence & Session Blocks

```text
SESSION 1: GOAL MODEL FOUNDATIONS (MOM-107, MOM-108)   thin slice, build day 1 of 5
  - The new tables by migration 013, then the scoreboard engine as pure functions
SESSION 2: TRIAL PREREQUISITES (MOM-116, MOM-64)       thin slice piece 11
  - The age terms of every service a tester touches, then password reset and sign-up protection
SESSION 3: DAY-LOOP HOUSEKEEPING (MOM-104, MOM-120)    outside N
  - The day-end and run-block friction points, then the e2e stream noise
```

*Order matters. MOM-107 comes first because it is the only migration and the slowest gate (you approve the table design before anything is written). MOM-108 does not need MOM-107's code: it takes plain inputs defined from `docs/DOMAIN_MODEL.md`, and MOM-112 maps rows onto them later. The design record sizes each of the two at two blocks, but a key may head only one block in a plan, so each block stops at a committed, green point if it runs long and its ticket stays open for the rest. MOM-116 comes before MOM-64 because it is short and its answer decides whether the minor tester can join at all. MOM-64 needs your CAPTCHA set-up first, which the session prerequisites give you time for. Session 3 is housekeeping and does not count toward N. Safe stopping points: after each block. If the day runs short, Session 3 drops first, then MOM-64.*

---

# SESSION 1: GOAL MODEL FOUNDATIONS

**Your prerequisites before this session:** (1) All of 2026-10-26's pull requests are merged, so `origin/main` has migration 012 (MOM-65) and `supabase/verify/900_table_grants.sql` (MOM-66); `/day-start` shows it. (2) Docker Desktop running for Block 1.1 (local Supabase stack, `npx supabase start`). (3) Be ready to review the table design in Block 1.1 and the rule list in Block 1.2; each block stops for your OK before writing code. Nothing on production is touched in this session; migration 013 is applied at day-end step F.

## Block 1.1: Add the Goal Model Tables (MOM-107)

* **Objective & Scope:** Add the new model's tables beside the old ones, by migration **013**: person facts and settings (time anchors, usual capacity per day type, protected priorities, handling preferences, "How Momentum talks to me" settings), goals (why, shape, active or parked with its return condition, default completion mode and tone), targets (measure and unit, effort or outcome role, period, floor and optional aspiration, optional qualifying threshold, carry-over kind, completion mode), work items of three kinds (habits, milestones with steps, deadline tasks with a due date and whether it can move), sources and their bindings to targets, entries and corrections, and closed-period snapshots that store the target each period was judged by. Row level security, explicit grants, the grants allow-list, a verify script and central types. Out of slice 1 (design §6.1): stretch levels, safety ceilings, ramping levels, dated capacity exceptions, monthly periods and standing merge rules: leave room for them, build none.
* **Core Invariants to Protect:** *Service RLS*: every table is owned by one person and isolated by RLS; explicit grants only; every new table is in the 900 allow-list. *The person's word beats any source*: corrections are unique per source and source record id, and entries carry no computed totals. *Never assume*: time anchors have no silent default. *Old model untouched*: no change to `goal_channels`, `micro_tasks`, `task_rebalance_history` or any applied migration.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-107: add the goal model tables (person facts, goals, targets, work items, entries).

Task Instructions:
1. Read ticket MOM-107 in Jira first; its acceptance criteria are the definition of done. If it, these instructions and docs/DOMAIN_MODEL.md disagree, stop and flag it.
2. Read CLAUDE.md, docs/DOMAIN_MODEL.md (sections 1 and 4, and principles 1, 3, 9 and 11), docs/design/2026-10-26-goal-model-design.md §6.1 (what is in and out of slice 1), migrations 001, 003, 006 and 011 (how tables, RLS and grants are written here), supabase/verify/011_llm_usage_logs.sql and supabase/verify/900_table_grants.sql (script style and the allow-list), scripts/run-sql-verify.ts, tests/migrations.test.ts, types/database.types.ts, and the BACKLOG.md items under MOM-107 and MOM-119.
3. Check that migration 012 and supabase/verify/900_table_grants.sql are in origin/main. If either is missing, stop: this block must not run before 2026-10-26's pull requests have merged.
4. Create the feature branch `feature/MOM-107-goal-model-tables` off an up-to-date `main`.
5. Design before writing SQL, then STOP for my OK: list each new table with its columns, types, constraints, foreign keys, indexes, RLS policies and grants per API role, and say for each column which DOMAIN_MODEL rule it serves. Name tables so they cannot be confused with the old model's (`goal_channels`, `micro_tasks`). Say which slice-1 exclusions you left room for and how. Flag anything in DOMAIN_MODEL.md that the tables cannot express. Do not invent defaults for time zone, week start or day end. Wait for my answer.
6. Write supabase/migrations/013_goal_model_tables.sql (the number is fixed by the plan; do not pick another) as approved: RLS on every table keyed to the owning user, explicit grants only for what the service layer will need, nothing granted to `anon`. The default privileges may hand API roles TRUNCATE, REFERENCES and TRIGGER on a new table: revoke those on every new table in the same migration (MOM-119 tightens the old tables later). Add every new table to the allow-list in supabase/verify/900_table_grants.sql.
7. Add supabase/verify/013_goal_model_tables.sql in the style of the existing scripts (one transaction, rolled back, no leftover rows, safe to run against production): each table has RLS on; one user cannot read or write another's rows; the key constraints hold (for example a correction is unique per source and source record id, a closed-period snapshot keeps its target after the target changes); API-role grants are exactly the approved ones.
8. Add the new tables to types/database.types.ts by hand, in the style of the existing entries (generated types are MOM-26). No service functions and no UI in this block: those come with MOM-110 and MOM-112.
9. Tests: extend tests/migrations.test.ts for migration 013 in the way it checks other migrations.
10. Verify locally: `npx supabase db reset --local`, then `npm run verify:sql`; every script must pass, including 900 with the new tables listed.
11. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass.
12. If the scope runs long, stop at a committed point where every check above passes, and tell me exactly what remains; the ticket stays open and the next plan carries the rest.
13. STOP before production, and do NOT run `supabase db push`. Show me the migration and `npx supabase db push --dry-run`. Say plainly: the production push and then ALL the verify scripts run at day-end step F, after CI is green on this branch's pull request and I say OK, and before the pull request merges.
14. Update BACKLOG.md for MOM-107, next to its existing item. Comment on MOM-107 in Jira with what changed, each acceptance criterion met or unmet and how verified; do not move it to Done.
15. Commit with "feat(MOM-107): add the goal model tables". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes; npm run verify:sql passes locally; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented.
```

* **User Verification Gate:**
  - [ ] You approved the table design before any SQL was written, and nothing assumes a time zone, week start or day end.
  - [ ] `npm run verify:sql` passes with the new script and with every new table in the grants allow-list.
  - [ ] No old table and no applied migration changed (`git diff origin/main --stat` lists only new files, `900_table_grants.sql`, `types/database.types.ts`, `tests/migrations.test.ts` and `BACKLOG.md`).
  - [ ] You saw migration 013 and the dry run, and nothing was pushed.
  - [ ] After day-end step F applies it: every production verify script passes, and production still holds exactly one user.

---

## Block 1.2: Build the Scoreboard Engine (MOM-108)

* **Objective & Scope:** The engine computes the scoreboard from entries and never stores a typed number. Pure functions in a new `lib/engine/` with heavy unit tests: the per-target result for a period for each measure (count, quantity, time, checklist progress), partial credit, the qualifying threshold and "count anyway", removed entries left out, carry-over by kind (habits never, cumulative targets owed until the deadline, unfinished milestone and deadline-task steps moved forward), threshold crossings (step, floor, aspiration, block end), holding and slipping patterns, re-baseline without re-grading closed periods, outcome targets shown as count and trend with no level unless the person set one, and the deadline forecast (remaining work against remaining capacity, tolerating rough data, said plainly).
* **Core Invariants to Protect:** *Claude never scores*: no Claude, database, network or clock call in `lib/engine/`; "today" and the person's time anchors are inputs. *Never assume*: no default time zone, week start or day end. *Habits never carry over*. *Principle 12*: the forecast says whether work fits, never which slot or how many free minutes.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-108: build the scoreboard engine (computed targets, carry-over, crossings, forecast).

Task Instructions:
1. Read ticket MOM-108 in Jira first; its acceptance criteria are the definition of done. If it, these instructions and docs/DOMAIN_MODEL.md disagree, stop and flag it.
2. Read CLAUDE.md, docs/DOMAIN_MODEL.md (sections 1.3, 1.4, 1.6, 1.7, 3.2 and the principles in 4.2), docs/design/2026-10-26-goal-model-design.md §6.1 (what is out of slice 1), types/channelViews.ts (how non-database types live in types/), and two existing pure-logic modules with their tests for style (lib/goals/criteria.ts, lib/goals/taskPlan.ts).
3. Create the feature branch `feature/MOM-108-scoreboard-engine` off an up-to-date `main`. This block does not need MOM-107's code: define the engine's input and output types from DOMAIN_MODEL.md in a new types/scoreboard.ts, not from database rows. MOM-112 maps rows onto them later.
4. Design before coding, then STOP for my OK: list every rule you will implement, each with its DOMAIN_MODEL section, the function that implements it and the unit tests that prove it (including the edge cases: a period with no entries, an entry exactly at the qualifying threshold, a target changed mid-block, a deadline already passed, a person whose week starts on a day other than Monday, a time zone far from UTC). List the exported functions and types. Say which slice-1 exclusions (stretch, ceilings, ramping, dated capacity exceptions, monthly periods) you leave out. Wait for my answer.
5. Build lib/engine/ as approved. Rules: no import of Supabase, Claude, fetch or a clock; "today" and the person's time zone, week start and day end are required inputs with no default; results carry facts (numbers, crossings, patterns, forecast verdicts), never wording for the person (Claude writes words around facts, later).
6. Tests in tests/engine-*.test.ts: every rule from step 4 has at least one test; include a test that a habit shortfall is not owed the next period, that a closed period keeps the result it was judged by after the target changes, that "count anyway" counts a below-threshold entry and a removed entry is not counted, and that the forecast never returns a slot or a count of free minutes.
7. Add a source-level test that lib/engine/ imports nothing from lib/services, lib/supabase, lib/ai or any network or model package.
8. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass.
9. If the scope runs long, stop at a committed point where every check above passes, and tell me exactly which rules remain; the ticket stays open and the next plan carries the rest.
10. Update BACKLOG.md for MOM-108, next to its existing item. Comment on MOM-108 in Jira with the rule list, each acceptance criterion met or unmet and how verified; do not move it to Done.
11. Commit with "feat(MOM-108): add the scoreboard engine as pure functions". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented.
```

* **User Verification Gate:**
  - [ ] You approved the rule list, with each rule traced to a DOMAIN_MODEL section, before any code was written.
  - [ ] `npm test` passes, including the engine tests and the import test; the engine takes "today" and the person's time anchors as inputs.
  - [ ] A habit shortfall is not owed the next week, and a closed week keeps its result after a target change (read the two tests).
  - [ ] Any rules left for another block are listed on the ticket.

---

# SESSION 2: TRIAL PREREQUISITES

**Your prerequisites before this session:** (1) For Block 2.1, know which services a household tester would touch in the trial (for example the app itself, its sign-in email, and whether any connected app is used); the block describes testers by role only. (2) For Block 2.2, **before the block builds on them**: pick a CAPTCHA provider that Supabase Auth supports (Cloudflare Turnstile or hCaptcha) and create a site; you will paste the **secret** into the Supabase dashboard (Authentication → Attack Protection) yourself, and the **site key** (public by design) goes in as an environment variable that the CLI names for you. Also add `https://momentum-app-eight-chi.vercel.app/auth/reset` and `http://localhost:3000/auth/reset` to the Auth redirect allow-list. The CLI never sees the secret. (3) Docker Desktop running and `npm run dev` stopped for the browser tests in Block 2.2.

## Block 2.1: Check the Age Terms of Every Service a Trial Tester Touches (MOM-116)

* **Objective & Scope:** One household tester in the family trial is a minor (RAID R-14). Before they join, list every service their use of Momentum touches (hosting, database and auth, the Claude API that setup and the weekly review call, email delivery, and any connected app) with that service's minimum age or its rules for products used by minors, quoted from the service's own current terms with the link and the date read. This is a check, not code: the owner decides what the findings mean.
* **Core Invariants to Protect:** *The repo is public*: testers by role only, no names, ages or other personal detail anywhere. *No guessing*: a term that cannot be found is reported as not found, never assumed.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-116: check the age terms of every service before a minor joins the family trial.

Task Instructions:
1. Read ticket MOM-116 in Jira first; its acceptance criteria are the definition of done. If it disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md (the public-repo rules), docs/design/2026-10-26-goal-model-design.md §5.2 (family trial safeguards), docs/RAID_LOG.md R-14, docs/LLM_GOVERNANCE.md, docs/INTEGRATIONS_SPEC.md and lib/config/env.ts (which services the app calls), and the BACKLOG.md item under MOM-116.
3. Create the feature branch `feature/MOM-116-age-terms-check` off an up-to-date `main`.
4. From the code and docs, list every service a tester's use of Momentum touches, and show me the list. Ask me which of them a household tester will actually use in the trial (for example whether any connected app is used). Wait for my answer.
5. For each service on the agreed list, find its current terms on its own website: the minimum age to use it, and any rule for products built on it that minors use (for example an API provider's rules for developers whose users include minors). Quote the exact sentence, give the link and the date you read it. Where you cannot find a term, write "not found" and say where you looked; never assume.
6. Write docs/trial/AGE_TERMS_CHECK.md: a table of service, what the tester's use sends to it, the quoted term, link, date read, and what it means for a minor tester in plain words; then a short list of open questions for me. Testers by role only; no personal detail. Say plainly that this is not legal advice.
7. Run `npm test`; it must pass.
8. Update BACKLOG.md for MOM-116 and RAID_LOG.md R-14 only if I ask. Comment on MOM-116 in Jira with the findings summary and each acceptance criterion met or unmet; do not move it to Done.
9. Commit with "docs(MOM-116): record the age terms of every service a trial tester touches". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; npm test passes; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented.
```

* **User Verification Gate:**
  - [ ] You agreed the list of services a tester touches before the terms were looked up.
  - [ ] Each service has a quoted term, a link and the date read, or "not found" with where it looked.
  - [ ] The document names no tester and no personal detail.
  - [ ] You decided what the findings mean for the trial (recorded on MOM-116).

---

## Block 2.2: Password Reset, Sign-Up Abuse Protection and a Signed-In Indicator (MOM-64)

* **Objective & Scope:** Sign-in is email and password only: a user who forgets their password has no way back, sign-up has no throttling or CAPTCHA, and the sidebar does not show who is signed in (Settings already shows the email; check what the sidebar and mobile header do). Build the password reset (request form on `/login`, emailed link, a page to set a new password), CAPTCHA support on sign-up and sign-in that switches on only when its public site key is configured, and the signed-in indicator. OAuth providers are out of scope. This is a trial prerequisite (design §6.1 piece 11).
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
10. Run `npx tsc --noEmit`, `npm test`, `npm run build` and `npm run test:e2e` (Docker running, `npm run dev` stopped); all must pass. The "destination stream errored" line during the wizard specs is known noise (MOM-120); any other server error is a failure.
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

# SESSION 3: DAY-LOOP HOUSEKEEPING

**Your prerequisites before this session:** none for Block 3.1. Docker Desktop running and `npm run dev` stopped for Block 3.2 (browser tests). This session does not count toward the thin slice's N.

## Block 3.1: Fix the Day-Loop Friction Points (MOM-104)

* **Objective & Scope:** Eight friction points in `/day-end`, `/run-block` and the plan check, listed in MOM-104's description (1 to 4) and its 2026-10-26 comment (5 to 8): the step 0 stop rule; the "since midnight" window; Git Bash rewriting `curl -w` format strings; uncommitted log edits blocking branch switches; step A failing on items a block just logged while `npm run plan` exits 0; `/run-block`'s close-out naming the next command with its model and effort; the runbook's `/day-start` and `/day-end` rows, enforced by the plan check; and `/day-end` ending with "Tomorrow: /day-start (Sonnet / Low)".
* **Core Invariants to Protect:** *Safety rules of the day loop*: no command may gain the power to push, merge, apply a migration or stage the log files without the owner's OK; `.claude/settings.json` permissions do not widen. *The plan contract*: `npm run plan:check -- --strict` still passes on `docs/plans/NEXT_BUILD_PLAN.md`.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-104: fix the friction points found in the /day-end runs.

Task Instructions:
1. Read ticket MOM-104 in Jira first, with its comments: the description lists points 1 to 4 and the 2026-10-26 comment adds points 5 to 8 with proposed acceptance criteria. If anything disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md (Daily Build Loop and the RAID and Failure Logs section), .claude/commands/day-start.md, run-block.md and day-end.md, .claude/settings.json, scripts/check-plan-format.ts with tests/build-plan-format.test.ts and tests/fixtures/, scripts/generate-execution-plan.ts with tests/plan-generator.test.ts, docs/mom-75-plan-execution-spec.md (sections 2, 3 and 9), the day-end sections of docs/plans/NEXT_BUILD_PLAN.md, docs/FAILURE_LOG.md F-016 and F-022, and the BACKLOG.md items under MOM-104.
3. Create the feature branch `feature/MOM-104-day-loop-friction` off an up-to-date `main`.
4. For each of the eight points, show me the change you propose (file and wording), and for point 5 recommend one option: `npm run plan` exits non-zero when an open item has no key, or step A reports such items as handed to step D. For point 7 recommend whether a missing `/day-start` or `/day-end` row is an error or a warning (a warning still fails `--strict`, which step E runs). STOP and wait for my OK.
5. Make the approved changes in .claude/commands/, scripts/ and docs/mom-75-plan-execution-spec.md (record each in section 9, "As built"). Do NOT edit docs/plans/NEXT_BUILD_PLAN.md: the next day-end's step E rewrites it. Instead, write the exact new wording for the plan's day-end sections (A, B, D, E, F, C) into the Jira comment in step 8, so step E can carry it into the next plan.
6. Tests: fixtures and cases in tests/build-plan-format.test.ts for the runbook rows, and in tests/plan-generator.test.ts for the exit code if you chose that option. Show a failing case once, then the fix.
7. Run `npx tsc --noEmit`, `npm test`, `npm run build` and `npm run plan:check -- --strict`; all must pass.
8. Update BACKLOG.md for MOM-104 (tick what is done, next to its items). Comment on MOM-104 in Jira with each point and acceptance criterion met or unmet, and the new day-end wording from step 5; do not move it to Done.
9. Commit with "fix(MOM-104): remove the day-loop friction points". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes; npm run plan:check -- --strict passes; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented.
```

* **User Verification Gate:**
  - [ ] You approved the change for each of the eight points, including the choice for point 5 and point 7.
  - [ ] No command gained a push, merge, migration or log-staging power, and `.claude/settings.json` permissions did not widen (`git diff origin/main -- .claude/settings.json` is empty).
  - [ ] `npm run plan:check -- --strict` passes, and a test shows a runbook without the `/day-start` or `/day-end` row being flagged.
  - [ ] The new day-end wording for the plan is on the MOM-104 ticket for the next step E.

---

## Block 3.2: Trace and Silence the e2e Stream Noise (MOM-120)

* **Objective & Scope:** During `npm run test:e2e` the dev server prints "The destination stream errored while writing data" (digest 3200485758) twice, while the wizard specs run. The tests pass and `main`'s CI shows it too. Find which request's stream errors and why, and fix the cause; filtering the message is not a fix. The old wizard is retired later by MOM-115, so prefer the smallest correct fix and say if the cause lies in code MOM-115 removes.
* **Core Invariants to Protect:** *Test coverage*: the wizard specs keep covering the same behaviour (failure, Try again, the wait message, the starter plan, Create, the goal in the picker). *Human-only completion*: no change to completion logic.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-120: trace and silence the "destination stream errored" message in the e2e wizard specs.

Task Instructions:
1. Read ticket MOM-120 in Jira first; its acceptance criteria are the definition of done. If it disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, playwright.config.ts, tests/e2e/wizard.spec.ts, tests/e2e/fixtures.ts and tests/e2e/support/, the wizard components under components/goals/ and the server actions and services the wizard calls (follow the imports), and the BACKLOG.md item under MOM-120.
3. Create the feature branch `feature/MOM-120-e2e-stream-noise` off an up-to-date `main`.
4. Reproduce it: Docker running, `npm run dev` stopped, run only the wizard spec and capture the dev server's output around each occurrence. Find which request is being written to when the stream errors (page, route or server action) and what the test does at that moment (navigates, closes the page, aborts a request). Show me the cause and your proposed fix, and say whether the fix belongs in the app or in the spec and whether MOM-115 would remove the code involved. STOP and wait for my OK.
5. Make the approved fix. Do not filter, mute or redirect the server log to hide the message.
6. Run `npm run test:e2e` three times; none of the runs may print "destination stream errored", and all tests must pass. Then run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass.
7. Update BACKLOG.md for MOM-120 (tick it). Comment on MOM-120 in Jira with the cause, the fix and each acceptance criterion met or unmet; note that the "known noise" standing rule can leave the next plan once this merges. Do not move it to Done.
8. Commit with "fix(MOM-120): stop the stream error in the e2e wizard specs". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes; npm run test:e2e passes three times with no stream error; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented.
```

* **User Verification Gate:**
  - [ ] You read the cause and approved the fix before it was made, and the fix does not hide the log line.
  - [ ] Three browser-test runs pass with no "destination stream errored" line.
  - [ ] The wizard specs still cover the same steps (compare the spec's test names before and after).

---

# FINAL DAY-END BUILD VERIFICATION & PULL REQUESTS

Run after the last block of the day, or type `/day-end` and let it run these in this order: **A, B, D, E, then F (the one push, after your OK), then C (live checks, after the pull requests have merged and Vercel has deployed)**. Stop on the first failure. When the whole sequence has finished and you say so, `/day-end` ends with the line `Tomorrow: /day-start (Sonnet / Low)`.

**The build day's window.** The day starts at the previous day-end's last merge, not at midnight, so a day-end that runs past midnight sees the same work. It is the newest merge on `origin/main` of a step E branch, found by the branch name, which always ends in `-next-build-plan-doc`: `git log origin/main --merges -n 1 --grep="next-build-plan-doc" --format="%h %cI %s"`. `/day-end` prints it as `Window: after <hash> (<date>, <subject>)` at the start and reuses that hash in steps B, D and F (it never recomputes it, because today's own step E branch will have merged by then). If there is none, you give a start date. Below, `<window>` means that hash.

**When there is nothing to sync.** `/day-end` stops at the start only if all four hold: no unmerged branches; no open backlog item without a Jira key; no entry marked `unreviewed` in the two logs; and no ticket with commits on `origin/main` in the window that Jira still shows as neither Done nor Closed. It names each condition, and says which ones kept the run going.

**Your log edits and branch switches.** If you hold uncommitted edits to `docs/FAILURE_LOG.md` or `docs/RAID_LOG.md` and a branch's copy of either file differs, a plain `git switch` aborts. Before each switch `/day-end` checks for this, says so in plain words, backs both files up, stashes them (`git stash push -- <the two files>`), switches and pops. If the pop conflicts, it stops, restores from the backup and asks you. It never stages a log file for this; only the entries you approve in step D are staged.

## A. Build and repository checks (PowerShell or Git Bash)

`/day-end` runs this. A feature branch is checked on its own, because nothing has been merged into `main` locally. List the day's branches, then check each one in turn; docs-only branches (D and E) need only `npm test` and `npm run plan`. Read the whole output of each command, never a filtered part of it.

```bash
cd C:\Users\matth\momentum-app
git status --short                                  # a clean tree; only your uncommitted docs/FAILURE_LOG.md and docs/RAID_LOG.md may also show
git branch --no-merged origin/main                   # the day's feature branches: work not yet in origin/main
# then, on each of those branches, one at a time:
git switch <branch>                                  # see "Your log edits and branch switches" above
npx tsc --noEmit                                    # expect no output
npm test                                            # expect all passing
npm run build                                       # expect "Compiled successfully"
npm run plan                                        # always exits 0: read its closing lines
```

`npm run plan` ends with "Every open item has a Jira key." or lists the items without one. On a block's own branch, an unkeyed item is expected: the block logged it and step D gives it a key, so step A lists it as "handed to step D" and does not fail the branch. Step D's Definition of Done is where every open item must have a key.

`npm run test:e2e` and `npm run verify:sql` also run in CI on every pull request. Run them here too for a branch that changed pages, auth, the wizard, the drawer or a migration (stop `npm run dev` first). Until MOM-120 merges, "The destination stream errored while writing data" during the wizard specs is known noise; any other server error is a failure.

## B. Database verification (production), only if migrations were applied in the window

A migration is applied to production inside its own block (after CI is green on its pull request and your OK, before that pull request merges). B is the day's re-check of production once all blocks are done. A migration is in the window when `git log --branches --remotes --not <window> --name-only --format=%h -- supabase/migrations` lists a file. **Git Bash only.** This loop uses `/tmp`, `grep`, `$(...)` and `for ... done`, which do not work in PowerShell. `npm test` does **not** run these scripts. Every script must report `false 0` and a non-zero `true` count (0 and 0 means the script errored).

```bash
npx supabase migration list                         # local and remote columns must match for every migration
T=0; F=0
for f in supabase/verify/*.sql; do
  npx supabase db query --linked -f "$f" -o table > /tmp/v.txt 2>&1
  t=$(grep -cE '│ true ' /tmp/v.txt); fl=$(grep -cE '│ false ' /tmp/v.txt)
  echo "$(basename $f): true $t false $fl"; T=$((T+t)); F=$((F+fl))
done; echo "TOTAL true $T false $F"                 # expect false 0 and true = every check in supabase/verify/ (272 across 11 scripts after migration 012 and the grants check, plus any added today)
npx supabase db query --linked -o table "select count(*) as users from auth.users"   # expect 1: only the standing smoke-test account
```


## D. Automated End-of-Day Backlog, Obsolescence & Jira Sync (copy-paste)

```text
Perform end-of-day backlog synchronization, obsolescence audit, and ticket generation.

Task Instructions:
1. Scan BACKLOG.md, ROADMAP.md, code TODO tags and the window's commits (`git log --branches --remotes --not <window> --no-merges`, the window being the one `/day-end` printed at its start) for newly discovered gaps, TODOs or deferred items. Run `npm run plan` and treat every open item without a Jira key as un-ticketed.
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
   - A "Today's runbook" section near the top, after the metadata header and before the first block: a table with one row per block, in order, giving `/run-block MOM-n`, the session setting (model / effort) and, in plain words, what to check at the gate. The table's first row is `/day-start` (Sonnet / Low) and its last row is `/day-end` (Opus / High), each with its own plain-words gate text; `npm run plan:check -- --strict` warns when either is missing or out of place. The text above the table also says that `/day-start` comes first and `/day-end` last.
   - Logical Session Blocks grouping high-priority tickets, in dependency order, each in the format `npm run plan:check` enforces: a heading `## Block <n>.<m>: <title> (MOM-<n>)` with exactly one ticket key (unique in the plan); a `* **CLI Session Config:** Model: X | Effort: Y` line; exactly one fenced `text` prompt that names its ticket and carries a commit message `type(MOM-n): ...`; and a `* **User Verification Gate:**` checklist. Before each session's first block, a `**Your prerequisites before this session:**` note (it may say none).
   - Block prompts that follow the pull-request workflow (CLAUDE.md): create the feature branch off an up-to-date `main`; commit on it with the Jira key; do NOT merge into `main` and do NOT push (the one push is at day-end, step F, after my OK); end with "Definition of Done: ...; committed on the feature branch." A block with a migration says: run `npm run verify:sql` locally, show the migration and `npx supabase db push --dry-run`, and run production `db push` and then ALL the verify scripts only after CI is green on its pull request and I say OK, and before that pull request merges (merging deploys to Vercel). A block that needs another ticket's code says it "must already be in origin/main" and stops if it is not.
   - Dynamic CLI Session Config (Sonnet / High for architecture, security and database work; Sonnet / Medium or Low for standard UI and tests).
   - Copy-pasteable prompts including tsc --noEmit, npm test, npm run build, feature branching with the commit left on the feature branch (never merged into `main` locally and never pushed; `main` takes it through a pull request, see the pull-request bullet above), BACKLOG.md and Jira updates.
   - User Verification Gates for each block.
   - Final Day-End Build Verification & Pull Requests section (steps A, B, D, E, then F the one push, then C the live checks after the merge), with the step B verify loop marked Git Bash only, step D never moving a ticket or an epic to Done (it only comments, creates tickets and proposes Closed, with a pause for my OK), step F ending with a post-merge list of Done transitions that waits for my OK, and step D's RAID and failure log review (MOM-92) carried over word for word, including this instruction in step E.
   - An updated Open Decisions and Risks table.
5. Archive the finished plan first: copy the current `docs/plans/NEXT_BUILD_PLAN.md` to `docs/plans/archive/YYYY-MM-DD.md`, using its own metadata date (create the folder if needed). Then save the generated plan to `docs/plans/NEXT_BUILD_PLAN.md` and run `npm run plan:check -- --strict`; fix the plan until it reports no errors and no warnings.
6. Create a feature branch `feature/MOM-XX-next-build-plan-doc` off an up-to-date `main` (before step 5 writes any file). The name always ends in `-next-build-plan-doc`: the next day-end finds the start of its window by searching for the merge of that branch. Commit the archive file and `docs/plans/NEXT_BUILD_PLAN.md` with "docs(MOM-XX): add generated next build plan" (MOM-XX is the active Phase Epic), staging files by name. Do not merge it and do not push; show me `git log origin/main..<branch> --oneline` and wait. It is pushed with the day's other branches at step F.
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

6. **Jira: Done transitions, only for what has merged.** For each ticket whose pull request merged in the window (the merge commits `git log <window>..origin/main --merges` shows, which `/day-end` prints, and the `(MOM-n):` commit prefixes), list the proposed transition to "Done" with the ticket's acceptance criteria, each marked met or unmet with its evidence (a test, a commit, a production check, a gate item). A ticket with an unmet criterion or a live gate still pending stays open, with a comment saying what remains. List any epic whose children are now all Done or Closed, with those children. Wait for my OK, then make exactly the transitions I approved and comment what shipped. Never move a ticket to Done before its pull request has merged.

## C. Live checks (after the last pull request has merged and Vercel has deployed)

```bash
npx vercel ls --prod                                # needs the Vercel CLI (npx works); otherwise check the deployment in the Vercel dashboard. The newest production deployment must reach "Ready"
curl -s -I https://momentum-app-eight-chi.vercel.app/ | grep -iE "^(HTTP|location)"        # 307, with location: /login
curl -s -I https://momentum-app-eight-chi.vercel.app/login | grep -iE "^(HTTP|location)"   # 200
```

These use no output file and no format string. Git Bash rewrites a path such as `/dev/null` for the Windows `curl`, and `MSYS_NO_PATHCONV=1` then makes `curl` fail with a write error, so `-o /dev/null -w` is not used here.

- [ ] Sign in as the standing smoke-test account and walk the flows you touched today.
- [ ] Only the standing smoke-test account exists (`users = 1` in step B, until real users exist). If its data is cluttered, delete and recreate it in the Supabase dashboard (Add user, Auto Confirm); never share or store its password.
- [ ] Walk every item in `docs/plans/.pending-live-checks.md` (the post-push checks the blocks deferred), then clear the file.

---

## Open Decisions and Risks (read before starting)

| Item | Why it matters |
| --- | --- |
| **Thin slice: build day 1 of N = 5** | The design record sets N = 5 build days with a checkpoint at the end of build day 3 (`docs/design/2026-10-26-goal-model-design.md` §6.1). Today covers the data model (MOM-107), the engine (MOM-108) and piece 11's age-terms check and auth (MOM-116, MOM-64). Session 3 is housekeeping outside N. If MOM-107 or MOM-108 runs long, the checkpoint shows it early. |
| **One key heads one block** | The design sizes the data model and the engine at two blocks each, but the plan check allows a key to head only one block per plan. Each block stops at a committed, green point if it runs long; its ticket stays open and the next plan carries the rest. |
| **The engine is independent of the tables today** | MOM-108 defines its own input and output types in `types/scoreboard.ts` from `docs/DOMAIN_MODEL.md`, so it does not need MOM-107's unmerged code. MOM-112 maps rows onto them. If the two drift, MOM-112's block flags it. |
| **Migration 013 needs 2026-10-26's merges** | MOM-107 takes 013 and must be cut from a `main` that already holds 012 (MOM-65) and the grants check (MOM-66), because every new table goes into the check's allow-list. If 012 did not reach production (the platform-owned function risk, RAID R-16), the block stops. |
| **MOM-119 waits** | Tightening the old tables' grants needs a read of production's grants first and its own migration number. Not scheduled; MOM-107 builds its new tables tight from the start. |
| **MOM-102 waits for the tables** | The privacy notice states what Momentum stores, so it follows MOM-107's merge. It stays a trial prerequisite with MOM-64 and MOM-116. |
| **MOM-64 needs your accounts and settings** | A CAPTCHA site, its secret in the Supabase dashboard, its public key in Vercel, the reset address in the redirect allow-list and the Auth rate limits are all dashboard work only you can do. Without them, the code is built and dormant, and criterion 2 (throttling or CAPTCHA) stays unmet. The reset email is proven on the local stack only: walking it on production would need a second account. |
| **MOM-116 is a check, not legal advice** | It quotes each service's own terms with links and dates. You decide what they mean; no minor joins the trial until you have. |
| **MOM-104 edits this plan's preflight and day-end sections only** | Its block changes the commands, the checks and the spec, and (at your direction) the preflight and day-end sections A to F of this plan, so the plan and the commands agree once MOM-104 merges. Step E carries those sections into the next plan. No block prompt is edited. |
| **Known e2e noise** | "The destination stream errored while writing data" during the wizard specs predates 2026-10-26 (it is in `main`'s CI too) and the tests pass. Blocks report it as known noise until MOM-120 merges; then this row and the standing rule go. |
| **Backlog edits collide** | On 2026-10-26, MOM-68 and MOM-66 edited neighbouring `BACKLOG.md` lines and their pull requests conflicted. Blocks now add items next to their own ticket's items; step F resolves any remaining conflict by merging `origin/main` into the later branch locally, with your OK before the push. |
| **Standing smoke-test account** | `smoke-test@momentum-app.test` exists on production. Every live gate signs in as it; its password stays in your password manager. Production must hold exactly one user at day-end step B; no block creates a second one. |
| **The old model stays until MOM-115** | The wizard, rebalance and checkbox criteria keep running, with the completion guard of migrations 002 and 008. New code follows `docs/DOMAIN_MODEL.md` and is built beside the old tables. MOM-115's comment lists the old-model tickets to re-audit when it lands (MOM-42, 48 to 53, 59, 69, 80, 81, 82, 89, 90, 94). |
| **Dark only until MOM-30** | The app is dark regardless of the device setting. Light mode with a follow-device default is MOM-30, not scheduled. |
| **Not scheduled, queued with keys** | Thin slice: MOM-109 (Hevy into entries), MOM-110 (manual entry), MOM-111 (setup), MOM-112 (home and week plan), MOM-113 (weekly review), MOM-114 (settings), MOM-115 (retire the old model), MOM-102 (privacy). Follow-ons during the trial: MOM-117 (own sheet and templates), MOM-118 (career playbook). Other: MOM-119 (grants), MOM-98 (webhooks), MOM-99 (adapter follow-ups), MOM-100 (CI hardening), MOM-74 (retire `HEVY_API_KEY`), MOM-91 (`connection()`), MOM-95, MOM-96, MOM-97, MOM-70, MOM-26. |
| **Product risks live in the RAID log** | This table covers decisions for this build cycle. Product risks, assumptions, issues and dependencies (privacy of goal data, stored tokens and health data, model cost, synced data miscounting, setup inferring wrongly, a minor in the trial, local and production databases differing) are in `docs/RAID_LOG.md`, and AI misses in `docs/FAILURE_LOG.md`; both are reviewed in step D every day-end (MOM-92). |
| **Pull requests, not direct pushes** | `main` is protected (MOM-67): every change reaches it through a pull request with `checks` and `database` green, merged with a merge commit. `/run-block` commits on a feature branch and never merges; `/day-end` pushes the day's branches once, after your OK. A production migration is applied before its pull request merges (merging deploys to Vercel). |
