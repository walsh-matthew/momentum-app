// Synced records become entries bound to a target (MOM-109, docs/DOMAIN_MODEL.md §1.5, §1.6). Server-side only.
//
// An adapter (Hevy) has already normalized a provider payload into an InboundActivityPayload. This module checks it
// against the contract, finds the target(s) the person bound that source to, and writes one entry per target.
// It never reads the payload's targetGoalChannel: the person's binding decides (principle: no hard-coded goal).
//
// What it will and will not do:
// - A record with no source, or a source with no bound target, makes no entry and says why. Nothing is guessed.
// - One raw record, one entry per bound target, keyed (target, source, the provider's own record id). A resync of
//   the same record is the same entry: it is updated if the provider changed it and left alone if not. Entries hold
//   the raw value; the scoreboard is computed from them (§1.7).
// - The person's word beats any source (principle 3). Corrections live in entry_corrections, keyed to the record id
//   with no foreign key to entries, and this module never reads, writes or deletes them: the service role has no
//   grant on that table, so a sync cannot undo one. It deletes no entry either (the service role cannot), so a
//   workout deleted in Hevy keeps its entry until the person removes it (BACKLOG.md).
// - It only suggests merges (listMergeSuggestions). Confirming one is the person's act, not this module's.
//
// Who runs as whom: the bindings (sources, target_sources, targets) are read through the signed-in person's own
// session, because the service role has no grant on targets. Entries are written with the service-role client,
// because a person's session can write only manual entries. That client BYPASSES row level security, so isolation is
// this code's job: every query filters on the user id from the verified session, every insert sets it, and the
// entries table's same-owner foreign keys refuse a target or source that belongs to someone else. A sync with no
// session at all (a webhook) cannot read targets yet: it needs a grant or a function under its own ticket (BACKLOG.md).

import { listHevyWorkouts } from '@/lib/adapters/hevy';
import type { AdapterDeps, AdapterFailure } from '@/lib/adapters/shared';
import { HEVY_SYNC_MESSAGES, describeHevySync } from '@/lib/integrations/hevySyncView';
import { suggestMerges, type MergeCandidate, type MergeSuggestion } from '@/lib/entries/mergeSuggestions';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, EntryRow, Measure } from '@/types/database.types';
import {
  SYNC_SKIP_MESSAGES,
  type SyncedEntryResult,
  type HevySyncView,
  type SyncedEntrySummary,
  type SyncOutcome,
  type SyncSkipReason,
} from '@/types/integrations';
import { InboundActivityPayloadSchema, MAX_ACTIVITIES_PER_BATCH } from './ingestion';
import { getAccessToken, isSyncOn, recordSyncFailure, recordSyncSuccess, type InboundActivityPayload, type SyncNotice } from './integrations';
import { runExclusive } from './personLock';
import type { ServiceResult } from './result';

type Db = SupabaseClient<Database>;

// Postgres error code for a unique violation.
const UNIQUE_VIOLATION = '23505';
// One sync reads at most this many pages of Hevy's 10 workouts, newest first.
export const MAX_SYNC_PAGES = 5;
// A suggestion looks back this far: an older duplicate is no longer worth asking about.
export const SUGGESTION_LOOKBACK_DAYS = 60;
const MS_PER_DAY = 86_400_000;
const LBS_PER_KG = 2.2046226218;

// ---------------------------------------------------------------------------
// What a record is worth to a target
// ---------------------------------------------------------------------------

export interface BoundTarget {
  id: string;
  measure: Measure;
  unit: string | null;
}

// A person's source for one provider and the targets they bound to it. `targets` is empty when none is bound.
export interface SourceBinding {
  sourceId: string;
  provider: string;
  targets: BoundTarget[];
}

export type EntryValue = { ok: true; value: number } | { ok: false; reason: SyncSkipReason };

