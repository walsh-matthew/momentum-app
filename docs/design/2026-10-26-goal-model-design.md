# Momentum goal model: design pass

2026-10-26 · Design record for MOM-106 (EPIC 6, MOM-105)

> **Status: approved by the owner on 2026-10-26.** This is the dated record of how the new goal model was decided. The binding rules are in `docs/DOMAIN_MODEL.md` (sections 1 to 4 of this record, rewritten as rules). Testers are described by role only: the owner, and two household testers, one of them a minor. Personal details stay out of this public repo. "I" in the text is Claude, which drafted it; the decisions are the owner's.

## Purpose and status

This doc proposes Momentum's new goal model, setup flow, weekly review and settings, and how we test it against the kill criteria we agreed. It was drafted for the owner's review, section by section; nothing in the repo or Jira changed until he approved it.

Once approved, it becomes the content of a new binding file, `docs/DOMAIN_MODEL.md`. That file supersedes the product rules in `docs/NINETY_DAY_PLAN_CONTEXT.md` and parts of `docs/INTEGRATIONS_SPEC.md`. Old docs get banners and pointers, never deletions, so the evolution stays on record.

Where it comes from: the Fitness tabletop, the Career discovery, setup runs 1 and 2, the balance test week and its Sunday review, and the Task App review (all 2026-10-25 and 26). Every rule below traces to one of those sessions. Where I am proposing something new rather than writing down an agreed call, it says **Proposal**, so you can push on those first.

How to review: one section at a time, in order. Each section ends with the open questions for that section. Comment inline or reply in the thread; I revise and move on.

## 1. The model

Momentum is a state engine: work items are the engine, targets are the scoreboard, and the scoreboard is always computed from entries, never typed. One vocabulary covers every goal; "lanes" survive only as source types (synced or manual), not as product structure.

Doing a work item produces an entry through a source; entries are counted against targets; the engine computes the scoreboard; the weekly review turns it into one change and next week's plan.

### 1.1 The person

Some facts belong to the person, not to any goal. Setup collects them once and every goal reuses them.

| Concept | What it holds | Where it came from |
| --- | --- | --- |
| Time anchors | Time zone, when their week starts, when their day ends. All user-set, no defaults assumed silently. | Fitness principle 1; run 2 (week start, "week before X") |
| Capacity | Usual capacity per day type (their own day types, in hours or sessions, their choice), plus dated exceptions such as vacations, addable any time. | Run 1 per-day capacity; run 2 vacation days |
| Protected priorities | Life areas they name as protected (for example family or sleep), in their own words, unmeasured unless they choose to track them. | Run 1, run 2, Sunday review |
| Handling preferences | Situational rules in their words ("when an interview lands on a workout day, ask me"). Offered only on a pattern or at the weekly review, never after one event. | Balance test Fri |
| Settings | "How Momentum talks to me" (section 4). | Balance test Sat |

### 1.2 Goals

A goal is something the person wants, with a "why" in their words. It has any timeframe; the fixed 13-week plan goes away.

- **Shape:** ongoing (runs in blocks, for example a first block of 10 weeks), finite (has an end date), or project (finishes when its outcome is reached, optionally with a hard deadline).
- **State:** active or parked. A parked goal records how it comes back: a date, a season or condition, or "only when I ask". Momentum never resurfaces a parked goal on its own unless the person chose a return condition.
- **Sequencing:** when one idea holds several activities, setup asks "together or one first?" and says once that starting fewer goals usually works better. It is a suggestion, never a limit: the person can set up as many active goals as they want, and Momentum then shows the balance across them.
- **Defaults:** a goal sets the default completion mode and tone for everything inside it; each target or item can override.

### 1.3 Targets (the scoreboard)

A target is one thing being measured. A goal holds one or more.

| Field | Values | Notes |
| --- | --- | --- |
| Measure | count, quantity (number + unit), time, or checklist progress | Entry effort scales with this: a count is a tap, a quantity is one number, rich data stays in the person's own tool. |
| Role | effort or outcome | Judge controllable effort against levels. Track outcomes (interviews, offers, finished items) without pass marks unless the person asks for one. |
| Period | weekly quota, named day slots, by a deadline, or monthly | Week boundaries come from the person's time anchors. Monthly suits opportunistic targets such as events. |
| Levels | floor (required), aspiration (optional), stretch (optional, temporary), safety ceiling (optional) | Over the ceiling shows a caution, never a celebration. Levels can ramp over a block. |
| Qualifying threshold | optional, user-set | Entries below it are kept and shown but not counted; the person can "count anyway". No forced thresholds. |
| Carry-over | habit: shortfall never rolls into the next period (catch-up inside the period is fine); cumulative: shortfall stays owed until the deadline | Set by the target's kind, shown to the person. |
| Completion mode | auto from source, confirm, or manual | Default from the goal. Auto-completion is always shown and undoable. |
| Sources | one or more bound sources (1.5) | Routing is set by the person. Templates only suggest. |

