# 🚀 MOMENTUM BUILD: NEXT-PHASE MASTER EXECUTION PLAN

> **Date:** 2026-11-02 | **Active Epic:** MOM-105 | **Base Commit:** c5483d4

> **Since the last plan (build day 8, Sun 2026-11-01):** every planned block was built on Sunday, Session 2 included, each on its own branch, and the second 2026-11-01 day-end pushes them for pull requests in this order: MOM-120 (the plan spec's sites wait for the settled control; the 9 review sites remain), MOM-124 (`npm run project:check` as step 0 of the three day-loop commands, and a push notification at every planned stop), MOM-132 part 2 (adding a goal or a target after setup: the screens, the server actions and the returning conversation), MOM-150 (creating an account gets its own screen and a clear check-your-email state) and MOM-138 (a kind of day's usual time and a deadline task's size, steps or date, edited from home's forecast). The day-end's step D branch (backlog; MOM-159 to MOM-164 created; failure log F-082 to F-085) and step E branch (this plan) go with them. Step A passed the five branches stacked in merge order on `origin/main`: 157 files and 5,223 tests, the build, and 11 browser spec files one at a time, with "destination stream errored" counted at 0 in every output. It found one failure: the 390px header sweep's guard did not list MOM-138's two new pages; fixed on MOM-138's branch with the owner's OK (2f952da), which led to a new rule below. No migration was added, so production holds 001 to 021 and the next free migration number is still **022**, which MOM-165 takes.

