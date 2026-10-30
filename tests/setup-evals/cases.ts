// The setup eval set (MOM-111, design record §5.1): scripted conversations with personal details removed. Every name,
// date and number here is invented. Each case pairs a scripted person with a scripted fake model, so `npm test` makes no
// network call. Thirteen cases are full conversations that must come out clean; eight are short conversations with one
// deliberately bad turn, to show each hard rule's check catches what it should (and only that). The questions are written
// the way setup should ask them (MOM-111): everyday words, a reason, and short examples where they help.

import type { SetupEvalCase } from '@/lib/setup/evals';
import { MEANING_TEXT } from '@/lib/setup/session';
import { DAY_END_SAY } from '@/lib/setup/steps';
import type { AssistantTurn, HardRuleId, SetupModel } from '@/types/setup';
import { Script, goal, goalOf, item, target, targetOf } from '../helpers/setupScript';

export type ScriptedCase = SetupEvalCase & { script: AssistantTurn[] };

const TODAY = '2026-10-27';
// The same date the way setup says it (MOM-111 finding 7): never as YYYY-MM-DD on screen.
const TODAY_WORDS = 'Tuesday, Oct 27';

// The crowd-out question (step 4), in the words the step's own example uses.
const PRIORITIES_Q = "What else matters right now that this shouldn't crowd out?";
const PRIORITIES_DETAIL = 'Like family time, your health, or something you enjoy. Your plan keeps room for these.';
const PRIORITIES_SAY = "I'll keep those in mind so this plan doesn't crowd them out.";
const SHAPE_Q = 'Does this keep going, run until a set date, or have a deadline?';
// The detail lines under a question (MOM-111 round 2, finding 1), in the words the steps' own examples use.
const IDEA_DETAIL = 'Big or small, in your own words.';
const SHAPE_DETAIL = 'It decides how your plan is laid out: in stretches that keep going, up to an end date, or back from a deadline.';
const BLOCK_Q = 'How many weeks should the first stretch run?';
// The question on the least that still counts names what is counted, in the person's words (MOM-111 round 3b, finding 1),
// and says what the number is for in everyday words (round 3c): the same words code writes (lib/setup/numbers.ts).
const floorQ = (counted: string): string => `How many ${counted} make a week count, even a hard one?`;

const done = (c: Omit<SetupEvalCase, 'person'>, s: Script): ScriptedCase => ({ ...c, person: s.person, script: s.turns });

// ---------------------------------------------------------------------------
// A weekly habit goal, with the options the cases vary
// ---------------------------------------------------------------------------

interface HabitOptions {
  id: string;
  title: string;
  rules: HardRuleId[];
  idea: string;
  // The idea reply also names the week start, so setup skips asking it (rule 5).
  weekStartEarly?: boolean;
  // A long first message, as typed on a computer, that also says why and where they are now: setup records the why from
  // it and skips both questions in one line each (rule 5).
  longFirst?: boolean;
  goals?: 'single' | 'two';
  // Step 4, "what else matters". 'whatDoYouMean': the person asks what the question means and Claude explains it.
  priorities?: 'plain' | 'whatDoYouMean';
  floor: 'plain' | 'ideas' | 'ambiguous' | 'changeAtApproval';
  // 'whatDoYouMean': the person asks what the day-end question means, and Claude explains it before asking again.
  dayEnd: 'checkin' | 'ambiguousEarly' | 'whatDoYouMean';
  reminders?: boolean;
  // What the goal is called and why it matters, as the person put it (round 3b, finding 4: a goal that is not exercise).
  goalTitle?: string;
  why?: { reply: string; text: string };
  // What the person counts, in their own words: their reply, the target's title, the word options use, and the habit.
  counted?: { reply: string; title: string; word: string; habit: string };
  // The three starting ideas for the least that still counts, when the person asks for ideas; the second is the one they pick.
  ideaNumbers?: [number, number, number];
  // Where the ideas come from, quoting what the person said in their first message (round 3c: quoted, or no detail line).
  ideasDetail?: string;
}

const SESSIONS = { reply: 'Sessions.', title: 'Sessions', word: 'sessions', habit: 'Do a session' };
const RUNS = { reply: 'Runs.', title: 'Runs', word: 'runs', habit: 'Go for a run' };
export const READING_CASE_ID = 'run-r-reading-ideas';

