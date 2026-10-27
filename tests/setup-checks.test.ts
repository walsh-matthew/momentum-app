// The eight hard-rule checks one at a time, on turns written by hand (MOM-111): what each lets through and what it
// stops, including the edges the eval cases do not reach. Plus the word and number readers the checks stand on.

import { describe, expect, it } from 'vitest';
import {
  checkAssumeNothing,
  checkChoiceBeforeExamples,
  checkChunkedPlayback,
  checkNoAnnouncedReminder,
  checkNoMath,
  checkNumberedInterpretations,
  checkOneQuestion,
  checkSkipAnswered,
  checkTurn,
  type TurnContext,
} from '@/lib/setup/checks';
import { emptyDraft } from '@/lib/setup/draft';
import {
  acceptsText,
  dateIsIn,
  datesIn,
  dayTimeWords,
  numbersIn,
  sentencesOf,
  timesIn,
  wantsIdeas,
  weekdaysIn,
} from '@/lib/setup/text';
import type { AssistantTurn, SetupDraft, Transcript } from '@/types/setup';

function turn(over: Partial<AssistantTurn> = {}): AssistantTurn {
  return { kind: 'question', chunk: null, skipped: null, say: '', question: 'What would you like to work on?', topic: 'idea', options: [], draft: emptyDraft(), ...over };
}
const asked = (over: Partial<AssistantTurn> = {}): Transcript[number] => ({ role: 'assistant', turn: turn(over) });
const said = (text: string): Transcript[number] => ({ role: 'person', text });
function ctx(transcript: Transcript = [], over: Partial<TurnContext> = {}): TurnContext {
  return { transcript, prevDraft: emptyDraft(), ...over };
}
const rules = (v: { rule: string }[]) => v.map((x) => x.rule);

describe('reading what a person typed', () => {
  it('reads numbers as digits and as words', () => {
    // Digits first, then number words.
    expect(numbersIn('three runs, 2.5 hours and 1,200 steps')).toEqual([2.5, 1200, 3]);
    expect(numbersIn('one first', { skipOne: true })).toEqual([]);
    expect(numbersIn('one first')).toEqual([1]);
    expect(numbersIn('three', { words: false })).toEqual([]);
  });

  it('reads dates in the ways people write them, and not a bare month', () => {
    expect(datesIn('June 14, 2027')).toEqual([{ month: 6, day: 14, year: 2027 }]);
    expect(datesIn('the 5th of June')).toEqual([{ month: 6, day: 5, year: null }]);
    expect(datesIn('2027-06-05')).toEqual([{ month: 6, day: 5, year: 2027 }]);
    expect(datesIn('6/5')).toEqual([{ month: 6, day: 5, year: null }]);
    expect(datesIn('sometime in June')).toEqual([]);
    expect(dateIsIn('2027-06-05', datesIn('June 5'))).toBe(true);
    expect(dateIsIn('2027-06-05', datesIn('June 5, 2026'))).toBe(false);
    expect(dateIsIn('2027-06-06', datesIn('June 5'))).toBe(false);
  });

  it('reads clock times as minutes after midnight', () => {
    expect(timesIn('9pm')).toEqual([1260]);
    expect(timesIn('2 in the morning')).toEqual([120]);
    expect(timesIn('9 at night')).toEqual([1260]);
    expect(timesIn('21:00')).toEqual([1260]);
    expect(timesIn('midnight')).toEqual([0]);
    expect(timesIn('12 am')).toEqual([0]);
    expect(timesIn('no time here')).toEqual([]);
  });

  it('reads weekdays, Monday first', () => {
    expect(weekdaysIn('Mondays and Friday, maybe sunday')).toEqual([1, 5, 7]);
    expect(weekdaysIn('weekends')).toEqual([]);
  });

  it('finds day and time words, with clock times made comparable', () => {
    expect(dayTimeWords('In the evenings, or at 9pm')).toEqual(['evening', 'time:1260']);
    expect(dayTimeWords('every day, daily, each day')).toEqual(['every day', 'daily', 'every day']);
    expect(dayTimeWords('after midnight')).toEqual(['midnight']);
    expect(dayTimeWords('no day words here')).toEqual([]);
  });

  it('splits sentences and reads yes, no and asking for ideas', () => {
    expect(sentencesOf('One. Two! Three?')).toHaveLength(3);
    expect(acceptsText('Yes, that works')).toBe(true);
    expect(acceptsText('No, change it')).toBe(false);
    expect(acceptsText('The second one')).toBe(true);
    expect(wantsIdeas('Some ideas please')).toBe(true);
    expect(wantsIdeas('I have my own answer')).toBe(false);
  });
});

