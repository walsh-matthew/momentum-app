# 🚀 MOMENTUM BUILD: NEXT-PHASE MASTER EXECUTION PLAN

> **Date:** 2026-11-03 | **Active Epic:** MOM-105 | **Base Commit:** 355bb8c

> **Since the last plan (dated Tue 2026-11-03, run on Mon 2026-11-02):** the owner's live checks came first and decided the blocks. MOM-166's deadline-goal setup passed on production (about 21:30 UTC), so Block 1.1 was skipped and MOM-166 is a Done candidate; on the iPhone app-switch check the next card came, so MOM-169 was Closed with no code; Home's buttons cleared Safari's bar, so part 14's spacing was not needed. **MOM-167 part 1's title check then broke every production setup** (a target title's clean version was always a full sentence, and the tests' fake model never wrote one; failure log F-096): fixed and merged mid-day as **PR #115** (355bb8c). Built on branches: **MOM-167 parts 8, 9, 11 and 15** (c9c9c92: "You're on Pacific Time.", "1 hour", gentle to direct, "Go to sign in") and, unplanned, **MOM-168** (7903ee8, stacked on it: extra detail inside an answer is used and never asked for again, after the owner's production run lost "I want to run three days a week"). Day-end step A passed both stacked in merge order on `origin/main` (167 files and 5,427 tests, then 168 files and 5,476 tests; nine browser specs for MOM-167, three for MOM-168). Step D re-scoped MOM-168 to that work and created **MOM-170 to MOM-175** from the owner's evening phone test. The standing smoke-test account used **100 of its 100** setup calls in 24 hours (96 ok, 4 bad_output) and its per-person cap fired; for the trial the cap stays at 100 and retries still count (owner, MOM-173). No migration: production holds 001 to 022; the next free number is **023**.

> **The calendar to the trial (owner):** **Tue Nov 3 (this plan): a test-and-fix day.** First, before any testing or block, the prompt-caching check on production: the MOM-111 prompt-caching block runs and merges on the night of Nov 2, after that day-end's merges, and Tuesday confirms it works on production or reverts it (Your manual steps 0). Then the four fixes from the owner's phone test, in this order (MOM-170, MOM-171, MOM-172, then the wrong-weekday test MOM-174), then the owner's phone rechecks. **Wed Nov 4: a second test-and-fix day** for whatever Tuesday's testing turns up; its pushes only with the owner's OK and before the freeze. Wednesday evening (owner): retire the old Anthropic keys task-app-prototype and the old momentum-local in the Console after 24 hours with no use (reminder at 5:00 pm PT). **Production freeze from Thu Nov 5 until after 10:30 am PT Fri Nov 6.** **The family trial starts Sat Nov 7.** After Nov 6: MOM-173's design (the cap and retries), the rest of MOM-167 (4 to 7, 10, 12, 13, 16), MOM-175, MOM-114 and MOM-159, MOM-157 (stay signed in on the phone home-screen app, a trial prerequisite), MOM-155 (Google consent screen), then MOM-115, MOM-117 and integration hardening; MOM-156 (the two-model setup trial) on Tue Nov 10.

---

## Today's runbook

**How to run a day.** Type `/day-start` first: it only reads and reports. Then, before any testing or block, do the prompt-caching check (Your manual steps 0): if it fails, MOM-111's caching merge is reverted before anything else. Then type the command in the table below for each block, in this order, and skip any block whose Jira ticket is already Done or whose condition says to skip it. Each command first shows the block's model and effort: if your session differs, it stops and tells you the exact `/model` and `/effort` to type (use the session-only choice in the `/effort` slider, so your saved default is left alone), and you start the command again. Run `/clear` between blocks. After the blocks, do your phone rechecks (below). When the last block is done, type `/day-end`. Nothing is pushed, merged or applied to production without your explicit OK, and work reaches `main` only through a pull request once both CI jobs are green.

| # | Type | Session setting | What to check at the gate |
| --- | --- | --- | --- |
| 0 | `/day-start` | Sonnet / Low | A clean tree; `main` matching `origin/main` with every 2026-11-02 pull request merged (MOM-167's words, MOM-168, and the day-end's MOM-16 and MOM-105 branches); `npm run project:check` passing; production migrations 001 to 022; no leftover branches; the plan passing its format check; no missing environment variable names; `npm run stack:status` answering in one line. Vercel serving the merge, including the MOM-111 prompt-caching merge of the night of Nov 2. Then the prompt-caching check (Your manual steps 0) before any block, and the carry-overs in `docs/plans/.pending-live-checks.md`. |
| 1 | `/run-block MOM-170` | Sonnet / High | Size M. You approved the playback gate, the quick path's way on for a goal with no target, and every word as plain text before code; a replay of your run never reaches the recap without a target; the quick path finishes without Start again; screenshots at 390px in light and dark. |
| 2 | `/run-block MOM-171` | Sonnet / Medium | Size S to M. You approved how a date is answered only on your own pick before code; on an iPhone profile, opening the date wheel answers nothing and a pick answers once; every other date input that answers on change is fixed or ticketed. |
| 3 | `/run-block MOM-172` | Sonnet / Medium | Size S. The quick path's date field sits inside its card at 390px in light and dark (a spec assertion and screenshots); every other date or time input checked. |
| 4 | `/run-block MOM-174` | Sonnet / High | Size S to M. Test first: "Thursday, Dec 25" is asked back with both readings and nothing is recorded until you pick; a fake model that picks one silently is refused. If the test passes as it is, no code beyond the test. |
| 5 | `/day-end` | Opus / High | Step A checks each branch stacked in merge order on `origin/main`, with each block's specs; no migration is planned, so step B runs only if one appears. Tuesday's day-end pushes before the Nov 5 freeze; Wednesday's fixes push only with your OK. Not the first day-end of the week or month: no weekly top 5 and no monthly review. |

