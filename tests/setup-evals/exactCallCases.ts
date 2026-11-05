// MOM-180 B3: scripted first setups whose every Claude call is listed (tests/setup-exact-calls.test.ts). Every name, date and number is invented.
// Code writes the idea and the why at Start, "what else matters", "what to count" and the kinds of days in fixed words, the goals and targets
// playbacks, and the final card; each code turn here is a placeholder that holds its place (its detail carries code's mark), so the positions of the
// model's own turns line up and the fake can refuse to be asked for one.
//   ONE_GOAL_CASE        one goal, every card tapped: 4 calls.
//   TWO_TOGETHER_CASE    two goals started together: 6 calls.
//   TYPED_MANY_CASE      one goal, and one typed answer that holds the shape, what to count, the least that counts and the first stretch: 4 calls,
//                        with no first-stretch, what-to-count, role or number card shown.
//   MEANING_CASE         one goal, with "Still not clear? Ask Claude" on what to count: 5 calls (code's own explanations cost none).

import { GOAL_CARD_MARK } from '@/lib/setup/goalCards';
import { FIXED_QUESTION_MARK, FIXED_WORDS, targetQuestionFor } from '@/lib/setup/fixedQuestions';
import { MEANING_TEXT } from '@/lib/setup/session';
import { STEP_CARD_MARK, STEP_WORDS } from '@/lib/setup/stepCards';
import { WEEK_CARD_MARK, WEEK_WORDS } from '@/lib/setup/weekCards';
import type { SetupModel } from '@/types/setup';
import { Script, goal, goalOf, target, targetOf } from '../helpers/setupScript';
import { opening, settingsCard, timeZoneCard, zoneWrites, DEVICE_ZONE, type ScriptedCase } from './cases';

export const EXACT_TODAY = '2026-10-27';
const TODAY_WORDS = 'Tuesday, Oct 27';
const KINDS = ['Busy days', 'Usual days', 'Easy days'];

const done = (id: string, title: string, s: Script): ScriptedCase => ({
  id,
  title,
  rules: ['skip_answered', 'assume_nothing', 'chunked_playback'],
  expect: 'clean',
  today: EXACT_TODAY,
  person: s.person,
  script: s.turns,
});

const tap = (say: string, field: 'goal' | 'step') => ({ say, [field]: say });

// Step 3 by taps for one goal, then code's goals playback and "what else matters", then Claude's starting point question (the card in its place).
// Each case's first answer is its own, since the browser's fake model picks its script by the first answer (tests/e2e/support/setupConversation.ts).
function oneGoalStart(s: Script, idea: string): void {
  opening(s, idea, 'It clears my head.');
  s.add({
    topic: 'breakup',
    edit: (m) => m.goals.push(goal('g1', 'Run more', { why: 'it clears my head' })),
    question: 'Is this one goal, or a few separate ones?',
    reply: tap(`${STEP_WORDS.justOne}.`, 'step'),
  });
  s.playback('goals');
  s.add({ topic: 'priorities', question: FIXED_WORDS.prioritiesQuestion, detail: `${FIXED_QUESTION_MARK} ${FIXED_WORDS.prioritiesLine}`, reply: 'Family time and my sleep.' });
  s.add({
    topic: 'starting_point',
    edit: (m) => (m.person.priorities = ['Family time', 'my sleep']),
    question: 'Where are you with this today?',
    reply: tap('Dabbled a little.', 'goal'),
  });
}

