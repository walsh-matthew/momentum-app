// Eval cases from the owner's phone smoke tests of 2026-10-29 (MOM-111 setup fix rounds 1 and 2), with personal details
// removed: every name, date and number is invented. They sit apart from the main eval set (tests/setup-evals/cases.ts), which
// has a fixed shape of full conversations and one fixture per hard rule. Each pairs a scripted person with a scripted fake
// model, so `npm test` makes no network call, and each runs through the same checks the app applies, including the
// code-written date and length turns (a case with `today` set gets them, exactly as the app does).
//
// - run-m-phone-paths: the paths the owner took on the phone, end to end and clean: one goal, "physical fitness", a voice-to-
//   text why ("wanna"), "next week" then "Monday" for the start date (code asks for the day, then proposes it), "any
//   recommendations?" at the first stretch of a habit (a research-backed proposal) answered "two months from now" (round 2
//   finding 7: code counts it from the start date and proposes whole weeks), floor 2 and aim 3, the setbacks question
//   (round 2 finding 10), and "Heavy for lifts and I'll log my runs myself" (round 2: voice-to-text for Hevy, and one target
//   with a synced source and a manual one).
// - run-m-apple-watch: the same, with "Hevy for lifts and my Apple Watch for runs": Hevy for lifts, the runs logged by hand,
//   and one line that Apple Watch can't be read yet.
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
const SHAPE_Q = 'Does this keep going, run until a set date, or have a deadline?';
const FLOOR_Q = 'What is the least you would count as still on track each week?';
const SOURCE_Q = 'Where do you track this now, if anywhere?';
const SOURCE_DETAIL = 'If an app Momentum can read has it, it counts it for you; otherwise you log it with a tap.';

// What code itself says on the owner's path (lib/setup/codeTurns.ts), so the script holds exactly those turns.
export const PHONE_CODE_TURNS = {
  askDay: 'Which day would you like to start?',
  askDayDetail: 'Your first week is planned from that day.',
  start: 'Start Monday, Nov 2?',
  // "two months from now", counted from Monday, Nov 2: Jan 2 is 61 days on, the nearest whole number of weeks is 9, and a
  // first stretch of 9 weeks runs through Sunday, Jan 3.
  stretch: 'A first stretch of 9 weeks, through Sunday, Jan 3, 2027?',
  stretchDetail: 'Counted from your start date, Monday, Nov 2.',
} as const;

const done = (c: Omit<SetupEvalCase, 'person'>, s: Script): ScriptedCase => ({ ...c, person: s.person, script: s.turns });

interface PhoneSource {
  id: string;
  title: string;
  reply: string;
  // The one-line reaction to the source answer, in the next turn's lead-in.
  say: string;
}

