// MOM-180 part B1: the first goal cards code writes (starting point, shape, start date, first stretch, end date), the dates code works out from a
// plain length, and the refusal of an end or deadline date on or before the start. What these hold the code to (docs/DOMAIN_MODEL.md §2.2 steps 5
// and 6, §4.2 principles 1 and 13): nothing pre-selected, each tap recorded as the person's own answer, a card skipped when the draft already holds the
// value, a refused value changes nothing, and Claude is not asked for any of it.

import { describe, expect, it } from 'vitest';
import { checkTurn } from '@/lib/setup/checks';
import { emptyDraft } from '@/lib/setup/draft';
import { dateStep, normalizeDateTurn, plainLengthSaid, suggestedDate, AFTER_START_LINE } from '@/lib/setup/codeTurns';
import { codeTurn } from '@/lib/setup/cards';
import {
  BLOCK_CHOICES,
  GOAL_CARD_MARK,
  SHAPE_CHOICES,
  STARTING_POINTS,
  answerBlockLength,
  answerEndDate,
  answerGoalCard,
  answerShape,
  answerStartDate,
  answerStartingPoint,
  goalCardDetail,
  goalCardFor,
  goalCardInPlaceOf,
  isGoalCard,
} from '@/lib/setup/goalCards';
import { durationEnd, plainDurationIn } from '@/lib/setup/relativeDates';
import { PROPOSAL_YES_TEXT, awaitsClaude, pickedDateText } from '@/lib/setup/session';
import type { AssistantTurn, SetupDraft, SetupSession, Transcript } from '@/types/setup';
import { goal, target } from './helpers/setupScript';

const TODAY = '2026-11-04'; // a Wednesday

function draftWith(...goals: ReturnType<typeof goal>[]): SetupDraft {
  const d = emptyDraft();
  d.model.goals.push(...goals);
  return d;
}

// A session whose newest turn is the card for the draft, as the screen would have it.
function onCard(draft: SetupDraft, said: string[] = [], today: string | null = TODAY): SetupSession {
  const card = goalCardFor(draft, said.length ? said.flatMap((t) => [{ role: 'person' as const, text: t }]).slice(0, 0) : [], today);
  if (!card) throw new Error('no card');
  return { transcript: [{ role: 'assistant', turn: card }], draft: card.draft, spentTokens: 0 };
}

// The same, with the person's earlier words in the transcript (a length they said): the card is built from them.
function onCardAfter(draft: SetupDraft, words: string[], today: string | null = TODAY): SetupSession {
  const transcript: Transcript = [];
  const opener = codeTurn(draft, { kind: 'question', chunk: null, topic: 'idea', question: 'What would you like to work on?', detail: null });
  transcript.push({ role: 'assistant', turn: opener });
  for (const w of words) {
    transcript.push({ role: 'person', text: w });
    transcript.push({ role: 'assistant', turn: codeTurn(draft, { kind: 'question', chunk: null, topic: 'why', question: 'Why does this matter to you?', detail: null }) });
  }
  const card = goalCardFor(draft, transcript, today);
  if (!card) throw new Error('no card');
  return { transcript: [...transcript, { role: 'assistant', turn: card }], draft: card.draft, spentTokens: 0 };
}

