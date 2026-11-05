Template: Google critical user journeys · Last updated: 2026-11-02 (`main` at 64c9d84, after pull requests #82 to #117; third day-end step D of the day) · Filled by: MOM-144 first fill, kept current by MOM-164 · Open gaps: 34, listed at the end

# Momentum user journeys

Five journeys, each a goal in the person's words. The rules behind every screen are in [`docs/DOMAIN_MODEL.md`](../DOMAIN_MODEL.md); this file links to its sections and does not copy them. Testers are described by role only: the owner and household testers. The family trial is adults only (MOM-126).

This file is non-binding and every section names its sources on a `Sources:` line; `tests/pm-docs-sources.test.ts` fails when a section has none or when a repo file it lists no longer exists (MOM-164).

## How to read this

*Sources: the MOM-144 block prompt; `docs/DOMAIN_MODEL.md` §2; `tests/pm-docs-sources.test.ts`; the deck for the first product review (https://claude.ai/artifact/EABm8qR3EfZSWeYF2HFfBK).*

- **Screens on `main` only.** A step with no screen on `main` is a gap, and names the ticket that would cover it when one exists.
- **Health** is green, amber or red, with the latest evidence. A journey with no evidence is "Not yet rated" plus a gap. A browser test is listed as "Evidence so far: <spec> (browser test, not a phone run)" so it is not lost, but it does not rate a journey.
- **Measure** has two parts: goal satisfaction (one question, asked during the family trial) and task completion (finished, abandoned, or had to go back). The satisfaction question is not written yet (Gap 1).
- **Gaps** are numbered once, at the end. Each journey points at them by number and names the step each one breaks.
- **Light and dark.** Every screen follows the device's light or dark setting, or the choice made under Appearance in Settings (light, dark or "Match my device", kept in a cookie that holds only that word). Added by MOM-30 (PR #72); the steps below read the same in both themes.

## J1 Set up my first goal

*Sources: `docs/DOMAIN_MODEL.md` §2; `components/setup/SetupConversation.tsx`; `tests/e2e/setup.spec.ts`; the sections below.*

### 1. Goal

*Sources: `docs/DOMAIN_MODEL.md` §2 (opening paragraph); design record `docs/design/2026-10-26-goal-model-design.md` §2.*

"I have a vague idea of what I want. Help me turn it into something I can track, without my having to learn how the app thinks." It matters because setup is the first thing a new person meets: criterion 1 (setup works for someone other than the owner) is the one the family trial tests first (design record §5).

### 2. Tasks

*Sources: `components/setup/SetupConversation.tsx`, `QuestionCard.tsx`, `PlaybackCard.tsx`, `PlaybackLines.tsx`, `FinalCard.tsx`, `QuickPathCard.tsx`, `QuickPathFillIn.tsx`, `SettingsCard.tsx`, `TimeZoneCard.tsx`, `NeedsAnswer.tsx`, `AddChoices.tsx`, `AddToGoals.tsx`, `RetryNotice.tsx`; `lib/setup/cards.ts`, `lib/setup/cardTurns.ts`, `lib/setup/weekCards.ts`, `lib/setup/explain.ts`, `components/setup/HelpLink.tsx`, `components/setup/WeekCard.tsx`, `WeekCardFrame.tsx`, `DayTimesCard.tsx`, `SlotsCard.tsx`, `tests/e2e/setup-cards.spec.ts`, `tests/e2e/setup-week-cards.spec.ts`; `components/home/SetupLinkCard.tsx`, `AddGoalsLink.tsx`; `components/auth/CreateAccountForm.tsx`; `lib/setup/session.ts` (error wording); `lib/setup/addWords.ts`; `lib/setup/quickPath.ts`; `supabase/templates/confirmation.html`; `docs/DOMAIN_MODEL.md` §1.3, §2.1 to §2.3; `tests/e2e/setup.spec.ts`, `tests/e2e/setup-link.spec.ts`, `tests/e2e/setup-add.spec.ts`, `tests/e2e/sign-up-shots.spec.ts`; MOM-111 comments 2026-10-29 to 2026-11-01; MOM-132, MOM-150 and MOM-163 comments; MOM-166; MOM-178; `lib/services/auth.ts`; `app/auth/callback/route.ts`; `docs/LLM_GOVERNANCE.md` (budget and quick path); PRs #73, #78, #87, #94, #99 and #100.*

0. **Create an account.** A new person opens the sign-in page and chooses to create an account. The screen is headed "Create your account" and says "Enter your email and choose a password. We'll email you a link to confirm your account." After they send it, a "check your email" state says "We sent a link to <their address>." and "Open the email and tap the link. It confirms your account and signs you in." (MOM-150, PR #100). Since MOM-167 (part 15) that card's main button is **Go to sign in** (to the sign-in page), with a smaller **Start again** link that returns to an empty form; the card stays until the person taps, and signing up with an address that already has an account shows the same card and never says so. The email is warmer and clearer since MOM-149 (PR #90). Since MOM-163 the emailed link is a token link that signs the person in from whichever browser opens it, and a long address sits on its own line and wraps at the card's edge.
   - *Failure exits:* a message under the field in red; the person can go back to sign in. A wrong password says "That email and password don't match. Check them and try again, or tap Forgot password?" and never says whether the address has an account; a link that was already used or has expired says "This link has already been used or has expired. If you've confirmed your account, sign in. If not, create the account again with the same address and we'll send a new link." (MOM-163). Production sends the new link only once its "Confirm sign up" template is pasted in the dashboard (a pending live check, before the Nov 5 freeze).
1. **Start.** A person with no saved setup finds it on home: a "Set up your goals" card that says "You haven't saved a setup yet." with a **Go to setup** link, shown in place of the old "No goals yet" card (MOM-143, PR #78). A person whose setup is saved is not offered a second first setup: home shows an **Add to your goals** link instead (step 7). The link opens `/setup`, which shows the heading "Set up your goals", a short explanation (a conversation with Claude, one question at a time, nothing saved until they approve, what they type is sent to Claude, link to the privacy notice) and a **Start** button.
   - *Answers:* tap Go to setup, then Start, or follow the privacy link.
   - *Success:* the first question appears.
   - *Failure exit:* if the first reply does not arrive, a single alert card with **Try again** (there is no question yet and no answer to change).
2. **Answer the questions, one at a time.** A bold question of about 12 words or fewer, a detail line under it, and the ways to answer. The conversation follows the order in `docs/DOMAIN_MODEL.md` §2.2: the idea, why, one goal or several, what else matters, starting point, shape and timeframe, what counts, where they track it (no expansion questions are asked until a playbook supplies them, MOM-180), planning and capacity, how Momentum talks to them. Since MOM-178 two of those are cards written by code, with no Claude call (§2.2 steps 7 and 11):
   - *The time zone card,* as soon as the person approves what counts: "Your phone is set to Mountain Time (Denver). Is that your time zone?" (the zone's plain name and its city; just the city, "Your phone is set to Denver time.", when the platform has no plain name; never the raw zone id) with **Yes** (the one main button, recorded only on the tap as an accepted answer) and **A different one** (opens the time zone search; a pick is their own). When the phone reports no zone: "Which time zone are you in?" with the search.
   - *The settings card,* as soon as the person approves the planning part: "How should Momentum talk to you?" with "Skip any you like. You can't change these after setup yet." and four rows, each a question, a reason and its choices as buttons: how direct (Gentle, Plain, Direct), how big a celebration (Low-key, Medium, Big), how much the weekly look-back covers (Short recap only, Recap with an offer to go deeper, Recap and a few questions), and look back and plan together or separately (One sitting, Separately). Nothing is pre-selected, a tap on a chosen answer takes it back, **Next** is always there and never dimmed, and a row left alone stays unset. The part is then played back at once. Reminders, check-ins, quiet times and balance mentions are no longer asked (nothing reads them).
   - *The week cards,* since MOM-179, also with no Claude call, in this order (§2.2 step 10): **When does your day end?** (the day-end explanation under it, a time picker, and **Next** once a time is set); **Which day does your week start on?** (seven weekday buttons, only when a weekly or set-days target needs it); Claude's one question, the kinds of days; **Time you have for your goals** (a row for each kind of day, in the person's words, each a number and **Minutes** or **Hours**, **Next** always there and a callout naming what a half-filled row needs); **Would you rather do <what they count> on set days, or any day?** (**On set days** opens the weekdays, **Any day, as long as the week's number is met** answers at once; a count of 3 a week needs at least 3 days); **When would you like to plan your week?** (a day and a time); then the planning part played back. Nothing is pre-selected, every card keeps **Type your answer**, and a card whose value was already typed is not shown. A time under an hour is shown in whole minutes ("45 minutes") wherever it is read back.
   - *"What does this mean?",* since MOM-180, on every question and card: a small link that opens a fixed explanation in place, picked by code from the question's topic, with no Claude call (§2.1, principle 13). On what to count, the least that counts and the goal's shape, **Still not clear? Ask Claude** sits under it and sends the question to Claude; on every other topic the explanation stands alone, and the typed answer box still reaches Claude. The words are in Jira MOM-180 comments 10355 and 10356.
   - *Every way to answer:* type in "Your answer" and tap Send; on a proposal, **Yes** (first), one of the offered alternatives, or "type instead"; on an offer, **Some ideas, please**; on a card of starting ideas or readings of an answer, a numbered button for each ("Option n") or type their own; on a date, one date button that opens the phone's own date picker, which shows the chosen date ("Thu, Nov 12") and then a main **Use this date** button that sends it (choosing a date alone answers nothing); **What does this mean?** on every card, which answers in plainer words and carries on, and its explanation is always shown, also on a card of ideas or readings
   - *Success:* each answer is accepted and the next question or a playback appears.
   - *Failure exits:*
     - **Error cards** keep the question above them and show one button. The headline depends on the cause: "Sorry, I didn't follow that" (Change my answer), "Couldn't connect" (network), "Things are busy right now" (busy, or the spacing wait), "That didn't go through" (no answer), "That took too long", "Setup isn't available right now" (not configured) and "Your last answer wasn't sent" (after a reload; **Send it again**). The buttons are **Try again**, **Send it again** or **Change my answer**.
     - **An answer that does not fit**: setup offers numbered readings instead of guessing (§2.1 rule 6).
     - **A date it can't read** ("sometime next month"): the question comes back with a date picker; a relative day ("Monday") becomes a proposal such as "Start Monday, Nov 2?" that counts only when the person accepts it (§2.2 step 6).
     - **An app that can't be read yet** (for example a watch app): setup says so in one line and records that the person logs it themselves (MOM-111 comment 2026-10-29, round 2 live run).
     - **A reload or a dropped phone tab** while a reply is in flight: the question stays on screen with the answer waiting and a way to send it again or change it (MOM-111 finding 10).
     - **A deadline goal, after its date is accepted** (found on production 2026-11-02): every reply is thrown away, so the person sees "Sorry, I didn't follow that" whatever they answer, the **Yes** button included, and cannot get past the date. Fixed on branch `feature/MOM-166-deadline-past-date` (the can-move check now runs only at the final save); not live until merged and deployed, then checked on production (MOM-166, Gap 31).
3. **Approve each part as it finishes.** After steps 3, 7, 10 and 11 of §2.2 the person sees a playback of that part, restated in the second person, as real bullets with a goal's targets nested under it (PR #73).
   - *Answers:* **Yes, that is right**, or **Change something**, which opens "What would you like to change?" with **Send the change** and **Keep it as it is**. When the change is applied the part comes back closed, with **Yes, that is right** as its main answer again (MOM-167 part 2, pending merge). Goal, target and work-item titles are short names ("Getting back into running", "Runs"), so a line reads "Your goal: at least 2 runs a week." (MOM-167 part 1, pending merge).
   - *Success:* the part is approved and setup moves on.
   - *Failure exit:* the same error cards as step 2.
4. **Confirm the whole.** "Ready to save?" with a few lines, the line "You can't change your choices after setup yet. That's coming soon." (since MOM-178; it said "Everything can be changed on your settings page" before, which was not true until MOM-114 builds that page) and "Nothing is saved until you tap Save."
   - *Answers:* **Save my setup**, or **Change something** (then **Send the change** or **Keep it as it is**, which only closes the box).
   - *Success:* "Your setup is saved", with the count of goals and things to count, and, since MOM-167 part 14 (branch `feature/MOM-167-setup-words`, not yet merged), two buttons: **Go to Home** (main) and **Log an entry** (second choice), because most people have not done anything yet on a goal they have just set up. It is a tap, not a redirect. Its words: "2 goals and 3 things to count are ready. Already done something on a goal? You can log it now."
   - *Failure exit:* a save that does not go through shows an alert headline ("Couldn't connect. Nothing was saved yet. Check your connection, then try again.") and the person can tap Save again.
5. **Start again.** A small "Start again" link on every card asks first: "Start again? What you have said so far will be cleared." with **Yes, start again** and **Keep going**.
6. **The quick path (Claude stops, the person finishes).** When the per-setup budget is spent, the shared limit is reached, or the limits cannot be checked, setup stops using Claude and shows one card (reworked in MOM-111, PR #87). It lists each part of what the person said, written by code in plain words, and a missing item sits in place as an amber "Needs your answer" callout with a plain question and its own control. On a phone it is one step at a time ("1 of n", **Back**, the step before as one small line above); wide, every step is in one list. The reason it stopped shows once, only while questions are left.
   - *What the person can fill in on the card:* the person facts (time zone, day end, week start), the numbers, a missing start date (today is offered as a visible suggestion, recorded as accepted), the shape and end date, where they track it (logging it themselves, or an app setup can read, then which number counts), a deadline task's date and whether it can move, and what a habit or steps feed. A date that breaks another date is refused and changes nothing. A step with several questions moves on only once every question in it is answered.
   - *Answers:* a chosen answer is filled with the accent and a check; the others are outlined. The last step ends in **Save my setup**. No button is ever dimmed: a busy button stays solid. **Start again** is a small link that asks first: "Start again? What you have said so far will be cleared." with **Yes, start again** and **Keep what I have**.
   - *Success:* what the person said is saved once the card has everything the setup needs. No default is applied (§2.3, change-log row 2026-10-30), and every answer given on the card can be changed before saving.
   - *Failure exit:* a save error shows an alert on the card.
   - *Closed gap:* a person who ran out of budget before giving a needed item no longer has to start again (old Gap 5, closed by PR #87).
7. **Add to my goals after setup (MOM-132, PRs #94, #96 and #99).** A person whose setup is saved sees **Add to your goals** on home, as a secondary button under **Log an entry**, at the top of the page (MOM-167 part 14; it was a bare link at the bottom). It opens `/setup`, which asks "What would you like to add?" with the note "Nothing you've already set up changes. Nothing is saved until you check it."
   - *Answers:* **A new goal**, or **A target for a goal I already have** (then "Which goal is it for?" with one button per active goal, "Pick one. You can add to another goal after."). With no active goal, the second button is replaced by "You have no active goal to add a target to."
   - *The conversation:* a card says "Let's add to your goals" (or `Let's add to "<goal>"` when targets are added to one goal), then the same one-question-at-a-time conversation as step 2, held to what is not saved yet. What is already saved is skipped with one line that names the topics and never the values, so nothing saved is sent to Claude (only a saved goal's title, when targets are added to it; `docs/DOMAIN_MODEL.md` §2.1 rule 5). A target added to a goal that has already started is asked "When should this target start counting?", and it is never graded for weeks before it existed; a first week that starts partway through is shown and never counted as a miss (§1.3, Start row). The part holding the new work items is titled "How you'll track it".
   - *Success:* the playback and final cards work as in steps 3 and 4, and the addition is saved through its own save (migration 021), not by loosening the first setup's save.
   - *Failure exits:* the same error cards as step 2. A person who set up with only due-date goals has no saved week start, so a weekly or day-slot target is refused in plain words (Gap 26).
   - *Gap:* the quick-path card still reads as a first setup in an addition (Gap 28).

### 3. Measure

*Sources: design record §5 (criterion 1); the MOM-144 block prompt.*

- **Goal satisfaction:** one question asked of each trial user, such as "Was that time useful?" in the design record's criterion 1 measure. The wording for this product review cycle is not written (Gap 1).
- **Task completion:** per setup, finished (saved), abandoned (left without saving), or had to go back (used **Change my answer**, **Change something** or **Start again**). The design record's "heavy edit" count (a change to a target, level or source at playback, two or fewer per setup) is the pass bar.

### 4. Health

*Sources: the deck's setup slide; MOM-111 comments 2026-10-29 and 2026-10-30 (clarity fix, fix round, round 2, round 3, round 3b, round 3c, round 3d); MOM-166 (production runtime log and the owner's production check, 2026-11-02); MOM-167, MOM-168 and MOM-169 comments 2026-11-02; MOM-170 to MOM-174; `docs/FAILURE_LOG.md` F-064 to F-066 and F-096; PRs #65, #67, #73, #111, #114 and #115; `tests/setup-title-replay.test.ts`; `tests/e2e/setup.spec.ts`, `tests/e2e/setup-cards.spec.ts`, `tests/e2e/setup-link.spec.ts`.*

**Amber.** Setup works end to end, but it has needed repeated review rounds from the owner's phone runs (runs 1 to 3, then rounds 3b, 3c and 3d).

- **Run 1:** 14 issues with one root cause (the checks judged the previous screen, not what the person said). Fixed in PR #65.
- **Run 2:** the source step failed every time (the prompt never named the allowed app values, so replies were thrown away as shape errors, and every retry got the same general note). Fixed in PR #67. A live run then had 0 schema errors in 24 calls.
- **Run 3:** polish from the owner's screenshot review (dates, error cards, option wording), carried through rounds 3, 3b, 3c and 3d on MOM-111.
- **Round 3d (merged in PR #73, 2026-10-30):** the weekly floor question now reads "In a hard week, how many <thing> would still count?", number questions and idea buttons use everyday words, and the quick-path card says what to do next and promises no default (step 6).
- **Earlier production findings the same day:** F-064 (a follow-up question on the same topic was thrown away), F-065 (no way back from "Change something") and F-066 (questions in the model's own words, a pasted-back playback).
- **Since 2026-10-30:** the quick path became a card the person can finish (PR #87), and a person can add a goal or a target after setup (PRs #94 and #99). A live run of the adding conversation is recorded on MOM-132 and in `BACKLOG.md` (Gap 28). No phone run of either is recorded.
- **2026-11-02, production, the standing smoke-test account's setup:** a deadline goal could not get past its date: every reply after the date was accepted was thrown away (`draft.rule` on the deadline task's can-move answer). Earlier in the same run, replies were thrown away as `math.number` and `skip.unanswered` and recovered on retry (`skip.unanswered` was a false positive for a date accepted as a proposal; `math.number` could not be classed from the log). MOM-166 (High) fixes it before the Nov 5 freeze; until it is merged and live, a trial setup with a deadline goal cannot finish (Gap 31).
- **2026-11-02, later, production:** MOM-166 merged (PR #111) and the owner's deadline-goal setup passed on production (about 21:30 UTC), closing Gap 31. MOM-167 parts 1 to 3 and 14 merged (PR #114); the owner's iPhone checks passed (after an app switch the next card came, so MOM-169 is Closed and Gap 36 with it; Home's buttons clear Safari's bar). Part 1's title check then broke every production setup, because a target title's clean version was always a full sentence and the tests' fake model never wrote one (failure log F-096); fixed the same day in PR #115 with a replay test whose fake writes sentence-shaped entries. The first answer "I want to run three days a week" lost its target and number (Gap 42; fixed and merged in PR #117, MOM-168).
- **2026-11-02 evening, the owner's phone test:** the quick path dead-ends for a goal with no target and setup reached the recap with no target (Gap 37, MOM-170); "Pick a different date" answers with today when the iPhone date wheel opens (Gap 38, MOM-171); the quick path's date field overflows at 390px (Gap 39, MOM-172); the standing smoke-test account reached its per-person cap, 100 setup calls in 24 hours with retries counted (Gap 40, MOM-173). All but Gap 40 are scheduled before the Nov 5 freeze; for the trial the cap stays at 100 (owner).
- Evidence so far: `setup.spec.ts`, `setup-cards.spec.ts` and `setup-add.spec.ts` (browser tests, not phone runs).

### 5. Known gaps

*Sources: Jira (MOM-111 comments, MOM-132, MOM-139, MOM-140, MOM-145, MOM-150, MOM-151, MOM-159, MOM-163, MOM-166, MOM-167, MOM-168, MOM-169, MOM-170, MOM-171, MOM-172, MOM-173, MOM-174, MOM-175); `BACKLOG.md`; `docs/DOMAIN_MODEL.md` §1.3 and §2.1 change-log rows 2026-11-01 and 2026-11-02.*

| Step | Gap |
| --- | --- |
| 0 Create an account | Gap 30 closed by MOM-163 and Gap 33 by MOM-167 part 15; the production template paste and the different-browser re-walk passed on 2026-11-02 (owner) |
| 2 Answer | Gap 6 (phone-only checks); Gap 7 (newest wording has had no live call); Gap 8 (MOM-139); Gap 9 (MOM-140); Gap 32 (MOM-167 parts 4 to 13: setup's words); Gap 38 (MOM-171: the iPhone date wheel answers with today); Gap 41 (MOM-174: a wrong weekday with a right date); Gap 42 (MOM-168: extra detail in an answer). Gaps 31 (MOM-166) and 36 (MOM-169) closed on 2026-11-02 |
| 4 Confirm the whole | Gap 34 (the saved card's two ways home, spelled two ways); Gap 37 (MOM-170: the recap reached with a goal that has no target) |
| 6 The quick path | Gap 37 (MOM-170: a goal with no target dead-ends); Gap 39 (MOM-172: the date field overflows at 390px); Gap 40 (MOM-173: one bumpy setup can use the daily cap, so the quick path appears early) |
| 7 Add to my goals | Gap 26 (MOM-159: no week start for a person with only due-date goals); Gap 28 (MOM-132 follow-ups) |
| All | Gap 1 (satisfaction question); Gap 3 (MOM-145: the phone check of the themes) |

## J2 Log what I did

*Sources: `docs/DOMAIN_MODEL.md` §1.5 and §1.6; `app/log/page.tsx`; `tests/e2e/manual-entry.spec.ts`; the sections below.*

### 1. Goal

*Sources: `docs/DOMAIN_MODEL.md` §1.5 (manual sources) and §1.6; MOM-110 description.*

"Record that I did it, in a few seconds, on my phone." The entry is the person's own confirmation, and a manual entry always wins over a sync (§1.5).

### 2. Tasks

*Sources: `app/log/page.tsx`; `components/entries/` (TapControl, NumberControl, TimerControl, MinutesControl, ChecklistControl, DayPicker, EntryList, EntryFeedback); `components/layout/PageBackRow.tsx`; `tests/e2e/manual-entry.spec.ts`; MOM-110 comments 2026-10-27 to 2026-10-29; MOM-148 (PR #89).*

1. **Open the log.** The page is `/log`. It is a minimal try-it page: signed in only, and not in the navigation. On `main` the only link to it is **Log an entry** on the "Your setup is saved" card (Gap 11); with MOM-167 part 14 (not yet merged) it is also **Log an entry**, the one main button at the top of home for a person with an active goal. Since MOM-148 (PR #89) the page has a top row with **Back to home** and **Sign out**, so a person on a phone can leave it.
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
| 1 Open the log | Gap 11 (no navigation link on `main`; MOM-167 part 14 adds **Log an entry** to home, pending merge; MOM-112 was to put the controls on home) |
| 2 Timer | Gap 12 (a running timer lives in one browser; typed minutes cover the unrecorded time) |
| 3 Say which day | Gap 13 (no day end means no other day and no start-date judgement) |
| 4 Remove or restore | Gap 14 (own manual entries only; synced entries wait for MOM-112) |

## J3 Connect where I already track it

*Sources: `docs/DOMAIN_MODEL.md` §1.5; `docs/INTEGRATIONS_SPEC.md` §3; `app/connections/page.tsx`; `tests/e2e/connections.spec.ts`; the sections below.*

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
| 6 Unsupported app | Gap 16 (no "request this integration" control) |
| Own tracker sheet | Gap 17 (MOM-117 for Google, MOM-136 for OneDrive) |

## J4 Review my week and adjust

*Sources: `docs/DOMAIN_MODEL.md` §3; `app/review/page.tsx`; `tests/e2e/review.spec.ts`; the sections below.*

### 1. Goal

*Sources: `docs/DOMAIN_MODEL.md` §3.*

"At the end of my week, show me honestly how it went and let me change one thing for next week." The review runs at the end of the week as the person defined it, never on a fixed weekday (§3).

### 2. Tasks

*Sources: `components/review/ReviewScreen.tsx`, `RecapBody.tsx`, `ReviewSitting.tsx`, `sittingWording.ts`, `adjustmentWording.ts`, `StillRightCard.tsx`, `stillRightWording.ts`, `TargetChangeForm.tsx`, `targetChangeWording.ts`; `components/home/ReviewNotice.tsx`; `app/review/page.tsx`; `tests/e2e/review.spec.ts`, `tests/e2e/review-change-screens.spec.ts`, `tests/e2e/review-still-right-screens.spec.ts`; MOM-113 and MOM-146 comments; `docs/DOMAIN_MODEL.md` §3.1 and §3.2; PRs #79, #91 and #92 (MOM-113 block 3.3 and 3.4, MOM-146).*

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
4. **Decide the one adjustment, or check what setup suggested (layer 3).** One of two cards takes layer 3's place.
   - **"Still right for you?"** (MOM-113 block 3.4, PR #92). When the person took a suggestion at setup for a target's numbers or days instead of saying it themselves, the review asks once, at the first review after it was made (or after the app can change that value): "At setup you took these as suggestions instead of saying them yourself. Does each one still fit?" The suggestions are grouped by target (its name once, then one row per value in the person's own words), each with two equal answers, **Yes, it fits** and **No, change it**. **No, change it** opens the same edit as below. The engine's own adjustment is raised again at the next review (§3.2).
   - **The engine's one adjustment.** When it raised one, a card asks a single question in about 12 words, with a detail line, and three equal choices in this order: **Yes, I want to change it**, **No, keep it as it is** and **Skip for now**. After a choice it says so plainly ("Okay. It stays as it is." or "Skipped. Nothing changes.").
   - **What "change it" does for a target's numbers** (MOM-146, PR #91): for a slipping check-in or a raise-the-bar adjustment, the edit opens in the same card. It asks the numbers in the setup's own plain questions ("Now: 3." and, when known, "Last week you did 2."), the aspiration can be left empty, and a weekly day-slot target also asks "Which days?". It says "This starts <day>. Weeks before that keep the numbers they had." and has **Save the change** and **Never mind**. After saving: "Saved. From <day>: 4 runs in a hard week, hoping for 6." and **Change it again**. A change starts with the period after the reviewed one and never in a closed week; it is an append-only row (migration 020). Home shows "From <day>: …" until it takes effect.
   - *Gap:* **Yes, I want to change it** still only records the choice for a deadline forecast ("Changing a deadline … isn't in the app yet"), even though `/task/<id>` can now edit a deadline task (J5 step 4), and nothing edits a goal's priority or clash handling (Gap 21).
5. **Finish the review.** **Finish review** (it reads "Saving…" while it saves; the hint beside it says "Choose one of the three above to finish.") stores the review once, with the recap and the person's choice. Claude's sentence is not stored.
   - *Failure exit:* a save that fails shows the error and brings **Finish review** back, so the person can tap again.
6. **Plan the week.** After a finished review: "Your review is done. Next, choose what you'll do on which days." with **Plan your week**, or, when the person chose to plan separately, "You chose to plan your week separately, so it's there when you want it." with **Open your week plan**.
7. **Read a finished review.** A finished review reads back as it was said ("You finished this review <when>. It stays as it was said."), and a later entry shows under "Since this recap", never in its place.

### 3. Measure

*Sources: design record §5 (criterion 4).*

- **Goal satisfaction:** the trial question is not written (Gap 1).
- **Task completion:** the design record logs each layer 3 outcome as changed, looked and chose no change, or skipped. Since PR #79 each finished review stores that choice (changed, declined or skipped), so the count can be read once reviews are run. Since PR #91 a "changed" outcome on a target's numbers does change the target from the next period, so the count now reads as a real change; for a deadline forecast, a goal's priority and its clash handling it still changes nothing (Gap 21).

### 4. Health

*Sources: `tests/e2e/review.spec.ts`.*

**Not yet rated** (Gap 20). Evidence so far: `review.spec.ts` (browser test, not a phone run), at 390px and 1280px. Since PR #79 it also walks the whole sitting (the line on a tap, the choice, one finish) with a fake model standing in for Claude.

### 5. Known gaps

*Sources: Jira MOM-113, MOM-114, MOM-146, MOM-148; `app/settings/page.tsx`; `docs/plans/archive/2026-10-30.md` ("MOM-114 ships as 'defaults only' for the trial").*

| Step | Gap |
| --- | --- |
| All | Gap 20 (no phone-run evidence) |
| 1 See the notice | Gap 2 (MOM-148: `/review` has no navigation link of its own) |
| 4 Decide the adjustment | Gap 21 (MOM-146: "change" edits a target's numbers only); Gap 27 (MOM-151: the review still says "floor" and "aspiration" in places) |
| 2 Read the recap | Gap 22 (**Open settings** leads to a page with only Account and Appearance; MOM-114) |

## J5 See where I stand

*Sources: `docs/DOMAIN_MODEL.md` §1.4 and §1.7; `app/page.tsx`; `tests/e2e/home.spec.ts`, `tests/e2e/plan.spec.ts`; the sections below.*

### 1. Goal

*Sources: `docs/DOMAIN_MODEL.md` §1.4, §1.7.*

"Tell me, honestly and at a glance, how I'm doing against what I said I'd do, and let me pick what to do on which day." Every number is computed from entries and the target in force, never typed (§1.7).

### 2. Tasks

*Sources: `app/page.tsx`; `components/home/` (WeekHero, GoalScoreboardCard, TargetRow, MilestoneRow, YourPlanCard, SetupLinkCard, AddGoalsLink, ScoreboardLoadFailed, wording.ts); `components/plan/PlanScreen.tsx`; `app/plan/kinds/page.tsx`; `app/task/[id]/page.tsx`; `components/forecast/` (KindTimesScreen, TaskEditScreen, wording.ts); `tests/e2e/home.spec.ts`, `tests/e2e/plan.spec.ts`, `tests/e2e/setup-link.spec.ts`, `tests/e2e/forecast-edits.spec.ts`, `tests/e2e/old-controls-shots.spec.ts`; MOM-115 and MOM-138 comments; PRs #88 and #101.*

1. **Open home.** The person sees the week hero and each goal with its scoreboard. Weekly targets show against their levels, with "From <day>: …" under a target whose numbers will change (MOM-146); a deadline task shows a forecast in words. Since MOM-115 (PR #88) the old model's controls (the goal wizard and weekly pace buttons, the goal channel list and cards, the rebalance nudge and the AI Assistant tab) are hidden: the older feed shows only when the old model has tasks, a finished list or the signed-out card. A scoreboard that could not be read says so with one **Reload** button. A person with a saved setup also sees, at the top of home, **Log an entry** as the one main button and **Add to your goals** as a secondary button under it (J1 step 7, MOM-167 part 14, not yet merged); a person whose goals are all set aside has nothing to log, so **Add to your goals** is their one main button.
2. **Read the forecast.** For a deadline task home says whether the days set aside look enough, close, short, not enough to say, or past due, and offers ways forward. "Move the date" appears only when setup recorded that the date can move (§1.4).
3. **Plan the week** at `/plan`: pick items onto dates, say what kind of day a date is (with a reason), copy last week's kinds with one tap ("Same as last week"), step to next week and back. A day that has passed is read-only.
4. **Change what the forecast rests on** (MOM-138, PR #101). Two edit screens sit behind home's forecast lines. `/plan/kinds`, headed "How much time each kind of day gives", sets how much time a kind of day usually gives, in hours or in sessions; a kind with none says "No usual time yet", and a link to it ("Change how much time each kind gives") is on the week plan. `/task/<id>` sets a deadline task's rough size in hours ("How big is this?"), lets the person add, rename, remove or tick its steps, and moves its due date ("Move the date to") only when setup recorded that the date can move ("Due Fri, Nov 20. You said this date can move."). Saving says "Saved." with "See it on home." No internal word (capacity, day type, slot, target, milestone, forecast) is on screen; a test fails if one is.
   - *Gap:* a person with no kinds of day cannot add one after setup, and moving a task's due date leaves its target's own deadline as it was (Gap 29).
5. **Failure exits, in words:**
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

*Sources: `tests/e2e/home.spec.ts`, `tests/e2e/plan.spec.ts`, `tests/e2e/forecast-edits.spec.ts`.*

**Not yet rated** (Gap 23). Evidence so far: `home.spec.ts`, `plan.spec.ts`, `setup-link.spec.ts` and `forecast-edits.spec.ts` (browser tests, not phone runs), at 390px and 1280px.

### 5. Known gaps

*Sources: Jira MOM-112, MOM-115, MOM-138, MOM-167; `BACKLOG.md`; `tests/e2e/home.spec.ts`; `docs/DOMAIN_MODEL.md` header.*

| Step | Gap |
| --- | --- |
| All | Gap 23 (no phone-run evidence) |
| 1 Open home | Gap 35 (MOM-167 part 16: a goal's card does not open the goal) |
| 4 Change what the forecast rests on | Gap 29 (MOM-138 follow-ups) |

## Open gaps

*Sources: the sections above; `BACKLOG.md`; Jira MOM-110, MOM-111, MOM-114, MOM-132, MOM-138, MOM-146, MOM-151, MOM-159, MOM-160, MOM-161, MOM-162, MOM-163, MOM-166, MOM-167, MOM-168, MOM-169, MOM-170, MOM-171, MOM-172, MOM-173, MOM-174, MOM-175.*

Gap numbers stay as first assigned, so a number that is missing below was closed (listed under the gaps).

1. The satisfaction question for each journey (J1 to J5) is not written. The owner writes it. It is a trial measure (J1 to J5, Measure).
2. J4 step 1: `/review` has no navigation link of its own; it is reached from home's notice on the planning day (MOM-148 gave every signed-in page a way home and Sign out, but did not add a link to the review).
3. Every journey: the real-phone check of the light and dark themes is still open (`BACKLOG.md`, the layout items for MOM-30 and MOM-145). The dark theme's flatness itself is fixed by MOM-145 (PR #83); its follow-ups (the day buttons' look in a live check, a check mark on the chosen theme and review choices) are in `BACKLOG.md`.
6. J1 step 2: checks only a phone can do are not done: the native date picker on iPhone and Android, the amber alert in sunlight and at larger text sizes, and the keyboard opening after "Change my answer" (MOM-111 comment 2026-10-29, round 3b).
7. J1 step 2: the newest question wording (the weekly floor question "In a hard week, how many <thing> would still count?", merged in PR #73) has no live Claude call recorded in the files read for this update (MOM-111 comment 2026-10-30, round 3d follow-up).
8. J1 step 2: where a settings choice and a priority came from at setup is not recorded (MOM-139).
9. J1 step 2: fields the draft has no place for, the app-request vote and tap-to-answer example chips (MOM-140).
10. J2, all steps: no phone-run evidence; the real-iPhone check (log one of each kind, remove and restore, a tap on yesterday, typed minutes, a tick on a chosen day) is not done (MOM-110).
11. J2 step 1: `/log` is a try-it page with no navigation link on `main`; MOM-112 was to put the entry controls on home, and home has none on `main`. MOM-167 part 14 adds a **Log an entry** button to home (branch `feature/MOM-167-setup-words`, pending merge); the entry controls themselves stay on `/log` (MOM-110 comment 2026-10-27, MOM-112).
12. J2 step 2: a running timer is kept in the browser that started it (RAID R-20; MOM-110 comment 2026-10-27). Typed minutes cover time that was not timed.
13. J2 step 3: with no day end set, no other day is offered and a log cannot be judged against its goal's start (MOM-110 comment 2026-10-28). Setup collects the day end first (MOM-111).
14. J2 step 4: remove and restore cover the person's own manual entries only; removing synced entries waits for MOM-112 (MOM-110 comment 2026-10-27).
15. J3, all steps: no phone-run evidence.
16. J3 step 6: Connections has no "request this integration" control, which `docs/DOMAIN_MODEL.md` §1.5 says to offer.
17. J3: the person's own tracker sheet as a source is not built (MOM-117 for Google, MOM-136 for OneDrive).
18. J3 step 3: no Hevy or Google webhooks, so a sync happens only on a tap (MOM-98; `docs/INTEGRATIONS_SPEC.md` §4).
19. J3 step 3: the Sync now control is on the Hevy card only; a connected Google Calendar card shows no sync control (`components/integrations/ConnectionControls.tsx`).
20. J4, all steps: no phone-run evidence.
21. J4 step 4: "Yes, I want to change it" edits a target's numbers from the next period (MOM-146, PR #91), but it still only records the choice for a deadline forecast (though `/task/<id>` can now edit a deadline task), and nothing edits a goal's priority or its clash handling after setup; "Still right for you?" asks only about a target's numbers and days (`BACKLOG.md`, the weekly review follow-ups). There is no undo; "Change it again" before the day it starts covers it.
22. J4 step 2: the review's **Open settings** link leads to a page that holds only Account and Appearance (the theme choice); the day-anchor and planning-day controls it asks for are not there (MOM-114, planned "defaults only" for the trial in `docs/plans/archive/2026-10-30.md`). J1 steps 2 and 4 say so since MOM-178: the settings card and the final card tell the person they cannot change these after setup yet.
23. J5, all steps: no phone-run evidence.
26. J1 step 7: a person who set up with only due-date goals has no saved week start and no screen can set one, so a weekly or day-slot target is refused for them in plain words (MOM-159).
27. J1 step 7 and J4 step 4: the scoreboard and review cards still say "Floor 2 a week · aspiration 4" and "Under the floor 3 weeks running", while the questions say "in a hard week" and "hoping for" (MOM-151).
28. J1 steps 6 and 7: follow-ups from adding after setup (MOM-132; MOM-160): the quick-path card's reason line and "Everything you said is kept" lines still read as first setup in an addition; the live run of the adding conversation took about 21 turns, with the model asking for a starting point and an aspiration the script had no line for; four new words await the owner's review; starting-point marks for an added target's start are not built (`BACKLOG.md`, "Setup, adding to goals").
29. J5 step 4: follow-ups from the forecast edits (MOM-138; MOM-161 and MOM-162): a person with no kinds of day cannot add one after setup; moving a task's due date leaves its target's own deadline as it was; the "you count your time in sessions" line has no link to `/plan/kinds`; two database guards (a due date that cannot move, a step with entries) are not built (`BACKLOG.md`, "Forecast edits").
32. J1 steps 2 and 3: setup's words, the rest of MOM-167 (after Nov 6): the aim question does not name its level and a generated question slipped in grammar (part 4); "when life gets in the way" reads as a repeat of the floor (5); capitals mid-sentence in lists, and priorities and quiet times that can still be sentence-shaped (6); the time zone asked as a bare question, not offered as the device's zone (7); the "Your days and weeks" playback has a confusing midnight day-end line (10); the reminders and check-in questions are asked before anything delivers them (12, 13; MOM-112).
34. J1 step 4: the saved card shows the page's "Back to home" row above its own **Go to Home** button: two ways home, spelled two ways (owner, 2026-11-02; MOM-167).
35. J5 step 1: tapping a goal's card on home does not open the goal; it should offer "log for this goal" first and "add a target to this goal" second (MOM-167 part 16).
37. J1 steps 4 and 6: setup reached the recap with a goal that had no target, and the quick path then showed the missing target as "Can't be answered here" with only **Start again**, a dead end; nothing in code makes the targets playback wait for a target (owner's phone test, 2026-11-02; MOM-170, before the Nov 5 freeze).
38. J1 step 2: fixed in the test-day-1 fixes block (MOM-177): on an iPhone the date wheel fires a change as it opens, so "Pick a different date" answered with today; a pick now only shows the date and **Use this date** answers (MOM-171 is covered by it).
39. J1 step 6: the quick path's date field runs past its card at 390px (MOM-172, before the freeze).
40. J1 steps 2 and 6: one bumpy setup can use a tester's whole daily allowance, because every try counts toward the per-person cap of 100 calls in 24 hours (up to 3 per turn, resends, Try again); the standing smoke-test account reached it on 2026-11-02 (100 calls, 96 ok). For the trial the cap stays at 100 and retries still count (owner); the design comes after the trial (MOM-173, `risk`). The quick path card now says when Claude is back ("You can use Claude for setup again after about 9:15 AM.", in the saved time zone, else the phone's own, else "in about N hours"; MOM-177). When the stop is a limit that lifts, the "Can't be answered here" callout says to come back to this tab after that time, reload and tap Send it again (what was said is kept in the tab, which a browser test checks across a reload); it no longer says "these last answers finish it" when nothing on the card can be answered.
41. J1 step 2: a date given with the wrong weekday ("Thursday, Dec 25", a Friday in 2026) must be asked back with both readings, never silently picked; not yet tested (MOM-174).
42. J1 step 2: extra detail inside an answer was not used: the first answer "I want to run three days a week" lost its target and its 3, and the recap said a thing to count was missing. Fixed in PR #117 (replay tests, eval cases `run-n-compound-answer` and `run-o-first-answer-holds-target`); open until the owner's phone recheck passes (MOM-168). Its follow-ups are MOM-175.

**Closed since the first fill.** Gap 2's header and Sign out (MOM-148, PR #89); Gap 4, adding a goal or target after setup (MOM-132, PRs #94 and #99); Gap 5, the quick path that made a person start again (MOM-111, PR #87); Gap 24, the older feed below the scoreboard (MOM-115, PR #88); Gap 25, updates beside "Saving…" (MOM-147, PR #93); Gap 30, the sign-in and sign-up words (MOM-163; the production resend window is 60 seconds, so "Wait a minute" stays); Gap 31, a deadline goal past its date (MOM-166, PR #111; the owner's production check passed on 2026-11-02); Gap 33, the "Check your email" card's way on, and the parts of Gap 32 that named the raw time zone id, "1 hours" and "gentle to blunt" (MOM-167 parts 8, 9, 11 and 15; the playback now reads "You're on Pacific Time.", a count of one reads "1 hour", the tone line runs gentle to direct); Gap 36, a request left hanging after an iPhone app switch (MOM-169 Closed: on the owner's check the next card came).
