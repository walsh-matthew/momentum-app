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

### F-009 · 2026-10-23 · build tool · `unreviewed`
- **Asked:** Add a database check that a wizard goal titled "Career pivot" gets exactly the key `career_pivot` on a fresh account (MOM-19).
- **What went wrong:** The new check passed, but the detail text it printed was an error message from a different, earlier test case, so a passing check looked like it had failed with a duplicate-key error.
- **Why:** The detail text came from a variable that an earlier loop in the same script had already filled in. The model reused the variable without clearing it first. The pass/fail result was right; only the explanation shown was wrong.
- **Caught by:** Reading the printed output of the new checks line by line rather than only the pass count. Fixed before commit.
- **Predicted it?** _owner to answer_

## In-product failures

None recorded yet. The plan generator and rebalance have passed their live smoke tests. Their failure paths are not yet tested in production (see `docs/RAID_LOG.md` I-01).
