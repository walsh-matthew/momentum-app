// The app's one date formatter (MOM-111 finding 7): "today", "tomorrow", "Thursday, Nov 5", the year only when it is not this
// year, and Claude's own words made casual before they reach a setup screen. Pure.

import { describe, expect, it } from 'vitest';
import { MACHINE_DATE, casualDate, casualDateLabel, casualText, dateInZone } from '@/lib/dates/casual';

const TODAY = '2026-10-29'; // a Thursday

describe('casualDate', () => {
  it('says today, tomorrow and yesterday', () => {
    expect(casualDate('2026-10-29', TODAY)).toBe('today');
    expect(casualDate('2026-10-30', TODAY)).toBe('tomorrow');
    expect(casualDate('2026-10-28', TODAY)).toBe('yesterday');
    expect(casualDateLabel('2026-10-30', TODAY)).toBe('Tomorrow');
  });

  it('names the weekday and the short month, and the year only when it is not this year', () => {
    expect(casualDate('2026-11-05', TODAY)).toBe('Thursday, Nov 5');
    expect(casualDate('2027-01-04', TODAY)).toBe('Monday, Jan 4, 2027');
    expect(casualDate('2025-12-31', TODAY)).toBe('Wednesday, Dec 31, 2025');
  });

  it('has a short weekday, no weekday, and no relative words when asked', () => {
    expect(casualDate('2026-11-05', TODAY, { weekday: 'short' })).toBe('Thu, Nov 5');
    expect(casualDate('2026-11-05', TODAY, { weekday: 'none' })).toBe('Nov 5');
    expect(casualDate('2026-10-29', TODAY, { relative: false })).toBe('Thursday, Oct 29');
  });

  it('shows the year when today is not known, and leaves something that is not a date as it is', () => {
    expect(casualDate('2026-11-05', null)).toBe('Thursday, Nov 5, 2026');
    expect(casualDate('2026-02-30', TODAY)).toBe('2026-02-30');
    expect(casualDate('soon', TODAY)).toBe('soon');
  });
});

describe('casualText, for Claude\'s words in setup', () => {
  it('rewrites a machine date and a fully spelled one, without relative words', () => {
    expect(casualText('Start on 2026-10-29?', TODAY)).toBe('Start on Thursday, Oct 29?');
    expect(casualText('Due June 14, 2027, as you said.', TODAY)).toBe('Due Monday, Jun 14, 2027, as you said.');
    expect(casualText('From 2026-11-02 to 2026-11-08.', TODAY)).toBe('From Monday, Nov 2 to Sunday, Nov 8.');
  });

  it('reads each date once, even a May one that already looks spelled', () => {
    expect(casualText('Due 2027-05-05.', TODAY)).toBe('Due Wednesday, May 5, 2027.');
    expect(casualText('May 5, 2027', TODAY)).toBe('Wednesday, May 5, 2027');
  });

  it('leaves no machine date behind, and leaves other text alone', () => {
    expect(MACHINE_DATE.test(casualText('2026-10-29 and 2026-12-01', TODAY))).toBe(false);
    expect(casualText('Three times a week, version 2026-99-99.', TODAY)).toBe('Three times a week, version 2026-99-99.');
  });
});

describe('dateInZone', () => {
  it('is the calendar date in that zone, or null for a zone that is not one', () => {
    const at = new Date(Date.UTC(2026, 9, 29, 3, 0, 0));
    expect(dateInZone('UTC', at)).toBe('2026-10-29');
    expect(dateInZone('America/Los_Angeles', at)).toBe('2026-10-28');
    expect(dateInZone('Not/AZone', at)).toBeNull();
  });
});