Partial credit is everywhere: "halfway to your floor" is a valid state, never a fail.

### 1.4 Work items (the engine)

Work items are what the person does; doing them produces entries that move targets. Three kinds:

- **Habits:** recurring sessions that feed a periodic target (workouts, search sessions). They have no due date, only a period.
- **Milestones:** one-off checkpoints, optionally broken into steps ("learn the new technique", prep checklist). Partial progress counts and is shown.
- **Deadline tasks:** a milestone with an external due date (a holiday, an application close). When the person logs time against it, Momentum forecasts whether remaining work fits remaining capacity and says so plainly, tolerating rough data.

The weekly plan is the person's pick of which items to do on which of their days. Their picks drive reminders, so reminders follow the plan, not a fixed clock. Carry-over follows the target's kind. Habits never carry forward: if the target is 3 workouts a week and 2 happen, next week is still 3, not 4, and the missed one is not owed (catch-up inside the same week is fine). Only milestone and deadline-task steps that weren't finished move forward, and the rebalancer never cuts them silently.

### 1.5 Sources and responsibility

Every target names who is responsible for knowing whether it happened.

| Source type | Examples | Who confirms | What Momentum asks |
| --- | --- | --- | --- |
| Synced | Hevy, calendar busy/free, a tracker sheet in the person's own Drive | The source | Only about connection health, never "did you work out?" |
| Manual | Tap, one number, start/stop timer, checklist tick | The person; the entry is the confirmation | Check-ins only as the person set them (never, end of their day, end of their week) |

- **The person's word beats any source.** A manual entry or correction always wins over a sync.
- **Bring your own tracker:** if the person already keeps a sheet, it is the source of truth. Momentum reads raw rows by header, flags header drift, and writes only additively with a preview. This is the first build after the thin slice: the bridge for anything no app with an API tracks well.
- **Missing integration:** suggest a bridge (Strava for watch runs), offer "request this integration", fall back to manual.
- **Inference is labelled.** Anything Momentum guesses (a calendar event counting as a meetup) shows what it counted and has one-tap undo.

### 1.6 Entries and corrections

An entry is one raw record: a workout, a time session, a tick, a sheet row. Entries are never edited by the engine, only counted or not counted.

- The person can **remove** (hidden, restorable), **restore**, **add**, and **count anyway** a below-threshold entry.
- Corrections are keyed to the source's own record id, so a resync never undoes them.
- **Agreed:** when a manual entry and a later synced record look like the same event, Momentum suggests a merge and the person confirms; it never merges silently. It must not nag: possible duplicates from the same source are grouped into one prompt, and once the person has handled the same kind twice, Momentum offers a standing rule for that source (always merge, always keep both, or ask). A source that keeps failing is a connection-health problem: one notice, then quiet until it is fixed, with a mention in the weekly review.

### 1.7 The computed scoreboard

- Every number is computed from entries and the target in force for that period. Each closed period stores the target it was judged by, so a re-baseline never re-grades history.
- The engine detects threshold crossings (step, floor, aspiration, block end) and patterns both ways (holding, slipping). Celebrations scale with the crossing and follow the person's celebration setting.
- Claude never scores and never does math. The engine produces facts; Claude only writes words around them.

### 1.8 What this replaces in today's code

| Today | New model |
| --- | --- |
| Criteria are checkbox lists with no target, source or rule | Targets with measure, levels, period, sources |
| Ingestion creates new to-do tasks | Ingestion creates entries that move targets |
| Each adapter routes to a hard-coded goal | The person binds sources to targets |
| Progress = tasks ticked / total | Progress computed per target, fractional and cumulative |
| Career-only goal and task types | Generic kinds: habit, milestone, deadline task |
| A fixed 13-week plan | Any timeframe; ongoing goals run in blocks |
| The database blocks any completion not made by the user | Completion mode per target; auto-completion visible and undoable |
| "Interviews win" as a fixed priority | Momentum informs, the person prioritizes (section 4) |
| "Hours are not tracked" | Time is a valid measure, with a start/stop timer as a manual source |

### Decisions (section 1)

1. **Levels on outcome targets: decided.** Effort targets carry pass marks; outcome targets show the count and trend only, and get a level when the person names a number or asks for one. Example: "applications sent, at least 5 a week" is judged; "interviews" is shown, not judged, so a week of 8 strong applications and no callbacks never reads as a fail. A household tester's "15 items by the holiday" keeps its level because the number was theirs.
2. **Bring-your-own sheet: decided, first follow-on after the thin slice.** It is a large build and also a critical bridge wherever no app with an API tracks something well, so it is the first item after the thin slice, not a someday idea. During the family trial the owner enters his job-search numbers by hand alongside his own sheet. That double entry is a known extra load caused by the missing bridge, so it is recorded separately under criterion 2, and it doubles as evidence for how much the sheet source is worth.
3. **Merge rule: decided,** with the no-nagging rule in 1.6.