const POUND_UNITS = new Set(['lb', 'lbs', 'pound', 'pounds']);
const KILOGRAM_UNITS = new Set(['kg', 'kgs', 'kilogram', 'kilograms']);
const SET_UNITS = new Set(['set', 'sets']);
const MINUTE_UNITS = new Set(['min', 'mins', 'minute', 'minutes']);

const round1 = (n: number) => Math.round(n * 10) / 10;

// What one workout adds to one target (docs/plans block 3.1, approved mapping): a count is 1, time is the duration in
// minutes, and a quantity is the metric its unit names. Choosing the metric from the unit text is a stopgap: the
// binding should name it (BACKLOG.md, MOM-111). A value of 0 or no value makes no entry (entries must be above 0).
export function entryValue(activity: InboundActivityPayload, target: Pick<BoundTarget, 'measure' | 'unit'>): EntryValue {
  const positive = (n: number | undefined): EntryValue =>
    typeof n === 'number' && Number.isFinite(n) && n > 0 ? { ok: true, value: n } : { ok: false, reason: 'no_value_for_measure' };

  switch (target.measure) {
    case 'count':
      return { ok: true, value: 1 };
    case 'time':
      return positive(activity.durationMinutes);
    case 'checklist':
      return { ok: false, reason: 'measure_not_supported' };
    case 'quantity': {
      const unit = (target.unit ?? '').trim().toLowerCase();
      if (POUND_UNITS.has(unit)) return positive(activity.metrics.volumeLbs);
      if (KILOGRAM_UNITS.has(unit)) {
        const lbs = activity.metrics.volumeLbs;
        return positive(typeof lbs === 'number' ? round1(lbs / LBS_PER_KG) : undefined);
      }
      if (SET_UNITS.has(unit)) return positive(activity.metrics.setsCompleted);
      if (MINUTE_UNITS.has(unit)) return positive(activity.durationMinutes);
      return { ok: false, reason: 'unit_not_supported' };
    }
  }
}

// What the source said, for the person to see why it counted, and for MOM-112 to read a qualifying size from.
function evidenceOf(activity: InboundActivityPayload): EntryRow['evidence'] {
  return JSON.parse(
    JSON.stringify({
      provider: activity.provider,
      activityType: activity.activityType,
      title: activity.title,
      durationMinutes: activity.durationMinutes,
      metrics: activity.metrics,
    }),
  ) as EntryRow['evidence'];
}

// Key order does not matter to jsonb, so it must not matter here.
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// ---------------------------------------------------------------------------
// Writing entries
// ---------------------------------------------------------------------------

function logSet(result: SyncedEntryResult): void {
  // Provider record id, target, outcome and reason only: never a title or a number the person logged.
  console.warn('[synced-entries] not counted', {
    outcome: result.outcome,
    externalId: result.externalId,
    targetId: result.targetId,
    reason: result.reason,
  });
}

function summarize(results: SyncedEntryResult[]): SyncedEntrySummary {
  const count = (outcome: SyncOutcome) => results.filter((r) => r.outcome === outcome).length;
  return {
    created: count('created'),
    updated: count('updated'),
    unchanged: count('unchanged'),
    skipped: count('skipped'),
    invalid: count('invalid'),
    failed: count('failed'),
    results,
  };
}