function habitCase(o: HabitOptions): ScriptedCase {
  const s = new Script();
  const early = o.weekStartEarly === true;
  const change = o.floor === 'changeAtApproval';
  const title = o.goalTitle ?? 'Run more';
  const why = o.why ?? { reply: 'It clears my head.', text: 'it clears my head' };
  const counted = o.counted ?? SESSIONS;
  const [lo, mid, hi] = o.ideaNumbers ?? [2, 3, 4];

  s.add({ topic: 'idea', question: 'What would you like to work on?', detail: IDEA_DETAIL, reply: o.idea });
  if (o.goals === 'two') {
    s.add({ topic: 'why', edit: (m) => m.goals.push(goal('g1', 'Get healthy')), question: 'Why does this matter to you?', reply: 'I want more energy.' });
    s.add({
      topic: 'breakup',
      edit: (m) => (goalOf(m, 'g1').why = 'more energy'),
      question: 'Is this one goal, or a few separate ones?',
      reply: 'Two, lifting weights and cooking at home.',
    });
    s.add({
      topic: 'sequencing',
      edit: (m) => {
        goalOf(m, 'g1').title = 'Lift weights';
        m.goals.push(goal('g2', 'Cook at home'));
      },
      say: 'Starting fewer goals usually works better, though that is only a suggestion.',
      question: 'Do you want to take them together, or one first?',
      reply: 'One first: lifting.',
    });
    s.add({
      topic: 'parked_return',
      edit: (m) => (goalOf(m, 'g2').state = 'parked'),
      question: 'When should cooking come back?',
      reply: 'In the spring.',
    });
    s.playback('goals', 'Yes, that is right.', {
      edit: (m) => (goalOf(m, 'g2').returnWhen = { kind: 'condition', note: 'in the spring' }),
    });
  } else if (o.longFirst) {
    // The first message already said why, so this turn records it and skips the question in one line.
    s.add({
      topic: 'breakup',
      edit: (m) => m.goals.push(goal('g1', title, { why: why.text })),
      skipped: { topic: 'why', line: "You told me why it matters, so I'll skip that." },
      question: 'Is this one goal, or a few separate ones?',
      reply: 'Just this one.',
    });
    s.playback('goals');
  } else {
    s.add({
      topic: 'why',
      edit: (m) => {
        m.goals.push(goal('g1', title));
        if (early) m.person.weekStart = 1;
      },
      said: early ? ['person.weekStart'] : [],
      say: 'Knowing what it is for helps me shape the rest.',
      question: 'Why does this matter to you?',
      reply: why.reply,
    });
    s.add({
      topic: 'breakup',
      edit: (m) => (goalOf(m, 'g1').why = why.text),
      question: 'Is this one goal, or a few separate ones?',
      reply: 'Only this one.',
    });
    s.playback('goals');
  }

  if (o.priorities) {
    if (o.priorities === 'whatDoYouMean') {
      s.add({ topic: 'priorities', say: PRIORITIES_SAY, question: PRIORITIES_Q, detail: PRIORITIES_DETAIL, reply: MEANING_TEXT });
      // Asked what it means, Claude explains in plainer words with a few examples, then asks again: a clarification.
      s.add({
        topic: 'priorities',
        say: 'I mean the parts of your life you want to keep room for while you work on this, for example family time, rest or a hobby.',
        question: "What else matters to you right now that this plan shouldn't crowd out?",
        reply: 'Family time and my sleep.',
      });
    } else {
      s.add({ topic: 'priorities', say: PRIORITIES_SAY, question: PRIORITIES_Q, detail: PRIORITIES_DETAIL, reply: 'Family time and my sleep.' });
    }
  }

  s.add({
    topic: 'shape',
    edit: (m) => {
      if (o.priorities) m.person.priorities = ['Family time', 'my sleep'];
    },
    // The first message said where they are with running; the draft has no place for it, so it is skipped in one line.
    skipped: o.longFirst ? { topic: 'starting_point', line: "You told me where you are with running, so I'll skip that." } : undefined,
    question: SHAPE_Q,
    detail: SHAPE_DETAIL,
    reply: 'It keeps going.',
  });
  s.add({
    kind: 'proposal',
    topic: 'start_date',
    edit: (m) => (goalOf(m, 'g1').shape = 'ongoing'),
    question: `Start today, ${TODAY_WORDS}?`,
    reply: 'Yes, that works.',
  });
  s.add({
    topic: 'block_length',
    edit: (m) => (goalOf(m, 'g1').startDate = TODAY),
    accepted: ['goals.g1.startDate'],
    say: 'You can keep going after it.',
    question: BLOCK_Q,
    // Not only a length, so Claude takes the turn: a reply of just "Ten weeks" gets code's own proposal of the stretch (round 2,
    // finding 7), which the stateless fake model of the browser specs cannot follow.
    reply: 'Ten weeks, and then I will see.',
  });
  if (o.goals === 'two') {
    // The table needs a shape and a start date even for a goal set aside, so setup asks them for it too.
    s.add({
      topic: 'shape',
      edit: (m) => (goalOf(m, 'g1').blockWeeks = 10),
      said: ['goals.g1.blockWeeks'],
      question: 'Does cooking keep going, run until a set date, or have a deadline?',
      reply: 'It keeps going.',
    });
    s.add({
      kind: 'proposal',
      topic: 'start_date',
      edit: (m) => (goalOf(m, 'g2').shape = 'ongoing'),
      question: `Start cooking today, ${TODAY_WORDS}?`,
      reply: 'Yes, that works.',
    });
  }
  s.add({
    topic: 'target',
    edit: (m) => {
      if (o.goals === 'two') {
        goalOf(m, 'g2').startDate = TODAY;
      } else {
        goalOf(m, 'g1').blockWeeks = 10;
      }
    },
    said: o.goals === 'two' ? [] : ['goals.g1.blockWeeks'],
    accepted: o.goals === 'two' ? ['goals.g2.startDate'] : [],
    say: 'That way Momentum can show you how it is going from what you log.',
    question: 'What would you like to count to know this is going well?',
    reply: counted.reply,
  });

  const addTarget = (m: SetupModel) => {
    goalOf(m, 'g1').targets.push(target('t1', counted.title));
  };
  const finishTarget = (floor: number) => (m: SetupModel) => {
    targetOf(m, 'g1', 't1').floor = floor;
    goalOf(m, 'g1').items.push(item('i1', 'habit', counted.habit, { targetKey: 't1' }));
  };
  const floorPath = ['goals.g1.targets.t1.floor'];

  switch (o.floor) {
    case 'plain':
    case 'changeAtApproval':
      s.add({ topic: 'floor', edit: addTarget, question: floorQ(counted.word), reply: 'Two a week.' });
      s.playback('targets', 'Yes.', { edit: finishTarget(2), said: floorPath });
      break;
    case 'ideas':
      s.add({
        kind: 'offer_ideas',
        topic: 'floor',
        edit: addTarget,
        question: 'Do you have a number in mind, or would some starting ideas help?',
        detail: `The number of ${counted.word} that makes a week count, even a hard one.`,
        reply: 'Some ideas, please.',
      });
      s.add({
        kind: 'ideas',
        topic: 'floor',
        say: 'Here are some starting points.',
        detail: o.ideasDetail,
        options: [`At least ${lo} a week`, `At least ${mid} a week`, `At least ${hi} a week`],
        question: 'Which of these would you like to start from, or give your own?',
        reply: 'The second one works.',
      });
      s.playback('targets', 'Yes.', { edit: finishTarget(mid), accepted: floorPath });
      break;
    case 'ambiguous':
      s.add({
        topic: 'floor',
        edit: addTarget,
        question: floorQ(counted.word),
        reply: { say: 'A few, I guess.', fits: false },
      });
      s.add({
        kind: 'interpretations',
        topic: 'floor',
        say: 'I am not sure which number that is.',
        options: ['At least two a week', 'At least three a week', 'A different number'],
        question: 'Which of these is closest?',
        reply: 'The second one.',
      });
      s.playback('targets', 'Yes.', { edit: finishTarget(3), accepted: floorPath });
      break;
  }

  s.add({ topic: 'source', question: 'Where do you track this now, if anywhere?', reply: 'No, I will log it myself.' });
  s.add({
    topic: 'time_zone',
    edit: (m) => (targetOf(m, 'g1', 't1').sources = [{ kind: 'manual' }]),
    skipped: early ? { topic: 'week_start', line: "You told me your week starts Monday, so I'll skip that." } : undefined,
    question: 'Which time zone are you in?',
    reply: change ? 'America/Denver. Actually, make it three a week, not two.' : 'America/Denver.',
  });

  const dayEnd = o.dayEnd === 'ambiguousEarly' ? '02:00' : '21:00';
  s.add({
    topic: 'day_end',
    edit: (m) => {
      m.person.timeZone = 'America/Denver';
      // The newest answer replaces the older one, and the approved part is played back again (rule 7).
      if (change) targetOf(m, 'g1', 't1').floor = 3;
    },
    said: change ? floorPath : [],
    unapprove: change ? ['targets'] : undefined,
    say: DAY_END_SAY,
    question: 'When does your day end?',
    reply: o.dayEnd === 'checkin' ? 'I check in around 9 at night.' : o.dayEnd === 'whatDoYouMean' ? MEANING_TEXT : { say: 'Late.', fits: false },
  });
  if (o.dayEnd === 'whatDoYouMean') {
    // A person fact explained after "what do you mean?": the same topic straight after the reply, with nothing recorded yet.
    s.add({
      topic: 'day_end',
      say: `I mean the time you usually wrap up for the day. ${DAY_END_SAY}`,
      question: 'When do you usually wrap up for the day?',
      reply: 'Around 9 at night.',
    });
  }
  if (o.dayEnd === 'ambiguousEarly') {
    s.add({
      kind: 'interpretations',
      topic: 'day_end',
      say: 'I am not sure when that is.',
      options: ['After midnight and before 6 in the morning, an early day end', 'Any other time, the time you check in'],
      question: 'Which of these fits your day end?',
      reply: 'The first one, 2 in the morning.',
    });
  }

  if (early) {
    s.playback('planning', 'Yes.', { edit: (m) => (m.person.dayEnd = dayEnd), said: ['person.dayEnd'] });
  } else {
    s.add({
      topic: 'week_start',
      edit: (m) => (m.person.dayEnd = dayEnd),
      said: ['person.dayEnd'],
      question: 'Which day does your week start on?',
      reply: 'Monday.',
    });
    s.playback('planning', 'Yes.', { edit: (m) => (m.person.weekStart = 1), said: ['person.weekStart'] });
  }
  if (change) s.playback('targets', 'Yes, that is right.');

  s.add({ topic: 'tone', question: 'How direct would you like me to be, from gentle to blunt?', reply: 'Gentle, please.' });
  if (o.reminders) {
    s.add({
      topic: 'reminders',
      edit: (m) => (m.settings.tone = 'gentle'),
      question: 'Would you like reminders on the days you plan?',
      reply: 'No reminders for now.',
    });
    s.playback('talk', 'Yes.', { edit: (m) => (m.settings.reminders = 'off') });
  } else {
    s.playback('talk', 'Yes.', { edit: (m) => (m.settings.tone = 'gentle') });
  }
  s.final();

  return done({ id: o.id, title: o.title, rules: o.rules, expect: 'clean' }, s);
}

