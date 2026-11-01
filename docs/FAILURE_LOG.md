# Momentum AI Failure Log

Each dated entry records a place where an AI tool got it wrong, and the entry is written only because it led to something durable: a fix made that session, a new standing rule, or a Jira ticket. Over time this log shows where models fail and why. It is also the source of interview examples, and the 90-day plan's Phase 2 gate needs at least 20 entries.

**How this log is kept (lighter rule, MOM-133, 2026-10-29)**

- **Capture only what changes something.** When the owner corrects the AI, a check fails, or a claim turns out to be false, the build agent drafts an entry marked `unreviewed` **only if it leads to a fix made that session, a new standing rule, or a Jira ticket** — the entry names which (for example "→ fix in this session", "→ rule: ...", "→ MOM-nnn"). A correction with no durable result is not logged. In any chat, the owner can also say "log that". Project threads draft their entries for the next day-end.
- **Review.** At day-end the build agent lists the day's unreviewed entries with its own draft of the "why". The owner answers in plain words, for example "ok all", "drop 2", or "3: no". Approved entries lose the `unreviewed` mark and are committed. Nothing is committed unreviewed. The per-entry "predicted it?" question is dropped; a **monthly pattern review**, at the first day-end of each calendar month, looks across that month's entries for a cause that recurred and records the result — including that month's entry count and how many led to a fix, a rule or a ticket — as a Jira comment on MOM-92.
- **Source** tags who failed. `build tool` means Claude Code or a project thread building Momentum. `in-product` means Momentum's own Claude features (the plan generator and the rebalance proposals). In-product entries feed the Phase 2 evals.
- **Interview-ready** (★) marks entries that make a clean story: a clear miss, a clear cause, and a lesson.
- The repository is public, so entries carry no personal data, secrets or exploit detail.
- Risks, assumptions, issues and dependencies no longer go in a RAID log entry; see `docs/RAID_LOG.md` (frozen) and CLAUDE.md, "RAID and Failure Logs (MOM-92, lighter rule MOM-133)" — they go to Jira with the `risk` label instead.

The log is seeded from this project's sessions (2026-10-21 onward). Week 1 notes were not kept. The owner reviewed the seed entries in the pull request that added this file (MOM-92). Entries F-001 through F-058 predate the lighter rule and keep their original "Predicted it?" answers as history; the question is not asked of new entries.

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

### F-017 · 2026-10-25 · build tool (project thread)
- **Asked:** Use the owner's own job-search tracking sheet as evidence while redesigning Momentum's goal model.
- **What went wrong:** It read a hard-coded cell as a real weekly total and drew a design conclusion from that number.
- **Why:** It took the number at face value and didn't check whether the cell was calculated from the rows or typed in.
- **Caught by:** The owner, who pointed at the formula column.
- **Predicted it?** No.

### F-018 · 2026-10-26 · build tool (project thread) · ★
- **Asked:** Draw product findings from an unprimed setup walk-through with a household tester.
- **What went wrong:** It read the tester's reuse of the example answers as anchoring, a sign the examples were steering the tester's answers, and built a design rule on that reading.
- **Why:** It inferred the tester's state of mind from the answers alone, without asking. The tester later said the examples were what unblocked her.
- **Caught by:** The owner, who asked the tester. The rule became "offer the choice before examples" (`docs/DOMAIN_MODEL.md` §2.1 rule 4).
- **Predicted it?** No.

### F-019 · 2026-10-25 to 2026-10-26 · build tool (project thread) · ★
- **Asked:** Design Momentum's setup conversation and weekly rhythm for any person's life.
- **What went wrong:** Recurring. It built a standard work schedule into the design again and again: weekends kept for family, check-ins in the evening or at the end of the week, "any three" days, and a reminder nobody asked for. It happened twice in the design work and three more times in one setup walk-through.
- **Why:** The model falls back on a default office-worker week when nothing says otherwise. Telling it once in conversation did not stop the next slip.
- **Caught by:** The owner, each time. The fix is hard rules in the setup prompt, checked automatically per turn by the setup eval set (`docs/DOMAIN_MODEL.md` §2.1 rules 2 and 3, §4.2 principle 1; MOM-111).
- **Predicted it?** No.

### F-020 · 2026-10-26 · build tool (project thread)
- **Asked:** Plan who opens the docs pull request for the approved goal model.
- **What went wrong:** It told the owner that a project thread couldn't open the pull request without breaking the branch-naming rule. It hadn't checked the repo's history: project threads had already opened ten pull requests from their own branches.
- **Why:** It reasoned from the written rule instead of checking what the project actually does.
- **Caught by:** The owner, who asked why it couldn't handle the pull request as before.
- **Predicted it?** No.

### F-021 · 2026-10-26 · build tool
- **Asked:** Find out whether a new database check script must follow a convention, and report it (MOM-66).
- **What went wrong:** It reported that nothing enforces the style of a verify script. A unit test does: every script must build a temporary results table and end with one fixed query. It wrote the new script a different way, and the test failed.
- **Why:** It searched the tests for the folder path and found only comments. The test that enforces the style reads the folder through a variable, so the search never matched. It treated "found nothing" as "nothing exists".
- **Caught by:** `npm test`, after the report had already been given to the owner.
- **Predicted it?** No.

### F-022 · 2026-10-26 · build tool
- **Asked:** Finish a block that found two new follow-up items, and log them in the backlog (MOM-66).
- **What went wrong:** It logged both items without a Jira key and reported the block done. The day-end build check expects every open item to have a key, so it failed on that branch. The command that checks this reports success even when items are missing a key, and the day-end tool's own first filter of the output hid the failing line.
- **Why:** New items are meant to get their keys at day-end, but the build check runs before that step, so any block that logs an item fails it. The checking command only prints the problem; it does not fail.
- **Caught by:** The day-end tool, on a second, full read of the output before reporting the branch as passed. The fix is tracked in MOM-104.
- **Predicted it?** No.

### F-023 · 2026-10-26 · build tool
- **Asked:** Run the day-end with each git command on its own, never joined with `&&`, stopping on the first error.
- **What went wrong:** While committing the end-of-day backlog sync, it joined two git commands with `&&` (staging the files, then showing what was staged), and earlier ran a read-only git command in the same call. Both succeeded and nothing was affected, but the rule exists so that a failing step stops before the next one runs and the owner sees each result.
- **Why:** It treated a stage followed by a read-only check as one harmless step and grouped them for speed, instead of applying the rule to every git command.
- **Caught by:** The day-end tool itself, which reported it to the owner before the push.
- **Predicted it?** No.

