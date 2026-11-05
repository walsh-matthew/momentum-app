// The first goal cards code writes in guided setup, with no Claude call (MOM-180 part B1, docs/DOMAIN_MODEL.md §2.2 steps 5 and 6), in the
// pattern of the week cards (lib/setup/weekCards.ts): the starting point, the goal's shape, its start date, the first stretch and the end date.
// The order code asks them in is fixed, one goal after another:
//   shape, then start date, then (for a goal that keeps going) the first stretch or (for a goal with an end date) the end date.
// A goal with a deadline is Claude's after its start date: the deadline task needs words only the person's goal can give. The starting point
// has no place in the draft (UNRECORDED_TOPICS) and nothing saves it: it is a card that goes into the conversation Claude reads, and no more.
//
// Every card: code writes the question, the person's tap is their own answer, written as a message of their own, and the draft records it as
// `said` with that message's position. Nothing is chosen for the person: no control has a value pre-selected, and a goal that already holds
// the value gets no card (rule 5), so an answer typed in one reply that holds two values shows neither card. A value code cannot take as
// asked (a date it cannot read, an end date on or before the start) changes nothing. Every card keeps "Type your answer", which sends the
// person's own words to Claude as always, and "What does this mean?" (lib/setup/explain.ts).
//
// Pure: no database, no model, no network. The screen answers a card with the functions here; the server uses `goalCardInPlaceOf` to put a
// card in place of a question of Claude's on a card topic.

import { casualDate } from '@/lib/dates/casual';
import { SetupSessionSchema, type AssistantTurn, type GoalDraft, type SetupDraft, type SetupSession, type SetupTopic, type Transcript } from '@/types/setup';
import type { GoalShape } from '@/types/database.types';
import { codeTurn } from './cards';
import { targetCard, targetsPlayback } from './fixedQuestions';
import { AFTER_START_LINE, isoOfWritten, lengthProposal, plainLengthSaid } from './codeTurns';
import { PROPOSAL_YES_TEXT, pickedDateText } from './session';
import { asksMeaning, datesIn } from './text';

// Every goal card carries this in the start of its detail line, so the screen can tell it from one of Claude's, and Claude, reading the
// conversation, sees what it is. What follows the mark is the line the person sees under the question.
export const GOAL_CARD_MARK = 'Goal card, written by code.';

export const GOAL_CARD_TOPICS = ['starting_point', 'shape', 'start_date', 'block_length', 'end_date'] as const;
export type GoalCardTopic = (typeof GOAL_CARD_TOPICS)[number];
const isGoalTopic = (topic: SetupTopic | null): topic is GoalCardTopic => topic !== null && (GOAL_CARD_TOPICS as readonly string[]).includes(topic);

// The cards' words (the owner's, written into the MOM-180 Jira comment 10358 before the build).
export const GOAL_WORDS = {
  startingQuestion: 'Where are you with this today?',
  startingReason: 'Your plan starts from there.',
  shapeQuestion: 'Does it keep going, end on a date, or have a deadline?',
  shapeReason: 'It decides how your plan is laid out.',
  startReason: 'Your first week is planned from that day.',
  blockQuestion: 'How many weeks should the first stretch run?',
  blockReason: 'You can keep going after it ends.',
  endQuestion: 'Which day should it run until?',
  endReason: 'Your plan stops on that day.',
  typeAnswer: 'Type your answer',
} as const;

export const shapeQuestion = (title: string | null): string => (title === null ? GOAL_WORDS.shapeQuestion : `Does "${title}" keep going, end on a date, or have a deadline?`);

export interface GoalChoice<V> {
  label: string;
  // What the person's message says for the tap.
  say: string;
  value: V;
}

export const STARTING_POINTS: readonly GoalChoice<string>[] = [
  { label: 'Never tried it', say: 'Never tried it.', value: 'never' },
  { label: 'Dabbled a little', say: 'Dabbled a little.', value: 'dabbled' },
  { label: 'Done it before', say: 'Done it before.', value: 'before' },
];

