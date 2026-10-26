# Momentum Domain Model

Binding source of truth for Momentum's goal model, setup, weekly review, settings and principles. Approved by the owner on 2026-10-26 (MOM-106, EPIC 6 MOM-105).

- This file supersedes the product rules in `docs/NINETY_DAY_PLAN_CONTEXT.md` (now frozen as the career case study and seed) and five rules in `docs/INTEGRATIONS_SPEC.md`. Both carry banners pointing here. The `InboundActivityPayload` contract in the integrations spec still holds.
- The design record, with the evidence, the test plan for the kill criteria and the build plan, is `docs/design/2026-10-26-goal-model-design.md`.
- If code and this file disagree, stop and flag it. Code still built on the old model is retired by MOM-115; until then, the old rules describe what the code does, and this file describes what it must become.
- Changes to this file go through a pull request and get a line in the change log at the end, so the reason for each change stays on record.

## 1. The model

Momentum is a state engine: work items are the engine, targets are the scoreboard, and the scoreboard is always computed from entries, never typed. One vocabulary covers every goal. "Lanes" survive only as source types (synced or manual), not as product structure.

The loop: doing a work item produces an entry through a source; entries are counted against targets; the engine computes the scoreboard; the weekly review turns it into one change and next week's plan.

### 1.1 The person

Some facts belong to the person, not to any goal. Setup collects them once and every goal reuses them.

| Concept | What it holds |
| --- | --- |
| Time anchors | Time zone, when their week starts, when their day ends. All user-set; no default is assumed silently. |
| Capacity | Usual capacity per day type (their own day types, in hours or sessions, their choice), plus dated exceptions such as vacations, addable any time. |
| Protected priorities | Life areas they name as protected (for example family or sleep), in their own words, unmeasured unless they choose to track them. |
| Handling preferences | Situational rules in their words ("when an interview lands on a workout day, ask me"). Offered only on a pattern or at the weekly review, never after one event. |
| Settings | "How Momentum talks to me" (section 4). |

### 1.2 Goals

A goal is something the person wants, with a "why" in their words. It has any timeframe; there is no fixed 13-week plan.

- **Shape:** ongoing (runs in blocks, for example a first block of 10 weeks), finite (has an end date), or project (finishes when its outcome is reached, optionally with a hard deadline).
- **State:** active or parked. A parked goal records how it comes back: a date, a season or condition, or "only when I ask". Momentum never resurfaces a parked goal on its own unless the person chose a return condition.
- **Sequencing:** when one idea holds several activities, setup asks "together or one first?" and says once that starting fewer goals usually works better. It is a suggestion, never a limit: the person can set up as many active goals as they want, and Momentum then shows the balance across them.
- **Defaults:** a goal sets the default completion mode and tone for everything inside it; each target or item can override.

### 1.3 Targets (the scoreboard)

A target is one thing being measured. A goal holds one or more.

| Field | Values | Notes |
| --- | --- | --- |
| Measure | count, quantity (number + unit), time, or checklist progress | Entry effort scales with this: a count is a tap, a quantity is one number, rich data stays in the person's own tool. |
| Role | effort or outcome | Effort targets are judged against levels. Outcome targets (interviews, offers, finished items) show the count and trend only, and get a level only when the person names a number or asks for one. |
| Period | weekly quota, named day slots, by a deadline, or monthly | Week boundaries come from the person's time anchors. Monthly suits opportunistic targets such as events. |
| Levels | floor (required), aspiration (optional), stretch (optional, temporary), safety ceiling (optional) | Over the ceiling shows a caution, never a celebration. Levels can ramp over a block. |
| Qualifying threshold | optional, user-set | Entries below it are kept and shown but not counted; the person can "count anyway". No forced thresholds. |
| Carry-over | habit: shortfall never rolls into the next period (catch-up inside the period is fine); cumulative: shortfall stays owed until the deadline | Set by the target's kind, shown to the person. |
| Completion mode | auto from source, confirm, or manual | Default from the goal. Auto-completion is always shown and undoable. |
| Sources | one or more bound sources (1.5) | Routing is set by the person. Templates only suggest. |

Partial credit is everywhere: "halfway to your floor" is a valid state, never a fail.

Example of the outcome rule: "applications sent, at least 5 a week" is an effort target and is judged; "interviews" is an outcome and is shown, not judged, so a week of strong applications and no callbacks never reads as a fail. A deadline goal of "15 items by the holiday" keeps its level because the number was the person's own.

### 1.4 Work items (the engine)

Work items are what the person does; doing them produces entries that move targets. Three kinds:

- **Habits:** recurring sessions that feed a periodic target (workouts, search sessions). They have no due date, only a period.
- **Milestones:** one-off checkpoints, optionally broken into steps ("learn the new technique", a prep checklist). Partial progress counts and is shown.
- **Deadline tasks:** a milestone with an external due date (a holiday, an application close). Setup records whether the date can move. When the person logs time against it, Momentum forecasts whether remaining work fits remaining capacity and says so plainly, tolerating rough data.