### F-024 · 2026-10-26 · build tool
- **Asked:** Write the plan block for the password reset (MOM-64), including the address the owner must add to the sign-in provider's redirect allow-list.
- **What went wrong:** The block told the owner to allow-list the new-password page itself as the destination of the emailed link, "through the existing callback". That page needs a session, and the emailed link arrives before there is one, so the link's code would have been lost on a bounce to the sign-in page. The owner had already added that address; a second one had to be added.
- **Why:** The block was written without checking which paths the route guard lets through before sign-in, and "through the existing callback" was left unspecified where the allow-list entry had to be exact.
- **Caught by:** The build agent, reading the route guard before writing any code, and asking the owner for a decision.
- **Predicted it?** No.

### F-025 · 2026-10-26 · build tool
- **Asked:** Add browser tests for the new auth screens (MOM-64).
- **What went wrong:** Five of the new browser checks failed on the first run: two looked for an alert or a landmark in ways that matched more than one element or none, one expected a web address with no trailing fragment, and one old test now matched text that appears twice. The unit tests for the same screens had passed.
- **Why:** The unit tests run in a simulated page that is lenient about landmark roles and has no router announcer, so they hid how the real browser sees the page. The new tests copied that leniency.
- **Caught by:** `npm run test:e2e`, before anything was committed. (A related finding, the mobile header not being a landmark in a real browser, is in `BACKLOG.md`.)
- **Predicted it?** No.

### F-026 · 2026-10-26 · build tool
- **Asked:** Make the plan check require a `/day-start` row first and a `/day-end` row last in the runbook (MOM-104).
- **What went wrong:** The first version of the check took any runbook line that mentioned a day command as a day row. One block's row names both commands in its gate text, so the check dropped that block's own row and reported the block as missing from the runbook. The new unit tests had passed.
- **Why:** The fixtures only had the commands in their own cells, so no test held a row that merely mentions them, though the real plan already did.
- **Caught by:** `npm run plan:check -- --strict` on the real plan, before anything was committed. A test with that row shape was added.
- **Predicted it?** No.

### F-027 · 2026-10-26 · build tool
- **Asked:** Write tomorrow's plan, including the number of passing checks to expect when the day-end re-checks production.
- **What went wrong:** The plan said to expect 272 passing checks across 11 scripts. Production gave 277, all passing. One script checks a platform-installed object that exists only on production, so five of its checks run there and are skipped on a local build; the expected count had been worked out from the local run.
- **Why:** The figure was added up from a local result and written as fact for production, although the plan itself warns that local and production databases differ (RAID R-16).
- **Caught by:** Day-end step B, which compared the totals and read the script's output before accepting the difference.
- **Predicted it?** No.

### F-028 · 2026-10-26 · build tool
- **Asked:** Run the type check, tests and build on each of the day's branches in turn (day-end step A, then step D's own checks).
- **What went wrong:** The type check and the build failed on the step D branch, though its code was fine. The browser tests on the previous branch had started the development server, which left generated route types for two pages that exist only on that branch. The production build regenerates its own copy of those types but not the development server's, so the stale copy failed every later branch.
- **Why:** The checks treat the build folder as if it belonged to the branch being checked. Generated files outlive a branch switch, and the order of the branches decided whether a check passed.
- **Caught by:** The type check on the step D branch. Removing the development server's generated folder fixed it; nothing in the repo changed. The branches checked earlier in step A ran before the browser tests and are unaffected.
- **Predicted it?** No.
- **Recurring cause:** F-028, F-039 and a stale generated folder cleared during the MOM-111 block (2026-10-27) are one cause: generated route types outlive a branch switch. The fix (clear both generated type folders in `/day-start` and the `/run-block` preflight before the type check and build) is MOM-130.

### F-029 · 2026-10-26 · build tool
- **Asked:** At the day-end tidy step, switch to `main` without disturbing the owner's uncommitted log edits.
- **What went wrong:** It told the owner the switch was safe because the log files matched, then the switch aborted. It had compared the logs against the updated remote `main`, but the local `main` being switched to was still the morning's copy, whose logs differed. Nothing was lost; the switch was redone with a backup.
- **Why:** It checked the branch it expected `main` to become after the update, not the branch git would actually switch to.
- **Caught by:** Git, which refused the switch and changed nothing.
- **Predicted it?** Partly.

### F-030 · 2026-10-26 · build tool
- **Asked:** Advise on the family trial's terms for a minor tester (MOM-116).
- **What went wrong:** Claude said Momentum works without Claude for a minor tester, missing that guided setup is a Claude conversation.
- **Why:** It thought of Claude as part of the old features (the week plan and rebalance) and did not check that the new model's setup is itself a Claude conversation.
- **Caught by:** The owner's question.
- **Predicted it?** No.

### F-031 · 2026-10-27 · build tool
- **Asked:** At the start of a build block, check that the local database stack is running, by name only and never printing a value.
- **What went wrong:** It ran the status command that prints everything, so the local stack's connection details and keys went into the conversation. They are the standard values of a local test stack, not production secrets, and nothing needed rotating.
- **Why:** It reached for the command that answers "is it running" without thinking about what else the command prints.
- **Caught by:** The build agent noticed the output when it came back, and said so to the owner.
- **Predicted it?** No.

### F-032 · 2026-10-27 · build tool
- **Asked:** Build the phone-first manual entry controls (MOM-110).
- **What went wrong:** The shared hook behind the controls imported a type from the services folder. Two existing boundary tests failed, because a component may not import from the services at all, even a type.
- **Why:** It reused the existing result type instead of re-reading the rule that components never reach into the services.
- **Caught by:** The full unit test run, before anything was committed. The hook now spells the type out itself.
- **Predicted it?** No.

