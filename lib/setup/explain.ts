// "What does this mean?" answered by code first (MOM-180, docs/DOMAIN_MODEL.md §2.1 and §4.2 principle 13). Every setup question has a fixed
// explanation, picked by the question's topic and written here from the step's reason and examples (lib/setup/steps.ts), so a tap on
// the link costs no Claude call. The owner approved these exact words in Jira comments 10355 and 10356 on MOM-180.
//
// Rules the words follow:
// - principle 1: no day, time or number the person hasn't said (the day-end explanation is the one place that says "midnight" and "6 in
//   the morning", as the rule for the day-end question allows, steps.ts DAY_END_SAY);
// - principle 12: nothing about the person's whole week or free time;
// - a number question's words use the person's own counted thing when the draft holds it (lib/setup/numbers.ts).
//
// "Still not clear? Ask Claude" shows only on the concept topics: what to count, the least that counts and the goal's shape. Every other
// topic gets the explanation alone; its typed answer box still reaches Claude, so nobody is trapped. Pure: no model, no network.

import type { SetupDraft, SetupTopic } from '@/types/setup';
import { numberHelp, numberLevelHelp } from './numbers';
import { DAY_END_SAY } from './steps';

export const EXPLANATIONS: Partial<Record<SetupTopic, string>> = {
  idea: 'This is the goal you want to work on. It can be anything you would like to change, build or keep up.',
  why: 'This is your reason, in your own words. There is no wrong answer.',
  breakup: 'Sometimes one big idea is really a few goals. Splitting it up lets you start with one and leave the rest for later.',
  sequencing: 'Together means every goal is in your plan from the start. One first means the others wait until you bring them back.',
  parked_return: 'This is how a goal you set aside finds its way back into your plan.',
  priorities: 'These are the things in your life, besides this goal, that your plan should not crowd out.',
  starting_point: 'This is where you are with it today. If none of the choices fit, say it in your own words.',
  shape: 'Some goals keep going with no end date, some run until a date you set, and some have a deadline they must be done by.',
  start_date: 'This is the day your plan starts. You can give an earlier day if you already started.',
  end_date: 'This is the day your goal ends. Your plan runs up to it.',
  deadline_date: 'This is the day it has to be done by.',
  date_can_move: 'This is whether the date has any give in it. Either answer is fine.',
  block_length: 'Your plan is laid out in stretches. This is how many weeks the first one runs.',
  target: 'This is the thing you will count to know it is going well. It can be anything you can add up.',
  role: 'Something you do, like sessions, is up to you. A result depends on more than you.',
  source: 'This is where the count comes from. Some apps Momentum can read; anything else you log yourself.',
  metric: 'Some apps record more than one number for the same thing. This picks the one that counts toward your goal.',
  time_zone: 'Momentum uses the zone you choose, so a day is counted the way you live it.',
  day_end: 'This is the time you would say your day is done.',
  week_start: 'This is the day a new week begins for you.',
  day_types: 'Naming the kinds of days you have lets you say how much time each one has.',
  capacity: 'This is about how much time each kind of day usually has for this.',
  slots_or_quota: 'On set days means you pick the days for it. Any day leaves it open.',
  planning_moment: 'Pick the day and the time that suit you best.',
  tone: "This sets how direct or how gentle Momentum's words are.",
  celebrations: 'This sets how much Momentum celebrates with you.',
  review_depth: 'This sets how much your weekly look-back covers, from a short recap to a few questions.',
  review_planning: 'This sets whether looking back and planning the next week happen in one sitting or separately.',
};

// What a number question says when the draft holds no counted thing yet (the words with the thing come from lib/setup/numbers.ts).
const FLOOR_PLAIN = 'This is the number you could settle for in a hard week.';
const ASPIRATION_PLAIN = 'This is the number you are hoping for, if you want one.';
const LEVEL_PLAIN = 'A number you could settle for in a hard week is one answer. A number you are aiming for is the other.';

// The concept topics: the ones where a person may still be unsure after the explanation (decision 10354.2). "What does this mean?" on
// them also offers "Still not clear? Ask Claude".
export const ASK_CLAUDE_TOPICS: ReadonlySet<SetupTopic> = new Set<SetupTopic>(['target', 'floor', 'number_level', 'shape']);

export interface Explanation {
  text: string;
  // Whether "Still not clear? Ask Claude" shows under the text.
  askClaude: boolean;
}

// The explanation for a question's topic, or null when code has none (a card with no topic, or one nothing asks any more). With the
// draft, a number question's words carry the person's own counted thing.
export function explanationFor(topic: SetupTopic | string | null, draft: SetupDraft | null = null, today: string | null = null): Explanation | null {
  if (topic === null) return null;
  const t = topic as SetupTopic;
  const askClaude = ASK_CLAUDE_TOPICS.has(t);
  if (t === 'floor' || t === 'aspiration') {
    const help = draft ? numberHelp(draft, t, today) : null;
    return { text: help ?? (t === 'floor' ? FLOOR_PLAIN : ASPIRATION_PLAIN), askClaude };
  }
  if (t === 'number_level') {
    return { text: (draft ? numberLevelHelp(draft, today) : null) ?? LEVEL_PLAIN, askClaude };
  }
  const text = EXPLANATIONS[t];
  return text ? { text, askClaude } : null;
}
