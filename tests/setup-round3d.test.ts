// MOM-111 round 3d, from the owner's review of round 3c. Three wording fixes, each in the one builder every card uses, and a
// sweep over every counted thing and every scripted case so no screen is fixed alone:
// 1. The verb of a number question agrees with the counted thing ("How many workouts make a week count", a singular thing
//    keeps "makes"); lib/setup/numbers.ts decides it from one word, the head word.
// 2. The quick path's missing-floor line is that same question, in the same words.
// 3. An idea button for a number names the counted thing ("At least 2 workouts a week").
// Pure: no model, no database, no network.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { emptyDraft } from '@/lib/setup/draft';
import { countedThing, countedTarget, firstWord, headWord, makeVerb, nameThingInOption, normalizeNumberTurn, numberAbout, numberHelp, numberQuestion } from '@/lib/setup/numbers';
import { optionsLead } from '@/lib/setup/optionsLead';
import { describeMissing } from '@/lib/setup/quickPath';
import type { AssistantTurn, SetupDraft, TargetDraft } from '@/types/setup';
import { SETUP_CASES } from './setup-evals/cases';
import { goal, target } from './helpers/setupScript';

const TODAY = '2026-10-29';
const draftWith = (...targets: TargetDraft[]): SetupDraft => {
  const d = emptyDraft();
  d.model.goals.push({ ...goal('g1', 'Get stronger'), targets });
  return d;
};
const turnOf = (over: Partial<AssistantTurn>): AssistantTurn => ({
  kind: 'ideas',
  chunk: null,
  skipped: null,
  say: '',
  question: 'Which of these would you like to start from?',
  detail: null,
  topic: 'floor',
  options: [],
  draft: draftWith(target('t1', 'Workouts')),
  ...over,
});

// Every kind of counted thing the owner and the reviewers named, with the verb it takes.
const THINGS: [title: string, verb: 'make' | 'makes'][] = [
  ['Workouts', 'make'],
  ['Runs', 'make'],
  ['Pages', 'make'],
  ['Spanish lessons', 'make'],
  ['Strength workouts', 'make'],
  ['Yoga class', 'makes'],
  ['People', 'make'],
  ['Children', 'make'],
  ['Pages read', 'make'],
  ['Miles run', 'make'],
  ['Blocks sewn', 'make'],
  ['Time outdoors', 'make'],
  ['Reading', 'makes'],
  ['Practice', 'makes'],
];

