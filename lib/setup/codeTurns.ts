// Turns code writes itself in guided setup, without asking Claude (MOM-111 finding 8, owner addition b). When the person's
// answer to a date question is only a relative date ("Monday", "in two weeks", "the 15th"), code works the date out from
// their own today and shows it as a proposal ("Start Monday, Nov 2?") with Yes as the main button; their yes then counts
// as accepting it, through the same provenance rules as any proposal. A vague answer ("sometime next month") gets the
// question again, with the date picker the screen shows on every date question. An answer with more in it ("Monday, 3 times
// a week") goes to Claude as usual, with the date code worked out passed in as a hint. Claude never works a date out.
// Pure.

import { casualDate } from '@/lib/dates/casual';
import type { AssistantTurn, SetupDraft, SetupTopic, Transcript } from '@/types/setup';
import { isOnlyRelativeDate, proposalDate, relativeDateIn, type RelativeDate } from './relativeDates';
import { latestAnswer } from './said';

// The questions whose answer is a date the person picks (start, end, deadline and deadline-task dates, and a set-aside
// goal's way back). The screen shows a date picker on each.
export const DATE_TOPICS: ReadonlySet<SetupTopic> = new Set<SetupTopic>(['start_date', 'end_date', 'deadline_date', 'parked_return']);

const PROPOSAL_WORDS: Partial<Record<SetupTopic, (date: string) => string>> = {
  start_date: (d) => `Start ${d}?`,
  end_date: (d) => `Run until ${d}?`,
  deadline_date: (d) => `Done by ${d}?`,
  parked_return: (d) => `Bring it back on ${d}?`,
};

const ASK_THE_DAY: Partial<Record<SetupTopic, string>> = {
  start_date: 'Which day would you like to start?',
  end_date: 'Which day should it run until?',
  deadline_date: 'What is the exact date it has to be done by?',
  parked_return: 'Which day should it come back?',
};

// Answers where a relative day is a date to give Claude a hint about: the date questions, and the shape question ("a deadline
// in two weeks"). Anywhere else a weekday is not a date ("Monday" is when their week starts), so there is no hint.
const HINT_TOPICS: ReadonlySet<SetupTopic> = new Set<SetupTopic>([...DATE_TOPICS, 'shape']);

export type DateStep =
  // Code takes the turn: a proposal of the date, or the question again for a vague answer.
  | { kind: 'turn'; turn: AssistantTurn }
  // Claude takes the turn, told what code read the date as.
  | { kind: 'hint'; hint: string };

const codeTurn = (draft: SetupDraft, over: Pick<AssistantTurn, 'kind' | 'question' | 'topic' | 'options'>): AssistantTurn => ({
  chunk: null,
  skipped: null,
  say: '',
  ...over,
  draft: structuredClone(draft),
});

function hintFor(found: RelativeDate, today: string): string {
  if (found.kind === 'vague') {
    return `Date note from code: the person's newest message gives no exact day ("${found.phrase}"). Ask which day; never pick one.`;
  }
  return (
    `Date note from code: "${found.phrase}" in the person's newest message is ${found.iso} (${casualDate(found.iso, today, { relative: false })}), ` +
    'worked out by code from their today. It is a suggestion, not their answer: to use it, show it in a "proposal" for them to accept, and record it only after they do.'
  );
}

// What code does with the person's newest answer, given their today (YYYY-MM-DD). Null when it holds no relative date.
export function dateStep(transcript: Transcript, draft: SetupDraft, today: string | undefined): DateStep | null {
  const answer = latestAnswer(transcript);
  if (!answer || !today) return null;
  const topic = answer.answers?.topic ?? null;
  if (topic === null || !HINT_TOPICS.has(topic)) return null;
  // Only a start date may be earlier than today ("last Monday": they already started).
  const options = { allowPast: topic === 'start_date' };
  const found = relativeDateIn(answer.text, today, options);
  if (!found) return null;

  const proposal = PROPOSAL_WORDS[topic];
  if (proposal && isOnlyRelativeDate(answer.text, today, options)) {
    if (found.kind === 'vague') {
      return { kind: 'turn', turn: codeTurn(draft, { kind: 'question', topic, question: ASK_THE_DAY[topic] ?? null, options: [] }) };
    }
    const date = proposalDate(found, today);
    const lead = /^(today|tomorrow)$/.test(found.phrase.trim()) ? `${found.phrase.trim()}, ${date}` : date;
    // "Monday" said on a Monday: the coming Monday is the proposal, and today is the other answer (owner decision 3).
    const others = found.sameWeekday ? [`Today, ${casualDate(today, today, { relative: false })}`] : [];
    return { kind: 'turn', turn: codeTurn(draft, { kind: 'proposal', topic, question: proposal(lead), options: others }) };
  }
  return { kind: 'hint', hint: hintFor(found, today) };
}