// ---------------------------------------------------------------------------
// A deadline-only goal: no week start, the date, and whether it can move
// ---------------------------------------------------------------------------

interface DeadlineOptions {
  id: string;
  title: string;
  rules: HardRuleId[];
  goalTitle: string;
  idea: string;
  shapeReply: string;
  date: string;
  dateReply: string;
  canMove: boolean;
  canMoveReply: string;
  itemTitle: string;
  targetReply: string;
  targetTitle: string;
  unit: string;
  floor: number;
  floorReply: string;
}

function deadlineCase(o: DeadlineOptions): ScriptedCase {
  const s = new Script();
  s.add({ topic: 'idea', question: 'What would you like to work on?', detail: IDEA_DETAIL, reply: o.idea });
  s.add({ topic: 'why', edit: (m) => m.goals.push(goal('g1', o.goalTitle)), question: 'Why does this matter to you?', reply: 'I promised it to someone.' });
  s.add({
    topic: 'breakup',
    edit: (m) => (goalOf(m, 'g1').why = 'I promised it to someone'),
    question: 'Is this one goal, or a few separate ones?',
    reply: 'Just the one goal.',
  });
  s.playback('goals');
  s.add({ topic: 'shape', question: SHAPE_Q, detail: SHAPE_DETAIL, reply: o.shapeReply });
  const dateAsked = s.next;
  s.add({
    topic: 'deadline_date',
    edit: (m) => (goalOf(m, 'g1').shape = 'project'),
    say: "That's the date we'll plan back from.",
    question: 'Which day does it have to be done by?',
    reply: o.dateReply,
  });
  const moveAsked = s.next;
  // The date and whether it can move are two questions in two turns.
  s.add({ topic: 'date_can_move', say: 'If it can, moving it stays one of your options later.', question: 'Can that date move?', reply: o.canMoveReply });
  s.add({
    kind: 'proposal',
    topic: 'start_date',
    edit: (m) => {
      const g = goalOf(m, 'g1');
      g.endDate = o.date;
      g.items.push(item('i1', 'deadline_task', o.itemTitle, { dueDate: o.date, dateCanMove: o.canMove }));
    },
    said: [
      `goals.g1.endDate@${dateAsked}`,
      `goals.g1.items.i1.dueDate@${dateAsked}`,
      `goals.g1.items.i1.dateCanMove@${moveAsked}`,
    ],
    question: `Start today, ${TODAY_WORDS}?`,
    reply: 'Yes, start today.',
  });
  s.add({
    topic: 'target',
    edit: (m) => (goalOf(m, 'g1').startDate = TODAY),
    accepted: ['goals.g1.startDate'],
    question: 'What would you count to know you are getting there?',
    reply: o.targetReply,
  });
  s.add({
    topic: 'floor',
    edit: (m) =>
      goalOf(m, 'g1').targets.push(
        target('t1', o.targetTitle, {
          measure: 'quantity',
          unit: o.unit,
          period: { kind: 'deadline', dueDate: o.date },
          carryOver: 'cumulative',
        }),
      ),
    said: [`goals.g1.targets.t1.dueDate@${dateAsked}`],
    question: 'How many by then?',
    reply: o.floorReply,
  });
  s.playback('targets', 'Yes.', { edit: (m) => (targetOf(m, 'g1', 't1').floor = o.floor), said: ['goals.g1.targets.t1.floor'] });
  s.add({ topic: 'source', question: 'Where do you track this now, if anywhere?', reply: 'I will log it by hand.' });
  s.add({
    topic: 'time_zone',
    edit: (m) => (targetOf(m, 'g1', 't1').sources = [{ kind: 'manual' }]),
    question: 'Which time zone are you in?',
    reply: 'America/Chicago.',
  });
  s.add({
    topic: 'day_end',
    edit: (m) => (m.person.timeZone = 'America/Chicago'),
    say: DAY_END_SAY,
    question: 'When does your day end?',
    reply: 'I check in at 9 at night.',
  });
  // Every goal here is a deadline goal, so no week start is asked (MOM-125).
  s.playback('planning', 'Yes.', { edit: (m) => (m.person.dayEnd = '21:00'), said: ['person.dayEnd'] });
  s.add({ topic: 'tone', question: 'How direct would you like me to be, from gentle to blunt?', reply: 'Gentle, please.' });
  s.playback('talk', 'Yes.', { edit: (m) => (m.settings.tone = 'gentle') });
  s.final();
  return done({ id: o.id, title: o.title, rules: o.rules, expect: 'clean' }, s);
}

