// The person's days and weeks (docs/DOMAIN_MODEL.md §1.1, §4.2 principle 1). "Today" and the anchors are inputs:
// nothing here reads a clock or fills in a time zone, a week start or a day end.

import type { GradeCheck, LocalDate, PeriodKind, TimeAnchors, Weekday } from '@/types/scoreboard';
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

type AnchorProblem = Extract<GradeCheck, { ok: false }>;
const problem = (anchor: AnchorProblem['anchor'], reason: AnchorProblem['reason'], message: string): AnchorProblem => ({
  ok: false,
  anchor,
  reason,
  message,
});

// The anchors every day needs: the time zone and the day end.
function dayAnchorProblem(anchors: TimeAnchors): AnchorProblem | null {
  if (anchors.timeZone === null || anchors.timeZone === '') {
    return problem('time_zone', 'not_set', 'The time zone is not set. Ask the person in setup; the engine assumes none.');
  }
  try {
    formatterFor(anchors.timeZone);
  } catch {
    return problem('time_zone', 'invalid', `"${anchors.timeZone}" is not a time zone.`);
  }
  const end = anchors.dayEndMinutes;
  if (end === null) return problem('day_end', 'not_set', 'The day end is not set. Ask the person in setup; the engine assumes none.');
  if (!Number.isInteger(end) || end < 0 || end > 1439) {
    return problem('day_end', 'invalid', 'The day end must be a whole number of minutes after midnight, from 0 to 1439.');
  }
  return null;
}

// Whether a target with this period can be graded with these anchors, and if not which anchor stops it. A caller asks
// this before it grades, so a missing anchor is a state to show, not an error to catch. A deadline target needs no
// week start, so only a weekly or day-slot period asks for one.
export function canGrade(anchors: TimeAnchors, period: PeriodKind): GradeCheck {
  const day = dayAnchorProblem(anchors);
  if (day) return day;
  if (period === 'deadline') return { ok: true };
  const start = anchors.weekStartsOn;
  if (start === null) return problem('week_start', 'not_set', 'The week start is not set. Ask the person; the engine assumes none.');
  if (!Number.isInteger(start) || start < 0 || start > 6) {
    return problem('week_start', 'invalid', 'The week start must be a weekday from 0 (Sunday) to 6 (Saturday).');
  }
  return { ok: true };
}

export function assertDayAnchors(anchors: TimeAnchors): void {
  const found = dayAnchorProblem(anchors);
  if (found) throw new Error(found.message);
}

export function assertAnchors(anchors: TimeAnchors, period: PeriodKind): void {
  const check = canGrade(anchors, period);
  if (!check.ok) throw new Error(check.message);
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

// The week (start and end day, both inclusive) holding a day, starting on the person's week start.
export function weekRange(date: LocalDate, weekStartsOn: Weekday): { start: LocalDate; end: LocalDate } {
  const start = addDays(date, -((dayOfWeek(date) - weekStartsOn + 7) % 7));
  return { start, end: addDays(start, 6) };
}
