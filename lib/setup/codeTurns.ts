// Turns code writes itself in guided setup, without asking Claude (MOM-111 finding 8, owner addition b). When the person's
// answer to a date question is only a relative date ("Monday", "in two weeks", "the 15th"), code works the date out from
// their own today and shows it as a proposal ("Start Monday, Nov 2?") with Yes as the main button; their yes then counts
// as accepting it, through the same provenance rules as any proposal. A vague answer ("sometime next month") gets the
// question again, with the date picker the screen shows on every date question. An answer with more in it ("Monday, 3 times
// a week") goes to Claude as usual, with the date code worked out passed in as a hint. Claude never works a date out.
//
// Lengths of time the same way (MOM-111 round 2, finding 7, owner decision D2): an answer to the first-stretch or end-date
// question that is only a length ("two months from now", "8 weeks") is counted from the goal's start date and shown as a
// proposal; a length said anywhere else in the conversation goes to Claude as a note with the worked-out suggestion, to show
// when it asks that question. A goal with an end date gets the exact date; an ongoing goal gets whole weeks with the last day.
// Pure.

import { casualDate } from '@/lib/dates/casual';
import type { AssistantTurn, GoalDraft, SetupDraft, SetupTopic, Transcript } from '@/types/setup';
import {
  durationEnd,
  durationIn,
  durationWeeks,
  isOnlyDuration,
  isOnlyRelativeDate,
  proposalDate,
  relativeDateIn,
  stretchLastDay,
  type Duration,
  type RelativeDate,
} from './relativeDates';
import { latestAnswer } from './said';
import { asksMeaning, datesIn, type MentionedDate } from './text';

// The questions whose answer is a date the person picks (start, end, deadline and deadline-task dates, and a set-aside
// goal's way back). The screen shows the one date layout on each (components/setup/DateAnswer.tsx).
export const DATE_TOPICS: ReadonlySet<SetupTopic> = new Set<SetupTopic>(['start_date', 'end_date', 'deadline_date', 'parked_return']);

const PROPOSAL_WORDS: Partial<Record<SetupTopic, (date: string) => string>> = {
  start_date: (d) => `Start ${d}?`,
  end_date: (d) => `Run until ${d}?`,
  deadline_date: (d) => `Done by ${d}?`,
  parked_return: (d) => `Bring it back on ${d}?`,
};

// A date question in code's own words, with its reason saying what the answer is for (finding 10): the question again for a
// vague answer, and the words that replace a question asking for an "exact date" (round 3, finding 2).
const ASK_THE_DAY: Partial<Record<SetupTopic, { question: string; detail: string }>> = {
  start_date: { question: 'Which day would you like to start?', detail: 'Your first week is planned from that day.' },
  end_date: { question: 'Which day should it run until?', detail: 'Your plan stops on that day.' },
  deadline_date: { question: 'Which day does it have to be done by?', detail: 'We plan back from that day.' },
  parked_return: { question: 'Which day should it come back?', detail: 'It comes back into your plan on that day.' },
};

// A date question never asks for an "exact date" (round 3, finding 2): the picker and the suggestion make the date exact.
export const EXACT_DATE = /\bexact (date|day)\b/i;

// Answers where a relative day is a date to give Claude a hint about: the date questions, and the shape question ("a deadline
// in two weeks"). Anywhere else a weekday is not a date ("Monday" is when their week starts), so there is no hint.
const HINT_TOPICS: ReadonlySet<SetupTopic> = new Set<SetupTopic>([...DATE_TOPICS, 'shape']);

// The questions a length of time answers: how long the first stretch runs, and the end date.
const LENGTH_TOPICS: ReadonlySet<SetupTopic> = new Set<SetupTopic>(['block_length', 'end_date']);

// Answers whose length of time is about the past, not the plan ("I've lifted for two years"), so it is never counted.
const PAST_TOPICS: ReadonlySet<SetupTopic> = new Set<SetupTopic>(['starting_point']);
const PAST_WORDS = /\b(ago|past|last|been|used to|years? of)\b/;

export type DateStep =
  // Code takes the turn: a proposal of the date, or the question again for a vague answer.
  | { kind: 'turn'; turn: AssistantTurn }
  // Claude takes the turn, told what code read the date or the length as.
  | { kind: 'hint'; hint: string };

