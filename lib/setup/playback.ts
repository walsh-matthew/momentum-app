// Playback is written by code from the validated draft, never by Claude (docs/DOMAIN_MODEL.md §2.3, hard rule 7): what the
// person approves is exactly what gets saved. Each approved part (chunk) gets a few plain lines; the final confirmation
// is a few lines for the whole. Only fields that are set appear; nothing is filled in. Pure.

import type { GoalDraft, SetupChunk, SetupModel, TargetDraft } from '@/types/setup';

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const weekdayName = (n: number): string => WEEKDAY_NAMES[n - 1] ?? String(n);

function describePeriod(t: TargetDraft): string {
  switch (t.period.kind) {
    case 'weekly':
      return 'each week';
    case 'day_slots':
      return `on ${t.period.weekdays.map(weekdayName).join(', ')}`;
    case 'deadline':
      return `by ${t.period.dueDate}`;
  }
}

function describeMeasure(t: TargetDraft): string {
  switch (t.measure) {
    case 'count':
      return 'a count';
    case 'quantity':
      return `a number of ${t.unit}`;
    case 'time':
      return 'time in minutes';
    case 'checklist':
      return 'a checklist';
  }
}

function describeTarget(t: TargetDraft): string {
  const levels = [
    t.floor !== null ? `at least ${t.floor}` : null,
    t.aspiration !== null ? `aiming for ${t.aspiration}` : null,
    t.qualifyingThreshold !== null ? `counting entries of ${t.qualifyingThreshold} or more` : null,
  ].filter((x): x is string => x !== null);
  const role = t.role === 'effort' ? 'effort' : 'outcome, shown and not judged';
  return `${t.title}: ${describeMeasure(t)} ${describePeriod(t)} (${role})${levels.length ? `, ${levels.join(', ')}` : ''}.`;
}

function describeShape(g: GoalDraft): string {
  const start = g.startDate ? `, starting ${g.startDate}` : '';
  switch (g.shape) {
    case 'ongoing':
      return `ongoing${g.blockWeeks !== null ? `, first block of ${g.blockWeeks} weeks` : ''}${start}`;
    case 'finite':
      return `until ${g.endDate ?? 'a date not set yet'}${start}`;
    case 'project':
      return `a project${g.endDate ? ` with a deadline of ${g.endDate}` : ''}${start}`;
    case null:
      return `shape not set yet${start}`;
  }
}

function describeReturn(g: GoalDraft): string {
  if (!g.returnWhen) return 'a way back is not set yet';
  switch (g.returnWhen.kind) {
    case 'date':
      return `comes back on ${g.returnWhen.date}`;
    case 'condition':
      return `comes back ${g.returnWhen.note}`;
    case 'on_request':
      return 'comes back only when you ask';
  }
}

export function renderPlayback(model: SetupModel, chunk: SetupChunk): string[] {
  const lines: string[] = [];
  switch (chunk) {
    case 'goals':
      for (const g of model.goals) {
        lines.push(
          g.state === 'active'
            ? `Goal: ${g.title}${g.why ? `, because ${g.why}` : ''}.`
            : `Set aside: ${g.title}; ${describeReturn(g)}.`,
        );
      }
      break;
    case 'targets':
      if (model.person.priorities.length > 0) lines.push(`Protected: ${model.person.priorities.join(', ')}.`);
      for (const g of model.goals.filter((x) => x.state === 'active')) {
        lines.push(`${g.title}: ${describeShape(g)}.`);
        for (const t of g.targets) lines.push(`  ${describeTarget(t)}`);
      }
      break;
    case 'planning': {
      const p = model.person;
      if (p.timeZone) lines.push(`Time zone: ${p.timeZone}.`);
      if (p.dayEnd) lines.push(`Your day ends at ${p.dayEnd}.`);
      if (p.weekStart !== null) lines.push(`Your week starts on ${weekdayName(p.weekStart)}.`);
      for (const d of p.dayTypes) {
        lines.push(`Day type: ${d.name}${d.capacityAmount !== null ? ` (${d.capacityAmount} ${d.capacityUnit})` : ''}.`);
      }
      if (p.planning.weekday !== null || p.planning.time !== null) {
        lines.push(
          `You plan your week${p.planning.weekday !== null ? ` on ${weekdayName(p.planning.weekday)}` : ''}${p.planning.time ? ` at ${p.planning.time}` : ''}.`,
        );
      }
      for (const g of model.goals.filter((x) => x.state === 'active')) {
        for (const i of g.items) {
          const when = i.dueDate ? `, due ${i.dueDate}, and the date ${i.dateCanMove ? 'can' : 'cannot'} move` : '';
          lines.push(`${i.kind === 'deadline_task' ? 'Deadline task' : i.kind === 'habit' ? 'Habit' : 'Milestone'}: ${i.title}${when}.`);
        }
        for (const t of g.targets) {
          lines.push(`${t.title} is tracked ${t.sources.map((s) => (s.kind === 'manual' ? 'by you, by hand' : `in ${s.provider}`)).join(' and ') || 'nowhere yet'}.`);
        }
      }
      break;
    }
    case 'talk': {
      const s = model.settings;
      const chosen: [string, string | null][] = [
        ['Tone', s.tone],
        ['Reminders', s.reminders === 'tied_to_plan' ? 'tied to the days you plan' : s.reminders],
        ['Check-ins for manual targets', s.checkIns?.replaceAll('_', ' ') ?? null],
        ['Celebrations', s.celebrations?.replaceAll('_', ' ') ?? null],
        ['Balance mentions', s.balanceMentions?.replaceAll('_', ' ') ?? null],
        ['Review depth', s.reviewDepth?.replaceAll('_', ' ') ?? null],
        ['Review and planning', s.reviewPlanning?.replaceAll('_', ' ') ?? null],
        ['Quiet times', s.quietTimes === null ? null : s.quietTimes.length === 0 ? 'none' : s.quietTimes.join(', ')],
      ];
      for (const [label, value] of chosen) if (value !== null) lines.push(`${label}: ${value}.`);
      break;
    }
  }
  return lines.length > 0 ? lines : ['Nothing in this part yet.'];
}

export const FINAL_MAX_LINES = 6;

// The last confirmation: a few lines for the whole, then save. Never more than FINAL_MAX_LINES.
export function renderFinal(model: SetupModel): string[] {
  const active = model.goals.filter((g) => g.state === 'active');
  const shown = active.slice(0, FINAL_MAX_LINES - 2);
  const lines = shown.map((g) => `${g.title}: ${g.targets.length} ${g.targets.length === 1 ? 'target' : 'targets'}.`);
  if (active.length > shown.length) lines.push(`And ${active.length - shown.length} more.`);
  const parked = model.goals.length - active.length;
  if (parked > 0) lines.push(`${parked} set aside with a way back.`);
  lines.push('Everything can be changed on your settings page.');
  return lines.slice(0, FINAL_MAX_LINES);
}
