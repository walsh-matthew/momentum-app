Template: AI eval plan with error-analysis loop · Last updated: 2026-10-30 (this branch) · Filled by: MOM-144 first fill · Open gaps: 7, listed at the end

# Momentum evals

How Momentum checks the places Claude is used. The rules being checked are in [`docs/DOMAIN_MODEL.md`](../DOMAIN_MODEL.md) §2.1; this file links to them and does not copy them. Claude never scores and never does math (§1.7), so what is evaluated is its words and its drafts, not the numbers.

## 1. What's evaluated

*Sources: design record `docs/design/2026-10-26-goal-model-design.md` §5.1 and §6.2; `docs/DOMAIN_MODEL.md` §2 and §3; `docs/LLM_GOVERNANCE.md`; Jira MOM-111, MOM-113.*

- **Now: the setup conversation** (MOM-111). Every turn of Claude's passes through the rule checks and the plain-words checks, and the final draft must pass the same schema validation as the saved model (§2.3).
- **Next: the weekly review's layer 2 line** (MOM-113 block 3.3, code checks). Not merged, so nothing is checked yet (Gap 6). The prompt for the review gets a fact list from the engine and may not add numbers (§3.3).

## 2. Quality bar

*Sources: `lib/setup/checks.ts` (read for this fill); `lib/setup/evals.ts`; `docs/DOMAIN_MODEL.md` §2.1 (hard rules and plain language); MOM-111 comments 2026-10-29 and 2026-10-30.*

The bar is the eight hard rules ([`DOMAIN_MODEL.md` §2.1](../DOMAIN_MODEL.md)), the draft rules and the plain-words checks. The checks are heuristics over words and structure, not language understanding, and they err toward flagging (`lib/setup/checks.ts` header). A reply that breaks a hard rule or a draft rule is thrown away and asked for again with fixed words saying which rule failed. A plain-words failure gets one retry and then the reply is shown and the rule logged, so a plain-words check never ends a setup in "Try again" (`checks.ts` header; `DOMAIN_MODEL.md` §2.3).

| Rule | Code(s) | What the check catches |
| --- | --- | --- |
| One question per turn | `one_question.none`, `.marks`, `.no_mark`, `.hidden`, `.sentences`, `.joined`, `.options` | No question, not exactly one question mark, no mark at the end, a question hiding outside the question field, more than one sentence, two asks joined, options on a kind of turn that lists none |
| Assume nothing | `assume_nothing.word`, `.changed` | A day or clock-time word the person did not say; a draft value that changed without the person's newest answer |
| No announced reminder | `no_announced_reminder` | Claude announced a reminder, check-in or nudge instead of asking |
| Choice before examples | `choice.ideas_unasked`, `.offer_words`, `.offer_examples`, `.examples` | Ideas given without being asked for; an offer without the choice; examples inside the offer; examples in a question that needs the choice first |
| Skip what is answered | `skip.repeat`, `.unanswered`, `.long` | A topic asked again; a skip of a topic not yet answered; a skip notice longer than one short line |
| Numbered interpretations | `interpretations.count`, `.guessed`, `.changed` | Not two to four readings; guessing when the answer did not fit; the draft changing on an answer that did not fit |
| Chunked playback | `playback.words`, `.final_changed`, `.no_chunk`, `.stray_chunk`, `.early_final`, `.final_long`, `.unapproved`, `.changed_after` | Claude writing playback words (code writes them); the model changing during the final confirmation; a part marked approved without being played back; the final confirmation before every part was approved or too long |
| No math | `math.score`, `.arithmetic`, `.number` | Claude scored or graded; did arithmetic; wrote a number the person did not say |
| Draft | `draft.no_source`, `.not_said`, `.not_accepted`, `.rule` | After every turn the draft must validate; a value with no source in the conversation is asked for in that turn, never guessed again |
| Plain words | `plain.lead_in`, `.question_long`, `.activity`, `.date_lead_in`, `.date_asks`, `.options_say`, `.jargon`, `.unquoted_source` | A lead-in that previews the question or runs past one short line (110 characters); a question over 14 words; an activity the person never said; a date repeated in the lead-in, or shown and then asked for; a lead-in over 60 characters on a card of options; model words (floor, aspiration, baseline) the person never said; a line pointing at an earlier answer without quoting it |
| Option lists | `choice.ideas_context`, `.ideas_bare`, `.ideas_scale`, `.ideas_role`, `.ideas_words` | An offer of ideas with no detail line; an option that is a bare number; a run of five or more consecutive numbers; a number option that does not say which number it sets; an option counting a thing the person did not say |

