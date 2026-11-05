// The cards code writes for guided setup's steps 3, 7 and 9, with no Claude call (MOM-180 part B2, docs/DOMAIN_MODEL.md §2.2), in the pattern of the goal
// cards (lib/setup/goalCards.ts) and the week cards (lib/setup/weekCards.ts):
//   step 3  one goal or a few, together or one first, and when a goal set aside comes back;
//   step 7  something I do or a result, the least that counts or what I'm aiming for, and the number boxes (the least that counts, and the number
//           hoped for, in minutes or hours for a time target);
//   step 9  where each thing counted is tracked (source) and, for an app with more than one number, which number counts (metric).
//
// Every card: code writes the question, the person's tap is their own answer, written as a message of their own, and the draft records it as `said`
// with that message's position. Nothing is chosen for the person: no control has a value pre-selected. A card whose value the draft already holds is not
// shown (rule 5), and a value code cannot take as asked changes nothing. Every card keeps "Type your answer", which sends the person's own words to Claude,
// and "What does this mean?" (lib/setup/explain.ts).
//
// Claude still does what only it can: it names the goals, writes the target and reads a free answer. Where its question lands on a card topic, the card goes
// out in its place (`stepCardInPlaceOf`, called by the server), and the cards after it follow in the browser with no further call. The time zone tap
// uses `withNextSourceOrWeekTurn`: the next step after it is a source card or a week card, both code's, so no call is made until the next step is Claude's.
//
// Pure: no database, no model, no network.

import { casualDate } from '@/lib/dates/casual';
import { INTEGRATION_CATALOG, quantityMetricsOf } from '@/lib/integrations/catalog';
import type { QuantityMetric } from '@/types/database.types';
import { SetupSessionSchema, type AssistantTurn, type GoalDraft, type SetupDraft, type SetupModel, type SetupSession, type SetupTopic, type TargetDraft, type Transcript } from '@/types/setup';
import { codeTurn } from './cards';
import { afterTargetTurn, goalsPlayback } from './fixedQuestions';
import { isoOfWritten } from './codeTurns';
import { countedThing, countedTarget, numberQuestion } from './numbers';
import { countedWords } from './playback';
import { personWords } from './said';
import { pickedDateText } from './session';
import { asksMeaning, datesIn } from './text';
import { hoursToMinutes, namesHours, namesMinutes } from './timeUnits';
import { addNumberCallout, chooseUnitCallout, readAmount, withNextWeekTurn } from './weekCards';

// Every step card carries this at the start of its detail line, so the screen can tell it from one of Claude's, and Claude, reading the conversation, sees
// what it is. What follows the mark is the line the person sees under the question.
export const STEP_CARD_MARK = 'Step card, written by code.';

export const STEP_CARD_TOPICS = ['breakup', 'sequencing', 'parked_return', 'role', 'number_level', 'floor', 'aspiration', 'source', 'metric'] as const;
export type StepCardTopic = (typeof STEP_CARD_TOPICS)[number];
const isStepTopic = (topic: SetupTopic | null): topic is StepCardTopic => topic !== null && (STEP_CARD_TOPICS as readonly string[]).includes(topic);

// The cards' words (the owner's, written into the MOM-180 Jira comment 10382 before the build).
export const STEP_WORDS = {
  breakupQuestion: 'Is this one goal, or a few separate ones?',
  breakupReason: 'Each goal gets its own plan.',
  namesQuestion: 'What are the goals?',
  namesReason: 'Name each one, in your own words.',
  sequencingQuestion: 'Would you like to start them together, or one first?',
  roleReason: 'Something you do gets a number to hit each week. A result is tracked so you can watch it move.',
  sourceReason: 'An app can count it for you, or you can log it yourself with a tap.',
  justOne: 'Just one goal',
  aFew: 'A few goals',
  allTogether: 'All together',
  onlyWhenAsked: 'Only when I ask',
  somethingIDo: 'Something I do',
  aResult: 'A result',
  leastThatCounts: 'The least that counts',
  aimingFor: "What I'm aiming for",
  logMyself: "I'll log it myself",
  skipAim: "I'll skip the number I'm hoping for.",
  skipLine: 'Skip it if you like.',
  next: 'Next',
  pickDayAfterToday: 'Pick a day after today.',
  aimBelowLeast: "Your aim can't be lower than the least that counts.",
  // The owner's words for a number hoped for that is not a number (MOM-180 comment 10384).
  addAim: "Add the number you're hoping for, or leave it empty.",
  leastBox: 'The least that counts',
} as const;

