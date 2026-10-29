# 🚀 MOMENTUM BUILD: NEXT-PHASE MASTER EXECUTION PLAN

> **Date:** 2026-10-29 | **Active Epic:** MOM-105 | **Base Commit:** e4aadc7

> **Since the last plan (run on 2026-10-28):** build day 3 of the goal-model thin slice (the checkpoint day) built setup's budget with migration 014 (MOM-128, plus a two-run live pilot of about $2 that proved the schema fix and left the budget numbers as placeholders), manual entry part 2: a chosen day within the last 7 and typed minutes (MOM-110), setup's screen, playback and save with migration 015 (MOM-111 block 2, stacked on MOM-128, 015 taken with the owner's OK), Hevy "Sync now" (MOM-129) and home's scoreboard cards from the approved mock-up (MOM-112 block 1). They reach `main` through that day-end's pull requests, with **014 and 015 applied to production before MOM-128's and MOM-111's pull requests merge**. The 2026-10-28 day-end closed **MOM-116** (redundant with MOM-126), created **MOM-131** (390px header overflow), **MOM-132** (add a goal or target after first setup) and **MOM-133** (lighter logs), and added the owner's MOM-124 tooling items. From 2026-10-28 on, **blocks never edit `BACKLOG.md`**: a block's backlog notes go in its Jira comment and close-out, and day-end step D writes the backlog once. Production before the push: migrations 001 to 013, exactly one user (the standing smoke-test account). The next free migration number is **016**. This is **build day 4 of N = 5**, and whether N stays 5 or becomes 6 is an open checkpoint for this day-end, decided with day 4's actual progress.

---

## Today's runbook

**How to run a day.** Type `/day-start` first: it only reads and reports. Then type the command in the table below for each block, in this order, and skip any block whose Jira ticket is already Done. Each command first shows the block's model and effort: if your session differs, it stops and tells you the exact `/model` and `/effort` to type (use the session-only choice in the `/effort` slider, so your saved default is left alone), and you start the command again. Run `/clear` between blocks. When the last block is done, type `/day-end`. Nothing is pushed, merged or applied to production without your explicit OK, and work reaches `main` only through a pull request once both CI jobs are green.

| # | Type | Session setting | What to check at the gate |
| --- | --- | --- | --- |
| 0 | `/day-start` | Sonnet / Low | A clean tree, `main` matching `origin/main` with every 2026-10-28 pull request merged (MOM-128, MOM-110, MOM-111, MOM-129, MOM-112, and the day-end's backlog and plan branches), migrations 014 and 015 on production, no leftover branches, the plan passing its format check, no missing environment variable names. Then the carry-overs in `docs/plans/.pending-live-checks.md` (read the note on the one-time production setup in Open Decisions first). |
| 1 | `/run-block MOM-124` | Sonnet / Medium | Size S. `npm run stack:status` says only "running" or "not running" and prints no keys; the unfiltered status command is denied in `.claude/settings.json`; `/day-start` prints the `/rc` reminder; `/run-block` says blocks never edit `BACKLOG.md`. The other MOM-124 items stay for a later block. |
| 2 | `/run-block MOM-133` | Sonnet / Medium | Size S. You approved the new log rules before any edit; CLAUDE.md, `/day-end` and the two log files' headers say the same thing; nothing in `NEXT_BUILD_PLAN.md` was edited (step E carries the new rules into the next plan); old entries and rows are kept as history. |
| 3 | `/run-block MOM-111` | Sonnet / High | Size M. You approved the field table and the metric design before code; a test pins exactly the fields setup sends to Claude and fails if one is added; `/privacy` says what setup sends, field by field; a Hevy quantity target's binding names its metric, and the sync uses it; migration 016 only if you approved it; no live Claude call. |
| 4 | `/run-block MOM-113` | Sonnet / High | Size L, will split. You approved the review's design and this block's slice before code; every number in the review comes from the engine; migration 017 only if you approved it; any live Claude call waited for your OK; the ticket stays open with the next blocks listed. |
| 5 | `/day-end` | Opus / High | The day's branches pass their checks; any migration (016, 017) is applied to production at step F after CI is green and your OK, before its pull request merges, with every verify script after it; the N = 5 or 6 checkpoint is decided with day 4's actual progress. |

If a block needs another ticket's code, `/run-block` checks that code is already in `origin/main`. If it is only on an unmerged branch, it stops and offers two ways forward: push that branch and merge its pull request first, or stack this block on that branch (only with your OK). **Every block in this plan needs the 2026-10-28 pull requests merged**: block 3 (MOM-111) needs MOM-128's migration 014 and MOM-111's block 2 with migration 015 in `origin/main` and on production, and block 4 (MOM-113) reads MOM-112's scoreboard service. No block today needs another block of this plan.

---

## Executive Overview & Architectural Invariants

Build day 4 starts with two small tooling blocks that remove the day loop's repeat friction: a keyless way to ask whether the local stack is up, with the unfiltered status command denied, plus the rule that blocks never edit `BACKLOG.md` (MOM-124, trimmed to S); and lighter logs (MOM-133), so the nightly review costs less and keeps only entries that change something. Then setup's third block (MOM-111): a pinned, field-by-field check of what setup sends to Claude, and a binding that names a quantity target's metric instead of guessing it from the unit text. The day ends with the weekly review's first block (MOM-113), which starts at a design stop and is expected to split.

`docs/DOMAIN_MODEL.md` is binding for all new code. The old model stays in the code until MOM-115 retires it, so new code is built beside the old tables, never into them. Every block preserves these invariants:

1. **Claude never scores.** The engine (`lib/engine/`) computes every number from entries and the target in force; no Claude output is stored as a number, and setup's draft is validated by code, not by Claude (DOMAIN_MODEL §1.7, principle 9). The weekly review's recap and its one adjustment come from the engine.
2. **The person's word beats any source.** A manual entry or correction always wins over a sync; corrections are keyed to the source's own record id, so a resync never undoes them (§1.5, §1.6).
3. **Never assume anything about a person's life.** Time zone, week start and day end are the person's to set; setup asks them and never proposes a day, time or schedule the person did not say; setup asks which metric a quantity target counts (principle 1, §2.2).
4. **Unfinished work moves, habits never carry over.** (§1.4, principle 11.)
5. **Service-layer RLS enforcement.** The UI never queries Supabase. Every read and write of the new tables goes through `lib/services/`; every new table (if any) has row level security keyed to its owner, explicit grants and an entry in `supabase/verify/900_table_grants.sql`'s allow-list.
6. **The old model's guards stay until MOM-115.** The completion guard (migrations 002 and 008) and the append-only `task_rebalance_history` keep protecting the old tables; nothing today edits an applied migration or an old table.
7. **Nothing is saved until final approval** in setup, every Claude call goes through `lib/services/llm.ts`, and setup sends Claude only the fields the owner approved.

## Standing Rules (every prompt below repeats what it needs)

- **Read the Jira ticket first.** If its title, scope or acceptance criteria disagree with the prompt, or the prompt disagrees with `docs/DOMAIN_MODEL.md`, stop and flag it.
- **Production changes need your approval.** A prompt stops before `supabase db push`, `vercel env`, or any push to `origin`, shows what will happen, and waits. Never use the SQL Editor. Tests never run against production and never use production credentials.
- **Database checks are not part of `npm test`.** They live in the SQL scripts in `supabase/verify/` and run with `npm run verify:sql` (local stack) or, against production, with the step B loop. After any migration, or any change to a verify script, run **all** of them; every row must show `passed = true`. A local total is not a production total: one script has checks that run only on production (RAID R-16, failure-log F-027).
- **New migrations use the numbers this plan assigns:** MOM-111 may take **016**, MOM-113 may take **017**, each only if its design stop shows it is needed and you approve it. A number left unused stays unused (a gap is fine). No other block adds a migration. Never edit an applied migration.
- **Pull requests, not local merges.** `main` is protected: work reaches it only through a pull request with the CI jobs `checks` and `database` green, merged with a merge commit (CLAUDE.md). A block commits on its feature branch and stops: it never merges into `main` and never pushes. Branches are pushed once, at day-end (step F), after your explicit OK.
- **A migration is applied before its pull request merges.** A block with a migration runs `npm run verify:sql` locally, shows the migration and `npx supabase db push --dry-run`, and stops. At day-end step F, once CI is green on its pull request and you say OK, the production `db push` and then ALL the verify scripts run, before that pull request merges (merging deploys to Vercel, and the new code needs the new schema).
- **Blocks never edit `BACKLOG.md`** (owner's rule since 2026-10-28). A block's backlog notes, new gaps and follow-ups go in its Jira comment and its close-out; day-end step D writes `BACKLOG.md` once, on its own branch. This removes the merge conflicts parallel branches caused.
- **Is the local stack up?** Ask it with `npm run stack:status` once MOM-124's block has added it (it prints only "running" or "not running"). Never run `supabase status` unfiltered: its output holds the local stack's keys (failure log F-047, F-049, F-051, F-057). Until the script exists, use `docker ps --format "{{.Names}}"` and look for the `supabase_db_` container name.
- **Claude calls cost money.** `npm test` never calls Claude: model calls in tests go through a fake. A block that wants a live Claude call (an eval run, a prompt check) says how many calls and stops for your OK first, and it is logged through `lib/services/llm.ts`.
- **Stale generated types.** Generated route types under `.next/` outlive a branch switch (failure log F-028, F-039). Until MOM-130 builds it into the commands, delete `.next/types` and `.next/dev` (both git-ignored and regenerated) before `npx tsc --noEmit` or `npm run build` on a branch you just switched to.
- **Standing smoke-test account.** Production keeps ONE standing test account, `smoke-test@momentum-app.test`, created by you in the Supabase dashboard (Authentication → Add user, Auto Confirm User on). Its password lives only in your password manager: Claude never asks for it, prints it or stores it in the repo, and never creates, edits or deletes users on production. Every live sign-in check in this plan says "sign in as the standing smoke-test account". Claude may read its data with **count-only** queries. If its data gets cluttered, you delete and recreate it in the dashboard (it starts empty). The SQL verify scripts create and delete their own passwordless temporary users and leave none behind, and since MOM-121 every insert, update and delete in them is limited to those users (writes made through function calls are MOM-127, not yet built). Production should always hold exactly one user. The standing account's goal-model data is created only through the app (setup, logging), never seeded by hand. Browser tests use throwaway users on the **local** stack only.
- **The repo is public.** Anything written to a committed file (logs, docs, tests, fixtures, eval cases) names categories, never secrets, personal data or exploit steps. Trial testers are described by role only ("the owner", "two household testers"). The family trial is adults only (MOM-116, now carried by MOM-126). Eval cases are scripted, with personal details removed.

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
SESSION 1: THE DAY LOOP (MOM-124, MOM-133)   thin slice, build day 4 of 5 (N = 5 or 6 is decided at this day-end)
  - A keyless stack check and the no-BACKLOG rule, then lighter logs
SESSION 2: GUIDED SETUP (MOM-111)
  - Setup's third block: the pinned field-by-field privacy check, and a binding that names its metric
SESSION 3: THE WEEKLY REVIEW (MOM-113)
  - Design stop first, then the first approved piece; expected to split
```

*Order matters. MOM-124's trimmed block comes first because every later block checks the local stack, and its script and settings deny remove a slip that recurred four times on day 3. MOM-133 comes second, so the day's later blocks already write log entries under the lighter rule once you approve it. Neither tooling block touches `docs/plans/NEXT_BUILD_PLAN.md` (step E rewrites it) or the other's files: MOM-124 edits `/day-start`, `/run-block`, `.claude/settings.json`, `package.json` and a new script; MOM-133 edits CLAUDE.md, `/day-end`, the two log files' headers and the spec's notes. MOM-111 needs 014, 015 and block 2 in `origin/main` and on production. MOM-113 reads the engine and MOM-112's scoreboard service and edits neither. Safe stopping points: after each block. If the day runs short, MOM-113 stops at its approved design (the design is the most useful part of its first block), then MOM-133 moves to day 5.*

---

# SESSION 1: THE DAY LOOP

**Your prerequisites before this session:** (1) Every 2026-10-28 pull request is merged, and migrations 014 and 015 are on production; `/day-start` shows it. (2) Docker Desktop running and the local stack started (`npx supabase start`) for the later sessions; the tooling blocks need it only to try the new script. (3) For MOM-133: be ready to approve the new log rules (the Jira risk label, where the weekly top 5 lives, and when the monthly review runs).

## Block 1.1: Day-Loop Tooling, Part 1: A Keyless Stack Check and the No-BACKLOG Rule (MOM-124)

* **Objective & Scope:** Size S (about 20 to 40 minutes after your design OK). Three of MOM-124's items only: (1) `npm run stack:status`, a script that prints only "running" or "not running" for the local Supabase stack and never a key, plus a deny in `.claude/settings.json` for the unfiltered `supabase status` command; (2) a reminder line in `/day-start`: "Turn on /rc once a day for phone mirroring. Push settings are in /config."; (3) the rule in `/run-block` that blocks never edit `BACKLOG.md` (backlog notes go in the Jira comment and the close-out; day-end step D writes it once). Everything else on MOM-124 (the step 0 count fix, step B timing, the expected e2e log lines, block sizes, the red-CI loop, the design-stop review) waits for a later block, after MOM-133 settles the step D text.
* **Core Invariants to Protect:** *Secrets are read only in server-side code and never printed* (CLAUDE.md): the script prints one word and nothing from the status output. *Commands read before they act*: no command gains a write. *Nothing is pushed*.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-124, part 1 (size S): a keyless "is the stack up" check, the settings deny for the unfiltered status command, the /day-start /rc reminder, and the "blocks never edit BACKLOG.md" rule in /run-block.

Task Instructions:
1. Read ticket MOM-124 in Jira first, and its BACKLOG.md items dated 2026-10-28. This block covers only these three items: the stack check plus the settings deny, the /day-start reminder line, and the /run-block BACKLOG rule. Leave every other MOM-124 item alone (the step 0 count fix, step B timing, the expected e2e log lines, block sizes, the red-CI loop, the design-stop review). If the ticket and these instructions disagree, stop and flag it.
2. Read CLAUDE.md (the Daily Build Loop section), .claude/commands/day-start.md, .claude/commands/run-block.md, .claude/settings.json, package.json (scripts), scripts/run-sql-verify.ts (how a script here runs a child process and reports), docs/mom-75-plan-execution-spec.md §5 and §10, and failure-log entries F-047, F-049, F-051 and F-057 in docs/FAILURE_LOG.md. Do not run `supabase status` unfiltered at any point: until your script exists, check the stack with `docker ps --format "{{.Names}}"` and look for a name starting with `supabase_db_`.
3. Create the feature branch `feature/MOM-124-stack-check-and-backlog-rule` off an up-to-date `main`.
4. Design before coding, then STOP for my OK: the script's name (`npm run stack:status`), how it decides running or not without printing anything from the status output (its exit code, or the JSON output parsed in memory and discarded), its exact output and exit codes, how a test drives it without Docker (an injected runner), the exact allow and deny entries in .claude/settings.json (the deny must cover `supabase status` and `npx supabase status` in any form, and must not block `npm run stack:status`), the reminder line's place in /day-start, and the BACKLOG rule's wording and place in /run-block (including what a block does instead: notes in the Jira comment and the close-out). Wait for my answer.
5. Build as approved. The script prints exactly "Local Supabase stack: running" or "Local Supabase stack: not running" and nothing else, on success or failure. Where /run-block or /day-start tell the agent how to check the stack, point them at `npm run stack:status`.
6. Tests: the script against an injected runner (running, not running, the runner failing or printing keys: the output is still one line with no key in it); a test that reads .claude/settings.json and fails if the deny entries are missing or the allow entry for the script is missing. `npm test` makes no network call and starts no container.
7. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass. Try `npm run stack:status` once with the local stack up and once with it stopped (or say why you could not), and show both outputs.
8. Do not edit BACKLOG.md (this block puts the rule in place). Put your backlog notes in the Jira comment and the close-out. Comment on MOM-124 in Jira with what changed, which three items are done and which stay for the later MOM-124 block; do not move it to Done. Say "Privacy impact: none" or what changed in the close-out.
9. Commit with "feat(MOM-124): add a keyless stack check, deny the unfiltered status, and keep blocks out of BACKLOG.md". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes (with no network call); npm run build passes; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] You approved the script, the settings entries and the two command edits before any code.
  - [ ] `npm run stack:status` prints one line, running or not running, and no key (read both outputs).
  - [ ] The unfiltered status command is denied in `.claude/settings.json`, and a test fails without the deny.
  - [ ] `/day-start` shows the `/rc` reminder; `/run-block` says blocks never edit `BACKLOG.md`.
  - [ ] Nothing was pushed; the other MOM-124 items are listed as waiting.

---

## Block 1.2: Lighter Logs (MOM-133)

* **Objective & Scope:** Size S (about 20 to 40 minutes after your design OK). Make the logs lighter while keeping what they are for: a failure entry is written only when it leads to a fix, a rule or a ticket (and says which); the nightly "predicted it?" question is dropped for a monthly pattern review; risks move to Jira with a risk label and a weekly top 5; `docs/RAID_LOG.md` is frozen with a banner (its rows stay as history); CLAUDE.md and `/day-end` are updated to match. The "before" numbers are in the 2026-10-28 comment on MOM-92. This block does **not** edit `docs/plans/NEXT_BUILD_PLAN.md`: day-end step E writes the next plan's step D from the new rules once this branch is among the day's branches.
* **Core Invariants to Protect:** *The repo is public*: the new rules keep the public-repo rule for anything still written to the repo, and Jira holds specifics. *Never lose history*: no entry or row is deleted or rewritten. *The log files are staged only for the approved header and banner*, never for unreviewed entries.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-133: lighter logs. Failure entries only when they change something, a monthly pattern review instead of the nightly "predicted it?", RAID moved to a Jira risk label with a weekly top 5, RAID_LOG frozen, and CLAUDE.md and /day-end updated to match.

Task Instructions:
1. Read ticket MOM-133 in Jira first, and the 2026-10-28 comment on MOM-92 (the "before" numbers). Its acceptance criteria are the definition of done. If they and these instructions disagree, stop and flag it.
2. Read CLAUDE.md ("RAID and Failure Logs (MOM-92)"), .claude/commands/day-end.md (step 0's "nothing to sync" conditions and step 3, D, with the log review and the playbook question), the headers of docs/FAILURE_LOG.md and docs/RAID_LOG.md (how each is kept), docs/mom-75-plan-execution-spec.md §2.3 and §7 (the lines about the logs), and, read only, section D item 7 and section E of docs/plans/NEXT_BUILD_PLAN.md. Do not edit docs/plans/NEXT_BUILD_PLAN.md: step E rewrites it at day-end from the rules this block sets.
3. Create the feature branch `feature/MOM-133-lighter-logs` off an up-to-date `main`.
4. Design before coding, then STOP for my OK: (a) the new capture rule in CLAUDE.md (an entry only when it leads to a fix, a rule or a ticket, and the entry names which); (b) the monthly pattern review: when it runs (for example the first day-end of a month), what it looks at, and where its result goes; (c) RAID in Jira: the label name, whether existing open risks get the label on the tickets they already point at (list them), where the weekly top 5 lives (a saved Jira filter or a short weekly step), and who keeps it; (d) the frozen banner for docs/RAID_LOG.md and the new header for docs/FAILURE_LOG.md; (e) the new /day-end text: step 0's unreviewed-entry condition, step 3's log step and the playbook question (kept), and what step D asks the owner each night now; (f) what changes in the spec's notes. Say which of these touch Jira (a label, a filter) and wait for my OK before any Jira change. Wait for my answer.
5. Build as approved. Keep every existing entry and row as it is. In docs/FAILURE_LOG.md and docs/RAID_LOG.md change only the header and banner lines I approved. If the working copy holds other uncommitted entries in either file, stop and ask before staging anything; never stage an entry that is not reviewed.
6. Run `npx tsc --noEmit`, `npm test` and `npm run plan:check -- --strict` (on the current plan; it must still pass, since nothing in it changed); all must pass.
7. Do not edit BACKLOG.md. Put backlog notes in the Jira comment and the close-out. Comment on MOM-133 with what changed, each acceptance criterion met or unmet and how verified; the criterion about the next generated plan is met only at day-end step E; do not move it to Done.
8. Commit with "docs(MOM-133): make the logs lighter and move risks to Jira", staging files by name (CLAUDE.md, .claude/commands/day-end.md, docs/mom-75-plan-execution-spec.md, and the two log files only for the approved header lines). Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes; npm run plan:check -- --strict passes; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] You approved the new rules, the Jira label and where the weekly top 5 lives before any edit or Jira change.
  - [ ] CLAUDE.md, `/day-end` and the two log headers say the same thing (read them side by side).
  - [ ] No existing entry or row was changed or deleted; only the approved header and banner lines in the two log files are committed.
  - [ ] `docs/plans/NEXT_BUILD_PLAN.md` is unchanged on this branch.

---

# SESSION 2: GUIDED SETUP

**Your prerequisites before this session:** (1) MOM-128's and MOM-111 block 2's pull requests are merged, and `npx supabase migration list` shows 014 and 015 on production. (2) The local stack running with `main`'s migrations (`npx supabase db reset --local` after switching). (3) Be ready to approve the field-by-field table and the metric design; this block makes no live Claude call.

## Block 2.1: Guided Setup, Part 3: What Setup Sends, Field by Field, and the Binding's Metric (MOM-111)

* **Objective & Scope:** Size M (about 40 to 70 minutes after your design OK). The third of setup's blocks: (1) the field-by-field check of what setup sends to Claude (needed or not needed for each field), with a test that pins exactly the approved fields and fails if one is added, and the privacy notice's setup line rewritten from that table, replacing `GUIDED_SETUP_LINE` in `lib/config/privacy.ts`; (2) a binding that names a quantity target's metric (volume in lb or kg, sets, minutes), asked in setup and read by the Hevy sync, instead of `entryValue` in `lib/services/syncedEntries.ts` guessing it from the target's unit text (MOM-109's stopgap). Migration **016** only if the design stop shows the metric needs a column and you approve it. The simulated-person eval and the paid full runs stay for a later block, each with your OK.
* **Core Invariants to Protect:** *Only what the prompt needs* (MOM-102): setup sends the approved fields and nothing else, pinned by a test. *Never assume*: setup asks the metric; nothing is guessed from a unit when a binding names one. *Never edit an applied migration*: 015's `save_guided_setup` stays as it is; a change to the save is a new migration. *The person's word beats any source*.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-111, third block: pin what setup sends to Claude, field by field, and let a binding name its quantity metric.

Task Instructions:
1. Read ticket MOM-111 in Jira first, with all its comments (especially the 2026-10-28 block 2 close-out and the notes from MOM-128). Its acceptance criteria are the definition of done for the whole ticket; this block covers part of them. If they, these instructions and docs/DOMAIN_MODEL.md disagree, stop and flag it.
2. This block needs MOM-111's second block and MOM-128 in origin/main: check `git log origin/main --oneline --grep="(MOM-111):" -n 5` shows "add the setup conversation screen, playback and save", and that supabase/migrations/ on main holds 014_setup_budget.sql and 015_save_guided_setup.sql. Check `npx supabase migration list` shows 014 and 015 on the remote. If any is missing, stop.
3. Read CLAUDE.md, docs/DOMAIN_MODEL.md (§2 in full, §1.5 sources and bindings, the principles), docs/LLM_GOVERNANCE.md, lib/config/privacy.ts (GUIDED_SETUP_LINE and how the notice is built), components/privacy/PrivacyNotice.tsx, tests/privacy-sync.test.ts and tests/privacy-notice.test.tsx, lib/setup/prompt.ts, lib/setup/session.ts, lib/ai/setup.ts, lib/services/setup.ts, lib/services/llm.ts (runSetupTurn), types/setup.ts, lib/setup/steps.ts, lib/setup/validate.ts, lib/setup/rows.ts, supabase/migrations/013_goal_model_tables.sql (target_sources) and 015_save_guided_setup.sql, lib/services/syncedEntries.ts (entryValue and the unit stopgap), tests/synced-entries.test.ts, tests/setup-service.test.ts, tests/e2e/setup.spec.ts, and the BACKLOG.md items under MOM-111 and MOM-109 (the privacy check and the metric stopgap). Check the local stack with `npm run stack:status` (or, if MOM-124 has not merged, `docker ps --format "{{.Names}}"`); never run `supabase status` unfiltered.
4. Create the feature branch `feature/MOM-111-setup-fields-and-metric` off an up-to-date `main`.
5. Design before coding, then STOP for my OK: (a) the field table: every field a setup call sends to Claude (the person's words, Claude's earlier replies, the draft, the device date, the fixed prompt, anything else), each marked needed or not needed with the reason, what you remove, and the test that pins exactly the approved fields; (b) the new privacy notice text for setup, written from that table, replacing GUIDED_SETUP_LINE; (c) the metric: which metrics a Hevy quantity target can count, where the binding stores it (a column on target_sources by migration 016, the only number this block may use, or a reason it needs none), how setup asks it as one question and only for a quantity target bound to an app that has metrics, how the save writes it without editing 015 (a new function version in 016, if needed), and how the sync reads it (a binding without a metric: no guess; the entry is skipped with a plain reason, or the unit text is kept as a labelled fallback, your call to propose); (d) what changes in each file. Wait for my answer.
6. Build as approved. If migration 016 was approved: write supabase/migrations/016_<name>.sql and supabase/verify/016_<name>.sql (with checks that can fail), add any new grant to 900_table_grants.sql's allow-list only if the design says so, run `npx supabase db reset --local` and `npm run verify:sql`, show me the migration and `npx supabase db push --dry-run`, and stop. Say plainly: the production push and then ALL the verify scripts run at day-end step F, after CI is green on this branch's pull request and I say OK, and before that pull request merges. Add to docs/plans/.pending-live-checks.md: `- [ ] MOM-111 (016): after the push, production supabase db push for migration 016, then every verify script, before the pull request merges`.
7. Tests: the pinned-fields test (fails when a field is added to a setup call); the privacy sync test still matches the notice; setup asks the metric only where it applies and never assumes one; the save writes it; the sync counts by the bound metric and never by the unit text when a metric is bound; a binding without a metric behaves as approved; the eval set still passes; `npm test` makes no network call.
8. No live Claude call in this block. If you think one is needed, stop and say why; paid runs are a later block with my OK.
9. Run `npx tsc --noEmit`, `npm test`, `npm run build` and `npm run test:e2e` (stop `npm run dev` first), and `npm run verify:sql` if a migration was added; all must pass, with no server error in the e2e output other than the two known wizard-spec 401 lines.
10. Stop at a committed, green point and list what remains for MOM-111 (the simulated-person eval and the full runs on three models with my OK, the three pilot rule breaks, a fuller quick path, whatever this block found). The ticket stays open.
11. Do not edit BACKLOG.md. Put backlog notes in the Jira comment and the close-out. Say "Privacy impact" in the close-out (the notice changes in this block). Comment on MOM-111 in Jira with the approved table and design, what changed, each acceptance criterion met, partly met or not yet started, and how verified; do not move it to Done.
12. Commit with "feat(MOM-111): pin the fields setup sends to Claude and let a binding name its metric". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes (with no network call); npm run test:e2e passes; npm run verify:sql passes locally if a migration was added; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] You approved the field table, the notice text and the metric design before any code.
  - [ ] A test pins exactly the approved fields and fails when one is added (read it).
  - [ ] `/privacy` says what setup sends, field by field, and the privacy sync test passes.
  - [ ] A Hevy quantity target counts by its bound metric; nothing is guessed when a metric is bound.
  - [ ] If migration 016 was added: you saw it and the dry run, and nothing was pushed. After the push: production `db push` and every verify script, before the pull request merges.

---

# SESSION 3: THE WEEKLY REVIEW

**Your prerequisites before this session:** (1) MOM-112's block 1 is merged (its scoreboard service is in `origin/main`). (2) Be ready to approve the weekly review's design and this block's slice at its stop, and to say yes or no to any live Claude call (the block says how many and roughly what they cost first).

## Block 3.1: The Weekly Review, First Block (MOM-113)

* **Objective & Scope:** Size L (70 minutes or more after your design OK; split it next time). The first block of the layered weekly review (`docs/DOMAIN_MODEL.md` §3): it starts with a design stop for the whole review (the layers, what the engine raises in layer 3, the tone rules, where a review is stored, what each recap says and keeps, RAID R-26) and the slice this block builds. Only the approved slice is built; the rest is listed for later blocks. Migration **017** only if the design stop shows it is needed (for example a review record table, or a `weekly_review` feature in the Claude usage log's feature check) and you approve it.
* **Core Invariants to Protect:** *Claude never scores*: every number and the one adjustment come from `lib/engine/`; Claude may only word a reflection offer the engine has chosen, if the design includes it. *Never assume*: no day or time the person did not set. *The person's word beats any source*: a late entry changes a week's reading, never a stored recap silently (R-26). *Claude calls cost money*.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-113, first block: the weekly review's design, then the first approved slice.

Task Instructions:
1. Read ticket MOM-113 in Jira first, with its comments (including the 2026-10-28 hand-off from MOM-110 on late entries and recaps). Its acceptance criteria are the definition of done for the whole ticket; this block covers part of them. If they, these instructions and docs/DOMAIN_MODEL.md disagree, stop and flag it.
2. This block needs the engine (lib/engine/), migration 013 and MOM-112's first block (lib/services/scoreboard.ts) in origin/main: check `git log origin/main --oneline --grep="(MOM-112):" -n 3`. If any is missing, stop.
3. Read CLAUDE.md, docs/DOMAIN_MODEL.md (§3 in full, §1.3, §1.4, §1.7, §4.1 tone and celebrations, the principles), docs/design/2026-10-26-goal-model-design.md (the weekly review and its budget), lib/engine/ (scoreboard.ts, patterns.ts, crossings.ts, baseline.ts, carryover.ts, forecast.ts) and types/scoreboard.ts, lib/services/scoreboard.ts and lib/services/scoreboardRows.ts, types/home.ts, lib/home/defaults.ts, components/home/, supabase/migrations/013_goal_model_tables.sql (period_snapshots) and 014_setup_budget.sql (the usage log's feature check), lib/services/llm.ts, docs/LLM_GOVERNANCE.md, the BACKLOG.md items under MOM-113, and RAID R-26 in docs/RAID_LOG.md. Check the local stack with `npm run stack:status` (or, if MOM-124 has not merged, `docker ps --format "{{.Names}}"`); never run `supabase status` unfiltered.
4. Create the feature branch `feature/MOM-113-weekly-review` off an up-to-date `main`.
5. Design before coding, then STOP for my OK: (a) the whole review: each layer mapped to the engine outputs it shows, what the engine can raise in layer 3 (§3.2) and how the one adjustment is picked, the tone rules, where it appears and when (the person's week end, in their own time zone), and what is stored (a review record, what each recap said and kept, how a later entry is shown against a stored recap: R-26); (b) the slice this block builds and the blocks after it, each with a size (S, M or L); (c) whether this slice calls Claude (if so: what Claude writes, which engine output it is given, the feature name and budget, and that the usage log's feature check needs migration 017, the only number this block may use); (d) any table (migration 017, with RLS, grants and the allow-list) and its verify script; (e) the files you create. Wait for my answer.
6. Build only the approved slice. If migration 017 was approved: write it and supabase/verify/017_<name>.sql (with checks that can fail), add any table to supabase/verify/900_table_grants.sql's allow-list, run `npx supabase db reset --local` and `npm run verify:sql`, show me the migration and `npx supabase db push --dry-run`, and stop. Say plainly: the production push and then ALL the verify scripts run at day-end step F, after CI is green on this branch's pull request and I say OK, and before that pull request merges. Add the matching line to docs/plans/.pending-live-checks.md.
7. Tests: the slice's service against the in-memory fake (each layer it shows, a week with no entries, a week the person has not finished setting up, one person never reading another's rows); engine tests for anything added to lib/engine/; component tests for any screen; a browser spec on the local stack at 390px and 1280px if a page changed. `npm test` makes no network call.
8. If a live Claude call would help, STOP and tell me how many calls and roughly what they cost; run it only on my OK, on the local stack, logged through lib/services/llm.ts, and record the results in the Jira comment, not in the repo.
9. Run `npx tsc --noEmit`, `npm test`, `npm run build` and `npm run test:e2e` (stop `npm run dev` first), and `npm run verify:sql` if a migration was added; all must pass, with no server error in the e2e output other than the two known wizard-spec 401 lines.
10. Stop at a committed, green point and list what remains for MOM-113, block by block, with sizes. The ticket stays open.
11. Do not edit BACKLOG.md. Put backlog notes in the Jira comment and the close-out. Say "Privacy impact" in the close-out. Comment on MOM-113 with the approved design (in words), what changed, each acceptance criterion met, partly met or not started, and how verified; do not move it to Done.
12. Commit with "feat(MOM-113): add the weekly review's first block". Do not merge into main and do not push.

Definition of Done: feature branch off up-to-date main; tsc --noEmit passes; npm test passes (with no network call); npm run test:e2e passes; npm run verify:sql passes locally if a migration was added; committed with the type(MOM-X) format on the feature branch, not merged and not pushed; Jira commented; committed on the feature branch.
```

* **User Verification Gate:**
  - [ ] You approved the whole review's design and this block's slice before any code.
  - [ ] Every number in the review comes from the engine (read the service test).
  - [ ] A late entry never rewrites a stored recap silently (if this slice stores recaps).
  - [ ] Any live Claude call waited for your OK, and its results are on the ticket, not in the repo.
  - [ ] If migration 017 was added: you saw it and the dry run, and nothing was pushed.

---

# FINAL DAY-END BUILD VERIFICATION & PULL REQUESTS

Run after the last block of the day, or type `/day-end` and let it run these in this order: **A, B, D, E, then F (the one push, after your OK), then C (live checks, after the pull requests have merged and Vercel has deployed)**. Stop on the first failure. When the whole sequence has finished and you say so, `/day-end` ends with the line `Tomorrow: /day-start (Sonnet / Low)`.

**The build day's window.** The day starts at the previous day-end's last merge, not at midnight, so a day-end that runs past midnight sees the same work. It is the newest merge on `origin/main` of a step E branch, found by the branch name, which always ends in `-next-build-plan-doc`: `git log origin/main --merges -n 1 --grep="next-build-plan-doc" --format="%h %cI %s"`. `/day-end` prints it as `Window: after <hash> (<date>, <subject>)` at the start and reuses that hash in steps B, D and F (it never recomputes it, because today's own step E branch will have merged by then). If there is none, you give a start date. Below, `<window>` means that hash.

**When there is nothing to sync.** `/day-end` stops at the start only if all four hold: no unmerged branches; no open backlog item without a Jira key; no entry marked `unreviewed` in the two logs; and no ticket with commits on `origin/main` in the window that Jira still shows as neither Done nor Closed. It names each condition, and says which ones kept the run going. Failure entries carry the `unreviewed` mark in their heading line (`### F-0nn · … · unreviewed`), not on the "Predicted it?" line (failure log F-056); count them by the heading.

**Your log edits and branch switches.** If you hold uncommitted edits to `docs/FAILURE_LOG.md` or `docs/RAID_LOG.md` and a branch's copy of either file differs, a plain `git switch` aborts. Before each switch `/day-end` checks for this, says so in plain words, backs both files up, stashes them (`git stash push -- <the two files>`), switches and pops. If the pop conflicts, it stops, restores from the backup and asks you. It never stages a log file for this; only the entries you approve in step D are staged.

**The checkpoint (decide at this day-end).** Whether the thin slice stays at N = 5 build days or becomes 6. Decide it with day 4's actual progress: setup's blocks (MOM-111), home and the week plan (MOM-112 block 2), the weekly review (MOM-113, after today's first block) and settings (MOM-114) against what day 5 can hold. Step E writes the answer into the next plan's header.

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

`npm run plan` ends with "Every open item has a Jira key." or lists the items without one. Blocks no longer edit `BACKLOG.md`, so a block's branch should add no unkeyed item; if one appears, step A lists it as "handed to step D" and does not fail the branch. Step D's Definition of Done is where every open item must have a key.

`npm run test:e2e` and `npm run verify:sql` also run in CI on every pull request. Run them here too for a branch that changed pages, auth, the wizard, the drawer, manual entry, setup, the weekly review or a migration (stop `npm run dev` first; reset the local database to the branch's migrations first with `npx supabase db reset --local`). Any server error in the e2e output is a failure, with two known exceptions until MOM-124's expected-lines list exists: the wizard spec's two `[task-plan-ai] the API key was rejected { httpCode: 401 }` lines (the dev server's dummy key aimed at the fake model, since MOM-111) and the `[synced-entries] not counted … reason: 'no_source'` lines from the Hevy "no bound target" spec. The "destination stream errored" line was fixed by MOM-120, so if it comes back, it is a failure and MOM-120 is reopened.

Generated route types outlive a branch switch: a browser test run leaves the development server's in `.next/dev`, and a production build leaves its own in `.next/types` (failure log F-028, F-039). A branch checked after one that added pages can then fail `npx tsc --noEmit` on routes it does not have. Delete both folders (git-ignored, rebuilt by the next build or `npm run dev`) before the checks on each branch; if `tsc` or the build still fails only in a file under `.next/`, delete them and run the check again; any other failure is real. MOM-130 builds this into the commands.

## B. Database verification (production), only if migrations were applied in the window

A migration is in the window when `git log --branches --remotes --not <window> --name-only --format=%h -- supabase/migrations` lists a file (016 from MOM-111 and 017 from MOM-113, if either was added). B also runs when a script in `supabase/verify/` changed in the window, because production is where those scripts are proven. **Git Bash only.** This loop uses `/tmp`, `grep`, `$(...)` and `for ... done`, which do not work in PowerShell. `npm test` does **not** run these scripts. Every script must report `false 0` and a non-zero `true` count (0 and 0 means the script errored).

**When a migration is still waiting for its push.** This plan applies a migration at step F, after CI is green and before its pull request merges. If the window's migrations are not yet on production when B runs, B runs only its read-only part now (the migration list, where remote should stop at the last applied migration, and the user count), and the verify loop runs at step F right after `db push` (2026-10-28 practice; MOM-124 will put it in the command). Running the loop before the push would fail the new migration's verify script and write throwaway users to production twice.

```bash
npx supabase migration list                         # local and remote columns must match for every migration already applied
T=0; F=0
for f in supabase/verify/*.sql; do
  npx supabase db query --linked -f "$f" -o table > /tmp/v.txt 2>&1
  t=$(grep -cE '│ true ' /tmp/v.txt); fl=$(grep -cE '│ false ' /tmp/v.txt)
  echo "$(basename $f): true $t false $fl"; T=$((T+t)); F=$((F+fl))
done; echo "TOTAL true $T false $F"                 # expect false 0 and a true count no lower than the last production total, plus the checks added in the window (the 2026-10-28 day-end records the production total after 014 and 015). A local count is not a production count: one script runs 5 more checks on production
npx supabase db query --linked -o table "select count(*) as users from auth.users"   # expect 1: only the standing smoke-test account
```


## D. Automated End-of-Day Backlog, Obsolescence & Jira Sync (copy-paste)

```text
Perform end-of-day backlog synchronization, obsolescence audit, and ticket generation.

Task Instructions:
1. Scan BACKLOG.md, ROADMAP.md, code TODO tags, the window's commits (`git log --branches --remotes --not <window> --no-merges`, the window being the one `/day-end` printed at its start) and the Jira comments the day's blocks left on their tickets (blocks no longer edit BACKLOG.md: their backlog notes, gaps and follow-ups are in those comments and their close-outs) for newly discovered gaps, TODOs or deferred items. Run `npm run plan` and treat every open item without a Jira key as un-ticketed.
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
   f. If MOM-133 (lighter logs) is among today's branches, ask me whether tonight's review already follows its rules (entries only when they change something, no nightly "predicted it?", risks to Jira) or the rules above; it takes full effect once it merges.
8. Create a feature branch off an up-to-date `main` (`feature/MOM-16-eod-backlog-sync`; if it already exists and is fully merged into origin/main, delete it with `git branch -d` and create it again) and commit BACKLOG.md (ROADMAP.md if changed, and only the docs/RAID_LOG.md and docs/FAILURE_LOG.md entries I approved in step 7) with "chore(MOM-16): sync end-of-day backlog, prune obsolete tickets, and update Jira", staging files by name. An item that exists only in lines an unmerged branch already changes gets its key by a small commit on that branch instead. Do not merge it into main and do not push: it is pushed with the day's other branches at step F and merged through its pull request.

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
   - Executive Overview & Architectural Invariants, and the Standing Rules (Jira first, production approval, verify scripts, no pushes inside blocks, blocks never edit BACKLOG.md, standing smoke-test account).
   - A "Today's runbook" section near the top, after the metadata header and before the first block: a table with one row per block, in order, giving `/run-block MOM-n`, the session setting (model / effort) and, in plain words, what to check at the gate. The table's first row is `/day-start` (Sonnet / Low) and its last row is `/day-end` (Opus / High), each with its own plain-words gate text; `npm run plan:check -- --strict` warns when either is missing or out of place. The text above the table also says that `/day-start` comes first and `/day-end` last.
   - Logical Session Blocks grouping high-priority tickets, in dependency order, each in the format `npm run plan:check` enforces: a heading `## Block <n>.<m>: <title> (MOM-<n>)` with exactly one ticket key (unique in the plan); a `* **CLI Session Config:** Model: X | Effort: Y` line; exactly one fenced `text` prompt that names its ticket and carries a commit message `type(MOM-n): ...`; and a `* **User Verification Gate:**` checklist. Before each session's first block, a `**Your prerequisites before this session:**` note (it may say none). Give each block a size in its objective (S about 20 to 40 minutes, M about 40 to 70, L 70 or more, timed from the design OK) until MOM-124 adds a Size field.
   - Block prompts that follow the pull-request workflow (CLAUDE.md): create the feature branch off an up-to-date `main`; commit on it with the Jira key; do NOT merge into `main` and do NOT push (the one push is at day-end, step F, after my OK); do NOT edit BACKLOG.md (notes go in the Jira comment and the close-out); end with "Definition of Done: ...; committed on the feature branch." A block with a migration says: run `npm run verify:sql` locally, show the migration and `npx supabase db push --dry-run`, and run production `db push` and then ALL the verify scripts only after CI is green on its pull request and I say OK, and before that pull request merges (merging deploys to Vercel). A block that needs another ticket's code says it "must already be in origin/main" and stops if it is not.
   - Dynamic CLI Session Config (Sonnet / High for architecture, security and database work; Sonnet / Medium or Low for standard UI and tests).
   - Copy-pasteable prompts including tsc --noEmit, npm test, npm run build, feature branching with the commit left on the feature branch (never merged into `main` locally and never pushed; `main` takes it through a pull request, see the pull-request bullet above), and Jira updates.
   - User Verification Gates for each block.
   - Final Day-End Build Verification & Pull Requests section (steps A, B, D, E, then F the one push, then C the live checks after the merge), with the step B verify loop marked Git Bash only, step D never moving a ticket or an epic to Done (it only comments, creates tickets and proposes Closed, with a pause for my OK), step F ending with a post-merge list of Done transitions that waits for my OK, and step D's RAID and failure log review (MOM-92) carried over word for word, including the playbook question, and including this instruction in step E. Once MOM-133 (lighter logs) has merged, carry step D's log step from the rules MOM-133 put in CLAUDE.md and `/day-end` instead of word for word from this plan.
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
2. Wait for CI: both jobs, `checks` and `database`, must be green on every pull request.
3. For a branch with a migration: production `npx supabase db push --dry-run`, then `db push`, then ALL the verify scripts (step B's loop), only after CI is green and your OK, and **before** that pull request merges. Today: 016 on MOM-111's branch and 017 on MOM-113's, only if either was added.
4. Merge each pull request with a merge commit (the GitHub button, or `gh pr merge` after your OK), in dependency order. If two pull requests conflict in a shared file, merge `origin/main` into the later branch locally, keep both sides, and push that with your OK.
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
| **Thin slice: build day 4 of N = 5 or 6 (open checkpoint)** | The design record sets N = 5 build days with a checkpoint at the end of build day 3 (`docs/design/2026-10-26-goal-model-design.md` §6.1). At that checkpoint setup (2 of 3 blocks) and home (1 of 2) were on track, but the weekly review (MOM-113) and settings (MOM-114) had not started and the week plan (MOM-112 block 2) was open. Whether N stays 5 or becomes 6, or settings goes to "defaults only" for the trial, is **decided at this day-end with day 4's actual progress**, not before. |
| **Day 5 list (as proposed 2026-10-28)** | MOM-112 block 2 (the week plan and picking items onto days), MOM-114 settings, MOM-131 (390px header), MOM-132 (add a goal or target after first setup), MOM-96 (the test audit, including the five wait-then-`getByRole` spots in `tests/manual-entry.test.tsx`). Plus whatever MOM-113 and MOM-111 list as remaining. |
| **Tonight's merges land first** | Block 3 (MOM-111) needs 014 and 015 on `origin/main` and on production, and block 2's screen and save; block 4 (MOM-113) reads MOM-112's scoreboard service. If any 2026-10-28 pull request is still open at `/day-start`, the blocks wait. |
| **The one-time production setup on the standing account** | Migration 015's save is first-setup-only, so the standing smoke-test account can run setup on production once. Today's MOM-111 block adds a metric question for a quantity target bound to Hevy and changes what setup sends. If you want that account's setup to include a Hevy quantity target, wait until block 3 is merged and deployed; otherwise it can run now. Once it has run, it cannot be redone on that account without deleting and recreating it. |
| **MOM-133 changes the nightly review** | Lighter logs take full effect once MOM-133 merges. Tonight's step D asks whether tonight's review already follows the new rules (item 7f); step E then carries the new log step into the next plan. Nothing in this plan's file is edited by the MOM-133 block. |
| **Migrations 016 and 017** | 016 is MOM-111's (a metric on the binding, if needed) and 017 is MOM-113's (a review record or a `weekly_review` usage feature, if needed); each needs your OK at the design stop, is applied at step F after CI is green and before its pull request merges, with every verify script after it. An unused number stays unused. |
| **Setup's budget is still a placeholder** | 40 turns and 1,000,000 tokens, from no finished live run (MOM-128's pilot, about $2, showed the machinery works). The simulated-person eval and the 8 full cases on three models come in a later MOM-111 block, with your OK and their cost first. |
| **Live Claude calls** | `npm test` never calls Claude. No block today plans a live call; MOM-113's design may propose one, which waits for your OK with its count and cost, and its results go on the ticket. |
| **Stale generated types** | Generated route types outlive a branch switch (F-028, F-039). Until MOM-130 builds it into `/day-start` and `/run-block`, delete `.next/types` and `.next/dev` before the type check and build on a branch you just switched to. |
| **Auth email limits** | The default sender's hourly cap and the same-browser reset link are MOM-122 (RAID I-06, R-18); the production walk with a disposable second account is MOM-123. Both are trial prerequisites, not scheduled today. |
| **Archive name** | The plan run on 2026-10-28 carried the date 2026-10-28 and is archived as `docs/plans/archive/2026-10-28.md`. This plan carries 2026-10-29. |
| **Standing smoke-test account** | `smoke-test@momentum-app.test` exists on production. Every live gate signs in as it; its password stays in your password manager. Production must hold exactly one user at day-end step B; no block creates a second one. Its goal-model data is created through setup and logging only. |
| **The old model stays until MOM-115** | The wizard, rebalance and checkbox criteria keep running, with the completion guard of migrations 002 and 008. New code follows `docs/DOMAIN_MODEL.md` and is built beside the old tables; home shows the scoreboard beside the old feed. |
| **Dark only until MOM-30** | The app is dark regardless of the device setting. Light mode with a follow-device default is MOM-30, not scheduled. |
| **Not scheduled, queued with keys** | Thin slice: MOM-112 block 2, MOM-114 (settings), MOM-115 (retire the old model). Trial prerequisites: MOM-122 (auth email), MOM-123 (production auth walk). New: MOM-131 (390px header), MOM-132 (add a goal after first setup). Tooling: MOM-124 part 2 (the step 0 count fix, step B timing, expected e2e log lines, block sizes, the red-CI loop, the design-stop review), MOM-130 (generated type folders), MOM-127 (verify-script function calls), MOM-96 (test races). Deferred: MOM-126 (minors safeguards; the trial is adults only). Follow-ons during the trial: MOM-117 (own sheet and templates), MOM-118 (career playbook). Other: MOM-109 (owner task: ask the testers which apps they use), MOM-119 (grants), MOM-98 (webhooks), MOM-99 (adapter follow-ups), MOM-100 (CI hardening), MOM-101 (usage follow-ups), MOM-74 (retire `HEVY_API_KEY`), MOM-91 (`connection()`), MOM-95, MOM-97, MOM-70, MOM-26. |
| **Product risks live in the RAID log** | This table covers decisions for this build cycle. Product risks, assumptions, issues and dependencies are in `docs/RAID_LOG.md` (until MOM-133 moves new risks to Jira), and AI misses in `docs/FAILURE_LOG.md`; both are reviewed in step D (MOM-92, or MOM-133's lighter rules once merged). |
| **Pull requests, not direct pushes** | `main` is protected (MOM-67): every change reaches it through a pull request with `checks` and `database` green, merged with a merge commit. `/run-block` commits on a feature branch and never merges; `/day-end` pushes the day's branches once, after your OK. A production migration is applied before its pull request merges (merging deploys to Vercel). |