## 3. The eval set

*Sources: `tests/setup-evals/cases.ts` (counted by loading `SETUP_CASES`, 2026-10-30); `tests/setup-evals/smokeCases.ts`; `tests/live/*.live.ts`; `docs/LLM_GOVERNANCE.md`; `BACKLOG.md` (setup live-run items); MOM-111 comments.*

Scripted cases pair a scripted person with a scripted fake model, so `npm test` makes no network call. Every name, date and number in them is invented.

| Type | Count | What it is |
| --- | --- | --- |
| Full conversations that must come out clean | 13 | `run-a` to `run-l` (a deadline-only goal, ideas, answered already, an ambiguous answer, a changed mind, an early day end, a relative deadline, two activities, "what do you mean" on the crowd-out and the day-end questions, a long first message, one-word answers) and `run-r-reading-ideas` (a goal that is not exercise) |
| Short conversations with one deliberately bad turn | 8 | One per hard rule: `fx-one_question`, `fx-assume_nothing`, `fx-no_announced_reminder`, `fx-choice_before_examples`, `fx-skip_answered`, `fx-numbered_interpretations`, `fx-chunked_playback`, `fx-no_math` |
| **Total in `cases.ts`** | **21** | Matches the file's header ("thirteen" and "eight") |

Cases from the owner's phone smoke tests of 2026-10-29 sit apart in `tests/setup-evals/smokeCases.ts`. A text search finds 8 case ids there (for example `smoke-9-guessed` and `run-m-phone-paths`). They run through `tests/setup-smoke-fixes.test.ts`.

**The live pilot.** `npm run eval:setup:pilot` runs one full scripted case against the real model through the same service the app uses. It is not part of `npm test` or CI. It refuses to run unless the database is the local stack, and it stops by itself past an estimated $6 (`docs/LLM_GOVERNANCE.md`). The later live runs on the owner's own path used lower caps: $2 for round 3 and $1 for round 3b (MOM-111 comments 2026-10-29). A reply that is not a valid turn is asked for again up to twice, and every such reply is counted in the report.

## 4. Error analysis log

*Sources: `docs/FAILURE_LOG.md` F-064 to F-066 (in-product); MOM-111 comments 2026-10-29 and 2026-10-30; PRs #65 and #67 (named on the deck); `docs/DOMAIN_MODEL.md` change log.*

Only rows with a source. A row says what went wrong, its category, and what it became.