// ---------------------------------------------------------------------------
// One-word answers, as typed on a phone: follow-ups carry each topic on, and setup finishes
// ---------------------------------------------------------------------------

function phoneCase(): ScriptedCase {
  const s = new Script();
  s.add({ topic: 'idea', question: 'What would you like to work on?', detail: IDEA_DETAIL, reply: 'fitness' });
  s.add({ topic: 'why', edit: (m) => m.goals.push(goal('g1', 'Fitness')), question: 'Why does this matter to you?', reply: 'health' });
  s.add({
    topic: 'breakup',
    edit: (m) => (goalOf(m, 'g1').why = 'health'),
    question: 'Is this one goal, or a few separate ones?',
    reply: '2 goals',
  });
  // The production case of 2026-10-29: naming the goals right after "2 goals" carries the topic on.
  s.add({ topic: 'breakup', question: 'What are the goals?', reply: 'running, cooking' });
  s.add({
    topic: 'sequencing',
    edit: (m) => {
      goalOf(m, 'g1').title = 'Running';
      m.goals.push(goal('g2', 'Cooking'));
    },
    say: 'Starting with fewer goals usually works better, though that is only a suggestion.',
    question: 'Would you like to start them together, or one first?',
    reply: 'one first',
  });
  s.add({ topic: 'sequencing', question: 'Which one first?', reply: 'running' });
  s.add({
    topic: 'parked_return',
    edit: (m) => (goalOf(m, 'g2').state = 'parked'),
    question: 'When should cooking come back?',
    detail: 'On a date, when something happens, or only when you ask.',
    reply: 'spring',
  });
  s.playback('goals', 'yes', { edit: (m) => (goalOf(m, 'g2').returnWhen = { kind: 'condition', note: 'spring' }) });
  s.add({ topic: 'priorities', say: PRIORITIES_SAY, question: PRIORITIES_Q, detail: PRIORITIES_DETAIL, reply: 'family' });
  s.add({
    topic: 'priorities',
    edit: (m) => (m.person.priorities = ['family']),
    question: 'Is there anything else that matters right now?',
    reply: 'no',
  });
  s.add({ topic: 'shape', question: SHAPE_Q, detail: SHAPE_DETAIL, reply: 'ongoing' });
  s.add({
    kind: 'proposal',
    topic: 'start_date',
    edit: (m) => (goalOf(m, 'g1').shape = 'ongoing'),
    question: `Start running today, ${TODAY_WORDS}?`,
    reply: 'yes',
  });
  s.add({
    topic: 'block_length',
    edit: (m) => (goalOf(m, 'g1').startDate = TODAY),
    accepted: ['goals.g1.startDate'],
    say: 'You can keep going after it.',
    question: BLOCK_Q,
    reply: '8',
  });
  // The table needs a shape and a start date for a goal set aside too.
  s.add({
    topic: 'shape',
    edit: (m) => (goalOf(m, 'g1').blockWeeks = 8),
    said: ['goals.g1.blockWeeks'],
    question: 'Does cooking keep going, run until a set date, or have a deadline?',
    reply: 'ongoing',
  });
  s.add({
    kind: 'proposal',
    topic: 'start_date',
    edit: (m) => (goalOf(m, 'g2').shape = 'ongoing'),
    question: `Start cooking today, ${TODAY_WORDS}?`,
    reply: 'yes',
  });
  s.add({
    topic: 'target',
    edit: (m) => (goalOf(m, 'g2').startDate = TODAY),
    accepted: ['goals.g2.startDate'],
    question: 'What would you like to count to know running is going well?',
    reply: 'runs',
  });
  s.add({ topic: 'floor', edit: (m) => goalOf(m, 'g1').targets.push(target('t1', 'Runs')), question: floorQ('runs'), reply: '2' });
  s.playback('targets', 'yes', {
    edit: (m) => {
      targetOf(m, 'g1', 't1').floor = 2;
      goalOf(m, 'g1').items.push(item('i1', 'habit', 'Go for a run', { targetKey: 't1' }));
    },
    said: ['goals.g1.targets.t1.floor'],
  });
  s.add({ topic: 'source', question: 'Where do you track this now, if anywhere?', reply: 'myself' });
  s.add({
    topic: 'time_zone',
    edit: (m) => (targetOf(m, 'g1', 't1').sources = [{ kind: 'manual' }]),
    say: 'That way your days are counted where you are.',
    question: 'Which time zone are you in?',
    reply: 'Denver',
  });
  s.add({
    topic: 'day_end',
    edit: (m) => (m.person.timeZone = 'America/Denver'),
    say: DAY_END_SAY,
    question: 'When does your day end?',
    reply: '9pm',
  });
  s.add({
    topic: 'week_start',
    edit: (m) => (m.person.dayEnd = '21:00'),
    said: ['person.dayEnd'],
    question: 'Which day does your week start on?',
    reply: 'monday',
  });
  s.playback('planning', 'yes', { edit: (m) => (m.person.weekStart = 1), said: ['person.weekStart'] });
  s.add({ topic: 'tone', question: 'How direct would you like me to be, from gentle to blunt?', reply: 'gentle' });
  s.add({
    topic: 'reminders',
    edit: (m) => (m.settings.tone = 'gentle'),
    question: 'Would you like reminders on the days you plan to do something?',
    reply: 'no',
  });
  s.playback('talk', 'yes', { edit: (m) => (m.settings.reminders = 'off') });
  s.final();
  return done(
    {
      id: 'run-l-one-word-answers',
      title: 'one-word answers (on a phone): follow-ups on the same topic carry it on, and setup finishes',
      rules: ['skip_answered', 'one_question', 'no_math'],
      expect: 'clean',
    },
    s,
  );
}