export const returnQuestion = (title: string): string => `When should "${title}" come back?`;
export const roleQuestion = (thing: string): string => `Is "${thing}" something you do, or a result?`;
export const sourceQuestion = (thing: string): string => `Where do you track ${thing} now, if anywhere?`;
export const metricQuestion = (thing: string, app: string): string => `Which number counts for ${thing} in ${app}?`;
export const levelQuestion = (token: string): string => `Is ${token} the least that counts, or what you're aiming for?`;
export const firstFor = (title: string): string => `"${title}" first`;

export interface StepChoice {
  label: string;
  // What the person's message says for the tap.
  say: string;
  value: string;
}

const mark = (reason: string | null): string => (reason ? `${STEP_CARD_MARK} ${reason}` : STEP_CARD_MARK);

// The line the screen shows under a step card's question, in place of the mark.
export function stepCardDetail(turn: AssistantTurn): string | null {
  const detail = turn.detail ?? '';
  const rest = detail.startsWith(STEP_CARD_MARK) ? detail.slice(STEP_CARD_MARK.length).trim() : '';
  return rest === '' ? null : rest;
}

export const isStepCard = (turn: AssistantTurn): boolean =>
  (turn.kind === 'question' || turn.kind === 'proposal') && isStepTopic(turn.topic) && (turn.detail ?? '').startsWith(STEP_CARD_MARK);

// The card that asks for the goals' names is a question with an answer box and no buttons: its answer is the person's own words, for Claude.
export const isNamesCard = (turn: AssistantTurn): boolean => isStepCard(turn) && turn.topic === 'breakup' && turn.question === STEP_WORDS.namesQuestion;

// ---- What each goal and target still has to be asked --------------------------------------------------------------------------------------

const activeGoals = (model: SetupModel): GoalDraft[] => model.goals.filter((g) => g.state === 'active');

// The thing the card is about: the newest target of the newest active goal that has one (the one Claude has just been asking about).
function newestTarget(draft: SetupDraft): { goal: GoalDraft; target: TargetDraft } | null {
  const goals = activeGoals(draft.model).filter((g) => g.targets.length > 0);
  const goal = goals[goals.length - 1];
  const target = goal?.targets[goal.targets.length - 1];
  return goal && target ? { goal, target } : null;
}

const ownerOf = (draft: SetupDraft, target: TargetDraft): GoalDraft | undefined => draft.model.goals.find((g) => g.targets.some((t) => t === target));

const targetPath = (goal: GoalDraft, target: TargetDraft, field: string): string => `goals.${goal.key}.targets.${target.key}.${field}`;

// The first goal set aside with no way back yet.
const returnNeed = (draft: SetupDraft): GoalDraft | null => draft.model.goals.find((g) => g.state === 'parked' && g.returnWhen === null) ?? null;

// A target bound to an app that counts more than one number, and the person's choice of which still open.
const metricSourceOf = (target: TargetDraft) =>
  target.measure === 'quantity' ? target.sources.find((s) => s.kind === 'synced' && s.metric === null && quantityMetricsOf(s.provider).length > 0) : undefined;

// The first thing step 9 still has to ask: a target with no source, or an app source that needs its number chosen.
export function sourceNeed(draft: SetupDraft): { goal: GoalDraft; target: TargetDraft; topic: 'source' | 'metric' } | null {
  for (const goal of activeGoals(draft.model)) {
    for (const target of goal.targets) {
      if (target.sources.length === 0) return { goal, target, topic: 'source' };
      if (metricSourceOf(target)) return { goal, target, topic: 'metric' };
    }
  }
  return null;
}

const appName = (provider: string): string => INTEGRATION_CATALOG.find((e) => e.provider === provider)?.name ?? 'that app';

// ---- The unit a time target's numbers are in -------------------------------------------------------------------------------------------------

export type NumberUnit = 'minutes' | 'hours';

// The unit a time target is counted in when its own words name one ("hours of reading"), or 'ask' when the card has to ask, or null for a target that
// is not a time (no unit to say).
export function unitOfTarget(target: TargetDraft, said: readonly string[] = []): NumberUnit | 'ask' | null {
  if (target.measure !== 'time') return null;
  const words = countedWords(target.title, said);
  if (namesHours(words)) return 'hours';
  if (namesMinutes(words)) return 'minutes';
  return 'ask';
}

const unitWord = (n: number, unit: NumberUnit): string => (n === 1 ? unit.slice(0, -1) : unit);

// An amount as the person's message says it, and the value the draft holds (minutes for a time). A fractional number of hours whose minutes do not
// multiply back exactly is said in minutes, so the draft check reads the same number the draft holds.
export function amountOf(n: number, unit: NumberUnit | null): { words: string; value: number } {
  if (unit === null) return { words: String(n), value: n };
  if (unit === 'minutes') return { words: `${n} ${unitWord(n, 'minutes')}`, value: n };
  const minutes = hoursToMinutes(n);
  return n * 60 === minutes ? { words: `${n} ${unitWord(n, 'hours')}`, value: minutes } : { words: `${minutes} ${unitWord(minutes, 'minutes')}`, value: minutes };
}

