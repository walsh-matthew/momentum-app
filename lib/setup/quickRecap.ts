// What the quick-path card says the person has told us (MOM-111): one list, by who it is about, in everyday words. A section is a
// goal, "Your days", or "How Momentum talks to you"; each line says which step (a goal, one thing counted, a work item, or the
// days) it belongs to, so the card can show a step's lines on their own, or put a missing item's question in place right after
// them. A value that is not set yet has no line: its question is shown instead, in place. A section with nothing in it is left
// out. Written by code from the validated draft, never by Claude. Pure.

import { EARLY_DAY_END_LIMIT } from '@/lib/engine/constants';
import type { GoalDraft, SetupModel, TargetDraft, WorkItemDraft } from '@/types/setup';
import type { RecapLine, RecapSection } from '@/types/setupScreen';
import { countedThing } from './numbers';
import {
  PROVIDER_NAMES,
  amountOf,
  clock,
  countedWords,
  dateWords,
  describePeriod,
  describeReturn,
  plural,
  renderPlayback,
  weekdayName,
  type PlaybackOptions,
} from './playback';
import { asSaid, itemOf, listOf, restate, titleOf } from './restate';
import { zoneWords } from './timeZones';
import { minutesOfClock } from './text';

export const goalStepId = (g: GoalDraft): string => `goal:${g.key}`;
export const targetStepId = (g: GoalDraft, t: TargetDraft): string => `target:${g.key}.${t.key}`;
export const itemStepId = (g: GoalDraft, i: WorkItemDraft): string => `item:${g.key}.${i.key}`;
export const DAYS_STEP_ID = 'days';
export const TALK_SECTION_ID = 'talk';

// "starts Friday, Nov 20"; nothing when there is no start date. Always the date itself, never "today" (see PlaybackOptions.absoluteDates).
const startsWords = (g: GoalDraft, options: PlaybackOptions): string | null => (g.startDate ? `starts ${dateWords(g.startDate, options)}` : null);

// A goal's timeframe as one sentence: "Get stronger starts Friday, Oct 30 and keeps going." Null while neither the start nor the shape is set.
function shapeLine(g: GoalDraft, options: PlaybackOptions): string | null {
  const title = titleOf(g.title);
  const start = startsWords(g, options);
  switch (g.shape) {
    case 'ongoing': {
      const first = g.blockWeeks !== null ? `, with a first stretch of ${plural(g.blockWeeks, 'week', 'weeks')}` : '';
      return `${title} ${start ? `${start} and keeps going` : 'keeps going'}${first}.`;
    }
    case 'finite': {
      const end = g.endDate ? `ends ${dateWords(g.endDate, options)}` : null;
      const parts = [start, end].filter((p): p is string => p !== null);
      return parts.length > 0 ? `${title} ${listOf(parts)}.` : null;
    }
    case 'project': {
      const end = g.endDate ? `has a deadline of ${dateWords(g.endDate, options)}` : "runs until it's done";
      return `${title} ${start ? `${start} and ${end}` : end}.`;
    }
    case null:
      return start ? `${title} ${start}.` : null;
  }
}

// The lines for one thing counted: what is counted, the least that would still count, what is hoped for, and where it is tracked.
function targetLines(t: TargetDraft, options: PlaybackOptions): string[] {
  const lines: string[] = [];
  const thing = countedThing(t, options.said);
  if (t.floor !== null) {
    lines.push(`Even in a hard week: at least ${amountOf(t, t.floor, options)} ${describePeriod(t, options, 'rate')}.`);
  } else if (t.measure === 'checklist') {
    lines.push(`You'll work through a checklist of ${countedWords(t.title, options.said)} ${describePeriod(t, options, 'each')}.`);
  } else {
    lines.push(`You'll count ${thing} ${describePeriod(t, options, 'each')}.`);
  }
  if (t.aspiration !== null) lines.push(`You're hoping for ${amountOf(t, t.aspiration, options)} ${describePeriod(t, options, 'rate')}.`);
  if (t.role === 'outcome') lines.push("It isn't fully in your hands, so it's shown to you, never judged.");
  if (t.qualifyingThreshold !== null) lines.push(`Only entries of ${amountOf(t, t.qualifyingThreshold, options)} or more count.`);
  for (const s of t.sources) {
    lines.push(s.kind === 'manual' ? `You log ${thing} yourself.` : `${PROVIDER_NAMES.get(s.provider) ?? s.provider} counts ${thing} for you.`);
  }
  return lines;
}

