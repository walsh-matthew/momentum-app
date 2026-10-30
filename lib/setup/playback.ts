// Playback is written by code from the validated draft, never by Claude (docs/DOMAIN_MODEL.md §2.3, hard rule 7): what the
// person approves is exactly what gets saved. Each approved part (chunk) gets a few plain lines, in the second person and
// in everyday words: the person's own words are restated ("because you want to stay healthy for your family"), never pasted
// back, and anything that cannot be restated is shown as said, in quotes (lib/setup/restate.ts, MOM-111). The final
// confirmation is a few lines for the whole. Only fields that are set appear; nothing is filled in. Pure.

import { casualDate } from '@/lib/dates/casual';
import { EARLY_DAY_END_LIMIT } from '@/lib/engine/constants';
import { INTEGRATION_CATALOG } from '@/lib/integrations/catalog';
import type { GoalDraft, SetupChunk, SetupDraft, SetupModel, TargetDraft, Transcript } from '@/types/setup';
import { asSaid, itemOf, listOf, restate, titleOf, trimmed } from './restate';
import { minutesOfClock, timePhrasesIn } from './text';

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const weekdayName = (n: number): string => WEEKDAY_NAMES[n - 1] ?? String(n);

// The clock times the playback shows, by the path they are saved under.
export type ClockPath = 'person.dayEnd' | 'person.planning.time';

export interface PlaybackOptions {
  // The person's locale (their browser's, sent with each turn), so a time reads the way they write times. Without a usable
  // one, a time is shown as the person gave it.
  locale?: string | null;
  // The person's own words for the time saved at this path ("9 at night"), when they said one (spokenTimes below).
  spokenTime?: (path: ClockPath) => string | null;
  // The person's today (YYYY-MM-DD), so a date reads "Thursday, Nov 5" with the year only when it is not this year
  // (lib/dates/casual.ts, MOM-111 finding 7). Without it the year is always shown.
  today?: string | null;
}

// A date in the playback, the one way the app writes dates (MOM-111 round 2, finding 3): "today" or "tomorrow" on their own,
// otherwise "Thursday, Nov 5", spelled, so it is never read in the wrong order.
const dateWords = (iso: string, options: PlaybackOptions): string => casualDate(iso, options.today ?? null);
// "on Thursday, Nov 5", or "today" alone ("comes back on today" does not read).
const onDate = (iso: string, options: PlaybackOptions): string => {
  const words = dateWords(iso, options);
  return /^(today|tomorrow|yesterday)$/.test(words) ? words : `on ${words}`;
};

// "21:00" in the person's locale ("9:00 PM" in en-US, "21:00" in de-DE). Null when there is no locale, or it is not one.
function localClock(hhmm: string, locale: string | null | undefined): string | null {
  if (!locale) return null;
  try {
    const minutes = minutesOfClock(hhmm);
    // Some ICU versions put a narrow no-break space before "PM"; a plain space reads the same and matches everywhere.
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
      .format(Date.UTC(2000, 0, 1, Math.floor(minutes / 60), minutes % 60))
      .replace(/[  ]/g, ' ');
  } catch {
    return null;
  }
}

function clock(hhmm: string, path: ClockPath, options: PlaybackOptions): string {
  return localClock(hhmm, options.locale) ?? options.spokenTime?.(path) ?? hhmm;
}