export const SHAPE_CHOICES: readonly GoalChoice<GoalShape>[] = [
  { label: 'It keeps going', say: 'It keeps going.', value: 'ongoing' },
  { label: 'It ends on a date', say: 'It ends on a date.', value: 'finite' },
  { label: 'It has a deadline', say: 'It has a deadline.', value: 'project' },
];

export const BLOCK_CHOICES: readonly GoalChoice<number>[] = [4, 8, 12].map((n) => ({ label: `${n} weeks`, say: `${n} weeks.`, value: n }));

// ---- What each goal still has to be asked ----------------------------------------------------------------------------------------------

// The first thing a goal still needs, in the fixed order, or null. A goal set aside needs its shape and start date and no more (the table
// needs both, MOM-111); a goal with a deadline is Claude's after its start date.
function nextNeed(g: GoalDraft): GoalCardTopic | null {
  if (g.shape === null) return 'shape';
  if (g.startDate === null) return 'start_date';
  if (g.state !== 'active') return null;
  if (g.shape === 'ongoing' && g.blockWeeks === null) return 'block_length';
  if (g.shape === 'finite' && g.endDate === null) return 'end_date';
  return null;
}

// The goal the next card is about: the first goal with something left to ask, one goal after another.
function goalWithNeed(draft: SetupDraft): { goal: GoalDraft; topic: GoalCardTopic } | null {
  for (const goal of draft.model.goals) {
    const topic = nextNeed(goal);
    if (topic !== null) return { goal, topic };
  }
  return null;
}

const mark = (reason: string | null): string => (reason ? `${GOAL_CARD_MARK} ${reason}` : GOAL_CARD_MARK);

// The line the screen shows under a goal card's question, in place of the mark.
export function goalCardDetail(turn: AssistantTurn): string | null {
  const rest = (turn.detail ?? '').startsWith(GOAL_CARD_MARK) ? (turn.detail ?? '').slice(GOAL_CARD_MARK.length).trim() : '';
  return rest === '' ? null : rest;
}

export const isGoalCard = (turn: AssistantTurn): boolean =>
  (turn.kind === 'question' || turn.kind === 'proposal') && isGoalTopic(turn.topic) && (turn.detail ?? '').startsWith(GOAL_CARD_MARK);

// ---- The cards -------------------------------------------------------------------------------------------------------------------------

// The starting point card: there is nothing in the draft to ask for, so it goes out only in place of Claude's own question on the topic.
export const startingPointCard = (draft: SetupDraft): AssistantTurn =>
  codeTurn(draft, { kind: 'question', chunk: null, topic: 'starting_point', question: GOAL_WORDS.startingQuestion, detail: mark(GOAL_WORDS.startingReason) });

const titleIfMany = (draft: SetupDraft, goal: GoalDraft): string | null => (draft.model.goals.length > 1 ? goal.title : null);