The weekly plan is the person's pick of which items to do on which of their days. Their picks drive reminders, so reminders follow the plan, not a fixed clock.

Carry-over follows the target's kind. Habits never carry forward: if the target is 3 workouts a week and 2 happen, next week is still 3, not 4, and the missed one is not owed (catch-up inside the same week is fine). Only milestone and deadline-task steps that weren't finished move forward, and nothing cuts them silently.

### 1.5 Sources and responsibility

Every target names who is responsible for knowing whether it happened.

| Source type | Examples | Who confirms | What Momentum asks |
| --- | --- | --- | --- |
| Synced | Hevy, calendar busy/free, a tracker sheet in the person's own Drive | The source | Only about connection health, never "did you work out?" |
| Manual | Tap, one number, start/stop timer, checklist tick | The person; the entry is the confirmation | Check-ins only as the person set them (never, end of their day, end of their week) |

- **The person's word beats any source.** A manual entry or correction always wins over a sync.
- **Bring your own tracker:** if the person already keeps a sheet, it is the source of truth. Momentum reads raw rows by header, flags header drift, and writes only additively with a preview. This is the first build after the thin slice (MOM-117): the bridge for anything no app with an API tracks well.
- **Missing integration:** suggest a bridge (for example Strava for watch runs), offer "request this integration", fall back to manual.
- **Inference is labelled.** Anything Momentum guesses (a calendar event counting as a meetup) shows what it counted and has one-tap undo.

### 1.6 Entries and corrections

An entry is one raw record: a workout, a time session, a tick, a sheet row. Entries are never edited by the engine, only counted or not counted.

- The person can **remove** (hidden, restorable), **restore**, **add**, and **count anyway** a below-threshold entry.
- Corrections are keyed to the source's own record id, so a resync never undoes them.
- **Merges are suggested, never silent.** When a manual entry and a later synced record look like the same event, Momentum suggests a merge and the person confirms.
- **Merges must not nag.** Possible duplicates from the same source are grouped into one prompt. Once the person has handled the same kind twice, Momentum offers a standing rule for that source (always merge, always keep both, or ask).
- **A failing source is a connection-health problem:** one notice, then quiet until it is fixed, with a mention in the weekly review.

### 1.7 The computed scoreboard

- Every number is computed from entries and the target in force for that period. Each closed period stores the target it was judged by, so a re-baseline never re-grades history.
- The engine detects threshold crossings (step, floor, aspiration, block end) and patterns both ways (holding, slipping). Celebrations scale with the crossing and follow the person's celebration setting.
- Claude never scores and never does math. The engine produces facts; Claude only writes words around them.

### 1.8 What this replaces