describe('the goal cards: order, words, and what they skip', () => {
  it('asks the shape first, then the start date, then the first stretch of a goal that keeps going', () => {
    const d = draftWith(goal('g1', 'Running'));
    const shape = goalCardFor(d, [], TODAY);
    expect(shape?.topic).toBe('shape');
    expect(shape?.question).toBe('Does it keep going, end on a date, or have a deadline?');
    expect(isGoalCard(shape as AssistantTurn)).toBe(true);
    expect(goalCardDetail(shape as AssistantTurn)).toBe('It decides how your plan is laid out.');

    d.model.goals[0].shape = 'ongoing';
    const start = goalCardFor(d, [], TODAY);
    expect(start).toMatchObject({ topic: 'start_date', kind: 'proposal', question: 'Start today, Wednesday, Nov 4?' });
    expect(goalCardDetail(start as AssistantTurn)).toBe('Your first week is planned from that day.');

    d.model.goals[0].startDate = TODAY;
    expect(goalCardFor(d, [], TODAY)).toMatchObject({ topic: 'block_length', kind: 'question', question: 'How many weeks should the first stretch run?' });

    d.model.goals[0].blockWeeks = 10;
    expect(goalCardFor(d, [], TODAY)).toBeNull();
  });

  it('asks a goal with an end date for the end date, and leaves a goal with a deadline to Claude after its start date', () => {
    const finite = draftWith(goal('g1', 'Reading', { shape: 'finite', startDate: TODAY }));
    expect(goalCardFor(finite, [], TODAY)).toMatchObject({ topic: 'end_date', kind: 'question', question: 'Which day should it run until?' });
    const project = draftWith(goal('g1', 'Taxes', { shape: 'project', startDate: TODAY }));
    expect(goalCardFor(project, [], TODAY)).toBeNull();
  });

  it('goes one goal after another, names the goal when there are several, and asks a goal set aside only its shape and start date', () => {
    const d = draftWith(goal('g1', 'Lift weights', { shape: 'ongoing', startDate: TODAY, blockWeeks: 10 }), goal('g2', 'Cook at home', { state: 'parked' }));
    expect(goalCardFor(d, [], TODAY)?.question).toBe('Does "Cook at home" keep going, end on a date, or have a deadline?');
    d.model.goals[1].shape = 'ongoing';
    expect(goalCardFor(d, [], TODAY)?.question).toBe(`Start "Cook at home" today, Wednesday, Nov 4?`);
    d.model.goals[1].startDate = TODAY;
    expect(goalCardFor(d, [], TODAY)).toBeNull();
  });

  it('skips what the draft already holds: a typed answer that held the shape and the start shows neither card', () => {
    const d = draftWith(goal('g1', 'Running', { shape: 'ongoing', startDate: TODAY }));
    expect(goalCardFor(d, [], TODAY)?.topic).toBe('block_length');
  });

  it('suggests no start date without a today', () => {
    expect(goalCardFor(draftWith(goal('g1', 'Running', { shape: 'ongoing' })), [], null)).toBeNull();
  });

  it('counts a plain length said earlier from the start date: "90 days" is a proposal of the end date, a first stretch of whole weeks for a goal that keeps going', () => {
    const finite = draftWith(goal('g1', 'Reading', { shape: 'finite', startDate: TODAY }));
    const card = onCardAfter(finite, ['I want to finish the book in 90 days.']).transcript.at(-1);
    expect(card?.role === 'assistant' && card.turn).toMatchObject({ topic: 'end_date', kind: 'proposal', question: 'End Tuesday, Feb 2, 2027?' });
    const ongoing = draftWith(goal('g1', 'Reading', { shape: 'ongoing', startDate: TODAY }));
    const stretch = onCardAfter(ongoing, ['Twelve weeks.']).transcript.at(-1);
    expect(stretch?.role === 'assistant' && stretch.turn).toMatchObject({ topic: 'block_length', kind: 'proposal' });
    expect(stretch?.role === 'assistant' && stretch.turn.question).toContain('A first stretch of 12 weeks');
  });
});

