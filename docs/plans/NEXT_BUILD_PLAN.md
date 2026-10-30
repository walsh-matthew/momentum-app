# 🚀 MOMENTUM BUILD: NEXT-PHASE MASTER EXECUTION PLAN

> **Date:** 2026-10-31 | **Active Epic:** MOM-105 | **Base Commit:** 7d30531

> **Since the last plan (run on 2026-10-30):** build day 6 built every planned block but one, each on its own branch, and the 2026-10-30 day-end pushed them for pull requests: MOM-111 (setup round 3d: the floor question "In a hard week, how many <thing> would still count?", idea buttons that name the counted thing, a quick-path card that says what to do next; a live run of 21 calls, about $1.34), MOM-30 (a light palette that follows the device, with a light / dark / "Match my device" choice), MOM-142 (a home-screen icon and manifest), MOM-143 (a "Set up your goals" card on home), MOM-113 block 3.3 (layer 2's one-line look back, layer 3's choice and the finished review; no migration), MOM-122 (a reset link that works in any browser, with a signed recovery cookie; the sender waits on the owner), MOM-131 (the 390px header) and MOM-144 (the PM docs pilot). MOM-142, MOM-143, MOM-113 and MOM-131 are stacked on MOM-30, which merges first; MOM-144 is rebased onto `main` last. MOM-123 did not run (it waits for an email sender). The day-end fixed one real UI race on MOM-113 and MOM-30 (failure log F-072) and created MOM-145 to MOM-148. Day 6 added no migration: production holds 001 to 019 (677 verify checks passing at the 2026-10-29 day-end). **This is build day 7, after N = 6; the family trial starts Tue 2026-11-03, with no scope cuts.** The next free migration number is **020**.

---

## Today's runbook

**How to run a day.** Type `/day-start` first: it only reads and reports. Then type the command in the table below for each block, in this order, and skip any block whose Jira ticket is already Done. Each command first shows the block's model and effort: if your session differs, it stops and tells you the exact `/model` and `/effort` to type (use the session-only choice in the `/effort` slider, so your saved default is left alone), and you start the command again. Run `/clear` between blocks. When the last block is done, type `/day-end`. Nothing is pushed, merged or applied to production without your explicit OK, and work reaches `main` only through a pull request once both CI jobs are green.

