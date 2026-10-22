// Ingestion engine: turns normalized external activity into unfinished tasks (MOM-40,
// docs/INTEGRATIONS_SPEC.md §1 and §2). Server-side only: it reads the request's auth cookies.
//
// An adapter (Hevy, Google Calendar) has already normalized a provider payload into an
// InboundActivityPayload. This module checks it against the contract, decides which of the user's
// goal channels and which plan week it belongs to, and creates a task for it that carries the
// activity as evidence.
//
// What it will and will not do:
// - Every task it creates starts as 'todo' with no completed_at. The user ticks their own tasks; the
//   system never marks one done on their behalf (docs/NINETY_DAY_PLAN_CONTEXT.md §3, §5 rule 6). This
//   module only inserts. It never updates or deletes a row, so it has no code path to status or
//   completed_at, and migration 002 would refuse it anyway.
// - It runs as the signed-in user through the anon-key client, so row level security scopes every read
//   and write to their rows, and user_id is taken from the verified session, never from the payload.
//   Code with no session (a signed webhook, MOM-38) cannot use it yet; see BACKLOG.md.
// - It is idempotent: a provider and external id make at most one task per user (migration 007), so a
//   webhook retry or an overlapping poll creates nothing new.
// - Activity it cannot place is set aside by a fixed rule, reported in the result and logged. Nothing
//   is guessed and nothing is dropped silently.

import { z } from 'zod';
import { SUPPORTED_PROVIDER_IDS } from '@/lib/integrations/catalog';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { currentPlanWeek } from '@/lib/utils/velocity';
import { PLAN_WEEKS, type MicroTaskInsert, type TaskSourceEvidence } from '@/types/database.types';
import type {
  IngestionItemResult,
  IngestionOutcome,
  IngestionSkipReason,
  IngestionSummary,
} from '@/types/integrations';
import type { InboundActivityPayload } from './integrations';
import type { ServiceResult } from './result';

// Keeps one request's work, and the rows it can create, bounded.
export const MAX_ACTIVITIES_PER_BATCH = 100;
const MAX_METADATA_JSON_LENGTH = 4000;
const MAX_TASK_MINUTES = 24 * 60;
const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
// Postgres error code for a unique violation.
const UNIQUE_VIOLATION = '23505';

// ---------------------------------------------------------------------------
// The payload contract (INTEGRATIONS_SPEC.md §2)
// ---------------------------------------------------------------------------

const MetricsSchema = z.strictObject({
  volumeLbs: z.number().finite().min(0).optional(),
  setsCompleted: z.number().int().min(0).optional(),
  activeCalories: z.number().finite().min(0).optional(),
  eventCompleted: z.boolean().optional(),
  metadata: z
    .record(z.string(), z.unknown())
    .refine((m) => JSON.stringify(m).length <= MAX_METADATA_JSON_LENGTH, 'The extra details are too large.')
    .optional(),
});

// Validates the output of any provider adapter. Strict, so a stray field is rejected rather than
// silently stored. `satisfies` ties it to the interface the spec requires in integrations.ts.
export const InboundActivityPayloadSchema = z.strictObject({
  externalId: z.string().trim().min(1, 'The activity has no id.').max(200),
  provider: z.string().regex(KEY_PATTERN, 'The provider key is not valid.').max(60),
  timestamp: z.iso.datetime({ message: 'The activity time is not a UTC ISO-8601 timestamp.' }),
  targetGoalChannel: z.string().regex(KEY_PATTERN, 'The goal channel key is not valid.').max(60),
  activityType: z.string().trim().min(1, 'The activity has no type.').max(60),
  title: z.string().trim().min(1, 'The activity has no title.').max(200),
  durationMinutes: z.number().finite().min(0).max(MAX_TASK_MINUTES),
  metrics: MetricsSchema,
}) satisfies z.ZodType<InboundActivityPayload>;

type ValidActivity = z.infer<typeof InboundActivityPayloadSchema>;

// ---------------------------------------------------------------------------
// Provider handlers: payload -> task fields
// ---------------------------------------------------------------------------

export interface TaskDraft {
  title: string;
  minutes: number;
  evidence: TaskSourceEvidence;
}

type ActivityHandler = (activity: ValidActivity) => TaskDraft | IngestionSkipReason;

