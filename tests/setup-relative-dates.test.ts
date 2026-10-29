// Relative dates worked out by code, not Claude (MOM-111 finding 8, owner addition b): what each phrase works out to from the
// person's today, when a reply is only a date (code takes the turn) or has more in it (Claude takes it, with a hint), and
// that every turn code writes passes the same checks as Claude's. Pure.

import { describe, expect, it } from 'vitest';
import { checkTurn } from '@/lib/setup/checks';
import { DATE_TOPICS, dateStep } from '@/lib/setup/codeTurns';
import { emptyDraft } from '@/lib/setup/draft';
import { isOnlyRelativeDate, personToday, relativeDateIn } from '@/lib/setup/relativeDates';
import { acceptsText, datesIn } from '@/lib/setup/text';
import { pickedDateText } from '@/lib/setup/session';
import type { AssistantTurn, SetupTopic, Transcript } from '@/types/setup';

// A Tuesday.
const TUE = '2026-10-27';

const iso = (text: string, today = TUE, allowPast = false) => {
  const r = relativeDateIn(text, today, { allowPast });
  return r?.kind === 'date' ? r.iso : r?.kind ?? null;
};

describe('what a relative date works out to', () => {
  it.each([
    ['today', '2026-10-27'],
    ['tomorrow', '2026-10-28'],
    ['the day after tomorrow', '2026-10-29'],
    ['Monday', '2026-11-02'],
    ['next Monday', '2026-11-02'],
    ['this Friday', '2026-10-30'],
    ['on wednesday', '2026-10-28'],
    ['in two weeks', '2026-11-10'],
    ['in 3 days', '2026-10-30'],
    ['in a week', '2026-11-03'],
    ['a week from today', '2026-11-03'],
    ['the 15th', '2026-11-15'],
    ['on the 28th', '2026-10-28'],
  ])('"%s" is %s', (text, expected) => {
    expect(iso(text)).toBe(expected);
  });

  it('rolls over months and years, and skips a month that has no such day', () => {
    expect(iso('the 31st', '2026-11-05')).toBe('2026-12-31');
    expect(iso('the 30th', '2027-01-31')).toBe('2027-03-30');
    expect(iso('in two weeks', '2026-12-25')).toBe('2027-01-08');
    expect(iso('Friday', '2026-12-31')).toBe('2027-01-01');
  });

  it('a weekday said on that weekday is the coming one, a week out, and says so', () => {
    expect(relativeDateIn('Tuesday', TUE)).toEqual({ kind: 'date', iso: '2026-11-03', phrase: 'tuesday', sameWeekday: true });
  });

  it('a past date only for a start ("last Monday": they already started)', () => {
    expect(iso('last Monday', TUE, true)).toBe('2026-10-26');
    expect(iso('yesterday', TUE, true)).toBe('2026-10-26');
    expect(iso('last Monday', TUE, false)).toBeNull();
  });

  it.each(['sometime next month', 'next week', 'this weekend', 'soon', 'in the spring', 'after the holidays'])('"%s" names no day: vague', (text) => {
    expect(iso(text)).toBe('vague');
  });

  it('leaves an exact date to the person (it is said, not worked out), and finds nothing in words with no date', () => {
    expect(relativeDateIn('June 5, 2027', TUE)).toBeNull();
    expect(relativeDateIn('Monday, November 2, 2026', TUE)).toBeNull();
    expect(relativeDateIn('three times a week', TUE)).toBeNull();
  });
});

describe('a reply that is only a relative date (owner addition b)', () => {
  it.each(['Monday', 'next Monday please', 'Let\'s say Monday.', 'starting tomorrow', 'in two weeks', 'the 15th', 'next week', 'ok, monday'])(
    '"%s" is only a date',
    (text) => expect(isOnlyRelativeDate(text, TUE)).toBe(true),
  );

  it.each(['Monday, 3 times a week', 'Monday, and I want to do mornings', 'I start my new job Monday', 'three a week'])('"%s" has more in it', (text) => {
    expect(isOnlyRelativeDate(text, TUE)).toBe(false);
  });
});