// ---------------------------------------------------------------------------
// Violation fixtures: a short conversation with one bad turn, and the one rule it breaks
// ---------------------------------------------------------------------------

function fixture(id: HardRuleId, title: string, build: (s: Script) => void, turn: number): ScriptedCase {
  const s = new Script();
  build(s);
  return done({ id: `fx-${id}`, title, rules: [id], expect: { violations: [{ turn, rule: id }] } }, s);
}

const FIXTURES: ScriptedCase[] = [
  fixture(
    'one_question',
    'two asks joined in one question',
    (s) => {
      s.add({ topic: 'idea', question: 'What would you like to work on?', reply: 'I want to run more.' });
      s.add({ topic: 'floor', question: 'How long do you want to run for and how often will you go?' });
    },
    1,
  ),
  fixture(
    'assume_nothing',
    'asks about evenings the person never mentioned',
    (s) => {
      s.add({ topic: 'idea', question: 'What would you like to work on?', reply: 'I want to run more.' });
      s.add({ topic: 'slots_or_quota', question: 'Would you like to run in the evenings?' });
    },
    1,
  ),
  fixture(
    'no_announced_reminder',
    'says it will remind the person',
    (s) => {
      s.add({ topic: 'idea', question: 'What would you like to work on?', reply: 'I want to run more.' });
      s.add({ topic: 'floor', say: "I'll remind you before each run.", question: 'How many runs would be a good minimum each week?' });
    },
    1,
  ),
  fixture(
    'choice_before_examples',
    'gives starting ideas without offering the choice first',
    (s) => {
      s.add({ topic: 'idea', question: 'What would you like to work on?', reply: 'I want to run more.' });
      s.add({ kind: 'ideas', topic: 'floor', options: ['At least 2 a week', 'At least 3 a week'], question: 'Which of these would you like?' });
    },
    1,
  ),
  fixture(
    'skip_answered',
    'asks the week start the person already gave',
    (s) => {
      s.add({ topic: 'idea', question: 'What would you like to work on?', reply: 'I want to run more. My week starts on Monday.' });
      s.add({
        topic: 'why',
        edit: (m) => {
          m.goals.push(goal('g1', 'Run more'));
          m.person.weekStart = 1;
        },
        said: ['person.weekStart'],
        question: 'Why does this matter to you?',
        reply: 'It clears my head.',
      });
      s.add({ topic: 'week_start', question: 'Which day does your week start on?' });
    },
    2,
  ),
  fixture(
    'numbered_interpretations',
    'carries on after an answer that did not fit',
    (s) => {
      s.add({
        topic: 'floor',
        question: 'How many runs would be a good minimum each week?',
        reply: { say: 'A few, I guess.', fits: false },
      });
      s.add({ topic: 'source', question: 'Where do you track this now, if anywhere?' });
    },
    1,
  ),
  fixture(
    'chunked_playback',
    'writes its own summary instead of letting code play the part back',
    (s) => {
      s.add({ topic: 'idea', question: 'What would you like to work on?', reply: 'I want to run more.' });
      s.add({ kind: 'playback', chunk: 'goals', say: 'Here is your whole plan so far: you will run more.' });
    },
    1,
  ),
  fixture(
    'no_math',
    'adds up a number the person never said',
    (s) => {
      s.add({ topic: 'floor', question: 'How many runs would be a good minimum each week?', reply: 'I can do two a week.' });
      s.add({ topic: 'source', say: 'That makes 8 runs a month.', question: 'Where do you track this now, if anywhere?' });
    },
    1,
  ),
];