> **The calendar to the trial (owner, 2026-11-01):** **Mon Nov 2:** MOM-163 (sign-in and sign-up words, before the freeze because the trial starts Nov 7), then MOM-165 (setup cost limits and token logging, from Company HQ's cost review; migration 022 on production before the freeze), then MOM-120's review sites, then MOM-164 (PM docs upkeep). If Monday runs long, MOM-120 and MOM-164 move to Tuesday; MOM-163 and MOM-165 must land before the freeze. Wed Nov 4: fixes from the owner's own smoke test only. **Production freeze from Thu Nov 5 until after 10:30 am PT Fri Nov 6.** **The family trial starts Sat Nov 7.** After Nov 6: MOM-157 (stay signed in on the phone home-screen app, a trial prerequisite), MOM-155 (Google consent screen), then MOM-115, MOM-117 and integration hardening; MOM-156 (the two-model setup trial) on Tue Nov 10.

---

## Today's runbook

**How to run a day.** Type `/day-start` first: it only reads and reports. Then type the command in the table below for each block, in this order, and skip any block whose Jira ticket is already Done. Each command first shows the block's model and effort: if your session differs, it stops and tells you the exact `/model` and `/effort` to type (use the session-only choice in the `/effort` slider, so your saved default is left alone), and you start the command again. Run `/clear` between blocks. When the last block is done, type `/day-end`. Nothing is pushed, merged or applied to production without your explicit OK, and work reaches `main` only through a pull request once both CI jobs are green.

| # | Type | Session setting | What to check at the gate |
| --- | --- | --- | --- |
| 0 | `/day-start` | Sonnet / Low | A clean tree apart from your uncommitted failure-log entries F-086 to F-090 (unreviewed); `main` matching `origin/main` with every second-2026-11-01 pull request merged (MOM-120, MOM-124, MOM-132, MOM-150, MOM-138, and the day-end's MOM-16 and MOM-105 branches); `npm run project:check` passing (new since MOM-124); production migrations 001 to 021; no leftover branches; the plan passing its format check; no missing environment variable names; `npm run stack:status` answering in one line. Then the carry-overs in `docs/plans/.pending-live-checks.md`. |
| 1 | `/run-block MOM-163` | Sonnet / Medium | Size S. You approved the words for a wrong password and the resend line (and production's resend window, read by you from the dashboard) before code; a wrong password shows a plain line that never says whether the address has an account; the auth spec passes at 390px and 1280px; screenshots shown in light and dark. |
| 2 | `/run-block MOM-165` | Sonnet / Medium | Size M. You approved the per-person and overall numbers (with how calls are counted today), the refusal words and migration 022 in full before any edit; a setup turn's usage row carries input, output, cache-read and cache-write tokens; the 40-turn cap is unchanged; `npm run verify:sql` passes; the migration and its dry run were shown, not applied. |
| 3 | `/run-block MOM-120` | Sonnet / Medium | Size M. You approved the settled marker, the 9 review sites and the decision on the extra `router.refresh()` before code; each site waits for the marker, never a timeout or network idle; the review specs ran with the stream line counted at zero in every output. |
| 4 | `/run-block MOM-164` | Sonnet / Medium | Size M. You approved the sources list, the test, the step D sub-step's words, the "PM docs impact" line and the two CLAUDE.md lines before any edit; the source test fails once on purpose and passes; the docs are current to `main` with today's date and Open gaps. |
| 5 | `/day-end` | Opus / High | Step A checks each branch stacked in merge order on `origin/main`, with header-390 in the browser specs for any branch that adds a page and `npm run verify:sql` for MOM-165's; migration 022 goes to production at step F after CI is green and your OK, before its pull request merges, with every verify script after it; production holds one user. This is the first day-end of the week: it shows the weekly top 5 risks, and reviews failure entries F-086 to F-090. |

**Your manual steps (owner, by hand):** (1) For MOM-163's design stop, read production's per-address email resend window in the Supabase dashboard, so the resend line can match it. (2) Before the trial, add each tester's Gmail as a test user on the Google consent screen (MOM-155: stay in Testing for the trial). (3) The smoke-test persona's setup on production on your phone, signed in as the standing smoke-test account, if it has not happened yet (see the pending live checks).

If a block needs another ticket's code, `/run-block` checks that code is already in `origin/main`. If it is only on an unmerged branch, it stops and offers two ways forward: push that branch and merge its pull request first, or stack this block on that branch (only with your OK). **Every block needs the second 2026-11-01 pull requests merged**: MOM-163 builds on MOM-150's sign-up screen; MOM-165 changes the setup limits MOM-132's returning conversation also uses; MOM-120's review fix builds on its plan-spec fix; MOM-164 edits the command files MOM-124 changed and documents MOM-132 and MOM-138.

---

## Executive Overview & Architectural Invariants

This plan covers Mon Nov 2, the last full build day before the production freeze. It makes sign-in's error words plain before testers meet them (MOM-163), gives setup a real per-person limit, room for several adults to onboard on the same day and token logging with cache reads and writes (MOM-165, migration 022), finishes the CI reliability work on the review specs with an app-side settled marker (MOM-120), and keeps the PM docs current with sources, a test and a day-end sub-step (MOM-164).

`docs/DOMAIN_MODEL.md` is binding for all new code. The old model stays in the code until MOM-115 retires it, so new code is built beside the old tables, never into them. Every block preserves these invariants:

1. **Claude never scores.** The engine (`lib/engine/`) computes every number from entries and the target in force; no Claude output is stored as a number, and setup's draft is validated by code, not by Claude (DOMAIN_MODEL §1.7, principle 9).
2. **The person's word beats any source.** A manual entry or correction always wins over a sync; a value the person typed beats a suggestion; corrections are keyed to the source's own record id (§1.5, §1.6).
3. **Never assume anything about a person's life.** Time zone, week start and day end are the person's to set; the quick path applies no default (§2.3); a suggestion the person took is a starting point, checked at their first review (§2.1 rule 4). No default goal, start or order.
4. **Unfinished work moves, habits never carry over.** (§1.4, principle 11.) A changed target takes effect from the period after the reviewed one and never re-grades a closed one (§1.7, MOM-146); a target added later is graded only from its own start (MOM-132, migration 021); a forecast edit changes only what home computes from now on (MOM-138).
5. **Service-layer RLS enforcement.** The UI never queries Supabase. Every read and write goes through `lib/services/`; every new table has row level security keyed to its owner, explicit grants and an entry in `supabase/verify/900_table_grants.sql`'s allow-list.
6. **The old model's guards stay until MOM-115.** Nothing in this plan removes a table, migration or service of the old model.
7. **Nothing is saved until final approval** in setup, every Claude call goes through `lib/services/llm.ts`, and a Claude call sends only the fields the privacy notice lists (pinned by a test).
8. **A stored record of what was said is never rewritten** (RAID R-26).
9. **Plain words** (DOMAIN_MODEL §2.1): everyday words with a reason, the person's own words restated, a way out of every change, "what do you mean?" always answered.
10. **A transition settles in one render** (failure log F-072, F-079, MOM-147): a state update after an `await` inside a transition's start function is wrapped in the start function again (`tests/transition-sweep.test.ts` sweeps for it), and its test waits for the settled control with `findByRole`, not only the message or the call. A browser spec waits for the settled control (or, where none is left, an app-side settled marker) before it navigates, reloads or ends (MOM-120).
11. **A main button is never disabled or faded** (MOM-145): while work is in flight it stays solid and says it is busy; a single-answer input shows no button until it has a value; a form with several fields answers a tap with a plain callout naming what is missing. `tests/main-button-rule.test.ts` sweeps every component.

## Standing Rules (every prompt below repeats what it needs)

- **Read the Jira ticket first.** If its title, scope or acceptance criteria disagree with the prompt, or the prompt disagrees with `docs/DOMAIN_MODEL.md`, stop and flag it.
- **A fix covers its pattern, not only the instance (owner, 2026-11-01, MOM-92's October review).** A fix names its pattern and searches for the same pattern in the same session. Every other hit is fixed or ticketed before the commit.
- **Approvals go into the ticket when they are given (failure log F-087).** Approved words and decisions are written verbatim into the ticket's Jira comment at the design stop, before any code, so a `/clear` or a new thread cannot lose them.
- **Whoever hands off a block checks the written plan against the handoff (failure log F-090).** A block that came from a handoff is printed in full after the plan is written, and the handoff's owner checks every item survived.
- **Production changes need your approval.** A prompt stops before `supabase db push`, `vercel env`, or any push to `origin`, shows what will happen, and waits. Never use the SQL Editor. Tests never run against production and never use production credentials.
- **Database checks are not part of `npm test`.** They live in the SQL scripts in `supabase/verify/` and run with `npm run verify:sql` (local stack) or, against production, with the step B loop. After any migration, or any change to a verify script, run **all** of them; every row must show `passed = true`. A local total is not a production total: one script has checks that run only on production (RAID R-16, failure-log F-027).
- **New migrations, numbered in push order:** the next free number is **022**, and MOM-165 takes it (usage-log token columns), only with your OK at its migration stop. Any other block whose approved design needs one takes 023. A later branch with a migration merges `origin/main` before its push. Never edit an applied migration.
- **Pull requests, not local merges.** `main` is protected: work reaches it only through a pull request with the CI jobs `checks` and `database` green, merged with a merge commit (CLAUDE.md). A block commits on its feature branch and stops: it never merges into `main` and never pushes. Branches are pushed only with your explicit OK (normally once, at day-end step F; a branch with a migration may be pushed mid-day with your OK, CLAUDE.md).
- **A migration is applied before its pull request merges.** A block with a migration runs `npm run verify:sql` locally, shows the migration and `npx supabase db push --dry-run`, and stops. Once CI is green on its pull request and you say OK, the production `db push` and then ALL the verify scripts run, before that pull request merges (merging deploys to Vercel, and the new code needs the new schema).
- **Blocks never edit `BACKLOG.md`.** A block's backlog notes, new gaps and follow-ups go in its Jira comment and its close-out; day-end step D writes `BACKLOG.md` once, on its own branch.
- **Build time.** Each close-out and Jira comment gives `Build time: about <n> min, not counting waits on me (<size band>)`: working time from the design OK to the commit, leaving out design and look reviews, screenshot OKs, live-call OKs and dashboard steps you do by hand. If the block was not timed, it says "not measured", never a guess (failure log F-076). Day-end step E builds its planned-versus-actual table from these lines.
- **Run the specs of every page you change** (failure log F-078), not only the spec you wrote: a block that changes a page runs that page's browser specs too. **A block that adds a page under `app/` also runs `tests/e2e/header-390.spec.ts`** (failure log F-082, MOM-124): its guard fails for any page missing from the 390px sweep. CI's full run comes only after the day-end push.
- **A screen design lists its words as plain text at the design stop** (failure log F-073), so you read them as a tester before any pixel; Claude reads every screenshot the same way, words top to bottom first, layout second, before you see it. A block that changes a screen saves its screenshots in `C:\Users\matth\momentum-screenshots\<block>\` (for example `MOM-163-sign-in-words`), at 390px (and 1280px where the layout changes), in light and dark, and shows them to you before it commits. A test that compares dates also runs once with the browser's clock across a day boundary from the person's (F-069).
- **Say where a paste goes in plain words** (failure log F-081): a project and folder named for you are a plain line of text, never code formatting, and every session's pastes start with the folder change as its own paste.
- **Dashboard steps come from files** (MOM-149): anything you paste into a dashboard is copied from a file opened in an editor, never from terminal output.
- **Is the local stack up?** Ask it with `npm run stack:status` (it prints only "Local Supabase stack: running" or "Local Supabase stack: not running"). Never run `supabase status` unfiltered: its output holds the local stack's keys (failure log F-047, F-049, F-051, F-057, F-059), and `.claude/settings.json` denies it.
- **Logs (MOM-133).** A failure-log entry is written only when it leads to a fix made that session, a new standing rule or a Jira ticket, and names which; it is marked `unreviewed` until the day-end. `docs/RAID_LOG.md` is frozen: a new risk, assumption, issue or dependency becomes a Jira ticket with the `risk` label.
- **Claude calls cost money.** `npm test` never calls Claude: model calls in tests go through a fake. A block that wants a live Claude call says how many calls and the cost cap and stops for your OK first, and it is logged through `lib/services/llm.ts`. No block in this plan plans one.
- **Stale generated types.** Generated route types under `.next/` outlive a branch switch (failure log F-028, F-039). Until MOM-130 builds it into the commands, delete `.next/types` and `.next/dev` (both git-ignored and regenerated) before `npx tsc --noEmit` or `npm run build` on a branch you just switched to.
- **Memory on the build machine.** The full local `npm run test:e2e` runs out of memory (MOM-141). Close what you do not need before heavy steps; run a block's own specs and its changed pages' specs one at a time; CI's `database` job is the full-suite gate. A jsdom test that fails a full run and passes alone is a failure to fix, not a flake to rerun (MOM-96).
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
SESSION 1: SIGN-IN WORDS, SETUP COST LIMITS, THE REVIEW SPECS, THE PM DOCS (MOM-163, MOM-165, MOM-120, MOM-164)   Mon 2026-11-02, freeze Thu 2026-11-05, trial Sat 2026-11-07
  - A wrong password and the resend window in plain words, before testers meet them
  - Setup cost limits for the trial and token logging with cache reads and writes (migration 022)
  - The review specs wait for an app-side settled marker after "Finish review"
  - The PM docs name their sources, a test guards them, and day-end keeps them current
```

*Order is the owner's (second 2026-11-01 day-end, and Company HQ's cost review the same day). MOM-163 first, because testers meet sign-in first and it must land before the freeze; MOM-165 next, because its migration must reach production before the freeze; MOM-120 then, so CI's `database` job is reliable before the trial; MOM-164 last, docs and tooling only. If Monday runs long, MOM-120 and MOM-164 move to Tuesday; MOM-163 and MOM-165 must land before the freeze. Safe stopping points: after each block. Anything else unfinished goes into Wednesday's plan only if it is a fix from the owner's smoke test; otherwise after Nov 6. MOM-114, MOM-159 and the `/run-block` half of MOM-124's header-390 rule run only if the day has room, from the next plan.*

---

# SESSION 1: SIGN-IN WORDS, SETUP COST LIMITS, THE REVIEW SPECS, THE PM DOCS

**Your prerequisites before this session:** (1) Every second-2026-11-01 pull request is merged; `/day-start` shows it. (2) Docker Desktop running and the local stack started (`npx supabase start`; `npm run stack:status` says running) for the browser tests and MOM-165's `npm run verify:sql`. (3) Close what you do not need before the heavy steps (MOM-141). (4) Production's per-address resend window, read from the Supabase dashboard, for MOM-163's design stop. (5) Be ready to read MOM-163's words as a tester, MOM-165's numbers and migration 022, and MOM-164's sources list and command wording, at their design stops.

## Block 1.1: Sign-In and Sign-Up Words: a Wrong Password, the Resend Window, Long Addresses (MOM-163)

* **Objective & Scope:** Size S (about 20 to 40 minutes). MOM-150 gave creating an account its own screen, and left three things: a wrong password still shows Supabase's raw "Invalid login credentials"; the resend line says "Wait a minute" while production's per-address window is probably longer than the local 1 second; and long addresses in the check-your-email card break mid-word (`break-all`). Map the wrong password to plain words in `lib/services/auth.ts` (as MOM-150 did for the resend window), make the resend line match production's real window, and decide the long-address look. Before the freeze: the trial starts Sat Nov 7.
* **Core Invariants to Protect:** *Plain words*. *A main button is never disabled or faded*. A wrong-password line never says whether the address has an account (no account enumeration). The captcha and sign-up protection stay as they are.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-163: a wrong password shows plain words instead of Supabase's raw text, the resend line matches production's real window, and long addresses in the check-your-email card are decided.

Task Instructions:
1. Read ticket MOM-163 in Jira first, and MOM-150's 2026-11-01 comments (the approved words and the close-out). MOM-163's acceptance criteria are the definition of done. If they and these instructions disagree, stop and flag it.
2. Read CLAUDE.md, lib/services/auth.ts (signInWithPassword, signUpWithPassword and its resend-window mapping), app/actions/auth.ts, components/auth/SignInForm.tsx, components/auth/CreateAccountForm.tsx, types/auth.ts, tests/auth-forms.test.tsx, tests/auth-service.test.ts and tests/e2e/auth.spec.ts. Check the local stack with `npm run stack:status`; never run `supabase status` unfiltered.
3. MOM-150 must already be in origin/main (CreateAccountForm.tsx exists there). If it is not, stop. Create the feature branch `feature/MOM-163-sign-in-words` off an up-to-date `main`.
4. Design before coding, then STOP for my OK: (a) the wrong-password line as plain text, which must not say whether the address has an account, and which Supabase error codes or messages map to it; (b) ask me for production's per-address email resend window (I read it from the Supabase dashboard; never guess it), then the resend line's words to match it; (c) whether long addresses keep `break-all` or wrap another way, with what the card shows at 390px; (d) the "PM docs impact" of the change (none, or which section). Wait for my answer, then write the approved words verbatim into a MOM-163 Jira comment before any code (failure log F-087).
5. Build as approved. A main button stays busy, never disabled (MOM-145); a state update after an await inside a transition is wrapped again (F-072).
6. Tests: service tests for each mapped error (the raw text never reaches the screen), component tests for the new words, and `tests/e2e/auth.spec.ts`'s wrong-password test expecting the new line at 390px and 1280px. `npm test` makes no network call.
7. Run `npx tsc --noEmit`, `npm test`, `npm run build`, and these browser specs one at a time (stop `npm run dev` first): `tests/e2e/auth.spec.ts`, `tests/e2e/password-reset.spec.ts` and `tests/e2e/header-390.spec.ts`. Read each whole output.
8. Screenshots: save them in C:\Users\matth\momentum-screenshots\MOM-163-sign-in-words\ at 390px and 1280px, in light and dark (the wrong-password state, the resend line, and the check-your-email card with a long address); read each one's words top to bottom first; show them to me before the commit.
9. No live Claude call in this block.
10. Do not edit BACKLOG.md. Put backlog notes in the Jira comment and the close-out. Say "Privacy impact" and the "Build time" line in the close-out ("not measured" if not timed). Comment on MOM-163 with what changed and each acceptance criterion met or unmet; do not move it to Done.
11. Commit with "fix(MOM-163): plain words for a wrong password and the resend window". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes (with no network call); the auth, password-reset and header-390 specs pass; screenshots shown in light and dark; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] You approved the wrong-password words, the resend line (against production's real window, which you read) and the long-address look before code, and they are in MOM-163's Jira comment.
  - [ ] A wrong password shows the plain line, never "Invalid login credentials", and never says whether the address has an account (service test and auth spec).
  - [ ] You saw the screenshots at 390px and 1280px in light and dark.

---

## Block 1.2: Setup Cost Limits and Token Logging for the Family Trial (MOM-165)

* **Objective & Scope:** Size M (about 40 to 70 minutes). From Company HQ's cost review (2026-11-01). Setup's per-person limit is log-only today (`SETUP_LIMITS.userDailyCap` is 1,000,000 in `lib/services/llm.ts`), the overall limit of 200 calls in any 24 hours is shared by every Claude feature, and the usage log (`llm_usage_logs`, migration 011) records input and output tokens only. Before the trial: a real per-person setup limit, an overall limit with room for 3 or more adults onboarding on the same day, and cache-read and cache-write tokens logged per setup turn (migration 022, on production before the Nov 5 freeze). The 40-turn setup cap stays. Turning on prompt caching is not in this block (MOM-156's comment of 2026-11-01).
* **Core Invariants to Protect:** Every Claude call goes through `lib/services/llm.ts`. *Service-layer RLS*: the usage table stays append-only for the API roles, with its grants and `900_table_grants.sql` allow-list unchanged unless the design says why. *Plain words* for any refusal. `npm test` never calls Claude. Never edit an applied migration (011 stays as it is).
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-165: setup cost limits and token logging for the family trial. A real per-person setup limit, a raised overall limit, cache-read and cache-write tokens logged per setup turn (migration 022), the 40-turn cap kept, and no comment or doc still saying per-person setup limits are log-only.

Task Instructions:
1. Read ticket MOM-165 in Jira first. Its acceptance criteria are the definition of done. If they and these instructions disagree, stop and flag it.
2. Read CLAUDE.md, docs/LLM_GOVERNANCE.md, lib/services/llm.ts (LLM_LIMITS, SETUP_LIMITS, SETUP_BUDGET, the reservation and the usage write), lib/ai/setup.ts, lib/ai/setupLive.ts, lib/config/privacy.ts, supabase/migrations/011_llm_usage_logs.sql, supabase/verify/011_llm_usage_logs.sql, supabase/verify/900_table_grants.sql, tests/helpers/fakeLlmUsage.ts, tests/llm-governance.test.ts, tests/migrations.test.ts and tests/setup-budget.test.ts. Check the local stack with `npm run stack:status`; never run `supabase status` unfiltered.
3. Every second-2026-11-01 pull request must already be in origin/main (MOM-132's returning conversation uses the setup limits). If any is not, stop. Create the feature branch `feature/MOM-165-setup-cost-limits` off an up-to-date `main`. The next free migration number is 022.
4. The five items, word for word (owner, Company HQ's cost review, 2026-11-01):
   1. Set a real per-person setup limit of about 100 calls a day (today SETUP_LIMITS.userDailyCap in lib/services/llm.ts is 1,000,000 and log-only).
   2. Raise the overall limit from 200 calls per 24 hours to about 400 to 500 for the trial, so 3 or more adults can onboard on the same day. At the design stop, say how calls are counted today (the overall cap is shared across all features) and the number you propose.
   3. Log input, output, cache-read and cache-write tokens per setup turn. The usage table has input and output tokens only, so this needs migration 022 plus a verify script. It goes to production before the Nov 5 freeze, with my OK at the migration stop.
   4. Keep the 40-turn setup cap.
   5. Update the comments and docs/LLM_GOVERNANCE.md wherever they say per-person setup limits are log-only.
   Not in this block: turning on prompt caching.
5. Design before any edit, then STOP for my OK: (a) how calls are counted today (which features share the overall cap, how the per-person count and the rolling 24-hour window work in the reservation function) and the per-person and overall numbers you propose, with the arithmetic for 3 or more adults onboarding on the same day; (b) the refusal a person sees at the per-person limit, as plain text (and whether the existing message, unreachable while the limit was log-only, still says something true); (c) migration 022 in full: the new columns' names and types, their checks kept consistent with 011's token check, grants, the `900_table_grants.sql` change if any, and its verify script; (d) where each token count comes from in the API response and what is logged when a response has none; (e) every comment and docs/LLM_GOVERNANCE.md line that changes; (f) the "Privacy impact" and the "PM docs impact" of the change. Wait for my answer, then write the approved design verbatim into a MOM-165 Jira comment before any edit (failure log F-087).
6. Build as approved. Every Claude call still goes through lib/services/llm.ts; tests never call Claude.
7. Tests: a service test that setup calls past the per-person limit are refused in plain words (against the fake); a test pinning the overall limit; a test that a setup turn's usage row carries all four token counts; a test that the 40-turn cap is unchanged; tests/helpers/fakeLlmUsage.ts and tests/migrations.test.ts kept in step with the SQL; migration 022's verify script. `npm test` makes no network call.
8. Run `npx tsc --noEmit`, `npm test`, `npm run build`, `npx supabase db reset --local` and then `npm run verify:sql` (all scripts; every row must pass), and the setup browser specs one at a time (stop `npm run dev` first): `tests/e2e/setup.spec.ts` and `tests/e2e/setup-add.spec.ts`. Read each whole output.
9. Migration stop: show me migration 022 and `npx supabase db push --dry-run`, and STOP. Because 022 must reach production before the Nov 5 freeze, this branch may be pushed mid-day with my OK (CLAUDE.md); the production `db push` and then ALL the verify scripts run only after CI is green on its pull request and my OK, and before that pull request merges.
10. No screen changes beyond the refusal words, and no live Claude call in this block.
11. Do not edit BACKLOG.md. Put backlog notes in the Jira comment and the close-out. Say "Privacy impact" and the "Build time" line in the close-out ("not measured" if not timed). Comment on MOM-165 with what changed and each acceptance criterion met or unmet; do not move it to Done.
12. Commit with "feat(MOM-165): setup cost limits and token logging for the family trial". Do not merge into main and do not push without my OK.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes (with no network call); npm run verify:sql passes after a local reset; the setup specs pass; migration 022 and its dry run shown, not applied; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] You approved the per-person and overall numbers (with how calls are counted today), the refusal words and migration 022 in full before any edit, and they are in MOM-165's Jira comment.
  - [ ] Setup calls past the per-person limit are refused in plain words; the overall limit is the approved number; the 40-turn cap is unchanged (tests).
  - [ ] A setup turn's usage row carries input, output, cache-read and cache-write tokens (service test and 022's verify script); `npm run verify:sql` passes locally.
  - [ ] No comment or `docs/LLM_GOVERNANCE.md` line still says per-person setup limits are log-only.
  - [ ] Migration 022 and its dry run were shown and not applied; it goes to production before the Nov 5 freeze, after CI is green and your OK.

---

## Block 1.3: The Review Specs Wait for an App-Side Settled Marker After "Finish Review" (MOM-120)

* **Objective & Scope:** Size M (about 40 to 70 minutes). The plan spec's sites were fixed on 2026-11-01 (the stream line 0, 0, 0 over three runs). The 9 review sites remain: `tests/e2e/review.spec.ts` 178-188, 226, 255, 286, 318 and 337, `tests/e2e/review-change-screens.spec.ts` 60-62, and `tests/e2e/review-screens.spec.ts` 54-60 and 88 (line numbers from MOM-120's 2026-11-01 comment; check them). After "Finish review" the button is gone, so there is no control to wait for, and Playwright cannot observe the refresh's body ending (failure log F-086). The fix: an app-side settled marker, `aria-busy` on the finished-review region in `ReviewSitting`, set while the finishing transition runs and cleared when the refresh renders; then a small `finishReviewAndSettle` helper and the 9 sites wait on it. Also decide the redundant `router.refresh()` after a revalidating action (`usePlanAction.ts`, `ReviewSitting.tsx`).
* **Core Invariants to Protect:** *A transition settles in one render*: the marker clears only when the refreshed page has rendered. No timeout and no network idle as the fix; the log is never filtered. *A main button is never disabled or faded*.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-120's remaining sites: the review specs wait for an app-side settled marker after "Finish review" before they navigate, reload or end, so "The destination stream errored" stops appearing there.

Task Instructions:
1. Read ticket MOM-120 in Jira first, with its 2026-11-01 comments (the 9 review sites, the finding that Playwright cannot observe the refresh's body, and the day-end's follow-ups). Its acceptance criteria are the definition of done. If they and these instructions disagree, stop and flag it.
2. Read CLAUDE.md, docs/FAILURE_LOG.md F-072, F-079 and F-086, components/review/ReviewSitting.tsx, components/plan/usePlanAction.ts, app/actions/review.ts, app/actions/plan.ts, tests/review-sitting.test.tsx, tests/transition-sweep.test.ts, tests/e2e/review.spec.ts, tests/e2e/review-change-screens.spec.ts, tests/e2e/review-screens.spec.ts and tests/e2e/plan.spec.ts. Check the local stack with `npm run stack:status`; never run `supabase status` unfiltered.
3. MOM-120's plan-spec fix (2026-11-01) must already be in origin/main. If it is not, stop. Create the feature branch `feature/MOM-120-review-settled-marker` off an up-to-date `main`.
4. Design before coding, then STOP for my OK: (a) the settled marker: which element carries `aria-busy`, when it is set and when it clears (only after the refreshed page renders), and its component test; (b) the `finishReviewAndSettle` helper (where it lives, what it waits for); (c) the site list, re-found by searching tests/e2e/ for a "Finish review" tap followed by a navigation, a reload or the end of the test (the 9 known sites plus any new one), with what each will wait for; (d) the redundant `router.refresh()` after a revalidating action: remove it, or keep it, with the test that shows the page still updates either way (any change to usePlanAction also reruns the plan spec 3 times); (e) the "PM docs impact" (none expected). Wait for my answer, then write the approved design verbatim into a MOM-120 Jira comment before any code (failure log F-087).
5. Build as approved. Never `waitForTimeout`, never `waitForLoadState('networkidle')` as the fix, never filter the log. A state update after an await inside a transition is wrapped again (F-072).
6. Tests: a component test that the marker is set while finishing and cleared after; the transition sweep still passes. `npm test` makes no network call.
7. Count the line: run `tests/e2e/review.spec.ts` three times (stop `npm run dev` first), saving each run's output to a file in your scratchpad, and count "destination stream errored" in each; then `tests/e2e/review-change-screens.spec.ts` and `tests/e2e/review-screens.spec.ts` once each with `REVIEW_SCREENSHOT_DIR` set to C:\Users\matth\momentum-screenshots\MOM-120-review\ (they skip without it); and `tests/e2e/plan.spec.ts` three times if usePlanAction changed. Every count must be zero and every test must pass. Read each whole output, never a filtered part (F-022).
8. Run `npx tsc --noEmit`, `npm test` and `npm run build`; report totals. No visible screen change is expected; if the marker changes anything a person sees, show me screenshots at 390px in light and dark before the commit.
9. No live Claude call in this block.
10. Do not edit BACKLOG.md. Put backlog notes in the Jira comment and the close-out. Say "Privacy impact" and the "Build time" line in the close-out ("not measured" if not timed). Comment on MOM-120 with the sites fixed, the per-run counts and each acceptance criterion met or unmet; do not move it to Done.
11. Commit with "fix(MOM-120): the review specs wait for a settled marker after Finish review". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes (with no network call); the review spec passed three runs and the two review screen specs once each with the stream line counted at zero in every output (and the plan spec three runs if usePlanAction changed); committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] You approved the marker, the helper, the site list and the `router.refresh()` decision before code, and they are in MOM-120's Jira comment.
  - [ ] Each site waits for the marker, not a timeout or network idle (read one).
  - [ ] The review spec's three runs and the review screen specs' runs each show the stream line counted at zero.

---

## Block 1.4: PM Docs Upkeep: Sources per Section, a Source Test, a Day-End Sub-Step and a "PM Docs Impact" Line (MOM-164)

* **Objective & Scope:** Size M (about 40 to 70 minutes). Finishes MOM-144: `docs/product/USER_JOURNEYS.md`, `PRD.md` and `EVALS.md` were filled once and have drifted since. This block makes each section name its sources, guards the sources with a test in `npm test`, adds a day-end step D sub-step that drafts updates when sources change, adds a "PM docs impact" line at `/run-block`'s design stop, adds two CLAUDE.md lines, and brings the docs up to date. The six items and the acceptance criteria are the owner's, carried word for word in the prompt (failure log F-090: the upkeep half was dropped from an earlier plan). Docs and tooling only: no app code changes beyond the test.
* **Core Invariants to Protect:** `docs/DOMAIN_MODEL.md` stays binding; the PM docs link to it and never copy it. The repo is public: the docs name categories, never personal data or cost figures. The day-loop commands stay read-only where they are read-only.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-164: keep the PM docs current. Every section names its sources, a test guards them, day-end step D drafts updates when sources change, /run-block names the PM docs impact at each design stop, CLAUDE.md says the docs are non-binding, and the docs catch up with what merged.

Task Instructions:
1. Read ticket MOM-164 in Jira first, and MOM-144's comments (the first fill). MOM-164's acceptance criteria are the definition of done. If they and these instructions disagree, stop and flag it.
2. Read CLAUDE.md, docs/product/USER_JOURNEYS.md, docs/product/PRD.md, docs/product/EVALS.md, docs/DOMAIN_MODEL.md (its change log), .claude/commands/day-end.md, .claude/commands/run-block.md, docs/plans/NEXT_BUILD_PLAN.md (section D), tests/build-plan-format.test.ts, and BACKLOG.md's MOM-146 item (the journeys' and PRD's wording on "Yes, I want to change it") and MOM-132 item (adding a goal after setup).
3. Every second-2026-11-01 pull request must already be in origin/main (MOM-124 changed day-end.md and run-block.md; MOM-132 and MOM-138 are documented here). If any is not, stop. Create the feature branch `feature/MOM-164-pm-docs-upkeep` off an up-to-date `main`.
4. The six items, word for word (owner, 2026-11-01):
   1. Sources per section: every section of docs/product/USER_JOURNEYS.md, PRD.md and EVALS.md gets a "Sources:" line naming the files, Jira queries or decisions it draws on.
   2. Source test: a test (for example tests/pm-docs-sources.test.ts) fails when a section has no Sources: line, or when a repo file a section lists no longer exists. It runs in npm test.
   3. Day-end step D sub-step, added to .claude/commands/day-end.md and to the section D template that step E carries into each plan: for each section whose sources changed in the window (merged PRs, DOMAIN_MODEL change log, new eval cases, failure entries tagged in-product, Jira and backlog items with a journey tag), draft the update on the step D branch. If no auto-fill could cover a changed source, mark the section stale. Rewrite each doc's header "Open gaps" list. New backlog items get a journey tag (J1 to J5) where one applies.
   4. A "PM docs impact" line in /run-block: at the design stop, next to the privacy check, it says "PM docs impact: none | <doc section>: <what changes>". If a planned change removes, renames or stops producing a listed source, it stops and offers a replacement source or a doc change before building.
   5. CLAUDE.md lines: docs/product/ is non-binding (DOMAIN_MODEL.md stays binding, and these docs link to it, never copy it). Any session asked to make a change that touches a listed source says so before acting.
   6. Catch-up: bring the docs up to date with PRs #82 to #96 and today's merges, including the BACKLOG note about MOM-146 (the journeys' and PRD's wording on "Yes, I want to change it") and MOM-132 (adding a goal after setup).
   "Today's merges" means the second 2026-11-01 day-end's pull requests (MOM-120, MOM-124, MOM-132, MOM-150, MOM-138 and the day-end's MOM-16 and MOM-105 branches); list them by number at the design stop.
5. Design before editing, then STOP for my OK: (a) each section's Sources: line, per doc; (b) the source test: how it finds sections and Sources: lines, which listed items it checks as repo files, and the fixture that proves it fails; (c) the step D sub-step's exact words for day-end.md and for the plan's section D template; (d) the "PM docs impact" line's exact words in run-block.md and where it sits next to the privacy check; (e) the two CLAUDE.md lines; (f) the catch-up: each PR from #82 to #96 and today's merges, and which doc section each changes. Wait for my answer, then write the approved words verbatim into a MOM-164 Jira comment before any edit (failure log F-087).
6. Build as approved. No app code changes beyond the test. The plan's section D template edit must keep `npm run plan:check -- --strict` at no errors and no warnings.
7. Prove the test: rename one listed file, run the source test and see it fail, then revert the rename and see it pass. Report both outputs.
8. Run `npx tsc --noEmit`, `npm test`, `npm run plan`, and `npm run plan:check -- --strict`. Read each whole output.
9. No screen changes and no live Claude call in this block.
10. Do not edit BACKLOG.md. Put backlog notes in the Jira comment and the close-out. Say "Privacy impact" and the "Build time" line in the close-out ("not measured" if not timed). Comment on MOM-164 with what changed and each acceptance criterion met or unmet; do not move it to Done.
11. Commit with "docs(MOM-164): sources per section, a source test, a day-end sub-step and a PM docs impact line". Do not merge into main and do not push.

Acceptance criteria, word for word (owner, 2026-11-01): Every section in the three docs has a Sources: line and the source test passes (and fails on purpose once when a listed file is renamed, then is reverted); day-end.md and the plan's section D template both carry the PM docs sub-step; run-block.md prints a "PM docs impact" line at every design stop; CLAUDE.md carries the two lines; the docs reflect main as of the block's start, with current header dates and Open gaps; npm test and npm run plan pass; no app code changes beyond the test.

Not in this block: opening a PM docs thread or working the PM docs queue.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes (with no network call) and includes the source test; npm run plan and npm run plan:check -- --strict pass; the source test was seen failing once on a renamed file and passing after the revert; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] You approved the sources list, the test, the step D sub-step's words, the "PM docs impact" line and the two CLAUDE.md lines before any edit, and they are in MOM-164's Jira comment.
  - [ ] Every section in the three docs has a Sources: line; the source test failed once on a renamed file and passes after the revert.
  - [ ] day-end.md and the plan's section D template both carry the sub-step; run-block.md prints the "PM docs impact" line; CLAUDE.md carries the two lines.
  - [ ] The docs reflect `main` as of the block's start, with current header dates and Open gaps.

