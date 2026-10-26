# 🚀 MOMENTUM BUILD: NEXT-PHASE MASTER EXECUTION PLAN

> **Date:** 2026-10-27 | **Active Epic:** MOM-105 | **Base Commit:** 580d4ab

> **Since the last plan (run on 2026-10-26):** build day 1 of the goal-model thin slice built the tables (MOM-107, migration 013), the scoreboard engine (MOM-108, `lib/engine/`), the age-terms check (MOM-116), password reset with sign-up protection and a signed-in indicator (MOM-64), the day-loop fixes (MOM-104) and the e2e stream-noise fix (MOM-120). They reach `main` through that day-end's pull requests, with 013 applied to production before MOM-107's pull request merges. The 2026-10-26 day-end sync created **MOM-121** (verify-script writes), **MOM-122** (auth email for the trial), **MOM-123** (production walk of sign-up and reset), **MOM-124** (day-loop tooling follow-ups) and **MOM-125** (setup asks the day end). Before 013, production verification was **277 checks across 11 scripts** (one script has 5 checks that run only on production); migration 013 adds its own script and new rows in the grants check, and the production total after it is the one MOM-107's day-end comment records. The next free migration number is **014**. Production holds exactly one user (the standing smoke-test account). This is **build day 2 of N = 5**; the checkpoint is at the end of build day 3.

---

## Today's runbook

**How to run a day.** Type `/day-start` first: it only reads and reports. Then type the command in the table below for each block, in this order, and skip any block whose Jira ticket is already Done. Each command first shows the block's model and effort: if your session differs, it stops and tells you the exact `/model` and `/effort` to type (use the session-only choice in the `/effort` slider, so your saved default is left alone), and you start the command again. Run `/clear` between blocks. When the last block is done, type `/day-end`. Nothing is pushed, merged or applied to production without your explicit OK, and work reaches `main` only through a pull request once both CI jobs are green.

| # | Type | Session setting | What to check at the gate |
| --- | --- | --- | --- |
| 0 | `/day-start` | Sonnet / Low | A clean tree, `main` matching `origin/main` with every 2026-10-26 pull request merged, no leftover branches, the plan passing its format check, no missing environment variable names. Then the three carry-overs: the CAPTCHA is on and sign-in still works; MOM-120's CI e2e run shows no stream-error line; your MOM-116 trial decision is recorded on the ticket (or you know MOM-102 will stop and ask). |
| 1 | `/run-block MOM-125` | Sonnet / Low | `docs/DOMAIN_MODEL.md` §2.2 step 10 now asks the day end once, with no default, and explains the early-day-end rule in plain words; the change log has a MOM-125 line; no code changed. |
| 2 | `/run-block MOM-121` | Sonnet / High | Every write in `supabase/verify/` is limited to the script's own throwaway account; a new unit test fails on a script that is not; the local SQL checks pass; the block asked for a production run of all verify scripts at day-end. |
| 3 | `/run-block MOM-110` | Sonnet / High | You approved the entry design before code; the four ways to log (tap, number, timer, checklist tick) work on the local stack; a removed entry can be restored; component tests cover each type; the real-iPhone check is listed for after the push. |
| 4 | `/run-block MOM-111` | Sonnet / High | You approved the draft schema and the hard-rule list before code; the eval set runs in `npm test` with no live Claude call; every rule has an automatic check; any live eval run waited for your OK. |
| 5 | `/run-block MOM-109` | Sonnet / High | You approved the mapping before code; a Hevy workout becomes an entry bound to the target you chose; a correction survives a resync; a possible duplicate gives one merge suggestion and never merges on its own; the `InboundActivityPayload` contract still holds. |
| 6 | `/run-block MOM-102` | Sonnet / Medium | Your MOM-116 decision was on the ticket before the block wrote anything; the updated criteria were approved; the notice says what the new tables store and is linked from sign-up; every Claude prompt was checked against "only what it needs". |
| 7 | `/day-end` | Opus / High | The day's branches pass their checks, the step B production run includes MOM-121's changed scripts, every verify script passes on production, and any migration (014 or 015) is applied after CI is green and your OK, before its pull request merges. |

If a block needs another ticket's code, `/run-block` checks that code is already in `origin/main`. If it is only on an unmerged branch, it stops and offers two ways forward: push that branch and merge its pull request first, or stack this block on that branch (only with your OK). Every block in this plan needs MOM-107 and MOM-108 in `origin/main`. No block in this plan needs another block of this plan: MOM-110 and MOM-109 each own their own files (see their prompts).

---

## Executive Overview & Architectural Invariants

Build day 2 turns the new tables and engine into things a person does. Session 1 makes two small corrections that later pieces rely on: setup's question order gets the day end (MOM-125), and the database check scripts stop being able to write to a real person's data (MOM-121), which matters as soon as testers have data on production. Session 2 is the person's side: logging an entry by hand (MOM-110) and the first block of guided setup (MOM-111), the piece the design record names as the most likely to grow, started early so the day-3 checkpoint can see it. Session 3 is sources and privacy: Hevy workouts become entries (MOM-109), and the privacy notice states what the new tables store (MOM-102), once you have decided the minor tester's terms (MOM-116). Home and the week plan (MOM-112) start on build day 3 with the scoreboard mock-up.

`docs/DOMAIN_MODEL.md` is binding for all new code. The old model stays in the code until MOM-115 retires it, so new code is built beside the old tables, never into them. Every block preserves these invariants:

1. **Claude never scores.** The engine (`lib/engine/`) computes every number from entries and the target in force; no Claude output is stored as a number, and setup's draft is validated by code, not by Claude (DOMAIN_MODEL §1.7, principle 9).
2. **The person's word beats any source.** A manual entry or correction always wins over a sync; corrections are keyed to the source's own record id, so a resync never undoes them; a possible duplicate is a suggestion, never a silent merge (§1.5, §1.6).
3. **Never assume anything about a person's life.** Time zone, week start and day end are the person's to set; setup asks them and never proposes a day, time or schedule the person did not say (principle 1, §2.2).
4. **Unfinished work moves, habits never carry over.** (§1.4, principle 11.)
5. **Service-layer RLS enforcement.** The UI never queries Supabase. Every read and write of the new tables goes through `lib/services/`; every new table (if any) has row level security keyed to its owner, explicit grants and an entry in `supabase/verify/900_table_grants.sql`'s allow-list.
6. **The old model's guards stay until MOM-115.** The completion guard (migrations 002 and 008) and the append-only `task_rebalance_history` keep protecting the old tables; nothing today edits an applied migration or an old table.

