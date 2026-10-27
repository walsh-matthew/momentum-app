// The eight hard rules of guided setup as automatic checks on one turn of Claude's (docs/DOMAIN_MODEL.md §2.1; MOM-111).
// The setup eval set runs every one of them on every turn. They are heuristics over words and structure, not language
// understanding, and each errs towards flagging: a turn that trips one is a turn to look at. A fake model in `npm test`
// shows the checks catch what they should; only a live run shows whether the prompt keeps Claude inside them.
// Pure: no model, no database, no network.

import {
  HARD_RULE_IDS,
  SETUP_CHUNKS,
  type AssistantTurn,
  type HardRuleId,
  type SetupDraft,
  type Transcript,
  type TurnKind,
} from '@/types/setup';
import { answeredTopics, changedLeafPaths, chunkSlice } from './leaves';
import { FINAL_MAX_LINES, renderFinal } from './playback';
import { ASKED_ONCE_TOPICS } from './steps';
import { acceptsText, dayTimeWords, numbersIn, sentencesOf, wantsIdeas } from './text';
import { validateDraft } from './validate';

export interface TurnContext {
  // Everything before this turn. It ends with the person's latest message and is empty at the start.
  transcript: Transcript;
  // The draft as it stood before this turn.
  prevDraft: SetupDraft;
  // Scripted cases mark an answer that does not fit its question (rule 6); a live run leaves this unset.
  personFits?: boolean;
}

export interface Violation {
  rule: HardRuleId | 'draft';
  message: string;
}

const ASKING_KINDS: readonly TurnKind[] = ['question', 'offer_ideas', 'ideas', 'interpretations', 'proposal'];

// In the day-end question, and only there, Claude may say the two boundaries of the early-day-end rule (MOM-125).
const DAY_END_BOUNDARY_WORDS = /\b(midnight|6 in the morning|six in the morning)\b/gi;

const authored = (turn: AssistantTurn): string[] => [turn.say, turn.question ?? '', turn.skipped?.line ?? '', ...turn.options];

// Claude's words as the day/time and number checks should read them: boundary words removed for the day-end question.
const textForScan = (turn: AssistantTurn, parts: string[]): string => {
  const text = parts.join(' \n ');
  return turn.topic === 'day_end' ? text.replace(DAY_END_BOUNDARY_WORDS, ' ') : text;
};

const personTexts = (ctx: TurnContext): string[] => ctx.transcript.flatMap((m) => (m.role === 'person' ? [m.text] : []));
const lastPerson = (ctx: TurnContext): { index: number; text: string } | null => {
  for (let i = ctx.transcript.length - 1; i >= 0; i--) {
    const m = ctx.transcript[i];
    if (m.role === 'person') return { index: i, text: m.text };
  }
  return null;
};
const lastAssistant = (ctx: TurnContext): AssistantTurn | null => {
  for (let i = ctx.transcript.length - 1; i >= 0; i--) {
    const m = ctx.transcript[i];
    if (m.role === 'assistant') return m.turn;
  }
  return null;
};
const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const v = (rule: Violation['rule'], message: string): Violation => ({ rule, message });

// ---------------------------------------------------------------------------
// Rule 1: one question per turn, single-part
// ---------------------------------------------------------------------------

// Two asks joined together: "how long and how often?". "together, or one first?" is one question with a choice.
const JOINED_ASK = /\b(and|also|plus)\s+(what|how|when|which|where|who|why|whether|do you|does|did|is|are|can you|could you|will you|would you|should)\b/i;

