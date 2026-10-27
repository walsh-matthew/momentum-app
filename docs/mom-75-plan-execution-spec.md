# MOM-75: Plan Execution Framework Spec

> **Status:** **Built in MOM-75** (2026-10-24). Section 9 lists where the build differs from this spec, and why; the pull-request workflow is the main difference. Acceptance criterion 4 (`/day-end` end to end) is unproven until a real day-end, so the ticket stays open. **Jira:** MOM-75 (under MOM-16). **Written:** 2026-10-22, against `main` @ `e8e43ed`.
> Build this after a full day of blocks has been run by hand, so the commands reflect real friction. (Plan sessions were renumbered on 2026-10-23, so this no longer names session numbers.)

## 1. Goal

Make each build day run the same way, whatever the plan contains:

```text
/day-start  ->  /run-block <MOM-n> for each block in "Today's runbook"  ->  /day-end
```

The owner should still see every step: each command says in one line what it is about to do and why before it does it, and keeps every approval stop the plan already has. Automation removes copy-paste, not visibility.

The commands live in `.claude/commands/` and **never name specific tickets**. They read whatever `docs/plans/NEXT_BUILD_PLAN.md` is current, so they keep working as long as each new plan follows the format contract in section 3.

## 2. Commands

### 2.1 `/run-block <MOM-n>`

Runs one block of the current plan. Steps, in order:

1. **Find the block.** Locate the `## Block <n>: <title> (MOM-<n>)` heading for the given key. If none or more than one matches, stop and say so.
2. **Preflight.** `git checkout main && git pull --ff-only && git status --short`. Expect clean (`AGENTS.md` may be untracked). Stop on anything else.
3. **Fresh session.** If the session already holds context from another block, tell the owner to run `/clear` and re-run the command.
4. **Model and effort.** Show the block's `CLI Session Config` line. If the session's model does not match, stop and print the exact command to fix it (for example `/model sonnet`). Ask the owner to confirm the effort setting before continuing. A command cannot reliably switch its own session's model, so the switch stays a deliberate owner step. *Open question:* confirm the current Claude Code mechanism for reading or setting effort before writing this step; do not guess.
5. **Block prerequisites.** Check what this block needs before it starts, by name only and never printing values. Examples: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local` for MOM-62; a redacted Hevy sample in the repo for MOM-38; Docker and `npx supabase start` for MOM-61 and MOM-67. Read these from the session's "prerequisites" note in the plan.
6. **Resume.** If the block's feature branch already exists, say so, show `git log main..<branch> --oneline`, and continue from it instead of starting over.
7. **Run the prompt.** Execute the block's fenced prompt as written. Keep every stop in it (design OKs, `supabase db push`, Jira updates). Before each step, say in one line what it does and why.
8. **Close out.** Print the block's User Verification Gate. Mark which items can be checked now and which must wait until after the push, and append the deferred ones to `docs/plans/.pending-live-checks.md` (git-ignored, cleared by `/day-end`). End with a "what changed and why" summary whose last line is `Privacy impact: none | <what changed in /privacy>` (added 2026-10-27, MOM-124).

### 2.2 `/day-start`

Checks the day's prerequisites and reports what is missing. It changes nothing.

- `main` is clean and up to date with `origin/main`.
- Docker Desktop is running and `npx supabase start` can come up (only if today's plan has a block that needs a local stack).
- Required env vars exist in `.env.local`, by name only.
- The plan passes the format check (section 4).
- Prints "Today's runbook" from the plan.

### 2.3 `/day-end`

Runs the plan's day-end sections in this order, stopping on the first failure:

1. **A. Build and repository checks:** `tsc --noEmit`, `npm test`, `npm run build`, `npm run plan`.
2. **B. Production DB verification,** only if a migration was applied today: `supabase migration list`, then every script in `supabase/verify/`; every row must be `passed = true`.
3. **D. Backlog and Jira sync,** including closing any epic (MOM-4 to MOM-7 included) whose children are all Done or Closed.
   Step D ends with the RAID and failure log review (MOM-92): list the day's `unreviewed` entries in `docs/RAID_LOG.md` and `docs/FAILURE_LOG.md`, wait for the owner's plain-language reply (including "predicted it? yes / no / partly" for each failure), and commit only approved entries. The owner never edits the files or runs a command for this.
4. **E. Next plan:** move the finished plan to `docs/plans/archive/YYYY-MM-DD.md`, generate tomorrow's plan, and run the format check on it.
5. **One push:** show `git log origin/main..main --oneline` and wait for explicit approval before `git push origin main`.
6. **C. Live checks** after the push: Vercel deployment Ready, `/` returns 307 to `/login`, `/login` returns 200.
7. **Deferred gates:** print `docs/plans/.pending-live-checks.md` so the owner walks every post-push check, then clear it.

This replaces the current plan's two pushes (C, then F) with one.

## 3. Plan format contract

The plan generator (day-end step E) must produce, and `/run-block` relies on:

- A metadata header: `> **Date:** YYYY-MM-DD | **Active Epic:** MOM-XX | **Base Commit:** <hash>`.
- A **"Today's runbook"** section near the top: the block order, the one command to type per block (`/run-block MOM-n`), and what to check at each gate, in plain language.
- For every block:
  - the heading `## Block <n>: <title> (MOM-<n>)`, with exactly one ticket key;
  - a `CLI Session Config` line naming model and effort;
  - exactly one fenced `text` prompt;
  - a `User Verification Gate` checklist.
