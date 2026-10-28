// What the manual-entry page (MOM-110) shows. These are views over the goal model's rows, built by
// lib/services/entries.ts; the rows themselves are in types/database.types.ts. Nothing here is a score or a total:
// a step is ticked or not, an entry is removed or not (docs/DOMAIN_MODEL.md §1.6, §1.7).

import type { Measure } from './database.types';

// One step of a milestone that feeds a checklist target. `ticked` comes from the entries and the person's
// corrections (a tick is an entry, un-ticking hides it), never from the step row's display column.
export interface LogStep {
  id: string;
  title: string;
  ticked: boolean;
}

// A milestone or deadline task whose steps feed a checklist target.
export interface LogItem {
  id: string;
  title: string;
  steps: LogStep[];
}

// A target the person can log against. Its measure decides the control: count is a tap, quantity is one number,
// time is a timer, checklist is a tick per step.
export interface LogTarget {
  id: string;
  title: string;
  goalTitle: string;
  measure: Measure;
  // The unit of a quantity target; null for every other measure.
  unit: string | null;
  // Checklist targets only: the items feeding it, with their steps. Empty for every other measure.
  items: LogItem[];
}

// One manual entry in the recent list. `removed` means a hide correction exists for its record: it is kept, shown
// as removed, and can be restored.
export interface LoggedEntry {
  id: string;
  targetId: string;
  targetTitle: string;
  measure: Measure;
  unit: string | null;
  value: number;
  occurredAt: string;
  // How it was logged: 'tap', 'number', 'minutes', 'timer' or 'tick'. Null if the evidence does not say.
  via: string | null;
  // For a tick: the step's title, as it was when ticked. Null for the other ways to log.
  detail: string | null;
  // The day the person chose (YYYY-MM-DD) when they logged on another day. Its time of day is a stand-in, so it is
  // shown as a day only. Null for a log made now.
  chosenDay: string | null;
  // The entry falls before its goal's start date, so the engine does not count it. It is kept and shown as such.
  // False when that cannot be told (no day end yet) or the entry is on or after the start.
  beforeStart: boolean;
  removed: boolean;
}

// A day the person can log on, built by the server in their own time zone (the browser's clock is never used).
export interface LogDay {
  // YYYY-MM-DD
  date: string;
  // "Today", "Yesterday", or the weekday ("Mon").
  label: string;
  // The date for display ("Oct 26").
  detail: string;
}

export interface LogPanel {
  // The person's own time zone, or null when it is not set (or not a real zone). Logging refuses without it.
  timeZone: string | null;
  // Today and the days back to the log window's edge, newest first, or null when the time zone or the day end is
  // not set: a chosen day needs both, and neither is assumed.
  days: LogDay[] | null;
  targets: LogTarget[];
  recent: LoggedEntry[];
}
