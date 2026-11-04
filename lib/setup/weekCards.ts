// The cards code writes for the week questions of guided setup, with no Claude call (MOM-179, docs/DOMAIN_MODEL.md §2.2 step 10), building on
// MOM-178's cards (lib/setup/cards.ts). The order code asks them in is fixed:
//   day end, week start, kinds of days (Claude's), time for each kind of day, set days or any day (one card for each target that needs it),
//   when to plan the week, then the playback of the planning part, written by code too.
// Each card follows the pattern of the quick path and the other cards: code writes the question, the person's tap is their answer, written
// as a message of their own, and the draft records it as `said` with that message's position. Nothing is chosen for the person: no control
// has a value pre-selected, and a card whose value the draft already holds is skipped (rule 5), so an answer typed in one reply that holds
// two values shows neither card. Every card keeps "Type your answer", which sends the person's own words to Claude as always.
//
// Pure: no database, no model, no network. The screen answers a card with the functions here; the server uses `weekCardFrom` to put a
// card in place of a question of Claude's on a card topic (lib/setup/cardTurns.ts).

import { CAPACITY_UNITS } from '@/types/database.types';
import { SetupSessionSchema, type AssistantTurn, type GoalDraft, type SetupDraft, type SetupModel, type SetupSession, type TargetDraft } from '@/types/setup';
import { codeTurn } from './cards';
import { countedWords, weekdayName } from './playback';
import { personWords } from './said';
import { DAY_END_SAY } from './steps';
import { listOf } from './restate';

// Every week card carries this in its detail line, so the screen can tell it from one of Claude's, and Claude, reading the conversation,
// sees what it is.
export const WEEK_CARD_MARK = 'Week card, written by code.';

export const WEEK_CARD_TOPICS = ['day_end', 'week_start', 'capacity', 'slots_or_quota', 'planning_moment'] as const;
export type WeekCardTopic = (typeof WEEK_CARD_TOPICS)[number];

// The order the week questions are asked in. Day types are Claude's: code never writes that question.
const ORDER = ['day_end', 'week_start', 'day_types', 'capacity', 'slots_or_quota', 'planning_moment'] as const;
type OrderTopic = (typeof ORDER)[number] | 'end';

// The cards' words (the owner's, written into the MOM-179 Jira comment before the build).
export const WEEK_WORDS = {
  dayEndQuestion: 'When does your day end?',
  weekStartQuestion: 'Which day does your week start on?',
  weekStartReason: 'Your weeks are counted from this day.',
  timeHeading: 'Time you have for your goals',
  timeSkipLine: 'Skip any you like.',
  minutes: 'Minutes',
  hours: 'Hours',
  onSetDays: 'On set days',
  anyDay: "Any day, as long as the week's number is met",
  setDaysPrompt: 'Which days?',
  planningQuestion: 'When would you like to plan your week?',
  planningReason: 'Your look back at the week happens then too.',
  next: 'Next',
  noneSaid: "I'll skip these for now.",
  typeAnswer: 'Type your answer',
} as const;

export const slotsQuestion = (thing: string): string => `Would you rather do ${thing} on set days, or any day?`;
export const chooseUnitCallout = (name: string): string => `Choose minutes or hours for ${name}.`;
export const addNumberCallout = (name: string): string => `Add a number for ${name}.`;
export const PICK_A_DAY = 'Pick a day.';
export const pickDaysCallout = (needed: number, amount: string): string => `Pick at least ${needed} days for ${amount} a week, or choose any day.`;
export const WHICH_DAY = 'Which day?';
export const WHAT_TIME = 'What time?';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const MAX_DAY_MINUTES = 24 * 60;

// "9:00 PM", "12:00 AM": the way a person writes a time, which the checks read back (lib/setup/text.ts timePhrasesIn).
export function clockWords(hhmm: string): string {
  const hour = Number(hhmm.slice(0, 2));
  return `${hour % 12 === 0 ? 12 : hour % 12}:${hhmm.slice(3, 5)} ${hour < 12 ? 'AM' : 'PM'}`;
}

