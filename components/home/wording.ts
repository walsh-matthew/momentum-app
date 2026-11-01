// The words home writes around the engine's facts (MOM-112). Templates in code, never a model: every number comes from
// the view the engine produced, and Claude adds nothing (docs/DOMAIN_MODEL.md §4.2 principles 5 and 9).
//
// The person's titles are kept exactly as they wrote them. A title is never singularised, shortened or reworded, because
// that would be a guess; the template is shaped around the title instead ("Applications sent: 1 more to reach your
// aspiration"). A level is always said in words, and a target that is not graded never gets a level word.

import type { CelebrationLevel, Tone } from '@/types/database.types';
import type { ForecastView, HeroHeadline, MilestoneView, PatternView, TargetCardView, TrendView } from '@/types/home';
import type { ForecastOption, LocalDate } from '@/types/scoreboard';
import { casualDate, type CasualDateOptions } from '@/lib/dates/casual';

// 1 decimal at most, no trailing zero: 8.5, 15.
export const formatNumber = (n: number): string => String(Math.round(n * 10) / 10);

// "A", "A and B", "A, B and C": every title named, in the order given.
export function joinTitles(titles: string[]): string {
  if (titles.length <= 1) return titles[0] ?? '';
  return `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`;
}

// A day as the person reads it, through the app's one date formatter (lib/dates/casual.ts, MOM-111 finding 7): "today",
// "tomorrow", "Fri, Nov 20", with the year only when it is not this year. Short weekdays, for chips and tight rows; pass
// `relative: false` where the date sits inside a sentence that would not read with "today". `today` is the person's own
// date; without it the year is always shown.
export function formatDay(day: LocalDate, today: LocalDate | null, options: CasualDateOptions = {}): string {
  return casualDate(day, today, { weekday: 'short', ...options });
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const weekdayName = (weekday: number): string => WEEKDAY_SHORT[weekday] ?? '';
const WEEKDAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
export const weekdayLetter = (day: LocalDate): string => WEEKDAY_LETTER[new Date(`${day}T00:00:00Z`).getUTCDay()];
export const dayName = (day: LocalDate): string => WEEKDAY_SHORT[new Date(`${day}T00:00:00Z`).getUTCDay()];

const weeks = (n: number) => `${n} ${n === 1 ? 'week' : 'weeks'}`;

// The hero's headline: the week's biggest crossing, celebrated alone. Several tied crossings are all named.
export function headlineText(h: HeroHeadline): string {
  const names = joinTitles(h.titles);
  switch (h.kind) {
    case 'step':
      return `Step done: ${names}`;
    case 'floor':
      return `${names}: floor met`;
    case 'aspiration':
      return `${names}: aspiration reached`;
    case 'block_end':
      return `${names}: block finished`;
  }
}

export type Celebration = 'quiet' | 'accent' | 'bold';

// How loudly a crossing is celebrated: the crossing's size scaled by the person's own setting (§1.7: "celebrations
// scale with the crossing and follow the person's celebration setting"). Low-key is always quiet; medium keeps the
// accent for the big crossings (an aspiration, a block end); big gives every crossing the accent and the big ones more.
export function celebrationFor(level: CelebrationLevel, kind: HeroHeadline['kind']): Celebration {
  const big = kind === 'aspiration' || kind === 'block_end';
  if (level === 'low_key') return 'quiet';
  if (level === 'medium') return big ? 'accent' : 'quiet';
  return big ? 'bold' : 'accent';
}

export type ChipTone = 'accent' | 'warn' | 'dashed' | 'plain';
export interface Chip {
  label: string;
  tone: ChipTone;
}

// The chip that says where a target stands. It keys on `graded`, never on `level` alone: a target that started
// partway through its first week has a level in the engine's result and is not graded, so it gets no level word.
export function levelChip(card: TargetCardView, today: LocalDate | null = null): Chip {
  switch (card.status) {
    case 'needs_week_start':
      return { label: 'Needs your week start', tone: 'warn' };
    case 'not_counted':
      return { label: 'Tracked, not counted yet', tone: 'plain' };
    case 'not_started':
      return { label: `Starts ${formatDay(card.startsOn, today)}`, tone: 'plain' };
    case 'counted': {
      if (card.startedPartway) return { label: 'Started midweek · not graded', tone: 'dashed' };
      if (!card.graded || card.level === null) return { label: 'Tracked, not judged', tone: 'plain' };
      const unit = card.unit ? ` ${card.unit}` : '';
      if (card.level === 'aspiration') return { label: 'Aspiration reached', tone: 'accent' };
      if (card.level === 'floor') return { label: 'Floor met', tone: 'accent' };
      if (card.level === 'partway') return { label: `Partway · ${formatNumber(card.remainingToFloor ?? 0)}${unit} to floor`, tone: 'plain' };
      return { label: 'Not started', tone: 'plain' };
    }
  }
}

// What the target asks, in the person's own levels. "Floor 5 a week", "Floor 15 km a week · aspiration 20 km".
export function levelsText(card: TargetCardView, today: LocalDate | null = null): string | null {
  if (card.floor === null) return null;
  const unit = card.unit ? ` ${card.unit}` : '';
  const per = card.period === 'weekly' ? ' a week' : card.period === 'deadline' && card.dueOn ? ` by ${formatDay(card.dueOn, today)}` : '';
  const aspiration = card.aspiration === null ? '' : ` · aspiration ${formatNumber(card.aspiration)}${unit}`;
  const floorWhat = card.period === 'day_slots' ? ' of your named days' : '';
  return `Floor ${formatNumber(card.floor)}${unit}${floorWhat}${per}${aspiration}`;
}

// The line that lives on a target's own card, never on the hero: what is left to the aspiration. Only a graded target
// at its floor, with an aspiration still to reach, has one.
export function toAspirationLine(card: TargetCardView): string | null {
  if (card.status !== 'counted' || !card.graded || card.level !== 'floor' || card.remainingToAspiration === null) return null;
  if (!(card.remainingToAspiration > 0)) return null;
  const unit = card.unit ? ` ${card.unit}` : '';
  return `${formatNumber(card.remainingToAspiration)}${unit} more to reach your aspiration`;
}

// What is left to the aspiration in a week that has closed (the weekly review's recap): said as how far short it was,
// not as something still to reach. Only a graded target at its floor, with an aspiration it did not reach, has one.
export function toSettledAspirationLine(card: TargetCardView): string | null {
  if (card.status !== 'counted' || !card.graded || card.level !== 'floor' || card.remainingToAspiration === null) return null;
  if (!(card.remainingToAspiration > 0)) return null;
  const unit = card.unit ? ` ${card.unit}` : '';
  return `${formatNumber(card.remainingToAspiration)}${unit} short of your aspiration that week`;
}

export interface PatternLine {
  text: string;
  // Holding is good news, slipping is a nudge; the words carry the meaning and the colour only reinforces it.
  tone: 'good' | 'nudge';
}

// A run of closed weeks, in the person's tone. Only a graded target has a pattern (the view never gives one otherwise).
// On the weekly review itself, and once the review of the week the run ended in is finished (`inReview`), a slipping run is not pointed at
// "your weekly review": the person is in it, or has been.
export function patternLine(pattern: PatternView, tone: Tone, inReview = false): PatternLine {
  const run = weeks(pattern.periods);
  switch (pattern.kind) {
    case 'holding':
      return { tone: 'good', text: tone === 'gentle' ? `Holding steady: floor met ${run} running.` : tone === 'direct' ? `Floor met ${run} running.` : `Holding: floor met ${run} running.` };
    case 'aspiration_repeated':
      return { tone: 'good', text: tone === 'gentle' ? `A good run: aspiration met ${run} running.` : `Aspiration met ${run} running.` };
    case 'slipping':
      if (inReview) return { tone: 'nudge', text: tone === 'gentle' ? `Under the floor ${run} running. No rush.` : `Under the floor ${run} running.` };
      return {
        tone: 'nudge',
        text:
          tone === 'gentle'
            ? `Under the floor ${run} running. No rush: it is worth a look at your weekly review.`
            : tone === 'direct'
              ? `Under the floor ${run} running.`
              : `Under the floor ${run} running. Worth a look at your weekly review.`,
      };
  }
}

export function trendText(trend: TrendView): string | null {
  if (trend.counts.length === 0) return null;
  const direction = { up: 'rising', down: 'falling', flat: 'steady', insufficient: null }[trend.direction];
  return `Last ${trend.counts.length} ${trend.counts.length === 1 ? 'week' : 'weeks'}: ${trend.counts.join(', ')}${direction ? ` (${direction})` : ''}.`;
}

// The days the person named, on their own: the engine says how many slots are filled, not which, so these are never
// shown as if they were the filled ones.
export function slotDaysText(slots: { weekdays: number[] }): string {
  return `Named days: ${slots.weekdays.map(weekdayName).join(', ')}`;
}

export function stepsText(m: Pick<MilestoneView, 'stepsDone' | 'steps'>): string {
  return `${m.stepsDone} of ${m.steps.length} ${m.steps.length === 1 ? 'step' : 'steps'} done`;
}

// ---------------------------------------------------------------------------
// A deadline task's forecast (MOM-112, slice 2)
// ---------------------------------------------------------------------------

export interface ForecastLine {
  // A short verdict beside the sentence, or null when the sentence is the whole answer.
  chip: { label: string; tone: 'accent' | 'warn' | 'plain' } | null;
  text: string;
  // What the person could do, said as words. Only a verdict that does not fit has these.
  could: string | null;
  // Where the person can act on what the line says: the week plan when the plan is the answer, and (MOM-138) the edit that sets
  // a missing fact or changes the task. Each is a way in, never a change: nothing happens until the person taps there.
  links: ForecastLink[];
}

export interface ForecastLink {
  label: string;
  href: string;
}

// The deadline task a line is about, so a line can lead to its own edit (MOM-138). Without it a line leads only to the plan.
export interface ForecastTask {
  id: string;
  // What setup recorded about the due date; "move the date" leads to an edit only when it can move.
  dateCanMove: boolean;
}

const PLAN_MORE: ForecastLink = { label: 'Plan more days', href: '/plan' };
export const taskEditHref = (taskId: string, section: 'size' | 'date' | null = null): string => `/task/${taskId}${section === 'date' ? '#date' : ''}`;
export const kindTimeHref = (kindId: string): string => `/plan/kinds#kind-${kindId}`;
const OPTION_WORDS: Record<ForecastOption, string> = {
  more_time: 'add more days',
  smaller_scope: "make what's left smaller",
  move_date: 'move the date',
  accept_risk: 'keep going as it is',
};

// "a, b or c".
const joinOr = (parts: string[]): string => (parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} or ${parts[parts.length - 1]}`);

// What home says of whether a deadline task fits the days the person set aside. A fact about those days, never a promise,
// and never a minute, a slot or a free-time figure (principle 12). Says "set aside" and "kind of day", the person's words.
export function forecastLine(forecast: ForecastView, today: LocalDate | null = null, task: ForecastTask | null = null): ForecastLine {
  const day = (d: LocalDate) => formatDay(d, today, { relative: false });
  const line = (text: string, over: Partial<ForecastLine> = {}): ForecastLine => ({ chip: null, text, could: null, links: [], ...over });
  const moveDate = (): ForecastLink[] => (task && task.dateCanMove ? [{ label: 'Move the date', href: taskEditHref(task.id, 'date') }] : []);
  switch (forecast.state) {
    case 'fits':
      return forecast.soFar
        ? line("The days you've set aside so far look like enough for what's left.", { chip: { label: 'Enough so far', tone: 'accent' } })
        : line("The days you've set aside look like enough for what's left.", { chip: { label: 'Enough time', tone: 'accent' } });
    case 'tight':
      return line("The days you've set aside are close to what's left.", { chip: { label: 'Close', tone: 'plain' }, links: [PLAN_MORE] });
    case 'does_not_fit':
      // "Keep going as it is" is words only: there is nothing to save. The others lead to where they are done.
      return line("The days you've set aside look short for what's left.", {
        chip: { label: 'Short on time', tone: 'warn' },
        could: `You could ${joinOr(forecast.options.map((o) => OPTION_WORDS[o]))}.`,
        links: [
          ...(forecast.options.includes('more_time') ? [PLAN_MORE] : []),
          ...(task && forecast.options.includes('smaller_scope') ? [{ label: "Make what's left smaller", href: taskEditHref(task.id) }] : []),
          ...(forecast.options.includes('move_date') ? moveDate() : []),
        ],
      });
    case 'planned_so_far':
      return line(`You've set aside ${forecast.days} ${forecast.days === 1 ? 'day' : 'days'} through ${day(forecast.through)}. Plan more days as you go.`, { links: [PLAN_MORE] });
    case 'past_due':
      return line('The date has passed.', { links: moveDate() });
    case 'not_enough_data':
      return line("Not enough to say yet. There's no rough size for this, and no time logged against it.", {
        links: task ? [{ label: 'Say how big this is', href: taskEditHref(task.id) }] : [],
      });
    case 'nothing_set_aside':
      return line("You haven't set aside any days for this yet.", { links: [{ label: 'Plan your week', href: '/plan' }] });
    case 'day_without_kind':
      return line(`Say what kind of day ${day(forecast.date)} is, so we can tell how much time it gives.`, { links: [{ label: 'Say what kind of day', href: '/plan' }] });
    case 'kind_without_time':
      return line(`"${forecast.kindName}" has no usual amount of time yet, so we can't say how much ${day(forecast.date)} gives.`, {
        links: [{ label: `Set the usual time for “${forecast.kindName}”`, href: kindTimeHref(forecast.kindId) }],
      });
    case 'counted_in_sessions':
      return line("You count your time in sessions, and this one is sized in time, so we can't say yet.");
  }
}
