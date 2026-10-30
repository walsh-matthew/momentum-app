Template: Google critical user journeys · Last updated: 2026-10-30 (this branch) · Filled by: MOM-144 first fill · Open gaps: 25, listed at the end

# Momentum user journeys

Five journeys, each a goal in the person's words. The rules behind every screen are in [`docs/DOMAIN_MODEL.md`](../DOMAIN_MODEL.md); this file links to its sections and does not copy them. Testers are described by role only: the owner and household testers. The family trial is adults only (MOM-126).

## How to read this

*Sources: the MOM-144 block prompt; `docs/DOMAIN_MODEL.md` §2; the deck for the first product review (https://claude.ai/artifact/EABm8qR3EfZSWeYF2HFfBK).*

- **Screens on `main` only.** A step with no screen on `main` is a gap, and names the ticket that would cover it when one exists.
- **Health** is green, amber or red, with the latest evidence. A journey with no evidence is "Not yet rated" plus a gap. A browser test is listed as "Evidence so far: <spec> (browser test, not a phone run)" so it is not lost, but it does not rate a journey.
- **Measure** has two parts: goal satisfaction (one question, asked during the family trial) and task completion (finished, abandoned, or had to go back). The satisfaction question is not written yet (Gap 1).
- **Gaps** are numbered once, at the end. Each journey points at them by number and names the step each one breaks.

## J1 Set up my first goal

### 1. Goal

*Sources: `docs/DOMAIN_MODEL.md` §2 (opening paragraph); design record `docs/design/2026-10-26-goal-model-design.md` §2.*

"I have a vague idea of what I want. Help me turn it into something I can track, without my having to learn how the app thinks." It matters because setup is the first thing a new person meets: criterion 1 (setup works for someone other than the owner) is the one the family trial tests first (design record §5).

### 2. Tasks

*Sources: `components/setup/SetupConversation.tsx`, `QuestionCard.tsx`, `PlaybackCard.tsx`, `FinalCard.tsx`, `QuickPathCard.tsx`, `RetryNotice.tsx`; `lib/setup/session.ts` (error wording); `docs/DOMAIN_MODEL.md` §2.1 to §2.3; `tests/e2e/setup.spec.ts`; MOM-111 comments 2026-10-29 to 2026-10-30; `docs/LLM_GOVERNANCE.md` (budget and quick path).*

1. **Start.** The person opens `/setup` and sees "Let's set up your goals", a short explanation (a conversation with Claude, one question at a time, nothing saved until they approve, what they type is sent to Claude, link to the privacy notice) and a **Start** button.
   - *Answers:* tap Start, or follow the privacy link.
   - *Success:* the first question appears.
   - *Failure exit:* if the first reply does not arrive, a single alert card with **Try again** (there is no question yet and no answer to change).
   - *Gap:* nothing in the app links to `/setup` (Gap 4).
2. **Answer the questions, one at a time.** A bold question of about 12 words or fewer, a detail line under it, and the ways to answer. The conversation follows the order in `docs/DOMAIN_MODEL.md` §2.2: the idea, why, one goal or several, what else matters, starting point, shape and timeframe, what counts, expansion questions, where they track it, planning and capacity, how Momentum talks to them.
   - *Every way to answer:* type in "Your answer" and tap Send; on a proposal, **Yes** (first), one of the offered alternatives, or "type instead"; on an offer, **Some ideas, please**; on a card of starting ideas or readings of an answer, a numbered button for each ("Option n") or type their own; on a date, one date button that opens the phone's own date picker; **What does this mean?** on every card, which answers in plainer words and carries on.
   - *Success:* each answer is accepted and the next question or a playback appears.
   - *Failure exits:*
     - **Error cards** keep the question above them and show one button. The headline depends on the cause: "Sorry, I didn't follow that" (Change my answer), "Couldn't connect" (network), "Things are busy right now" (busy, or the spacing wait), "That didn't go through" (no answer), "That took too long", "Setup isn't available right now" (not configured) and "Your last answer wasn't sent" (after a reload; **Send it again**). The buttons are **Try again**, **Send it again** or **Change my answer**.
     - **An answer that does not fit**: setup offers numbered readings instead of guessing (§2.1 rule 6).
     - **A date it can't read** ("sometime next month"): the question comes back with a date picker; a relative day ("Monday") becomes a proposal such as "Start Monday, Nov 2?" that counts only when the person accepts it (§2.2 step 6).
     - **An app that can't be read yet** (for example a watch app): setup says so in one line and records that the person logs it themselves (MOM-111 comment 2026-10-29, round 2 live run).
     - **A reload or a dropped phone tab** while a reply is in flight: the question stays on screen with the answer waiting and a way to send it again or change it (MOM-111 finding 10).
3. **Approve each part as it finishes.** After steps 3, 7, 10 and 11 of §2.2 the person sees a playback of that part, restated in the second person.
   - *Answers:* **Yes, that is right**, or **Change something**, which opens "What would you like to change?" with **Send the change** and **Keep it as it is**.
   - *Success:* the part is approved and setup moves on.
   - *Failure exit:* the same error cards as step 2.
4. **Confirm the whole.** "Ready to save?" with a few lines and "Nothing is saved until you tap Save."
   - *Answers:* **Save my setup**, or **Change something** (then **Send the change** or **Keep it as it is**, which only closes the box).
   - *Success:* "Your setup is saved", with the count of goals and things to count, and two buttons: **Log an entry** and **Back to home**.
   - *Failure exit:* a save that does not go through shows an alert headline ("Couldn't connect. Nothing was saved yet. Check your connection, then try again.") and the person can tap Save again.
5. **Start again.** A small "Start again" link on every card asks first: "Start again? What you have said so far will be cleared." with **Yes, start again** and **Keep going**.
6. **The quick path (Claude stops).** When the per-setup budget is spent, the shared limit is reached, or the limits cannot be checked, setup stops using Claude and shows "Finish without more questions": why it stopped, everything said so far, and "Still needed before this can be saved".
   - *Answers:* **Save what I have** (off until nothing is missing) or **Start again**.
   - *Success:* what the person said is saved if it is complete. Otherwise nothing is saved and they start again. No default is applied (§2.3, change-log row 2026-10-30).
   - *Failure exit:* a save error shows an alert on the card.
   - *Gap:* a person who runs out of budget before giving a needed item (for example a time zone) must start again and loses everything they said (Gap 6).

### 3. Measure

*Sources: design record §5 (criterion 1); the MOM-144 block prompt.*

- **Goal satisfaction:** one question asked of each trial user, such as "Was that time useful?" in the design record's criterion 1 measure. The wording for this product review cycle is not written (Gap 1).
- **Task completion:** per setup, finished (saved), abandoned (left without saving), or had to go back (used **Change my answer**, **Change something** or **Start again**). The design record's "heavy edit" count (a change to a target, level or source at playback, two or fewer per setup) is the pass bar.

### 4. Health

*Sources: the deck's setup slide; MOM-111 comments 2026-10-29 (clarity fix, fix round, round 2, round 3, round 3b, round 3c); `docs/FAILURE_LOG.md` F-064 to F-066; PRs #65 and #67; `tests/e2e/setup.spec.ts`, `tests/e2e/setup-cards.spec.ts`.*

**Amber.** Setup works end to end, but it has needed three review rounds from the owner's phone runs.

- **Run 1:** 14 issues with one root cause (the checks judged the previous screen, not what the person said). Fixed in PR #65.
- **Run 2:** the source step failed every time (the prompt never named the allowed app values, so replies were thrown away as shape errors, and every retry got the same general note). Fixed in PR #67. A live run then had 0 schema errors in 24 calls.
- **Run 3:** polish from the owner's screenshot review (dates, error cards, option wording). It is on MOM-111 today.
- **Earlier production findings the same day:** F-064 (a follow-up question on the same topic was thrown away), F-065 (no way back from "Change something") and F-066 (questions in the model's own words, a pasted-back playback).
- Evidence so far: `setup.spec.ts` and `setup-cards.spec.ts` (browser tests, not phone runs).

### 5. Known gaps

*Sources: Jira (MOM-111 comments, MOM-132, MOM-139, MOM-140, MOM-143, MOM-30); `BACKLOG.md`.*

| Step | Gap |
| --- | --- |
| 1 Start | Gap 4 (MOM-143); Gap 5 (MOM-132: a goal or target cannot be added after the first setup) |
| 2 Answer | Gap 7 (phone-only checks); Gap 8 (newest wording has had no live call); Gap 9 (MOM-139); Gap 10 (MOM-140) |
| 6 Quick path | Gap 6 (MOM-111 backlog note) |
| All | Gap 1 (satisfaction question); Gap 2 (MOM-131); Gap 3 (MOM-30) |

## J2 Log what I did

### 1. Goal

*Sources: `docs/DOMAIN_MODEL.md` §1.5 (manual sources) and §1.6; MOM-110 description.*

"Record that I did it, in a few seconds, on my phone." The entry is the person's own confirmation, and a manual entry always wins over a sync (§1.5).

### 2. Tasks

*Sources: `app/log/page.tsx`; `components/entries/` (TapControl, NumberControl, TimerControl, MinutesControl, ChecklistControl, DayPicker, EntryList, EntryFeedback); `tests/e2e/manual-entry.spec.ts`; MOM-110 comments 2026-10-27 to 2026-10-29.*

1. **Open the log.** The page is `/log`. It is a minimal try-it page: signed in only, and not in the navigation. The only link to it on `main` is **Log an entry** on the "Your setup is saved" card (Gap 12).
2. **Log one of four kinds,** according to what the person's target counts:
   - a **tap** for a count;
   - **one number** for a quantity (only this opens the number pad);
   - a **timer** (start and stop), or **typed minutes** for time that was not timed (a whole number from 1 to 1,440);
   - a **checklist tick** for a milestone step.
   - *Success:* the entry appears under Recent entries with feedback in words.
3. **Say which day** (optional): now, or a chosen day within the last 7 local days through a grid of day buttons ("Change day"). An earlier day is stored as noon local time and shown as a day only ("Mon, Oct 26 · the day you chose").
4. **Remove or restore** the person's own manual entry. A removed entry is hidden and can be restored; un-ticking a step and ticking it again keeps one entry.
5. **Failure exits, in words:**
   - no time zone set: logging is refused until the person has one, and nothing is defaulted;
   - no day end set: the day picker is replaced by a note, and logging for now still works;
   - an entry before its goal's start date is saved, says so ("Saved. It's before this goal's start date … so it won't count unless you move the start date earlier.") and is labelled "Before the goal's start, not counted";
   - not a real date, in the future, or older than 7 days (the picker offers only valid days, so these are refused by the server and covered by service tests).

### 3. Measure

*Sources: design record §5 (criterion 2).*

- **Goal satisfaction:** the trial question is not written (Gap 1).
- **Task completion:** logged, abandoned, or had to go back (removed or restored an entry). The design record's bar: each user says logging is not a chore, and no one silently stops logging a manual target for a whole week.

### 4. Health

*Sources: MOM-110 comments 2026-10-28 and 2026-10-29; `tests/e2e/manual-entry.spec.ts`.*

**Not yet rated.** Evidence so far: `manual-entry.spec.ts` (browser test, not a phone run). The MOM-110 comment of 2026-10-29 records that the real-iPhone check is still to do (Gap 11).

### 5. Known gaps

*Sources: Jira MOM-110 (description and comments), MOM-112; RAID R-20 (frozen log); `BACKLOG.md`.*

MOM-110 is still To Do in Jira. Its five acceptance criteria are met on `main` except the phone one, which is the real-iPhone check, so the gaps below are the unbuilt or unchecked parts.

| Step | Gap |
| --- | --- |
| All | Gap 11 (the real-iPhone check, MOM-110) |
| 1 Open the log | Gap 12 (no navigation link; MOM-112 was to put the controls on home) |
| 2 Timer | Gap 13 (a running timer lives in one browser; typed minutes cover the unrecorded time) |
| 3 Say which day | Gap 14 (no day end means no other day and no start-date judgement) |
| 4 Remove or restore | Gap 15 (own manual entries only; synced entries wait for MOM-112) |

## J3 Connect where I already track it

### 1. Goal

*Sources: `docs/DOMAIN_MODEL.md` §1.5 (sources and responsibility); `docs/INTEGRATIONS_SPEC.md` §3.*

"I already use Hevy, so count what I did there without my typing it again." The source confirms synced records, and Momentum asks only about connection health (§1.5).

### 2. Tasks

*Sources: `app/connections/page.tsx`; `components/integrations/ConnectionControls.tsx`, `HevySyncControl.tsx`; `docs/INTEGRATIONS_SPEC.md` §3A, §3C and the "Entries path" section; `tests/e2e/connections.spec.ts`.*

1. **Open Connections** from the navigation. Each app shows a status in words: Not connected, Connected, Needs reconnect or Connection problem.
2. **Connect Hevy.** The person pastes the key into a password field (shown never again) and taps **Connect Hevy**.
   - *Failure exits:* a bad key shows a message and is not echoed; a refused key later shows "Needs reconnect" and **Reconnect Hevy**.
3. **Sync now.** On a connected Hevy card, **Sync now** adds entries for the workouts bound to the person's targets. A second tap adds none.
   - *Failure exits:* no target bound to Hevy says so and writes nothing; a refused key shows one notice and the card asks to reconnect; Hevy not answering says to try again, changes nothing and stays connected.
4. **Connect Google Calendar.** **Connect Google Calendar** takes the person to Google to approve read-only access, then returns to Connections with a plain message.
   - *Failure exits:* with no client configured the button comes back with a plain message and connects nothing.
5. **Disconnect.** **Disconnect** asks for a second click ("Disconnect Hevy" or "Keep it connected") because it deletes the stored connection.
6. **An app that is not supported:** the model says to suggest a bridge, offer a request, and fall back to manual entry (§1.5). In setup the person is told which apps can't be read yet (J1 step 2); Connections has no request control (Gap 17).

### 3. Measure

*Sources: design record §5.*

- **Goal satisfaction:** the trial question is not written (Gap 1).
- **Task completion:** connected and synced, abandoned, or had to go back (reconnect, or fall back to manual entry).

### 4. Health

*Sources: `tests/e2e/connections.spec.ts`.*

**Not yet rated** (Gap 16). Evidence so far: `connections.spec.ts` (browser test, not a phone run). For Google it covers only the unconfigured-client path, the made-up outcome in the address, and the callback with no flow in progress.

### 5. Known gaps

*Sources: Jira MOM-117, MOM-136, MOM-98; `docs/INTEGRATIONS_SPEC.md` §3D and §4; `components/integrations/ConnectionControls.tsx`.*

| Step | Gap |
| --- | --- |
| All | Gap 16 (no phone-run evidence) |
| 3 Sync now | Gap 20 (the Sync control is on the Hevy card only) |
| 3 Sync now | Gap 19 (no webhooks: MOM-98; sync happens only on a tap) |
| 6 Unsupported app | Gap 17 (no "request this integration" control) |
| Own tracker sheet | Gap 18 (MOM-117 for Google, MOM-136 for OneDrive) |

## J4 Review my week and adjust

### 1. Goal

*Sources: `docs/DOMAIN_MODEL.md` §3.*

"At the end of my week, show me honestly how it went and let me change one thing for next week." The review runs at the end of the week as the person defined it, never on a fixed weekday (§3).

### 2. Tasks

*Sources: `components/review/ReviewScreen.tsx`, `RecapBody.tsx`; `components/home/ReviewNotice.tsx`; `app/review/page.tsx`; `tests/e2e/review.spec.ts`; MOM-113 comments; `docs/DOMAIN_MODEL.md` §3.1.*

1. **See the notice on home.** On the person's planning day, home shows one line with a link to the review (`/review`).
2. **Read the recap (layer 1).** The recap shows, per goal, where each target ended, crossings and patterns. If the week ends today, it says the recap counts through today. Nothing is graded without a time zone and a day end, and nothing is guessed.
   - *What the person sees instead, when a review is not possible:*
     - no goals: "Your weekly review starts once you have a goal.";
     - no time zone or day end: "Set your <time zone or day end> to get a weekly review. Nothing is graded until you do, and nothing is guessed." with **Open settings**;
     - no planning day chosen: "Choose the day your week starts and the day you plan it …" with **Open settings**;
     - any other day: "Your weekly review comes on <weekday>s, the day you chose to plan your week." with the last review, if any.
3. **Read a finished review.** A finished review reads back as it was said, and a later entry shows under "Since this recap", never in its place.
4. **Reflect and adjust (layers 2 and 3).** The model says a reflection offer, one adjustment question and planning of the next week (§3.1). These are not on `main` (Gap 22).

### 3. Measure

*Sources: design record §5 (criterion 4).*

- **Goal satisfaction:** the trial question is not written (Gap 1).
- **Task completion:** the design record logs each layer 3 outcome as changed, looked and chose no change, or skipped. No layer 3 exists on `main` yet.

### 4. Health

*Sources: `tests/e2e/review.spec.ts`.*

**Not yet rated** (Gap 21). Evidence so far: `review.spec.ts` (browser test, not a phone run), at 390px and 1280px.

### 5. Known gaps

*Sources: Jira MOM-113, MOM-114; `app/settings/page.tsx`; `docs/plans/archive/2026-10-30.md` ("MOM-114 ships as 'defaults only' for the trial").*

| Step | Gap |
| --- | --- |
| All | Gap 21 (no phone-run evidence) |
| 4 Reflect and adjust | Gap 22 (layers 2 and 3: MOM-113 block 3.3, not merged) |
| 2 Read the recap | Gap 23 (**Open settings** leads to a page with only Account and Sign out; MOM-114) |

## J5 See where I stand

### 1. Goal

*Sources: `docs/DOMAIN_MODEL.md` §1.4, §1.7.*

"Tell me, honestly and at a glance, how I'm doing against what I said I'd do, and let me pick what to do on which day." Every number is computed from entries and the target in force, never typed (§1.7).

### 2. Tasks

*Sources: `app/page.tsx`; `components/home/` (WeekHero, GoalScoreboardCard, TargetRow, MilestoneRow, YourPlanCard, wording.ts); `components/plan/PlanScreen.tsx`; `tests/e2e/home.spec.ts`, `tests/e2e/plan.spec.ts`.*

1. **Open home.** The person sees the week hero and each goal with its scoreboard, above the older goal-channel feed. Weekly targets show against their levels; a deadline task shows a forecast in words.
2. **Read the forecast.** For a deadline task home says whether the days set aside look enough, close, short, not enough to say, or past due, and offers ways forward. "Move the date" appears only when setup recorded that the date can move (§1.4).
3. **Plan the week** at `/plan`: pick items onto dates, say what kind of day a date is (with a reason), copy last week's kinds with one tap ("Same as last week"), step to next week and back. A day that has passed is read-only.
4. **Failure exits, in words:**
   - no week start set: weekly targets wait and the person is asked; the plan shows the next 14 dates, never weeks;
   - no time zone: nothing is graded or guessed and there is no plan;
   - a deadline-only person is never asked for a week start;
   - nothing set aside for a deadline: "You haven't set aside any days for this yet." with **Plan your week**;
   - a date with no kind: "Say what kind of day …" with a link to the plan.

### 3. Measure

*Sources: design record §5 (criteria 3 and 4).*

- **Goal satisfaction:** the trial question is not written (Gap 1).
- **Task completion:** the person can read their standing and (where it applies) put an item on a day, versus left or went back.

### 4. Health

*Sources: `tests/e2e/home.spec.ts`, `tests/e2e/plan.spec.ts`.*

**Not yet rated** (Gap 24). Evidence so far: `home.spec.ts` and `plan.spec.ts` (browser tests, not phone runs), at 390px and 1280px.

### 5. Known gaps

*Sources: Jira MOM-112, MOM-115; `tests/e2e/home.spec.ts`; `docs/DOMAIN_MODEL.md` header.*

| Step | Gap |
| --- | --- |
| All | Gap 24 (no phone-run evidence) |
| 1 Open home | Gap 25 (the older goal-channel feed and rebalance remain below the scoreboard until MOM-115) |

## Open gaps

*Sources: the sections above.*

1. The satisfaction question for each journey (J1 to J5) is not written. The owner writes it. It is a trial measure (J1 to J5, Measure).
2. The header at 390px: the "Signed in as" row runs wider than a phone screen (MOM-131). Affects every journey on a phone.
3. The screens are dark only. The matching light palette is MOM-30, not merged (`BACKLOG.md` line 43; MOM-111 comment 2026-10-30). Affects every journey.
4. J1 step 1: nothing in the app links to `/setup` (MOM-143).
5. J1 step 1: a goal or target cannot be added after the first setup (MOM-132).
6. J1 step 6: the quick path does not let the person fill in a missing item; a person who runs out of budget before giving, say, a time zone must start again (MOM-111 backlog note, comment 2026-10-30).
7. J1 step 2: checks only a phone can do are not done: the native date picker on iPhone and Android, the amber alert in sunlight and at larger text sizes, and the keyboard opening after "Change my answer" (MOM-111 comment 2026-10-29, round 3b).
8. J1 step 2: the newest question wording (the weekly floor question) has had no live Claude call (MOM-111 comment 2026-10-30, round 3d follow-up).
9. J1 step 2: where a settings choice and a priority came from at setup is not recorded (MOM-139).
10. J1 step 2: fields the draft has no place for, the app-request vote and tap-to-answer example chips (MOM-140).
11. J2, all steps: no phone-run evidence; the real-iPhone check (log one of each kind, remove and restore, a tap on yesterday, typed minutes, a tick on a chosen day) is not done (MOM-110).
12. J2 step 1: `/log` is a try-it page with no navigation link; MOM-112 was to put the entry controls on home, and home has none on `main` (MOM-110 comment 2026-10-27, MOM-112).
13. J2 step 2: a running timer is kept in the browser that started it (RAID R-20; MOM-110 comment 2026-10-27). Typed minutes cover time that was not timed.
14. J2 step 3: with no day end set, no other day is offered and a log cannot be judged against its goal's start (MOM-110 comment 2026-10-28). Setup collects the day end first (MOM-111).
15. J2 step 4: remove and restore cover the person's own manual entries only; removing synced entries waits for MOM-112 (MOM-110 comment 2026-10-27).
16. J3, all steps: no phone-run evidence.
17. J3 step 6: Connections has no "request this integration" control, which `docs/DOMAIN_MODEL.md` §1.5 says to offer.
18. J3: the person's own tracker sheet as a source is not built (MOM-117 for Google, MOM-136 for OneDrive).
19. J3 step 3: no Hevy or Google webhooks, so a sync happens only on a tap (MOM-98; `docs/INTEGRATIONS_SPEC.md` §4).
20. J3 step 3: the Sync now control is on the Hevy card only; a connected Google Calendar card shows no sync control (`components/integrations/ConnectionControls.tsx`).
21. J4, all steps: no phone-run evidence.
22. J4 step 4: the reflection offer, the one adjustment and the week's planning (layers 2 and 3) are not on `main` (MOM-113 block 3.3, unmerged).
23. J4 step 2: the review's **Open settings** link leads to a page that holds only Account and Sign out; the day-anchor and planning-day controls it asks for are not there (MOM-114, planned "defaults only" for the trial in `docs/plans/archive/2026-10-30.md`).
24. J5, all steps: no phone-run evidence.
25. J5 step 1: the older goal-channel feed and rebalance still sit below the scoreboard until MOM-115 retires the old model (`tests/e2e/home.spec.ts`, `docs/DOMAIN_MODEL.md` header).
