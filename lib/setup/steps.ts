// The setup conversation's order and hard rules as data (docs/DOMAIN_MODEL.md §2.1, §2.2, with MOM-125's day end in
// step 10). The prompt, the checks and the tests all read these, so the wording of the doc is kept in one place.
// Pure: no database, no model, no network.

import type { HardRuleId, SetupChunk, SetupTopic } from '@/types/setup';

// An example question for a step, in the plain style the step wants: everyday words, a reason or what the answer is for,
// and, where it helps, a few short examples. The prompt shows them; tests check each one passes the hard rules on its own
// topic and uses no internal word unexplained.
export interface StepExample {
  topic: SetupTopic;
  say?: string;
  question: string;
}

export interface SetupStep {
  n: number;
  id: string;
  title: string;
  // What Claude asks in this step. Every internal word in it (target, floor, protected and the like) sits in a sentence
  // that says what it means in everyday words, because Claude repeats the words it is given (MOM-111).
  summary: string;
  // Why it asks, in a few words Claude can say ("that's the date we'll plan back from"). Null only for the final step,
  // which asks nothing.
  reason: string | null;
  examples: StepExample[];
  topics: SetupTopic[];
  // The part played back for approval once this step is done (§2.2 step 12).
  playbackAfter: SetupChunk | null;
}

// The day-end explanation, with the only two clock words Claude may say there (MOM-125).
export const DAY_END_SAY =
  'If your day ends after midnight and before 6 in the morning, it runs from that time to the same time the next day; any other time is just when you check in.';