## 2. Setup

Setup is a short guided conversation that turns a vague idea into the structure in section 1, one question at a time, and saves nothing until the person approves a playback. Both tabletop runs got this core right; the slips were all assumptions, so the rules below are hard rules in the prompt and checks in the eval set, not good intentions.

### 2.1 Hard rules

1. **One question per turn, single-part, plain words.** Run 2 lost half a two-part question.
2. **Never assume anything about the person's life,** in questions, playbacks or examples. No days, times, week starts, "evenings", "weekends", "any three". Run 2 had three slips of this kind.
3. **Never announce a reminder, check-in or nudge.** Ask whether they want one.
4. **Offer the choice before examples:** "Do you have something in mind, or would some starting ideas help?" Examples unblocked the run 2 tester. A suggestion the tester takes is marked as a starting point and checked at the first weekly review.
5. **Skip what is already answered.** If an earlier answer or a person fact covers a question, say so in one line ("You told me your week starts Monday, so I'll skip that") and move on.
6. **When an answer doesn't fit, offer numbered interpretations** instead of guessing. This recovered a bare "No" and "the clock should come on" in run 2.
7. **Play back in short chunks, latest answer wins.** Each part is played back and approved as it finishes, so the person can digest and think about it, never one long playback at the end (run 1 finding). Preferences change mid-setup; the playback reflects the newest one.
8. **Claude does no math and sets no score.** It proposes structure; the engine validates it.

### 2.2 The conversation, in order

1. **The idea,** in their words.
2. **Why** it matters to them.
3. **Break it up:** is this one goal or several? If several, together or one first? Others are parked with a return condition (date, season or condition, or only when asked).
4. **What else matters:** protected priorities, before any detailed planning.
5. **Starting point:** where they are now. This often surfaces a natural first milestone.
6. **Shape and timeframe:** ongoing (first block length), end date, or deadline. Always ask for the exact date; never infer a week. For a deadline, ask as a separate question whether the date can move.
7. **What counts:** effort and outcome targets, the floor, and an aspiration if they want one. No forced failure-rate guesses.
8. **Expansion questions:** a few best-practice prompts with examples, to surface unknown unknowns. A playbook, when one exists, supplies these.
9. **Source for each target:** "Are you already tracking this? Where?" The answer picks synced, their own sheet, or manual (tap, number, timer).
10. **Planning and capacity:** their week start, their day types and capacity, fixed slots or a flexible quota, and when they want to plan their week. Person facts are asked once, on the first goal only.
11. **How Momentum talks to me:** asked conversationally, not as a form (section 4).
12. **Final approval.** By this point each part has already been played back and approved in its own short chunk (after steps 3, 7, 10 and 11), so the person never faces one long playback. The final step is a few lines confirming the whole, then save and show the settings page with everything editable. Not everything has to be settled at setup: details can be refined in use and at the weekly review.

### 2.3 How saving works

- **Proposal:** Claude fills a draft object that must pass the same schema validation as the saved model. The playback is rendered from that validated draft, not from Claude's own summary, so what the person approves is exactly what gets saved.
- A quick path exists: accept sensible defaults and refine later. Every default is visible and editable.
- Nothing a person said is lost if validation fails; Claude asks one clarifying question instead.

### 2.4 Playbooks

Playbooks are optional knowledge plug-ins: curated expansion questions and suggested structures for a common big goal. Run 2's hobby goal needed none. Run 1's career goal missed certifications, proof-building, pro bono, publishing and a weekly review without one. A playbook only suggests; the person decides.

### 2.5 Parked lever

"Find the few answers that drive the rest, then propose" could cut questions and cost. It stays off by default because more inference means more assumption slips. We pull it only if the prototype shows a cost or drop-off problem (section 6).

### Decisions (section 2)

1. **Playbooks: decided.** The thin slice ships generic setup plus expansion questions. A career playbook is the first setup follow-on.
2. **Length: decided.** No turn cap in the prompt. Measure turns and tokens, and cap cost per setup (section 6).
3. **Playback in chunks: decided.** Each part is approved as it finishes; the final step only confirms the whole.

## 3. The layered weekly review

The end of the person's week is a special event: a short recap always, a deeper reflection when they want it, and one question that can change next week. It runs at the end of the week as the person defined it, at the planning moment they chose, never on a fixed weekday.

### 3.1 The layers