describe('a tap is the person\'s own answer', () => {
  it('the shape: the person\'s sentence, the shape in the draft, a said entry, and the next card with no call', () => {
    const session = onCard(draftWith(goal('g1', 'Running')));
    const next = answerShape(session, SHAPE_CHOICES[0].say, TODAY);
    expect(next?.transcript.at(-2)).toEqual({ role: 'person', text: 'It keeps going.' });
    expect(next?.draft.model.goals[0].shape).toBe('ongoing');
    expect(next?.draft.said).toContainEqual({ path: 'goals.g1.shape', turn: 1, how: 'said' });
    // The start date card is already on screen; Claude is not asked.
    const card = next?.transcript.at(-1);
    expect(card?.role === 'assistant' && card.turn.topic).toBe('start_date');
    expect(next && awaitsClaude(next)).toBe(false);
  });

  it('the starting point is a card with no said entry and no saved value; the tap goes into the conversation and nothing else changes', () => {
    const d = draftWith(goal('g1', 'Running'));
    const card: AssistantTurn = codeTurn(d, { kind: 'question', chunk: null, topic: 'starting_point', question: 'Where are you with this today?', detail: `${GOAL_CARD_MARK} Your plan starts from there.` });
    const session: SetupSession = { transcript: [{ role: 'assistant', turn: card }], draft: card.draft, spentTokens: 0 };
    const next = answerStartingPoint(session, STARTING_POINTS[1].say);
    expect(next?.transcript[1]).toEqual({ role: 'person', text: 'Dabbled a little.' });
    expect(next?.draft.said).toEqual([]);
    expect(next?.draft.model).toEqual(session.draft.model);
  });

  it('the start date: Yes is accepted, a picked day is said, and words that are not a tap are not taken', () => {
    const d = draftWith(goal('g1', 'Running', { shape: 'ongoing' }));
    const yes = answerStartDate(onCard(d), PROPOSAL_YES_TEXT, TODAY);
    expect(yes?.draft.model.goals[0].startDate).toBe(TODAY);
    expect(yes?.draft.said).toContainEqual({ path: 'goals.g1.startDate', turn: 1, how: 'accepted' });
    const picked = answerStartDate(onCard(d), pickedDateText('2026-11-12'), TODAY);
    expect(picked?.draft.model.goals[0].startDate).toBe('2026-11-12');
    expect(picked?.draft.said).toContainEqual({ path: 'goals.g1.startDate', turn: 1, how: 'said' });
    expect(answerStartDate(onCard(d), 'Monday', TODAY)).toBeNull();
    expect(answerStartDate(onCard(d), 'sometime next month', TODAY)).toBeNull();
  });

  it('the first stretch: 4, 8 or 12 weeks, nothing pre-selected; a number that is not a choice is not taken', () => {
    const d = draftWith(goal('g1', 'Running', { shape: 'ongoing', startDate: TODAY }));
    expect(BLOCK_CHOICES.map((c) => c.label)).toEqual(['4 weeks', '8 weeks', '12 weeks']);
    const next = answerBlockLength(onCard(d), BLOCK_CHOICES[1].say, TODAY);
    expect(next?.draft.model.goals[0].blockWeeks).toBe(8);
    expect(next?.draft.said).toContainEqual({ path: 'goals.g1.blockWeeks', turn: 1, how: 'said' });
    expect(answerBlockLength(onCard(d), '7 weeks.', TODAY)).toBeNull();
  });

  it('a card answers only while it is the newest turn, and only its own topic', () => {
    const d = draftWith(goal('g1', 'Running'));
    const session = onCard(d);
    expect(answerBlockLength(session, '4 weeks.', TODAY)).toBeNull();
    expect(answerGoalCard({ ...session, transcript: [...session.transcript, { role: 'person', text: 'hi' }] }, 'It keeps going.', TODAY)).toBeNull();
  });
});

describe('an end date on or before the start date', () => {
  const finite = () => draftWith(goal('g1', 'Reading', { shape: 'finite', startDate: TODAY }));

  it('is refused by the card with one plain line, the same question again, and nothing changed', () => {
    const session = onCard(finite());
    for (const iso of [TODAY, '2026-11-01']) {
      const next = answerEndDate(session, pickedDateText(iso), TODAY);
      expect(next?.draft).toEqual(session.draft);
      const again = next?.transcript.at(-1);
      expect(again?.role === 'assistant' && again.turn).toMatchObject({ topic: 'end_date', kind: 'question', say: AFTER_START_LINE, question: 'Which day should it run until?' });
      expect(next && awaitsClaude(next)).toBe(false);
    }
    expect(AFTER_START_LINE).toBe('Pick a day after your start date.');
  });

  it('takes a later day, said, and then hands over to Claude', () => {
    const next = answerEndDate(onCard(finite()), pickedDateText('2026-12-20'), TODAY);
    expect(next?.draft.model.goals[0].endDate).toBe('2026-12-20');
    expect(next?.draft.said).toContainEqual({ path: 'goals.g1.endDate', turn: 1, how: 'said' });
    expect(next && awaitsClaude(next)).toBe(true);
  });

  it('is refused by code for a deadline too, in the date step, with no call to Claude', () => {
    const d = draftWith(goal('g1', 'Taxes', { shape: 'project', startDate: TODAY }));
    const ask = codeTurn(d, { kind: 'question', chunk: null, topic: 'deadline_date', question: 'Which day does it have to be done by?', detail: null });
    for (const text of [pickedDateText(TODAY), 'today', 'yesterday', 'Nov 4']) {
      const step = dateStep([{ role: 'assistant', turn: ask }, { role: 'person', text }], d, TODAY);
      expect(step?.kind, text).toBe('turn');
      if (step?.kind === 'turn') {
        expect(step.turn).toMatchObject({ topic: 'deadline_date', kind: 'question', say: AFTER_START_LINE });
        expect(step.turn.draft).toEqual(d);
        // One short sentence, as a lead-in must be, so the service shows it instead of asking Claude (lib/services/setup.ts).
        expect(checkTurn(step.turn, { transcript: [{ role: 'assistant', turn: ask }, { role: 'person', text }], prevDraft: d }).filter((v) => v.rule === 'plain_words'), text).toEqual([]);
      }
    }
    // A later day is not refused: it goes to Claude as always (no code turn, no hint needed for a written date).
    expect(dateStep([{ role: 'assistant', turn: ask }, { role: 'person', text: pickedDateText('2027-01-15') }], d, TODAY)).toBeNull();
  });

  it('is refused for an end date typed on the Claude-written question as well', () => {
    const d = finite();
    const ask = codeTurn(d, { kind: 'question', chunk: null, topic: 'end_date', question: 'Which day should it run until?', detail: null });
    const step = dateStep([{ role: 'assistant', turn: ask }, { role: 'person', text: 'Nov 3, 2026' }], d, TODAY);
    expect(step?.kind).toBe('turn');
    // A day with no year that has already gone by this year is next year's, which is after the start.
    expect(dateStep([{ role: 'assistant', turn: ask }, { role: 'person', text: 'Nov 3' }], d, TODAY)).toBeNull();
  });
});

