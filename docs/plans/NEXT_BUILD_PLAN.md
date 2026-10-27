# 🚀 MOMENTUM BUILD: NEXT-PHASE MASTER EXECUTION PLAN

> **Date:** 2026-10-28 | **Active Epic:** MOM-105 | **Base Commit:** ef463e1

> **Since the last plan (run on 2026-10-27):** build day 2 of the goal-model thin slice built setup's day-end step in the domain model (MOM-125), verify-script writes limited to their own throwaway accounts (MOM-121), manual entry part 1 with a try-it page at `/log` (MOM-110), setup's first block: draft schema, validator, prompt rules and a 16-case eval set (MOM-111), Hevy workouts into entries with merge suggestions (MOM-109, no caller yet), and the privacy notice at `/privacy` with trimmed Claude prompts (MOM-102), plus the adults-only trial decision (MOM-116). They reach `main` through that day-end's pull requests; none had a migration. The 2026-10-27 day-end created **MOM-126** (minors safeguards, deferred), **MOM-127** (verify scripts: function-call writes and the 011 count), **MOM-128** (setup budget block with migration 014), **MOM-129** (Hevy "Sync now") and **MOM-130** (clear generated type folders). Production verification at that day-end: **444 checks across 12 scripts, 0 false** (the local 439 plus 5 production-only checks in 012), migrations 001 to 013 applied. The next free migration number is **014**. Production holds exactly one user (the standing smoke-test account). This is **build day 3 of N = 5**, and the checkpoint is at the end of today.

---

## Today's runbook

**How to run a day.** Type `/day-start` first: it only reads and reports. Then type the command in the table below for each block, in this order, and skip any block whose Jira ticket is already Done. Each command first shows the block's model and effort: if your session differs, it stops and tells you the exact `/model` and `/effort` to type (use the session-only choice in the `/effort` slider, so your saved default is left alone), and you start the command again. Run `/clear` between blocks. When the last block is done, type `/day-end`. Nothing is pushed, merged or applied to production without your explicit OK, and work reaches `main` only through a pull request once both CI jobs are green.