describe('rule 1: one question per turn', () => {
  it('lets a single question through, including a choice inside it', () => {
    expect(checkOneQuestion(turn())).toEqual([]);
    expect(checkOneQuestion(turn({ question: 'Do you want to take them together, or one first?' }))).toEqual([]);
    expect(checkOneQuestion(turn({ question: 'Is this ongoing, does it have an end date, or is it a deadline?' }))).toEqual([]);
  });

  it('stops two asks joined together, and a second question anywhere', () => {
    expect(checkOneQuestion(turn({ question: 'How long and how often?' }))).toHaveLength(1);
    expect(checkOneQuestion(turn({ question: 'How long will you run? Where will you go?' })).length).toBeGreaterThan(0);
    expect(checkOneQuestion(turn({ say: 'Does that make sense?' })).length).toBeGreaterThan(0);
    expect(checkOneQuestion(turn({ question: 'What is the goal. Also, why does it matter?' })).length).toBeGreaterThan(0);
    expect(checkOneQuestion(turn({ question: null }))).toHaveLength(1);
  });

  it('allows options only on an ideas or interpretations turn', () => {
    expect(checkOneQuestion(turn({ options: ['a'] })).length).toBeGreaterThan(0);
    expect(checkOneQuestion(turn({ kind: 'ideas', options: ['a', 'b'], question: 'Which one?' }))).toEqual([]);
  });

  it('asks nothing of a playback or final turn, where code speaks', () => {
    expect(checkOneQuestion(turn({ kind: 'playback', chunk: 'goals', question: null }))).toEqual([]);
  });
});