- Session-level prerequisites in a clearly labelled note before the session's first block.
- Commit templates carry the Jira key (`docs(MOM-XX):`, `chore(MOM-XX):`), as CLAUDE.md requires.

## 4. Format check

A Vitest test (for example `tests/build-plan-format.test.ts`) that runs in `npm test`:

- passes on the current `docs/plans/NEXT_BUILD_PLAN.md`;
- fails, naming the block, when a block is missing its key, its `CLI Session Config` line, its fenced prompt, or its gate;
- fails when the runbook section or metadata header is missing.

Fixtures for the failing cases live in `tests/fixtures/`.

## 5. Permissions

Add an allowlist in `.claude/settings.json` for read-only commands (`git status`, `git log`, `git diff`, `npm test`, `npx tsc --noEmit`, `npm run build`, `npm run plan`, `supabase migration list`) so routine steps don't prompt. These must always ask: `supabase db push`, `git push`, `vercel env`, and any command that writes to production.

## 6. What stays manual

- Switching the model or effort when a block needs a different setting.
- Every approval stop in a block prompt (design OKs, migrations, production pushes).
- The final `git push` and the live checks that need a browser or a real account.
- Closing a ticket whose gate needs a live check (for example MOM-35).

## 7. Acceptance criteria (from MOM-75)

- [ ] `.claude/commands/` contains `/run-block`, `/day-start` and `/day-end`, and `/run-block` finds any block in the current plan by ticket key without naming tickets in the command itself.
- [ ] `/run-block` halts on a model mismatch with the block's `CLI Session Config` and asks the user to confirm effort before running the prompt.
- [ ] The plan format test runs in `npm test`, passes on the current plan, and fails on a plan missing a block key, config line, prompt or gate.
- [ ] `/day-end` archives the finished plan, generates the next one, and stops only at the plan's approval gates and before the single push.
- [ ] `/day-end` drafts the day's failure-log and RAID entries, lists them for a plain-language reply, and commits the approved entries; nothing is committed unreviewed (MOM-92).
- [ ] No command runs a production change (`supabase db push`, `git push`, `vercel env`) without the user's explicit approval.

## 8. Notes for whoever builds it

- Document the three commands and the daily loop in `CLAUDE.md`.
- The current plan's blocks already follow most of the contract; the runbook section and the strict one-prompt-per-block rule are the new parts.
- Keep the commands short: they orchestrate the plan's own prompts rather than repeating them.

## 9. As built (MOM-75): where it differs from this spec

Written 2026-10-24. Everything above is the original design; this section is what was built and why it differs.

**The pull-request workflow (the main difference).** This spec was written before `main` was protected. It says `/day-end` ends with ONE push to `origin/main` and that `/run-block` starts with `git checkout main && git pull --ff-only`. Since MOM-67, `main` takes changes only through a pull request with the CI jobs `checks` and `database` green (CLAUDE.md), so:

- The `/run-block` preflight is `git status --short` (only the owner's uncommitted logs, `AGENTS.md`, `supabase/.branches/` and `supabase/snippets/` are expected), then `git fetch origin`, then a check that `main` matches `origin/main`; if `main` is only behind, `git switch main` and `git pull --ff-only`, each on its own.
- `/run-block` commits on the feature branch and never merges into `main` and never pushes. Where an older block prompt says "merge into main with --no-ff", it skips that step. It does not move a Jira ticket to Done or Closed. `/day-end` step D runs before anything has merged, so it only comments on tickets, creates tickets and proposes Closed for obsolete ones, with the owner's OK. Done transitions are a separate step after the merge and the tidy-up: it lists each merged ticket with its acceptance criteria (met or unmet, with evidence), and waits for the owner's OK before moving anything, including epics whose children are all Done or Closed.
- "One push" became one approval stop in `/day-end`: it shows `git log origin/main..<branch> --oneline` for every one of the day's branches (including the step D and E branches), waits for the owner's explicit OK, then runs `git push -u origin <branch>` for each (never `main`) and prints the pull request link. Pull requests merge with a merge commit once both jobs are green. Step C (live checks) runs after the merge, when Vercel has deployed.
- A production migration is applied after CI is green on its pull request and the owner's OK, and before that pull request merges (merging deploys to Vercel and the new code needs the new schema). So a block with a migration has its branch pushed mid-day, with the owner's OK, rather than at the end.
- A block that needs another ticket's code stops if that code is not in `origin/main` yet, and offers: push and merge that pull request first, or stack on its branch (only with the owner's OK). The spec did not foresee this; it is a follow-up in BACKLOG.md.

**Effort (the open question in 2.1 step 4).** Found in the Claude Code docs (2026-10-24): `/effort`, the `effortLevel` setting, `--effort` and `CLAUDE_CODE_EFFORT_LEVEL` set it, and the session header shows it to the owner, but the docs do not say Claude can read it. A command's `model:` and `effort:` frontmatter are fixed per command and apply only while it runs, so one command serving blocks with different settings cannot use them. So `/run-block` compares the block's model with the model the session reports for itself, stops on a mismatch with the exact `/model` to type, and always asks the owner to confirm effort. It recommends the `/effort` slider with `s` (this session only), because typing `/effort <level>` saves the level as the owner's default for that model.

**The format check** is a script, not only a test: `scripts/check-plan-format.ts` (`npm run plan:check`), with `tests/build-plan-format.test.ts` and 28 fixtures in `tests/fixtures/plans/` (one per rule). `/run-block` uses `npm run plan:check -- --block MOM-<n>` for step 1, so finding the block and stopping on zero or several matches is deterministic, and `/day-end` step E runs `--strict`. Beyond section 3, it also requires that a block's prompt names its own ticket and carries a commit message with that key, that a key heads one block only, that the runbook comes before the first block with one row per block in the plan's order and plain-language gate text, and that each session has a prerequisites note (added to Sessions 3 and 5 of the current plan). A prompt that still says to merge into `main` with `--no-ff` is a warning, not an error.

**Permissions.** `.claude/settings.json` allows `git status`, `npm test`, `npx tsc --noEmit`, `npm run build`, `npm run plan`, `npm run plan:check` (new) and `npx supabase migration list`. It does not list `git log` and `git diff`: Claude Code already runs their read-only forms without asking, and an `allow` rule such as `git log *` would also approve `git log --output=<file>`, which writes a file. It adds explicit `ask` rules for `git push`, `supabase db push`, `vercel env` and `gh pr merge`, which are also not in `allow`. Rules match the command as written, so `git -C . push` would not match an `ask` rule; anything not allowed prompts anyway.

**Commands.** They are in `.claude/commands/` (the older format; it still works) with `disable-model-invocation: true`, so Claude never starts a block or a day-end on its own. New files there were not picked up by an already-running session, so Claude Code must be restarted once.

**Added from experience (2026-10-23).** Step B expects exactly 1 user; step D pauses for the owner's OK before any Jira transition to Closed or Done, and stages only the log entries the owner approved; step E archives the finished plan before writing the new one; step C reads the newest production deployment's status and explains it in one line; `/run-block` says so when a block's own commits are already in `origin/main`.

**Acceptance criteria, as built.**

- [x] 1. `.claude/commands/` holds `/run-block`, `/day-start` and `/day-end`; `/run-block` finds any block by key without naming tickets.
- [x] 2. `/run-block` halts on a model mismatch and asks the owner to confirm effort (dry-run against a finished block; not run against a mismatching session).
- [x] 3. The format test runs in `npm test`, passes on the current plan, and fails on a plan missing a key, config line, prompt or gate (also shown on the real plan).
- [ ] 4. `/day-end` end to end: written, not yet run. Proven only on a real day-end.
- [ ] 5. The log review (step D) is written into `/day-end`; proven with criterion 4.
- [x] 6. No command runs a production change without explicit approval: none is in `allow`, `git push`, `supabase db push`, `vercel env` and `gh pr merge` are set to ask, and each command says to wait for the owner's OK.

