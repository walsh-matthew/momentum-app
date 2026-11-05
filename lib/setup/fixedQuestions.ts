// Guided setup's fixed questions, playbacks and final card written by code (MOM-180 part B3, docs/DOMAIN_MODEL.md §2.2 steps 1, 2, 3, 4, 7, 10 and 12;
// principle 13). The owner approved the words at the B3 design stop, 2026-11-05 (Jira MOM-180 comment 10387).
//
// The questions only Claude can read keep Claude for the answer, never for the question:
//   step 1  the idea and step 2 the why, both asked by code at Start; one Claude call then reads both answers;
//   step 4  what else matters, asked as soon as the person approves the goals playback;
//   step 7  what to count, asked when the goal cards finish and an active goal has nothing counted yet;
//   step 10 the kinds of days, asked when the week cards reach it.
// Each is an ordinary question card: its answer box sends the person's own words to Claude, and "What does this mean?" shows code's words
// (lib/setup/explain.ts). A question whose answer the draft already holds is not asked (rule 5); Claude then carries on as before.
//
// The playbacks: code plays the goals part back as soon as step 3 is done by taps, and the targets part as soon as the number boxes leave every
// active goal with something counted and each "something I do" with its least that counts. The final card follows the approval of the last part.
// The words of every playback and of the final card were already code's (lib/setup/playback.ts); what changes is that no call is spent to show them.
//
// Pure: no database, no model, no network.

import { SetupSessionSchema, type AssistantTurn, type SetupChunk, type SetupDraft, type SetupModel, type SetupSession, type Transcript } from '@/types/setup';
import { codeTurn } from './cards';
import { asksForIdeas, asksMeaning } from './text';

// Every fixed question carries this at the start of its detail line, so the screen can tell it from one of Claude's, and Claude, reading the
// conversation, sees what it is. What follows the mark is the line the person sees under the question.
export const FIXED_QUESTION_MARK = 'Fixed question, written by code.';

export const FIXED_TOPICS = ['idea', 'why', 'priorities', 'target', 'day_types'] as const;
export type FixedTopic = (typeof FIXED_TOPICS)[number];

// The owner's words (MOM-180 comment 10387).
export const FIXED_WORDS = {
  ideaQuestion: 'What would you like to work on?',
  ideaLine: 'Big or small, in your own words.',
  whyQuestion: 'Why does this matter to you?',
  prioritiesQuestion: "What else matters right now that this shouldn't crowd out?",
  prioritiesQuestionMany: "What else matters right now that these goals shouldn't crowd out?",
  prioritiesLine: 'Like rest, people you care about, or something you enjoy. Your plan keeps room for these.',
  targetQuestion: "What would you like to count to know it's going well?",
  targetLine: 'Momentum shows your progress from what you log.',
  dayTypesQuestion: 'Do some days have more room for this than others?',
  dayTypesQuestionMany: 'Do some days have more room for your goals than others?',
  dayTypesLine: 'Like busy days and easier ones. Your plan puts more on the days with more room.',
} as const;

export const targetQuestionFor = (title: string): string => `What would you like to count for "${title}"?`;

const mark = (line: string | null): string => (line ? `${FIXED_QUESTION_MARK} ${line}` : FIXED_QUESTION_MARK);

const question = (draft: SetupDraft, topic: FixedTopic, words: string, line: string | null): AssistantTurn =>
  codeTurn(draft, { kind: 'question', chunk: null, topic, question: words, detail: mark(line) });

export const isFixedQuestion = (turn: AssistantTurn): boolean =>
  turn.kind === 'question' && (FIXED_TOPICS as readonly string[]).includes(turn.topic ?? '') && (turn.detail ?? '').startsWith(FIXED_QUESTION_MARK);

// The line the screen shows under a fixed question, in place of the mark.
export function fixedQuestionDetail(turn: AssistantTurn): string | null {
  const detail = turn.detail ?? '';
  const rest = detail.startsWith(FIXED_QUESTION_MARK) ? detail.slice(FIXED_QUESTION_MARK.length).trim() : '';
  return rest === '' ? null : rest;
}

const activeGoals = (model: SetupModel) => model.goals.filter((g) => g.state === 'active');

// ---- The questions ----------------------------------------------------------------------------------------------------------------------------

export const ideaCard = (draft: SetupDraft): AssistantTurn => question(draft, 'idea', FIXED_WORDS.ideaQuestion, FIXED_WORDS.ideaLine);
export const whyCard = (draft: SetupDraft): AssistantTurn => question(draft, 'why', FIXED_WORDS.whyQuestion, null);

// What else matters: only when the draft holds none yet.
export function prioritiesCard(draft: SetupDraft): AssistantTurn | null {
  if (draft.model.person.priorities.length > 0) return null;
  const many = activeGoals(draft.model).length > 1;
  return question(draft, 'priorities', many ? FIXED_WORDS.prioritiesQuestionMany : FIXED_WORDS.prioritiesQuestion, FIXED_WORDS.prioritiesLine);
}