function itemLine(i: WorkItemDraft, options: PlaybackOptions): string | null {
  const title = titleOf(i.title);
  if (i.kind === 'deadline_task') {
    if (!i.dueDate) return null;
    const move = i.dateCanMove === null ? '' : i.dateCanMove ? ' The date can move.' : " The date can't move.";
    return `Due by ${dateWords(i.dueDate, options)}: ${title}.${move}`;
  }
  return `${i.kind === 'habit' ? 'Habit' : 'A step along the way'}: ${title}.`;
}

function goalWhy(g: GoalDraft): string | null {
  if (!g.why) return null;
  const why = restate(g.why, 'clause');
  return why ? `Because ${why}.` : `Why, in your words: ${asSaid(g.why)}`;
}

function daysLines(model: SetupModel, options: PlaybackOptions): string[] {
  const p = model.person;
  const lines: string[] = [];
  if (p.timeZone) lines.push(`You're on ${zoneWords(p.timeZone)}.`);
  if (p.dayEnd) {
    const at = clock(p.dayEnd, 'person.dayEnd', options);
    const m = minutesOfClock(p.dayEnd);
    // A day that ends between midnight and 06:00 moves the boundary: late entries count toward the day before.
    lines.push(m > 0 && m < EARLY_DAY_END_LIMIT ? `Your day ends at ${at}, so late entries count toward the day before.` : `You check in at ${at}.`);
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
  if (p.priorities.length > 0) {
    lines.push(`Besides your goals, what matters to you: ${listOf(p.priorities.map(itemOf))}. Momentum will keep these in mind so the plan doesn't crowd them out.`);
  }
  return lines;
}

// Every section the card can show. `hosts` are the ids of the sections a missing item will be shown in, so a section with nothing
// said yet still exists to hold its question; any other section with no line is left out.
export function recapSections(model: SetupModel, given: PlaybackOptions = {}, hosts: readonly string[] = []): RecapSection[] {
  // Every date in this recap is the date itself, so it reads the same whatever time zone the person picks.
  const options: PlaybackOptions = { ...given, absoluteDates: true };
  const sections: RecapSection[] = [];
  const keep = (section: RecapSection): void => {
    if (section.lines.length > 0 || hosts.includes(section.id)) sections.push(section);
  };

  for (const g of model.goals) {
    const lines: RecapLine[] = [];
    const goalStep = goalStepId(g);
    const subjects = g.state === 'active' ? [goalStep, ...g.targets.map((t) => targetStepId(g, t)), ...g.items.map((i) => itemStepId(g, i))] : [goalStep];
    const names: Record<string, string> = { [goalStep]: titleOf(g.title) };
    if (g.state === 'active') {
      for (const t of g.targets) names[targetStepId(g, t)] = titleOf(t.title);
      for (const i of g.items) names[itemStepId(g, i)] = titleOf(i.title);
    }
    if (g.state !== 'active') {
      lines.push({ text: `Set aside for now. ${describeReturn(g, options)}`, stepId: goalStep });
    } else {
      for (const text of [goalWhy(g), shapeLine(g, options)]) if (text) lines.push({ text, stepId: goalStep });
      for (const t of g.targets) for (const text of targetLines(t, options)) lines.push({ text, stepId: targetStepId(g, t) });
      for (const i of g.items) {
        const text = itemLine(i, options);
        if (text) lines.push({ text, stepId: itemStepId(g, i) });
      }
    }
    keep({ id: goalStep, title: titleOf(g.title), lines, subjects, names });
  }

  keep({ id: DAYS_STEP_ID, title: 'Your days', lines: daysLines(model, options).map((text) => ({ text, stepId: DAYS_STEP_ID })), subjects: [DAYS_STEP_ID], names: { [DAYS_STEP_ID]: 'Your days' } });

  // Only what the person actually chose: the placeholder a part with nothing in it gets in the playback is never shown here.
  const talk = renderPlayback(model, 'talk', options).filter((line) => line !== 'Nothing in this part yet.');
  keep({ id: TALK_SECTION_ID, title: 'How Momentum talks to you', lines: talk.map((text) => ({ text, stepId: TALK_SECTION_ID })), subjects: [TALK_SECTION_ID], names: { [TALK_SECTION_ID]: 'How Momentum talks to you' } });
  return sections;
}
