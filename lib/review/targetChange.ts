// The edit the weekly review opens when the person says "Yes, I want to change it" (MOM-146, docs/DOMAIN_MODEL.md §1.7 and §3.2):
// the numbers a target is judged by from the next period on, and a day-slots target's days. Pure: the form checks with it before
// it sends, and lib/services/targetChanges.ts checks again on the server with the same code, so the browser is never trusted. The
// engine's rules (a floor above 0, an aspiration not below it) are the database's checks too (migration 020). Claude has no part in
// it: the numbers are the person's, and code validates them (principle 9).

import type { Measure } from '@/types/database.types';

export type ChangeField = 'floor' | 'aspiration' | 'days';

// The words of each problem, the same on the form and on the server. Plain, and they say what to do.
export const CHANGE_PROBLEMS = {
  floor: 'Enter a number above 0.',
  floorWhole: 'Enter a whole number above 0.',
  aspiration: 'Enter a number above 0, or leave it empty.',
  aspirationWhole: 'Enter a whole number above 0, or leave it empty.',
  aspirationBelow: "The number you're hoping for can't be less than the one that still counts.",
  days: 'Pick at least one day.',
} as const;

export const CHANGE_SAVE_FAILED = "Your change didn't save. Nothing was changed. Try again.";
export const CHANGE_NOT_READ = "That change couldn't be read. Nothing was changed.";

export interface ChangeFields {
  // The text of the two number boxes, as typed.
  floor: string;
  aspiration: string;
  // A day-slots target's days, 1 to 7 with Monday as 1 (the database's count); null for a weekly target.
  days: readonly number[] | null;
}

export interface ChangeValue {
  floor: number;
  aspiration: number | null;
  days: number[] | null;
}

export type ChangeCheck = { ok: true; value: ChangeValue } | { ok: false; field: ChangeField; message: string };

// Only a whole number makes sense for a count of things done or of items ticked; a quantity or minutes may have a decimal part.
const wholeOnly = (measure: Measure) => measure === 'count' || measure === 'checklist';

// A number as the person typed it: digits with an optional decimal part, nothing else (no sign, no exponent, no thousands comma).
function numberOf(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n < 1e9 ? n : null;
}

// The first thing wrong with a change, in the order the form is read (the number that still counts, the number hoped for, the
// days), or the checked value. The aspiration is optional: empty means none.
export function checkChange(fields: ChangeFields, measure: Measure): ChangeCheck {
  const whole = wholeOnly(measure);
  const floor = numberOf(fields.floor);
  if (floor === null || floor <= 0 || (whole && !Number.isInteger(floor))) {
    return { ok: false, field: 'floor', message: whole && floor !== null && floor > 0 ? CHANGE_PROBLEMS.floorWhole : CHANGE_PROBLEMS.floor };
  }
  let aspiration: number | null = null;
  if (fields.aspiration.trim() !== '') {
    aspiration = numberOf(fields.aspiration);
    if (aspiration === null || aspiration <= 0 || (whole && !Number.isInteger(aspiration))) {
      return {
        ok: false,
        field: 'aspiration',
        message: whole && aspiration !== null && aspiration > 0 ? CHANGE_PROBLEMS.aspirationWhole : CHANGE_PROBLEMS.aspiration,
      };
    }
    if (aspiration < floor) return { ok: false, field: 'aspiration', message: CHANGE_PROBLEMS.aspirationBelow };
  }
  let days: number[] | null = null;
  if (fields.days !== null) {
    days = [...new Set(fields.days)].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7).sort((a, b) => a - b);
    if (days.length === 0) return { ok: false, field: 'days', message: CHANGE_PROBLEMS.days };
  }
  return { ok: true, value: { floor, aspiration, days } };
}
