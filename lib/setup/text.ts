// Reading numbers, dates, times, weekdays and day or time words out of what someone typed. Setup's checks use these to
// decide whether a value in the draft, or a word in Claude's turn, came from the person (DOMAIN_MODEL §2.1 rules 2 and 8).
// Heuristics, not language understanding: they err towards "not said", so a value they cannot find is asked about
// again instead of trusted. Pure.

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
  twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90, half: 0.5,
};

// Numbers in a text: digits ("3", "2.5", "1,200"), and number words ("three"). `words: false` reads digits only.
// `skipOne` leaves out the word "one", which is also a pronoun ("one first").
export function numbersIn(text: string, options: { words?: boolean; skipOne?: boolean } = {}): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const n = Number(m[0].replaceAll(',', ''));
    if (Number.isFinite(n)) out.push(n);
  }
  if (options.words !== false) {
    for (const w of text.toLowerCase().match(/[a-z]+/g) ?? []) {
      if (w in NUMBER_WORDS && !(options.skipOne && w === 'one')) out.push(NUMBER_WORDS[w]);
    }
    // "an hour" and "half an hour" carry a number the person did say.
    if (/\ban hour\b/i.test(text)) out.push(1);
  }
  return out;
}

const MONTHS = [
  ['january', 'jan'], ['february', 'feb'], ['march', 'mar'], ['april', 'apr'], ['may'], ['june', 'jun'],
  ['july', 'jul'], ['august', 'aug'], ['september', 'sept', 'sep'], ['october', 'oct'], ['november', 'nov'],
  ['december', 'dec'],
] as const;
const MONTH_ALT = MONTHS.flat().join('|');
const monthNumber = (name: string): number => MONTHS.findIndex((names) => (names as readonly string[]).includes(name.toLowerCase())) + 1;

export interface MentionedDate {
  month: number;
  day: number;
  // Null when the person gave no year.
  year: number | null;
}

// Dates a person gave: 2027-06-05, June 5, 5th of June 2027, 6/5. Month alone ("in June") is not a date.
export function datesIn(text: string): MentionedDate[] {
  const out: MentionedDate[] = [];
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    out.push({ year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) });
  }
  const monthFirst = new RegExp(`\\b(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, 'gi');
  for (const m of text.matchAll(monthFirst)) {
    out.push({ month: monthNumber(m[1]), day: Number(m[2]), year: m[3] ? Number(m[3]) : null });
  }
  const dayFirst = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_ALT})\\b\\.?(?:,?\\s+(\\d{4}))?`, 'gi');
  for (const m of text.matchAll(dayFirst)) {
    out.push({ month: monthNumber(m[2]), day: Number(m[1]), year: m[3] ? Number(m[3]) : null });
  }
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g)) {
    const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null;
    out.push({ month: Number(m[1]), day: Number(m[2]), year });
  }
  return out.filter((d) => d.month >= 1 && d.month <= 12 && d.day >= 1 && d.day <= 31);
}

// Does one of the mentioned dates say this ISO date? A year the person did not give matches any year.
export function dateIsIn(iso: string, mentioned: MentionedDate[]): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mentioned.some((d) => d.month === month && d.day === day && (d.year === null || d.year === year));
}

const h12 = (h: number, pm: boolean): number => (pm ? (h === 12 ? 12 : h + 12) : h === 12 ? 0 : h);

