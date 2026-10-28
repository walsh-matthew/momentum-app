// The words home writes around the engine's facts (MOM-112). Templates in code, never a model: every number comes from
// the view the engine produced, and Claude adds nothing (docs/DOMAIN_MODEL.md §4.2 principles 5 and 9).
//
// The person's titles are kept exactly as they wrote them. A title is never singularised, shortened or reworded, because
// that would be a guess; the template is shaped around the title instead ("Applications sent: 1 more to reach your
// aspiration"). A level is always said in words, and a target that is not graded never gets a level word.

import type { CelebrationLevel, Tone } from '@/types/database.types';
import type { HeroHeadline, MilestoneView, PatternView, TargetCardView, TrendView } from '@/types/home';
import type { LocalDate } from '@/types/scoreboard';

// 1 decimal at most, no trailing zero: 8.5, 15.
export const formatNumber = (n: number): string => String(Math.round(n * 10) / 10);

// "A", "A and B", "A, B and C": every title named, in the order given.
export function joinTitles(titles: string[]): string {
  if (titles.length <= 1) return titles[0] ?? '';
  return `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`;
}

// A day as the person's calendar shows it ("Fri, Nov 20"). Fixed to UTC on a date with no time, so the server and the
// browser always agree and no time zone shifts it.
export function formatDay(day: LocalDate): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
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
export function levelChip(card: TargetCardView): Chip {
  switch (card.status) {
    case 'needs_week_start':
      return { label: 'Needs your week start', tone: 'warn' };
    case 'not_counted':
      return { label: 'Tracked, not counted yet', tone: 'plain' };
    case 'not_started':
      return { label: `Starts ${formatDay(card.startsOn)}`, tone: 'plain' };
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
export function levelsText(card: TargetCardView): string | null {
  if (card.floor === null) return null;
  const unit = card.unit ? ` ${card.unit}` : '';
  const per = card.period === 'weekly' ? ' a week' : card.period === 'deadline' && card.dueOn ? ` by ${formatDay(card.dueOn)}` : '';
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

export interface PatternLine {
  text: string;
  // Holding is good news, slipping is a nudge; the words carry the meaning and the colour only reinforces it.
  tone: 'good' | 'nudge';
}

// A run of closed weeks, in the person's tone. Only a graded target has a pattern (the view never gives one otherwise).
export function patternLine(pattern: PatternView, tone: Tone): PatternLine {
  const run = weeks(pattern.periods);
  switch (pattern.kind) {
    case 'holding':
      return { tone: 'good', text: tone === 'gentle' ? `Holding steady: floor met ${run} running.` : tone === 'direct' ? `Floor met ${run} running.` : `Holding: floor met ${run} running.` };
    case 'aspiration_repeated':
      return { tone: 'good', text: tone === 'gentle' ? `A good run: aspiration met ${run} running.` : `Aspiration met ${run} running.` };
    case 'slipping':
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