### F-033 · 2026-10-27 · build tool
- **Asked:** Write a browser test for manual entry, with a helper that gives a throwaway account its goal and targets.
- **What went wrong:** The helper ended with the default sign-out, which ends every session the account has, including the browser's. All four browser tests failed at the sign-in page.
- **Why:** It assumed sign-out ended only the helper's own session. The default is every session, and the helper's was the quieter of the two.
- **Caught by:** The first browser run: the page snapshot of each failure was the sign-in page. The helper now signs out of its own session only.
- **Predicted it?** No.

### F-034 · 2026-10-27 · build tool
- **Asked:** The same browser test: check that nothing is marked Removed after a reload.
- **What went wrong:** The check failed on a correct page. Matching the word as a substring found it in the joined text of the list, where a Remove button ran straight into the next entry's title ("Distance"). The page was right and the test was wrong.
- **Why:** It wrote the text match without considering that the list's text has no spaces between items, so a short word can appear across a seam.
- **Caught by:** The failure itself, then printing the element the match resolved to. The test now asks for the exact word.
- **Predicted it?** No.

### F-035 · 2026-10-27 · build tool
- **Asked:** Design the guided setup draft validator (MOM-111).
- **What went wrong:** At the design stop it described the rule "a target needs the time zone and the day end" as one the validator enforces on every draft. Setup asks those facts at step 10, after the targets at step 7, so enforcing it during the conversation would reject every draft; it can only be enforced when the draft is saved.
- **Why:** It read "before the first target is saved" as "before the first target is drafted" and did not lay the rule beside the 12-step order.
- **Caught by:** Writing the first scripted conversation, before any code ran. The validator checks it in the final validation only, and the block's report says so.
- **Predicted it?** No.

### F-036 · 2026-10-27 · build tool
- **Asked:** Write the automatic check that Claude never announces a reminder (MOM-111).
- **What went wrong:** The first version caught "you'll get a reminder" but let "you will get a reminder" through.
- **Why:** It wrote the pattern for the one phrasing it had in mind instead of listing the plain variants of the same sentence.
- **Caught by:** The unit test for the check, which tries several phrasings. The pattern now covers both.
- **Predicted it?** No.

### F-037 · 2026-10-27 · build tool
- **Asked:** Write the check that Claude skips a question that is already answered (MOM-111).
- **What went wrong:** It treated any topic already asked as answered for the whole setup, so asking a second goal its shape was flagged as a repeat. Only the person's own facts are asked once; a goal's shape, dates and targets are asked again for each goal.
- **Why:** It modelled setup as one goal and did not think through a conversation with two.
- **Caught by:** The eval case with two activities in one idea. The check now applies to the person's own facts only, and the backlog notes that per-goal repeats are not checked.
- **Predicted it?** No.

### F-038 · 2026-10-27 · build tool
- **Asked:** Design how Hevy workouts become entries bound to a target (MOM-109).
- **What went wrong:** The design stop presented a sync that runs with no person signed in and reads each target's measure and unit to work out a value. The service role has no read access to targets, and the owner had just ruled out a migration, so the design as shown could not be built.
- **Why:** It listed what the service role can read and write while reading the migration, but did not check each step of the mapping against that list before presenting the design.
- **Caught by:** Writing the test fake from the migration's grant table, before any service code ran against a database. The sync now reads the bindings through the person's own session and writes entries with the service role; a sync with no session at all is logged as follow-up work.
- **Predicted it?** No.

### F-039 · 2026-10-27 · build tool
- **Asked:** Run the type check on each of the day's branches in turn (day-end step A), following the plan's note on stale generated files.
- **What went wrong:** The type check failed on the second branch, in a generated file that still named a page only the first branch has. The plan's note (from F-028) said to clear only the development server's generated folder, but this copy came from the production build, which keeps its own generated types in another folder.
- **Why:** The workaround written after F-028 named the one folder seen that day instead of every generated folder that can outlive a branch switch.
- **Caught by:** The type check itself. Clearing the build's generated types fixed it, and from then on both folders were cleared before every switch; the build and the type check after it passed.
- **Predicted it?** No.
- **Recurring cause:** F-028, F-039 and a stale generated folder cleared during the MOM-111 block (2026-10-27) are one cause: generated route types outlive a branch switch. The fix (clear both generated type folders in `/day-start` and the `/run-block` preflight before the type check and build) is MOM-130.

### F-040 · 2026-10-27 · build tool
- **Asked:** Read the whole output of each build check (the rule from F-022).
- **What went wrong:** On one branch it filtered the build's output down to a few matching lines before reading it.
- **Why:** It reached for a shorter output on a check that had passed on every earlier branch.
- **Caught by:** The build agent, straight after; it ran the build again and read the full output, which was clean.
- **Predicted it?** Partly.

### F-041 · 2026-10-27 · build tool
- **Asked:** At the start of the day-end, count the unreviewed entries in the risk log (one of the four "nothing to sync" conditions).
- **What went wrong:** The count printed 0 while four unreviewed entries were waiting. The pattern looks for the mark in the column after the ID, but entries carry it in the status column (or in the text), and it only matches risk rows, not issue rows.
- **Why:** The pattern was written from an idea of the table's layout, not tested against a row that was really marked unreviewed.
- **Caught by:** The failure log's count was not zero, so the run continued anyway, and the owner's message named the four entries. The pattern in the day-end command is fixed to match any row type with the mark in any column.
- **Predicted it?** No.

### F-042 · 2026-10-27 · build tool (project thread) · ★
- **Asked:** Review a person's career documents (appraisals and several versions of one document) and propose honest entries for a private working profile.
- **What went wrong:** Changes between versions of the document were called "drift" and listed as a risk, and a non-technical reviewer's description of technical work was treated as more accurate than the owner's own, carefully checked description. Both conclusions were wrong.
- **Why:** The older documents were treated as the authority over the owner. The review did not check which way each change moved (every one moved toward the evidence, the mark of a deliberate verification pass), and did not ask who wrote the older wording or why it differed.
- **Caught by:** The owner, reviewing the draft profile the same day. Both entries were dropped. The lesson went into the profile skill's rules: the owner's word beats any document, and check the direction of a change before calling it a problem.
- **Predicted it?** No.

