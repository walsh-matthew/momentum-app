# Momentum RAID Log

Risks, assumptions, issues and dependencies for Momentum, each with an owner, a trigger and a response. The **NIST** column maps each row to a NIST AI Risk Management Framework function (Govern, Map, Measure, Manage), so a formal risk register can be built from this log later.

**How this log is kept**

- The build agent (Claude Code, or a project thread) drafts new rows when work turns one up, marked `unreviewed`. The owner approves, edits or drops them in plain language at day-end; see the day-end step in `docs/plans/NEXT_BUILD_PLAN.md`. Nothing is committed unreviewed.
- **This repository is public.** Rows describe a category of risk, not its location: no table, column, function, endpoint, environment-variable or key names, no exploit steps, no personal data, and no names (owners are roles). Specifics live in Jira.
- A response that needs build work gets a `BACKLOG.md` item and a Jira key, and the row points to that key. This log does not track work on its own.
- Owner roles: **Owner** (the product owner, who makes the call) and **Build agent** (Claude, which drafts and implements).
- Status: `open`, `mitigated` (controls in place, still watched), `closed`.

Seeded 2026-10-23 (MOM-92) from the project's build sessions. The owner reviews the seed rows in the pull request that adds this file.

## Risks

| ID | Risk | NIST | Owner | Trigger | Response | Status | Jira |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R-01 | **Privacy: user goal data.** Goals and tasks describe personal aims (careers, health, family). A gap in per-user isolation would expose one user's plans to another. | Manage | Owner | Any new table, query path or background job that reads user data. | Every table is isolated per user at the database layer and reached only through the service layer; isolation is checked by the database verification scripts after each migration. Run those checks in CI. | mitigated | MOM-67 |
| R-02 | **Privacy: stored third-party tokens.** Connected-app access and refresh tokens are protected by platform encryption at rest and database permissions, but not by app-level encryption. | Manage | Owner | First real user connects a provider. | Add app-level encryption for stored secrets before inviting real users; request read-only scopes; delete tokens when a user disconnects. | open | MOM-70 |
| R-03 | **Privacy: health data.** Workout and future health-platform data is a sensitive category, and users may not expect it to shape their plans. | Map | Owner | First health integration ships. | Store only the activity summary velocity needs, never raw biometrics; give users a delete path; publish a privacy notice before real users. | open | — |
| R-04 | **Privacy: user data sent to a third-party model.** Goal and task text is sent to the Claude API to plan and rebalance. | Govern | Owner | Any new prompt that includes user data. | Send the minimum fields a prompt needs; never send tokens or health detail; confirm the provider's data-use terms and state them in the privacy notice. | open | — |
| R-05 | **Model output breaks a product invariant**, for example a rebalance that deletes work or marks a task done. *Revised 2026-10-26 (`unreviewed`):* under the new goal model (`docs/DOMAIN_MODEL.md`), synced sources may complete work automatically, so the old safeguard (the database refuses any completion not made by the user) is being replaced. | Measure | Build agent | A prompt, model or schema change; the build that retires the old completion rule. | Until that build, the old safeguard stays. After it: completion follows each target's mode, auto-completion comes only from a source the person bound and is always shown and undoable, the model never writes completion or numbers (it writes words around engine facts), setup drafts must pass schema validation, and the engine's rules are covered by unit tests. Re-run the invariant tests on any prompt or model change. | open | MOM-115 |
| R-06 | **Model cost runs away.** Each click on a planning or rebalance feature makes a paid model call, and the rate limit resets per server instance. | Manage | Owner | Before inviting any real user. | Durable rate limits, usage logging and a spend cap ship before invites. | open | MOM-73 |
| R-07 | **Unreviewed changes reach production.** Changes merge and push to the main branch directly, with no CI. | Manage | Owner | Each day-end push. | CI on every push, then branch protection so production changes go through pull requests. | open | MOM-67 |
| R-08 | **Sensitive detail leaks through the public repo**: personal data, security specifics or secrets in docs and commits. | Govern | Owner | Any commit to docs, logs or seed data. | Repo rules in `CLAUDE.md` and `docs/NINETY_DAY_PLAN_CONTEXT.md` §11, the generality rule above, and ignored environment files. | mitigated | MOM-68 |
| R-09 | **The AI build tool reports work as done or verified when it is not** (see `docs/FAILURE_LOG.md`). | Measure | Owner | A ticket is closed or a status is reported. | Every block ends with a verification gate the owner checks; a "done" claim must name the check that proves it; live checks run after each push. | open | — |
| R-10 | **Automated sync code acts for a user with no signed-in session and with database access that skips per-user protection**, so a mistake could write into the wrong person's plan. | Manage | Owner | Any new automated entry point, such as a notification endpoint or a scheduled sync. | The user id comes only from verified credentials and every query is keyed on it; tests switch per-user protection off to prove the code isolates users itself; the first real run is checked by hand before more entry points are added. | open | MOM-98 |
| R-11 | **Privacy: how long Claude usage records are kept.** Every Claude call leaves a record of who made it, which feature, how many tokens it used, how long it took and how it ended, but never the question or the answer. Nothing deletes old records, so a person's pattern of use stays tied to their account for as long as it exists. | Govern | Owner | Before real users are invited, or when the privacy notice is written. | Decide a retention period, delete older records on a schedule, and state it in the privacy notice. The records already go when an account is deleted. | open | MOM-101 |
| R-12 | **Synced data miscounts against a target** (`unreviewed`): duplicates, the wrong period or the wrong target, so the scoreboard shows progress that didn't happen or misses progress that did. | Measure | Build agent | Any new adapter, a change to the counting engine, or a time-zone or week-boundary change. | Corrections are keyed to the source's own record so a resync never undoes them; possible duplicates are suggested for merge, never merged silently; anything inferred is labelled with one-tap undo; the person's word beats any source; engine rules have unit tests. | open | MOM-108, MOM-109 |
| R-13 | **Guided setup infers wrongly about a person's life** (`unreviewed`): it assumes days, times or a schedule the person never gave, and saves a plan built on that. | Measure | Build agent | Any change to the setup prompt or model, including a move to a smaller model. | Hard rules in the prompt; an eval set checks every turn automatically (one question, no time or day words the person didn't say, no announced reminders); playback is rendered from the validated draft; nothing is saved without approval. | open | MOM-111 |
| R-14 | **A minor takes part in the family trial** (`unreviewed`). Services have age terms, and a minor's data needs extra care. | Govern | Owner | Before the trial starts. | Parental consent plus the minor's own assent, with the right to quit at any time; check every service's age terms first; no connected accounts at the start; minimal data; no tester sees another's data; nothing personal about any tester in the repo. | open | MOM-116, MOM-102 |