## Standing Rules (every prompt below repeats what it needs)

- **Read the Jira ticket first.** If its title, scope or acceptance criteria disagree with the prompt, or the prompt disagrees with `docs/DOMAIN_MODEL.md`, stop and flag it.
- **Production changes need your approval.** A prompt stops before `supabase db push`, `vercel env`, or any push to `origin`, shows what will happen, and waits. Never use the SQL Editor. Tests never run against production and never use production credentials.
- **Database checks are not part of `npm test`.** They live in the SQL scripts in `supabase/verify/` and run with `npm run verify:sql` (local stack) or, against production, with the step B loop. After any migration, or any change to a verify script, run **all** of them; every row must show `passed = true`. A local total is not a production total: one script has checks that run only on production (RAID R-16, failure-log F-027).
- **New migrations use the numbers this plan assigns:** MOM-111 takes **014** and MOM-109 takes **015**, each only if its design stop shows a table is needed and you approve it. No other block adds a migration. Never edit an applied migration.
- **Pull requests, not local merges.** `main` is protected: work reaches it only through a pull request with the CI jobs `checks` and `database` green, merged with a merge commit (CLAUDE.md). A block commits on its feature branch and stops: it never merges into `main` and never pushes. Branches are pushed once, at day-end (step F), after your explicit OK.
- **A migration is applied before its pull request merges.** A block with a migration runs `npm run verify:sql` locally, shows the migration and `npx supabase db push --dry-run`, and stops. At day-end step F, once CI is green on its pull request and you say OK, the production `db push` and then ALL the verify scripts run, before that pull request merges (merging deploys to Vercel, and the new code needs the new schema).
- **Backlog edits can collide.** Each block edits `BACKLOG.md` on its own branch. Add new items next to the block's own ticket's items, not all at the very end, so two branches do not edit neighbouring lines. If two pull requests still conflict, day-end step F merges `origin/main` into the later branch locally, keeps both sides, and pushes that with your OK.
- **Claude calls cost money.** `npm test` never calls Claude: model calls in tests go through a fake. A block that wants a live Claude call (an eval run, a prompt check) says how many calls and stops for your OK first, and it is logged through `lib/services/llm.ts`.
- **Standing smoke-test account.** Production keeps ONE standing test account, `smoke-test@momentum-app.test`, created by you in the Supabase dashboard (Authentication → Add user, Auto Confirm User on). Its password lives only in your password manager: Claude never asks for it, prints it or stores it in the repo, and never creates, edits or deletes users on production. Every live sign-in check in this plan says "sign in as the standing smoke-test account". Claude may read its data with **count-only** queries. If its data gets cluttered, you delete and recreate it in the dashboard (it starts empty). The SQL verify scripts create and delete their own passwordless temporary users and leave none behind; until MOM-121 merges, one of them (004) also repeats a data repair that is not limited to its own user, which is harmless only while no other person has data on production. Production should always hold exactly one user. Browser tests use throwaway users on the **local** stack only.
- **The repo is public.** Anything written to a committed file (logs, docs, tests, fixtures, eval cases) names categories, never secrets, personal data or exploit steps. Trial testers are described by role only ("the owner", "two household testers, one a minor"). Eval cases are scripted, with personal details removed.

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
SESSION 1: CORRECTIONS LATER PIECES RELY ON (MOM-125, MOM-121)   thin slice, build day 2 of 5
  - Setup's question order gets the day end, then the verify scripts stop writing outside their own accounts
SESSION 2: THE PERSON'S SIDE (MOM-110, MOM-111)
  - Manual entry, then guided setup's first block (prompt, hard rules, validated draft, eval set)
SESSION 3: SOURCES AND PRIVACY (MOM-109, MOM-102)
  - Hevy workouts into entries, then the privacy notice