// Clock times in a text as minutes after midnight: 9pm, 2:30 am, 9 in the evening, 11 at night, 21:00, midnight, noon.
export function timesIn(text: string): number[] {
  const t = text.toLowerCase();
  const out: number[] = [];
  const minutes = (h: number, mm: string | undefined) => h * 60 + (mm ? Number(mm) : 0);
  for (const m of t.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?![a-z])/g)) {
    const h = Number(m[1]);
    if (h >= 1 && h <= 12) out.push(minutes(h12(h, m[3].startsWith('p')), m[2]));
  }
  for (const m of t.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s+in the (morning|afternoon|evening)\b/g)) {
    const h = Number(m[1]);
    if (h >= 1 && h <= 12) out.push(minutes(h12(h, m[3] !== 'morning'), m[2]));
  }
  for (const m of t.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s+at night\b/g)) {
    const h = Number(m[1]);
    if (h >= 1 && h <= 12) out.push(minutes(h >= 6 ? h12(h, true) : h12(h, false), m[2]));
  }
  for (const m of t.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g)) out.push(Number(m[1]) * 60 + Number(m[2]));
  if (/\bmidnight\b/.test(t)) out.push(0);
  if (/\bnoon\b/.test(t)) out.push(720);
  return out;
}

export const minutesOfClock = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

const WEEKDAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

// Weekdays a person named, 1 to 7, Monday is 1.
export function weekdaysIn(text: string): number[] {
  const out: number[] = [];
  const t = text.toLowerCase();
  WEEKDAY_NAMES.forEach((name, i) => {
    if (new RegExp(`\\b${name}s?\\b`).test(t)) out.push(i + 1);
  });
  return out;
}

// Words that name a day, a part of a day or a clock time, normalised, for rule 2 ("no day or time words the person did
// not say"). Clock times become `time:<minutes>` so "9pm" and "21:00" are the same word.
const DAY_TIME_WORDS =
  /\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|weekdays?|weekends?|mornings?|afternoons?|evenings?|nights?|nightly|noon|midnight|daily|tomorrow|tonight|lunchtimes?|bedtimes?|everyday|every day|each day|o'clock)\b/gi;

export function dayTimeWords(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(DAY_TIME_WORDS)) {
    const w = m[1].toLowerCase();
    out.push(w === 'everyday' || w === 'each day' ? 'every day' : w.replace(/s$/, ''));
  }
  // "midnight" and "noon" are already words above; reading them as clock times too would report each one twice.
  for (const minute of timesIn(text.replace(/\b(midnight|noon)\b/gi, ' '))) out.push(`time:${minute}`);
  return out;
}

// Sentences, split after . ! or ?
export const sentencesOf = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

// The person said yes to what was just shown, or picked one of its options.
export function acceptsText(text: string): boolean {
  const t = text.toLowerCase();
  if (/\b(no|nope|not|don't|dont|wrong|instead|change)\b/.test(t)) return false;
  return /\b(yes|yeah|yep|yup|sure|ok|okay|correct|right|exactly|good|great|fine|perfect|works|agreed|please|go ahead|sounds|option \d|number \d|first|second|third|fourth|that one)\b/.test(t);
}

// At a playback, the person says nothing needs to change. The whole message has to say it ("don't change the goals, but add
// one" is a change), so a message with more in it than these phrases does not count.
const NO_CHANGE = [
  /^(nothing|none|nope,? nothing)$/,
  /^(no|not any) (more )?changes?( needed| to make)?$/,
  /^(there is |there's )?nothing (needs? )?to (change|fix|add)$/,
  /^nothing (needs|needed) (to be )?(change[sd]?|fixed)$/,
  /^i (do not|don't|dont) (want|need) to (change|fix) (anything|a thing)$/,
  /^i (do not|don't|dont) want (any )?changes?$/,
  /^(leave|keep) (it|them|this|that) (as is|as it is|alone|the same)$/,
  /^(it|that|this) (is|looks|'s) (fine|good|right) as (is|it is)$/,
];

export function declinesChange(text: string): boolean {
  const t = text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.!,\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return NO_CHANGE.some((re) => re.test(t));
}

// The person asked for starting ideas.
export function wantsIdeas(text: string): boolean {
  const t = text.toLowerCase();
  if (/\b(in mind|my own|own answer|no thanks|nope|i know)\b/.test(t)) return false;
  return /\b(ideas?|examples?|suggest\w*|help|yes|yeah|sure|please)\b/.test(t);
}
