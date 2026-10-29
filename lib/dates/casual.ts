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

// A date written anywhere in a text, rewritten the one casual way (MOM-111 finding 7, round 2 finding 3): "today" and
// "tomorrow" on their own, and the weekday with the date for any other day ("Monday, Nov 2"). Used on every word a setup card
// shows, Claude's and code's. It reads a date written for a machine ("2026-10-29"), spelled in full ("October 29, 2026") or
// short ("Oct 29", "Thursday, Oct 29"), with any "today, " or "tomorrow, " in front of it, so "Start today, Thursday, Oct 29?"
// shows as "Start today?". The text a turn keeps still has the date written out: the check that the person accepted a
// suggested date reads it there (lib/setup/validate.ts). Month and weekday names are matched with their capital letter, so
// "may" the word is never read as a month. A date with no year is read as the one nearest the person's today.
const MONTH_ALT = [...MONTHS_LONG, ...MONTHS_SHORT, 'Sept'].join('|');
const WEEKDAY_ALT = [...WEEKDAYS_LONG, ...WEEKDAYS_SHORT].join('|');
// One pass over every form, so a date already rewritten is never read a second time.
const WRITTEN_DATE = new RegExp(
  `(\\b[Oo]n )?(?:\\b([Tt]oday|[Tt]omorrow),? )?(?:\\b(?:${WEEKDAY_ALT}),? )?(?:\\b(\\d{4})-(\\d{2})-(\\d{2})\\b|\\b(${MONTH_ALT})\\.? (\\d{1,2})(?:st|nd|rd|th)?\\b(?:,? (\\d{4})\\b)?)`,
  'g',
);

const monthIndex = (name: string): number => {
  const n = name === 'Sept' ? 'Sep' : name;
  const long = MONTHS_LONG.indexOf(n as (typeof MONTHS_LONG)[number]);
  return long >= 0 ? long : MONTHS_SHORT.indexOf(n as (typeof MONTHS_SHORT)[number]);
};

// The year that puts a month and day nearest `today`.
function nearestYear(month: number, day: number, today: string | null): number | null {
  const now = today ? parts(today) : null;
  if (!now) return null;
  let best: { year: number; gap: number } | null = null;
  for (const year of [now.y - 1, now.y, now.y + 1]) {
    const ms = Date.UTC(year, month - 1, day);
    const gap = Math.abs(ms - now.ms);
    if (best === null || gap < best.gap) best = { year, gap };
  }
  return best?.year ?? null;
}

export function casualText(text: string, today: string | null): string {
  return text.replace(
    WRITTEN_DATE,
    (whole, on: string | undefined, rel: string | undefined, y: string, m: string, d: string, month: string, day: string, year: string, offset: number) => {
      let candidate: string;
      if (y) candidate = `${y}-${m}-${d}`;
      else {
        const mi = monthIndex(month) + 1;
        const yy = year ? Number(year) : nearestYear(mi, Number(day), today);
        if (yy === null) return whole;
        candidate = `${yy}-${String(mi).padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      if (!parts(candidate)) return whole;
      const words = casualDate(candidate, today);
      const relative = words === 'today' || words === 'tomorrow' || words === 'yesterday';
      // "on today" does not read; "on Monday, Nov 2" does.
      const lead = on && !relative ? on : '';
      // "Today" starting a line or an option keeps its capital.
      const capital = relative && (rel?.[0] === 'T' || on?.[0] === 'O' || offset === 0);
      // A "today, " in front of a date that is not the person's today was wrong; the date is what counts, so it shows alone.
      const firstWord = capital || (!relative && offset === 0);
      const shown = firstWord ? words.charAt(0).toUpperCase() + words.slice(1) : words;
      return `${lead}${shown}`;
    },
  );
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