| Date | What went wrong | Category | What it became |
| --- | --- | --- | --- |
| 2026-10-29 | After "2 goals" the natural next question was thrown away three times as a repeat (F-064) | `skip_answered` (a same-topic follow-up counted as a repeat) | Code fix (MOM-111): a same-topic question right after the answer is a follow-up; step 3 asks the goals as their own question. Rule: `DOMAIN_MODEL.md` §2.1 rule 5. |
| 2026-10-29 | At a playback, "nothing" and "I don't want to change anything" could not approve; nine replies and nine Claude calls were wasted (F-065) | `chunked_playback` (the approval check read "no" and "change" as a refusal) | Code fix (branch `feature/MOM-111-playback-no-change`) |
| 2026-10-29 | The owner could not tell what "what needs protecting" meant; the explanation was thrown away seven times; the playback pasted the person's words back (F-066) | `skip_answered` and `choice_before_examples` forbidding a plain explanation; model words in the step summaries | Code fix (`feature/MOM-111-setup-clarity`, 4dd29ee). New standing rule: the plain-language principle, `DOMAIN_MODEL.md` §2.1. Four new eval cases ("what do you mean" on two questions, a long first message, one-word answers). |
| 2026-10-29 | Phone run 1: 14 findings with one root cause (the checks judged the previous screen, not what the person said, and a retry sent the same input) | Retry loop and `said` provenance | Code fix (`feature/MOM-111-setup-smoke-fixes`, fa56502; PR #65): fixed-word retry feedback (`lib/setup/feedback.ts`), what the person said read wherever they said it (`lib/setup/said.ts`). Eval cases for the ask and the guessed number. |
| 2026-10-29 | Phone run 2: the source step failed every time; replies with "Hevy" or an extra key were thrown away as shape errors | `draft.*` (the prompt never named the allowed app values) | Code fix (7979d8b; PR #67): the prompt lists the apps, a missing key counts as not answered, retries name the failing path. Live run: 24 calls, 0 failures; 7 replies thrown away (`plain.lead_in` x3, and one each of `math.number`, `draft.rule`, `one_question.options` and not JSON). |
| 2026-10-29 | Round 3: weak option lists ("2 a week" with nothing counted), dates asked for when code had one, two ways to pick a date | `choice.ideas_*`, `plain.*` | Code fix (127cc34): new checks `choice.ideas_context`, `.ideas_bare`, `.ideas_scale`; `normalizeDateTurn`. 76 new tests (`tests/setup-round3.test.tsx`). Live run: 20 calls, 4 replies thrown away. |
| 2026-10-29 | Round 3b: number questions that had to be decoded, a date shown then asked for, alert cards that read as failures | `choice.ideas_role`, `choice.ideas_words`, `plain.date_asks` | Code fix (401d128): new checks, one gentle alert look. 147 new tests (`tests/setup-round3b.test.tsx`). Live run: 15 calls, 2 replies thrown away. |
| 2026-10-29 | Round 3c: cards that went mid-bold, heavy-bold, then light-bold; a recap that read as telling the person what they will do | `plain.options_say`; weight and wording | Code fix (ca99ce5): one bold line per card, `plain.options_say`. 38 new tests (`tests/setup-round3c.test.tsx`). |
| 2026-10-30 | Round 3d: "How many X make a week count, even a hard one?" read as ambiguous; the quick-path card promised "sensible defaults" that no code applies | Wording; a promise the code did not keep | Code fix (eb24625, d8b66d4, f6d6421): the question is now "In a hard week, how many <thing> would still count?", written once in `lib/setup/numbers.ts`; `DOMAIN_MODEL.md` §2.3 says what the quick path does. A test fails if "sensible default" returns. Live run: 21 calls, 5 replies thrown away. |

## 5. Latest results

*Sources: `npm test` run on this branch on 2026-10-30; `BACKLOG.md` (setup live-run item); MOM-111 comments 2026-10-29 and 2026-10-30.*

- **Unit and component tests, my own run on this branch** (cut from `main` at 7d30531, before these docs were added): `npm test` passed, 113 test files and 4,152 tests, no network call.
- **Last live runs the repo records** (`BACKLOG.md`, setup live-run item): round 2, 20 turns and 24 calls, about $1.55; round 3, 19 turns and 20 calls, about $1.26; round 3b, 16 turns and 15 calls, about $0.92 (stopped by its $1 cap before the source answer). In each, every turn produced a usable reply; thrown-away replies were retried (7, 4 and 2).
- **Newest live run, on Jira only** (MOM-111 comment 2026-10-30): 19 turns, 21 calls, 249,772 input and 16,817 output tokens, about $1.34. It reached both number cards and both ideas cards. Five replies were thrown away. The floor ideas card was shown after its plain-words retry still held `plain.unquoted_source`.
- **Budget:** the per-setup budget is still the placeholder of 40 turns and 1,000,000 tokens (`docs/LLM_GOVERNANCE.md`).

## 6. Gaps

*Sources: `BACKLOG.md` setup live-run item; `docs/LLM_GOVERNANCE.md`; design record §6.2; MOM-111 and MOM-113.*

See the list below. The main ones: no simulated person and no three-model run yet, so the budget numbers cannot be set; and nothing checks the review's layer 2 line yet.

## Open gaps

*Sources: the sections above.*

1. There is no simulated person: the scripted stand-in answers by position, and a live run answers from the case's replies with a neutral filler when the case has none (`BACKLOG.md`, setup live-run item (a) and (c)).
2. The 8 full cases have not been run on the setup model and on the two smaller models, and the smaller-model trial has not been run (`BACKLOG.md`, setup live-run item (a); design record §6.2 step 3).
3. The per-setup budget (40 turns, 1,000,000 tokens) is a placeholder, not the 90th percentile of eval runs plus the owner's margin (`docs/LLM_GOVERNANCE.md`; design record §6.2 step 2).
4. The newest question wording has had no live call: the 2026-10-30 live run used the old floor question, and the later commits changed it (MOM-111 comment 2026-10-30, round 3d follow-up).
5. Live-run reports live on Jira, not in the repo. The repo records the runs only up to round 3b; the pilot's own report and the round 3d run are on MOM-128 and MOM-111.
6. The weekly review's layer 2 line has no checks and no eval cases yet (MOM-113 block 3.3, not merged).
7. The checks are heuristics, and no measured pass rate per rule exists from live runs: only a live run shows whether the prompt keeps Claude inside them (`lib/setup/checks.ts` header).
