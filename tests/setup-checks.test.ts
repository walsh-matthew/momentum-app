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
import { SETUP_STEPS } from '@/lib/setup/steps';
import {
  acceptsText,
  asksMeaning,
  dateIsIn,
  datesIn,
  dayTimeWords,
  declinesChange,
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

  it('stops ideas the person did not ask for, with or without an offer', () => {
    expect(checkChoiceBeforeExamples(ideas, ctx([asked(), said('Three a week')]))).toHaveLength(1);
    // A plain yes means ideas only as the answer to the offer.
    expect(checkChoiceBeforeExamples(ideas, ctx([asked(), said('Yes')]))).toHaveLength(1);
    expect(checkChoiceBeforeExamples(ideas, ctx([asked({ kind: 'offer_ideas', topic: 'floor' }), said('I have my own answer')]))).toHaveLength(1);
  });

  it('needs an offer that gives the choice and holds no examples', () => {
    expect(checkChoiceBeforeExamples(offer, ctx())).toEqual([]);
    expect(checkChoiceBeforeExamples(turn({ kind: 'offer_ideas', question: 'Would some ideas help?' }), ctx())).toHaveLength(1);
    expect(checkChoiceBeforeExamples({ ...offer, say: 'For example, 3 a week.' }, ctx()).length).toBeGreaterThan(0);
  });

  it('stops examples in a question about the goal itself or a number, where an example plants the answer', () => {
    expect(checkChoiceBeforeExamples(turn({ topic: 'idea', question: 'What would you like to work on, for example running or reading?' }), ctx())).toHaveLength(1);
    expect(checkChoiceBeforeExamples(turn({ topic: 'floor', question: 'What is the least, such as a few sessions?' }), ctx())).toHaveLength(1);
    expect(checkChoiceBeforeExamples(turn({ topic: 'aspiration', say: 'For example, a little more than the least.', question: 'What are you hoping for?' }), ctx())).toHaveLength(1);
  });

  // MOM-111: rule 4 narrowed. A few short examples inside any other question are fine; they are what made the tabletops clear.
  it.each(['priorities', 'starting_point', 'breakup', 'target', 'role', 'day_types', 'expansion', 'tone'] as const)(
    'lets a few short examples through in a "%s" question',
    (topic) => {
      expect(checkChoiceBeforeExamples(turn({ topic, question: 'What else matters to you, for example family time or your health?' }), ctx())).toEqual([]);
    },
  );

  it('lets any question be explained with examples once the person asks what it means, on its own topic only', () => {
    const history: Transcript = [asked({ topic: 'floor', question: 'What is the least you would count as still on track?' }), said('What do you mean?')];
    const explained = turn({ topic: 'floor', say: 'I mean the smallest amount that still feels like progress, for example a short session.', question: 'What is the least that would still feel like progress?' });
    expect(checkChoiceBeforeExamples(explained, ctx(history))).toEqual([]);
    // Not after an ordinary answer: "I don't know" gets the offer of ideas, not a list slipped into the question.
    expect(checkChoiceBeforeExamples(explained, ctx([history[0], said("I'm not really certain")]))).toHaveLength(1);
    // Not on another topic.
    expect(checkChoiceBeforeExamples({ ...explained, topic: 'aspiration' }, ctx(history))).toHaveLength(1);
  });

  it('still needs the offer before a list of ideas, whatever the topic', () => {
    expect(checkChoiceBeforeExamples(turn({ kind: 'ideas', topic: 'priorities', options: ['Family', 'Sleep'], question: 'Which of these?' }), ctx([asked(), said('Family')]))).toHaveLength(1);
  });

  it('still applies rule 2 to an example: no day or time the person did not say', () => {
    const t = turn({ topic: 'priorities', question: 'What else matters to you, like your weekends or your evenings?' });
    expect(checkChoiceBeforeExamples(t, ctx())).toEqual([]);
    expect(rules(checkAssumeNothing(t, ctx([said('Running.')])))).toEqual(['assume_nothing', 'assume_nothing']);
  });
});

describe('the person asking what a question means', () => {
  it.each(['What do you mean?', 'what does protected mean', "I don't understand", 'not sure what you mean', 'like what', 'Can you explain'])('reads "%s" as asking', (text) => {
    expect(asksMeaning(text)).toBe(true);
  });
  it.each(['Family', '2 goals', 'no', "I'm not really certain", 'Gentle, please.'])('does not read "%s" as asking', (text) => {
    expect(asksMeaning(text)).toBe(false);
  });
});

