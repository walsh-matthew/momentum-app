// Reads a stored weekly review's recap back (weekly_reviews.recap, migration 018). The column is plain JSON, so what comes
// out is checked, not trusted as typed (the same rule as lib/setup/ for a saved draft): a record that does not read is
// left out of the screen, never guessed at and never rewritten. Pure: no database, no clock.

import { z } from 'zod';
import type { StoredRecap } from '@/types/review';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nullableNumber = z.number().nullable();

const RecapTargetSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  measure: z.enum(['count', 'quantity', 'time', 'checklist']),
  unit: z.string().nullable(),
  role: z.enum(['effort', 'outcome']),
  period: z.enum(['weekly', 'day_slots', 'deadline']),
  dueOn: date.nullable(),
  floor: nullableNumber,
  aspiration: nullableNumber,
  status: z.literal('counted'),
  counted: z.number(),
  graded: z.boolean(),
  startedPartway: z.boolean(),
  level: z.enum(['none', 'partway', 'floor', 'aspiration']).nullable(),
  remainingToFloor: nullableNumber,
  remainingToAspiration: nullableNumber,
  owed: z.number(),
  belowThreshold: z.number(),
  slots: z.object({ filled: z.number(), total: z.number(), weekdays: z.array(z.number()) }).nullable(),
  pattern: z.object({ kind: z.enum(['slipping', 'holding', 'aspiration_repeated']), periods: z.number() }).nullable(),
  trend: z
    .object({ counts: z.array(z.number()), direction: z.enum(['up', 'flat', 'down', 'insufficient']) })
    .nullable(),
  crossings: z.array(z.object({ kind: z.enum(['floor', 'aspiration', 'block_end']), on: date })),
});

export const StoredRecapSchema = z.object({
  v: z.literal(1),
  window: z.object({ start: date, end: date }),
  closedEarly: z.boolean(),
  goals: z.array(z.object({ id: z.string().min(1), title: z.string(), targets: z.array(RecapTargetSchema) })),
  priorities: z.array(z.object({ id: z.string().min(1), label: z.string() })),
}) satisfies z.ZodType<StoredRecap>;

// The recap, or null when the stored value is not one this code can read.
export function parseStoredRecap(value: unknown): StoredRecap | null {
  const parsed = StoredRecapSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
