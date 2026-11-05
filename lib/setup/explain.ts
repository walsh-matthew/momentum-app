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
  idea: 'This is the goal you want to work on, in your own words. Big or small is fine.',
  why: 'This is your reason, in your own words. There is no wrong answer.',
  breakup:
    'Sometimes one big idea is really a few goals. Getting in shape might be one goal, or separate ones like moving more and eating better. Each goal gets its own plan.',
  sequencing: 'You can start your goals together, or begin with one. It is up to you.',
  parked_return:
    'A goal you set aside stays out of your plan until it comes back. It can come back on a date, when something happens, or only when you ask.',
  priorities:
    'These are the things in your life, besides this goal, that your plan should not crowd out, like family time, your health, or something you enjoy.',
  starting_point: 'This is where you are with it today: never tried it, dabbled a little, or done it before. Your plan starts from there.',
  shape:
    'Some goals keep going with no end date, some run until a date you set, and some have a deadline they must be done by. It decides how your plan is laid out: in stretches that keep going, up to an end date, or back from a deadline.',
  start_date: 'This is the day your plan starts. You can give an earlier day if you already started.',
  end_date: 'This is the day your goal ends. Your plan runs up to it.',
  deadline_date: 'This is the day it has to be done by. We plan back from that day.',
  date_can_move: 'If the date can move, moving it stays one of your options later.',
  block_length: 'Your plan is laid out in stretches. This is how many weeks the first one runs. You can keep going after it ends.',
  target:
    'This is the thing you will count to know it is going well, like sessions, minutes or pages. Momentum shows your progress from what you log.',
  role: 'Something you do, like sessions, is checked against your number. A result outside your control, like an interview, is only shown, never judged.',
  source: 'If an app Momentum can read has it, it counts it for you; otherwise you log it with a tap.',
  metric: 'Some apps record more than one number for the same thing. This picks the one that counts toward your goal.',
  time_zone: 'Your days start and end where you are. Momentum uses the zone you choose.',
  day_end: DAY_END_SAY,
  week_start: 'Your weeks are counted from this day.',
  day_types: 'Some days have more room for this than others, like busy days and easier ones. Your plan puts more on the days with more room.',
  capacity: 'This is about how much time each kind of day usually has for this. Skip any you like.',
  slots_or_quota: "On set days means the days you pick. Any day means any day works, as long as the week's number is met.",
  planning_moment: 'This is when you would like to plan your week.',
  tone: 'This sets how your progress and your weekly look-back are worded.',
  celebrations: 'This sets how big a celebration is when you pass a number you set.',
  review_depth: 'This decides what you see when you look back on your week.',
  review_planning: 'This sets whether looking back and planning the next week happen in one sitting or separately.',
};

// What a number question says when the draft holds no counted thing yet (the words with the thing come from lib/setup/numbers.ts).
const FLOOR_PLAIN = 'A week at this number still counts as a good week.';
const ASPIRATION_PLAIN = 'This is the number you are hoping for, if you want one.';
const LEVEL_PLAIN =
  'The least that counts is the number for a hard week: a week at it is still a good week. What you are aiming for is the number you are hoping for, if you want one.';

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
