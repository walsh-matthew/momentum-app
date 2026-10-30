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

- **A pick is an item on a date,** in the person's own time zone: never a time and never a slot, and nothing chooses a day for them. A pick is added or removed, never edited. Days that have passed are read-only. A habit with set days names them, and one tap ("Use these days") puts the habit on them; nothing is pre-filled.
- **Which kind of day a date is** is the person's to say, from their own day types, for any date they plan. It is optional per date, and no weekday is assumed to be one kind. It exists so the deadline forecast knows how much time a day gives; the person can copy last week's kinds onto this week's empty dates with one tap ("Same as last week"), and a date that already has a kind keeps it.
- **Without a time zone and a day end** the person's days are not known, so there is no plan. **Without a week start** the plan is the next 14 dates, never weeks, and nothing is said to have moved.
- **On screen** the plan says "plan your week" and "what kind of day is this?" with a short reason, and uses the person's own names for their day types (§2.1 plain language).
- **The deadline forecast** (a deadline task only; a milestone has none) is a fact about the days the person set aside, never a promise, and shows no minutes, free time or slot. A task is given the days the person put it on, from today to its due date. A day gives the usual time of the kind the person said that date is, shared equally among everything unfinished they put on it. The work left is the pace so far when steps are ticked and time is logged, else the person's own rough size less what is logged, within a margin either side because both are rough. The engine decides the verdict (fits, close, short, not enough to say, past due); "move the date" is offered only when setup recorded that it can move.
- **Nothing is guessed for the forecast.** A day with no kind, a kind with no usual time, or time counted in sessions gives no verdict and says what is missing; nothing set aside says so. When the due date is later than the last day the person has planned anything, the days set aside so far are still judged: if they are already enough, it says so ("so far"); otherwise it says how many days are set aside through which date and to plan more as they go, and makes no close or short claim until the planned days reach the due date.

Carry-over follows the target's kind. Habits never carry forward: if the target is 3 workouts a week and 2 happen, next week is still 3, not 4, and the missed one is not owed (catch-up inside the same week is fine). Only milestone and deadline-task steps that weren't finished move forward, and nothing cuts them silently.

### 1.5 Sources and responsibility

Every target names who is responsible for knowing whether it happened.

| Source type | Examples | Who confirms | What Momentum asks |
| --- | --- | --- | --- |
| Synced | Hevy, calendar busy/free, a tracker sheet in the person's own Google Drive or OneDrive | The source | Only about connection health, never "did you work out?" |
| Manual | Tap, one number, start/stop timer, checklist tick | The person; the entry is the confirmation | Check-ins only as the person set them (never, end of their day, end of their week) |

- **The person's word beats any source.** A manual entry or correction always wins over a sync.
- **Bring your own tracker:** if the person already keeps a sheet, it is the source of truth. Momentum reads raw rows by header, flags header drift, and writes only additively with a preview. This is the first build after the thin slice (MOM-117): the bridge for anything no app with an API tracks well. Both Google Drive and OneDrive are needed: Google comes first (MOM-117) and OneDrive/Excel follows (MOM-136), and the sheet source is the same for any provider.
  - **The person picks the file.** They choose it in the provider's own file picker, never by pasting a link, so Momentum can see only the files they pick or that Momentum created, never their whole Drive.
  - **Sheets come in every shape.** Momentum reads the header row, Claude proposes which columns count in plain words, the person confirms, and the engine counts. The mapping follows header names, not column letters. It covers which tab, which header row, and a date or a week number for each counted row. A renamed header is flagged once, and its column stops counting until the person re-confirms. Only the named columns count (for example Actual, not Plan), and totals and formula rows are never read.
  - **Read when the person looks.** Momentum reads the sheet when the person opens it, before the weekly review, and when they tap Refresh, and it shows when it last read. There is no background read until a review is ever found running on stale numbers.
  - **Keep only what counts.** Momentum stores the counted cells, each row's date and a row reference (so corrections survive the next read). It never stores other columns or a copy of the sheet.
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
4. **Offer the choice before suggestions.** Before a list of suggested goals, numbers or steps, ask "Do you have something in mind, or would some starting ideas help?", and give the list only if they want it. Asking for ideas, examples or a recommendation in any answer counts as wanting it, wherever they ask. When the question is about the goal itself or a number, it carries no examples, because an example there plants the answer. A few short examples inside any other question are fine ("never tried it, dabbled a little, or done it before?"), and so is explaining a question with examples when the person asks what it means. Rule 2 applies to every example, and no example names an activity the person has not said. When the person asks for a recommendation, Claude gives one: it may use well-established general knowledge, framed as research ("research suggests habits take about two months on average to become automatic, with a wide range"), offered as a proposal they accept with one tap, and never an assumption about their own life. A suggestion the person takes is marked as a starting point and checked at the first weekly review.
5. **Skip what is already answered.** If an earlier answer or a person fact covers a question, say so in one line ("You told me your week starts Monday, so I'll skip that") and move on. A question on the same topic straight after the person's reply is a follow-up or a clarification, not a repeat; asking a topic again after the conversation has moved on is a repeat.
6. **When an answer doesn't fit, offer numbered interpretations** instead of guessing.
7. **Play back in short chunks, latest answer wins.** Each part is played back and approved as it finishes, never one long playback at the end. Preferences change mid-setup; the playback reflects the newest one.
8. **Claude does no math and sets no score.** It proposes structure; the engine validates it.

