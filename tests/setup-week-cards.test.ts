// MOM-179: the week questions of guided setup as cards code writes, with no Claude call. What these hold the code to:
// 1. Each card (day end, week start, time for each kind of day, set days or any day, when to plan) has nothing pre-selected, is skipped when
//    the draft already holds its value, and puts the person's tap into the draft as their own message with a `said` entry.
// 2. A refused value changes nothing: the card returns null and the session is as it was.
// 3. The count check for set days, the minutes-to-hours save, and the way a capacity reads back (under an hour in whole minutes).
// 4. The fixed order, and how Claude's day-types turn hands back to the cards; a typed answer that holds two values shows neither card.
// 5. The service puts a card in place of Claude's question with no further call, and the whole scripted first setup reaches every step-10
//    question with fewer model calls than the same person typing.
// Nothing here touches the network.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { takeSetupTurn } from '@/lib/services/setup';
import type { RunSetupTurnArgs, SetupTurnResult } from '@/lib/services/llm';
import { weekCardInPlaceOf } from '@/lib/setup/cardTurns';
import { emptyDraft } from '@/lib/setup/draft';
import { runSetupEval } from '@/lib/setup/evals';
import { renderFinal, renderPlayback } from '@/lib/setup/playback';
import { SETUP_SYSTEM_PROMPT } from '@/lib/setup/prompt';
import { MEANING_TEXT } from '@/lib/setup/session';
import { validateDraft } from '@/lib/setup/validate';
import {
  WEEK_CARD_MARK,
  WEEK_WORDS,
  answerDayEnd,
  answerDayTimes,
  answerPlanning,
  answerSlots,
  answerWeekStart,
  anyDayTargets,
  chooseUnitCallout,
  clockWords,
  dayTimeProblem,
  dayTypesLeft,
  isWeekCard,
  needsWeekStart,
  pickDaysCallout,
  slotTargetsLeft,
  slotsProblem,
  slotsQuestion,
  weekCard,
  weekCardFrom,
  type WeekCardTopic,
} from '@/lib/setup/weekCards';
import { capacityWords } from '@/lib/utils/units';
import type { AssistantTurn, SetupDraft, SetupModel, SetupSession } from '@/types/setup';
import { resetFakeSave } from './helpers/fakeSetupSave';
import { goal, scriptedModel, target } from './helpers/setupScript';
import { WEEK_CARDS_CASE } from './setup-evals/cases';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeSetupSave');
  return { createSupabaseServerClient };
});

const ME = '11111111-1111-4111-8111-111111111111';
beforeEach(() => resetFakeSave({ id: ME }));
afterEach(() => vi.restoreAllMocks());

// A draft with one active goal and one weekly count target ("Runs", at least 3), then whatever `edit` changes.
function draftWith(edit: (m: SetupModel) => void = () => undefined): SetupDraft {
  const draft = emptyDraft();
  const g = goal('g1', 'Run more');
  g.targets.push(target('t1', 'Runs', { floor: 3 }));
  draft.model.goals.push(g);
  edit(draft.model);
  return draft;
}

// A session that ends with the card for `topic`, as the screen holds it when the person is looking at the card.
function onCard(topic: WeekCardTopic, edit?: (m: SetupModel) => void): SetupSession {
  const draft = draftWith(edit);
  const card = weekCard(topic, draft);
  if (!card) throw new Error(`no ${topic} card for this draft`);
  return { transcript: [{ role: 'assistant', turn: card }], draft, spentTokens: 0 };
}

const withKinds = (m: SetupModel) => {
  m.person.dayTypes = [
    { name: 'Busy days', capacityUnit: null, capacityAmount: null },
    { name: 'Easy days', capacityUnit: null, capacityAmount: null },
  ];
};

const lastMessage = (s: SetupSession) => s.transcript[s.transcript.length - 1];
const personText = (s: SetupSession, from: number): string => {
  const m = s.transcript[from];
  if (m?.role !== 'person') throw new Error('not a person message');
  return m.text;
};
// The draft check, as the server runs it between turns: the cards' answers must leave no issue about where a value came from.
// The fixture's own least-that-counts number has no conversation behind it, so the floor paths are left out.
const issuesOf = (s: SetupSession) => validateDraft(s.draft, s.transcript, 'progress').issues.filter((i) => !i.path.endsWith('.floor'));

// ---------------------------------------------------------------------------
// 1 and 2. The cards
// ---------------------------------------------------------------------------

