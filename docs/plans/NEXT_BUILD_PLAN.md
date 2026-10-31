# 🚀 MOMENTUM BUILD: NEXT-PHASE MASTER EXECUTION PLAN

> **Date:** 2026-11-01 | **Active Epic:** MOM-105 | **Base Commit:** 6c8fce4

> **Since the last plan (build day 7, 2026-10-30 into 2026-10-31):** every planned block was built, each on its own branch, and the 2026-10-31 day-end pushes them for pull requests in this order: MOM-145 (dark mode vibrancy and the main-button rule app-wide: a main button is never disabled or faded), MOM-111 (the quick path fills in what is missing and saves, one step at a time on a phone), MOM-115 (home without the old model's controls, a subset), MOM-148 (a way home and Sign out on every signed-in page, as page navigation before `<main>`), MOM-149 (warmer auth emails from "Momentum" at `hello@ownaccordlabs.com`, pasted in the dashboard), MOM-146 (the review's "change" edits a target's numbers from the next period, **migration 020** `target_changes`) and MOM-113 block 3.4 ("Still right for you?" and a warmer layer-2 line). MOM-123's production walk passed with no code; its sign-up findings are **MOM-150**. The day-end's step A stacked the branches in merge order on `origin/main` and found four real conflicts and one regression the per-branch checks missed (failure log F-078); the combined result passed 145 files and 4,901 tests. Migration 020 goes to production at step F before MOM-146's pull request merges, so production should hold 001 to 020 when today starts. The next free migration number is **021**.

> **The calendar to the trial (owner, 2026-10-31):** today, Sun Nov 1: MOM-147 first, then start MOM-132. Mon Nov 2: finish MOM-132, then MOM-150 (sign-up rework), then MOM-138 (after MOM-146), then MOM-114 only if there is room. Wed Nov 4: fixes from the owner's own smoke test only. **Production freeze from Thu Nov 5 until after 10:30 am PT Fri Nov 6.** **The family trial starts Sat Nov 7.** After Nov 6: the full MOM-115, MOM-117 and integration hardening.

---

## Today's runbook

**How to run a day.** Type `/day-start` first: it only reads and reports. Then type the command in the table below for each block, in this order, and skip any block whose Jira ticket is already Done. Each command first shows the block's model and effort: if your session differs, it stops and tells you the exact `/model` and `/effort` to type (use the session-only choice in the `/effort` slider, so your saved default is left alone), and you start the command again. Run `/clear` between blocks. When the last block is done, type `/day-end`. Nothing is pushed, merged or applied to production without your explicit OK, and work reaches `main` only through a pull request once both CI jobs are green.

| # | Type | Session setting | What to check at the gate |
| --- | --- | --- | --- |
| 0 | `/day-start` | Sonnet / Low | A clean tree; `main` matching `origin/main` with every 2026-10-31 pull request merged (MOM-145, MOM-111, MOM-115, MOM-148, MOM-149, MOM-146, MOM-113, and the day-end's MOM-16 and MOM-105 branches); production migrations 001 to 020; no leftover branches; the plan passing its format check; no missing environment variable names; `npm run stack:status` answering in one line. Then your three manual steps (below) and the carry-overs in `docs/plans/.pending-live-checks.md`. |
| 1 | `/run-block MOM-147` | Sonnet / Medium | Size M. Every listed transition call site keeps its update after an `await` inside the transition (or is gone with the old model), each test waits for the settled control, a source test sweeps for the pattern, and `npm test` passes three full runs in a row. |
| 2 | `/run-block MOM-132` | Sonnet / High | Size L, split by design. Today: you approved the design (its words as plain text) and migration 021 before code; the new save, a later target's own start and the order of goals and targets are built with engine, service and verify tests; the migration waits for step F. The screen and its browser spec finish on Monday. |
| 3 | `/day-end` | Opus / High | Step A checks each branch stacked in merge order on `origin/main`; migration 021 is applied to production at step F after CI is green and your OK, before its pull request merges, with every verify script after it; production holds one user. This is the first day-end of November: it runs the monthly pattern review of October's failure log. |

**Your manual steps today (owner, by hand):** (1) In the Supabase dashboard, set the minimum password length to 8 (Authentication, Sign In / Providers, Email), so it matches the app (MOM-150). (2) Check the Google OAuth consent screen's verification status before the demo. (3) After last night's deploy, run the smoke-test persona's setup on production on your phone, signed in as the standing smoke-test account (it can set up only once; see the pending live checks).

If a block needs another ticket's code, `/run-block` checks that code is already in `origin/main`. If it is only on an unmerged branch, it stops and offers two ways forward: push that branch and merge its pull request first, or stack this block on that branch (only with your OK). **Both blocks need the 2026-10-31 pull requests merged**: MOM-147's call sites include MOM-145's and MOM-146's changed components, and MOM-132 builds on the quick path (MOM-111), the target changes of migration 020 (MOM-146) and the setup page's back row (MOM-148).

---

## Executive Overview & Architectural Invariants

Build day 8 is the first of the last three build days before the family trial (Sat 2026-11-07). It opens with reliability, so the trial's code does not flake in CI or for a tester (MOM-147: the transition pattern behind failure log F-072 and F-079), then starts letting a person add a goal or a target after their first setup (MOM-132), which the trial needs because a tester's goals change in two weeks.

`docs/DOMAIN_MODEL.md` is binding for all new code. The old model stays in the code until MOM-115 retires it, so new code is built beside the old tables, never into them. Every block preserves these invariants:

1. **Claude never scores.** The engine (`lib/engine/`) computes every number from entries and the target in force; no Claude output is stored as a number, and setup's draft is validated by code, not by Claude (DOMAIN_MODEL §1.7, principle 9).
2. **The person's word beats any source.** A manual entry or correction always wins over a sync; a value the person typed beats a suggestion; corrections are keyed to the source's own record id (§1.5, §1.6).
3. **Never assume anything about a person's life.** Time zone, week start and day end are the person's to set; the quick path applies no default (§2.3); a suggestion the person took is a starting point, checked at their first review (§2.1 rule 4).
4. **Unfinished work moves, habits never carry over.** (§1.4, principle 11.) A changed target takes effect from the period after the reviewed one and never re-grades a closed one (§1.7, MOM-146); a target added later is graded only from its own start (MOM-132).
5. **Service-layer RLS enforcement.** The UI never queries Supabase. Every read and write goes through `lib/services/`; every new table has row level security keyed to its owner, explicit grants and an entry in `supabase/verify/900_table_grants.sql`'s allow-list.
6. **The old model's guards stay until MOM-115.** Nothing today removes a table, migration or service of the old model.
7. **Nothing is saved until final approval** in setup, every Claude call goes through `lib/services/llm.ts`, and a Claude call sends only the fields the privacy notice lists (pinned by a test).
8. **A stored record of what was said is never rewritten** (RAID R-26).
9. **Plain words** (DOMAIN_MODEL §2.1): everyday words with a reason, the person's own words restated, a way out of every change, "what do you mean?" always answered.
10. **A transition settles in one render** (failure log F-072, F-079): a state update after an `await` inside a transition's start function is wrapped in the start function again, and its test waits for the settled control with `findByRole`, not only the message or the call.
11. **A main button is never disabled or faded** (MOM-145): while work is in flight it stays solid and says it is busy; a single-answer input shows no button until it has a value; a form with several fields answers a tap with a plain callout naming what is missing. `tests/main-button-rule.test.ts` sweeps every component.

## Standing Rules (every prompt below repeats what it needs)

- **Read the Jira ticket first.** If its title, scope or acceptance criteria disagree with the prompt, or the prompt disagrees with `docs/DOMAIN_MODEL.md`, stop and flag it.
- **Production changes need your approval.** A prompt stops before `supabase db push`, `vercel env`, or any push to `origin`, shows what will happen, and waits. Never use the SQL Editor. Tests never run against production and never use production credentials.
- **Database checks are not part of `npm test`.** They live in the SQL scripts in `supabase/verify/` and run with `npm run verify:sql` (local stack) or, against production, with the step B loop. After any migration, or any change to a verify script, run **all** of them; every row must show `passed = true`. A local total is not a production total: one script has checks that run only on production (RAID R-16, failure-log F-027).
- **New migrations, numbered in push order:** MOM-132 takes **021**, only with your OK at its design stop. A later branch with a migration merges `origin/main` before its push. Never edit an applied migration.
- **Pull requests, not local merges.** `main` is protected: work reaches it only through a pull request with the CI jobs `checks` and `database` green, merged with a merge commit (CLAUDE.md). A block commits on its feature branch and stops: it never merges into `main` and never pushes. Branches are pushed only with your explicit OK (normally once, at day-end step F).
- **A migration is applied before its pull request merges.** A block with a migration runs `npm run verify:sql` locally, shows the migration and `npx supabase db push --dry-run`, and stops. At day-end step F, once CI is green on its pull request and you say OK, the production `db push` and then ALL the verify scripts run, before that pull request merges (merging deploys to Vercel, and the new code needs the new schema).
- **Blocks never edit `BACKLOG.md`.** A block's backlog notes, new gaps and follow-ups go in its Jira comment and its close-out; day-end step D writes `BACKLOG.md` once, on its own branch.
- **Build time.** Each close-out and Jira comment gives `Build time: about <n> min, not counting waits on me (<size band>)`: working time from the design OK to the commit, leaving out design and look reviews, screenshot OKs, live-call OKs and dashboard steps you do by hand. If the block was not timed, it says "not measured", never a guess (failure log F-076). Day-end step E builds its planned-versus-actual table from these lines.
- **Run the specs of every page you change** (failure log F-078), not only the spec you wrote: a block that changes a page runs that page's browser specs too. CI's full run comes only after the day-end push.
- **A screen design lists its words as plain text at the design stop** (failure log F-073), so you read them as a tester before any pixel; Claude reads every screenshot the same way, words top to bottom first, layout second, before you see it. A block that changes a screen saves its screenshots in `C:\Users\matth\momentum-screenshots\<block>\` (for example `MOM-132-add-goal`), at 390px (and 1280px where the layout changes), in light and dark, and shows them to you before it commits. A test that compares dates also runs once with the browser's clock across a day boundary from the person's (F-069).
- **Dashboard steps come from files** (MOM-149): anything you paste into a dashboard is copied from a file opened in an editor, never from terminal output.
- **Is the local stack up?** Ask it with `npm run stack:status` (it prints only "Local Supabase stack: running" or "Local Supabase stack: not running"). Never run `supabase status` unfiltered: its output holds the local stack's keys (failure log F-047, F-049, F-051, F-057, F-059), and `.claude/settings.json` denies it.
- **Logs (MOM-133).** A failure-log entry is written only when it leads to a fix made that session, a new standing rule or a Jira ticket, and names which; it is marked `unreviewed` until the day-end. `docs/RAID_LOG.md` is frozen: a new risk, assumption, issue or dependency becomes a Jira ticket with the `risk` label.
- **Claude calls cost money.** `npm test` never calls Claude: model calls in tests go through a fake. A block that wants a live Claude call says how many calls and the cost cap and stops for your OK first, and it is logged through `lib/services/llm.ts`. Neither block today plans one.
- **Stale generated types.** Generated route types under `.next/` outlive a branch switch (failure log F-028, F-039). Until MOM-130 builds it into the commands, delete `.next/types` and `.next/dev` (both git-ignored and regenerated) before `npx tsc --noEmit` or `npm run build` on a branch you just switched to.
- **Memory on the build machine.** The full local `npm run test:e2e` runs out of memory (MOM-141). Close what you do not need before heavy steps; run a block's own specs and its changed pages' specs one at a time; CI's `database` job is the full-suite gate. A jsdom test that fails a full run and passes alone is a failure to fix, not a flake to rerun (MOM-96).
- **Standing smoke-test account.** Production keeps ONE standing test account, `smoke-test@momentum-app.test`, created by you in the Supabase dashboard (Authentication → Add user, Auto Confirm User on). Its password lives only in your password manager: Claude never asks for it, prints it or stores it in the repo, and never creates, edits or deletes users on production. Every live sign-in check in this plan says "sign in as the standing smoke-test account". Claude may read its data with **count-only** queries. If its data gets cluttered, you delete and recreate it in the dashboard (it starts empty). The SQL verify scripts create and delete their own passwordless temporary users and leave none behind, and since MOM-121 every insert, update and delete in them is limited to those users (writes made through function calls are MOM-127, not yet built). Production should always hold exactly one user. The standing account's goal-model data is created only through the app (setup, logging), never seeded by hand. Browser tests use throwaway users on the **local** stack only.
- **The repo is public.** Anything written to a committed file (logs, docs, tests, fixtures, eval cases) names categories, never secrets, personal data or exploit steps. Trial testers are described by role only ("the owner", "two household testers"). The family trial is adults only (MOM-126). Eval cases are scripted, with personal details removed.

## Session Preflight (run before every block)

`/run-block` does this for you, one command at a time. By hand:

```bash
cd C:\Users\matth\momentum-app
git status --short          # expect a clean tree (AGENTS.md and the Supabase folders are git-ignored since MOM-68); only your uncommitted docs/FAILURE_LOG.md may also show; anything else, even an untracked file, stops the block
git fetch origin
git rev-parse main origin/main   # the two must match. If main is only behind: git switch main, then git pull --ff-only (each on its own)
npm run stack:status              # one line: running or not running
npm run plan -- MOM-<n>           # optional: the generator's view of the ticket
npm run plan:check -- --block MOM-<n>   # optional: what this plan says about the block (config, prompt lines, gate)
```

---

## High-Priority Ticket Sequence & Session Blocks

```text
SESSION 1: RELIABILITY, THEN ADDING A GOAL AFTER SETUP (MOM-147, MOM-132)   build day 8, Sun 2026-11-01, trial Sat 2026-11-07
  - Keep post-await state updates inside their transition at every call site, with a sweep
  - Add a goal or a target after first setup: design, migration 021 and the service today; the screen on Monday
```

*Order is the owner's (2026-10-31 day-end). MOM-147 first, so the trial's code and CI stop flaking; MOM-132 is size L and is split by design, finishing on Monday before MOM-150 and MOM-138. Safe stopping points: after each block, and after MOM-132's first part. Anything unfinished goes first on the next build day.*

---

# SESSION 1: RELIABILITY, THEN ADDING A GOAL AFTER SETUP

**Your prerequisites before this session:** (1) Every 2026-10-31 pull request is merged and migration 020 is on production; `/day-start` shows it. (2) Docker Desktop running and the local stack started (`npx supabase start`; `npm run stack:status` says running) for the browser tests and `npm run verify:sql`. (3) Close what you do not need before the heavy steps (MOM-141). (4) Your three manual steps in the runbook, any time today. (5) Be ready to read MOM-132's design words as a tester at its design stop.

## Block 1.1: Transitions Settle in One Render at Every Call Site (MOM-147)

* **Objective & Scope:** Size M (about 40 to 70 minutes). In React 19 a state update made after an `await` inside a transition's start function is not part of the transition, so it can render before the pending flag clears (an error beside "Saving…", a result beside a disabled button). Failure log F-072 found it in the review's finish and the theme choice; F-079 found a test of the theme choice that tapped before the transition settled. The ticket lists 10 call sites on `main`: `components/entries/useEntryAction.ts`, `components/goals/GoalBuilderWizard.tsx` (2), `components/integrations/ConnectionControls.tsx`, `components/integrations/HevySyncControl.tsx`, `components/integrations/IntegrationCardList.tsx`, `components/plan/usePlanAction.ts`, `components/rebalance/RebalanceDrawer.tsx` (2) and `components/tasks/useTaskToggle.ts`. Re-check the list against `main` after last night's merges (MOM-145, MOM-146 and MOM-113 added transitions), fix each, make each test wait for the settled control, and add a source sweep so the pattern cannot return.
* **Core Invariants to Protect:** *A transition settles in one render*. *A main button is never disabled or faded* (busy, not disabled, for main buttons). No behaviour change a person can see except that the settled state arrives in one render.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-147: keep every state update after an await inside its transition, at every call site, with settled-state waits in the tests and a source sweep.

Task Instructions:
1. Read ticket MOM-147 in Jira first, with its 2026-10-31 comment (the theme choice test). Its acceptance criteria are the definition of done. If they and these instructions disagree, stop and flag it.
2. Read CLAUDE.md, docs/FAILURE_LOG.md F-072 and F-079, and each listed file: components/entries/useEntryAction.ts, components/goals/GoalBuilderWizard.tsx, components/integrations/ConnectionControls.tsx, components/integrations/HevySyncControl.tsx, components/integrations/IntegrationCardList.tsx, components/plan/usePlanAction.ts, components/rebalance/RebalanceDrawer.tsx, components/tasks/useTaskToggle.ts, with their tests. Check the local stack with `npm run stack:status`; never run `supabase status` unfiltered.
3. Create the feature branch `feature/MOM-147-transition-call-sites` off an up-to-date `main`.
4. Before editing, search `components/` and `app/` for every `startTransition(async` (and the hook form) and list each site that sets state after an `await` without wrapping it again, including any added by last night's merges. Show me the list with the fix for each, then STOP for my OK.
5. Fix each as approved: wrap the update after the `await` in the start function again (`startTransition(() => setX(...))`). A main button stays busy, never disabled (MOM-145).
6. Tests: for each fixed site, its component test waits for the settled state with `findByRole` (the control back by its ready name and enabled), not only the message or the call. Add a source test that fails on a set-state call after an `await` inside a start function that is not wrapped again, sweeping `components/` and `app/`, with a deliberately bad fixture string proving it can fail.
7. Run `npx tsc --noEmit`, `npm run build`, and `npm test` three full runs in a row; report each run's totals. If a run fails on a test that passes alone, fix it (MOM-96), do not rerun past it. Run the browser specs of the pages whose components changed (stop `npm run dev` first), one at a time: `tests/e2e/manual-entry.spec.ts`, `tests/e2e/plan.spec.ts`, `tests/e2e/connections.spec.ts`, and `tests/e2e/wizard.spec.ts` and `tests/e2e/drawer.spec.ts` if an old-model site changed.
8. No screen changes and no live Claude call in this block.
9. Do not edit BACKLOG.md. Put backlog notes in the Jira comment and the close-out. Say "Privacy impact" and the "Build time" line in the close-out ("not measured" if not timed). Comment on MOM-147 with the sites fixed (or removed), the sweep, the three runs' totals and each acceptance criterion met or unmet; do not move it to Done.
10. Commit with "fix(MOM-147): keep post-await state updates inside their transition, with a sweep". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes three full runs in a row (with no network call); the changed pages' browser specs pass; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] You approved the list of call sites, including any added by last night's merges, before any edit.
  - [ ] Each fixed site's test waits for the settled control (read one).
  - [ ] The source sweep fails on the bad fixture and passes on the code.
  - [ ] Three full `npm test` runs in a row passed, with their totals in the close-out.

---

## Block 1.2: Add a Goal or a Target After First Setup (MOM-132)

* **Objective & Scope:** Size L (70 minutes or more), split by design. Guided setup's save (`save_guided_setup`, migration 015, its newest version in 017) is first-setup-only on purpose, so a person cannot add a goal after their first setup (RAID I-08), and `/setup` shows "Setup is already done … not built yet". A target added to a goal that has already started would be graded on weeks before it existed, because targets take their start from their goal (RAID R-30). The person's order of goals and targets is not stored (RAID A-08). **Today:** the design, migration 021 (an add-a-goal save of its own, a target's own start, the order columns), the service and the engine reading a target's own start, with engine, service and verify tests. **Monday:** the screen (setup reached again from home or `/setup`, replacing the "already done" card) and its browser spec. Owner decision (MOM-111, 2026-10-28): its **own save**, never a loosening of the first-setup save.
* **Core Invariants to Protect:** *Nothing is saved until final approval*. *Never assume*: no default goal, start or order. *Re-baseline without re-grading*: a later target is graded only from its own start, and nothing already saved changes. *Service-layer RLS*. *A main button is never disabled or faded*. *A transition settles in one render*.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-132, part 1 of 2: a person can add a goal or a target after their first setup, through its own save; today the design, migration 021, the service and the engine, with their tests.

Task Instructions:
1. Read ticket MOM-132 in Jira first. Its acceptance criteria are the definition of done for the whole ticket; this block covers the save, the target's own start and the order, not the screen. If they, these instructions and docs/DOMAIN_MODEL.md §1, §2 and §1.7 disagree, stop and flag it.
2. Read CLAUDE.md, docs/DOMAIN_MODEL.md §1.3, §1.7 and §2, supabase/migrations/015_save_guided_setup.sql and 017_starting_points.sql (the newest save_guided_setup), 020_target_changes.sql, lib/setup/rows.ts, lib/services/setup.ts, lib/services/scoreboard.ts, lib/services/scoreboardRows.ts, lib/engine/index.ts, lib/engine/baseline.ts, app/setup/page.tsx, components/setup/SetupConversation.tsx and tests/setup-service.test.ts. Check the local stack with `npm run stack:status`; never run `supabase status` unfiltered.
3. Create the feature branch `feature/MOM-132-add-goal-after-setup` off an up-to-date `main`.
4. Design before coding, then STOP for my OK: (a) the add-a-goal save as its own database function next to save_guided_setup (what it accepts, what it refuses, how a double submit cannot save the same goal twice); (b) adding a target to an existing goal: where the target's own start is stored and how the engine and the scoreboard read it, so no week before it is graded; (c) the order of goals and targets: the columns, how both saves write them, and how the engine's ranking of the week's biggest crossing uses them; (d) migration 021 in full, its RLS and grants, its verify script and the `900_table_grants.sql` change; (e) how a person reaches it (from home and from `/setup`, which today says "Setup is already done"), with every word on those screens as plain text for me to read as a tester (the screens themselves are built on Monday); (f) what part 2 on Monday will build. Wait for my answer.
5. Build as approved: the migration, the service in lib/services/ (the only writer), the engine and scoreboard reading a target's own start, and the order. A main button stays busy, never disabled (MOM-145); a state update after an await inside a transition is wrapped again (F-072).
6. Tests: engine tests that a target added later is graded only from its own start and that nothing already saved changes; service tests against the in-memory fake (one person never adding to another's goals; a double submit saves once); the migration's verify script; `npm test` makes no network call.
7. Run `npx tsc --noEmit`, `npm test`, `npm run build`, `npm run verify:sql` (all scripts; reset the local database first), and the setup and home browser specs that already exist (`tests/e2e/setup.spec.ts`, `tests/e2e/home.spec.ts`; stop `npm run dev` first), so nothing on those pages broke.
8. Show me migration 021 and `npx supabase db push --dry-run`, and stop. The production `db push` and ALL the verify scripts run only at day-end step F, after CI is green on the pull request and my OK, and before it merges.
9. No live Claude call in this block.
10. Do not edit BACKLOG.md. Put backlog notes in the Jira comment and the close-out. Say "Privacy impact" (a new stored field goes in the privacy notice) and the "Build time" line in the close-out ("not measured" if not timed). Comment on MOM-132 with the approved design, what changed, what part 2 builds and each acceptance criterion met, partly met or not started; do not move it to Done.
11. Commit with "feat(MOM-132): add a goal or a target after first setup through its own save, with migration 021". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes (with no network call); npm run verify:sql passes with migration 021; the existing setup and home browser specs pass; migration and dry run shown, not applied; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] You approved the save, the target's own start, the order, migration 021 and the screens' words before code.
  - [ ] A target added to a started goal is graded only from its own start, and nothing already saved changed (the engine and service tests).
  - [ ] A double submit saves the new goal once (the test).
  - [ ] Migration 021 and its dry run were shown and not applied; its verify script passes locally.

---

# FINAL DAY-END BUILD VERIFICATION & PULL REQUESTS

Run after the last block of the day, or type `/day-end` and let it run these in this order: **A, B, D, E, then F (the one push, after your OK), then C (live checks, after the pull requests have merged and Vercel has deployed)**. Stop on the first failure. When the whole sequence has finished and you say so, `/day-end` ends with the line `Tomorrow: /day-start (Sonnet / Low)`.

**The build day's window.** The day starts at the previous day-end's last merge, not at midnight, so a day-end that runs past midnight sees the same work. It is the newest merge on `origin/main` of a step E branch, found by the branch name, which always ends in `-next-build-plan-doc`: `git log origin/main --merges -n 1 --grep="next-build-plan-doc" --format="%h %cI %s"`. `/day-end` prints it as `Window: after <hash> (<date>, <subject>)` at the start and reuses that hash in steps B, D and F (it never recomputes it, because today's own step E branch will have merged by then). If there is none, you give a start date. Below, `<window>` means that hash.

**When there is nothing to sync.** `/day-end` stops at the start only if all four hold: no unmerged branches; no open backlog item without a Jira key; no entry marked `unreviewed` in `docs/FAILURE_LOG.md` (`docs/RAID_LOG.md` is frozen and is not checked); and no ticket with commits on `origin/main` in the window that Jira still shows as neither Done nor Closed. It names each condition, and says which ones kept it going. Failure entries carry the `unreviewed` mark in their heading line (`### F-0nn · … · unreviewed`); an entry drafted without the mark is still a waiting entry, so also look at the entries added in the uncommitted changes to the log (failure log F-061, MOM-124).

**Your log edits and branch switches.** If you hold uncommitted edits to `docs/FAILURE_LOG.md` or `docs/RAID_LOG.md` and a branch's copy of either file differs, a plain `git switch` aborts. Before each switch `/day-end` checks for this, says so in plain words, backs both files up, stashes them (`git stash push -- <the two files>`), switches and pops. If the pop conflicts, it stops, restores from the backup and asks you. It never stages a log file for this; only the entries you approve in step D are staged.

**The trial.** The family trial starts Sat 2026-11-07, with a production freeze from Thu Nov 5 until after 10:30 am PT Fri Nov 6. Whatever does not finish today goes first on Monday: the rest of MOM-132, then MOM-150, MOM-138 and, only if there is room, MOM-114.

## A. Build and repository checks (PowerShell or Git Bash)

`/day-end` runs this. **Check each branch on top of `origin/main` and the branches that merge before it** (2026-10-31: four real conflicts and one regression showed only that way, failure log F-078): on a detached HEAD at `origin/main`, merge the day's branches one at a time in merge order and run the checks after each. A branch never moves for this; a fix found here is committed on its own branch, or carried to it at the push. Docs-only branches (D and E) need only `npm test` and `npm run plan`. Read the whole output of each command, never a filtered part of it; a merge's own result is read before any check runs.

```bash
cd C:\Users\matth\momentum-app
git status --short                                  # a clean tree; only your uncommitted docs/FAILURE_LOG.md may also show
git branch --no-merged origin/main                   # the day's feature branches: work not yet in origin/main
git switch --detach origin/main                      # see "Your log edits and branch switches" above
# then, for each branch in merge order, one at a time:
git merge --no-ff --no-edit <branch>                 # read its result first: a conflict stops here
npx tsc --noEmit                                    # expect no output
npm test                                            # expect all passing
npm run build                                       # expect "Compiled successfully"
npm run plan                                        # always exits 0: read its closing lines
```

`npm run plan` ends with "Every open item has a Jira key." or lists the items without one. Blocks do not edit `BACKLOG.md`, so a block's branch should add no unkeyed item; if one appears, step A lists it as "handed to step D" and does not fail the branch. Step D's Definition of Done is where every open item must have a key.

`npm run test:e2e` and `npm run verify:sql` also run in CI on every pull request. Run `npm run verify:sql` here for a branch with a migration (reset the local database to the stack's migrations first with `npx supabase db reset --local`), and the browser specs of every page the day's branches changed, one spec file at a time (stop `npm run dev` first; check the stack with `npm run stack:status`). Any server error in the e2e output is a failure, with two known exceptions until MOM-124's expected-lines list exists: the wizard spec's two `[task-plan-ai] the API key was rejected { httpCode: 401 }` lines and the `[synced-entries] not counted … reason: 'no_source'` lines from the Hevy "no bound target" spec. A jsdom test that fails a full run and passes alone is a failure to fix, not a flake to rerun (MOM-96).

Generated route types outlive a branch switch: a browser test run leaves the development server's in `.next/dev`, and a production build leaves its own in `.next/types` (failure log F-028, F-039). Delete both folders (git-ignored, rebuilt by the next build or `npm run dev`) before the checks after each merge; if `tsc` or the build still fails only in a file under `.next/`, delete them and run the check again; any other failure is real. MOM-130 builds this into the commands.

## B. Database verification (production), only if migrations were applied in the window

A migration is in the window when `git log --branches --remotes --not <window> --name-only --format=%h -- supabase/migrations` lists a file (021, if MOM-132 added it). B also runs when a script in `supabase/verify/` changed in the window, because production is where those scripts are proven. **Git Bash only.** This loop uses `/tmp`, `grep`, `$(...)` and `for ... done`, which do not work in PowerShell. `npm test` does **not** run these scripts. Every script must report `false 0` and a non-zero `true` count (0 and 0 means the script errored).

**When a migration is still waiting for its push.** This plan applies each migration at step F, after CI is green and before its pull request merges. If the window's migrations are not yet on production when B runs, B runs only its read-only part now (the migration list, where remote should stop at the last applied migration, the dry run, and the user count), and the verify loop runs at step F right after each `db push`. Running the loop before the push would fail the new migration's verify script and write throwaway users to production twice.

```bash
npx supabase migration list                         # local and remote columns must match for every migration already applied
T=0; F=0
for f in supabase/verify/*.sql; do
  npx supabase db query --linked -f "$f" -o table > /tmp/v.txt 2>&1
  t=$(grep -cE '│ true ' /tmp/v.txt); fl=$(grep -cE '│ false ' /tmp/v.txt)
  echo "$(basename $f): true $t false $fl"; T=$((T+t)); F=$((F+fl))
done; echo "TOTAL true $T false $F"                 # expect false 0 and a true count no lower than the last production total (recorded at the 2026-10-31 step F after 020), plus the checks added in the window. A local count is not a production count: one script runs 5 more checks on production
npx supabase db query --linked -o table "select count(*) as users from auth.users"   # expect 1: only the standing smoke-test account
```


## D. Automated End-of-Day Backlog, Obsolescence & Jira Sync (copy-paste)

```text
Perform end-of-day backlog synchronization, obsolescence audit, and ticket generation.

Task Instructions:
1. Scan BACKLOG.md, ROADMAP.md, code TODO tags, the window's commits (`git log --branches --remotes --not <window> --no-merges`, the window being the one `/day-end` printed at its start) and the Jira comments the day's blocks left on their tickets (blocks do not edit BACKLOG.md: their backlog notes, gaps and follow-ups are in those comments and their close-outs) for newly discovered gaps, TODOs or deferred items. Run `npm run plan` and treat every open item without a Jira key as un-ticketed.
2. Audit the "To Do" and "In Progress" tickets in Jira under the active Phase epic against the code on main:
   a. Read each candidate ticket's acceptance criteria and check them against the code and tests before judging. A ticket is obsolete, redundant or fully satisfied only if EVERY criterion is met or moot. Partly satisfied is not obsolete: add a comment saying what is done and what remains.
   b. Propose truly obsolete or redundant tickets for "Closed" (the pause in step 6 applies) with a brief comment explaining why. Never transition anything to "Done" in this step: step D runs before the day's pull requests have merged, so nothing is delivered yet. Done transitions are made in step F, after the merge.
   c. Annotate or remove the matching entries in BACKLOG.md (tick resolved items, re-key items pinned to closed tickets to the ticket that now owns the work).
   d. Check every epic in the MOM project, including the Phase 1 epics MOM-4 to MOM-7, and note which would have every child Done or Closed once today's merged tickets are Done. Do not transition an epic here: step F lists those epic transitions after the merge. Leave an epic with any open child alone. Do not re-parent tickets.
3. Confirm the active Phase Epic key and that every ticket created today is its child.
4. For each un-ticketed item found, group related items, then:
   a. Write the ticket in our format (Title, Summary, Technical Scope, Acceptance Criteria);
   b. Create it in Jira under the active Phase Epic (check for duplicates first; if a call times out, search before retrying); a new risk, assumption, issue or dependency gets the `risk` label;
   c. Add the new Jira key to the item in BACKLOG.md and to the ticket table.
5. Audit today's tickets: list what was finished today with its branch and pull request (it becomes Done in step F, after the merge); anything with unmet acceptance criteria must say so in a comment. Report any mismatch between a Jira ticket's real scope and its key in BACKLOG.md instead of guessing.
6. PAUSE before any Jira transition. In this step the only one allowed is "Closed" for an obsolete or redundant ticket: list every transition you intend to make, with the reason that justifies it, and wait for my OK. Comments and ticket creation do not need the pause. Never move a ticket or an epic to "Done" in step D.
7. Failure log and risks (MOM-92, lighter rule MOM-133; the rules are in CLAUDE.md, "RAID and Failure Logs", and `/day-end` step 3):
   a. From today's sessions (corrections I made, failed checks, claims that proved false), draft any missing entries in docs/FAILURE_LOG.md, marked `unreviewed`, but only where the miss led to a fix made that session, a new standing rule or a Jira ticket, and each entry names which ("Led to:"). Entries carry no secrets or personal data.
   b. docs/RAID_LOG.md is frozen and takes no new rows. A new risk, assumption, issue or dependency becomes a Jira ticket with the `risk` label (step 4b), or a comment on the ticket that already carries it.
   c. Show me today's unreviewed entries as a short numbered list (one line on what went wrong, your draft of why, and what it led to), with no "predicted it?" question. Wait for my plain-language reply (for example "ok all", "drop 2"). Apply it and remove the `unreviewed` marks on approved entries. Never ask me to edit the files or run a command. If I skip, leave the entries unreviewed for the next day-end; nothing unreviewed is committed. If some entries are approved and others are not, stage only the approved entries (never the whole file); the working copy keeps the rest.
   d. At the first day-end of the week, also show the weekly top 5: `project = MOM AND labels = risk AND status NOT IN (Done, Closed) ORDER BY priority DESC, updated DESC`. At the first day-end of a calendar month, also run the monthly pattern review: look across that month's failure entries for a cause that recurred, decide whether it needs a new standing rule or ticket, and record the result (the month's entry count and how many led to a fix, a rule or a ticket) as a Jira comment on MOM-92, never in the repo. Today (Sun 2026-11-01) is the first day-end of November: run the monthly review of October's entries.
   e. A fix that needs build work beyond the session gets a BACKLOG.md item, ticketed by step 4 above.
   f. Then ask "promote anything to the playbook?" List the top 3 candidate lessons from today in full, each one sentence with Why and Source, generic enough for any project (no ticket keys, file names or secrets). List any other candidates as one-line titles under "Also considered", which I can expand or skip. Wait for my reply. Print the approved ones as a single paste block headed "Playbook promotions <date>". Don't write them anywhere in the repo.
8. Create a feature branch off an up-to-date `main` (`feature/MOM-16-eod-backlog-sync`; if it already exists and is fully merged into origin/main, delete it with `git branch -d` and create it again) and commit BACKLOG.md (ROADMAP.md if changed, and only the docs/FAILURE_LOG.md entries I approved in step 7) with "chore(MOM-16): sync end-of-day backlog, prune obsolete tickets, and update Jira", staging files by name. An item that exists only in lines an unmerged branch already changes gets its key by a small commit on that branch instead. Do not merge it into main and do not push: it is pushed with the day's other branches at step F and merged through its pull request.

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
   - Metadata Header at the top: `> **Date:** YYYY-MM-DD | **Active Epic:** MOM-XX | **Base Commit:** <SHORT_HASH>`, the Date being the calendar day the plan will run.
   - Executive Overview & Architectural Invariants, and the Standing Rules (Jira first, production approval, verify scripts, no pushes inside blocks, blocks never edit BACKLOG.md, the build-time line, the lighter log rule, standing smoke-test account, the screen rules: words as plain text at the design stop and a screenshot folder per block, dashboard steps from files).
   - A "Today's runbook" section near the top, after the metadata header and before the first block: a table with one row per block, in order, giving `/run-block MOM-n`, the session setting (model / effort) and, in plain words, what to check at the gate. The table's first row is `/day-start` (Sonnet / Low) and its last row is `/day-end` (Opus / High), each with its own plain-words gate text; `npm run plan:check -- --strict` warns when either is missing or out of place. The text above the table also says that `/day-start` comes first and `/day-end` last.
   - Logical Session Blocks grouping high-priority tickets, in dependency order, each in the format `npm run plan:check` enforces: a heading `## Block <n>.<m>: <title> (MOM-<n>)` with exactly one ticket key (unique in the plan); a `* **CLI Session Config:** Model: X | Effort: Y` line; exactly one fenced `text` prompt that names its ticket and carries a commit message `type(MOM-n): ...`; and a `* **User Verification Gate:**` checklist. Before each session's first block, a `**Your prerequisites before this session:**` note (it may say none). Give each block a size in its objective (S about 20 to 40 minutes, M about 40 to 70, L 70 or more, timed from the design OK) until MOM-124 adds a Size field.
   - Block prompts that follow the pull-request workflow (CLAUDE.md): create the feature branch off an up-to-date `main`; commit on it with the Jira key; do NOT merge into `main` and do NOT push (the one push is at day-end, step F, after my OK); do NOT edit BACKLOG.md (notes go in the Jira comment and the close-out); give the "Build time" line in the close-out; end with "Definition of Done: ...; committed on the feature branch." A block with a migration says: run `npm run verify:sql` locally, show the migration and `npx supabase db push --dry-run`, and run production `db push` and then ALL the verify scripts only after CI is green on its pull request and I say OK, and before that pull request merges (merging deploys to Vercel). A block that needs another ticket's code says it "must already be in origin/main" and stops if it is not. When two blocks add migrations on separate branches, number them in the order they will be pushed, and say that the later branch merges origin/main before its push. A block that changes a screen lists its words as plain text at the design stop, runs the browser specs of every page it changes, and shows screenshots at 390px, in light and dark, from its own folder, before it commits.
   - Dynamic CLI Session Config (Sonnet / High for architecture, security and database work; Sonnet / Medium or Low for standard UI and tests).
   - Copy-pasteable prompts including tsc --noEmit, npm test, npm run build, feature branching with the commit left on the feature branch (never merged into `main` locally and never pushed; `main` takes it through a pull request, see the pull-request bullet above), and Jira updates.
   - User Verification Gates for each block.
   - Final Day-End Build Verification & Pull Requests section (steps A, B, D, E, then F the one push, then C the live checks after the merge), with step A checking each branch stacked in merge order on origin/main, the step B verify loop marked Git Bash only, step D never moving a ticket or an epic to Done (it only comments, creates tickets and proposes Closed, with a pause for my OK), step F ending with a post-merge list of Done transitions that waits for my OK, and step D's log step carried from the rules MOM-133 put in CLAUDE.md and `/day-end` (no nightly "predicted it?", no new RAID rows, the weekly top 5 and the monthly pattern review), including the playbook question, and including this instruction in step E.
   - An updated Open Decisions and Risks table.
5. Archive the finished plan first: copy the current `docs/plans/NEXT_BUILD_PLAN.md` to `docs/plans/archive/YYYY-MM-DD.md`, using its own metadata date (create the folder if needed; if that file already exists, add `-2`, `-3` and so on rather than overwrite), and append to the archive a `## Planned versus actual` table, one row per runbook block: block, ticket, planned size, actual build time (the block's `Build time:` line; "not recorded" when it has none, never an estimate) and outcome (done, split with what remains, or carried with why). Then save the generated plan to `docs/plans/NEXT_BUILD_PLAN.md` and run `npm run plan:check -- --strict`; fix the plan until it reports no errors and no warnings.
6. Create a feature branch `feature/MOM-XX-next-build-plan-doc` off an up-to-date `main` (before step 5 writes any file). The name always ends in `-next-build-plan-doc`: the next day-end finds the start of its window by searching for the merge of that branch. Commit the archive file and `docs/plans/NEXT_BUILD_PLAN.md` with "docs(MOM-XX): add generated next build plan" (MOM-XX is the active Phase Epic), staging files by name. Do not merge it and do not push; show me `git log origin/main..<branch> --oneline` and wait. It is pushed with the day's other branches at step F.
```


## F. Push the day's branches and merge the pull requests (the one push)

This is the day's single push and it needs your explicit OK. Nothing here pushes `main`: work reaches `main` only through pull requests.

```bash
git log origin/main..<branch> --oneline            # for EACH of the day's feature branches, including the step D and E branches: exactly what will be published
git push -u origin <branch>                         # after your OK, one branch at a time; never main. The link to open the pull request is printed
```

1. Open a pull request for each branch (the link printed by the push; `gh pr create` only if `gh` is installed and you say yes). A stacked branch is opened against `main` only after the branch under it has merged, so it shows only its own commits.
2. Wait for CI: both jobs, `checks` and `database`, must be green on every pull request. If a job goes red, read its log, fix the cause on the branch, rerun the checks locally and push again (each push with your OK).
3. For a branch with a migration (MOM-132's 021): production `npx supabase db push --dry-run`, then `db push`, then ALL the verify scripts (step B's loop), only after CI is green and your OK, and **before** that pull request merges.
4. Merge each pull request with a merge commit (the GitHub button, or `gh pr merge` after your OK), in the runbook's order, a migration's pull request after its migration is on production. If two pull requests conflict in a shared file, merge `origin/main` into the later branch locally, keep both sides, rerun its checks and push that with your OK.
5. Then update your copy and tidy up (GitHub deletes a merged branch on its side; `git fetch --prune origin` clears the stale copies):

```bash
git switch main
git pull --ff-only
git fetch --prune origin
git branch -d <branch>                              # only -d, for each merged branch; -D is never used
```

6. **Jira: Done transitions, only for what has merged.** For each ticket whose pull request merged in the window (the merge commits `git log <window>..origin/main --merges` shows, which `/day-end` prints, and the `(MOM-n):` commit prefixes), list the proposed transition to "Done" with the ticket's acceptance criteria, each marked met or unmet with its evidence (a test, a commit, a production check, a gate item). A ticket with an unmet criterion or a live gate still pending stays open, with a comment saying what remains. List any epic whose children are now all Done or Closed, with those children. Wait for my OK, then make exactly the transitions I approved and comment what shipped. Never move a ticket to Done before its pull request has merged.

## C. Live checks (after the last pull request has merged and Vercel has deployed)

```bash
npx vercel ls --prod                                # needs the Vercel CLI (npx works); otherwise check the deployment in the Vercel dashboard. The newest production deployment must reach "Ready"
curl -s -I https://momentum-app-eight-chi.vercel.app/ | grep -iE "^(HTTP|location)"        # 307, with location: /login
curl -s -I https://momentum-app-eight-chi.vercel.app/login | grep -iE "^(HTTP|location)"   # 200
curl -s -I https://app.ownaccordlabs.com/ | grep -iE "^(HTTP|location)"                    # 307, with location: /login (the trial's address; the vercel.app address keeps working)
curl -s -I https://app.ownaccordlabs.com/login | grep -iE "^(HTTP|location)"               # 200
```

These use no output file and no format string. Git Bash rewrites a path such as `/dev/null` for the Windows `curl`, and `MSYS_NO_PATHCONV=1` then makes `curl` fail with a write error, so `-o /dev/null -w` is not used here.

- [ ] Sign in as the standing smoke-test account and walk what changed today (nothing a person sees from MOM-147; MOM-132's first part has no screen yet).
- [ ] Only the standing smoke-test account exists (`users = 1` in step B, until real users exist). If its data is cluttered, delete and recreate it in the Supabase dashboard (Add user, Auto Confirm); never share or store its password.
- [ ] Walk every item in `docs/plans/.pending-live-checks.md` (the post-push checks the blocks deferred), then clear the items that are done; an item that still waits stays.

---

## Open Decisions and Risks (read before starting)

| Item | Why it matters |
| --- | --- |
| **Build day 8; the trial starts Sat 2026-11-07** | Day 7 built every planned block; its pull requests merge after the 2026-10-31 day-end, MOM-145 first, MOM-146 only after migration 020 is on production with every verify script passing. Today: MOM-147, then MOM-132's first part. Mon Nov 2: the rest of MOM-132, MOM-150, MOM-138, MOM-114 only if room. Wed Nov 4: fixes from the owner's own smoke test only. |
| **Production freeze** | From Thu 2026-11-05 until after 10:30 am PT Fri 2026-11-06 (the owner's interview): no push, merge, migration or dashboard change in that window. Monday's day-end is the last regular push before the trial; Wednesday's fixes push only with the owner's OK and before the freeze. |
| **Sign-up before the trial (MOM-150)** | MOM-123's walk found the login page reads as sign-in only, "Create account" on an empty form shows the browser's bubble, and the "Check your email" line was missed. Monday. Production's minimum password length is 6 while the app asks for 8: the owner sets 8 today (manual step). |
| **Google OAuth consent screen** | Its verification status decides what a tester sees when connecting Google Calendar. The owner checks it before the demo (manual step). |
| **The smoke-test persona's setup** | The standing smoke-test account can run setup only once (first-setup-only save). The owner runs it on production on a phone after last night's deploy, carefully; MOM-110's real-iPhone checks follow on the same visit (pending live checks). MOM-132 does not change that save. |
| **Migration 021** | Only MOM-132 may take it, with your OK at its design stop. Production holds 001 to 020 once last night's step F has run; its verify total is recorded at that step F, and today's step B compares against it. |
| **The build machine's memory** | The full local browser suite runs out of memory (MOM-141, `risk`). Close what you do not need before heavy steps; CI's `database` job is the full-suite gate; step A runs the changed pages' specs one file at a time. |
| **A transition settles in one render** | Failure log F-072 and F-079. MOM-147 is today's first block; until it merges, new code follows invariant 10. Last night's `test(MOM-147)` fix to the theme choice test lands with the day's other branches. |
| **`set_updated_at()` grants** | Executable by the API roles since 001, unlike the trigger functions 012 locked down (MOM-137, `risk`). Low practical risk; not scheduled before the trial. |
| **Stale generated types** | Generated route types outlive a branch switch (F-028, F-039). Until MOM-130 builds it into `/day-start` and `/run-block`, delete `.next/types` and `.next/dev` before the type check and build on a branch you just switched to. |
| **Standing smoke-test account** | `smoke-test@momentum-app.test` exists on production. Every live gate signs in as it; its password stays in your password manager. Production must hold exactly one user at day-end step B. Its goal-model data is created through setup and logging only. |
| **The old model stays until MOM-115** | Home hides its controls (MOM-115's subset). The wizard, rebalance and checkbox criteria keep running, with the completion guard of migrations 002 and 008. The full MOM-115 comes after Nov 6. |
| **Not scheduled, queued with keys** | Before the trial if room: MOM-151 (the questions' words for a target's two numbers), MOM-152 (say it once on Settings and the log page), MOM-112's plan-card and headline words. After Nov 6: MOM-115 (retire the old model), MOM-117 (the person's own tracker sheet), integration hardening (MOM-98, MOM-99, MOM-97, MOM-70). Thin slice, later: MOM-113's deferred triggers and the "full" reflection; MOM-112's remaining work. Tooling: MOM-124 (with last night's additions), MOM-130, MOM-127, MOM-141. Security: MOM-137, MOM-119. Deferred: MOM-126 (minors safeguards; the trial is adults only). Follow-ons: MOM-136, MOM-118, MOM-139, MOM-140. |
| **Risks live in Jira** | Since MOM-133, new risks are Jira tickets with the `risk` label, reviewed as a weekly top 5 at the first day-end of the week (Mon 2026-11-02's day-end); `docs/RAID_LOG.md` is frozen history. Today's day-end, the first of November, runs the monthly pattern review of October's failure entries. |
| **Pull requests, not direct pushes** | `main` is protected (MOM-67): every change reaches it through a pull request with `checks` and `database` green, merged with a merge commit. `/run-block` commits on a feature branch and never merges; branches are pushed only with your OK. A production migration is applied before its pull request merges (merging deploys to Vercel). |
