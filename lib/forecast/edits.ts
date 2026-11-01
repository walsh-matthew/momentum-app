// The checks and the plain messages behind the forecast's edits (MOM-138). Pure: a value in, a number or a message out, no
// database and no clock. The edit screens run these before they send anything, so a tap with something missing or wrong
// answers with one plain callout (MOM-145), and lib/services/forecastEdits.ts runs the same checks again, because a Server
// Action is reachable by direct POST. Nothing is guessed: an empty or unreadable value is refused, never filled in.

import type { CapacityUnit } from '@/types/database.types';
import { CAPACITY_UNITS } from '@/types/database.types';
import type { LocalDate } from '@/types/scoreboard';

// The messages a callout or a refusal says. The first group is the approved screen words (MOM-138 design, 2026-11-01).
export const SIZE_MISSING = 'Say roughly how many hours first.';
export const STEP_MISSING = 'Write the step first.';
// Renaming a step: the words the person is asked for are the new name (owner, 2026-11-01).
export const RENAME_MISSING = 'Write the new name first.';
export const UNIT_MISSING = 'Choose hours or sessions first.';
export const AMOUNT_MISSING = 'Say how many first.';
export const DATE_PAST = 'That day has passed. Pick a day from today on.';
export const SAVE_FAILED = 'Could not save that. Nothing was changed.';
// Said only when something other than the screen asks (the screens never offer these): a plain reason, and nothing changed.
export const SIZE_UNREADABLE = 'Say the size as a number of hours, like 2 or 1.5.';
export const AMOUNT_UNREADABLE = 'Say a number from 0 to 24, like 3 or 2.5.';
export const DATE_MISSING = 'Pick a day first.';
export const DATE_UNREADABLE = 'That is not a real day. Nothing was changed.';
export const DATE_LOCKED = "You said this date can't move. Nothing was changed.";
export const STEP_TOO_LONG = 'That step is too long. Nothing was changed.';
export const STEP_TICKED = 'That step is ticked, so it stays as it is. Nothing was changed.';
export const TASK_FINISHED = 'That one is finished, so it is not changed. Nothing was changed.';
export const NOT_YOUR_TASK = 'That is not one of your tasks. Nothing was changed.';
export const NOT_YOUR_STEP = 'That is not one of your steps. Nothing was changed.';
export const NOT_YOUR_KIND = 'That is not one of your kinds of days. Nothing was changed.';

export const MAX_SIZE_HOURS = 1000;
export const MAX_DAY_HOURS = 24;
export const MAX_STEP_LENGTH = 200;

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

const isBlank = (raw: unknown): boolean => raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '');

// A number as a person types it: digits with at most two decimals, a comma or a point. Nothing else (no sign, no exponent).
function readNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) && Math.round(raw * 100) === raw * 100 ? raw : null;
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!/^\d{1,4}([.,]\d{1,2})?$/.test(text)) return null;
  return Number(text.replace(',', '.'));
}

// A task's rough size, typed in hours, saved as whole minutes. Above 0 and no more than MAX_SIZE_HOURS.
export function checkSizeHours(raw: unknown): Checked<number> {
  if (isBlank(raw)) return { ok: false, error: SIZE_MISSING };
  const hours = readNumber(raw);
  if (hours === null || !(hours > 0) || hours > MAX_SIZE_HOURS) return { ok: false, error: SIZE_UNREADABLE };
  const minutes = Math.round(hours * 60);
  return minutes >= 1 ? { ok: true, value: minutes } : { ok: false, error: SIZE_UNREADABLE };
}

export function isCapacityUnit(raw: unknown): raw is CapacityUnit {
  return typeof raw === 'string' && (CAPACITY_UNITS as readonly string[]).includes(raw);
}

// A kind of day's usual time: hours or sessions, and how many. 0 is allowed (a day that gives none); no more than a day.
export function checkKindTime(unit: unknown, amount: unknown): Checked<{ unit: CapacityUnit; amount: number }> {
  if (isBlank(unit) || !isCapacityUnit(unit)) return { ok: false, error: UNIT_MISSING };
  if (isBlank(amount)) return { ok: false, error: AMOUNT_MISSING };
  const n = readNumber(amount);
  if (n === null || n > MAX_DAY_HOURS) return { ok: false, error: AMOUNT_UNREADABLE };
  return { ok: true, value: { unit, amount: n } };
}

// A step's words: trimmed, not empty, not longer than a line. `missing` is what an empty one is told: a new step is asked for ("Write
// the step first."), a rename is asked for its new name.
export function checkStepTitle(raw: unknown, missing: string = STEP_MISSING): Checked<string> {
  if (typeof raw !== 'string' || raw.trim() === '') return { ok: false, error: missing };
  const title = raw.trim();
  return title.length > MAX_STEP_LENGTH ? { ok: false, error: STEP_TOO_LONG } : { ok: true, value: title };
}

// A new due date: a real day (YYYY-MM-DD), today or later in the person's own days.
export function checkNewDueDate(raw: unknown, today: LocalDate): Checked<LocalDate> {
  if (isBlank(raw)) return { ok: false, error: DATE_MISSING };
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { ok: false, error: DATE_UNREADABLE };
  if (new Date(Date.UTC(Number(raw.slice(0, 4)), Number(raw.slice(5, 7)) - 1, Number(raw.slice(8, 10)))).toISOString().slice(0, 10) !== raw) {
    return { ok: false, error: DATE_UNREADABLE };
  }
  if (raw < today) return { ok: false, error: DATE_PAST };
  return { ok: true, value: raw };
}

// Hours as a person reads them: 2, 1.5 (at most two decimals, no trailing zero).
export const hoursText = (hours: number): string => String(Math.round(hours * 100) / 100);
