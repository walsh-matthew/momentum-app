# 90-Day Plan Context for Momentum

As of 2026-10-21. Snapshot, not live. Structure and rules below are stable; the "current position" line in section 2 is the only volatile part.

## 0. Purpose and how to use this doc

Momentum is built from a working 90-day career-pivot plan, which is its proof of concept. This doc tells Claude Code how that plan is structured and run, so seed data, wizard prompts, and rebalancing logic reflect a real plan instead of placeholders.

- Read it before MOM-9 (seed data), MOM-11 (wizard prompt chips), MOM-14 (velocity), and MOM-15 (rebalancing).
- Elements are tagged **[core]** (reusable for any goal) or **[career]** (specific to a career pivot). Build core patterns into the schema and UI; keep career items in seed data and optional modules.
- This describes the plan's design. It contains no personal data, and none should be added (section 11).
- The specific builds in the plan may be replaced by Momentum itself, which then becomes the plan's main case study. Treat Build-track contents as variable and the structure as fixed.

## 1. Goal and definition of done

**Goal [core].** By day 90 (a checkpoint, not a deadline), the user can show hands-on work in the target field, not only claim interest. The target is a role in an AI-focused product or program function.

**Seven completion criteria [core: a goal is a checklist of concrete, verifiable outcomes]:**
1. A working prototype used by a real user, with a recorded demo
2. A second prototype with a model inside it, reachable through the user's own API
3. An eval for it: labeled test set, scoring rubric, before/after accuracy
4. A two-model comparison on accuracy and cost per item
5. A risk register for it
6. Two professional certifications
7. One dated pro bono engagement and a resume entry that starts in the current year

There is also a non-checklist test: the user can predict where a model will fail before running it, and explain why.

**Two lanes [career].** Lane 1: roles the user already qualifies for, which end the career break sooner. Lane 2: AI product and program roles, which the portfolio builds toward. Progress is tracked per lane.

## 2. Hierarchy

| Level | What it is | Count | Momentum mapping |
|---|---|---|---|
| Goal | The 90-day outcome and its 7 criteria | 1 | `goal_channels` row (default: "Career Pivot") |
| Lane | Parallel job-search tracks [career] | 2 | tag on a channel or task |
| Track | Parallel workstreams: Build, Learn, Certify, Position | 4 | `micro_tasks.task_type` grouping |
| Phase | A 4-week stage that ends in a gate | 3 | gap: no table (see section 7) |
| Week | Weekly checklist plus a daily schedule | 13 | gap: needs a week field |
| Daily task | A timeboxed item, `Label, N min.` | about 5 to 8 per day | `micro_tasks` row |
| Friday review | 30-minute tick-off and notes | weekly | gap: needs a review record |

**Phases [core: phases end in gates]:**
1. Foundations and first build. Gate: demo exists, self-check passed, pro bono scoped.
2. A product with evals. Gate: before/after accuracy, a two-model comparison with cost, an API, at least 20 failure-log entries.
3. Proof and positioning. Certified, written up, on the resume, in front of employers. The two holiday weeks are deliberately light and double as buffer.

**Tracks and rough weekly weight [core]:** Build about 7 hours, Learn 3, Certify 6 (while active), Position 2. Hours are a sizing guide only (see invariants).

**Current position:** Phase 1, Week 2 of 13.

## 3. Task anatomy

Every daily task starts with a bold label and minutes: `Build, 60 min.` Recurring task types, usable as `task_type` values:

| task_type | Typical length | Notes |
|---|---|---|
| `job_search` | 10 min | First task every day. A 24-hour search; 3-day on Mondays and after a skipped day. [career] |
| `interview_fill_in` | 15 min | Daily until no open items remain. [career] |
| `interview_prep` | 30 min | One story plus one learner answer; every other week the answer becomes a case question. [career] |
| `build` | 30 to 60 min | Timeboxed. A finished small prototype beats an unfinished ambitious one. |
| `learn` | varies | Course, video, reading. |
| `certify` | varies | Study blocks, then the exam date. |
| `position` | varies | Resume, portfolio, networking, events. |
| `event` | fixed time | Carries time, place, and the ask. |
| `publish` | short | A drafted public post, checked and published by the user. [career] |
| `review` | 30 min | Friday. Tick off, fill in notes, run the weekly rebuild. [core] |
| `funnel_check` | 20 min | Every other Friday. [core pattern, career metrics] |

**Task markers [core]:** "carried over from week N" and "pulled forward from week N". A task keeps a record of where it came from.

**Completion [core]:** the user ticks their own tasks. The system never marks a task done on their behalf.

## 4. The processes

Each is a repeatable loop: a trigger, a saved set of rules, data in durable places (never only in a chat), and approval stops.

| Process | Trigger | Does | Approval stops |
|---|---|---|---|
| Daily triage [career] | Each weekday, after the search | Triages results against a log, ranks by fit (strong / good / stretch), records status in a log | Contacts and outreach are proposed first; drafts only after the user approves. A tailored resume is offered before it is built. |
| Weekly plan build [core] | Friday, after the review | Reads ticks and notes, builds next week's tab, carries over unfinished work, pulls forward early work, reports | Never cuts a task without permission. Says plainly if the timeline can't hold. |
| Interview fill-in [career] | Daily until done | One question per session, drawn from the user's own evidence and words | Writes only facts the user gives. |
| Scheduled runs | Fixed days | Overnight digest of postings and events; weekly volunteer-project search; drafted public posts two days before each date | The user reviews and acts. Posts are drafted by the system and published only by the user. |
| Changing a rule [core] | When a rule needs to change | Rewrites the full rule set and shows it for review | Nothing changes until the user approves. |