export function checkOneQuestion(turn: AssistantTurn): Violation[] {
  if (turn.kind === 'playback' || turn.kind === 'final') return [];
  const out: Violation[] = [];
  const q = turn.question?.trim() ?? '';
  if (!q) return [v('one_question', 'The turn has no question.')];
  const marks = authored(turn).join(' ').split('?').length - 1;
  if (marks !== 1) out.push(v('one_question', `The turn has ${marks} question marks; it must have exactly one, in the question.`));
  if (!q.endsWith('?')) out.push(v('one_question', 'The question does not end in a question mark.'));
  if (turn.say.includes('?') || turn.options.some((o) => o.includes('?'))) {
    out.push(v('one_question', 'A question is hiding outside the question field.'));
  }
  if (/[.!]\s+\S/.test(q) || q.includes(';')) out.push(v('one_question', 'The question is more than one sentence.'));
  if (JOINED_ASK.test(q)) out.push(v('one_question', 'Two asks are joined in one question.'));
  if (turn.options.length > 0 && turn.kind !== 'ideas' && turn.kind !== 'interpretations') {
    out.push(v('one_question', 'Only an ideas or interpretations turn lists options.'));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rule 2: never assume anything about the person's life
// ---------------------------------------------------------------------------

export function checkAssumeNothing(turn: AssistantTurn, ctx: TurnContext): Violation[] {
  const out: Violation[] = [];
  const said = new Set(personTexts(ctx).flatMap(dayTimeWords));
  const unsaid = new Set(dayTimeWords(textForScan(turn, authored(turn))).filter((w) => !said.has(w)));
  for (const w of unsaid) {
    out.push(v('assume_nothing', `Claude used "${w.replace('time:', 'a clock time ')}", which the person has not said.`));
  }
  // A value that changed this turn must come from the newest answer. Otherwise it changed without being asked.
  const latest = lastPerson(ctx);
  for (const path of changedLeafPaths(ctx.prevDraft.model, turn.draft.model)) {
    const entry = turn.draft.said.filter((s) => s.path === path).sort((a, b) => b.turn - a.turn)[0];
    if (!latest || !entry || entry.turn !== latest.index) {
      out.push(v('assume_nothing', `${path} changed without the person's newest answer.`));
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
      return [v('no_announced_reminder', 'Claude announced a reminder, check-in or nudge instead of asking whether the person wants one.')];
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
  const person = lastPerson(ctx);
  if (turn.kind === 'ideas') {
    if (prev?.kind !== 'offer_ideas') out.push(v('choice_before_examples', 'Ideas were given without first offering "something in mind, or ideas?".'));
    else if (!person || !wantsIdeas(person.text)) out.push(v('choice_before_examples', 'Ideas were given but the person did not ask for them.'));
  } else if (turn.kind === 'offer_ideas') {
    const q = turn.question ?? '';
    if (!/\b(ideas|examples|suggestions)\b/i.test(q) || !/\b(in mind|your own|own answer)\b/i.test(q)) {
      out.push(v('choice_before_examples', 'The offer must give the choice: something in mind, or starting ideas.'));
    }
    if (turn.options.length > 0 || EXAMPLE_MARKERS.test(authored(turn).join(' '))) {
      out.push(v('choice_before_examples', 'The offer already contains examples.'));
    }
  } else if (EXAMPLE_MARKERS.test(authored(turn).join(' '))) {
    out.push(v('choice_before_examples', 'An example was given outside an ideas turn.'));
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
  // Clarifying the same topic (offered ideas, interpretations) is not asking it again.
  const clarifying =
    turn.kind === 'ideas' ||
    turn.kind === 'interpretations' ||
    (prev !== null && prev.topic === turn.topic && ['offer_ideas', 'interpretations', 'ideas'].includes(prev.kind));
  // Only the person's own facts are asked once; a goal's shape, dates and targets are asked again for the next goal.
  if (turn.topic && turn.question && ASKED_ONCE_TOPICS.has(turn.topic) && answered.has(turn.topic) && !clarifying) {
    out.push(v('skip_answered', `"${turn.topic}" is already answered; skip it in one line instead of asking again.`));
  }
  if (turn.skipped) {
    if (!answered.has(turn.skipped.topic)) out.push(v('skip_answered', `Skipped "${turn.skipped.topic}", which has not been answered.`));
    if (sentencesOf(turn.skipped.line).length !== 1 || turn.skipped.line.length > 160) {
      out.push(v('skip_answered', 'The skip notice must be one short line.'));
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
    out.push(v('numbered_interpretations', 'Offer two to four interpretations.'));
  }
  if (ctx.personFits === false) {
    if (turn.kind !== 'interpretations') out.push(v('numbered_interpretations', 'The answer did not fit; offer numbered interpretations instead of guessing.'));
    if (!sameJson(turn.draft, ctx.prevDraft)) out.push(v('numbered_interpretations', 'The draft changed on an answer that did not fit.'));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rule 7: play back in short chunks; the latest answer wins
// ---------------------------------------------------------------------------

export function checkChunkedPlayback(turn: AssistantTurn, ctx: TurnContext): Violation[] {
  const out: Violation[] = [];
  const next = turn.draft;
  const prev = ctx.prevDraft;
  const person = lastPerson(ctx);
  const assistantPrev = lastAssistant(ctx);

  if (turn.kind === 'playback' || turn.kind === 'final') {
    if (turn.say !== '' || turn.question !== null || turn.options.length > 0 || turn.skipped !== null) {
      out.push(v('chunked_playback', 'Playback is written by code from the draft; Claude writes none of it.'));
    }
  }
  // A playback turn may apply the last answer of its part to the draft (the text is rendered from the result), but the
  // final confirmation changes nothing except the last approval.
  if (turn.kind === 'final' && !sameJson(next.model, prev.model)) {
    out.push(v('chunked_playback', 'The model changed during the final confirmation.'));
  }
  if (turn.kind === 'playback' && turn.chunk === null) out.push(v('chunked_playback', 'A playback turn names the part it plays back.'));
  if (turn.kind !== 'playback' && turn.chunk !== null) out.push(v('chunked_playback', 'Only a playback turn names a part.'));
  if (turn.kind === 'final') {
    for (const chunk of SETUP_CHUNKS) {
      if (!next.approved.includes(chunk)) out.push(v('chunked_playback', `The final confirmation came before "${chunk}" was played back and approved.`));
    }
    if (renderFinal(next.model).length > FINAL_MAX_LINES) out.push(v('chunked_playback', 'The final confirmation is too long.'));
  }

  for (const chunk of next.approved) {
    if (!prev.approved.includes(chunk)) {
      const played = assistantPrev?.kind === 'playback' && assistantPrev.chunk === chunk;
      if (!played || !person || !acceptsText(person.text)) {
        out.push(v('chunked_playback', `"${chunk}" was marked approved without being played back and accepted.`));
      }
    } else if (!sameJson(chunkSlice(prev.model, chunk), chunkSlice(next.model, chunk))) {
      out.push(v('chunked_playback', `"${chunk}" changed after it was approved; play it back again.`));
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
  if (SCORE_WORDS.test(text)) out.push(v('no_math', 'Claude scored or graded something; the engine does that, and only from entries.'));
  if (ARITHMETIC.test(text)) out.push(v('no_math', 'Claude did arithmetic.'));
  // Starting ideas, candidate readings of an unclear answer and a visible proposal may carry numbers of their own, shown
  // as suggestions the person can take or leave; nothing else may.
  const exempt = turn.kind === 'proposal' ? authored(turn) : turn.kind === 'ideas' || turn.kind === 'interpretations' ? turn.options : [];
  const scanned = authored(turn).filter((t) => !exempt.includes(t));
  const said = new Set(personTexts(ctx).flatMap((t) => numbersIn(t)));
  const unsaid = new Set(numbersIn(textForScan(turn, scanned), { skipOne: true }).filter((n) => !said.has(n)));
  for (const n of unsaid) out.push(v('no_math', `Claude wrote the number ${n}, which the person has not said.`));
  return out;
}

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

// The eight rules plus the draft itself: after every turn the draft must validate (progress mode).
export function checkTurn(turn: AssistantTurn, ctx: TurnContext): Violation[] {
  const out = HARD_RULE_IDS.flatMap((id) => RULE_CHECKS[id](turn, ctx));
  const draft = validateDraft(turn.draft, ctx.transcript, 'progress');
  for (const issue of draft.issues) out.push(v('draft', `${issue.path}: ${issue.message}`));
  return out;
}