// Where the person gave each clock time, in their own words: the message their `said` entry points at, and the words in it
// that name the saved time. A time they accepted from a suggestion, or that cannot be found, has none.
export function spokenTimes(draft: SetupDraft, transcript: Transcript): (path: ClockPath) => string | null {
  const values: Record<ClockPath, string | null> = { 'person.dayEnd': draft.model.person.dayEnd, 'person.planning.time': draft.model.person.planning.time };
  return (path) => {
    const value = values[path];
    const entry = draft.said.filter((s) => s.path === path && s.how === 'said').sort((a, b) => b.turn - a.turn)[0];
    const message = entry ? transcript[entry.turn] : undefined;
    if (!value || message?.role !== 'person') return null;
    return timePhrasesIn(message.text).find((p) => p.minutes === minutesOfClock(value))?.said ?? null;
  };
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

// When a target is counted. 'rate' follows an amount ("2 a week"); 'each' stands alone ("counted each week").
function describePeriod(t: TargetDraft, options: PlaybackOptions, style: 'rate' | 'each'): string {
  const week = style === 'rate' ? 'a week' : 'each week';
  switch (t.period.kind) {
    case 'weekly':
      return week;
    case 'day_slots':
      return `${week} on ${listOf(t.period.weekdays.map(weekdayName))}`;
    case 'deadline':
      return `by ${dateWords(t.period.dueDate, options)}`;
  }
}

// An amount of what the target counts: "2", "5000 pounds", "90 minutes", "3 items".
function amount(t: TargetDraft, n: number): string {
  switch (t.measure) {
    case 'count':
      return String(n);
    case 'quantity':
      return `${n} ${t.unit ? itemOf(t.unit) : ''}`.trim();
    case 'time':
      return plural(n, 'minute', 'minutes');
    case 'checklist':
      return plural(n, 'item', 'items');
  }
}

// A target's numbers in plain words, the same in the playback and the final recap (MOM-111 round 3, finding 5, owner decision
// D3): "at least 2 a week, aiming for 3". Null when it has no number (an outcome is often only counted).
function targetNumbers(t: TargetDraft, options: PlaybackOptions): string | null {
  if (t.floor !== null) {
    return `at least ${amount(t, t.floor)} ${describePeriod(t, options, 'rate')}${t.aspiration !== null ? `, aiming for ${amount(t, t.aspiration)}` : ''}`;
  }
  if (t.measure === 'checklist') return `a checklist to work through ${describePeriod(t, options, 'each')}`;
  if (t.aspiration !== null) return `aiming for ${amount(t, t.aspiration)} ${describePeriod(t, options, 'rate')}`;
  return null;
}

function describeTarget(t: TargetDraft, options: PlaybackOptions): string {
  let line = `${titleOf(t.title)}: ${targetNumbers(t, options) ?? `counted ${describePeriod(t, options, 'each')}`}.`;
  if (t.role === 'outcome') line += " It isn't fully in your hands, so it's shown to you, never judged.";
  if (t.qualifyingThreshold !== null) line += ` Only entries of ${amount(t, t.qualifyingThreshold)} or more count.`;
  return line;
}

function describeShape(g: GoalDraft, options: PlaybackOptions): string {
  const title = titleOf(g.title);
  const start = g.startDate ? `, starting ${dateWords(g.startDate, options)}` : '';
  switch (g.shape) {
    case 'ongoing':
      return `${title} keeps going${start}${g.blockWeeks !== null ? `, with a first stretch of ${plural(g.blockWeeks, 'week', 'weeks')}` : ''}.`;
    case 'finite':
      return `${title} runs until ${g.endDate ? dateWords(g.endDate, options) : 'a date not set yet'}${start}.`;
    case 'project':
      return g.endDate ? `${title} has a deadline of ${dateWords(g.endDate, options)}${start}.` : `${title} runs until it's done${start}.`;
    case null:
      return `${title}: how long it runs isn't set yet${start}.`;
  }
}

// When a goal set aside comes back. A condition in the person's words reads after "It comes back" when it starts like one
// ("in the spring", "when my knee heals"); otherwise it is shown as said.
const RETURN_START = /^(in|when|after|once|on|at|by|next|before|if|until|around|this|after)\b/i;
function describeReturn(g: GoalDraft, options: PlaybackOptions): string {
  if (!g.returnWhen) return 'When it comes back is not set yet.';
  switch (g.returnWhen.kind) {
    case 'date':
      return `It comes back ${onDate(g.returnWhen.date, options)}.`;
    case 'condition': {
      const note = trimmed(g.returnWhen.note);
      const restated = RETURN_START.test(note) ? restate(note, 'item') : null;
      return restated ? `It comes back ${restated}.` : `It comes back, in your words: ${asSaid(g.returnWhen.note)}`;
    }
    case 'on_request':
      return 'It comes back when you ask.';
  }
}

function describeGoal(g: GoalDraft): string {
  const title = titleOf(g.title);
  if (!g.why) return `Goal: ${title}.`;
  const why = restate(g.why, 'clause');
  return why ? `Goal: ${title}, because ${why}.` : `Goal: ${title}. Why, in your words: ${asSaid(g.why)}`;
}

const PROVIDER_NAMES = new Map(INTEGRATION_CATALOG.map((e) => [e.provider as string, e.name]));
const SOURCE_WORDS = (t: TargetDraft): string =>
  t.sources.length === 0
    ? "where you track it isn't set yet"
    : listOf(t.sources.map((s) => (s.kind === 'manual' ? 'you log it yourself' : `read from ${PROVIDER_NAMES.get(s.provider) ?? s.provider}`)));

const TONE_LINES = { gentle: 'Momentum talks to you gently.', middle: 'Momentum talks to you plainly, neither soft nor blunt.', direct: 'Momentum talks to you directly.' } as const;
const REMINDER_LINES = { off: 'No reminders.', tied_to_plan: 'Reminders only on the days you plan to do something.' } as const;
const CHECK_IN_LINES = {
  never: "Momentum doesn't ask how it went for the things you log yourself.",
  end_of_day: 'At the end of your day, Momentum asks how it went for the things you log yourself.',
  end_of_week: 'At the end of your week, Momentum asks how it went for the things you log yourself.',
} as const;
const CELEBRATION_LINES = { low_key: 'Wins get a low-key celebration.', medium: 'Wins get a medium-sized celebration.', big: 'Wins get a big celebration.' } as const;
const BALANCE_LINES = {
  weekly_planning: 'When one goal is taking time from the rest, Momentum mentions it when you plan your week.',
  near_deadlines: 'When one goal is taking time from the rest, Momentum mentions it only near a deadline.',
  leave_to_me: 'Momentum leaves the balance between your goals to you.',
} as const;
const REVIEW_DEPTH_LINES = {
  recap_only: 'Your weekly look-back: a short recap only.',
  recap_offer: 'Your weekly look-back: a short recap, with an offer to go deeper.',
  full: 'Your weekly look-back: a recap and a few questions on what worked.',
} as const;
const REVIEW_PLANNING_LINES = {
  one_sitting: 'You look back on your week and plan the next one in one sitting.',
  separate: 'You look back on your week and plan the next one separately.',
} as const;

export function renderPlayback(model: SetupModel, chunk: SetupChunk, options: PlaybackOptions = {}): string[] {
  const lines: string[] = [];
  const active = model.goals.filter((x) => x.state === 'active');
  switch (chunk) {
    case 'goals':
      for (const g of model.goals) {
        lines.push(g.state === 'active' ? describeGoal(g) : `Set aside for now: ${titleOf(g.title)}. ${describeReturn(g, options)}`);
      }
      break;
    case 'targets':
      if (model.person.priorities.length > 0) {
        lines.push(
          `Besides your goals, what matters to you: ${listOf(model.person.priorities.map(itemOf))}. I'll keep these in mind so the plan doesn't crowd them out.`,
        );
      }
      for (const g of active) {
        lines.push(describeShape(g, options));
        for (const t of g.targets) lines.push(`  ${describeTarget(t, options)}`);
      }
      break;
    case 'planning': {
      const p = model.person;
      if (p.timeZone) lines.push(`You're in the ${p.timeZone} time zone.`);
      if (p.dayEnd) {
        const at = clock(p.dayEnd, 'person.dayEnd', options);
        const m = minutesOfClock(p.dayEnd);
        lines.push(
          m > 0 && m < EARLY_DAY_END_LIMIT
            ? `Your day ends at ${at}, so anything you log before then counts toward the day before.`
            : `Your day ends at ${at}, the time you check in; your day still runs from midnight to midnight.`,
        );
      }
      if (p.weekStart !== null) lines.push(`Your week starts on ${weekdayName(p.weekStart)}.`);
      if (p.dayTypes.length > 0) {
        const kinds = p.dayTypes.map((d) => `${itemOf(d.name)}${d.capacityAmount !== null ? ` (${d.capacityAmount} ${d.capacityUnit ?? ''})`.replace(' )', ')') : ''}`);
        lines.push(`Your kinds of days: ${listOf(kinds)}.`);
      }
      if (p.planning.weekday !== null || p.planning.time !== null) {
        const on = p.planning.weekday !== null ? ` on ${weekdayName(p.planning.weekday)}` : '';
        const at = p.planning.time ? ` at ${clock(p.planning.time, 'person.planning.time', options)}` : '';
        lines.push(`You'll plan your week${on}${at}.`);
      }
      for (const g of active) {
        for (const i of g.items) {
          const title = titleOf(i.title);
          if (i.kind === 'deadline_task') {
            const move = i.dateCanMove === null ? '' : i.dateCanMove ? ' The date can move.' : " The date can't move.";
            lines.push(i.dueDate ? `Due by ${dateWords(i.dueDate, options)}: ${title}.${move}` : `${title}: its date isn't set yet.`);
          } else {
            lines.push(`${i.kind === 'habit' ? 'Habit' : 'A step along the way'}: ${title}.`);
          }
        }
        for (const t of g.targets) lines.push(`${titleOf(t.title)}: ${SOURCE_WORDS(t)}.`);
      }
      break;
    }
    case 'talk': {
      const s = model.settings;
      if (s.tone) lines.push(TONE_LINES[s.tone]);
      if (s.reminders) lines.push(REMINDER_LINES[s.reminders]);
      if (s.checkIns) lines.push(CHECK_IN_LINES[s.checkIns]);
      if (s.celebrations) lines.push(CELEBRATION_LINES[s.celebrations]);
      if (s.balanceMentions) lines.push(BALANCE_LINES[s.balanceMentions]);
      if (s.reviewDepth) lines.push(REVIEW_DEPTH_LINES[s.reviewDepth]);
      if (s.reviewPlanning) lines.push(REVIEW_PLANNING_LINES[s.reviewPlanning]);
      if (s.quietTimes !== null) {
        lines.push(s.quietTimes.length === 0 ? 'No quiet times.' : `Quiet times, when Momentum stays silent: ${listOf(s.quietTimes.map(itemOf))}.`);
      }
      break;
    }
  }
  return lines.length > 0 ? lines : ['Nothing in this part yet.'];
}

export const FINAL_MAX_LINES = 6;

// What is counted, after "You'll count": "workouts", not "Workouts". A first word in capitals or with a capital inside it
// ("PT", "iPad"), or an app's name ("Hevy"), keeps its capitals.
const countedWords = (title: string): string => {
  const words = itemOf(title);
  const first = words.match(/^[A-Za-z]+/)?.[0] ?? '';
  const name = [...PROVIDER_NAMES.values()].some((n) => n.split(' ')[0] === first);
  return first.length > 1 && /^[A-Z][a-z]+$/.test(first) && !name ? words.charAt(0).toLowerCase() + words.slice(1) : words;
};

// The last confirmation (MOM-111 round 3, finding 5): what is counted and its numbers, in whole sentences ("You'll count
// workouts: at least 2 a week, aiming for 3."), one line for each thing counted, never a fragment such as a goal's title
// alone. With more than one goal, each line names its goal. Never more than FINAL_MAX_LINES.
export function renderFinal(model: SetupModel, options: PlaybackOptions = {}): string[] {
  const active = model.goals.filter((g) => g.state === 'active');
  const several = active.length > 1;
  const counted: { line: string; things: number }[] = active.flatMap((g) => {
    const lead = several ? `For ${titleOf(g.title)}, you'll count` : "You'll count";
    if (g.targets.length === 0) return [{ line: several ? `For ${titleOf(g.title)}, nothing is counted yet.` : 'Nothing is counted yet.', things: 0 }];
    return g.targets.map((t) => {
      const numbers = targetNumbers(t, options);
      const what = countedWords(t.title);
      return { line: numbers ? `${lead} ${what}: ${numbers}.` : `${lead} ${what} ${describePeriod(t, options, 'each')}.`, things: 1 };
    });
  });
  const parked = model.goals.length - active.length;
  // Room left after the parked line and the settings line; one line goes to "And N more" when they do not all fit.
  const room = FINAL_MAX_LINES - 1 - (parked > 0 ? 1 : 0);
  const shown = counted.length > room ? counted.slice(0, room - 1) : counted;
  const lines = shown.map((c) => c.line);
  const hidden = counted.slice(shown.length).reduce((n, c) => n + c.things, 0);
  if (counted.length > shown.length) lines.push(hidden > 0 ? `And ${plural(hidden, 'more thing', 'more things')} you'll count.` : 'And more goals with nothing counted yet.');
  if (parked > 0) lines.push(`${plural(parked, 'goal', 'goals')} set aside for now, with a way back.`);
  lines.push('Everything can be changed on your settings page.');
  return lines.slice(0, FINAL_MAX_LINES);
}