// ---- What each card still has to ask -------------------------------------------------------------------------------------------------

const activeTargets = (model: SetupModel): { goal: GoalDraft; target: TargetDraft }[] =>
  model.goals.filter((g) => g.state === 'active').flatMap((goal) => goal.targets.map((target) => ({ goal, target })));

// The validator's own rule (lib/setup/validate.ts): a weekly or set-days target needs the week start; a deadline-only person is never asked.
export const needsWeekStart = (model: SetupModel): boolean => model.person.weekStart === null && model.goals.flatMap((g) => g.targets).some((t) => t.period.kind !== 'deadline');

export const dayTypesLeft = (model: SetupModel): SetupModel['person']['dayTypes'] => model.person.dayTypes.filter((d) => d.capacityAmount === null);

export const periodPath = (goalKey: string, targetKey: string): string => `goals.${goalKey}.targets.${targetKey}.period`;
const slotPath = (goalKey: string, targetKey: string): string => `goals.${goalKey}.targets.${targetKey}.slotWeekdays`;

// The targets that still need "set days or any day": counted by the week (or on set days) and not yet answered. A set-days answer is a
// weekdays value with its own `said` entry; "any day" has no value, so it is marked with an entry of its own at the target's period.
export function slotTargetsLeft(draft: SetupDraft): { goal: GoalDraft; target: TargetDraft }[] {
  const answered = (path: string) => draft.said.some((s) => s.path === path);
  return activeTargets(draft.model).filter(
    ({ goal, target }) => target.period.kind !== 'deadline' && !answered(periodPath(goal.key, target.key)) && !(target.period.kind === 'day_slots' && answered(slotPath(goal.key, target.key))),
  );
}

export const planningLeft = (model: SetupModel): { weekday: boolean; time: boolean } => ({ weekday: model.person.planning.weekday === null, time: model.person.planning.time === null });

// The most days a count target's chosen days may fall short by: a count target of N a week needs at least N days. Only a count target with
// a least-that-counts number is checked (the owner's decision, MOM-179); a quantity or a time has no count of days, so nothing is checked.
export function daysNeeded(target: TargetDraft): number | null {
  return target.measure === 'count' && target.floor !== null ? Math.ceil(target.floor) : null;
}

// The thing a target counts, in the person's own words, for the set-days card.
export const thingOf = (target: TargetDraft, said: readonly string[]): string => countedWords(target.title, said);

// ---- The cards ------------------------------------------------------------------------------------------------------------------------

// The card for a topic, or null when the draft has nothing to ask for it (the value is there, or nothing needs it).
export function weekCard(topic: WeekCardTopic, draft: SetupDraft, said: readonly string[] = []): AssistantTurn | null {
  const model = draft.model;
  switch (topic) {
    case 'day_end':
      return model.person.dayEnd === null
        ? codeTurn(draft, { kind: 'question', chunk: null, topic, question: WEEK_WORDS.dayEndQuestion, detail: WEEK_CARD_MARK })
        : null;
    case 'week_start':
      return needsWeekStart(model) ? codeTurn(draft, { kind: 'question', chunk: null, topic, question: WEEK_WORDS.weekStartQuestion, detail: WEEK_CARD_MARK }) : null;
    case 'capacity':
      return dayTypesLeft(model).length > 0 ? codeTurn(draft, { kind: 'question', chunk: null, topic, question: WEEK_WORDS.timeHeading, detail: WEEK_CARD_MARK }) : null;
    case 'slots_or_quota': {
      const first = slotTargetsLeft(draft)[0];
      return first ? codeTurn(draft, { kind: 'question', chunk: null, topic, question: slotsQuestion(thingOf(first.target, said)), detail: WEEK_CARD_MARK }) : null;
    }
    case 'planning_moment': {
      const left = planningLeft(model);
      return left.weekday || left.time ? codeTurn(draft, { kind: 'question', chunk: null, topic, question: WEEK_WORDS.planningQuestion, detail: WEEK_CARD_MARK }) : null;
    }
  }
}

