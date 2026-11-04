// MOM-167 parts 8, 9 and 11, the words before the freeze: the time zone in plain words, a count of one before a unit, and the tone
// question's range. The approved words are in MOM-167's Jira comment of 2026-11-02 (Block 1.3). Pure code, no network.

import { describe, expect, it } from 'vitest';
import { describeEntry } from '@/components/entries/format';
import { unitWord } from '@/components/forecast/wording';
import { levelsText, toAspirationLine, toSettledAspirationLine, levelChip } from '@/components/home/wording';
import { changeLine } from '@/components/review/wording';
import { emptyDraft } from '@/lib/setup/draft';
import { amount, amountOf, dayKindWords, renderPlayback } from '@/lib/setup/playback';
import { recapSections } from '@/lib/setup/quickRecap';
import { SETTINGS_ROWS } from '@/lib/setup/cards';
import { SETUP_STEPS } from '@/lib/setup/steps';
import { plainZoneName, zoneLine } from '@/lib/setup/timeZones';
import { singularFirstWord, singularUnit, unitCount, unitFor } from '@/lib/utils/units';
import type { SetupModel } from '@/types/setup';
import { goal, target } from './helpers/setupScript';

const model = (): SetupModel => emptyDraft().model;

describe('part 9: the owner\'s singular rule', () => {
  it.each([
    ['pounds', 'pound'],
    ['chapters', 'chapter'],
    ['miles', 'mile'],
    ['pages', 'page'],
    ['hours', 'hour'],
    ['sessions', 'session'],
    ['glasses', 'glass'],
    ['boxes', 'box'],
    ['inches', 'inch'],
    ['dishes', 'dish'],
    ['Pounds', 'Pound'],
  ])('"%s" is "%s" at one', (plural, one) => {
    expect(singularUnit(plural)).toBe(one);
  });

  it('leaves a word ending in "ss", or with no "s", as the person said it', () => {
    for (const word of ['glass', 'mass', 'class', 'feet', 'km', 'reps?', 'minute', '']) expect(singularUnit(word), word).toBe(word);
  });

  it('is singular only for exactly one, and only for a single word', () => {
    expect(unitFor(1, 'pounds')).toBe('pound');
    expect(unitFor(2, 'pounds')).toBe('pounds');
    expect(unitFor(0, 'pounds')).toBe('pounds');
    expect(unitFor(1.5, 'pounds')).toBe('pounds');
    expect(unitFor(1, 'glasses of water')).toBe('glasses of water');
    expect(unitFor(1, '')).toBe('');
  });

  it('writes a count with its unit, or the number alone without one', () => {
    expect(unitCount(1, 'hours')).toBe('1 hour');
    expect(unitCount(2, 'hours')).toBe('2 hours');
    expect(unitCount(1, 'sessions')).toBe('1 session');
    expect(unitCount(5000, 'pounds')).toBe('5000 pounds');
    expect(unitCount(2, null)).toBe('2');
    expect(unitCount(2, undefined)).toBe('2');
    expect(unitCount(1, '')).toBe('1');
  });

  it('makes the first plural word of a phrase singular', () => {
    expect(singularFirstWord('pounds lifted')).toBe('pound lifted');
    expect(singularFirstWord('minutes of practice')).toBe('minute of practice');
    expect(singularFirstWord('reading')).toBe('reading');
  });
});

describe('part 9: "Workdays (1 hours)" reads "(1 hour)"', () => {
  const withKinds = (kinds: SetupModel['person']['dayTypes']): SetupModel => {
    const m = model();
    m.person.dayTypes = kinds;
    return m;
  };

  it('one kind of day, for 1 and for 2, in hours and in sessions', () => {
    expect(dayKindWords({ name: 'Workdays', capacityUnit: 'hours', capacityAmount: 1 })).toBe('Workdays (1 hour)');
    expect(dayKindWords({ name: 'Workdays', capacityUnit: 'hours', capacityAmount: 2 })).toBe('Workdays (2 hours)');
    expect(dayKindWords({ name: 'Busy days', capacityUnit: 'sessions', capacityAmount: 1 })).toBe('Busy days (1 session)');
    expect(dayKindWords({ name: 'Busy days', capacityUnit: 'sessions', capacityAmount: 2 })).toBe('Busy days (2 sessions)');
    expect(dayKindWords({ name: 'Quiet days', capacityUnit: null, capacityAmount: 3 })).toBe('Quiet days (3)');
    expect(dayKindWords({ name: 'Rest days', capacityUnit: null, capacityAmount: null })).toBe('Rest days');
  });

  it('in the conversation\'s playback and on the quick path', () => {
    const kinds = [
      { name: 'Workdays', capacityUnit: 'hours' as const, capacityAmount: 1 },
      { name: 'Weekends', capacityUnit: 'hours' as const, capacityAmount: 2 },
    ];
    const said = renderPlayback(withKinds(kinds), 'planning', { locale: 'en-US' });
    expect(said).toContain('Your kinds of days: Workdays (1 hour) and Weekends (2 hours).');
    const quick = recapSections(withKinds(kinds), { locale: 'en-US' })
      .flatMap((s) => s.lines)
      .map((l) => l.text);
    expect(quick).toContain('Your kinds of days: Workdays (1 hour) and Weekends (2 hours).');
  });
});