describe('a deadline date worked out from a plain length', () => {
  const project = () => draftWith(goal('g1', 'Taxes', { shape: 'project', startDate: TODAY }));
  const said = (text: string): Transcript => [{ role: 'assistant', turn: codeTurn(project(), { kind: 'question', chunk: null, topic: 'idea', question: 'What?', detail: null }) }, { role: 'person', text }];

  it('counts the start day as day 0: 90 days from Wednesday, Nov 4 is Tuesday, Feb 2, 2027', () => {
    const d = plainDurationIn('I want it done in 90 days');
    expect(d).toMatchObject({ amount: 90, unit: 'day' });
    expect(durationEnd(TODAY, d!)).toBe('2027-02-02');
    expect(suggestedDate('deadline_date', said('Done in 90 days'), project(), TODAY)).toBe('2027-02-02');
  });

  it('counts calendar months, clamped to the last day of the month, and a year as 12 months', () => {
    const month = (n: number) => durationEnd('2027-01-31', { phrase: '', amount: n, unit: 'month' });
    expect(month(1)).toBe('2027-02-28');
    expect(month(3)).toBe('2027-04-30');
    expect(durationEnd('2028-01-31', { phrase: '', amount: 1, unit: 'month' })).toBe('2028-02-29');
    expect(durationEnd(TODAY, { phrase: '', amount: 1, unit: 'year' })).toBe(durationEnd(TODAY, { phrase: '', amount: 12, unit: 'month' }));
    expect(suggestedDate('deadline_date', said('3 months'), project(), TODAY)).toBe('2027-02-04');
    expect(suggestedDate('deadline_date', said('12 weeks'), project(), TODAY)).toBe('2027-01-27');
  });

  it('the date card asks "Done by <date>?" with Yes and a different date, in place of the question Claude wrote', () => {
    const d = project();
    const asked = codeTurn(d, { kind: 'question', chunk: null, topic: 'deadline_date', question: 'Which day does it have to be done by?', detail: 'We plan back from that day.' });
    const shown = normalizeDateTurn(asked, said('In 90 days'), d, TODAY);
    expect(shown).toMatchObject({ kind: 'proposal', question: 'Done by Tuesday, Feb 2, 2027?' });
  });

  it('reads only a plain number and unit: a guess, a range, two different lengths or a past length go to Claude', () => {
    for (const text of ['about 90 days', 'around 12 weeks', '8 to 12 weeks', 'a couple of weeks', 'a few months', 'at least 3 months']) {
      expect(plainLengthSaid(said(text)), text).toBeNull();
      expect(suggestedDate('deadline_date', said(text), project(), TODAY), text).toBeNull();
    }
    expect(plainLengthSaid([...said('90 days'), { role: 'assistant', turn: said('x')[0].role === 'assistant' ? (said('x')[0] as { turn: AssistantTurn }).turn : (null as never) }, { role: 'person', text: '12 weeks' }])).toBeNull();
    expect(plainLengthSaid(said('3 times a week'))).toBeNull();
    for (const text of ['90 days', 'three months', '12 weeks', 'in 2 months', 'a month']) expect(plainLengthSaid(said(text)), text).not.toBeNull();
  });

  it('never suggests a day on or before the start date', () => {
    const d = project();
    const asked = codeTurn(d, { kind: 'question', chunk: null, topic: 'idea', question: 'What?', detail: null });
    expect(suggestedDate('deadline_date', [{ role: 'assistant', turn: asked }, { role: 'person', text: 'by Nov 1, 2026' }], d, TODAY)).toBeNull();
  });
});

