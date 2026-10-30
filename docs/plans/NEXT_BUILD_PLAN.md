# 🚀 MOMENTUM BUILD: NEXT-PHASE MASTER EXECUTION PLAN

> **Date:** 2026-10-30 | **Active Epic:** MOM-105 | **Base Commit:** a9d386c

> **Since the last plan (run on 2026-10-29):** build day 5 of the goal-model thin slice merged every planned block through its own pull request during the day: MOM-96 (the settled-state waits in the jsdom tests, PR #59), MOM-134 (where setup values came from, **migration 017**, PR #60), the weekly review's block 3.2 (the append-only review record and the read-only layer-1 recap at `/review`, **migration 018**, PR #61) and home's week plan and deadline forecast (**migration 019**, PRs #63 and #66). Guided setup also had seven fix rounds from the owner's phone runs and screenshot reviews (MOM-111, PRs #57, #58, #62, #65, #67, #68, #69), and two docs pull requests landed (MOM-117's sheet-source design, PR #56; the career-evidence step at day-end, PR #64). Production after the 2026-10-29 day-end: migrations 001 to 019, every verify script passing (677 checks, 0 failed), exactly one user (the standing smoke-test account). The day-end created MOM-137 to MOM-144, including the app-icon story (MOM-142), the setup-link story (MOM-143) and the PM docs pilot (MOM-144). **This is build day 6, the last of N = 6.** The next free migration number is **020**.

---

## Today's runbook

**How to run a day.** Type `/day-start` first: it only reads and reports. Then type the command in the table below for each block, in this order, and skip any block whose Jira ticket is already Done. Each command first shows the block's model and effort: if your session differs, it stops and tells you the exact `/model` and `/effort` to type (use the session-only choice in the `/effort` slider, so your saved default is left alone), and you start the command again. Run `/clear` between blocks. When the last block is done, type `/day-end`. Nothing is pushed, merged or applied to production without your explicit OK, and work reaches `main` only through a pull request once both CI jobs are green.

| # | Type | Session setting | What to check at the gate |
| --- | --- | --- | --- |
| 0 | `/day-start` | Sonnet / Low | A clean tree, `main` matching `origin/main` with the 2026-10-29 day-end's backlog and plan branches merged (MOM-16, MOM-105), migrations 001 to 019 on production, no leftover branches, the plan passing its format check, no missing environment variable names, and `npm run stack:status` answering in one line. Then the carry-overs in `docs/plans/.pending-live-checks.md`. |
| 1 | `/run-block MOM-111` | Sonnet / Medium | Size M. "How many workouts make a week count" (not "makes"); the quick path's "least you aim for" line in everyday words; idea buttons name the counted thing; the screenshots at 390px; a live run that reaches the number and ideas cards, only after you OK its calls and its $2 cap. |
| 2 | `/run-block MOM-30` | Sonnet / Medium | Size M. You approved the light palette before code; with no choice made the app follows the device; every screen reads at AA contrast in both themes; no flash of the wrong theme; screenshots at 390px and 1280px in both themes. |
| 3 | `/run-block MOM-142` | Sonnet / Low | Size S. The icon, the apple-icon and the manifest come from the logo mark; the routes exist (a test); you add the deployed site to a phone's home screen after the push. |
| 4 | `/run-block MOM-143` | Sonnet / Medium | Size S. A person who has not finished setup reaches it from home without typing an address; a person whose setup is saved is never offered a second one; browser tests at 390px and 1280px. |
| 5 | `/run-block MOM-113` | Sonnet / High | Size L, may split. You approved layer 2's prompt fields, its budget and the finish flow before code; every live call waited for your OK and its cost; the finished review is stored once; Claude writes words only, never a number. |
| 6 | `/run-block MOM-122` | Sonnet / High | Size M. You set the custom sender in the Supabase dashboard yourself (no credential in the repo, a log or this session); the reset-link decision is recorded on the ticket; any template or callback change has tests on the local stack. |
| 7 | `/run-block MOM-123` | Sonnet / Low | Size S. You walked sign-up, confirmation, sign-out and password reset on production with a disposable address, deleted it in the dashboard, and the count is back to one user. |
| 8 | `/run-block MOM-131` | Sonnet / Medium | Size S. At 390px with a long address no signed-in page scrolls sideways (home and `/connections`); a screen reader still hears the full address. |
| 9 | `/run-block MOM-144` | Sonnet / Medium | Size M. Last, and it moves to day 7 if the day runs long. The four docs exist, drawn from the repo and this week's findings; the review note links the deck and copies its numbers exactly. |
| 10 | `/day-end` | Opus / High | The day's branches pass their checks; any migration (020, only if MOM-113 3.3 adds one) is applied to production at step F after CI is green and your OK, before its pull request merges, with every verify script after it; this is not the week's first day-end. |

If a block needs another ticket's code, `/run-block` checks that code is already in `origin/main`. If it is only on an unmerged branch, it stops and offers two ways forward: push that branch and merge its pull request first, or stack this block on that branch (only with your OK). **Every block in this plan needs the 2026-10-29 day-end's pull requests merged** (the backlog and plan branches). Block 7 (MOM-123) works best after block 6 (MOM-122): the built-in sender's hourly cap can block the walk's second email. No other block needs another block of this plan.

---

## Executive Overview & Architectural Invariants

Build day 6 is the last day of the thin slice before the family trial. It starts with what a tester sees first: setup's last wording fixes and a live run that reaches the number and ideas cards (MOM-111), a light theme that follows the device (MOM-30), a home-screen icon (MOM-142) and a way back into setup (MOM-143). Then the weekly review's Claude block, layer 2's reflection offer with its own budget, layer 3's choice and the finished review (MOM-113 block 3.3); the trial's auth prerequisites (MOM-122 custom sender, MOM-123 the production sign-up walk); the 390px header (MOM-131); and last, the PM docs pilot (MOM-144), which moves to day 7 if the day runs long.

`docs/DOMAIN_MODEL.md` is binding for all new code. The old model stays in the code until MOM-115 retires it, so new code is built beside the old tables, never into them. Every block preserves these invariants:

1. **Claude never scores.** The engine (`lib/engine/`) computes every number from entries and the target in force; no Claude output is stored as a number, and setup's draft is validated by code, not by Claude (DOMAIN_MODEL §1.7, principle 9). The weekly review's recap and its one adjustment come from the engine; layer 2's words come from Claude and carry no number.
2. **The person's word beats any source.** A manual entry or correction always wins over a sync; corrections are keyed to the source's own record id, so a resync never undoes them (§1.5, §1.6).
3. **Never assume anything about a person's life.** Time zone, week start and day end are the person's to set; the week plan never computes free time or picks a slot (principle 12); a suggestion the person took at setup is a starting point, checked at their first review (§2.1 rule 4).
4. **Unfinished work moves, habits never carry over.** (§1.4, principle 11.)
5. **Service-layer RLS enforcement.** The UI never queries Supabase. Every read and write of the new tables goes through `lib/services/`; every new table has row level security keyed to its owner, explicit grants and an entry in `supabase/verify/900_table_grants.sql`'s allow-list.
6. **The old model's guards stay until MOM-115.** The completion guard (migrations 002 and 008) and the append-only `task_rebalance_history` keep protecting the old tables; nothing today edits an applied migration or an old table.
7. **Nothing is saved until final approval** in setup, every Claude call goes through `lib/services/llm.ts`, and a Claude call sends only the fields the privacy notice lists (pinned by a test, as `tests/setup-prompt-fields.test.ts` does for setup).
8. **A stored record of what was said is never rewritten** (RAID R-26): a late entry changes a week's live reading, never a stored recap silently.
9. **Plain words** (DOMAIN_MODEL §2.1): everyday words with a reason, the person's own words restated, a way out of every change, "what do you mean?" always answered. A review comment becomes a shared rule or component with a test that sweeps every screen, never a fix on the one screen named.

## Standing Rules (every prompt below repeats what it needs)

- **Read the Jira ticket first.** If its title, scope or acceptance criteria disagree with the prompt, or the prompt disagrees with `docs/DOMAIN_MODEL.md`, stop and flag it.
- **Production changes need your approval.** A prompt stops before `supabase db push`, `vercel env`, or any push to `origin`, shows what will happen, and waits. Never use the SQL Editor. Tests never run against production and never use production credentials.
- **Database checks are not part of `npm test`.** They live in the SQL scripts in `supabase/verify/` and run with `npm run verify:sql` (local stack) or, against production, with the step B loop. After any migration, or any change to a verify script, run **all** of them; every row must show `passed = true`. A local total is not a production total: one script has checks that run only on production (RAID R-16, failure-log F-027).
- **New migrations use the numbers this plan assigns:** MOM-113 may take **020**, only if its design stop shows it is needed and you approve it. No other block adds a migration. Never edit an applied migration.
- **Pull requests, not local merges.** `main` is protected: work reaches it only through a pull request with the CI jobs `checks` and `database` green, merged with a merge commit (CLAUDE.md). A block commits on its feature branch and stops: it never merges into `main` and never pushes. Branches are pushed only with your explicit OK (normally once, at day-end step F).
- **A migration is applied before its pull request merges.** A block with a migration runs `npm run verify:sql` locally, shows the migration and `npx supabase db push --dry-run`, and stops. At day-end step F, once CI is green on its pull request and you say OK, the production `db push` and then ALL the verify scripts run, before that pull request merges (merging deploys to Vercel, and the new code needs the new schema).
- **Blocks never edit `BACKLOG.md`.** A block's backlog notes, new gaps and follow-ups go in its Jira comment and its close-out; day-end step D writes `BACKLOG.md` once, on its own branch.
- **Is the local stack up?** Ask it with `npm run stack:status` (it prints only "Local Supabase stack: running" or "Local Supabase stack: not running"). Never run `supabase status` unfiltered: its output holds the local stack's keys (failure log F-047, F-049, F-051, F-057, F-059), and `.claude/settings.json` denies it.
- **Logs (MOM-133).** A failure-log entry is written only when it leads to a fix made that session, a new standing rule or a Jira ticket, and names which; it is marked `unreviewed` until the day-end. `docs/RAID_LOG.md` is frozen: a new risk, assumption, issue or dependency becomes a Jira ticket with the `risk` label.
- **Claude calls cost money.** `npm test` never calls Claude: model calls in tests go through a fake. A block that wants a live Claude call (an eval run, a prompt check) says how many calls and the cost cap and stops for your OK first, and it is logged through `lib/services/llm.ts`. Blocks 1 (MOM-111) and 5 (MOM-113) plan live calls.
- **Screens are looked at, not only tested** (failure log F-067). A block that changes a screen saves screenshots of every changed screen at 390px (and 1280px where the layout changes) and shows them to you before it commits. A test that compares dates also runs once with the browser's clock across a day boundary from the person's (F-069).
- **Stale generated types.** Generated route types under `.next/` outlive a branch switch (failure log F-028, F-039). Until MOM-130 builds it into the commands, delete `.next/types` and `.next/dev` (both git-ignored and regenerated) before `npx tsc --noEmit` or `npm run build` on a branch you just switched to.
- **The full browser suite and memory.** The full local `npm run test:e2e` ran out of memory twice on 2026-10-29 (MOM-141). If it dies, run the specs the block touched one at a time, say so in the close-out, and treat CI's `database` job as the full-suite gate.
- **Standing smoke-test account.** Production keeps ONE standing test account, `smoke-test@momentum-app.test`, created by you in the Supabase dashboard (Authentication → Add user, Auto Confirm User on). Its password lives only in your password manager: Claude never asks for it, prints it or stores it in the repo, and never creates, edits or deletes users on production. Every live sign-in check in this plan says "sign in as the standing smoke-test account". Claude may read its data with **count-only** queries. If its data gets cluttered, you delete and recreate it in the dashboard (it starts empty). The SQL verify scripts create and delete their own passwordless temporary users and leave none behind, and since MOM-121 every insert, update and delete in them is limited to those users (writes made through function calls are MOM-127, not yet built). Production should always hold exactly one user (block 7's MOM-123 walk adds a disposable second account, by you, and you delete it before the day-end). The standing account's goal-model data is created only through the app (setup, logging), never seeded by hand. Browser tests use throwaway users on the **local** stack only.
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
SESSION 1: WHAT A TESTER SEES FIRST (MOM-111, MOM-30, MOM-142, MOM-143)   thin slice, build day 6 of 6
  - Setup's last wording fixes and a live run that reaches the number and ideas cards
  - Light mode that follows the device
  - A home-screen icon
  - A way back into setup from home
SESSION 2: THE REVIEW'S CLAUDE BLOCK AND THE TRIAL PREREQUISITES (MOM-113, MOM-122, MOM-123, MOM-131)
  - Layer 2's reflection offer, layer 3's choice and the finished review (020 if needed)
  - A custom auth email sender, and the reset-link decision
  - The production sign-up walk with a disposable account
  - The 390px header
SESSION 3: PM DOCS PILOT (MOM-144)
  - User journeys, PRD, evals and the first product review note
```

*Order is the owner's (2026-10-29 day-end). Session 1 is small, visible work that testers meet first; the weekly review's Claude block (L) follows; MOM-122 comes before MOM-123 because the custom sender lifts the hourly email cap the walk needs. The PM docs pilot is last and never bumps light mode or the icon; if day 6 runs long it moves to day 7. Safe stopping points: after each block. Anything unfinished goes first on day 7.*

---

# SESSION 1: WHAT A TESTER SEES FIRST

**Your prerequisites before this session:** (1) The 2026-10-29 day-end's backlog and plan pull requests are merged; `/day-start` shows it. (2) Docker Desktop running and the local stack started (`npx supabase start`; `npm run stack:status` says running) for block 1's browser tests and live run. (3) Be ready to OK block 1's live run (about 20 calls, $2 cap) and to approve block 2's light palette.

## Block 1.1: Setup's Last Wording Fixes and a Live Run to the Number Cards (MOM-111)

* **Objective & Scope:** Size M (about 40 to 70 minutes after your design OK). Three wording fixes from the owner's review of round 3c, each in the shared builder every card uses, then one live run. (a) The number question reads "How many pages makes a week count, even a hard one?": the verb must agree ("make"), in `lib/setup/numbers.ts` and every copy of the example (`lib/setup/steps.ts`, `lib/setup/feedback.ts`, the comments in `lib/setup/optionsLead.ts`, the eval cases). (b) The quick path's missing-fact line "The least you aim for with <name>." (`lib/setup/quickPath.ts`) says what the number is for in the same everyday words as the wording builder. (c) Idea buttons for a number ("At least 2 a week", "Aiming for 3 a week") name the counted thing in the person's words. (d) A live run of the owner's path that reaches the number and ideas cards, with the $2 cap (round 3b's $1 cap stopped before them).
* **Core Invariants to Protect:** *Plain words*: one shared builder, a sweep test over every step and card, never a one-screen fix. *Claude never scores*. *Live calls cost money*: the run waits for your OK, its call count and its cap.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-111, setup's last wording fixes: number questions with the right verb, the quick path's missing-fact line in everyday words, idea buttons that name the counted thing, and a live run that reaches the number and ideas cards.

Task Instructions:
1. Read ticket MOM-111 in Jira first, with its 2026-10-29 comments (rounds 3, 3b and 3c). Its acceptance criteria are the definition of done for the whole ticket; this block covers part of them. If they, these instructions and docs/DOMAIN_MODEL.md §2.1 disagree, stop and flag it.
2. Read CLAUDE.md, docs/DOMAIN_MODEL.md §2.1 (the plain-language principle and its change log), lib/setup/numbers.ts, lib/setup/optionsLead.ts, lib/setup/plainCard.ts, lib/setup/quickPath.ts, lib/setup/steps.ts, lib/setup/feedback.ts, lib/setup/checks.ts, components/setup/QuestionCard.tsx, components/setup/QuickPathCard.tsx, components/setup/cardText.tsx, tests/setup-everyday-words.test.tsx, tests/setup-round3c.test.tsx, tests/e2e/setup-cards.spec.ts and tests/live/setup-round3.live.ts. Check the local stack with `npm run stack:status`; never run `supabase status` unfiltered.
3. Create the feature branch `feature/MOM-111-setup-words-and-live-run` off an up-to-date `main`.
4. Design before editing, then STOP for my OK: (a) every place the number question's wording is built or quoted, and the fix for each (the verb agrees with the counted thing: "How many pages make a week count", "How many workouts make a week count"; a singular counted thing keeps "makes"); (b) the quick path's new line for a missing floor, in the wording builder's words, and whether the other missing-fact lines in `lib/setup/quickPath.ts` need the same treatment; (c) the idea buttons' new wording for the fewest and the aim ("At least 2 workouts a week", "Aiming for 3 workouts a week"), where it is built, and how it stays short at 390px; (d) the sweep tests that pin all three across every scripted case and step; (e) the live run: which file (tests/live/setup-round3.live.ts or a copy for this round), how it reaches the number and ideas cards, the expected number of calls, and the cap ($2, `MOM111_MAX_COST_USD`). Wait for my answer.
5. Edit as approved, in the shared builders. Keep each rule in one place.
6. Tests: the sweep tests from step 4(d); the existing setup tests updated only where the wording itself changed (no assertion loosened). `npm test` makes no network call.
7. Run `npx tsc --noEmit`, `npm test`, `npm run build`, and the setup browser specs (`npx playwright test tests/e2e/setup.spec.ts tests/e2e/setup-cards.spec.ts`; stop `npm run dev` first; reset the local database first). Save the screenshots of every changed card at 390px and show them to me before you commit.
8. The live run: only after my OK in step 4 and again right before it starts (say the calls and the cap). Local stack, throwaway account, real model through `runCheckedTurn()`. Report turns, calls, cost, thrown-away replies by code, and whether the number and ideas cards showed the new wording. If it stops at the cap before the number cards, say so; do not raise the cap without my OK.
9. Do not edit BACKLOG.md. Put backlog notes in the Jira comment and the close-out. Say "Privacy impact" in the close-out (no new field is sent to Claude unless the design says so). Comment on MOM-111 with the approved design, what changed, the live run's numbers, and each acceptance criterion met, partly met or not started; do not move it to Done.
10. Commit with "feat(MOM-111): number questions, the quick path and idea buttons in everyday words". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes (with no network call); the setup browser specs pass at 390px and 1280px; screenshots shown before the commit; the live run made only with my OK; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] You approved the wording, the sweep tests and the live run's calls and cap before any edit.
  - [ ] "How many workouts make a week count" reads right on the card (the screenshot), and a singular counted thing still reads right.
  - [ ] The quick path's line and the idea buttons name what the number is for and what is counted (the screenshots at 390px).
  - [ ] The live run stayed under $2 and reached the number and ideas cards, or the close-out says where it stopped.

---

## Block 1.2: Light Mode That Follows the Device (MOM-30)

* **Objective & Scope:** Size M (about 40 to 70 minutes after your design OK). The app is dark only (`app/globals.css` sets `color-scheme: dark`). Add a light palette with the same tokens and make the theme follow `prefers-color-scheme` by default, so a phone set to automatic switches Momentum with it. An optional light / dark / system choice is in the ticket; build it only if you approve it at the design stop (a cookie, so the server renders the right theme with no flash). Every screen reads at WCAG AA contrast in both themes, the lime accent included.
* **Core Invariants to Protect:** *Never assume*: no time-of-day logic; the device decides unless the person chooses. *No hydration warnings*. *Screens are looked at*: screenshots of every main screen in both themes.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-30: a light palette, and a theme that follows the device by default.

Task Instructions:
1. Read ticket MOM-30 in Jira first. Its acceptance criteria are the definition of done. If they and these instructions disagree, stop and flag it.
2. Read CLAUDE.md, app/globals.css (the design tokens and `color-scheme: dark`), app/layout.tsx, components/layout/ (AppShell, MobileHeader, WorkspaceSidebar, NavSidebar), components/home/, components/setup/cardText.tsx and components/setup/SetupAlert.tsx (the amber alert), and the browser specs in tests/e2e/ that check layout at 390px. Check the local stack with `npm run stack:status`; never run `supabase status` unfiltered.
3. Create the feature branch `feature/MOM-30-light-mode` off an up-to-date `main`.
4. Design before coding, then STOP for my OK: (a) the light palette, token by token, with each text-on-background pair's contrast ratio (AA: 4.5:1 for body text, 3:1 for large text and controls), and how the lime accent stays legible on light; (b) how the theme follows the device (`prefers-color-scheme` in CSS, `color-scheme: light dark`), with no script needed for the default; (c) whether to build the light / dark / system choice now (a cookie read on the server, so no flash), where it lives (settings), and your recommendation; (d) every hard-coded color outside the tokens that would break in light (a search, file and line); (e) the screenshots you will take (home, setup, /plan, /review, /connections, sign-in, at 390px and 1280px, in both themes). Wait for my answer.
5. Build as approved. Replace hard-coded colors with tokens; do not change the dark palette's values.
6. Tests: a unit test that every token has a light and a dark value; a contrast test over the approved text-on-background pairs in both themes; a browser spec at 390px and 1280px that emulates light and dark (`colorScheme`) and finds no hydration warning; if the choice was approved, a test that it survives a reload with no flash. `npm test` makes no network call.
7. Run `npx tsc --noEmit`, `npm test`, `npm run build` and `npm run test:e2e` (stop `npm run dev` first; reset the local database first). Show me the screenshots from step 4(e) before you commit.
8. No live Claude call in this block.
9. Do not edit BACKLOG.md. Put backlog notes in the Jira comment and the close-out. Say "Privacy impact" in the close-out (a theme cookie, if built, holds only the choice). Comment on MOM-30 with the approved design, what changed, each acceptance criterion met or unmet and how verified; do not move it to Done.
10. Commit with "feat(MOM-30): add a light palette and follow the device's theme". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes (with no network call); npm run test:e2e passes; screenshots in both themes shown before the commit; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] You approved the light palette, its contrast ratios and the choice (or no choice) before any code.
  - [ ] With no choice made, the app follows the device and switches when the device does (the browser spec, and your phone after the push).
  - [ ] Every main screen reads clearly in both themes at 390px and 1280px (the screenshots), the amber alert and the lime accent included.
  - [ ] No flash of the wrong theme and no hydration warning.

---

## Block 1.3: A Home-Screen App Icon (MOM-142)

* **Objective & Scope:** Size S (about 20 to 40 minutes after your design OK). Testers will add Momentum to a phone's home screen. There is no app icon, apple-icon or web manifest today (no `public/` folder, nothing in `app/`), so the phone shows a generic tile. Make all three from the logo mark the header already draws (`components/layout/MobileHeader.tsx`, `components/layout/WorkspaceSidebar.tsx`), with the Next.js App Router file conventions.
* **Core Invariants to Protect:** *No new runtime dependency* unless the design stop approves one. *The repo is public*: the manifest names the app and its colors, nothing else.
* **CLI Session Config:** Model: Sonnet | Effort: Low

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-142: a home-screen app icon, an apple-icon and a web manifest from the logo mark.

Task Instructions:
1. Read ticket MOM-142 in Jira first. Its acceptance criteria are the definition of done. If they and these instructions disagree, stop and flag it.
2. Read CLAUDE.md, app/layout.tsx (the metadata), components/layout/MobileHeader.tsx and components/layout/WorkspaceSidebar.tsx (the logo mark), app/globals.css (the colors) and the Next.js docs in node_modules/next/dist/docs/ for the app icon, apple-icon and manifest file conventions.
3. Create the feature branch `feature/MOM-142-app-icon` off an up-to-date `main`.
4. Design before coding, then STOP for my OK: (a) the files (static images, or `icon.tsx` / `apple-icon.tsx` generated with `next/og`, and `manifest.ts`) and why; (b) the icon at each size, how it reads on a dark and a light home screen, and a preview image of each; (c) the manifest's name, short name, colors, start URL and display mode. Wait for my answer.
5. Build as approved. No new runtime dependency unless approved.
6. Tests: a test that the icon, apple-icon and manifest routes exist and the manifest has the approved fields; `npm run build` lists the routes. `npm test` makes no network call.
7. Run `npx tsc --noEmit`, `npm test` and `npm run build`; show me the icon previews before you commit.
8. Add to docs/plans/.pending-live-checks.md: `- [ ] MOM-142: after the deploy, add the site to an iPhone's and an Android phone's home screen; the Momentum icon and name show`.
9. No live Claude call in this block.
10. Do not edit BACKLOG.md. Put backlog notes in the Jira comment and the close-out. Say "Privacy impact: none" in the close-out. Comment on MOM-142 with what changed and each acceptance criterion met or unmet; do not move it to Done.
11. Commit with "feat(MOM-142): add a home-screen icon, an apple-icon and a web manifest". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes; npm run build passes and lists the routes; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] You approved the icon previews and the manifest's fields before any code.
  - [ ] The test pins the three routes, and the build lists them.
  - [ ] After the push, the icon and name show on a phone's home screen (the pending live check).

---

## Block 1.4: A Link Back to Setup (MOM-143)

* **Objective & Scope:** Size S (about 20 to 40 minutes after your design OK). A person who left setup can get back to it only by typing `/setup`. Give them a way back from home (or settings) while their first setup is not finished, in plain words. Setup is first-setup-only (migration 015's save refuses a second one, until MOM-132), so a person whose setup is saved is never offered a second one. This takes over item (c) of MOM-112's first-block follow-ups.
* **Core Invariants to Protect:** *Service-layer RLS*: the "has this person finished setup?" read goes through `lib/services/`. *Plain words*. *Never assume*: no nudge that pressures; one calm link.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-143: a link back to setup from inside the app.

Task Instructions:
1. Read ticket MOM-143 in Jira first. Its acceptance criteria are the definition of done. If they and these instructions disagree, stop and flag it.
2. Read CLAUDE.md, docs/DOMAIN_MODEL.md §2 (setup) and §4.1 (tone), app/page.tsx, app/setup/, app/settings/page.tsx, components/layout/ (NavSidebar, MobileHeader, GoalBuilderBanner), components/home/, lib/services/setup.ts (how a finished first setup is known), tests/e2e/home.spec.ts and tests/e2e/setup.spec.ts. Check the local stack with `npm run stack:status`; never run `supabase status` unfiltered.
3. Create the feature branch `feature/MOM-143-setup-link` off an up-to-date `main`.
4. Design before coding, then STOP for my OK: (a) where the link shows (home, settings, the navigation) and its words; (b) how the app knows a first setup is finished (the service read, and what it costs per page load); (c) what a person with a setup in progress sees (the link resumes it) and what a person whose setup is saved sees (nothing about setup, or a plain line that it is done); (d) the screens at 390px and 1280px. Wait for my answer.
5. Build as approved.
6. Tests: the service read against the in-memory fake (no setup, in progress, saved; one person never reading another's); component tests for each state; a browser spec at 390px and 1280px that reaches setup from home without typing the address, and finds no link after a saved setup. `npm test` makes no network call.
7. Run `npx tsc --noEmit`, `npm test`, `npm run build`, and the home and setup browser specs (stop `npm run dev` first; reset the local database first). Show me the screenshots of the changed screens at 390px before you commit.
8. No live Claude call in this block.
9. Do not edit BACKLOG.md. Put backlog notes in the Jira comment and the close-out. Say "Privacy impact: none" in the close-out unless the design adds a stored fact. Comment on MOM-143 with the approved design, what changed and each acceptance criterion met or unmet; do not move it to Done.
10. Commit with "feat(MOM-143): link back to setup from home until the first setup is saved". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes (with no network call); the home and setup browser specs pass at 390px and 1280px; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] You approved where the link shows and its words before any code.
  - [ ] A person with no finished setup reaches setup from home without typing an address (the browser spec).
  - [ ] A person whose setup is saved is not offered a second one (read the test).

---

# SESSION 2: THE REVIEW'S CLAUDE BLOCK AND THE TRIAL PREREQUISITES

**Your prerequisites before this session:** (1) MOM-113's block 3.2 is in `origin/main` (merged 2026-10-29 as PR #61, with migration 018 on production). (2) The local stack running with `main`'s migrations. (3) For MOM-122: an email provider account and a sender address you control, set up by you in the provider's and Supabase's dashboards (Claude never sees the credentials). (4) For MOM-123: a disposable email address you can read, and time for a walk on production with no other production change that day. (5) Be ready to OK MOM-113's live calls and their cost.

## Block 2.1: The Weekly Review, Third Block: Layer 2, Layer 3's Choice and the Finished Review (MOM-113)

* **Objective & Scope:** Size L (70 minutes or more after your design OK; it may split, and a split stops at a committed, green point). Block 3.3 as listed at the end of block 3.2: layer 2's one-line reflection offer, written by Claude through `lib/services/llm.ts` with its own budget (the usage log already accepts `weekly_review`, migration 018); layer 3's presentation and the person's choice (change, decline or skip); the finish button that calls `recordFinishedReview` once; and week planning in the same sitting (a link into `/plan`) or split by setting, as you decide. Claude writes words only: no number, no score, no celebration paired with a request. Every field sent to Claude is listed in the privacy notice and pinned by a test. Migration **020** only if the design needs one and you approve it.
* **Core Invariants to Protect:** *Claude never scores*. *A stored record is never rewritten* (R-26). *Live calls cost money*: each live call waits for your OK and its cost. *Plain words* (the round 3c rules apply to the review's cards too).
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-113, block 3.3: layer 2's reflection offer, layer 3's choice and the finished weekly review.

Task Instructions:
1. Read ticket MOM-113 in Jira first, with all its comments (especially the 2026-10-29 block 3.2 close-out and its "Still to do"). Its acceptance criteria are the definition of done for the whole ticket; this block covers part of them. If they, these instructions and docs/DOMAIN_MODEL.md disagree, stop and flag it.
2. This block needs block 3.2 in origin/main: check `git log origin/main --oneline --grep="(MOM-113):" -n 3` shows "store a finished weekly review and show the layer-1 recap". If it is missing, stop.
3. Read CLAUDE.md, docs/DOMAIN_MODEL.md (§3 in full, §4.1 tone and celebrations, the plain-language principle in §2.1, the principles), docs/LLM_GOVERNANCE.md, lib/services/llm.ts (`runSetupTurn` and the limits, the pattern to follow), lib/config/privacy.ts and tests/setup-prompt-fields.test.ts (how prompt fields are pinned), lib/engine/review.ts, lib/services/review.ts, lib/services/reviewRecords.ts (`recordFinishedReview`), lib/services/reviewRecap.ts, app/review/page.tsx, components/review/, components/home/ReviewNotice.tsx, types/review.ts, supabase/migrations/018_weekly_reviews.sql, tests/review-service.test.ts and tests/e2e/review.spec.ts. Check the local stack with `npm run stack:status`; never run `supabase status` unfiltered.
4. Create the feature branch `feature/MOM-113-review-sitting` off an up-to-date `main`.
5. Design before coding, then STOP for my OK: (a) layer 2: the prompt's fields one by one (each needed or not, nothing the privacy notice does not list), the reply's shape (one line, no number, checked by code before it is shown, with one retry and then a code-written fallback), and when it is offered (§3.1); (b) the budget: calls per review, tokens, per-person and shared caps, what happens when a limit is hit (the review goes on without layer 2); (c) layer 3: how the one engine-picked adjustment is shown, the three outcomes, and what "change" does for each of the six kinds (the kinds that can act today and the ones that only record the choice); (d) the finish: one button, `recordFinishedReview` called once, the "already reviewed" state after; (e) week planning in the same sitting or split by setting, with your recommendation; (f) whether `lib/services/review.ts` should now hand the engine the deadline forecasts (BACKLOG MOM-113 follow-up (a): it changes what Claude is told, so it needs my OK either way); (g) migration 020 if needed, or why none; (h) the live calls you want (how many, which cases, the cost cap); (i) the split point if the block runs long, and what remains after (3.4 and its size). Wait for my answer.
6. Build only the approved slice. If migration 020 was approved: write it and supabase/verify/020_<name>.sql (with checks that can fail), add any new table to 900_table_grants.sql's allow-list, run `npx supabase db reset --local` and `npm run verify:sql`, show me the migration and `npx supabase db push --dry-run`, and stop. Say plainly: the production push and then ALL the verify scripts run at day-end step F, after CI is green on this branch's pull request and I say OK, and before this pull request merges. Add to docs/plans/.pending-live-checks.md: `- [ ] MOM-113 (020): after the push, production supabase db push for migration 020, then every verify script, before the pull request merges`.
7. Tests: the layer-2 call through a fake (the reply checked; a number or a request refused; the fallback after one retry; the budget's stops); a prompt-fields test pinning every field sent to Claude against lib/config/privacy.ts; the service against the in-memory fake (finish writes once, a second finish refused, each layer-3 outcome stored, one person never reading another's); component tests for each state; a browser spec at 390px and 1280px for the whole sitting with the fake model. `npm test` makes no network call.
8. Live calls: only the ones approved in step 5(h), each announced with its count and cap right before it runs, logged through lib/services/llm.ts on the local stack.
9. Run `npx tsc --noEmit`, `npm test`, `npm run build` and `npm run test:e2e` (stop `npm run dev` first; reset the local database to this branch's migrations first), and `npm run verify:sql` if a migration was added; all must pass, with no server error in the e2e output other than the known lines (the wizard spec's two 401 lines and the Hevy "no bound target" spec's `no_source` lines). Show me the screenshots of every changed screen at 390px before you commit.
10. Stop at a committed, green point and list what remains for MOM-113 (3.4 and anything this block found), with sizes. The ticket stays open unless every acceptance criterion is met.
11. Do not edit BACKLOG.md. Put backlog notes in the Jira comment and the close-out. Say "Privacy impact" in the close-out (new fields sent to Claude, and the notice's new line). Comment on MOM-113 with the approved design, what changed, the live calls' numbers, each acceptance criterion met, partly met or not started, and how verified; do not move it to Done.
12. Commit with "feat(MOM-113): add layer 2's reflection offer, layer 3's choice and the finished review". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes (with no network call); npm run test:e2e passes; npm run verify:sql passes locally if a migration was added; live calls made only with my OK; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] You approved layer 2's fields, the budget, layer 3's outcomes, the finish and the planning choice before any code.
  - [ ] Claude's line carries no number and no request; a reply that does is refused (read the test).
  - [ ] Every field sent to Claude is in the privacy notice, pinned by a test.
  - [ ] A finished review is stored once; each layer-3 outcome is stored for kill criterion 4.
  - [ ] Every live call waited for your OK and stayed under its cap.
  - [ ] If migration 020 was added: you saw it and the dry run, and nothing was pushed.

---

## Block 2.2: Auth Email for the Trial (MOM-122)

* **Objective & Scope:** Size M (about 40 to 70 minutes after your design OK, plus your dashboard time). Two auth email limits (RAID I-06, R-18). (1) The built-in mailer's hourly cap is shared by sign-up confirmations and password resets for the whole project; you set up a custom SMTP sender in the Supabase Auth settings yourself (provider account, sender domain, credentials only in the dashboard), and the block re-checks the limit with you. (2) The reset link (like the sign-up confirmation) works only in the browser that asked for it; decide at the design stop whether to keep that for the trial or switch the reset email to a token link (template change in the dashboard plus a verify step in `app/auth/callback/reset`), with tests on the local stack.
* **Core Invariants to Protect:** *No credential* in the repo, the browser, a log or this session. *Production changes need your approval*: Claude changes no dashboard setting; it tells you each step. *Tests never run against production.*
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-122: a custom auth email sender for the trial, and the reset-link decision.

Task Instructions:
1. Read ticket MOM-122 in Jira first. Its acceptance criteria are the definition of done. If they and these instructions disagree, stop and flag it.
2. Read CLAUDE.md, app/auth/callback/route.ts, app/auth/callback/reset/, the sign-in and reset components in components/auth/, supabase/config.toml (the local auth email settings) and tests/e2e/password-reset.spec.ts. Never print, ask for or store a credential; never run `supabase status` unfiltered.
3. Create the feature branch `feature/MOM-122-auth-email` off an up-to-date `main`.
4. Design before any change, then STOP for my OK: (a) the custom sender: the dashboard steps I take (Supabase → Authentication → SMTP settings, the sender address and name, the rate limit page), in order, with nothing for you to type; (b) the reset link: keep the same-browser link for the trial, or switch to a token link (the template text for the dashboard, the verify step in the callback, what happens to an expired or reused link), with your recommendation; the same question for the sign-up confirmation; (c) the tests on the local stack for any code change. Wait for my answer.
5. I do the dashboard steps. Wait until I say they are done; then ask me to read the new hourly limit from the dashboard and record it (a number only).
6. If the token link was approved: build the callback change and the template text, with unit tests and a browser spec on the local stack (a link opened in a second browser context works; an expired or reused link shows the plain-words expired message). `npm test` makes no network call.
7. Run `npx tsc --noEmit`, `npm test`, `npm run build`, and the auth browser specs (stop `npm run dev` first).
8. Add to docs/plans/.pending-live-checks.md: `- [ ] MOM-122: after the deploy (and the dashboard template change if approved), ask for a password reset on one device and open the link on another; it works, or the same-browser decision stands`.
9. No live Claude call in this block.
10. Do not edit BACKLOG.md. Put backlog notes in the Jira comment and the close-out. Say "Privacy impact" in the close-out (the email provider becomes a processor of sign-up and reset emails; /privacy needs a line). Comment on MOM-122 with the decision, the dashboard steps done (no credential), the new limit, and each acceptance criterion met or unmet; do not move it to Done.
11. If code or the privacy line changed, commit with "feat(MOM-122): use a custom auth sender and record the reset-link decision". If nothing in the repo changed, say so and make no commit. Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes (with no network call); any changed auth browser spec passes; no credential anywhere in the repo or the session; committed with the type(MOM-X) format on the feature branch if anything changed, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] You set the custom sender yourself, and the new hourly limit is recorded on the ticket.
  - [ ] The reset-link decision is recorded on the ticket.
  - [ ] No credential is in the repo, a log or this session.
  - [ ] Any code change has tests on the local stack; `/privacy` names the email provider.

---

## Block 2.3: Walk Sign-Up and Password Reset on Production (MOM-123)

* **Objective & Scope:** Size S (about 20 to 40 minutes, almost all yours). Real sign-up, the email confirmation and the password reset are tested on the local stack only. You walk them once on production with a disposable address: sign up, confirm from the email, sign out, ask for a reset, set a new password from the link, sign in with it, check the old password is refused. You delete the disposable account in the Supabase dashboard straight after, and the block confirms the count is back to one user with a count-only query. Best after block 2.2 (the custom sender lifts the hourly cap).
* **Core Invariants to Protect:** *Claude never sees the disposable address or its password*, and never creates, edits or deletes a user on production. *One user on production* at the end.
* **CLI Session Config:** Model: Sonnet | Effort: Low

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Run MOM-123: guide the owner's production walk of sign-up, confirmation and password reset with a disposable account, then confirm production is back to one user.

Task Instructions:
1. Read ticket MOM-123 in Jira first. Its acceptance criteria are the definition of done. If they and these instructions disagree, stop and flag it.
2. Check that no other production change is planned for today after this point (no migration waiting at step F other than 020), and that MOM-64 is merged and deployed. Read app/auth/callback/route.ts and the sign-in and reset components in components/auth/ so you can explain each screen.
3. Print the walk as a numbered checklist for me, one step per line, with what I should see at each step in plain words: sign up a disposable address on https://momentum-app-eight-chi.vercel.app/login; confirm it from the email; sign out; ask for a password reset; set a new password from the link; sign in with it; check the old password is refused. Never ask for the address or a password.
4. Wait for me to report each step as worked or not (no address, no password). For any step that did not work, record what I saw and stop: a fix is its own branch and needs my OK.
5. Ask me to delete the disposable account in the Supabase dashboard (Authentication → Users). When I say it is done, run the count-only query `npx supabase db query --linked -o table "select count(*) as users from auth.users"` and confirm it shows 1.
6. No live Claude call in this block.
7. Do not edit BACKLOG.md. Comment on MOM-123 with each step worked or not (no address or password), the count after, and each acceptance criterion met or unmet; do not move it to Done.
8. Nothing in the repo changes in a clean walk, so there is no branch and no commit. If a fix was needed and I approved it, create `feature/MOM-123-auth-walk-fix` off an up-to-date `main` and commit it with "fix(MOM-123): <what the walk found>". Do not merge into main and do not push.

Definition of Done: every step of the walk reported; the disposable account deleted by the owner and production back to 1 user (count-only query); no address or password anywhere; Jira commented; any fix committed on the feature branch, not merged and not pushed.
```

* **User Verification Gate:**
  - [ ] Each step of the walk worked on production, recorded on the ticket with no address or password.
  - [ ] You deleted the disposable account, and the count is 1.

---

## Block 2.4: The 390px Header (MOM-131)

* **Objective & Scope:** Size S (about 20 to 40 minutes after your design OK). On a phone the sticky header's "Signed in as <email>" row (`components/layout/MobileHeader.tsx`, `.mobile-account` and `.mobile-account-email` in `app/globals.css`) runs wider than the screen, so the page scrolls sideways (16 to 44px). Shorten the address inside the row with an ellipsis, keep the full address for a screen reader, and add a whole-page 390px check with a long address on home and `/connections`. RAID I-09.
* **Core Invariants to Protect:** *Screens are looked at*: screenshots at 390px. *No sideways scroll* on any signed-in page.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-131: keep the 390px header's "Signed in as" row inside the screen.

Task Instructions:
1. Read ticket MOM-131 in Jira first. Its acceptance criteria are the definition of done. If they and these instructions disagree, stop and flag it.
2. Read CLAUDE.md, components/layout/MobileHeader.tsx, the `.mobile-account` rules in app/globals.css, tests/e2e/home.spec.ts and tests/e2e/connections.spec.ts. Check the local stack with `npm run stack:status`; never run `supabase status` unfiltered.
3. Create the feature branch `feature/MOM-131-header-390` off an up-to-date `main`.
4. Design before editing, then STOP for my OK: (a) the CSS change (the row and the address shrink, the address ends in an ellipsis), and how the full address stays available to a screen reader; (b) the whole-page check: at 390px, with a long throwaway address on the local stack, `document.documentElement.scrollWidth` is not wider than the viewport on home and /connections (and any other signed-in page you recommend). Wait for my answer.
5. Edit as approved.
6. Tests: the whole-page browser check from step 4(b); a component test that the full address is in the accessible name. `npm test` makes no network call.
7. Run `npx tsc --noEmit`, `npm test`, `npm run build` and `npm run test:e2e` (stop `npm run dev` first; reset the local database first). Show me screenshots of home and /connections at 390px with a long address before you commit.
8. No live Claude call in this block.
9. Do not edit BACKLOG.md. Put backlog notes in the Jira comment and the close-out. Say "Privacy impact: none" in the close-out. Comment on MOM-131 with what changed and each acceptance criterion met or unmet; do not move it to Done.
10. Commit with "fix(MOM-131): keep the 390px header's signed-in row inside the screen". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes; npm run test:e2e passes; screenshots shown before the commit; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] At 390px with a long address, home and `/connections` do not scroll sideways (the browser check and the screenshots).
  - [ ] A screen reader still gets the full address (read the test).

---

# SESSION 3: PM DOCS PILOT

**Your prerequisites before this session:** (1) The full block prompt from the advising thread, ready to paste at step 4 of the prompt below. (2) The first product review deck open (https://claude.ai/artifact/EABm8qR3EfZSWeYF2HFfBK) so its numbers can be copied exactly. (3) If the day has run long, this block moves to day 7; it never bumps an earlier block.

## Block 3.1: PM Docs Pilot, First Fill (MOM-144)

* **Objective & Scope:** Size M (about 40 to 70 minutes after your design OK). Create `docs/product/` with `USER_JOURNEYS.md`, `PRD.md` and `EVALS.md`, filled from what exists today (including this week's phone-run findings for the setup journey), and `docs/product/reviews/2026-10-30.md`, the note for the first product review deck: its link, the numbers it showed, and a "what this review surfaced" list. The full block prompt comes from the advising thread at the block; the prompt below is its frame and its stops.
* **Core Invariants to Protect:** *Nothing invented*: every statement comes from the repo, Jira or the deck. *The repo is public*: roles only, no personal data, no secrets. *Docs only*: no code changes.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-144: the PM docs pilot's first fill, user journeys, PRD, evals and the first product review note.

Task Instructions:
1. Read ticket MOM-144 in Jira first. Its acceptance criteria are the definition of done. If they and these instructions disagree, stop and flag it.
2. Read CLAUDE.md, docs/DOMAIN_MODEL.md, docs/design/2026-10-26-goal-model-design.md, docs/INTEGRATIONS_SPEC.md, ROADMAP.md, docs/FAILURE_LOG.md (the in-product entries F-064 to F-066), and the MOM-111 comments from 2026-10-29 (the phone-run findings).
3. Create the feature branch `feature/MOM-144-pm-docs-pilot` off an up-to-date `main`.
4. Ask me for the advising thread's full block prompt and follow it; where it and these instructions disagree, stop and flag it.
5. Design before writing, then STOP for my OK: each file's outline (headings and what each section draws on, file by file), and for the review note the numbers you will copy from the deck. Wait for my answer.
6. Write the four files as approved. Every claim names its source (a file, a ticket or the deck). Roles only; no personal data, no secrets.
7. Run `npm test` and `npm run plan`; both must pass. Docs only: no code change.
8. No live Claude call in this block.
9. Do not edit BACKLOG.md. Put backlog notes in the Jira comment and the close-out. Say "Privacy impact: none" in the close-out. Comment on MOM-144 with the files, their outlines, and each acceptance criterion met or unmet; do not move it to Done.
10. Commit with "docs(MOM-144): add the PM docs pilot's first fill and the first product review note". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; npm test passes; npm run plan passes; four docs files, nothing invented; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] You approved each file's outline before any writing.
  - [ ] Every claim names its source, and the review note's numbers match the deck exactly.
  - [ ] No personal data or secrets in any file.

---

# FINAL DAY-END BUILD VERIFICATION & PULL REQUESTS

Run after the last block of the day, or type `/day-end` and let it run these in this order: **A, B, D, E, then F (the one push, after your OK), then C (live checks, after the pull requests have merged and Vercel has deployed)**. Stop on the first failure. When the whole sequence has finished and you say so, `/day-end` ends with the line `Tomorrow: /day-start (Sonnet / Low)`.

**The build day's window.** The day starts at the previous day-end's last merge, not at midnight, so a day-end that runs past midnight sees the same work. It is the newest merge on `origin/main` of a step E branch, found by the branch name, which always ends in `-next-build-plan-doc`: `git log origin/main --merges -n 1 --grep="next-build-plan-doc" --format="%h %cI %s"`. `/day-end` prints it as `Window: after <hash> (<date>, <subject>)` at the start and reuses that hash in steps B, D and F (it never recomputes it, because today's own step E branch will have merged by then). If there is none, you give a start date. Below, `<window>` means that hash.

**When there is nothing to sync.** `/day-end` stops at the start only if all four hold: no unmerged branches; no open backlog item without a Jira key; no entry marked `unreviewed` in `docs/FAILURE_LOG.md` (`docs/RAID_LOG.md` is frozen and is not checked); and no ticket with commits on `origin/main` in the window that Jira still shows as neither Done nor Closed. It names each condition, and says which ones kept it going. Failure entries carry the `unreviewed` mark in their heading line (`### F-0nn · … · unreviewed`); an entry drafted without the mark is still a waiting entry, so also look at the entries added in the uncommitted changes to the log (failure log F-061, MOM-124).

**Blocks merged during the day.** On 2026-10-29 every block's pull request was pushed and merged during the day, with your OK, so the day-end found no unmerged branch and step A had nothing to check. When that happens, step A says so, step B still runs (migrations applied in the window are verified on production), and step F pushes only the step D and E branches.

**Your log edits and branch switches.** If you hold uncommitted edits to `docs/FAILURE_LOG.md` or `docs/RAID_LOG.md` and a branch's copy of either file differs, a plain `git switch` aborts. Before each switch `/day-end` checks for this, says so in plain words, backs both files up, stashes them (`git stash push -- <the two files>`), switches and pops. If the pop conflicts, it stops, restores from the backup and asks you. It never stages a log file for this; only the entries you approve in step D are staged.

**The thin slice: N = 6 (decided 2026-10-29); today is day 6.** Whatever did not finish today goes first on day 7, with the PM docs pilot (MOM-144) if it moved. Step E writes day 7's plan from today's actual progress and the owner's order: the trial's go/no-go items first (anything left of MOM-111, MOM-113, MOM-122, MOM-123, MOM-131), then the follow-ons. MOM-114 ships as "defaults only" for the trial. MOM-132 and the rest of MOM-124 come after the trial starts.

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

`npm run test:e2e` and `npm run verify:sql` also run in CI on every pull request. Run them here too for a branch that changed pages, auth, the wizard, the drawer, manual entry, setup, the weekly review, the week plan, the theme or a migration (stop `npm run dev` first; check the stack with `npm run stack:status`; reset the local database to the branch's migrations first with `npx supabase db reset --local`). Any server error in the e2e output is a failure, with two known exceptions until MOM-124's expected-lines list exists: the wizard spec's two `[task-plan-ai] the API key was rejected { httpCode: 401 }` lines and the `[synced-entries] not counted … reason: 'no_source'` lines from the Hevy "no bound target" spec. A jsdom test that fails a full run and passes alone is a failure to fix, not a flake to rerun (MOM-96 merged). If the full browser suite runs out of memory (MOM-141), run the branch's specs one at a time and say so.

Generated route types outlive a branch switch: a browser test run leaves the development server's in `.next/dev`, and a production build leaves its own in `.next/types` (failure log F-028, F-039). Delete both folders (git-ignored, rebuilt by the next build or `npm run dev`) before the checks on each branch; if `tsc` or the build still fails only in a file under `.next/`, delete them and run the check again; any other failure is real. MOM-130 builds this into the commands.

## B. Database verification (production), only if migrations were applied in the window

A migration is in the window when `git log --branches --remotes --not <window> --name-only --format=%h -- supabase/migrations` lists a file (020 from MOM-113, if it was added). B also runs when a script in `supabase/verify/` changed in the window, because production is where those scripts are proven. **Git Bash only.** This loop uses `/tmp`, `grep`, `$(...)` and `for ... done`, which do not work in PowerShell. `npm test` does **not** run these scripts. Every script must report `false 0` and a non-zero `true` count (0 and 0 means the script errored).

**When a migration is still waiting for its push.** This plan applies each migration at step F, after CI is green and before its pull request merges. If the window's migrations are not yet on production when B runs, B runs only its read-only part now (the migration list, where remote should stop at the last applied migration, and the user count), and the verify loop runs at step F right after each `db push`. Running the loop before the push would fail the new migration's verify script and write throwaway users to production twice.

```bash
npx supabase migration list                         # local and remote columns must match for every migration already applied
T=0; F=0
for f in supabase/verify/*.sql; do
  npx supabase db query --linked -f "$f" -o table > /tmp/v.txt 2>&1
  t=$(grep -cE '│ true ' /tmp/v.txt); fl=$(grep -cE '│ false ' /tmp/v.txt)
  echo "$(basename $f): true $t false $fl"; T=$((T+t)); F=$((F+fl))
done; echo "TOTAL true $T false $F"                 # expect false 0 and a true count no lower than the last production total (677 after 019, at the 2026-10-29 day-end), plus the checks added in the window. A local count is not a production count: one script runs 5 more checks on production
npx supabase db query --linked -o table "select count(*) as users from auth.users"   # expect 1: only the standing smoke-test account (block 7's disposable account must already be deleted)
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
   - Metadata Header at the top: `> **Date:** YYYY-MM-DD | **Active Epic:** MOM-XX | **Base Commit:** <SHORT_HASH>`, the Date being the calendar day the plan will run.
   - Executive Overview & Architectural Invariants, and the Standing Rules (Jira first, production approval, verify scripts, no pushes inside blocks, blocks never edit BACKLOG.md, the lighter log rule, standing smoke-test account).
   - A "Today's runbook" section near the top, after the metadata header and before the first block: a table with one row per block, in order, giving `/run-block MOM-n`, the session setting (model / effort) and, in plain words, what to check at the gate. The table's first row is `/day-start` (Sonnet / Low) and its last row is `/day-end` (Opus / High), each with its own plain-words gate text; `npm run plan:check -- --strict` warns when either is missing or out of place. The text above the table also says that `/day-start` comes first and `/day-end` last.
   - Logical Session Blocks grouping high-priority tickets, in dependency order, each in the format `npm run plan:check` enforces: a heading `## Block <n>.<m>: <title> (MOM-<n>)` with exactly one ticket key (unique in the plan); a `* **CLI Session Config:** Model: X | Effort: Y` line; exactly one fenced `text` prompt that names its ticket and carries a commit message `type(MOM-n): ...`; and a `* **User Verification Gate:**` checklist. Before each session's first block, a `**Your prerequisites before this session:**` note (it may say none). Give each block a size in its objective (S about 20 to 40 minutes, M about 40 to 70, L 70 or more, timed from the design OK) until MOM-124 adds a Size field.
   - Block prompts that follow the pull-request workflow (CLAUDE.md): create the feature branch off an up-to-date `main`; commit on it with the Jira key; do NOT merge into `main` and do NOT push (the one push is at day-end, step F, after my OK); do NOT edit BACKLOG.md (notes go in the Jira comment and the close-out); end with "Definition of Done: ...; committed on the feature branch." A block with a migration says: run `npm run verify:sql` locally, show the migration and `npx supabase db push --dry-run`, and run production `db push` and then ALL the verify scripts only after CI is green on its pull request and I say OK, and before that pull request merges (merging deploys to Vercel). A block that needs another ticket's code says it "must already be in origin/main" and stops if it is not. When two blocks add migrations on separate branches, number them in the order they will be pushed, and say that the later branch merges origin/main before its push. A block that changes a screen shows screenshots at 390px before it commits.
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
3. For a branch with a migration (only MOM-113's, if it added 020): production `npx supabase db push --dry-run`, then `db push`, then ALL the verify scripts (step B's loop), only after CI is green and your OK, and **before** that pull request merges.
4. Merge each pull request with a merge commit (the GitHub button, or `gh pr merge` after your OK), in the runbook's order, MOM-113 after its migration is on production. If two pull requests conflict in a shared file (block 2's theme and block 8's header both touch `app/globals.css`), merge `origin/main` into the later branch locally, keep both sides, and push that with your OK.
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
```

These use no output file and no format string. Git Bash rewrites a path such as `/dev/null` for the Windows `curl`, and `MSYS_NO_PATHCONV=1` then makes `curl` fail with a write error, so `-o /dev/null -w` is not used here.

- [ ] Sign in as the standing smoke-test account and walk the flows you touched today (setup's wording if a setup is still open for that account, the light theme on your phone, the home-screen icon, the setup link, the weekly review if it is due for that account, the 390px header).
- [ ] Only the standing smoke-test account exists (`users = 1` in step B, until real users exist). If its data is cluttered, delete and recreate it in the Supabase dashboard (Add user, Auto Confirm); never share or store its password.
- [ ] Walk every item in `docs/plans/.pending-live-checks.md` (the post-push checks the blocks deferred), then clear the items that are done; an item that still waits stays.

---

## Open Decisions and Risks (read before starting)

| Item | Why it matters |
| --- | --- |
| **Thin slice: build day 6 of N = 6** | Day 5 merged every planned block (MOM-96, MOM-134, MOM-113 3.2, MOM-112's week plan and forecast) and seven setup fix rounds. Day 6 is this plan, in the owner's order. Anything that does not finish today goes first on day 7, with the PM docs pilot if it moves. |
| **The family trial's go/no-go** | The trial needs setup's wording settled (block 1), the review's sitting (block 5), the auth email limits handled (block 6), the production sign-up walk (block 7) and the 390px header (block 8). The light theme, the icon and the setup link are the owner's day-6 picks for what testers meet first. |
| **Live Claude calls today** | Block 1: one setup live run, about 20 calls, $2 cap (round 3 cost about $1.26 for 20 calls). Block 5: the calls its design stop proposes, each with your OK and its cap. `npm test` never calls Claude. |
| **MOM-114 is "defaults only" for the trial** | Owner decision, 2026-10-29: every default stays as setup set it, and the full "How Momentum talks to me" page is built during the trial. The light / dark / system choice in block 2 is the only new setting, and only if you approve it. |
| **After the trial starts** | MOM-132 (add a goal or target after first setup), the rest of MOM-124, MOM-138 (edit a kind of day's usual time and a task's size or date), MOM-139 (where settings choices came from), MOM-140 (setup's fields with no place yet). |
| **Migration 020** | Only MOM-113 block 3.3 may take it, with your OK at the design stop. Production holds 001 to 019 (677 verify checks passing after 019). |
| **The weekly review and the forecast** | `lib/services/review.ts` still hands the engine an empty forecast list, so layer 3's "forecast no longer fits" never fires. Block 5's design stop decides whether to wire it, because it changes what Claude is told. |
| **The full local browser suite** | It ran out of memory twice on 2026-10-29 (MOM-141, `risk`). Until it is fixed, a block that cannot finish it runs its own specs one at a time and says so; CI's `database` job is the full-suite gate. |
| **`set_updated_at()` grants** | Executable by the API roles since 001, unlike the trigger functions 012 locked down (MOM-137, `risk`). Low practical risk; not scheduled today. |
| **Stale generated types** | Generated route types outlive a branch switch (F-028, F-039). Until MOM-130 builds it into `/day-start` and `/run-block`, delete `.next/types` and `.next/dev` before the type check and build on a branch you just switched to. |
| **Archive name** | The plan that ran on 2026-10-29 carried the date 2026-10-30 (the dates had drifted a day ahead) and is archived as `docs/plans/archive/2026-10-30.md`. This plan carries its real run date, 2026-10-30, so it will be archived as `2026-10-30-2.md`; from here the Date is the calendar day the plan runs. |
| **Standing smoke-test account** | `smoke-test@momentum-app.test` exists on production. Every live gate signs in as it; its password stays in your password manager. Production must hold exactly one user at day-end step B; block 7's disposable account is created and deleted by you, before the day-end. Its goal-model data is created through setup and logging only. |
| **The old model stays until MOM-115** | The wizard, rebalance and checkbox criteria keep running, with the completion guard of migrations 002 and 008. New code follows `docs/DOMAIN_MODEL.md` and is built beside the old tables. |
| **Not scheduled, queued with keys** | Thin slice, later: MOM-113 3.4 (the deferred layer-3 triggers, "Still right for you?" with MOM-134's data), MOM-112's remaining work (merge suggestions on screen, entry controls on home and retiring `/log`, auto-counted entries undoable), MOM-115 (retire the old model). Tooling: MOM-130, MOM-127, MOM-141, MOM-124 part 2. Security: MOM-137, MOM-119. Logs: MOM-135. Deferred: MOM-126 (minors safeguards; the trial is adults only). Follow-ons during the trial: MOM-117, MOM-136, MOM-118. Other: MOM-109, MOM-98, MOM-99, MOM-100, MOM-101, MOM-74, MOM-91, MOM-95, MOM-97, MOM-70, MOM-26, MOM-39. |
| **Risks live in Jira** | Since MOM-133, new risks are Jira tickets with the `risk` label, reviewed as a weekly top 5 at the first day-end of the week (the next one is the first day-end of the week of 2026-11-02); `docs/RAID_LOG.md` is frozen history. The first day-end of November also runs the monthly pattern review of the failure log. |
| **Pull requests, not direct pushes** | `main` is protected (MOM-67): every change reaches it through a pull request with `checks` and `database` green, merged with a merge commit. `/run-block` commits on a feature branch and never merges; branches are pushed only with your OK. A production migration is applied before its pull request merges (merging deploys to Vercel). |