const codeTurn = (draft: SetupDraft, over: Pick<AssistantTurn, 'kind' | 'question' | 'topic' | 'options'> & { detail?: string | null }): AssistantTurn => ({
  chunk: null,
  skipped: null,
  say: '',
  detail: null,
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

// The goal a length of time would fill: the newest one with a start date and that answer still open. Null when there is none
// (no start date yet means nothing to count from, so the length waits).
function goalForLength(draft: SetupDraft, topic: 'block_length' | 'end_date'): GoalDraft | null {
  for (let i = draft.model.goals.length - 1; i >= 0; i--) {
    const g = draft.model.goals[i];
    if (!g.startDate) continue;
    if (topic === 'block_length' && g.blockWeeks === null && g.shape !== 'finite' && g.shape !== 'project') return g;
    if (topic === 'end_date' && g.endDate === null && g.shape !== 'ongoing') return g;
  }
  return null;
}

// The suggestion for a length, in the words a proposal shows it with. `today` only decides whether the year is shown.
export function lengthProposal(start: string, d: Duration, topic: 'block_length' | 'end_date', today: string): { question: string; detail: string } {
  const startWords = casualDate(start, today, { relative: false });
  const detail = `Counted from your start date, ${startWords}.`;
  if (topic === 'end_date') return { question: `End ${casualDate(durationEnd(start, d), today, { relative: false })}?`, detail };
  const weeks = durationWeeks(start, d);
  const last = casualDate(stretchLastDay(start, weeks), today, { relative: false });
  return { question: `A first stretch of ${weeks} ${weeks === 1 ? 'week' : 'weeks'}, through ${last}?`, detail };
}

// The newest length of time the person said about the plan, anywhere in the conversation, with where they said it.
function lengthSaid(transcript: Transcript): Duration | null {
  for (let i = transcript.length - 1; i >= 0; i--) {
    const m = transcript[i];
    if (m.role !== 'person') continue;
    const before = transcript[i - 1];
    if (before?.role === 'assistant' && before.turn.topic !== null && PAST_TOPICS.has(before.turn.topic)) continue;
    const d = durationIn(m.text);
    if (d && !PAST_WORDS.test(m.text.toLowerCase())) return d;
  }
  return null;
}

// A note for Claude when a length was said and a goal has a start date to count it from (finding 7).
function lengthHint(transcript: Transcript, draft: SetupDraft, today: string): string | null {
  const d = lengthSaid(transcript);
  if (!d) return null;
  const parts: string[] = [];
  const ongoing = goalForLength(draft, 'block_length');
  const ending = goalForLength(draft, 'end_date');
  if (ongoing?.startDate) parts.push(`for the first stretch of "${ongoing.key}", propose exactly "${lengthProposal(ongoing.startDate, d, 'block_length', today).question}"`);
  if (ending?.startDate) parts.push(`for the end date of "${ending.key}", propose exactly "${lengthProposal(ending.startDate, d, 'end_date', today).question}"`);
  if (parts.length === 0) return null;
  return (
    `Length note from code: the person said "${d.phrase}". Counted by code from the goal's start date: when you ask about it, ${parts.join('; ')}. ` +
    'Show it as a "proposal" they accept with Yes, record it only after they do, and never work a length out yourself.'
  );
}

// ---------------------------------------------------------------------------
// A date question leads with a suggestion whenever code has one (MOM-111 round 3, finding 2)
// ---------------------------------------------------------------------------
//
// In the owner's screenshots a deadline came as a bare "What is the exact date it has to be done by?", though code could have
// suggested a date. Every date question Claude writes passes through normalizeDateTurn() before it is shown: when code or
// the conversation gives a date, the question becomes the date confirmation ("Done by Tuesday, Dec 15?", Yes as the main
// button, then a way to pick another); the question with no suggestion is left only for when nothing can be suggested, and
// never asks for an "exact date". Where a suggestion comes from:
// - a start date: the person's today, as setup already tells Claude ("Suggested start date");
// - an end date, a deadline or a way back: a date the person wrote out anywhere ("by March 15"), or a relative day in their
//   answer to the shape question ("a deadline in two weeks"), later than today and not already in the draft; for an end date,
//   also a length of time they said, counted from the start date (round 2, finding 7).
// Only what was said since this same question was last answered is read (owner decision D5), so an earlier goal's date is
// never suggested for the next goal; a date already saved in the draft never is either. After the person has answered this
// question without a date ("not today"), nothing is suggested again: Claude's question is shown as it is.

// Topics whose answers hold a date of their own, or a past one: never read for another date question's suggestion.
const OWN_DATE_TOPICS: ReadonlySet<SetupTopic> = new Set<SetupTopic>([...DATE_TOPICS, ...PAST_TOPICS]);
const PAST_SAID = /\b(ago|past|last|been|used to|started|since|began)\b/;

const pad2 = (n: number): string => String(n).padStart(2, '0');
const realDate = (iso: string): boolean => {
  const [y, m, d] = [Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10))];
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === iso;
};

