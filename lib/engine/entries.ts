// Which entries count and what they add up to (docs/DOMAIN_MODEL.md §1.3 measures, qualifying threshold and
// count anyway; §1.6 removed entries). Entries are never edited here, only counted or left out.

import type { LocalDate, ScoreboardEntry, TargetSpec, TimeAnchors } from '@/types/scoreboard';
import { dayOfWeek, localDay } from './time';

export interface CountedEntry {
  entry: ScoreboardEntry;
  day: LocalDate;
  // The instant, for ordering.
  ms: number;
}

export interface EntrySelection {
  // In the order they happened.
  counted: CountedEntry[];
  // Kept and shown, not counted: below the qualifying threshold and not counted anyway.
  belowThreshold: string[];
}

// What the qualifying threshold is compared with: the entry's size, or for a quantity or time target the value
// itself. An entry with neither cannot be judged below a threshold, so it counts.
function sizeOf(entry: ScoreboardEntry, spec: TargetSpec): number | null {
  if (entry.size !== null) return entry.size;
  return spec.measure === 'quantity' || spec.measure === 'time' ? entry.value : null;
}

// Entries on days from..to (inclusive) that count toward the target.
export function selectEntries(
  spec: TargetSpec,
  entries: ScoreboardEntry[],
  window: { from: LocalDate; to: LocalDate },
  anchors: TimeAnchors,
): EntrySelection {
  const counted: CountedEntry[] = [];
  const belowThreshold: string[] = [];
  for (const entry of entries) {
    if (spec.measure !== 'checklist' && !(Number.isFinite(entry.value) && entry.value >= 0)) {
      throw new Error(`Entry ${entry.id} has a value that is not a number from 0 up.`);
    }
    // A removed entry is hidden, even if it was counted anyway (§1.6).
    if (entry.removed) continue;
    const day = localDay(entry.occurredAt, anchors);
    if (day < window.from || day > window.to) continue;
    const size = sizeOf(entry, spec);
    const threshold = spec.qualifyingThreshold;
    if (threshold !== null && !entry.countAnyway && size !== null && size < threshold) {
      belowThreshold.push(entry.id);
      continue;
    }
    counted.push({ entry, day, ms: Date.parse(entry.occurredAt) });
  }
  counted.sort((a, b) => a.ms - b.ms || (a.entry.id < b.entry.id ? -1 : 1));
  return { counted, belowThreshold };
}

export interface Tally {
  // The measure's total after all counted entries.
  total: number;
  // The running total after each entry that moved it, with the day it moved: a crossing is the day a level was
  // reached. A checklist tick carries its step id.
  steps: { day: LocalDate; total: number; stepId: string | null }[];
  // Day-slot targets: counted entries on a day that is not a slot. Shown, filling nothing.
  extraEntries: number;
}

// A tap is a value of 1, so count, quantity and time all sum the entries' values. A checklist counts the
// distinct steps ticked. A day-slot period counts the slots filled, one per named day with a counting entry.
export function measureTotal(spec: TargetSpec, counted: CountedEntry[]): Tally {
  const steps: Tally['steps'] = [];
  let total = 0;
  let extraEntries = 0;

  if (spec.period.kind === 'day_slots') {
    const open = new Set(spec.period.days);
    for (const { entry, day } of counted) {
      const weekday = dayOfWeek(day);
      if (open.has(weekday)) {
        open.delete(weekday);
        total += 1;
        steps.push({ day, total, stepId: entry.stepId });
      } else if (!spec.period.days.includes(weekday)) {
        extraEntries += 1;
      }
    }
    return { total, steps, extraEntries };
  }

  if (spec.measure === 'checklist') {
    const wanted = new Set(spec.stepIds ?? []);
    const ticked = new Set<string>();
    for (const { entry, day } of counted) {
      if (entry.stepId === null || !wanted.has(entry.stepId) || ticked.has(entry.stepId)) continue;
      ticked.add(entry.stepId);
      total += 1;
      steps.push({ day, total, stepId: entry.stepId });
    }
    return { total, steps, extraEntries };
  }

  for (const { entry, day } of counted) {
    if (entry.value === 0) continue;
    total += entry.value;
    steps.push({ day, total, stepId: null });
  }
  return { total, steps, extraEntries };
}
