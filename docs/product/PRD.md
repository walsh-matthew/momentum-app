Template: one-page PRD · Last updated: 2026-10-30 (this branch) · Filled by: MOM-144 first fill · Open gaps: 7, listed at the end

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
| Weekly review | Recap always, reflection offered, one adjustment | §3 | J4 |
| Settings | "How Momentum talks to me"; defaults visible and editable | §4.1 | J1, J4 |
| Principles | Never assume anything about a person's life; the person's word beats any source | §4.2 | all |

## 6. Release plan

*Sources: design record §5, §5.3 and §6.1; `docs/plans/archive/2026-10-30.md` and `docs/plans/NEXT_BUILD_PLAN.md` ("The thin slice: N = 6"); the deck's "Next" slide; Jira MOM-122, MOM-123, MOM-126.*

| Stage | What | Go/no-go criteria |
| --- | --- | --- |
| Thin slice | The smallest build that lets three people run criteria 1 to 4 for real. N = 6 build days. Today is build day 6 per `docs/plans/NEXT_BUILD_PLAN.md`; the deck, as of Oct 29, says 5 of 6. | Criterion 5 (inside N) |
| Family trial | The owner and household testers use it for their own real goals, about two weeks (extended only if needed). Adults only. Trial prerequisites in Jira include the auth email (MOM-122) and the production sign-up walk (MOM-123). | Criteria 1, 2, 3, 4 and 6 |
| Round 2 | Family members outside the house, after the first trial's fixes. | Re-tests criterion 1 on the fixed version |

The trial start date is undecided (Gap 2). The deck asks the owner for it once day 6 closes.

## 7. Risks and open questions

*Sources: `CLAUDE.md` (RAID and failure logs rule); Jira (the query below, run 2026-10-30); the deck's "Needs a decision" list; design record §6.2.*

**Risks** are Jira tickets with the `risk` label, not rows in `docs/RAID_LOG.md` (frozen since MOM-133). The query, run at the first day-end of each week:

`project = MOM AND labels = risk AND status NOT IN (Done, Closed) ORDER BY priority DESC, updated DESC`

On 2026-10-30 it returned 16 open tickets, all at Medium priority. They include the weekly review (MOM-113), guided setup (MOM-111), manual entry (MOM-110) and the auth email (MOM-122).

**Open questions**

| Question | Owner (role) | Source |
| --- | --- | --- |
| When does the family trial start? | the owner | the deck's "Needs a decision" |
| Does the remaining setup polish block the trial, or ship during it? | the owner | the deck's "Needs a decision" |
| What domain and custom sender will trial sign-up email use? | the owner | Jira MOM-122, MOM-123 |
| What is each journey's satisfaction question? | the owner | `USER_JOURNEYS.md` Gap 1 |
| What is the margin on the per-setup budget numbers, once live runs set them? | the owner approves | design record §6.2 step 2; `docs/LLM_GOVERNANCE.md` |

## 8. Change log

*Sources: this first fill.*

| Date | Change | Ticket |
| --- | --- | --- |
| 2026-10-30 | First fill from the repo, the design record, Jira and the first product review deck. | MOM-144 |

## Open gaps

*Sources: the sections above.*

1. Criterion 6 ("still used after two weeks") has no measure defined beyond its pass bar; the trial cannot start without one (found by the first product review).
2. The trial start date is undecided, and trial sign-up email needs a custom sender, which needs a domain decision (MOM-122, MOM-123).
3. The design record §6.1 still says N = 5; the change to N = 6 is recorded only in the build plans (`docs/plans/archive/2026-10-30.md`, `docs/plans/NEXT_BUILD_PLAN.md`). This block does not edit the design record.
4. The satisfaction question for each journey is not written (`USER_JOURNEYS.md` Gap 1).
5. The per-setup budget numbers (40 turns, 1,000,000 tokens) are placeholders; no 90th-percentile eval run has set them (`docs/LLM_GOVERNANCE.md`; `EVALS.md` Gaps).
6. The "62 PRs merged" figure on the deck has no checkable source in the repo (see the review note).
7. The status of criteria 1 to 4 is "on paper" or "partial": no tester has run setup, logging or a review yet, so no pass bar has a measured result.