// A written-out date as YYYY-MM-DD: its own year, or the next time that day comes round from today.
function isoOfWritten(d: MentionedDate, today: string): string | null {
  const on = (year: number): string => `${year}-${pad2(d.month)}-${pad2(d.day)}`;
  if (d.year !== null) return realDate(on(d.year)) ? on(d.year) : null;
  const year = Number(today.slice(0, 4));
  const candidate = realDate(on(year)) && on(year) >= today ? on(year) : on(year + 1);
  return realDate(candidate) ? candidate : null;
}

// Every date the draft already holds: start, end, return and due dates.
function draftDates(draft: SetupDraft): Set<string> {
  const out = new Set<string>();
  for (const g of draft.model.goals) {
    for (const d of [g.startDate, g.endDate, g.returnWhen?.kind === 'date' ? g.returnWhen.date : null]) if (d) out.add(d);
    for (const i of g.items) if (i.kind === 'deadline_task' && i.dueDate) out.add(i.dueDate);
    for (const t of g.targets) if (t.period.kind === 'deadline') out.add(t.period.dueDate);
  }
  return out;
}

// The topic of the turn a person's message answered, or null.
const answeredTopic = (transcript: Transcript, i: number): SetupTopic | null => {
  const before = transcript[i - 1];
  return before?.role === 'assistant' ? before.turn.topic : null;
};

// The date a person said for an end date, deadline or way back: the newest one code can read, as above. Null when none.
function saidDate(topic: SetupTopic, transcript: Transcript, draft: SetupDraft, today: string): string | null {
  const used = draftDates(draft);
  for (let i = transcript.length - 1; i >= 0; i--) {
    const m = transcript[i];
    if (m.role !== 'person') continue;
    const asked = answeredTopic(transcript, i);
    // "What does this mean?" about this question says no date; read on past it.
    if (asked === topic && asksMeaning(m.text)) continue;
    if (asked === topic) break;
    if (asked !== null && OWN_DATE_TOPICS.has(asked)) continue;
    // "I started on October 1" is about the past: its date is not the plan's.
    if (PAST_SAID.test(m.text.toLowerCase())) continue;
    const written = datesIn(m.text).map((d) => isoOfWritten(d, today));
    let iso: string | null = null;
    if (written.length === 1) iso = written[0];
    else if (written.length === 0 && asked === 'shape') {
      const found = relativeDateIn(m.text, today);
      iso = found?.kind === 'date' ? found.iso : null;
    }
    if (iso && iso > today && !used.has(iso)) return iso;
  }
  return null;
}

// What code can suggest for a date question, as YYYY-MM-DD, or null when nothing can be suggested.
export function suggestedDate(topic: SetupTopic, transcript: Transcript, draft: SetupDraft, today: string): string | null {
  if (!DATE_TOPICS.has(topic)) return null;
  // The person just answered this question without a date, and not by asking what it means: suggest nothing again.
  const last = transcript[transcript.length - 1];
  if (last?.role === 'person' && answeredTopic(transcript, transcript.length - 1) === topic && !asksMeaning(last.text)) return null;
  if (topic === 'start_date') return today;
  const said = saidDate(topic, transcript, draft, today);
  if (said) return said;
  if (topic === 'end_date') {
    const d = lengthSaid(transcript);
    const goal = goalForLength(draft, 'end_date');
    if (d && goal?.startDate) return durationEnd(goal.startDate, d);
  }
  return null;
}

// A date in a text: written out ("Friday, Nov 20", "2026-11-20", "11/20") or "today" / "tomorrow".
export const hasDate = (text: string | null | undefined): boolean => !!text && (datesIn(text).length > 0 || /\b(today|tomorrow)\b/i.test(text));

// A proposal's other answer that only repeats "Pick a different date", which the date card always shows ("Pick another day",
// "I already started earlier"): the round 3 live run's start-date proposal carried both.
const PICKER_LIKE = /\b(pick|choose|select|another|different|other|earlier)\b[^.]*\b(day|date)\b|\balready started\b/i;

// Never show a date and then ask for one (MOM-111 round 3b, finding 2): on a date question or a date proposal the lead-in
// shows no date, and a question that asks for a date shows none in its question or detail. Code's suggestion, when it has
// one, is the question itself.
export const showsDateAndAsks = (turn: AssistantTurn): boolean =>
  turn.topic !== null &&
  DATE_TOPICS.has(turn.topic) &&
  (hasDate(turn.say) || (turn.kind === 'question' && (hasDate(turn.question) || hasDate(turn.detail))));

