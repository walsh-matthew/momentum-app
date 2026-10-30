// The eight hard rules of guided setup as automatic checks on one turn of Claude's (docs/DOMAIN_MODEL.md §2.1; MOM-111).
// The setup eval set runs every one of them on every turn. They are heuristics over words and structure, not language
// understanding, and each errs towards flagging: a turn that trips one is a turn to look at. A fake model in `npm test`
// shows the checks catch what they should; only a live run shows whether the prompt keeps Claude inside them.
//
// Each violation carries a stable `code`, so a reply that is thrown away can be retried with fixed words that say which
// rule failed and what to do instead (lib/setup/feedback.ts, MOM-111 root cause A). Besides the eight rules there are the
// draft rules and the plain-words checks (a lead-in that previews the question, an activity the person never said): the
// service gives a plain-words failure one retry and then shows the reply, so those never end a setup in "Try again".
//
// What the person said is read from their words wherever they said it (lib/setup/said.ts, root cause B), never from which
// kind of turn came before.
// Pure: no model, no database, no network.

import {
  HARD_RULE_IDS,
  SETUP_CHUNKS,
  type AssistantTurn,
  type HardRuleId,
  type SetupChunk,
  type SetupDraft,
  type Transcript,
  type TurnKind,
} from '@/types/setup';
import { unsaidActivities } from './activities';
import { answeredTopics, changedLeafPaths, chunkSlice, freeTextLeaves } from './leaves';
import { FINAL_MAX_LINES, renderFinal } from './playback';
import { answerWords, latestAnswer, personWords, type PersonAnswer } from './said';
import { DATE_TOPICS, hasDate } from './codeTurns';
import { NUMBER_OPTION_LEADS, NUMBER_TOPICS } from './numbers';
import { optionsLead } from './optionsLead';
import { ASKED_ONCE_TOPICS, DAY_END_SAY, SINGLE_VALUE_FACTS, SUGGESTION_TOPICS, UNRECORDED_TOPICS } from './steps';
import { acceptsText, asksForIdeas, asksMeaning, datesIn, dayTimeWords, declinesChange, numbersIn, sentencesOf, wantsIdeas, withoutDateWeekdays } from './text';
import { validateDraft } from './validate';

export interface TurnContext {
  // Everything before this turn. It ends with the person's latest message and is empty at the start.
  transcript: Transcript;
  // The draft as it stood before this turn.
  prevDraft: SetupDraft;
  // Scripted cases mark an answer that does not fit its question (rule 6); a live run leaves this unset.
  personFits?: boolean;
}

// The eight hard rules, the draft rules, and the plain-words checks (MOM-111 findings 4 and 6).
export type ViolationRule = HardRuleId | 'draft' | 'plain_words';

export const VIOLATION_CODES = [
  'one_question.none',
  'one_question.marks',
  'one_question.no_mark',
  'one_question.hidden',
  'one_question.sentences',
  'one_question.joined',
  'one_question.options',
  'assume_nothing.word',
  'assume_nothing.changed',
  'no_announced_reminder',
  'choice.ideas_unasked',
  'choice.offer_words',
  'choice.offer_examples',
  'choice.examples',
  'skip.repeat',
  'skip.unanswered',
  'skip.long',
  'interpretations.count',
  'interpretations.guessed',
  'interpretations.changed',
  'playback.words',
  'playback.final_changed',
  'playback.no_chunk',
  'playback.stray_chunk',
  'playback.early_final',
  'playback.final_long',
  'playback.unapproved',
  'playback.changed_after',
  'math.score',
  'math.arithmetic',
  'math.number',
  'draft.no_source',
  'draft.not_said',
  'draft.not_accepted',
  'draft.rule',
  'plain.lead_in',
  'plain.activity',
  'plain.question_long',
  'plain.date_lead_in',
  'choice.ideas_context',
  'choice.ideas_bare',
  'choice.ideas_scale',
  'choice.ideas_role',
  'choice.ideas_words',
  'plain.date_asks',
  'plain.options_say',
] as const;
export type ViolationCode = (typeof VIOLATION_CODES)[number];

export interface Violation {
  rule: ViolationRule;
  code: ViolationCode;
  // For the eval report and the tests. Never sent to Claude or logged: it can quote a word of the turn.
  message: string;
  // The draft path a draft violation is about. Paths are keys and field names, never values.
  path?: string;
}

