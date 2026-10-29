// Which saved values came from a suggestion the person accepted (MOM-134, docs/DOMAIN_MODEL.md §2.1 rule 4): a starting
// point, to be asked about at the first weekly review ("Still right for you?"), never a fact about the person. The draft
// records it as `said` entries with how: 'accepted' (types/setup.ts); the save used to drop them. Pure: no database call.
//
// A mark names a saved value by the draft's own keys, not by database id: the ids are only created inside
// save_guided_setup() (migration 015, 016 and 017), which marks each value on the row it has just written. So a path
// that is not a value in the draft maps to nothing and is dropped here: a `said` entry for a value that is no longer
// set, or that the person later said themselves, never becomes a mark.
//
// Only the paths in lib/setup/leaves.ts's PROVENANCE_PATH_FORMS can be accepted. Whether a deadline date can move is the
// person's own answer to its own question (the validator requires 'said'), so it is never a starting point.

import type { SetupDraft } from '@/types/setup';
import { latestProvenance, provenanceLeaves } from './leaves';

// What a marked value belongs to, by the draft's keys. A day type is named by its name in lowercase, as in its path.
export type StartingPointSubject =
  | { kind: 'person' }
  | { kind: 'day_type'; name: string }
  | { kind: 'goal'; goalKey: string }
  | { kind: 'target'; goalKey: string; targetKey: string }
  | { kind: 'work_item'; goalKey: string; itemKey: string };

export interface StartingPointMark {
  subject: StartingPointSubject;
  // The saved column that holds the value (migration 017's starting_points.field).
  field: string;
}

const PERSON_FIELDS: Record<string, string> = {
  'person.dayEnd': 'day_end',
  'person.weekStart': 'week_start',
  'person.planning.weekday': 'planning_weekday',
  'person.planning.time': 'planning_time',
};
const GOAL_FIELDS: Record<string, string> = {
  startDate: 'start_date',
  endDate: 'end_date',
  blockWeeks: 'block_weeks',
  returnDate: 'return_date',
};
const TARGET_FIELDS: Record<string, string> = {
  floor: 'floor',
  aspiration: 'aspiration',
  qualifyingThreshold: 'qualifying_threshold',
  dueDate: 'due_date',
  slotWeekdays: 'slot_weekdays',
};
// dateCanMove is not here on purpose: see the header.
const ITEM_FIELDS: Record<string, string> = { dueDate: 'due_date', estimateMinutes: 'estimate_minutes' };

// Keys are lowercase letters, digits and underscores (types/setup.ts), so they hold no dot. A day type's name can.
const KEY = '([a-z][a-z0-9_]*)';
const DAY_TYPE_PATH = /^person\.dayTypes\.(.+)\.capacityAmount$/;
const GOAL_PATH = new RegExp(`^goals\\.${KEY}\\.([A-Za-z]+)$`);
const TARGET_PATH = new RegExp(`^goals\\.${KEY}\\.targets\\.${KEY}\\.([A-Za-z]+)$`);
const ITEM_PATH = new RegExp(`^goals\\.${KEY}\\.items\\.${KEY}\\.([A-Za-z]+)$`);

// Own entries only: a name such as "constructor" is not a field.
const own = (fields: Record<string, string>, name: string): string | undefined => (Object.hasOwn(fields, name) ? fields[name] : undefined);

// The mark for a provenance path, or null when the path is not one a starting point can be recorded for.
export function startingPointForPath(path: string): StartingPointMark | null {
  const person = own(PERSON_FIELDS, path);
  if (person) return { subject: { kind: 'person' }, field: person };

  const dayType = DAY_TYPE_PATH.exec(path);
  if (dayType) return { subject: { kind: 'day_type', name: dayType[1] }, field: 'capacity_amount' };

  const target = TARGET_PATH.exec(path);
  if (target) {
    const field = own(TARGET_FIELDS, target[3]);
    return field ? { subject: { kind: 'target', goalKey: target[1], targetKey: target[2] }, field } : null;
  }
  const item = ITEM_PATH.exec(path);
  if (item) {
    const field = own(ITEM_FIELDS, item[3]);
    return field ? { subject: { kind: 'work_item', goalKey: item[1], itemKey: item[2] }, field } : null;
  }
  const goal = GOAL_PATH.exec(path);
  if (goal) {
    const field = own(GOAL_FIELDS, goal[2]);
    return field ? { subject: { kind: 'goal', goalKey: goal[1] }, field } : null;
  }
  return null;
}

// The values in this draft that came from an accepted suggestion, one mark each. A value counts only when the newest
// thing the draft says about where it came from is "accepted" (the same rule the validator reads), so a value the person
// said after accepting a suggestion is theirs, and a value that has none (never asked, so null) has no mark.
export function acceptedStartingPoints(draft: SetupDraft): StartingPointMark[] {
  const marks: StartingPointMark[] = [];
  const seen = new Set<string>();
  for (const leaf of provenanceLeaves(draft.model)) {
    // Two day types that differ only in case share a path; the first one is the one marked.
    if (seen.has(leaf.path)) continue;
    seen.add(leaf.path);
    if (latestProvenance(draft.said, leaf.path)?.how !== 'accepted') continue;
    const mark = startingPointForPath(leaf.path);
    if (mark) marks.push(mark);
  }
  return marks;
}
