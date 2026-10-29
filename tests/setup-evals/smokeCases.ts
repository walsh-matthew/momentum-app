// Eval cases from the owner's phone smoke test of 2026-10-29 (MOM-111 setup fix round), with personal details removed:
// every name, date and number is invented. They sit apart from the main eval set (tests/setup-evals/cases.ts), which has a
// fixed shape of full conversations and one fixture per hard rule. Each pairs a scripted person with a scripted fake model,
// so `npm test` makes no network call, and each runs through the same checks the app applies, including the code-written
// date turns (a case with `today` set gets them, exactly as the app does).
//
// - run-m-phone-paths: the paths the owner took on the phone, end to end and clean: one goal, "physical fitness", a voice-to-
//   text why ("wanna"), "next week" then "Monday" for the start date (code asks for the day, then proposes it), and "any
//   recommendations?" at the first stretch of a habit (finding 12: a research-backed proposal, accepted with one tap).
// - smoke-9: the example "workout sessions" in a question, the answer "yes, workouts per week", and the next turn asks how
//   many (finding 9); smoke-9-guessed is the same with the number filled in, which the draft check stops.
// - smoke-14: tapping "starting ideas" from a list of interpretations lets the ideas through (finding 14).
// - smoke-4: a lead-in that previews the question is caught (finding 4).
// - smoke-6: an activity the person never said is caught (finding 6).
// - smoke-12-unasked: a recommendation's numbers outside a proposal, and without being asked, are still stopped.

import type { SetupEvalCase } from '@/lib/setup/evals';
import { PROPOSAL_YES_TEXT } from '@/lib/setup/session';
import { DAY_END_SAY } from '@/lib/setup/steps';
import { Script, goal, goalOf, item, target, targetOf } from '../helpers/setupScript';
import type { ScriptedCase } from './cases';

// A Tuesday. The coming Monday is 2026-11-02.
export const SMOKE_TODAY = '2026-10-27';
const SHAPE_Q = 'Does this keep going with no end date, run until a set date, or have a deadline it must be done by?';
const FLOOR_Q = 'What is the least you would count as still on track each week?';

const done = (c: Omit<SetupEvalCase, 'person'>, s: Script): ScriptedCase => ({ ...c, person: s.person, script: s.turns });