export type WeekNext = { kind: 'card'; turn: AssistantTurn } | { kind: 'claude' } | { kind: 'done' };

// What comes next at or after a topic, in the fixed order: the first card that has something to ask, Claude when the next thing is the kinds
// of days (and none are known yet), or done when no card is left. `from` is the topic to start at, itself included.
export function weekCardFrom(draft: SetupDraft, from: OrderTopic, said: readonly string[] = []): WeekNext {
  for (const topic of from === 'end' ? [] : ORDER.slice(ORDER.indexOf(from))) {
    if (topic === 'day_types') {
      // The kinds of days are Claude's question. Once the draft holds some, the cards go on to the time for each.
      if (draft.model.person.dayTypes.length === 0) return { kind: 'claude' };
      continue;
    }
    const turn = weekCard(topic, draft, said);
    if (turn) return { kind: 'card', turn };
  }
  return { kind: 'done' };
}

// The line under a card's question, which the screen shows in place of the mark in the turn's detail: the day-end explanation, and the reasons.
export const weekCardDetail = (topic: string | null): string | null =>
  topic === 'day_end' ? DAY_END_SAY : topic === 'week_start' ? WEEK_WORDS.weekStartReason : topic === 'planning_moment' ? WEEK_WORDS.planningReason : null;

export const isWeekCard = (turn: AssistantTurn): boolean => turn.kind === 'question' && turn.detail === WEEK_CARD_MARK && WEEK_CARD_TOPICS.some((t) => t === turn.topic);

const lastAssistant = (session: SetupSession): AssistantTurn | null => {
  const last = session.transcript[session.transcript.length - 1];
  return last?.role === 'assistant' ? last.turn : null;
};

// The planning part played back by code, once the last planning answer is in (the same turn the settings card ends with).
export const planningPlayback = (draft: SetupDraft): AssistantTurn => codeTurn(draft, { kind: 'playback', chunk: 'planning', topic: null, question: null, detail: null });

// The conversation after a card was answered: the person's message, then the next card, or the playback of the planning part when no card is
// left, or nothing more when the next thing is Claude's (the caller then asks Claude). The planning part is played back only when it was not
// already approved.
export function withNextWeekTurn(session: SetupSession, from: OrderTopic): SetupSession {
  const next = weekCardFrom(session.draft, from, personWords(session.transcript));
  const turn = next.kind === 'card' ? next.turn : next.kind === 'done' && !session.draft.approved.includes('planning') ? planningPlayback(session.draft) : null;
  if (turn === null) return session;
  const grown: SetupSession = { ...session, transcript: [...session.transcript, { role: 'assistant', turn }] };
  const parsed = SetupSessionSchema.safeParse(grown);
  return parsed.success ? parsed.data : session;
}

// After a target's answer the next target is asked at once, so the set-days card comes round again until none is left.
const topicAfter = (topic: WeekCardTopic): OrderTopic => (topic === 'slots_or_quota' ? topic : (ORDER[ORDER.indexOf(topic) + 1] ?? 'end'));

// ---- Answering a card -----------------------------------------------------------------------------------------------------------------

// The conversation with one answer in it: the person's message, the draft changed by `change`, one `said` entry for each path, and then
// whatever code writes next. Null when the newest turn is not that card, or the answer is not one the card offers.
function answered(
  session: SetupSession,
  topic: WeekCardTopic,
  text: string,
  paths: string[],
  change: (model: SetupModel) => boolean,
): SetupSession | null {
  const turn = lastAssistant(session);
  if (!turn || !isWeekCard(turn) || turn.topic !== topic) return null;
  const model = structuredClone(session.draft.model);
  if (!change(model)) return null;
  const at = session.transcript.length;
  const next: SetupSession = {
    ...session,
    transcript: [...session.transcript, { role: 'person', text }],
    draft: {
      ...session.draft,
      model,
      said: [...session.draft.said.filter((s) => !paths.includes(s.path)), ...paths.map((path) => ({ path, turn: at, how: 'said' as const }))],
    },
  };
  const parsed = SetupSessionSchema.safeParse(next);
  return parsed.success ? withNextWeekTurn(parsed.data, topicAfter(topic)) : null;
}

