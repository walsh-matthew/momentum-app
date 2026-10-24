// The Hevy client and normalizer (MOM-38, docs/INTEGRATIONS_SPEC.md §3.A). Pure HTTP and Zod: it never touches
// Supabase and never reads an environment variable. The caller passes the user's own API key, which it got from the
// integrations service (getMyAccessToken / getAccessToken); there is no global Hevy key here.
//
// Written against Hevy's published API description (https://api.hevyapp.com/docs: GET /v1/workouts and
// GET /v1/workouts/{workoutId}, authenticated by the `api-key` header, 10 workouts a page at most) and checked
// against a redacted real response (tests/fixtures/hevy-workouts.redacted.json). Fields it uses: id, title,
// start_time, end_time, and each exercise's sets (type, weight_kg, reps). Everything else Hevy sends is ignored.
//
// What a workout becomes (an InboundActivityPayload):
//   externalId        workout.id
//   timestamp         workout.end_time, as UTC
//   title             workout.title
//   durationMinutes   end_time minus start_time
//   metrics.volumeLbs        sum of reps x weight over the sets that have both, in pounds (Hevy always sends kg)
//   metrics.setsCompleted    the number of sets in the workout. Hevy has no "completed" flag on a set: the API only
//                            returns logged sets, and a set's type is normal, warmup, dropset or failure. So every
//                            set counts, and the warm-up sets are also counted in metadata.warmupSets.
// This differs from the spec's rule ("sets where indicator == 'completed'"), because Hevy has no such field; the
// spec now says so.

import { z } from 'zod';
import type { InboundActivityPayload } from '@/lib/services/integrations';
import {
  HEADER_SAFE,
  minutesBetween,
  requestJson,
  type ActivityPage,
  type AdapterDeps,
  type AdapterResult,
  type RejectedItem,
} from './shared';

export const HEVY_API_BASE = 'https://api.hevyapp.com';
// INTEGRATIONS_SPEC.md §3.A. A user's goal channel keys are their own, so a caller that knows better passes one.
export const HEVY_TARGET_CHANNEL = 'physical_fitness';
export const HEVY_MAX_PAGE_SIZE = 10;

const KG_TO_LBS = 2.2046226218;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// What Hevy sends. Loose objects: unknown fields are allowed and dropped, so Hevy adding one breaks nothing.
// ---------------------------------------------------------------------------

// Hevy leaves a key out entirely in places (a sample set has no distance_meters), so each is optional as well as
// nullable.
const optionalNumber = z.number().nullish();

const HevySetSchema = z.looseObject({
  type: z.string().min(1).max(40),
  weight_kg: optionalNumber,
  reps: optionalNumber,
  distance_meters: optionalNumber,
  duration_seconds: optionalNumber,
});

const HevyExerciseSchema = z.looseObject({
  title: z.string().max(300).optional(),
  sets: z.array(HevySetSchema).max(200),
});

const HevyWorkoutSchema = z.looseObject({
  id: z.string().trim().min(1).max(200),
  title: z.string().max(500).nullish(),
  start_time: z.string().min(1).max(64),
  end_time: z.string().min(1).max(64),
  exercises: z.array(HevyExerciseSchema).max(100),
});
type HevyWorkout = z.infer<typeof HevyWorkoutSchema>;

// GET /v1/workouts. Each workout is parsed on its own below, so one bad workout does not discard the page.
const HevyWorkoutPageSchema = z.looseObject({
  page: z.number().int().min(1),
  page_count: z.number().int().min(0),
  workouts: z.array(z.unknown()).max(100),
});

// ---------------------------------------------------------------------------
// Normalizing
// ---------------------------------------------------------------------------

export interface HevyNormalizeOptions {
  targetGoalChannel?: string;
}

function summarizeSets(workout: HevyWorkout) {
  let volumeKg = 0;
  let sets = 0;
  let warmups = 0;
  for (const exercise of workout.exercises) {
    for (const set of exercise.sets) {
      sets += 1;
      if (set.type === 'warmup') warmups += 1;
      if (typeof set.reps === 'number' && typeof set.weight_kg === 'number' && set.reps >= 0 && set.weight_kg >= 0) {
        volumeKg += set.reps * set.weight_kg;
      }
    }
  }
  return { sets, warmups, volumeLbs: Math.round(volumeKg * KG_TO_LBS * 10) / 10 };
}

