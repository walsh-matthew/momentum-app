// Number questions say what the number is (MOM-111 round 3b, finding 1). In the owner's screenshots a number question did not
// say what was counted or whether it asked for the least that still counts or the number hoped for, and its option buttons
// were bare lines to decode. Every question about the fewest (the floor) or the aim (the aspiration) now names the thing
// counted, in the person's own words from the draft ("workouts", "pages"), and which number it asks for; "What does this
// mean?" under it explains the fewest and the aim with that same thing, written by code. Pure.

import { casualDate } from '@/lib/dates/casual';
import type { AssistantTurn, SetupDraft, SetupTopic, TargetDraft } from '@/types/setup';
import { countedWords } from './playback';

export const NUMBER_TOPICS: ReadonlySet<SetupTopic> = new Set<SetupTopic>(['floor', 'aspiration']);
type NumberTopic = 'floor' | 'aspiration';

// Words that say which number a question asks for.
export const NUMBER_ROLE_WORDS: Record<NumberTopic, RegExp> = {
  floor: /\b(fewest|least|minimum|still counts?)\b/i,
  aspiration: /\b(aim|aiming|hoping|hope|goal)\b/i,
};
// How an option button says which number it sets ("At least 2 a week", "Aiming for 3 a week").
export const NUMBER_OPTION_LEADS: Record<NumberTopic, RegExp> = { floor: /^\s*at least\b/i, aspiration: /^\s*aiming for\b/i };

// The target a floor or aim question is about: on the newest active goal with targets, the newest one still missing that
// number, else its newest target. Null when no target is in the draft yet.
export function countedTarget(draft: SetupDraft, topic: SetupTopic): TargetDraft | null {
  if (!NUMBER_TOPICS.has(topic)) return null;
  const goals = draft.model.goals.filter((g) => g.state === 'active' && g.targets.length > 0);
  const goal = goals[goals.length - 1];
  if (!goal) return null;
  const missing = goal.targets.filter((t) => (topic === 'floor' ? t.floor === null : t.aspiration === null));
  return missing[missing.length - 1] ?? goal.targets[goal.targets.length - 1];
}

// What is counted, in the person's words, as the number question says it: "workouts", "minutes of practice".
export function countedThing(t: TargetDraft, said: readonly string[] = []): string {
  const words = countedWords(t.title, said);
  return t.measure === 'time' && !/\bminutes?\b/i.test(words) ? `minutes of ${words}` : words;
}

// The stretch the number covers: "in a week", or "by Friday, Nov 20" for a deadline.
export function stretch(t: TargetDraft, today: string | null): string {
  return t.period.kind === 'deadline' ? `by ${casualDate(t.period.dueDate, today, { relative: false })}` : 'in a week';
}

// The question in code's words: "What's the fewest workouts in a week that still counts as on track?"
export function numberQuestion(topic: NumberTopic, t: TargetDraft, today: string | null): string {
  const thing = countedThing(t);
  return topic === 'floor'
    ? `What's the fewest ${thing} ${stretch(t, today)} that still counts as on track?`
    : `How many ${thing} ${stretch(t, today)} are you aiming for?`;
}

// "What does this mean?" under a number question: the fewest and the aim, in plain words, with the person's own counted thing.
export function numberHelp(draft: SetupDraft, topic: SetupTopic | null, today: string | null): string | null {
  if (topic === null) return null;
  const t = countedTarget(draft, topic);
  if (!t) return null;
  const thing = countedThing(t);
  const when = stretch(t, today);
  const good = t.period.kind === 'deadline' ? '' : ': a week at that number is still a good week';
  return (
    `The fewest is the smallest number of ${thing} ${when} that still counts as on track${good}. ` +
    `The aim is the number of ${thing} you're hoping for, if you want one. You can set both, or only the fewest.`
  );
}

// The thing's first word without a plural ending, to find it in a question ("workout" in "fewest workouts").
const stem = (words: string): string => (words.toLowerCase().match(/[a-z]+/)?.[0] ?? '').replace(/(es|s)$/, '');

// A floor or aim question as the person sees it: Claude's own words when they already name the counted thing and which
// number they ask for, otherwise code's question. Any other turn is returned as it is. The service shows the result only
// when it passes the checks (lib/services/setup.ts).
export function normalizeNumberTurn(turn: AssistantTurn, today: string | null): AssistantTurn {
  if (turn.kind !== 'question' || turn.topic === null || !NUMBER_TOPICS.has(turn.topic)) return turn;
  const topic = turn.topic as NumberTopic;
  const t = countedTarget(turn.draft, topic);
  if (!t) return turn;
  const q = turn.question ?? '';
  const named = stem(countedThing(t)).length > 0 && q.toLowerCase().includes(stem(countedThing(t)));
  if (named && NUMBER_ROLE_WORDS[topic].test(q)) return turn;
  return { ...turn, question: numberQuestion(topic, t, today) };
}