describe('what code does with an answer to a date question', () => {
  const question = (topic: SetupTopic): AssistantTurn => ({
    kind: 'question',
    chunk: null,
    skipped: null,
    say: '',
    question: 'When?',
    topic,
    options: [],
    draft: emptyDraft(),
  });
  const conversation = (topic: SetupTopic, text: string): Transcript => [{ role: 'assistant', turn: question(topic) }, { role: 'person', text }];
  const stepFor = (topic: SetupTopic, text: string, today = TUE) => dateStep(conversation(topic, text), emptyDraft(), today);

  it.each([
    ['start_date', 'Start Monday, Nov 2?'],
    ['end_date', 'Run until Monday, Nov 2?'],
    ['deadline_date', 'Done by Monday, Nov 2?'],
    ['parked_return', 'Bring it back on Monday, Nov 2?'],
  ] as const)('on a %s question, "Monday" becomes a proposal, and the turn passes every check', (topic, words) => {
    const step = stepFor(topic, 'Monday');
    if (step?.kind !== 'turn') throw new Error('expected a turn');
    expect(step.turn).toMatchObject({ kind: 'proposal', topic, question: words, say: '', options: [] });
    expect(checkTurn(step.turn, { transcript: conversation(topic, 'Monday'), prevDraft: emptyDraft() })).toEqual([]);
    // The proposal holds the date in a form the provenance check reads, so the person's yes accepts it.
    expect(datesIn(step.turn.question ?? '')).toEqual([{ month: 11, day: 2, year: null }]);
  });

  it('names the date\'s own weekday, which is the calendar\'s, not a day of the person\'s week, and still passes rule 2', () => {
    const step = stepFor('start_date', 'the 15th');
    if (step?.kind !== 'turn') throw new Error('expected a turn');
    expect(step.turn.question).toBe('Start Sunday, Nov 15?');
    expect(checkTurn(step.turn, { transcript: conversation('start_date', 'the 15th'), prevDraft: emptyDraft() })).toEqual([]);
    const tomorrow = stepFor('start_date', 'tomorrow');
    expect(tomorrow?.kind === 'turn' && tomorrow.turn.question).toBe('Start tomorrow, Wednesday, Oct 28?');
  });

  it('rule 2 still stops a weekday on its own that the person never said', () => {
    const t = { ...question('slots_or_quota'), question: 'Would Tuesdays work?' };
    expect(checkTurn(t, { transcript: conversation('floor', 'three a week'), prevDraft: emptyDraft() }).map((v) => v.code)).toContain('assume_nothing.word');
    const dated = { ...question('start_date'), kind: 'proposal' as const, question: 'Start Tuesday, Nov 3?' };
    expect(checkTurn(dated, { transcript: conversation('start_date', 'soon-ish'), prevDraft: emptyDraft() }).map((v) => v.code)).not.toContain('assume_nothing.word');
  });

  it('"Monday" said on a Monday proposes the coming Monday, with Today as the other answer (owner decision 3)', () => {
    const monday = '2026-11-02';
    const step = stepFor('start_date', 'Monday', monday);
    if (step?.kind !== 'turn') throw new Error('expected a turn');
    expect(step.turn.question).toBe('Start Monday, Nov 9?');
    expect(step.turn.options).toEqual(['Today, Monday, Nov 2']);
    expect(checkTurn(step.turn, { transcript: conversation('start_date', 'Monday'), prevDraft: emptyDraft() })).toEqual([]);
  });

  it('asks for the day again, with no proposal, when the words name none', () => {
    const step = stepFor('start_date', 'sometime next month');
    if (step?.kind !== 'turn') throw new Error('expected a turn');
    expect(step.turn).toMatchObject({ kind: 'question', topic: 'start_date', question: 'Which day would you like to start?' });
    expect(checkTurn(step.turn, { transcript: conversation('start_date', 'sometime next month'), prevDraft: emptyDraft() })).toEqual([]);
  });

  it('hands a reply with more in it to Claude, with the date as a hint ("Monday, 3 times a week")', () => {
    const step = stepFor('start_date', 'Monday, 3 times a week');
    expect(step?.kind).toBe('hint');
    if (step?.kind !== 'hint') return;
    expect(step.hint).toContain('2026-11-02 (Monday, Nov 2)');
    expect(step.hint).toMatch(/It is a suggestion, not their answer/);
  });

  it('gives the shape question a hint ("a deadline in two weeks"), and no date question gets a code turn for it', () => {
    expect(stepFor('shape', 'a deadline in two weeks')?.kind).toBe('hint');
    expect(stepFor('shape', 'in two weeks')?.kind).toBe('hint');
  });

  it('does nothing for a weekday that is not a date ("Monday" as a week start), or with no today', () => {
    for (const topic of ['week_start', 'planning_moment', 'slots_or_quota', 'tone'] as const) expect(stepFor(topic, 'Monday')).toBeNull();
    expect(dateStep(conversation('start_date', 'Monday'), emptyDraft(), undefined)).toBeNull();
    expect(stepFor('start_date', 'June 5, 2027')).toBeNull();
  });

  it('shows a date picker on every date question, whose answer is an exact date the person said', () => {
    expect([...DATE_TOPICS].sort()).toEqual(['deadline_date', 'end_date', 'parked_return', 'start_date']);
    expect(pickedDateText('2026-11-02')).toBe('Monday, November 2, 2026');
    expect(datesIn(pickedDateText('2026-11-02'))).toEqual([{ month: 11, day: 2, year: 2026 }]);
    // The proposal's Yes is an acceptance.
    expect(acceptsText('Yes, that works.')).toBe(true);
  });
});

describe('the person\'s today', () => {
  const now = new Date(Date.UTC(2026, 9, 27, 12, 0, 0));
  it('is their time zone\'s date once setup knows it, else their device\'s', () => {
    expect(personToday('Pacific/Kiritimati', '2026-10-27', new Date(Date.UTC(2026, 9, 27, 12, 0, 0)))).toBe('2026-10-28');
    expect(personToday('America/Chicago', '2026-10-28', now)).toBe('2026-10-27');
    expect(personToday(null, '2026-10-27', now)).toBe('2026-10-27');
    expect(personToday('Not/AZone', '2026-10-27', now)).toBe('2026-10-27');
    expect(personToday(null, undefined, now)).toBeUndefined();
  });
});