describe('the day end card', () => {
  it('has nothing chosen, and is written by code', () => {
    const card = weekCard('day_end', draftWith());
    expect(card).toMatchObject({ kind: 'question', topic: 'day_end', question: 'When does your day end?', detail: WEEK_CARD_MARK, options: [] });
    expect(isWeekCard(card as AssistantTurn)).toBe(true);
  });

  it('is skipped when the draft already holds the day end', () => {
    expect(weekCard('day_end', draftWith((m) => (m.person.dayEnd = '21:00')))).toBeNull();
  });

  it("puts the tap into the draft as the person's own message, with a said entry pointing at it", () => {
    const next = answerDayEnd(onCard('day_end'), '21:00');
    if (!next) throw new Error('refused');
    expect(next.draft.model.person.dayEnd).toBe('21:00');
    expect(personText(next, 1)).toBe('My day ends at 9:00 PM.');
    expect(next.draft.said).toEqual([{ path: 'person.dayEnd', turn: 1, how: 'said' }]);
    expect(issuesOf(next)).toEqual([]);
  });

  it('writes a time the way a person says it, for the early hours and the middle of the day too', () => {
    expect(clockWords('00:00')).toBe('12:00 AM');
    expect(clockWords('02:00')).toBe('2:00 AM');
    expect(clockWords('12:30')).toBe('12:30 PM');
    expect(clockWords('18:05')).toBe('6:05 PM');
    const early = answerDayEnd(onCard('day_end'), '02:00');
    if (!early) throw new Error('refused');
    expect(issuesOf(early)).toEqual([]);
  });

  it('refuses a value the card did not offer, and changes nothing', () => {
    const session = onCard('day_end');
    const before = structuredClone(session);
    for (const bad of ['25:00', '9pm', '', '21:60']) expect(answerDayEnd(session, bad)).toBeNull();
    expect(session).toEqual(before);
    // The answer to another card is not accepted here, nor an answer when the newest turn is not the card.
    expect(answerWeekStart(session, 1)).toBeNull();
    expect(answerDayEnd({ ...session, transcript: [...session.transcript, { role: 'person', text: 'hi' }] }, '21:00')).toBeNull();
  });
});

describe('the week start card', () => {
  it('is asked only when a weekly or set-days target needs it', () => {
    expect(needsWeekStart(draftWith().model)).toBe(true);
    const deadlineOnly = draftWith((m) => (m.goals[0].targets[0].period = { kind: 'deadline', dueDate: '2027-06-14' }));
    expect(needsWeekStart(deadlineOnly.model)).toBe(false);
    expect(weekCard('week_start', deadlineOnly)).toBeNull();
    expect(weekCard('week_start', draftWith((m) => (m.person.weekStart = 1)))).toBeNull();
  });

  it('has nothing chosen, and a tap is the answer', () => {
    const card = weekCard('week_start', draftWith());
    expect(card).toMatchObject({ topic: 'week_start', question: 'Which day does your week start on?', options: [] });
    const next = answerWeekStart(onCard('week_start'), 1);
    if (!next) throw new Error('refused');
    expect(next.draft.model.person.weekStart).toBe(1);
    expect(personText(next, 1)).toBe('My week starts on Monday.');
    expect(next.draft.said).toEqual([{ path: 'person.weekStart', turn: 1, how: 'said' }]);
    expect(issuesOf(next)).toEqual([]);
  });

  it('refuses a day that is not one of the seven', () => {
    const session = onCard('week_start');
    for (const bad of [0, 8, 1.5, Number.NaN]) expect(answerWeekStart(session, bad)).toBeNull();
    expect(session.draft.model.person.weekStart).toBeNull();
  });
});