**Plain language (applies to every rule above).** The person may never have set up anything like this before, so setup has to be as clear as the two tabletop runs it was designed from.

- **Questions are in everyday words, with a reason.** A word the model uses (protected, priorities, floor, aspiration, target, effort, outcome, block and the like) is said only with what it means in the same sentence, or not at all. The question is the core ask on its own, in about 12 words or fewer, shown in bold. Every setup card has exactly one bold line, the one the person most needs to read: the question; on a card of starting ideas or readings of an answer, a short line in code's words naming what the options are about, with the person's counted thing and goal, in place of the question; on an error card, the error's headline, with the question kept above it in regular weight. Under it, in regular weight, a detail line carries the reason where it is not plain and, where it helps, a few short examples (rule 4). The reason says what the answer is used for ("We plan back from that day."), never that people often miss it, and an abstract word gets a concrete example there ("Say you're sick or work gets busy"). The detail line never asks a second question.
- **A number is asked for by what it is for.** A question about a number, and the bold line of a card of starting ideas or readings of an answer about it, says in everyday words what the number is for, with the person's counted thing, and never "fewest", "floor", "aim", "aspiration", "target" or "baseline" on their own: "How many pages make a week count, even a hard one?" for the least that still counts, "How many pages a week are you hoping for?" for the number hoped for. Code writes these words, the same for every counted thing. The verb agrees with the counted thing ("make" for "workouts", "makes" for "yoga class"), and an idea button for a number names the thing too ("At least 2 workouts a week", "Aiming for 3 workouts a week").
- **A fact is quoted, never pointed at.** A line never points at an earlier answer by an abstract name ("where you are now", "your baseline", "what you said earlier"). It quotes the fact in the person's own words ("You said you read about 50 pages a week now."), or it is left out; the detail line of starting ideas, which says where they come from, is that quote or nothing.
- **A lead-in only reacts.** The line before a question reacts to the last answer, in one short line, or is left out. It never previews the question ("Next, I'll check...", "Next is the start date"). The fixed day-end explanation and the answer to "What do you mean?" are explanations, not lead-ins.
- **Playback is restated, not parroted.** Claude writes a clean version of the person's words in their own voice, fixing grammar, slang and voice-to-text ("wanna"), and code checks it adds no activity, number, date, time or weekday they did not say. Code then restates it in the second person ("because you want to stay healthy for your family"), grouped by part. A clean version that fails the check is not used: code restates the person's own words instead, and words it cannot restate safely are shown as said, in quotes. What the playback shows is what is saved once the person approves it; their raw words stay only in the conversation, which is not stored.
- **Every change has a way out.** Wherever the person can change something, a button just as easy to reach as the change itself lets them keep it as it is.
- **"What do you mean?" is always answered,** in plainer words with a few examples, and setup carries on from there. No check refuses that answer.

### 2.2 The conversation, in order