---

# FINAL DAY-END BUILD VERIFICATION & PULL REQUESTS

Run after the last block of the day, or type `/day-end` and let it run these in this order: **A, B, D, E, then F (the one push, after your OK), then C (live checks, after the pull requests have merged and Vercel has deployed)**. Stop on the first failure. When the whole sequence has finished and you say so, `/day-end` ends with the line `Tomorrow: /day-start (Sonnet / Low)`.

**The build day's window.** The day starts at the previous day-end's last merge, not at midnight, so a day-end that runs past midnight sees the same work. It is the newest merge on `origin/main` of a step E branch, found by the branch name, which always ends in `-next-build-plan-doc`: `git log origin/main --merges -n 1 --grep="next-build-plan-doc" --format="%h %cI %s"`. `/day-end` prints it as `Window: after <hash> (<date>, <subject>)` at the start and reuses that hash in steps B, D and F (it never recomputes it, because today's own step E branch will have merged by then). If there is none, you give a start date. Below, `<window>` means that hash.

**When there is nothing to sync.** `/day-end` stops at the start only if all four hold: no unmerged branches; no open backlog item without a Jira key; no entry marked `unreviewed` in `docs/FAILURE_LOG.md` (`docs/RAID_LOG.md` is frozen and is not checked); and no ticket with commits on `origin/main` in the window that Jira still shows as neither Done nor Closed. It names each condition, and says which ones kept it going. Failure entries carry the `unreviewed` mark in their heading line (`### F-0nn · … · unreviewed`); an entry drafted without the mark is still a waiting entry, so also look at the entries added in the uncommitted changes to the log (failure log F-061, MOM-124). F-086 to F-090 wait in the working copy from 2026-11-01.

**Your log edits and branch switches.** If you hold uncommitted edits to `docs/FAILURE_LOG.md` or `docs/RAID_LOG.md` and a branch's copy of either file differs, a plain `git switch` aborts. Before each switch `/day-end` checks for this, says so in plain words, backs both files up, stashes them (`git stash push -- <the two files>`), switches and pops. If the pop would conflict (entries that sit next to ones the target branch lacks), it keeps the stash, says so, and pops it on `main` after the merge instead. If a pop conflicts, it stops, restores from the backup and asks you. It never stages a log file for this; only the entries you approve in step D are staged.

**The trial.** The family trial starts Sat 2026-11-07, with a production freeze from Thu Nov 5 until after 10:30 am PT Fri Nov 6. Monday's day-end is the last regular push before the trial. Whatever does not finish goes into Wednesday's plan only if it is a fix from the owner's smoke test, or after Nov 6.

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

`npm run test:e2e` and `npm run verify:sql` also run in CI on every pull request. Run `npm run verify:sql` here for a branch with a migration (reset the local database to the stack's migrations first with `npx supabase db reset --local`), and the browser specs of every page the day's branches changed, one spec file at a time (stop `npm run dev` first; check the stack with `npm run stack:status`), plus `tests/e2e/header-390.spec.ts` for any branch that adds a page under `app/` (F-082). Any server error in the e2e output is a failure, with these known exceptions until MOM-124's expected-lines list exists: the wizard spec's two `[task-plan-ai] the API key was rejected { httpCode: 401 }` lines, the `[synced-entries] not counted … reason: 'no_source'` lines from the Hevy "no bound target" spec, the setup spec's `[setup] a reply was thrown away { category: 'schema', … }` warnings (its "reply is slow, thrown away, or cut off" test feeds bad replies on purpose), and the setup-cards spec's `[setup-ai] request failed { httpCode: 500 }` and `[setup-ai] the API key was rejected { httpCode: 401 }` (its first test shows the "no answer" and "not configured" error cards on purpose). "The destination stream errored while writing data" is a failure (MOM-120): if it appears, count it per run on `origin/main` alone and on the stack before judging. A jsdom test that fails a full run and passes alone is a failure to fix, not a flake to rerun (MOM-96).

Generated route types outlive a branch switch: a browser test run leaves the development server's in `.next/dev`, and a production build leaves its own in `.next/types` (failure log F-028, F-039). Delete both folders (git-ignored, rebuilt by the next build or `npm run dev`) before the checks after each merge; if `tsc` or the build still fails only in a file under `.next/`, delete them and run the check again; any other failure is real. MOM-130 builds this into the commands.

## B. Database verification (production), only if migrations were applied in the window

A migration is in the window when `git log --branches --remotes --not <window> --name-only --format=%h -- supabase/migrations` lists a file (022, MOM-165's usage-log token columns). B also runs when a script in `supabase/verify/` changed in the window, because production is where those scripts are proven. **Git Bash only.** This loop uses `/tmp`, `grep`, `$(...)` and `for ... done`, which do not work in PowerShell. `npm test` does **not** run these scripts. Every script must report `false 0` and a non-zero `true` count (0 and 0 means the script errored).

**When a migration is still waiting for its push.** This plan applies each migration at step F, after CI is green and before its pull request merges. If the window's migrations are not yet on production when B runs, B runs only its read-only part now (the migration list, where remote should stop at the last applied migration, the dry run, and the user count), and the verify loop runs at step F right after each `db push`. Running the loop before the push would fail the new migration's verify script and write throwaway users to production twice.

```bash
npx supabase migration list                         # local and remote columns must match for every migration already applied
T=0; F=0
for f in supabase/verify/*.sql; do
  npx supabase db query --linked -f "$f" -o table > /tmp/v.txt 2>&1
  t=$(grep -cE '│ true ' /tmp/v.txt); fl=$(grep -cE '│ false ' /tmp/v.txt)
  echo "$(basename $f): true $t false $fl"; T=$((T+t)); F=$((F+fl))
done; echo "TOTAL true $T false $F"                 # expect false 0 and a true count no lower than the last production total (783 true, recorded at the 2026-11-01 step F after 021), plus the checks added in the window. A local count is not a production count: one script runs 5 more checks on production
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
   c. Show me today's unreviewed entries as a short numbered list (one line on what went wrong, your draft of why, and what it led to), with no "predicted it?" question; include any earlier entries still waiting (F-086 to F-090 from 2026-11-01). Wait for my plain-language reply (for example "ok all", "drop 2"). Apply it and remove the `unreviewed` marks on approved entries. Never ask me to edit the files or run a command. If I skip, leave the entries unreviewed for the next day-end; nothing unreviewed is committed. If some entries are approved and others are not, stage only the approved entries (never the whole file); the working copy keeps the rest.
   d. At the first day-end of the week, also show the weekly top 5: `project = MOM AND labels = risk AND status NOT IN (Done, Closed) ORDER BY priority DESC, updated DESC`. At the first day-end of a calendar month, also run the monthly pattern review: look across that month's failure entries for a cause that recurred, decide whether it needs a new standing rule or ticket, and record the result (the month's entry count and how many led to a fix, a rule or a ticket) as a Jira comment on MOM-92, never in the repo. Monday 2026-11-02's day-end is the first of the week: show the weekly top 5. November's monthly review ran on 2026-11-01; the next is at the first day-end of December.
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
   - Executive Overview & Architectural Invariants, and the Standing Rules (Jira first, a fix covers its pattern, approvals into the ticket when given, the handoff check, production approval, verify scripts, no pushes inside blocks, blocks never edit BACKLOG.md, the build-time line, the lighter log rule, standing smoke-test account, the screen rules: words as plain text at the design stop and a screenshot folder per block, header-390 for a new page, where a paste goes in plain words, dashboard steps from files).
   - A "Today's runbook" section near the top, after the metadata header and before the first block: a table with one row per block, in order, giving `/run-block MOM-n`, the session setting (model / effort) and, in plain words, what to check at the gate. The table's first row is `/day-start` (Sonnet / Low) and its last row is `/day-end` (Opus / High), each with its own plain-words gate text; `npm run plan:check -- --strict` warns when either is missing or out of place. The text above the table also says that `/day-start` comes first and `/day-end` last.
   - Logical Session Blocks grouping high-priority tickets, in dependency order, each in the format `npm run plan:check` enforces: a heading `## Block <n>.<m>: <title> (MOM-<n>)` with exactly one ticket key (unique in the plan); a `* **CLI Session Config:** Model: X | Effort: Y` line; exactly one fenced `text` prompt that names its ticket and carries a commit message `type(MOM-n): ...`; and a `* **User Verification Gate:**` checklist. Before each session's first block, a `**Your prerequisites before this session:**` note (it may say none). Give each block a size in its objective (S about 20 to 40 minutes, M about 40 to 70, L 70 or more, timed from the design OK) until MOM-124 adds a Size field.
   - Block prompts that follow the pull-request workflow (CLAUDE.md): create the feature branch off an up-to-date `main`; commit on it with the Jira key; do NOT merge into `main` and do NOT push (the one push is at day-end, step F, after my OK); do NOT edit BACKLOG.md (notes go in the Jira comment and the close-out); give the "Build time" line in the close-out; end with "Definition of Done: ...; committed on the feature branch." A block with a migration says: run `npm run verify:sql` locally, show the migration and `npx supabase db push --dry-run`, and run production `db push` and then ALL the verify scripts only after CI is green on its pull request and I say OK, and before that pull request merges (merging deploys to Vercel). A block that needs another ticket's code says it "must already be in origin/main" and stops if it is not. When two blocks add migrations on separate branches, number them in the order they will be pushed, and say that the later branch merges origin/main before its push. A block that changes a screen lists its words as plain text at the design stop, runs the browser specs of every page it changes, and shows screenshots at 390px, in light and dark, from its own folder, before it commits. A block that adds a page under `app/` runs `tests/e2e/header-390.spec.ts`.
   - Dynamic CLI Session Config (Sonnet / High for architecture, security and database work; Sonnet / Medium or Low for standard UI and tests).
   - Copy-pasteable prompts including tsc --noEmit, npm test, npm run build, feature branching with the commit left on the feature branch (never merged into `main` locally and never pushed; `main` takes it through a pull request, see the pull-request bullet above), and Jira updates.
   - User Verification Gates for each block.
   - Final Day-End Build Verification & Pull Requests section (steps A, B, D, E, then F the one push, then C the live checks after the merge), with step A checking each branch stacked in merge order on origin/main, the step B verify loop marked Git Bash only, step D never moving a ticket or an epic to Done (it only comments, creates tickets and proposes Closed, with a pause for my OK), step F ending with a post-merge list of Done transitions that waits for my OK, and step D's log step carried from the rules MOM-133 put in CLAUDE.md and `/day-end` (no nightly "predicted it?", no new RAID rows, the weekly top 5 and the monthly pattern review), including the playbook question, and including this instruction in step E.
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
3. For a branch with a migration (022, MOM-165; before the Nov 5 freeze): production `npx supabase db push --dry-run`, then `db push`, then ALL the verify scripts (step B's loop), only after CI is green and your OK, and **before** that pull request merges.
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

- [ ] Sign in as the standing smoke-test account and walk what changed: a wrong password's plain line (MOM-163; sign out first, then a wrong password for the standing account's address). MOM-165 changes only limits and logging (production's verify scripts prove 022); MOM-120 and MOM-164 change nothing a person sees.
- [ ] Only the standing smoke-test account exists (`users = 1` in step B, until real users exist). If its data is cluttered, delete and recreate it in the Supabase dashboard (Add user, Auto Confirm); never share or store its password.
- [ ] Walk every item in `docs/plans/.pending-live-checks.md` (the post-push checks the blocks deferred), then clear the items that are done; an item that still waits stays.

---

## Open Decisions and Risks (read before starting)

| Item | Why it matters |
| --- | --- |
| **One build day left before the freeze** | Mon Nov 2: MOM-163, MOM-165, MOM-120, MOM-164. Wed Nov 4: fixes from the owner's own smoke test only. |
| **If Monday runs long** | MOM-120 and MOM-164 move to Tuesday; the cost block (MOM-165) and MOM-163 must land before the freeze. |
| **Setup cost limits (MOM-165)** | From Company HQ's cost review: a real per-person setup limit (about 100 calls a day), the shared overall limit raised to about 400 to 500 so 3 or more adults can onboard on the same day, and cache-read and cache-write tokens logged per setup turn. Raising the overall limit raises it for every Claude feature, because it is shared; the design stop says how calls are counted. Prompt caching itself waits until after the freeze (MOM-156's comment). |
| **Production freeze** | From Thu 2026-11-05 until after 10:30 am PT Fri 2026-11-06 (the owner's interview): no push, merge, migration or dashboard change in that window. Monday's day-end is the last regular push before the trial; Wednesday's fixes push only with the owner's OK and before the freeze. |
| **Stay signed in on the phone (MOM-157)** | A trial prerequisite ("fix before the app is rolled out to anyone"), but the ticket says to build it after the Nov 6 freeze while the trial starts Nov 7. Owner's call: build it Fri Nov 6 afternoon, start the trial with testers signing in each time, or move the trial's start. |
| **Google consent screen (MOM-155)** | In Testing, refresh tokens expire after 7 days and only listed test users can connect. For the trial: stay in Testing, add each tester's Gmail as a test user, and tell them about the weekly reconnect. Verification after Nov 6. |
| **The returning stream error (MOM-120)** | The plan spec's sites are fixed (0 in every 2026-11-01 run). The review sites need the app-side marker; until it merges, a single "destination stream errored" line in a review spec is counted per run on `origin/main` and on the stack before it is judged. |
| **Sign-in words (MOM-163)** | The wrong-password line must not reveal whether an address has an account. The resend line must match production's real per-address window, which the owner reads from the dashboard (never guessed). |
| **PM docs upkeep (MOM-164)** | Its six items and acceptance criteria are carried word for word from the owner's handoff (F-090). It edits the day-loop commands and this plan's section D template, so `npm run plan:check -- --strict` must stay clean. |
| **Migration 022** | MOM-165 takes it (usage-log token columns), on production before the Nov 5 freeze, after CI is green and the owner's OK, before its pull request merges. MOM-161 (the database guards for the forecast edits) takes the next free number when scheduled, after the trial starts. Production holds 001 to 021; its verify total was 783 true after 021. |
| **The smoke-test persona's setup** | The standing smoke-test account's first setup on production on a phone, if it has not happened; MOM-110's real-iPhone checks follow on the same visit (pending live checks). The same account can now add a goal (MOM-132) and edit the forecast's facts (MOM-138). |
| **Live checks owed from 2026-11-01** | MOM-132's add-a-goal, MOM-138's forecast edits and MOM-150's sign-up walk on the deployed site (walking sign-up creates a second user, so how is the owner's call; production must hold one user again afterwards). See the pending live checks. |
| **The build machine's memory** | The full local browser suite runs out of memory (MOM-141, `risk`). Close what you do not need before heavy steps; CI's `database` job is the full-suite gate; step A runs the changed pages' specs one file at a time. |
| **`set_updated_at()` grants** | Executable by the API roles since 001, unlike the trigger functions 012 locked down (MOM-137, `risk`). Low practical risk; not scheduled before the trial. |
| **Stale generated types** | Generated route types outlive a branch switch (F-028, F-039). Until MOM-130 builds it into `/day-start` and `/run-block`, delete `.next/types` and `.next/dev` before the type check and build on a branch you just switched to. |
| **Standing smoke-test account** | `smoke-test@momentum-app.test` exists on production. Every live gate signs in as it; its password stays in your password manager. Production must hold exactly one user at day-end step B. Its goal-model data is created through setup and logging only. |
| **The old model stays until MOM-115** | Home hides its controls (MOM-115's subset). The wizard, rebalance and checkbox criteria keep running, with the completion guard of migrations 002 and 008. The full MOM-115 comes after Nov 6. |
| **Not scheduled, queued with keys** | Before the trial if room: MOM-114 (settings, defaults only), MOM-159 (a week start after setup), MOM-151, MOM-152, MOM-153, MOM-154, MOM-112's plan-card and headline words, and the `/run-block` half of MOM-124's header-390 rule. After Nov 6: MOM-157, MOM-155, MOM-156 (Tue Nov 10), MOM-160, MOM-161, MOM-162, MOM-115, MOM-117, integration hardening (MOM-98, MOM-99, MOM-97, MOM-70). Tooling: MOM-124's other items, MOM-130, MOM-127, MOM-141. Security: MOM-137, MOM-119. Deferred: MOM-126 (minors safeguards; the trial is adults only). Follow-ons: MOM-136, MOM-118, MOM-139, MOM-140. Idea: MOM-158. |
| **Risks live in Jira** | Since MOM-133, new risks are Jira tickets with the `risk` label, reviewed as a weekly top 5 at the first day-end of the week (Mon 2026-11-02's day-end); `docs/RAID_LOG.md` is frozen history. November's monthly pattern review ran on 2026-11-01 (MOM-92). |
| **Pull requests, not direct pushes** | `main` is protected (MOM-67): every change reaches it through a pull request with `checks` and `database` green, merged with a merge commit. `/run-block` commits on a feature branch and never merges; branches are pushed only with your OK. A production migration is applied before its pull request merges (merging deploys to Vercel). |