describe('the time for each kind of day card', () => {
  it('has one row for each kind the person named, in their words, and none when there are none', () => {
    expect(weekCard('capacity', draftWith())).toBeNull();
    const card = weekCard('capacity', draftWith(withKinds));
    expect(card).toMatchObject({ topic: 'capacity', question: 'Time you have for your goals', options: [] });
    expect(dayTypesLeft(draftWith(withKinds).model).map((d) => d.name)).toEqual(['Busy days', 'Easy days']);
  });

  it('skips a kind whose time the draft already holds', () => {
    const draft = draftWith((m) => {
      withKinds(m);
      Object.assign(m.person.dayTypes[0], { capacityUnit: 'hours', capacityAmount: 1 });
    });
    expect(dayTypesLeft(draft.model).map((d) => d.name)).toEqual(['Easy days']);
  });

  it('saves minutes as hours with full precision, hours as they are, and says what was chosen', () => {
    const next = answerDayTimes(onCard('capacity', withKinds), { 'busy days': { amount: '20', unit: 'minutes' }, 'easy days': { amount: '1.5', unit: 'hours' } });
    if (!next) throw new Error('refused');
    const [busy, easy] = next.draft.model.person.dayTypes;
    expect(busy).toMatchObject({ capacityUnit: 'hours' });
    expect(busy.capacityAmount).toBe(20 / 60);
    expect((busy.capacityAmount as number) * 60).toBeCloseTo(20, 9);
    expect(easy).toMatchObject({ capacityUnit: 'hours', capacityAmount: 1.5 });
    expect(personText(next, 1)).toBe('Busy days: 20 minutes. Easy days: 1.5 hours.');
    expect(next.draft.said.map((s) => s.path)).toEqual(['person.dayTypes.busy days.capacityAmount', 'person.dayTypes.easy days.capacityAmount']);
    expect(issuesOf(next)).toEqual([]);
  });

  it('reads 20 and 45 minutes back as said, and an hour or more in hours', () => {
    const next = answerDayTimes(onCard('capacity', withKinds), { 'busy days': { amount: '20', unit: 'minutes' }, 'easy days': { amount: '45', unit: 'minutes' } });
    if (!next) throw new Error('refused');
    const lines = renderPlayback(next.draft.model, 'planning');
    expect(lines.join(' ')).toContain('Busy days (20 minutes)');
    expect(lines.join(' ')).toContain('Easy days (45 minutes)');
    const hours = answerDayTimes(onCard('capacity', withKinds), { 'busy days': { amount: '2', unit: 'hours' }, 'easy days': { amount: '1.5', unit: 'hours' } });
    if (!hours) throw new Error('refused');
    expect(renderPlayback(hours.draft.model, 'planning').join(' ')).toContain('Busy days (2 hours) and Easy days (1.5 hours)');
  });

  it('leaves a row alone when nothing was entered for it, and says so when every row is left', () => {
    const one = answerDayTimes(onCard('capacity', withKinds), { 'easy days': { amount: '2', unit: 'hours' } });
    if (!one) throw new Error('refused');
    expect(one.draft.model.person.dayTypes[0]).toMatchObject({ capacityUnit: null, capacityAmount: null });
    expect(one.draft.said.map((s) => s.path)).toEqual(['person.dayTypes.easy days.capacityAmount']);
    const none = answerDayTimes(onCard('capacity', withKinds), {});
    if (!none) throw new Error('refused');
    expect(personText(none, 1)).toBe(WEEK_WORDS.noneSaid);
    expect(none.draft.said).toEqual([]);
    expect(none.draft.model.person.dayTypes.every((d) => d.capacityAmount === null)).toBe(true);
  });

  it('refuses a half-filled row, a number it cannot read, or a kind that is not on the card, and changes nothing', () => {
    const session = onCard('capacity', withKinds);
    const before = structuredClone(session);
    expect(answerDayTimes(session, { 'busy days': { amount: '20', unit: null } })).toBeNull();
    expect(answerDayTimes(session, { 'busy days': { amount: '', unit: 'minutes' } })).toBeNull();
    expect(answerDayTimes(session, { 'busy days': { amount: 'a lot', unit: 'hours' } })).toBeNull();
    expect(answerDayTimes(session, { 'busy days': { amount: '25', unit: 'hours' } })).toBeNull();
    expect(answerDayTimes(session, { 'busy days': { amount: '1441', unit: 'minutes' } })).toBeNull();
    expect(answerDayTimes(session, { 'weekends': { amount: '2', unit: 'hours' } })).toBeNull();
    expect(session).toEqual(before);
  });

  it('names what a row is missing in plain words, naming the kind', () => {
    expect(dayTimeProblem('Busy days', { amount: '20', unit: null })).toBe(chooseUnitCallout('Busy days'));
    expect(chooseUnitCallout('Busy days')).toBe('Choose minutes or hours for Busy days.');
    expect(dayTimeProblem('Busy days', { amount: '', unit: 'hours' })).toBe('Add a number for Busy days.');
    expect(dayTimeProblem('Busy days', { amount: '', unit: null })).toBeNull();
    expect(dayTimeProblem('Busy days', { amount: '2', unit: 'hours' })).toBeNull();
  });
});

describe('a time for a kind of day reads back the same way everywhere', () => {
  it('shows under an hour in whole minutes and an hour or more in hours', () => {
    expect(capacityWords(20 / 60, 'hours')).toBe('20 minutes');
    expect(capacityWords(0.75, 'hours')).toBe('45 minutes');
    expect(capacityWords(1 / 60, 'hours')).toBe('1 minute');
    expect(capacityWords(0, 'hours')).toBe('0 minutes');
    expect(capacityWords(1, 'hours')).toBe('1 hour');
    expect(capacityWords(2, 'hours')).toBe('2 hours');
    expect(capacityWords(1.5, 'hours')).toBe('1.5 hours');
    expect(capacityWords(59.9 / 60, 'hours')).toBe('1 hour');
    expect(capacityWords(3, 'sessions')).toBe('3 sessions');
    expect(capacityWords(1, 'sessions')).toBe('1 session');
  });
});