function phonePaths(src: PhoneSource): ScriptedCase {
  const s = new Script();
  s.add({ topic: 'idea', question: 'What would you like to work on?', detail: 'Big or small, in your own words.', reply: 'physical fitness' });
  s.add({ topic: 'why', edit: (m) => m.goals.push(goal('g1', 'Physical fitness')), question: 'Why does this matter to you?', reply: 'i wanna be around for my kids' });
  s.add({
    topic: 'breakup',
    edit: (m) => (goalOf(m, 'g1').why = 'i wanna be around for my kids'),
    // Finding 11: Claude's clean version of the why, in the person's own voice. Code checks it adds nothing.
    plain: [{ path: 'goals.g1.why', text: 'I want to be around for my kids' }],
    question: 'Is this one goal, or a few separate ones?',
    detail: 'Getting in shape might be one goal, or separate ones like moving more and eating better. Each goal gets its own plan.',
    reply: 'one goal',
  });
  s.playback('goals');
  s.add({ say: 'Got it, one goal.', topic: 'shape', question: SHAPE_Q, reply: 'habit' });
  s.add({ topic: 'start_date', edit: (m) => (goalOf(m, 'g1').shape = 'ongoing'), question: 'When would you like to start?', reply: 'next week' });
  // Written by code, not the model: "next week" names no day, so the day is asked again, with the date picker on screen.
  s.add({ topic: 'start_date', question: PHONE_CODE_TURNS.askDay, detail: PHONE_CODE_TURNS.askDayDetail, reply: 'Monday' });
  // Written by code: "Monday" alone is a relative date, worked out from the person's today and shown as a proposal.
  s.add({ kind: 'proposal', topic: 'start_date', question: PHONE_CODE_TURNS.start, reply: PROPOSAL_YES_TEXT });
  s.add({
    topic: 'block_length',
    edit: (m) => (goalOf(m, 'g1').startDate = '2026-11-02'),
    accepted: ['goals.g1.startDate'],
    question: 'How many weeks should the first stretch run?',
    detail: 'You can keep going after it ends.',
    reply: 'any recommendations?',
  });
  // Finding 12: asked for a recommendation, Claude gives one from general knowledge, framed as research, as a proposal.
  s.add({
    kind: 'proposal',
    topic: 'block_length',
    say: 'Research suggests a new habit takes about two months on average to feel automatic, though it varies a lot.',
    question: 'Would a first stretch of 8 weeks work for you?',
    reply: 'two months from now',
  });
  // Written by code (round 2 finding 7): "two months from now", counted from the start date, as whole weeks.
  s.add({ kind: 'proposal', topic: 'block_length', question: PHONE_CODE_TURNS.stretch, detail: PHONE_CODE_TURNS.stretchDetail, reply: PROPOSAL_YES_TEXT });
  s.add({
    topic: 'target',
    edit: (m) => (goalOf(m, 'g1').blockWeeks = 9),
    accepted: ['goals.g1.blockWeeks'],
    question: "What would you like to count to know it's going well?",
    detail: 'Like sessions, minutes or pages. Momentum shows your progress from what you log.',
    reply: 'Workouts.',
  });
  s.add({ topic: 'floor', edit: (m) => goalOf(m, 'g1').targets.push(target('t1', 'Workouts')), question: FLOOR_Q, reply: '2' });
  s.add({
    topic: 'aspiration',
    edit: (m) => (targetOf(m, 'g1', 't1').floor = 2),
    said: ['goals.g1.targets.t1.floor'],
    question: 'Is there a number you are hoping for?',
    reply: '3',
  });
  s.playback('targets', 'Yes.', {
    edit: (m) => {
      targetOf(m, 'g1', 't1').aspiration = 3;
      goalOf(m, 'g1').items.push(item('i1', 'habit', 'Do a workout', { targetKey: 't1' }));
    },
    said: ['goals.g1.targets.t1.aspiration'],
  });
  s.add({
    topic: 'expansion',
    question: 'What should happen to this goal when life gets in the way?',
    detail: "Say you're sick or work gets busy: it could pause, drop to your minimum, or keep going as planned.",
    reply: 'no setback plan',
  });
  s.add({ topic: 'source', question: SOURCE_Q, detail: SOURCE_DETAIL, reply: src.reply });
  s.add({
    topic: 'time_zone',
    // One target, two sources: Hevy for the lifts and the person's own logging for the runs, with no label of which is which.
    edit: (m) => (targetOf(m, 'g1', 't1').sources = [{ kind: 'synced', provider: 'hevy', metric: null }, { kind: 'manual' }]),
    say: src.say,
    question: 'Which time zone are you in?',
    detail: 'Your days start and end where you are.',
    reply: 'America/Los_Angeles.',
  });
  s.add({ topic: 'day_end', edit: (m) => (m.person.timeZone = 'America/Los_Angeles'), say: DAY_END_SAY, question: 'When does your day end?', reply: 'Around 9 at night.' });
  s.add({
    topic: 'week_start',
    edit: (m) => (m.person.dayEnd = '21:00'),
    said: ['person.dayEnd'],
    question: 'Which day does your week start on?',
    reply: 'Monday.',
  });
  s.playback('planning', 'Yes.', { edit: (m) => (m.person.weekStart = 1), said: ['person.weekStart'] });
  s.add({ topic: 'tone', question: 'How direct would you like me to be?', detail: 'Anywhere from gentle to blunt.', reply: 'Gentle, please.' });
  s.playback('talk', 'Yes.', { edit: (m) => (m.settings.tone = 'gentle') });
  s.final();
  return done({ id: src.id, title: src.title, rules: ['assume_nothing', 'no_math', 'choice_before_examples'], expect: 'clean', today: SMOKE_TODAY }, s);
}