### F-043 · 2026-10-27 · build tool (project thread)
- **Asked:** "Can we update it so merge happens automatically?", right after a reply that mentioned both an open pull request and merging overlapping entries in a monthly review.
- **What went wrong:** The request was read as "auto-merge the pull request". The owner meant "have the monthly review merge overlapping entries". The pull request was pushed and set up to merge on its own before the owner said what he meant.
- **Why:** An ambiguous "it" was resolved to the most recent git topic without asking, although the reply before it had just raised the other topic. Any step that changes something outside the conversation is worth one clarifying question first.
- **Caught by:** The owner, a few minutes later. Pushing the entry was fine with him, so nothing was reverted; the monthly review change was then made as he meant it.
- **Predicted it?** No.

### F-044 · 2026-10-28 · build tool
- **Asked:** At the design stop for the setup budget block, say roughly what a live eval run of guided setup would cost per setup, on each model.
- **What went wrong:** The estimate was about $3.2 per setup on the default model and said the request grew with the square of the turns because every earlier reply repeated the whole draft. The size of the history growth was right in kind but about five times too big in cost: measured on the repo's own eval cases the drafts are around 400 tokens, not the 3,000 the estimate assumed, and the fixed prompt, not the drafts, is the biggest part of the input.
- **Why:** A draft size was picked instead of measured, although the eval cases that show real draft sizes were in the repo and cheap to read. The estimate was labelled an estimate, but it was built on an input that could have been checked in one step.
- **Caught by:** The owner asked for a re-estimate after the history change; measuring the eval cases for it showed the assumption was wrong.
- **Predicted it?** No.

### F-045 · 2026-10-28 · build tool
- **Asked:** Build the safety rails for a live setup eval run (MOM-128).
- **What went wrong:** The helpers were put in the pure setup logic folder, and one of them named the secret variable it sets. A boundary test that keeps that folder free of secrets, environment access and network calls failed.
- **Why:** The file was placed by topic (it is about setup) instead of by the folder's rule, and the test list that states the rule was not read before choosing the folder.
- **Caught by:** The unit test run, the same hour. The helpers moved to the folder for the model-calling code, where naming the variable is allowed.
- **Predicted it?** No.

### F-046 · 2026-10-28 · build tool · ★
- **Asked:** Wire the guided setup Claude call so the draft it returns can be checked and saved (MOM-111 block 1, MOM-128).
- **What went wrong:** The prompt described the draft only in prose, and the strict schema that checks every reply was never shown to the model. On the first real call the model made up its own field names for a goal and the reply was rejected on the second turn. The eval set had passed all along because it ran against a scripted stand-in that already knew the schema.
- **Why:** The checks and the prompt were written separately, from the same description, and tested against each other only through a fake model. A fake model cannot show that the real one was told what the checks expect. The BACKLOG noted that the schema had not been tried against the real API; nothing made that a blocker before the first live call.
- **Caught by:** The first paid run, two turns in (about 3 cents). The fix writes the prompt's field names and allowed values from the same schema the validator uses, with a test that fails if the two disagree; the next run had no schema failures in 40 replies.
- **Predicted it?** No.