const ASKING_KINDS: readonly TurnKind[] = ['question', 'offer_ideas', 'ideas', 'interpretations', 'proposal'];

// In the day-end question, and only there, Claude may say the two boundaries of the early-day-end rule (MOM-125).
const DAY_END_BOUNDARY_WORDS = /\b(midnight|6 in the morning|six in the morning)\b/gi;

// Everything Claude wrote in a turn, the detail line included (MOM-111 round 2, finding 1): every check reads it.
const authored = (turn: AssistantTurn): string[] => [turn.say, turn.question ?? '', turn.detail ?? '', turn.skipped?.line ?? '', ...turn.options];

// Claude's words as the day/time and number checks should read them: boundary words removed for the day-end question, and a
// weekday that belongs to a written date ("Tuesday, Oct 27") left out, since it is the date's, not the person's week.
const textForScan = (turn: AssistantTurn, parts: string[]): string => {
  const text = withoutDateWeekdays(parts.join(' \n '));
  return turn.topic === 'day_end' ? text.replace(DAY_END_BOUNDARY_WORDS, ' ') : text;
};

const lastAssistant = (ctx: TurnContext): AssistantTurn | null => {
  for (let i = ctx.transcript.length - 1; i >= 0; i--) {
    const m = ctx.transcript[i];
    if (m.role === 'assistant') return m.turn;
  }
  return null;
};
const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const v = (rule: ViolationRule, code: ViolationCode, message: string, path?: string): Violation =>
  path === undefined ? { rule, code, message } : { rule, code, message, path };

// The person asked for suggestions in their newest answer: in so many words, anywhere ("any recommendations?", a tapped
// "starting ideas" option), or with a plain yes to the offer of ideas (MOM-111 root cause B).
export function askedForSuggestions(answer: PersonAnswer | null): boolean {
  if (!answer) return false;
  if (asksForIdeas(answerWords(answer))) return true;
  return answer.answers?.kind === 'offer_ideas' && wantsIdeas(answer.text);
}

// ---------------------------------------------------------------------------
// Rule 1: one question per turn, single-part
// ---------------------------------------------------------------------------

// Two asks joined together: "how long and how often?". "together, or one first?" is one question with a choice.
const JOINED_ASK = /\b(and|also|plus)\s+(what|how|when|which|where|who|why|whether|do you|does|did|is|are|can you|could you|will you|would you|should)\b/i;

// Turns that show choices: starting ideas and interpretations (numbered), and a proposal's other answers ("Today").
const LISTING_KINDS: readonly TurnKind[] = ['ideas', 'interpretations', 'proposal'];