1. **The idea,** in their words.
2. **Why** it matters to them.
3. **Break it up:** is this one goal or several? If several, together or one first? Others are parked with a return condition (date, season or condition, or only when asked).
4. **What else matters:** besides this goal, what else in their life matters right now that the plan shouldn't crowd out (saved as protected priorities), asked in those words with a few examples and, once known, what the goal will take from their week. Before any detailed planning.
5. **Starting point:** where they are now. This often surfaces a natural first milestone.
6. **Shape and timeframe:** ongoing (first block length), end date, or deadline. Claude never works a date out. When the person names a relative day ("Monday", "in two weeks", "the 15th"), code works out the date from their own today (their time zone once known, their device's before that) and shows it as a proposal ("Start Monday, Nov 2?") that counts only once they accept it; words that name no day ("sometime next month") get the question again, with a date picker. For a deadline, ask as a separate question whether the date can move.
7. **What counts:** effort and outcome targets, the floor, and an aspiration if they want one. No forced failure-rate guesses.
8. **Expansion questions:** a few best-practice prompts with examples, to surface unknown unknowns. A playbook, when one exists, supplies these.
9. **Source for each target:** "Where do you track this now, if anywhere?" The answer picks synced, their own sheet, or manual (tap, number, timer).
10. **Planning and capacity:** their day end, their week start (only when it is needed, see below), their day types and capacity, fixed slots or a flexible quota, and when they want to plan their week. Person facts are asked once, on the first goal only.
    - **Day end:** asked once, on the first goal, with no default; Momentum never assumes one (principle 1). The question has to make the difference clear. If the person's day runs past midnight and ends between midnight and 06:00 (say 02:00), that is an early day end: their day runs from that time to the same time the next day, so a late-night entry at 01:00 counts toward the day before. Any other day end (say 21:00) is just the time they check in, and their day still runs from midnight to midnight. Time zone is asked the same way: once, never assumed.
    - **Week start:** asked only when the first weekly or day-slot target needs it. A person whose goals are all deadline goals is never asked.
11. **How Momentum talks to me:** asked conversationally, not as a form (section 4).
12. **Final approval.** Each part has already been played back and approved in its own short chunk (after steps 3, 7, 10 and 11). The final step is a few lines confirming the whole, then save and show the settings page with everything editable. Not everything has to be settled at setup: details can be refined in use and at the weekly review.

### 2.3 How saving works

- Claude fills a draft object that must pass the same schema validation as the saved model. The playback is put together by code from that validated draft, not from Claude's own summary; the only words of Claude's in it are the clean versions of the person's words that passed the check (§2.1 plain language), so what the person approves is exactly what gets saved.
- A reply of Claude's that breaks a rule is thrown away and asked for again, and the next try is told, in fixed words written by code, which rule failed and what to do instead; nothing the person typed goes into that note. A value with no source is asked for in that turn, never guessed again. The plain-language checks (a lead-in that previews, an activity nobody said) get one such retry, and then the reply is shown and the rule logged: only the hard rules and the draft rules can end in "try again".
- A quick path exists: accept sensible defaults and refine later. Every default is visible and editable.
- Nothing a person said is lost if validation fails; Claude asks one clarifying question instead.
- There is no turn cap in the prompt. Setup has its own cost budget per setup, in turns and tokens, set from measured eval runs (`LLM_GOVERNANCE.md` once re-baselined). When the budget runs out, setup fails closed: it plays back what was collected, offers the quick path, and saves nothing unapproved.

### 2.4 Playbooks

Playbooks are optional knowledge plug-ins: curated expansion questions and suggested structures for a common big goal. A playbook only suggests; the person decides. The thin slice ships generic setup plus expansion questions; a career playbook is the first setup follow-on (MOM-118).

### 2.5 Parked lever

"Find the few answers that drive the rest, then propose" could cut questions and cost. It stays off by default because more inference means more assumption slips. It is pulled only if measurement shows a cost or drop-off problem.

## 3. The layered weekly review

The end of the person's week is a special event: a short recap always, a deeper reflection when they want it, and one question that can change next week. It runs at the end of the week as the person defined it, at the planning moment they chose, never on a fixed weekday. Review and planning happen in one sitting by default, with a setting to split them. When the planning day is the week's own last day, the review counts the week through that day and says so, and anything logged later that day shows under "Since this recap".

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

**The one exception is templates Momentum creates** (for example a starter tracker, a saved-postings folder or a prep sheet). Momentum can change those as the person's needs grow, such as adding a column when they need to store more. It changes them only additively, with a preview and the person's OK, and never removes their columns or data. Templates arrive with the sheet source (MOM-117). Momentum creates them in the person's own Drive (or OneDrive), in a "Momentum" folder the person owns. Momentum never deletes them, and they stay the person's if they leave.

## Change log

| Date | Change | Why | Ticket |
| --- | --- | --- | --- |
| 2026-10-26 | File created from the approved design pass (sections 1 to 4). Supersedes the product rules in `NINETY_DAY_PLAN_CONTEXT.md` and five rules in `INTEGRATIONS_SPEC.md`. | Tabletop walk-throughs of fitness, career, two setup runs and a balance week showed the old career-only, checkbox, 13-week model did not fit real goals. See the design record. | MOM-106 |
| 2026-10-27 | §2.2 step 10 now asks the day end (once, on the first goal, no default), explains the early day end (after midnight, before 06:00, moves the day boundary) versus a check-in time (boundary stays at midnight), and asks the week start only when the first weekly or day-slot target needs it. | The scoreboard engine refuses to compute without a day end and a week start for weekly periods, and setup builds from this section. | MOM-125 |
| 2026-10-27 | §2.2 step 9 is now one question: "Where do you track this now, if anywhere?" (was "Are you already tracking this? Where?"). | The old wording was two asks, which setup's first hard rule (one single-part question per turn) forbids; MOM-111's first block found it. | MOM-111 |
| 2026-10-29 | §1.5 bring your own tracker names Google Drive and OneDrive (Google first, the same source for both) and adds four rules: the person picks the file, mapping follows headers and fits any sheet shape, reads happen when the person looks, and only counted cells are kept. §4.3 says where Momentum's templates live. | Owner design pass on the sheet source, 2026-10-29. Both stores are common in households like the owner's; the narrow file permission keeps the privacy ask and the provider review small. | MOM-117, MOM-136 |
| 2026-10-29 | §3 says what the review does when the planning day is the week's own last day: it counts the week through that day and says so, and anything logged later that day shows under "Since this recap". | The engine calls a week open until the day after it ends, so a recap on the last day would have missed a slipping pattern ending that week until the next cycle. Counting the week through that day fixes it without changing the engine, and a later entry is shown against the stored recap in words, never by rewriting it. | MOM-113 |
| 2026-10-29 | §2.1 rule 4 narrowed from every example to lists of suggestions: a question about the goal itself or a number still carries no examples, but short examples inside any other question, and examples that explain a question the person asked about, are allowed. Rule 5 says a same-topic question straight after the reply is a follow-up, not a repeat. | The tabletop testers found short examples clarifying (run 2: examples unblocked the tester). In production the ban on every example, with the skip rule, left "what do you mean?" with no allowed answer: seven replies were thrown away and setup ended at Try again. | MOM-111 |
| 2026-10-29 | §2.1 adds the plain-language principle (everyday words with a reason and examples, playback restated not parroted, a way out of every change, "what do you mean?" always answered). §2.2 step 4 asks in those words. §2.3 says the playback is restated in the second person. | The owner's live setup on a phone: "what needs protecting" was not understood, the playback pasted the person's words back as typed, and the only way out of a change was a small link. The build had turned the tabletops' judgment into hard rules and terse step summaries. | MOM-111 |
| 2026-10-29 | §2.2 step 6: Claude never works a date out; code turns a relative day ("Monday", "in two weeks", "the 15th") into a date from the person's own today and shows it as a proposal they accept, and vague words get the question again with a date picker (was "always ask for the exact date; never infer a week"). | The owner's phone run: "next week" then "Monday" dead-ended, because the only allowed answer was an exact date the person had to type. Code can work the date out without guessing, and the proposal keeps the person's yes in front of anything saved (principle 1, rule 8). | MOM-111 |
| 2026-10-29 | §2.1 plain language: the playback shows Claude's clean version of the person's words (grammar, slang and voice-to-text fixed), used only when a code check finds it adds no activity, number, date, time or weekday they did not say, and what is shown is what is saved once approved (was "code changes only the voice"). | Voice-to-text on a phone came back as typed ("wanna"), and code alone cannot fix grammar. The check keeps Claude from adding anything, and saving what was shown keeps "what you approve is what is saved" (§2.3). Owner decision 1, 2026-10-29. | MOM-111 |
| 2026-10-29 | §2.1 plain language adds the lead-in rule: the line before a question only reacts to the last answer, in one short line, or is left out, and never previews the question; the reason goes in the question. The day-end explanation and the answer to "What do you mean?" are not lead-ins. | The owner's phone run: lead-ins such as "Next, I'll check..." and "Next is the start date" read as a second question and split the meaning from the ask. Owner decision 2, 2026-10-29. | MOM-111 |
| 2026-10-29 | §2.1 rule 4: asking for ideas, examples or a recommendation anywhere counts as wanting suggestions; a recommendation may use well-established general knowledge framed as research, offered as a one-tap proposal; no example names an activity the person has not said. | The owner asked "any recommendations?" and was refused three times, because the check allowed ideas only straight after the offer; and a goal of "physical fitness" came back as questions about workouts and lifting. | MOM-111 |
| 2026-10-29 | §2.3: the playback is put together by code from the validated draft, and the only words of Claude's in it are the checked clean versions of the person's words (was "rendered from the validated draft, not from Claude's own summary"); a thrown-away reply is retried with fixed feedback, and the plain-language checks never end a setup in "try again". | Follows from the playback change above. The retry note is the fix for the owner's dead ends: each retry used to send exactly the same input, so the same mistake came back until "try again". | MOM-111 |
| 2026-10-29 | §1.4 says what the week plan is and stores: a pick is an item on a date (never a time or a slot, nothing chosen for the person), added or removed and never edited, past days read-only; which of their day types a date is, optional per date and copyable from last week with one tap onto empty dates only; no plan without a time zone and day end, the next 14 dates without a week start; and the plan's screens follow the plain-language rule. | The week plan (MOM-112 block 2) needed somewhere to keep the person's own choices and a way for the deadline forecast to know how much time a day gives, without computing free time or assuming a weekday is always one kind of day (principles 1 and 12). Owner-approved design, 2026-10-29. Migration 019. | MOM-112 |
| 2026-10-29 | §1.4 adds the deadline forecast rules: what a deadline task is given from the days set aside (a kind of day's usual time, shared equally among what is on the day, in minutes), the margin on rough sizes, no guessing for a missing kind, time or sessions, and what is said when the plan does not reach the due date (enough so far, else how many days are set aside, with no close or short claim). | RAID A-07 (a forecast judges one item against the capacity it is handed) and the owner's decisions of 2026-10-29 for MOM-112 slice 2: the forecast stays a fact about the days set aside, and a due date past the plan is not called short or close. | MOM-112 |
| 2026-10-29 | §2.1 plain language: the question is the core ask, in about 12 words or fewer, shown in bold; the reason (what the answer is used for) and any short examples go in a detail line under it, in regular weight, which never asks a second question (was "the reason after the ask", in the same sentence). | The owner's second phone run: long bold questions with the examples and reason folded in were hard to read on a phone, and reasons such as "people often miss this" said nothing about what the answer is for. Owner decision D1, 2026-10-29. | MOM-111 |
| 2026-10-29 | §2.2 step 6: a date question leads with a suggestion whenever code or the conversation has one (the person's today for a start date; a date they said, or a length counted from the start date, for the others), shown as the date confirmation with Yes first; the question with no suggestion is used only when nothing can be suggested and never asks for an "exact date". §2.1 plain language: options are written from the conversation, each naming what is counted and its period, with a detail line for context, never a fixed scale. | The owner's round 3 screenshot review: a bare "What is the exact date it has to be done by?" though a date was known, and starting ideas reading "2 a week" with nothing saying what was counted. | MOM-111 |
| 2026-10-29 | §2.1 plain language: a question that asks for a number names the thing counted, in the person's own words, and whether it asks for the least that still counts or the aim; its options say which number they set ("At least 2 a week", "Aiming for 3 a week"); the counted thing in options, details and the final recap is always the person's own word. §2.2 step 6: never a date shown and then asked for; a known date is the question itself ("Start today, Friday, Oct 30?"). An error in setup reads as a gentle alert that names the problem, says what to do, never blames the person and never names the model. | The owner's round 3b screenshot review: number questions and options that had to be decoded, a stock "sessions a week", a date shown in the lead-in above a question asking for one, and error cards that read as failures. | MOM-111 |
| 2026-10-29 | §2.1 plain language: every setup card has exactly one bold line, the one the person most needs to read (the question; on a card of starting ideas or readings of an answer, code's own line naming what the options are about, with the person's counted thing and goal, in place of the question; on an error card, its headline). The final recap and the playback read as the person's goal ("Your goal: at least 3 runs a week"; with more than one goal, the goal's name first), keeping the person's own capitals. | The round 3b screenshot review by the owner and a second reviewer: cards that went mid-bold, heavy-bold, then light-bold, an ideas card that "lacked context, what does 'pages a week' mean", and a recap ("You'll count runs") that read as telling the person what they will do, not their goal. | MOM-111 |
| 2026-10-29 | §2.1 plain language: a number is asked for by what it is for, in everyday words written by code ("How many pages makes a week count, even a hard one?", "How many pages a week are you hoping for?"), never "fewest", "floor", "aim", "aspiration", "target" or "baseline" on their own (was "names whether it asks for the least that still counts or the aim"); and a fact is quoted in the person's own words or left out, never pointed at by an abstract name ("where you are now"). | The owner's review of the reading ideas card: "Some starting points for the fewest pages in a week" (what are "fewest pages"?) and "Pages a week, from what you said about where you are now" (pages a week? where I am now?) read as jargon without context. | MOM-111 |
| 2026-10-30 | §2.1 plain language: the verb of a number question agrees with the counted thing ("How many workouts make a week count, even a hard one?"); the quick path's missing-floor line is that same question; and idea buttons for a number name the counted thing (was "makes" for every counted thing; idea buttons without the thing). | The owner's review of round 3c: "how many workouts makes a week count" is the wrong verb, the quick path said "the least you aim for", and the idea buttons did not say what they count. | MOM-111 |