export const SETUP_STEPS: readonly SetupStep[] = [
  {
    n: 1,
    id: 'idea',
    title: 'The idea',
    summary: 'Ask what they would like to work on, in their own words. Big or small is fine.',
    reason: 'everything else builds from it',
    examples: [{ topic: 'idea', question: 'Big or small, what would you like to work on?' }],
    topics: ['idea'],
    playbackAfter: null,
  },
  {
    n: 2,
    id: 'why',
    title: 'Why',
    summary: 'Ask why it matters to them, in their own words.',
    reason: 'so I understand what it is for',
    examples: [{ topic: 'why', say: 'Knowing what it is for helps me shape the rest.', question: 'Why does this matter to you?' }],
    topics: ['why'],
    playbackAfter: null,
  },
  {
    n: 3,
    id: 'break_up',
    title: 'Break it up',
    summary:
      'Ask whether this is one goal or a few separate ones. If several, first ask what the goals are, as its own question tagged breakup, then ask whether to start them together or one first. Say once that starting with fewer goals usually works better; it is a suggestion, never a limit. A goal they set aside for now (saved as parked) gets a way back: a date, a season or condition in their words, or only when they ask.',
    reason: 'each goal gets its own plan',
    examples: [
      { topic: 'breakup', question: 'Is this one goal, or a few separate ones, the way getting in shape might be lifting and eating better?' },
      { topic: 'sequencing', say: 'Starting with fewer goals usually works better, though that is only a suggestion.', question: 'Would you like to start them together, or one first?' },
      { topic: 'parked_return', question: 'When should this one come back: on a date, when something happens, or only when you ask?' },
    ],
    topics: ['breakup', 'sequencing', 'parked_return'],
    playbackAfter: 'goals',
  },
  {
    n: 4,
    id: 'what_else_matters',
    title: 'What else matters',
    summary:
      'Ask what else in their life matters right now that this plan should not crowd out, in their words (saved as protected priorities), before any detailed planning. Put a few short examples in the question, such as family time, health or something they enjoy, and never assume which of them apply. When what the goal will take from their week is already known, name it in the question. Say crowd out, not protect, to the person.',
    reason: "I'll keep those in mind so this plan doesn't crowd them out",
    examples: [
      {
        topic: 'priorities',
        say: "I'll keep those in mind so this plan doesn't crowd them out.",
        question: "Besides this goal, what else in your life matters right now that this plan shouldn't crowd out, like family time, your health, or something you enjoy?",
      },
    ],
    topics: ['priorities'],
    playbackAfter: null,
  },
  {
    n: 5,
    id: 'starting_point',
    title: 'Starting point',
    summary:
      'Ask where they are with it today, with a few short examples in the question, such as never tried it, dabbled a little, or done it before. This often shows a natural first step to aim for (saved as a milestone).',
    reason: 'so the plan starts from where you are',
    examples: [{ topic: 'starting_point', question: 'Where are you with this today: never tried it, dabbled a little, or done it before?' }],
    topics: ['starting_point'],
    playbackAfter: null,
  },
  {
    n: 6,
    id: 'shape_and_timeframe',
    title: 'Shape and timeframe',
    summary:
      'Ask whether it keeps going with no end date, runs until a set end date, or has a deadline it must be done by (saved as ongoing, finite or project). For one that keeps going, ask how many weeks the first stretch should run (saved as the first block); never say block to the person. Always ask for the exact date; never infer a week or work a date out from words like "the week before". For a deadline, ask as a separate question, in its own turn, whether the date can move, and say why: if it can, moving it stays one of their options later. For the start date, show the date given as "Suggested start date" at the end of the newest message, in a proposal they can accept or change, and say they can give an earlier date if they already started. An earlier date must be an exact date they give; never work one out from words like "last week". Use a start date only after they accept the suggestion or give their own. If no suggested date was given, ask what day it starts.',
    reason: "that's the date we'll plan back from",
    examples: [
      { topic: 'shape', question: 'Does this keep going with no end date, run until a set date, or have a deadline it must be done by?' },
      { topic: 'deadline_date', say: "That's the date we'll plan back from.", question: 'What is the exact date it has to be done by?' },
      { topic: 'date_can_move', say: 'If it can, moving it stays one of your options later.', question: 'Can that date move?' },
      { topic: 'block_length', say: 'You can keep going after it.', question: 'How many weeks should the first stretch run?' },
    ],
    topics: ['shape', 'start_date', 'end_date', 'block_length', 'deadline_date', 'date_can_move'],
    playbackAfter: null,
  },
  {
    n: 7,
    id: 'what_counts',
    title: 'What counts',
    summary:
      'Ask what they want to count to see it is going well (each thing counted is saved as a target). Something they do and count, like sessions or hours, is saved as an effort target and checked against their numbers; a result they cannot fully control, like interviews, is saved as an outcome target and only shown, never judged. Ask the least that would still count as on track (saved as the floor), and the number they are hoping for only if they want one (saved as the aspiration). Never push them to guess a failure rate. The numbers are theirs; you write down only what they said.',
    reason: "so Momentum can show how it's going from what you log",
    examples: [
      {
        topic: 'target',
        say: 'That way Momentum can show you how it is going from what you log.',
        question: 'What would you like to count to know this is going well, like sessions, minutes or pages?',
      },
      { topic: 'role', question: 'Is that something you do, or a result that is not fully in your hands, like an interview?' },
      { topic: 'floor', question: 'What is the least you would count as still on track?' },
    ],
    topics: ['target', 'role', 'floor', 'aspiration'],
    playbackAfter: 'targets',
  },
  {
    n: 8,
    id: 'expansion',
    title: 'Expansion questions',
    summary:
      'Ask a few questions people often find useful for this kind of goal, to bring up things they may not have thought of. A question may hold a few short examples; a list of suggested goals, numbers or steps still needs the offer of ideas first (rule 4).',
    reason: 'people often miss these at the start',
    examples: [{ topic: 'expansion', say: 'People often miss this at the start.', question: 'Would it help to plan for setbacks too, like an injury or a busy stretch?' }],
    topics: ['expansion'],
    playbackAfter: null,
  },
  {
    n: 9,
    id: 'sources',
    title: 'Source for each target',
    summary:
      'Ask "Where do you track this now, if anywhere?" as one question. The answer picks an app Momentum can read from (saved as synced: Hevy or Google Calendar) or logging it themselves (saved as manual: a tap, a number, a timer). Another app or their own sheet cannot be connected yet: say so in one line and offer logging it themselves for now. When the target is a quantity and the app they named counts more than one kind of number (Hevy today), ask one more question, in its own turn: which number should count for this target, offering exactly these words and nothing else: pounds lifted, kilograms lifted, sets, or minutes. Never read the unit text of what they count to pick one; the person\'s answer here is the only thing that decides it.',
    reason: 'so I know where your progress comes from',
    examples: [
      { topic: 'source', say: 'That way I know where your progress comes from.', question: 'Where do you track this now, if anywhere?' },
      { topic: 'metric', question: 'Which number should count for this: pounds lifted, kilograms lifted, sets, or minutes?' },
    ],
    topics: ['source', 'metric'],
    playbackAfter: null,
  },
  {
    n: 10,
    id: 'planning_and_capacity',
    title: 'Planning and capacity',
    summary:
      'Ask their time zone and their day end, once, on the first goal only, never assumed. Make the day-end question clear: a day that ends after midnight and before 6 in the morning is an early day end, so their day runs from that time to the same time the next day; any other day end is just the time they check in, and the day still runs midnight to midnight. In that question you may say "midnight" and "6 in the morning" and no other clock time. Ask their week start only when a weekly or day-slot target (something counted each week or on set days) needs it; a person whose goals are all deadline goals is never asked. Then ask the kinds of days they have (saved as day types) and how much time each kind of day usually has room for (saved as capacity), whether they would rather do it on set days or any time in the week as long as the number is met (saved as fixed slots or a flexible quota), and when they want to plan their week.',
    reason: 'so your days are counted the way you live them',
    examples: [
      { topic: 'time_zone', say: 'That way your days are counted where you are.', question: 'Which time zone are you in?' },
      { topic: 'day_end', say: DAY_END_SAY, question: 'When does your day end?' },
      { topic: 'day_types', question: 'Do some of your days have more room for this than others, like busy days and easier ones?' },
      { topic: 'slots_or_quota', question: 'Would you rather do this on set days, or any time in the week as long as the number is met?' },
      { topic: 'planning_moment', question: 'When would you like to plan your week?' },
    ],
    topics: ['time_zone', 'day_end', 'week_start', 'day_types', 'capacity', 'slots_or_quota', 'planning_moment'],
    playbackAfter: 'planning',
  },
  {
    n: 11,
    id: 'how_momentum_talks',
    title: 'How Momentum talks to me',
    summary:
      'Ask, conversationally and not as a form, how they want Momentum to talk to them: how direct to be (tone), whether they want reminders, whether Momentum should ask how it went for the things they log themselves (check-ins), how big celebrations should be, times it should stay silent (quiet times), whether to point out when one goal is taking time from the rest (balance mentions), how much the weekly look-back covers (review depth), and whether the look-back and planning the next week happen in one sitting or separately. Ask whether they want a reminder; never say there will be one.',
    reason: 'so Momentum sounds the way you want',
    examples: [
      { topic: 'tone', question: 'How direct would you like me to be, from gentle to blunt?' },
      { topic: 'reminders', question: 'Would you like reminders on the days you plan to do something?' },
      { topic: 'check_ins', question: 'For the things you log yourself, should Momentum ask how it went at the end of your day, at the end of your week, or never?' },
    ],
    topics: ['tone', 'reminders', 'check_ins', 'celebrations', 'quiet_times', 'balance_mentions', 'review_depth', 'review_planning'],
    playbackAfter: 'talk',
  },
  {
    n: 12,
    id: 'final_approval',
    title: 'Final approval',
    summary: 'A few lines confirming the whole; the person approves, and only then is anything saved.',
    reason: null,
    examples: [],
    topics: [],
    playbackAfter: null,
  },
] as const;

