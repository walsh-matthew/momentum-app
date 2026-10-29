# 🚀 MOMENTUM BUILD: NEXT-PHASE MASTER EXECUTION PLAN

> **Date:** 2026-10-30 | **Active Epic:** MOM-105 | **Base Commit:** 32bafa1

> **Since the last plan (run on 2026-10-29):** build day 4 of the goal-model thin slice built the day loop's keyless stack check, the settings deny for the unfiltered status command, the `/rc` reminder and the "blocks never edit `BACKLOG.md`" rule (MOM-124 part 1); lighter logs (MOM-133: failure entries only when they lead to a fix, a rule or a ticket, no nightly "predicted it?", a monthly pattern review, risks in Jira under the `risk` label, `docs/RAID_LOG.md` frozen); setup's third block with **migration 016** (MOM-111: every field a setup call sends to Claude is listed in the privacy notice and pinned by a test, and a quantity target's binding names its metric); and the weekly review's first block (MOM-113: the engine's review facts, no screen, no migration). They reach `main` through that day-end's pull requests, with **016 applied to production before MOM-111's pull request merges**. The 2026-10-29 day-end created **MOM-134** (store where setup values came from, before any tester's setup is saved on production) and decided the checkpoint: **the thin slice is N = 6 build days**; this is **build day 5 of 6**. **MOM-114 ships as "defaults only" for the trial** (every default stays as setup set it; the full settings page is built during the trial). MOM-132 and the rest of MOM-124 come after the trial starts. Production before the push: migrations 001 to 015 (016 lands at that day-end's step F), exactly one user (the standing smoke-test account). The next free migration number is **017**.

---

## Today's runbook

**How to run a day.** Type `/day-start` first: it only reads and reports. Then type the command in the table below for each block, in this order, and skip any block whose Jira ticket is already Done. Each command first shows the block's model and effort: if your session differs, it stops and tells you the exact `/model` and `/effort` to type (use the session-only choice in the `/effort` slider, so your saved default is left alone), and you start the command again. Run `/clear` between blocks. When the last block is done, type `/day-end`. Nothing is pushed, merged or applied to production without your explicit OK, and work reaches `main` only through a pull request once both CI jobs are green.

| # | Type | Session setting | What to check at the gate |
| --- | --- | --- | --- |
| 0 | `/day-start` | Sonnet / Low | A clean tree, `main` matching `origin/main` with every 2026-10-29 pull request merged (MOM-124, MOM-133, MOM-111, MOM-113, and the day-end's backlog and plan branches), migration 016 on production, no leftover branches, the plan passing its format check, no missing environment variable names, and `npm run stack:status` answering in one line. Then the carry-overs in `docs/plans/.pending-live-checks.md`. |
| 1 | `/run-block MOM-96` | Sonnet / Medium | Size S. The Hevy "Sync now" tests and every other jsdom test wait for the settled button, not the message before it; ten full `npm test` runs in a row pass; no production code changed. |
| 2 | `/run-block MOM-134` | Sonnet / High | Size M. You approved where the marks live and the migration before code; a value accepted from a suggestion is stored as a starting point and a value the person said is not; migration 017 only if you approved it; the save is a new function version, 015 and 016 untouched. |
| 3 | `/run-block MOM-113` | Sonnet / High | Size M. You approved the review record and the recap screen before code; a finished review is stored once and never rewritten; migration 018 only if you approved it; the recap's numbers all come from the engine; no Claude call. |
| 4 | `/run-block MOM-112` | Sonnet / High | Size L, may split. You approved the week plan's design before code; the person picks items onto their own days and the app never picks a slot; the deadline forecast shows in plain words; migration 019 only if you approved it; browser tests at 390px and 1280px. |
| 5 | `/day-end` | Opus / High | The day's branches pass their checks; each migration (017, 018, 019) is applied to production at step F after CI is green and your OK, before its pull request merges, in number order, with every verify script after each; the weekly top 5 if this is the week's first day-end. |

If a block needs another ticket's code, `/run-block` checks that code is already in `origin/main`. If it is only on an unmerged branch, it stops and offers two ways forward: push that branch and merge its pull request first, or stack this block on that branch (only with your OK). **Every block in this plan needs the 2026-10-29 pull requests merged**: block 2 (MOM-134) needs MOM-111's block 3 and migration 016 in `origin/main` and on production; block 3 (MOM-113) needs MOM-113's first block in `origin/main`. No block today needs another block of this plan; their migrations are numbered so they can be pushed in order at step F.

---

## Executive Overview & Architectural Invariants

Build day 5 of 6 starts by removing the test race that has turned full runs red on two days running (MOM-96), so the day's later blocks and their pull requests run on a quiet suite. Then the data the weekly review's "Still right for you?" needs, stored before any tester sets up (MOM-134, migration 017 if needed); the weekly review's second block, its stored record and a read-only layer-1 recap (MOM-113 block 3.2, migration 018 if needed); and home's week plan, where the person picks items onto their own days and the deadline forecast appears in plain words (MOM-112 block 2, migration 019 if needed). Day 6 is the weekly review's Claude block (MOM-113 3.3), auth email (MOM-122), the production sign-up walk (MOM-123), the 390px header (MOM-131) and setup's live runs (MOM-111, with your OK and their cost first).

`docs/DOMAIN_MODEL.md` is binding for all new code. The old model stays in the code until MOM-115 retires it, so new code is built beside the old tables, never into them. Every block preserves these invariants:

1. **Claude never scores.** The engine (`lib/engine/`) computes every number from entries and the target in force; no Claude output is stored as a number, and setup's draft is validated by code, not by Claude (DOMAIN_MODEL §1.7, principle 9). The weekly review's recap and its one adjustment come from the engine.
2. **The person's word beats any source.** A manual entry or correction always wins over a sync; corrections are keyed to the source's own record id, so a resync never undoes them (§1.5, §1.6).
3. **Never assume anything about a person's life.** Time zone, week start and day end are the person's to set; the week plan never computes free time or picks a slot (principle 12); a suggestion the person took at setup is a starting point, checked at their first review (§2.1 rule 4).
4. **Unfinished work moves, habits never carry over.** (§1.4, principle 11.)
5. **Service-layer RLS enforcement.** The UI never queries Supabase. Every read and write of the new tables goes through `lib/services/`; every new table has row level security keyed to its owner, explicit grants and an entry in `supabase/verify/900_table_grants.sql`'s allow-list.
6. **The old model's guards stay until MOM-115.** The completion guard (migrations 002 and 008) and the append-only `task_rebalance_history` keep protecting the old tables; nothing today edits an applied migration or an old table.
7. **Nothing is saved until final approval** in setup, every Claude call goes through `lib/services/llm.ts`, and setup sends Claude only the fields the privacy notice lists (pinned by `tests/setup-prompt-fields.test.ts`).
8. **A stored record of what was said is never rewritten** (RAID R-26): a late entry changes a week's live reading, never a stored recap silently.

## Standing Rules (every prompt below repeats what it needs)

- **Read the Jira ticket first.** If its title, scope or acceptance criteria disagree with the prompt, or the prompt disagrees with `docs/DOMAIN_MODEL.md`, stop and flag it.
- **Production changes need your approval.** A prompt stops before `supabase db push`, `vercel env`, or any push to `origin`, shows what will happen, and waits. Never use the SQL Editor. Tests never run against production and never use production credentials.
- **Database checks are not part of `npm test`.** They live in the SQL scripts in `supabase/verify/` and run with `npm run verify:sql` (local stack) or, against production, with the step B loop. After any migration, or any change to a verify script, run **all** of them; every row must show `passed = true`. A local total is not a production total: one script has checks that run only on production (RAID R-16, failure-log F-027).
- **New migrations use the numbers this plan assigns:** MOM-134 may take **017**, MOM-113 may take **018**, MOM-112 may take **019**, each only if its design stop shows it is needed and you approve it. A number left unused stays unused (a gap is fine). No other block adds a migration. Never edit an applied migration; a change to `save_guided_setup` is a new function version in a new migration.
- **Pull requests, not local merges.** `main` is protected: work reaches it only through a pull request with the CI jobs `checks` and `database` green, merged with a merge commit (CLAUDE.md). A block commits on its feature branch and stops: it never merges into `main` and never pushes. Branches are pushed once, at day-end (step F), after your explicit OK.
- **A migration is applied before its pull request merges.** A block with a migration runs `npm run verify:sql` locally, shows the migration and `npx supabase db push --dry-run`, and stops. At day-end step F, once CI is green on its pull request and you say OK, the production `db push` and then ALL the verify scripts run, before that pull request merges (merging deploys to Vercel, and the new code needs the new schema). Migrations go to production in number order.
- **Blocks never edit `BACKLOG.md`.** A block's backlog notes, new gaps and follow-ups go in its Jira comment and its close-out; day-end step D writes `BACKLOG.md` once, on its own branch.
- **Is the local stack up?** Ask it with `npm run stack:status` (it prints only "Local Supabase stack: running" or "Local Supabase stack: not running"). Never run `supabase status` unfiltered: its output holds the local stack's keys (failure log F-047, F-049, F-051, F-057, F-059), and `.claude/settings.json` denies it.
- **Logs (MOM-133).** A failure-log entry is written only when it leads to a fix made that session, a new standing rule or a Jira ticket, and names which; it is marked `unreviewed` until the day-end. `docs/RAID_LOG.md` is frozen: a new risk, assumption, issue or dependency becomes a Jira ticket with the `risk` label.
- **Claude calls cost money.** `npm test` never calls Claude: model calls in tests go through a fake. A block that wants a live Claude call (an eval run, a prompt check) says how many calls and stops for your OK first, and it is logged through `lib/services/llm.ts`. No block today plans one.
- **Stale generated types.** Generated route types under `.next/` outlive a branch switch (failure log F-028, F-039). Until MOM-130 builds it into the commands, delete `.next/types` and `.next/dev` (both git-ignored and regenerated) before `npx tsc --noEmit` or `npm run build` on a branch you just switched to.
- **Standing smoke-test account.** Production keeps ONE standing test account, `smoke-test@momentum-app.test`, created by you in the Supabase dashboard (Authentication → Add user, Auto Confirm User on). Its password lives only in your password manager: Claude never asks for it, prints it or stores it in the repo, and never creates, edits or deletes users on production. Every live sign-in check in this plan says "sign in as the standing smoke-test account". Claude may read its data with **count-only** queries. If its data gets cluttered, you delete and recreate it in the dashboard (it starts empty). The SQL verify scripts create and delete their own passwordless temporary users and leave none behind, and since MOM-121 every insert, update and delete in them is limited to those users (writes made through function calls are MOM-127, not yet built). Production should always hold exactly one user (day 6's MOM-123 walk adds a disposable second account and deletes it before that day-end). The standing account's goal-model data is created only through the app (setup, logging), never seeded by hand. Browser tests use throwaway users on the **local** stack only.
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
SESSION 1: A QUIET TEST SUITE (MOM-96)          thin slice, build day 5 of 6
  - The settled-state wait in the Hevy "Sync now" tests and every jsdom test like them
SESSION 2: SETUP'S STARTING POINTS AND THE STORED REVIEW (MOM-134, MOM-113)
  - Store which setup values came from an accepted suggestion (017)
  - The weekly review's record and a read-only layer-1 recap (018)
SESSION 3: HOME AND THE WEEK PLAN (MOM-112)
  - Pick items onto your own days; the deadline forecast in plain words (019 if needed)
```

*Order matters. MOM-96 comes first because the flaky Hevy file failed 2 of 4 full runs at the 2026-10-29 day-end and can turn any of today's pull requests red. MOM-134 comes before MOM-113 3.2 because it takes migration 017 and 3.2 takes 018, so they go to production in that order at step F. MOM-112's week plan comes last: it is the largest and may split, and home's forecast needs its days. Safe stopping points: after each block. If the day runs short, MOM-112 stops at its approved design (the design is the most useful part of its first sitting) and its build moves to day 6, ahead of MOM-131.*

---

# SESSION 1: A QUIET TEST SUITE

**Your prerequisites before this session:** (1) Every 2026-10-29 pull request is merged, and `npx supabase migration list` shows 016 on production; `/day-start` shows it. (2) No local stack is needed for this block (it changes jsdom tests only).

## Block 1.1: Wait for the Settled State in jsdom Tests (MOM-96)

* **Objective & Scope:** Size S (about 20 to 40 minutes after your design OK). `tests/hevy-sync-control.test.tsx` fails under full-suite load: two tests (lines 89 and 120 on 2026-10-29) wait for the result message and then look for the "Sync now" button at once, while it still reads "Syncing…" (failure log F-060, the same race as F-055). Fix those two, then sweep the other jsdom tests for the same wait-then-`getByRole` pattern (including the five spots in `tests/manual-entry.test.tsx` the 2026-10-28 day-end listed), and prove it with ten full `npm test` runs in a row. Tests only: no production code changes.
* **Core Invariants to Protect:** *A test checks the state it is about to use*: wait for the button by its settled name, never for an earlier signal. *No test is weakened*: no assertion is removed or loosened to make it pass. *Nothing is pushed*.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-96: make every jsdom test that checks a button after a server-action result wait for the settled state, starting with the Hevy "Sync now" tests.

Task Instructions:
1. Read ticket MOM-96 in Jira first, with its comments (the 2026-10-29 day-end comment names the two failing Hevy tests). Its acceptance criteria are the definition of done. If they and these instructions disagree, stop and flag it.
2. Read CLAUDE.md, tests/hevy-sync-control.test.tsx, components/integrations/HevySyncControl.tsx (how the button's busy state clears after the result shows), tests/manual-entry.test.tsx, tests/focus-card.test.tsx (the MOM-61 fix, the pattern to copy), and failure-log entries F-055 and F-060 in docs/FAILURE_LOG.md.
3. Create the feature branch `feature/MOM-96-settled-state-tests` off an up-to-date `main`.
4. Design before editing, then STOP for my OK: (a) every spot in tests/*.test.tsx that checks a button's name, presence, `disabled` state or label directly after `findBy…` or `waitFor` on an alert, status or result (file and line, one line each, with the fix for each: wait for the button by its settled name, or `waitFor` around the assertion); (b) whether to raise Testing Library's `asyncUtilTimeout` once in a shared setup file (MOM-61 set it to 5s in two files), with your recommendation; (c) how you will run the ten full runs (plain `npm test` ten times, plus one run with fewer workers to add load). Wait for my answer.
5. Edit as approved. Tests only: if a fix seems to need a production code change, stop and say why. Do not remove or loosen any assertion.
6. Run `npx tsc --noEmit`, then `npm test` ten times in a row; every run must pass. Show me each run's closing "Test Files / Tests" lines. If any run fails, stop, show the full failure and fix it before counting again from one.
7. Run `npm run build`; it must pass.
8. Do not edit BACKLOG.md. Put backlog notes in the Jira comment and the close-out. Comment on MOM-96 with each spot changed, the ten runs' results, the timeout decision, and each acceptance criterion met or unmet; do not move it to Done. Say "Privacy impact: none" in the close-out.
9. Commit with "test(MOM-96): wait for the settled state in jsdom tests after a server-action result". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; ten consecutive npm test runs pass; npm run build passes; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] You approved the list of spots and the timeout decision before any edit.
  - [ ] The two Hevy tests wait for the "Sync now" button by its settled name (read them).
  - [ ] Ten full `npm test` runs in a row passed (read the closing lines).
  - [ ] No production file changed and no assertion was removed or loosened.

---

# SESSION 2: SETUP'S STARTING POINTS AND THE STORED REVIEW

**Your prerequisites before this session:** (1) MOM-111's third block is merged and `npx supabase migration list` shows 016 on production. (2) MOM-113's first block is merged (`lib/engine/review.ts` and `lib/services/review.ts` in `origin/main`). (3) Docker Desktop running and the local stack started (`npx supabase start`; `npm run stack:status` says running). (4) Be ready to approve where setup's starting points are stored, and the weekly review's record and recap screen; neither block makes a live Claude call.

## Block 2.1: Store Where Setup Values Came From (MOM-134)

* **Objective & Scope:** Size M (about 40 to 70 minutes after your design OK). Setup's draft records whether each value was said by the person or accepted from a visible suggestion (`draft.said`, `how: 'said' | 'accepted'`, in `types/setup.ts`), but the save drops it (`lib/setup/rows.ts` builds the payload from `draft.model` only). Store every accepted value as a starting point when setup saves, through a new version of `save_guided_setup` in migration **017** (if the design needs one and you approve it), and give the weekly review a read of a person's unconfirmed starting points. The "Still right for you?" question itself is MOM-113's (block 3.4). This must land before any tester's setup is saved on production; the standing smoke-test account's setup can go ahead without it, because that account can be recreated.
* **Core Invariants to Protect:** *Never edit an applied migration*: 015 and 016 stay as they are; the save is a new function version. *Nothing is saved until final approval*. *A suggestion taken is a starting point, never a fact about the person* (§2.1 rule 4). *Service-layer RLS*: the marks are the person's own rows.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-134: store which setup values came from an accepted suggestion, so the weekly review can ask "Still right for you?" at the first review.

Task Instructions:
1. Read ticket MOM-134 in Jira first, and the 2026-10-29 comments on MOM-113 (block 1's finding and the day-end note). Its acceptance criteria are the definition of done. If they, these instructions and docs/DOMAIN_MODEL.md disagree, stop and flag it.
2. This block needs MOM-111's third block in origin/main: check `git log origin/main --oneline --grep="(MOM-111):" -n 5` shows "pin the fields setup sends to Claude and let a binding name its metric", that supabase/migrations/ on main holds 016_quantity_metric.sql, and that `npx supabase migration list` shows 016 on the remote. If any is missing, stop.
3. Read CLAUDE.md, docs/DOMAIN_MODEL.md (§2.1 rule 4, §2.3, §3.2, the principles), types/setup.ts (ProvenanceSchema, SetupDraftSchema), lib/setup/leaves.ts (provenanceLeaves and the path forms), lib/setup/validate.ts (provenanceIssues), lib/setup/rows.ts, lib/services/setup.ts, supabase/migrations/013_goal_model_tables.sql, 015_save_guided_setup.sql and 016_quantity_metric.sql (the current save), supabase/verify/016_quantity_metric.sql (a verify script's shape), supabase/verify/900_table_grants.sql, tests/setup-service.test.ts and tests/e2e/setup.spec.ts. Check the local stack with `npm run stack:status`; never run `supabase status` unfiltered.
4. Create the feature branch `feature/MOM-134-setup-starting-points` off an up-to-date `main`.
5. Design before coding, then STOP for my OK: (a) which values can be accepted from a suggestion (the provenance path forms) and which saved rows and fields they land on; (b) where the marks are stored: a column on each saved row, or a small table keyed to the saved row and the field (with RLS keyed to the owner, explicit grants and the allow-list), and why; (c) how a draft path maps to the saved row's id inside the save (the save's own key-to-id maps), and what happens to a path that maps to nothing; (d) migration 017: the table or columns, and `save_guided_setup` as a new version (CREATE OR REPLACE, 015 and 016 untouched) that also refuses an unknown top-level key as today; or a reason no migration is needed; (e) the read for the weekly review (a service function that lists a person's unconfirmed starting points) and how one is later marked confirmed or changed (the write may wait for MOM-113 3.4; say which); (f) the tests and the verify checks. Wait for my answer.
6. Build as approved. If migration 017 was approved: write supabase/migrations/017_<name>.sql and supabase/verify/017_<name>.sql (with checks that can fail: a person reads and writes only their own marks, an accepted value is marked, a said value is not, the save still refuses a second setup), add any new table to 900_table_grants.sql's allow-list, run `npx supabase db reset --local` and `npm run verify:sql`, show me the migration and `npx supabase db push --dry-run`, and stop. Say plainly: the production push and then ALL the verify scripts run at day-end step F, after CI is green on this branch's pull request and I say OK, and before that pull request merges. Add to docs/plans/.pending-live-checks.md: `- [ ] MOM-134 (017): after the push, production supabase db push for migration 017, then every verify script, before the pull request merges`.
7. Tests: the mapping from `draft.said` entries with `how: 'accepted'` to the stored marks (a draft with none, one, and several; a said value never marked); the save writes them through the in-memory fake; the review's read returns only the signed-in person's unconfirmed starting points; the setup browser spec still passes. `npm test` makes no network call.
8. No live Claude call in this block.
9. Run `npx tsc --noEmit`, `npm test`, `npm run build` and `npm run test:e2e` (stop `npm run dev` first; reset the local database to this branch's migrations first), and `npm run verify:sql` if a migration was added; all must pass, with no server error in the e2e output other than the known lines (the wizard spec's two `[task-plan-ai] the API key was rejected { httpCode: 401 }` lines and the Hevy "no bound target" spec's `[synced-entries] not counted … reason: 'no_source'` lines).
10. Do not edit BACKLOG.md. Put backlog notes in the Jira comment and the close-out. Say "Privacy impact" in the close-out (a new kind of stored fact about where a setup value came from; say whether /privacy needs a line). Comment on MOM-134 with the approved design, what changed, each acceptance criterion met or unmet and how verified; do not move it to Done.
11. Commit with "feat(MOM-134): store which setup values came from an accepted suggestion". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes (with no network call); npm run test:e2e passes; npm run verify:sql passes locally if a migration was added; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] You approved where the marks live, the path-to-row mapping and the migration before any code.
  - [ ] A value accepted from a suggestion is stored as a starting point, and a value the person said is not (read the test).
  - [ ] 015 and 016 are unchanged; the save is a new function version in 017.
  - [ ] If migration 017 was added: you saw it and the dry run, its verify script has checks that can fail, and nothing was pushed.

---

## Block 2.2: The Weekly Review, Second Block: Its Record and the Layer-1 Recap (MOM-113)

* **Objective & Scope:** Size M (about 40 to 70 minutes after your design OK). The weekly review's block 3.2, as listed at the end of its first block: migration **018** (if you approve it) with an append-only review record, written once per finished sitting so a later entry never rewrites what a recap said (R-26), and the `weekly_review` feature added to the Claude usage log's feature check (014) ready for block 3.3; the "already reviewed this week" check; and a read-only layer-1 recap screen built from `getWeeklyReviewFacts()`. Decide, at the design stop, the open point from block 1: when the planning moment is a week's own last day, the engine still calls that week open. No Claude call (layer 2's words are block 3.3).
* **Core Invariants to Protect:** *Claude never scores*: every number on the recap comes from the engine. *A stored record is never rewritten* (R-26): the record is append-only; a later entry is shown against it in words. *Never assume*: no review appears before the person has set their week start and planning moment. *Service-layer RLS*.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-113, block 3.2: store a finished weekly review and show the layer-1 recap.

Task Instructions:
1. Read ticket MOM-113 in Jira first, with all its comments (especially the 2026-10-29 block 1 close-out with the approved design, and the 2026-10-28 hand-off from MOM-110 on late entries). Its acceptance criteria are the definition of done for the whole ticket; this block covers part of them. If they, these instructions and docs/DOMAIN_MODEL.md disagree, stop and flag it.
2. This block needs MOM-113's first block in origin/main: check `git log origin/main --oneline --grep="(MOM-113):" -n 3` shows "add the weekly review's engine facts and layer-3 selection". If it is missing, stop. MOM-134 may also be adding migration 017 today on its own branch; this block uses 018 only, and never 017.
3. Read CLAUDE.md, docs/DOMAIN_MODEL.md (§3 in full, §1.3, §4.1 tone and celebrations, the principles), lib/engine/review.ts, lib/services/review.ts, types/review.ts, types/scoreboard.ts (Layer1TargetFact, LayerThreeAdjustment, ReviewWindow), lib/services/scoreboard.ts, components/home/ (the scoreboard cards to reuse), app/page.tsx, supabase/migrations/013_goal_model_tables.sql (period_snapshots, the append-only pattern) and 014_setup_budget.sql (the usage log's feature check), supabase/verify/900_table_grants.sql, tests/review-service.test.ts and tests/e2e/home.spec.ts. Check the local stack with `npm run stack:status`; never run `supabase status` unfiltered.
4. Create the feature branch `feature/MOM-113-review-record-and-recap` off an up-to-date `main`.
5. Design before coding, then STOP for my OK: (a) the review record: its columns (the week it covered, what layer 1 showed, the layer-3 adjustment offered and the person's choice, when it was finished), append-only like period_snapshots (no UPDATE or DELETE for the person), RLS keyed to the owner, grants and the allow-list; (b) adding `weekly_review` to the usage log's feature check in the same migration (018), so block 3.3 needs none; (c) the "already reviewed this week" rule and what the person sees after; (d) how a later entry that changes a reviewed week is shown against the stored record, in words, never by rewriting it (R-26); (e) the recap screen: its route, where it is reached from, what it shows (layer 1 only: each target's facts, the priorities in the person's own words, no score), its empty and not-yet-set states, at 390px and 1280px; (f) the open point from block 1 (a planning moment on a week's own last day): fix the engine's closed check, or accept it and say so on the recap, with your recommendation; (g) the files you create and the remaining blocks (3.3 and 3.4) with sizes. Wait for my answer.
6. Build only the approved slice. If migration 018 was approved: write it and supabase/verify/018_<name>.sql (with checks that can fail: a person reads only their own records, cannot update or delete one, and the feature check accepts `weekly_review`), add the table to supabase/verify/900_table_grants.sql's allow-list, run `npx supabase db reset --local` and `npm run verify:sql`, show me the migration and `npx supabase db push --dry-run`, and stop. Say plainly: the production push and then ALL the verify scripts run at day-end step F, after CI is green on this branch's pull request and I say OK, after 017 if MOM-134 adds it (this branch then merges origin/main first, so its migration list matches production), and before this pull request merges. Add to docs/plans/.pending-live-checks.md: `- [ ] MOM-113 (018): after the push, production supabase db push for migration 018 (after 017), then every verify script, before the pull request merges`.
7. Tests: the service against the in-memory fake (writing a finished review once, a second write for the same week refused, the "already reviewed" state, a later entry shown against the stored record without changing it, one person never reading another's records); engine tests for any change in lib/engine/; component tests for the recap screen (each state); a browser spec on the local stack at 390px and 1280px. `npm test` makes no network call.
8. No live Claude call in this block (layer 2's words are block 3.3).
9. Run `npx tsc --noEmit`, `npm test`, `npm run build` and `npm run test:e2e` (stop `npm run dev` first; reset the local database to this branch's migrations first), and `npm run verify:sql` if a migration was added; all must pass, with no server error in the e2e output other than the known lines (the wizard spec's two 401 lines and the Hevy "no bound target" spec's `no_source` lines).
10. Stop at a committed, green point and list what remains for MOM-113, block by block, with sizes. The ticket stays open.
11. Do not edit BACKLOG.md. Put backlog notes in the Jira comment and the close-out. Say "Privacy impact" in the close-out (a new stored record of what a review showed). Comment on MOM-113 with the approved design, what changed, each acceptance criterion met, partly met or not started, and how verified; do not move it to Done.
12. Commit with "feat(MOM-113): store a finished weekly review and show the layer-1 recap". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes (with no network call); npm run test:e2e passes; npm run verify:sql passes locally if a migration was added; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] You approved the record, the recap screen and the last-day decision before any code.
  - [ ] A finished review is stored once, and a later entry is shown against it in words, never by rewriting it (read the test).
  - [ ] Every number on the recap comes from the engine; no Claude call was made.
  - [ ] The recap fits a phone at 390px and reads at 1280px (the browser spec).
  - [ ] If migration 018 was added: you saw it and the dry run, and nothing was pushed.

---

# SESSION 3: HOME AND THE WEEK PLAN

**Your prerequisites before this session:** (1) MOM-112's first block is in `origin/main` (merged 2026-10-28). (2) The local stack running with `main`'s migrations (`npx supabase db reset --local` after switching). (3) Be ready to approve the week plan's design: how a person picks items onto their own days, what those picks drive, and what each item's forecast is given.

## Block 3.1: Home, Second Block: The Week Plan and the Deadline Forecast (MOM-112)

* **Objective & Scope:** Size L (70 minutes or more after your design OK; it may split, and a split stops at a committed, green point). The person picks work items onto their own days for the week, and those picks drive the in-app prompts (`docs/DOMAIN_MODEL.md` §1.4); the app never computes free time or picks a slot (principle 12). The days set aside give each deadline item its capacity, so home's milestones show the deadline forecast in plain words (RAID I-10; `lib/services/scoreboard.ts` hands the engine an empty forecast list today). Migration **019** only if the picks need a table and you approve it. Merge suggestions on screen, the entry controls on home (retiring `/log`) and auto-counted entries visible and undoable stay for a later block.
* **Core Invariants to Protect:** *Never assume*: no day, time or slot the person did not choose. *Claude never scores*: the forecast is the engine's (`lib/engine/forecast.ts`); no Claude call. *Unfinished work moves, habits never carry over* (§1.4). *Service-layer RLS*.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-112, second block: the week plan (the person picks items onto their own days) and the deadline forecast in plain words on home.

Task Instructions:
1. Read ticket MOM-112 in Jira first, with all its comments (especially the 2026-10-28 block 1 close-out and the owner decision that the forecast stays on this ticket). Its acceptance criteria are the definition of done for the whole ticket; this block covers part of them. If they, these instructions and docs/DOMAIN_MODEL.md disagree, stop and flag it.
2. This block needs MOM-112's first block in origin/main: check `git log origin/main --oneline --grep="(MOM-112):" -n 3`. If it is missing, stop. MOM-134 (017) and MOM-113 (018) may be adding migrations today on their own branches; this block uses 019 only.
3. Read CLAUDE.md, docs/DOMAIN_MODEL.md (§1.3, §1.4 in full, §4.1, principles 1, 11 and 12), lib/engine/forecast.ts and lib/engine/carryover.ts, types/scoreboard.ts, lib/services/scoreboard.ts and lib/services/scoreboardRows.ts (the empty forecast list), types/home.ts, lib/home/defaults.ts, components/home/, app/page.tsx, lib/services/entries.ts, supabase/migrations/013_goal_model_tables.sql (work_items, person_day_types, targets.slot_weekdays), supabase/verify/900_table_grants.sql, tests/scoreboard-service.test.ts, tests/home-scoreboard.test.tsx and tests/e2e/home.spec.ts. Check the local stack with `npm run stack:status`; never run `supabase status` unfiltered.
4. Create the feature branch `feature/MOM-112-week-plan` off an up-to-date `main`.
5. Design before coding, then STOP for my OK: (a) the week plan: which items can be picked (deadline tasks, milestone steps, habits and their named days), onto which days (the person's own week, from their week start, in their time zone), and what a pick is (a day, never a time or slot); what happens to an unfinished pick at the week's end (it moves, a habit does not carry over); (b) where picks are stored: a table by migration 019 (RLS keyed to the owner, grants, the allow-list, a verify script) or a reason none is needed; (c) what the picks drive in the app this block (the day's list on home; reminders and their times wait for the settings the person sets, so say what is shown and what is not yet sent); (d) the forecast: what capacity each deadline item is given from its picked days, as a fact and never a promise (RAID A-07), and the plain words for each verdict and option on home; (e) the screens at 390px and 1280px, with their empty and not-yet-set states (no week start, no time zone); (f) the split point if the block runs long, and the remaining MOM-112 work with sizes. Wait for my answer.
6. Build only the approved slice. If migration 019 was approved: write it and supabase/verify/019_<name>.sql (with checks that can fail), add the table to 900_table_grants.sql's allow-list, run `npx supabase db reset --local` and `npm run verify:sql`, show me the migration and `npx supabase db push --dry-run`, and stop. Say plainly: the production push and then ALL the verify scripts run at day-end step F, after CI is green on this branch's pull request and I say OK, after 017 and 018 if they were added (this branch then merges origin/main first), and before this pull request merges. Add to docs/plans/.pending-live-checks.md: `- [ ] MOM-112 (019): after the push, production supabase db push for migration 019 (after 017 and 018), then every verify script, before the pull request merges`.
7. Tests: the service against the in-memory fake (picking, unpicking, a pick in another person's week refused, the week's end moving unfinished work and not carrying a habit, no week start or time zone giving no plan and no guess); the forecast given the picked days (engine tests for anything added to lib/engine/); component tests for each state; a browser spec on the local stack for the week-plan flow at 390px and 1280px. `npm test` makes no network call.
8. No live Claude call in this block.
9. Run `npx tsc --noEmit`, `npm test`, `npm run build` and `npm run test:e2e` (stop `npm run dev` first; reset the local database to this branch's migrations first), and `npm run verify:sql` if a migration was added; all must pass, with no server error in the e2e output other than the known lines (the wizard spec's two 401 lines and the Hevy "no bound target" spec's `no_source` lines).
10. Stop at a committed, green point and list what remains for MOM-112 (merge suggestions on screen, the entry controls on home and retiring /log, auto-counted entries visible and undoable, the phone checks, whatever this block found), with sizes. The ticket stays open.
11. Do not edit BACKLOG.md. Put backlog notes in the Jira comment and the close-out. Say "Privacy impact" in the close-out. Comment on MOM-112 with the approved design, what changed, each acceptance criterion met, partly met or not started, and how verified; do not move it to Done.
12. Commit with "feat(MOM-112): let the person plan their week and show the deadline forecast". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes (with no network call); npm run test:e2e passes; npm run verify:sql passes locally if a migration was added; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] You approved the week plan's design, where picks live and the forecast's words before any code.
  - [ ] The person picks items onto their own days; nothing picks a day, time or slot for them (read the test).
  - [ ] Home shows the deadline forecast in plain words from the picked days, as a fact, never a promise.
  - [ ] The week plan works at 390px and 1280px (the browser spec).
  - [ ] If migration 019 was added: you saw it and the dry run, and nothing was pushed.

---

# FINAL DAY-END BUILD VERIFICATION & PULL REQUESTS

Run after the last block of the day, or type `/day-end` and let it run these in this order: **A, B, D, E, then F (the one push, after your OK), then C (live checks, after the pull requests have merged and Vercel has deployed)**. Stop on the first failure. When the whole sequence has finished and you say so, `/day-end` ends with the line `Tomorrow: /day-start (Sonnet / Low)`.

**The build day's window.** The day starts at the previous day-end's last merge, not at midnight, so a day-end that runs past midnight sees the same work. It is the newest merge on `origin/main` of a step E branch, found by the branch name, which always ends in `-next-build-plan-doc`: `git log origin/main --merges -n 1 --grep="next-build-plan-doc" --format="%h %cI %s"`. `/day-end` prints it as `Window: after <hash> (<date>, <subject>)` at the start and reuses that hash in steps B, D and F (it never recomputes it, because today's own step E branch will have merged by then). If there is none, you give a start date. Below, `<window>` means that hash.

**When there is nothing to sync.** `/day-end` stops at the start only if all four hold: no unmerged branches; no open backlog item without a Jira key; no entry marked `unreviewed` in `docs/FAILURE_LOG.md` (`docs/RAID_LOG.md` is frozen and is not checked); and no ticket with commits on `origin/main` in the window that Jira still shows as neither Done nor Closed. It names each condition, and says which ones kept it going. Failure entries carry the `unreviewed` mark in their heading line (`### F-0nn · … · unreviewed`); an entry drafted without the mark is still a waiting entry, so also look at the entries added in the uncommitted changes to the log (failure log F-061, MOM-124).

**Your log edits and branch switches.** If you hold uncommitted edits to `docs/FAILURE_LOG.md` or `docs/RAID_LOG.md` and a branch's copy of either file differs, a plain `git switch` aborts. Before each switch `/day-end` checks for this, says so in plain words, backs both files up, stashes them (`git stash push -- <the two files>`), switches and pops. If the pop conflicts, it stops, restores from the backup and asks you. It never stages a log file for this; only the entries you approve in step D are staged.

**The thin slice: N = 6 (decided 2026-10-29).** Day 6 holds MOM-113 3.3 (the review's Claude block), MOM-122 (auth email), MOM-123 (the production sign-up walk, with a disposable second account deleted after), MOM-131 (the 390px header) and MOM-111's live runs (with your OK and their cost first). MOM-114 ships as "defaults only" for the trial. MOM-132 and the rest of MOM-124 come after the trial starts. Step E writes day 6's plan from this list and today's actual progress; anything from today that did not finish goes first.

## A. Build and repository checks (PowerShell or Git Bash)

`/day-end` runs this. A feature branch is checked on its own, because nothing has been merged into `main` locally. List the day's branches, then check each one in turn; docs-only branches (D and E) need only `npm test` and `npm run plan`. Read the whole output of each command, never a filtered part of it.

```bash
cd C:\Users\matth\momentum-app
git status --short                                  # a clean tree; only your uncommitted docs/FAILURE_LOG.md may also show
git branch --no-merged origin/main                   # the day's feature branches: work not yet in origin/main
# then, on each of those branches, one at a time:
git switch <branch>                                  # see "Your log edits and branch switches" above
npx tsc --noEmit                                    # expect no output
npm test                                            # expect all passing
npm run build                                       # expect "Compiled successfully"
npm run plan                                        # always exits 0: read its closing lines
```

`npm run plan` ends with "Every open item has a Jira key." or lists the items without one. Blocks do not edit `BACKLOG.md`, so a block's branch should add no unkeyed item; if one appears, step A lists it as "handed to step D" and does not fail the branch. Step D's Definition of Done is where every open item must have a key.

`npm run test:e2e` and `npm run verify:sql` also run in CI on every pull request. Run them here too for a branch that changed pages, auth, the wizard, the drawer, manual entry, setup, the weekly review, the week plan or a migration (stop `npm run dev` first; check the stack with `npm run stack:status`; reset the local database to the branch's migrations first with `npx supabase db reset --local`). Any server error in the e2e output is a failure, with two known exceptions until MOM-124's expected-lines list exists: the wizard spec's two `[task-plan-ai] the API key was rejected { httpCode: 401 }` lines and the `[synced-entries] not counted … reason: 'no_source'` lines from the Hevy "no bound target" spec. Once MOM-96 has merged, a jsdom test that fails a full run and passes alone is a failure to fix, not a flake to rerun.

Generated route types outlive a branch switch: a browser test run leaves the development server's in `.next/dev`, and a production build leaves its own in `.next/types` (failure log F-028, F-039). Delete both folders (git-ignored, rebuilt by the next build or `npm run dev`) before the checks on each branch; if `tsc` or the build still fails only in a file under `.next/`, delete them and run the check again; any other failure is real. MOM-130 builds this into the commands.

## B. Database verification (production), only if migrations were applied in the window

A migration is in the window when `git log --branches --remotes --not <window> --name-only --format=%h -- supabase/migrations` lists a file (017 from MOM-134, 018 from MOM-113 and 019 from MOM-112, if any was added). B also runs when a script in `supabase/verify/` changed in the window, because production is where those scripts are proven. **Git Bash only.** This loop uses `/tmp`, `grep`, `$(...)` and `for ... done`, which do not work in PowerShell. `npm test` does **not** run these scripts. Every script must report `false 0` and a non-zero `true` count (0 and 0 means the script errored).

**When a migration is still waiting for its push.** This plan applies each migration at step F, after CI is green and before its pull request merges. If the window's migrations are not yet on production when B runs, B runs only its read-only part now (the migration list, where remote should stop at the last applied migration, and the user count), and the verify loop runs at step F right after each `db push`. Running the loop before the push would fail the new migration's verify script and write throwaway users to production twice.

```bash
npx supabase migration list                         # local and remote columns must match for every migration already applied
T=0; F=0
for f in supabase/verify/*.sql; do
  npx supabase db query --linked -f "$f" -o table > /tmp/v.txt 2>&1
  t=$(grep -cE '│ true ' /tmp/v.txt); fl=$(grep -cE '│ false ' /tmp/v.txt)
  echo "$(basename $f): true $t false $fl"; T=$((T+t)); F=$((F+fl))
done; echo "TOTAL true $T false $F"                 # expect false 0 and a true count no lower than the last production total, plus the checks added in the window (the 2026-10-29 day-end records the production total after 016). A local count is not a production count: one script runs 5 more checks on production
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
   d. At the first day-end of the week, also show the weekly top 5: `project = MOM AND labels = risk AND status NOT IN (Done, Closed) ORDER BY priority DESC, updated DESC`. At the first day-end of a calendar month, also run the monthly pattern review: look across that month's failure entries for a cause that recurred, decide whether it needs a new standing rule or ticket, and record the result (the month's entry count and how many led to a fix, a rule or a ticket) as a Jira comment on MOM-92, never in the repo.
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
   - Metadata Header at the top: `> **Date:** YYYY-MM-DD | **Active Epic:** MOM-XX | **Base Commit:** <SHORT_HASH>`
   - Executive Overview & Architectural Invariants, and the Standing Rules (Jira first, production approval, verify scripts, no pushes inside blocks, blocks never edit BACKLOG.md, the lighter log rule, standing smoke-test account).
   - A "Today's runbook" section near the top, after the metadata header and before the first block: a table with one row per block, in order, giving `/run-block MOM-n`, the session setting (model / effort) and, in plain words, what to check at the gate. The table's first row is `/day-start` (Sonnet / Low) and its last row is `/day-end` (Opus / High), each with its own plain-words gate text; `npm run plan:check -- --strict` warns when either is missing or out of place. The text above the table also says that `/day-start` comes first and `/day-end` last.
   - Logical Session Blocks grouping high-priority tickets, in dependency order, each in the format `npm run plan:check` enforces: a heading `## Block <n>.<m>: <title> (MOM-<n>)` with exactly one ticket key (unique in the plan); a `* **CLI Session Config:** Model: X | Effort: Y` line; exactly one fenced `text` prompt that names its ticket and carries a commit message `type(MOM-n): ...`; and a `* **User Verification Gate:**` checklist. Before each session's first block, a `**Your prerequisites before this session:**` note (it may say none). Give each block a size in its objective (S about 20 to 40 minutes, M about 40 to 70, L 70 or more, timed from the design OK) until MOM-124 adds a Size field.
   - Block prompts that follow the pull-request workflow (CLAUDE.md): create the feature branch off an up-to-date `main`; commit on it with the Jira key; do NOT merge into `main` and do NOT push (the one push is at day-end, step F, after my OK); do NOT edit BACKLOG.md (notes go in the Jira comment and the close-out); end with "Definition of Done: ...; committed on the feature branch." A block with a migration says: run `npm run verify:sql` locally, show the migration and `npx supabase db push --dry-run`, and run production `db push` and then ALL the verify scripts only after CI is green on its pull request and I say OK, and before that pull request merges (merging deploys to Vercel). A block that needs another ticket's code says it "must already be in origin/main" and stops if it is not. When two blocks add migrations on separate branches, number them in the order they will be pushed, and say that the later branch merges origin/main before its push.
   - Dynamic CLI Session Config (Sonnet / High for architecture, security and database work; Sonnet / Medium or Low for standard UI and tests).
   - Copy-pasteable prompts including tsc --noEmit, npm test, npm run build, feature branching with the commit left on the feature branch (never merged into `main` locally and never pushed; `main` takes it through a pull request, see the pull-request bullet above), and Jira updates.
   - User Verification Gates for each block.
   - Final Day-End Build Verification & Pull Requests section (steps A, B, D, E, then F the one push, then C the live checks after the merge), with the step B verify loop marked Git Bash only, step D never moving a ticket or an epic to Done (it only comments, creates tickets and proposes Closed, with a pause for my OK), step F ending with a post-merge list of Done transitions that waits for my OK, and step D's log step carried from the rules MOM-133 put in CLAUDE.md and `/day-end` (no nightly "predicted it?", no new RAID rows, the weekly top 5 and the monthly pattern review), including the playbook question, and including this instruction in step E.
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

1. Open a pull request for each branch (the link printed by the push; `gh pr create` only if `gh` is installed and you say yes). A stacked branch is opened against `main` only after the branch under it has merged, so it shows only its own commits. Today no block is planned to stack.
2. Wait for CI: both jobs, `checks` and `database`, must be green on every pull request. If a job goes red, read its log, fix the cause on the branch, rerun the checks locally and push again (each push with your OK).
3. For a branch with a migration: production `npx supabase db push --dry-run`, then `db push`, then ALL the verify scripts (step B's loop), only after CI is green and your OK, and **before** that pull request merges. Migrations go in number order: 017 (MOM-134), then merge its pull request; then MOM-113's branch merges `origin/main` (with your OK to push the merge, and CI green again) so its migration list matches production, then 018 and its merge; then the same for MOM-112 and 019. Skip any number a block did not add.
4. Merge each pull request with a merge commit (the GitHub button, or `gh pr merge` after your OK), in dependency order: MOM-96 first, then the migration branches in number order, then the rest. If two pull requests conflict in a shared file, merge `origin/main` into the later branch locally, keep both sides, and push that with your OK.
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

- [ ] Sign in as the standing smoke-test account and walk the flows you touched today (home's week plan, the weekly recap if it is due for that account).
- [ ] Only the standing smoke-test account exists (`users = 1` in step B, until real users exist). If its data is cluttered, delete and recreate it in the Supabase dashboard (Add user, Auto Confirm); never share or store its password.
- [ ] Walk every item in `docs/plans/.pending-live-checks.md` (the post-push checks the blocks deferred), then clear the items that are done; an item that still waits stays.

---

## Open Decisions and Risks (read before starting)

| Item | Why it matters |
| --- | --- |
| **Thin slice: build day 5 of N = 6 (decided 2026-10-29)** | Day 4 finished setup's planned blocks (MOM-111 block 3) and the review's first block, but the weekly review (two more blocks), the week plan, the starting-point data (MOM-134) and the trial prerequisites did not fit in one more day. Day 5 is this plan; day 6 is MOM-113 3.3, MOM-122, MOM-123, MOM-131 and MOM-111's live runs. Anything from today that does not finish goes first on day 6. |
| **MOM-114 is "defaults only" for the trial** | Owner decision, 2026-10-29: every default stays as setup set it, and the full "How Momentum talks to me" page is built during the trial. A tester who wants a different tone or review depth asks the owner until then. |
| **After the trial starts** | MOM-132 (add a goal or target after first setup, and naming a metric on an older binding) and the rest of MOM-124 (the step 0 count fixes, step B timing, the expected e2e log lines, block sizes, the red-CI loop, the design-stop review). |
| **Testers' setups wait for MOM-134** | "Still right for you?" runs at a person's first review only, and a setup saved before MOM-134 lands loses which values were accepted suggestions for good. No tester's setup is saved on production until MOM-134 has merged and its migration is applied. The standing smoke-test account's one-time setup can run before it (that account can be recreated). |
| **Migrations 017, 018, 019** | 017 is MOM-134's, 018 is MOM-113's (the review record and the `weekly_review` usage feature), 019 is MOM-112's (week-plan picks), each only with your OK at the design stop. They are on separate branches, so step F pushes them in number order and a later branch merges `origin/main` before its push. An unused number stays unused. |
| **The flaky Hevy test can turn CI red** | Until MOM-96 merges, `tests/hevy-sync-control.test.tsx` can fail a pull request's `checks` job (2 of 4 full runs on 2026-10-29). If it does, rerun the job once and say so; after MOM-96 a full-run failure is a real failure. |
| **The one-time production setup on the standing account** | Setup is first-setup-only, so the standing smoke-test account can run setup on production once (carried in `docs/plans/.pending-live-checks.md`, with the MOM-110 iPhone checks after it). It can run now that MOM-111's third block is deployed. If its data needs redoing, you delete and recreate the account. |
| **The weekly review's last-day case** | When the planning moment is a week's own last day, the engine still calls that week open (MOM-113 block 1; RAID I-11 was kept on the ticket under MOM-133's rule). MOM-113's block today decides: fix the closed check, or accept it and say so on the recap. |
| **The `risk` label's coverage** | The label went on 22 tickets for 29 risk rows, but 10 of those tickets are Done or Closed, so 11 rows (9 still marked open) fall out of the weekly top 5, R-09 has no ticket, and the open issue, assumption and dependency rows were not labelled (BACKLOG, MOM-133). Not scheduled; the weekly top 5 is read with that gap in mind until it is tidied. |
| **Setup's budget is still a placeholder** | 40 turns and 1,000,000 tokens, from no finished live run. The simulated-person eval and the 8 full cases on three models are day 6, with your OK and their cost first. |
| **Live Claude calls** | `npm test` never calls Claude. No block today plans a live call. |
| **Stale generated types** | Generated route types outlive a branch switch (F-028, F-039). Until MOM-130 builds it into `/day-start` and `/run-block`, delete `.next/types` and `.next/dev` before the type check and build on a branch you just switched to. |
| **Auth email limits** | The default sender's hourly cap and the same-browser reset link are MOM-122 (RAID I-06, R-18); the production walk with a disposable second account is MOM-123. Both are day 6, as trial prerequisites. |
| **Archive name** | The plan run on 2026-10-29 carried the date 2026-10-29 and is archived as `docs/plans/archive/2026-10-29.md`. This plan carries 2026-10-30. |
| **Standing smoke-test account** | `smoke-test@momentum-app.test` exists on production. Every live gate signs in as it; its password stays in your password manager. Production must hold exactly one user at day-end step B; no block creates a second one (day 6's MOM-123 walk adds and deletes a disposable one, by you). Its goal-model data is created through setup and logging only. |
| **The old model stays until MOM-115** | The wizard, rebalance and checkbox criteria keep running, with the completion guard of migrations 002 and 008. New code follows `docs/DOMAIN_MODEL.md` and is built beside the old tables; home shows the scoreboard beside the old feed. |
| **Dark only until MOM-30** | The app is dark regardless of the device setting. Light mode with a follow-device default is MOM-30, not scheduled. |
| **Not scheduled, queued with keys** | Day 6: MOM-113 3.3, MOM-122, MOM-123, MOM-131, MOM-111 live runs. After the trial starts: MOM-132, MOM-124 part 2, MOM-114's full page. Thin slice, later: MOM-113 3.4 (the three deferred layer-3 triggers), MOM-112's remaining work (merge suggestions on screen, entry controls on home and retiring `/log`, auto-counted entries undoable), MOM-115 (retire the old model). Tooling: MOM-130 (generated type folders), MOM-127 (verify-script function calls). Deferred: MOM-126 (minors safeguards; the trial is adults only). Follow-ons during the trial: MOM-117 (own sheet and templates), MOM-118 (career playbook). Other: MOM-109 (owner task: ask the testers which apps they use), MOM-119 (grants), MOM-98 (webhooks), MOM-99 (adapter follow-ups), MOM-100 (CI hardening), MOM-101 (usage follow-ups), MOM-74 (retire `HEVY_API_KEY`), MOM-91 (`connection()`), MOM-95, MOM-97, MOM-70, MOM-26. |
| **Risks live in Jira now** | Since MOM-133, new risks are Jira tickets with the `risk` label, reviewed as a weekly top 5 at the first day-end of the week; `docs/RAID_LOG.md` is frozen history. AI misses go in `docs/FAILURE_LOG.md` only when they led to a fix, a rule or a ticket, with a monthly pattern review at the first day-end of each month. |
| **Pull requests, not direct pushes** | `main` is protected (MOM-67): every change reaches it through a pull request with `checks` and `database` green, merged with a merge commit. `/run-block` commits on a feature branch and never merges; `/day-end` pushes the day's branches once, after your OK. A production migration is applied before its pull request merges (merging deploys to Vercel). |
