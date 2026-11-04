Template: one-page PRD · Last updated: 2026-11-02 (`main` at 355bb8c, after pull requests #82 to #115; third day-end step D of the day) · Filled by: MOM-144 first fill, kept current by MOM-164 · Open gaps: 12, listed at the end

# Momentum: product requirements

The binding rules are in [`docs/DOMAIN_MODEL.md`](../DOMAIN_MODEL.md). This page links to its sections and never copies its rules. The journeys it refers to (J1 to J5) are in [`USER_JOURNEYS.md`](USER_JOURNEYS.md). This page is non-binding, names its sources in each section, and holds no prices, cost figures or thresholds: those live outside the repo (`tests/pm-docs-sources.test.ts` checks the sources, MOM-164).

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

*Sources: design record `docs/design/2026-10-26-goal-model-design.md` §5 (criteria and pass bars; criterion 7 added by PR #82, MOM-105); the first product review deck (https://claude.ai/artifact/EABm8qR3EfZSWeYF2HFfBK), criteria slide; `components/review/targetChangeWording.ts`; PRs #79, #91 and #92.*

Status is as of the 2026-10-30 product review (data from `main`, Oct 29). Pass bars were decided before any result, and changing one needs a written reason (design record §5).

| # | Criterion | Pass bar (design record §5) | Status |
| --- | --- | --- | --- |
| 1 | Setup works for someone else | Finishes, approves without heavy edits, says the time was useful. A heavy edit is a change to a target, level or source at playback (wording changes don't count); two or fewer per setup. | Pass on paper |
| 2 | Logging stays light | Each user says logging is not a chore, and no one silently stops logging a manual target for a whole week. Judged only where manual entry is the intended source; entering numbers by hand that already live in the person's own sheet is recorded separately and doesn't count against this bar. | Pass on paper |
| 3 | One vocabulary | The concepts (goal, target, the three kinds of work item, source, entry) must hold for every goal. A goal that needs a new kind of thing, or a rule that contradicts the model, is the fail to discuss. New fields are logged as learnings, not fails. | Pass on paper |
| 4 | Review changes a decision | Each person makes at least one real change across their reviews, and no more than two of the six reviews are skipped. | Partial |
| 5 | Buildable in N days | Inside N. N = 6 build days (decided 2026-10-29; `docs/plans/archive/2026-10-30.md` and `docs/plans/NEXT_BUILD_PLAN.md`: "The thin slice: N = 6"). | On track (day 5 of 6) |
| 6 | Still used after two weeks | Each is still using it at the end, by choice. | Not started |
| 7 | Cost per user | Raised for discussion with the owner, never a cutoff on its own (design record §5). The figures are not kept in this repo. | Not rated |

What a fail means: criteria 2, 4 and 5 mean change that part; criteria 1, 3 and 6 test the core idea and a fail there could mean stop, decided together and written down (design record §5). Criterion 7 is raised for discussion, not a verdict.

The statuses for criteria 1 to 6 are the deck's and have not been re-rated since. Since the review, the weekly review's layers 2 and 3 are on `main` (MOM-113 block 3.3, PR #79), and its "Yes, I want to change it" now edits a target's numbers from the next period (MOM-146, PR #91), so a review can make a real change to a target. It still changes nothing for a deadline forecast, a goal's priority or its clash handling (Gap 8). The review also asks "Still right for you?" about setup suggestions (MOM-113 block 3.4, PR #92). No tester has run a review.

Criterion 5's row is the deck's, written at day 5 of 6. The plan archive holds plans for 2026-11-01 (two) and 2026-11-02 after the day-6 close, so the row is stale (Gap 13).

Criterion 6 has no measure defined for "still using it" beyond the pass bar (Gap 1).

## 5. Requirements

*Sources: `docs/DOMAIN_MODEL.md` §1 to §4; `docs/LLM_GOVERNANCE.md`; design record §6; `lib/setup/addWords.ts`; `components/forecast/wording.ts`; `components/review/StillRightCard.tsx`; Jira MOM-111, MOM-113, MOM-132, MOM-138, MOM-146, MOM-148, MOM-149, MOM-150, MOM-163, MOM-165, MOM-173.*

| Area | Requirement | Rules | Journey |
| --- | --- | --- | --- |
| Create an account | Its own screen, then a plain "check your email" state; the confirmation and reset emails say who they are from, why, and what happens if ignored (MOM-149, MOM-150); a wrong password gets plain words that never say whether the address has an account, and the confirm link signs the person in from any browser (MOM-163) | none yet (auth is not in `DOMAIN_MODEL.md`) | J1 |
| Guided setup | One question at a time, plain words, nothing saved until approved, each part approved as it finishes; "What does this mean?" answered by code first, with Claude one tap further on the concept questions only (MOM-180) | `DOMAIN_MODEL.md` §2 | J1 |
| Adding after setup | A person can add a goal, or a target for a goal they have, through its own save; saved facts are skipped by name and never sent to Claude; a target added later starts counting on the day the person gives (MOM-132) | §1.3, §2.1 rule 5 | J1 |
| Claude cost control | A per-setup budget in turns and tokens that fails closed to a quick path the person can finish on the card (MOM-111), one hard shared cap, and a real per-person daily allowance that setup and the weekly review share, refused in plain words; every Claude call logs its cache-read and cache-write tokens beside input and output (MOM-165, migration 022), and since MOM-111 guided setup caches its fixed prompt and the conversation so far, with the per-setup budget counting all four token kinds; the numbers are in `docs/LLM_GOVERNANCE.md`, not here. Every try counts toward the person's allowance, retries included; for the trial it stays as it is (owner, 2026-11-02), and how retries should count is decided after the trial (MOM-173) | §2.3; design record §6.2; `docs/LLM_GOVERNANCE.md` | J1 |
| Manual entry | Tap, number, timer, checklist tick; corrections survive a resync | §1.5, §1.6 | J2 |
| Sources | Synced sources confirm their own records; the person binds each source to a target | §1.5 | J3 |
| Scoreboard | Computed per target from entries and the target in force; Claude never scores | §1.3, §1.7 | J5 |
| Week plan and forecast | The person picks items onto their days; a deadline forecast is a fact about the days set aside; the person can change a kind of day's usual time and a deadline task's size, steps and due date after setup (MOM-138) | §1.4 | J5 |
| Weekly review | Recap always, reflection offered, one adjustment or "Still right for you?" about setup suggestions (all on `main` since PRs #79 and #92); a change to a target's numbers takes effect from the next period (MOM-146) | §3, §3.2 | J4 |
| Settings | "How Momentum talks to me"; defaults visible and editable | §4.1 | J1, J4 |
| Phone navigation | Every signed-in page has a way home and Sign out at 390px (MOM-148) | none (layout) | all |
| Principles | Never assume anything about a person's life; the person's word beats any source | §4.2 | all |

On `main` today, Settings holds Account and Appearance only: the theme choice (light, dark or match the device; MOM-30, PR #72), with the rest of "How Momentum talks to me" still to build (MOM-114, planned as defaults only for the trial). Home offers guided setup to a person with no saved setup, in place of the old "No goals yet" card (MOM-143, PR #78), and, to a person with one, "Log an entry" as the main button with "Add to your goals" under it (MOM-132; MOM-167 part 14, pending merge). The old model's controls on home are hidden for the trial (MOM-115, PR #88).

## 6. Release plan

*Sources: design record §5, §5.3 and §6.1; `docs/plans/archive/2026-10-30.md` and `docs/plans/NEXT_BUILD_PLAN.md` ("The trial" and "The thin slice: N = 6"); `supabase/templates/confirmation.html`; `supabase/templates/recovery.html`; `components/auth/CreateAccountForm.tsx`; the deck's "Next" slide; Jira MOM-122, MOM-123, MOM-126, MOM-149, MOM-150, MOM-163, MOM-166, MOM-168, MOM-170, MOM-171, MOM-172, MOM-173, MOM-174.*

| Stage | What | Go/no-go criteria |
| --- | --- | --- |
| Thin slice | The smallest build that lets three people run criteria 1 to 4 for real. N = 6 build days. Build day 6 closed on 2026-10-30 with its branches merged to `main` (PRs #72 to #80); the deck, as of Oct 29, says 5 of 6. PRs #82 to #104 merged after that, so the build has run past N = 6 (Gap 13). | Criterion 5 (inside N) |
| Family trial | The owner and household testers use it for their own real goals, about two weeks (extended only if needed). Adults only. The auth email (MOM-122) and the production sign-up walk (MOM-123) are Done in Jira; the warmer auth emails (MOM-149) and the sign-up screen (MOM-150) are on `main`. | Criteria 1, 2, 3, 4 and 6 |
| Round 2 | Family members outside the house, after the first trial's fixes. | Re-tests criterion 1 on the fixed version |

The current plan (`docs/plans/NEXT_BUILD_PLAN.md`, "The trial", the owner's calendar of 2026-11-01) says the family trial starts Sat 2026-11-07, with a production freeze from Thu Nov 5 until after 10:30 am PT on Fri Nov 6; `BACKLOG.md` repeats the date. The deck's question to the owner has no other recorded answer (Gap 2).

**Auth email and sign-up.** The trial's email sender is live (owner, MOM-122 comment 2026-10-30): domain `ownaccordlabs.com`, Resend over SMTP, sender "Momentum" at `hello@ownaccordlabs.com`, with SPF, DKIM and DMARC passing. The password-reset link is a token link that opens in any browser, guarded by a 15-minute signed cookie (MOM-122, PR #74). Since MOM-149 (PR #90) the confirmation and reset emails say who they are from, why the person got them, give one button and the plain link, and say what happens if ignored; `/privacy` names the email provider. Since MOM-150 (PR #100) creating an account has its own screen and a clear "check your email" state. Since MOM-163 the confirmation link is a token link that opens in any browser, like the reset link; production sends it once its "Confirm sign up" template is pasted in the dashboard, before the Nov 5 freeze. The hourly email limit is an open question below.

**Before the trial.** The deadline-goal fix (MOM-166) is merged and the owner's production check passed on 2026-11-02, so Gap 16 is closed. Tue 2026-11-03 and Wed 2026-11-04 are test-and-fix days before the Nov 5 freeze. Tuesday fixes what the owner's phone test found: a quick-path dead end for a goal with no target (MOM-170), the iPhone date wheel answering with today (MOM-171), the quick path's date field at 390px (MOM-172), and a test for a wrong weekday with a right date (MOM-174), then the owner's phone rechecks; Wednesday takes whatever Tuesday's testing turns up. For the trial the per-person allowance stays as it is, retries included (MOM-173, decided after the trial; Gap 17).

## 7. Risks and open questions

*Sources: `CLAUDE.md` (RAID and failure logs rule); Jira (the query below, run 2026-11-02, and counted again at the second day-end that day); the deck's "Needs a decision" list; design record §5 (criterion 7, cost per user, raised for discussion) and §6.2.*

**Risks** are Jira tickets with the `risk` label, not rows in `docs/RAID_LOG.md` (frozen since MOM-133). The query, run at the first day-end of each week:

`project = MOM AND labels = risk AND status NOT IN (Done, Closed) ORDER BY priority DESC, updated DESC`

On 2026-11-02 it returned 16 open tickets, all at Medium priority (also 16 on 2026-10-30). They include adding a goal after setup (MOM-132), the weekly review (MOM-113), guided setup (MOM-111), manual entry (MOM-110) and retiring the old model (MOM-115); the auth email (MOM-122) is Done and no longer listed. Counted again at the second day-end of 2026-11-02: 17, the new one being MOM-169 (on an iPhone, a setup request left hanging after an app switch is never recovered; trial-facing, decided by the owner's phone check). Counted at the third day-end of 2026-11-02: 17 again, because MOM-169 closed (nothing hung on the owner's check) and MOM-173 is new and the only High (one bumpy setup can use a tester's whole daily allowance, because retries count toward it). Cost per user is raised as criterion 7 in the design record, not as a risk row here.

**Open questions**

| Question | Owner (role) | Source |
| --- | --- | --- |
| Is Sat 2026-11-07 the confirmed family trial start? (the plan says so) | the owner | `docs/plans/NEXT_BUILD_PLAN.md` ("The trial") |
| Does the remaining setup polish block the trial, or ship during it? | the owner | the deck's "Needs a decision" |
| What is the hourly email limit for trial sign-up and reset emails? (read it from Authentication, Rate Limits; record the number in Jira) | the owner | Jira MOM-122 comment 2026-10-30 |
| What is each journey's satisfaction question? | the owner | `USER_JOURNEYS.md` Gap 1 |
| What is the margin on the per-setup budget numbers, once live runs set them? | the owner approves | design record §6.2 step 2; `docs/LLM_GOVERNANCE.md` |

## 8. Change log

*Sources: this first fill (MOM-144); the MOM-164 catch-up (pull requests #82 to #104); day-end step D of 2026-11-02 (MOM-163, MOM-165, MOM-120, MOM-166); the second day-end step D of 2026-11-02 (MOM-166, MOM-167, MOM-168, MOM-169).*

| Date | Change | Ticket |
| --- | --- | --- |
| 2026-10-30 | First fill from the repo, the design record, Jira and the first product review deck. | MOM-144 |
| 2026-10-30 | Brought up to date with build day 6's merges: light and dark theme (PR #72), setup round 3d (PR #73), the token reset link (PR #74), the 390px header (PR #80), review layers 2 and 3 and the finished review (PR #79), the setup link on home (PR #78); the email sender is live (MOM-122 comment); new gaps MOM-145 to MOM-149. | MOM-144 |
| 2026-11-02 | Day-end step D: the sign-in words and the any-browser confirm link (MOM-163); a per-person allowance shared by setup and the review, and cache tokens in the usage log (MOM-165, migration 022); the review specs' settled marker changes no section (MOM-120); a deadline goal cannot finish setup on production (MOM-166, Gap 16). Gap 14 closed. Risk query re-run: 16 open. | MOM-164 |
| 2026-11-02 | Brought up to date with pull requests #82 to #104: cost per user as criterion 7, a link to the design record only (PR #82); the quick path that finishes on the card (PR #87); the old model hidden on home (PR #88); a way home and Sign out on every page (PR #89); warmer auth emails (PR #90); the review edits a target's numbers (PR #91) and asks "Still right for you?" (PR #92); adding after setup (PRs #94, #96, #99); the sign-up screen (PR #100); editing a kind of day's time and a deadline task (PR #101). Risk query re-run: 16 open. Tooling-only and test-only merges (#84, #93, #97, #98, #102 to #104) change no section. Sources lines checked by `tests/pm-docs-sources.test.ts`. | MOM-164 |
| 2026-11-02 | Second day-end step D: no pull request merged in its window; MOM-166 and MOM-167 updated their own sections on their branches. Risk query counted again: 17 open (MOM-169 is new). New journey gaps in `USER_JOURNEYS.md` (32 to 36: the rest of MOM-167, MOM-169) touch no PRD section. | MOM-164 |
| 2026-11-02 | Third day-end step D: PR #115 (the title-check fix that had broken every production setup) changes no section's words; the cost control row says retries count and stay so for the trial (MOM-173); "Before the trial" names the test-and-fix tickets (MOM-170 to MOM-172, MOM-174). Gap 16 closed (MOM-166's production check passed); Gaps 17 and 18 new. Risk query: 17 open. | MOM-164 |
| 2026-11-02 | Prompt caching for guided setup (MOM-111): the "Claude cost control" row now says the fixed prompt and the conversation so far are cached and the per-setup budget counts all four token kinds. No other section changes. | MOM-111 |

## Open gaps

*Sources: the sections above; `docs/product/USER_JOURNEYS.md` (Open gaps); `BACKLOG.md`; Jira MOM-163, MOM-166, MOM-170, MOM-173.*

Gap numbers stay as first assigned, so a number that is missing below was closed.

1. Criterion 6 ("still used after two weeks") has no measure defined beyond its pass bar; the trial cannot start without one (found by the first product review).
2. The trial start date (Sat 2026-11-07) appears in the plan and `BACKLOG.md`, but the deck's question to the owner has no other recorded answer. (The custom sender and domain part of this gap closed: the sender is live, MOM-122 comment 2026-10-30.)
3. The design record §6.1 still says N = 5; the change to N = 6 is recorded only in the build plans (`docs/plans/archive/2026-10-30.md`, `docs/plans/NEXT_BUILD_PLAN.md`). This update does not edit the design record.
4. The satisfaction question for each journey is not written (`USER_JOURNEYS.md` Gap 1).
5. The per-setup budget numbers are placeholders in `docs/LLM_GOVERNANCE.md`; no 90th-percentile eval run has set them (`EVALS.md` Gaps).
6. The "62 PRs merged" figure on the deck has no checkable source in the repo (see the review note).
7. The status of criteria 1 to 4 is "on paper" or "partial": no tester has run setup, logging or a review yet, so no pass bar has a measured result.
8. The weekly review's "Yes, I want to change it" edits a target's numbers from the next period, but changes nothing for a deadline forecast, a goal's priority or its clash handling. Criterion 4 asks each person to make at least one real change across their reviews, and a target's numbers are the one kind of change it can make (MOM-146, PR #91; `USER_JOURNEYS.md` Gap 21).
13. Criterion 5 is "inside N" with N = 6, but pull requests #82 to #104 merged after build day 6 closed and the deck's row says "day 5 of 6". How criterion 5 is judged with the later days is not recorded (found by the first update; owner to decide).
15. A person who set up with only due-date goals cannot set a week start, so cannot add a weekly or day-slot target after setup (`USER_JOURNEYS.md` Gap 26; MOM-159).
17. A tester whose setup is bumpy (thrown-away replies, resends, Try again) can use the whole per-person allowance in one setup and be sent to the quick path early; the standing smoke-test account did on 2026-11-02 (100 calls in 24 hours). Criterion 1 measures finishing setup, so a tester may finish on the quick path for this reason (`USER_JOURNEYS.md` Gap 40; MOM-173, decided after the trial).
18. A goal with no target dead-ends on the quick path, so criterion 1 can fail for a reason that is not the person's until MOM-170 is live (`USER_JOURNEYS.md` Gap 37; before the Nov 5 freeze).

**Closed since the last update.** Gap 16, a deadline goal on production (MOM-166, PR #111; the owner's production check passed on 2026-11-02).

**Closed since the first fill.** Gap 9, the dark theme's flatness (MOM-145, PR #83; the phone check is `USER_JOURNEYS.md` Gap 3); Gap 10, phone navigation (MOM-148, PR #89); Gap 11, warmer auth emails and the sender in `/privacy` (MOM-149, PR #90); Gap 12, the post-wait updates at ten controls (MOM-147, PR #93); Gap 14, the sign-in and sign-up words (MOM-163).