function phonePaths(): ScriptedCase {
  const s = new Script();
  s.add({ topic: 'idea', question: 'Big or small, what would you like to work on?', reply: 'physical fitness' });
  s.add({ topic: 'why', edit: (m) => m.goals.push(goal('g1', 'Physical fitness')), question: 'Why does this matter to you?', reply: 'i wanna be around for my kids' });
  s.add({
    topic: 'breakup',
    edit: (m) => (goalOf(m, 'g1').why = 'i wanna be around for my kids'),
    // Finding 11: Claude's clean version of the why, in the person's own voice. Code checks it adds nothing.
    plain: [{ path: 'goals.g1.why', text: 'I want to be around for my kids' }],
    question: 'Is this one goal, or a few separate ones, the way getting in shape might be moving more and eating better?',
    reply: 'one goal',
  });
  s.playback('goals');
  s.add({ say: 'Got it, one goal.', topic: 'shape', question: SHAPE_Q, reply: 'It keeps going.' });
  s.add({ topic: 'start_date', edit: (m) => (goalOf(m, 'g1').shape = 'ongoing'), question: 'When would you like to start?', reply: 'next week' });
  // Written by code, not the model: "next week" names no day, so the day is asked again, with the date picker on screen.
  s.add({ topic: 'start_date', question: 'Which day would you like to start?', reply: 'Monday' });
  // Written by code: "Monday" alone is a relative date, worked out from the person's today and shown as a proposal.
  s.add({ kind: 'proposal', topic: 'start_date', question: 'Start Monday, Nov 2?', reply: PROPOSAL_YES_TEXT });
  s.add({
    topic: 'block_length',
    edit: (m) => (goalOf(m, 'g1').startDate = '2026-11-02'),
    accepted: ['goals.g1.startDate'],
    question: 'How many weeks should the first stretch run, knowing you can keep going after it?',
    reply: 'any recommendations?',
  });
  // Finding 12: asked for a recommendation, Claude gives one from general knowledge, framed as research, as a proposal.
  s.add({
    kind: 'proposal',
    topic: 'block_length',
    say: 'Research suggests a new habit takes about two months on average to feel automatic, though it varies a lot.',
    question: 'Would a first stretch of 8 weeks work for you?',
    reply: PROPOSAL_YES_TEXT,
  });
  s.add({
    topic: 'target',
    edit: (m) => (goalOf(m, 'g1').blockWeeks = 8),
    accepted: ['goals.g1.blockWeeks'],
    question: 'What would you like to count to know this is going well, like sessions, minutes or pages?',
    reply: 'Workouts.',
  });
  s.add({ topic: 'floor', edit: (m) => goalOf(m, 'g1').targets.push(target('t1', 'Workouts')), question: FLOOR_Q, reply: 'Three a week.' });
  s.playback('targets', 'Yes.', {
    edit: (m) => {
      targetOf(m, 'g1', 't1').floor = 3;
      goalOf(m, 'g1').items.push(item('i1', 'habit', 'Do a workout', { targetKey: 't1' }));
    },
    said: ['goals.g1.targets.t1.floor'],
  });
  s.add({ topic: 'source', question: 'Where do you track this now, if anywhere, so I know where your progress comes from?', reply: "I'll log it myself." });
  s.add({
    topic: 'time_zone',
    edit: (m) => (targetOf(m, 'g1', 't1').sources = [{ kind: 'manual' }]),
    question: 'Which time zone are you in, so your days are counted where you are?',
    reply: 'America/Chicago.',
  });
  s.add({ topic: 'day_end', edit: (m) => (m.person.timeZone = 'America/Chicago'), say: DAY_END_SAY, question: 'When does your day end?', reply: 'Around 9 at night.' });
  s.add({
    topic: 'week_start',
    edit: (m) => (m.person.dayEnd = '21:00'),
    said: ['person.dayEnd'],
    question: 'Which day does your week start on?',
    reply: 'Monday.',
  });
  s.playback('planning', 'Yes.', { edit: (m) => (m.person.weekStart = 1), said: ['person.weekStart'] });
  s.add({ topic: 'tone', question: 'How direct would you like me to be, from gentle to blunt?', reply: 'Gentle, please.' });
  s.playback('talk', 'Yes.', { edit: (m) => (m.settings.tone = 'gentle') });
  s.final();
  return done(
    {
      id: 'run-m-phone-paths',
      title: 'the owner\'s phone paths: "physical fitness", "next week" then "Monday", and "any recommendations?" at a habit',
      rules: ['assume_nothing', 'no_math', 'choice_before_examples'],
      expect: 'clean',
      today: SMOKE_TODAY,
    },
    s,
  );
}

// Finding 9: the question's example named "workout sessions" and the person said "yes, workouts per week". Code must not
// let a number they never said into the draft; the next turn asks how many.
function workoutsAsked(): ScriptedCase {
  const s = new Script();
  s.add({ topic: 'idea', question: 'Big or small, what would you like to work on?', reply: 'Get fit by working out more.' });
  s.add({
    topic: 'target',
    edit: (m) => m.goals.push(goal('g1', 'Get fit')),
    question: 'What would you like to count to know this is going well, like workout sessions or minutes?',
    reply: 'yes, workouts per week',
  });
  s.add({
    topic: 'floor',
    edit: (m) => goalOf(m, 'g1').targets.push(target('t1', 'Workouts per week')),
    question: 'How many workouts a week would you count as still on track?',
  });
  return done({ id: 'smoke-9-asks-how-many', title: 'an accepted example with no number: the next turn asks how many', rules: ['no_math'], expect: { violations: [] } }, s);
}

