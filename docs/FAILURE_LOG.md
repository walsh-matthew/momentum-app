# Momentum AI Failure Log

Each dated entry records a place where an AI tool got it wrong: what was asked, what it did, why, and how it was caught. Over time this log shows where models fail and why. It is also the source of interview examples, and the 90-day plan's Phase 2 gate needs at least 20 entries.

**How this log is kept**

- **Capture.** When the owner corrects the AI, a check fails, or a claim turns out to be false, the build agent drafts an entry marked `unreviewed`. In any chat, the owner can also say "log that". Project threads draft their entries for the next day-end.
- **Review.** At day-end the build agent lists the unreviewed entries with its own draft of the "why". The owner answers in plain words, for example "ok all", "drop 2", or "3: partly". Each entry asks the owner one question: **predicted it? yes / no / partly.** That answer trains the habit of predicting where a model will fail. Approved entries lose the `unreviewed` mark and are committed. Nothing is committed unreviewed.
- **Source** tags who failed. `build tool` means Claude Code or a project thread building Momentum. `in-product` means Momentum's own Claude features (the plan generator and the rebalance proposals). In-product entries feed the Phase 2 evals.
- **Interview-ready** (★) marks entries that make a clean story: a clear miss, a clear cause, and a lesson.
- The repository is public, so entries carry no personal data, secrets or exploit detail.

The log is seeded from this project's sessions (2026-10-21 onward). Week 1 notes were not kept. The owner reviews the seed entries in the pull request that adds this file (MOM-92).

## Entries

### F-001 · 2026-10-22 · build tool · ★
- **Asked:** Add a table to store third-party tokens that only the server can read (MOM-37).
- **What went wrong:** The migration assumed new tables give the server role access by default. In this project they don't, so the server couldn't use the table until a follow-up migration granted access.
- **Why:** The model applied a common default instead of checking how this project is actually configured.
- **Caught by:** Found during the same ticket and fixed by a follow-up migration. The lesson is now a standing rule in the build plan: every new table needs explicit grants.
- **Predicted it?** _owner to answer_

### F-002 · 2026-10-23 · build tool (project thread) · ★
- **Asked:** Summarize which tickets were built and which were still open.
- **What went wrong:** It reported four tickets (MOM-18, MOM-19, MOM-76, MOM-77) as built when none of them were on the main branch.
- **Why:** It inferred status from the plan and from the conversation instead of checking the code and Jira.
- **Caught by:** A follow-up check against Jira and the main branch the same morning, which led to a correction.
- **Predicted it?** _owner to answer_

### F-003 · 2026-10-22 · build tool
- **Asked:** Implement sign-in (MOM-17) and close the ticket when done.
- **What went wrong:** The ticket closed on type checks, unit tests and a rendered form. Sign-up, email confirmation and sign-out had never run against the live service.
- **Why:** Mocked tests stood in for a live check, so "done" meant "passes locally".
- **Caught by:** The day-two review, and a live smoke test later run against production.
- **Predicted it?** _owner to answer_

### F-004 · 2026-10-22 · build tool
- **Asked:** Build the connected-app flows (MOM-37).
- **What went wrong:** Only the token store was built. The ticket's title still promised the connect flows, and it was marked Done.
- **Why:** Scope narrowed during the build, but the ticket wasn't updated to match.
- **Caught by:** The day-two review. The connect flows were moved to MOM-62.
- **Predicted it?** _owner to answer_

### F-005 · 2026-10-23 · build tool · ★
- **Asked:** Create local test users for the browser tests.
- **What went wrong:** It used the local auth admin API, which returned a server error and left a half-created user. It also proposed a CLI command that doesn't exist in the installed CLI version.
- **Why:** It relied on API behavior and a command from other versions without checking the installed one.
- **Caught by:** The error itself, plus confirming that the command isn't in the installed CLI version. The browser tests now sign up through the normal form instead.
- **Predicted it?** _owner to answer_

### F-006 · 2026-10-23 · build tool
- **Asked:** Write the next build plan from the open tickets.
- **What went wrong:** A ticket the AI drafted on day one (MOM-18) named a function that a later refactor had removed. Another pair of drafted tickets (MOM-65 and MOM-19) had conflicting acceptance criteria.
- **Why:** The tickets were written before the code changed, and nothing re-checked them against the code until a plan was generated from them.
- **Caught by:** The plan generator's rule to verify that every named file and function exists. The plan now flags both.
- **Predicted it?** _owner to answer_

### F-007 · 2026-10-21 · build tool
- **Asked:** Compute the current plan week for velocity (MOM-14).
- **What went wrong:** It used the server's UTC date, so the week can be off by one around midnight for a user in Pacific time.
- **Why:** It didn't consider time zones. The spec didn't mention them and the model didn't ask.
- **Caught by:** Code review. Tracked as MOM-45.
- **Predicted it?** _owner to answer_

### F-008 · 2026-10-23 · build tool (project thread) · ★
- **Asked:** Discard a line-ending-only change on the owner's Windows checkout so the next pull would apply cleanly.
- **What went wrong:** It reported the fix as done, but the next pull still aborted because the file counted as modified.
- **Why:** It checked the file from a Linux view, where the content matched, and rewrote it with Unix line endings. It never checked how Windows git saw the file, and that git converts line endings, so the file still looked changed there. A check that runs somewhere other than where the result matters doesn't prove anything.
- **Caught by:** The owner's preflight pull failed. It was fixed with an ordinary git checkout, after confirming the diff was line endings only.
- **Predicted it?** No.