## 10. As built (MOM-104): the day-loop friction points

Written 2026-10-26, after the first real `/day-end` runs. Section 9 stays as written; where this section differs, this section wins. Eight points, all in `.claude/commands/`, `scripts/check-plan-format.ts` and this spec; `.claude/settings.json` is unchanged and no command gained a push, merge, migration or log-staging power.

1. **Step 0 stop rule (`/day-end`).** It stops only when all four hold, naming each: no unmerged branches; `npm run plan` lists no open item without a Jira key; no entry marked `unreviewed` in the two logs; and no ticket with `(MOM-n):` commits on `origin/main` after the window start that Jira still shows as neither Done nor Closed. If it continues, it says which condition kept it going.
2. **The window is the build day, not midnight.** Step 0 finds the previous day-end's last merge: the newest merge on `origin/main` whose subject contains `next-build-plan-doc`, prints it as `Window: after <hash> (<date>, <subject>)`, and steps B (the migration check), 7 (the Done transitions) and 8 reuse that hash and never recompute it, because they run after today's own step E branch has merged. **The step E branch name must always end in `-next-build-plan-doc`** (for example `feature/MOM-105-next-build-plan-doc`); the anchor is found by that name, so a differently named step E branch breaks the window (the command then asks for a start date). The plan's metadata date was rejected as the anchor because a plan is generated a day ahead (this plan is dated 2026-10-27 and was run on 10-26), and its Base Commit because it marks the start of the previous build day.
3. **Live checks use `curl -s -I <url> | grep -iE "^(HTTP|location)"`.** The ticket first proposed a format string without a leading slash, or turning path conversion off. The 2026-10-26 comment on MOM-104 showed `MSYS_NO_PATHCONV=1` breaks `-o /dev/null` (curl exits 23), so the commands avoid both the output file and the format string.
4. **Uncommitted log edits and branch switches (failure-log F-016).** Before the first switch, and before each one, `/day-end` checks whether the owner holds log edits and whether the target branch's copy differs. If so it says so in plain words, backs both files up to the scratchpad, `git stash push`es only those two files, switches and pops; a conflicting pop stops the run, restores from the backup and asks. It never stages a log file for this, and never uses `stash -u`, `reset` or `checkout --`. `git stash` is not in `allow`, so it prompts.
5. **Unkeyed items at step A are handed to step D, not failed** (the ticket's second option). `npm run plan` still exits 0; step A reads its whole output (failure-log F-022), lists unkeyed items as "handed to step D" and fails a branch only for other problems. Step D's Definition of Done is where every open item must have a key. No script change.
6. **`/run-block`'s close-out names the next command.** `npm run plan:check -- --block MOM-<n>` ends with `next in the runbook: ...`: the next `/run-block` row's block with the model and effort from its own `CLI Session Config`, or `/day-end` with the setting on the runbook's `/day-end` row (Opus / High when it has none). The close-out prints `Next: /clear, then /run-block MOM-<n> (<model> / <effort>)` or `Next: /clear, then /day-end (Opus / High)`.
7. **The runbook starts with `/day-start` and ends with `/day-end`.** A table or list row whose command cell is exactly the command counts; prose and a gate text that mention them do not. A plan without the first row, or with it after a `/run-block` row, gets the warning `runbook-missing-day-start`; likewise `runbook-missing-day-end` for the last row. They are warnings, not errors, because no command trips on a missing row; a warning still fails `--strict`, which step E runs on tomorrow's plan. Fixtures: `warn-runbook-no-day-start.md` and `warn-runbook-no-day-end.md`; `valid.md` and `warn-legacy-merge.md` gained the two rows. Step E's prompt now asks for them.
8. **`/day-end` ends with `Tomorrow: /day-start (Sonnet / Low)`** as its last line, when the whole sequence has finished and the owner has said so; not on an early stop.

**Also changed.** A clean working tree is now the expected state for `/day-start` and `/run-block`, because MOM-68 git-ignored `AGENTS.md`, `supabase/.branches/` and `supabase/snippets/`; only the owner's uncommitted `docs/FAILURE_LOG.md` and `docs/RAID_LOG.md` may also show, and any untracked file is a problem (this supersedes the file list in section 2.1 step 2 and section 9). At the owner's direction, the plan's preflight and day-end sections A to F carry the same wording, so step E carries them into the next plan; the block prompts were not edited.