### F-047 · 2026-10-28 · build tool
- **Asked:** Before running the setup screen block, check the prerequisites by name only and never print a value (the run-block command's rule).
- **What went wrong:** To see whether the local stack was up I ran the Supabase status command and showed its first lines. They included the local stack's keys in plain text. They are the CLI's fixed demo values for a local stack, not secrets of this project, but the command was run without filtering the output, against the rule that values are never printed.
- **Why:** The command was chosen for the information it gives, not for what it prints, and the output was cut to its first lines instead of being reduced to the one fact needed (running or not).
- **Caught by:** The build agent noticed the output right away and said so in the same message; nothing was copied anywhere.
- **Predicted it?** No.

### F-048 · 2026-10-28 · build tool
- **Asked:** Test that a work item with steps is saved under a checklist target (MOM-111 save).
- **What went wrong:** The test took the first full conversation in the eval set and added a weekly checklist target to it. That conversation is a deadline-only person who is never asked for a week start, so the save was correctly refused ("which day your week starts") and the test failed. A second test file made the same mistake in a different form: its table of cases was built before the fixture it used had loaded.
- **Why:** The fixture was assumed to suit the test without reading what it contained, and the second file was run only after it was written, not read for load order.
- **Caught by:** The unit test run, minutes after writing them. Both were fixed in the test (pick a case with a week start; load the fixture before the table is built); the code under test was right.
- **Predicted it?** No.

### F-049 · 2026-10-28 · build tool
- **Asked:** At the start of the Hevy "Sync now" block, check the local stack and prerequisites by name only, and never print a value (the run-block command's rule).
- **What went wrong:** The same slip as F-047, again: to see whether the local stack was running I ran the Supabase status command with no filter, and its output showed the local stack's keys in plain text. They are the CLI's fixed demo values, not secrets of this project, but the rule is that values are never printed.
- **Why:** The command was chosen for what it reports, and its output was not reduced to the one fact needed (running or not). F-047 was already written down earlier the same day, and it did not change the habit.
- **Caught by:** The build agent noticed it in the output and said so in the same message; nothing was copied anywhere.
- **Predicted it?** No.

### F-050 · 2026-10-28 · build tool
- **Asked:** Add tests for the Hevy "Sync now" block (MOM-129): the action, the card's button states, and the browser run.
- **What went wrong:** Three of the new checks failed on their first run, all from the tests and not the code. (1) A test that the Hevy adapter "has no Supabase in it" matched the adapter's own comments, so it failed on a correct file. (2) The one-sync-at-a-time lock was first written inside the sync service with a set that removes entries, and an existing test that forbids any delete in that file failed. (3) A loop in the button test clicked again before the button had returned from "Syncing", and passed alone but failed in the full run. A fourth, the 390px sideways-scroll check, failed on a header that was already too wide before this change.
- **Why:** Each test was written from what it should mean without first looking at what the file actually contained (comments, an existing guard test, how long React takes to settle, what the page looked like before).
- **Caught by:** The unit and browser runs within minutes of writing. The lock moved to its own small module, the adapter check was replaced by a plain "no diff" check, the loop waits for the button, and the width check was narrowed to the card. The code under test was right in every case.
- **Predicted it?** No.

### F-051 · 2026-10-28 · build tool
- **Asked:** At the start of the home scoreboard block (MOM-112), check whether the local stack was running before the browser tests, and never print a value (the run-block command's rule).
- **What went wrong:** The same slip as F-047 and F-049, a third time in one day: I ran the Supabase status command with no filter, and its output showed the local stack's keys in plain text. They are the CLI's fixed demo values, not secrets of this project, but the rule is that values are never printed.
- **Why:** Writing the failure down did not change what I do. The entries are notes for the owner to review, not something I read at the moment I choose a command, so the habit (run it and show the output) came back each time. The check that is wanted is one fact (running or not), and the filtered command was not the default.
- **Caught by:** I noticed the output right away and said so in the same message; nothing was copied anywhere. Fix for the rest of this block: check with a command that prints only whether the stack is up.
- **Predicted it?** No.

### F-052 · 2026-10-28 · build tool
- **Asked:** Draw the scoreboard mock-up from engine output on scripted data for the owner to review, then design the service that maps the database's rows onto the engine (MOM-112).
- **What went wrong:** Three things I showed or said did not hold against the real tables. (1) The mock-up showed a "Tight" deadline verdict, but the engine needs the days the person has set aside, and nothing stores or derives them yet, so no real row can produce one. (2) It drew which named days of a day-slot target were filled by assuming the first ones, when the engine only returns how many. (3) The design stop said a step's crossing would come from a separate engine call for steps with no target; an entry always belongs to a target, so such a step can never be ticked, and the crossing already comes from its checklist target. The owner approved the design with (3) in it.
- **Why:** The scripted data was richer than any real person's rows, and the mock-up and design were built from the engine's inputs and not from what the tables can hold. (1) and (2) were noticed while reading the tables for the design and said at the design stop; (3) I wrote from the engine's function names without checking the table rule that makes it unreachable.
- **Caught by:** (1) and (2) while reading the tables for the design, and told to the owner before the build. (3) while writing the test for a step crossing: no entry could be made for such a step. The unreachable path was removed before the commit, and the owner is told in the close-out.
- **Predicted it?** No.

### F-053 · 2026-10-28 · build tool
- **Asked:** Make home follow the person's celebration setting, and use the default when they have not chosen one (MOM-112).
- **What went wrong:** I set the default to medium and stated it as fact in the design notes and the close-out. The domain model's settings table says the default is low-key. The tone default I set (middle) was right.
- **Why:** The block's list of what to read named the goal, week and scoreboard sections and the principles, not the settings table, and I filled the one default I did not look up from a guess instead of opening the table. The domain docs are the binding source, so a value a doc states is read, not chosen.
- **Caught by:** The owner, after the close-out. The default is now low-key, with a test that writes the literal value out for a null setting so a change to the defaults file cannot quietly change what null means.
- **Predicted it?** No.

### F-054 · 2026-10-28 · build tool
- **Asked:** Show a day-slot target on its goal card (MOM-112).
- **What went wrong:** The card read "2 of 3 days filled (Mon, Wed, Fri)". The engine says how many slots are filled, not which, so listing the named days in brackets after the count reads as if those were the filled ones. The mock-up I showed had the same problem as pips, and I changed it to the bracket wording and told the owner it was a different shape, not that it still implied which days were filled.
- **Why:** I treated "the engine does not say which" as a reason to drop the pips, and stopped there instead of reading the new sentence as a person would.
- **Caught by:** The owner, after the close-out. The count and the named days are now two separate lines.
- **Predicted it?** No.

### F-055 · 2026-10-28 · build tool
- **Asked:** Write component tests for manual entry part 2 (a log on a chosen day) and keep the existing timer tests passing (MOM-110).
- **What went wrong:** Two tests failed once each under load and passed on rerun. One waited for the day label to go back to "Today" and then clicked the log button at once; the other waited for the refusal message and then looked for the "Stop timer" button at once. In both, the button was still in its saving state for a moment after the signal the test waited on, so it could not be found by its name. The first failed the day-end build check; the second had failed earlier the same day in another block's test run.
- **Why:** Each test waited for an earlier signal instead of the state it was about to use, the pattern an open backlog item already warns about. A test that passes alone was taken as proof it was settled, and the earlier one-off failure was put down to load without being fixed.
- **Caught by:** The day-end build check on the branch, then three clean reruns of the file, which showed timing, not the code, was at fault. Both tests now wait for the button by its settled name.
- **Predicted it?** No.

### F-056 · 2026-10-28 · build tool
- **Asked:** At the start of the day-end, count the unreviewed entries in the failure log (one of the four "nothing to sync" conditions).
- **What went wrong:** The count printed 0 while eleven failure entries were marked unreviewed. The pattern looks for the mark on the "Predicted it?" line, but entries carry it in their heading line and leave "Predicted it?" for the owner's answer. It is the same kind of miss as F-041 in the risk log, one file over.
- **Why:** The F-041 fix corrected the risk-log pattern only; the failure-log pattern beside it was not tested against a real unreviewed entry at the same time.
- **Caught by:** The build agent, because the uncommitted log edits showed the file had new entries; a plain search for the mark found eleven. The run continued anyway, because other conditions held. The command's pattern still needs fixing.
- **Predicted it?** No.

### F-057 · 2026-10-28 · build tool
- **Asked:** During the day-end build checks, see whether the local stack was up before the database and browser checks, and never print a value.
- **What went wrong:** The same slip as F-047, F-049 and F-051, a fourth time in one day and in a different command: the Supabase status command was run with only its first lines kept, and those lines held the local stack's keys in plain text. They are the CLI's fixed demo values, not secrets of this project.
- **Why:** As F-051 said, writing the failure down does not change the habit at the moment a command is chosen. Cutting output to its first lines is not the same as reducing it to the one fact needed.
- **Caught by:** The build agent, in the same message; nothing was copied anywhere. A check that prints only "running" or "not running" belongs in the commands, so the choice is not made fresh each time.
- **Predicted it?** No.

### F-058 · 2026-10-28 · build tool (advising thread)
- **Asked:** Give the owner a review prompt to paste into the build session.
- **What went wrong:** The advising thread split a review paste across two messages. The first one left out the standing backlog line and the migration stop, and the owner had to ask for one full prompt.
- **Why:** It answered the block's questions and forgot the standing lines.
- **Caught by:** The owner.
- **Predicted it?** No.

### F-059 · 2026-10-29 · build tool
- **Asked:** During `/run-block MOM-124`'s preflight (checking whether the local stack was up before trying the new script), check prerequisites by name only and never print a value.
- **What went wrong:** A fifth instance of F-047/F-049/F-051/F-057: ran `npx supabase status` with no filter, and its output showed the local stack's keys in plain text. They are the CLI's fixed demo values, not secrets of this project.
- **Why:** The exact pattern F-057 already named: no committed command existed yet that answers "is the stack up" with one word, so the habit of running the full status command came back.
- **Caught by:** The build agent, in the same message; nothing was copied anywhere.
- **Led to:** A fix in the same block (MOM-124 part 1): `npm run stack:status` answers "is the stack up" with one line and no keys, and `.claude/settings.json` denies the unfiltered status command.

### F-060 · 2026-10-29 · build tool
- **Asked:** Write component tests for the Hevy "Sync now" control (MOM-129, 2026-10-28).
- **What went wrong:** Two tests in the file wait for the result message (the alert, or the "Added 2 entries." status) and then look for the "Sync now" button at once. For a moment after the message shows, the button still reads "Syncing…", so under a full-suite run it is not found. It failed 2 of 6 runs on 2026-10-28 and 2 of 4 full runs at the 2026-10-29 day-end (once on each of two branches that do not touch it), and passed alone every time. It can also turn a pull request's CI red.
- **Why:** The same race as F-055, one file over. The warning about waiting for the settled state was in the backlog under MOM-96, and nothing points a block writing a component test to it, so the pattern was written again.
- **Caught by:** The day-end build checks (step A), then a rerun of the full suite and of the file alone.
- **Led to:** MOM-96: make every such test wait for the button by its settled name, starting with this file.

### F-061 · 2026-10-29 · build tool
- **Asked:** Draft new log entries marked `unreviewed`, so the day-end finds them and the owner reviews them.
- **What went wrong:** A failure entry and a risk-log row were written into the working copy without the `unreviewed` mark, and the failure entry had the owner's "Predicted it?" answer filled in by the build agent. The day-end's start counted 0 unreviewed entries while two were waiting. It is the blind spot of F-041 and F-056 from the other side: there the pattern missed marked entries, here the entries missed the mark.
- **Why:** The count trusts the mark, and the mark depends on whoever drafts the entry remembering it.
- **Caught by:** The build agent at the day-end's start, from the uncommitted changes to the two log files.
- **Led to:** MOM-124: the day-end's start also counts entries added in the uncommitted log changes, marked or not.

### F-062 · 2026-10-29 · build tool (project thread)
- **Asked:** Advise the build session on what to commit.
- **What went wrong:** The advising thread told the build session to commit the pending live-checks file, which is git-ignored on purpose. The build session caught it.
- **Why:** The thread did not check the ignore file before naming the file.
- **Caught by:** The build session.
- **Led to:** A rule: check that a file is tracked before telling anyone to commit it.

### F-063 · 2026-10-29 · build tool (project thread)
- **Asked:** Answer a block's two-question design form (MOM-111, block 3).
- **What went wrong:** The thread wrote one combined answer without saying which question it was for, then sent it twice more. The owner had to ask where the confusion came from.
- **Why:** It answered before seeing that the form had two tabs.
- **Caught by:** The owner.
- **Led to:** A rule: one labeled answer per form question.

### F-067 · 2026-10-29 · build tool
- **Asked:** Fix the findings from the owner's phone smoke test of guided setup (MOM-111, round 1).
- **What went wrong:** The round passed every test while the setup cards' layout on a phone was plainly wrong.
- **Why:** The tests checked the text on each card, not its layout or visual weight, so nothing failed when the screen looked wrong.
- **Caught by:** The owner's phone run and screenshot review.
- **Led to:** A rule: every changed setup card gets a screenshot review at 390px before merge, plus sweep tests for layout and weight.

### F-068 · 2026-10-29 · build tool
- **Asked:** Build setup fix round 3 (MOM-111), with a browser test for each fix.
- **What went wrong:** A setup browser test passed for the wrong reason: the fake model's retry timing made it pass, not the behavior the test named.
- **Why:** The test's pass condition could be met by a side effect of the fake, so it never showed the behavior itself.
- **Caught by:** The build session while building round 3.
- **Led to:** A fix in that round.

### F-069 · 2026-10-29 · build tool
- **Asked:** Keep the setup browser spec green in CI (MOM-111, round 3 pull request).
- **What went wrong:** A setup browser test depended on the time of day. It compared the browser's date, which is UTC in CI, with the person's own date, so it went red only after UTC midnight (evenings, Pacific time).
- **Why:** The test assumed the browser's date and the person's date are the same day.
- **Caught by:** CI on the round 3 pull request.
- **Led to:** A fix, plus a CI switch that runs the spec once with UTC a day ahead of the person.

### F-070 · 2026-10-29 · build tool (advising thread)
- **Asked:** Advise the build sessions through the day's setup fix rounds.
- **What went wrong:** Three wrong calls in one day: it called a schema failure a rule failure, it had backwards which parts of setup the model writes and which the code writes, and it put a grammar slip into a paste.
- **Why:** It answered from its picture of the system instead of checking the diagnosis and the code first, and it did not reread a paste before sending it.
- **Caught by:** The build session's diagnosis, the owner's question and the owner's review.
- **Led to:** No rule; noted.

### F-071 · 2026-10-29 · build tool (coordinator thread)
- **Asked:** Keep the project's quick-links page current.
- **What went wrong:** It listed a finished thread under "open threads".
- **Why:** "Open" was not defined, so a thread that had finished stayed on the list.
- **Caught by:** The owner.
- **Led to:** A rule: list only threads that are working, blocked or waiting for review.

### F-072 · 2026-10-30 · build tool
- **Asked:** Build the weekly review's finish button (MOM-113) and the light / dark / system control (MOM-30), each with a component test of its failure path.
- **What went wrong:** The day-end's full `npm test` failed one review test: the error showed while the button still read "Saving…". The file passed when run alone. The theme control had the same pattern: the alert and the choice put back could show while its buttons were still disabled.
- **Why:** Both set state after an `await` inside a transition's start function. In React 19 that update is not part of the transition, so it can render before the pending flag clears. The tests waited for the error, not for the settled state (the button ready again), so they passed in the block and failed only under the full run's load. The same pattern sits at 10 more call sites on `main`.
- **Caught by:** The day-end's step A full test run.
- **Led to:** A fix in this session (MOM-113, MOM-30: the update after the `await` is wrapped in the start function again, and the tests wait for the ready button), and MOM-147 for the 10 call sites on `main`.

### F-073 · 2026-10-30 · build tool (advising thread)
- **Asked:** Review the screenshots of the quick path's fill-in (MOM-111).
- **What went wrong:** The review covered layout and missed the reading problems the owner saw at once: the recap repeated what was said, the gaps were not called out as gaps, the ending trapped the person, and the chosen answer's button was ambiguous.
- **Why:** It looked at pixels before reading the words as the person who meets the screen.
- **Caught by:** The owner.
- **Led to:** A rule: a screen review reads the words top to bottom as a tester first and checks layout second, and Claude pre-reviews the screenshots that way before the owner sees them.

### F-074 · 2026-10-31 · build tool
- **Asked:** Make dark mode less olive (MOM-145).
- **What went wrong:** The first fix removed the colour along with the olive; the owner's word was that it "lost all color".
- **Why:** It fixed the symptom by taking away the thing the change was for.
- **Caught by:** The owner.
- **Led to:** A fix in this session (unchosen choices outlined in lime, the chosen one solid lime).

### F-075 · 2026-10-30 · build tool
- **Asked:** Report the setup transcript bound (MOM-111).
- **What went wrong:** The close-out said the bound was 122 messages while the code worked out 162 (82 plus 2 for each of 40 items).
- **Why:** It reported what the bound was meant to be, not what the code computed.
- **Caught by:** The advising thread.
- **Led to:** A fix in this session (`MAX_FILL_INS` 20, so the bound is 122, and a test pins it).

### F-076 · 2026-10-31 · build tool
- **Asked:** Report the block's build time (MOM-145).
- **What went wrong:** The close-out first gave a made-up "95 min".
- **Why:** It filled a required field with a guess instead of saying the time was not measured.
- **Caught by:** The build tool itself, before the comment was final.
- **Led to:** A fix in this session (the line says "not measured" when the block was not timed).

### F-077 · 2026-10-31 · build tool
- **Asked:** Decide when a change made from the weekly review takes effect (MOM-146).
- **What went wrong:** The first rule skipped the week that had just started, so a review on Saturday said the change starts the Saturday after, against `docs/DOMAIN_MODEL.md`'s "change next week".
- **Why:** It designed from the code's period logic, not from the binding doc.
- **Caught by:** The advising thread.
- **Led to:** A fix in this session: a change takes effect from the period right after the reviewed one, and never in a closed one.

### F-078 · 2026-10-31 · build tool
- **Asked:** Give every signed-in page a way home and Sign out on a phone (MOM-148).
- **What went wrong:** The back row put a Sign out button inside `<main>` on five pages, and three browser tests already on `main` (the review's end and finished review, the plan with no time zone) say those pages have nothing to tap. The block ran only its own header spec, so CI's full run would have gone red on the pull request.
- **Why:** It checked the spec it wrote, not the specs of the pages it changed; with the full local suite out of reach on this machine, "CI is the gate" was read as "nothing else to run", although CI runs only after the day-end push.
- **Caught by:** Day-end step A, running the affected specs on the branches stacked in merge order.
- **Led to:** A fix in this session (the row is page navigation before `<main>`, owner's choice), and the step A practice noted on MOM-124.

### F-079 · 2026-10-31 · build tool
- **Asked:** Test the theme control's choices (MOM-30), the same family as F-072.
- **What went wrong:** The test tapped a second choice while the first save's transition was still pending, so the disabled button dropped the tap. It failed in a full run and passed alone, twice now (MOM-111's block saw it on 2026-10-30 and called it load-dependent).
- **Why:** The test waited for the save to be called, not for the settled state; F-072's fix added the settled wait to the failure test only, not to this one.
- **Caught by:** Day-end step A's full run.
- **Led to:** A fix in this session (the test waits for the buttons to be ready), recorded on MOM-147.

### F-080 · 2026-10-30 · build tool
- **Asked:** Fix conflicting project memory notes.
- **What went wrong:** The thread proposed pinning only its new lines to the top of an oversized note, which would have favoured them over equally hidden older lines.
- **Why:** It fixed the symptom for its own edits instead of the note's size.
- **Caught by:** The owner.
- **Led to:** A rule: a monthly memory size check (fixed in that session).

### F-081 · 2026-11-01 · build tool
- **Asked:** Start the build day.
- **What went wrong:** The thread named the working folder in code formatting above the pastes, and the owner pasted it into the shell as a command.
- **Why:** A label looked the same as a paste.
- **Caught by:** The owner (a shell error).
- **Led to:** A rule: say where a paste goes as plain text, and start every session's pastes with the folder change as its own paste.

### F-082 · 2026-11-01 · build tool
- **Asked:** Build two new screens and run the browser specs of every page the block changes.
- **What went wrong:** The block added two pages and ran only the specs of the pages it changed, not the 390px header sweep, whose guard fails for any page missing from its list. The guard failed at the day-end.
- **Why:** The rule "run the specs of every page you change" reads as the changed pages' own specs; a spec that sweeps every page is not one of them, so a new page never brings it in.
- **Caught by:** Day-end step A, the browser specs on the stacked branches.
- **Led to:** A fix in this session (the two pages added to the sweep, MOM-138) and a rule: a block that adds a page runs the 390px header sweep too (backlog item, MOM-124).

### F-083 · 2026-11-01 · build tool
- **Asked:** Design the conversation for a person adding a goal after setup.
- **What went wrong:** The first design marked one setup part as already approved for a returning person, which an existing check (no change to a part after it is approved) would have rejected on every turn.
- **Why:** The design was written from the feature's intent before reading the checks the conversation already runs.
- **Caught by:** The build agent, reading the checks before building.
- **Led to:** A fix in this session (the design changed before code, MOM-132).

### F-084 · 2026-11-01 · build tool
- **Asked:** Show the playback for a goal being added after setup.
- **What went wrong:** The playback kept its first-setup title, which describes the person's days and weeks, when an addition plays back only how the new goal is tracked.
- **Why:** The shared card was reused without checking each of its words against the new case.
- **Caught by:** The new browser spec.
- **Led to:** A fix in this session (a title for an addition, MOM-132).

### F-085 · 2026-11-01 · build tool
- **Asked:** Check a live run's saved rows against what the person approved.
- **What went wrong:** The live harness reported fewer saved sources than approved. The save was right: the harness read a column the table does not have, so its query returned nothing.
- **Why:** The read-back query was written from memory of the schema, not the migration.
- **Caught by:** The live run's own report, then checking the save directly.
- **Led to:** A fix in this session (the harness query, MOM-132).

### F-086 · 2026-11-01 · build tool
- **Asked:** Make the MOM-120 review sites wait for the page refresh before moving on.
- **What went wrong:** The advising thread told the build to wait for the end of a streamed page response, which the browser can't observe, so the helper hung in 5 of 7 tests.
- **Why:** The wait condition was proposed without checking that the browser exposes it.
- **Caught by:** The build stopping on timeouts.
- **Led to:** A fix in this session (plan spec fix only, review sites reverted) and the app-side settled-marker follow-up on MOM-120.

### F-087 · 2026-11-01 · build tool
- **Asked:** Build MOM-132 part 2 using the screen words approved on the previous build day.
- **What went wrong:** The approved words existed only in chat, so they were gone after /clear and had to be recovered from another thread.
- **Why:** Approvals were never written anywhere durable.
- **Caught by:** The build asking for the words at its design stop.
- **Led to:** A rule: approved screen words go verbatim into the ticket's Jira comment at the design stop.

### F-088 · 2026-11-01 · build tool
- **Asked:** Phone pushes at every planned stop.
- **What went wrong:** The /day-start reminder said the "push when actions required" setting sends stops to the phone (it covers only permission prompts and questions), and no command asked for a push.
- **Why:** Setting behaviour assumed, not checked.
- **Caught by:** The owner getting no pushes.
- **Led to:** A fix in this session (f4f975f, MOM-124), confirmed working.

### F-089 · 2026-11-01 · build tool
- **Asked:** Profile changes for a public professional profile.
- **What went wrong:** Proposed profile features that the platform doesn't support.
- **Why:** Platform features asserted from memory.
- **Caught by:** The owner while applying them.
- **Led to:** A fix in this session, and a rule: check platform features against the live site or its help pages before proposing them.

### F-090 · 2026-11-01 · build tool
- **Asked:** Hand off a multi-part block into the build plan.
- **What went wrong:** The plan kept only the first part, and nothing flagged the cut.
- **Why:** The thread handing it off never checked the written plan against its handoff.
- **Caught by:** The owner's rollout question.
- **Led to:** The PM docs upkeep block in tomorrow's plan (MOM-164), and a rule: whoever hands off a block checks the written plan against the handoff.

## In-product failures

The plan generator and rebalance have passed their live smoke tests. Their failure paths are not yet tested in production (see `docs/RAID_LOG.md` I-01).

### F-064 · 2026-10-29 · in-product
- **Asked:** Guided setup on production (MOM-111), the standing account's first run: after "Is getting in shape one goal for you, or does it break into several goals?", the person answered "2 goals".
- **What went wrong:** The setup stopped there. Claude's natural next question, naming the two goals, was treated by the skip-answered check as asking the topic again, so three replies in a row were thrown away (each logged as `{ category: 'rules', rules: ['skip_answered'] }`).
- **Why:** The check marks a topic answered as soon as one question on it got a reply, and only exempts clarifying turns (ideas, interpretations). A follow-up question on the same topic, right after the person answered, was not exempt. Step 3's prompt also never said to ask what the goals are, so the turn's topic tag was not fixed.
- **Caught by:** The production logs, after the owner's phone test.
- **Led to:** A fix in this session (MOM-111): a question on the same topic right after the person answered it counts as a follow-up, and step 3 now says to ask what the goals are as its own `breakup` question.

### F-065 · 2026-10-29 · in-product
- **Asked:** Guided setup on production (MOM-111), the standing account's first run: at a part's playback ("is this right?") the person tapped "Change something", then decided not to change anything.
- **What went wrong:** The screen offered only a text box with no way back, so they typed "nothing". Claude asked what they meant, and they replied "I don't want to change anything". Every reply after that was thrown away (9 rejections across 3 tries, all `{ category: 'rules' }` on `chunked_playback`, one also on `choice_before_examples`), and each try spent 3 Claude calls. 9 Claude calls were wasted and the person was stuck.
- **Why:** The change box had no "back" control. The approval check accepts a part only when Claude's previous turn is that part's playback and `acceptsText` reads the reply as a yes, and `acceptsText` rejects any message with "no", "not", "don't" or "change", so "no change" could not approve; after the clarifying question the previous turn was no longer the playback either. A thrown-away reply is asked for again with the same input, so the retries could not succeed.
- **Caught by:** The owner's phone test and the production logs.
- **Led to:** A fix in this session (MOM-111, branch feature/MOM-111-playback-no-change).

### F-066 · 2026-10-29 · in-product
- **Asked:** Guided setup on production (MOM-111), the owner's live run on a phone.
- **What went wrong:** The questions and the playback were not clear. Step 4 asked "what needs protecting" and the owner had to ask what it meant. Claude's clarifying replies were thrown away seven times (`skip_answered`), and an explanation with examples would also have broken `choice_before_examples`, so asking what a question means had no allowed answer and setup ended at Try again. The goals playback read "because To stay healthy for my family..", the person's words pasted in as typed, and the only way out of a change was a small "Never mind" link.
- **Why:** The build turned the two setup tabletops' judgment into hard rules and terse step summaries, and the rules forbade what made the tabletops clear: short examples inside a question, a few words on why it asks, a same-topic clarification, and a playback restated in the second person. The step summaries used the model's own words (protected, floor, block), which Claude repeated to the person.
- **Caught by:** The owner's phone test and the production logs.
- **Led to:** A fix in this session (MOM-111, branch feature/MOM-111-setup-clarity), and a new standing rule: the plain-language principle in `docs/DOMAIN_MODEL.md` §2.1 (everyday words with a reason and examples, playback restated not parroted, a way out of every change, "what do you mean?" always answered), enforced by tests on every step summary, example question and card.