describe('the set days or any day card', () => {
  const twoTargets = (m: SetupModel) => m.goals[0].targets.push(target('t2', 'Pages read', { measure: 'quantity', unit: 'pages', floor: 100 }));

  it('names the target in the person\'s words, and has nothing chosen', () => {
    const card = weekCard('slots_or_quota', draftWith());
    expect(card).toMatchObject({ topic: 'slots_or_quota', question: slotsQuestion('runs'), options: [] });
    expect(card?.question).toBe('Would you rather do runs on set days, or any day?');
  });

  it('is asked for each target that needs it, one after the other, and not for a deadline target', () => {
    const draft = draftWith((m) => {
      twoTargets(m);
      m.goals[0].targets.push(target('t3', 'Quilt blocks', { period: { kind: 'deadline', dueDate: '2027-06-14' } }));
    });
    expect(slotTargetsLeft(draft).map((x) => x.target.key)).toEqual(['t1', 't2']);
  });

  it('records "any day" with a marker of its own, leaves the target counted by the week, and moves to the next target', () => {
    const session = onCard('slots_or_quota', twoTargets);
    const next = answerSlots(session, { kind: 'any' });
    if (!next) throw new Error('refused');
    expect(next.draft.model.goals[0].targets[0].period).toEqual({ kind: 'weekly' });
    expect(next.draft.said).toEqual([{ path: 'goals.g1.targets.t1.period', turn: 1, how: 'said' }]);
    expect(personText(next, 1)).toBe("Any day works for runs, as long as the week's number is met.");
    // The next target's card follows at once, and the first is not asked again.
    const turn = lastMessage(next);
    expect(turn.role === 'assistant' && turn.turn.question).toBe('Would you rather do pages read on set days, or any day?');
    expect(slotTargetsLeft(next.draft).map((x) => x.target.key)).toEqual(['t2']);
    expect(issuesOf(next)).toEqual([]);
  });

  it('records set days as the target\'s days, in order, with a said entry for them', () => {
    const next = answerSlots(onCard('slots_or_quota'), { kind: 'days', weekdays: [5, 1, 3] });
    if (!next) throw new Error('refused');
    expect(next.draft.model.goals[0].targets[0].period).toEqual({ kind: 'day_slots', weekdays: [1, 3, 5] });
    expect(personText(next, 1)).toBe("I'd like to do runs on Monday, Wednesday and Friday.");
    expect(next.draft.said).toEqual([{ path: 'goals.g1.targets.t1.slotWeekdays', turn: 1, how: 'said' }]);
    expect(issuesOf(next)).toEqual([]);
  });

  it('checks a count target\'s days against the least that counts, and says what to do', () => {
    const t = draftWith().model.goals[0].targets[0];
    expect(slotsProblem(t, { kind: 'days', weekdays: [1, 3] })).toBe(pickDaysCallout(3, '3 runs'));
    expect(pickDaysCallout(3, '3 runs')).toBe('Pick at least 3 days for 3 runs a week, or choose any day.');
    expect(slotsProblem(t, { kind: 'days', weekdays: [1, 3, 5] })).toBeNull();
    expect(slotsProblem(t, { kind: 'days', weekdays: [] })).toBe('Pick a day.');
    expect(slotsProblem(t, { kind: 'any' })).toBeNull();
    const session = onCard('slots_or_quota');
    expect(answerSlots(session, { kind: 'days', weekdays: [1, 3] })).toBeNull();
    expect(answerSlots(session, { kind: 'days', weekdays: [] })).toBeNull();
    expect(session.draft.model.goals[0].targets[0].period).toEqual({ kind: 'weekly' });
    // Any day is always open.
    expect(answerSlots(session, { kind: 'any' })).not.toBeNull();
  });

  it('checks nothing for a target that is not a count, or a count with no least number', () => {
    const quantity = target('t2', 'Pages read', { measure: 'quantity', unit: 'pages', floor: 100 });
    expect(slotsProblem(quantity, { kind: 'days', weekdays: [1] })).toBeNull();
    const noFloor = target('t3', 'Runs', { floor: null });
    expect(slotsProblem(noFloor, { kind: 'days', weekdays: [2] })).toBeNull();
  });

  it('refuses a day that is not one of the seven', () => {
    expect(answerSlots(onCard('slots_or_quota', (m) => (m.goals[0].targets[0].floor = 1)), { kind: 'days', weekdays: [9] })).toBeNull();
  });

  it('plays the planning part back, written by code, once the last planning answer is in', () => {
    const next = answerPlanning(onCard('planning_moment'), { weekday: 7, time: '18:00' });
    if (!next) throw new Error('refused');
    expect(next.draft.model.person.planning).toEqual({ weekday: 7, time: '18:00' });
    expect(personText(next, 1)).toBe("I'll plan my week on Sunday at 6:00 PM.");
    expect(next.draft.said.map((s) => s.path).sort()).toEqual(['person.planning.time', 'person.planning.weekday']);
    expect(issuesOf(next)).toEqual([]);
    const played = lastMessage(next);
    expect(played.role === 'assistant' && played.turn).toMatchObject({ kind: 'playback', chunk: 'planning', say: '', question: null });
    // The playback is code's and the part is not approved by it: the person's yes does that.
    expect(next.draft.approved).toEqual([]);
  });
});