function workoutsGuessed(): ScriptedCase {
  const s = new Script();
  s.add({ topic: 'idea', question: 'Big or small, what would you like to work on?', reply: 'Get fit by working out more.' });
  s.add({
    topic: 'target',
    edit: (m) => m.goals.push(goal('g1', 'Get fit')),
    question: 'What would you like to count to know this is going well, like workout sessions or minutes?',
    reply: 'yes, workouts per week',
  });
  // The production failure: a workout count the person never said, filled in. The draft check stops it.
  s.add({
    topic: 'source',
    edit: (m) => goalOf(m, 'g1').targets.push(target('t1', 'Workouts per week', { floor: 3 })),
    said: ['goals.g1.targets.t1.floor'],
    question: 'Where do you track this now, if anywhere?',
  });
  return done({ id: 'smoke-9-guessed', title: 'a number the person never said, filled in, is stopped', rules: ['no_math'], expect: { violations: [{ turn: 2, rule: 'draft' }] } }, s);
}

// Finding 14: the person taps "Some starting ideas" in a list of interpretations. That is asking for ideas.
function ideasFromInterpretations(): ScriptedCase {
  const s = new Script();
  s.add({ topic: 'floor', question: FLOOR_Q, reply: { say: 'no clue honestly', fits: false } });
  s.add({
    kind: 'interpretations',
    topic: 'floor',
    say: 'That is fine.',
    options: ['You have a number in mind', 'Some starting ideas would help'],
    question: 'Which of these is closest?',
    reply: 'Option 2',
  });
  s.add({ kind: 'ideas', topic: 'floor', options: ['2 a week', '3 a week'], question: 'Which of these would you like to start from, or give your own?' });
  return done({ id: 'smoke-14-ideas-from-interpretations', title: 'a tapped "starting ideas" interpretation lets the ideas through', rules: ['choice_before_examples'], expect: { violations: [] } }, s);
}

// Finding 4: a lead-in that previews the question.
function leadInPreview(): ScriptedCase {
  const s = new Script();
  s.add({ topic: 'idea', question: 'Big or small, what would you like to work on?', reply: 'I want to read more.' });
  s.add({ topic: 'start_date', say: "Next, I'll check when you want to start.", question: 'What day would you like to start?' });
  return done({ id: 'smoke-4-lead-in-preview', title: 'a lead-in that previews the question is caught', rules: [], expect: { violations: [{ turn: 1, rule: 'plain_words' }] } }, s);
}

// Finding 6: "physical fitness" turned into a question about the gym.
function newActivity(): ScriptedCase {
  const s = new Script();
  s.add({ topic: 'idea', question: 'Big or small, what would you like to work on?', reply: 'physical fitness' });
  s.add({ topic: 'starting_point', question: 'Where are you with the gym today: never been, now and then, or a regular?' });
  return done({ id: 'smoke-6-new-activity', title: 'an activity the person never said is caught', rules: ['assume_nothing'], expect: { violations: [{ turn: 1, rule: 'plain_words' }] } }, s);
}

// Finding 12's edge: a recommendation's number in an ordinary question, unasked, is still a number the person never said.
function recommendationUnasked(): ScriptedCase {
  const s = new Script();
  s.add({ topic: 'block_length', question: 'How many weeks should the first stretch run?', reply: 'Not sure.' });
  s.add({ topic: 'block_length', question: 'Would 8 weeks work?' });
  return done({ id: 'smoke-12-unasked', title: 'a number outside a proposal is still stopped', rules: ['no_math'], expect: { violations: [{ turn: 1, rule: 'no_math' }] } }, s);
}

export const SMOKE_CASES: ScriptedCase[] = [
  phonePaths(),
  workoutsAsked(),
  workoutsGuessed(),
  ideasFromInterpretations(),
  leadInPreview(),
  newActivity(),
  recommendationUnasked(),
];