| # | Type | Session setting | What to check at the gate |
| --- | --- | --- | --- |
| 0 | `/day-start` | Sonnet / Low | A clean tree; `main` matching `origin/main` with every 2026-10-30 pull request merged (MOM-30 first, then MOM-111, MOM-142, MOM-143, MOM-113, MOM-122, MOM-131, MOM-144, and the day-end's MOM-16 and MOM-105 branches); no leftover branches; the plan passing its format check; no missing environment variable names; `npm run stack:status` answering in one line; the `/rc` reminder. Then the carry-overs in `docs/plans/.pending-live-checks.md`. |
| 1 | `/run-block MOM-111` | Sonnet / Medium | Size M. When setup stops early, the quick-path card lets the person fill in each missing item, by typing it or taking a suggestion they can see, and save; nothing they said is lost; screenshots at 390px in light and dark. |
| 2 | `/run-block MOM-145` | Sonnet / Medium | Size M. You approved side-by-side screenshots against `main` before code: dark cards darker with the border carrying them, solid lime for each screen's one primary action, dark control borders at 3:1; every contrast test passes in both themes. |
| 3 | `/run-block MOM-115` | Sonnet / Medium | Size S. On home, a person with no setup sees no old-model controls (no "New Goal Wizard", no "Adjust Weekly Pace", no empty "ALL CHANNELS" heading); the old model's code stays until the full MOM-115. |
| 4 | `/run-block MOM-148` | Sonnet / Medium | Size S. At 390px every signed-in page has a way home and Sign out, and none scrolls sideways with a long address (light and dark). |
| 5 | `/run-block MOM-146` | Sonnet / High | Size L, may split. You approved which fields can change and where before code; "Yes, I want to change it" in the review opens the edit and returns; closed weeks keep their grade; a migration (020) only if the design stop shows it is needed. |
| 6 | `/run-block MOM-122` | Sonnet / Medium | Size S. Only if you chose a sender: the sender is set in the dashboard by you, `/privacy` names it, the template is pasted after `RECOVERY_COOKIE_SECRET` is in Vercel, and the hourly limit is recorded on the ticket. Skip it otherwise. |
| 7 | `/run-block MOM-123` | Sonnet / Low | Size S. Only after block 6: you walked sign-up, confirmation, sign-out and password reset on production with a disposable address, deleted it in the dashboard, and production is back to one user. |
| 8 | `/run-block MOM-113` | Sonnet / High | Size M. Block 3.4: "Still right for you?" on a suggestion taken at setup, and layer 2's line warmer within the same rules; every live call waited for your OK and its cost; Claude writes words only. |
| 9 | `/day-end` | Opus / High | The day's branches pass their checks; any migration (020, 021) is applied to production at step F after CI is green and your OK, before its pull request merges, with every verify script after it; production holds one user. Restart the PC afterwards (the reminder is MOM-124, not built yet). |

If a block needs another ticket's code, `/run-block` checks that code is already in `origin/main`. If it is only on an unmerged branch, it stops and offers two ways forward: push that branch and merge its pull request first, or stack this block on that branch (only with your OK). **Every block in this plan needs the 2026-10-30 pull requests merged**: the quick path uses MOM-30's card look and MOM-111's round 3d; MOM-115's home subset sits next to MOM-143's setup card; MOM-148 builds on MOM-131's header; MOM-146 and MOM-113 build on block 3.3. Block 7 (MOM-123) needs block 6 (MOM-122). Blocks 2 and 4 both change `app/globals.css` and the dark baseline: the later one merges `origin/main` before its push.

---

## Executive Overview & Architectural Invariants

Build day 7 is the last build day before the family trial (Tue 2026-11-03), and the owner's order puts what testers meet first. Session 1: the quick path that keeps what a person said when setup stops early (MOM-111), the dark theme's vibrancy (MOM-145), home without the old model's controls (a MOM-115 subset), and a way home and out on every phone page (MOM-148). Session 2: the review's "change" choice leading to a real edit (MOM-146), the trial's email sender and the production sign-up walk once a sender exists (MOM-122, MOM-123), and the review's block 3.4 with layer 2's tone (MOM-113).

`docs/DOMAIN_MODEL.md` is binding for all new code. The old model stays in the code until MOM-115 retires it, so new code is built beside the old tables, never into them. Every block preserves these invariants:

1. **Claude never scores.** The engine (`lib/engine/`) computes every number from entries and the target in force; no Claude output is stored as a number, and setup's draft is validated by code, not by Claude (DOMAIN_MODEL §1.7, principle 9). The review's recap and its one adjustment come from the engine; layer 2's words come from Claude and carry no number.
2. **The person's word beats any source.** A manual entry or correction always wins over a sync; a value the person typed beats a suggestion; corrections are keyed to the source's own record id (§1.5, §1.6).
3. **Never assume anything about a person's life.** Time zone, week start and day end are the person's to set; the quick path applies no default (DOMAIN_MODEL §2.3, 2026-10-30); a suggestion the person took is a starting point, checked at their first review (§2.1 rule 4).
4. **Unfinished work moves, habits never carry over.** (§1.4, principle 11.) A changed target takes effect from the person's next period and never re-grades a closed one (§1.7).
5. **Service-layer RLS enforcement.** The UI never queries Supabase. Every read and write goes through `lib/services/`; every new table has row level security keyed to its owner, explicit grants and an entry in `supabase/verify/900_table_grants.sql`'s allow-list.
6. **The old model's guards stay until MOM-115.** Block 3 hides old-model controls on home; it removes no table, migration or service.
7. **Nothing is saved until final approval** in setup, every Claude call goes through `lib/services/llm.ts`, and a Claude call sends only the fields the privacy notice lists (pinned by a test).
8. **A stored record of what was said is never rewritten** (RAID R-26): a late entry changes a week's live reading, never a stored recap silently.
9. **Plain words** (DOMAIN_MODEL §2.1): everyday words with a reason, the person's own words restated, a way out of every change, "what do you mean?" always answered. A review comment becomes a shared rule or component with a test that sweeps every screen.
10. **A transition settles in one render** (failure log F-072): a state update after an `await` inside a transition's start function is wrapped in the start function again, and its test waits for the settled control with `findByRole`, not only the message.

## Standing Rules (every prompt below repeats what it needs)

- **Read the Jira ticket first.** If its title, scope or acceptance criteria disagree with the prompt, or the prompt disagrees with `docs/DOMAIN_MODEL.md`, stop and flag it.
- **Production changes need your approval.** A prompt stops before `supabase db push`, `vercel env`, or any push to `origin`, shows what will happen, and waits. Never use the SQL Editor. Tests never run against production and never use production credentials.
- **Database checks are not part of `npm test`.** They live in the SQL scripts in `supabase/verify/` and run with `npm run verify:sql` (local stack) or, against production, with the step B loop. After any migration, or any change to a verify script, run **all** of them; every row must show `passed = true`. A local total is not a production total: one script has checks that run only on production (RAID R-16, failure-log F-027).
- **New migrations, numbered in push order:** the first block today that needs one (MOM-146 at its design stop, or MOM-113's 3.4) takes **020**, the next **021**, each only with your OK at the design stop. A later branch with a migration merges `origin/main` before its push. Never edit an applied migration.
- **Pull requests, not local merges.** `main` is protected: work reaches it only through a pull request with the CI jobs `checks` and `database` green, merged with a merge commit (CLAUDE.md). A block commits on its feature branch and stops: it never merges into `main` and never pushes. Branches are pushed only with your explicit OK (normally once, at day-end step F).
- **A migration is applied before its pull request merges.** A block with a migration runs `npm run verify:sql` locally, shows the migration and `npx supabase db push --dry-run`, and stops. At day-end step F, once CI is green on its pull request and you say OK, the production `db push` and then ALL the verify scripts run, before that pull request merges (merging deploys to Vercel, and the new code needs the new schema).
- **Blocks never edit `BACKLOG.md`.** A block's backlog notes, new gaps and follow-ups go in its Jira comment and its close-out; day-end step D writes `BACKLOG.md` once, on its own branch.
- **Build time.** Each close-out and Jira comment gives `Build time: about <n> min, not counting waits on me (<size band>)`: working time from the design OK to the commit, leaving out design and look reviews, screenshot OKs, live-call OKs and dashboard steps you do by hand. Day-end step E builds its planned-versus-actual table from these lines.
- **Is the local stack up?** Ask it with `npm run stack:status` (it prints only "Local Supabase stack: running" or "Local Supabase stack: not running"). Never run `supabase status` unfiltered: its output holds the local stack's keys (failure log F-047, F-049, F-051, F-057, F-059), and `.claude/settings.json` denies it.
- **Logs (MOM-133).** A failure-log entry is written only when it leads to a fix made that session, a new standing rule or a Jira ticket, and names which; it is marked `unreviewed` until the day-end. `docs/RAID_LOG.md` is frozen: a new risk, assumption, issue or dependency becomes a Jira ticket with the `risk` label.
- **Claude calls cost money.** `npm test` never calls Claude: model calls in tests go through a fake. A block that wants a live Claude call (an eval run, a prompt check) says how many calls and the cost cap and stops for your OK first, and it is logged through `lib/services/llm.ts`. Block 8 (MOM-113) plans live calls.
- **Screens are looked at, not only tested** (failure log F-067). A block that changes a screen saves screenshots of every changed screen at 390px (and 1280px where the layout changes), in light and dark since MOM-30, and shows them to you before it commits. A test that compares dates also runs once with the browser's clock across a day boundary from the person's (F-069).
- **Stale generated types.** Generated route types under `.next/` outlive a branch switch (failure log F-028, F-039). Until MOM-130 builds it into the commands, delete `.next/types` and `.next/dev` (both git-ignored and regenerated) before `npx tsc --noEmit` or `npm run build` on a branch you just switched to.
- **Memory on the build machine.** The full local `npm run test:e2e` runs out of memory (MOM-141), and on 2026-10-30 step A took about 3 hours at 84% memory in use, with one `npm run plan` run stalling past 300 seconds. Close what you do not need before heavy steps; run a block's own specs one at a time; CI's `database` job is the full-suite gate.
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
SESSION 1: BEFORE THE TRIAL, WHAT TESTERS MEET (MOM-111, MOM-145, MOM-115, MOM-148)   build day 7, trial Tue 2026-11-03
  - The quick path keeps what was said: fill in what is missing, in the new look
  - Dark mode vibrancy
  - Home without the old model's controls (a MOM-115 subset)
  - A way home and out on every phone page
SESSION 2: THE REVIEW'S LAST PIECES AND THE TRIAL'S EMAIL (MOM-146, MOM-122, MOM-123, MOM-113)
  - The review's "change" leads to a real edit (020 if needed)
  - The trial's email sender, once you have chosen one
  - The production sign-up walk with a disposable account
  - Review block 3.4 and layer 2's tone (021, or 020, if needed)
```

*Order is the owner's (2026-10-30 day-end). Session 1 is what a tester meets in their first minutes; MOM-148 goes before the trial. Session 2's MOM-122 and MOM-123 run only once a sender exists (no domain yet on 2026-10-30); if none does, skip both and they stay first on the next day. Safe stopping points: after each block. Anything unfinished goes first on the next build day.*

---

# SESSION 1: BEFORE THE TRIAL, WHAT TESTERS MEET

**Your prerequisites before this session:** (1) Every 2026-10-30 pull request is merged (MOM-30 first); `/day-start` shows it. (2) Docker Desktop running and the local stack started (`npx supabase start`; `npm run stack:status` says running) for the browser tests. (3) Close what you do not need before the heavy steps (MOM-141). (4) Be ready to approve block 2's dark screenshots side by side with `main`.

## Block 1.1: The Quick Path Keeps What Was Said (MOM-111)

* **Objective & Scope:** Size M (about 40 to 70 minutes after your design OK). When setup stops using Claude (the budget is spent, or a limit is hit), the quick-path card lists what is missing, and if anything is, the person must start again and loses everything they said (`components/setup/QuickPathCard.tsx`, `lib/setup/quickPath.ts`). Owner, 2026-10-30: before the trial, the card lets the person fill in each missing item, by typing it or accepting a suggestion they can see, and then save. A value they type is said; a suggestion they accept is a starting point (stored the way MOM-134 stores one, `lib/services/startingPoints.ts`). It applies no default (DOMAIN_MODEL §2.3). In the card's new look (MOM-30's card surface, both themes; round 3d's `PlaybackLines`).
* **Core Invariants to Protect:** *Never assume*: no value is filled in without the person's tap. *The person's word beats any source*. *Nothing is saved until final approval*. *Plain words*: each field says what it is for, in the wording builder's words. *A transition settles in one render*.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-111's quick-path fill-in: when setup stops early, the person fills in each missing item on the quick-path card and saves, so nothing they said is lost.

Task Instructions:
1. Read ticket MOM-111 in Jira first, with its 2026-10-30 comments (round 3d and the quick-path card). Its acceptance criteria are the definition of done for the whole ticket; this block covers part of them. If they, these instructions and docs/DOMAIN_MODEL.md §2.1 and §2.3 disagree, stop and flag it.
2. Read CLAUDE.md, docs/DOMAIN_MODEL.md §2.1 to §2.3, components/setup/QuickPathCard.tsx, components/setup/PlaybackLines.tsx, lib/setup/quickPath.ts, lib/setup/numbers.ts, lib/setup/rows.ts, lib/services/setup.ts, lib/services/startingPoints.ts, app/actions/setup.ts, tests/setup-quick-path.test.tsx and tests/e2e/setup-cards.spec.ts. Check the local stack with `npm run stack:status`; never run `supabase status` unfiltered.
3. Create the feature branch `feature/MOM-111-quick-path-fill-in` off an up-to-date `main`.
4. Design before editing, then STOP for my OK: (a) every missing item the quick path can name today, and for each the control (a typed answer, a choice, a time zone picker) and its words from the wording builder; (b) which items may show a suggestion, where the suggestion comes from (code, never Claude, since Claude has stopped), and how an accepted suggestion is stored as a starting point; (c) how the filled-in draft is validated by the same schema as setup's and saved through the same first-setup save; (d) what happens when the person leaves before saving (nothing is stored; the tab keeps it, as today); (e) the screens at 390px in light and dark. Wait for my answer.
5. Build as approved, in the shared builders. A state update after an `await` inside a transition is wrapped in the start function again (F-072).
6. Tests: unit tests per missing item (typed, accepted suggestion, left empty), the draft validated by the setup schema, a typed value stored as said and an accepted suggestion as a starting point; component tests that wait for the settled state with `findByRole`; a browser spec at 390px and 1280px from a limit stop to a saved setup. `npm test` makes no network call.
7. Run `npx tsc --noEmit`, `npm test`, `npm run build`, and the setup browser specs (`npx playwright test tests/e2e/setup.spec.ts tests/e2e/setup-cards.spec.ts`; stop `npm run dev` first; reset the local database first). Save screenshots of the card at 390px in light and dark and show them to me before you commit.
8. No live Claude call in this block (the quick path runs after Claude has stopped).
9. Do not edit BACKLOG.md. Put backlog notes in the Jira comment and the close-out. Say "Privacy impact" and the "Build time" line in the close-out. Comment on MOM-111 with the approved design, what changed, and each acceptance criterion met, partly met or not started; do not move it to Done.
10. Commit with "feat(MOM-111): let the quick path fill in what is missing and save". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes (with no network call); the setup browser specs pass at 390px and 1280px; screenshots in light and dark shown before the commit; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] You approved the fields, the suggestions and the save before any edit.
  - [ ] From a limit stop, the browser spec fills in what is missing and saves a setup; nothing the person said is lost.
  - [ ] A typed value is stored as said and an accepted suggestion as a starting point (read the test).
  - [ ] The card reads clearly at 390px in light and dark (the screenshots).

---

## Block 1.2: Dark Mode Vibrancy (MOM-145)

* **Objective & Scope:** Size M (about 40 to 70 minutes after your design OK). Since MOM-30's one card surface, dark mode looks dull: the mid-grey card fill dulls the lime and tinted choice buttons read olive. A darker dark card fill with the border carrying the card, solid lime for each screen's one primary action, and dark control borders at 3:1 (hairlines are about 1.2:1 today). In the same pass: `.card-title`'s global text colour, `<meta name="theme-color">` following the device rather than the cookie, the unused `--surface-soft`, `--surface-raised` and `--panel` tokens. Light stays as approved unless you say otherwise.
* **Core Invariants to Protect:** *Screens are looked at*: side by side with `main`, before code is committed. *Contrast*: every existing contrast test passes in both themes. *Dark changes are deliberate*: the dark baseline changes only where named.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-145: bring back dark mode's vibrancy, and lift dark control borders to 3:1.

Task Instructions:
1. Read ticket MOM-145 in Jira first, and MOM-30's 2026-10-30 comment (the palette and the four look-review rounds). Its acceptance criteria are the definition of done. If they and these instructions disagree, stop and flag it.
2. Read CLAUDE.md, app/globals.css (the dark root tokens, `--card-fill`, `--card-line`, `--card-shadow`, `primary-hover`, `.card-title`), app/layout.tsx (the viewport's theme colors), tests/theme-tokens.test.ts, tests/theme-contrast.test.ts, tests/theme-cards.test.ts, tests/fixtures/globals.dark-baseline.css and tests/e2e/theme.spec.ts. Check the local stack with `npm run stack:status`; never run `supabase status` unfiltered.
3. Create the feature branch `feature/MOM-145-dark-vibrancy` off an up-to-date `main`.
4. Design before coding, then STOP for my OK: (a) the new dark card fill, line and shadow, with card-on-page and text-on-card contrast; (b) each screen's one primary action and how it becomes solid lime, and the tinted choices beside it; (c) the dark control borders at 3:1 against their surface; (d) the theme-color meta: follow the cookie when the person chose, or leave it; (e) the tokens to drop; (f) screenshots of home, setup, /plan, /review, /connections and sign-in at 390px, dark, side by side with `main`, plus light for any light change. Wait for my answer.
5. Build as approved. Change the dark baseline fixture only for the deliberate changes, and name each in the test's exception list.
6. Tests: the contrast test gains the dark control-border pairs at 3:1; the token and card tests pass; `npm test` makes no network call.
7. Run `npx tsc --noEmit`, `npm test`, `npm run build` and `npx playwright test tests/e2e/theme.spec.ts` (stop `npm run dev` first). Show me the side-by-side screenshots before you commit.
8. No live Claude call in this block.
9. Do not edit BACKLOG.md. Put backlog notes in the Jira comment and the close-out. Say "Privacy impact: none" and the "Build time" line in the close-out. Comment on MOM-145 with the approved design, what changed and each acceptance criterion met or unmet; do not move it to Done.
10. Commit with "feat(MOM-145): bring back dark mode's vibrancy and lift dark control borders to 3:1". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes (with no network call); the theme browser spec passes; side-by-side screenshots approved before the commit; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] You approved the side-by-side screenshots against `main` before any commit.
  - [ ] Each screen's one primary action is solid lime in dark.
  - [ ] Dark control borders reach 3:1 (the contrast test), and every other contrast test passes in both themes.
  - [ ] After the push, dark mode looks right on your phone (the pending live check).

---

## Block 1.3: Home Without the Old Model's Controls (MOM-115)

* **Objective & Scope:** Size S (about 20 to 40 minutes after your design OK). A subset of MOM-115 for the trial. For a person with no setup, home still shows the old "New Goal Wizard" and "Adjust Weekly Pace" buttons (in the banner and the sidebar) and an "ALL CHANNELS / Make today count." heading with nothing under it; the old "No goals yet" card still shows when the scoreboard could not be read and the old model has no goals (MOM-143's notes). Hide the old model's controls on home for everyone on the new model. The old model's code, tables and services stay until the full MOM-115.
* **Core Invariants to Protect:** *The old model's guards stay*: no table, migration, service or route is removed. *Never assume*: when the scoreboard cannot be read, home says so rather than offering the old wizard.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement a subset of MOM-115 for the trial: hide the old model's controls on home.

Task Instructions:
1. Read ticket MOM-115 in Jira first, and MOM-143's 2026-10-30 comment (its backlog notes). This block covers only the home subset; the rest of MOM-115 stays open. If the ticket and these instructions disagree, stop and flag it.
2. Read CLAUDE.md, docs/DOMAIN_MODEL.md §1.8, app/page.tsx, components/layout/AppShell.tsx, components/layout/MainFeed.tsx, components/layout/GoalBuilderBanner.tsx, components/layout/NavSidebar.tsx, components/layout/WorkspaceSidebar.tsx, components/layout/MobileHeader.tsx, components/home/SetupLinkCard.tsx, lib/utils/setupOffer.ts and tests/e2e/home.spec.ts. Check the local stack with `npm run stack:status`; never run `supabase status` unfiltered.
3. Create the feature branch `feature/MOM-115-home-old-model-hidden` off an up-to-date `main`.
4. Design before coding, then STOP for my OK: (a) every old-model control and heading home shows today (file and line), for a person with no setup, a person with a saved setup, and when the scoreboard cannot be read; (b) what each one becomes (hidden, or a plain line); (c) whether `/log` and the old wizard routes stay reachable by address (they do unless you say otherwise); (d) the screens at 390px and 1280px in light and dark. Wait for my answer.
5. Build as approved. Remove nothing from the old model's services, tables or migrations.
6. Tests: component tests for each state; the home browser spec at 390px and 1280px finds no "New Goal Wizard", no "Adjust Weekly Pace" and no empty channel heading for a person with no setup. `npm test` makes no network call.
7. Run `npx tsc --noEmit`, `npm test`, `npm run build` and the home browser spec (stop `npm run dev` first; reset the local database first). Show me the screenshots at 390px before you commit.
8. No live Claude call in this block.
9. Do not edit BACKLOG.md. Put backlog notes in the Jira comment and the close-out. Say "Privacy impact: none" and the "Build time" line in the close-out. Comment on MOM-115 with what changed and what of MOM-115 remains; do not move it to Done.
10. Commit with "feat(MOM-115): hide the old model's controls on home for the trial". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes (with no network call); the home browser spec passes at 390px and 1280px; screenshots shown before the commit; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] You approved the list of what is hidden before any code.
  - [ ] A person with no setup sees the setup card and no old-model control on home (the browser spec and the screenshots).
  - [ ] Nothing of the old model's data path was removed (read the diff).

---

## Block 1.4: A Way Home and Out on Every Phone Page (MOM-148)

* **Objective & Scope:** Size S (about 20 to 40 minutes after your design OK). At 390px only home, `/connections` and `/settings` have the header with Sign out; `/plan`, `/review`, `/log`, `/setup` and `/privacy` have no way home or out on a phone, and `/review` has no navigation link. Before the trial (owner, 2026-10-30). Reuse MOM-131's header fix so a long address never widens the page. Remove the stale "header runs wider than a phone" comments in `tests/e2e/home.spec.ts` and `tests/e2e/connections.spec.ts`.
* **Core Invariants to Protect:** *No sideways scroll at 390px* (the header spec, light and dark). *Plain words*. *The 1280px layout is unchanged* unless you approve a change.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-148: on a phone, every signed-in page has a way home and a way to sign out.

Task Instructions:
1. Read ticket MOM-148 in Jira first, and MOM-131's 2026-10-30 comment. Its acceptance criteria are the definition of done. If they and these instructions disagree, stop and flag it.
2. Read CLAUDE.md, components/layout/MobileHeader.tsx, components/layout/AppShell.tsx, app/plan/page.tsx, app/review/page.tsx, app/log/page.tsx, app/setup/page.tsx, app/privacy/page.tsx, app/globals.css (`.mobile-account`), tests/e2e/header-390.spec.ts, tests/e2e/home.spec.ts and tests/e2e/connections.spec.ts. Check the local stack with `npm run stack:status`; never run `supabase status` unfiltered.
3. Create the feature branch `feature/MOM-148-phone-navigation` off an up-to-date `main`. If MOM-145's branch is not yet merged and both change `app/globals.css`, say so: this branch merges `origin/main` before its push at day-end step F.
4. Design before coding, then STOP for my OK: (a) one shared phone header, or a minimal back-home row, on each headerless page, and why; (b) whether `/review` and `/plan` get navigation entries or only a way home; (c) what `/setup` shows mid-conversation (leaving must not lose the conversation kept in the tab); (d) the screens at 390px in light and dark. Wait for my answer.
5. Build as approved, in one shared component.
6. Tests: `tests/e2e/header-390.spec.ts` checks Sign out and a way home on every signed-in page, in light and dark; component tests for the shared header; the two stale spec comments removed. `npm test` makes no network call.
7. Run `npx tsc --noEmit`, `npm test`, `npm run build` and the header, home and connections browser specs (stop `npm run dev` first; reset the local database first). Show me the screenshots at 390px before you commit.
8. No live Claude call in this block.
9. Do not edit BACKLOG.md. Put backlog notes in the Jira comment and the close-out. Say "Privacy impact: none" and the "Build time" line in the close-out. Comment on MOM-148 with the approved design, what changed and each acceptance criterion met or unmet; do not move it to Done.
10. Commit with "feat(MOM-148): a way home and Sign out on every signed-in page on a phone". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes (with no network call); the header, home and connections browser specs pass; screenshots shown before the commit; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] You approved the header or back-home row before any code.
  - [ ] At 390px every signed-in page has a way home and Sign out, with no sideways scroll on a long address (the spec, light and dark).
  - [ ] Leaving `/setup` mid-conversation keeps the conversation in the tab.

---

# SESSION 2: THE REVIEW'S LAST PIECES AND THE TRIAL'S EMAIL

**Your prerequisites before this session:** (1) MOM-113's block 3.3 is in `origin/main` (merged after the 2026-10-30 day-end). (2) The local stack running with `main`'s migrations. (3) For MOM-122: your choice of sender (a bought domain with a mail provider, a dedicated Gmail sender, or no emails for the trial), set up by you in the provider's and Supabase's dashboards (Claude never sees the credentials), and `RECOVERY_COOKIE_SECRET` added by you in Vercel (Production and Preview, different values) before the reset template is pasted. Without a sender, skip blocks 6 and 7. (4) For MOM-123: a disposable email address you can read, and time for a walk on production. (5) Be ready to OK MOM-113's live calls and their cost.

## Block 2.1: The Review's "Change" Leads to a Real Edit (MOM-146)

* **Objective & Scope:** Size L (70 minutes or more after your design OK; split it if the design shows two parts). Layer 3 offers "Yes, I want to change it", but nothing edits a target, a priority or a goal's clash handling after setup, so the choice is only recorded (stored as `changed`). Build the edit for what layer 3 raises today: a target's floor and aim (and its shape where the adjustment is a re-baseline), a goal's priority, the clash handling. From the review, the choice opens the matching edit and returns to the sitting. A change takes effect from the person's next period and never re-grades a closed one (`lib/engine/baseline.ts`, §1.7). Not in scope: adding a goal (MOM-132), a kind of day's usual time and a task's size or date (MOM-138).
* **Core Invariants to Protect:** *Claude never scores*: the edit is the person's, validated by code. *Re-baseline without re-grading*. *Service-layer RLS*: a new service in `lib/services/` (created by this block). *Plain words, a way out of every change*. *A transition settles in one render*.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-146: the weekly review's "change" choice leads to a real edit of the target, priority or clash handling it named.

Task Instructions:
1. Read ticket MOM-146 in Jira first, and MOM-113's 2026-10-30 comment (block 3.3). Its acceptance criteria are the definition of done. If they, these instructions and docs/DOMAIN_MODEL.md §1.3, §1.7 and §3 disagree, stop and flag it.
2. Read CLAUDE.md, docs/DOMAIN_MODEL.md §1.3, §1.7, §3, lib/engine/baseline.ts, lib/engine/review.ts, lib/services/review.ts, lib/services/goals.ts, lib/services/scoreboardRows.ts, components/review/ReviewSitting.tsx, components/review/adjustmentWording.ts, app/actions/review.ts, the goal-model migrations (013 onward) and tests/e2e/review.spec.ts. Check the local stack with `npm run stack:status`; never run `supabase status` unfiltered.
3. Create the feature branch `feature/MOM-146-review-change-edits` off an up-to-date `main`.
4. Design before coding, then STOP for my OK: (a) each adjustment kind layer 3 raises today and the edit it opens (fields, words, a way out); (b) how a change takes effect from the next period, what the engine reads, and the test that a closed period keeps its grade; (c) where the edit lives (inside the review, or its own page with a return), and what home shows after; (d) the service and its RLS, and whether a migration is needed (020, only with my OK; say why the existing tables cannot hold it); (e) the screens at 390px in light and dark. Wait for my answer.
5. Build as approved. Every write goes through the new service. A state update after an `await` inside a transition is wrapped in the start function again (F-072).
6. Tests: engine tests that a change never re-grades a closed period; service tests against the in-memory fake (one person never editing another's); component tests that wait for the settled state with `findByRole`; a browser spec at 390px and 1280px from the review's "Yes, I want to change it" to the changed target on home. With a migration: its verify script, and `supabase/verify/900_table_grants.sql` updated. `npm test` makes no network call.
7. Run `npx tsc --noEmit`, `npm test`, `npm run build`, the review and home browser specs (stop `npm run dev` first; reset the local database first), and with a migration `npm run verify:sql` (all scripts). Show me the screenshots at 390px before you commit.
8. With a migration: show me the migration and `npx supabase db push --dry-run`, and stop. The production `db push` and ALL the verify scripts run only at day-end step F, after CI is green on the pull request and my OK, and before it merges.
9. No live Claude call in this block.
10. Do not edit BACKLOG.md. Put backlog notes in the Jira comment and the close-out. Say "Privacy impact" and the "Build time" line in the close-out. Comment on MOM-146 with the approved design, what changed and each acceptance criterion met or unmet; do not move it to Done.
11. Commit with "feat(MOM-146): let the review's change choice edit a target, a priority or the clash handling". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes (with no network call); the review and home browser specs pass at 390px and 1280px; npm run verify:sql passes if a migration was added; screenshots shown before the commit; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] You approved the fields, where the edit lives and any migration before code.
  - [ ] From the review, "Yes, I want to change it" opens the edit and the change shows on home (the browser spec).
  - [ ] A closed week keeps its grade after a change (the engine test).
  - [ ] Any migration waits for day-end step F (dry run shown, not applied).

---

## Block 2.2: The Trial's Email Sender (MOM-122)

* **Objective & Scope:** Size S (about 20 to 40 minutes after your choice). Only if you have chosen a sender; skip this block otherwise. Day 6 built the token reset link and its signed recovery cookie; what remains is yours in the dashboards, by the checklists on MOM-122 (custom SMTP, the template pasted after `RECOVERY_COOKIE_SECRET` is in Vercel, the hourly limit read). This block does the code side: `/privacy` names the sender (`SERVICES` in `lib/config/privacy.ts`), and with "no emails for the trial" the "Forgot password?" words change so they promise no email.
* **Core Invariants to Protect:** *No credential in the repo, a log or this session*. *Production changes need your approval*. *The repo is public*.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Finish MOM-122 for the chosen sender: the privacy notice names it, and the sign-in words match what the trial's email can do.

Task Instructions:
1. Read ticket MOM-122 in Jira first, with its 2026-10-30 close-out (the decision, the recovery cookie and the three dashboard checklists). Its acceptance criteria are the definition of done. If no sender has been chosen, say so and stop.
2. Read CLAUDE.md, lib/config/privacy.ts, components/privacy/PrivacyNotice.tsx, components/auth/SignInForm.tsx, components/auth/ForgotPasswordForm.tsx, supabase/templates/recovery.html and app/auth/callback/reset/route.ts.
3. Create the feature branch `feature/MOM-122-sender` off an up-to-date `main`.
4. Ask me which option I chose and which dashboard steps are done (by name only; never ask for or print a credential, a key or a password). Then design, and STOP for my OK: (a) the `/privacy` line naming the sender; (b) for "no emails for the trial", the new words on "Forgot password?"; (c) what I check in the dashboard before the template is pasted (`RECOVERY_COOKIE_SECRET` in Vercel first, then the URL allow-list for `/auth/callback/reset`). Wait for my answer.
5. Build as approved. Never run `vercel env` without my OK.
6. Tests: the privacy notice test names the sender; a component test for any changed words. `npm test` makes no network call.
7. Run `npx tsc --noEmit`, `npm test` and `npm run build`, and the auth browser specs if words changed (stop `npm run dev` first).
8. Add to docs/plans/.pending-live-checks.md: `- [ ] MOM-122: after the deploy and the template paste, ask for a reset on one device and open the link on another; it works`.
9. No live Claude call in this block.
10. Do not edit BACKLOG.md. Put backlog notes in the Jira comment and the close-out. Say "Privacy impact" and the "Build time" line in the close-out. Comment on MOM-122 with the sender's category (never a credential), the hourly limit number I read, and each acceptance criterion met or unmet; do not move it to Done.
11. Commit with "feat(MOM-122): name the trial's email sender in the privacy notice". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes (with no network call); no credential anywhere in the repo, a log or this session; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] You set the sender in the dashboard yourself; no credential appeared in the session.
  - [ ] `/privacy` names the sender (or the words say no email, for that option).
  - [ ] The hourly limit is recorded on the ticket as a number only.

---

## Block 2.3: Walk Sign-Up and Password Reset on Production (MOM-123)

* **Objective & Scope:** Size S (about 20 to 40 minutes). Only after block 2.2, with a sender in place. Walk sign-up, email confirmation, sign-out and password reset on the deployed site with a disposable address you control, then delete that account in the dashboard so production holds one user again. Claude guides and records; you do every production step by hand.
* **Core Invariants to Protect:** *Standing smoke-test account*: Claude never creates, edits or deletes users on production. *The repo is public*: the disposable address is never written to a committed file.
* **CLI Session Config:** Model: Sonnet | Effort: Low

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Run MOM-123: walk sign-up, confirmation, sign-out and password reset on production with a disposable second account, by hand.

Task Instructions:
1. Read ticket MOM-123 in Jira first, and MOM-122's 2026-10-30 close-out. Its acceptance criteria are the definition of done. If MOM-122's sender is not in place, say so and stop.
2. No branch and no code unless a step fails. Give me the walk one step at a time and wait after each: (a) sign up on the deployed site with a disposable address I control; (b) confirm from the email (note which browser opened it); (c) sign in, see home, sign out; (d) ask for a password reset, open the link on another device, set a new password, sign in; (e) in the Supabase dashboard, delete the disposable account (Authentication, Users). Never ask for the address, a password or a link's token; I report each step as "worked" or what I saw.
3. After step (e), count users with a count-only query, after my OK: `npx supabase db query --linked -o table "select count(*) as users from auth.users"` must say 1.
4. If a step fails, stop, describe what I saw, and propose a fix as its own branch `feature/MOM-123-<short>` with my OK.
5. No live Claude call in this block.
6. Comment on MOM-123 with each step's result, the user count after, and each acceptance criterion met or unmet, with the "Build time" line; do not move it to Done. If no code changed, there is no commit; otherwise commit with "fix(MOM-123): <what the walk found>" on the feature branch.

Definition of Done: the walk done by the owner with each step recorded; the disposable account deleted and production back to one user; Jira commented; any fix committed on the feature branch, not merged and not pushed.
```

* **User Verification Gate:**
  - [ ] You walked sign-up, confirmation, sign-out and reset on production, and each step is on the ticket.
  - [ ] You deleted the disposable account; the count says 1 user.
  - [ ] No address, password or token appears in the session or the repo.

---

## Block 2.4: Review Block 3.4 and Layer 2's Tone (MOM-113)

* **Objective & Scope:** Size M (about 40 to 70 minutes after your design OK). Block 3.4 of the weekly review: "Still right for you?" at the first review, on a suggestion the person took at setup, through `listUnconfirmedStartingPoints()` and `answerStartingPoint()` (MOM-134), skipping a mark whose value the person has since changed. With it, layer 2's tone: the `nothing_judged` line ("…so it carries no verdict") is correct but robotic; tune the prompt for warmth within the same rules (one sentence, no number, no ask). The other deferred triggers (repeated priority exceptions, a goal clash), wiring the deadline forecasts in, and the "full" reflection questions stay on the ticket unless the design stop brings one in with your OK.
* **Core Invariants to Protect:** *Claude never scores*: code checks every reply. *Live calls cost money*: each waits for your OK and its cap. *A Claude call sends only the fields the privacy notice lists* (`tests/review-prompt-fields.test.ts`). *The person's word beats any source*.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-113 block 3.4: "Still right for you?" on a suggestion taken at setup, and layer 2's line in a warmer tone within the same rules.

Task Instructions:
1. Read ticket MOM-113 in Jira first, with its 2026-10-30 comments (block 3.3 and the day-end fix). Its acceptance criteria are the definition of done for the whole ticket; this block covers part of them. If they, these instructions and docs/DOMAIN_MODEL.md §2.1 rule 4 and §3 disagree, stop and flag it.
2. Read CLAUDE.md, docs/DOMAIN_MODEL.md §2.1 and §3, docs/LLM_GOVERNANCE.md, lib/engine/review.ts, lib/services/review.ts, lib/services/startingPoints.ts, lib/services/reviewReflection.ts, lib/review/reflection.ts, lib/ai/review.ts, components/review/ReviewSitting.tsx, components/review/adjustmentWording.ts, tests/review-prompt-fields.test.ts, tests/live/review-line.live.ts and tests/e2e/review.spec.ts. Check the local stack with `npm run stack:status`; never run `supabase status` unfiltered.
3. Create the feature branch `feature/MOM-113-still-right-and-tone` off an up-to-date `main`.
4. Design before coding, then STOP for my OK: (a) when "Still right for you?" shows (first review only, one at a time or all together), its words and choices, and how an answer is stored through `answerStartingPoint()`; (b) how a mark whose value the person has since changed is skipped (store the value at save, or compare the row's `updated_at` with the mark's `created_at`), and whether that needs a migration (020 or 021, only with my OK); (c) how it sits beside layer 3's one adjustment (the review raises one thing at a time); (d) the prompt change for warmth, word for word, with the rules unchanged and the fields sent unchanged; (e) the live calls: cases, number of calls and the cap (about 3 to 6 calls, $0.10). Wait for my answer.
5. Build as approved. A state update after an `await` inside a transition is wrapped in the start function again (F-072).
6. Tests: engine and service tests for "Still right for you?" (shown once, skipped after a change, answered once); component tests that wait for the settled state with `findByRole`; the prompt-fields test unchanged or updated with the privacy notice; the fake-model tests for the new wording; a browser spec at 390px. With a migration: its verify script and the grants allow-list. `npm test` makes no network call.
7. Run `npx tsc --noEmit`, `npm test`, `npm run build`, the review browser spec (stop `npm run dev` first; reset the local database first), and with a migration `npm run verify:sql` (all scripts). Show me the screenshots at 390px in light and dark before you commit.
8. The live calls: only after my OK in step 4 and again right before they start (say the calls and the cap). Local stack, throwaway data, through `lib/services/llm.ts`. Report each line, its tokens and cost, and whether it passed the checks first time.
9. With a migration: show me the migration and `npx supabase db push --dry-run`, and stop; production waits for day-end step F.
10. Do not edit BACKLOG.md. Put backlog notes in the Jira comment and the close-out. Say "Privacy impact" and the "Build time" line in the close-out. Comment on MOM-113 with the approved design, what changed, the live calls' numbers, and each acceptance criterion met, partly met or not started; do not move it to Done.
11. Commit with "feat(MOM-113): ask whether a setup suggestion is still right, and warm up layer 2's line". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes (with no network call); the review browser spec passes; npm run verify:sql passes if a migration was added; live calls made only with my OK; screenshots shown before the commit; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] You approved the question, its storage, the prompt change and the live calls' cap before code.
  - [ ] "Still right for you?" shows once at the first review and is skipped after the person changed the value (the tests).
  - [ ] The live lines read warmer and passed the same checks (the close-out's numbers).
  - [ ] Claude wrote words only; no number from Claude is stored.

---

# FINAL DAY-END BUILD VERIFICATION & PULL REQUESTS

Run after the last block of the day, or type `/day-end` and let it run these in this order: **A, B, D, E, then F (the one push, after your OK), then C (live checks, after the pull requests have merged and Vercel has deployed)**. Stop on the first failure. When the whole sequence has finished and you say so, `/day-end` ends with the line `Tomorrow: /day-start (Sonnet / Low)`.

**The build day's window.** The day starts at the previous day-end's last merge, not at midnight, so a day-end that runs past midnight sees the same work. It is the newest merge on `origin/main` of a step E branch, found by the branch name, which always ends in `-next-build-plan-doc`: `git log origin/main --merges -n 1 --grep="next-build-plan-doc" --format="%h %cI %s"`. `/day-end` prints it as `Window: after <hash> (<date>, <subject>)` at the start and reuses that hash in steps B, D and F (it never recomputes it, because today's own step E branch will have merged by then). If there is none, you give a start date. Below, `<window>` means that hash.

**When there is nothing to sync.** `/day-end` stops at the start only if all four hold: no unmerged branches; no open backlog item without a Jira key; no entry marked `unreviewed` in `docs/FAILURE_LOG.md` (`docs/RAID_LOG.md` is frozen and is not checked); and no ticket with commits on `origin/main` in the window that Jira still shows as neither Done nor Closed. It names each condition, and says which ones kept it going. Failure entries carry the `unreviewed` mark in their heading line (`### F-0nn · … · unreviewed`); an entry drafted without the mark is still a waiting entry, so also look at the entries added in the uncommitted changes to the log (failure log F-061, MOM-124).

**Your log edits and branch switches.** If you hold uncommitted edits to `docs/FAILURE_LOG.md` or `docs/RAID_LOG.md` and a branch's copy of either file differs, a plain `git switch` aborts. Before each switch `/day-end` checks for this, says so in plain words, backs both files up, stashes them (`git stash push -- <the two files>`), switches and pops. If the pop conflicts, it stops, restores from the backup and asks you. It never stages a log file for this; only the entries you approve in step D are staged.

**The trial.** Day 7 is the last build day before the family trial (Tue 2026-11-03). Whatever did not finish today goes first on the next build day, in the trial's go/no-go order: anything left of MOM-111's quick path, MOM-148, MOM-146, MOM-122 and MOM-123, then the rest. MOM-114 ships as "defaults only" for the trial. MOM-132, MOM-138 and the rest of MOM-124 come after the trial starts.

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

`npm run test:e2e` and `npm run verify:sql` also run in CI on every pull request. Run them here for a branch with a migration (stop `npm run dev` first; check the stack with `npm run stack:status`; reset the local database to the branch's migrations first with `npx supabase db reset --local`); for the rest, the blocks ran their own specs and CI's `database` job is the full-suite gate (MOM-141). Any server error in the e2e output is a failure, with two known exceptions until MOM-124's expected-lines list exists: the wizard spec's two `[task-plan-ai] the API key was rejected { httpCode: 401 }` lines and the `[synced-entries] not counted … reason: 'no_source'` lines from the Hevy "no bound target" spec. A jsdom test that fails a full run and passes alone is a failure to fix, not a flake to rerun (MOM-96; failure log F-072 found a real UI race behind one).

Generated route types outlive a branch switch: a browser test run leaves the development server's in `.next/dev`, and a production build leaves its own in `.next/types` (failure log F-028, F-039). Delete both folders (git-ignored, rebuilt by the next build or `npm run dev`) before the checks on each branch; if `tsc` or the build still fails only in a file under `.next/`, delete them and run the check again; any other failure is real. MOM-130 builds this into the commands.

## B. Database verification (production), only if migrations were applied in the window

A migration is in the window when `git log --branches --remotes --not <window> --name-only --format=%h -- supabase/migrations` lists a file (020 or 021, if a block added one). B also runs when a script in `supabase/verify/` changed in the window, because production is where those scripts are proven. **Git Bash only.** This loop uses `/tmp`, `grep`, `$(...)` and `for ... done`, which do not work in PowerShell. `npm test` does **not** run these scripts. Every script must report `false 0` and a non-zero `true` count (0 and 0 means the script errored).

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
   - Executive Overview & Architectural Invariants, and the Standing Rules (Jira first, production approval, verify scripts, no pushes inside blocks, blocks never edit BACKLOG.md, the build-time line, the lighter log rule, standing smoke-test account).
   - A "Today's runbook" section near the top, after the metadata header and before the first block: a table with one row per block, in order, giving `/run-block MOM-n`, the session setting (model / effort) and, in plain words, what to check at the gate. The table's first row is `/day-start` (Sonnet / Low) and its last row is `/day-end` (Opus / High), each with its own plain-words gate text; `npm run plan:check -- --strict` warns when either is missing or out of place. The text above the table also says that `/day-start` comes first and `/day-end` last.
   - Logical Session Blocks grouping high-priority tickets, in dependency order, each in the format `npm run plan:check` enforces: a heading `## Block <n>.<m>: <title> (MOM-<n>)` with exactly one ticket key (unique in the plan); a `* **CLI Session Config:** Model: X | Effort: Y` line; exactly one fenced `text` prompt that names its ticket and carries a commit message `type(MOM-n): ...`; and a `* **User Verification Gate:**` checklist. Before each session's first block, a `**Your prerequisites before this session:**` note (it may say none). Give each block a size in its objective (S about 20 to 40 minutes, M about 40 to 70, L 70 or more, timed from the design OK) until MOM-124 adds a Size field.
   - Block prompts that follow the pull-request workflow (CLAUDE.md): create the feature branch off an up-to-date `main`; commit on it with the Jira key; do NOT merge into `main` and do NOT push (the one push is at day-end, step F, after my OK); do NOT edit BACKLOG.md (notes go in the Jira comment and the close-out); give the "Build time" line in the close-out; end with "Definition of Done: ...; committed on the feature branch." A block with a migration says: run `npm run verify:sql` locally, show the migration and `npx supabase db push --dry-run`, and run production `db push` and then ALL the verify scripts only after CI is green on its pull request and I say OK, and before that pull request merges (merging deploys to Vercel). A block that needs another ticket's code says it "must already be in origin/main" and stops if it is not. When two blocks add migrations on separate branches, number them in the order they will be pushed, and say that the later branch merges origin/main before its push. A block that changes a screen shows screenshots at 390px, in light and dark, before it commits.
   - Dynamic CLI Session Config (Sonnet / High for architecture, security and database work; Sonnet / Medium or Low for standard UI and tests).
   - Copy-pasteable prompts including tsc --noEmit, npm test, npm run build, feature branching with the commit left on the feature branch (never merged into `main` locally and never pushed; `main` takes it through a pull request, see the pull-request bullet above), and Jira updates.
   - User Verification Gates for each block.
   - Final Day-End Build Verification & Pull Requests section (steps A, B, D, E, then F the one push, then C the live checks after the merge), with the step B verify loop marked Git Bash only, step D never moving a ticket or an epic to Done (it only comments, creates tickets and proposes Closed, with a pause for my OK), step F ending with a post-merge list of Done transitions that waits for my OK, and step D's log step carried from the rules MOM-133 put in CLAUDE.md and `/day-end` (no nightly "predicted it?", no new RAID rows, the weekly top 5 and the monthly pattern review), including the playbook question, and including this instruction in step E.
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
3. For a branch with a migration (MOM-146's 020 or MOM-113's 021, if added): production `npx supabase db push --dry-run`, then `db push`, then ALL the verify scripts (step B's loop), only after CI is green and your OK, and **before** that pull request merges.
4. Merge each pull request with a merge commit (the GitHub button, or `gh pr merge` after your OK), in the runbook's order, a migration's pull request after its migration is on production. If two pull requests conflict in a shared file (block 2's dark palette and block 4's phone header both touch `app/globals.css` and the dark baseline), merge `origin/main` into the later branch locally, keep both sides, rerun its checks and push that with your OK.
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

- [ ] Sign in as the standing smoke-test account and walk the flows you touched today (the quick path if a setup is still open for that account, dark mode on your phone, home without the old controls, a way home from `/plan` and `/review` on your phone, the review's change if it is due for that account).
- [ ] Only the standing smoke-test account exists (`users = 1` in step B, until real users exist). If its data is cluttered, delete and recreate it in the Supabase dashboard (Add user, Auto Confirm); never share or store its password.
- [ ] Walk every item in `docs/plans/.pending-live-checks.md` (the post-push checks the blocks deferred), then clear the items that are done; an item that still waits stays.

---

## Open Decisions and Risks (read before starting)

| Item | Why it matters |
| --- | --- |
| **Build day 7, after N = 6; the trial starts Tue 2026-11-03** | Day 6 built every planned block but MOM-123 (waiting on an email sender); its pull requests merge after the 2026-10-30 day-end, MOM-30 first. Day 7 is the owner's pre-trial order, with no scope cuts. Anything that does not finish goes first on the next build day. |
| **The family trial's go/no-go** | The quick path that keeps what was said (block 1), a way home on every phone page (block 4), the review's change leading somewhere (block 5), and the trial's email (blocks 6 and 7, or the owner's decision to run without emails). The dark vibrancy and the old-model leftovers on home are the owner's picks for what testers meet first. |
| **The trial's email sender** | No domain yet on 2026-10-30. The options and dashboard checklists are on MOM-122: a bought domain with a provider, a dedicated Gmail sender (small trial only), or no emails for the trial (testers created by hand). `RECOVERY_COOKIE_SECRET` goes into Vercel before the reset template is pasted, or the token link shows the expired message. |
| **Live Claude calls today** | Block 8 (MOM-113): about 3 to 6 calls, $0.10 cap, each with your OK. `npm test` never calls Claude. |
| **MOM-114 is "defaults only" for the trial** | Owner decision, 2026-10-29. Two review messages send the person to "Open settings" to set their day end and planning day, but `/settings` holds only Account, Theme and Sign out: either those words change or the two fields come first (MOM-144's audit, in BACKLOG under MOM-114). |
| **After the trial starts** | MOM-132 (add a goal or target after first setup), MOM-138 (a kind of day's usual time, a task's size or date), MOM-139, MOM-140, the rest of MOM-124, the rest of MOM-115. |
| **Migrations 020 and 021** | Only MOM-146 and MOM-113 3.4 may take them, numbered in push order, each with your OK at the design stop. Production holds 001 to 019 (677 verify checks passing after 019). |
| **A transition settles in one render** | Failure log F-072: a state update after an `await` inside a transition can render before the pending flag clears. Fixed on MOM-113 and MOM-30; 10 call sites on `main` remain (MOM-147, not scheduled today). New code follows invariant 10. |
| **The build machine's memory** | The full local browser suite runs out of memory (MOM-141, `risk`), and on 2026-10-30 step A took about 3 hours at 84% in use. Close what you do not need before heavy steps; CI's `database` job is the full-suite gate. MOM-124 adds a memory report to `/day-start` and a restart reminder to `/day-end`. |
| **`set_updated_at()` grants** | Executable by the API roles since 001, unlike the trigger functions 012 locked down (MOM-137, `risk`). Low practical risk; not scheduled today. |
| **Stale generated types** | Generated route types outlive a branch switch (F-028, F-039). Until MOM-130 builds it into `/day-start` and `/run-block`, delete `.next/types` and `.next/dev` before the type check and build on a branch you just switched to. |
| **Standing smoke-test account** | `smoke-test@momentum-app.test` exists on production. Every live gate signs in as it; its password stays in your password manager. Production must hold exactly one user at day-end step B; block 7's disposable account is created and deleted by you, before the day-end. Its goal-model data is created through setup and logging only. |
| **The old model stays until MOM-115** | Block 3 hides its controls on home only. The wizard, rebalance and checkbox criteria keep running, with the completion guard of migrations 002 and 008. New code follows `docs/DOMAIN_MODEL.md` and is built beside the old tables. |
| **Not scheduled, queued with keys** | Thin slice, later: MOM-113's other deferred triggers, the forecast wiring and the "full" reflection; MOM-112's remaining work (merge suggestions on screen, entry controls on home and retiring `/log`, auto-counted entries undoable); MOM-115 (retire the old model). Tooling: MOM-124 (memory report, restart reminder and the rest), MOM-130, MOM-127, MOM-141, MOM-147. Security: MOM-137, MOM-119. Logs: MOM-135. Deferred: MOM-126 (minors safeguards; the trial is adults only). Follow-ons during the trial: MOM-117, MOM-136, MOM-118. Other: MOM-109, MOM-110 (the real-iPhone check), MOM-98, MOM-99, MOM-100, MOM-101, MOM-74, MOM-91, MOM-95, MOM-97, MOM-70, MOM-26, MOM-39. |
| **Risks live in Jira** | Since MOM-133, new risks are Jira tickets with the `risk` label, reviewed as a weekly top 5 at the first day-end of the week (the next one is the first day-end on or after Mon 2026-11-02); `docs/RAID_LOG.md` is frozen history. The first day-end of November also runs the monthly pattern review of the failure log (October's entries). |
| **Pull requests, not direct pushes** | `main` is protected (MOM-67): every change reaches it through a pull request with `checks` and `database` green, merged with a merge commit. `/run-block` commits on a feature branch and never merges; branches are pushed only with your OK. A production migration is applied before its pull request merges (merging deploys to Vercel). |