describe('the planning moment card', () => {
  it('has nothing chosen, and is skipped once both a day and a time are in the draft', () => {
    expect(weekCard('planning_moment', draftWith())).toMatchObject({ topic: 'planning_moment', question: 'When would you like to plan your week?', options: [] });
    expect(weekCard('planning_moment', draftWith((m) => (m.person.planning = { weekday: 7, time: '18:00' })))).toBeNull();
  });

  it('needs both a day and a time, and refuses one alone', () => {
    const session = onCard('planning_moment');
    expect(answerPlanning(session, { weekday: 7 })).toBeNull();
    expect(answerPlanning(session, { time: '18:00' })).toBeNull();
    expect(answerPlanning(session, { weekday: 7, time: '6pm' })).toBeNull();
    expect(answerPlanning(session, { weekday: 0, time: '18:00' })).toBeNull();
    expect(session.draft.model.person.planning).toEqual({ weekday: null, time: null });
  });

  it('asks only for what is missing when the person already gave one of them', () => {
    const session = onCard('planning_moment', (m) => (m.person.planning = { weekday: 7, time: null }));
    const next = answerPlanning(session, { time: '18:00' });
    if (!next) throw new Error('refused');
    expect(next.draft.model.person.planning).toEqual({ weekday: 7, time: '18:00' });
    expect(next.draft.said.map((s) => s.path)).toEqual(['person.planning.time']);
  });
});

// ---------------------------------------------------------------------------
// 4. The order, and the hand-over to Claude and back
// ---------------------------------------------------------------------------

describe('the order the cards are asked in', () => {
  it('goes day end, week start, then Claude for the kinds of days, then time, set days and the planning moment', () => {
    const next = (d: SetupDraft, from: Parameters<typeof weekCardFrom>[1]) => {
      const n = weekCardFrom(d, from);
      return n.kind === 'card' ? n.turn.topic : n.kind;
    };
    expect(next(draftWith(), 'day_end')).toBe('day_end');
    expect(next(draftWith((m) => (m.person.dayEnd = '21:00')), 'day_end')).toBe('week_start');
    expect(next(draftWith((m) => ((m.person.dayEnd = '21:00'), (m.person.weekStart = 1))), 'day_end')).toBe('claude');
    // With kinds named, the cards go on to the time for each, then set days, then the planning moment.
    const kinds = draftWith((m) => ((m.person.dayEnd = '21:00'), (m.person.weekStart = 1), withKinds(m)));
    expect(next(kinds, 'day_end')).toBe('capacity');
    expect(next(kinds, 'slots_or_quota')).toBe('slots_or_quota');
    const slotsDone = draftWith((m) => ((m.person.dayEnd = '21:00'), (m.person.weekStart = 1), withKinds(m)));
    slotsDone.said.push({ path: 'goals.g1.targets.t1.period', turn: 1, how: 'said' });
    expect(next(slotsDone, 'slots_or_quota')).toBe('planning_moment');
    slotsDone.model.person.planning = { weekday: 7, time: '18:00' };
    expect(next(slotsDone, 'slots_or_quota')).toBe('done');
  });

  it('chains through the cards from the first answer to the playback, with Claude asked only for the kinds of days', () => {
    let session = onCard('day_end');
    const topics: (string | null)[] = [];
    const record = (s: SetupSession | null): SetupSession => {
      if (!s) throw new Error('refused');
      const m = lastMessage(s);
      topics.push(m.role === 'assistant' ? (m.turn.kind === 'playback' ? `playback:${m.turn.chunk}` : m.turn.topic) : 'claude');
      return s;
    };
    session = record(answerDayEnd(session, '21:00'));
    session = record(answerWeekStart(session, 1));
    // Claude's turn: the kinds of days are recorded, and the next question is the time for each.
    session = { ...session, transcript: [...session.transcript, { role: 'assistant', turn: { ...(weekCard('day_end', draftWith()) as AssistantTurn), topic: 'day_types', detail: null, draft: session.draft } }, { role: 'person', text: 'Busy days and easy days.' }] };
    const named = structuredClone(session.draft);
    withKinds(named.model);
    const card = weekCard('capacity', named) as AssistantTurn;
    session = { ...session, draft: named, transcript: [...session.transcript, { role: 'assistant', turn: card }] };
    session = record(answerDayTimes(session, { 'busy days': { amount: '20', unit: 'minutes' }, 'easy days': { amount: '2', unit: 'hours' } }));
    session = record(answerSlots(session, { kind: 'days', weekdays: [1, 3, 5] }));
    session = record(answerPlanning(session, { weekday: 7, time: '18:00' }));
    expect(topics).toEqual(['week_start', 'claude', 'slots_or_quota', 'planning_moment', 'playback:planning']);
    expect(issuesOf(session)).toEqual([]);
  });
});

