// Number questions say what the number is (MOM-111 round 3b, finding 1). In the owner's screenshots a number question did not
// say what was counted or whether it asked for the least that still counts or the number hoped for, and its option buttons
// were bare lines to decode. Every question about the least that still counts (the floor) or the number hoped for (the
// aspiration) names the thing counted, in the person's own words from the draft ("workouts", "pages"), and what the number is
// for, in everyday words written by code (round 3c, wording fix: "fewest pages" read as jargon); "What does this mean?" under
// it explains both numbers with that same thing. Pure.

import { casualDate } from '@/lib/dates/casual';
import type { AssistantTurn, SetupDraft, SetupTopic, TargetDraft } from '@/types/setup';
import { countedWords } from './playback';

export const NUMBER_TOPICS: ReadonlySet<SetupTopic> = new Set<SetupTopic>(['floor', 'aspiration']);
export type NumberTopic = 'floor' | 'aspiration';

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

// The deadline a number covers, "Friday, Nov 20", or null for a weekly number.
const dueWords = (t: TargetDraft, today: string | null): string | null =>
  t.period.kind === 'deadline' ? casualDate(t.period.dueDate, today, { relative: false }) : null;

// The number question in everyday words, the one wording builder for every counted thing (MOM-111 round 3c, wording fix): it
// asks what the number is for, with the person's counted thing, and never says "fewest", "floor", "aim" or "target" on their
// own. "How many pages makes a week count, even a hard one?", "How many pages a week are you hoping for?"; for a deadline,
// "How many blocks sewn by Friday, Nov 20 would still count as on track?" and "... are you hoping for?". It is the bold line
// of a number question, and of an ideas or options card about that number.
export function numberQuestion(topic: NumberTopic, t: TargetDraft, today: string | null, said: readonly string[] = []): string {
  const thing = countedThing(t, said);
  const due = dueWords(t, today);
  if (topic === 'floor') return due ? `How many ${thing} by ${due} would still count as on track?` : `How many ${thing} makes a week count, even a hard one?`;
  return due ? `How many ${thing} by ${due} are you hoping for?` : `How many ${thing} a week are you hoping for?`;
}

// The same number said as a statement, for the detail line of an offer of ideas about it: "The number of pages that makes a
// week count, even a hard one."
export function numberAbout(topic: NumberTopic, t: TargetDraft, today: string | null, said: readonly string[] = []): string {
  const thing = countedThing(t, said);
  const due = dueWords(t, today);
  if (topic === 'floor') return due ? `The number of ${thing} by ${due} that would still count as on track.` : `The number of ${thing} that makes a week count, even a hard one.`;
  return due ? `The number of ${thing} by ${due} you're hoping for.` : `The number of ${thing} a week you're hoping for.`;
}

// "What does this mean?" under a number question: both numbers, in everyday words, with the person's own counted thing.
export function numberHelp(draft: SetupDraft, topic: SetupTopic | null, today: string | null): string | null {
  if (topic === null) return null;
  const t = countedTarget(draft, topic);
  if (!t) return null;
  const thing = countedThing(t);
  const due = dueWords(t, today);
  if (due) {
    return (
      `The first number is how many ${thing} by ${due} would still count as on track. ` +
      `The second is how many you're hoping for, if you want one. You can set both, or only the first.`
    );
  }
  return (
    `The first number is how many ${thing} make a week count, even a hard one: a week at that number is still a good week. ` +
    `The second is how many you're hoping for, if you want one. You can set both, or only the first.`
  );
}

// A number question as the person sees it: always in code's words (round 3c, wording fix), so it never says "fewest" or "aim"
// on their own; and on an offer of ideas about a number, the detail line says what the number is, in code's words. Any other
// turn is returned as it is. The service shows the result only when it passes the checks (lib/services/setup.ts).
export function normalizeNumberTurn(turn: AssistantTurn, today: string | null, said: readonly string[] = []): AssistantTurn {
  if (turn.topic === null || !NUMBER_TOPICS.has(turn.topic)) return turn;
  if (turn.kind !== 'question' && turn.kind !== 'offer_ideas') return turn;
  const topic = turn.topic as NumberTopic;
  const t = countedTarget(turn.draft, topic);
  if (!t) return turn;
  if (turn.kind === 'offer_ideas') {
    const detail = numberAbout(topic, t, today, said);
    return detail === turn.detail ? turn : { ...turn, detail };
  }
  const question = numberQuestion(topic, t, today, said);
  return question === turn.question ? turn : { ...turn, question };
}