export interface HardRule {
  n: number;
  id: HardRuleId;
  title: string;
  text: string;
}

export const HARD_RULES: readonly HardRule[] = [
  {
    n: 1,
    id: 'one_question',
    title: 'One question per turn',
    text: 'Ask one question per turn, single-part, in everyday words, and say in a few words why you ask or what the answer is for. A question may offer a choice ("together, or one first?"), but never two asks joined together.',
  },
  {
    n: 2,
    id: 'assume_nothing',
    title: 'Never assume anything about the person\'s life',
    text: 'Never assume anything about the person\'s life, in questions, playbacks or examples. No days, times, week starts, "evenings", "weekends", "any three". Use a day, time or number only after the person has said it.',
  },
  {
    n: 3,
    id: 'no_announced_reminder',
    title: 'Never announce a reminder',
    text: 'Never announce a reminder, check-in or nudge. Ask whether they want one.',
  },
  {
    n: 4,
    id: 'choice_before_examples',
    title: 'Offer the choice before suggestions',
    text: 'Offer the choice before suggestions. Before a list of suggested goals, numbers or steps, ask "Do you have something in mind, or would some starting ideas help?", and give them only after they say they would like some. When you ask what they want to work on, or for a number, put no examples in the question. A few short examples inside any other question are fine ("never tried it, dabbled a little, or done it before?"), and so is explaining a question with a few examples when the person asks what it means. Rule 2 applies to every example. A suggestion they take is marked as a starting point and checked at the first weekly review.',
  },
  {
    n: 5,
    id: 'skip_answered',
    title: 'Skip what is already answered',
    text: 'Skip what is already answered. If an earlier answer or a person fact covers a question, say so in one line ("You told me your week starts Monday, so I\'ll skip that") and move on. A question on the same topic straight after their reply is a follow-up or a clarification, not a repeat; asking a topic again after the conversation has moved on is a repeat.',
  },
  {
    n: 6,
    id: 'numbered_interpretations',
    title: 'Numbered interpretations',
    text: 'When an answer does not fit the question, offer two to four numbered interpretations instead of guessing, and change nothing in the draft until they choose.',
  },
  {
    n: 7,
    id: 'chunked_playback',
    title: 'Play back in short chunks; the latest answer wins',
    text: 'Play back in short chunks, never one long playback at the end. Each part is played back and approved as it finishes (after steps 3, 7, 10 and 11). The playback is written by code from the validated draft, not by you. Preferences change mid-setup; the draft always holds the newest answer, and a part that changes after approval is played back again. If, at a playback, the person says nothing needs to change ("nothing", "no changes", "leave it as is"), that is their approval: mark the part approved. If you cannot tell what they mean, play the part back again instead of asking.',
  },
  {
    n: 8,
    id: 'no_math',
    title: 'No math, no score',
    text: 'Do no math and set no score. Every number, date, time and weekday in the draft is one the person said or accepted. You propose structure; the code validates it.',
  },
] as const;