describe('every example question in a step summary passes the hard rules on its own topic', () => {
  const examples = SETUP_STEPS.flatMap((s) => s.examples.map((e) => ({ step: s.n, ...e })));

  it('has examples for every step that asks something', () => {
    for (const s of SETUP_STEPS) expect(s.examples.length > 0, `step ${s.n}`).toBe(s.n !== 12);
  });

  it.each(examples)('step $step, $topic: "$question"', (e) => {
    const t = turn({ topic: e.topic, say: e.say ?? '', question: e.question });
    // Asked fresh, before the person has said anything: no day, time or number of theirs to lean on.
    const c = ctx([asked({ topic: null, question: 'Big or small, what would you like to work on?' }), said('Something.')]);
    const found = [
      ...checkOneQuestion(t),
      ...checkAssumeNothing(t, c),
      ...checkNoAnnouncedReminder(t),
      ...checkChoiceBeforeExamples(t, c),
      ...checkNoMath(t, c),
    ];
    expect(found.map((v) => `${v.rule}: ${v.message}`)).toEqual([]);
    expect(e.topic === null || SETUP_STEPS.find((s) => s.n === e.step)?.topics.includes(e.topic)).toBe(true);
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
    const history: Transcript = [
      asked({ topic: 'tone', question: 'How direct?' }),
      said('Gentle.'),
      asked({ topic: 'reminders', question: 'Reminders?' }),
      said('No.'),
    ];
    expect(rules(checkSkipAnswered(turn({ topic: 'tone', question: 'How direct would you like me to be?' }), ctx(history)))).toEqual(['skip_answered']);
  });

  // MOM-111: a person fact asked twice in a row stays rare. A follow-up straight after the reply passes only while the reply
  // has not settled it: once this turn records the fact, asking it again is a repeat.
  it('stops a one-value person fact asked again straight after the turn recorded it', () => {
    const history: Transcript = [asked({ topic: 'tone', question: 'How direct?' }), said('Gentle.')];
    const recorded = emptyDraft();
    recorded.model.settings.tone = 'gentle';
    expect(rules(checkSkipAnswered(turn({ topic: 'tone', question: 'How direct would you like me to be?', draft: recorded }), ctx(history)))).toEqual(['skip_answered']);
  });

  it('lets a one-value person fact be explained after "what do you mean?", while the draft still lacks it', () => {
    const history: Transcript = [asked({ topic: 'day_end', question: 'When does your day end?' }), said('What do you mean?')];
    expect(checkSkipAnswered(turn({ topic: 'day_end', say: 'I mean when you usually wrap up.', question: 'When do you usually wrap up for the day?' }), ctx(history))).toEqual([]);
  });

  it.each(['priorities', 'day_types', 'quiet_times', 'capacity', 'idea', 'breakup'] as const)(
    'lets a follow-up on "%s" through straight after the reply, even once the draft holds an answer',
    (topic) => {
      const history: Transcript = [asked({ topic, question: 'What else matters to you?' }), said('Family')];
      const recorded = emptyDraft();
      recorded.model.person.priorities = ['Family'];
      expect(checkSkipAnswered(turn({ topic, question: 'Is there anything else?', draft: recorded }), ctx(history))).toEqual([]);
    },
  );

  it('lets a skip through for what this turn records from the newest message, and for a topic the draft has no place for', () => {
    const history: Transcript = [asked({ topic: 'idea' }), said('Run more, because it clears my head. I ran in college.')];
    const recorded = emptyDraft();
    recorded.model.goals.push({ key: 'g1', title: 'Run more', why: 'it clears my head', startDate: null, shape: null, endDate: null, blockWeeks: null, state: 'active', returnWhen: null, completionMode: null, tone: null, targets: [], items: [] });
    const skipWhy = turn({ topic: 'breakup', question: 'Is this one goal?', skipped: { topic: 'why', line: 'You told me why it matters, so I will skip that.' }, draft: recorded });
    expect(checkSkipAnswered(skipWhy, ctx(history))).toEqual([]);
    const skipStart = turn({ topic: 'shape', question: 'Does it keep going?', skipped: { topic: 'starting_point', line: 'You told me where you are with it, so I will skip that.' }, draft: recorded });
    expect(checkSkipAnswered(skipStart, ctx(history))).toEqual([]);
    // Before the person has said anything, there is nothing to skip.
    expect(checkSkipAnswered(skipStart, ctx([]))).toHaveLength(1);
    // A why this turn did not record cannot be skipped.
    expect(checkSkipAnswered({ ...skipWhy, draft: emptyDraft() }, ctx(history))).toHaveLength(1);
  });

  it('asks a goal\'s own questions again for the next goal', () => {
    const history: Transcript = [asked({ topic: 'shape', question: 'Ongoing?' }), said('Yes.')];
    expect(checkSkipAnswered(turn({ topic: 'shape', question: 'Is cooking ongoing?' }), ctx(history))).toEqual([]);
  });

  it('allows a clarifying turn on the topic just asked', () => {
    const history: Transcript = [asked({ topic: 'tone', question: 'How direct?' }), said('Whatever')];
    expect(checkSkipAnswered(turn({ kind: 'interpretations', topic: 'tone', options: ['a', 'b'], question: 'Which one?' }), ctx(history))).toEqual([]);
  });

  // Production, MOM-111: "Is getting in shape one goal, or several?" / "2 goals" / "What are the two goals?" was thrown
  // away three times in a row. Naming the goals is the same topic carried on, not the topic asked again.
  it.each(['breakup', 'idea'] as const)('lets a follow-up on "%s" through right after the person answered it', (topic) => {
    const history: Transcript = [
      asked({ topic, question: 'Is getting in shape one goal for you, or does it break into several goals?' }),
      said('2 goals'),
    ];
    expect(checkSkipAnswered(turn({ topic, question: 'What are the two goals?' }), ctx(history))).toEqual([]);
  });

  it('tells Claude in step 3 to ask what the goals are, as its own breakup question, before together or one first', () => {
    const step = SETUP_STEPS.find((x) => x.n === 3);
    expect(step?.summary).toContain('If several, first ask what the goals are, as its own question tagged breakup, then ask whether to start them together or one first');
  });

  it('still stops the same topic asked again after the conversation has moved on', () => {
    const history: Transcript = [
      asked({ topic: 'breakup', question: 'One goal or several?' }),
      said('2 goals'),
      asked({ topic: 'why', question: 'Why does it matter?' }),
      said('Health.'),
    ];
    expect(rules(checkSkipAnswered(turn({ topic: 'breakup', question: 'One goal or several?' }), ctx(history)))).toEqual(['skip_answered']);
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

  describe('a person who decides to change nothing (production, 2026-10-29)', () => {
    const goalsPlayback = () => asked({ kind: 'playback', chunk: 'goals', question: null, topic: null });
    const approvedGoals = () => {
      const d = emptyDraft();
      d.approved = ['goals'];
      return d;
    };

    it('approves the part when the person says there is no change, straight after its playback', () => {
      for (const text of ['nothing', 'No changes', "I don't want to change anything", 'Leave it as is']) {
        expect(checkChunkedPlayback(turn({ draft: approvedGoals() }), ctx([goalsPlayback(), said(text)])), text).toEqual([]);
      }
    });

    it('approves the part after one clarifying question about that same playback', () => {
      const history: Transcript = [
        goalsPlayback(),
        said('nothing'),
        asked({ question: 'Do you want to keep this part exactly as it is?', topic: null }),
        said("I don't want to change anything"),
      ];
      expect(checkChunkedPlayback(turn({ draft: approvedGoals() }), ctx(history))).toEqual([]);
      // The same stuck session, whichever part it was stuck on.
      for (const chunk of ['goals', 'targets', 'planning', 'talk'] as const) {
        const d = emptyDraft();
        d.approved = [chunk];
        const stuck: Transcript = [asked({ kind: 'playback', chunk, question: null, topic: null }), ...history.slice(1)];
        expect(checkChunkedPlayback(turn({ draft: d }), ctx(stuck)), chunk).toEqual([]);
      }
    });

    it('reads only a whole message as "no change"', () => {
      for (const t of ['nothing', 'Nothing.', 'No changes!', "I don't want to change anything", 'I don’t want to change anything', 'leave it as is', 'Keep it as it is.']) {
        expect(declinesChange(t), t).toBe(true);
      }
      for (const t of ['no', 'yes', "Don't change the goals, but add one", 'nothing is right about it', 'change nothing but the name', '']) {
        expect(declinesChange(t), t).toBe(false);
      }
    });

    it('still approves nothing the person did not see played back and agree to', () => {
      const keep = said("I don't want to change anything");
      // No playback before it.
      expect(checkChunkedPlayback(turn({ draft: approvedGoals() }), ctx([asked(), keep]))).toHaveLength(1);
      // The playback was of another part.
      const other = asked({ kind: 'playback', chunk: 'targets', question: null, topic: null });
      expect(checkChunkedPlayback(turn({ draft: approvedGoals() }), ctx([other, keep]))).toHaveLength(1);
      // A real change is not a "no change", even with the same words in it.
      const wants = said("Don't change the goals, but add a goal for sleep");
      expect(checkChunkedPlayback(turn({ draft: approvedGoals() }), ctx([goalsPlayback(), wants]))).toHaveLength(1);
      expect(checkChunkedPlayback(turn({ draft: approvedGoals() }), ctx([goalsPlayback(), said('No, that is wrong')]))).toHaveLength(1);
      // A change in between means the clarifying question is no longer about the playback as shown.
      const history: Transcript = [goalsPlayback(), said('Make it Run more'), asked({ topic: null }), said("I don't want to change anything")];
      expect(checkChunkedPlayback(turn({ draft: approvedGoals() }), ctx(history))).toHaveLength(1);
    });
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