```

*Order matters. MOM-125 comes first because setup (MOM-111) builds from `docs/DOMAIN_MODEL.md` §2.2, and it is a short docs block. MOM-121 comes before any block that writes person data, because day-end step B runs every verify script on production and testers are about to have data there. MOM-110 comes before MOM-111 because logging is the smaller, surer piece and proves the service pattern over the new tables; MOM-111 does not need MOM-110's code (setup saves goals, targets and work items, not entries). MOM-109 and MOM-110 both touch entries, so each owns its own files: MOM-110 owns `lib/services/entries.ts` (manual entries and corrections), MOM-109 owns `lib/services/syncedEntries.ts` and the merge-suggestion logic; neither edits the other's. MOM-102 comes last because it needs your MOM-116 decision and describes what the other pieces store. The design record sizes manual entry at 2 blocks and setup at 3, but a key may head only one block in a plan, so each block stops at a committed, green point and its ticket stays open for the rest. Safe stopping points: after each block. If the day runs short, MOM-102 drops first, then MOM-109.*

---

# SESSION 1: CORRECTIONS LATER PIECES RELY ON

**Your prerequisites before this session:** (1) Every 2026-10-26 pull request is merged, so `origin/main` has migration 013 (MOM-107), `lib/engine/` (MOM-108), the MOM-64 auth pages and the MOM-104 command changes; `/day-start` shows it. (2) The three carry-overs, none of which blocks a block: the CAPTCHA switch-on for MOM-64 (site key in Vercel and redeploy first, then the secret in the Supabase dashboard, then a sign-in test as the standing smoke-test account; if it slipped from last night, do it now); MOM-120's CI e2e run showing no "destination stream errored" line; your MOM-116 trial decision on the ticket. (3) Docker Desktop running for Block 1.2 (local Supabase stack, `npx supabase start`).

## Block 1.1: Setup Asks the Person's Day End (MOM-125)

* **Objective & Scope:** A docs fix. `docs/DOMAIN_MODEL.md` §2.2 step 10 lists the week start but not the day end, and the engine (MOM-108) refuses to compute without one. Add the day end as a person fact asked once, on the first goal, with no default; explain the rule the engine uses (a day end after midnight and before 06:00 moves the day boundary; any other day end is the person's check-in time and the boundary stays at midnight); and say the week start is asked only when the first weekly or day-slot target needs it. Add a change-log line.
* **Core Invariants to Protect:** *Never assume*: no default day end, week start or time zone. *DOMAIN_MODEL is binding*: the change matches what `lib/engine/time.ts` does, and if they disagree, stop and flag it rather than picking one.
* **CLI Session Config:** Model: Sonnet | Effort: Low

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-125: DOMAIN_MODEL.md §2.2 step 10, guided setup must also collect the person's day end.

Task Instructions:
1. Read ticket MOM-125 in Jira first; its acceptance criteria are the definition of done. If it, these instructions and docs/DOMAIN_MODEL.md disagree, stop and flag it.
2. Check that lib/engine/time.ts (MOM-108) is in origin/main (`git log origin/main --oneline --grep="(MOM-108):" -n 3`). If it is not, stop: this block must not run before 2026-10-26's pull requests have merged.
3. Read CLAUDE.md, docs/DOMAIN_MODEL.md (§1.1 time anchors, §2.2, principle 1 and the change log), lib/engine/time.ts and lib/engine/constants.ts (how the engine treats the day end), MOM-108's Jira comment (the owner's day-end decision), and the BACKLOG.md items under MOM-111 and MOM-125.
4. Create the feature branch `feature/MOM-125-setup-day-end-doc` off an up-to-date `main`.
5. Edit §2.2 step 10 only: add the day end as a person fact asked once on the first goal, never assumed; say in plain words what an early day end (after midnight, before 06:00) does and what any other day end means; say the week start is asked only when the first weekly or day-slot target needs it. If anything in the engine differs from what you are about to write, stop and show me the difference.
6. Add a line to the change log at the end of docs/DOMAIN_MODEL.md (date 2026-10-27, the change, why, MOM-125), in the table's existing format.
7. Update BACKLOG.md: tick the MOM-125 item with a one-line note, and add "done in MOM-125" to the matching sentence in the MOM-111 Setup item. No code changes.
8. Run `npm test`; it must pass.
9. Comment on MOM-125 in Jira with the before and after wording of step 10 and each acceptance criterion met or unmet; do not move it to Done.
10. Commit with "docs(MOM-125): ask the day end in setup step 10". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; npm test passes; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented.
```

* **User Verification Gate:**
  - [ ] Step 10 asks the day end once, with no default, and the early-day-end rule reads clearly to you.
  - [ ] The week-start condition matches the engine (deadline-only goals need no week start).
  - [ ] The change log has the MOM-125 line, and only `docs/DOMAIN_MODEL.md` and `BACKLOG.md` changed.

---

## Block 1.2: Limit Every Verify-Script Write to Its Own Throwaway Account (MOM-121)

* **Objective & Scope:** `supabase/verify/004_history_backfill_and_seed.sql` repeats migration 004's backfill without a filter on its throwaway user, and day-end step B runs every verify script on production. Limit both backfill statements to the script's own user, read every other script for the same problem, and add a unit test that fails on a verify-script write to a public table that is not limited to the script's throwaway user (with an explicit allow-list for statements proven safe). No migration.
* **Core Invariants to Protect:** *Tests never touch real data*: a check script may create, change and delete only its own temporary users and their rows. *A check that cannot fail is not a check*: each script's checks keep testing the same thing after the fix, and a broken script still fails `npm run verify:sql`.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-121: limit every verify-script write to its own throwaway account.