export function answerDayEnd(session: SetupSession, time: string): SetupSession | null {
  if (!HHMM.test(time)) return null;
  return answered(session, 'day_end', `My day ends at ${clockWords(time)}.`, ['person.dayEnd'], (model) => {
    model.person.dayEnd = time;
    return true;
  });
}

export function answerWeekStart(session: SetupSession, weekday: number): SetupSession | null {
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return null;
  return answered(session, 'week_start', `My week starts on ${weekdayName(weekday)}.`, ['person.weekStart'], (model) => {
    model.person.weekStart = weekday;
    return true;
  });
}

export type TimeUnit = 'minutes' | 'hours';
// A row's answer as typed: its number as text, and the unit tapped. A row with neither is left unset.
export interface DayTimeAnswer {
  amount: string;
  unit: TimeUnit | null;
}
export type DayTimeAnswers = Record<string, DayTimeAnswer>;

// A number as a person types it: digits with at most two decimals, a comma or a point; no sign, no exponent.
export function readAmount(raw: string): number | null {
  const text = raw.trim();
  return /^\d{1,4}([.,]\d{1,2})?$/.test(text) ? Number(text.replace(',', '.')) : null;
}

const unitWord = (amount: number, unit: TimeUnit): string => (amount === 1 ? unit.slice(0, -1) : unit);

// What a row is missing, in the card's own callout words, or null when it is complete or left alone. Used by the card and by the answer.
export function dayTimeProblem(name: string, answer: DayTimeAnswer | undefined): string | null {
  const typed = (answer?.amount ?? '').trim();
  const unit = answer?.unit ?? null;
  if (typed === '' && unit === null) return null;
  if (typed === '') return addNumberCallout(name);
  if (unit === null) return chooseUnitCallout(name);
  const n = readAmount(typed);
  if (n === null || (unit === 'minutes' ? n > MAX_DAY_MINUTES : n > 24)) return addNumberCallout(name);
  return null;
}

// Time for each kind of day. The hours are saved with full precision (20 minutes is a third of an hour), and a row left alone stays unset.
export function answerDayTimes(session: SetupSession, answers: DayTimeAnswers): SetupSession | null {
  const rows = dayTypesLeft(session.draft.model);
  const given = rows.filter((d) => (answers[d.name.toLowerCase()]?.amount ?? '').trim() !== '' || answers[d.name.toLowerCase()]?.unit != null);
  if (Object.keys(answers).some((k) => !rows.some((d) => d.name.toLowerCase() === k))) return null;
  if (given.some((d) => dayTimeProblem(d.name, answers[d.name.toLowerCase()]) !== null)) return null;
  const parts = given.map((d) => {
    const a = answers[d.name.toLowerCase()];
    const n = readAmount(a.amount) as number;
    return `${d.name}: ${n} ${unitWord(n, a.unit as TimeUnit)}.`;
  });
  const paths = given.map((d) => `person.dayTypes.${d.name.toLowerCase()}.capacityAmount`);
  return answered(session, 'capacity', parts.length > 0 ? parts.join(' ') : WEEK_WORDS.noneSaid, paths, (model) => {
    for (const d of given) {
      const a = answers[d.name.toLowerCase()];
      const n = readAmount(a.amount) as number;
      const row = model.person.dayTypes.find((x) => x.name === d.name);
      if (!row) return false;
      row.capacityUnit = CAPACITY_UNITS[0];
      row.capacityAmount = a.unit === 'minutes' ? n / 60 : n;
    }
    return true;
  });
}

export type SlotsAnswer = { kind: 'any' } | { kind: 'days'; weekdays: number[] };

