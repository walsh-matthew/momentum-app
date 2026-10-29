// The one way the app writes a date for a person to read (MOM-111 finding 7): "today", "tomorrow", "Thursday, Nov 5", with
// the year only when it is not this year. Every screen that shows a calendar date uses it, and setup runs Claude's own words
// through casualText() so a date like 2026-10-29 never reaches the screen. A date here is a calendar date (YYYY-MM-DD), read
// as such, so no time zone moves it; "today" is the person's own today, given by the caller. Pure.

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export interface CasualDateOptions {
  // 'long' (the default): "Thursday, Nov 5". 'short': "Thu, Nov 5", for a tight space. 'none': "Nov 5".
  weekday?: 'long' | 'short' | 'none';
  // Say "today", "tomorrow" or "yesterday" for those dates (the default). Off where the date sits inside a sentence that
  // would not read with one ("Week of today").
  relative?: boolean;
}

function parts(iso: string): { y: number; m: number; d: number; ms: number } | null {
  const match = ISO.exec(iso);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const ms = Date.UTC(y, m - 1, d);
  if (new Date(ms).toISOString().slice(0, 10) !== iso) return null;
  return { y, m, d, ms };
}

// `today` is the person's own date, YYYY-MM-DD. Without one the year is always shown, since "this year" is not known.
export function casualDate(iso: string, today: string | null, options: CasualDateOptions = {}): string {
  const date = parts(iso);
  if (!date) return iso;
  const now = today ? parts(today) : null;
  if (now && options.relative !== false) {
    const days = Math.round((date.ms - now.ms) / MS_PER_DAY);
    if (days === 0) return 'today';
    if (days === 1) return 'tomorrow';
    if (days === -1) return 'yesterday';
  }
  const weekdayIndex = new Date(date.ms).getUTCDay();
  const style = options.weekday ?? 'long';
  const weekday = style === 'long' ? `${WEEKDAYS_LONG[weekdayIndex]}, ` : style === 'short' ? `${WEEKDAYS_SHORT[weekdayIndex]}, ` : '';
  const year = now && now.y === date.y ? '' : `, ${date.y}`;
  return `${weekday}${MONTHS_SHORT[date.m - 1]} ${date.d}${year}`;
}

// The same, with a capital first letter, for the start of a line or a label ("Today", "Tomorrow").
export function casualDateLabel(iso: string, today: string | null, options: CasualDateOptions = {}): string {
  const text = casualDate(iso, today, options);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// A date written for a machine or spelled in full ("2026-10-29", "October 29, 2026") anywhere in a text, rewritten the casual
// way. Used on Claude's words in setup, which may echo a date as it was given. Relative words are left out, because the date
// sits inside Claude's own sentence ("Start on today?" would not read).
const MONTH_ALT = MONTHS_LONG.join('|');
// One pass over both forms, so a date already rewritten is never read a second time.
const WRITTEN_DATE = new RegExp(`\\b(\\d{4})-(\\d{2})-(\\d{2})\\b|\\b(${MONTH_ALT}) (\\d{1,2}), (\\d{4})\\b`, 'g');
export function casualText(text: string, today: string | null): string {
  return text.replace(WRITTEN_DATE, (whole, y: string, m: string, d: string, month: string, day: string, year: string) => {
    const candidate = y
      ? `${y}-${m}-${d}`
      : `${year}-${String(MONTHS_LONG.indexOf(month as (typeof MONTHS_LONG)[number]) + 1).padStart(2, '0')}-${day.padStart(2, '0')}`;
    return parts(candidate) ? casualDate(candidate, today, { relative: false }) : whole;
  });
}

// The calendar date an instant falls on in a time zone, YYYY-MM-DD, or null when the zone is not one.
export function dateInZone(timeZone: string, at: Date = new Date()): string | null {
  try {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
    const get = (type: string) => p.find((x) => x.type === type)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return null;
  }
}

// A machine-written date anywhere in a text, for the tests that check none reaches a screen.
export const MACHINE_DATE = /\b\d{4}-\d{2}-\d{2}\b/;
