// The person's days and weeks (lib/engine/time.ts, docs/DOMAIN_MODEL.md §1.1, principle 1): no default time zone,
// week start or day end, and each target asks only for the anchors its period needs.

import { describe, expect, it } from 'vitest';
import { assertAnchors, localDay, weekRange } from '@/lib/engine';
import { anchors } from './helpers/engineFixtures';

describe('assertAnchors: nothing is assumed', () => {
  it('needs a time zone', () => {
    expect(() => assertAnchors(anchors({ timeZone: null }), 'weekly')).toThrow(/time zone is not set/);
    expect(() => assertAnchors(anchors({ timeZone: '' }), 'deadline')).toThrow(/time zone is not set/);
  });

  it('rejects a name that is not a time zone', () => {
    expect(() => assertAnchors(anchors({ timeZone: 'Mars/Phobos' }), 'weekly')).toThrow(/not a time zone/);
  });

  it('needs a day end, a whole number of minutes from 0 to 1439', () => {
    expect(() => assertAnchors(anchors({ dayEndMinutes: null }), 'weekly')).toThrow(/day end is not set/);
    for (const bad of [-1, 1440, 90.5]) {
      expect(() => assertAnchors(anchors({ dayEndMinutes: bad }), 'weekly')).toThrow(/day end must be/);
    }
  });

  it('needs a week start for a weekly or day-slot period', () => {
    expect(() => assertAnchors(anchors({ weekStartsOn: null }), 'weekly')).toThrow(/week start is not set/);
    expect(() => assertAnchors(anchors({ weekStartsOn: null }), 'day_slots')).toThrow(/week start is not set/);
    expect(() => assertAnchors(anchors({ weekStartsOn: 7 as 0 }), 'weekly')).toThrow(/week start must be/);
  });

  it('asks a deadline period for no week start, but still for the time zone and the day end', () => {
    expect(() => assertAnchors(anchors({ weekStartsOn: null }), 'deadline')).not.toThrow();
    expect(() => assertAnchors(anchors({ weekStartsOn: null, dayEndMinutes: null }), 'deadline')).toThrow(/day end/);
    expect(() => assertAnchors(anchors({ weekStartsOn: null, timeZone: null }), 'deadline')).toThrow(/time zone/);
  });
});

describe('localDay', () => {
  it('puts an instant on the day it falls on in the person’s zone, with a midnight day end', () => {
    const a = anchors({ dayEndMinutes: 0 });
    expect(localDay('2026-10-07T23:59:00-07:00', a)).toBe('2026-10-07');
    expect(localDay('2026-10-08T00:00:00-07:00', a)).toBe('2026-10-08');
  });

  describe('a day end after midnight and before 06:00 moves the boundary: day D runs from D at that time to D+1', () => {
    it('02:00: 01:30 still belongs to the day before, 02:00 starts the day', () => {
      const a = anchors({ dayEndMinutes: 120 });
      expect(localDay('2026-10-08T01:30:00-07:00', a)).toBe('2026-10-07');
      expect(localDay('2026-10-08T02:00:00-07:00', a)).toBe('2026-10-08');
      expect(localDay('2026-10-07T23:30:00-07:00', a)).toBe('2026-10-07');
    });

    it('05:59 is the last minute that moves it', () => {
      const a = anchors({ dayEndMinutes: 359 });
      expect(localDay('2026-10-08T05:58:00-07:00', a)).toBe('2026-10-07');
      expect(localDay('2026-10-08T05:59:00-07:00', a)).toBe('2026-10-08');
    });
  });

  describe('any other day end is a check-in time and the boundary stays at midnight', () => {
    it('an evening day end (21:00) does not move the boundary either way', () => {
      const a = anchors({ dayEndMinutes: 1260 });
      expect(localDay('2026-10-07T22:30:00-07:00', a)).toBe('2026-10-07');
      expect(localDay('2026-10-08T00:30:00-07:00', a)).toBe('2026-10-08');
    });

    it('06:00 itself does not move it', () => {
      const a = anchors({ dayEndMinutes: 360 });
      expect(localDay('2026-10-08T00:30:00-07:00', a)).toBe('2026-10-08');
    });

    it('a late-morning day end does not move it', () => {
      const a = anchors({ dayEndMinutes: 600 });
      expect(localDay('2026-10-08T00:30:00-07:00', a)).toBe('2026-10-08');
    });
  });

  it('tells the day in a zone far east of UTC (+14)', () => {
    // 12:00 UTC on the 7th is 02:00 on the 8th in Kiritimati.
    expect(localDay('2026-10-07T12:00:00Z', anchors({ timeZone: 'Pacific/Kiritimati' }))).toBe('2026-10-08');
  });

  it('tells the day in a zone far west of UTC (-11)', () => {
    // 05:00 UTC on the 7th is 18:00 on the 6th in Pago Pago.
    expect(localDay('2026-10-07T05:00:00Z', anchors({ timeZone: 'Pacific/Pago_Pago' }))).toBe('2026-10-06');
  });

  it('follows a daylight-saving change with an early day end', () => {
    const a = anchors({ dayEndMinutes: 120 });
    // Los Angeles springs forward on 2026-03-08 at 02:00. 09:59 UTC is 01:59 standard time: before the 02:00
    // boundary, so still the 7th. 10:00 UTC is 03:00 daylight time.
    expect(localDay('2026-03-08T09:59:00Z', a)).toBe('2026-03-07');
    expect(localDay('2026-03-08T10:00:00Z', a)).toBe('2026-03-08');
  });

  it('refuses an instant with no offset, because it would assume a zone', () => {
    expect(() => localDay('2026-10-07T12:00:00', anchors())).toThrow(/no offset/);
  });

  it('refuses something that is not a date and time', () => {
    expect(() => localDay('2026-13-45T12:00:00Z', anchors())).toThrow(/not a date and time/);
  });

  it('needs the time zone and the day end', () => {
    expect(() => localDay('2026-10-07T12:00:00Z', anchors({ timeZone: null }))).toThrow(/time zone/);
    expect(() => localDay('2026-10-07T12:00:00Z', anchors({ dayEndMinutes: null }))).toThrow(/day end/);
  });
});

describe('weekRange: weeks start on the person’s chosen weekday', () => {
  it('starts on Monday', () => {
    expect(weekRange('2026-10-07', 1)).toEqual({ start: '2026-10-05', end: '2026-10-11' });
    expect(weekRange('2026-10-11', 1)).toEqual({ start: '2026-10-05', end: '2026-10-11' });
  });

  it('starts on Sunday', () => {
    expect(weekRange('2026-10-07', 0)).toEqual({ start: '2026-10-04', end: '2026-10-10' });
  });

  it('starts on Wednesday', () => {
    expect(weekRange('2026-10-06', 3)).toEqual({ start: '2026-09-30', end: '2026-10-06' });
    expect(weekRange('2026-10-07', 3)).toEqual({ start: '2026-10-07', end: '2026-10-13' });
  });

  it('crosses a month and a year end', () => {
    expect(weekRange('2027-01-01', 1)).toEqual({ start: '2026-12-28', end: '2027-01-03' });
  });
});