Task Instructions:
1. Read ticket MOM-121 in Jira first; its acceptance criteria are the definition of done. If it and these instructions disagree, stop and flag it.
2. Read CLAUDE.md, every file in supabase/verify/, migrations 004 and 013 (what the backfill and the newest script do), scripts/run-sql-verify.ts and tests/run-sql-verify.test.ts (how scripts are run and parsed), and RAID R-19 in docs/RAID_LOG.md.
3. Create the feature branch `feature/MOM-121-verify-script-writes` off an up-to-date `main`. Confirm migration 013 and supabase/verify/013_goal_model_tables.sql are in origin/main; if not, stop.
4. List every insert, update and delete in supabase/verify/ against a table in `public` or `auth`, with the line, and say for each whether it is limited to the script's own throwaway user(s). STOP and show me the list before changing anything.
5. Fix each unlimited statement so it touches only the script's own user(s): in 004, add the throwaway user filter to both backfill statements. Keep every check meaning the same thing (the "restores one row per marked task" and "is idempotent" checks must still be able to fail).
6. Add tests/verify-script-writes.test.ts: it reads each script and fails on a write statement against a public table with no filter on the script's throwaway user id, with an explicit, commented allow-list for statements proven safe (for example a delete of the script's own auth user). Show that the test fails on the old 004 text, then passes on the fixed one.
7. Verify locally: `npx supabase db reset --local`, then `npm run verify:sql`; every script must pass with the same check counts as before.
8. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass.
9. STOP before production. This block has no migration, but it changes a script that day-end step B runs on production: say plainly that step B must run ALL the verify scripts on production at day-end even if no migration was applied in the window, and add that line to docs/plans/.pending-live-checks.md as `- [ ] MOM-121: day-end step B ran every verify script on production with false 0, and the 004 script changed no row outside its own account (count-only check)`.
10. Update BACKLOG.md for MOM-121, next to its existing item. Comment on MOM-121 in Jira with the list from step 4, what changed, and each acceptance criterion met or unmet; do not move it to Done.
11. Commit with "fix(MOM-121): limit verify-script writes to their throwaway accounts". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes; npm run verify:sql passes locally; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented.
```

* **User Verification Gate:**
  - [ ] You saw the list of every write in the verify scripts before anything changed.
  - [ ] The new unit test failed on the old 004 text and passes on the fixed one.
  - [ ] `npm run verify:sql` passes with the same check counts as before.
  - [ ] After the push: day-end step B runs every verify script on production with `false 0`, and production still holds exactly one user.

---

# SESSION 2: THE PERSON'S SIDE

**Your prerequisites before this session:** (1) Docker Desktop running and the local stack started (`npx supabase start`), with migration 013 applied locally (`npx supabase db reset --local` if not). (2) Your iPhone to hand for MOM-110's phone check after the push (the block lists it for later; nothing to do now). (3) For MOM-111: be ready to review the draft schema and the hard-rule list at its design stop, and to say yes or no to any live Claude eval run (the block says how many calls first). `ANTHROPIC_API_KEY` in `.env.local` only if you approve a live run.

## Block 2.1: Phone-First Manual Entry (MOM-110)

* **Objective & Scope:** The first block of manual entry: a service over migration 013's `entries`, `entry_corrections`, `sources` and `target_sources` tables, server actions, and phone-first controls for the four ways to log (a tap for a count, one number for a quantity, a start/stop timer, a checklist tick for a milestone step), plus remove (hidden, restorable) and restore. A checklist tick is a manual entry whose `source_record_id` is the step's id; un-ticking is an `entry_corrections` row with action `hide`, and re-ticking deletes it (the owner's 2026-10-26 decision, in BACKLOG.md). Where the controls appear for real is MOM-112's home page; this block builds them as components with a minimal place to try them on the local stack.
* **Core Invariants to Protect:** *The person's word beats any source*: a manual entry or correction always wins over a sync. *Service-layer RLS*: components call services through server actions; `lib/services/entries.ts` is the only code that touches these tables for manual entries. *Claude never scores*: no number is computed here; the engine does that from entries. *Never assume*: an entry's time is when the person logged it, in their own time zone from `person_settings`; nothing defaults a time zone.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-110: phone-first manual entry (tap, number, timer, checklist tick), first block.

Task Instructions:
1. Read ticket MOM-110 in Jira first; its acceptance criteria are the definition of done. If it, these instructions and docs/DOMAIN_MODEL.md disagree, stop and flag it.
2. Check that migration 013 (MOM-107) and lib/engine/ (MOM-108) are in origin/main. If either is not, stop.
3. Read CLAUDE.md, docs/DOMAIN_MODEL.md (§1.3 measures, §1.5 entries, §1.6 corrections, principles 2 and 3), supabase/migrations/013_goal_model_tables.sql (the entries, entry_corrections, sources, target_sources, work_items and work_item_steps tables, their constraints and grants), types/database.types.ts, lib/services/tasks.ts and app/actions/tasks.ts (how services, server actions and ServiceResult are written here, with lib/services/result.ts), components/tasks/useTaskToggle.ts (optimistic toggles), tests/tasks-service.test.ts (the in-memory Supabase fake), and the BACKLOG.md items under MOM-107, MOM-108 and MOM-110.
4. Create the feature branch `feature/MOM-110-manual-entry` off an up-to-date `main`.
5. Design before coding, then STOP for my OK: the service functions (signatures and what each reads and writes), the server actions, the components and their props, how each of the four entry types is stored (which columns, which source row; the person's manual source is created on first use), how remove, restore, un-tick and re-tick work, and how an entry's time is taken in the person's own time zone. Say what happens when `person_settings` has no time zone yet (refuse with a clear message; never default one). File ownership: this block owns lib/services/entries.ts, app/actions/entries.ts and components/entries/; MOM-109 owns synced entries in lib/services/syncedEntries.ts, so do not create that file. If you need a schema change, stop: no migration is assigned to this block. Wait for my answer.
6. Build as approved. Controls are phone-first: large tap targets, no keyboard for the tap, timer and tick; the number pad only for a quantity. Add a minimal page or panel to try them on the local stack, behind sign-in, and say where it is; MOM-112 places them on home.
7. Tests: service tests against the in-memory fake (each entry type, remove and restore, un-tick and re-tick, refusing without a time zone, one person never reading or writing another's rows); component tests for each control (tests/manual-entry.test.tsx); a browser spec on the local stack (tests/e2e/manual-entry.spec.ts) at 390px and 1280px that logs one of each type with a throwaway user.
8. Run `npx tsc --noEmit`, `npm test`, `npm run build` and `npm run test:e2e` (stop `npm run dev` first); all must pass, with no server error in the e2e output.
9. If the scope runs long, stop at a committed point where every check above passes, and tell me exactly what remains; the ticket stays open and the next plan carries the rest.
10. Add to docs/plans/.pending-live-checks.md: `- [ ] MOM-110: on a real iPhone, signed in as the standing smoke-test account, log one of each entry type, remove one and restore it` (after the push). Production gets real entries from this check; that is expected for the standing account.
11. Update BACKLOG.md for MOM-110, next to its existing item. Comment on MOM-110 in Jira with what changed, each acceptance criterion met or unmet and how verified; do not move it to Done.
12. Commit with "feat(MOM-110): add phone-first manual entry". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes; npm run test:e2e passes; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented.
```

* **User Verification Gate:**
  - [ ] You approved the service, storage and component design before any code was written.
  - [ ] On the local stack: a tap, a number, a timer and a checklist tick each create an entry; a removed entry can be restored; un-ticking a step and ticking it again works.
  - [ ] Without a time zone set, logging refuses with a clear message instead of guessing one.
  - [ ] `npm run test:e2e` passes at both widths with no server error.
  - [ ] After the push: the real-iPhone check, signed in as the standing smoke-test account.

---

## Block 2.2: Guided Setup, First Block: Prompt, Hard Rules, Validated Draft and Eval Set (MOM-111)