describe('the verb of a number question (finding a)', () => {
  // The verb is "make" when the first word or the head word is plural.
  it.each([
    ['workouts', 'workouts', 'workouts', 'make'],
    ['strength workouts', 'strength', 'workouts', 'make'],
    ['yoga class', 'yoga', 'class', 'makes'],
    ['people', 'people', 'people', 'make'],
    ['children', 'children', 'children', 'make'],
    ['time outdoors', 'time', 'outdoors', 'make'],
    ['pages read', 'pages', 'read', 'make'],
    ['miles run', 'miles', 'run', 'make'],
    ['blocks sewn', 'blocks', 'sewn', 'make'],
    ['minutes of practice', 'minutes', 'minutes', 'make'],
    ['pages of the book', 'pages', 'pages', 'make'],
    ['reading', 'reading', 'reading', 'makes'],
    ['Spanish lessons', 'spanish', 'lessons', 'make'],
  ])('"%s": the first word is "%s" and the head word "%s", so "%s"', (thing, first, head, verb) => {
    expect(firstWord(thing)).toBe(first);
    expect(headWord(thing)).toBe(head);
    expect(makeVerb(thing)).toBe(verb);
  });

  it.each(THINGS)('"%s" asks with "%s", in the question and in the help', (title, verb) => {
    const t = target('t1', title);
    const thing = countedThing(t);
    expect(numberQuestion('floor', t, TODAY)).toBe(`How many ${thing} ${verb} a week count, even a hard one?`);
    // The help names the same verb.
    const help = numberHelp(draftWith(t), 'floor', TODAY);
    expect(help).toContain(`how many ${thing} ${verb} a week count`);
  });

  it('reads the owner\'s examples', () => {
    expect(numberQuestion('floor', target('t1', 'Workouts'), TODAY)).toBe('How many workouts make a week count, even a hard one?');
    expect(numberQuestion('floor', target('t1', 'Practice', { measure: 'time' }), TODAY)).toBe(
      'How many minutes of practice make a week count, even a hard one?',
    );
  });

  // "outdoors" ends in "s", so the rule says "make"; the sentence is not good English ("How much time outdoors makes a week
  // count" would be). Pinned as it is, not patched: it is in the close-out. Counted in minutes (measure time) it reads well.
  it('shows what "time outdoors" produces', () => {
    expect(headWord('time outdoors')).toBe('outdoors');
    expect(numberQuestion('floor', target('t1', 'Time outdoors'), TODAY)).toBe('How many time outdoors make a week count, even a hard one?');
    expect(numberQuestion('floor', target('t1', 'Time outdoors', { measure: 'time' }), TODAY)).toBe(
      'How many minutes of time outdoors make a week count, even a hard one?',
    );
  });

  it('a deadline number has no verb to agree', () => {
    const t = target('t1', 'Blocks sewn', { period: { kind: 'deadline', dueDate: '2026-11-20' } as TargetDraft['period'] });
    expect(numberQuestion('floor', t, TODAY)).toMatch(/^How many blocks sewn by .+ would still count as on track\?$/);
  });

  it('every scripted case and step: the number question, the options lead and the help agree with the counted thing', () => {
    let checked = 0;
    for (const c of SETUP_CASES) {
      for (const step of c.script) {
        if (step.topic !== 'floor' && step.topic !== 'aspiration') continue;
        if (step.kind !== 'question' && step.kind !== 'ideas' && step.kind !== 'interpretations') continue;
        const t = countedTarget(step.draft, step.topic);
        if (!t) continue;
        const text = step.kind === 'ideas' || step.kind === 'interpretations' ? optionsLead(step, TODAY) : normalizeNumberTurn(step, TODAY).question;
        if (!text || t.period.kind === 'deadline' || step.topic === 'aspiration') continue;
        const thing = countedThing(t);
        expect(text.replace(/^For [^,]+, h/, 'H')).toBe(`How many ${thing} ${makeVerb(thing)} a week count, even a hard one?`);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('no source file still words it with "makes" after "how many"', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
      });
    const offenders = walk(join(process.cwd(), 'lib'))
      .filter((p) => /[Hh]ow many [^?`'"\n]* makes a week count/.test(readFileSync(p, 'utf8')))
      .map((p) => p.replace(process.cwd(), ''));
    expect(offenders).toEqual([]);
  });

  it('the detail line keeps "that makes": its verb agrees with "number"', () => {
    expect(numberAbout('floor', target('t1', 'Workouts'), TODAY)).toBe('The number of workouts that makes a week count, even a hard one.');
  });
});

describe('the quick path\'s missing-floor line (finding b)', () => {
  const missingFloor = (t: TargetDraft, words = {}) =>
    describeMissing(draftWith(t).model, [{ path: `goals.g1.targets.${t.key}.floor`, message: 'x', code: 'rule' as const }], words);

  it.each(THINGS)('"%s": the same question as the number card, with its question mark', (title) => {
    const t = target('t1', title);
    expect(missingFloor(t)).toEqual([numberQuestion('floor', t, null)]);
  });

  it('reads the owner\'s example', () => {
    expect(missingFloor(target('t1', 'Workouts'))).toEqual(['How many workouts make a week count, even a hard one?']);
  });

  it('uses the person\'s own capital and a deadline as a date', () => {
    expect(missingFloor(target('t1', 'Spanish lessons'), { said: ['I want to do Spanish lessons'] })).toEqual([
      'How many Spanish lessons make a week count, even a hard one?',
    ]);
    const due = target('t1', 'Blocks sewn', { period: { kind: 'deadline', dueDate: '2026-11-20' } as TargetDraft['period'] });
    expect(missingFloor(due, { today: TODAY })).toEqual([numberQuestion('floor', due, TODAY)]);
  });

  it('no missing-fact line says fewest, floor, aim or target on its own', () => {
    const t = target('t1', 'Workouts');
    const fields = ['floor', 'sources', 'unit', 'role', 'aspiration'];
    const lines = fields.flatMap((f) => describeMissing(draftWith(t).model, [{ path: `goals.g1.targets.t1.${f}`, message: 'x', code: 'rule' as const }]));
    for (const line of lines) expect(line).not.toMatch(/\b(fewest|floor|aim|aspiration|target|baseline)\b/i);
    expect(lines).toContain('How many workouts make a week count, even a hard one?');
  });
});

describe('idea buttons name the counted thing (finding c)', () => {
  it.each([
    ['At least 2 a week', 'workouts', 'At least 2 workouts a week'],
    ['Aiming for 3 a week', 'workouts', 'Aiming for 3 workouts a week'],
    ['At least two a week', 'runs', 'At least two runs a week'],
    ['At least 30 a week', 'minutes of practice', 'At least 30 minutes of practice a week'],
    ['At least 2 by Friday, Nov 20', 'blocks sewn', 'At least 2 blocks sewn by Friday, Nov 20'],
    ['At least 2', 'workouts', 'At least 2 workouts'],
    // Already named, or not a number the lead sets: left as they are.
    ['At least 2 workouts a week', 'workouts', 'At least 2 workouts a week'],
    ['At least 1 workout a week', 'workouts', 'At least 1 workout a week'],
    ['At least 30 minutes a week', 'minutes of practice', 'At least 30 minutes a week'],
    ['At least 30 a week', 'pages read', 'At least 30 pages read a week'],
    ['At least 30 pages a week', 'pages read', 'At least 30 pages a week'],
    ['Aiming for 5 a week', 'miles run', 'Aiming for 5 miles run a week'],
    ['A different number', 'workouts', 'A different number'],
    ['2 a week', 'workouts', '2 a week'],
    ['At least 2 times a week', 'workouts', 'At least 2 times a week'],
  ])('"%s" with "%s" is "%s"', (option, thing, expected) => {
    expect(nameThingInOption(option, thing)).toBe(expected);
  });

  it.each(['ideas', 'interpretations'] as const)('on a %s card about the least and about the aim, every option leads and names the thing', (kind) => {
    for (const [topic, lead] of [['floor', 'At least'], ['aspiration', 'Aiming for']] as const) {
      const shown = normalizeNumberTurn(turnOf({ kind, topic, options: [`${lead} 2 a week`, `${lead} 3 a week`, 'A different number'] }), TODAY);
      expect(shown.options).toEqual([`${lead} 2 workouts a week`, `${lead} 3 workouts a week`, 'A different number']);
    }
  });

  it('is the same turn when nothing changes, and leaves other topics alone', () => {
    const named = turnOf({ options: ['At least 2 workouts a week'] });
    expect(normalizeNumberTurn(named, TODAY)).toBe(named);
    const other = turnOf({ topic: 'shape', options: ['At least 2 a week'] });
    expect(normalizeNumberTurn(other, TODAY)).toBe(other);
    const noTarget = turnOf({ draft: emptyDraft(), options: ['At least 2 a week'] });
    expect(normalizeNumberTurn(noTarget, TODAY)).toBe(noTarget);
  });

  it('every scripted ideas and options card about a number: each option with a number names the thing, and starts as it did', () => {
    let checked = 0;
    for (const c of SETUP_CASES) {
      for (const step of c.script) {
        if ((step.topic !== 'floor' && step.topic !== 'aspiration') || (step.kind !== 'ideas' && step.kind !== 'interpretations')) continue;
        const t = countedTarget(step.draft, step.topic);
        if (!t) continue;
        const stem = headWord(countedThing(t)).replace(/(es|s)$/, '');
        const shown = normalizeNumberTurn(step, TODAY);
        shown.options.forEach((o, i) => {
          if (!/\d|\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(o) || !/^(at least|aiming for)\b/i.test(o)) return;
          expect(o.toLowerCase()).toContain(stem);
          expect(o.startsWith(step.options[i].split(/\d|\s(?:one|two|three|four|five|six|seven|eight|nine|ten)\s/i)[0].trim())).toBe(true);
          checked += 1;
        });
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
