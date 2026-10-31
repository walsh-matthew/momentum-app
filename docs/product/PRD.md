Template: one-page PRD · Last updated: 2026-10-30 (this branch, after build day 6's merges) · Filled by: MOM-144 first fill · Open gaps: 13, listed at the end

# Momentum: product requirements

The binding rules are in [`docs/DOMAIN_MODEL.md`](../DOMAIN_MODEL.md). This page links to its sections and never copies its rules. The journeys it refers to (J1 to J5) are in [`USER_JOURNEYS.md`](USER_JOURNEYS.md).

## 1. Problem

*Sources: design record `docs/design/2026-10-26-goal-model-design.md` ("Purpose and status", §1.8); `docs/DOMAIN_MODEL.md` §1.8.*

People with a real goal (fitness, a job search, a deadline project) struggle to keep an honest view of progress across the tools they already use. The old Momentum model was career-only, built on checkbox lists and a fixed 13-week plan, and the owner's tabletop walk-throughs of fitness, career, two setup runs and a balance week showed it did not fit real goals. The replacement is a state engine in which the scoreboard is always computed from entries, never typed (`DOMAIN_MODEL.md` §1).

## 2. Users

*Sources: design record §5.2 and §5.3; `ROADMAP.md` ("Next: Goal Model Thin Slice"); Jira MOM-126.*

- **The owner,** who builds and uses Momentum for their own goals.
- **Household testers,** by role and in aggregate only: adults for the first trial (MOM-126 holds the safeguards before any under-18 user joins).
- **Round 2:** family members outside the house, after the first trial's fixes (design record §5.3).

Nothing personal about any tester goes in this repo (design record §5.2).

## 3. Goals and non-goals

*Sources: `docs/DOMAIN_MODEL.md` §1 and §4.3; design record §5.*

**Goals**

- A person can turn a vague idea into a structured, tracked goal through a short guided conversation, and approve each part (J1; `DOMAIN_MODEL.md` §2).
- Entries from the person's own word or a synced source are counted against targets, and the person's word beats any source (J2, J3; §1.5, §1.6).
- The person sees where they stand, computed by the engine, with Claude writing words and never scores or math (J5; §1.7).
- A layered weekly review turns the week into one change (J4; §3).

**Non-goals**

- Momentum does not edit the person's documents, write resumes, or coach focus and getting started (`DOMAIN_MODEL.md` §4.3). The one exception is templates it creates in the person's own Drive.
- Reminders sent outside the app, stretch levels and ceilings, dated capacity exceptions, standing merge rules, and household sharing are not in the thin slice (design record §6.1, "What's left out").

## 4. Success metrics

*Sources: design record §5 (criteria and pass bars); the first product review deck (https://claude.ai/artifact/EABm8qR3EfZSWeYF2HFfBK), criteria slide.*

Status is as of the 2026-10-30 product review (data from `main`, Oct 29). Pass bars were decided before any result, and changing one needs a written reason (design record §5).

| # | Criterion | Pass bar (design record §5) | Status |
| --- | --- | --- | --- |
| 1 | Setup works for someone else | Finishes, approves without heavy edits, says the time was useful. A heavy edit is a change to a target, level or source at playback (wording changes don't count); two or fewer per setup. | Pass on paper |
| 2 | Logging stays light | Each user says logging is not a chore, and no one silently stops logging a manual target for a whole week. Judged only where manual entry is the intended source; entering numbers by hand that already live in the person's own sheet is recorded separately and doesn't count against this bar. | Pass on paper |
| 3 | One vocabulary | The concepts (goal, target, the three kinds of work item, source, entry) must hold for every goal. A goal that needs a new kind of thing, or a rule that contradicts the model, is the fail to discuss. New fields are logged as learnings, not fails. | Pass on paper |
| 4 | Review changes a decision | Each person makes at least one real change across their reviews, and no more than two of the six reviews are skipped. | Partial |
| 5 | Buildable in N days | Inside N. N = 6 build days (decided 2026-10-29; `docs/plans/archive/2026-10-30.md` and `docs/plans/NEXT_BUILD_PLAN.md`: "The thin slice: N = 6"). | On track (day 5 of 6) |
| 6 | Still used after two weeks | Each is still using it at the end, by choice. | Not started |

What a fail means: criteria 2, 4 and 5 mean change that part; criteria 1, 3 and 6 test the core idea and a fail there could mean stop, decided together and written down (design record §5).

The statuses above are the deck's and have not been re-rated since. Since the review, the weekly review's layers 2 and 3 are on `main` (MOM-113 block 3.3, PR #79), so a review can now record a decision, but its "change" choice leads nowhere yet (Gap 8), and no tester has run a review.

Criterion 6 has no measure defined for "still using it" beyond the pass bar (Gap 1).

## 5. Requirements

*Sources: `docs/DOMAIN_MODEL.md` §1 to §4; `docs/LLM_GOVERNANCE.md`; design record §6.*

| Area | Requirement | Rules | Journey |
| --- | --- | --- | --- |
| Guided setup | One question at a time, plain words, nothing saved until approved, each part approved as it finishes | `DOMAIN_MODEL.md` §2 | J1 |
| Claude cost control | A per-setup budget in turns and tokens that fails closed to the quick path, one hard shared cap | §2.3; design record §6.2; `docs/LLM_GOVERNANCE.md` | J1 |
| Manual entry | Tap, number, timer, checklist tick; corrections survive a resync | §1.5, §1.6 | J2 |
| Sources | Synced sources confirm their own records; the person binds each source to a target | §1.5 | J3 |
| Scoreboard | Computed per target from entries and the target in force; Claude never scores | §1.3, §1.7 | J5 |
| Week plan and forecast | The person picks items onto their days; a deadline forecast is a fact about the days set aside | §1.4 | J5 |
| Weekly review | Recap always, reflection offered, one adjustment (all three are on `main` since PR #79) | §3 | J4 |
| Settings | "How Momentum talks to me"; defaults visible and editable | §4.1 | J1, J4 |
| Principles | Never assume anything about a person's life; the person's word beats any source | §4.2 | all |

On `main` today, Settings holds Account and Appearance only: the theme choice (light, dark or match the device; MOM-30, PR #72), with the rest of "How Momentum talks to me" still to build (MOM-114, planned as defaults only for the trial). Home offers guided setup to a person with no saved setup, in place of the old "No goals yet" card (MOM-143, PR #78).

## 6. Release plan

*Sources: design record §5, §5.3 and §6.1; `docs/plans/archive/2026-10-30.md` and `docs/plans/NEXT_BUILD_PLAN.md` ("The thin slice: N = 6"); the deck's "Next" slide; Jira MOM-122, MOM-123, MOM-126.*

| Stage | What | Go/no-go criteria |
| --- | --- | --- |
| Thin slice | The smallest build that lets three people run criteria 1 to 4 for real. N = 6 build days. Build day 6 closed on 2026-10-30 with its branches merged to `main` (PRs #72 to #80); the deck, as of Oct 29, says 5 of 6. `docs/plans/NEXT_BUILD_PLAN.md` plans a build day 7 after N = 6 (Gap 13). | Criterion 5 (inside N) |
| Family trial | The owner and household testers use it for their own real goals, about two weeks (extended only if needed). Adults only. Trial prerequisites in Jira include the auth email (MOM-122), the production sign-up walk (MOM-123) and warmer, clearer auth emails (MOM-149). | Criteria 1, 2, 3, 4 and 6 |
| Round 2 | Family members outside the house, after the first trial's fixes. | Re-tests criterion 1 on the fixed version |

The deck asks the owner for the trial start date once day 6 closes. The build plan written at the 2026-10-30 day-end names Tue 2026-11-03 ("Build day 7 is the last build day before the family trial (Tue 2026-11-03)", `docs/plans/NEXT_BUILD_PLAN.md`); no other record of that decision was read for this update (Gap 2).

**Auth email.** The trial's email sender is live (owner, MOM-122 comment 2026-10-30): domain `ownaccordlabs.com`, Resend over SMTP, sender "Momentum" at `hello@ownaccordlabs.com`, with SPF, DKIM and DMARC passing. The password-reset link is now a token link that opens in any browser, guarded by a 15-minute signed cookie (MOM-122, PR #74); it needs `RECOVERY_COOKIE_SECRET` in Vercel (the owner has set it) and the dashboard template paste after the deploy. The hourly email limit is still to be recorded on MOM-122.

## 7. Risks and open questions

*Sources: `CLAUDE.md` (RAID and failure logs rule); Jira (the query below, run 2026-10-30); the deck's "Needs a decision" list; design record §6.2.*

**Risks** are Jira tickets with the `risk` label, not rows in `docs/RAID_LOG.md` (frozen since MOM-133). The query, run at the first day-end of each week:

`project = MOM AND labels = risk AND status NOT IN (Done, Closed) ORDER BY priority DESC, updated DESC`

On 2026-10-30 it returned 16 open tickets, all at Medium priority. They include the weekly review (MOM-113), guided setup (MOM-111), manual entry (MOM-110) and the auth email (MOM-122). That count was taken before build day 6's merges and has not been re-run for this update.

**Open questions**

| Question | Owner (role) | Source |
| --- | --- | --- |
| When does the family trial start? | the owner | the deck's "Needs a decision" |
| Does the remaining setup polish block the trial, or ship during it? | the owner | the deck's "Needs a decision" |
| What is the hourly email limit for trial sign-up and reset emails? (read it from Authentication, Rate Limits; record the number on MOM-122) | the owner | Jira MOM-122 comment 2026-10-30 |
| What is each journey's satisfaction question? | the owner | `USER_JOURNEYS.md` Gap 1 |
| What is the margin on the per-setup budget numbers, once live runs set them? | the owner approves | design record §6.2 step 2; `docs/LLM_GOVERNANCE.md` |

## 8. Change log

*Sources: this first fill.*

| Date | Change | Ticket |
| --- | --- | --- |
| 2026-10-30 | First fill from the repo, the design record, Jira and the first product review deck. | MOM-144 |
| 2026-10-30 | Brought up to date with build day 6's merges: light and dark theme (PR #72), setup round 3d (PR #73), the token reset link (PR #74), the 390px header (PR #80), review layers 2 and 3 and the finished review (PR #79), the setup link on home (PR #78); the email sender is live (MOM-122 comment); new gaps MOM-145 to MOM-149. | MOM-144 |

## Open gaps

*Sources: the sections above.*

1. Criterion 6 ("still used after two weeks") has no measure defined beyond its pass bar; the trial cannot start without one (found by the first product review).
2. The trial start date appears only in the build plan (Tue 2026-11-03); the deck's question to the owner has no recorded answer. (The custom sender and domain part of this gap closed: the sender is live, MOM-122 comment 2026-10-30.)
3. The design record §6.1 still says N = 5; the change to N = 6 is recorded only in the build plans (`docs/plans/archive/2026-10-30.md`, `docs/plans/NEXT_BUILD_PLAN.md`). This block does not edit the design record.
4. The satisfaction question for each journey is not written (`USER_JOURNEYS.md` Gap 1).
5. The per-setup budget numbers (40 turns, 1,000,000 tokens) are placeholders; no 90th-percentile eval run has set them (`docs/LLM_GOVERNANCE.md`; `EVALS.md` Gaps).
6. The "62 PRs merged" figure on the deck has no checkable source in the repo (see the review note).
7. The status of criteria 1 to 4 is "on paper" or "partial": no tester has run setup, logging or a review yet, so no pass bar has a measured result.
8. The weekly review's "Yes, I want to change it" only records the choice: nothing in the app edits a target, a priority or a goal's clash handling after setup. Criterion 4 asks each person to make at least one real change across their reviews, and the review cannot make one (MOM-146; `USER_JOURNEYS.md` Gap 21).
9. The dark theme looks flatter since the one-surface cards of MOM-30: a darker card fill, a solid lime primary action and dark control borders at 3:1 are planned before the trial (MOM-145; `USER_JOURNEYS.md` Gap 3).
10. On a phone, only home, Connections and Settings have a way to sign out and a way home; the other signed-in pages have neither, and `/review` has no navigation link (MOM-148; `USER_JOURNEYS.md` Gap 2).
11. Sign-up and password-reset emails are not yet warm and clear (who they are from, why the person got them, one button and the plain link, what happens if ignored), and `/privacy` does not yet name the email provider (MOM-149).
12. Ten controls on `main` update their message outside the pending state after a wait, so an error or result can show beside "Saving…" or a disabled button (MOM-147; failure log F-072; `USER_JOURNEYS.md` Gap 25).
13. `docs/plans/NEXT_BUILD_PLAN.md` plans build day 7 "after N = 6" before the trial, while criterion 5 is "inside N". How criterion 5 is judged with a seventh day is not recorded (found by this update; owner to decide).
