// Relative dates the person says ("Monday", "in two weeks", "the 15th"), worked out by code, never by Claude (MOM-111
// finding 8, docs/DOMAIN_MODEL.md §2.2 step 6). Code turns the words into a date from the person's own today; setup then
// shows that date as a proposal they accept or change, so a value it worked out is never saved without their yes. Words that
// name no day ("sometime next month", "next week") are vague: setup asks for the day, with a date picker. Pure.

import { addDays, dayOfWeek } from '@/lib/engine/time';
import { casualDate, dateInZone } from '@/lib/dates/casual';
import { datesIn, numbersIn } from './text';
import { isTimeZone } from './validate';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
const WEEKDAY_ALT = `(${WEEKDAYS.join('|')})s?`;

export type RelativeDate =
  // `sameWeekday`: the person named today's own weekday ("Monday" said on a Monday), so the date is the coming one, a week
  // out, and setup also offers today.
  | { kind: 'date'; iso: string; phrase: string; sameWeekday: boolean }
  | { kind: 'vague'; phrase: string };

export interface ResolveOptions {
  // A start date may be earlier than today ("last Monday": they already started). No other date may.
  allowPast?: boolean;
}

// Words that carry no date of their own, so a reply made of a relative date and these is "just a date".
const FILLER =
  /\b(on|the|this|that|it|its|start|starting|starts|begin|beginning|from|let'?s|lets|say|maybe|how about|i guess|i think|probably|please|ok|okay|um|uh|so|then|around|by|until|till|due|should|could|can|we|i|i'?d|i'?ll|like|to|want|would|be|is|just|go|with|of|for|and|or|yes|yeah|sure|it'?s|that'?s|back|come|comes|run|runs|end|ends|done)\b/g;

const pad = (n: number): string => String(n).padStart(2, '0');

// The person's own today: their time zone's date when setup knows it, else the date on their device. `now` is an input,
// so nothing in lib/setup reads a clock.
export function personToday(timeZone: string | null, deviceToday: string | undefined, now: Date): string | undefined {
  return (timeZone && isTimeZone(timeZone) ? dateInZone(timeZone, now) : null) ?? deviceToday;
}

function nthOnOrAfter(today: string, dayOfMonth: number): string | null {
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  for (let k = 0; k < 13; k++) {
    const month = ((m - 1 + k) % 12) + 1;
    const year = y + Math.floor((m - 1 + k) / 12);
    const candidate = `${year}-${pad(month)}-${pad(dayOfMonth)}`;
    const ms = Date.UTC(year, month - 1, dayOfMonth);
    if (new Date(ms).toISOString().slice(0, 10) === candidate && candidate >= today) return candidate;
  }
  return null;
}

interface Found {
  phrase: string;
  result: RelativeDate | null;
}

// The first relative date in a text, read against `today` (YYYY-MM-DD). Null when there is none, or when the text already
// gives an exact date (that is the person's own date: setup records it as said).
export function relativeDateIn(text: string, today: string, options: ResolveOptions = {}): RelativeDate | null {
  return findRelative(text, today, options)?.result ?? null;
}

function findRelative(text: string, today: string, options: ResolveOptions): Found | null {
  if (datesIn(text).length > 0) return null;
  const t = text.toLowerCase().replace(/[’‘]/g, "'");
  const date = (iso: string, phrase: string, sameWeekday = false): Found => ({
    phrase,
    result: iso < today && !options.allowPast ? null : { kind: 'date', iso, phrase, sameWeekday },
  });
  const vague = (phrase: string): Found => ({ phrase, result: { kind: 'vague', phrase } });

  let m: RegExpMatchArray | null;
  // Longer phrases that hold "today" or "tomorrow" first, so "a week from today" is not read as today.
  if ((m = t.match(/\b(?:a|one) week from (?:today|now|tomorrow)\b/))) return date(addDays(today, m[0].endsWith('tomorrow') ? 8 : 7), m[0]);
  if ((m = t.match(/\bthe day after tomorrow\b/))) return date(addDays(today, 2), m[0]);
  if ((m = t.match(/\btoday\b|\bright now\b/))) return date(today, m[0]);
  if ((m = t.match(/\btomorrow\b/))) return date(addDays(today, 1), m[0]);
  if ((m = t.match(/\byesterday\b/))) return date(addDays(today, -1), m[0]);
  if ((m = t.match(new RegExp(`\\b(last|this past)\\s+${WEEKDAY_ALT}\\b`)))) {
    const want = WEEKDAYS.indexOf(m[2] as (typeof WEEKDAYS)[number]);
    const back = ((dayOfWeek(today) - want + 7) % 7) || 7;
    return date(addDays(today, -back), m[0]);
  }
  if ((m = t.match(new RegExp(`\\b(?:(?:this|next|coming|this coming|on)\\s+)?${WEEKDAY_ALT}\\b`)))) {
    // "next Monday" and "this Monday" both mean the coming one here; a week out when it is today's weekday. It is only ever
    // shown as a proposal, so a reading the person did not mean costs them one tap.
    const want = WEEKDAYS.indexOf(m[1] as (typeof WEEKDAYS)[number]);
    const ahead = ((want - dayOfWeek(today) + 7) % 7) || 7;
    return date(addDays(today, ahead), m[0], ahead === 7);
  }
  if ((m = t.match(/\b(?:in|within)\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\s+(days?|weeks?)\b/))) {
    const n = m[1] === 'a' || m[1] === 'an' ? 1 : numbersIn(m[1])[0];
    if (n !== undefined) return date(addDays(today, m[2].startsWith('week') ? n * 7 : n), m[0]);
  }
  if ((m = t.match(/\b(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)\b/))) {
    const iso = nthOnOrAfter(today, Number(m[1]));
    return iso ? date(iso, m[0]) : vague(m[0]);
  }
  if (
    (m = t.match(
      /\b(?:sometime\s+|some time\s+|early\s+|late\s+|later\s+|end of\s+|the end of\s+)?(?:next|this|in a)\s+(?:week|month|year|weekend|couple of weeks|few weeks)\b|\b(?:soon|sometime|some time|later|in the (?:spring|summer|fall|autumn|winter|new year))\b|\bafter the holidays\b/,
    ))
  ) {
    return vague(m[0]);
  }
  return null;
}

// True when the reply is only a relative date ("Monday", "next week", "in two weeks"), with no other content. Then code takes
// the turn itself (MOM-111 addition b); a reply with more in it ("Monday, 3 times a week") goes to Claude, with the date as a
// hint.
export function isOnlyRelativeDate(text: string, today: string, options: ResolveOptions = {}): boolean {
  const found = findRelative(text, today, options);
  if (!found || !found.result) return false;
  const rest = text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(found.phrase, ' ')
    .replace(FILLER, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return rest === '';
}

// The date in the words people use, for the proposal ("Monday, Nov 2"). The weekday is the date's own, which hard rule 2's
// check does not read as a day of the person's week (lib/setup/text.ts withoutDateWeekdays).
export function proposalDate(found: Extract<RelativeDate, { kind: 'date' }>, today: string): string {
  return casualDate(found.iso, today, { relative: false });
}

// ---------------------------------------------------------------------------
// Lengths of time (MOM-111 round 2, finding 7)
// ---------------------------------------------------------------------------
//
// "Two months", "8 weeks", "10 weeks": a length the person said, anywhere in the conversation. Code counts it from the goal's
// start date, never from today (owner decision D2, 2026-10-29), and setup shows the result as a suggestion with Yes as the
// main button: a goal with an end date gets the exact date ("End Saturday, Jan 2?"); an ongoing goal gets whole weeks, shown
// as a first stretch with its last day ("A first stretch of 9 weeks, through Sunday, Jan 3?"), because an ongoing goal runs
// in whole-week stretches and has no end date (DOMAIN_MODEL §2.2 step 6).

export interface Duration {
  // The person's words for it, lowercased.
  phrase: string;
  amount: number;
  unit: 'day' | 'week' | 'month' | 'year';
}

const AMOUNT_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, 'a couple of': 2, 'a couple': 2, 'couple of': 2 };
const AMOUNT = `(a couple of|a couple|couple of|an|a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\\d{1,3})`;
const DURATION = new RegExp(`\\b${AMOUNT}\\s+(days?|weeks?|months?|years?)\\b`, 'g');
// "3 times a week", "once a week", "per week", "every two weeks", "30 minutes a day" are how often, not how long.
const HOW_OFTEN_BEFORE = /\b(times|x|once|twice|per|each|every|other)\s+$/;
const COUNT_BEFORE_A = /\b\w+s\s+$/;

// The first length of time in a text, or null.
export function durationIn(text: string): Duration | null {
  const t = text.toLowerCase().replace(/[’‘]/g, "'");
  for (const m of t.matchAll(DURATION)) {
    const before = t.slice(0, m.index);
    if (HOW_OFTEN_BEFORE.test(before)) continue;
    if ((m[1] === 'a' || m[1] === 'an') && COUNT_BEFORE_A.test(before)) continue;
    const amount = AMOUNT_WORDS[m[1]] ?? numbersIn(m[1])[0];
    if (amount === undefined || amount <= 0) continue;
    return { phrase: m[0], amount, unit: m[2].replace(/s$/, '') as Duration['unit'] };
  }
  return null;
}

// Words that carry nothing of their own beside a length ("two months from now", "for about 8 weeks").
const DURATION_FILLER = /\b(from|now|today|for|about|around|roughly|maybe|let'?s|lets|do|make|it|a|the|first|stretch|long|total|in|within|say|how about|i guess|i think|probably|please|ok|okay|so|then|just|like|yes|yeah|sure|that|is|be|should|would|could|we|i|i'?d|i'?ll)\b/g;

// True when the reply is only a length of time, with nothing else in it.
export function isOnlyDuration(text: string): boolean {
  const found = durationIn(text);
  if (!found) return false;
  const rest = text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(found.phrase, ' ')
    .replace(DURATION_FILLER, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return rest === '';
}

const isoOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

// The date a length of time ends on, counted from `start`: "two months" from Nov 2 is Jan 2. A month that has no such day
// ends on its last day (Jan 31 plus one month is Feb 28 or 29).
export function durationEnd(start: string, d: Duration): string {
  if (d.unit === 'day') return addDays(start, d.amount);
  if (d.unit === 'week') return addDays(start, d.amount * 7);
  const months = d.unit === 'year' ? d.amount * 12 : d.amount;
  const [y, m, day] = [Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1, Number(start.slice(8, 10))];
  const lastDay = new Date(Date.UTC(y, m + months + 1, 0)).getUTCDate();
  return isoOf(Date.UTC(y, m + months, Math.min(day, lastDay)));
}

// A length of time as whole weeks, the nearest whole number and at least one: "two months" from Nov 2 (61 days) is 9 weeks.
export function durationWeeks(start: string, d: Duration): number {
  if (d.unit === 'week') return d.amount;
  const days = Math.round((Date.parse(`${durationEnd(start, d)}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
  return Math.max(1, Math.round(days / 7));
}

// The last day of a first stretch of `weeks` whole weeks that starts on `start`.
export const stretchLastDay = (start: string, weeks: number): string => addDays(start, weeks * 7 - 1);
