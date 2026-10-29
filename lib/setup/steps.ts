// The setup conversation's order and hard rules as data (docs/DOMAIN_MODEL.md §2.1, §2.2, with MOM-125's day end in
// step 10). The prompt, the checks and the tests all read these, so the wording of the doc is kept in one place.
// Pure: no database, no model, no network.

import type { HardRuleId, SetupChunk, SetupTopic } from '@/types/setup';

export interface SetupStep {
  n: number;
  id: string;
  title: string;
  // What Claude asks in this step.
  summary: string;
  topics: SetupTopic[];
  // The part played back for approval once this step is done (§2.2 step 12).
  playbackAfter: SetupChunk | null;
}

export const SETUP_STEPS: readonly SetupStep[] = [
  {
    n: 1,
    id: 'idea',
    title: 'The idea',
    summary: "Ask for the idea in the person's own words.",
    topics: ['idea'],
    playbackAfter: null,
  },
  {
    n: 2,
    id: 'why',
    title: 'Why',
    summary: 'Ask why it matters to them.',
    topics: ['why'],
    playbackAfter: null,
  },
  {
    n: 3,
    id: 'break_up',
    title: 'Break it up',
    summary:
      'Ask whether this is one goal or several. If several, first ask what the goals are, as its own question tagged breakup, then ask together or one first. Say once that starting fewer goals usually works better; it is a suggestion, never a limit. Goals set aside are parked with a way back: a date, a season or condition in their words, or only when they ask.',
    topics: ['breakup', 'sequencing', 'parked_return'],
    playbackAfter: 'goals',
  },
  {
    n: 4,
    id: 'what_else_matters',
    title: 'What else matters',
    summary: 'Ask which life areas are protected (for example family or sleep), in their words, before any detailed planning.',
    topics: ['priorities'],
    playbackAfter: null,
  },
  {
    n: 5,
    id: 'starting_point',
    title: 'Starting point',
    summary: 'Ask where they are now. This often surfaces a natural first milestone.',
    topics: ['starting_point'],
    playbackAfter: null,
  },
  {
    n: 6,
    id: 'shape_and_timeframe',
    title: 'Shape and timeframe',
    summary:
      'Ask whether the goal is ongoing (and the length of a first block), has an end date, or has a deadline. Always ask for the exact date; never infer a week or work a date out from words like "the week before". For a deadline, ask as a separate question, in its own turn, whether the date can move. For the start date, show the date given as "Suggested start date" at the end of the newest message, in a proposal they can accept or change, and say they can give an earlier date if they already started. An earlier date must be an exact date they give; never work one out from words like "last week". Use a start date only after they accept the suggestion or give their own. If no suggested date was given, ask what day it starts.',
    topics: ['shape', 'start_date', 'end_date', 'block_length', 'deadline_date', 'date_can_move'],
    playbackAfter: null,
  },
  {
    n: 7,
    id: 'what_counts',
    title: 'What counts',
    summary:
      'Ask what counts: effort targets and outcome targets, the floor, and an aspiration only if they want one. Never push them to guess a failure rate. The numbers are theirs; you write down only what they said.',
    topics: ['target', 'role', 'floor', 'aspiration'],
    playbackAfter: 'targets',
  },
  {
    n: 8,
    id: 'expansion',
    title: 'Expansion questions',
    summary: 'Ask a few best-practice questions to surface unknown unknowns. Offer the choice before any examples.',
    topics: ['expansion'],
    playbackAfter: null,
  },
  {
    n: 9,
    id: 'sources',
    title: 'Source for each target',
    summary:
      'Ask "Where do you track this now, if anywhere?" as one question. The answer picks a synced app (Hevy or Google Calendar) or manual (a tap, a number, a timer). Another app or their own sheet cannot be connected yet: say so in one line and offer manual for now. When the target is a quantity and the app they named counts more than one kind of number (Hevy today), ask one more question, in its own turn: which number should count for this target, offering exactly these words and nothing else: pounds lifted, kilograms lifted, sets, or minutes. Never read the target\'s own unit text to pick one; the person\'s answer here is the only thing that decides it.',
    topics: ['source', 'metric'],
    playbackAfter: null,
  },
  {
    n: 10,
    id: 'planning_and_capacity',
    title: 'Planning and capacity',
    summary:
      'Ask their time zone and their day end, once, on the first goal only, never assumed. Make the day-end question clear: a day that ends after midnight and before 6 in the morning is an early day end, so their day runs from that time to the same time the next day; any other day end is just the time they check in, and the day still runs midnight to midnight. In that question you may say "midnight" and "6 in the morning" and no other clock time. Ask their week start only when a weekly or day-slot target needs it; a person whose goals are all deadline goals is never asked. Then their day types and capacity, fixed slots or a flexible quota, and when they want to plan their week.',
    topics: ['time_zone', 'day_end', 'week_start', 'day_types', 'capacity', 'slots_or_quota', 'planning_moment'],
    playbackAfter: 'planning',
  },
  {
    n: 11,
    id: 'how_momentum_talks',
    title: 'How Momentum talks to me',
    summary:
      'Ask, conversationally and not as a form, about tone, reminders, check-ins for manual targets, celebrations, quiet times, balance mentions and review depth. Ask whether they want a reminder; never say there will be one.',
    topics: ['tone', 'reminders', 'check_ins', 'celebrations', 'quiet_times', 'balance_mentions', 'review_depth', 'review_planning'],
    playbackAfter: 'talk',
  },
  {
    n: 12,
    id: 'final_approval',
    title: 'Final approval',
    summary: 'A few lines confirming the whole; the person approves, and only then is anything saved.',
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
    text: 'Ask one question per turn, single-part, in plain words. A question may offer a choice ("together, or one first?"), but never two asks joined together.',
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
    title: 'Offer the choice before examples',
    text: 'Offer the choice before any example: "Do you have something in mind, or would some starting ideas help?" Give ideas only after they say they would like some. A suggestion they take is marked as a starting point and checked at the first weekly review.',
  },
  {
    n: 5,
    id: 'skip_answered',
    title: 'Skip what is already answered',
    text: 'Skip what is already answered. If an earlier answer or a person fact covers a question, say so in one line ("You told me your week starts Monday, so I\'ll skip that") and move on.',
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
