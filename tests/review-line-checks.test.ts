// The checks code runs on the one line Claude writes for the weekly review (lib/review/reflection.ts, MOM-113 block 3.3,
// docs/DOMAIN_MODEL.md §3.3): Claude writes words, code decides whether they may be shown. Pure: no network, no model.
//
// What these pin:
// - a reply with a digit, a number word, a question, an ask, a score or more than one sentence is refused, each for its own reason;
// - the person's own target titles, as they were sent, are exempt from the digit, number-word and ask checks (a title can say
//   "Run 5k" or "Try a new recipe"), and the exemption stops at the title: the words around it are checked in full;
// - an ask is matched as a whole word, so "retry", "entry" and "mustard" are not asks;
// - the reply's JSON shape is strict, and the line written by code for a failed reply passes its own checks.

import { describe, expect, it } from 'vitest';
import {
  REFLECTION_FALLBACK_LINES,
  REFLECTION_MAX_CHARS,
  REFLECTION_RETRY_NOTES,
  checkReflectionLine,
  readReflectionReply,
} from '@/lib/review/reflection';
import { TONES } from '@/types/database.types';

const TITLES = ['Lift weights', 'Run 5k', 'Try a new recipe'];

const ok = (line: string, titles: readonly string[] = TITLES) => checkReflectionLine(line, titles);
const problem = (line: string, titles: readonly string[] = TITLES) => {
  const checked = ok(line, titles);
  return checked.ok ? null : checked.problem;
};

describe('a good line', () => {
  it('is one plain sentence with no number, question or ask', () => {
    expect(ok('You kept Lift weights going all week.')).toEqual({ ok: true, line: 'You kept Lift weights going all week.' });
    expect(ok('  A steady week, and you reached your floor.  ')).toEqual({ ok: true, line: 'A steady week, and you reached your floor.' });
    expect(ok('A quiet week, and that is fine')).toMatchObject({ ok: true });
  });
});

describe('what is refused, and why', () => {
  it.each([
    ['a digit', 'You lifted on 3 days.', 'number'],
    ['a number word', 'You lifted on three days.', 'number'],
    ['a number word in capitals', 'Twice is plenty.', 'number'],
    ['an ordinal', 'The first half went well.', 'number'],
    ['a fraction character', 'You got ½ of it done.', 'number'],
    ['a percent sign', 'You were most of the way there %.', 'score'],
    ['a question', 'How did that feel?', 'question'],
    ['a question with a full-width mark', 'How did it feel？', 'question'],
    ['a score', 'Your score was strong.', 'score'],
    ['a grade', 'That was a good grade for the week.', 'score'],
    ['a percentage word', 'A high percentage of it got done.', 'score'],
    ['an ask', 'You should rest tomorrow.', 'ask'],
    ['an ask in the imperative', 'Try to keep it up.', 'ask'],
    ['a phrase that asks', 'Make sure you keep going.', 'ask'],
    ['an encouragement that pushes', 'Keep it up!', 'ask'],
    ['two sentences', 'You did well. The week ended well.', 'not_one_sentence'],
    ['a stop in the middle', 'You did well. Really', 'not_one_sentence'],
    ['two lines', 'You did well\nand it showed', 'not_one_sentence'],
    ['formatting', 'You did **well** this week.', 'markup'],
    ['an empty line', '   ', 'empty'],
  ])('refuses %s', (_name, line, expected) => {
    expect(problem(line)).toBe(expected);
  });

  it('refuses a line over the length limit and a reply that is not a string', () => {
    expect(problem('a'.repeat(REFLECTION_MAX_CHARS + 1))).toBe('too_long');
    expect(ok('a'.repeat(REFLECTION_MAX_CHARS - 1)).ok).toBe(true);
    expect(problem(42 as unknown as string)).toBe('empty');
    expect(problem(undefined as unknown as string)).toBe('empty');
  });

  it('has fixed words for every reason it can refuse for, none of them quoting the person', () => {
    for (const note of Object.values(REFLECTION_RETRY_NOTES)) {
      expect(note).toMatch(/^[A-Z]/);
      expect(note).not.toMatch(/Lift weights|Run 5k/);
    }
    expect(Object.keys(REFLECTION_RETRY_NOTES).sort()).toEqual(
      ['ask', 'empty', 'markup', 'not_one_sentence', 'number', 'question', 'score', 'too_long', 'unreadable'].sort(),
    );
  });
});