// The number question for a target. A time target whose words name no unit is asked in time ("how much time on reading"), since the card then asks for
// minutes or hours; every other target keeps the words of lib/setup/numbers.ts.
function dueText(target: TargetDraft, today: string | null): string | null {
  return target.period.kind === 'deadline' ? casualDate(target.period.dueDate, today, { relative: false }) : null;
}
export function floorWords(target: TargetDraft, today: string | null, said: readonly string[] = []): string {
  if (unitOfTarget(target, said) !== 'ask') return numberQuestion('floor', target, today, said);
  const words = countedWords(target.title, said);
  const due = dueText(target, today);
  return due ? `How much time on ${words} by ${due} would still count as on track?` : `In a hard week, how much time on ${words} would still count?`;
}
export function aimWords(target: TargetDraft, today: string | null, said: readonly string[] = []): string {
  if (unitOfTarget(target, said) !== 'ask') return numberQuestion('aspiration', target, today, said);
  const words = countedWords(target.title, said);
  const due = dueText(target, today);
  return due ? `How much time on ${words} by ${due} are you hoping for?` : `How much time on ${words} a week are you hoping for?`;
}

// ---- The cards -----------------------------------------------------------------------------------------------------------------------------

export const breakupCard = (draft: SetupDraft): AssistantTurn =>
  codeTurn(draft, { kind: 'question', chunk: null, topic: 'breakup', question: STEP_WORDS.breakupQuestion, detail: mark(STEP_WORDS.breakupReason) });

// What follows "A few goals": code asks for the names, since naming goals is Claude's to read.
export const namesCard = (draft: SetupDraft): AssistantTurn =>
  codeTurn(draft, { kind: 'question', chunk: null, topic: 'breakup', question: STEP_WORDS.namesQuestion, detail: mark(STEP_WORDS.namesReason) });

export const sequencingCard = (draft: SetupDraft): AssistantTurn =>
  codeTurn(draft, { kind: 'question', chunk: null, topic: 'sequencing', question: STEP_WORDS.sequencingQuestion, detail: mark(null) });

export function returnCard(draft: SetupDraft): AssistantTurn | null {
  const goal = returnNeed(draft);
  return goal ? codeTurn(draft, { kind: 'question', chunk: null, topic: 'parked_return', question: returnQuestion(goal.title), detail: mark(null) }) : null;
}

export function roleCard(draft: SetupDraft, said: readonly string[]): AssistantTurn | null {
  const found = newestTarget(draft);
  if (!found) return null;
  return codeTurn(draft, { kind: 'question', chunk: null, topic: 'role', question: roleQuestion(countedWords(found.target.title, said)), detail: mark(STEP_WORDS.roleReason) });
}