// Writes the entries for a batch of normalized activities. `db` is the service-role client and `userId` the verified
// user the batch is for; nothing below reads a user id from the payload. `binding` is null when the person has no
// source for the provider. Takes `unknown` because the batch comes from an adapter reading external JSON; each item
// is checked on its own, so one bad item does not hold up the rest.
export async function writeSyncedEntries(
  db: Db,
  userId: string,
  binding: SourceBinding | null,
  rawActivities: unknown,
): Promise<ServiceResult<SyncedEntrySummary>> {
  if (!Array.isArray(rawActivities)) return { ok: false, error: 'Invalid activity batch.' };
  if (rawActivities.length > MAX_ACTIVITIES_PER_BATCH) {
    return { ok: false, error: `Send at most ${MAX_ACTIVITIES_PER_BATCH} activities at a time.` };
  }

  const results: SyncedEntryResult[] = [];
  const add = (r: Omit<SyncedEntryResult, 'message'> & { message?: string | null }) => {
    const result = { message: null, ...r };
    results.push(result);
    if (result.outcome === 'skipped' || result.outcome === 'failed') logSet(result);
  };
  const skip = (index: number, externalId: string, targetId: string | null, reason: SyncSkipReason) =>
    add({ index, externalId, targetId, outcome: 'skipped', reason, message: SYNC_SKIP_MESSAGES[reason] });

  // 1. Validate each item.
  const candidates: Array<{ index: number; activity: InboundActivityPayload }> = [];
  const seen = new Set<string>();
  rawActivities.forEach((raw, index) => {
    const parsed = InboundActivityPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      // What was wrong, never the value.
      add({ index, externalId: null, targetId: null, outcome: 'invalid', reason: parsed.error.issues.map((i) => i.message).join(' ') });
      return;
    }
    const activity = parsed.data;
    // The same record twice in one batch is one record.
    if (seen.has(activity.externalId)) {
      add({ index, externalId: activity.externalId, targetId: null, outcome: 'unchanged', reason: null });
      return;
    }
    seen.add(activity.externalId);
    candidates.push({ index, activity });
  });

  // 2. A record with no source, or no target bound to it, makes no entry.
  const placeable = candidates.filter(({ index, activity }) => {
    if (!binding || activity.provider !== binding.provider) {
      skip(index, activity.externalId, null, 'no_source');
      return false;
    }
    if (binding.targets.length === 0) {
      skip(index, activity.externalId, null, 'no_bound_target');
      return false;
    }
    return true;
  });
  if (!binding || placeable.length === 0) return { ok: true, data: summarize(results.sort((a, b) => a.index - b.index)) };

  // 3. The entries this person's source already holds for these records.
  const { data: existingRows, error: existingError } = await db
    .from('entries')
    .select('id, target_id, source_record_id, occurred_at, value, evidence')
    .eq('user_id', userId)
    .eq('source_id', binding.sourceId)
    .in('source_record_id', placeable.map((c) => c.activity.externalId));
  if (existingError) return { ok: false, error: 'Could not check your existing entries.' };
  const existing = new Map(existingRows.map((r) => [`${r.target_id}\u0000${r.source_record_id}`, r]));

  // 4. One entry per bound target.
  for (const { index, activity } of placeable) {
    for (const target of binding.targets) {
      const amount = entryValue(activity, target);
      if (!amount.ok) {
        skip(index, activity.externalId, target.id, amount.reason);
        continue;
      }
      const evidence = evidenceOf(activity);
      const found = existing.get(`${target.id}\u0000${activity.externalId}`);

      if (found) {
        const same =
          Number(found.value) === amount.value &&
          Date.parse(found.occurred_at) === Date.parse(activity.timestamp) &&
          stable(found.evidence) === stable(evidence);
        if (same) {
          add({ index, externalId: activity.externalId, targetId: target.id, outcome: 'unchanged', reason: null });
          continue;
        }
        // The source changed the record. The entry follows; a correction is a separate row and is not touched.
        const { error } = await db
          .from('entries')
          .update({ occurred_at: activity.timestamp, value: amount.value, evidence })
          .eq('id', found.id)
          .eq('user_id', userId);
        if (error) {
          add({ index, externalId: activity.externalId, targetId: target.id, outcome: 'failed', reason: null, message: 'The entry could not be saved.' });
          continue;
        }
        add({ index, externalId: activity.externalId, targetId: target.id, outcome: 'updated', reason: null });
        continue;
      }

      const { error } = await db.from('entries').insert({
        user_id: userId,
        target_id: target.id,
        source_id: binding.sourceId,
        source_record_id: activity.externalId,
        occurred_at: activity.timestamp,
        value: amount.value,
        evidence,
      });
      if (error) {
        // Another sync created it between our check and our insert: the same record, not a failure.
        if (error.code === UNIQUE_VIOLATION) {
          add({ index, externalId: activity.externalId, targetId: target.id, outcome: 'unchanged', reason: null });
          continue;
        }
        add({ index, externalId: activity.externalId, targetId: target.id, outcome: 'failed', reason: null, message: 'The entry could not be saved.' });
        continue;
      }
      add({ index, externalId: activity.externalId, targetId: target.id, outcome: 'created', reason: null });
    }
  }

  return { ok: true, data: summarize(results.sort((a, b) => a.index - b.index)) };
}