describe("the person's own titles, as sent, are exempt (and only as sent)", () => {
  it('lets a digit inside a title through', () => {
    expect(ok('You kept up Run 5k all week.')).toMatchObject({ ok: true });
  });

  it('lets a word that looks like an ask inside a title through', () => {
    expect(ok('Try a new recipe is where the week went well.')).toMatchObject({ ok: true });
  });

  it('still refuses the same digit or ask outside a title', () => {
    expect(problem('You kept up Run 5k on 5 days.')).toBe('number');
    expect(problem('You kept up Run for 5k.')).toBe('number');
    expect(problem('Try a new recipe, and you should rest.')).toBe('ask');
    expect(problem('Please keep up Lift weights.')).toBe('ask');
  });

  it('does not exempt a title that was not sent', () => {
    expect(problem('You kept up Run 5k all week.', ['Lift weights'])).toBe('number');
    expect(problem('Try a new recipe went well.', ['Lift weights'])).toBe('ask');
  });

  it('matches a title exactly as the person wrote it', () => {
    expect(problem('You kept up run 5k all week.')).toBe('number');
    expect(problem('You kept up Run 5km all week.')).toBe('number');
  });

  it('only exempts a title that stands alone, so a short title cannot hide the middle of a word', () => {
    // The title "try" stands alone here, so it is the person's word and may stay; the ask around it is still caught.
    expect(ok('You kept up try all week.', ['try'])).toMatchObject({ ok: true });
    expect(problem('Please try again.', ['try'])).toBe('ask');
    // A title inside a longer word is not the title: "entry" is not exempted by "try", so the rest of the line is checked.
    expect(problem('You were entry level about it three times.', ['try'])).toBe('number');
  });

  it('lets a title with a question mark or a stop through, since it is the person\'s own', () => {
    expect(ok('You kept up Why not me? all week.', ['Why not me?'])).toMatchObject({ ok: true });
    expect(ok('You kept up Read 2 books. all week.', ['Read 2 books.'])).toMatchObject({ ok: true });
  });

  it('exempts the longest title first when one title contains another', () => {
    expect(ok('Run 5k club went well.', ['Run 5k', 'Run 5k club'])).toMatchObject({ ok: true });
  });

  it('ignores an empty title', () => {
    expect(problem('You did 3 things.', ['', '  '])).toBe('number');
  });
});

describe('an ask is matched as a whole word', () => {
  it.each([
    ['retry', 'You had a retry on the week and it went well.'],
    ['entry', 'Your entry for the week looks steady.'],
    ['sentry', 'A sentry of a week.'],
    ['mustard', 'A mustard-coloured sort of week.'],
    ['ensured', 'The week ended up well ensured.'],
    ['shoulder', 'The week had a shoulder day that went well.'],
  ])('does not take "%s" for an ask', (_word, line) => {
    expect(ok(line)).toMatchObject({ ok: true });
  });

  it.each([
    ['try', 'Do try a little more.'],
    ['TRY in capitals', 'TRY a little more.'],
    ['let us', "Let's go on from here."],
    ['a curly apostrophe', 'Let’s go on from here.'],
    ['should', 'You should be proud.'],
    ['need to', 'You need to rest.'],
    ['think about', 'Think about what worked.'],
  ])('takes "%s" for an ask', (_word, line) => {
    expect(problem(line)).toBe('ask');
  });
});

describe("the reply's shape", () => {
  it('reads {"line": "..."} and nothing else', () => {
    expect(readReflectionReply({ line: 'A steady week.' }, TITLES)).toEqual({ ok: true, line: 'A steady week.' });
  });

  it.each([
    ['a string', 'A steady week.'],
    ['null', null],
    ['an array', ['A steady week.']],
    ['an object without a line', { text: 'A steady week.' }],
    ['a line that is not a string', { line: 3 }],
    ['extra keys', { line: 'A steady week.', note: 'x' }],
  ])('refuses %s as unreadable', (_name, raw) => {
    expect(readReflectionReply(raw, TITLES)).toEqual({ ok: false, problem: 'unreadable' });
  });

  it('runs the line checks on a readable reply', () => {
    expect(readReflectionReply({ line: 'You lifted 3 times.' }, TITLES)).toEqual({ ok: false, problem: 'number' });
  });
});

describe("code's own line for a reply that failed twice", () => {
  it.each(TONES)('is a line for tone %s that passes the same checks and names nothing about the week', (tone) => {
    const line = REFLECTION_FALLBACK_LINES[tone];
    expect(ok(line, [])).toEqual({ ok: true, line });
    expect(line).not.toMatch(/\d/);
  });

  it('has one line for each tone', () => {
    expect(Object.keys(REFLECTION_FALLBACK_LINES).sort()).toEqual([...TONES].sort());
  });
});