// A number the person gave with no "at least" or "aiming for", read from Claude's own words (its lead-in and its question, which quotes the number): the number as it is quoted, with its unit when the target
// is a time. Null (so Claude's question stands) when Claude's words quote no number or more than one, or a time target's unit cannot be known.
export function levelFrom(words: string, target: TargetDraft, said: readonly string[]): { token: string; value: number } | null {
  const found = [...words.matchAll(/(\d[\d,]*(?:\.\d+)?)(?:\s*(hours?|hrs?|minutes?|mins?)\b)?/gi)];
  if (found.length !== 1) return null;
  const n = Number(found[0][1].replaceAll(',', ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  const kind = unitOfTarget(target, said);
  if (kind === null) return { token: String(n), value: n };
  const quoted: NumberUnit | null = found[0][2] ? (/^h/i.test(found[0][2]) ? 'hours' : 'minutes') : null;
  const unit = quoted ?? (kind === 'ask' ? null : kind);
  if (unit === null) return null;
  const amount = amountOf(n, unit);
  return { token: amount.words, value: amount.value };
}

export function levelCard(draft: SetupDraft, token: string): AssistantTurn {
  return codeTurn(draft, { kind: 'question', chunk: null, topic: 'number_level', question: levelQuestion(token), detail: mark(null) });
}

// The number boxes: the least that counts when the draft lacks it, and the number hoped for when it lacks that (and the person has not just given it: after
// "what I'm aiming for" the number is held in their own message, see `aimHeldFrom`). Null when there is nothing left to ask.
export function numbersCard(draft: SetupDraft, today: string | null, said: readonly string[], aimHeld = false): AssistantTurn | null {
  const target = countedTarget(draft, 'floor');
  if (!target) return null;
  const needsFloor = target.floor === null;
  const needsAim = target.aspiration === null && !aimHeld;
  if (!needsFloor && !needsAim) return null;
  const question = needsFloor ? floorWords(target, today, said) : aimWords(target, today, said);
  return codeTurn(draft, { kind: 'question', chunk: null, topic: needsFloor ? 'floor' : 'aspiration', question, detail: mark(null) });
}

export function sourceCard(draft: SetupDraft, said: readonly string[]): AssistantTurn | null {
  const need = sourceNeed(draft);
  if (!need) return null;
  if (need.topic === 'source') {
    return codeTurn(draft, { kind: 'question', chunk: null, topic: 'source', question: sourceQuestion(countedThing(need.target, said)), detail: mark(STEP_WORDS.sourceReason) });
  }
  const source = metricSourceOf(need.target);
  const app = source?.kind === 'synced' ? appName(source.provider) : 'that app';
  return codeTurn(draft, { kind: 'question', chunk: null, topic: 'metric', question: metricQuestion(countedThing(need.target, said), app), detail: mark(null) });
}

// ---- The choices a button card offers --------------------------------------------------------------------------------------------------------

export const ROLE_CHOICES: readonly StepChoice[] = [
  { label: STEP_WORDS.somethingIDo, say: `${STEP_WORDS.somethingIDo}.`, value: 'effort' },
  { label: STEP_WORDS.aResult, say: `${STEP_WORDS.aResult}.`, value: 'outcome' },
];

export const BREAKUP_CHOICES: readonly StepChoice[] = [
  { label: STEP_WORDS.justOne, say: `${STEP_WORDS.justOne}.`, value: 'one' },
  { label: STEP_WORDS.aFew, say: `${STEP_WORDS.aFew}.`, value: 'few' },
];

export const sequencingChoices = (draft: SetupDraft): StepChoice[] => [
  { label: STEP_WORDS.allTogether, say: `${STEP_WORDS.allTogether}.`, value: '' },
  ...activeGoals(draft.model).map((g) => ({ label: firstFor(g.title), say: `${firstFor(g.title)}.`, value: g.key })),
];

const levelToken = (turn: AssistantTurn): string | null => /^Is (.+) the least that counts/.exec(turn.question ?? '')?.[1] ?? null;

export const levelChoices = (turn: AssistantTurn): StepChoice[] | null => {
  const token = levelToken(turn);
  return token === null
    ? null
    : [
        { label: STEP_WORDS.leastThatCounts, say: `${token} is the least that counts.`, value: 'floor' },
        { label: STEP_WORDS.aimingFor, say: `${token} is what I'm aiming for.`, value: 'aspiration' },
      ];
};

export const sourceChoices = (): StepChoice[] => [
  { label: STEP_WORDS.logMyself, say: `${STEP_WORDS.logMyself}.`, value: 'manual' },
  ...INTEGRATION_CATALOG.map((e) => ({ label: e.name, say: `${e.name}.`, value: e.provider })),
];

export function metricChoices(draft: SetupDraft): StepChoice[] {
  const need = sourceNeed(draft);
  const source = need && need.topic === 'metric' ? metricSourceOf(need.target) : undefined;
  return source?.kind === 'synced' ? quantityMetricsOf(source.provider).map((m) => ({ label: m.label, say: `${m.label}.`, value: m.id })) : [];
}

// The buttons a card offers, or null when it has none of the plain kind (the return card and the number boxes have their own controls, and the card that
// asks for the goals' names has an answer box only).
export function stepChoices(turn: AssistantTurn): readonly StepChoice[] | null {
  if (!isStepCard(turn) || isNamesCard(turn)) return null;
  switch (turn.topic) {
    case 'breakup':
      return BREAKUP_CHOICES;
    case 'sequencing':
      return sequencingChoices(turn.draft);
    case 'role':
      return ROLE_CHOICES;
    case 'number_level':
      return levelChoices(turn);
    case 'source':
      return sourceChoices();
    case 'metric':
      return metricChoices(turn.draft);
    default:
      return null;
  }
}

// ---- The server's hand-off: Claude's question becomes the card ----------------------------------------------------------------------------------

// The step card code writes in place of a question of Claude's (the server and the eval runner call this), carrying Claude's draft. No further call is made
// for it, and the cards after it follow in the browser. Null, so Claude's own turn stands, when:
// - the turn is not a plain question on one of the card topics;
// - the person's last message asked what the question means: that turn is the explanation they asked for;
// - the turn asks again the topic of the turn before it: a clarification of a typed answer, which needs Claude's words;
// - the draft holds the value (one goal already, or two goals named for the sequencing question, no goal waiting for its way back, a role the person
//   already gave, a number or a source already there), or the card cannot be written (a level that quotes no single number, a time target whose unit is
//   unknown).
export function stepCardInPlaceOf(turn: AssistantTurn, transcript: Transcript, today: string | null | undefined): AssistantTurn | null {
  const topic = turn.topic;
  if (turn.kind !== 'question' || !isStepTopic(topic)) return null;
  const last = transcript[transcript.length - 1];
  if (last?.role !== 'person' || asksMeaning(last.text)) return null;
  const before = [...transcript].reverse().find((m) => m.role === 'assistant');
  if (before?.role === 'assistant' && before.turn.topic === topic) return null;
  const draft = turn.draft;
  const said = personWords(transcript);
  let card: AssistantTurn | null = null;
  switch (topic) {
    case 'breakup':
      card = activeGoals(draft.model).length <= 1 ? breakupCard(draft) : null;
      break;
    case 'sequencing':
      card = activeGoals(draft.model).length >= 2 ? sequencingCard(draft) : null;
      break;
    case 'parked_return':
      card = returnCard(draft);
      break;
    case 'role': {
      const found = newestTarget(draft);
      card = found && !draft.said.some((s) => s.path === targetPath(found.goal, found.target, 'role')) ? roleCard(draft, said) : null;
      break;
    }
    case 'number_level': {
      const found = newestTarget(draft);
      const level = found ? levelFrom(`${turn.say} ${turn.question ?? ''}`, found.target, said) : null;
      card = level ? levelCard(draft, level.token) : null;
      break;
    }
    case 'floor':
    case 'aspiration':
      card = numbersCard(draft, today ?? null, said);
      break;
    case 'source':
    case 'metric':
      card = sourceCard(draft, said);
      break;
  }
  return card === null ? null : { ...card, skipped: turn.skipped };
}

// ---- Answering a card ----------------------------------------------------------------------------------------------------------------------

// The number a level card quoted ("3", "2 hours", "45 minutes"), as the draft holds it (minutes for a time), or null when the token is not one the card wrote.
function levelValue(token: string, target: TargetDraft): number | null {
  const quoted = /^(\d[\d,]*(?:\.\d+)?)(?:\s+(hours?|minutes?))?$/i.exec(token);
  if (!quoted) return null;
  const n = Number(quoted[1].replaceAll(',', ''));
  const unit: NumberUnit | null = quoted[2] ? (/^h/i.test(quoted[2]) ? 'hours' : 'minutes') : null;
  if (target.measure === 'time' && unit === null) return null;
  return amountOf(n, target.measure === 'time' ? unit : null).value;
}

// The number the person has just said they are aiming for, held in their message while the least that counts is asked (a number hoped for with nothing
// beneath it is refused by the draft check, so it is not written until the least that counts is). Read from the end of the conversation: the level card,
// the tap on "what I'm aiming for", and the number boxes that follow it. `at` is the tap's message, which is where the value was said.
export function aimHeldFrom(transcript: Transcript): { value: number; at: number } | null {
  const n = transcript.length;
  const boxes = transcript[n - 1];
  const tap = transcript[n - 2];
  const asked = transcript[n - 3];
  if (boxes?.role !== 'assistant' || tap?.role !== 'person' || asked?.role !== 'assistant') return null;
  if (!isStepCard(boxes.turn) || boxes.turn.topic !== 'floor' || !isStepCard(asked.turn) || asked.turn.topic !== 'number_level') return null;
  const aiming = levelChoices(asked.turn)?.find((c) => c.value === 'aspiration');
  const token = levelToken(asked.turn);
  const found = newestTarget(boxes.turn.draft);
  if (!aiming || aiming.say !== tap.text || token === null || !found) return null;
  const value = levelValue(token, found.target);
  return value === null ? null : { value, at: n - 2 };
}

const lastAssistant =(session: SetupSession): AssistantTurn | null => {
  const last = session.transcript[session.transcript.length - 1];
  return last?.role === 'assistant' ? last.turn : null;
};

// The conversation with one more turn of code's, or the conversation as it was when the turn cannot be added.
function grown(session: SetupSession, turn: AssistantTurn | null): SetupSession {
  if (turn === null) return session;
  const next: SetupSession = { ...session, transcript: [...session.transcript, { role: 'assistant', turn }] };
  const parsed = SetupSessionSchema.safeParse(next);
  return parsed.success ? parsed.data : session;
}

interface Taken {
  // The person's own message for the answer.
  text: string;
  // One `said` entry for each value written.
  paths: { path: string; how: 'said' | 'accepted' }[];
  // Writes the answer into the (cloned) model. False when the value cannot be taken: nothing changes.
  change: (model: SetupModel) => boolean;
}

// The conversation with one answer in it: the person's message, the draft changed, one `said` entry for each path. Null when the newest turn is not a step
// card for one of `topics` or the answer cannot be taken.
function applied(session: SetupSession, topics: readonly StepCardTopic[], take: Taken): SetupSession | null {
  const turn = lastAssistant(session);
  if (!turn || !isStepCard(turn) || !topics.includes(turn.topic as StepCardTopic)) return null;
  const model = structuredClone(session.draft.model);
  if (!take.change(model)) return null;
  const at = session.transcript.length;
  const next: SetupSession = {
    ...session,
    transcript: [...session.transcript, { role: 'person', text: take.text }],
    draft: {
      ...session.draft,
      model,
      said: [...session.draft.said.filter((s) => !take.paths.some((p) => p.path === s.path)), ...take.paths.map((p) => ({ path: p.path, turn: at, how: p.how }))],
    },
  };
  const parsed = SetupSessionSchema.safeParse(next);
  return parsed.success ? parsed.data : null;
}

const goalIn = (model: SetupModel, key: string): GoalDraft | undefined => model.goals.find((g) => g.key === key);

// Step 3: one goal or a few. "Just one goal" writes nothing, and step 3 is done: code plays the goals back (MOM-180 B3). "A few goals" asks for
// the names (Claude reads them).
export function answerBreakup(session: SetupSession, text: string): SetupSession | null {
  const turn = lastAssistant(session);
  if (!turn || isNamesCard(turn)) return null;
  const choice = BREAKUP_CHOICES.find((c) => c.say === text);
  if (!choice) return null;
  const next = applied(session, ['breakup'], { text: choice.say, paths: [], change: () => true });
  if (!next) return null;
  return grown(next, choice.value === 'few' ? namesCard(next.draft) : goalsPlayback(next.draft));
}

// Step 3: together or one first. One first sets the others aside (parked), and the card for the way back of each follows.
export function answerSequencing(session: SetupSession, text: string): SetupSession | null {
  const choice = sequencingChoices(session.draft).find((c) => c.say === text);
  if (!choice) return null;
  const parked = choice.value === '' ? [] : activeGoals(session.draft.model).filter((g) => g.key !== choice.value);
  const next = applied(session, ['sequencing'], {
    text: choice.say,
    paths: parked.map((g) => ({ path: `goals.${g.key}.state`, how: 'said' as const })),
    change: (model) => {
      for (const g of parked) {
        const goal = goalIn(model, g.key);
        if (!goal) return false;
        goal.state = 'parked';
      }
      return true;
    },
  });
  return next ? grown(next, returnCard(next.draft) ?? goalsPlayback(next.draft)) : null;
}

// Why a day is refused as the way back of a goal set aside: it must come after the person's own today.
export const returnDateProblem = (iso: string, today: string | null): string | null => (today !== null && iso <= today ? STEP_WORDS.pickDayAfterToday : null);

// Step 3: when a goal set aside comes back: a day (the date picker's own words), or "Only when I ask". A season or a condition is typed, for Claude.
export function answerReturn(session: SetupSession, text: string, today: string | null): SetupSession | null {
  const goal = returnNeed(session.draft);
  if (!goal) return null;
  let when: GoalDraft['returnWhen'] = null;
  let path = `goals.${goal.key}.returnWhen`;
  if (text === `${STEP_WORDS.onlyWhenAsked}.`) {
    when = { kind: 'on_request' };
  } else {
    const picked = datesIn(text);
    const iso = today && picked.length === 1 && picked[0].year !== null ? isoOfWritten(picked[0], today) : null;
    if (!iso || pickedDateText(iso) !== text || returnDateProblem(iso, today) !== null) return null;
    when = { kind: 'date', date: iso };
    path = `goals.${goal.key}.returnDate`;
  }
  const given = when;
  const next = applied(session, ['parked_return'], {
    text,
    paths: [{ path, how: 'said' }],
    change: (model) => {
      const g = goalIn(model, goal.key);
      if (!g) return false;
      g.returnWhen = given;
      return true;
    },
  });
  return next ? grown(next, returnCard(next.draft) ?? goalsPlayback(next.draft)) : null;
}

// Step 7: something I do, or a result. For something the person does, the number boxes follow when the draft has no number yet; a result is Claude's
// to carry on from, as before.
export function answerRole(session: SetupSession, text: string, today: string | null): SetupSession | null {
  const choice = ROLE_CHOICES.find((c) => c.say === text);
  const found = newestTarget(session.draft);
  if (!choice || !found) return null;
  const { goal, target } = found;
  const next = applied(session, ['role'], {
    text: choice.say,
    paths: [{ path: targetPath(goal, target, 'role'), how: 'said' }],
    change: (model) => {
      const t = goalIn(model, goal.key)?.targets.find((x) => x.key === target.key);
      if (!t) return false;
      t.role = choice.value as TargetDraft['role'];
      return true;
    },
  });
  if (!next) return null;
  const after = next.draft.model.goals.find((g) => g.key === goal.key)?.targets.find((t) => t.key === target.key);
  return after && after.role === 'effort' && after.floor === null ? grown(next, numbersCard(next.draft, today, personWords(next.transcript))) : next;
}

// Step 7: which level a number the person gave is. The number is the one the card quotes. "The least that counts" is written at once, and Claude carries on.
// "What I'm aiming for" is held in the person's message and nothing is written: the draft refuses a number hoped for with nothing beneath it, so the box for the
// least that counts follows, with no call, and both numbers are written when it is given (answerNumbers).
export function answerLevel(session: SetupSession, text: string, today: string | null): SetupSession | null {
  const turn = lastAssistant(session);
  const choice = turn ? levelChoices(turn)?.find((c) => c.say === text) : undefined;
  const found = newestTarget(session.draft);
  const token = turn ? levelToken(turn) : null;
  if (!turn || !isStepCard(turn) || !choice || !found || token === null) return null;
  const { goal, target } = found;
  const value = levelValue(token, target);
  if (value === null) return null;
  const aiming = choice.value === 'aspiration';
  const next = applied(session, ['number_level'], {
    text,
    paths: aiming ? [] : [{ path: targetPath(goal, target, 'floor'), how: 'said' }],
    change: (model) => {
      if (aiming) return true;
      const t = goalIn(model, goal.key)?.targets.find((x) => x.key === target.key);
      if (!t) return false;
      t.floor = value;
      return true;
    },
  });
  if (!next) return null;
  return aiming ? grown(next, numbersCard(next.draft, today, personWords(next.transcript), true)) : next;
}

// What the number boxes hold: each as typed, and the unit tapped for a time whose own words name none.
export interface NumbersAnswer {
  floor?: string;
  aspiration?: string;
  unit?: NumberUnit | null;
}

// What an answer on the number boxes is short of, in the card's own words, or null when it can be taken. The same rule the card shows and the answer uses.
export function numbersProblem(draft: SetupDraft, answer: NumbersAnswer, said: readonly string[] = [], held: number | null = null): string | null {
  const target = countedTarget(draft, 'floor');
  if (!target) return null;
  const needsFloor = target.floor === null;
  const needsAim = target.aspiration === null && held === null;
  const kind = unitOfTarget(target, said);
  const unit: NumberUnit | null = kind === 'ask' ? (answer.unit ?? null) : kind;
  const name = countedWords(target.title, said);
  const typedFloor = (answer.floor ?? '').trim();
  const typedAim = (answer.aspiration ?? '').trim();
  const floorValue = typedFloor === '' ? null : readAmount(typedFloor);
  const aimValue = typedAim === '' ? null : readAmount(typedAim);
  if (needsFloor && (floorValue === null || floorValue <= 0)) return addNumberCallout('the least that counts');
  if (needsAim && typedAim !== '' && (aimValue === null || aimValue <= 0)) return STEP_WORDS.addAim;
  if (kind === 'ask' && unit === null && ((needsFloor && typedFloor !== '') || (needsAim && typedAim !== ''))) return chooseUnitCallout(name);
  const floorStored = needsFloor ? amountOf(floorValue as number, unit).value : target.floor;
  if (needsAim && aimValue !== null && floorStored !== null && amountOf(aimValue, unit).value < floorStored) return STEP_WORDS.aimBelowLeast;
  const aimHeldValue = held ?? target.aspiration;
  if (!needsAim && needsFloor && floorValue !== null && aimHeldValue !== null && aimHeldValue < amountOf(floorValue, unit).value) return STEP_WORDS.aimBelowLeast;
  return null;
}

// Step 7: the number boxes. Both numbers are the person's own: their message says them, and the draft records each as said. A refused answer changes
// nothing. Claude carries on after it.
export function answerNumbers(session: SetupSession, answer: NumbersAnswer): SetupSession | null {
  const turn = lastAssistant(session);
  if (!turn || !isStepCard(turn) || (turn.topic !== 'floor' && turn.topic !== 'aspiration')) return null;
  const said = personWords(session.transcript);
  // A number the person just said they are aiming for is held in the message of their tap, and is written now, with the least that counts beneath it.
  const held = aimHeldFrom(session.transcript);
  if (numbersProblem(session.draft, answer, said, held?.value ?? null) !== null) return null;
  const target = countedTarget(session.draft, 'floor');
  const goal = target ? ownerOf(session.draft, target) : undefined;
  if (!target || !goal) return null;
  const kind = unitOfTarget(target, said);
  const unit: NumberUnit | null = kind === 'ask' ? (answer.unit ?? null) : kind;
  const floorGiven = target.floor === null ? readAmount((answer.floor ?? '').trim()) : null;
  const aimGiven = target.aspiration === null && held === null && (answer.aspiration ?? '').trim() !== '' ? readAmount((answer.aspiration ?? '').trim()) : null;
  const floor = floorGiven === null ? null : amountOf(floorGiven, unit);
  const aim = aimGiven === null ? null : amountOf(aimGiven, unit);
  const parts = [...(floor ? [`The least that counts is ${floor.words}.`] : []), ...(aim ? [`I'm hoping for ${aim.words}.`] : [])];
  const next = applied(session, ['floor', 'aspiration'], {
    text: parts.length > 0 ? parts.join(' ') : STEP_WORDS.skipAim,
    paths: [...(floor ? [{ path: targetPath(goal, target, 'floor'), how: 'said' as const }] : []), ...(aim ? [{ path: targetPath(goal, target, 'aspiration'), how: 'said' as const }] : [])],
    change: (model) => {
      const t = goalIn(model, goal.key)?.targets.find((x) => x.key === target.key);
      if (!t) return false;
      if (floor) t.floor = floor.value;
      if (aim) t.aspiration = aim.value;
      if (held) t.aspiration = held.value;
      return true;
    },
  });
  if (!next) return null;
  // The held number was said in the message of the tap, so that is its source, not this message.
  const path = targetPath(goal, target, 'aspiration');
  const taken = held ? { ...next, draft: { ...next.draft, said: [...next.draft.said.filter((e) => e.path !== path), { path, turn: held.at, how: 'said' as const }] } } : next;
  // What follows (MOM-180 B3): what to count for the next goal with nothing counted, else the targets playback, both code's; Claude only when neither is due.
  return grown(taken, afterTargetTurn(taken.draft));
}

// What follows a source or a metric answer, and the time zone tap: the next source or metric card, then the week cards (the day end first); Claude is asked only
// when the next step is Claude's (the kinds of days). The conversation as it was when code has nothing to add.
export function withNextSourceOrWeekTurn(session: SetupSession): SetupSession {
  const need = sourceCard(session.draft, personWords(session.transcript));
  if (need) return grown(session, need);
  return withNextWeekTurn(session, 'day_end');
}

// Step 9: where a target is tracked. The app's own name is the person's message; a quantity counted in an app with several numbers asks which counts next.
export function answerSource(session: SetupSession, text: string): SetupSession | null {
  const need = sourceNeed(session.draft);
  const choice = sourceChoices().find((c) => c.say === text);
  if (!need || need.topic !== 'source' || !choice) return null;
  const { goal, target } = need;
  const next = applied(session, ['source'], {
    text: choice.say,
    paths: [{ path: targetPath(goal, target, 'sources'), how: 'said' }],
    change: (model) => {
      const t = goalIn(model, goal.key)?.targets.find((x) => x.key === target.key);
      if (!t) return false;
      t.sources = choice.value === 'manual' ? [{ kind: 'manual' }] : [{ kind: 'synced', provider: choice.value, metric: null }];
      return true;
    },
  });
  return next ? withNextSourceOrWeekTurn(next) : null;
}

export function answerMetric(session: SetupSession, text: string): SetupSession | null {
  const need = sourceNeed(session.draft);
  const choice = need && need.topic === 'metric' ? metricChoices(session.draft).find((c) => c.say === text) : undefined;
  if (!need || !choice) return null;
  const { goal, target } = need;
  const next = applied(session, ['metric'], {
    text: choice.say,
    paths: [{ path: targetPath(goal, target, 'metric'), how: 'said' }],
    change: (model) => {
      const source = goalIn(model, goal.key)?.targets.find((x) => x.key === target.key)?.sources.find((s) => s.kind === 'synced' && s.metric === null);
      if (source?.kind !== 'synced') return false;
      source.metric = choice.value as QuantityMetric;
      return true;
    },
  });
  return next ? withNextSourceOrWeekTurn(next) : null;
}

// What a card on screen sends back: the words of a tap, or the number boxes. The screen calls this for whichever step card the newest turn is; null for
// anything else (a typed answer), which goes to Claude as always.
export type StepAnswer = { kind: 'text'; text: string } | { kind: 'numbers'; answer: NumbersAnswer };

export function answerStepCard(session: SetupSession, answer: StepAnswer, today: string | null): SetupSession | null {
  const turn = lastAssistant(session);
  if (!turn || !isStepCard(turn)) return null;
  if (turn.topic === 'floor' || turn.topic === 'aspiration') return answer.kind === 'numbers' ? answerNumbers(session, answer.answer) : null;
  if (answer.kind !== 'text') return null;
  switch (turn.topic) {
    case 'breakup':
      return answerBreakup(session, answer.text);
    case 'sequencing':
      return answerSequencing(session, answer.text);
    case 'parked_return':
      return answerReturn(session, answer.text, today);
    case 'role':
      return answerRole(session, answer.text, today);
    case 'number_level':
      return answerLevel(session, answer.text, today);
    case 'source':
      return answerSource(session, answer.text);
    case 'metric':
      return answerMetric(session, answer.text);
    default:
      return null;
  }
}