| Old model (`NINETY_DAY_PLAN_CONTEXT.md`, today's code) | New model |
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

## 2. Setup

Setup is a short guided conversation that turns a vague idea into the structure in section 1, one question at a time, and saves nothing until the person approves. The rules below are hard rules in the prompt and checks in the setup eval set, not good intentions.

### 2.1 Hard rules

1. **One question per turn, single-part, plain words.**
2. **Never assume anything about the person's life,** in questions, playbacks or examples. No days, times, week starts, "evenings", "weekends", "any three".
3. **Never announce a reminder, check-in or nudge.** Ask whether they want one.
4. **Offer the choice before examples:** "Do you have something in mind, or would some starting ideas help?" A suggestion the person takes is marked as a starting point and checked at the first weekly review.
5. **Skip what is already answered.** If an earlier answer or a person fact covers a question, say so in one line ("You told me your week starts Monday, so I'll skip that") and move on.
6. **When an answer doesn't fit, offer numbered interpretations** instead of guessing.
7. **Play back in short chunks, latest answer wins.** Each part is played back and approved as it finishes, never one long playback at the end. Preferences change mid-setup; the playback reflects the newest one.
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
12. **Final approval.** Each part has already been played back and approved in its own short chunk (after steps 3, 7, 10 and 11). The final step is a few lines confirming the whole, then save and show the settings page with everything editable. Not everything has to be settled at setup: details can be refined in use and at the weekly review.

### 2.3 How saving works

- Claude fills a draft object that must pass the same schema validation as the saved model. The playback is rendered from that validated draft, not from Claude's own summary, so what the person approves is exactly what gets saved.
- A quick path exists: accept sensible defaults and refine later. Every default is visible and editable.
- Nothing a person said is lost if validation fails; Claude asks one clarifying question instead.
- There is no turn cap in the prompt. Setup has its own cost budget per setup, in turns and tokens, set from measured eval runs (`LLM_GOVERNANCE.md` once re-baselined). When the budget runs out, setup fails closed: it plays back what was collected, offers the quick path, and saves nothing unapproved.

### 2.4 Playbooks

Playbooks are optional knowledge plug-ins: curated expansion questions and suggested structures for a common big goal. A playbook only suggests; the person decides. The thin slice ships generic setup plus expansion questions; a career playbook is the first setup follow-on (MOM-118).

### 2.5 Parked lever

"Find the few answers that drive the rest, then propose" could cut questions and cost. It stays off by default because more inference means more assumption slips. It is pulled only if measurement shows a cost or drop-off problem.

## 3. The layered weekly review

The end of the person's week is a special event: a short recap always, a deeper reflection when they want it, and one question that can change next week. It runs at the end of the week as the person defined it, at the planning moment they chose, never on a fixed weekday. Review and planning happen in one sitting by default, with a setting to split them.

### 3.1 The layers

| Layer | Shown | What it holds |
| --- | --- | --- |
| 1. Recap | Always | Per goal: where each target ended against its levels, crossings, and patterns in both directions. Informed tradeoffs are named, never judged ("you put the search first on two days"). A line on protected priorities only for areas the person named, in their own words, with no score. |
| 2. Reflection | Per the depth setting (default: a one-line offer) | A few questions: what worked, what got in the way, one lesson. Insights come from engine facts. It also teaches the app as needed ("you can count anyway"). |
| 3. One adjustment | Always offered, can be skipped | One question about next week: a one-week adjustment or a re-baseline. Followed by planning the week: the person picks items onto their days, which sets the reminders. |

### 3.2 What the engine can raise in layer 3

Only one of these per review, picked by the engine from facts:

- Stretch or aspiration hit repeatedly: offer a re-baseline (old periods keep the old target).
- A slipping pattern: a gentle check-in. A single bad week is not a pattern. The default is the floor missed in two periods running, shown and editable per person; it is a starting value to tune from use, not a fixed rule.
- Repeated exceptions to a stated priority: "Has this priority changed?"
- A recurring clash between two goals: offer a handling preference, never a ranking of goals.
- A suggestion taken at setup: "Still right for you?" (first review only).
- A deadline forecast that no longer fits: say so plainly and let the person choose: more time before the date (more sessions or hours in the weeks left), a smaller scope, moving the date, or accepting the risk. "Move the date" is offered only when setup recorded that the date can move. A holiday or an application close can't; a date the person set for themselves usually can.

### 3.3 Tone rules

- **Never pair a celebration with a request.** A celebration stands alone; the ask comes later or in layer 3.
- **Momentum informs, the person prioritizes.** It never invents priorities and never blocks a choice.
- **Claude writes the words, the engine supplies the facts.** The prompt gets a fact list (crossings, patterns, forecasts) and may not add numbers.

## 4. Settings and principles

If the right answer depends on the person, it is a setting with a sensible default, not a rule. To keep settings from sprawling, they live on one page, "How Momentum talks to me", are set in plain language during setup, and every one can be changed later.

### 4.1 How Momentum talks to me

| Setting | Choices | Default |
| --- | --- | --- |
| Tone | gentle to direct | middle |
| Reminders | off, or tied to the days they plan | off until they choose |
| Reminder times | a clock time per their own day type | none until they choose |
| Check-ins for manual targets | never, end of their day, end of their week | end of their week |
| Celebrations | low-key to big | low-key |
| Quiet times | times or days Momentum stays silent | none set, asked in setup |
| Balance mentions | at weekly planning, near deadlines only, or leave it to me | at weekly planning |
| Review depth | recap only, recap plus offer, full reflection | recap plus offer |
| Review and planning | one sitting, or separate | one sitting |
| Completion (per goal, override per target) | auto from source, confirm, manual | auto for synced, manual for manual |

- No default anchors a time or a day. Where a default would need one, the default is "none until you choose".
- Defaults are starting values, kept in one place in the code, so changing one after testing is a small change.
- A new default never overwrites a choice a person has already made.

### 4.2 Principles

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
11. **Unfinished work is moved, never silently cut.** This applies only to work that has to be done regardless of when: milestone and deadline-task steps. Habits never carry over, so a missed workout in a 3-a-week target is never owed the following week (1.3, 1.4).
12. **Never compute exact free time or pick a slot.** Momentum will never see the full complexity of someone's day or week, and it would be presumptuous to act as if it did. A calendar event understates its real cost (travel, pickups, winding down); say "shorter day", not "you have 45 minutes at 3".

### 4.3 What Momentum does not do

Momentum does not edit the person's documents, write resumes, or coach focus and getting started. Those stay in the person's own tools; Momentum tracks the progress signals they produce. This avoids drift toward recreating a general assistant or a notes app.

**The one exception is templates Momentum creates** (for example a starter tracker, a saved-postings folder or a prep sheet). Momentum can change those as the person's needs grow, such as adding a column when they need to store more. It changes them only additively, with a preview and the person's OK, and never removes their columns or data. Templates arrive with the sheet source (MOM-117).

## Change log

| Date | Change | Why | Ticket |
| --- | --- | --- | --- |
| 2026-10-26 | File created from the approved design pass (sections 1 to 4). Supersedes the product rules in `NINETY_DAY_PLAN_CONTEXT.md` and five rules in `INTEGRATIONS_SPEC.md`. | Tabletop walk-throughs of fitness, career, two setup runs and a balance week showed the old career-only, checkbox, 13-week model did not fit real goals. See the design record. | MOM-106 |