| Layer | Shown | What it holds |
| --- | --- | --- |
| 1. Recap | Always | Per goal: where each target ended against its levels, crossings, and patterns in both directions. Informed tradeoffs are named, never judged ("you put the search first on two days"). A line on protected priorities only for areas the person named, in their own words, with no score. |
| 2. Reflection | Per the depth setting | A few questions: what worked, what got in the way, one lesson. Insights come from engine facts. It also teaches the app as needed ("you can count anyway"). |
| 3. One adjustment | Always offered, can be skipped | One question about next week: a one-week adjustment or a re-baseline. Followed by planning the week: the person picks items onto their days, which sets the reminders. |

### 3.2 What the engine can raise in layer 3

Only one of these per review, picked by the engine from facts:

- Stretch or aspiration hit repeatedly: offer a re-baseline (old weeks keep the old target).
- A slipping pattern: a gentle check-in. A single bad week is not a pattern. **Agreed default:** the floor missed in two periods running, shown and editable per person. It is a starting value to tune from family-trial feedback, not a fixed rule.
- Repeated exceptions to a stated priority: "Has this priority changed?"
- A recurring clash between two goals: offer a handling preference, never a ranking of goals.
- A suggestion taken at setup: "Still right for you?" (first review only).
- A deadline forecast that no longer fits: say so plainly and let the person choose. The choices: more time before the date (more sessions or hours in the weeks left), a smaller scope, moving the date, or accepting the risk. "Move the date" is offered only when the date can move. Setup asks one question for each deadline task: "Can this date move if you need it to?" A holiday or an application close can't; a date the person set for themselves usually can.

### 3.3 Tone rules

- **Never pair a celebration with a request.** A celebration stands alone; the ask comes later or in layer 3.
- **Momentum informs, the person prioritizes.** It never invents priorities and never blocks a choice.
- **Claude writes the words, the engine supplies the facts.** The prompt gets a fact list (crossings, patterns, forecasts) and may not add numbers.

### Decisions (section 3)

1. **Depth: decided.** Recap plus a one-line offer of reflection.
2. **Review and planning: decided.** One sitting by default, with a setting to split them.
3. **Slipping: decided.** Floor missed two periods running, as an editable starting value tuned from family-trial feedback.
4. **Deadline choices: decided.** Moving the date is a choice whenever the date can move; setup records whether it can.

## 4. Settings and principles

If the right answer depends on the person, it is a setting with a sensible default, not a rule. To keep settings from sprawling, they live on one page, "How Momentum talks to me", are set in plain language during setup, and every one can be changed later.

### 4.1 How Momentum talks to me

| Setting | Choices | Default | Source |
| --- | --- | --- | --- |
| Tone | gentle to direct | middle | Fitness principle 5 |
| Reminders | off, or tied to the days they plan | off until they choose | Task App; run 2 slip 3 |
| Reminder times | a clock time per their own day type | none until they choose | Run 2 |
| Check-ins for manual targets | never, end of their day, end of their week | end of their week | Fitness tabletop |
| Celebrations | low-key to big | low-key | Task App; balance test |
| Quiet times | times or days Momentum stays silent | none set, asked in setup | Balance test Sat |
| Balance mentions | at weekly planning, near deadlines only, or leave it to me | at weekly planning | Run 2 |
| Review depth | recap only, recap plus offer, full reflection | recap plus offer | Sunday review |
| Completion (per goal, override per target) | auto from source, confirm, manual | auto for synced, manual for manual | Philosophy 1 |

No default anchors a time or a day. Where a default would need one, the default is "none until you choose". Defaults are kept in one place in the code, so changing one after testing is a small change. A new default never overwrites a choice a person has already made.

### 4.2 Principles (binding once approved)

1. **Never assume anything about a person's life.** Days, week start, day boundary, schedule and what partial calendar data means are all theirs to set.
2. **Defaults are visible, editable suggestions, never rules.**
3. **The person's word beats any source.**
4. **Ask for the least data that does the job.** No forced thresholds that make people guess their failure rate.
5. **Tone changes words, never numbers.**
6. **Momentum never invents priorities.** It uses yours to shape its suggestions, never to judge or block your choices, and you can set them aside any day without explaining. Only a repeated pattern of exceptions prompts "has this priority changed?".
7. **An informed tradeoff is a valid choice.** Momentum makes it visible and never judges it.
8. **Celebrate alone.** Never pair a celebration with a request.
9. **Claude is a partner at setup and review, then steps back.** Momentum is a state engine: it tracks, links sources and evaluates. Claude never scores and never does math.
10. **Auto-completion is always visible and undoable.**
11. **Unfinished work is moved, never silently cut.** This applies only to work that has to be done regardless of when: milestone and deadline-task steps. Habits never carry over, so a missed workout in a 3-a-week target is never owed the following week (1.3, 1.4). (Kept from the old invariants, narrowed.)
12. **Never compute exact free time or pick a slot.** Momentum will never see the full complexity of someone's day or week, and it would be presumptuous to act as if it did. A calendar event understates its real cost; say "shorter day", not "you have 45 minutes at 3".