export function checkOneQuestion(turn: AssistantTurn): Violation[] {
  if (turn.kind === 'playback' || turn.kind === 'final') return [];
  const out: Violation[] = [];
  const q = turn.question?.trim() ?? '';
  if (!q) return [v('one_question', 'one_question.none', 'The turn has no question.')];
  const marks = authored(turn).join(' ').split('?').length - 1;
  if (marks !== 1) out.push(v('one_question', 'one_question.marks', `The turn has ${marks} question marks; it must have exactly one, in the question.`));
  if (!q.endsWith('?')) out.push(v('one_question', 'one_question.no_mark', 'The question does not end in a question mark.'));
  if (turn.say.includes('?') || (turn.detail ?? '').includes('?') || turn.options.some((o) => o.includes('?'))) {
    out.push(v('one_question', 'one_question.hidden', 'A question is hiding outside the question field.'));
  }
  if (/[.!]\s+\S/.test(q) || q.includes(';')) out.push(v('one_question', 'one_question.sentences', 'The question is more than one sentence.'));
  if (JOINED_ASK.test(q)) out.push(v('one_question', 'one_question.joined', 'Two asks are joined in one question.'));
  if (turn.options.length > 0 && !LISTING_KINDS.includes(turn.kind)) {
    out.push(v('one_question', 'one_question.options', 'Only an ideas, interpretations or proposal turn lists options.'));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rule 2: never assume anything about the person's life
// ---------------------------------------------------------------------------

export function checkAssumeNothing(turn: AssistantTurn, ctx: TurnContext): Violation[] {
  const out: Violation[] = [];
  const said = new Set(personWords(ctx.transcript).flatMap(dayTimeWords));
  const unsaid = new Set(dayTimeWords(textForScan(turn, authored(turn))).filter((w) => !said.has(w)));
  for (const w of unsaid) {
    out.push(v('assume_nothing', 'assume_nothing.word', `Claude used "${w.replace('time:', 'a clock time ')}", which the person has not said.`));
  }
  // A value that changed this turn must come from the newest answer. Otherwise it changed without being asked.
  const latest = latestAnswer(ctx.transcript);
  for (const path of changedLeafPaths(ctx.prevDraft.model, turn.draft.model)) {
    const entry = turn.draft.said.filter((s) => s.path === path).sort((a, b) => b.turn - a.turn)[0];
    if (!latest || !entry || entry.turn !== latest.index) {
      out.push(v('assume_nothing', 'assume_nothing.changed', `${path} changed without the person's newest answer.`, path));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rule 3: never announce a reminder, check-in or nudge
// ---------------------------------------------------------------------------

const ANNOUNCEMENTS: RegExp[] = [
  /\b(i'?ll|i will|we'?ll|we will|momentum will|i'?m going to|i am going to)\b[^.?!]*\b(remind|nudge|ping|notify|check in|check-in|message you|text you|email you|alert)/i,
  /\byou(?:'ll| will) (get|receive|see|hear)\b[^.?!]*\b(reminder|notification|nudge|alert|check-?in)/i,
  /\b(reminders?|check-?ins?|nudges?|notifications?)\b[^.?!]*\b(will be|is set|are set|has been set|have been set|scheduled|switched on|turned on|enabled)\b/i,
  /\bi'?ve (set|scheduled|added|turned on)\b[^.?!]*\b(reminder|check-?in|nudge|notification)/i,
];

export function checkNoAnnouncedReminder(turn: AssistantTurn): Violation[] {
  for (const text of authored(turn)) {
    if (ANNOUNCEMENTS.some((re) => re.test(text))) {
      return [v('no_announced_reminder', 'no_announced_reminder', 'Claude announced a reminder, check-in or nudge instead of asking whether the person wants one.')];
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Rule 4: offer the choice before examples
// ---------------------------------------------------------------------------

const EXAMPLE_MARKERS = /\b(for example|for instance|such as|e\.g\.)/i;

export function checkChoiceBeforeExamples(turn: AssistantTurn, ctx: TurnContext): Violation[] {
  const out: Violation[] = [];
  const prev = lastAssistant(ctx);
  const answer = latestAnswer(ctx.transcript);
  // Counted from the person's words wherever they said them: after the offer, as a tapped "starting ideas" option in a list
  // of interpretations, or unprompted ("any recommendations?") (MOM-111 root cause B, finding 14).
  const asked = askedForSuggestions(answer);
  if (turn.kind === 'ideas') {
    if (!asked) out.push(v('choice_before_examples', 'choice.ideas_unasked', 'Ideas were given but the person did not ask for them.'));
  } else if (turn.kind === 'offer_ideas') {
    const q = turn.question ?? '';
    if (!/\b(ideas|examples|suggestions)\b/i.test(q) || !/\b(in mind|your own|own answer)\b/i.test(q)) {
      out.push(v('choice_before_examples', 'choice.offer_words', 'The offer must give the choice: something in mind, or starting ideas.'));
    }
    if (turn.options.length > 0 || EXAMPLE_MARKERS.test(authored(turn).join(' '))) {
      out.push(v('choice_before_examples', 'choice.offer_examples', 'The offer already contains examples.'));
    }
  } else if (
    turn.topic !== null &&
    SUGGESTION_TOPICS.has(turn.topic) &&
    EXAMPLE_MARKERS.test(authored(turn).join(' ')) &&
    !asked &&
    !(answer && asksMeaning(answer.text) && prev?.topic === turn.topic)
  ) {
    // Only where an example would plant the answer (the goal itself, a number). Short examples in any other question are
    // fine, and so is explaining any question with examples once the person asks what it means (MOM-111).
    out.push(v('choice_before_examples', 'choice.examples', `Examples in a "${turn.topic}" question need "something in mind, or some ideas?" first.`));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rule 5: skip what is already answered, in one line
// ---------------------------------------------------------------------------

export function checkSkipAnswered(turn: AssistantTurn, ctx: TurnContext): Violation[] {
  const out: Violation[] = [];
  const answered = answeredTopics(ctx.prevDraft.model);
  // A topic asked and replied to is answered, whether or not it reached the draft.
  ctx.transcript.forEach((m, i) => {
    if (m.role === 'assistant' && m.turn.topic && m.turn.kind === 'question' && ctx.transcript[i + 1]?.role === 'person') {
      answered.add(m.turn.topic);
    }
  });
  const prev = lastAssistant(ctx);
  const t = ctx.transcript;
  // A question on the topic Claude just asked, straight after the person's reply, carries it on or clarifies it ("2 goals",
  // then "What are the goals?"; "What do you mean?", then the question explained): not a repeat, for every topic. The one
  // exception is a person fact with one value that this turn has already recorded from the reply: asking it again is a
  // repeat. Asking a topic again after the conversation has moved on is still refused (MOM-111).
  const followsReply = prev !== null && prev.topic === turn.topic && t[t.length - 1]?.role === 'person' && t[t.length - 2]?.role === 'assistant';
  const settled = turn.topic !== null && SINGLE_VALUE_FACTS.has(turn.topic) && answeredTopics(turn.draft.model).has(turn.topic);
  const clarifying = turn.kind === 'ideas' || turn.kind === 'interpretations' || (followsReply && !settled);
  // Only the person's own facts are asked once; a goal's shape, dates and targets are asked again for the next goal.
  if (turn.topic && turn.question && ASKED_ONCE_TOPICS.has(turn.topic) && answered.has(turn.topic) && !clarifying) {
    out.push(v('skip_answered', 'skip.repeat', `"${turn.topic}" is already answered; skip it in one line instead of asking again.`));
  }
  if (turn.skipped) {
    // What this turn records from the person's newest message counts too (a long first message that already says why), and
    // so does a topic the draft has no place for, once the person has said anything.
    const skippable =
      answered.has(turn.skipped.topic) ||
      answeredTopics(turn.draft.model).has(turn.skipped.topic) ||
      (UNRECORDED_TOPICS.has(turn.skipped.topic) && personWords(ctx.transcript).length > 0);
    if (!skippable) out.push(v('skip_answered', 'skip.unanswered', `Skipped "${turn.skipped.topic}", which has not been answered.`));
    if (sentencesOf(turn.skipped.line).length !== 1 || turn.skipped.line.length > 160) {
      out.push(v('skip_answered', 'skip.long', 'The skip notice must be one short line.'));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rule 6: numbered interpretations when an answer does not fit
// ---------------------------------------------------------------------------

export function checkNumberedInterpretations(turn: AssistantTurn, ctx: TurnContext): Violation[] {
  const out: Violation[] = [];
  const optionCount = turn.options.filter((o) => o.trim().length > 0).length;
  if (turn.kind === 'interpretations' && (optionCount < 2 || optionCount > 4)) {
    out.push(v('numbered_interpretations', 'interpretations.count', 'Offer two to four interpretations.'));
  }
  if (ctx.personFits === false) {
    if (turn.kind !== 'interpretations') {
      out.push(v('numbered_interpretations', 'interpretations.guessed', 'The answer did not fit; offer numbered interpretations instead of guessing.'));
    }
    if (!sameJson(turn.draft, ctx.prevDraft)) out.push(v('numbered_interpretations', 'interpretations.changed', 'The draft changed on an answer that did not fit.'));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rule 7: play back in short chunks; the latest answer wins
// ---------------------------------------------------------------------------

// A part may become approved only if the person saw its playback and agreed. The newest playback must be that part's, a yes
// (or "no change") must follow it, and anything between (a "nothing", Claude asking what they meant) must leave the model
// as the playback showed it and the person's words as "no change". A real change in between breaks the chain.
function approvalFollowsPlayback(ctx: TurnContext, chunk: SetupChunk): boolean {
  const t = ctx.transcript;
  let at = -1;
  for (let i = t.length - 1; i >= 0; i--) {
    const m = t[i];
    if (m.role === 'assistant' && m.turn.kind === 'playback') {
      at = i;
      break;
    }
  }
  const shown = at >= 0 ? t[at] : null;
  if (shown?.role !== 'assistant' || shown.turn.chunk !== chunk) return false;
  const after = t.slice(at + 1);
  const last = after[after.length - 1];
  if (last?.role !== 'person') return false;
  if (!acceptsText(last.text) && !declinesChange(last.text)) return false;
  return after.slice(0, -1).every((m) => (m.role === 'person' ? declinesChange(m.text) : sameJson(m.turn.draft.model, shown.turn.draft.model)));
}

export function checkChunkedPlayback(turn: AssistantTurn, ctx: TurnContext): Violation[] {
  const out: Violation[] = [];
  const next = turn.draft;
  const prev = ctx.prevDraft;

  if (turn.kind === 'playback' || turn.kind === 'final') {
    if (turn.say !== '' || turn.question !== null || turn.options.length > 0 || turn.skipped !== null) {
      out.push(v('chunked_playback', 'playback.words', 'Playback is written by code from the draft; Claude writes none of it.'));
    }
  }
  // A playback turn may apply the last answer of its part to the draft (the text is rendered from the result), but the
  // final confirmation changes nothing except the last approval.
  if (turn.kind === 'final' && !sameJson(next.model, prev.model)) {
    out.push(v('chunked_playback', 'playback.final_changed', 'The model changed during the final confirmation.'));
  }
  if (turn.kind === 'playback' && turn.chunk === null) out.push(v('chunked_playback', 'playback.no_chunk', 'A playback turn names the part it plays back.'));
  if (turn.kind !== 'playback' && turn.chunk !== null) out.push(v('chunked_playback', 'playback.stray_chunk', 'Only a playback turn names a part.'));
  if (turn.kind === 'final') {
    for (const chunk of SETUP_CHUNKS) {
      if (!next.approved.includes(chunk)) {
        out.push(v('chunked_playback', 'playback.early_final', `The final confirmation came before "${chunk}" was played back and approved.`));
      }
    }
    if (renderFinal(next.model).length > FINAL_MAX_LINES) out.push(v('chunked_playback', 'playback.final_long', 'The final confirmation is too long.'));
  }

  for (const chunk of next.approved) {
    if (!prev.approved.includes(chunk)) {
      if (!approvalFollowsPlayback(ctx, chunk)) {
        out.push(v('chunked_playback', 'playback.unapproved', `"${chunk}" was marked approved without being played back and accepted.`));
      }
    } else if (!sameJson(chunkSlice(prev, chunk), chunkSlice(next, chunk))) {
      out.push(v('chunked_playback', 'playback.changed_after', `"${chunk}" changed after it was approved; play it back again.`));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rule 8: Claude does no math and sets no score
// ---------------------------------------------------------------------------

const SCORE_WORDS = /\b(score|scored|grade|graded|rating|percent|percentage)\b|%/i;
const ARITHMETIC = /\d\s*[+×*x/÷=]\s*\d/;

export function checkNoMath(turn: AssistantTurn, ctx: TurnContext): Violation[] {
  const out: Violation[] = [];
  const text = textForScan(turn, authored(turn));
  if (SCORE_WORDS.test(text)) out.push(v('no_math', 'math.score', 'Claude scored or graded something; the engine does that, and only from entries.'));
  if (ARITHMETIC.test(text)) out.push(v('no_math', 'math.arithmetic', 'Claude did arithmetic.'));
  // Starting ideas, candidate readings of an unclear answer and a visible proposal may carry numbers of their own, shown
  // as suggestions the person can take or leave; nothing else may.
  const exempt = turn.kind === 'proposal' ? authored(turn) : turn.kind === 'ideas' || turn.kind === 'interpretations' ? turn.options : [];
  const scanned = authored(turn).filter((t) => !exempt.includes(t));
  const said = new Set(personWords(ctx.transcript).flatMap((t) => numbersIn(t)));
  const unsaid = new Set(numbersIn(textForScan(turn, scanned), { skipOne: true }).filter((n) => !said.has(n)));
  for (const n of unsaid) out.push(v('no_math', 'math.number', `Claude wrote the number ${n}, which the person has not said.`));
  return out;
}

// ---------------------------------------------------------------------------
// Plain words (MOM-111 findings 4 and 6). Not hard rules: the service retries these once and then shows the reply.
// ---------------------------------------------------------------------------

// A lead-in ("say") that previews the question instead of reacting to the answer: "Next, I'll check...", "Next is the start
// date", "Let's talk about your week", "One more question".
const PREVIEWS: RegExp[] = [
  /^(next|now|then|first|finally|lastly|ok(ay)?,? next|alright,? next|right,? next)\b/i,
  /\bnext,? (i'?ll|i will|i'?d like to|i want to|let'?s|we'?ll|we will|is|up|comes|question|thing)\b/i,
  /\blet'?s (talk about|move on|turn to|look at|figure out|get to|go to|cover|set up|pick|work out|think about)\b/i,
  /\b(i'?ll|i will|i'?d like to|i want to|i need to|i'?m going to) (now )?(ask|check|find out|figure out|cover|go over|look at|get|confirm|make sure)\b/i,
  /\bmoving on\b/i,
  /\b(one|a few|some|two|three|a couple of) (more )?(quick )?questions?\b/i,
  /\b(now|next) (for|about|on to|onto)\b/i,
];
// One short line: about the length of "Got it, one goal to start with, and that's a good place to begin."
export const LEAD_IN_MAX_CHARS = 110;

// A turn whose "say" is an explanation, not a lead-in: the fixed day-end explanation, and the answer to "What do you mean?"
// (owner decision 2, 2026-10-29).
function explains(turn: AssistantTurn, answer: PersonAnswer | null): boolean {
  if (turn.topic === 'day_end' && turn.say.includes(DAY_END_SAY)) return true;
  return answer !== null && asksMeaning(answer.text);
}

// On a card of options (starting ideas, readings of an answer) code's own line leads, saying what the options are about
// (lib/setup/optionsLead.ts, round 3c, finding 2), and Claude's lead-in is not shown. Where code has no words for the topic,
// Claude's question leads and its lead-in is shown: then it is one short line or "".
export const OPTIONS_SAY_MAX_CHARS = 60;

export function checkLeadIn(turn: AssistantTurn, ctx: TurnContext): Violation[] {
  const say = turn.say.trim();
  if (!say || !ASKING_KINDS.includes(turn.kind)) return [];
  const out: Violation[] = [];
  const options = turn.kind === 'ideas' || turn.kind === 'interpretations';
  // Whether code leads does not depend on the date: only a deadline's wording does.
  if (options && optionsLead(turn, null) !== null) return [];
  if (options && (sentencesOf(say).length > 1 || say.length > OPTIONS_SAY_MAX_CHARS)) {
    out.push(v('plain_words', 'plain.options_say', 'The lead-in on a card of options is longer than one short line.'));
  }
  if (explains(turn, latestAnswer(ctx.transcript))) return out;
  if (PREVIEWS.some((re) => re.test(say))) out.push(v('plain_words', 'plain.lead_in', 'The lead-in previews the question instead of reacting to the answer.'));
  else if (sentencesOf(say).length > 1 || say.length > LEAD_IN_MAX_CHARS) {
    out.push(v('plain_words', 'plain.lead_in', 'The lead-in is longer than one short line.'));
  }
  return out;
}

// An activity (exercising, running, lifting, the gym) the person never said, in Claude's words or in the draft's free text,
// which the playback shows. Starting ideas the person asked for, and a proposal answering a request for a recommendation,
// are suggestions they asked for. The question of which number counts in an app (Hevy: "pounds lifted") names that app's
// own numbers.
export function checkNoNewActivity(turn: AssistantTurn, ctx: TurnContext): Violation[] {
  const said = personWords(ctx.transcript);
  const asked = askedForSuggestions(latestAnswer(ctx.transcript));
  const exempt = turn.kind === 'ideas' ? turn.options : turn.kind === 'proposal' && asked ? authored(turn) : [];
  const parts = turn.topic === 'metric' ? [] : authored(turn).filter((t) => !exempt.includes(t));
  const out: Violation[] = [];
  for (const id of new Set(unsaidActivities(parts.join(' \n '), said))) {
    out.push(v('plain_words', 'plain.activity', `Claude named the activity "${id}", which the person has not said.`));
  }
  // Free text in the draft may hold an activity only when the person said it, or Claude showed it in a turn they answered.
  const shown = ctx.transcript.flatMap((m) => (m.role === 'assistant' ? authored(m.turn) : []));
  for (const { path, text } of freeTextLeaves(turn.draft.model)) {
    if (unsaidActivities(text, [...said, ...shown]).length > 0) {
      out.push(v('plain_words', 'plain.activity', 'The draft names an activity the person has not said.', path));
    }
  }
  return out;
}

// The question is the core ask, shown in bold: about 12 words, with a little room (MOM-111 round 2, finding 1). Examples and
// the reason belong in the detail line under it.
export const QUESTION_MAX_WORDS = 14;

export function checkQuestionLength(turn: AssistantTurn): Violation[] {
  const words = (turn.question ?? '').trim().split(/\s+/).filter(Boolean).length;
  return ASKING_KINDS.includes(turn.kind) && words > QUESTION_MAX_WORDS
    ? [v('plain_words', 'plain.question_long', `The question has ${words} words; the core ask is at most about 12, with the rest in the detail line.`)]
    : [];
}

// On a date question or a date proposal the date is in the question; a lead-in that says it again is noise (round 2,
// findings 4 and 9). And never a date shown and then asked for (round 3b, finding 2): a question that asks for a date shows
// none, in its question or its detail; a date code or the conversation has is shown as a proposal instead.
export function checkDateLeadIn(turn: AssistantTurn): Violation[] {
  if (turn.topic === null || !DATE_TOPICS.has(turn.topic)) return [];
  const out: Violation[] = [];
  if (hasDate(turn.say)) out.push(v('plain_words', 'plain.date_lead_in', 'The lead-in repeats the date the question shows.'));
  if (turn.kind === 'question' && (hasDate(turn.question) || hasDate(turn.detail))) {
    out.push(v('plain_words', 'plain.date_asks', 'The question shows a date and then asks for one.'));
  }
  return out;
}

// Option lists (MOM-111 round 3, finding 1, owner decision D4). In the owner's screenshots the starting ideas read "2 a week,
// 3 a week, 4 a week" with nothing saying what was counted, and a list ran 1 to 7 whatever the goal. Options are written from
// the conversation: an offer of ideas and the ideas themselves carry a detail line saying what they count; an option with a
// number names what is counted besides the number and its period; and a run of five or more numbers in a row is a fixed
// scale, not options from what the person said. Plain-words checks: one retry with the fixed feedback, then the reply is
// shown and its rule names logged, so a weak option list never ends a setup in the stuck card.
const RATE_PHRASES = /\b(a|an|per|each|every)\s+(day|week|month|year)\b/g;
const NUMBER_TALK =
  /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|ninety|half|times?|x|once|twice|daily|weekly|monthly|or|about|around|roughly|at|least|most|up|to|aiming|for|more|less|than|and|a|an)\b/g;
// An option that is only a number and how often ("3", "2 a week", "3 times a week"), with nothing saying what is counted.
export function bareNumberOption(option: string): boolean {
  if (numbersIn(option).length === 0) return false;
  const rest = option
    .toLowerCase()
    .replace(/\d[\d,.]*/g, ' ')
    .replace(RATE_PHRASES, ' ')
    .replace(NUMBER_TALK, ' ')
    .replace(/[^a-z]+/g, ' ')
    .trim();
  return rest === '';
}
export const SCALE_MIN_OPTIONS = 5;

// Round 3b, finding 1: on a question about the fewest or the aim, an option with a number says which one it sets ("At least
// 2 a week", "Aiming for 3 a week"); the question above it names what is counted. Finding 4: the counted thing in options
// and their detail is the person's own word, never a stock one ("sessions" when they count workouts).
const COUNT_NOUNS =
  /\b(sessions?|workouts?|runs?|walks?|rides?|swims?|classes|class|lessons?|pages?|books?|chapters?|articles?|steps|reps|sets|laps?|miles?|kilometers?|dollars?|meals?|posts?|songs?|words?|problems?|applications?|drinks?|cigarettes?)\b/gi;
const nounStem = (word: string): string => word.toLowerCase().replace(/(es|s)$/, '');

export function checkOptionList(turn: AssistantTurn, ctx?: TurnContext): Violation[] {
  const out: Violation[] = [];
  if ((turn.kind === 'ideas' || turn.kind === 'offer_ideas') && !(turn.detail ?? '').trim()) {
    out.push(v('plain_words', 'choice.ideas_context', 'The ideas have no detail line saying what they count.'));
  }
  const numberTopic = turn.topic !== null && NUMBER_TOPICS.has(turn.topic) ? (turn.topic as keyof typeof NUMBER_OPTION_LEADS) : null;
  if (ctx && (LISTING_KINDS.includes(turn.kind) || turn.kind === 'offer_ideas') && turn.topic !== 'metric') {
    const said = personWords(ctx.transcript).join(' \n ').toLowerCase();
    const shown = [...turn.options, turn.detail ?? ''].join(' \n ');
    const unsaid = new Set([...shown.matchAll(COUNT_NOUNS)].map((m) => nounStem(m[1])).filter((s) => !new RegExp(`\\b${s}`).test(said)));
    if (unsaid.size > 0) out.push(v('plain_words', 'choice.ideas_words', `The options count "${[...unsaid].join('", "')}", which the person has not said.`));
  }
  if (!LISTING_KINDS.includes(turn.kind)) return out;
  // "At least 2 a week" on a fewest question says what it sets, and the question names the thing: not bare.
  const bare = turn.options.filter((o) => bareNumberOption(o) && !(numberTopic && NUMBER_OPTION_LEADS[numberTopic].test(o)));
  if (bare.length > 0) out.push(v('plain_words', 'choice.ideas_bare', 'An option is a bare number, with nothing saying what is counted.'));
  if (numberTopic && turn.options.some((o) => numbersIn(o, { skipOne: true }).length > 0 && !NUMBER_OPTION_LEADS[numberTopic].test(o))) {
    out.push(v('plain_words', 'choice.ideas_role', `An option on the ${numberTopic === 'floor' ? 'fewest' : 'aim'} question does not say which number it sets.`));
  }
  const firsts = turn.options.map((o) => numbersIn(o, { skipOne: true })[0]).filter((n): n is number => n !== undefined);
  const sorted = [...firsts].sort((a, b) => a - b);
  if (sorted.length >= SCALE_MIN_OPTIONS && sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1)) {
    out.push(v('plain_words', 'choice.ideas_scale', 'The options are a fixed run of numbers, not options from what the person said.'));
  }
  return out;
}

export const PLAIN_WORDS_CHECKS = [checkLeadIn, checkNoNewActivity, checkQuestionLength, checkDateLeadIn, checkOptionList] as const;

// ---------------------------------------------------------------------------
// All of it
// ---------------------------------------------------------------------------

export const RULE_CHECKS: Record<HardRuleId, (turn: AssistantTurn, ctx: TurnContext) => Violation[]> = {
  one_question: (turn) => checkOneQuestion(turn),
  assume_nothing: checkAssumeNothing,
  no_announced_reminder: (turn) => checkNoAnnouncedReminder(turn),
  choice_before_examples: checkChoiceBeforeExamples,
  skip_answered: checkSkipAnswered,
  numbered_interpretations: checkNumberedInterpretations,
  chunked_playback: checkChunkedPlayback,
  no_math: checkNoMath,
};

const DRAFT_CODES: Record<string, ViolationCode> = { no_source: 'draft.no_source', not_said: 'draft.not_said', not_accepted: 'draft.not_accepted' };

// The eight rules, the plain-words checks, and the draft itself: after every turn the draft must validate (progress mode).
export function checkTurn(turn: AssistantTurn, ctx: TurnContext): Violation[] {
  const out = HARD_RULE_IDS.flatMap((id) => RULE_CHECKS[id](turn, ctx));
  for (const check of PLAIN_WORDS_CHECKS) out.push(...check(turn, ctx));
  const draft = validateDraft(turn.draft, ctx.transcript, 'progress');
  for (const issue of draft.issues) out.push(v('draft', DRAFT_CODES[issue.code] ?? 'draft.rule', `${issue.path}: ${issue.message}`, issue.path));
  return out;
}

// Only plain-words violations: the reply may be shown after its one retry (MOM-111 addition a).
export const onlyPlainWords = (violations: readonly Violation[]): boolean => violations.length > 0 && violations.every((x) => x.rule === 'plain_words');