describe('Claude\'s question goes out as the card for it', () => {
  const claudeAsks = (topic: AssistantTurn['topic'], draft: SetupDraft, over: Partial<AssistantTurn> = {}): AssistantTurn => ({
    ...(weekCard('day_end', draftWith()) as AssistantTurn),
    detail: null,
    say: '',
    topic,
    question: 'A question of Claude\'s?',
    draft,
    ...over,
  });
  const afterAnswer = (draft: SetupDraft, said = 'Around 9 at night.', before: AssistantTurn['topic'] = 'source'): SetupSession['transcript'] => [
    { role: 'assistant', turn: claudeAsks(before, draft) },
    { role: 'person', text: said },
  ];

  it('puts the day end card in place of Claude\'s day end question', () => {
    const draft = draftWith();
    const card = weekCardInPlaceOf(claudeAsks('day_end', draft), afterAnswer(draft, 'No, I will log it myself.'));
    expect(card).toMatchObject({ topic: 'day_end', detail: WEEK_CARD_MARK });
  });

  it('carries Claude\'s draft, so what Claude recorded on the way is kept', () => {
    const draft = draftWith((m) => (m.person.weekStart = 1));
    const card = weekCardInPlaceOf(claudeAsks('day_end', draft), afterAnswer(draft));
    expect(card?.draft).toEqual(draft);
  });

  it('puts the time card in place of Claude\'s question about time, and the set days card when no kind has a time to ask', () => {
    const kinds = draftWith((m) => ((m.person.dayEnd = '21:00'), (m.person.weekStart = 1), withKinds(m)));
    expect(weekCardInPlaceOf(claudeAsks('capacity', kinds), afterAnswer(kinds, 'Busy days and easy days.', 'day_types'))?.topic).toBe('capacity');
    const timed = structuredClone(kinds);
    timed.model.person.dayTypes.forEach((d) => Object.assign(d, { capacityUnit: 'hours', capacityAmount: 1 }));
    expect(weekCardInPlaceOf(claudeAsks('capacity', timed), afterAnswer(timed, 'About an hour.', 'day_types'))?.topic).toBe('slots_or_quota');
  });

  it('leaves Claude\'s turn when it is not a plain question on one of those topics', () => {
    const draft = draftWith();
    const transcript = afterAnswer(draft);
    expect(weekCardInPlaceOf(claudeAsks('day_types', draft), transcript)).toBeNull();
    expect(weekCardInPlaceOf(claudeAsks('source', draft), transcript)).toBeNull();
    expect(weekCardInPlaceOf(claudeAsks('day_end', draft, { kind: 'interpretations', options: ['One', 'Two'] }), transcript)).toBeNull();
    expect(weekCardInPlaceOf(claudeAsks(null, draft, { kind: 'playback', chunk: 'planning', question: null }), transcript)).toBeNull();
  });

  it('leaves Claude\'s turn when the person had asked what the question means: that turn is the explanation', () => {
    const draft = draftWith();
    expect(weekCardInPlaceOf(claudeAsks('day_end', draft, { say: 'I mean the time you wrap up.' }), afterAnswer(draft, MEANING_TEXT, 'day_end'))).toBeNull();
    expect(weekCardInPlaceOf(claudeAsks('day_end', draft), afterAnswer(draft, MEANING_TEXT, 'source'))).toBeNull();
  });

  it('leaves Claude\'s turn when it asks the same topic again after a typed answer: a clarification needs its words', () => {
    const draft = draftWith();
    expect(weekCardInPlaceOf(claudeAsks('day_end', draft, { say: "I'm not sure when that is." }), afterAnswer(draft, 'Late.', 'day_end'))).toBeNull();
  });

  it('shows neither the day end nor the week start card when one typed answer held both', () => {
    // "I wrap up around 11 at night and my week starts Monday": Claude records both, so its next question is the kinds of days.
    const both = draftWith((m) => ((m.person.dayEnd = '23:00'), (m.person.weekStart = 1)));
    const transcript = afterAnswer(both, 'I wrap up around 11 at night and my week starts Monday.', 'day_end');
    expect(weekCardInPlaceOf(claudeAsks('day_types', both), transcript)).toBeNull();
    // And if Claude did ask either, there is no card to put in its place for a value already held, only what follows it.
    expect(weekCard('day_end', both)).toBeNull();
    expect(weekCard('week_start', both)).toBeNull();
    expect(weekCardFrom(both, 'day_end').kind).toBe('claude');
  });

  it('shows no time card when the typed answer about the kinds of days also gave their times', () => {
    const typed = draftWith((m) => {
      m.person.dayEnd = '21:00';
      m.person.weekStart = 1;
      m.person.dayTypes = [
        { name: 'Busy days', capacityUnit: 'hours', capacityAmount: 1 },
        { name: 'Easy days', capacityUnit: 'hours', capacityAmount: 2 },
      ];
    });
    expect(weekCard('capacity', typed)).toBeNull();
    // Claude's next question is the set days one, so that card is the first to show.
    expect(weekCardInPlaceOf(claudeAsks('slots_or_quota', typed), afterAnswer(typed, 'Busy days 1 hour, easy days 2.', 'day_types'))?.topic).toBe('slots_or_quota');
  });
});