* **Objective & Scope:** The first of setup's three blocks: the parts everything else stands on, without the screen. A draft schema (zod, in `types/`) that the saved model will also pass; a validator from draft to the rows of migration 013; the setup prompt encoding the 12-step order of `docs/DOMAIN_MODEL.md` §2.2 (with MOM-125's day-end step) and the 8 hard rules; and the setup eval set: scripted cases with personal details removed, run against a fake model in `npm test`, with automatic checks on every turn (one single-part question, no day or time words the person did not say, no announced reminder, the final draft validates). The conversation screen, chunked playback, saving and the budget come in the next two blocks. Migration **014** is assigned only if the design stop shows that drafts must be stored and you approve it.
* **Core Invariants to Protect:** *Claude never scores and does no math*: the draft is validated by code; numbers in the draft come from the person's words. *Never assume*: no day, time or schedule the person did not say. *Nothing is saved until final approval*. *Claude calls cost money*: no live call without your OK, and every call goes through `lib/services/llm.ts`.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-111: guided setup, first block (draft schema and validation, the prompt with the hard rules, and the eval set).

Task Instructions:
1. Read ticket MOM-111 in Jira first; its acceptance criteria are the definition of done for the whole ticket, and this block covers part of them. Also read ticket MOM-125: its day-end wording for step 10 is binding here even if its pull request has not merged yet. If they, these instructions and docs/DOMAIN_MODEL.md disagree, stop and flag it.
2. Check that migration 013 (MOM-107) and lib/engine/ (MOM-108) are in origin/main. If either is not, stop.
3. Read CLAUDE.md, docs/DOMAIN_MODEL.md (§2 in full, §1 for what a draft must hold, the principles), docs/design/2026-10-26-goal-model-design.md (§5.1 setup evals, §6.2 the setup cost limit), docs/LLM_GOVERNANCE.md, supabase/migrations/013_goal_model_tables.sql (what setup will save), types/scoreboard.ts, lib/ai/taskPlan.ts and lib/ai/rebalance.ts (how Claude calls, zod schemas and fallbacks are written here), lib/services/llm.ts (LLM_LIMITS and usage logging), tests/task-plan-ai.test.ts and tests/ai-boundary.test.ts (how model calls are faked and fenced), and the BACKLOG.md items under MOM-107, MOM-108 and MOM-111.
4. Create the feature branch `feature/MOM-111-setup-foundations` off an up-to-date `main`.
5. Design before coding, then STOP for my OK: (a) the draft schema, field by field, with the DOMAIN_MODEL rule each serves and how it maps onto 013's tables (goals, targets, work_items, work_item_steps, person_settings and the person tables), including that every deadline task carries whether its date can move and that setup collects time zone and week start before the first target; (b) the 8 hard rules, each with the automatic eval check that proves it; (c) the eval case format and the first cases (at least one per hard rule, plus a deadline-only goal, a habit goal and a person who has already answered something); (d) where drafts live until final approval, and whether that needs migration 014 (the only number this block may use); (e) which files you create, under lib/setup/ (pure logic), lib/ai/setup.ts (the Claude call), types/setup.ts and tests/. No screen in this block. Wait for my answer.
6. Build as approved. The draft validator is pure code and is the same one the save step will use. The prompt states the 12-step order and the 8 hard rules; Claude fills the draft, never computes a number, and never proposes a day, time or schedule the person did not say.
7. Tests: unit tests for the schema and validator (valid and invalid drafts, including a deadline task without "can the date move", a target before time zone and week start, and a number the person never said); the eval set in tests/setup-evals.test.ts running every case against a fake model and checking every turn automatically. `npm test` makes no network call.
8. If a live eval run would help, STOP and tell me how many cases and calls it would make and roughly what it costs; run it only on my OK, through lib/services/llm.ts, and record the results (pass or fail per rule, turns and tokens per case) in the Jira comment, not in the repo.
9. If migration 014 was approved: write it, add its tables to supabase/verify/900_table_grants.sql's allow-list, add supabase/verify/014_<name>.sql, run `npx supabase db reset --local` and `npm run verify:sql`, show me the migration and `npx supabase db push --dry-run`, and stop. Say plainly: the production push and then ALL the verify scripts run at day-end step F, after CI is green on this branch's pull request and I say OK, and before that pull request merges.
10. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass.
11. Stop at a committed, green point and list what the next two blocks need (the conversation screen, chunked playback with "the latest answer wins", final approval and save, the per-setup budget set from eval runs at the 90th percentile plus a margin, failing closed to the quick path, the smaller-model trial, and log-only per-person limits with one hard shared cap). The ticket stays open.
12. Update BACKLOG.md for MOM-111, next to its existing items. Comment on MOM-111 in Jira with the design, what changed, each acceptance criterion met, partly met or not yet started, and how verified; do not move it to Done.
13. Commit with "feat(MOM-111): add the setup draft schema, prompt rules and eval set". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes (with no network call); npm run verify:sql passes locally if a migration was added; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented.
```

* **User Verification Gate:**
  - [ ] You approved the draft schema, the hard-rule checks and the eval case list before any code was written.
  - [ ] The eval set runs in `npm test` against a fake model, and each of the 8 hard rules has an automatic check (read two of them).
  - [ ] A draft with a deadline task that does not say whether its date can move fails validation.
  - [ ] Any live eval run waited for your OK, and its results are on the ticket, not in the repo.
  - [ ] If migration 014 was added: you saw it and the dry run, and nothing was pushed.

---

# SESSION 3: SOURCES AND PRIVACY

**Your prerequisites before this session:** (1) For MOM-109: nothing new on production; it uses the Hevy fixtures already in `tests/fixtures/` and the local stack (Docker running). The connected Hevy account stays as it is. (2) For MOM-102: your MOM-116 decision is recorded on that ticket (the minor tester on the manual side with no Claude-backed features, or the minors safeguards first). If it is not, the block stops and asks. (3) Be ready to approve MOM-102's updated acceptance criteria: the ticket's criteria predate the goal model and still talk about velocity.

## Block 3.1: Turn Hevy Workouts into Entries Bound to a Target (MOM-109)

* **Objective & Scope:** Rework the Hevy path so a workout becomes an entry bound to the target the person chose (through `sources` and `target_sources` in migration 013), not a new to-do task, with no hard-coded goal. Corrections (remove, restore, add, count anyway) are keyed to the Hevy record id and survive a resync. When a manual entry and a synced record look like the same event, Momentum produces one merge suggestion per group of possible duplicates and never merges on its own. A failing source gets one notice, then stays quiet until fixed. The `InboundActivityPayload` contract still holds. Showing the suggestions on screen is MOM-112's; this block returns them from a service. Migration **015** is assigned only if the design stop shows that suggestions or source state need a table and you approve it.
* **Core Invariants to Protect:** *The person's word beats any source*: a resync never changes or undoes a correction or a manual entry. *Never merge silently*. *Adapters normalize, services write* (`docs/INTEGRATIONS_SPEC.md`): `lib/adapters/hevy.ts` stays a pure normalizer; only services touch Supabase. *The old model untouched until MOM-115*: the old ingestion into tasks keeps working unless this block's design shows a safe switch, which you approve.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-109: turn Hevy workouts into entries bound to a target.

Task Instructions:
1. Read ticket MOM-109 in Jira first; its acceptance criteria are the definition of done. If it, these instructions, docs/INTEGRATIONS_SPEC.md and docs/DOMAIN_MODEL.md disagree, stop and flag it (DOMAIN_MODEL.md wins where its banner says so).
2. Check that migration 013 (MOM-107) and lib/engine/ (MOM-108) are in origin/main. If either is not, stop.
3. Read CLAUDE.md, docs/DOMAIN_MODEL.md (§1.5 sources and entries, §1.6 corrections and merges), docs/INTEGRATIONS_SPEC.md (the InboundActivityPayload contract and its superseded rules), supabase/migrations/013_goal_model_tables.sql (sources, target_sources, entries, entry_corrections and the service_role grants), lib/adapters/hevy.ts and lib/adapters/shared.ts, lib/services/integrations.ts, lib/services/ingestion.ts and lib/services/ingestionForUser.ts (today's path into tasks), tests/adapters.test.ts, tests/ingestion.test.ts, tests/ingestion-for-user.test.ts and the Hevy fixtures in tests/fixtures/, and the BACKLOG.md items under MOM-109, MOM-99 and MOM-74.
4. Create the feature branch `feature/MOM-109-hevy-entries` off an up-to-date `main`.
5. Design before coding, then STOP for my OK: how a normalized Hevy workout maps onto an entry (which value for each measure, which time, which source_record_id), how the person's chosen target is found through target_sources (and what happens when none is bound: no entry, and a clear reason), how corrections keyed to the Hevy record id are applied on resync, the duplicate rule (what "looks like the same event" means, how duplicates from one source are grouped into one prompt), how a failing source gives one notice and then stays quiet, and whether the old path into tasks stays on, is switched off for people with a bound target, or is removed. Say whether suggestions or source state need a table; if so, migration 015 is the only number this block may use. File ownership: this block owns lib/services/syncedEntries.ts and lib/entries/mergeSuggestions.ts (pure); MOM-110 owns lib/services/entries.ts, so do not create or edit it. Wait for my answer.
6. Build as approved. lib/adapters/hevy.ts stays a pure normalizer that outputs InboundActivityPayload; only services write. No hard-coded goal or target anywhere.
7. Tests: the mapping from each fixture; a resync that keeps every correction; a manual entry and a synced record of the same workout giving exactly one suggestion and no merge; duplicates from one source grouped into one prompt; a failing source giving one notice and no repeat; one person's sync never touching another's rows; the InboundActivityPayload contract test still passing.
8. If migration 015 was approved: write it, add its tables to supabase/verify/900_table_grants.sql's allow-list, add supabase/verify/015_<name>.sql, run `npx supabase db reset --local` and `npm run verify:sql`, show me the migration and `npx supabase db push --dry-run`, and stop. Say plainly: the production push and then ALL the verify scripts run at day-end step F, after CI is green on this branch's pull request and I say OK, and before that pull request merges.
9. Run `npx tsc --noEmit`, `npm test`, `npm run build` and `npm run test:e2e` (stop `npm run dev` first); all must pass, with no server error in the e2e output.
10. If the scope runs long, stop at a committed point where every check above passes, and tell me exactly what remains; the ticket stays open.
11. Add to docs/plans/.pending-live-checks.md, if the old path changed: `- [ ] MOM-109: after the push, a Hevy sync for the standing smoke-test account, if it has a connected Hevy account, gives entries and no error notice` (otherwise add nothing).
12. Update BACKLOG.md for MOM-109, next to its existing item. Comment on MOM-109 in Jira with the design, what changed, each acceptance criterion met or unmet and how verified (including the "ask the testers which apps they use" item as an owner task); do not move it to Done.
13. Commit with "feat(MOM-109): turn Hevy workouts into entries bound to a target". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes; npm run test:e2e passes; npm run verify:sql passes locally if a migration was added; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented.
```