describe('rule 2: never assume anything about the person\'s life', () => {
  it('stops a day or time word the person never said', () => {
    const c = ctx([said('I want to run more.')]);
    expect(rules(checkAssumeNothing(turn({ question: 'Would you like to run on weekends?' }), c))).toEqual(['assume_nothing']);
    expect(rules(checkAssumeNothing(turn({ question: 'Is 6pm good?' }), c))).toEqual(['assume_nothing']);
  });

  it('lets a word through once the person has said it', () => {
    const c = ctx([said('Mostly on Saturday mornings.')]);
    expect(checkAssumeNothing(turn({ question: 'Is Saturday morning a day for this?' }), c)).toEqual([]);
  });

  it('allows only the two boundary words in the day-end question, and no example clock time', () => {
    const c = ctx([said('Central time.')]);
    const dayEnd = (say: string) => turn({ topic: 'day_end', say, question: 'When does your day end?' });
    expect(checkAssumeNothing(dayEnd('After midnight and before 6 in the morning is an early day end.'), c)).toEqual([]);
    expect(rules(checkAssumeNothing(dayEnd('Say 2 in the morning, or 9pm.'), c)).length).toBeGreaterThan(0);
    expect(rules(checkAssumeNothing(dayEnd('An evening check-in is fine.'), c)).length).toBeGreaterThan(0);
    // The same words are not allowed in any other question.
    expect(rules(checkAssumeNothing(turn({ topic: 'tone', say: 'After midnight is quiet.' }), c))).toEqual(['assume_nothing']);
  });

  it('stops a changed value that does not rest on the newest answer', () => {
    const prev: SetupDraft = emptyDraft();
    prev.model.person.weekStart = 1;
    prev.said.push({ path: 'person.weekStart', turn: 1, how: 'said' });
    const next = structuredClone(prev);
    next.model.person.weekStart = 3;
    // Claude changed it, but its source still points at the older message.
    const transcript: Transcript = [asked(), said('Monday.'), asked(), said('Ok, and the plan?')];
    const bad = checkAssumeNothing(turn({ draft: next }), { transcript, prevDraft: prev });
    expect(bad.map((v) => v.message).join(' ')).toMatch(/changed without the person's newest answer/);
    next.said = [{ path: 'person.weekStart', turn: 3, how: 'said' }];
    expect(checkAssumeNothing(turn({ draft: next }), { transcript, prevDraft: prev }).filter((v) => /changed without/.test(v.message))).toEqual([]);
  });
});

describe('rule 3: never announce a reminder', () => {
  it('stops saying there will be one', () => {
    for (const say of [
      "I'll remind you on those days.",
      'You will get a reminder before each session.',
      'Reminders will be on for your plan.',
      "I've set a nudge for Friday.",
      'We will check in with you each week.',
    ]) {
      expect(rules(checkNoAnnouncedReminder(turn({ say })))).toEqual(['no_announced_reminder']);
    }
  });

  it('lets Claude ask whether they want one', () => {
    for (const question of ['Would you like reminders on the days you plan?', 'Do you want a check-in at the end of each week?']) {
      expect(checkNoAnnouncedReminder(turn({ question }))).toEqual([]);
    }
  });
});

describe('rule 4: offer the choice before examples', () => {
  const offer = turn({ kind: 'offer_ideas', topic: 'floor', question: 'Do you have a number in mind, or would some starting ideas help?' });
  const ideas = turn({ kind: 'ideas', topic: 'floor', options: ['2 a week', '3 a week'], question: 'Which of these would you like?' });

  it('lets ideas follow an offer the person said yes to', () => {
    expect(checkChoiceBeforeExamples(ideas, ctx([asked({ kind: 'offer_ideas', topic: 'floor' }), said('Some ideas please')]))).toEqual([]);
  });

  it('stops ideas with no offer, and ideas the person did not ask for', () => {
    expect(checkChoiceBeforeExamples(ideas, ctx([asked(), said('Some ideas please')]))).toHaveLength(1);
    expect(checkChoiceBeforeExamples(ideas, ctx([asked({ kind: 'offer_ideas', topic: 'floor' }), said('I have my own answer')]))).toHaveLength(1);
  });

  it('needs an offer that gives the choice and holds no examples', () => {
    expect(checkChoiceBeforeExamples(offer, ctx())).toEqual([]);
    expect(checkChoiceBeforeExamples(turn({ kind: 'offer_ideas', question: 'Would some ideas help?' }), ctx())).toHaveLength(1);
    expect(checkChoiceBeforeExamples({ ...offer, say: 'For example, 3 a week.' }, ctx()).length).toBeGreaterThan(0);
  });

  it('stops an example slipped into an ordinary question', () => {
    expect(checkChoiceBeforeExamples(turn({ question: 'What counts, such as sessions or miles?' }), ctx())).toHaveLength(1);
  });
});

describe('rule 5: skip what is already answered', () => {
  const answered: SetupDraft = (() => {
    const d = emptyDraft();
    d.model.person.timeZone = 'America/Chicago';
    return d;
  })();

  it('stops asking a person fact that is already in the draft or was already asked', () => {
    expect(rules(checkSkipAnswered(turn({ topic: 'time_zone', question: 'Which time zone are you in?' }), ctx([], { prevDraft: answered })))).toEqual(['skip_answered']);
    const history: Transcript = [asked({ topic: 'tone', question: 'How direct?' }), said('Gentle.')];
    expect(rules(checkSkipAnswered(turn({ topic: 'tone', question: 'How direct would you like me to be?' }), ctx(history)))).toEqual(['skip_answered']);
  });

  it('asks a goal\'s own questions again for the next goal', () => {
    const history: Transcript = [asked({ topic: 'shape', question: 'Ongoing?' }), said('Yes.')];
    expect(checkSkipAnswered(turn({ topic: 'shape', question: 'Is cooking ongoing?' }), ctx(history))).toEqual([]);
  });

  it('allows a clarifying turn on the topic just asked', () => {
    const history: Transcript = [asked({ topic: 'tone', question: 'How direct?' }), said('Whatever')];
    expect(checkSkipAnswered(turn({ kind: 'interpretations', topic: 'tone', options: ['a', 'b'], question: 'Which one?' }), ctx(history))).toEqual([]);
  });

  it('wants the skip notice to be one short line about something answered', () => {
    const c = ctx([], { prevDraft: answered });
    expect(checkSkipAnswered(turn({ topic: 'day_end', skipped: { topic: 'time_zone', line: 'You told me where you are, so I will skip that.' } }), c)).toEqual([]);
    expect(checkSkipAnswered(turn({ topic: 'day_end', skipped: { topic: 'time_zone', line: 'You told me. So I will skip that.' } }), c)).toHaveLength(1);
    expect(checkSkipAnswered(turn({ topic: 'day_end', skipped: { topic: 'tone', line: 'Skipping that.' } }), c)).toHaveLength(1);
  });
});

describe('rule 6: numbered interpretations', () => {
  const interpretations = turn({ kind: 'interpretations', options: ['One reading', 'Another reading'], question: 'Which of these is closest?' });

  it('wants interpretations, with the draft untouched, after an answer that did not fit', () => {
    const c = ctx([asked(), said('Hmm')], { personFits: false });
    expect(checkNumberedInterpretations(interpretations, c)).toEqual([]);
    expect(rules(checkNumberedInterpretations(turn(), c))).toEqual(['numbered_interpretations']);
    const changed = structuredClone(interpretations);
    changed.draft.model.person.weekStart = 2;
    expect(checkNumberedInterpretations(changed, c)).toHaveLength(1);
  });

  it('wants two to four options whenever it offers interpretations', () => {
    expect(checkNumberedInterpretations(turn({ ...interpretations, options: ['Only one'] }), ctx())).toHaveLength(1);
    expect(checkNumberedInterpretations(turn({ ...interpretations, options: ['a', 'b', 'c', 'd', 'e'] }), ctx())).toHaveLength(1);
  });

  it('does not require them when the answer fit', () => {
    expect(checkNumberedInterpretations(turn(), ctx([asked(), said('Fine')], { personFits: true }))).toEqual([]);
  });
});

describe('rule 7: play back in short chunks; the latest answer wins', () => {
  const playback = (draft: SetupDraft = emptyDraft()) => turn({ kind: 'playback', chunk: 'goals', question: null, topic: null, draft });

  it('has Claude write none of a playback, which code renders from the draft', () => {
    expect(checkChunkedPlayback(playback(), ctx())).toEqual([]);
    expect(rules(checkChunkedPlayback({ ...playback(), say: 'Here is everything.' }, ctx()))).toEqual(['chunked_playback']);
    expect(checkChunkedPlayback(turn({ kind: 'playback', chunk: null, question: null }), ctx()).length).toBeGreaterThan(0);
    expect(checkChunkedPlayback(turn({ chunk: 'goals' }), ctx()).length).toBeGreaterThan(0);
  });

  it('approves a part only after it was played back and the person said yes', () => {
    const approved = emptyDraft();
    approved.approved = ['goals'];
    const history: Transcript = [asked({ kind: 'playback', chunk: 'goals', question: null }), said('Yes, that is right.')];
    expect(checkChunkedPlayback(turn({ draft: approved }), ctx(history))).toEqual([]);
    expect(checkChunkedPlayback(turn({ draft: approved }), ctx([asked(), said('Yes')]))).toHaveLength(1);
    expect(checkChunkedPlayback(turn({ draft: approved }), ctx([history[0], said('Actually, change it')]))).toHaveLength(1);
  });

  it('wants a part played back again when it changes after approval', () => {
    const before = emptyDraft();
    before.approved = ['goals'];
    before.model.goals.push({
      key: 'g1', title: 'Run', why: null, startDate: null, shape: null, endDate: null, blockWeeks: null, state: 'active',
      returnWhen: null, completionMode: null, tone: null, targets: [], items: [],
    });
    const after = structuredClone(before);
    after.model.goals[0].title = 'Run more';
    expect(checkChunkedPlayback(turn({ draft: after }), ctx([asked(), said('Actually, make it Run more')], { prevDraft: before }))).toHaveLength(1);
    after.approved = [];
    expect(checkChunkedPlayback(turn({ draft: after }), ctx([asked(), said('Actually, make it Run more')], { prevDraft: before }))).toEqual([]);
  });

  it('allows the final confirmation only when all four parts are approved, and changes nothing', () => {
    const all = emptyDraft();
    all.approved = ['goals', 'targets', 'planning', 'talk'];
    const final = turn({ kind: 'final', question: null, topic: null, draft: all });
    expect(checkChunkedPlayback(final, ctx([asked(), said('Yes')], { prevDraft: all }))).toEqual([]);
    const early = turn({ kind: 'final', question: null, topic: null, draft: emptyDraft() });
    expect(checkChunkedPlayback(early, ctx()).length).toBe(4);
  });
});

describe('rule 8: no math, no score', () => {
  const c = ctx([said('I can do two a week.')]);

  it('lets Claude repeat a number the person said, in digits or words', () => {
    expect(checkNoMath(turn({ say: 'Two a week, noted.' }), c)).toEqual([]);
    expect(checkNoMath(turn({ say: 'You said 2 a week.' }), c)).toEqual([]);
  });

  it('stops a number the person did not say, arithmetic, and a score', () => {
    expect(rules(checkNoMath(turn({ say: 'That is 8 a month.' }), c))).toEqual(['no_math']);
    expect(rules(checkNoMath(turn({ say: 'So 2 + 2 is 4.' }), c)).length).toBeGreaterThan(0);
    expect(rules(checkNoMath(turn({ say: 'That is 80% of your goal.' }), c)).length).toBeGreaterThan(0);
    expect(rules(checkNoMath(turn({ say: 'Your score is good.' }), c)).length).toBeGreaterThan(0);
  });

  it('does not count the word "one" as a number', () => {
    expect(checkNoMath(turn({ question: 'Do you want to take them together, or one first?' }), ctx())).toEqual([]);
  });

  it('lets starting ideas, candidate readings and a visible proposal carry numbers, and nothing else', () => {
    expect(checkNoMath(turn({ kind: 'ideas', options: ['3 a week'], say: 'Some starting points.' }), ctx())).toEqual([]);
    expect(checkNoMath(turn({ kind: 'ideas', options: ['3 a week'], say: 'Most people do 5 a week.' }), ctx())).toHaveLength(1);
    expect(checkNoMath(turn({ kind: 'interpretations', options: ['3 a week', '4 a week'], question: 'Which?' }), ctx())).toEqual([]);
    expect(checkNoMath(turn({ kind: 'proposal', say: 'I would start today, 2026-10-27.', question: 'Right?' }), ctx())).toEqual([]);
  });

  it('reads the day-end boundary words as words, not as numbers Claude made up', () => {
    const dayEnd = turn({ topic: 'day_end', say: 'Before 6 in the morning is an early day end.', question: 'When does your day end?' });
    expect(checkNoMath(dayEnd, ctx())).toEqual([]);
    expect(checkNoMath({ ...dayEnd, say: 'Before 5 in the morning is early.' }, ctx())).toHaveLength(1);
  });
});

describe('the whole turn', () => {
  it('runs the draft check as well: a value with no source is a violation', () => {
    const d = emptyDraft();
    d.model.person.dayEnd = '21:00';
    const violations = checkTurn(turn({ draft: d }), ctx());
    expect(rules(violations)).toContain('draft');
  });

  it('finds nothing wrong with an ordinary good turn', () => {
    expect(checkTurn(turn(), ctx())).toEqual([]);
  });
});