function draftFrom(activity: ValidActivity): TaskDraft {
  return {
    title: activity.title,
    // A task needs a positive whole number of minutes. A very short activity still counts as one.
    minutes: Math.max(1, Math.round(activity.durationMinutes)),
    evidence: {
      activityType: activity.activityType,
      occurredAt: activity.timestamp,
      durationMinutes: activity.durationMinutes,
      metrics: activity.metrics,
    },
  };
}

// One handler per supported provider (the catalog lists them). A provider's rules for "is this
// activity real?" live here, so adding a provider adds a handler and nothing else changes.
const HANDLERS: Record<string, ActivityHandler> = {
  // A logged Hevy workout has happened by definition.
  hevy: draftFrom,
  // INTEGRATIONS_SPEC.md §3.C: eventCompleted is false for an event that has not elapsed or was
  // cancelled. Those are not evidence of anything yet.
  google_calendar: (activity) => (activity.metrics.eventCompleted === false ? 'activity_not_completed' : draftFrom(activity)),
};

// ---------------------------------------------------------------------------
// Placing an activity in the plan
// ---------------------------------------------------------------------------

export type PlanPlacement =
  | { ok: true; week: number; date: string }
  | { ok: false; reason: Extract<IngestionSkipReason, 'before_plan_start' | 'after_plan_end'> };

// The plan week (1-based) an activity falls in, for a goal that started on `startDate` (YYYY-MM-DD).
// Uses the activity's UTC calendar date, and returns that date as the task's due date. An activity
// before the goal began, or after its last plan week, has no week to go in; it is not squeezed into
// week 1 or the last week.
export function placeInPlan(startDate: string, timestamp: string): PlanPlacement {
  const date = timestamp.slice(0, 10);
  if (date < startDate) return { ok: false, reason: 'before_plan_start' };
  const week = currentPlanWeek(startDate, date);
  if (week === null || week > PLAN_WEEKS) return { ok: false, reason: 'after_plan_end' };
  return { ok: true, week, date };
}

// ---------------------------------------------------------------------------
// The batch
// ---------------------------------------------------------------------------

interface ChannelRow {
  id: string;
  channel_key: string;
  status: string;
  start_date: string;
}

const itemKey = (provider: string, externalId: string) => `${provider}\u0000${externalId}`;

function logSet(aside: IngestionItemResult): void {
  // Provider, id and reason only: never the title, metrics or anything the user wrote.
  console.warn('[ingestion] set aside', {
    outcome: aside.outcome,
    provider: aside.provider,
    externalId: aside.externalId,
    reason: aside.reason,
  });
}