// ---------------------------------------------------------------------------
// Finding the person's binding (read through their own session)
// ---------------------------------------------------------------------------

// The person's source for `provider` and the targets they bound to it, or null when they have no such source.
export async function loadSourceBinding(db: Db, userId: string, provider: string): Promise<ServiceResult<SourceBinding | null>> {
  const { data: source, error: sourceError } = await db
    .from('sources')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();
  if (sourceError) return { ok: false, error: 'Could not load your sources.' };
  if (!source) return { ok: true, data: null };

  const { data: links, error: linkError } = await db
    .from('target_sources')
    .select('target_id')
    .eq('user_id', userId)
    .eq('source_id', source.id);
  if (linkError) return { ok: false, error: 'Could not load your targets.' };
  if (links.length === 0) return { ok: true, data: { sourceId: source.id, provider, targets: [] } };

  const { data: targets, error: targetError } = await db
    .from('targets')
    .select('id, measure, unit')
    .eq('user_id', userId)
    .in('id', links.map((l) => l.target_id));
  if (targetError) return { ok: false, error: 'Could not load your targets.' };
  return {
    ok: true,
    data: { sourceId: source.id, provider, targets: targets.map((t) => ({ id: t.id, measure: t.measure, unit: t.unit })) },
  };
}

// ---------------------------------------------------------------------------
// Syncing Hevy
// ---------------------------------------------------------------------------

export type HevySyncStatus = 'synced' | 'sync_off' | 'failed';

export interface HevySyncResult {
  status: HevySyncStatus;
  // What was written. Null when nothing was fetched. Partial when a later page failed.
  entries: SyncedEntrySummary | null;
  // Why Hevy could not be read, with fixed words.
  failure: AdapterFailure | null;
  // 'raised' once, on the sync that finds a working source failing for a reason only the person can fix.
  notice: SyncNotice;
}

export interface HevySyncDeps extends AdapterDeps {
  maxPages?: number;
}

// Syncs the signed-in person's Hevy workouts into entries. The person's key comes from the integrations service;
// nothing here reads an environment variable or calls Hevy except through the adapter.
export async function syncHevyEntries(deps: HevySyncDeps = {}): Promise<ServiceResult<HevySyncResult>> {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return { ok: false, error: 'Sign in to sync your workouts.' };
  const userId = auth.user.id;

  const on = await isSyncOn('hevy');
  if (!on.ok) return on;
  if (!on.data) return { ok: true, data: { status: 'sync_off', entries: null, failure: null, notice: 'none' } };

  const binding = await loadSourceBinding(supabase as unknown as Db, userId, 'hevy');
  if (!binding.ok) return binding;

  // A key that cannot be had is not a notice: the connection page already says the app needs connecting.
  const token = await getAccessToken(userId, 'hevy', { now: deps.now });
  if (!token.ok) return { ok: false, error: token.error };

  const activities: InboundActivityPayload[] = [];
  const rejected: string[] = [];
  let failure: AdapterFailure | null = null;
  const maxPages = deps.maxPages ?? MAX_SYNC_PAGES;
  for (let page = 1; page <= maxPages; page += 1) {
    const answer = await listHevyWorkouts(token.data.value, { page }, deps);
    if (!answer.ok) {
      failure = answer.reason;
      break;
    }
    activities.push(...answer.data.activities);
    rejected.push(...answer.data.rejected.map((r) => r.reason));
    if (answer.data.page >= answer.data.pageCount) break;
  }

  let entries: SyncedEntrySummary | null = null;
  if (activities.length > 0 || rejected.length > 0) {
    const written = await writeSyncedEntries(createSupabaseAdminClient() as unknown as Db, userId, binding.data, activities);
    if (!written.ok) return written;
    entries = written.data;
    // Workouts the adapter could not read are reported, not dropped.
    rejected.forEach((reason) => {
      entries!.results.push({ index: -1, externalId: null, targetId: null, outcome: 'invalid', reason, message: null });
      entries!.invalid += 1;
    });
  }

  if (failure) {
    const notice = await recordSyncFailure(userId, 'hevy', failure);
    return { ok: true, data: { status: 'failed', entries, failure, notice } };
  }
  await recordSyncSuccess(userId, 'hevy', (deps.now ?? (() => new Date()))());
  return { ok: true, data: { status: 'synced', entries, failure: null, notice: 'none' } };
}