**Job-log fields and enums [career], lowercase for storage:**
- `status`: new, preparing, applied, interviewing, offer, passed, closed, eliminated
- `fit`: strong, good, stretch
- `channel`: company_site, staffing_firm, referral
- Volunteer-project `status`: new, contacted, chosen, passed, applied, interviewing, closed, not_selected
- Volunteer-project `lane`: lane_1, lane_2

## 5. Invariants Momentum must encode

1. **Never cut unfinished work.** Carry it forward to the week where it fits best and rebalance against the goal and original timeline. If the timeline can't hold, say so and let the user decide.
2. **Dates are flexible; the real clock is not.** Push items later before cutting. Pull forward anything that shortens the visible gap (a dated resume entry, a volunteer start, contract work).
3. **Interviews and recruiter calls win.** They take priority over study; certification slips before a build does.
4. **Hours are not tracked.** Weeks are sized from what was actually finished.
5. **Timebox builds.** Cut features, not the demo or the write-up.
6. **The user owns completion** (section 3).
7. **Public output is human-approved.** Drafts come to the user; the user publishes.
8. **Claims stay conservative.** Estimates are labeled as estimates; the conservative figure wins when a number falls between options.
9. **Data discipline.** Only invented or public data in prototypes, demos, and write-ups.
10. **Interview-style "gate" checks.** A phase is passed on evidence (a number, a demo, a log count), not on feeling ready.

## 6. The feedback loop [core]

Each Friday the user ticks tasks and answers these notes, which feed the next week's build:
- What made this week heavier or lighter than planned
- What took longer than planned
- What I skipped, and why
- What I want more or less of next week
- What I learned, in a line I'd share publicly
- Results worth reporting
- What surprised me (including where the AI got it wrong)
- Anything to keep out of public posts

A **failure log** runs alongside: dated entries recording what was asked, what the model did wrong, and why. It is the source of later examples.

A **funnel check** every two weeks: applications, screens, and interviews by lane and by fit. Rule: eight or more strong-fit applications in a lane with no screens means rework that lane before sending more.

## 7. Mapping to the MOM-9 schema, and gaps

The four planned tables cover most of the plan:

| Plan concept | Table | Suggested fields (suggestions, not constraints) |
|---|---|---|
| Goal | `goal_channels` | `title`, `status` (`active`, `paused`, `done`), `target_date`, `criteria` (7 checklist items) |
| Daily task | `micro_tasks` | `task_type`, `minutes`, `status` (`todo`, `done`), `due_date`, `week_of`, `carried_from_week`, `pulled_from_week` |
| Tools (calendar, mail, repo) | `connected_apps` | as planned |

**Gaps to flag (log to `BACKLOG.md` rather than expand MOM-9 today):**
- Phases and gates have no table. A `phases` table or a `phase_label` plus `gate_note` on tasks would do.
- Weekly review notes need a record (week, eight note fields).
- Carry-over history: `carried_from_week` records one hop only.
- Failure log entries and lane tracking.

Store all statuses and types as lowercase machine keys. Presentation strings belong in the UI.

## 8. Seed data (generic, reworded; for MOM-9)

One active goal channel: **Career Pivot**, 90-day target, seven criteria as in section 1.

Sample `micro_tasks` (type, minutes, week):

| title | task_type | minutes | week_of |
|---|---|---|---|
| Run the daily job search and triage the results | job_search | 10 | 2 |
| Answer one open interview question from my own evidence | interview_fill_in | 15 | 2 |
| Build the core flow of the first prototype end to end | build | 60 | 2 |
| Study cloud concepts and security for the first certification | certify | 45 | 2 |
| Watch the second half of the model-internals video | learn | 45 | 2 |
| Register for two networking events | position | 15 | 2 |
| Record a two-minute demo on invented data | build | 30 | 3 |
| Write the one-page case study | build | 60 | 4 |
| Take the official practice exam, then review weak areas | certify | 60 | 4 |
| Friday review: tick tasks and fill in notes | review | 30 | 2 |

One example of carry-over: a `certify` task originally in week 2, now `carried_from_week: 2` in week 3.

## 9. Prompt chips and wizard (for MOM-11)

Draw chips from the plan's real vocabulary. Suggested chips, grouped:
- **Goal type:** Career pivot, Get certified, Build a portfolio piece, Prepare for interviews, Grow my network
- **Constraints:** Hours are flexible, Contract work first, Don't track hours, Keep dates flexible
- **Pace:** Lighter week, Heavier week, I'm ahead, I fell behind, Carry over what I missed
- **Review:** What took longer, What I skipped, What surprised me

Existing chips `+ New Goal Wizard` and `Adjust Weekly Pace` stay. `Adjust Weekly Pace` should use the carry-over language in section 5, rule 1.

## 10. Notes for MOM-14 and MOM-15

- **Velocity (MOM-14):** derive it from ticks and carry-over, not logged hours. A suggested "burnout risk" signal is carry-over buildup across consecutive weeks.
- **Rebalance proposals (MOM-15):** each proposal should name what moves, from which week to which, and why, and flag when the timeline cannot hold. Proposals never delete tasks. The `TaskRebalanceSchema` should have no delete action.

## 11. What to keep out of this repo (public)

Salary or pay targets, household finances, family details and any real task data from a minor, named employers or recruiters, resume and interview content, job-log rows, contacts, past-employer specifics, and the owner's name or location. Seed data must stay generic.

## 12. Sources

The plan's structure was taken from three private working documents: the 90-day plan, a prompt playbook, and an interview-prep document, plus three saved process definitions (daily job search, weekly plan build, interview fill-in). They are not in this repo.