// What to count, for the first active goal with nothing counted yet; null when every active goal has a target.
export function targetCard(draft: SetupDraft): AssistantTurn | null {
  const goals = activeGoals(draft.model);
  const goal = goals.find((g) => g.targets.length === 0);
  if (!goal) return null;
  return question(draft, 'target', goals.length > 1 ? targetQuestionFor(goal.title) : FIXED_WORDS.targetQuestion, FIXED_WORDS.targetLine);
}

// The kinds of days: only when the draft holds none yet.
export function dayTypesCard(draft: SetupDraft): AssistantTurn | null {
  if (draft.model.person.dayTypes.length > 0) return null;
  const many = activeGoals(draft.model).length > 1;
  return question(draft, 'day_types', many ? FIXED_WORDS.dayTypesQuestionMany : FIXED_WORDS.dayTypesQuestion, FIXED_WORDS.dayTypesLine);
}

// ---- The opening ---------------------------------------------------------------------------------------------------------------------------

// What code writes at the start of a first setup, before any call: the idea question on an empty conversation, and the why question once the
// person has answered the idea. Null when Claude takes the turn: anything after the why, or an idea answer that asks what the question means
// or asks for ideas (Claude answers those, as before, and then asks the why itself).
export function openingTurn(transcript: Transcript, draft: SetupDraft): AssistantTurn | null {
  if (transcript.length === 0) return ideaCard(draft);
  if (transcript.length !== 2) return null;
  const [asked, answer] = transcript;
  if (asked.role !== 'assistant' || answer.role !== 'person' || !isFixedQuestion(asked.turn) || asked.turn.topic !== 'idea') return null;
  if (asksMeaning(answer.text) || asksForIdeas(answer.text)) return null;
  return whyCard(draft);
}

// The conversation with one more turn of code's, or the conversation as it was when the turn cannot be added.
export function grownBy(session: SetupSession, turn: AssistantTurn | null): SetupSession {
  if (turn === null) return session;
  const next: SetupSession = { ...session, transcript: [...session.transcript, { role: 'assistant', turn }] };
  const parsed = SetupSessionSchema.safeParse(next);
  return parsed.success ? parsed.data : session;
}

// A fresh first setup: the idea question, written by code, with no call.
export const openingSession = (session: SetupSession): SetupSession => grownBy(session, openingTurn(session.transcript, session.draft));

// After the person's answer to the idea question: the why question, written by code. The conversation as it was otherwise.
export const withOpeningTurn = (session: SetupSession): SetupSession =>
  session.transcript.length === 2 ? grownBy(session, openingTurn(session.transcript, session.draft)) : session;

// Whether a question of Claude's asks again what one of code's fixed questions asked the person and the draft already holds (the why, the idea):
// a repeat, even straight after the reply (MOM-180 B3, rule 5). A clarification after the person asked what it means is not one.
export function asksFixedAgain(turn: AssistantTurn, transcript: Transcript): boolean {
  if (turn.kind !== 'question' || (turn.topic !== 'why' && turn.topic !== 'idea')) return false;
  const last = transcript[transcript.length - 1];
  if (last?.role === 'person' && asksMeaning(last.text)) return false;
  const answered = transcript.some((m, i) => m.role === 'assistant' && isFixedQuestion(m.turn) && m.turn.topic === turn.topic && transcript[i + 1]?.role === 'person');
  if (!answered) return false;
  return turn.topic === 'idea' ? turn.draft.model.goals.length > 0 : turn.draft.model.goals.some((g) => g.why !== null);
}

// ---- The playbacks and the final card -------------------------------------------------------------------------------------------------------

const playback = (draft: SetupDraft, chunk: SetupChunk): AssistantTurn => codeTurn(draft, { kind: 'playback', chunk, topic: null, question: null, detail: null });

// Step 3 is done: at least one active goal, each goal named, and every goal set aside has its way back. The goals part not yet approved.
export function goalsDone(draft: SetupDraft): boolean {
  const model = draft.model;
  if (draft.approved.includes('goals') || activeGoals(model).length === 0) return false;
  return model.goals.every((g) => g.title.trim() !== '' && (g.state !== 'parked' || g.returnWhen !== null));
}

export const goalsPlayback = (draft: SetupDraft): AssistantTurn | null => (goalsDone(draft) ? playback(draft, 'goals') : null);

// Step 7 is done: every active goal has something counted and each "something I do" has its least that counts. The targets part not yet approved.
export function targetsDone(draft: SetupDraft): boolean {
  if (draft.approved.includes('targets') || !draft.approved.includes('goals')) return false;
  const goals = activeGoals(draft.model);
  return goals.length > 0 && goals.every((g) => g.targets.length > 0 && g.targets.every((t) => t.role !== 'effort' || t.floor !== null));
}

export const targetsPlayback = (draft: SetupDraft): AssistantTurn | null => (targetsDone(draft) ? playback(draft, 'targets') : null);

// What follows the number boxes: what to count for the next goal with nothing counted, else the targets playback. Null when neither is due
// (Claude carries on).
export const afterTargetTurn = (draft: SetupDraft): AssistantTurn | null => (draft.approved.includes('goals') ? (targetCard(draft) ?? targetsPlayback(draft)) : null);

// The final card, once every part is approved: code's own, with nothing changed.
export const finalTurn = (draft: SetupDraft): AssistantTurn => codeTurn(draft, { kind: 'final', chunk: null, topic: null, question: null, detail: null });