**Your manual steps (owner, by hand):** (0) **First thing, before any testing or block: the prompt-caching check (MOM-111).** After Vercel serves the MOM-111 prompt-caching merge, signed in as the standing smoke-test account (real Claude calls, your call), take setup through at least two turns. Confirm in the Anthropic Console that the turn shows under the momentum-prod workspace. Then, with your OK, a **count-only** query of the account's newest setup usage rows (counts only, never text) must show `cache_read_tokens` above 0 from the second turn on. If it shows 0, MOM-111's caching merge is reverted (through a pull request, with your OK) before any testing or block. If the account is still at its per-person cap, wait for room (Monday's calls age out between about 5 am and 5 pm PT) or say so, and the check waits; no block starts before it passes or the revert is merged. (1) **After the blocks, on your phone, signed in as the standing smoke-test account (real Claude calls, your call):** recheck extra detail (MOM-168): start a setup or **Add to your goals**, give "I want to run three days a week" as the goal answer, and confirm the target is recorded, the 3 is quoted back and used, and it is never asked for again. Also save one deadline goal on the phone, all the way to the saved card (MOM-166): MOM-166 moves to Done only after that save passes, not at the 2026-11-02 day-end. The account hit its per-person cap on Mon 2026-11-02 (100 of 100); room comes back one call at a time as Monday's calls age out, between about 5 am and 5 pm PT Tuesday, so a "You've used all 100 of your Claude requests" card in the morning is the cap, not a bug. (2) On your phone, signed out: the "Check your email" card shows **Go to sign in** first and **Start again** as the smaller link (MOM-167 part 15; a real sign-up is your call). (3) **After Tuesday's day-end deploys (Tuesday night or Wednesday morning, before the freeze):** on your iPhone, recheck the date fix (MOM-171: "Pick a different date" answers nothing until you pick), the quick path with a goal and no target (MOM-170) and its date field at 390px (MOM-172). (4) **Wednesday evening:** in the Anthropic Console, retire the old keys task-app-prototype and momentum-local once each shows 24 hours with no use. (5) Before the trial, add each tester's Gmail as a test user on the Google consent screen (MOM-155: stay in Testing for the trial).

If a block needs another ticket's code, `/run-block` checks that code is already in `origin/main`. If it is only on an unmerged branch, it stops and offers two ways forward: push that branch and merge its pull request first, or stack this block on that branch (only with your OK). **Every block needs the 2026-11-02 pull requests merged** (MOM-167's words and MOM-168 change setup's prompt, checks and playback). Blocks 1.1, 1.2 and 1.3 may all touch `components/setup/QuickPathFillIn.tsx` or `components/setup/DateAnswer.tsx`, and 1.1 and 1.4 both touch `lib/setup/checks.ts`: a later branch merges `origin/main`, or the branch before it, before its push if they change the same file.

---

## Executive Overview & Architectural Invariants

This plan covers Tue Nov 3, the first of two test-and-fix days before the production freeze. It fixes what the owner's evening phone test of 2026-11-02 found in setup: a quick path that dead-ends for a goal with no target, an iPhone date wheel that answers with today before the person picks, a date field that runs past its card at 390px, and a test that a wrong weekday with a right date is asked back. MOM-173 (the per-person cap and retries) is not built before the trial: the owner kept the cap at 100 with retries counted.

`docs/DOMAIN_MODEL.md` is binding for all new code. The old model stays in the code until MOM-115 retires it, so new code is built beside the old tables, never into them. Every block preserves these invariants:

1. **Claude never scores.** The engine (`lib/engine/`) computes every number from entries and the target in force; no Claude output is stored as a number, and setup's draft is validated by code, not by Claude (DOMAIN_MODEL §1.7, principle 9).
2. **The person's word beats any source.** A manual entry or correction always wins over a sync; a value the person typed beats a suggestion; corrections are keyed to the source's own record id (§1.5, §1.6).
3. **Never assume anything about a person's life.** Time zone, week start and day end are the person's to set; the quick path applies no default (§2.3); a suggestion the person took is a starting point, checked at their first review (§2.1 rule 4). A date is the person's own pick, never a value a picker sends on opening (MOM-171), and a date whose weekday disagrees with it is asked back, never silently read one way (MOM-174). Which level a number is stays the person's call (MOM-168). No default goal, start or order.
4. **Unfinished work moves, habits never carry over.** (§1.4, principle 11.) A changed target takes effect from the period after the reviewed one and never re-grades a closed one (§1.7, MOM-146); a target added later is graded only from its own start (MOM-132, migration 021); a forecast edit changes only what home computes from now on (MOM-138).
5. **Service-layer RLS enforcement.** The UI never queries Supabase. Every read and write goes through `lib/services/`; every new table has row level security keyed to its owner, explicit grants and an entry in `supabase/verify/900_table_grants.sql`'s allow-list.
6. **The old model's guards stay until MOM-115.** Nothing in this plan removes a table, migration or service of the old model.
7. **Nothing is saved until final approval** in setup, every Claude call goes through `lib/services/llm.ts`, and a Claude call sends only the fields the privacy notice lists (pinned by a test).
8. **A stored record of what was said is never rewritten** (RAID R-26).
9. **Plain words** (DOMAIN_MODEL §2.1): everyday words with a reason, the person's own words restated, a way out of every change, "what do you mean?" always answered. No screen is a dead end: every card has a way on that is not Start again (MOM-170).
10. **A transition settles in one render** (failure log F-072, F-079, MOM-147): a state update after an `await` inside a transition's start function is wrapped in the start function again (`tests/transition-sweep.test.ts` sweeps for it), and its test waits for the settled control with `findByRole`, not only the message or the call. A test that checks something an effect does (focus, scrolling, a logged call) waits for that effect too (F-095). A browser spec waits for the settled control (or, where none is left, an app-side settled marker) before it navigates, reloads or ends (MOM-120).
11. **A main button is never disabled or faded** (MOM-145): while work is in flight it stays solid and says it is busy; a single-answer input shows no button until it has a value; a form with several fields answers a tap with a plain callout naming what is missing. `tests/main-button-rule.test.ts` sweeps every component.
12. **A request never sends the person's answer twice and never loses it** (MOM-167 part 3): an automatic resend happens at most once per answer, and a request id makes the screen ignore a late reply. Every try counts toward the person's allowance (MOM-173): no block adds a retry or a resend.

## Standing Rules (every prompt below repeats what it needs)

- **Read the Jira ticket first.** If its title, scope or acceptance criteria disagree with the prompt, or the prompt disagrees with `docs/DOMAIN_MODEL.md`, stop and flag it.
- **A fix covers its pattern, not only the instance (owner, 2026-11-01, MOM-92's October review).** A fix names its pattern and searches for the same pattern in the same session. Every other hit is fixed or ticketed before the commit.
- **A fake model in a test includes the worst realistic output for the rule under test (failure log F-096).** A replay or eval test of a check makes its fake write what real Claude can write that the rule exists to stop (a sentence-shaped title, a silently picked date, a skipped target), not only the output the rule hopes for; the test fails without the fix.
- **Approvals go into the ticket when they are given (failure log F-087).** Approved words and decisions are written verbatim into the ticket's Jira comment at the design stop, before any code, so a `/clear` or a new thread cannot lose them.
- **Whoever hands off a block checks the written plan against the handoff (failure log F-090).** A block that came from a handoff is printed in full after the plan is written, and the handoff's owner checks every item survived.
- **Before blaming an instruction, check whether the action happened (failure log F-094).** Read the tool's own result (for a push: "mobile push requested") and the documented rule (pushes are skipped while the terminal window has focus, so keep it minimised at stops) before proposing a new fix.
- **Production changes need your approval.** A prompt stops before `supabase db push`, `vercel env`, or any push to `origin`, shows what will happen, and waits. Never use the SQL Editor. Tests never run against production and never use production credentials.
- **Database checks are not part of `npm test`.** They live in the SQL scripts in `supabase/verify/` and run with `npm run verify:sql` (local stack) or, against production, with the step B loop. After any migration, or any change to a verify script, run **all** of them; every row must show `passed = true`. A local total is not a production total: one script has checks that run only on production (RAID R-16, failure-log F-027).
- **New migrations, numbered in push order:** the next free number is **023**. No block in this plan expects one (MOM-173's counting change, if any, comes after the trial); a block whose approved design needs one takes 023, only with your OK at its migration stop. A later branch with a migration merges `origin/main` before its push. Never edit an applied migration.
- **Pull requests, not local merges.** `main` is protected: work reaches it only through a pull request with the CI jobs `checks` and `database` green, merged with a merge commit (CLAUDE.md). A block commits on its feature branch and stops: it never merges into `main` and never pushes. Branches are pushed only with your explicit OK (normally once, at day-end step F; a branch with a migration may be pushed mid-day with your OK, CLAUDE.md).
- **A migration is applied before its pull request merges.** A block with a migration runs `npm run verify:sql` locally, shows the migration and `npx supabase db push --dry-run`, and stops. Once CI is green on its pull request and you say OK, the production `db push` and then ALL the verify scripts run, before that pull request merges (merging deploys to Vercel, and the new code needs the new schema).
- **Blocks never edit `BACKLOG.md`.** A block's backlog notes, new gaps and follow-ups go in its Jira comment and its close-out; day-end step D writes `BACKLOG.md` once, on its own branch, and gives each new item a journey tag (J1 to J5).
- **Build time.** Each close-out and Jira comment gives `Build time: about <n> min, not counting waits on me (<size band>)`: working time from the design OK to the commit, leaving out design and look reviews, screenshot OKs, live-call OKs and dashboard steps you do by hand. If the block was not timed, it says "not measured", never a guess (failure log F-076). Day-end step E builds its planned-versus-actual table from these lines; note the start and end times at the design OK and the commit.
- **Run the specs of every page you change** (failure log F-078), not only the spec you wrote: a block that changes a page, or a shared wording or component a page uses, runs that page's browser specs too. **A block that adds a page under `app/` also runs `tests/e2e/header-390.spec.ts`** (failure log F-082, MOM-124): its guard fails for any page missing from the 390px sweep. A screenshot spec (`tests/e2e/*-shots.spec.ts`) skips every test unless its folder variable is set, so a run without it is not a pass: run it with its folder set. CI's full run comes only after the day-end push.
- **Restart the local stack after an auth config or email template change (failure log F-091).** When a branch changes `supabase/config.toml` or anything in `supabase/templates/`, restart the local stack before that branch's browser specs: `npx supabase stop`, then `npx supabase start` with its output discarded (it prints the local keys; never show it), then `npm run stack:status`. This holds in a block's own runs and in day-end step A.
- **Test an emailed link the way a person opens it (failure log F-093).** A browser test of an emailed link opens it in a fresh browser context with no cookies, never in the browser that started the flow.
- **A screen design lists its words as plain text at the design stop** (failure log F-073), so you read them as a tester before any pixel; Claude reads every screenshot the same way, words top to bottom first, layout second, before you see it. A block that changes a screen saves its screenshots in `C:\Users\matth\momentum-screenshots\<block>\` (for example `MOM-170-quick-path-no-target`), at 390px (and 1280px where the layout changes), in light and dark, and shows them to you before it commits. A test that compares dates also runs once with the browser's clock across a day boundary from the person's (F-069).
- **Say where a paste goes in plain words** (failure log F-081): a project and folder named for you are a plain line of text, never code formatting, and every session's pastes start with the folder change as its own paste.
- **Dashboard steps come from files** (MOM-149): anything you paste into a dashboard is copied from a file opened in an editor, never from terminal output.
- **Is the local stack up?** Ask it with `npm run stack:status` (it prints only "Local Supabase stack: running" or "Local Supabase stack: not running"). Never run `supabase status` unfiltered: its output holds the local stack's keys (failure log F-047, F-049, F-051, F-057, F-059), and `.claude/settings.json` denies it.
- **Logs (MOM-133).** A failure-log entry is written only when it leads to a fix made that session, a new standing rule or a Jira ticket, and names which; it is marked `unreviewed` until the day-end. `docs/RAID_LOG.md` is frozen: a new risk, assumption, issue or dependency becomes a Jira ticket with the `risk` label.
- **Claude calls cost money.** `npm test` never calls Claude: model calls in tests go through a fake. A block that wants a live Claude call says how many calls and the cost cap and stops for your OK first, and it is logged through `lib/services/llm.ts`. No block in this plan plans one; your rechecks on production are yours to run, and they count toward the standing account's allowance.
- **Stale generated types.** Generated route types under `.next/` outlive a branch switch (failure log F-028, F-039). Until MOM-130 builds it into the commands, delete `.next/types` and `.next/dev` (both git-ignored and regenerated) before `npx tsc --noEmit` or `npm run build` on a branch you just switched to.
- **Memory on the build machine.** The full local `npm run test:e2e` runs out of memory (MOM-141). Close what you do not need before heavy steps; run a block's own specs and its changed pages' specs one at a time; CI's `database` job is the full-suite gate. A jsdom test that fails a full run and passes alone is a failure to fix, not a flake to rerun (MOM-96), whoever's code it covers (F-095). A run the machine slept through is discarded and run again before any failure in it is trusted.
- **Standing smoke-test account.** Production keeps ONE standing test account, `smoke-test@momentum-app.test`, created by you in the Supabase dashboard (Authentication → Add user, Auto Confirm User on). Its password lives only in your password manager: Claude never asks for it, prints it or stores it in the repo, and never creates, edits or deletes users on production. Every live sign-in check in this plan says "sign in as the standing smoke-test account". Claude may read its data with **count-only** queries. If its data gets cluttered, you delete and recreate it in the dashboard (it starts empty). The SQL verify scripts create and delete their own passwordless temporary users and leave none behind, and since MOM-121 every insert, update and delete in them is limited to those users (writes made through function calls are MOM-127, not yet built). Production should always hold exactly one user. The standing account's goal-model data is created only through the app (setup, logging), never seeded by hand. Browser tests use throwaway users on the **local** stack only.
- **The repo is public.** Anything written to a committed file (logs, docs, tests, fixtures, eval cases) names categories, never secrets, personal data or exploit steps. Trial testers are described by role only ("the owner", "two household testers"). The family trial is adults only (MOM-126). Eval cases are scripted, with personal details removed.

## Session Preflight (run before every block)

`/run-block` does this for you, one command at a time. By hand:

```bash
cd C:\Users\matth\momentum-app
npm run project:check       # one line; fails unless this is walsh-matthew/momentum-app
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
SESSION 1: TEST AND FIX BEFORE THE FREEZE (MOM-170, MOM-171, MOM-172, MOM-174)   Tue 2026-11-03, freeze Thu 2026-11-05, trial Sat 2026-11-07
  - The quick path's dead end for a goal with no target, and the recap reached without one
  - The iPhone date wheel that answers with today; the date field at 390px
  - A wrong weekday with a right date, asked back
```

*Order is the owner's (day-end 2026-11-02): MOM-170, MOM-171, MOM-172, then MOM-174, then the owner's phone rechecks. Safe stopping point: after any block. A block that does not fit moves to Wed Nov 4, the second test-and-fix day. MOM-173 is not a block before the trial (owner: the cap stays at 100 and retries still count).*

---

# SESSION 1: TEST AND FIX BEFORE THE FREEZE

**Your prerequisites before this session:** (0) The prompt-caching check (Your manual steps 0) passed on production, or MOM-111's caching merge has been reverted and the revert serves. (1) Every 2026-11-02 pull request is merged and Vercel serves it; `/day-start` shows it. (2) Docker Desktop running and the local stack started (`npx supabase start`, output discarded; `npm run stack:status` says running) for the browser specs. (3) Close what you do not need before the heavy steps (MOM-141). (4) Be ready to read each block's words as a tester at its design stop. (5) What you saw on your phone on 2026-11-02 evening, for Block 1.1 (the screen where the target went missing, and what the quick path card said) and Block 1.2 (what the start-date question showed after you tapped "Pick a different date").

## Block 1.1: Setup: No Dead End for a Goal With No Target (MOM-170)

* **Objective & Scope:** Size M (about 40 to 70 minutes). From the owner's phone test: setup reached the recap with a goal that had no target, then the quick path showed the missing target as "Can't be answered here" with only **Start again**. Two fixes: a code gate so a targets playback or the final confirmation never runs for a goal with no target (the target is asked for instead), and a way on in the quick path for a goal with no target that is not Start again. Nothing is assumed or filled in by default.
* **Core Invariants to Protect:** *Never assume anything about a person's life*: the quick path applies no default target or number (§2.3). *Plain words*: no dead end, a way on for every card. *Claude never scores* and the draft is validated by code. *Nothing is saved until final approval.* Every Claude call goes through `lib/services/llm.ts`; `npm test` never calls Claude.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-170: setup never reaches a targets playback or the final confirmation for a goal with no target, and the quick path gives a goal with no target a way on that is not Start again.

Task Instructions:
1. Read ticket MOM-170 in Jira first, with its comments, and MOM-168's comments of 2026-11-02 (its close-out notes that nothing in code makes the targets playback wait for a target). Ask the owner what their phone test showed: the screen where the target went missing and what the quick path card said. If the ticket and these instructions disagree, or either disagrees with docs/DOMAIN_MODEL.md (§2.2, §2.3 the quick path, §2.1 plain words), stop and flag it. This block touches sources that docs/product/USER_JOURNEYS.md lists (J1 steps 4 and 6, Gap 37): say so at the design stop.
2. Read CLAUDE.md, docs/DOMAIN_MODEL.md §2.1 to §2.3, lib/setup/checks.ts (the playback and final checks), lib/setup/validate.ts, lib/setup/playback.ts, lib/setup/quickPath.ts (stuckTop, stuckHelp, cantAnswerHere), lib/setup/fillIn.ts, components/setup/QuickPathCard.tsx, components/setup/QuickPathFillIn.tsx, components/setup/NeedsAnswer.tsx, tests/setup-compound-replay.test.ts, tests/setup-deadline-replay.test.ts and tests/e2e/setup-cards.spec.ts. Check the local stack with `npm run stack:status`; never run `supabase status` unfiltered.
3. Every 2026-11-02 pull request must already be in origin/main (MOM-167's words and MOM-168). If any is not, stop. Create the feature branch `feature/MOM-170-quick-path-no-target` off an up-to-date `main`.
4. Design before coding, then STOP for my OK: (a) the cause, read from the code and my phone test: how the recap was reached with no target, and why the quick path treats a missing target as "only Claude could ask for this"; (b) the playback gate: which check refuses a targets playback or final confirmation for an active goal with no target, its code and its fixed retry words; (c) the quick path's way on for a goal with no target (for example naming what they count, how it is measured and its numbers in the fill-in card), with every word as plain text, top to bottom, at 390px; nothing assumed, no default number; (d) a replay test of my run whose fake model gives its worst realistic output for this rule (it plays back targets for a goal that has none), failing before the fix; (e) the pattern: every other quick-path item marked "Can't be answered here", each with its decision; (f) the "Privacy impact" and "PM docs impact" lines (USER_JOURNEYS J1 steps 4 and 6, Gap 37; PRD Gap 18). Wait for my answer, then write the approved design and words verbatim into a MOM-170 Jira comment before any code (failure log F-087). Note the time of my OK for the Build time line.
5. Build as approved. A main button stays solid (MOM-145); a state update after an await inside a transition is wrapped again (F-072). Every Claude call still goes through lib/services/llm.ts. If the design changes what docs/DOMAIN_MODEL.md says, add a line to its change log.
6. Tests: the replay of my run (never a targets playback or final confirmation without a target); a component test of the quick path with a goal and no target that finishes without Start again and assumes nothing; the existing setup evals and replay tests still pass. A test waits for the settled control with findByRole. `npm test` makes no network call.
7. Run `npx tsc --noEmit`, `npm test`, `npm run build`, and the setup browser specs one at a time (stop `npm run dev` first): `tests/e2e/setup.spec.ts`, `tests/e2e/setup-cards.spec.ts` and `tests/e2e/setup-add.spec.ts`. Read each whole output; the known expected lines are the setup spec's `[setup] a reply was thrown away { category: 'schema', … }` warnings and the setup-cards spec's 500 and 401 lines.
8. List the words as plain text and save screenshots of the quick path card with a goal and no target at 390px in light and dark in C:\Users\matth\momentum-screenshots\MOM-170-quick-path-no-target\; read each one's words top to bottom first; show them to me before the commit.
9. No live Claude call in this block. Add to docs/plans/.pending-live-checks.md: on your phone after the deploy, signed in as the standing smoke-test account (real Claude calls, your call), a setup never reaches the recap with a goal that has no target, and the quick path lets a goal with no target finish without Start again.
10. Do not edit BACKLOG.md. Put backlog notes in the Jira comment and the close-out. Say "Privacy impact" and the "Build time" line in the close-out ("not measured" if not timed). Comment on MOM-170 with what changed and each acceptance criterion met or unmet; do not move it to Done.
11. Commit with "fix(MOM-170): no dead end for a goal with no target in setup". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes (with no network call) and includes the replay of the owner's run; the setup, setup-cards and setup-add specs pass; screenshots shown in light and dark; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] You approved the cause, the gate, the quick path's way on and every word as plain text before code; they are in MOM-170's Jira comment.
  - [ ] A replay of your run never reaches the recap without a target, and its fake plays back a goal with no target (test); the quick path finishes without Start again (test).
  - [ ] Every other "Can't be answered here" item is fixed or ticketed; you saw the screenshots at 390px in light and dark.

---

## Block 1.2: Setup on iPhone: A Date Is Answered Only on the Person's Own Pick (MOM-171)

* **Objective & Scope:** Size S to M (about 30 to 60 minutes). From the owner's phone test: tapping **Pick a different date** at the start-date question answered it with today the moment the iPhone date wheel opened. `PickDateButton` (`components/setup/DateAnswer.tsx`) answers in its input's `onChange`, and iOS Safari sends a change with the current value when the wheel opens. Answer only on the person's own pick, and sweep every other date input that answers on change.
* **Core Invariants to Protect:** *Never assume anything about a person's life*: a date is the person's own pick. *A main button is never disabled or faded*. *A transition settles in one render*. *A request never sends the person's answer twice*: a pick answers once.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-171: on an iPhone, opening the date wheel from "Pick a different date" answers nothing, and the date is answered once, only with the person's own pick.

Task Instructions:
1. Read ticket MOM-171 in Jira first. Ask the owner what the start-date question showed after they tapped "Pick a different date". If the ticket and these instructions disagree, or either disagrees with docs/DOMAIN_MODEL.md, stop and flag it.
2. Read CLAUDE.md, docs/DOMAIN_MODEL.md §2.1 (plain words), components/setup/DateAnswer.tsx (PickDateButton, its showPicker call and onChange), components/setup/StartQuestion.tsx, components/setup/QuickPathFillIn.tsx (its date field), components/entries/DayPicker.tsx, app/task/[id]/page.tsx and its date edit, app/plan/kinds/page.tsx, and tests/e2e/setup-cards.spec.ts ("date cards on an iPhone profile"). Check the local stack with `npm run stack:status`; never run `supabase status` unfiltered.
3. Every 2026-11-02 pull request must already be in origin/main. If any is not, stop. If Block 1.1 left an unmerged branch that changes the same file, say so and ask whether to stack on it. Create the feature branch `feature/MOM-171-date-wheel` off an up-to-date `main`.
4. Design before coding, then STOP for my OK: (a) the cause, from the code: which event answers the question and why iOS fires it on opening; (b) how a pick is answered only once and only with the person's own choice (for example on the wheel's Done or blur with a value the person changed, never the value the input opened with), and what the person sees while the wheel is open; any words, as plain text; (c) how a browser test on the iPhone profile shows opening answers nothing and a pick answers once, and what only a phone can show; (d) the pattern: every other date input that answers on change (the quick path's date field, /log's day picker, the task date edit), each fixed or ticketed; (e) the "Privacy impact" and "PM docs impact" lines (USER_JOURNEYS J1 step 2, Gap 38). Wait for my answer, then write the approved design verbatim into a MOM-171 Jira comment before any code (failure log F-087). Note the time of my OK for the Build time line.
5. Build as approved. A main button stays solid (MOM-145); a state update after an await inside a transition is wrapped again (F-072).
6. Tests: a component test where opening the picker with no change answers nothing and a changed value answers once; the iPhone-profile browser test of the same; the existing date-card tests still pass. A test waits for the settled control with findByRole. `npm test` makes no network call.
7. Run `npx tsc --noEmit`, `npm test`, `npm run build`, and these browser specs one at a time (stop `npm run dev` first): `tests/e2e/setup.spec.ts` and `tests/e2e/setup-cards.spec.ts`, plus `tests/e2e/manual-entry.spec.ts` if the sweep changes /log and `tests/e2e/forecast-edits.spec.ts` if it changes /task or /plan/kinds. Read each whole output; the known expected lines are the setup spec's `[setup] a reply was thrown away { category: 'schema', … }` warnings and the setup-cards spec's 500 and 401 lines.
8. If anything on screen changes, list the words as plain text and save screenshots at 390px in light and dark in C:\Users\matth\momentum-screenshots\MOM-171-date-wheel\; read each one's words top to bottom first; show them to me before the commit.
9. No live Claude call in this block. Add to docs/plans/.pending-live-checks.md: on your iPhone after the deploy, signed in as the standing smoke-test account (real Claude calls, your call), "Pick a different date" at the start-date question answers nothing until you pick, and then answers with your date once.
10. Do not edit BACKLOG.md. Put backlog notes in the Jira comment and the close-out. Say "Privacy impact" and the "Build time" line in the close-out ("not measured" if not timed). Comment on MOM-171 with what changed and each acceptance criterion met or unmet; do not move it to Done.
11. Commit with "fix(MOM-171): a date is answered only on the person's own pick". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes (with no network call) and includes the open-without-answer test; the setup and setup-cards specs pass (and manual-entry or forecast-edits if the sweep changed those pages); committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] You approved the cause and how a pick is answered before code; they are in MOM-171's Jira comment.
  - [ ] Opening the date wheel answers nothing and a pick answers once (component test and the iPhone-profile spec).
  - [ ] Every other date input that answers on change is fixed or ticketed; the iPhone recheck is in the pending live checks.

---

## Block 1.3: Quick Path: The Date Field Fits Its Card at 390px (MOM-172)

* **Objective & Scope:** Size S (about 20 to 40 minutes). From the owner's phone test: the quick path's date field runs past its card at 390px, most likely iOS Safari's own width for a date input. Make it fit, check the time field and time zone search beside it, and add a spec assertion that every control sits inside its card at 390px.
* **Core Invariants to Protect:** *Plain words* and a layout that collapses to single-column cards at phone width with no sideways scroll. *A main button is never disabled or faded*.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-172: the quick path's date field, and every control beside it, sits inside its card at 390px in light and dark.

Task Instructions:
1. Read ticket MOM-172 in Jira first. If the ticket and these instructions disagree, or either disagrees with docs/DOMAIN_MODEL.md, stop and flag it.
2. Read CLAUDE.md, components/setup/QuickPathFillIn.tsx (the date, time and time zone fields), components/setup/QuickPathCard.tsx, the shared input styles it uses, and tests/e2e/setup-cards.spec.ts (its 390px cards and its iPhone profile). Check the local stack with `npm run stack:status`; never run `supabase status` unfiltered.
3. Every 2026-11-02 pull request must already be in origin/main. If any is not, stop. If Block 1.1 or 1.2 left an unmerged branch that changes components/setup/QuickPathFillIn.tsx, say so and ask whether to stack on it. Create the feature branch `feature/MOM-172-date-field-390` off an up-to-date `main`.
4. Design before coding, then STOP for my OK: (a) the cause (which control overflows, and why at 390px); (b) the fix and what else it changes; (c) the spec assertion (each control's box inside its card's box at 390px, on the iPhone profile); (d) the pattern: every other date or time input in components/setup/, /log, /plan/kinds and /task/<id>, each with its decision; (e) the "Privacy impact" and "PM docs impact" lines (USER_JOURNEYS J1 step 6, Gap 39). Wait for my answer, then write the approved design verbatim into a MOM-172 Jira comment before any code (failure log F-087). Note the time of my OK for the Build time line.
5. Build as approved. A main button stays solid (MOM-145).
6. Tests: the setup-cards spec's in-card assertion at 390px for the quick path's fill-in card (it fails before the fix). `npm test` makes no network call.
7. Run `npx tsc --noEmit`, `npm test`, `npm run build`, and these browser specs one at a time (stop `npm run dev` first): `tests/e2e/setup-cards.spec.ts` and `tests/e2e/setup.spec.ts`, plus the spec of any other page whose input the sweep changes. Read each whole output; the known expected lines are the setup spec's `[setup] a reply was thrown away { category: 'schema', … }` warnings and the setup-cards spec's 500 and 401 lines.
8. Save screenshots of the quick path's fill-in card at 390px in light and dark in C:\Users\matth\momentum-screenshots\MOM-172-date-field-390\; read each one's words top to bottom first; show them to me before the commit.
9. No live Claude call in this block. Add to docs/plans/.pending-live-checks.md: on your iPhone after the deploy, the quick path's date field sits inside its card (a forced quick path; production has no easy way to reach the card, so this joins the MOM-111 quick-path fill-in check).
10. Do not edit BACKLOG.md. Put backlog notes in the Jira comment and the close-out. Say "Privacy impact" and the "Build time" line in the close-out ("not measured" if not timed). Comment on MOM-172 with what changed and each acceptance criterion met or unmet; do not move it to Done.
11. Commit with "fix(MOM-172): the quick path's date field fits its card at 390px". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes (with no network call); the setup-cards and setup specs pass with the new in-card assertion; screenshots shown in light and dark; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] You approved the fix before code; it is in MOM-172's Jira comment.
  - [ ] At 390px every control on the quick path's fill-in card sits inside its card (spec assertion), and you saw the screenshots in light and dark.
  - [ ] Every other date or time input is checked, fixed or ticketed.

---

## Block 1.4: Setup: A Wrong Weekday With a Right Date Is Asked Back (MOM-174)

* **Objective & Scope:** Size S to M (about 30 to 60 minutes). From the owner: a date whose weekday disagrees with it, such as "Thursday, Dec 25" (a Friday in 2026), must be asked back with both readings and never silently read one way. A code search on 2026-11-02 found nothing that compares a stated weekday with its date. Test first: if setup already asks back, the block adds the test only; if not, the smallest fix, with its words approved.
* **Core Invariants to Protect:** *Never assume anything about a person's life*: neither reading is recorded until the person picks. *Claude never scores* and the draft is validated by code. *Plain words*: both readings named in everyday words. Every Claude call goes through `lib/services/llm.ts`; `npm test` never calls Claude.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-174: a date given with the wrong weekday ("Thursday, Dec 25", a Friday in 2026) is asked back with both readings, and neither is recorded until the person picks. Test first; fix only if the test fails.

Task Instructions:
1. Read ticket MOM-174 in Jira first. If the ticket and these instructions disagree, or either disagrees with docs/DOMAIN_MODEL.md (§2.1, §2.2's dates, principle "never assume"), stop and flag it.
2. Read CLAUDE.md, docs/DOMAIN_MODEL.md §2.1 and §2.2, lib/setup/relativeDates.ts, lib/setup/codeTurns.ts (the date proposal), lib/dates/casual.ts, lib/setup/checks.ts, lib/services/setup.ts (the date hint passed to Claude), lib/setup/evals.ts, tests/setup-deadline-replay.test.ts and tests/setup-title-replay.test.ts (how a replay test drives the fake). Check the local stack with `npm run stack:status`; never run `supabase status` unfiltered.
3. Every 2026-11-02 pull request must already be in origin/main. If any is not, stop. If Block 1.1 left an unmerged branch that changes lib/setup/checks.ts, say so and ask whether to stack on it. Create the feature branch `feature/MOM-174-wrong-weekday` off an up-to-date `main`.
4. Write the test first, before any design: a replay with the answer "Thursday, Dec 25" (for a start date and for a deadline date) whose fake model gives its worst realistic output for this rule: it silently records one reading (Thu Dec 24 or Fri Dec 25). Run it and report whether setup already refuses that reply or asks back. Then STOP for my OK with: (a) the result; (b) if it fails, the smallest fix (for example, code reads the mismatch, the date hint names it, and a check refuses a draft that records either reading before the person picks), with the question's words and the two readings as plain text; (c) the pattern: other places a date is read from words (the quick path's date field, a deadline date, the start date), each with its decision; (d) the "Privacy impact" and "PM docs impact" lines (USER_JOURNEYS J1 step 2, Gap 41). Wait for my answer, then write the approved design and words verbatim into a MOM-174 Jira comment before any code (failure log F-087). Note the time of my OK for the Build time line.
5. Build as approved, or add only the test if setup already asks back. Every Claude call still goes through lib/services/llm.ts. If the design changes what docs/DOMAIN_MODEL.md says, add a line to its change log.
6. Tests: the replay for a start date and a deadline date (asked back with both readings; the silent pick refused); a date with the right weekday still accepted as it is; the existing setup evals and replay tests still pass. `npm test` makes no network call.
7. Run `npx tsc --noEmit`, `npm test`, `npm run build`, and the setup browser specs one at a time (stop `npm run dev` first): `tests/e2e/setup.spec.ts` and `tests/e2e/setup-cards.spec.ts`. Read each whole output; the known expected lines are the setup spec's `[setup] a reply was thrown away { category: 'schema', … }` warnings and the setup-cards spec's 500 and 401 lines.
8. If any card's words change, list them as plain text and save screenshots at 390px in light and dark in C:\Users\matth\momentum-screenshots\MOM-174-wrong-weekday\; read each one's words top to bottom first; show them to me before the commit.
9. No live Claude call in this block. If a fix was built, add to docs/plans/.pending-live-checks.md: on your phone after the deploy (signed in as the standing smoke-test account; real Claude calls, your call), give "Thursday, Dec 25" as a date and see both readings offered.
10. Do not edit BACKLOG.md. Put backlog notes in the Jira comment and the close-out. Say "Privacy impact" and the "Build time" line in the close-out ("not measured" if not timed). Comment on MOM-174 with what changed and each acceptance criterion met or unmet; do not move it to Done.
11. Commit with "test(MOM-174): a wrong weekday with a right date is asked back" (use "fix(MOM-174): ..." with the same words if code changed). Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; the test written and run before any fix; tsc --noEmit passes; npm test passes (with no network call) and includes the wrong-weekday replay; the setup and setup-cards specs pass; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] The test came first, with a fake that picks one reading silently, and its result was reported before any fix; the approved design is in MOM-174's Jira comment.
  - [ ] "Thursday, Dec 25" is asked back with both readings and nothing is recorded until you pick (test); a date with the right weekday is unchanged (test).
  - [ ] Other date-reading places are checked, fixed or ticketed.

---

# FINAL DAY-END BUILD VERIFICATION & PULL REQUESTS

Run after the last block of the day, or type `/day-end` and let it run these in this order: **A, B, D, E, then F (the one push, after your OK), then C (live checks, after the pull requests have merged and Vercel has deployed)**. Stop on the first failure. When the whole sequence has finished and you say so, `/day-end` ends with the line `Tomorrow: /day-start (Sonnet / Low)`.

**The build day's window.** The day starts at the previous day-end's last merge, not at midnight, so a day-end that runs past midnight sees the same work. It is the newest merge on `origin/main` of a step E branch, found by the branch name, which always ends in `-next-build-plan-doc`: `git log origin/main --merges -n 1 --grep="next-build-plan-doc" --format="%h %cI %s"`. `/day-end` prints it as `Window: after <hash> (<date>, <subject>)` at the start and reuses that hash in steps B, D and F (it never recomputes it, because today's own step E branch will have merged by then). If there is none, you give a start date. Below, `<window>` means that hash.

**When there is nothing to sync.** `/day-end` stops at the start only if all four hold: no unmerged branches; no open backlog item without a Jira key; no entry marked `unreviewed` in `docs/FAILURE_LOG.md` (`docs/RAID_LOG.md` is frozen and is not checked); and no ticket with commits on `origin/main` in the window that Jira still shows as neither Done nor Closed. It names each condition, and says which ones kept it going. Failure entries carry the `unreviewed` mark in their heading line (`### F-0nn · … · unreviewed`); an entry drafted without the mark is still a waiting entry, so also look at the entries added in the uncommitted changes to the log (failure log F-061, MOM-124). F-096 was reviewed and committed on 2026-11-02's step D branch.

**Your log edits and branch switches.** If you hold uncommitted edits to `docs/FAILURE_LOG.md` or `docs/RAID_LOG.md` and a branch's copy of either file differs, a plain `git switch` aborts. Before each switch `/day-end` checks for this, says so in plain words, backs both files up, stashes them (`git stash push -- <the two files>`), switches and pops. If the pop would conflict (entries that sit next to ones the target branch lacks), it keeps the stash, says so, and pops it on `main` after the merge instead. If a pop conflicts, it stops, restores from the backup and asks you. It never stages a log file for this; only the entries you approve in step D are staged.

**The trial.** The family trial starts Sat 2026-11-07, with a production freeze from Thu Nov 5 until after 10:30 am PT Fri Nov 6. Tuesday's day-end pushes Tuesday's fixes so they deploy before Wednesday's testing; Wednesday's fixes push only with the owner's OK and before the freeze.

## A. Build and repository checks (PowerShell or Git Bash)

`/day-end` runs this. **Check each branch on top of `origin/main` and the branches that merge before it** (2026-10-31: four real conflicts and one regression showed only that way, failure log F-078): on a detached HEAD at `origin/main`, merge the day's branches one at a time in merge order and run the checks after each. A branch never moves for this; a fix found here is committed on its own branch, or carried to it at the push. Docs-only branches (D and E) need only `npm test` and `npm run plan`. Read the whole output of each command, never a filtered part of it; a merge's own result is read before any check runs.

```bash
cd C:\Users\matth\momentum-app
npm run project:check                                # one line; fails unless this is walsh-matthew/momentum-app
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

`npm run test:e2e` and `npm run verify:sql` also run in CI on every pull request. Run `npm run verify:sql` here for a branch with a migration (reset the local database to the stack's migrations first with `npx supabase db reset --local`), and the browser specs of every page the day's branches changed, one spec file at a time (stop `npm run dev` first; check the stack with `npm run stack:status`), plus `tests/e2e/header-390.spec.ts` for any branch that adds a page under `app/` (F-082). A screenshot spec runs only with its folder variable set; without it every test skips, which is not a pass. **When a branch changes `supabase/config.toml` or anything in `supabase/templates/`, restart the local stack after merging it and before its browser specs** (`npx supabase stop`, then `npx supabase start` with its output discarded, then `npm run stack:status`; failure log F-091). Today: the setup, setup-cards and setup-add specs after MOM-170's fix; the setup and setup-cards specs after MOM-171's (plus manual-entry and forecast-edits if its sweep changed /log, /task or /plan/kinds), after MOM-172's and after MOM-174's. Any server error in the e2e output is a failure, with these known exceptions until MOM-124's expected-lines list exists: the wizard spec's two `[task-plan-ai] the API key was rejected { httpCode: 401 }` lines, the `[synced-entries] not counted … reason: 'no_source'` lines from the Hevy "no bound target" spec, the setup spec's `[setup] a reply was thrown away { category: 'schema', … }` warnings (its "reply is slow, thrown away, or cut off" test feeds bad replies on purpose), and the setup-cards spec's `[setup-ai] request failed { httpCode: 500 }` and `[setup-ai] the API key was rejected { httpCode: 401 }` (its first test shows the "no answer" and "not configured" error cards on purpose). "The destination stream errored while writing data" is a failure (MOM-120): if it appears, count it per run on `origin/main` alone and on the stack before judging. A jsdom test that fails a full run and passes alone is a failure to fix, not a flake to rerun (MOM-96), whoever's code it covers (F-095); a run the machine slept through is discarded and run again first.

Generated route types outlive a branch switch: a browser test run leaves the development server's in `.next/dev`, and a production build leaves its own in `.next/types` (failure log F-028, F-039). Delete both folders (git-ignored, rebuilt by the next build or `npm run dev`) before the checks after each merge; if `tsc` or the build still fails only in a file under `.next/`, delete them and run the check again; any other failure is real. MOM-130 builds this into the commands.

## B. Database verification (production), only if migrations were applied in the window

A migration is in the window when `git log --branches --remotes --not <window> --name-only --format=%h -- supabase/migrations` lists a file. No block in this plan expects one (the next free number is 023). B also runs when a script in `supabase/verify/` changed in the window, because production is where those scripts are proven. **Git Bash only.** This loop uses `/tmp`, `grep`, `$(...)` and `for ... done`, which do not work in PowerShell. `npm test` does **not** run these scripts. Every script must report `false 0` and a non-zero `true` count (0 and 0 means the script errored).

**When a migration is still waiting for its push.** A migration is applied at step F, after CI is green and before its pull request merges. If the window's migrations are not yet on production when B runs, B runs only its read-only part now (the migration list, where remote should stop at the last applied migration, the dry run, and the user count), and the verify loop runs at step F right after each `db push`. Running the loop before the push would fail the new migration's verify script and write throwaway users to production twice. **When a migration was already applied and verified on production earlier in the day**, B runs only the read-only part and reports the totals recorded then, rather than writing throwaway users to production a second time.

```bash
npx supabase migration list                         # local and remote columns must match for every migration already applied
T=0; F=0
for f in supabase/verify/*.sql; do
  npx supabase db query --linked -f "$f" -o table > /tmp/v.txt 2>&1
  t=$(grep -cE '│ true ' /tmp/v.txt); fl=$(grep -cE '│ false ' /tmp/v.txt)
  echo "$(basename $f): true $t false $fl"; T=$((T+t)); F=$((F+fl))
done; echo "TOTAL true $T false $F"                 # expect false 0 and a true count no lower than the last production total (805 true, recorded on 2026-11-02 after 022), plus the checks added in the window. A local count is not a production count: one script runs 5 more checks on production
npx supabase db query --linked -o table "select count(*) as users from auth.users"   # expect 1: only the standing smoke-test account
```


## D. Automated End-of-Day Backlog, Obsolescence & Jira Sync (copy-paste)

```text
Perform end-of-day backlog synchronization, obsolescence audit, and ticket generation.

Task Instructions:
1. Scan BACKLOG.md, ROADMAP.md, code TODO tags, the window's commits (`git log --branches --remotes --not <window> --no-merges`, the window being the one `/day-end` printed at its start) and the Jira comments the day's blocks left on their tickets (blocks do not edit BACKLOG.md: their backlog notes, gaps and follow-ups are in those comments and their close-outs) for newly discovered gaps, TODOs or deferred items. Run `npm run plan` and treat every open item without a Jira key as un-ticketed. Also check Jira for tickets created since the last day-end that BACKLOG.md does not list yet, and add them.
2. Audit the "To Do" and "In Progress" tickets in Jira under the active Phase epic against the code on main:
   a. Read each candidate ticket's acceptance criteria and check them against the code and tests before judging. A ticket is obsolete, redundant or fully satisfied only if EVERY criterion is met or moot. Partly satisfied is not obsolete: add a comment saying what is done and what remains.
   b. Propose truly obsolete or redundant tickets for "Closed" (the pause in step 6 applies) with a brief comment explaining why. Never transition anything to "Done" in this step: step D runs before the day's pull requests have merged, so nothing is delivered yet. Done transitions are made in step F, after the merge.
   c. Annotate or remove the matching entries in BACKLOG.md (tick resolved items, re-key items pinned to closed tickets to the ticket that now owns the work).
   d. Check every epic in the MOM project, including the Phase 1 epics MOM-4 to MOM-7, and note which would have every child Done or Closed once today's merged tickets are Done. Do not transition an epic here: step F lists those epic transitions after the merge. Leave an epic with any open child alone. Do not re-parent tickets.
3. Confirm the active Phase Epic key and that every ticket created today is its child (an idea ticket the owner left without an epic, such as MOM-158, stays without one).
4. For each un-ticketed item found, group related items, then:
   a. Write the ticket in our format (Title, Summary, Technical Scope, Acceptance Criteria);
   b. Create it in Jira under the active Phase Epic (check for duplicates first; if a call times out, search before retrying); a new risk, assumption, issue or dependency gets the `risk` label;
   c. Add the new Jira key to the item in BACKLOG.md and to the ticket table.
5. Audit today's tickets: list what was finished today with its branch and pull request (it becomes Done in step F, after the merge); anything with unmet acceptance criteria must say so in a comment. Report any mismatch between a Jira ticket's real scope and its key in BACKLOG.md instead of guessing.
6. PAUSE before any Jira transition. In this step the only one allowed is "Closed" for an obsolete or redundant ticket: list every transition you intend to make, with the reason that justifies it, and wait for my OK. Comments and ticket creation do not need the pause. Never move a ticket or an epic to "Done" in step D.
7. Failure log and risks (MOM-92, lighter rule MOM-133; the rules are in CLAUDE.md, "RAID and Failure Logs", and `/day-end` step 3):
   a. From today's sessions (corrections I made, failed checks, claims that proved false), draft any missing entries in docs/FAILURE_LOG.md, marked `unreviewed`, but only where the miss led to a fix made that session, a new standing rule or a Jira ticket, and each entry names which ("Led to:"). Entries carry no secrets or personal data.
   b. docs/RAID_LOG.md is frozen and takes no new rows. A new risk, assumption, issue or dependency becomes a Jira ticket with the `risk` label (step 4b), or a comment on the ticket that already carries it.
   c. Show me today's unreviewed entries as a short numbered list (one line on what went wrong, your draft of why, and what it led to), with no "predicted it?" question; include any earlier entries still waiting. Wait for my plain-language reply (for example "ok all", "drop 2"). Apply it and remove the `unreviewed` marks on approved entries. Never ask me to edit the files or run a command. If I skip, leave the entries unreviewed for the next day-end; nothing unreviewed is committed. If some entries are approved and others are not, stage only the approved entries (never the whole file); the working copy keeps the rest.
   d. At the first day-end of the week, also show the weekly top 5: `project = MOM AND labels = risk AND status NOT IN (Done, Closed) ORDER BY priority DESC, updated DESC`. At the first day-end of a calendar month, also run the monthly pattern review: look across that month's failure entries for a cause that recurred, decide whether it needs a new standing rule or ticket, and record the result (the month's entry count and how many led to a fix, a rule or a ticket) as a Jira comment on MOM-92, never in the repo. Tuesday 2026-11-03's day-end is neither: the weekly top 5 ran on Mon 2026-11-02 (17 open at its third day-end, MOM-173 the only High), and November's monthly review ran on 2026-11-01; the next monthly review is at the first day-end of December.
   e. A fix that needs build work beyond the session gets a BACKLOG.md item, ticketed by step 4 above.
   f. Then ask "promote anything to the playbook?" List the top 3 candidate lessons from today in full, each one sentence with Why and Source, generic enough for any project (no ticket keys, file names or secrets). List any other candidates as one-line titles under "Also considered", which I can expand or skip. Wait for my reply. Print the approved ones as a single paste block headed "Playbook promotions <date>". Don't write them anywhere in the repo.
8. PM docs upkeep (MOM-164). For each section of `docs/product/USER_JOURNEYS.md`, `PRD.md` and `EVALS.md`, compare its `Sources:` line with the window: merged pull requests, the `docs/DOMAIN_MODEL.md` change log, new eval cases, `docs/FAILURE_LOG.md` entries tagged `in-product`, and Jira and `BACKLOG.md` items with a journey tag (J1 to J5). If a section's sources changed, draft the update on the step D branch. If you cannot cover a changed source with an auto-fill, add a line `Stale: <what changed>` under that section's Sources line instead of guessing. Rewrite each doc's header "Open gaps" list and its "Last updated" date. Give each new `BACKLOG.md` item a journey tag (J1 to J5) where one applies. Commit the docs with the step D commit, staged by name. Show me what changed; a doc edit needs no pause.
9. Create a feature branch off an up-to-date `main` (`feature/MOM-16-eod-backlog-sync`; if it already exists and is fully merged into origin/main, delete it with `git branch -d` and create it again) and commit BACKLOG.md (ROADMAP.md if changed, and only the docs/FAILURE_LOG.md entries I approved in step 7) with "chore(MOM-16): sync end-of-day backlog, prune obsolete tickets, and update Jira", staging files by name. An item that exists only in lines an unmerged branch already changes gets its key by a small commit on that branch instead. Do not merge it into main and do not push: it is pushed with the day's other branches at step F and merged through its pull request.

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
   - Executive Overview & Architectural Invariants, and the Standing Rules (Jira first, a fix covers its pattern, a fake model includes the worst realistic output, approvals into the ticket when given, the handoff check, check whether an action happened before blaming an instruction, production approval, verify scripts, no pushes inside blocks, blocks never edit BACKLOG.md, the build-time line, the lighter log rule, standing smoke-test account, restart the local stack after an auth config or template change, test an emailed link in a fresh browser, the screen rules: words as plain text at the design stop and a screenshot folder per block, header-390 for a new page, a screenshot spec runs with its folder set, where a paste goes in plain words, dashboard steps from files).
   - A "Today's runbook" section near the top, after the metadata header and before the first block: a table with one row per block, in order, giving `/run-block MOM-n`, the session setting (model / effort) and, in plain words, what to check at the gate. The table's first row is `/day-start` (Sonnet / Low) and its last row is `/day-end` (Opus / High), each with its own plain-words gate text; `npm run plan:check -- --strict` warns when either is missing or out of place. The text above the table also says that `/day-start` comes first and `/day-end` last.
   - Logical Session Blocks grouping high-priority tickets, in dependency order, each in the format `npm run plan:check` enforces: a heading `## Block <n>.<m>: <title> (MOM-<n>)` with exactly one ticket key (unique in the plan); a `* **CLI Session Config:** Model: X | Effort: Y` line; exactly one fenced `text` prompt that names its ticket and carries a commit message `type(MOM-n): ...`; and a `* **User Verification Gate:**` checklist. Before each session's first block, a `**Your prerequisites before this session:**` note (it may say none). Give each block a size in its objective (S about 20 to 40 minutes, M about 40 to 70, L 70 or more, timed from the design OK) until MOM-124 adds a Size field.
   - Block prompts that follow the pull-request workflow (CLAUDE.md): create the feature branch off an up-to-date `main`; commit on it with the Jira key; do NOT merge into `main` and do NOT push (the one push is at day-end, step F, after my OK); do NOT edit BACKLOG.md (notes go in the Jira comment and the close-out); give the "Build time" line in the close-out; end with "Definition of Done: ...; committed on the feature branch." A block with a migration says: run `npm run verify:sql` locally, show the migration and `npx supabase db push --dry-run`, and run production `db push` and then ALL the verify scripts only after CI is green on its pull request and I say OK, and before that pull request merges (merging deploys to Vercel). A block that needs another ticket's code says it "must already be in origin/main" and stops if it is not. When two blocks add migrations on separate branches, number them in the order they will be pushed, and say that the later branch merges origin/main before its push. A block that changes a screen lists its words as plain text at the design stop, runs the browser specs of every page it changes, and shows screenshots at 390px, in light and dark, from its own folder, before it commits. A block that adds a page under `app/` runs `tests/e2e/header-390.spec.ts`.
   - Dynamic CLI Session Config (Sonnet / High for architecture, security and database work; Sonnet / Medium or Low for standard UI and tests).
   - Copy-pasteable prompts including tsc --noEmit, npm test, npm run build, feature branching with the commit left on the feature branch (never merged into `main` locally and never pushed; `main` takes it through a pull request, see the pull-request bullet above), and Jira updates.
   - User Verification Gates for each block.
   - Final Day-End Build Verification & Pull Requests section (steps A, B, D, E, then F the one push, then C the live checks after the merge), with step A checking each branch stacked in merge order on origin/main, the step B verify loop marked Git Bash only, step D never moving a ticket or an epic to Done (it only comments, creates tickets and proposes Closed, with a pause for my OK), step F ending with a post-merge list of Done transitions that waits for my OK, and step D's log step carried from the rules MOM-133 put in CLAUDE.md and `/day-end` (no nightly "predicted it?", no new RAID rows, the weekly top 5 and the monthly pattern review), including the playbook question, and step D's PM docs upkeep item (MOM-164) carried word for word, and including this instruction in step E.
   - An updated Open Decisions and Risks table.
5. Archive the finished plan first: copy the current `docs/plans/NEXT_BUILD_PLAN.md` to `docs/plans/archive/YYYY-MM-DD.md`, using its own metadata date (create the folder if needed; if that file already exists, add `-2`, `-3` and so on rather than overwrite), and append to the archive a `## Planned versus actual` table, one row per runbook block: block, ticket, planned size, actual build time (the block's `Build time:` line; "not recorded" when it has none, never an estimate) and outcome (done, split with what remains, or carried with why). Then save the generated plan to `docs/plans/NEXT_BUILD_PLAN.md` and run `npm run plan:check -- --strict`; fix the plan until it reports no errors and no warnings. When a block came from a handoff, print it in full after the plan is written so I can check it against the handoff.
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
3. For a branch with a migration (none planned): production `npx supabase db push --dry-run`, then `db push`, then ALL the verify scripts (step B's loop), only after CI is green and your OK, and **before** that pull request merges.
4. Merge each pull request with a merge commit (the GitHub button, or `gh pr merge` after your OK), in the runbook's order, a migration's pull request after its migration is on production. If two pull requests conflict in a shared file, merge `origin/main` into the later branch locally, keep both sides, rerun its checks and push that with your OK.
5. Then update your copy and tidy up (GitHub deletes a merged branch on its side; `git fetch --prune origin` clears the stale copies):

```bash
git switch main
git pull --ff-only
git fetch --prune origin
git branch -d <branch>                              # only -d, for each merged branch; -D is never used
```

6. **Jira: Done transitions, only for what has merged.** For each ticket whose pull request merged in the window (the merge commits `git log <window>..origin/main --merges` shows, which `/day-end` prints, and the `(MOM-n):` commit prefixes), list the proposed transition to "Done" with the ticket's acceptance criteria, each marked met or unmet with its evidence (a test, a commit, a production check, a gate item). A ticket with an unmet criterion or a live gate still pending stays open, with a comment saying what remains. List any epic whose children are now all Done or Closed, with those children. Wait for my OK, then make exactly the transitions I approved and comment what shipped. Never move a ticket to Done before its pull request has merged. A ticket whose owner phone recheck is still pending after the deploy (MOM-170, MOM-171, MOM-172, and MOM-174 if code changed) stays open until it passes. MOM-166 moves to Done only once the owner's deadline-goal save on the phone (Your manual steps 1) has passed; MOM-168 only once its "three days a week" recheck has passed; MOM-111's caching work only once the caching check (Your manual steps 0) has passed.

## C. Live checks (after the last pull request has merged and Vercel has deployed)

```bash
npx vercel ls --prod                                # needs the Vercel CLI (npx works); otherwise check the deployment in the Vercel dashboard. The newest production deployment must reach "Ready"
curl -s -I https://momentum-app-eight-chi.vercel.app/ | grep -iE "^(HTTP|location)"        # 307, with location: /login
curl -s -I https://momentum-app-eight-chi.vercel.app/login | grep -iE "^(HTTP|location)"   # 200
curl -s -I https://app.ownaccordlabs.com/ | grep -iE "^(HTTP|location)"                    # 307, with location: /login (the trial's address; the vercel.app address keeps working)
curl -s -I https://app.ownaccordlabs.com/login | grep -iE "^(HTTP|location)"               # 200
```

These use no output file and no format string. Git Bash rewrites a path such as `/dev/null` for the Windows `curl`, and `MSYS_NO_PATHCONV=1` then makes `curl` fail with a write error, so `-o /dev/null -w` is not used here.

- [ ] Sign in as the standing smoke-test account and walk what changed: the quick path with a goal and no target (MOM-170), "Pick a different date" on your iPhone (MOM-171), the quick path's date field at 390px (MOM-172), and a wrong weekday if MOM-174 changed code (real Claude calls, your call). If the account is at its per-person cap, the quick path's "You've used all 100 of your Claude requests" card says so; wait for calls to age out of the 24-hour window, or check the change in the local browser specs' screenshots instead.
- [ ] One production setup turn shows under the momentum-prod workspace in the Anthropic Console (your dashboard check; if the account is at its cap, a count-only query of the newest `llm_usage_logs` row's time is the other way to see a turn went through).
- [ ] Only the standing smoke-test account exists (`users = 1` in step B, until real users exist). If its data is cluttered, delete and recreate it in the Supabase dashboard (Add user, Auto Confirm); never share or store its password.
- [ ] Walk every item in `docs/plans/.pending-live-checks.md` (the post-push checks the blocks deferred), then clear the items that are done; an item that still waits stays.

---

## Open Decisions and Risks (read before starting)

| Item | Why it matters |
| --- | --- |
| **Prompt caching on production (MOM-111)** | The caching block runs and merges on the night of Nov 2, after that day-end's merges, so Tuesday starts with its check on production: the turn under the momentum-prod workspace in the Console, and `cache_read_tokens` above 0 from the second turn on (a count-only query, with the owner's OK). If it reads 0, the merge is reverted through a pull request before any testing. If the standing account is still at its cap, the check waits for room. |
| **Two test-and-fix days before the freeze** | Tuesday fixes what the owner's 2026-11-02 phone test found (MOM-170, MOM-171, MOM-172, MOM-174), then the owner rechecks on the phone. Wednesday takes whatever Tuesday's testing turns up. A failure found after Wednesday's day-end waits until after the freeze. |
| **The per-person cap and retries (MOM-173, `risk`, High)** | Every try counts toward the 100 calls a person may make in 24 hours: up to 3 per turn, the app-switch resend, Try again, and a resend beside a first turn still retrying. The standing account used 100 of 100 on 2026-11-02. Owner's decision: for the trial the cap stays at 100 and retries still count; the design, any counting change and migration 023 come after the trial. A tester with a bumpy setup may reach the quick path early. |
| **The standing account's cap on Tuesday** | Room returns one call at a time as Monday's calls age out of the 24-hour window, between about 5 am and 5 pm PT Tuesday. Rechecks early in the day may hit the cap card; that is the cap, not a bug. |
| **A quick-path dead end (MOM-170)** | A goal with no target can only be thrown away with Start again. Trial-facing; Tuesday's first block. |
| **The iPhone date wheel (MOM-171)** | A start date is answered with today before the person picks: an assumption about their life. Trial-facing. |
| **Extra detail used (MOM-168)** | Merged on 2026-11-02; the owner's phone recheck ("I want to run three days a week") is its last criterion. Its step 7 behaviour has not been seen live; MOM-175 (h) holds the live run, the owner's call. |
| **Setup words and flow (MOM-167)** | Parts 1 to 3, 8, 9, 11, 14 and 15 are merged; parts 4 to 7, 10, 12, 13 and 16 after Nov 6. |
| **Production freeze** | From Thu 2026-11-05 until after 10:30 am PT Fri 2026-11-06 (the owner's interview): no push, merge, migration or dashboard change in that window. |
| **Old Anthropic keys** | Wednesday evening (owner): retire task-app-prototype and the old momentum-local in the Console after 24 hours with no use. A new production key's expiry is checked before saving (the default was 30 days). |
| **Stay signed in on the phone (MOM-157)** | A trial prerequisite, but the ticket says to build it after the Nov 6 freeze while the trial starts Nov 7. Owner's call: build it Fri Nov 6 afternoon, start the trial with testers signing in each time, or move the trial's start. |
| **Google consent screen (MOM-155)** | In Testing, refresh tokens expire after 7 days and only listed test users can connect. For the trial: stay in Testing, add each tester's Gmail as a test user, and tell them about the weekly reconnect. Verification after Nov 6. |
| **Fake models in tests (F-096)** | The title check broke every production setup while every test passed, because the fake never wrote a sentence. The new standing rule: a fake includes the worst realistic output for the rule under test. The older scripted cases are not yet swept for it (`docs/product/EVALS.md` Gap 10). |
| **The local stack and email templates** | A changed auth config or email template loads only when the local stack restarts (F-091); the standing rule above covers blocks and step A. No block in this plan changes one. |
| **Migration 023** | No block in this plan expects one. MOM-173's counting change or MOM-161 (the database guards for the forecast edits) takes the next free number when scheduled, after the trial starts. Production holds 001 to 022; its verify total was 805 true after 022. |
| **Live checks owed** | The prompt-caching check first (MOM-111); the owner's phone rechecks (MOM-168, MOM-167 part 15 and one deadline goal saved on the phone for MOM-166's Done, today; MOM-170 to MOM-172 after Tuesday's deploy), MOM-165's usage row on the deployed site (10 of the 100 setup rows of 2026-11-02 carried cache tokens), MOM-120's CI log, MOM-132's add-a-goal and MOM-138's forecast edits, MOM-163's wrong-password and long-address checks (see the pending live checks). |
| **The build machine's memory** | The full local browser suite runs out of memory (MOM-141, `risk`). Close what you do not need before heavy steps; CI's `database` job is the full-suite gate; step A runs the changed pages' specs one file at a time. A run the laptop slept through is discarded and run again. |
| **`set_updated_at()` grants** | Executable by the API roles since 001, unlike the trigger functions 012 locked down (MOM-137, `risk`). Low practical risk; not scheduled before the trial. |
| **Stale generated types** | Generated route types outlive a branch switch (F-028, F-039). Until MOM-130 builds it into `/day-start` and `/run-block`, delete `.next/types` and `.next/dev` before the type check and build on a branch you just switched to. |
| **Standing smoke-test account** | `smoke-test@momentum-app.test` exists on production. Every live gate signs in as it; its password stays in your password manager. Production must hold exactly one user at day-end step B. Its goal-model data is created through setup and logging only. |
| **The old model stays until MOM-115** | Home hides its controls (MOM-115's subset). The wizard, rebalance and checkbox criteria keep running, with the completion guard of migrations 002 and 008. The full MOM-115 comes after Nov 6. |
| **Not scheduled, queued with keys** | After Nov 6: MOM-173's design, the rest of MOM-167, MOM-175, MOM-114 (settings, defaults only) and MOM-159 (a week start after setup), MOM-157, MOM-155, MOM-156 (Tue Nov 10), MOM-151, MOM-152, MOM-153, MOM-154, MOM-160, MOM-161, MOM-162, MOM-112's plan-card and headline words, MOM-115, MOM-117, integration hardening (MOM-98, MOM-99, MOM-97, MOM-70). Tooling: MOM-124's items (including the `/run-block` half of its header-390 rule), MOM-130, MOM-127, MOM-141. Security: MOM-137, MOM-119. Deferred: MOM-126 (minors safeguards; the trial is adults only). Follow-ons: MOM-136, MOM-118, MOM-139, MOM-140. Idea: MOM-158. |
| **Risks live in Jira** | Since MOM-133, new risks are Jira tickets with the `risk` label, reviewed as a weekly top 5 at the first day-end of the week (it ran Mon 2026-11-02; 17 open at its third day-end, with MOM-169 Closed and MOM-173 new); `docs/RAID_LOG.md` is frozen history. November's monthly pattern review ran on 2026-11-01 (MOM-92). |
| **Pull requests, not direct pushes** | `main` is protected (MOM-67): every change reaches it through a pull request with `checks` and `database` green, merged with a merge commit. `/run-block` commits on a feature branch and never merges; branches are pushed only with your OK. A production migration is applied before its pull request merges (merging deploys to Vercel). |