// The card for the next thing a goal needs, or null when no goal needs anything (or the card cannot be written: no date to suggest).
export function goalCardFor(draft: SetupDraft, transcript: Transcript, today: string | null): AssistantTurn | null {
  const need = goalWithNeed(draft);
  if (!need) return null;
  const { goal, topic } = need;
  switch (topic) {
    case 'shape':
      return codeTurn(draft, { kind: 'question', chunk: null, topic, question: shapeQuestion(titleIfMany(draft, goal)), detail: mark(GOAL_WORDS.shapeReason) });
    case 'start_date': {
      if (!today) return null;
      // The person's own today, written the casual way with its weekday, which is also how their yes is read as accepting it.
      const words = `today, ${casualDate(today, today, { relative: false })}`;
      const title = titleIfMany(draft, goal);
      return codeTurn(draft, {
        kind: 'proposal',
        chunk: null,
        topic,
        question: title === null ? `Start ${words}?` : `Start "${title}" ${words}?`,
        detail: mark(GOAL_WORDS.startReason),
        options: [],
      });
    }
    case 'block_length': {
      const length = goal.startDate && today ? plainLengthSaid(transcript) : null;
      if (length && goal.startDate && today) {
        const words = lengthProposal(goal.startDate, length, 'block_length', today);
        return codeTurn(draft, { kind: 'proposal', chunk: null, topic, question: words.question, detail: mark(words.detail), options: [] });
      }
      return codeTurn(draft, { kind: 'question', chunk: null, topic, question: GOAL_WORDS.blockQuestion, detail: mark(GOAL_WORDS.blockReason) });
    }
    case 'end_date': {
      const length = goal.startDate && today ? plainLengthSaid(transcript) : null;
      if (length && goal.startDate && today) {
        const words = lengthProposal(goal.startDate, length, 'end_date', today);
        return codeTurn(draft, { kind: 'proposal', chunk: null, topic, question: words.question, detail: mark(words.detail), options: [] });
      }
      return codeTurn(draft, { kind: 'question', chunk: null, topic, question: GOAL_WORDS.endQuestion, detail: mark(GOAL_WORDS.endReason) });
    }
    case 'starting_point':
      return null;
  }
}

const lastAssistant = (session: SetupSession): AssistantTurn | null => {
  const last = session.transcript[session.transcript.length - 1];
  return last?.role === 'assistant' ? last.turn : null;
};

// The goal card code writes in place of a question of Claude's (the server and the eval runner call this): when Claude's checked turn is a
// plain question on one of the card topics (or its start-date proposal), the card for the first thing a goal still needs, or the starting
// point card for that question, goes out instead, carrying Claude's draft. No further call is made for it, and the cards after it follow in
// the browser. Null, so Claude's own turn stands, when:
// - the turn is not a question on one of those topics (a proposal Claude already worked out, an interpretation or an offer of ideas stand);
// - the person's last message asked what the question means: that turn is the explanation they asked for;
// - the turn asks again the topic of the turn before it: a clarification of a typed answer, which needs Claude's words;
// - no goal needs a card (every value is already in the draft), or a start date has no today to suggest.
export function goalCardInPlaceOf(turn: AssistantTurn, transcript: Transcript, today: string | null | undefined): AssistantTurn | null {
  const topic = turn.topic;
  if (!isGoalTopic(topic)) return null;
  if (!(turn.kind === 'question' || (turn.kind === 'proposal' && topic === 'start_date'))) return null;
  const last = transcript[transcript.length - 1];
  if (last?.role !== 'person' || asksMeaning(last.text)) return null;
  const before = [...transcript].reverse().find((m) => m.role === 'assistant');
  if (before?.role === 'assistant' && before.turn.topic === topic) return null;
  const card = topic === 'starting_point' ? startingPointCard(turn.draft) : goalCardFor(turn.draft, transcript, today ?? null);
  // A skip of Claude's own ("You told me ..., so I'll skip that.") stays on the first card.
  return card === null ? null : { ...card, skipped: turn.skipped };
}

// ---- Answering a card ------------------------------------------------------------------------------------------------------------------

// What comes next (MOM-180 B3) once the goals part is approved and every goal's shape and dates are in, when no active goal has a deadline (a
// deadline goal is Claude's after its start date: its deadline task needs words only the person's goal can give): what to count for the first
// active goal with nothing counted, or, when a typed answer already gave every target its least that counts, the targets playback.
const countingNext = (draft: SetupDraft): AssistantTurn | null =>
  draft.approved.includes('goals') &&
  draft.model.goals.every((g) => nextNeed(g) === null) &&
  draft.model.goals.every((g) => g.state !== 'active' || (g.shape !== null && g.shape !== 'project'))
    ? (targetCard(draft) ?? targetsPlayback(draft))
    : null;