### 4.3 What Momentum does not do

Saying this plainly avoids drift toward recreating Claude or Notion: it does not edit the person's documents, write resumes, or coach focus and getting started. Those stay in the person's own tools; Momentum tracks the progress signals they produce. **The one exception is templates Momentum creates** (run 1's starter tracker, saved-postings folder and prep sheet). Momentum can change those as the person's needs grow, such as adding a column when they need to store more. It changes them only additively, with a preview and the person's OK, and never removes their columns or data. Templates arrive with the sheet source, the first follow-on after the thin slice.

### Decisions (section 4)

1. **Defaults: decided,** as starting values that are easy to change after testing. How informed they are varies. Low-key celebrations have the most evidence behind them: the Task App tester found big celebrations irritating, and you chose "celebrate alone" in the balance test. That is still only a handful of people. "Check-ins at the end of their week" is my guess at the least intrusive option and hasn't been tested. The family trial is where these get real data.
2. **Principle 12: kept as a principle.** It says Momentum never works out exact free time or picks a slot for you, because a calendar event understates its real cost (travel, pickups, winding down), from the Tuesday of the balance test. My question was whether it is big enough to stand among the principles or should just be one rule in the balance section. I kept it, because it governs every place Momentum touches time: planning, reminders, the review and the deadline forecast. The owner agreed (the app never has full visibility into someone's day, so assuming it does would be presumptuous).
3. **Unfinished work: decided.** Narrowed to milestone and deadline steps; habits never carry over.
4. **Templates: decided.** Momentum edits only templates it created, additively and with the person's OK.

## 5. Test plan for the kill criteria

The verdict so far is a conditional go: no criterion has failed, criterion 1 passed on paper with a friendly tester, and the rest wait on a real prototype. Each criterion below gets a measure and a pass bar now, before any result exists. Changing a bar later needs a written reason (the guardrail we agreed).

| # | Criterion | How we measure it | Pass bar (decided) | Paper score |
| --- | --- | --- | --- | --- |
| 1 | Setup works for someone other than the owner | Each family-trial user runs real setup. Record: finished or not, changes made at the final playback, and one question afterwards: "Was that time useful?" | Finishes, approves without heavy edits, says the time was useful. A heavy edit is a change to a target, level or source at playback (wording changes don't count); two or fewer per setup. | Pass (friendly tester) |
| 2 | Manual load per week stays light | Count manual entries and time spent entering them; ask at the end of each week | Each user says logging is not a chore, and no one silently stops logging a manual target for a whole week. Judged only where manual entry is the intended source (taps, numbers, the timer, checklist ticks). Entering numbers by hand that already live in your own sheet is expected to be a chore until the sheet source lands; it is recorded separately and doesn't count against this bar. | Pass on paper |
| 3 | One vocabulary covers every goal | Every goal the three users set up is checked against the model | The concepts must hold for every goal: goal, target, the three kinds of work item, source, entry. A goal that needs a new kind of thing, or a rule that contradicts the model, is the fail to discuss. New fields are expected, because we haven't thought of everything a user might want. They are logged as learnings, not fails. Adding one later is a small change: a new migration adds the column, then the types, the validation and the screen that shows it. | Pass on paper |
| 4 | The weekly review changes a decision | Log each layer 3 outcome: changed, declined by choice, or skipped | Each person makes at least one real change across their reviews, and no more than two of the six reviews are skipped. Each review ends with one adjustment question, and we log the outcome: changed something, looked and chose no change, or skipped. A fail means the review gets reworked or cut, not that the project stops (see "What a fail means" below the table). | Partial |
| 5 | The thin slice is buildable in N | Build days from the first thin-slice block to the family trial start. What is in and out of the slice, and the proposal for N, are in 6.1. | Inside N (section 6) | Deferred |
| 6 | Family trial: three people use it for their own real goals, about two weeks | The owner and two household testers (one a minor) use it for their own goals. More family members outside the house join a second round, after the first fixes (5.3). | Each is still using it at the end, by choice | Not started |

**What a fail means.** No single criterion kills the project on its own. Each fail leads to one of the three verdicts we agreed: go, change or stop.

- **Change that part:** criteria 2 (manual load), 4 (weekly review) and 5 (build time). A failed review gets reworked or cut, and the rest of Momentum carries on.
- **Could mean stop:** criteria 1 (nobody can set it up), 3 (the model doesn't fit real goals) and 6 (nobody keeps using it). These test the core idea. Even then, we decide together, and we write down why.

### 5.1 Before the family trial

- **Setup eval set.** Scripted cases built from runs 1 and 2, with personal details removed. Automatic checks per turn: one question only, no time or day words the person didn't say, no announced reminders, and the final draft passes schema validation. This doubles as case-study material.
- **Engine tests.** Carry-over by kind, re-baseline keeps old grades, corrections survive a resync, below-threshold entries and count-anyway, partial credit, deadline forecast with rough data.
- **Phone check each build,** on a real iPhone. The Task App showed that emulators miss form and keyboard problems.

### 5.2 Family trial safeguards

- The owner gives the parental consent for the minor tester. The minor tester also gives their own agreement (the term for a minor's own agreement is "assent"), and can quit at any time.
- Check the age terms of every service involved first. No connected accounts for the minor tester at the start; minimal data.
- Household privacy: no family member sees another's data unless they choose to share it.
- Nothing personal about any tester goes in the repo, memory or the logs. Only aggregate findings go in the repo.

### 5.3 During and after the trial

- **Two weeks, extended only if we need more information.** No science project.
- **The trial is not a dead period for the build.** While it runs, the owner's weekly Max usage goes to the follow-ons that don't change what testers see: the sheet source and templates, the career playbook, and the five safe blocks. Fixes that block a tester ship during the trial. Model or screen changes wait until it ends, so the trial measures one version.
- **A second round** adds family members outside the house. The app is already on the internet, so access isn't a blocker. Why wait: the first trial will find bugs and model gaps, a remote tester can't be helped in person, and a second round of fresh, unprimed testers re-tests criterion 1 on the fixed version.

### Decisions (section 5)

1. **Bars:** all pass bars in the table are decided, including the heavy-edit definition for criterion 1, criterion 2 with the owner's caveat, criterion 3 as revised after his pushback, and criterion 4. So is what a fail means.
2. **Trial length:** two weeks, extended only if needed.
3. **More family members:** a second round, after the first trial's fixes.

## 6. Setting N and the setup cost limit

The owner sets both numbers; this section gives the method and the facts he needs. One fact matters first: today's Claude limits (20 calls per person per day, 20 seconds between calls) would stop a setup like run 2 partway through. **Decided:** every Claude limit set before this redesign gets re-baselined. They were sized for the old wizard and rebalance calls, and Claude's role has changed to setup and the weekly review. The new limits must not stop a person from succeeding, and they must keep the app financially viable.

### 6.1 N, the build time for the thin slice

**Decided: N = 5 build days, with a checkpoint at the end of day 3.** The thin slice is about 18 build blocks. On the full build days so far (22 and 23 October), the repo shows 14 and 21 ticket keys touched, some of them docs only, so 6 to 8 real blocks a day is a fair rate. That makes about 3 build days of work. Two days of margin covers the trial prerequisites and fixes. Build days, not calendar days: the owner's weekly Max usage decides how fast they come.

#### What's in the slice

The slice is the smallest build that lets three people run criteria 1 to 4 for real.

| # | Piece | What it includes | Blocks |
| --- | --- | --- | --- |
| 1 | Docs PR | DOMAIN\_MODEL.md and the supersede banners (7.1) | 1 |
| 2 | Data model | New tables, by new migrations: person facts and settings, goals, targets with floor and aspiration, work items of three kinds, entries and corrections, closed-period snapshots. Security rules, verify scripts, central types. | 2 |
| 3 | Engine | Scoreboard per target, carry-over by kind, partial credit, qualifying threshold and count-anyway, crossings, the slipping pattern, re-baseline without re-grading, deadline forecast. Pure functions with heavy unit tests. | 2 |
| 4 | Hevy into entries | Rework the existing adapter so workouts become entries bound to a target. Corrections survive a resync; the merge suggestion. Only the owner uses Hevy, so the household testers test the manual side. A second app for them would be scope creep in slice 1, but the owner asks them which apps they already use; that cheaply ranks the next adapter for round 2. | 1 |
| 5 | Manual entry | Tap, one number, start/stop timer, checklist tick. Phone-first, no keyboard where possible. | 2 |
| 6 | Setup | Conversation screen, the prompt with the hard rules, validated draft, chunked playback, save. Its own Claude budget. The eval set with automatic rule checks. | 3 |
| 7 | Home and week plan | Goals with their scoreboards; pick items onto your days. Reuses the current layout. Starts with a scoreboard mock-up that the owner reviews before any screen is built. | 2 |
| 8 | Weekly review | Fact list from the engine, recap, reflection offer, one adjustment, planning. Its own Claude budget. | 2 |
| 9 | Settings page | "How Momentum talks to me", every default editable. | 1 |
| 10 | Retire the old model | Remove the old wizard, rebalance and checkbox criteria paths; replace the old completion rule with a new migration; update code references. | 1 |
| 11 | Trial prerequisites | Password reset and sign-up protection (MOM-64), the privacy notice (MOM-102), and the age-terms check for the minor tester (a check, not code). | 1 |
|  | **Total** |  | **18** |

The five safe blocks (MOM-68, 65, 66, 93, 103) run separately and are not counted in N.

#### What's left out, and where it goes

| Left out of slice 1 | Why | When |
| --- | --- | --- |
| Your own sheet as a source, and templates | Large build; manual entry covers the trial | First follow-on, built during the trial |
| Career playbook | Generic setup passed criterion 1 | During the trial |
| Reminders sent outside the app (email, push, text) and logging from a notification | Each delivery channel is real work; iPhone web push is limited | Round 2. In slice 1, Momentum shows prompts in the app only. |
| Stretch levels, safety ceilings, ramping levels | Floor and aspiration are enough to test the model | After the trial, if testers ask |
| Dated capacity exceptions (vacations), monthly periods | Usual capacity and weekly or deadline periods cover the three testers | After the trial |
| Standing merge rules for a source | Simple merge suggestion first | After the trial, if duplicates show up |
| Calendar busy/free, Strava, email confirmation detection | Parked ideas | Later |
| Household sharing, testers outside the house | Privacy work; second round | Round 2 |

Two items are the most likely to grow: setup (prompt tuning against the eval set) and the engine (edge cases). If either runs long, the checkpoint at day 3 shows it early.

### 6.2 The setup cost limit

What we know now:

- Run 2 took about 20 questions, so about 20 to 25 Claude calls with a growing conversation.
- The current limits are set per call in `LLM_GOVERNANCE.md`, and their prices were cached 2026-10-06, so they need a fresh check (agreed).
- A back-of-envelope estimate on those cached prices is about $1 per setup on the current model, before prompt caching. That is arithmetic on assumed token counts, not a measurement.
- Is that affordable? The old strategy doc priced a paid tier at $12 to $15 a month (being superseded, but the only reference so far). A first month with two setups and four weekly reviews might cost $2 to $4 in Claude calls at today's guesses: high. Later months would carry only the reviews: likely well under $1. The measured numbers from the eval decide this, not these guesses.

Method (this covers both concerns: limits that don't block success, and an app that pays for itself):

1. Run the setup eval set (section 5.1) and record turns, input and output tokens per run.
2. Set the limit as a per-setup budget in turns and tokens, at the 90th percentile of the eval runs plus a margin, instead of the daily per-call count.
3. Try a smaller model for setup turns in the same eval. Keep it only if it passes the same rule checks (agreed).
4. When the budget runs out, fail closed: play back what has been collected, offer the quick path with defaults, and save nothing unapproved.
5. Measure the weekly review the same way and give it its own budget.
6. Re-baseline every existing Claude limit (spacing, per-person count, shared count, output size) against the new uses, replacing per-call counts with budgets per feature.
7. Unit-economics check: AI cost per person per month (setups plus reviews) against a price range. **Proposal:** aim for AI cost under 10% of the price in a normal month, with a costlier first month accepted. The price itself belongs to the future company project.

### Decisions (section 6)

1. **Runway: decided.** Build days come from the owner's weekly Max usage, aiming to use all of it. This week's AI events will take part of it, so N = 5 is counted in build days, not calendar days.
2. **Monthly ceiling: decided, generous in testing.** During the family trial, per-person ceilings are set high and run in log-only mode: when a tester would have hit a limit, the app records it but doesn't block them. That protects their experience and their opinion of the app, and the log shows where production limits belong. One hard shared cap stays on, to protect spending if sign-up is abused.

## 7. Execution plan after approval

Once the owner approves this doc, one docs PR lands it before any code, superseding old rules and deleting nothing. Claude opens the PR and does the Jira work (the owner's call); the PR merges only when the owner says.

**Where this doc lives.** The repo is the home, so it doesn't get lost as an artifact. Two files:

- `docs/DOMAIN_MODEL.md`: sections 1 to 4, rewritten as the binding rules.
- `docs/design/2026-10-26-goal-model-design.md`: the whole doc with its decisions, as the dated record of how we got here (sections 5 to 7 included).

The repo is public, so both files describe testers by role ("the owner", "two household testers, one a minor") and carry no personal details. This Claude Doc stays as the working copy until the PR merges, then points to the repo.

### 7.1 The docs PR

| File | Change |
| --- | --- |
| `docs/DOMAIN_MODEL.md` (new) | This doc's sections 1 to 4, written as the binding source of truth. |
| `docs/NINETY_DAY_PLAN_CONTEXT.md` | **Frozen, not trimmed.** A superseded banner at the top and a pointer beside each changed rule ("superseded by DOMAIN\_MODEL.md §x"). No renumbering, because about 47 code, test and migration comments cite its section numbers, 23 of them §5. It stays as the career case study and seed. |
| `docs/INTEGRATIONS_SPEC.md` | Banner plus pointers on five rules: evidence never completes, ingest creates to-dos, the hard-coded target goal, 13-week placement, the native iOS line. The payload contract stays. |
| `CLAUDE.md` | Only the Domain Directives section, repointed to DOMAIN\_MODEL.md. |
| `PRODUCT_STRATEGY.md` | Banner plus pointers: 90-day and 12-week cycles, the Daily Completion Score, pricing tiers by goal channel. |
| `BACKLOG.md`, `ROADMAP.md` | Old-model items marked superseded with a pointer, not removed. Thin-slice items added. |
| `docs/plans/NEXT_BUILD_PLAN.md` | Keep the five safe blocks; mark MOM-57, 45, 101, 64 and 102 superseded (45 by user-set day boundaries, the rest folded into thin-slice pieces), keeping `npm run plan:check` green. |
| `docs/RAID_LOG.md` | Revise R-05 (its safeguard relies on the old completion rule). New rows, unreviewed, in category terms only: synced data miscounting, setup inferring wrongly, minors in the family trial. |
| `docs/FAILURE_LOG.md` | The held entries, all predicted "no" (7.2). |
| `docs/COMPETITIVE_ANALYSIS.md` | A dated note that it describes the old concept. |

Not in this PR: old migrations are never edited (new ones replace the rules in the build), the completion guards from migrations 002 and 008 change in the build, and `LLM_GOVERNANCE.md` changes when the Claude limits are re-baselined (6.2).

### 7.2 Held failure-log entries

Three entries go in (the owner agreed the count doesn't matter), plus any he approves from this thread. A fourth was added during section 7 review.

1. Read a hard-coded spreadsheet cell as a real weekly total and drew a design conclusion from it. Caught by the owner through the formula column.
2. Read a tester's reuse of example answers as anchoring and built a rule on it. The tester said the examples were what unblocked them; caught when the owner asked the tester.
3. Recurring: built a standard work schedule into the design (weekends for family, evening check-ins, "any three" days, an unasked reminder). Caught by the owner each time; the fix is hard rules in the setup prompt.
4. Told the owner a project thread couldn't open a PR under the branch-naming rule, without checking the repo's PR history (threads had opened ten such PRs). Caught by the owner.

### 7.3 Sequence

1. The owner re-reviews section 1 with the full scope in view; I revise. Then he approves the doc.
2. Jira (Claude, approved by the owner): a new epic for the goal-model thin slice, with a docs story first and one story per piece in 6.1. Close the old-model tickets (MOM-20, 21, 23, 24, 25, 41, 71, 72, 79) as Closed with a reason. MOM-45 is superseded by user-set day boundaries, and MOM-57, 64, 101 and 102 fold into the thin-slice pieces.
3. Claude opens the docs PR on this thread's branch (as earlier project threads did), CI green, and it merges when the owner says.
4. The docs PR also updates the build plan: the five safe blocks stay, the parked blocks get superseded notes, and thin-slice items go into `BACKLOG.md` with their Jira keys. The next `/day-end` step E then generates the thin-slice plan from them. `npm run plan:check` stays green throughout.
5. The thin slice is built through the normal day loop (approved). Code references are updated as each piece changes.

### Decisions (section 7)

1. **Who opens the PR: decided, Claude.** I was wrong that a thread branch breaks the rule; project threads opened PRs #1 to #7, #9 to #11 from their own branches. Before pulling the merge, the owner commits or stashes any local log edits, so the failure-log change doesn't clash with his working tree.
2. **Jira key: decided, a new thin-slice epic** with the docs story as its first item. MOM-16 has carried planning and housekeeping, and none of the four product epics fits a model rewrite.

## After approval (2026-10-26)

- **Jira:** EPIC 6 is MOM-105. The docs story is MOM-106. The pieces in 6.1 are MOM-107 (data model), MOM-108 (engine), MOM-109 (Hevy into entries), MOM-110 (manual entry), MOM-111 (setup), MOM-112 (home and week plan), MOM-113 (weekly review), MOM-114 (settings) and MOM-115 (retire the old model). Piece 11 is MOM-64, MOM-102 and MOM-116 (age-terms check). The follow-ons are MOM-117 (own sheet and templates) and MOM-118 (career playbook).
- **Closed as obsolete:** MOM-20, 21, 23, 24, 25, 33, 41, 43, 45, 46, 71, 72 and 79, each with a reason. MOM-57 and MOM-101 fold into the slice. MOM-78 (streak) is redefined on engine crossings.
- **Scoreboard mock-up:** the owner approved the layout and asked for a hero card at the top of home, like the original wireframe's "Your momentum" card. It is rebuilt on the new model (MOM-112): the ring shows floors met this week, not a blended velocity percentage; the headline is the week's biggest crossing; the bars show entries per day; and before any data there is an empty state, not 0%.
- **Change history:** later changes to the binding rules are recorded in the change log at the end of `docs/DOMAIN_MODEL.md`.