// Finding 9: the question's example named "workout sessions" and the person said "yes, workouts per week". Code must not
// let a number they never said into the draft; the next turn asks how many.
function workoutsAsked(): ScriptedCase {
  const s = new Script();
  s.add({ topic: 'idea', question: 'What would you like to work on?', reply: 'Get fit by working out more.' });
  s.add({
    topic: 'target',
    edit: (m) => m.goals.push(goal('g1', 'Get fit')),
    question: "What would you like to count to know it's going well?",
    detail: 'Like workout sessions or minutes.',
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
  s.add({ topic: 'idea', question: 'What would you like to work on?', reply: 'Get fit by working out more.' });
  s.add({
    topic: 'target',
    edit: (m) => m.goals.push(goal('g1', 'Get fit')),
    question: "What would you like to count to know it's going well?",
    detail: 'Like workout sessions or minutes.',
    reply: 'yes, workouts per week',
  });
  // The production failure: a workout count the person never said, filled in. The draft check stops it.
  s.add({
    topic: 'source',
    edit: (m) => goalOf(m, 'g1').targets.push(target('t1', 'Workouts per week', { floor: 3 })),
    said: ['goals.g1.targets.t1.floor'],
    question: SOURCE_Q,
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
  s.add({
    kind: 'ideas',
    topic: 'floor',
    options: ['At least 2 a week', 'At least 3 a week'],
    question: 'Which of these would you like to start from, or give your own?',
  });
  return done({ id: 'smoke-14-ideas-from-interpretations', title: 'a tapped "starting ideas" interpretation lets the ideas through', rules: ['choice_before_examples'], expect: { violations: [] } }, s);
}

// Finding 4: a lead-in that previews the question.
function leadInPreview(): ScriptedCase {
  const s = new Script();
  s.add({ topic: 'idea', question: 'What would you like to work on?', reply: 'I want to read more.' });
  s.add({ topic: 'start_date', say: "Next, I'll check when you want to start.", question: 'What day would you like to start?' });
  return done({ id: 'smoke-4-lead-in-preview', title: 'a lead-in that previews the question is caught', rules: [], expect: { violations: [{ turn: 1, rule: 'plain_words' }] } }, s);
}

// Finding 6: "physical fitness" turned into a question about the gym.
function newActivity(): ScriptedCase {
  const s = new Script();
  s.add({ topic: 'idea', question: 'What would you like to work on?', reply: 'physical fitness' });
  s.add({ topic: 'starting_point', question: 'Where are you with the gym today?', detail: 'Never been, now and then, or a regular.' });
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
  phonePaths({
    id: 'run-m-phone-paths',
    title: 'the owner\'s phone paths: "next week" then "Monday", "two months from now", and "Heavy for lifts and I\'ll log my runs myself"',
    reply: "Heavy for lifts and I'll log my runs myself",
    say: "Got it: Hevy for lifts, and you'll log your runs yourself.",
  }),
  phonePaths({
    id: 'run-m-apple-watch',
    title: 'the owner\'s variant: "Hevy for lifts and my Apple Watch for runs" comes back as Hevy and logging runs by hand',
    reply: 'Hevy for lifts and my Apple Watch for runs',
    say: "Apple Watch can't be read yet, so you'll log your runs yourself for now.",
  }),
  workoutsAsked(),
  workoutsGuessed(),
  ideasFromInterpretations(),
  leadInPreview(),
  newActivity(),
  recommendationUnasked(),
];
