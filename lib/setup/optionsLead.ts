// The line that leads a card of options, written by code (MOM-111 round 3c, finding 2). In the reviewers' screenshots the
// starting ideas card "lacked context, what does 'pages a week' mean": the card opened on Claude's lead-in, then a question
// that did not say what the numbers were. Now a card of starting ideas, or of readings of an unclear answer, leads with one
// short line in code's words that names what the options are about, with the person's own counted thing and, when there is
// more than one goal, the goal: "Some starting points for the fewest pages in a week". It is the card's one bold line; under
// it, in regular weight, "Pick one or write your own." Pure.

import type { AssistantTurn, SetupTopic } from '@/types/setup';
import { countedTarget, countedThing, stretch } from './numbers';
import { titleOf } from './restate';

// What a question on each topic is about, inside a sentence. A topic not here leads with Claude's own question.
const TOPIC_WORDS: Partial<Record<SetupTopic, string>> = {
  idea: 'your goal',
  why: 'why it matters to you',
  breakup: 'how to split it up',
  sequencing: 'which goal comes first',
  parked_return: 'when it comes back',
  priorities: 'what to keep room for',
  starting_point: 'where you are now',
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

// What the options are about, with the counted thing on a number question: "the fewest runs in a week", "how many pages to
// aim for in a week". With more than one goal, the goal's title follows. Null when code has no words for the topic.
function aboutWords(turn: AssistantTurn, today: string | null, said: readonly string[]): string | null {
  const topic = turn.topic;
  if (topic === null) return null;
  const active = turn.draft.model.goals.filter((g) => g.state === 'active');
  if (topic === 'floor' || topic === 'aspiration') {
    const t = countedTarget(turn.draft, topic);
    if (!t) return null;
    const thing = countedThing(t, said);
    const about = topic === 'floor' ? `the fewest ${thing} ${stretch(t, today)}` : `how many ${thing} to aim for ${stretch(t, today)}`;
    const goal = active.find((g) => g.targets.includes(t));
    return active.length > 1 && goal ? `${about}, for ${titleOf(goal.title)}` : about;
  }
  if (topic === 'target') {
    const goal = active[active.length - 1];
    return goal ? titleOf(goal.title) : null;
  }
  return TOPIC_WORDS[topic] ?? null;
}

// The lead line of a card of options, or null when the turn is not one, or code has no words for its topic (then Claude's
// question leads).
export function optionsLead(turn: AssistantTurn, today: string | null, said: readonly string[] = []): string | null {
  if (turn.kind !== 'ideas' && turn.kind !== 'interpretations') return null;
  const about = aboutWords(turn, today, said);
  if (about === null) return null;
  if (turn.kind === 'interpretations') return `A few ways to read your answer about ${about}`;
  if (turn.topic === 'idea') return 'Some goal ideas to start from';
  if (turn.topic === 'target') return `Some ways to count your progress on ${about}`;
  return turn.topic === 'floor' || turn.topic === 'aspiration' ? `Some starting points for ${about}` : `Some ideas for ${about}`;
}