### F-009 · 2026-10-23 · build tool
- **Asked:** Add a database check that a wizard goal titled "Career pivot" gets exactly the key `career_pivot` on a fresh account (MOM-19).
- **What went wrong:** The new check passed, but the detail text it printed was an error message from a different, earlier test case, so a passing check looked like it had failed with a duplicate-key error.
- **Why:** The detail text came from a variable that an earlier loop in the same script had already filled in. The model reused the variable without clearing it first. The pass/fail result was right; only the explanation shown was wrong.
- **Caught by:** Reading the printed output of the new checks line by line rather than only the pass count. Fixed before commit.
- **Predicted it?** No.

### F-010 · 2026-10-23 · build tool
- **Asked:** Add component tests for the goal wizard and the rebalance drawer, with the server actions mocked (MOM-61).
- **What went wrong:** The new tests passed when run alone but failed intermittently in the full `npm test` run, and two older focus-card tests started failing with them. The failures were different on every run.
- **Why:** The tests looked up a button right after an error or result appeared, assuming the button was ready. In the components the error shows a moment before the "busy" flag clears, so the button was still disabled or relabelled. The model wrote the tests, ran only those files, and did not run the whole suite before reporting them green.
- **Caught by:** Running the full suite as the Definition of Done requires, then repeating it six times after the fix. The two old tests had the same hidden race and were fixed too (MOM-96 tracks the rest).
- **Predicted it?** No.

### F-011 · 2026-10-23 · build tool (project thread) · ★
- **Asked:** Explain why the Connected Apps page still showed the old switch-only cards during the MOM-62 live test.
- **What went wrong:** A chat answer blamed a known follow-up ticket about a different screen (the desktop side panel), said the new forms weren't on the page, and advised skipping the live test because the automated tests had passed.
- **Why:** It guessed from the build report's wording instead of looking at the code or the environment. The page was the new version; a server secret was missing from the local settings, and the page silently fell back to the old cards when it could not read connection status.
- **Caught by:** A second thread read the local checkout and settings, found the missing secret, and pushed back on skipping the live test, since the automated tests never contact the real providers. A silent fallback that hides a setup error is a design gap worth fixing.
- **Predicted it?** No.

### F-012 · 2026-10-23 · build tool
- **Asked:** Add a way to save synced activity for a user who has no signed-in session, as a verified webhook would need (MOM-38).
- **What went wrong:** It put the elevated database access (the one that skips per-user row protection) into the same file as the signed-in version, and an existing test failed. That test exists to prove the signed-in file never uses elevated access.
- **Why:** Sharing one file looked like the smallest change, and it did not re-read the existing source-level guard tests before choosing where the new code went.
- **Caught by:** Running the existing ingestion tests after writing the new ones. The guard was kept as it was; the session-less entry point moved into its own small file, so the elevated access lives in one place a test can point at.
- **Predicted it?** No.

### F-013 · 2026-10-23 · build tool
- **Asked:** Show the proposed CLAUDE.md wording for a pull-request workflow as a diff, so the owner could approve it (MOM-67).
- **What went wrong:** The diff shown in the chat reply had a typo in the last Definition of Done line ("director" where the CI job is called "database"), and it was shortened with "..." in the middle, so it was not the exact text that would have been applied.
- **Why:** The diff was retyped by hand into the reply instead of pasted from the tool output. The scratch copy that was going to be applied was correct.
- **Caught by:** The model noticed the typo and flagged it at the end of the same reply, and the owner named the correct wording in the next instruction. Nothing wrong was applied.
- **Predicted it?** No.

### F-014 · 2026-10-23 · build tool
- **Asked:** Build a runner that runs every SQL verify script in CI, "using `supabase db query --local -f <file> -o json`" (MOM-67 build prompt).
- **What went wrong:** That command cannot run any of the verify scripts. It stops with "cannot insert multiple commands into a prepared statement" (also with a direct database address), because it sends a file as one statement and the scripts use several statements in one session. The build prompt named it as the way to do the job.
- **Why:** The prompt's command was not checked against what the project had already recorded: `BACKLOG.md` already said this command fails on every verify script and that the runner must go through the database container instead. The model's first read of the files did not include that backlog item either, so it learned the same thing by running the command. Whether the prompt's author or the plan generator missed the note was not traced.
- **Caught by:** Trying the command on one script before building on it. The runner uses `psql` inside the local database container instead.
- **Predicted it?** No.

### F-015 · 2026-10-23 · build tool
- **Asked:** Follow the project rule that nothing marked `unreviewed` is committed to the log files (CLAUDE.md, MOM-92).
- **What went wrong:** Four entries (three failures and one RAID issue) went into commits on `main` while still marked `unreviewed`, in two docs commits made before today's day-end review.
- **Why:** Those commits were treated as "just docs" and the log files were staged whole, so the rule that only approved entries are staged was not applied. Nothing checks for the mark before a commit.
- **Caught by:** The day-end review, when the committed log was compared with the working copy and four marked entries were already in `HEAD`.
- **Predicted it?** No.

### F-016 · 2026-10-24 · build tool (project thread)
- **Asked:** Give the owner paste-ready git commands to finish after the MOM-67 pull request merged (switch to main, pull, delete the feature branch).
- **What went wrong:** The switch to main aborted because uncommitted log edits would have been overwritten. The commands ran anyway, so the pull fast-forwarded the feature branch instead of main, and the local branch delete failed because that branch was still checked out. Nothing was lost.
- **Why:** The commands assumed a clean working tree, though the owner's last report listed uncommitted log files. They were also chained with no stop on the first error.
- **Caught by:** The owner pasted the terminal output. A follow-up `git branch -f main origin/main` and switch fixed it.
- **Predicted it?** No.

## In-product failures

None recorded yet. The plan generator and rebalance have passed their live smoke tests. Their failure paths are not yet tested in production (see `docs/RAID_LOG.md` I-01).