describe('the setup prompt', () => {
  it('tells Claude a card replaces its question on the week topics, and that the kinds of days are its own', () => {
    expect(SETUP_SYSTEM_PROMPT).toContain('turns your question on the day end');
    expect(SETUP_SYSTEM_PROMPT).toContain('The kinds of days (day types) are the one question the screen leaves to you');
  });
});

// ---------------------------------------------------------------------------
// 5. The service, and the whole conversation
// ---------------------------------------------------------------------------

describe('the server and the whole first setup', () => {
  const run = async (c: typeof WEEK_CARDS_CASE) => {
    let calls = 0;
    const model = scriptedModel(c.script);
    const report = await runSetupEval(c, (input) => {
      calls += 1;
      return model(input);
    });
    return { report, calls };
  };

  it('reaches every step-10 question, with the week questions as cards, and comes out clean', async () => {
    const { report } = await run(WEEK_CARDS_CASE);
    expect(report.malformed).toBeNull();
    expect(report.finished).toBe(true);
    expect(report.finalIssues).toEqual([]);
    expect(report.turns.flatMap((t) => t.violations)).toEqual([]);
    const topics = report.turns.filter((t) => t.turn.detail === WEEK_CARD_MARK).map((t) => t.turn.topic);
    expect(topics).toEqual(['day_end', 'week_start', 'capacity', 'slots_or_quota', 'planning_moment']);
    // The kinds of days are the one question left to Claude, and the planning playback is code's.
    const step10 = report.turns.filter((t) => ['day_types'].includes(t.turn.topic ?? ''));
    expect(step10.map((t) => t.byCode)).toEqual([false]);
    expect(report.turns.filter((t) => t.turn.kind === 'playback' && t.turn.chunk === 'planning').map((t) => t.byCode)).toEqual([true]);
    const draft = report.draft.model.person;
    expect(draft).toMatchObject({ dayEnd: '21:00', weekStart: 1, planning: { weekday: 7, time: '18:00' } });
    expect(draft.dayTypes.map((d) => capacityWords(d.capacityAmount as number, d.capacityUnit))).toEqual(['20 minutes', '45 minutes', '2 hours']);
    expect(report.draft.model.goals[0].targets[0].period).toEqual({ kind: 'day_slots', weekdays: [1, 3, 5] });
  });

  it('asks the model three times in step 10 where the same person typing every answer needs seven', async () => {
    const cards = await run(WEEK_CARDS_CASE);
    const typed = await run({ ...WEEK_CARDS_CASE, person: WEEK_CARDS_CASE.person.map(({ week: _week, ...line }) => line) });
    expect(typed.report.finished).toBe(true);
    expect(typed.report.finalIssues).toEqual([]);
    // Day end, week start, kinds of days, time, set days, when to plan, and the planning playback, each a call; against the day end, the kinds
    // of days, and the time (the first and last are swapped for a card on the way out).
    expect(typed.calls - cards.calls).toBe(4);
    expect(cards.calls).toBe(typed.calls - 4);
  });

  it('puts the day end card in place of Claude\'s question with no further call, and writes nothing for a card the draft has answered', async () => {
    const { report } = await run(WEEK_CARDS_CASE);
    const t = report.transcript;
    const at = t.findIndex((m) => m.role === 'assistant' && m.turn.topic === 'day_end');
    const session: SetupSession = { transcript: t.slice(0, at), draft: (t[at - 2] as { turn: AssistantTurn }).turn.draft, spentTokens: 0 };
    // The transcript holds the person's messages too, so Claude's turn number is half the position.
    const claude = WEEK_CARDS_CASE.script[at / 2];
    const calls: RunSetupTurnArgs[] = [];
    const runTurn = async (args: RunSetupTurnArgs): Promise<SetupTurnResult> => {
      calls.push(args);
      return { kind: 'answered', result: { ok: true, raw: claude, model: 'claude-opus-5-5', usage: { inputTokens: 900, outputTokens: 100 } }, turns: 1, spentTokens: 1000 } as unknown as SetupTurnResult;
    };
    const result = await takeSetupTurn({ ...session, timeZone: 'America/Denver', today: '2026-11-04' }, { runTurn: runTurn as never });
    if (!result.ok || result.data.kind !== 'turn') throw new Error('no turn');
    expect(calls).toHaveLength(1);
    expect(isWeekCard(result.data.turn)).toBe(true);
    expect(result.data.turn.topic).toBe('day_end');
    expect(result.data.turn.question).toBe('When does your day end?');
    expect(result.data.rejected).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The way a time for a kind of day is checked and shown elsewhere
// ---------------------------------------------------------------------------

describe('a time for a kind of day, said in minutes', () => {
  const leaf = (value: number) => ({ path: 'person.dayTypes.busy days.capacityAmount', kind: 'hours' as const, value });

  it('is said by "20 minutes" and "45 minutes", and by the hours themselves, and by nothing else', async () => {
    const { textSaysLeaf } = await import('@/lib/setup/validate');
    expect(textSaysLeaf(leaf(20 / 60), 'Busy days: 20 minutes.')).toBe(true);
    expect(textSaysLeaf(leaf(0.75), 'about 45 mins')).toBe(true);
    expect(textSaysLeaf(leaf(2), 'Easy days: 2 hours.')).toBe(true);
    expect(textSaysLeaf(leaf(1.5), 'an hour and a half, 1.5')).toBe(true);
    // Minutes only count when the text names minutes: "45" alone is not 0.75 hours.
    expect(textSaysLeaf(leaf(0.75), 'Busy days: 45.')).toBe(false);
    expect(textSaysLeaf(leaf(0.75), 'Busy days: 45 hours.')).toBe(false);
    expect(textSaysLeaf(leaf(20 / 60), 'Busy days: 25 minutes.')).toBe(false);
  });

  it('is a number of hours for a kind counted in hours, and a plain number for one counted in sessions', async () => {
    const { provenanceLeaves } = await import('@/lib/setup/leaves');
    const model = draftWith(withKinds).model;
    Object.assign(model.person.dayTypes[0], { capacityUnit: 'hours', capacityAmount: 0.5 });
    Object.assign(model.person.dayTypes[1], { capacityUnit: 'sessions', capacityAmount: 2 });
    const kinds = provenanceLeaves(model).filter((l) => l.path.includes('capacityAmount')).map((l) => l.kind);
    expect(kinds).toEqual(['hours', 'number']);
  });

  it('reads under an hour in minutes on the forecast pages too', async () => {
    const { usuallyText } = await import('@/components/forecast/wording');
    expect(usuallyText('hours', 20 / 60)).toBe('Usually 20 minutes');
    expect(usuallyText('hours', 0.75)).toBe('Usually 45 minutes');
    expect(usuallyText('hours', 1)).toBe('Usually 1 hour');
    expect(usuallyText('hours', 1.5)).toBe('Usually 1.5 hours');
    expect(usuallyText('sessions', 3)).toBe('Usually 3 sessions');
    expect(usuallyText(null, null)).toBe('No usual time yet');
  });
});

describe('the set days or any day, said back in the planning playback and on the final card', () => {
  // The finished card answers, as the screen holds them, so the marker is the one the card writes.
  const answeredWith = (answer: Parameters<typeof answerSlots>[1], edit?: (m: SetupModel) => void): SetupSession => {
    const next = answerSlots(onCard('slots_or_quota', (m) => ((m.goals[0].targets[0].floor = 2), edit?.(m))), answer);
    if (!next) throw new Error('refused');
    return next;
  };
  const lines = (s: SetupSession) => renderPlayback(s.draft.model, 'planning', { anyDay: anyDayTargets(s.draft) });
  const final = (s: SetupSession) => renderFinal(s.draft.model, { anyDay: anyDayTargets(s.draft) });

  it("names the set days for a target, in the person's words, one line, in the planning playback", () => {
    const s = answeredWith({ kind: 'days', weekdays: [1, 3, 5] });
    expect(lines(s)).toContain('Runs: on Monday, Wednesday and Friday.');
    expect(lines(s).filter((l) => l.startsWith('Runs: on'))).toHaveLength(1);
  });

  it('names "any day" for a target the person chose it for, and only then', () => {
    const s = answeredWith({ kind: 'any' });
    expect(anyDayTargets(s.draft)).toEqual(new Set(['g1.t1']));
    expect(lines(s)).toContain("Runs: any day, as long as the week's number is met.");
    // A weekly target the person never answered says nothing about days.
    const unanswered = draftWith();
    expect(renderPlayback(unanswered.model, 'planning', { anyDay: anyDayTargets(unanswered) }).join(' ')).not.toMatch(/any day|on Monday/);
    expect(anyDayTargets(unanswered).size).toBe(0);
  });

  it('writes one line for each target that has them', () => {
    const first = answeredWith({ kind: 'days', weekdays: [2, 4] }, (m) => {
      m.goals[0].targets.push(target('t2', 'Pages read', { measure: 'quantity', unit: 'pages', floor: 100 }));
    });
    const draft = structuredClone(first.draft);
    draft.said.push({ path: 'goals.g1.targets.t2.period', turn: 1, how: 'said' });
    const planning = renderPlayback(draft.model, 'planning', { anyDay: anyDayTargets(draft) });
    expect(planning).toContain('Runs: on Tuesday and Thursday.');
    expect(planning).toContain("Pages read: any day, as long as the week's number is met.");
  });

  it('carries them on the final card too: set days in the period words, any day when chosen', () => {
    const days = answeredWith({ kind: 'days', weekdays: [1, 3, 5] });
    expect(final(days).join(' ')).toContain('Monday, Wednesday and Friday');
    const any = answeredWith({ kind: 'any' });
    expect(final(any).join(' ')).toMatch(/runs a week, on any day/);
    expect(final(any).length).toBeLessThanOrEqual(6);
    // Without the choice the final card says nothing about days.
    expect(renderFinal(draftWith().model).join(' ')).not.toMatch(/any day/);
  });
});