// From the time zone card to the final card: the source card for each target, the day end and week start cards, code's kinds-of-days question
// (the one answer Claude reads), the time for each kind of day (Claude's question goes out as the card), set days for each target, when to plan,
// the planning playback, the settings card and its playback, and the final card. Only the time question is the model's.
function weekToEnd(s: Script, targets: { goal: string; target: string; days: number[] | 'any' }[]): void {
  timeZoneCard(s);
  targets.forEach((t, i) =>
    s.add({
      topic: 'source',
      ...(i === 0 ? zoneWrites(DEVICE_ZONE, false) : {}),
      edit: (m) => {
        if (i === 0) m.person.timeZone = DEVICE_ZONE;
        if (i > 0) targetOf(m, targets[i - 1].goal, targets[i - 1].target).sources = [{ kind: 'manual' }];
      },
      question: 'Where do you track it now, if anywhere?',
      detail: STEP_CARD_MARK,
      reply: tap(`${STEP_WORDS.logMyself}.`, 'step'),
    }),
  );
  const last = targets[targets.length - 1];
  s.add({
    topic: 'day_end',
    edit: (m) => (targetOf(m, last.goal, last.target).sources = [{ kind: 'manual' }]),
    question: WEEK_WORDS.dayEndQuestion,
    detail: WEEK_CARD_MARK,
    reply: { say: 'I check in around 9 at night', week: { topic: 'day_end', time: '21:00' } },
  });
  s.add({
    topic: 'week_start',
    edit: (m) => (m.person.dayEnd = '21:00'),
    said: ['person.dayEnd'],
    question: WEEK_WORDS.weekStartQuestion,
    detail: WEEK_CARD_MARK,
    reply: { say: 'My week starts on Monday', week: { topic: 'week_start', weekday: 1 } },
  });
  s.add({
    topic: 'day_types',
    edit: (m) => (m.person.weekStart = 1),
    said: ['person.weekStart'],
    question: FIXED_WORDS.dayTypesQuestion,
    detail: `${FIXED_QUESTION_MARK} ${FIXED_WORDS.dayTypesLine}`,
    reply: 'Yes: busy days, usual days and easy days.',
  });
  s.add({
    topic: 'capacity',
    edit: (m) => (m.person.dayTypes = KINDS.map((name) => ({ name, capacityUnit: null, capacityAmount: null }))),
    question: 'About how much time does each kind of day have?',
    reply: {
      say: 'twenty minutes, 45 minutes, 2 hours',
      week: { topic: 'capacity', rows: { 'busy days': { amount: '20', unit: 'minutes' }, 'usual days': { amount: '45', unit: 'minutes' }, 'easy days': { amount: '2', unit: 'hours' } } },
    },
  });
  // Every turn from here on is code's: the drafts below are never returned by the model, so they carry no edits.
  for (const t of targets) {
    s.add({
      topic: 'slots_or_quota',
      question: 'Would you rather do it on set days, or any day?',
      detail: WEEK_CARD_MARK,
      reply: { say: 'taps', week: { topic: 'slots_or_quota', answer: t.days === 'any' ? { kind: 'any' } : { kind: 'days', weekdays: t.days } } },
    });
  }
  s.add({
    topic: 'planning_moment',
    question: WEEK_WORDS.planningQuestion,
    detail: WEEK_CARD_MARK,
    reply: { say: 'Sunday at 6 pm', week: { topic: 'planning_moment', weekday: 7, time: '18:00' } },
  });
  s.playback('planning', 'Yes.');
  settingsCard(s, { tone: 'gentle' }, { tone: 'gentle' });
  s.final();
}

