Template: Google critical user journeys · Last updated: 2026-10-30 (this branch, after build day 6's merges) · Filled by: MOM-144 first fill · Open gaps: 25, listed at the end

# Momentum user journeys

Five journeys, each a goal in the person's words. The rules behind every screen are in [`docs/DOMAIN_MODEL.md`](../DOMAIN_MODEL.md); this file links to its sections and does not copy them. Testers are described by role only: the owner and household testers. The family trial is adults only (MOM-126).

## How to read this

*Sources: the MOM-144 block prompt; `docs/DOMAIN_MODEL.md` §2; the deck for the first product review (https://claude.ai/artifact/EABm8qR3EfZSWeYF2HFfBK).*

- **Screens on `main` only.** A step with no screen on `main` is a gap, and names the ticket that would cover it when one exists.
- **Health** is green, amber or red, with the latest evidence. A journey with no evidence is "Not yet rated" plus a gap. A browser test is listed as "Evidence so far: <spec> (browser test, not a phone run)" so it is not lost, but it does not rate a journey.
- **Measure** has two parts: goal satisfaction (one question, asked during the family trial) and task completion (finished, abandoned, or had to go back). The satisfaction question is not written yet (Gap 1).
- **Gaps** are numbered once, at the end. Each journey points at them by number and names the step each one breaks.
- **Light and dark.** Every screen follows the device's light or dark setting, or the choice made under Appearance in Settings (light, dark or "Match my device", kept in a cookie that holds only that word). Added by MOM-30 (PR #72); the steps below read the same in both themes.

## J1 Set up my first goal

### 1. Goal

*Sources: `docs/DOMAIN_MODEL.md` §2 (opening paragraph); design record `docs/design/2026-10-26-goal-model-design.md` §2.*

"I have a vague idea of what I want. Help me turn it into something I can track, without my having to learn how the app thinks." It matters because setup is the first thing a new person meets: criterion 1 (setup works for someone other than the owner) is the one the family trial tests first (design record §5).

### 2. Tasks

*Sources: `components/setup/SetupConversation.tsx`, `QuestionCard.tsx`, `PlaybackCard.tsx`, `PlaybackLines.tsx`, `FinalCard.tsx`, `QuickPathCard.tsx`, `RetryNotice.tsx`; `components/home/SetupLinkCard.tsx`; `lib/setup/session.ts` (error wording); `docs/DOMAIN_MODEL.md` §2.1 to §2.3; `tests/e2e/setup.spec.ts`, `tests/e2e/setup-link.spec.ts`; MOM-111 comments 2026-10-29 to 2026-10-30; `docs/LLM_GOVERNANCE.md` (budget and quick path); PRs #73 and #78.*

1. **Start.** A person with no saved setup finds it on home: a "Set up your goals" card that says "You haven't saved a setup yet." with a **Go to setup** link, shown in place of the old "No goals yet" card (MOM-143, PR #78). A person whose setup is saved is offered no second one. The link opens `/setup`, which shows the heading "Set up your goals", a short explanation (a conversation with Claude, one question at a time, nothing saved until they approve, what they type is sent to Claude, link to the privacy notice) and a **Start** button.
   - *Answers:* tap Go to setup, then Start, or follow the privacy link.
   - *Success:* the first question appears.
   - *Failure exit:* if the first reply does not arrive, a single alert card with **Try again** (there is no question yet and no answer to change).
2. **Answer the questions, one at a time.** A bold question of about 12 words or fewer, a detail line under it, and the ways to answer. The conversation follows the order in `docs/DOMAIN_MODEL.md` §2.2: the idea, why, one goal or several, what else matters, starting point, shape and timeframe, what counts, expansion questions, where they track it, planning and capacity, how Momentum talks to them.
   - *Every way to answer:* type in "Your answer" and tap Send; on a proposal, **Yes** (first), one of the offered alternatives, or "type instead"; on an offer, **Some ideas, please**; on a card of starting ideas or readings of an answer, a numbered button for each ("Option n") or type their own; on a date, one date button that opens the phone's own date picker; **What does this mean?** on every card, which answers in plainer words and carries on.
   - *Success:* each answer is accepted and the next question or a playback appears.
   - *Failure exits:*
     - **Error cards** keep the question above them and show one button. The headline depends on the cause: "Sorry, I didn't follow that" (Change my answer), "Couldn't connect" (network), "Things are busy right now" (busy, or the spacing wait), "That didn't go through" (no answer), "That took too long", "Setup isn't available right now" (not configured) and "Your last answer wasn't sent" (after a reload; **Send it again**). The buttons are **Try again**, **Send it again** or **Change my answer**.
     - **An answer that does not fit**: setup offers numbered readings instead of guessing (§2.1 rule 6).
     - **A date it can't read** ("sometime next month"): the question comes back with a date picker; a relative day ("Monday") becomes a proposal such as "Start Monday, Nov 2?" that counts only when the person accepts it (§2.2 step 6).
     - **An app that can't be read yet** (for example a watch app): setup says so in one line and records that the person logs it themselves (MOM-111 comment 2026-10-29, round 2 live run).
     - **A reload or a dropped phone tab** while a reply is in flight: the question stays on screen with the answer waiting and a way to send it again or change it (MOM-111 finding 10).
3. **Approve each part as it finishes.** After steps 3, 7, 10 and 11 of §2.2 the person sees a playback of that part, restated in the second person, as real bullets with a goal's targets nested under it (PR #73).
   - *Answers:* **Yes, that is right**, or **Change something**, which opens "What would you like to change?" with **Send the change** and **Keep it as it is**.
   - *Success:* the part is approved and setup moves on.
   - *Failure exit:* the same error cards as step 2.
4. **Confirm the whole.** "Ready to save?" with a few lines and "Nothing is saved until you tap Save."
   - *Answers:* **Save my setup**, or **Change something** (then **Send the change** or **Keep it as it is**, which only closes the box).
   - *Success:* "Your setup is saved", with the count of goals and things to count, and two buttons: **Log an entry** and **Back to home**.
   - *Failure exit:* a save that does not go through shows an alert headline ("Couldn't connect. Nothing was saved yet. Check your connection, then try again.") and the person can tap Save again.
5. **Start again.** A small "Start again" link on every card asks first: "Start again? What you have said so far will be cleared." with **Yes, start again** and **Keep going**.
6. **The quick path (Claude stops).** When the per-setup budget is spent, the shared limit is reached, or the limits cannot be checked, setup stops using Claude and shows a card titled "Your setup is ready to save" or "Setup can't be saved yet": one sentence on why it stopped, "Here is everything you told me so far.", the parts, and "Still needed before this can be saved". What to do next is written before any button (PR #73): when it is ready, look it over and tap **Save what I have** (nothing is saved until then); when something is missing and the limit lifts on its own, wait and reload (the answers stay in this browser tab and setup picks up where it stopped) or start again; when the budget is spent, start again.
   - *Answers:* **Save what I have** (off until nothing is missing, with the note "Save is off until the items above are set.") or **Start again**, which asks first: "Start again? What you have said so far will be cleared." with **Yes, start again** and **Keep what I have**.
   - *Success:* what the person said is saved if it is complete. Otherwise nothing is saved and they start again. No default is applied (§2.3, change-log row 2026-10-30).
   - *Failure exit:* a save error shows an alert on the card.
   - *Gap:* a person who runs out of budget before giving a needed item (for example a time zone) must start again and loses everything they said (Gap 5).

### 3. Measure

*Sources: design record §5 (criterion 1); the MOM-144 block prompt.*

- **Goal satisfaction:** one question asked of each trial user, such as "Was that time useful?" in the design record's criterion 1 measure. The wording for this product review cycle is not written (Gap 1).
- **Task completion:** per setup, finished (saved), abandoned (left without saving), or had to go back (used **Change my answer**, **Change something** or **Start again**). The design record's "heavy edit" count (a change to a target, level or source at playback, two or fewer per setup) is the pass bar.

### 4. Health

*Sources: the deck's setup slide; MOM-111 comments 2026-10-29 and 2026-10-30 (clarity fix, fix round, round 2, round 3, round 3b, round 3c, round 3d); `docs/FAILURE_LOG.md` F-064 to F-066; PRs #65, #67 and #73; `tests/e2e/setup.spec.ts`, `tests/e2e/setup-cards.spec.ts`, `tests/e2e/setup-link.spec.ts`.*

**Amber.** Setup works end to end, but it has needed repeated review rounds from the owner's phone runs (runs 1 to 3, then rounds 3b, 3c and 3d).

- **Run 1:** 14 issues with one root cause (the checks judged the previous screen, not what the person said). Fixed in PR #65.
- **Run 2:** the source step failed every time (the prompt never named the allowed app values, so replies were thrown away as shape errors, and every retry got the same general note). Fixed in PR #67. A live run then had 0 schema errors in 24 calls.
- **Run 3:** polish from the owner's screenshot review (dates, error cards, option wording), carried through rounds 3, 3b, 3c and 3d on MOM-111.
- **Round 3d (merged in PR #73, 2026-10-30):** the weekly floor question now reads "In a hard week, how many <thing> would still count?", number questions and idea buttons use everyday words, and the quick-path card says what to do next and promises no default (step 6).
- **Earlier production findings the same day:** F-064 (a follow-up question on the same topic was thrown away), F-065 (no way back from "Change something") and F-066 (questions in the model's own words, a pasted-back playback).
- Evidence so far: `setup.spec.ts` and `setup-cards.spec.ts` (browser tests, not phone runs).

### 5. Known gaps

*Sources: Jira (MOM-111 comments, MOM-132, MOM-139, MOM-140, MOM-145, MOM-148); `BACKLOG.md`.*

| Step | Gap |
| --- | --- |
| 1 Start | Gap 4 (MOM-132: a goal or target cannot be added after the first setup) |
| 2 Answer | Gap 6 (phone-only checks); Gap 7 (newest wording has had no live call); Gap 8 (MOM-139); Gap 9 (MOM-140) |
| 6 Quick path | Gap 5 (MOM-111 backlog note) |
| All | Gap 1 (satisfaction question); Gap 2 (MOM-148: no Sign out on `/setup` at 390px); Gap 3 (MOM-145) |

## J2 Log what I did

### 1. Goal

*Sources: `docs/DOMAIN_MODEL.md` §1.5 (manual sources) and §1.6; MOM-110 description.*

"Record that I did it, in a few seconds, on my phone." The entry is the person's own confirmation, and a manual entry always wins over a sync (§1.5).

### 2. Tasks

*Sources: `app/log/page.tsx`; `components/entries/` (TapControl, NumberControl, TimerControl, MinutesControl, ChecklistControl, DayPicker, EntryList, EntryFeedback); `tests/e2e/manual-entry.spec.ts`; MOM-110 comments 2026-10-27 to 2026-10-29.*

1. **Open the log.** The page is `/log`. It is a minimal try-it page: signed in only, and not in the navigation. The only link to it on `main` is **Log an entry** on the "Your setup is saved" card (Gap 11).
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

**Not yet rated.** Evidence so far: `manual-entry.spec.ts` (browser test, not a phone run). The MOM-110 comment of 2026-10-29 records that the real-iPhone check is still to do (Gap 10).

### 5. Known gaps

*Sources: Jira MOM-110 (description and comments), MOM-112; RAID R-20 (frozen log); `BACKLOG.md`.*

MOM-110 is still To Do in Jira. Its five acceptance criteria are met on `main` except the phone one, which is the real-iPhone check, so the gaps below are the unbuilt or unchecked parts.

| Step | Gap |
| --- | --- |
| All | Gap 10 (the real-iPhone check, MOM-110) |
| 1 Open the log | Gap 11 (no navigation link; MOM-112 was to put the controls on home) |
| 2 Log one of four kinds | Gap 25 (MOM-147: an update after a wait can show beside "Saving…") |
| 2 Timer | Gap 12 (a running timer lives in one browser; typed minutes cover the unrecorded time) |
| 3 Say which day | Gap 13 (no day end means no other day and no start-date judgement) |
| 4 Remove or restore | Gap 14 (own manual entries only; synced entries wait for MOM-112) |

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
6. **An app that is not supported:** the model says to suggest a bridge, offer a request, and fall back to manual entry (§1.5). In setup the person is told which apps can't be read yet (J1 step 2); Connections has no request control (Gap 16).

### 3. Measure

*Sources: design record §5.*

- **Goal satisfaction:** the trial question is not written (Gap 1).
- **Task completion:** connected and synced, abandoned, or had to go back (reconnect, or fall back to manual entry).

### 4. Health

*Sources: `tests/e2e/connections.spec.ts`.*

**Not yet rated** (Gap 15). Evidence so far: `connections.spec.ts` (browser test, not a phone run). For Google it covers only the unconfigured-client path, the made-up outcome in the address, and the callback with no flow in progress.

### 5. Known gaps

*Sources: Jira MOM-117, MOM-136, MOM-98; `docs/INTEGRATIONS_SPEC.md` §3D and §4; `components/integrations/ConnectionControls.tsx`.*

| Step | Gap |
| --- | --- |
| All | Gap 15 (no phone-run evidence) |
| 3 Sync now | Gap 19 (the Sync control is on the Hevy card only) |
| 3 Sync now | Gap 18 (no webhooks: MOM-98; sync happens only on a tap) |
| 3 Sync now, 5 Disconnect | Gap 25 (MOM-147: an update after a wait can show beside a disabled button) |
| 6 Unsupported app | Gap 16 (no "request this integration" control) |
| Own tracker sheet | Gap 17 (MOM-117 for Google, MOM-136 for OneDrive) |

## J4 Review my week and adjust

### 1. Goal

*Sources: `docs/DOMAIN_MODEL.md` §3.*

"At the end of my week, show me honestly how it went and let me change one thing for next week." The review runs at the end of the week as the person defined it, never on a fixed weekday (§3).

### 2. Tasks

*Sources: `components/review/ReviewScreen.tsx`, `RecapBody.tsx`, `ReviewSitting.tsx`, `sittingWording.ts`, `adjustmentWording.ts`; `components/home/ReviewNotice.tsx`; `app/review/page.tsx`; `tests/e2e/review.spec.ts`; MOM-113 comments; `docs/DOMAIN_MODEL.md` §3.1; PR #79 (MOM-113 block 3.3).*

1. **See the notice on home.** On the person's planning day, home shows one line with a link to the review (`/review`).
2. **Read the recap (layer 1).** The recap shows, per goal, where each target ended, crossings and patterns. If the week ends today, it says the recap counts through today. Nothing is graded without a time zone and a day end, and nothing is guessed.
   - *What the person sees instead, when a review is not possible:*
     - no goals: "Your weekly review starts once you have a goal.";
     - no time zone or day end: "Set your <time zone or day end> to get a weekly review. Nothing is graded until you do, and nothing is guessed." with **Open settings**;
     - no planning day chosen: "Choose the day your week starts and the day you plan it …" with **Open settings**;
     - any other day: "Your weekly review comes on <weekday>s, the day you chose to plan your week." with the last review, if any.
3. **Ask for a one-line look back (layer 2, optional).** Under the recap, when the review depth setting offers it and there is something to look back on, a card "A one-line look back" says "Optional. Claude writes one plain sentence about your week. It asks nothing of you and isn't saved." and has the button **Get a one-line look back from Claude**. Opening `/review` asks Claude nothing; the call is made only on the tap.
   - *Success:* one sentence appears, labelled "From Claude." If Claude's sentence fails Momentum's checks twice, a plain sentence written by code appears instead, labelled "From Momentum. Claude's line didn't pass our checks, so this one is plain."
   - *Failure exit:* "Claude could not be reached just now. Your review goes on without it." The review carries on.
4. **Decide the one adjustment (layer 3).** When the engine raised one, a card asks a single question in about 12 words, with a detail line, and three equal choices in this order: **Yes, I want to change it**, **No, keep it as it is** and **Skip for now**. After a choice it says so plainly ("Okay. It stays as it is." or "Skipped. Nothing changes.").
   - *Gap:* nothing in the app edits a target, a priority or a goal's handling yet, so **Yes, I want to change it** only records the choice and says "Noted. Changing a target isn't in the app yet, so nothing was changed." (Gap 21).
5. **Finish the review.** **Finish review** (it reads "Saving…" while it saves; the hint beside it says "Choose one of the three above to finish.") stores the review once, with the recap and the person's choice. Claude's sentence is not stored.
   - *Failure exit:* a save that fails shows the error and brings **Finish review** back, so the person can tap again.
6. **Plan the week.** After a finished review: "Your review is done. Next, choose what you'll do on which days." with **Plan your week**, or, when the person chose to plan separately, "You chose to plan your week separately, so it's there when you want it." with **Open your week plan**.
7. **Read a finished review.** A finished review reads back as it was said ("You finished this review <when>. It stays as it was said."), and a later entry shows under "Since this recap", never in its place.

### 3. Measure

*Sources: design record §5 (criterion 4).*

- **Goal satisfaction:** the trial question is not written (Gap 1).
- **Task completion:** the design record logs each layer 3 outcome as changed, looked and chose no change, or skipped. Since PR #79 each finished review stores that choice (changed, declined or skipped), so the count can be read once reviews are run. A "changed" outcome does not yet change anything in the app (Gap 21).

### 4. Health

*Sources: `tests/e2e/review.spec.ts`.*

**Not yet rated** (Gap 20). Evidence so far: `review.spec.ts` (browser test, not a phone run), at 390px and 1280px. Since PR #79 it also walks the whole sitting (the line on a tap, the choice, one finish) with a fake model standing in for Claude.

### 5. Known gaps

*Sources: Jira MOM-113, MOM-114, MOM-146, MOM-148; `app/settings/page.tsx`; `docs/plans/archive/2026-10-30.md` ("MOM-114 ships as 'defaults only' for the trial").*

| Step | Gap |
| --- | --- |
| All | Gap 20 (no phone-run evidence) |
| 1 See the notice | Gap 2 (MOM-148: `/review` has no navigation link of its own and no Sign out at 390px) |
| 4 Decide the adjustment | Gap 21 (MOM-146: "Yes, I want to change it" leads nowhere) |
| 2 Read the recap | Gap 22 (**Open settings** leads to a page with only Account and Appearance; MOM-114) |

## J5 See where I stand

### 1. Goal

*Sources: `docs/DOMAIN_MODEL.md` §1.4, §1.7.*

"Tell me, honestly and at a glance, how I'm doing against what I said I'd do, and let me pick what to do on which day." Every number is computed from entries and the target in force, never typed (§1.7).

### 2. Tasks

*Sources: `app/page.tsx`; `components/home/` (WeekHero, GoalScoreboardCard, TargetRow, MilestoneRow, YourPlanCard, SetupLinkCard, wording.ts); `components/plan/PlanScreen.tsx`; `tests/e2e/home.spec.ts`, `tests/e2e/plan.spec.ts`, `tests/e2e/setup-link.spec.ts`.*

1. **Open home.** The person sees the week hero and each goal with its scoreboard, above the older goal-channel feed. Weekly targets show against their levels; a deadline task shows a forecast in words.
2. **Read the forecast.** For a deadline task home says whether the days set aside look enough, close, short, not enough to say, or past due, and offers ways forward. "Move the date" appears only when setup recorded that the date can move (§1.4).
3. **Plan the week** at `/plan`: pick items onto dates, say what kind of day a date is (with a reason), copy last week's kinds with one tap ("Same as last week"), step to next week and back. A day that has passed is read-only.
4. **Failure exits, in words:**
   - no week start set: weekly targets wait and the person is asked; the plan shows the next 14 dates, never weeks;
   - no time zone: nothing is graded or guessed and there is no plan;
   - no saved setup: home shows the "Set up your goals" card with **Go to setup** (J1 step 1) and never the old "No goals yet" card beside it (MOM-143, PR #78);
   - a deadline-only person is never asked for a week start;
   - nothing set aside for a deadline: "You haven't set aside any days for this yet." with **Plan your week**;
   - a date with no kind: "Say what kind of day …" with a link to the plan.

### 3. Measure

*Sources: design record §5 (criteria 3 and 4).*

- **Goal satisfaction:** the trial question is not written (Gap 1).
- **Task completion:** the person can read their standing and (where it applies) put an item on a day, versus left or went back.

### 4. Health

*Sources: `tests/e2e/home.spec.ts`, `tests/e2e/plan.spec.ts`.*

**Not yet rated** (Gap 23). Evidence so far: `home.spec.ts`, `plan.spec.ts` and `setup-link.spec.ts` (browser tests, not phone runs), at 390px and 1280px.

### 5. Known gaps

*Sources: Jira MOM-112, MOM-115; `tests/e2e/home.spec.ts`; `docs/DOMAIN_MODEL.md` header.*

| Step | Gap |
| --- | --- |
| All | Gap 23 (no phone-run evidence) |
| 1 Open home | Gap 24 (the older goal-channel feed and rebalance remain below the scoreboard until MOM-115) |
| 3 Plan the week | Gap 25 (MOM-147: an update after a wait can show beside a disabled button) |

## Open gaps

*Sources: the sections above.*

1. The satisfaction question for each journey (J1 to J5) is not written. The owner writes it. It is a trial measure (J1 to J5, Measure).
2. Every journey on a phone: only home, `/connections` and `/settings` have the sticky header with Sign out and a way home at 390px. `/plan`, `/review`, `/log`, `/setup` and `/privacy` have no header, so a person cannot sign out from them, and `/review` has no navigation link of its own (it is reached from home's notice on the planning day) (MOM-148). MOM-131 (PR #80) fixed the sideways scroll: with a long address no signed-in page scrolls sideways at 390px.
3. Every journey: the dark theme looks flatter since MOM-30 (PR #72) gave every card one surface: a darker card fill, a solid lime primary action and dark control borders at 3:1 are planned (MOM-145). The real-phone check of the new light and dark themes is also still open (`BACKLOG.md` line 43).
4. J1 step 1: a goal or target cannot be added after the first setup (MOM-132).
5. J1 step 6: the quick path does not let the person fill in a missing item; a person who runs out of budget before giving, say, a time zone must start again (MOM-111 backlog note, comment 2026-10-30).
6. J1 step 2: checks only a phone can do are not done: the native date picker on iPhone and Android, the amber alert in sunlight and at larger text sizes, and the keyboard opening after "Change my answer" (MOM-111 comment 2026-10-29, round 3b).
7. J1 step 2: the newest question wording (the weekly floor question "In a hard week, how many <thing> would still count?", merged in PR #73) has had no live Claude call (MOM-111 comment 2026-10-30, round 3d follow-up).
8. J1 step 2: where a settings choice and a priority came from at setup is not recorded (MOM-139).
9. J1 step 2: fields the draft has no place for, the app-request vote and tap-to-answer example chips (MOM-140).
10. J2, all steps: no phone-run evidence; the real-iPhone check (log one of each kind, remove and restore, a tap on yesterday, typed minutes, a tick on a chosen day) is not done (MOM-110).
11. J2 step 1: `/log` is a try-it page with no navigation link; MOM-112 was to put the entry controls on home, and home has none on `main` (MOM-110 comment 2026-10-27, MOM-112).
12. J2 step 2: a running timer is kept in the browser that started it (RAID R-20; MOM-110 comment 2026-10-27). Typed minutes cover time that was not timed.
13. J2 step 3: with no day end set, no other day is offered and a log cannot be judged against its goal's start (MOM-110 comment 2026-10-28). Setup collects the day end first (MOM-111).
14. J2 step 4: remove and restore cover the person's own manual entries only; removing synced entries waits for MOM-112 (MOM-110 comment 2026-10-27).
15. J3, all steps: no phone-run evidence.
16. J3 step 6: Connections has no "request this integration" control, which `docs/DOMAIN_MODEL.md` §1.5 says to offer.
17. J3: the person's own tracker sheet as a source is not built (MOM-117 for Google, MOM-136 for OneDrive).
18. J3 step 3: no Hevy or Google webhooks, so a sync happens only on a tap (MOM-98; `docs/INTEGRATIONS_SPEC.md` §4).
19. J3 step 3: the Sync now control is on the Hevy card only; a connected Google Calendar card shows no sync control (`components/integrations/ConnectionControls.tsx`).
20. J4, all steps: no phone-run evidence.
21. J4 step 4: "Yes, I want to change it" only records the choice. Nothing in the app edits a target, a priority or a goal's clash handling after setup, and the screen says so ("so nothing was changed") (MOM-146; PR #79).
22. J4 step 2: the review's **Open settings** link leads to a page that holds only Account and Appearance (the theme choice); the day-anchor and planning-day controls it asks for are not there (MOM-114, planned "defaults only" for the trial in `docs/plans/archive/2026-10-30.md`).
23. J5, all steps: no phone-run evidence.
24. J5 step 1: the older goal-channel feed (with its "Quick goal actions" banner and the old goal wizard) and rebalance still sit below the scoreboard until MOM-115 retires the old model (`tests/e2e/home.spec.ts`, `docs/DOMAIN_MODEL.md` header).
25. J2 step 2, J3 steps 3 and 5, J5 step 3: after a wait, some controls update their message outside the pending state, so an error or result can show beside "Saving…" or a disabled button. It sits at 10 call sites on `main` (MOM-147; failure log F-072).