| # | Type | Session setting | What to check at the gate |
| --- | --- | --- | --- |
| 0 | `/day-start` | Sonnet / Low | A clean tree, `main` matching `origin/main` with every 2026-10-27 pull request merged (seven block and decision branches plus the day-end's backlog and plan branches), no leftover branches, the plan passing its format check, no missing environment variable names. Then the carry-overs: `/privacy` loads signed out on production; the owner task still open on MOM-109 (ask the testers which apps they use). |
| 1 | `/run-block MOM-128` | Sonnet / High | You approved migration 014 and the setup limits before code; a parked goal saves without a shape or start date while any other goal still needs both; a setup call is logged as `setup`; any live eval run waited for your OK; nothing was pushed. |
| 2 | `/run-block MOM-110` | Sonnet / High | You approved the design before code; a log can say it happened on a chosen day within the last 7 days, in your own time zone; a time target takes typed minutes; a future or too-old day is refused in words; component and browser tests cover both. |
| 3 | `/run-block MOM-111` | Sonnet / High | You said yes or no to stacking on MOM-128's branch; you approved the screen and save design before code; setup asks one question at a time, plays back in chunks, and saves only after your final approval; step 9 asks "Where do you track this now, if anywhere?"; any live run waited for your OK. |
| 4 | `/run-block MOM-129` | Sonnet / Medium | "Sync now" on the Hevy card turns workouts into entries for the bound target, a second tap does not duplicate them, and no bound target gives a plain reason; the live check is listed for after the push. |
| 5 | `/run-block MOM-112` | Sonnet / High | You reviewed the scoreboard mock-up before any code; what was built after your OK matches it; the ticket stays open for the rest of home and the week plan. |
| 6 | `/day-end` | Opus / High | The day's branches pass their checks; migration 014 is applied to production after CI is green on MOM-128's pull request and your OK, and before it merges, with every verify script after it; MOM-111's stacked pull request merges after MOM-128's. |

If a block needs another ticket's code, `/run-block` checks that code is already in `origin/main`. If it is only on an unmerged branch, it stops and offers two ways forward: push that branch and merge its pull request first, or stack this block on that branch (only with your OK). Every block in this plan needs the 2026-10-27 pull requests merged. One block needs another block of this plan: MOM-111's screen needs MOM-128's migration and its `setup` feature, so it stacks on `feature/MOM-128-setup-budget` with your OK, and its pull request merges after MOM-128's.

---

## Executive Overview & Architectural Invariants

Build day 3 is the checkpoint day. Session 1 lays the two foundations the trial needs: setup's budget and migration 014 (MOM-128), so a real setup is neither cut off by today's per-person limits nor unable to save a parked goal; and manual entry's part 2 (MOM-110), so a person can log time they forgot to time and log on the day it happened. Session 2 is setup's screen and save (MOM-111), the piece the checkpoint most needs to see. Session 3 makes Hevy usable in the trial with a "Sync now" action (MOM-129) and starts home and the week plan (MOM-112) with the scoreboard mock-up, which you review before any code.

`docs/DOMAIN_MODEL.md` is binding for all new code. The old model stays in the code until MOM-115 retires it, so new code is built beside the old tables, never into them. Every block preserves these invariants:

1. **Claude never scores.** The engine (`lib/engine/`) computes every number from entries and the target in force; no Claude output is stored as a number, and setup's draft is validated by code, not by Claude (DOMAIN_MODEL §1.7, principle 9).
2. **The person's word beats any source.** A manual entry or correction always wins over a sync; corrections are keyed to the source's own record id, so a resync never undoes them; a possible duplicate is a suggestion, never a silent merge (§1.5, §1.6).
3. **Never assume anything about a person's life.** Time zone, week start and day end are the person's to set; setup asks them and never proposes a day, time or schedule the person did not say (principle 1, §2.2).
4. **Unfinished work moves, habits never carry over.** (§1.4, principle 11.)
5. **Service-layer RLS enforcement.** The UI never queries Supabase. Every read and write of the new tables goes through `lib/services/`; every new table (if any) has row level security keyed to its owner, explicit grants and an entry in `supabase/verify/900_table_grants.sql`'s allow-list.
6. **The old model's guards stay until MOM-115.** The completion guard (migrations 002 and 008) and the append-only `task_rebalance_history` keep protecting the old tables; nothing today edits an applied migration or an old table.
7. **Nothing is saved until final approval** in setup, and every Claude call goes through `lib/services/llm.ts`.

## Standing Rules (every prompt below repeats what it needs)

- **Read the Jira ticket first.** If its title, scope or acceptance criteria disagree with the prompt, or the prompt disagrees with `docs/DOMAIN_MODEL.md`, stop and flag it.
- **Production changes need your approval.** A prompt stops before `supabase db push`, `vercel env`, or any push to `origin`, shows what will happen, and waits. Never use the SQL Editor. Tests never run against production and never use production credentials.
- **Database checks are not part of `npm test`.** They live in the SQL scripts in `supabase/verify/` and run with `npm run verify:sql` (local stack) or, against production, with the step B loop. After any migration, or any change to a verify script, run **all** of them; every row must show `passed = true`. A local total is not a production total: one script has checks that run only on production (RAID R-16, failure-log F-027).
- **New migrations use the numbers this plan assigns:** MOM-128 takes **014**; MOM-112 may take **015**, only if its design stop shows a table is needed and you approve it. No other block adds a migration. Never edit an applied migration.
- **Pull requests, not local merges.** `main` is protected: work reaches it only through a pull request with the CI jobs `checks` and `database` green, merged with a merge commit (CLAUDE.md). A block commits on its feature branch and stops: it never merges into `main` and never pushes. Branches are pushed once, at day-end (step F), after your explicit OK.
- **A migration is applied before its pull request merges.** A block with a migration runs `npm run verify:sql` locally, shows the migration and `npx supabase db push --dry-run`, and stops. At day-end step F, once CI is green on its pull request and you say OK, the production `db push` and then ALL the verify scripts run, before that pull request merges (merging deploys to Vercel, and the new code needs the new schema).
- **Backlog edits can collide.** Each block edits `BACKLOG.md` on its own branch. Add new items next to the block's own ticket's items, not all at the very end, so two branches do not edit neighbouring lines. If two pull requests still conflict, day-end step F merges `origin/main` into the later branch locally, keeps both sides, and pushes that with your OK.
- **Claude calls cost money.** `npm test` never calls Claude: model calls in tests go through a fake. A block that wants a live Claude call (an eval run, a prompt check) says how many calls and stops for your OK first, and it is logged through `lib/services/llm.ts`.
- **Stale generated types.** Generated route types under `.next/` outlive a branch switch (failure log F-028, F-039). Until MOM-130 builds it into the commands, delete `.next/types` and `.next/dev` (both git-ignored and regenerated) before `npx tsc --noEmit` or `npm run build` on a branch you just switched to.
- **Standing smoke-test account.** Production keeps ONE standing test account, `smoke-test@momentum-app.test`, created by you in the Supabase dashboard (Authentication → Add user, Auto Confirm User on). Its password lives only in your password manager: Claude never asks for it, prints it or stores it in the repo, and never creates, edits or deletes users on production. Every live sign-in check in this plan says "sign in as the standing smoke-test account". Claude may read its data with **count-only** queries. If its data gets cluttered, you delete and recreate it in the dashboard (it starts empty). The SQL verify scripts create and delete their own passwordless temporary users and leave none behind, and since MOM-121 every insert, update and delete in them is limited to those users (writes made through function calls are MOM-127, not yet built). Production should always hold exactly one user. The standing account's goal-model data is created only through the app (setup, logging), never seeded by hand. Browser tests use throwaway users on the **local** stack only.
- **The repo is public.** Anything written to a committed file (logs, docs, tests, fixtures, eval cases) names categories, never secrets, personal data or exploit steps. Trial testers are described by role only ("the owner", "two household testers"). The family trial is adults only (MOM-116). Eval cases are scripted, with personal details removed.

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
SESSION 1: WHAT THE TRIAL STANDS ON (MOM-128, MOM-110)   thin slice, build day 3 of 5 (checkpoint day)
  - Setup's budget and migration 014, then manual entry part 2 (chosen day, typed minutes)
SESSION 2: GUIDED SETUP (MOM-111)
  - The conversation screen, chunked playback, final approval and save (stacked on MOM-128)
SESSION 3: SOURCES AND HOME (MOM-129, MOM-112)
  - Hevy "Sync now", then home and the week plan starting with the scoreboard mock-up
```

*Order matters. MOM-128 comes first because setup's screen logs its Claude calls under `setup` and saves parked goals, and both need migration 014; its live eval runs also set the budget the screen runs under. MOM-110's part 2 is independent of setup (it owns `lib/services/entries.ts`, `app/actions/entries.ts` and `components/entries/`) and is the smaller, surer piece, so it goes before the long setup block. MOM-111 stacks on MOM-128's branch with your OK, because MOM-128 is unmerged on the same day. MOM-129 needs only MOM-109's `syncHevyEntries`, in `origin/main` after last night's merges. MOM-112 comes last and stops at its mock-up review first; it reads entries and the engine, and never edits MOM-110's or MOM-109's files. Safe stopping points: after each block. If the day runs short, MOM-129 drops first, then MOM-112 stops at the approved mock-up.*

---

# SESSION 1: WHAT THE TRIAL STANDS ON

**Your prerequisites before this session:** (1) Every 2026-10-27 pull request is merged, so `origin/main` has MOM-109 (`lib/services/syncedEntries.ts`), MOM-110 part 1 (`lib/services/entries.ts`, `/log`), MOM-111's first block (`lib/setup/`, `lib/ai/setup.ts`, `types/setup.ts`), MOM-121, MOM-125, MOM-102 and MOM-116, plus the day-end's backlog and plan branches; `/day-start` shows it. (2) Docker Desktop running and the local stack started (`npx supabase start`). (3) For MOM-128: be ready to approve migration 014 and the limits design at its stop, and to say yes or no to a live eval run (the block says how many calls and roughly what they cost first). `ANTHROPIC_API_KEY` in `.env.local` only if you approve a live run.

## Block 1.1: Setup Budget and Migration 014 (MOM-128)

* **Objective & Scope:** Migration **014**: a goal's shape and start date become optional for a parked goal only (a check keeps both required for any other goal), and `'setup'` joins the Claude usage log's feature check. In `lib/services/llm.ts`, setup gets its own limits: a per-setup budget in turns and tokens, per-person limits log-only during the trial with one hard shared cap kept, and going over the setup budget falls back to the quick path (design record §6.2). `lib/ai/setup.ts` is called through `lib/services/llm.ts` under `setup`. The budget numbers come from live eval runs at the 90th percentile plus a margin, run only with your OK; the smaller-model trial runs the same eval set on the smaller model.
* **Core Invariants to Protect:** *Claude calls cost money*: no live call without your OK, every call logged. *A check that cannot fail is not a check*: the migration's verify script must fail on a non-parked goal without a shape. *Never edit an applied migration*: 011 and 013 stay as they are; 014 changes the constraints. *The old model untouched*: `rebalance` and `week_one_plan` keep their limits.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-128: the setup budget block, with migration 014.

Task Instructions:
1. Read ticket MOM-128 in Jira first; its acceptance criteria are the definition of done. Also read the 2026-10-27 comments on MOM-111. If they, these instructions and docs/DOMAIN_MODEL.md disagree, stop and flag it.
2. Check that MOM-111's first block (lib/setup/, lib/ai/setup.ts, types/setup.ts) and migration 013 are in origin/main (`git log origin/main --oneline --grep="(MOM-111):" -n 3`). If not, stop.
3. Read CLAUDE.md, docs/DOMAIN_MODEL.md (§2, and §1 on parked goals), docs/design/2026-10-26-goal-model-design.md (§5.1 setup evals, §6.2 the setup cost limit), docs/LLM_GOVERNANCE.md, supabase/migrations/011_llm_usage_logs.sql and 013_goal_model_tables.sql (the goals constraints and the usage-log feature check), lib/services/llm.ts (LLM_LIMITS, LlmFeature, the reservation call), lib/ai/setup.ts, lib/setup/validate.ts and lib/setup/rows.ts, lib/setup/evals.ts and tests/setup-evals/, supabase/verify/011_llm_usage_logs.sql, 013_goal_model_tables.sql and 900_table_grants.sql, lib/config/privacy.ts, the BACKLOG.md items under MOM-128 and MOM-111, and RAID R-22 in docs/RAID_LOG.md.
4. Create the feature branch `feature/MOM-128-setup-budget` off an up-to-date `main`.
5. Design before coding, then STOP for my OK: (a) migration 014, statement by statement (the goals constraints that let a parked goal omit shape and start date and keep both required otherwise, and the usage-log feature check with 'setup' added), and what its verify script proves, including checks that can fail; (b) the setup limits: what a "setup" is for counting (one conversation from first turn to save or abandon), the per-setup budget in turns and tokens, per-person limits log-only during the trial, the one hard shared cap, and what "fall back to the quick path" does on screen; (c) how lib/ai/setup.ts is called through lib/services/llm.ts; (d) the live eval run you propose: how many cases and calls, on which models (including the smaller-model trial), and roughly what it costs. Wait for my answer.
6. Build as approved. The validator in lib/setup/ accepts a parked goal without shape and start date and still rejects any other goal without them; the save mapping in lib/setup/rows.ts follows. Starting budget numbers are named constants in one place in lib/services/llm.ts.
7. If I approved a live eval run: run it through lib/services/llm.ts, set the budget at the 90th percentile of turns and tokens plus the margin I approved, and record the results (pass or fail per rule, turns and tokens per case, per model) in the Jira comment, not in the repo. If I did not, keep the starting numbers, say so, and leave that criterion open.
8. Migration 014: write supabase/migrations/014_setup_budget.sql and supabase/verify/014_setup_budget.sql; update supabase/verify/011_llm_usage_logs.sql only where its feature-check expectations change (keep every check able to fail); no new table, so 900_table_grants.sql's allow-list is unchanged unless the design says otherwise. Run `npx supabase db reset --local` and `npm run verify:sql`, show me the migration and `npx supabase db push --dry-run`, and stop. Say plainly: the production push and then ALL the verify scripts run at day-end step F, after CI is green on this branch's pull request and I say OK, and before that pull request merges.
9. Tests: the validator and rows for a parked goal with and without shape; the setup limits (a scripted 25-turn setup is never cut off by per-person limits, the shared cap still stops calls, going over the setup budget falls back to the quick path); setup calls logged as `setup`; `npm test` makes no network call.
10. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass.
11. Update docs/LLM_GOVERNANCE.md (setup's limits and why), and lib/config/privacy.ts and the notice only if what is kept changes; say "Privacy impact" in the close-out. Update BACKLOG.md for MOM-128, next to its existing item. Comment on MOM-128 in Jira with the design, what changed, each acceptance criterion met or unmet and how verified; do not move it to Done.
12. Commit with "feat(MOM-128): add migration 014 and setup-sized Claude limits". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes (with no network call); npm run verify:sql passes locally; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented.
```

* **User Verification Gate:**
  - [ ] You approved migration 014, the limits design and any live eval run before they happened.
  - [ ] The verify script fails on a non-parked goal without a shape (read the check), and `npm run verify:sql` passes locally.
  - [ ] A scripted 25-turn setup is not cut off, and the shared cap still stops calls (read the test).
  - [ ] Live eval results, if any, are on the ticket, not in the repo.
  - [ ] You saw the migration and the dry run, and nothing was pushed. After the push: production `db push` and every verify script, before the pull request merges.

---

## Block 1.2: Manual Entry, Part 2: The Day It Happened and Typed Minutes (MOM-110)

* **Objective & Scope:** Each log can say when it happened: now by default, or a chosen day within the last 7 days, shown and read in the person's own time zone. A time target also takes typed minutes as an alternative to the timer, for time the person forgot to time. Part 1 already passes an optional chosen time to every log function, which `resolveOccurredAt` in `lib/services/entries.ts` refuses today; part 2 makes it validate (a real date, not in the future, not older than 7 local days) and adds the controls and the server-action argument. A checklist tick keeps its first time when it is un-ticked and ticked again. No migration.
* **Core Invariants to Protect:** *Never assume*: no default time zone; a chosen day is read in the person's own time zone from `person_settings`. *The person's word beats any source*. *Service-layer RLS*: this block owns `lib/services/entries.ts`, `app/actions/entries.ts` and `components/entries/`, and nothing else touches entries for manual logs.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-110 part 2: a log can say the day it happened, and a time target takes typed minutes.

Task Instructions:
1. Read ticket MOM-110 in Jira first, with its 2026-10-27 comments; its acceptance criteria are the definition of done. If it, these instructions and docs/DOMAIN_MODEL.md disagree, stop and flag it.
2. Check that MOM-110 part 1 (lib/services/entries.ts, app/actions/entries.ts, components/entries/, app/log/page.tsx) is in origin/main (`git log origin/main --oneline --grep="(MOM-110):" -n 3`). If not, stop.
3. Read CLAUDE.md, docs/DOMAIN_MODEL.md (§1.5 entries, principles 1 and 2), lib/services/entries.ts (resolveOccurredAt and every log function), app/actions/entries.ts, components/entries/ (TimerControl.tsx, NumberControl.tsx, ManualEntryPanel.tsx, useEntryAction.ts), lib/engine/time.ts (how the engine reads local days and the day end), tests/entries-service.test.ts, tests/manual-entry.test.tsx, tests/e2e/manual-entry.spec.ts, the BACKLOG.md items under MOM-110 (part 2 and the limits of part 1), and RAID R-20 in docs/RAID_LOG.md.
4. Create the feature branch `feature/MOM-110-entry-day-and-minutes` off an up-to-date `main`.
5. Design before coding, then STOP for my OK: how a chosen day becomes `occurred_at` (which time of day on that local date, and how the person's day end affects which local day "today" is), the validation rules and their plain-words refusals (future, older than 7 local days, not a real date, no time zone yet), the day picker (phone-first, no keyboard), typed minutes on a time target (a whole number of minutes, its limits), and how a re-tick keeps its first time. Say what changes in each file. No migration is assigned to this block; if you need one, stop. Wait for my answer.
6. Build as approved. Controls stay phone-first: large tap targets; the number pad only for typed minutes and quantities.
7. Tests: service tests for each rule (now, a chosen day, the 7-day edge in the person's time zone, a day across the day end, future and too-old refused, no time zone refused) and for typed minutes; component tests for the day picker and typed minutes; extend tests/e2e/manual-entry.spec.ts at 390px and 1280px to log on a chosen day and to log typed minutes with a throwaway user.
8. Run `npx tsc --noEmit`, `npm test`, `npm run build` and `npm run test:e2e` (stop `npm run dev` first); all must pass, with no server error in the e2e output.
9. Update BACKLOG.md for MOM-110, next to its existing items (tick part 2, and note typed minutes against RAID R-20). Comment on MOM-110 in Jira with the design, what changed, each acceptance criterion met or unmet and how verified; the real-iPhone check still waits for setup's screen on production; do not move it to Done.
10. Commit with "feat(MOM-110): let a log say the day it happened, and add typed minutes". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes; npm run test:e2e passes; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented.
```

* **User Verification Gate:**
  - [ ] You approved the design before any code was written.
  - [ ] On the local stack: a log on a chosen day within the last 7 days shows on that day; a future or too-old day is refused in words.
  - [ ] Typed minutes on a time target create one entry with that value.
  - [ ] `npm run test:e2e` passes at both widths with no server error.

---

# SESSION 2: GUIDED SETUP

**Your prerequisites before this session:** (1) MOM-128's block is committed on `feature/MOM-128-setup-budget` (not pushed). MOM-111's block stacks on it: say yes when `/run-block` offers to stack, or no to wait for MOM-128's pull request to merge first. (2) The local stack running with migration 014 applied locally (`npx supabase db reset --local` on the stacked branch). (3) Be ready to approve the screen and save design, and to say yes or no to one live setup run through the screen (the block says how many calls first).

## Block 2.1: Guided Setup, Screen and Save (MOM-111)

* **Objective & Scope:** The second of setup's three blocks: the conversation screen behind sign-in, one question at a time, calling `lib/ai/setup.ts` through `lib/services/llm.ts` under `setup` with MOM-128's budget; chunked playback rendered by code from the validated draft (`lib/setup/playback.ts`), where the latest answer wins; final approval; and the save, a service that writes the validated draft's rows (person facts and settings, goals, targets, work items and steps, the source each target is bound to) in one go and nothing before approval. Step 9's text in `lib/setup/steps.ts` asks "Where do you track this now, if anywhere?" (DOMAIN_MODEL §2.2 step 9). Every checklist item is bound to its target, so manual entry can tick it (MOM-110's limit (e)). Running out of budget falls back to the quick path MOM-128 built.
* **Core Invariants to Protect:** *Nothing is saved until final approval*. *Claude never scores and does no math*: the draft is validated by code, and numbers come from the person's words. *Never assume*: no day, time or schedule the person did not say. *Service-layer RLS*: the save goes through a service and writes only the person's own rows.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-111, second block: the setup conversation screen, chunked playback, final approval and save.

Task Instructions:
1. Read ticket MOM-111 in Jira first, with its comments; its acceptance criteria are the definition of done for the whole ticket, and this block covers part of them. Also read MOM-128 and its comments. If they, these instructions and docs/DOMAIN_MODEL.md disagree, stop and flag it.
2. This block needs MOM-111's first block in origin/main and MOM-128's migration 014 and setup limits. Check `git log origin/main --oneline --grep="(MOM-128):" -n 3`. If MOM-128 is not in origin/main but is committed on feature/MOM-128-setup-budget, stop and offer the two ways forward: wait for its pull request to merge, or stack this block on that branch (only with my OK). If it exists nowhere, stop.
3. Read CLAUDE.md, docs/DOMAIN_MODEL.md (§2 in full, §1 for what setup saves, the principles), docs/design/2026-10-26-goal-model-design.md (§5.1, §6.2), supabase/migrations/013_goal_model_tables.sql and 014_setup_budget.sql, types/setup.ts, lib/setup/ (steps.ts, validate.ts, rows.ts, playback.ts, checks.ts, prompt.ts), lib/ai/setup.ts, lib/services/llm.ts, lib/services/entries.ts (how a manual source is found), lib/services/tasks.ts and app/actions/tasks.ts (how services and server actions are written here), components/goals/ (the old wizard's layout, for the look only), tests/e2e/wizard.spec.ts (how browser tests fake Claude), lib/config/privacy.ts, and the BACKLOG.md items under MOM-111.
4. Create the feature branch `feature/MOM-111-setup-screen` off an up-to-date `main`, or, if I approved stacking, off `feature/MOM-128-setup-budget`.
5. Design before coding, then STOP for my OK: the route and its components with their props; the server actions; how the transcript and draft travel between turns with nothing stored before approval (the owner's 2026-10-27 decision); how chunked playback shows and how "the latest answer wins" when the person changes an answer; the save service (one function, which rows it writes in which order, how a failure leaves nothing half-saved, and how each target's source binding is written, including the manual source); what the person sees when the setup budget runs out (the quick path); and the files you create. No migration is assigned to this block; if you need one, stop. Wait for my answer.
6. Build as approved. Change step 9's text in lib/setup/steps.ts to ask "Where do you track this now, if anywhere?" as one question, with no mention of an old wording. Phone-first layout; one question on screen at a time.
7. Tests: the save service against the in-memory fake (a full draft saves every row; a failure saves nothing; one person never writes another's rows; a parked goal without shape saves; every checklist item is bound to its target); component tests for the screen and playback (tests/setup-screen.test.tsx); the eval set still passes; a browser spec on the local stack (tests/e2e/setup.spec.ts) at 390px and 1280px that runs a scripted setup through a faked model, approves, and finds the goal saved, with a throwaway user. `npm test` makes no network call.
8. If one live setup run through the screen would help, STOP and tell me how many calls it would make and roughly what it costs; run it only on my OK, on the local stack, logged through lib/services/llm.ts, and record turns, tokens and any rule a check flagged in the Jira comment, not in the repo.
9. Run `npx tsc --noEmit`, `npm test`, `npm run build` and `npm run test:e2e` (stop `npm run dev` first); all must pass, with no server error in the e2e output.
10. Add to docs/plans/.pending-live-checks.md: `- [ ] MOM-111: after the push, signed in as the standing smoke-test account, run setup on production for one small goal with one target of each kind MOM-110 logs, and approve it; then the MOM-110 iPhone check can run`.
11. Stop at a committed, green point and list what the third block needs (the setup prompt's field-by-field privacy check with a pinned test, replacing GUIDED_SETUP_LINE in lib/config/privacy.ts; the quantity metric named by the binding (from MOM-109); anything the live run found). The ticket stays open.
12. Update BACKLOG.md for MOM-111, next to its existing items (mark the step 9 wording done). Say "Privacy impact" in the close-out. Comment on MOM-111 in Jira with the design, what changed, each acceptance criterion met, partly met or not yet started, and how verified; do not move it to Done.
13. Commit with "feat(MOM-111): add the setup conversation screen, playback and save". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main (or stacked on MOM-128's branch with my OK); tsc --noEmit passes; npm test passes (with no network call); npm run test:e2e passes; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented.
```

* **User Verification Gate:**
  - [ ] You said yes or no to stacking, and approved the screen and save design before any code was written.
  - [ ] On the local stack: one question at a time; playback in chunks; changing an answer replaces the old one; nothing is saved before you approve.
  - [ ] A failed save leaves nothing behind (read the test), and a parked goal saves without a shape.
  - [ ] Step 9 asks "Where do you track this now, if anywhere?".
  - [ ] Any live run waited for your OK, and its results are on the ticket, not in the repo.
  - [ ] After the push: setup on production, signed in as the standing smoke-test account.

---

# SESSION 3: SOURCES AND HOME

**Your prerequisites before this session:** (1) For MOM-129: nothing new on production; the browser test fakes the Hevy client on the local stack. (2) For MOM-112: be ready to review the scoreboard mock-up at its first stop; nothing is built before your OK.

## Block 3.1: Hevy "Sync now" (MOM-129)

* **Objective & Scope:** A server action that runs `syncHevyEntries` (`lib/services/syncedEntries.ts`, MOM-109) on the signed-in person's own session, and a "Sync now" button on the Hevy card on `/connections` with plain-words results: entries added or updated, the no-bound-target reason, and the one failing-source notice. One sync at a time per person. No migration; `lib/adapters/hevy.ts` stays a pure normalizer. The webhook path stays with MOM-98.
* **Core Invariants to Protect:** *Adapters normalize, services write* (`docs/INTEGRATIONS_SPEC.md`). *Service-layer RLS*: the component calls a server action, never Supabase or Hevy. *The person's word beats any source*: a sync never changes a correction or a manual entry.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-129: a "Sync now" action for Hevy that runs the entries sync on the person's session.

Task Instructions:
1. Read ticket MOM-129 in Jira first; its acceptance criteria are the definition of done. If it, these instructions and docs/INTEGRATIONS_SPEC.md disagree, stop and flag it.
2. Check that MOM-109 (lib/services/syncedEntries.ts) is in origin/main (`git log origin/main --oneline --grep="(MOM-109):" -n 3`). If not, stop.
3. Read CLAUDE.md, docs/INTEGRATIONS_SPEC.md, lib/services/syncedEntries.ts (syncHevyEntries, HevySyncResult and its reasons and notices), lib/services/integrations.ts, the actions in app/actions/ and the Hevy card in components/integrations/ (how connect and disconnect are written), tests/synced-entries.test.ts, tests/e2e/connections.spec.ts (how the Hevy client is faked in browser tests), and the BACKLOG.md items under MOM-109 and MOM-129.
4. Create the feature branch `feature/MOM-129-hevy-sync-now` off an up-to-date `main`.
5. Design before coding, then STOP for my OK: the server action's signature and result, the button's states (idle, syncing, done with counts, no bound target, failing source, retry after a timeout), how a second tap while a sync runs is handled, and where the button appears (only on a connected Hevy card). Wait for my answer.
6. Build as approved. No hard-coded goal or target; no change to lib/adapters/hevy.ts.
7. Tests: the action (counts, the no-bound-target reason, the failing-source notice, a timeout changes nothing, one person's sync never touches another's rows); component tests for each button state; a browser spec on the local stack at 390px and 1280px with the Hevy client faked.
8. Run `npx tsc --noEmit`, `npm test`, `npm run build` and `npm run test:e2e` (stop `npm run dev` first); all must pass, with no server error in the e2e output.
9. Add to docs/plans/.pending-live-checks.md: `- [ ] MOM-129: after the push, signed in as the standing smoke-test account, if it has a connected Hevy account and a bound target, Sync now gives entries and no error notice`.
10. Update BACKLOG.md for MOM-129, next to its existing item. Say "Privacy impact" in the close-out. Comment on MOM-129 in Jira with what changed, each acceptance criterion met or unmet and how verified; do not move it to Done.
11. Commit with "feat(MOM-129): add a Sync now action for Hevy". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes; npm run test:e2e passes; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented.
```

* **User Verification Gate:**
  - [ ] You approved the button's states before any code was written.
  - [ ] On the local stack: Sync now adds entries, a second tap adds none, and no bound target gives a plain reason.
  - [ ] `lib/adapters/hevy.ts` is unchanged.
  - [ ] After the push: Sync now, signed in as the standing smoke-test account, if it has a connected Hevy account.

---

## Block 3.2: Home and the Week Plan, Starting with the Scoreboard Mock-Up (MOM-112)

* **Objective & Scope:** The first block of home and the week plan. It starts with the scoreboard mock-up for your review: the hero card (floors met this week, the week's biggest crossing, entries per day) and each goal with its scoreboard, drawn from engine output on scripted data, phone first. Only after your OK does it build the approved piece: mapping database rows onto the engine's types in a service, and showing goals with their scoreboards on home beside (not replacing) the old feed until MOM-115. Picking items onto days, merge suggestions on screen, and the controls from `/log` on home come in later blocks unless the design stop says otherwise. Migration **015** only if the design stop shows a table is needed and you approve it.
* **Core Invariants to Protect:** *Claude never scores*: every number on screen comes from `lib/engine/`. *Never assume*: no day or time the person did not set; a target without its time anchors is shown, not graded. *Service-layer RLS*: the page calls services through server components or actions. *The old model untouched until MOM-115*.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-112, first block: the scoreboard mock-up, then the approved first piece of home.

Task Instructions:
1. Read ticket MOM-112 in Jira first; its acceptance criteria are the definition of done for the whole ticket, and this block covers part of them. If it, these instructions and docs/DOMAIN_MODEL.md disagree, stop and flag it.
2. Check that lib/engine/ (MOM-108), migration 013 and MOM-110 part 1 (lib/services/entries.ts) are in origin/main. If any is not, stop.
3. Read CLAUDE.md, docs/DOMAIN_MODEL.md (§1.3 scoreboards, §1.4 the week, §1.7, the principles), docs/design/2026-10-26-goal-model-design.md, lib/engine/ and types/scoreboard.ts, supabase/migrations/013_goal_model_tables.sql, lib/services/entries.ts and lib/services/syncedEntries.ts (read only; this block edits neither), app/page.tsx and components/layout/ (today's home and the 3-column layout), and the BACKLOG.md items under MOM-112 (including shadcn/ui, which is not installed yet).
4. Create the feature branch `feature/MOM-112-home-scoreboard` off an up-to-date `main`.
5. Mock-up first, then STOP for my review: show the hero card and two or three goal cards with their scoreboards at 390px and 1280px, drawn from engine output on scripted data (a habit goal partway through a week, a deadline goal with a forecast, a target not yet graded), in the form you think reads best for me (a static page on the local stack that I open, or a text layout), and say which engine outputs each element shows. Write no service or page code until I approve. Wait for my answer.
6. Design after the mock-up is approved, then STOP for my OK: the service that maps rows onto the engine's types (functions, what each reads), how home shows it beside the old feed, whether shadcn/ui is added now, and whether any table is needed (migration 015 is the only number this block may use). Wait for my answer.
7. Build only the approved piece. If migration 015 was approved: write it, add any table to supabase/verify/900_table_grants.sql's allow-list, add supabase/verify/015_<name>.sql, run `npx supabase db reset --local` and `npm run verify:sql`, show me the migration and `npx supabase db push --dry-run`, and stop. Say plainly: the production push and then ALL the verify scripts run at day-end step F, after CI is green on this branch's pull request and I say OK, and before that pull request merges.
8. Tests: the mapping service against the in-memory fake (each target kind, a target with no anchors, one person never reading another's rows); component tests for the cards; a browser spec on the local stack at 390px and 1280px if a page changed.
9. Run `npx tsc --noEmit`, `npm test`, `npm run build` and `npm run test:e2e` (stop `npm run dev` first); all must pass, with no server error in the e2e output.
10. Stop at a committed, green point and list what remains for MOM-112 (picking items onto days, merge suggestions on screen with the "keep both" table, the entry controls on home and retiring /log, visual and contrast checks). The ticket stays open.
11. Update BACKLOG.md for MOM-112, next to its existing items. Say "Privacy impact" in the close-out. Comment on MOM-112 in Jira with the approved mock-up (described in words), the design, what changed, each acceptance criterion met, partly met or not started, and how verified; do not move it to Done.
12. Commit with "feat(MOM-112): add the scoreboard cards from the approved mock-up". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes; npm run test:e2e passes; npm run verify:sql passes locally if a migration was added; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented.
```

* **User Verification Gate:**
  - [ ] You reviewed the mock-up at both widths before any code, and approved the design after it.
  - [ ] Every number on the cards comes from the engine (read the mapping test).
  - [ ] A target without its time anchors is shown, not graded.
  - [ ] If migration 015 was added: you saw it and the dry run, and nothing was pushed.

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

`npm run test:e2e` and `npm run verify:sql` also run in CI on every pull request. Run them here too for a branch that changed pages, auth, the wizard, the drawer, manual entry, setup or a migration (stop `npm run dev` first). Any server error in the e2e output is a failure: the "destination stream errored" line was fixed by MOM-120, so if it comes back, it is a failure and MOM-120 is reopened.

Generated route types outlive a branch switch: a browser test run leaves the development server's in `.next/dev`, and a production build leaves its own in `.next/types` (failure log F-028, F-039). A branch checked after one that added pages can then fail `npx tsc --noEmit` on routes it does not have. Delete both folders (git-ignored, rebuilt by the next build or `npm run dev`) before the checks on each branch; if `tsc` or the build still fails only in a file under `.next/`, delete them and run the check again; any other failure is real. MOM-130 builds this into the commands.

## B. Database verification (production), only if migrations were applied in the window

A migration is applied to production inside its own block (after CI is green on its pull request and your OK, before that pull request merges). B is the day's re-check of production once all blocks are done. A migration is in the window when `git log --branches --remotes --not <window> --name-only --format=%h -- supabase/migrations` lists a file (014 from MOM-128 today, and 015 if MOM-112 added it). B also runs when a script in `supabase/verify/` changed in the window, because production is where those scripts are proven. **Git Bash only.** This loop uses `/tmp`, `grep`, `$(...)` and `for ... done`, which do not work in PowerShell. `npm test` does **not** run these scripts. Every script must report `false 0` and a non-zero `true` count (0 and 0 means the script errored).

```bash
npx supabase migration list                         # local and remote columns must match for every migration
T=0; F=0
for f in supabase/verify/*.sql; do
  npx supabase db query --linked -f "$f" -o table > /tmp/v.txt 2>&1
  t=$(grep -cE '│ true ' /tmp/v.txt); fl=$(grep -cE '│ false ' /tmp/v.txt)
  echo "$(basename $f): true $t false $fl"; T=$((T+t)); F=$((F+fl))
done; echo "TOTAL true $T false $F"                 # expect false 0 and a true count no lower than the 2026-10-27 production total (444 across 12 scripts), plus the checks added in the window. A local count is not a production count: one script runs 5 more checks on production
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
   e. Then ask "promote anything to the playbook?" List the top 3 candidate lessons from today in full, each one sentence with Why and Source, generic enough for any project (no ticket keys, file names or secrets). List any other candidates as one-line titles under "Also considered", which I can expand or skip. Wait for my reply. Print the approved ones as a single paste block headed "Playbook promotions <date>". Don't write them anywhere in the repo.
8. Create a feature branch off an up-to-date `main` (`feature/MOM-16-eod-backlog-sync`; if it already exists and is fully merged into origin/main, delete it with `git branch -d` and create it again) and commit BACKLOG.md (ROADMAP.md if changed, and only the docs/RAID_LOG.md and docs/FAILURE_LOG.md entries I approved in step 7) with "chore(MOM-16): sync end-of-day backlog, prune obsolete tickets, and update Jira", staging files by name. An item that exists only on an unmerged branch gets its key by a small commit on that branch instead. Do not merge it into main and do not push: it is pushed with the day's other branches at step F and merged through its pull request.

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
   - Final Day-End Build Verification & Pull Requests section (steps A, B, D, E, then F the one push, then C the live checks after the merge), with the step B verify loop marked Git Bash only, step D never moving a ticket or an epic to Done (it only comments, creates tickets and proposes Closed, with a pause for my OK), step F ending with a post-merge list of Done transitions that waits for my OK, and step D's RAID and failure log review (MOM-92) carried over word for word, including the playbook question, and including this instruction in step E.
   - An updated Open Decisions and Risks table.
5. Archive the finished plan first: copy the current `docs/plans/NEXT_BUILD_PLAN.md` to `docs/plans/archive/YYYY-MM-DD.md`, using its own metadata date (create the folder if needed; if that file already exists, add `-2`, `-3` and so on rather than overwrite). Then save the generated plan to `docs/plans/NEXT_BUILD_PLAN.md` and run `npm run plan:check -- --strict`; fix the plan until it reports no errors and no warnings.
6. Create a feature branch `feature/MOM-XX-next-build-plan-doc` off an up-to-date `main` (before step 5 writes any file). The name always ends in `-next-build-plan-doc`: the next day-end finds the start of its window by searching for the merge of that branch. Commit the archive file and `docs/plans/NEXT_BUILD_PLAN.md` with "docs(MOM-XX): add generated next build plan" (MOM-XX is the active Phase Epic), staging files by name. Do not merge it and do not push; show me `git log origin/main..<branch> --oneline` and wait. It is pushed with the day's other branches at step F.
```


## F. Push the day's branches and merge the pull requests (the one push)

This is the day's single push and it needs your explicit OK. Nothing here pushes `main`: work reaches `main` only through pull requests.

```bash
git log origin/main..<branch> --oneline            # for EACH of the day's feature branches, including the step D and E branches: exactly what will be published
git push -u origin <branch>                         # after your OK, one branch at a time; never main. The link to open the pull request is printed
```

1. Open a pull request for each branch (the link printed by the push; `gh pr create` only if `gh` is installed and you say yes). A stacked branch (MOM-111 on MOM-128) is opened against `main` only after the branch under it has merged, so it shows only its own commits.
2. Wait for CI: both jobs, `checks` and `database`, must be green on every pull request.
3. For a branch with a migration: production `npx supabase db push --dry-run`, then `db push`, then ALL the verify scripts (step B's loop), only after CI is green and your OK, and **before** that pull request merges. Today: 014 on MOM-128's branch, and 015 if MOM-112 added it.
4. Merge each pull request with a merge commit (the GitHub button, or `gh pr merge` after your OK), in dependency order: MOM-128 before MOM-111.
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
- [ ] Walk every item in `docs/plans/.pending-live-checks.md` (the post-push checks the blocks deferred), then clear the items that are done; an item that still waits (the MOM-110 iPhone check until setup is live) stays.

---

## Open Decisions and Risks (read before starting)

| Item | Why it matters |
| --- | --- |
| **Thin slice: build day 3 of N = 5, the checkpoint** | The design record sets N = 5 build days with a checkpoint at the end of build day 3 (`docs/design/2026-10-26-goal-model-design.md` §6.1), which is today. Days 1 and 2 built the data model, the engine, manual entry part 1, setup's foundations, Hevy into entries and the privacy notice. Today adds setup's budget and screen, manual entry part 2, Hevy "Sync now" and home's scoreboard. At the checkpoint, judge whether setup (block 2 of 3) and home (block 1) leave room for the weekly review (MOM-113) and settings (MOM-114) in days 4 and 5. |
| **MOM-111 stacks on MOM-128** | Setup's screen needs migration 014 and the `setup` feature, both MOM-128's, which is unmerged on the same day. `/run-block MOM-111` offers to stack on `feature/MOM-128-setup-budget`; say yes to keep the day moving. Its pull request then merges after MOM-128's, and only after 014 is on production. |
| **Migration 014 before the trial** | 014 (MOM-128) makes a parked goal's shape and start date optional and adds `setup` to the usage log's feature check. It is applied at step F before MOM-128's pull request merges, with every verify script after it. 015 is optional and MOM-112's only. |
| **Setup's limits and live runs** | Today's limits (20 calls per person in 24 hours, 20 seconds apart) would cut a real setup off (RAID R-22). MOM-128 sets the setup budget from live eval runs at the 90th percentile plus a margin, only with your OK; without them it keeps named starting numbers and leaves that criterion open. Setup's prompt-field privacy check (MOM-111 block 3) is due before the trial. |
| **The 2026-10-27 pull requests conflict in shared files** | `BACKLOG.md` is edited by every branch. The minors-safeguards item is on both the MOM-116 and MOM-102 branches with identical text keyed MOM-126: when the second merges, keep one copy. The MOM-116 branch also edits `docs/plans/NEXT_BUILD_PLAN.md`, which the plan branch replaces: merge MOM-116 first, then in the plan branch keep this plan (it already carries the adults-only decision). MOM-125's branch carries a step 9 commit (keyed MOM-111) in `docs/DOMAIN_MODEL.md`. If any is still unmerged at `/day-start`, the blocks wait. |
| **MOM-110's iPhone check waits for setup** | The real-iPhone check runs only after MOM-111's screen is live and the standing smoke-test account has gone through setup on production (owner decision, 2026-10-27): no hand-seeding of production data. |
| **Hevy without a webhook** | MOM-129's "Sync now" runs on the person's session. A sync with no session (MOM-98's webhook) needs read-only service-role access to the bindings by migration, with no write access (owner decision, 2026-10-27, RAID I-07). Not scheduled today. |
| **Live Claude calls** | `npm test` never calls Claude. MOM-128's eval runs and MOM-111's live setup run each wait for your OK with their call count and cost, and their results go on the ticket. |
| **Stale generated types** | Generated route types outlive a branch switch (F-028, F-039). Until MOM-130 builds it into `/day-start` and `/run-block`, delete `.next/types` and `.next/dev` before the type check and build on a branch you just switched to. |
| **Auth email limits** | The default sender's hourly cap and the same-browser reset link are MOM-122 (RAID I-06, R-18); the production walk with a disposable second account is MOM-123. Both are trial prerequisites, not scheduled today. |
| **Archive name** | The plan run on 2026-10-27 carried the date 2026-10-27 and is archived as `docs/plans/archive/2026-10-27-2.md` (`2026-10-27.md` holds the plan run on 2026-10-26). This plan carries 2026-10-28. |
| **Standing smoke-test account** | `smoke-test@momentum-app.test` exists on production. Every live gate signs in as it; its password stays in your password manager. Production must hold exactly one user at day-end step B; no block creates a second one. Its goal-model data is created through setup and logging only. |
| **The old model stays until MOM-115** | The wizard, rebalance and checkbox criteria keep running, with the completion guard of migrations 002 and 008. New code follows `docs/DOMAIN_MODEL.md` and is built beside the old tables; MOM-112 shows the scoreboard beside the old feed. |
| **Dark only until MOM-30** | The app is dark regardless of the device setting. Light mode with a follow-device default is MOM-30, not scheduled. |
| **Not scheduled, queued with keys** | Thin slice: MOM-113 (weekly review), MOM-114 (settings), MOM-115 (retire the old model). Trial prerequisites: MOM-122 (auth email), MOM-123 (production auth walk). Tooling: MOM-130 (generated type folders), MOM-124 (day-loop follow-ups), MOM-127 (verify-script function calls). Deferred: MOM-126 (minors safeguards; the trial is adults only). Follow-ons during the trial: MOM-117 (own sheet and templates), MOM-118 (career playbook). Other: MOM-119 (grants), MOM-98 (webhooks), MOM-99 (adapter follow-ups), MOM-100 (CI hardening), MOM-101 (usage follow-ups), MOM-74 (retire `HEVY_API_KEY`), MOM-91 (`connection()`), MOM-95, MOM-96, MOM-97, MOM-70, MOM-26. |
| **Product risks live in the RAID log** | This table covers decisions for this build cycle. Product risks, assumptions, issues and dependencies (privacy of goal data, stored tokens and health data, model cost, synced data miscounting, setup inferring wrongly, setup limits, check scripts on production, local and production databases differing) are in `docs/RAID_LOG.md`, and AI misses in `docs/FAILURE_LOG.md`; both are reviewed in step D every day-end (MOM-92). |
| **Pull requests, not direct pushes** | `main` is protected (MOM-67): every change reaches it through a pull request with `checks` and `database` green, merged with a merge commit. `/run-block` commits on a feature branch and never merges; `/day-end` pushes the day's branches once, after your OK. A production migration is applied before its pull request merges (merging deploys to Vercel). |