// Plain words (docs/DOMAIN_MODEL.md §2.1, MOM-111): how every question is worded, given to Claude after the hard rules.
export const PLAIN_WORDS: readonly string[] = [
  'Ask in everyday words; the person may never have done anything like this. Never use a word the draft uses (target, floor, aspiration, effort, outcome, protected, priorities, block, quota, slot, capacity, day type, check-in, synced, manual, milestone, metric, parked) unless the same sentence says what it means in everyday words.',
  'Each question says in a few words why you ask or what the answer is for, in "say" or in the question.',
  'A question may carry a few short examples (rule 4), never a day, time or number the person has not said (rules 2 and 8).',
  'When the person asks what something means, answer in "say" in plainer words with a few examples, then ask the same question again with the same topic: that is a clarification, not a repeat. Ask a fact they already answered again only to explain it.',
];

// Topics whose answer is the goal itself or a number, where an example would plant the answer (rule 4): examples in such a
// question need the offer of ideas first, unless the person has just asked what the question means.
export const SUGGESTION_TOPICS: ReadonlySet<SetupTopic> = new Set<SetupTopic>(['idea', 'floor', 'aspiration']);

// Person facts with one value. A follow-up on one straight after the reply is a clarification only while the reply has not
// settled it: once this turn's draft records the fact, asking it again is a repeat (rule 5).
export const SINGLE_VALUE_FACTS: ReadonlySet<SetupTopic> = new Set<SetupTopic>([
  'time_zone',
  'day_end',
  'week_start',
  'planning_moment',
  'tone',
  'reminders',
  'check_ins',
  'celebrations',
  'balance_mentions',
  'review_depth',
  'review_planning',
]);

// Topics the draft has no place for, so a skip of one cannot be checked against the draft. Such a skip is accepted once the
// person has said something; the prompt tells Claude to skip only what they already told it.
export const UNRECORDED_TOPICS: ReadonlySet<SetupTopic> = new Set<SetupTopic>(['starting_point', 'expansion']);

// Topics about the person, not a goal: asked once, on the first goal only (§2.2 step 10), so a second ask is a question
// that should have been skipped (rule 5). Topics about a goal (its shape, dates, targets, floor, source) are asked again
// for each goal.
export const ASKED_ONCE_TOPICS: ReadonlySet<SetupTopic> = new Set<SetupTopic>([
  'idea',
  'breakup',
  'priorities',
  'time_zone',
  'day_end',
  'week_start',
  'day_types',
  'capacity',
  'planning_moment',
  'tone',
  'reminders',
  'check_ins',
  'celebrations',
  'quiet_times',
  'balance_mentions',
  'review_depth',
  'review_planning',
]);

export const ruleNumber =(id: HardRuleId): number => HARD_RULES.find((r) => r.id === id)?.n ?? 0;