// The conversation after a card was answered: the person's message, then the next card when a goal still needs one, then code's fixed question on
// what to count (MOM-180 B3), or nothing more when the next thing is Claude's (the caller then asks Claude).
export function withNextGoalTurn(session: SetupSession, today: string | null): SetupSession {
  const turn = goalCardFor(session.draft, session.transcript, today) ?? (goalWithNeed(session.draft) === null ? countingNext(session.draft) : null);
  if (turn === null) return session;
  const grown: SetupSession = { ...session, transcript: [...session.transcript, { role: 'assistant', turn }] };
  const parsed = SetupSessionSchema.safeParse(grown);
  return parsed.success ? parsed.data : session;
}

interface Taken {
  // The person's own message for the answer.
  text: string;
  // One `said` entry for each value written, with how the person gave it, by the key of the goal it is about.
  paths: (goalKey: string) => { path: string; how: 'said' | 'accepted' }[];
  // Writes the answer into the (cloned) model. False when the value cannot be taken: nothing changes.
  change: (goal: GoalDraft) => boolean;
}

// The conversation with one answer in it: the person's message, the draft changed, one `said` entry for each path, and whatever code writes
// next. Null when the newest turn is not the card for `topic`, or the answer is not one the card offers.
function answered(session: SetupSession, topic: GoalCardTopic, today: string | null, take: Taken | null): SetupSession | null {
  const turn = lastAssistant(session);
  if (!take || !turn || !isGoalCard(turn) || turn.topic !== topic) return null;
  const model = structuredClone(session.draft.model);
  let paths: ReturnType<Taken['paths']> = [];
  if (topic !== 'starting_point') {
    const need = goalWithNeed(session.draft);
    const goal = need && need.topic === topic ? model.goals.find((g) => g.key === need.goal.key) : undefined;
    if (!goal || !take.change(goal)) return null;
    paths = take.paths(goal.key);
  }
  const at = session.transcript.length;
  const next: SetupSession = {
    ...session,
    transcript: [...session.transcript, { role: 'person', text: take.text }],
    draft: {
      ...session.draft,
      model,
      said: [...session.draft.said.filter((s) => !paths.some((p) => p.path === s.path)), ...paths.map((p) => ({ path: p.path, turn: at, how: p.how }))],
    },
  };
  const parsed = SetupSessionSchema.safeParse(next);
  return parsed.success ? withNextGoalTurn(parsed.data, today) : null;
}

// The date a person's tap gave, as YYYY-MM-DD: their yes to the date the card showed, or a day they picked ("Thursday, Nov 12, 2026", exactly as
// the date picker writes it). Anything else, a day typed in words, is not a tap: it goes to Claude as always, with code's date note.
function tappedDate(turn: AssistantTurn, text: string, today: string): { iso: string; how: 'said' | 'accepted' } | null {
  if (text === PROPOSAL_YES_TEXT) {
    if (turn.kind !== 'proposal') return null;
    const shown = datesIn(turn.question ?? '');
    if (shown.length !== 1) return null;
    const iso = isoOfWritten(shown[0], today);
    return iso ? { iso, how: 'accepted' } : null;
  }
  const picked = datesIn(text);
  if (picked.length !== 1 || picked[0].year === null) return null;
  const iso = isoOfWritten(picked[0], today);
  return iso && pickedDateText(iso) === text ? { iso, how: 'said' } : null;
}

// The conversation when an end date is refused (on or before the start): the person's message, then the same question again with one plain
// line saying why. The draft is untouched, and no call is made.
function refusedEndDate(session: SetupSession): SetupSession {
  const refusal = codeTurn(session.draft, {
    kind: 'question',
    chunk: null,
    topic: 'end_date',
    question: GOAL_WORDS.endQuestion,
    detail: mark(GOAL_WORDS.endReason),
  });
  return { ...session, transcript: [...session.transcript, { role: 'assistant', turn: { ...refusal, say: AFTER_START_LINE } }] };
}

export function answerStartingPoint(session: SetupSession, text: string): SetupSession | null {
  const choice = STARTING_POINTS.find((c) => c.say === text);
  return answered(session, 'starting_point', null, choice ? { text: choice.say, paths: () => [], change: () => true } : null);
}