// What a set-days answer is short of for its target, in the card's words, or null when it fits (or there is no check for the target).
export function slotsProblem(target: TargetDraft, answer: SlotsAnswer): string | null {
  if (answer.kind === 'any') return null;
  const days = new Set(answer.weekdays);
  if (days.size === 0) return PICK_A_DAY;
  const needed = daysNeeded(target);
  return needed !== null && days.size < needed ? pickDaysCallout(needed, `${target.floor} ${target.title.toLowerCase()}`) : null;
}

// One target's answer: set days (the target counts on those days) or any day (it counts across the week). The target is the first one still
// to ask, the one the card named.
export function answerSlots(session: SetupSession, answer: SlotsAnswer): SetupSession | null {
  const first = slotTargetsLeft(session.draft)[0];
  if (!first) return null;
  const { goal, target } = first;
  if (slotsProblem(target, answer) !== null) return null;
  const thing = thingOf(target, personWords(session.transcript));
  if (answer.kind === 'any') {
    return answered(session, 'slots_or_quota', `Any day works for ${thing}, as long as the week's number is met.`, [periodPath(goal.key, target.key)], (model) => {
      const t = model.goals.find((g) => g.key === goal.key)?.targets.find((x) => x.key === target.key);
      if (!t) return false;
      t.period = { kind: 'weekly' };
      return true;
    });
  }
  const weekdays = [...new Set(answer.weekdays)].sort((a, b) => a - b);
  if (weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) return null;
  return answered(session, 'slots_or_quota', `I'd like to do ${thing} on ${listOf(weekdays.map(weekdayName))}.`, [slotPath(goal.key, target.key)], (model) => {
    const t = model.goals.find((g) => g.key === goal.key)?.targets.find((x) => x.key === target.key);
    if (!t) return false;
    t.period = { kind: 'day_slots', weekdays };
    return true;
  });
}

export function answerPlanning(session: SetupSession, answer: { weekday?: number; time?: string }): SetupSession | null {
  const left = planningLeft(session.draft.model);
  const weekday = left.weekday ? answer.weekday : undefined;
  const time = left.time ? answer.time : undefined;
  if ((left.weekday && weekday === undefined) || (left.time && time === undefined)) return null;
  if (weekday !== undefined && (!Number.isInteger(weekday) || weekday < 1 || weekday > 7)) return null;
  if (time !== undefined && !HHMM.test(time)) return null;
  const model = session.draft.model.person.planning;
  const day = weekday ?? model.weekday;
  const at = time ?? model.time;
  if (day === null || at === null) return null;
  const text = `I'll plan my week on ${weekdayName(day)} at ${clockWords(at)}.`;
  const paths = [...(weekday !== undefined ? ['person.planning.weekday'] : []), ...(time !== undefined ? ['person.planning.time'] : [])];
  return answered(session, 'planning_moment', text, paths, (m) => {
    if (weekday !== undefined) m.person.planning.weekday = weekday;
    if (time !== undefined) m.person.planning.time = time;
    return true;
  });
}

// What a card on screen sends back, by topic: the screen calls the one function for the card the newest turn is.
export type WeekAnswer =
  | { topic: 'day_end'; time: string }
  | { topic: 'week_start'; weekday: number }
  | { topic: 'capacity'; rows: DayTimeAnswers }
  | { topic: 'slots_or_quota'; answer: SlotsAnswer }
  | { topic: 'planning_moment'; weekday?: number; time?: string };

export function answerWeekCard(session: SetupSession, answer: WeekAnswer): SetupSession | null {
  switch (answer.topic) {
    case 'day_end':
      return answerDayEnd(session, answer.time);
    case 'week_start':
      return answerWeekStart(session, answer.weekday);
    case 'capacity':
      return answerDayTimes(session, answer.rows);
    case 'slots_or_quota':
      return answerSlots(session, answer.answer);
    case 'planning_moment':
      return answerPlanning(session, answer);
  }
}
