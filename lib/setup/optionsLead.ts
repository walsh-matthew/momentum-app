// The line that leads a card of options, written by code (MOM-111 round 3c, finding 2). In the reviewers' screenshots the
// starting ideas card "lacked context, what does 'pages a week' mean": the card opened on Claude's lead-in, then a question
// that did not say what the numbers were. Now a card of starting ideas, or of readings of an unclear answer, leads with one
// short line in code's words that says what the options are about. On a number, it is the number question itself, in the
// same everyday words as everywhere else ("In a hard week, how many pages would still count?", lib/setup/numbers.ts), with
// the goal in front when there is more than one. It is the card's one bold line; under it, in regular weight, "Pick one or
// write your own." Pure.

import type { AssistantTurn, SetupTopic } from '@/types/setup';
import { countedTarget, numberQuestion, type NumberTopic } from './numbers';
import { titleOf } from './restate';

// What a question on each topic is about, inside a sentence. A topic not here leads with Claude's own question.
const TOPIC_WORDS: Partial<Record<SetupTopic, string>> = {
  idea: 'your goal',
  why: 'why it matters to you',
  breakup: 'how to split it up',
  sequencing: 'which goal comes first',
  parked_return: 'when it comes back',
  priorities: 'what to keep room for',
  starting_point: "how it's going now",
  shape: 'how long it runs',
  start_date: 'when to start',
  end_date: 'when it ends',
  block_length: 'your first stretch',
  deadline_date: 'when it has to be done',
  source: 'where you track it',
  metric: 'which number counts',
  time_zone: 'your time zone',
  day_end: 'when your day ends',
  week_start: 'when your week starts',
  day_types: 'your kinds of days',
  planning_moment: 'when you plan your week',
  tone: 'how Momentum talks to you',
  reminders: 'reminders',
  check_ins: 'check-ins',
  celebrations: 'celebrating wins',
  quiet_times: 'quiet times',
};

// The number question for a card of options about a number, with the goal in front when there is more than one ("For Read
// more, in a hard week, how many pages would still count?"). Null when no counted thing is in the draft yet.
function numberLead(turn: AssistantTurn, topic: NumberTopic, today: string | null, said: readonly string[]): string | null {
  const t = countedTarget(turn.draft, topic);
  if (!t) return null;
  const question = numberQuestion(topic, t, today, said);
  const active = turn.draft.model.goals.filter((g) => g.state === 'active');
  const goal = active.find((g) => g.targets.includes(t));
  return active.length > 1 && goal ? `For ${titleOf(goal.title)}, ${question.charAt(0).toLowerCase()}${question.slice(1)}` : question;
}

// The lead line of a card of options, or null when the turn is not one, or code has no words for its topic (then Claude's
// question leads).
export function optionsLead(turn: AssistantTurn, today: string | null, said: readonly string[] = []): string | null {
  if (turn.kind !== 'ideas' && turn.kind !== 'interpretations') return null;
  const topic = turn.topic;
  if (topic === null) return null;
  if (topic === 'floor' || topic === 'aspiration') return numberLead(turn, topic, today, said);
  if (topic === 'target') {
    const active = turn.draft.model.goals.filter((g) => g.state === 'active');
    const goal = active[active.length - 1];
    if (!goal) return null;
    return turn.kind === 'ideas' ? `Some ways to count your progress on ${titleOf(goal.title)}` : `A few ways to read your answer about what to count`;
  }
  const about = TOPIC_WORDS[topic];
  if (!about) return null;
  if (turn.kind === 'interpretations') return `A few ways to read your answer about ${about}`;
  return topic === 'idea' ? 'Some goal ideas to start from' : `Some ideas for ${about}`;
}