describe('part 9: every other place a count of one meets a unit', () => {
  it('a quantity target: "1 pound", "2 pounds", a multi-word unit as written', () => {
    expect(amount({ measure: 'quantity', unit: 'pounds' }, 1)).toBe('1 pound');
    expect(amount({ measure: 'quantity', unit: 'pounds' }, 2)).toBe('2 pounds');
    expect(amount({ measure: 'quantity', unit: 'glasses' }, 1)).toBe('1 glass');
    expect(amount({ measure: 'quantity', unit: 'glasses of water' }, 1)).toBe('1 glasses of water');
    expect(amount({ measure: 'quantity', unit: null }, 1)).toBe('1');
  });

  it('what the target counts: pounds lifted, miles, chapters, minutes of practice', () => {
    const lifted = { title: 'Pounds lifted', measure: 'quantity' as const, unit: 'pounds' };
    expect(amountOf(lifted, 1)).toBe('1 pound lifted');
    expect(amountOf(lifted, 5000)).toBe('5000 pounds lifted');
    const distance = { title: 'Distance', measure: 'quantity' as const, unit: 'miles' };
    expect(amountOf(distance, 1)).toBe('1 mile');
    expect(amountOf(distance, 10)).toBe('10 miles');
    const chapters = { title: 'Chapters', measure: 'checklist' as const, unit: null };
    expect(amountOf(chapters, 1)).toBe('1 chapter');
    expect(amountOf(chapters, 3)).toBe('3 chapters');
    const practice = { title: 'Minutes of practice', measure: 'time' as const, unit: null };
    expect(amountOf(practice, 1)).toBe('1 minute of practice');
    expect(amountOf(practice, 30)).toBe('30 minutes of practice');
    const runs = { title: 'Runs', measure: 'count' as const, unit: null };
    expect(amountOf(runs, 1)).toBe('1 run');
    expect(amountOf(runs, 2)).toBe('2 runs');
  });

  it('a logged quantity entry', () => {
    const entry = (value: number, unit: string | null) => ({ measure: 'quantity', unit, value, detail: null }) as never;
    expect(describeEntry(entry(1, 'miles'))).toBe('1 mile');
    expect(describeEntry(entry(12, 'miles'))).toBe('12 miles');
    expect(describeEntry(entry(1, null))).toBe('1');
  });

  it('home\'s lines about a target\'s levels', () => {
    const card = (floor: number, aspiration: number | null, unit: string | null) =>
      ({ floor, aspiration, unit, period: 'weekly', dueOn: null }) as never;
    expect(levelsText(card(1, null, 'pounds'))).toBe('Floor 1 pound a week');
    expect(levelsText(card(15, 20, 'km'))).toBe('Floor 15 km a week · aspiration 20 km');
    expect(levelsText(card(5, 1, 'miles'))).toBe('Floor 5 miles a week · aspiration 1 mile');
    expect(levelsText(card(2, null, 'pounds'))).toBe('Floor 2 pounds a week');
    const counted = (remaining: number | null, unit: string | null) =>
      ({ status: 'counted', graded: true, level: 'floor', remainingToAspiration: remaining, unit }) as never;
    expect(toAspirationLine(counted(1, 'pounds'))).toBe('1 pound more to reach your aspiration');
    expect(toAspirationLine(counted(2, 'pounds'))).toBe('2 pounds more to reach your aspiration');
    expect(toSettledAspirationLine(counted(1, 'pages'))).toBe('1 page short of your aspiration that week');
    const partway = (remaining: number, unit: string | null) =>
      ({ status: 'counted', graded: true, level: 'partway', startedPartway: false, remainingToFloor: remaining, unit }) as never;
    expect(levelChip(partway(1, 'miles'), '2026-11-02').label).toBe('Partway · 1 mile to floor');
    expect(levelChip(partway(3, 'miles'), '2026-11-02').label).toBe('Partway · 3 miles to floor');
  });

  it('the review\'s line about a changed week names the unit for each number', () => {
    const change = (now: number, said: number) =>
      ({ title: 'Distance', unit: 'miles', now: { counted: now }, said: { counted: said } }) as never;
    const line = changeLine(change(1, 3));
    expect(line).toContain('it now reads 1 mile (');
    expect(line).toContain('The recap said 3 miles (');
  });

  it('the forecast screen\'s hours and sessions use the same rule', () => {
    expect(unitWord('hours', 1)).toBe('hour');
    expect(unitWord('hours', 2)).toBe('hours');
    expect(unitWord('sessions', 1)).toBe('session');
    expect(unitWord('sessions', 2)).toBe('sessions');
  });

  it('a target in the playback reads in the singular for one', () => {
    const m = model();
    const g = goal('g1', 'Strength');
    g.targets.push(target('t1', 'Pounds lifted', { measure: 'quantity', unit: 'pounds', floor: 1, sources: [{ kind: 'manual' }] }));
    m.goals.push(g);
    const lines = renderPlayback(m, 'targets', { locale: 'en-US' }).join('\n');
    expect(lines).toContain('at least 1 pound lifted');
    expect(lines).not.toContain('1 pounds');
  });
});

