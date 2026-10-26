---
description: Run one block of the current plan by ticket key. Checks the preflight, model and effort, then follows the block's own prompt.
argument-hint: MOM-<n>
disable-model-invocation: true
---

Run the block for `$ARGUMENTS` from `docs/plans/NEXT_BUILD_PLAN.md` (MOM-75, docs/mom-75-plan-execution-spec.md section 2.1). You orchestrate the plan; the block's own prompt is the work, and this file only adds the checks around it. If `$ARGUMENTS` is empty, say `Usage: /run-block MOM-<n>` and stop.

Rules for every step:
- Before each step, say in one line what you are about to do and why.
- Run git commands one at a time (never chained with `&&`). On the first error, show it and stop.
- CLAUDE.md wins over the block's prompt. `main` is protected: never merge into it, never push it, and never push any branch without my explicit OK.
- Stage files by name. Never stage `docs/FAILURE_LOG.md`, `docs/RAID_LOG.md`, `AGENTS.md`, `supabase/.branches/` or `supabase/snippets/` (never `git add -A` or `git add .`), unless the day-end log review approved those entries.
- Keep every stop the block's prompt has (design OKs, migrations, production steps) and wait at it.

1. **Find the block.** Run `npm run plan:check -- --block $ARGUMENTS`. It prints the block's session, CLI Session Config, prerequisites note, prompt line range, branch name and gate. If it finds zero or several blocks, show its message and stop.
2. **Preflight, each on its own.** `git status --short`: a clean tree is the expected state (`AGENTS.md`, `supabase/.branches/` and `supabase/snippets/` are git-ignored since MOM-68); only my uncommitted `docs/FAILURE_LOG.md` and `docs/RAID_LOG.md` may also show; anything else, including an untracked file, list it and stop. Then `git fetch origin`. Then `git rev-parse main origin/main`: equal is fine. If `main` is only behind (`git merge-base --is-ancestor main origin/main`), run `git switch main` and then `git pull --ff-only`, separately. If `main` has commits `origin/main` lacks, stop. (If I am already on this block's feature branch, do not switch.)
3. **Fresh session.** If this conversation already holds work from a different block, tell me to run `/clear` and then `/run-block $ARGUMENTS` again, and stop.
4. **Model and effort.** Show the block's CLI Session Config line. Compare its model with the model this session is running. On a mismatch, stop and print the exact fix, for example `/model sonnet`, and say I must do it and re-run. Then ask me to confirm the effort: you cannot read the session's effort, so tell me to look at the session header ("with <level> effort") and, if it differs from the block's, set it with `/effort` using the slider and `s` (this session only; typing `/effort <level>` saves it as my default). Wait for my OK.
5. **Prerequisites, by name only, never printing a value.** Read the session's prerequisites note and the block's own "Read"/"Confirm" steps. Check env var names with `grep -q "^NAME=" .env.local` (no output), required files with `ls`, Docker only if the block needs the local stack. For a ticket the block says "must already be merged" or "in origin/main", run `git log origin/main --oneline --grep="(MOM-<n>):" -n 3` (commits carry their key as a prefix). If its work is not in `origin/main` but sits on a local branch, stop and offer two ways forward: push and merge that branch's pull request first, or stack this block on that branch (only with my OK). If it exists nowhere, stop and say it is not built yet.
6. **Resume, or already built.** If the block's feature branch (named in step 1) exists locally or on `origin`, say so, show `git log main..<branch> --oneline`, switch to it, and continue from what is already done instead of starting over. If no branch exists but `git log origin/main --oneline --grep="(MOM-<n>):" -n 3` shows the block's own commits, say the block looks already built, show them, and ask whether I really want to run it again.
7. **Run the prompt.** Read the prompt lines from the plan and carry them out step by step as written, with these overrides because `main` is protected:
   - create the feature branch off an up-to-date `main` (skip when resuming);
   - wherever the prompt says to merge into `main` (`--no-ff`), skip it: leave the work committed on the feature branch;
   - never push; the day's one push is in `/day-end`, after my OK;
   - do not move a Jira ticket to Done or Closed; comment on it instead. `/day-end` moves a ticket to Done only after its pull request has merged, with my OK;
   - a migration is applied to production only after the branch is pushed with my OK, its pull request is green, and I say so, and before that pull request merges (merging deploys to Vercel). At that point stop, ask me for the push, and wait.
8. **Close out.** Print the block's User Verification Gate. Mark each item "check now" or "after the push" (anything that needs the deployed site). Append the after-the-push items to `docs/plans/.pending-live-checks.md` (git-ignored; create it if missing), one line each: `- [ ] MOM-<n>: <item>`. End with a five-line summary: what changed, why, what was verified (say which checks ran), what is still pending, and the branch with its last commit. Then the last line, from the `next in the runbook:` line of `npm run plan:check -- --block $ARGUMENTS`: `Next: /clear, then /run-block MOM-<n> (<model> / <effort>)` for the next block in the runbook (add "skip it if its ticket is already Done"), or `Next: /clear, then /day-end (Opus / High)` after the last block (use the setting that line shows).
