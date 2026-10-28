// The person's days and weeks (docs/DOMAIN_MODEL.md §1.1, §4.2 principle 1). "Today" and the anchors are inputs:
// nothing here reads a clock or fills in a time zone, a week start or a day end.

import type { LocalDate, PeriodKind, TimeAnchors, Weekday } from '@/types/scoreboard';
import { EARLY_DAY_END_LIMIT } from './constants';

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WITH_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;
const MS_PER_DAY = 86_400_000;

const msToDate = (ms: number): LocalDate => new Date(ms).toISOString().slice(0, 10);

function dateToMs(date: LocalDate): number {
  const m = DATE.exec(date);
  if (!m) throw new Error(`"${date}" is not a date (YYYY-MM-DD).`);
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (msToDate(ms) !== date) throw new Error(`"${date}" is not a real date.`);
  return ms;
}

export const addDays = (date: LocalDate, days: number): LocalDate => msToDate(dateToMs(date) + days * MS_PER_DAY);
export const dayOfWeek = (date: LocalDate): Weekday => new Date(dateToMs(date)).getUTCDay() as Weekday;
export const assertDate = (date: LocalDate): void => void dateToMs(date);

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

// The anchors every day needs: the time zone and the day end.
export function assertDayAnchors(anchors: TimeAnchors): void {
  if (anchors.timeZone === null || anchors.timeZone === '') {
    throw new Error('The time zone is not set. Ask the person in setup; the engine assumes none.');
  }
  try {
    formatterFor(anchors.timeZone);
  } catch {
    throw new Error(`"${anchors.timeZone}" is not a time zone.`);
  }
  const end = anchors.dayEndMinutes;
  if (end === null) throw new Error('The day end is not set. Ask the person in setup; the engine assumes none.');
  if (!Number.isInteger(end) || end < 0 || end > 1439) {
    throw new Error('The day end must be a whole number of minutes after midnight, from 0 to 1439.');
  }
}

// A deadline target needs no week start, so only a weekly or day-slot period asks for one.
export function assertAnchors(anchors: TimeAnchors, period: PeriodKind): void {
  assertDayAnchors(anchors);
  if (period === 'deadline') return;
  const start = anchors.weekStartsOn;
  if (start === null) throw new Error('The week start is not set. Ask the person; the engine assumes none.');
  if (!Number.isInteger(start) || start < 0 || start > 6) {
    throw new Error('The week start must be a weekday from 0 (Sunday) to 6 (Saturday).');
  }
}

// An early day end (after midnight, before 06:00) moves the boundary: day D runs from D at that time to D+1
// at that time. Any other day end is a check-in time and the boundary stays at midnight.
const boundaryShift = (dayEndMinutes: number): number =>
  dayEndMinutes > 0 && dayEndMinutes < EARLY_DAY_END_LIMIT ? dayEndMinutes : 0;

// The person's day an instant falls on.
export function localDay(instant: string, anchors: TimeAnchors): LocalDate {
  assertDayAnchors(anchors);
  if (!WITH_OFFSET.test(instant)) {
    throw new Error(`"${instant}" has no offset or Z, so its day cannot be told; the engine assumes no time zone.`);
  }
  const ms = Date.parse(instant);
  if (Number.isNaN(ms)) throw new Error(`"${instant}" is not a date and time.`);
  const part: Record<string, string> = {};
  for (const p of formatterFor(anchors.timeZone as string).formatToParts(new Date(ms))) part[p.type] = p.value;
  const date = `${part.year}-${part.month}-${part.day}`;
  const minutes = Number(part.hour) * 60 + Number(part.minute);
  return minutes < boundaryShift(anchors.dayEndMinutes as number) ? addDays(date, -1) : date;
}

// Noon on a local day in the person's time zone, as an instant. Noon is the one time of day that no daylight-saving
// change and no early day end can move to another date, so localDay puts the result on the day asked for. A manual
// log on a chosen day uses it (MOM-110): the log says which day, not what time. The zone's offset is read at the
// first guess and again at the corrected instant, which settles a day whose offset changes during it.
export function localNoon(date: LocalDate, timeZone: string): string {
  const wallClock = dateToMs(date) + 12 * 3_600_000;
  const offsetAt = (ms: number): number => {
    const part: Record<string, string> = {};
    for (const p of formatterFor(timeZone).formatToParts(new Date(ms))) part[p.type] = p.value;
    const shown = Date.UTC(Number(part.year), Number(part.month) - 1, Number(part.day), Number(part.hour), Number(part.minute));
    return shown - Math.floor(ms / 60_000) * 60_000;
  };
  const first = wallClock - offsetAt(wallClock);
  return new Date(wallClock - offsetAt(first)).toISOString();
}

// The week (start and end day, both inclusive) holding a day, starting on the person's week start.
export function weekRange(date: LocalDate, weekStartsOn: Weekday): { start: LocalDate; end: LocalDate } {
  const start = addDays(date, -((dayOfWeek(date) - weekStartsOn + 7) % 7));
  return { start, end: addDays(start, 6) };
}