## Assumptions

| ID | Assumption | NIST | Owner | Trigger to revisit | Response if wrong | Status |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | One owner uses the product today; production holds a single standing test account. | Map | Owner | The first real user signs up. | Revisit R-01 to R-06 and the abuse protections before inviting anyone. | open |
| A-02 | Calendar access in the provider's testing mode is enough for the prototype. | Map | Owner | Anyone outside the test-user list needs to connect. | Complete the provider's app verification, which needs a verified domain. | open |
| A-03 | Velocity derived from ticks and carry-over (not logged hours) reflects real workload. | Measure | Owner | Feedback from the first users. | Add signals such as review notes and skipped days. *2026-10-26 (`unreviewed`): superseded. Velocity is retired in favour of a scoreboard per target; time is now a valid measure (`docs/DOMAIN_MODEL.md`).* | closed |
| A-04 | Platform encryption at rest is acceptable for stored secrets at prototype stage. | Govern | Owner | First real user connects a provider. | See R-02. | open |
| A-05 | The calendar integration was built from the provider's documentation, not from a recorded real response, so its mapping may differ from what a real calendar returns. | Map | Build agent | The first real calendar sync. | Record a redacted real response, add it as a test fixture, and correct the mapping (MOM-99). | open |

## Issues

| ID | Issue | NIST | Owner | Trigger | Response | Status | Jira |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I-01 | The model failure paths (wait message, Try again, starter plan) have never run in production. | Measure | Build agent | — (current) | Browser tests cover them against a local stack. | open | MOM-61 |
| I-02 | The plan week can be off by one around midnight for users outside UTC. | Measure | Build agent | — (current) | Store the user's time zone or week boundary explicitly. *2026-10-26 (`unreviewed`): MOM-45 is Closed. The new model has each person set their own time zone, week start and day end; the issue stays open until the old plan-week code is retired.* | open | MOM-107, MOM-115 |
| I-03 | Database rule checks run by hand against production, not in CI. | Manage | Build agent | — (current) | Run them in CI against a disposable database. | open | MOM-67 |
| I-04 | **A failed data load is shown as an empty account.** When the plan cannot be read, the home screen tells a user who has goals that they have none and invites them to start one. | Manage | Build agent | — (current) | Add a distinct "could not load" screen with a retry and no goal prompt. | open | MOM-93 |
| I-05 | **One provider has no way to register a notification subscription automatically**, and authenticates it with a fixed value the user chooses, so a user must set it up by hand with a secret we issue. | Map | Build agent | Building the notification endpoints. | Explain the steps on the connect screen, store only a hash of the secret, and re-check the provider's documentation then in case that has changed. | open | MOM-98 |

## Dependencies

| ID | Dependency | NIST | Owner | Trigger | Response | Status |
| --- | --- | --- | --- | --- | --- | --- |
| D-01 | Claude API: availability, pricing and model lifecycle. | Map | Owner | An outage, price change or model retirement. | Planning features fall back to a starter plan with a clear message; model ids live in one config. | open |
| D-02 | Supabase: authentication and the database. | Map | Owner | An outage or a CLI change. | Migrations and verify scripts are in the repo, so the database can be rebuilt. | open |
| D-03 | Vercel: hosting and deploys. | Map | Owner | A failed deploy. | Day-end live checks catch it; redeploy the previous build. | open |
| D-04 | Third-party fitness and calendar APIs: access terms, docs and sample data. | Map | Owner | Building or changing an adapter. | No adapter is built without the provider's docs or a redacted sample response. | open |
| D-05 | The owner's AI usage budget sets build pace. | Manage | Owner | Usage passes about 55 to 60% before the weekly reset. | Prioritize recurring processes, then split build blocks across days. | open |
