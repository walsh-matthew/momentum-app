// The words and checks of the review's edit of a target's numbers (lib/review/targetChange.ts, components/review/targetChangeWording.ts,
// MOM-146). Pure. The same check runs on the form and on the server, so what is pinned here is what both say.

import { describe, expect, it } from 'vitest';
import {
  aspirationQuestion,
  floorQuestion,
  homeChangeLine,
  levelsInWords,
  savedLine,
  startsLine,
} from '@/components/review/targetChangeWording';
import { CHANGE_PROBLEMS, checkChange } from '@/lib/review/targetChange';

const runs = { title: 'Runs', measure: 'count', unit: null } as const;

describe('checkChange', () => {
  it('takes whole numbers for a count and an empty number hoped for as none', () => {
    expect(checkChange({ floor: '4', aspiration: '', days: null }, 'count')).toEqual({ ok: true, value: { floor: 4, aspiration: null, days: null } });
    expect(checkChange({ floor: ' 4 ', aspiration: ' 6 ', days: null }, 'count')).toEqual({ ok: true, value: { floor: 4, aspiration: 6, days: null } });
  });

  it('takes a decimal for a quantity or minutes, and not for a count or a checklist', () => {
    expect(checkChange({ floor: '2.5', aspiration: '', days: null }, 'quantity')).toMatchObject({ ok: true, value: { floor: 2.5 } });
    expect(checkChange({ floor: '2.5', aspiration: '', days: null }, 'time')).toMatchObject({ ok: true });
    expect(checkChange({ floor: '2.5', aspiration: '', days: null }, 'count')).toEqual({ ok: false, field: 'floor', message: CHANGE_PROBLEMS.floorWhole });
    expect(checkChange({ floor: '2.5', aspiration: '', days: null }, 'checklist')).toMatchObject({ ok: false, field: 'floor' });
  });

  it.each(['', '  ', '0', '0.0', '-1', '+2', '1e3', '1,000', 'two', '3 runs', '.5', '5.', '1000000000'])('refuses %j for the number that still counts', (floor) => {
    const result = checkChange({ floor, aspiration: '', days: null }, 'quantity');
    expect(result).toMatchObject({ ok: false, field: 'floor' });
  });

  it('checks the number that still counts first, then the number hoped for, then the days, so the form moves to the first problem', () => {
    expect(checkChange({ floor: '', aspiration: 'x', days: [] }, 'count')).toMatchObject({ field: 'floor' });
    expect(checkChange({ floor: '3', aspiration: 'x', days: [] }, 'count')).toMatchObject({ field: 'aspiration' });
    expect(checkChange({ floor: '3', aspiration: '4', days: [] }, 'count')).toEqual({ ok: false, field: 'days', message: 'Pick at least one day.' });
  });

  it('refuses a number hoped for below the number that still counts, and allows it equal', () => {
    expect(checkChange({ floor: '5', aspiration: '4', days: null }, 'count')).toEqual({ ok: false, field: 'aspiration', message: CHANGE_PROBLEMS.aspirationBelow });
    expect(checkChange({ floor: '5', aspiration: '5', days: null }, 'count')).toMatchObject({ ok: true });
  });

  it('puts the days in order once each and keeps only the real ones', () => {
    expect(checkChange({ floor: '2', aspiration: '', days: [5, 1, 5, 3] }, 'count')).toMatchObject({ ok: true, value: { days: [1, 3, 5] } });
    expect(checkChange({ floor: '2', aspiration: '', days: [0, 8, 1.5] }, 'count')).toMatchObject({ ok: false, field: 'days' });
  });

  it('says the problems in everyday words, with no jargon', () => {
    for (const message of Object.values(CHANGE_PROBLEMS)) expect(message).not.toMatch(/floor|aspiration|target|baseline|invalid|error/i);
  });
});

describe('the words around a change', () => {
  it('asks each number by what it is for, with the person\'s own counted thing, the same as setup', () => {
    expect(floorQuestion(runs)).toBe('In a hard week, how many runs would still count?');
    expect(aspirationQuestion(runs)).toBe('How many runs a week are you hoping for?');
    expect(floorQuestion({ title: 'Pages read', measure: 'count', unit: null })).toBe('In a hard week, how many pages read would still count?');
  });

  it('writes the numbers as the saved line and the home line, which are the same words', () => {
    expect(savedLine('2026-11-02', runs, 4, 6, '2026-10-31')).toBe('Saved. From Mon, Nov 2: 4 runs in a hard week, hoping for 6.');
    expect(homeChangeLine('2026-11-02', runs, 4, 6, '2026-10-31')).toBe('From Mon, Nov 2: 4 runs in a hard week, hoping for 6.');
    expect(savedLine('2026-11-02', runs, 4, 6, '2026-10-31').replace('Saved. ', '')).toBe(homeChangeLine('2026-11-02', runs, 4, 6, '2026-10-31'));
  });

  it('leaves out "hoping for" when there is no such number, and says one in the singular', () => {
    expect(homeChangeLine('2026-11-02', runs, 4, null, '2026-10-31')).toBe('From Mon, Nov 2: 4 runs in a hard week.');
    expect(homeChangeLine('2026-11-02', runs, 1, null, '2026-10-31')).toBe('From Mon, Nov 2: 1 run in a hard week.');
  });

  it('counts a quantity in its own unit and minutes as minutes', () => {
    expect(levelsInWords({ title: 'Distance', measure: 'quantity', unit: 'km' }, 10, 15)).toBe('10 km in a hard week, hoping for 15 km');
    expect(levelsInWords({ title: 'Practice', measure: 'time', unit: null }, 90, null)).toBe('90 minutes of practice in a hard week');
  });

  it('names the day the change starts and says earlier weeks keep their numbers, with the year only when it is not this year', () => {
    expect(startsLine('2026-11-02', '2026-10-31')).toBe('This starts Mon, Nov 2. Weeks before that keep the numbers they had.');
    expect(startsLine('2027-01-04', '2026-12-30')).toBe('This starts Mon, Jan 4, 2027. Weeks before that keep the numbers they had.');
  });
});