// One goal, every card tapped. With `askMeaning`, the person asks what "what to count" means and Claude explains it before they answer.
function oneGoal(id: string, title: string, idea: string, askMeaning: boolean): ScriptedCase {
  const s = new Script();
  oneGoalStart(s, idea);
  s.add({ topic: 'shape', question: 'Does it keep going, end on a date, or have a deadline?', detail: GOAL_CARD_MARK, reply: tap('It keeps going.', 'goal') });
  s.add({ kind: 'proposal', topic: 'start_date', edit: (m) => (goalOf(m, 'g1').shape = 'ongoing'), question: `Start today, ${TODAY_WORDS}?`, detail: GOAL_CARD_MARK, reply: tap('Yes, that works.', 'goal') });
  s.add({
    topic: 'block_length',
    edit: (m) => (goalOf(m, 'g1').startDate = EXACT_TODAY),
    accepted: ['goals.g1.startDate'],
    question: 'How many weeks should the first stretch run?',
    detail: GOAL_CARD_MARK,
    reply: tap('8 weeks.', 'goal'),
  });
  s.add({
    topic: 'target',
    edit: (m) => (goalOf(m, 'g1').blockWeeks = 8),
    said: ['goals.g1.blockWeeks'],
    question: FIXED_WORDS.targetQuestion,
    detail: `${FIXED_QUESTION_MARK} ${FIXED_WORDS.targetLine}`,
    reply: askMeaning ? MEANING_TEXT : 'Runs.',
  });
  if (askMeaning) {
    // "Still not clear? Ask Claude": the one call an explanation costs. Claude explains in plainer words and asks again: a clarification.
    s.add({
      topic: 'target',
      say: 'I mean something you can add up each week, like the number of times you go, or the minutes.',
      question: 'What would you like to count each week?',
      reply: 'Runs.',
    });
  }
  s.add({
    topic: 'role',
    edit: (m) => goalOf(m, 'g1').targets.push(target('t1', 'Runs')),
    question: 'Is that something you do, or a result outside your control?',
    reply: tap(`${STEP_WORDS.somethingIDo}.`, 'step'),
  });
  s.add({ topic: 'floor', said: ['goals.g1.targets.t1.role'], question: 'In a hard week, how many runs would still count?', detail: STEP_CARD_MARK, reply: { say: 'Two.', step: { floor: '2' } } });
  s.playback('targets', 'Yes.', { edit: (m) => (targetOf(m, 'g1', 't1').floor = 2), said: ['goals.g1.targets.t1.floor'] });
  weekToEnd(s, [{ goal: 'g1', target: 't1', days: [1, 3, 5] }]);
  return done(id, title, s);
}

export const ONE_GOAL_CASE = oneGoal('exact-one-goal', 'one goal, every card tapped: Claude reads the idea and why, what else matters, what to count and the kinds of days', 'I want to run more often.', false);
export const MEANING_CASE = oneGoal('exact-ask-claude', 'one goal, with "Still not clear? Ask Claude" on what to count: one call more', 'I want to go running more.', true);