describe('a "few ways to read your answer" card is never the card for a date', () => {
  it('becomes the date question, or code\'s suggestion', () => {
    const d = draftWith(goal('g1', 'Taxes', { shape: 'project', startDate: TODAY }));
    const odd: AssistantTurn = {
      ...codeTurn(d, { kind: 'interpretations', chunk: null, topic: 'deadline_date', question: 'Which did you mean?', detail: null, options: ['Today, Wednesday, Nov 4', 'Wednesday, Nov 11'] }),
      say: 'I read that two ways.',
    };
    const plain = normalizeDateTurn(odd, [], d, TODAY);
    expect(plain.kind).toBe('question');
    expect(plain.options).toEqual([]);
    expect(plain.say).toBe('');
    const opener = codeTurn(d, { kind: 'question', chunk: null, topic: 'idea', question: 'What?', detail: null });
    const withLength = normalizeDateTurn(odd, [{ role: 'assistant', turn: opener }, { role: 'person', text: '90 days' }, { role: 'assistant', turn: opener }], d, TODAY);
    expect(withLength).toMatchObject({ kind: 'proposal', question: 'Done by Tuesday, Feb 2, 2027?' });
  });
});

describe('the hand-off from Claude\'s question to a card', () => {
  const asked = (topic: AssistantTurn['topic'], d: SetupDraft, kind: AssistantTurn['kind'] = 'question'): AssistantTurn =>
    codeTurn(d, { kind, chunk: null, topic, question: 'A question?', detail: null, options: [] });
  const typed = (turn: AssistantTurn, text: string): Transcript => [{ role: 'assistant', turn: asked('priorities', turn.draft) }, { role: 'person', text }];

  it('puts the first card a goal still needs in place of Claude\'s question on a card topic', () => {
    const d = draftWith(goal('g1', 'Running'));
    const turn = asked('shape', d);
    expect(goalCardInPlaceOf(turn, typed(turn, 'Family time'), TODAY)).toMatchObject({ topic: 'shape' });
    const start = asked('starting_point', d);
    expect(goalCardInPlaceOf(start, typed(start, 'Family time'), TODAY)).toMatchObject({ topic: 'starting_point', question: 'Where are you with this today?' });
  });

  it('keeps Claude\'s own turn when the person asked what it means, when it asks the same topic again, or when it is not a plain question', () => {
    const d = draftWith(goal('g1', 'Running'));
    const turn = asked('shape', d);
    expect(goalCardInPlaceOf(turn, typed(turn, 'What do you mean?'), TODAY)).toBeNull();
    const before = asked('shape', d);
    expect(goalCardInPlaceOf(turn, [{ role: 'assistant', turn: before }, { role: 'person', text: 'hmm' }], TODAY)).toBeNull();
    expect(goalCardInPlaceOf(asked('shape', d, 'interpretations'), typed(turn, 'x'), TODAY)).toBeNull();
    expect(goalCardInPlaceOf(asked('end_date', d, 'proposal'), typed(turn, 'x'), TODAY)).toBeNull();
    expect(goalCardInPlaceOf(asked('floor', d), typed(turn, 'x'), TODAY)).toBeNull();
  });

  it('leaves Claude\'s question when no goal needs a card: a typed answer that held the shape and the start shows neither', () => {
    const d = draftWith(goal('g1', 'Running', { shape: 'project', startDate: TODAY }));
    const turn = asked('shape', d);
    expect(goalCardInPlaceOf(turn, typed(turn, 'It has a deadline, starting today'), TODAY)).toBeNull();
  });
});