// Ingests a batch of normalized activities for the signed-in user. Takes `unknown` because the batch
// comes from an adapter reading external JSON, or from a direct Server Action POST; each item is
// validated on its own, so one bad item does not hold up the rest.
export async function ingestActivities(rawActivities: unknown): Promise<ServiceResult<IngestionSummary>> {
  if (!Array.isArray(rawActivities)) return { ok: false, error: 'Invalid activity batch.' };
  if (rawActivities.length > MAX_ACTIVITIES_PER_BATCH) {
    return { ok: false, error: `Send at most ${MAX_ACTIVITIES_PER_BATCH} activities at a time.` };
  }

  const results: IngestionItemResult[] = rawActivities.map((_, index) => ({
    index,
    provider: null,
    externalId: null,
    outcome: 'invalid' as IngestionOutcome,
    reason: null,
    taskId: null,
    weekOf: null,
  }));
  const set = (index: number, patch: Partial<IngestionItemResult>) => Object.assign(results[index], patch);
  const summarize = (): IngestionSummary => {
    const count = (outcome: IngestionOutcome) => results.filter((r) => r.outcome === outcome).length;
    return {
      created: count('created'),
      duplicate: count('duplicate'),
      skipped: count('skipped'),
      invalid: count('invalid'),
      failed: count('failed'),
      results,
    };
  };

  if (rawActivities.length === 0) return { ok: true, data: summarize() };

  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return { ok: false, error: 'Sign in to sync your activity.' };
  const userId = auth.user.id;

  // 1. Validate each item and set aside what a provider handler or a fixed rule rejects.
  const candidates: Array<{ index: number; activity: ValidActivity; draft: TaskDraft }> = [];
  const seen = new Set<string>();
  rawActivities.forEach((raw, index) => {
    const parsed = InboundActivityPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      // What was wrong, never the value.
      set(index, { outcome: 'invalid', reason: parsed.error.issues.map((i) => i.message).join(' ') });
      logSet(results[index]);
      return;
    }
    const activity = parsed.data;
    set(index, { provider: activity.provider, externalId: activity.externalId });

    const handler = SUPPORTED_PROVIDER_IDS.includes(activity.provider) ? HANDLERS[activity.provider] : undefined;
    if (!handler) {
      set(index, { outcome: 'skipped', reason: 'unsupported_provider' });
      logSet(results[index]);
      return;
    }
    const draft = handler(activity);
    if (typeof draft === 'string') {
      set(index, { outcome: 'skipped', reason: draft });
      logSet(results[index]);
      return;
    }
    // The same provider and id twice in one batch is one activity.
    const key = itemKey(activity.provider, activity.externalId);
    if (seen.has(key)) {
      set(index, { outcome: 'duplicate' });
      return;
    }
    seen.add(key);
    candidates.push({ index, activity, draft });
  });
  if (candidates.length === 0) return { ok: true, data: summarize() };

  // 2. The user's goal channels the batch targets. RLS limits this to their rows; the user_id filter
  //    says so out loud.
  const channelKeys = [...new Set(candidates.map((c) => c.activity.targetGoalChannel))];
  const { data: channelRows, error: channelError } = await supabase
    .from('goal_channels')
    .select('id, channel_key, status, start_date')
    .eq('user_id', userId)
    .in('channel_key', channelKeys);
  if (channelError) return { ok: false, error: 'Could not load your goals.' };
  const channels = new Map<string, ChannelRow>((channelRows as ChannelRow[]).map((c) => [c.channel_key, c]));

  // 3. Which of these the user already has a task for.
  const { data: existingRows, error: existingError } = await supabase
    .from('micro_tasks')
    .select('source_provider, source_external_id')
    .eq('user_id', userId)
    .in('source_provider', [...new Set(candidates.map((c) => c.activity.provider))])
    .in('source_external_id', candidates.map((c) => c.activity.externalId));
  if (existingError) return { ok: false, error: 'Could not check your existing tasks.' };
  const existing = new Set(
    existingRows.flatMap((r) => (r.source_provider && r.source_external_id ? [itemKey(r.source_provider, r.source_external_id)] : [])),
  );

  // 4. Place each one and create its task.
  for (const { index, activity, draft } of candidates) {
    if (existing.has(itemKey(activity.provider, activity.externalId))) {
      set(index, { outcome: 'duplicate' });
      continue;
    }
    const channel = channels.get(activity.targetGoalChannel);
    if (!channel) {
      set(index, { outcome: 'skipped', reason: 'no_matching_channel' });
      logSet(results[index]);
      continue;
    }
    if (channel.status !== 'active') {
      set(index, { outcome: 'skipped', reason: 'channel_not_active' });
      logSet(results[index]);
      continue;
    }
    const placement = placeInPlan(channel.start_date, activity.timestamp);
    if (!placement.ok) {
      set(index, { outcome: 'skipped', reason: placement.reason });
      logSet(results[index]);
      continue;
    }

    // Always unfinished: status is 'todo' and completed_at is not set. user_id is the verified session
    // user, and the channel is one of that user's own (the table's same-owner foreign key checks it too).
    const row: MicroTaskInsert = {
      user_id: userId,
      goal_channel_id: channel.id,
      title: draft.title,
      // The task types are career-plan oriented and have no workout type. A timed, dated item is
      // what 'event' means (NINETY_DAY_PLAN_CONTEXT.md §3), so every ingested activity is one.
      task_type: 'event',
      minutes: draft.minutes,
      status: 'todo',
      week_of: placement.week,
      due_date: placement.date,
      source_provider: activity.provider,
      source_external_id: activity.externalId,
      source_evidence: draft.evidence,
    };
    const { data, error } = await supabase.from('micro_tasks').insert(row).select('id').single();
    if (error) {
      // Another request created it between our check and our insert: the same activity, not a failure.
      if (error.code === UNIQUE_VIOLATION) {
        set(index, { outcome: 'duplicate' });
        continue;
      }
      set(index, { outcome: 'failed', reason: 'The task could not be saved.' });
      logSet(results[index]);
      continue;
    }
    set(index, { outcome: 'created', taskId: data.id, weekOf: placement.week });
  }

  return { ok: true, data: summarize() };
}