* **User Verification Gate:**
  - [ ] You approved the mapping, the duplicate rule and the old-path decision before any code was written.
  - [ ] A resync keeps every correction (read the test), and a likely duplicate gives one suggestion and no merge.
  - [ ] A workout with no bound target creates no entry and says why.
  - [ ] `lib/adapters/hevy.ts` still only normalizes, and the `InboundActivityPayload` tests pass.
  - [ ] If migration 015 was added: you saw it and the dry run, and nothing was pushed.

---

## Block 3.2: The Privacy Approach and Notice for the Trial (MOM-102)

* **Objective & Scope:** Before real testers, state what Momentum stores and sends, and publish a notice linked from sign-up. The ticket's criteria were written for the old model (velocity, an activity summary), so the block first proposes criteria that match the goal model, for your OK: what the new tables store (person facts and settings, goals, targets, work items, entries and corrections, closed-period snapshots), what synced sources store (MOM-109), what each Claude prompt is sent (the rebalance and week-plan prompts today; setup's prompt from MOM-111), what usage counts are kept (`llm_usage_logs`), the Google "Testing" token expiry (RAID A-02), and how a person deletes their synced entries. It follows your MOM-116 decision for the minor tester and stops if that decision is not recorded.
* **Core Invariants to Protect:** *Only what each prompt needs*: no tokens, health detail or another person's data in any Claude prompt. *The repo is public*: the notice is product-level; nothing about the household or any tester's age is in the repo. *Service-layer RLS*: a deletion goes through a service and touches only the person's own rows.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-102: the privacy approach and notice for the trial.