// The "Sync now" button's service (MOM-129): one sync at a time per person (services/personLock.ts), returned as
// plain words for the card.
export async function runHevySync(deps: HevySyncDeps = {}): Promise<ServiceResult<HevySyncView>> {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return { ok: false, error: 'Sign in to sync your workouts.' };

  const done = await runExclusive(auth.user.id, async (): Promise<ServiceResult<HevySyncView>> => {
    const result = await syncHevyEntries(deps);
    return result.ok ? { ok: true, data: describeHevySync(result.data) } : result;
  });
  return done ?? { ok: true, data: { kind: 'busy', message: HEVY_SYNC_MESSAGES.busy, added: 0, updated: 0 } };
}

// ---------------------------------------------------------------------------
// Merge suggestions (read through the person's own session)
// ---------------------------------------------------------------------------

export interface SuggestionDeps {
  now?: () => Date;
}

// The merges Momentum would suggest for the signed-in person: one per group of possible duplicates. It changes
// nothing. The person decides; MOM-112 shows these.
export async function listMergeSuggestions(deps: SuggestionDeps = {}): Promise<ServiceResult<MergeSuggestion[]>> {
  const supabase = (await createSupabaseServerClient()) as unknown as Db;
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return { ok: false, error: 'Sign in to see your suggestions.' };
  const userId = auth.user.id;
  const since = new Date((deps.now ?? (() => new Date()))().getTime() - SUGGESTION_LOOKBACK_DAYS * MS_PER_DAY).toISOString();

  const [entries, sources, corrections, targets] = await Promise.all([
    supabase
      .from('entries')
      .select('id, target_id, source_id, source_record_id, occurred_at, value')
      .eq('user_id', userId)
      .gte('occurred_at', since),
    supabase.from('sources').select('id, kind').eq('user_id', userId),
    supabase.from('entry_corrections').select('source_id, source_record_id').eq('user_id', userId).eq('action', 'hide'),
    supabase.from('targets').select('id, measure').eq('user_id', userId),
  ]);
  if (entries.error || sources.error || corrections.error || targets.error) {
    return { ok: false, error: 'Could not load your entries.' };
  }

  const kindOf = new Map(sources.data.map((s) => [s.id, s.kind]));
  const hidden = new Set(corrections.data.map((c) => `${c.source_id}\u0000${c.source_record_id}`));
  const candidates: MergeCandidate[] = entries.data.flatMap((e) => {
    const sourceKind = kindOf.get(e.source_id);
    if (!sourceKind) return [];
    return [
      {
        id: e.id,
        targetId: e.target_id,
        sourceId: e.source_id,
        sourceKind,
        occurredAt: e.occurred_at,
        value: Number(e.value),
        hidden: hidden.has(`${e.source_id}\u0000${e.source_record_id}`),
      },
    ];
  });
  return { ok: true, data: suggestMerges(candidates, new Map(targets.data.map((t) => [t.id, t.measure]))) };
}