// ---------------------------------------------------------------------------
// The set
// ---------------------------------------------------------------------------

export const SETUP_CASES: ScriptedCase[] = [
  ...FIXTURES,
  deadlineCase({
    id: 'run-a-deadline-only',
    title: 'a deadline-only goal: its date, can it move, and no week start',
    rules: ['one_question', 'assume_nothing', 'no_math'],
    goalTitle: 'Finish the quilt',
    idea: "Finish a quilt for my sister's wedding.",
    shapeReply: 'It has a deadline.',
    date: '2027-06-14',
    dateReply: 'June 14, 2027.',
    canMove: false,
    canMoveReply: 'No, the wedding date is fixed.',
    itemTitle: 'Quilt finished',
    targetReply: 'Quilt blocks sewn.',
    targetTitle: 'Blocks sewn',
    unit: 'blocks',
    floor: 12,
    floorReply: 'Twelve blocks.',
  }),
  habitCase({
    id: 'run-b-habit-ideas',
    title: 'a habit goal: the choice before examples, and asking about reminders',
    rules: ['choice_before_examples', 'no_announced_reminder', 'one_question'],
    idea: 'I want to run more.',
    floor: 'ideas',
    dayEnd: 'checkin',
    reminders: true,
    counted: RUNS,
  }),
  habitCase({
    id: 'run-c-answered-already',
    title: 'a person who already gave their week start, so it is skipped in one line',
    rules: ['skip_answered'],
    idea: 'I want to run more. My week starts on Monday.',
    weekStartEarly: true,
    floor: 'plain',
    dayEnd: 'checkin',
  }),
  habitCase({
    id: 'run-d-ambiguous-answer',
    title: 'an answer that does not fit gets numbered interpretations, not a guess',
    rules: ['numbered_interpretations'],
    idea: 'I want to run more.',
    floor: 'ambiguous',
    dayEnd: 'checkin',
  }),
  habitCase({
    id: 'run-e-changes-mind',
    title: 'the person changes a number after it was approved: the latest wins and the part is played back again',
    rules: ['chunked_playback', 'assume_nothing'],
    idea: 'I want to run more.',
    floor: 'changeAtApproval',
    dayEnd: 'checkin',
  }),
  habitCase({
    id: 'run-f-early-day-end',
    title: 'an early day end (after midnight) is told apart from a check-in time',
    rules: ['numbered_interpretations', 'assume_nothing'],
    idea: 'I want to run more.',
    floor: 'plain',
    dayEnd: 'ambiguousEarly',
  }),
  deadlineCase({
    id: 'run-g-relative-deadline',
    title: 'a deadline given as "the week before X": the date is asked, never worked out',
    rules: ['assume_nothing', 'no_math'],
    goalTitle: 'Demo ready',
    idea: 'Get my demo ready the week before the conference.',
    shapeReply: 'It has a deadline, the week before the conference.',
    date: '2027-06-05',
    dateReply: 'June 5, 2027.',
    canMove: true,
    canMoveReply: 'Yes, I could ask for more time.',
    itemTitle: 'Demo ready',
    targetReply: 'Features finished.',
    targetTitle: 'Features finished',
    unit: 'features',
    floor: 5,
    floorReply: 'Five features.',
  }),
  habitCase({
    id: 'run-h-two-activities',
    title: 'one idea holding two activities: sequencing is asked early, and the other is parked with a season',
    rules: ['one_question', 'skip_answered'],
    idea: 'I want to get healthy: lift weights and cook at home more.',
    goals: 'two',
    floor: 'plain',
    dayEnd: 'checkin',
  }),
  habitCase({
    id: 'run-i-what-do-you-mean-protected',
    title: 'the person asks "what do you mean?" at the crowd-out question: Claude explains with examples, and setup carries on',
    rules: ['skip_answered', 'choice_before_examples', 'no_announced_reminder'],
    idea: 'I want to run more. I run about 2 times a week now.',
    priorities: 'whatDoYouMean',
    floor: 'ideas',
    dayEnd: 'checkin',
    reminders: true,
    counted: RUNS,
    ideasDetail: 'You said you run about 2 times a week now.',
  }),
  habitCase({
    id: 'run-j-what-do-you-mean-day-end',
    title: 'the person asks "what do you mean?" at the day-end question: a person fact explained, not a repeat',
    rules: ['skip_answered', 'assume_nothing'],
    idea: 'I want to run more.',
    priorities: 'plain',
    floor: 'plain',
    dayEnd: 'whatDoYouMean',
  }),
  habitCase({
    id: 'run-k-long-first-message',
    title: 'a long first message (on a computer) that says the idea, the why and where they are: recorded, and both questions skipped in one line',
    rules: ['skip_answered', 'one_question'],
    idea: 'I want to run more because it clears my head. I ran a lot in college but have not run in years.',
    longFirst: true,
    priorities: 'plain',
    floor: 'plain',
    dayEnd: 'checkin',
  }),
  phoneCase(),
  // A goal that is not exercise (round 3b, finding 4): every option, detail and the final recap count "pages", the person's
  // own word. The browser specs photograph it as its own set.
  habitCase({
    id: READING_CASE_ID,
    title: "a reading goal: the ideas and the recap count pages, in the person's own word",
    rules: ['choice_before_examples', 'no_math'],
    idea: 'I want to read more books. I read about 50 pages a week now.',
    goalTitle: 'Read more books',
    why: { reply: 'It helps me unwind.', text: 'it helps me unwind' },
    priorities: 'plain',
    floor: 'ideas',
    dayEnd: 'checkin',
    counted: { reply: 'Pages.', title: 'Pages', word: 'pages', habit: 'Read' },
    ideaNumbers: [50, 100, 150],
    ideasDetail: 'You said you read about 50 pages a week now.',
  }),
];