Task Instructions:
1. Read ticket MOM-102 in Jira first, and ticket MOM-116 with its comments. If the owner's trial decision for the minor tester (the manual side with no Claude-backed features, or the minors safeguards first) is not recorded on MOM-116, STOP and ask me for it; write nothing until I answer.
2. MOM-102's acceptance criteria predate docs/DOMAIN_MODEL.md (they talk about velocity and an activity summary). Propose updated criteria that match the goal model and the decision from step 1, as a list, and STOP for my OK. When I approve them, put them on the ticket as a comment (do not edit the description).
3. Check that migration 013 (MOM-107) is in origin/main. If it is not, stop.
4. Read CLAUDE.md, docs/DOMAIN_MODEL.md, docs/AGE_TERMS_CHECK.md (MOM-116), docs/LLM_GOVERNANCE.md, docs/INTEGRATIONS_SPEC.md, supabase/migrations/013_goal_model_tables.sql and 011 (usage logs), lib/ai/rebalance.ts and lib/ai/taskPlan.ts (what each prompt sends), lib/services/llm.ts, lib/adapters/hevy.ts and lib/adapters/google.ts (what is stored from each provider), app/login/page.tsx and the sign-up form in components/auth/, lib/supabase/proxy.ts (PUBLIC_PATHS), and RAID R-03, R-04, R-14 and A-02 in docs/RAID_LOG.md.
5. Create the feature branch `feature/MOM-102-privacy-notice` off an up-to-date `main`.
6. Review, then STOP for my OK: a table of every field each Claude prompt sends today, with "needed" or "not needed" and why; and a list of what is stored from Hevy and Google. Propose a fix for anything not needed. Wait for my answer.
7. Build as approved: a public privacy page (app/privacy/page.tsx, added to PUBLIC_PATHS in lib/supabase/proxy.ts) in plain words, linked from sign-up on /login; any approved prompt trims, with tests that each prompt sends only the approved fields. A person's deletion of their synced entries: build it only if lib/services/syncedEntries.ts (MOM-109) is in origin/main; if it is not, leave that criterion open on the ticket and say so.
8. Tests: the privacy page renders and is reachable signed out (unit, and a browser spec in tests/e2e/auth.spec.ts or a new tests/e2e/privacy.spec.ts); the sign-up link is present; each prompt's fields. Run `npx tsc --noEmit`, `npm test`, `npm run build` and `npm run test:e2e` (stop `npm run dev` first); all must pass.
9. Add to docs/plans/.pending-live-checks.md: `- [ ] MOM-102: signed out, /privacy loads on production and is linked from sign-up; signed in as the standing smoke-test account, nothing changed` (after the push).
10. Update BACKLOG.md for MOM-102, next to its existing item, and set RAID R-03 and R-04 to point at what this block did (only if the owner approves the log edit at day-end; otherwise list it in the Jira comment). Comment on MOM-102 in Jira with the review tables, what changed, and each approved criterion met or unmet; do not move it to Done.
11. Commit with "feat(MOM-102): add the privacy notice and trim Claude prompts to what they need". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes; npm run test:e2e passes; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented.
```

* **User Verification Gate:**
  - [ ] Your MOM-116 decision was recorded before the block wrote anything, and you approved the updated criteria.
  - [ ] You saw the table of what each Claude prompt sends, and every field left in is needed.
  - [ ] The notice reads plainly, says what the new tables store, names no tester and is linked from sign-up.
  - [ ] After the push: `/privacy` loads signed out on production, and signing in as the standing smoke-test account still works.

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

`npm run test:e2e` and `npm run verify:sql` also run in CI on every pull request. Run them here too for a branch that changed pages, auth, the wizard, the drawer, manual entry or a migration (stop `npm run dev` first). Any server error in the e2e output is a failure: the "destination stream errored" line was fixed by MOM-120, so if it comes back, it is a failure and MOM-120 is reopened.

A browser test run leaves the development server's generated route types in `.next/dev/`, and they outlive a branch switch: a branch checked after one that added pages can fail `npx tsc --noEmit` on routes it does not have (found at the 2026-10-26 day-end). If `tsc` or the build fails only in a file under `.next/`, delete `.next/dev` (git-ignored, rebuilt on the next `npm run dev`) and run the check again; any other failure is real.

## B. Database verification (production), only if migrations were applied in the window

A migration is applied to production inside its own block (after CI is green on its pull request and your OK, before that pull request merges). B is the day's re-check of production once all blocks are done. A migration is in the window when `git log --branches --remotes --not <window> --name-only --format=%h -- supabase/migrations` lists a file. B also runs when a script in `supabase/verify/` changed in the window (MOM-121 today), because production is where those scripts are proven. **Git Bash only.** This loop uses `/tmp`, `grep`, `$(...)` and `for ... done`, which do not work in PowerShell. `npm test` does **not** run these scripts. Every script must report `false 0` and a non-zero `true` count (0 and 0 means the script errored).

```bash
npx supabase migration list                         # local and remote columns must match for every migration
T=0; F=0
for f in supabase/verify/*.sql; do
  npx supabase db query --linked -f "$f" -o table > /tmp/v.txt 2>&1
  t=$(grep -cE '│ true ' /tmp/v.txt); fl=$(grep -cE '│ false ' /tmp/v.txt)
  echo "$(basename $f): true $t false $fl"; T=$((T+t)); F=$((F+fl))
done; echo "TOTAL true $T false $F"                 # expect false 0 and a true count no lower than the previous day-end's production total (MOM-107's comment), plus any checks added in the window. A local count is not a production count: one script runs 5 more checks on production
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
| **Thin slice: build day 2 of N = 5** | The design record sets N = 5 build days with a checkpoint at the end of build day 3 (`docs/design/2026-10-26-goal-model-design.md` §6.1). Day 1 built the data model and the engine. Today covers manual entry (MOM-110, block 1 of 2), setup (MOM-111, block 1 of 3), Hevy into entries (MOM-109) and the privacy notice (MOM-102). Day 3 should hold home and the week plan (MOM-112), the second blocks of MOM-110 and MOM-111, and the weekly review if time allows. If setup runs long, the day-3 checkpoint shows it. |
| **One key heads one block** | Manual entry is sized at 2 blocks and setup at 3, but a key may head only one block per plan. Each block stops at a committed, green point; its ticket stays open and the next plan carries the rest. |
| **The 2026-10-26 pull requests conflict in `BACKLOG.md`** | The step D branch conflicts with MOM-104, 107, 108, 120 and 64, and MOM-104 conflicts with MOM-120, MOM-107 with MOM-108, all in `BACKLOG.md`; this plan's own branch conflicts with MOM-104 in `docs/plans/NEXT_BUILD_PLAN.md`. The rule stands: after one merges, merge `origin/main` into the later branch locally, keep both sides (for the plan file, keep this plan, which already carries MOM-104's wording), and push that with your OK. If any is still unmerged at `/day-start`, the blocks wait. |
| **MOM-110 and MOM-109 share the entries tables** | Each owns its own files (MOM-110: `lib/services/entries.ts`, `app/actions/entries.ts`, `components/entries/`; MOM-109: `lib/services/syncedEntries.ts`, `lib/entries/mergeSuggestions.ts`), so neither needs the other's unmerged code. The merge suggestion compares rows in the database, not each other's functions. If a design stop needs the other's code, it stops and offers the two ways forward. |
| **Two migration numbers, both optional** | MOM-111 may take 014 (where setup drafts live) and MOM-109 may take 015 (merge suggestions or source state), each only if its design stop shows it and you approve. Either one is applied at day-end step F before its pull request merges, with every verify script after it. |
| **MOM-121 before testers have data** | Day-end step B runs every verify script on production. Until MOM-121 merges, one script's data repair is not limited to its own user; it changed nothing on 2026-10-26 because no real data matched (RAID R-19). No tester gets an account before it merges. |
| **MOM-102 waits for your MOM-116 decision** | The notice must match the minor tester's terms (manual side with no Claude-backed features, or the minors safeguards first). The block stops and asks if the decision is not on MOM-116. Its acceptance criteria predate the goal model, so the block proposes new ones for your OK first. |
| **Setup's day end follows MOM-125** | MOM-111 runs the same day as MOM-125, before MOM-125's pull request merges, so its prompt treats MOM-125's ticket wording as binding. If the two pull requests disagree at review, MOM-125's wording wins. |
| **Live Claude calls** | `npm test` never calls Claude. MOM-111's eval set runs against a fake; a live run waits for your OK with its call count and cost, and its results go on the ticket. Setup's own budget is set in a later block from those runs. |
| **The CAPTCHA order** | Site key in Vercel and redeploy, then the secret in the Supabase dashboard, then a sign-in test (RAID R-17). Switching it on at the provider first blocks every sign-in, including yours; switching it off again restores sign-in. |
| **Auth email limits** | The default sender's hourly cap and the same-browser reset link are MOM-122 (RAID I-06, R-18); the production walk with a disposable second account is MOM-123. Both are trial prerequisites, not scheduled today. |
| **Archive name** | The plan run on 2026-10-26 carried the date 2026-10-27 and is archived as `docs/plans/archive/2026-10-27.md`. This plan has the same date, so the next day-end archives it as `docs/plans/archive/2026-10-27-2.md` rather than overwriting. |
| **Standing smoke-test account** | `smoke-test@momentum-app.test` exists on production. Every live gate signs in as it; its password stays in your password manager. Production must hold exactly one user at day-end step B; no block creates a second one (MOM-123's disposable account is owner-run, on its own day, and deleted straight after). |
| **The old model stays until MOM-115** | The wizard, rebalance and checkbox criteria keep running, with the completion guard of migrations 002 and 008. New code follows `docs/DOMAIN_MODEL.md` and is built beside the old tables. Backlog items for the old model's gaps are now keyed to MOM-115. |
| **Dark only until MOM-30** | The app is dark regardless of the device setting. Light mode with a follow-device default is MOM-30, not scheduled. |
| **Not scheduled, queued with keys** | Thin slice: MOM-112 (home and week plan), MOM-113 (weekly review), MOM-114 (settings), MOM-115 (retire the old model). Trial prerequisites: MOM-122 (auth email), MOM-123 (production auth walk). Follow-ons during the trial: MOM-117 (own sheet and templates), MOM-118 (career playbook). Other: MOM-124 (day-loop tooling), MOM-119 (grants), MOM-98 (webhooks), MOM-99 (adapter follow-ups), MOM-100 (CI hardening), MOM-74 (retire `HEVY_API_KEY`), MOM-91 (`connection()`), MOM-95, MOM-96, MOM-97, MOM-101, MOM-70, MOM-26. |
| **Product risks live in the RAID log** | This table covers decisions for this build cycle. Product risks, assumptions, issues and dependencies (privacy of goal data, stored tokens and health data, model cost, synced data miscounting, setup inferring wrongly, a minor in the trial, local and production databases differing, check scripts writing to real data) are in `docs/RAID_LOG.md`, and AI misses in `docs/FAILURE_LOG.md`; both are reviewed in step D every day-end (MOM-92). |
| **Pull requests, not direct pushes** | `main` is protected (MOM-67): every change reaches it through a pull request with `checks` and `database` green, merged with a merge commit. `/run-block` commits on a feature branch and never merges; `/day-end` pushes the day's branches once, after your OK. A production migration is applied before its pull request merges (merging deploys to Vercel). |