// One Hevy workout (already parsed) to an activity, or the reason it cannot be one.
function toActivity(workout: HevyWorkout, options: HevyNormalizeOptions): { ok: true; data: InboundActivityPayload } | { ok: false; reason: string } {
  const start = new Date(workout.start_time);
  const end = new Date(workout.end_time);
  const duration = minutesBetween(start, end);
  if (!duration.ok) return duration;

  const { sets, warmups, volumeLbs } = summarizeSets(workout);
  const title = (workout.title ?? '').trim().slice(0, 200) || 'Workout';
  return {
    ok: true,
    data: {
      externalId: workout.id,
      provider: 'hevy',
      timestamp: end.toISOString(),
      targetGoalChannel: options.targetGoalChannel ?? HEVY_TARGET_CHANNEL,
      activityType: 'strength_workout',
      title,
      durationMinutes: duration.minutes,
      metrics: {
        volumeLbs,
        setsCompleted: sets,
        metadata: { exerciseCount: workout.exercises.length, warmupSets: warmups },
      },
    },
  };
}

// Turns one raw Hevy workout (a list item, or the answer to GET /v1/workouts/{id}) into an activity. Exported
// because the webhook route reuses it for the single workout it fetches by id.
export function normalizeHevyWorkout(raw: unknown, options: HevyNormalizeOptions = {}) {
  const parsed = HevyWorkoutSchema.safeParse(raw);
  // What was wrong, never the value.
  if (!parsed.success) return { ok: false as const, reason: 'The workout is not in the shape Hevy documents.' };
  return toActivity(parsed.data, options);
}

// ---------------------------------------------------------------------------
// The HTTP client
// ---------------------------------------------------------------------------

function authHeader(apiKey: unknown): Record<string, string> | null {
  return typeof apiKey === 'string' && apiKey.length <= 512 && HEADER_SAFE.test(apiKey) ? { 'api-key': apiKey } : null;
}

export interface HevyListOptions extends HevyNormalizeOptions {
  page?: number;
  pageSize?: number;
}

export interface HevyWorkoutPage extends ActivityPage {
  page: number;
  pageCount: number;
}

// GET /v1/workouts: one page of the user's workouts, newest first, as activities. `apiKey` is the user's own key.
export async function listHevyWorkouts(
  apiKey: string,
  options: HevyListOptions = {},
  deps: AdapterDeps = {},
): Promise<AdapterResult<HevyWorkoutPage>> {
  const headers = authHeader(apiKey);
  if (!headers) return { ok: false, reason: 'unauthorized' };
  const page = Number.isInteger(options.page) && (options.page as number) >= 1 ? (options.page as number) : 1;
  const pageSize = Math.min(HEVY_MAX_PAGE_SIZE, Math.max(1, Math.trunc(options.pageSize ?? HEVY_MAX_PAGE_SIZE)));

  const url = `${HEVY_API_BASE}/v1/workouts?page=${page}&pageSize=${pageSize}`;
  const answer = await requestJson(url, headers, deps);
  if (!answer.ok) return answer;

  const envelope = HevyWorkoutPageSchema.safeParse(answer.data);
  if (!envelope.success) return { ok: false, reason: 'bad_response' };

  const activities: InboundActivityPayload[] = [];
  const rejected: RejectedItem[] = [];
  envelope.data.workouts.forEach((raw, index) => {
    const result = normalizeHevyWorkout(raw, options);
    if (result.ok) activities.push(result.data);
    else rejected.push({ index, reason: result.reason });
  });
  return { ok: true, data: { page: envelope.data.page, pageCount: envelope.data.page_count, activities, rejected } };
}

// GET /v1/workouts/{workoutId}: one workout as an activity. The id may have come from a webhook body, so it must be
// a UUID before it goes into an address.
export async function getHevyWorkout(
  apiKey: string,
  workoutId: string,
  options: HevyNormalizeOptions = {},
  deps: AdapterDeps = {},
): Promise<AdapterResult<InboundActivityPayload>> {
  const headers = authHeader(apiKey);
  if (!headers) return { ok: false, reason: 'unauthorized' };
  if (typeof workoutId !== 'string' || !UUID_PATTERN.test(workoutId)) return { ok: false, reason: 'not_found' };

  const answer = await requestJson(`${HEVY_API_BASE}/v1/workouts/${workoutId}`, headers, deps);
  if (!answer.ok) return answer;

  const result = normalizeHevyWorkout(answer.data, options);
  if (!result.ok) return { ok: false, reason: 'bad_response' };
  // The answer must be the workout that was asked for.
  if (result.data.externalId.toLowerCase() !== workoutId.toLowerCase()) return { ok: false, reason: 'bad_response' };
  return { ok: true, data: result.data };
}
