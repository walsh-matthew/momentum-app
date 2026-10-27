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

## In-product failures

None recorded yet. The plan generator and rebalance have passed their live smoke tests. Their failure paths are not yet tested in production (see `docs/RAID_LOG.md` I-01).