// Two goals started together: the names are Claude's to read, then both goals' shape and dates by cards, and what to count for each goal.
export const TWO_TOGETHER_CASE: ScriptedCase = (() => {
  const s = new Script();
  opening(s, 'I want to get fit and eat better.', 'I want more energy.');
  s.add({
    topic: 'breakup',
    edit: (m) => m.goals.push(goal('g1', 'Get healthy', { why: 'more energy' })),
    question: 'Is this one goal, or a few separate ones?',
    reply: tap(`${STEP_WORDS.aFew}.`, 'step'),
  });
  s.add({ topic: 'breakup', question: STEP_WORDS.namesQuestion, detail: STEP_CARD_MARK, reply: 'Lifting weights and cooking at home.' });
  s.add({
    topic: 'sequencing',
    edit: (m) => {
      goalOf(m, 'g1').title = 'Lift weights';
      m.goals.push(goal('g2', 'Cook at home', { why: 'more energy' }));
    },
    question: STEP_WORDS.sequencingQuestion,
    reply: tap(`${STEP_WORDS.allTogether}.`, 'step'),
  });
  s.playback('goals');
  s.add({ topic: 'priorities', question: FIXED_WORDS.prioritiesQuestionMany, detail: `${FIXED_QUESTION_MARK} ${FIXED_WORDS.prioritiesLine}`, reply: 'Family time and my sleep.' });
  s.add({ topic: 'starting_point', edit: (m) => (m.person.priorities = ['Family time', 'my sleep']), question: 'Where are you with this today?', reply: tap('Dabbled a little.', 'goal') });
  const goalCards = (key: string, title: string, weeks: number, after: (m: SetupModel) => void, afterSaid: string[]) => {
    s.add({ topic: 'shape', edit: after, said: afterSaid, question: `Does "${title}" keep going, end on a date, or have a deadline?`, detail: GOAL_CARD_MARK, reply: tap('It keeps going.', 'goal') });
    s.add({ kind: 'proposal', topic: 'start_date', edit: (m) => (goalOf(m, key).shape = 'ongoing'), question: `Start "${title}" today, ${TODAY_WORDS}?`, detail: GOAL_CARD_MARK, reply: tap('Yes, that works.', 'goal') });
    s.add({
      topic: 'block_length',
      edit: (m) => (goalOf(m, key).startDate = EXACT_TODAY),
      accepted: [`goals.${key}.startDate`],
      question: 'How many weeks should the first stretch run?',
      detail: GOAL_CARD_MARK,
      reply: tap(`${weeks} weeks.`, 'goal'),
    });
  };
  goalCards('g1', 'Lift weights', 8, () => {}, []);
  goalCards('g2', 'Cook at home', 4, (m) => (goalOf(m, 'g1').blockWeeks = 8), ['goals.g1.blockWeeks']);
  const counting = (goalKey: string, title: string, thing: string, floor: string, before: (m: SetupModel) => void, beforeSaid: string[]) => {
    s.add({ topic: 'target', edit: before, said: beforeSaid, question: targetQuestionFor(title), detail: `${FIXED_QUESTION_MARK} ${FIXED_WORDS.targetLine}`, reply: `${thing}.` });
    s.add({
      topic: 'role',
      edit: (m) => goalOf(m, goalKey).targets.push(target(goalKey === 'g1' ? 't1' : 't2', thing)),
      question: 'Is that something you do, or a result outside your control?',
      reply: tap(`${STEP_WORDS.somethingIDo}.`, 'step'),
    });
    const key = goalKey === 'g1' ? 't1' : 't2';
    s.add({ topic: 'floor', said: [`goals.${goalKey}.targets.${key}.role`], question: `In a hard week, how many ${thing.toLowerCase()} would still count?`, detail: STEP_CARD_MARK, reply: { say: floor, step: { floor } } });
  };
  counting('g1', 'Lift weights', 'Lifting sessions', '2', (m) => (goalOf(m, 'g2').blockWeeks = 4), ['goals.g2.blockWeeks']);
  counting('g2', 'Cook at home', 'Home-cooked meals', '3', (m) => (targetOf(m, 'g1', 't1').floor = 2), ['goals.g1.targets.t1.floor']);
  s.playback('targets', 'Yes.', { edit: (m) => (targetOf(m, 'g2', 't2').floor = 3), said: ['goals.g2.targets.t2.floor'] });
  weekToEnd(s, [
    { goal: 'g1', target: 't1', days: [1, 3, 5] },
    { goal: 'g2', target: 't2', days: 'any' },
  ]);
  return done('exact-two-together', 'two goals started together: Claude reads the idea and why, the names, what else matters, what to count for each, and the kinds of days', s);
})();

// One goal, and one typed answer at the shape card that holds the shape, what to count, the least that counts and the first stretch. Claude reads it
// and asks the start date (the card goes out in its place); after the tap, nothing is left in step 7, so code plays the targets back.
export const TYPED_MANY_CASE: ScriptedCase = (() => {
  const s = new Script();
  oneGoalStart(s, 'I want to start running.');
  s.add({
    topic: 'shape',
    question: 'Does it keep going, end on a date, or have a deadline?',
    detail: GOAL_CARD_MARK,
    reply: 'It keeps going. I want to count runs, at least 3 a week, and try it for 8 weeks.',
  });
  s.add({
    kind: 'proposal',
    topic: 'start_date',
    edit: (m) => {
      Object.assign(goalOf(m, 'g1'), { shape: 'ongoing', blockWeeks: 8 });
      goalOf(m, 'g1').targets.push(target('t1', 'Runs', { floor: 3 }));
    },
    said: ['goals.g1.blockWeeks', 'goals.g1.targets.t1.floor'],
    say: "Got it: runs, at least 3 a week, for 8 weeks.",
    question: `Start today, ${TODAY_WORDS}?`,
    reply: tap('Yes, that works.', 'goal'),
  });
  s.playback('targets', 'Yes.', { edit: (m) => (goalOf(m, 'g1').startDate = EXACT_TODAY), accepted: ['goals.g1.startDate'] });
  weekToEnd(s, [{ goal: 'g1', target: 't1', days: 'any' }]);
  return done('exact-typed-many', 'one typed answer that covers the shape, what to count, the least that counts and the first stretch', s);
})();

export const EXACT_CALL_CASES = [ONE_GOAL_CASE, TWO_TOGETHER_CASE, TYPED_MANY_CASE, MEANING_CASE];
