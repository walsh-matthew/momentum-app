// The setup conversation's order and hard rules as data (docs/DOMAIN_MODEL.md §2.1, §2.2, with MOM-125's day end in
// step 10). The prompt, the checks and the tests all read these, so the wording of the doc is kept in one place.
// Pure: no database, no model, no network.

import type { HardRuleId, SetupChunk, SetupTopic } from '@/types/setup';

// An example question for a step, in the plain style the step wants: the core ask in everyday words, at most about 12 words,
// shown in bold; and under it, in regular weight, a detail line with any short examples and the reason, which says what the
// answer is used for (MOM-111 round 2, findings 1 and 10). The question carries the meaning on its own; a lead-in only
// reacts to the last answer, so the examples have none, except the day-end explanation (MOM-111 finding 4). The prompt shows
// them; tests check each one passes the hard rules and the plain-words checks on its own topic, uses no internal word
// unexplained, and names no activity (finding 5).
export interface StepExample {
  topic: SetupTopic;
  say?: string;
  question: string;
  detail?: string;
}

export interface SetupStep {
  n: number;
  id: string;
  title: string;
  // What Claude asks in this step. Every internal word in it (target, floor, protected and the like) sits in a sentence
  // that says what it means in everyday words, because Claude repeats the words it is given (MOM-111).
  summary: string;
  // Why it asks, as a sentence Claude can put in the detail line when the reason is not plain: what the answer is used for
  // ("We plan back from that day."), never that people often miss it (MOM-111 round 2, finding 10). Null for a question
  // that needs none, and for the final step, which asks nothing.
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
    reason: null,
    examples: [{ topic: 'idea', question: 'What would you like to work on?', detail: 'Big or small, in your own words.' }],
    topics: ['idea'],
    playbackAfter: null,
  },
  {
    n: 2,
    id: 'why',
    title: 'Why',
    summary: 'Ask why it matters to them, in their own words.',
    reason: null,
    examples: [{ topic: 'why', question: 'Why does this matter to you?' }],
    topics: ['why'],
    playbackAfter: null,
  },
  {
    n: 3,
    id: 'break_up',
    title: 'Break it up',
    summary:
      'Ask whether this is one goal or a few separate ones. If several, first ask what the goals are, as its own question tagged breakup, then ask whether to start them together or one first, mentioning once, in that question\'s detail, that starting with fewer usually works better; it is a suggestion, never a limit. A goal they set aside for now (saved as parked) gets a way back: a date, a season or condition in their words, or only when they ask.',
    reason: 'Each goal gets its own plan.',
    examples: [
      {
        topic: 'breakup',
        question: 'Is this one goal, or a few separate ones?',
        detail: 'Getting in shape might be one goal, or separate ones like moving more and eating better. Each goal gets its own plan.',
      },
      { topic: 'sequencing', question: 'Would you like to start them together, or one first?', detail: 'Starting with fewer usually works better, but it is up to you.' },
      {
        topic: 'parked_return',
        question: 'When should this one come back?',
        detail: 'On a date, when something happens, or only when you ask. Until then it stays out of your plan.',
      },
    ],
    topics: ['breakup', 'sequencing', 'parked_return'],
    playbackAfter: 'goals',
  },
  {
    n: 4,
    id: 'what_else_matters',
    title: 'What else matters',
    summary:
      'Ask what else in their life matters right now that this plan should not crowd out, in their words (saved as protected priorities), before any detailed planning. Put a few short examples in the detail, such as family time, health or something they enjoy, and never assume which of them apply. When what the goal will take from their week is already known, name it in the detail. Use the words crowd out, not protect, with the person.',
    reason: 'Your plan keeps room for these.',
    examples: [
      {
        topic: 'priorities',
        question: "What else matters right now that this shouldn't crowd out?",
        detail: 'Like family time, your health, or something you enjoy. Your plan keeps room for these.',
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
      'Ask where they are with it today, with a few short examples in the detail, such as never tried it, dabbled a little, or done it before. This often shows a natural first step to aim for (saved as a milestone).',
    reason: 'Your plan starts from there.',
    examples: [
      { topic: 'starting_point', question: 'Where are you with this today?', detail: 'Never tried it, dabbled a little, or done it before. Your plan starts from there.' },
    ],
    topics: ['starting_point'],
    playbackAfter: null,
  },
  {
    n: 6,
    id: 'shape_and_timeframe',
    title: 'Shape and timeframe',
    summary:
      'Ask whether it keeps going with no end date, runs until a set end date, or has a deadline it must be done by (saved as ongoing, finite or project). For one that keeps going, ask how many weeks the first stretch should run (saved as the first block); never say block to the person. Never work a date out yourself. When they answer with a relative day ("Monday", "in two weeks", "the 15th"), code works the date out and shows it to them, or gives it to you in a "Date note from code" at the end of the newest message: then show that date in a proposal for them to accept, and record it only after they accept. A length of time ("two months", "8 weeks") is the same: code counts it from the start date and shows it, or gives it to you in a "Length note from code" with the exact proposal to show; for a goal that keeps going it is a first stretch in whole weeks. For a deadline, ask as a separate question, in its own turn, whether the date can move; if it can, moving it stays one of their options later. For the start date, show the date given as "Suggested start date" at the end of the newest message, in a proposal they can accept or change, and mention they can give an earlier date if they already started. Use a start date only after they accept the suggestion or give their own. If no suggested date was given, ask what day it starts.',
    reason: 'We plan back from that day.',
    examples: [
      {
        topic: 'shape',
        question: 'Does it keep going, end on a date, or have a deadline?',
        detail: 'It decides how your plan is laid out: in stretches that keep going, up to an end date, or back from a deadline.',
      },
      { topic: 'deadline_date', question: 'Which day does it have to be done by?', detail: 'We plan back from that day.' },
      { topic: 'date_can_move', question: 'Could that date move if it had to?', detail: 'If it can, moving it stays one of your options later.' },
      { topic: 'block_length', question: 'How many weeks should the first stretch run?', detail: 'You can keep going after it ends.' },
    ],
    topics: ['shape', 'start_date', 'end_date', 'block_length', 'deadline_date', 'date_can_move'],
    playbackAfter: null,
  },
  {
    n: 7,
    id: 'what_counts',
    title: 'What counts',
    summary:
      'Ask what they want to count to see it is going well (each thing counted is saved as a target). Something they do and count, like sessions or hours, is saved as an effort target and checked against their numbers; a result they cannot fully control, like interviews, is saved as an outcome target and only shown, never judged. Ask the least that would still count as on track (saved as the floor), and the number they are hoping for only if they want one (saved as the aspiration). Never push them to guess a failure rate. The numbers are theirs; you write down only what they said. Momentum does not keep an upper limit yet (the most they would want to do): if they give one, say in one short line in "say" that it is not kept yet, and write nothing for it.',
    reason: 'Momentum shows your progress from what you log.',
    examples: [
      {
        topic: 'target',
        question: "What would you like to count to know it's going well?",
        detail: 'Like sessions, minutes or pages. Momentum shows your progress from what you log.',
      },
      {
        topic: 'role',
        question: 'Is that something you do, or a result outside your control?',
        detail: 'Like an interview. What you do is checked against your number; a result is only shown, never judged.',
      },
      { topic: 'floor', question: 'What is the least you would count as still on track?', detail: 'A week at this number still counts as a good week.' },
    ],
    topics: ['target', 'role', 'floor', 'aspiration'],
    playbackAfter: 'targets',
  },
  {
    n: 8,
    id: 'expansion',
    title: 'Expansion questions',
    summary:
      'Ask a few questions that bring up things worth deciding now for this kind of goal, starting with what should happen to it when life gets in the way. Its detail may hold a few short examples; a list of suggested goals, numbers or steps still needs the offer of ideas first (rule 4).',
    reason: null,
    examples: [
      {
        topic: 'expansion',
        question: 'What should happen to this goal when life gets in the way?',
        detail: "Say you're sick or work gets busy: it could pause, drop to your minimum, or keep going as planned.",
      },
    ],
    topics: ['expansion'],
    playbackAfter: null,
  },
  {
    n: 9,
    id: 'sources',
    title: 'Source for each target',
    summary:
      'Ask "Where do you track this now, if anywhere?" as one question. The answer picks an app Momentum can read from (saved as synced: Hevy or Google Calendar) or logging it themselves (saved as manual: a tap, a number, a timer). Voice-to-text may misspell an app ("Heavy" is Hevy); a "Source note from code" says which app they mean. Another app (an Apple Watch, Strava and the like) or their own sheet cannot be read yet: say so in one short line in "say" and record logging it themselves (manual) for now, offering nothing else. One thing they count may be tracked more than one way: "Hevy for lifts and I\'ll log my runs myself" for one thing they count is Hevy, read from the app (saved as synced), plus logging it themselves (saved as manual), two sources on that target, with no label of which activity each covers, and what they count stays as they approved it. When the target is a quantity and the app they named counts more than one kind of number (Hevy today), ask one more question, in its own turn: which number should count for this target, offering exactly these words and nothing else: pounds lifted, kilograms lifted, sets, or minutes. Never read the unit text of what they count to pick one; the person\'s answer here is the only thing that decides it.',
    reason: 'If an app Momentum can read has it, it counts it for you; otherwise you log it with a tap.',
    examples: [
      {
        topic: 'source',
        question: 'Where do you track this now, if anywhere?',
        detail: 'If an app Momentum can read has it, it counts it for you; otherwise you log it with a tap.',
      },
      { topic: 'metric', question: 'Which number should count for this?', detail: 'Pounds lifted, kilograms lifted, sets, or minutes.' },
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
    reason: 'Your days are counted the way you live them.',
    examples: [
      { topic: 'time_zone', question: 'Which time zone are you in?', detail: 'Your days start and end where you are.' },
      { topic: 'day_end', say: DAY_END_SAY, question: 'When does your day end?' },
      {
        topic: 'day_types',
        question: 'Do some days have more room for this than others?',
        detail: 'Like busy days and easier ones. Your plan puts more on the days with more room.',
      },
      {
        topic: 'slots_or_quota',
        question: 'Would you rather do this on set days, or any time?',
        detail: "Any time means any day works, as long as the week's number is met.",
      },
      { topic: 'planning_moment', question: 'When would you like to plan your week?', detail: 'Your look back at the week happens then too.' },
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
    reason: 'Momentum words things to you that way.',
    examples: [
      { topic: 'tone', question: 'How direct would you like me to be?', detail: 'Anywhere from gentle to blunt. Momentum words things to you that way.' },
      { topic: 'reminders', question: 'Would you like reminders on the days you plan something?' },
      {
        topic: 'check_ins',
        question: 'Should Momentum ask how it went for things you log yourself?',
        detail: 'At the end of your day, at the end of your week, or never.',
      },
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
    text: 'Ask one question per turn, single-part, in everyday words: the core ask in "question", in at most about 12 words. Where the reason is not plain, put it in "detail", with any short examples ("We plan back from that day."). A question may offer a choice ("together, or one first?"), but never two asks joined together, and "detail" never asks anything.',
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
    text: 'Offer the choice before suggestions. Before a list of suggested goals, numbers or steps, ask "Do you have something in mind, or would some starting ideas help?", and give them only after they say they would like some. When they ask for ideas, examples or a recommendation in any answer, or pick a "starting ideas" option, that is asking: give them. When you ask what they want to work on, or for a number, put no examples in the question. A few short examples inside any other question are fine ("never tried it, dabbled a little, or done it before?"), and so is explaining a question with a few examples when the person asks what it means. Rule 2 applies to every example. A suggestion they take is marked as a starting point and checked at the first weekly review.',
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
    text: 'Play back in short chunks, never one long playback at the end. Each part is played back and approved as it finishes (after steps 3, 7, 10 and 11). The playback is put together by code from the validated draft, not by you; the only words of yours in it are the clean versions of the person\'s words you give in "plain", which code checks first. Preferences change mid-setup; the draft always holds the newest answer, and a part that changes after approval is played back again. If, at a playback, the person says nothing needs to change ("nothing", "no changes", "leave it as is"), that is their approval: mark the part approved. If you cannot tell what they mean, play the part back again instead of asking.',
  },
  {
    n: 8,
    id: 'no_math',
    title: 'No math, no score',
    text: 'Do no math and set no score. Every number, date, time and weekday in the draft is one the person said or accepted. Never work out a date from words like "Monday" or "in two weeks": code does that and shows it to them. You propose structure; the code validates it.',
  },
] as const;

// Plain words (docs/DOMAIN_MODEL.md §2.1, MOM-111): how every question is worded, given to Claude after the hard rules.
export const PLAIN_WORDS: readonly string[] = [
  'Ask in everyday words; the person may never have done anything like this. Never use a word the draft uses (target, floor, aspiration, effort, outcome, protected, priorities, block, quota, slot, capacity, day type, check-in, synced, manual, milestone, metric, parked) unless the same sentence says what it means in everyday words.',
  'The question carries the meaning on its own, in plain words, in at most about 12 words; it is shown in bold. Its examples and its reason go in "detail", shown under it in regular weight, as plain sentences with no question mark. The reason says what the answer is used for ("We plan back from that day."), never that people often miss it; an abstract word gets a concrete example there ("Say you\'re sick or work gets busy").',
  '"say" is a lead-in: it only reacts to their last answer, in one short line ("Got it, one goal to start."), or it is "". It never previews the question ("Next, I\'ll check...", "Next is the start date", "Let\'s talk about your week").',
  'A question may carry a few short examples (rule 4), never a day, time or number the person has not said (rules 2 and 8).',
  'Never name an activity (exercising, working out, running, lifting, the gym, swimming and the like) the person has not said, in any question, lead-in or example. Use their own words, or general ones like moving more.',
  'Write a date the way people say it ("Monday, Nov 2", "today"), never as 2026-11-02, in "say", "question", "detail" and "options". The draft still writes YYYY-MM-DD. On a date question or a date proposal, "say" never repeats the date; the question shows it. When a date is known (the suggested start date, a date the person said, a date or length note from code), show it as a "proposal" they accept with Yes; ask a date question with no date in it only when none is known, and never ask for an "exact date": the screen gives them a date picker.',
  'Options are written from this conversation, never a fixed list. On starting ideas, interpretations and a proposal, each option that holds a number says what is counted, in the person\'s words, and its period ("2 sessions a week", "20 minutes a day"), never a bare number or "3 a week". The numbers follow the goal and how often it happens, from what the person said: something done daily gets amounts a day, or days a week; something weekly gets amounts a week; never a fixed scale such as 1 to 7. The "detail" of an offer of ideas, and of starting ideas, says what the options count and that they are starting points ("Sessions a week, from what you said about where you are now.").',
  'When the person asks what something means, answer in "say" in plainer words with a few examples, then ask the same question again with the same topic: that is a clarification, not a repeat. Ask a fact they already answered again only to explain it.',
  'When the person asks for a recommendation or advice, give one. You may use well-established general knowledge, framed as "research suggests" (for example, that habits take about two months on average to become automatic, with a wide range), and offer it as a "proposal" they can accept with one tap. Never assume anything about their own life.',
  'For each free-text value you write in the model (a goal\'s title and why, a target\'s title, a priority and the like), add an entry to "plain": a clean version of the person\'s words in their own voice, as they would write it ("I wanna get fit cuz of my kids" becomes "I want to get fit because of my kids"). Fix grammar, slang and voice-to-text; add no activity, number, date, time or weekday they did not say; keep it one sentence. Code checks it, the playback shows it, and once they approve it, it is what is saved.',
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