export function answerShape(session: SetupSession, text: string, today: string | null): SetupSession | null {
  const choice = SHAPE_CHOICES.find((c) => c.say === text);
  return answered(
    session,
    'shape',
    today,
    choice
      ? {
          text: choice.say,
          // The shape is a choice the person made, so it is theirs in the draft like a date or a number is (no check reads it as a leaf).
          paths: (key) => [{ path: `goals.${key}.shape`, how: 'said' }],
          change: (goal) => {
            goal.shape = choice.value;
            return true;
          },
        }
      : null,
  );
}

export function answerStartDate(session: SetupSession, text: string, today: string | null): SetupSession | null {
  const turn = lastAssistant(session);
  if (!turn || !today) return null;
  const date = tappedDate(turn, text, today);
  const need = goalWithNeed(session.draft);
  return answered(
    session,
    'start_date',
    today,
    date && need
      ? {
          text,
          paths: (key) => [{ path: `goals.${key}.startDate`, how: date.how }],
          change: (goal) => {
            goal.startDate = date.iso;
            return true;
          },
        }
      : null,
  );
}

export function answerBlockLength(session: SetupSession, text: string, today: string | null): SetupSession | null {
  const turn = lastAssistant(session);
  if (!turn) return null;
  const need = goalWithNeed(session.draft);
  if (!need) return null;
  let weeks: number | null = null;
  let how: 'said' | 'accepted' = 'said';
  const choice = BLOCK_CHOICES.find((c) => c.say === text);
  if (choice) weeks = choice.value;
  else if (text === PROPOSAL_YES_TEXT && turn.kind === 'proposal') {
    const m = /first stretch of (\d{1,3}) weeks?\b/.exec(turn.question ?? '');
    if (m) [weeks, how] = [Number(m[1]), 'accepted'];
  }
  if (weeks === null || weeks < 1) return null;
  const given = weeks;
  return answered(session, 'block_length', today, {
    text,
    paths: (key) => [{ path: `goals.${key}.blockWeeks`, how }],
    change: (goal) => {
      goal.blockWeeks = given;
      return true;
    },
  });
}

export function answerEndDate(session: SetupSession, text: string, today: string | null): SetupSession | null {
  const turn = lastAssistant(session);
  if (!turn || !today || !isGoalCard(turn) || turn.topic !== 'end_date') return null;
  const date = tappedDate(turn, text, today);
  const need = goalWithNeed(session.draft);
  if (!date || !need || need.topic !== 'end_date') return null;
  const start = need.goal.startDate;
  if (start && date.iso <= start) {
    // Refused with no call (the person's message is in the conversation; the draft is as it was).
    const parsed = SetupSessionSchema.safeParse(refusedEndDate({ ...session, transcript: [...session.transcript, { role: 'person', text }] }));
    return parsed.success ? parsed.data : null;
  }
  return answered(session, 'end_date', today, {
    text,
    paths: (key) => [{ path: `goals.${key}.endDate`, how: date.how }],
    change: (goal) => {
      goal.endDate = date.iso;
      return true;
    },
  });
}

// What a card on screen sends back, by the person's tap: the screen calls this with the text of the tap, for whichever goal card the newest turn
// is. Null for anything that is not a tap on that card (a typed answer, a day in words), which the screen sends to Claude as always.
export function answerGoalCard(session: SetupSession, text: string, today: string | null): SetupSession | null {
  const turn = lastAssistant(session);
  if (!turn || !isGoalCard(turn)) return null;
  switch (turn.topic) {
    case 'starting_point':
      return answerStartingPoint(session, text);
    case 'shape':
      return answerShape(session, text, today);
    case 'start_date':
      return answerStartDate(session, text, today);
    case 'block_length':
      return answerBlockLength(session, text, today);
    case 'end_date':
      return answerEndDate(session, text, today);
    default:
      return null;
  }
}