// A date question Claude wrote, as the person sees it: the date confirmation when code has a suggestion ("Start today,
// Friday, Oct 30?", "Done by Friday, Nov 20?"), otherwise Claude's question, in code's words when it asked for an "exact
// date" or showed a date; a lead-in with a date is dropped; a date proposal's other answers keep no repeat of the picker. Any
// other turn is returned as it is. The service shows the result only when it passes the checks (lib/services/setup.ts).
export function normalizeDateTurn(turn: AssistantTurn, transcript: Transcript, draft: SetupDraft, today: string | undefined): AssistantTurn {
  if (turn.topic === null || !DATE_TOPICS.has(turn.topic) || !today) return turn;
  if (turn.kind !== 'question' && turn.kind !== 'proposal') return turn;
  const ask = ASK_THE_DAY[turn.topic];
  const proposal = PROPOSAL_WORDS[turn.topic];
  if (!ask || !proposal) return turn;
  const say = hasDate(turn.say) ? '' : turn.say;
  if (turn.kind === 'proposal') {
    const options = turn.options.filter((o) => !PICKER_LIKE.test(o) || hasDate(o));
    return say === turn.say && options.length === turn.options.length ? turn : { ...turn, say, options };
  }
  // Claude's reason, unless it has none, asks for an "exact date" or shows a date: then code's.
  const detail = turn.detail !== null && !EXACT_DATE.test(turn.detail) && !hasDate(turn.detail) ? turn.detail : ask.detail;
  const date = suggestedDate(turn.topic, transcript, draft, today);
  if (date) {
    // Written the casual way with its weekday, which is also how the person's yes is read as accepting it
    // (lib/setup/validate.ts reads the month and day); "today, " in front keeps the weekday on screen (lib/dates/casual.ts).
    const words = casualDate(date, today, { relative: false });
    return { ...turn, say, kind: 'proposal', question: proposal(date === today ? `today, ${words}` : words), detail, options: [] };
  }
  const q = turn.question ?? '';
  const question = EXACT_DATE.test(q) || hasDate(q) ? ask.question : turn.question;
  return question === turn.question && detail === turn.detail && say === turn.say ? turn : { ...turn, say, question, detail };
}

// What code does with the person's newest answer, given their today (YYYY-MM-DD). Null when it has nothing to add.
export function dateStep(transcript: Transcript, draft: SetupDraft, today: string | undefined): DateStep | null {
  const answer = latestAnswer(transcript);
  if (!answer || !today) return null;
  const topic = answer.answers?.topic ?? null;

  // A length of time as the whole answer to the first-stretch or end-date question: counted from the start date.
  if (topic !== null && LENGTH_TOPICS.has(topic) && isOnlyDuration(answer.text)) {
    const lengthTopic = topic as 'block_length' | 'end_date';
    const goal = goalForLength(draft, lengthTopic);
    const d = durationIn(answer.text);
    if (goal?.startDate && d) {
      const words = lengthProposal(goal.startDate, d, lengthTopic, today);
      return { kind: 'turn', turn: codeTurn(draft, { kind: 'proposal', topic: lengthTopic, question: words.question, detail: words.detail, options: [] }) };
    }
  }

  const hints: string[] = [];
  if (topic !== null && HINT_TOPICS.has(topic)) {
    // Only a start date may be earlier than today ("last Monday": they already started).
    const options = { allowPast: topic === 'start_date' };
    const found = relativeDateIn(answer.text, today, options);
    if (found) {
      const proposal = PROPOSAL_WORDS[topic];
      if (proposal && isOnlyRelativeDate(answer.text, today, options)) {
        if (found.kind === 'vague') {
          const ask = ASK_THE_DAY[topic];
          return { kind: 'turn', turn: codeTurn(draft, { kind: 'question', topic, question: ask?.question ?? null, detail: ask?.detail ?? null, options: [] }) };
        }
        const date = proposalDate(found, today);
        // The text keeps the date written out, so the person's yes accepts a value the turn showed (lib/setup/validate.ts); the
        // screen shows "today" or "tomorrow" alone (lib/dates/casual.ts casualText, round 2 finding 3).
        const lead = /^(today|tomorrow)$/.test(found.phrase.trim()) ? `${found.phrase.trim()}, ${date}` : date;
        // "Monday" said on a Monday: the coming Monday is the proposal, and today is the other answer (owner decision 3).
        const others = found.sameWeekday ? [`Today, ${casualDate(today, today, { relative: false })}`] : [];
        return { kind: 'turn', turn: codeTurn(draft, { kind: 'proposal', topic, question: proposal(lead), options: others }) };
      }
      hints.push(hintFor(found, today));
    }
  }
  const length = lengthHint(transcript, draft, today);
  if (length) hints.push(length);
  return hints.length > 0 ? { kind: 'hint', hint: hints.join('\n') } : null;
}