describe('part 8: the time zone in plain words', () => {
  it('a US zone', () => {
    expect(zoneLine('America/Los_Angeles')).toBe("You're on Pacific Time.");
    expect(zoneLine('America/Denver')).toBe("You're on Mountain Time.");
    expect(zoneLine('America/New_York')).toBe("You're on Eastern Time.");
    expect(zoneLine('America/Phoenix')).toBe("You're on Mountain Standard Time.");
  });

  it('a zone outside the US', () => {
    expect(zoneLine('Europe/Paris')).toBe("You're on Central European Time.");
    expect(zoneLine('Europe/London')).toBe("You're on United Kingdom Time.");
    expect(zoneLine('Asia/Kolkata')).toBe("You're on India Standard Time.");
  });

  it('a zone with no plain name keeps its city, or else the id as it is', () => {
    expect(plainZoneName('UTC')).toBeNull();
    expect(plainZoneName('Etc/GMT+5')).toBeNull();
    expect(zoneLine('Etc/GMT+5')).toBe("You're in the Etc/GMT+5 time zone.");
    expect(zoneLine('UTC')).toBe("You're in the UTC time zone.");
    expect(zoneLine('Not/AZone')).toBe("You're on AZone time.");
    expect(zoneLine('nonsense')).toBe("You're in the nonsense time zone.");
  });

  it('is always English, and never shows a raw id for a zone that has a plain name', () => {
    for (const zone of ['America/Los_Angeles', 'Europe/Paris', 'Asia/Tokyo', 'Australia/Sydney']) {
      expect(zoneLine(zone), zone).not.toContain('/');
      expect(zoneLine(zone), zone).not.toContain('time zone');
    }
  });

  it('is the same line in the conversation\'s playback and on the quick path', () => {
    const m = model();
    m.person.timeZone = 'America/Los_Angeles';
    m.person.weekStart = 1;
    expect(renderPlayback(m, 'planning', { locale: 'en-US' })[0]).toBe("You're on Pacific Time.");
    const quick = recapSections(m, { locale: 'en-US' })
      .flatMap((s) => s.lines)
      .map((l) => l.text);
    expect(quick).toContain("You're on Pacific Time.");
  });
});

describe('part 11: the tone row runs gentle to direct', () => {
  it('is the approved question and reason, with the choices in order, and says nothing about "blunt"', () => {
    const tone = SETTINGS_ROWS.find((r) => r.topic === 'tone');
    expect(tone?.question).toBe('How direct should Momentum be?');
    expect(tone?.reason).toBe('Your progress and weekly look-back are worded that way.');
    expect(tone?.choices.map((c) => c.label)).toEqual(['Gentle', 'Plain', 'Direct']);
    expect(JSON.stringify(tone)).not.toMatch(/blunt/i);
  });
});
