# MOM-75: Plan Execution Framework Spec

> **Status:** Spec only, not built. **Jira:** MOM-75 (under MOM-16). **Written:** 2026-10-22, against `main` @ `e8e43ed`.
> Build this after Sessions 1 and 2 of the current plan have been run by hand, so the commands reflect real friction.

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
8. **Close out.** Print the block's User Verification Gate. Mark which items can be checked now and which must wait until after the push, and append the deferred ones to `docs/plans/.pending-live-checks.md` (git-ignored, cleared by `/day-end`). End with a five-line "what changed and why" summary.

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
- [ ] No command runs a production change (`supabase db push`, `git push`, `vercel env`) without the user's explicit approval.

## 8. Notes for whoever builds it

- Document the three commands and the daily loop in `CLAUDE.md`.
- The current plan's blocks already follow most of the contract; the runbook section and the strict one-prompt-per-block rule are the new parts.
- Keep the commands short: they orchestrate the plan's own prompts rather than repeating them.
