// Hevy workouts become entries bound to a target (lib/services/syncedEntries.ts, MOM-109, docs/DOMAIN_MODEL.md
// §1.5, §1.6). The service role has no grant on targets or entry_corrections and cannot delete, so these tests run
// against a fake that enforces the grants of migration 013 and show the sync keeps to them: it never reaches a
// correction, so a resync cannot undo one, and one person's sync never touches another's rows.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeHevyWorkout } from '@/lib/adapters/hevy';
import { InboundActivityPayloadSchema } from '@/lib/services/ingestion';
import type { InboundActivityPayload } from '@/lib/services/integrations';
import {
  MAX_SYNC_PAGES,
  SUGGESTION_LOOKBACK_DAYS,
  entryValue,
  listMergeSuggestions,
  loadSourceBinding,
  syncHevyEntries,
  writeSyncedEntries,
  type SourceBinding,
} from '@/lib/services/syncedEntries';
import { SYNC_SKIP_MESSAGES } from '@/types/integrations';
import { USER_A, USER_B, idb, resetIdb, seedConnection } from './helpers/fakeIntegrations';
import {
  bind,
  createSupabaseAdminClient,
  createSupabaseServerClient,
  gm,
  resetGm,
  seedEntry,
  seedSource,
  seedTarget,
} from './helpers/fakeGoalModel';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeGoalModel');
  return { createSupabaseServerClient };
});
vi.mock('@/lib/supabase/admin', async () => {
  const { createSupabaseAdminClient } = await import('./helpers/fakeGoalModel');
  return { createSupabaseAdminClient };
});
vi.mock('@/lib/config/env', () => ({ getGoogleOAuthEnv: () => ({}) }));

type Row = Record<string, unknown>;
type Db = Parameters<typeof writeSyncedEntries>[0];

const root = join(__dirname, '..');
const fixture = JSON.parse(readFileSync(join(root, 'tests/fixtures/hevy-workouts.redacted.json'), 'utf8')) as {
  workouts: Array<Record<string, unknown>>;
};
const WORKOUT = fixture.workouts[0];
const WORKOUT_ID = WORKOUT.id as string;
const END_TIME = '2026-10-19T18:12:38.000Z';
const HEVY_KEY = '12345678-1234-4234-8234-123456789012';

function activityOf(raw: Record<string, unknown> = WORKOUT, options = {}): InboundActivityPayload {
  const result = normalizeHevyWorkout(raw, options);
  if (!result.ok) throw new Error(result.reason);
  return result.data;
}
const activity = (over: Partial<InboundActivityPayload> = {}) => ({ ...activityOf(), ...over });
const workout = (id: string, over: Record<string, unknown> = {}) => ({ ...WORKOUT, id, ...over });

const admin = () => createSupabaseAdminClient() as unknown as Db;
const session = () => createSupabaseServerClient() as unknown as Promise<Db>;

// A person with a Hevy source and one target per given shape, all bound to it.
function person(userId: string, targets: Array<Row> = [{ measure: 'count' }]) {
  const source = seedSource(userId);
  const made = targets.map((t) => {
    const target = seedTarget(userId, t);
    bind(userId, target, source);
    return target;
  });
  return { source, targets: made };
}

async function bindingFor(userId: string): Promise<SourceBinding | null> {
  idb.user = { id: userId };
  const found = await loadSourceBinding(await session(), userId, 'hevy');
  if (!found.ok) throw new Error(found.error);
  return found.data;
}

async function write(userId: string, batch: unknown, binding?: SourceBinding | null) {
  const b = binding === undefined ? await bindingFor(userId) : binding;
  const r = await writeSyncedEntries(admin(), userId, b, batch);
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetIdb();
  resetGm();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

describe('what a workout is worth to a target', () => {
  const a = activity();

  it('the fixture normalizes to the numbers the mapping uses', () => {
    expect(a.durationMinutes).toBe(44.07);
    expect(a.metrics.setsCompleted).toBe(18);
    expect(a.metrics.volumeLbs).toBeGreaterThan(0);
    expect(a.timestamp).toBe(END_TIME);
  });

  it('a count is 1, whatever the workout holds', () => {
    expect(entryValue(a, { measure: 'count', unit: null })).toEqual({ ok: true, value: 1 });
  });

  it('time is the duration in minutes', () => {
    expect(entryValue(a, { measure: 'time', unit: null })).toEqual({ ok: true, value: 44.07 });
  });

  it('a quantity is the metric its unit names', () => {
    const lbs = a.metrics.volumeLbs as number;
    for (const unit of ['lb', 'lbs', 'pounds', ' LBS ']) {
      expect(entryValue(a, { measure: 'quantity', unit })).toEqual({ ok: true, value: lbs });
    }
    for (const unit of ['kg', 'Kilograms']) {
      expect(entryValue(a, { measure: 'quantity', unit })).toEqual({ ok: true, value: Math.round((lbs / 2.2046226218) * 10) / 10 });
    }
    expect(entryValue(a, { measure: 'quantity', unit: 'sets' })).toEqual({ ok: true, value: 18 });
    expect(entryValue(a, { measure: 'quantity', unit: 'minutes' })).toEqual({ ok: true, value: 44.07 });
  });

  it('a unit it cannot read, or a checklist, makes no entry and says which rule', () => {
    expect(entryValue(a, { measure: 'quantity', unit: 'km' })).toEqual({ ok: false, reason: 'unit_not_supported' });
    expect(entryValue(a, { measure: 'quantity', unit: null })).toEqual({ ok: false, reason: 'unit_not_supported' });
    expect(entryValue(a, { measure: 'checklist', unit: null })).toEqual({ ok: false, reason: 'measure_not_supported' });
  });

  it('a workout with nothing to count for the target makes no entry (entries must be above zero)', () => {
    const bodyweight = activity({ metrics: { volumeLbs: 0, setsCompleted: 0 }, durationMinutes: 0 });
    for (const target of [
      { measure: 'quantity' as const, unit: 'lbs' },
      { measure: 'quantity' as const, unit: 'kg' },
      { measure: 'quantity' as const, unit: 'sets' },
      { measure: 'time' as const, unit: null },
    ]) {
      expect(entryValue(bodyweight, target)).toEqual({ ok: false, reason: 'no_value_for_measure' });
    }
    const noMetrics = activity({ metrics: {} });
    expect(entryValue(noMetrics, { measure: 'quantity', unit: 'lbs' })).toEqual({ ok: false, reason: 'no_value_for_measure' });
    expect(entryValue(noMetrics, { measure: 'quantity', unit: 'kg' })).toEqual({ ok: false, reason: 'no_value_for_measure' });
  });
});

// ---------------------------------------------------------------------------
// Writing entries
// ---------------------------------------------------------------------------

describe('a workout becomes one entry per bound target', () => {
  it('writes the fixture workout to each target the person bound, as raw values with the source record id', async () => {
    const { source, targets } = person(USER_A, [{ measure: 'count' }, { measure: 'time' }, { measure: 'quantity', unit: 'lbs' }]);
    const summary = await write(USER_A, [activityOf()]);

    expect(summary).toMatchObject({ created: 3, updated: 0, unchanged: 0, skipped: 0, invalid: 0, failed: 0 });
    expect(gm.entries).toHaveLength(3);
    const byTarget = new Map(gm.entries.map((e) => [e.target_id, e]));
    expect(byTarget.get(targets[0].id)?.value).toBe(1);
    expect(byTarget.get(targets[1].id)?.value).toBe(44.07);
    expect(byTarget.get(targets[2].id)?.value).toBe(activityOf().metrics.volumeLbs);
    for (const e of gm.entries) {
      expect(e).toMatchObject({ user_id: USER_A, source_id: source.id, source_record_id: WORKOUT_ID });
      expect(Date.parse(e.occurred_at as string)).toBe(Date.parse(END_TIME));
      expect(e.evidence).toMatchObject({ provider: 'hevy', activityType: 'strength_workout', title: 'Upper A (Heavy Bench)', durationMinutes: 44.07 });
    }
  });

  it('never reads the goal channel in the payload: the person’s binding decides', async () => {
    const { targets } = person(USER_A);
    await write(USER_A, [activity({ targetGoalChannel: 'something_else_entirely' }), { ...activity({ externalId: 'w2' }), targetGoalChannel: 'physical_fitness' }]);
    expect(gm.entries.map((e) => e.target_id)).toEqual([targets[0].id, targets[0].id]);
  });

  it('a workout bound to no target creates no entry and says why', async () => {
    person(USER_A, []);
    const summary = await write(USER_A, [activityOf()]);
    expect(gm.entries).toEqual([]);
    expect(summary.skipped).toBe(1);
    expect(summary.results[0]).toMatchObject({ outcome: 'skipped', reason: 'no_bound_target', targetId: null, message: SYNC_SKIP_MESSAGES.no_bound_target });
    expect(gm.adminWrites).toEqual([]);
  });

  it('a person with no source for the app gets no entry and a reason too', async () => {
    const summary = await write(USER_A, [activityOf()]);
    expect(gm.entries).toEqual([]);
    expect(summary.results[0]).toMatchObject({ outcome: 'skipped', reason: 'no_source', message: SYNC_SKIP_MESSAGES.no_source });
  });

  it('a source for another app does not take a Hevy workout', async () => {
    const source = seedSource(USER_A, { provider: 'google_calendar' });
    bind(USER_A, seedTarget(USER_A), source);
    const binding = await bindingFor(USER_A);
    const summary = await write(USER_A, [activityOf()], binding);
    expect(gm.entries).toEqual([]);
    expect(summary.results[0].reason).toBe('no_source');
  });

  it('each target decides on its own: one counts, one skips with its reason', async () => {
    const { targets } = person(USER_A, [{ measure: 'count' }, { measure: 'quantity', unit: 'km' }, { measure: 'checklist' }]);
    const summary = await write(USER_A, [activityOf()]);
    expect(summary).toMatchObject({ created: 1, skipped: 2 });
    expect(gm.entries.map((e) => e.target_id)).toEqual([targets[0].id]);
    expect(summary.results.filter((r) => r.outcome === 'skipped').map((r) => [r.targetId, r.reason])).toEqual([
      [targets[1].id, 'unit_not_supported'],
      [targets[2].id, 'measure_not_supported'],
    ]);
  });

  it('every skip is logged with ids and reason only', async () => {
    person(USER_A, []);
    await write(USER_A, [activityOf()]);
    expect(warn).toHaveBeenCalledWith('[synced-entries] not counted', { outcome: 'skipped', externalId: WORKOUT_ID, targetId: null, reason: 'no_bound_target' });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('Upper A');
  });
});

describe('a resync keeps every correction', () => {
  it('writes nothing when nothing changed', async () => {
    person(USER_A);
    await write(USER_A, [activityOf()]);
    const before = JSON.stringify(gm.entries);
    gm.adminWrites = [];

    const again = await write(USER_A, [activityOf()]);
    expect(again).toMatchObject({ created: 0, updated: 0, unchanged: 1 });
    expect(gm.adminWrites).toEqual([]);
    expect(JSON.stringify(gm.entries)).toBe(before);
  });

  it('follows the source when Hevy changed the workout, on the same entry', async () => {
    person(USER_A, [{ measure: 'time' }]);
    await write(USER_A, [activityOf()]);
    const id = gm.entries[0].id;

    const edited = activityOf(workout(WORKOUT_ID, { end_time: '2026-10-19T18:30:38+00:00' }));
    const again = await write(USER_A, [edited]);
    expect(again).toMatchObject({ created: 0, updated: 1 });
    expect(gm.entries).toHaveLength(1);
    expect(gm.entries[0]).toMatchObject({ id, value: 62.07 });
    expect(Date.parse(gm.entries[0].occurred_at as string)).toBe(Date.parse('2026-10-19T18:30:38Z'));
  });

  it('never touches a correction: the sync has no way to reach that table', async () => {
    const { source } = person(USER_A);
    await write(USER_A, [activityOf()]);
    // The person removes the workout, and counts another anyway, from their own session.
    idb.user = { id: USER_A };
    const s = await session();
    expect((await s.from('entry_corrections').insert({ user_id: USER_A, source_id: source.id, source_record_id: WORKOUT_ID, action: 'hide' }).select('id').single()).error).toBeNull();
    expect((await s.from('entry_corrections').insert({ user_id: USER_A, source_id: source.id, source_record_id: 'w-other', action: 'count_anyway' }).select('id').single()).error).toBeNull();
    const corrections = JSON.stringify(gm.corrections);
    gm.adminTables = [];

    // A resync with a changed workout, an unchanged one and a new one.
    await write(USER_A, [activityOf(workout(WORKOUT_ID, { end_time: '2026-10-19T19:00:00+00:00' })), activity({ externalId: 'w-other' }), activity({ externalId: 'w-new' })]);

    expect(JSON.stringify(gm.corrections)).toBe(corrections);
    expect(gm.adminTables).not.toContain('entry_corrections');
    expect(gm.adminWrites.every((w) => w.table === 'entries')).toBe(true);
  });

  it('a correction still applies when the entry is recreated under a new id', async () => {
    const { source, targets } = person(USER_A);
    await write(USER_A, [activityOf()]);
    idb.user = { id: USER_A };
    await (await session()).from('entry_corrections').insert({ user_id: USER_A, source_id: source.id, source_record_id: WORKOUT_ID, action: 'hide' });
    // The person also tapped once at about the same time.
    seedSource(USER_A, { kind: 'manual', provider: null, label: 'Taps' });
    const manualSource = gm.sources[1];
    seedEntry({ user_id: USER_A, target_id: targets[0].id, source_id: manualSource.id, source_record_id: 'tap-1', occurred_at: '2026-10-19T18:20:00Z', value: 1 });

    // Entries recreated from scratch by a resync.
    const oldId = gm.entries[0].id;
    gm.entries.splice(0, 1);
    await write(USER_A, [activityOf()]);
    expect(gm.entries.find((e) => e.source_record_id === WORKOUT_ID)?.id).not.toBe(oldId);

    // The hidden workout is still out of the question, so there is nothing to suggest.
    const out = await listMergeSuggestions({ now: () => new Date('2026-10-20T00:00:00Z') });
    expect(out).toEqual({ ok: true, data: [] });
  });

  it('keeps the entry of a workout deleted in Hevy: the sync cannot delete', async () => {
    person(USER_A);
    await write(USER_A, [activityOf(), activity({ externalId: 'w2' })]);
    await write(USER_A, [activity({ externalId: 'w2' })]);
    expect(gm.entries.map((e) => e.source_record_id).sort()).toEqual([WORKOUT_ID, 'w2'].sort());
  });
});

describe('the batch', () => {
  it('refuses a non-array and an oversized batch', async () => {
    person(USER_A);
    const binding = await bindingFor(USER_A);
    expect(await writeSyncedEntries(admin(), USER_A, binding, 'nope')).toEqual({ ok: false, error: 'Invalid activity batch.' });
    const big = await writeSyncedEntries(admin(), USER_A, binding, Array.from({ length: 101 }, () => activity()));
    expect(big.ok).toBe(false);
    expect(gm.entries).toEqual([]);
  });

  it('an invalid item is reported by what was wrong and does not hold up the rest', async () => {
    person(USER_A);
    const summary = await write(USER_A, [{ ...activity(), userId: USER_B }, 'junk', activity({ externalId: 'ok' })]);
    expect(summary).toMatchObject({ invalid: 2, created: 1 });
    expect(summary.results.map((r) => r.index)).toEqual([0, 1, 2]);
    expect(JSON.stringify(summary)).not.toContain(USER_B);
    expect(gm.entries.map((e) => e.source_record_id)).toEqual(['ok']);
  });

  it('the same record twice in one batch is one entry', async () => {
    person(USER_A);
    const summary = await write(USER_A, [activity(), activity()]);
    expect(summary).toMatchObject({ created: 1, unchanged: 1 });
    expect(gm.entries).toHaveLength(1);
  });

  it('a save that fails is reported as failed, with fixed words, and can be sent again', async () => {
    person(USER_A);
    const binding = await bindingFor(USER_A);
    const bad = await write(USER_A, [{ ...activity(), metrics: { setsCompleted: 3 }, durationMinutes: 10 }], { ...binding!, sourceId: 'no-such-source' });
    expect(bad.failed).toBe(1);
    expect(bad.results[0].message).toBe('The entry could not be saved.');
    expect(JSON.stringify(bad)).not.toContain('foreign key');
    const good = await write(USER_A, [activity()], binding);
    expect(good.created).toBe(1);
  });

  it('a concurrent sync winning the race counts as the same record, not a failure', async () => {
    const { source, targets } = person(USER_A);
    const binding = await bindingFor(USER_A);
    const db = admin();
    // The other sync inserts after our lookup and before our insert.
    const realFrom = db.from.bind(db);
    let raced = false;
    (db as unknown as { from: (t: string) => unknown }).from = (table: string) => {
      const q = realFrom(table as never) as unknown as { insert: (r: Row) => unknown };
      if (table === 'entries') {
        const insert = q.insert.bind(q);
        q.insert = (row: Row) => {
          if (!raced) {
            raced = true;
            seedEntry({ ...row, user_id: USER_A, id: 'winner' });
          }
          return insert(row);
        };
      }
      return q;
    };
    const r = await writeSyncedEntries(db, USER_A, binding, [activityOf()]);
    expect(r).toMatchObject({ ok: true, data: { unchanged: 1, failed: 0 } });
    expect(gm.entries).toHaveLength(1);
    expect(gm.entries[0]).toMatchObject({ source_id: source.id, target_id: targets[0].id });
  });
});

describe('one person’s sync never touches another’s rows', () => {
  it('writes only the given person’s entries and leaves the other’s alone, even for the same workout id', async () => {
    const a = person(USER_A);
    const b = person(USER_B);
    const bEntry = seedEntry({ user_id: USER_B, target_id: b.targets[0].id, source_id: b.source.id, source_record_id: WORKOUT_ID, occurred_at: '2026-10-01T00:00:00Z', value: 1 });
    const before = JSON.stringify(bEntry);

    const summary = await write(USER_A, [activityOf()]);
    expect(summary.created).toBe(1);
    expect(gm.entries.filter((e) => e.user_id === USER_A)).toHaveLength(1);
    expect(gm.entries.find((e) => e.user_id === USER_A)).toMatchObject({ target_id: a.targets[0].id, source_id: a.source.id });
    expect(JSON.stringify(gm.entries.find((e) => e.id === bEntry.id))).toBe(before);
  });

  it('refuses a target or source that belongs to someone else, whatever it is told', async () => {
    person(USER_A);
    const b = person(USER_B);
    const stolen: SourceBinding = { sourceId: b.source.id as string, provider: 'hevy', targets: [{ id: b.targets[0].id as string, measure: 'count', unit: null }] };
    const summary = await write(USER_A, [activityOf()], stolen);
    expect(summary).toMatchObject({ created: 0, failed: 1 });
    expect(gm.entries).toEqual([]);
  });

  it('reads bindings through the signed-in person: another person’s source, targets and links are invisible', async () => {
    const b = person(USER_B, [{ measure: 'time' }]);
    expect(await bindingFor(USER_A)).toBeNull();
    const bBinding = await bindingFor(USER_B);
    expect(bBinding).toMatchObject({ sourceId: b.source.id, targets: [{ id: b.targets[0].id, measure: 'time' }] });
  });
});

// ---------------------------------------------------------------------------
// Syncing Hevy
// ---------------------------------------------------------------------------

const page = (workouts: unknown[], p = 1, count = 1) => new Response(JSON.stringify({ page: p, page_count: count, workouts }), { status: 200 });
const respond = (...queue: Array<Response | Error>) =>
  vi.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error('unexpected request');
    if (next instanceof Error) throw next;
    return next;
  });

function connected(userId = USER_A, over: Row = {}) {
  idb.user = { id: userId };
  return seedConnection(userId, 'hevy', { auth_type: 'api_key', api_key: HEVY_KEY, ...over });
}
const credential = (userId = USER_A) => idb.creds.find((c) => c.user_id === userId && c.provider === 'hevy')!;

describe('syncing Hevy', () => {
  it('fetches with the person’s own key and writes their entries', async () => {
    connected();
    person(USER_A);
    const fetch = respond(page([WORKOUT]));
    const r = await syncHevyEntries({ fetch: fetch as unknown as typeof globalThis.fetch, now: () => new Date('2026-10-20T00:00:00Z') });

    expect(r).toMatchObject({ ok: true, data: { status: 'synced', failure: null, notice: 'none', entries: { created: 1 } } });
    expect(gm.entries).toHaveLength(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(url).toContain('/v1/workouts?page=1');
    expect(init.headers['api-key']).toBe(HEVY_KEY);
    expect(idb.apps[0].last_synced_at).toBe('2026-10-20T00:00:00.000Z');
  });

  it('reads up to the page limit and stops at the last page', async () => {
    connected();
    person(USER_A);
    const fetch = respond(page([workout('w1')], 1, 2), page([workout('w2')], 2, 2));
    const r = await syncHevyEntries({ fetch: fetch as unknown as typeof globalThis.fetch });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(r.ok && r.data.entries?.created).toBe(2);

    const many = respond(...Array.from({ length: 9 }, (_, i) => page([workout(`m${i}`)], i + 1, 111)));
    await syncHevyEntries({ fetch: many as unknown as typeof globalThis.fetch });
    expect(many).toHaveBeenCalledTimes(MAX_SYNC_PAGES);
  });

  it('with no target bound, fetches, makes no entry and says why for each workout', async () => {
    connected();
    person(USER_A, []);
    const r = await syncHevyEntries({ fetch: respond(page([WORKOUT])) as unknown as typeof globalThis.fetch });
    expect(gm.entries).toEqual([]);
    expect(r).toMatchObject({ ok: true, data: { status: 'synced', entries: { skipped: 1 } } });
    expect(r.ok && r.data.entries?.results[0].message).toBe(SYNC_SKIP_MESSAGES.no_bound_target);
  });

  it('a workout the adapter could not read is reported, not dropped', async () => {
    connected();
    person(USER_A);
    const r = await syncHevyEntries({ fetch: respond(page([WORKOUT, { id: 'broken' }])) as unknown as typeof globalThis.fetch });
    expect(r).toMatchObject({ ok: true, data: { entries: { created: 1, invalid: 1 } } });
  });

  it('does nothing and calls nobody when syncing is switched off', async () => {
    connected();
    idb.apps[0].is_active = false;
    person(USER_A);
    const fetch = respond();
    const r = await syncHevyEntries({ fetch: fetch as unknown as typeof globalThis.fetch });
    expect(r).toEqual({ ok: true, data: { status: 'sync_off', entries: null, failure: null, notice: 'none' } });
    expect(fetch).not.toHaveBeenCalled();
    expect(gm.entries).toEqual([]);
  });

  it('refuses when signed out, and when the app is not connected', async () => {
    expect((await syncHevyEntries()).ok).toBe(false);
    idb.user = { id: USER_A };
    const fetch = respond();
    const r = await syncHevyEntries({ fetch: fetch as unknown as typeof globalThis.fetch });
    expect(r.ok && r.data.status).toBe('sync_off');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('syncs only the signed-in person, even when another has the same workout', async () => {
    connected(USER_A);
    seedConnection(USER_B, 'hevy', { auth_type: 'api_key', api_key: HEVY_KEY });
    person(USER_A);
    const b = person(USER_B);
    idb.user = { id: USER_A };
    await syncHevyEntries({ fetch: respond(page([WORKOUT])) as unknown as typeof globalThis.fetch });
    expect(gm.entries.map((e) => e.user_id)).toEqual([USER_A]);
    expect(gm.entries.some((e) => e.source_id === b.source.id)).toBe(false);
  });
});

describe('a failing source gets one notice, then stays quiet until it is fixed', () => {
  const run = async (...queue: Array<Response | Error>) => {
    const r = await syncHevyEntries({ fetch: respond(...queue) as unknown as typeof globalThis.fetch });
    if (!r.ok) throw new Error(r.error);
    return r.data;
  };

  beforeEach(() => {
    connected();
    person(USER_A);
  });

  it('a refused key raises one notice and marks the connection', async () => {
    const first = await run(new Response('{}', { status: 401 }));
    expect(first).toMatchObject({ status: 'failed', failure: 'unauthorized', notice: 'raised', entries: null });
    expect(credential()).toMatchObject({ status: 'needs_reauth', last_error: 'The provider refused the key.' });
  });

  it('then stays quiet: the next sync does not even call Hevy, and says nothing new', async () => {
    await run(new Response('{}', { status: 403 }));
    const fetch = respond();
    const again = await syncHevyEntries({ fetch: fetch as unknown as typeof globalThis.fetch });
    expect(again.ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(credential().status).toBe('needs_reauth');
  });

  it('another kind of failure raises one notice, repeats quietly, and clears when a sync works again', async () => {
    expect(await run(new Response('{}', { status: 400 }))).toMatchObject({ failure: 'bad_response', notice: 'raised' });
    expect(credential().status).toBe('error');
    expect(await run(new Response('{}', { status: 400 }))).toMatchObject({ status: 'failed', notice: 'none' });
    expect(await run(new Response('not json', { status: 200 }))).toMatchObject({ notice: 'none' });
    expect(credential().status).toBe('error');

    expect(await run(page([WORKOUT]))).toMatchObject({ status: 'synced', notice: 'none' });
    expect(credential()).toMatchObject({ status: 'connected', last_error: null });

    // Fixed, then broken again: a new notice.
    expect(await run(new Response('{}', { status: 400 }))).toMatchObject({ notice: 'raised' });
  });

  it('a transient failure changes nothing and raises nothing', async () => {
    for (const answer of [new Response('', { status: 500 }), new Response('', { status: 503 }), new Response('', { status: 429 }), new Error('network down')]) {
      const r = await run(answer);
      expect(r).toMatchObject({ status: 'failed', notice: 'none' });
      expect(['unavailable', 'rate_limited']).toContain(r.failure);
      expect(credential()).toMatchObject({ status: 'connected', last_error: null });
    }
  });

  it('a transient failure never clears or replaces a failing state', async () => {
    await run(new Response('{}', { status: 400 }));
    await run(new Response('', { status: 500 }));
    expect(credential().status).toBe('error');
  });

  it('a refused key replaces a plain error without a second notice', async () => {
    await run(new Response('{}', { status: 400 }));
    const r = await run(new Response('{}', { status: 401 }));
    expect(r).toMatchObject({ failure: 'unauthorized', notice: 'none' });
    expect(credential().status).toBe('needs_reauth');
  });

  it('a later page failing keeps what the earlier pages wrote, and still reports the failure once', async () => {
    const r = await run(page([workout('w1')], 1, 3), new Response('{}', { status: 400 }));
    expect(r).toMatchObject({ status: 'failed', failure: 'bad_response', notice: 'raised', entries: { created: 1 } });
    expect(gm.entries.map((e) => e.source_record_id)).toEqual(['w1']);
  });

  it('puts no provider text or key in the stored message', async () => {
    await run(new Response(JSON.stringify({ error: 'bad key 12345678-1234' }), { status: 401 }));
    expect(String(credential().last_error)).not.toContain('12345678');
  });
});

// ---------------------------------------------------------------------------
// Merge suggestions
// ---------------------------------------------------------------------------

describe('merge suggestions', () => {
  const NOW = () => new Date('2026-10-20T00:00:00Z');

  function twoRecords(userId = USER_A) {
    const { source, targets } = person(userId);
    const manual = seedSource(userId, { kind: 'manual', provider: null, label: 'Taps' });
    const synced = seedEntry({ user_id: userId, target_id: targets[0].id, source_id: source.id, source_record_id: WORKOUT_ID, occurred_at: END_TIME, value: 1 });
    const tap = seedEntry({ user_id: userId, target_id: targets[0].id, source_id: manual.id, source_record_id: 'tap-1', occurred_at: '2026-10-19T19:00:00Z', value: 1 });
    return { source, manual, synced, tap, target: targets[0] };
  }

  it('a manual entry and a synced record of the same workout give exactly one suggestion and no merge', async () => {
    const { synced, tap, target, source } = twoRecords();
    idb.user = { id: USER_A };
    const before = JSON.stringify({ e: gm.entries, c: gm.corrections });

    const r = await listMergeSuggestions({ now: NOW });
    expect(r).toEqual({
      ok: true,
      data: [{ targetId: target.id, syncedSourceId: source.id, manualEntryIds: [tap.id], syncedEntryIds: [synced.id] }],
    });
    // Nothing merged, nothing written, nothing hidden.
    expect(JSON.stringify({ e: gm.entries, c: gm.corrections })).toBe(before);
    expect(gm.adminWrites).toEqual([]);
    expect(gm.entries).toHaveLength(2);
  });

  it('duplicates from one source are grouped into one prompt', async () => {
    const { source, target } = twoRecords();
    seedEntry({ user_id: USER_A, target_id: target.id, source_id: source.id, source_record_id: 'second-workout', occurred_at: '2026-10-19T20:00:00Z', value: 1 });
    idb.user = { id: USER_A };
    const r = await listMergeSuggestions({ now: NOW });
    expect(r.ok && r.data).toHaveLength(1);
    expect(r.ok && r.data[0].syncedEntryIds).toHaveLength(2);
  });

  it('a hidden record is not suggested about', async () => {
    const { source } = twoRecords();
    idb.user = { id: USER_A };
    await (await session()).from('entry_corrections').insert({ user_id: USER_A, source_id: source.id, source_record_id: WORKOUT_ID, action: 'hide' });
    expect(await listMergeSuggestions({ now: NOW })).toEqual({ ok: true, data: [] });
  });

  it('a count-anyway correction is not a removal', async () => {
    const { source } = twoRecords();
    idb.user = { id: USER_A };
    await (await session()).from('entry_corrections').insert({ user_id: USER_A, source_id: source.id, source_record_id: WORKOUT_ID, action: 'count_anyway' });
    const r = await listMergeSuggestions({ now: NOW });
    expect(r.ok && r.data).toHaveLength(1);
  });

  it('looks only at the last two months', async () => {
    twoRecords();
    idb.user = { id: USER_A };
    const later = () => new Date(Date.parse(END_TIME) + (SUGGESTION_LOOKBACK_DAYS + 1) * 86_400_000);
    expect(await listMergeSuggestions({ now: later })).toEqual({ ok: true, data: [] });
  });

  it('uses only the signed-in person’s entries', async () => {
    twoRecords(USER_A);
    twoRecords(USER_B);
    idb.user = { id: USER_B };
    const r = await listMergeSuggestions({ now: NOW });
    expect(r.ok && r.data).toHaveLength(1);
    const ids = new Set(gm.entries.filter((e) => e.user_id === USER_B).map((e) => e.id));
    expect(r.ok && r.data[0].syncedEntryIds.every((id) => ids.has(id))).toBe(true);
  });

  it('refuses when signed out', async () => {
    expect((await listMergeSuggestions({ now: NOW })).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The shape of the code and of the database it relies on
// ---------------------------------------------------------------------------

describe('the boundaries hold', () => {
  const read = (p: string) => readFileSync(join(root, p), 'utf8');
  const code = (p: string) =>
    read(p)
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');

  it('lib/adapters/hevy.ts still only normalizes: no database, no service, no environment', () => {
    const source = code('lib/adapters/hevy.ts');
    expect(source).not.toMatch(/supabase|process\.env|@\/lib\/services\/(?!integrations')/);
    expect(source).toMatch(/import type \{ InboundActivityPayload \} from '@\/lib\/services\/integrations'/);
  });

  it('the Hevy payload still meets the InboundActivityPayload contract', () => {
    expect(InboundActivityPayloadSchema.safeParse(activityOf()).success).toBe(true);
  });

  it('the sync code cannot delete, and writes nothing but entries', () => {
    const source = code('lib/services/syncedEntries.ts');
    expect(source).not.toMatch(/\.delete\(|\.upsert\(/);
    expect([...source.matchAll(/\.from\('(\w+)'\)\s*\.(?:insert|update)\(/g)].map((m) => m[1])).toEqual(['entries', 'entries']);
    expect(source).not.toMatch(/completed_at|micro_tasks|goal_channels|targetGoalChannel/);
  });

  it('the old path into tasks is untouched and still has no caller', () => {
    const callers = ['app', 'lib', 'components'].flatMap((dir) => {
      const out: string[] = [];
      const walk = (d: string) => {
        for (const name of require('node:fs').readdirSync(join(root, d))) {
          const rel = `${d}/${name}`;
          if (require('node:fs').statSync(join(root, rel)).isDirectory()) walk(rel);
          else if (/\.(ts|tsx)$/.test(name) && /ingestActivities(ForUser)?\(/.test(read(rel))) out.push(rel);
        }
      };
      walk(dir);
      return out;
    });
    expect(callers.sort()).toEqual(['lib/services/ingestion.ts', 'lib/services/ingestionForUser.ts']);
  });

  it('migration 013 gives the service role what the fake gives it, and nothing on targets or corrections', () => {
    const sql = read('supabase/migrations/013_goal_model_tables.sql');
    expect(sql).toContain('grant select on table public.sources to service_role;');
    expect(sql).toContain('grant select on table public.target_sources to service_role;');
    expect(sql).toContain('grant select, insert, update on table public.entries to service_role;');
    const grantsToService = sql.split('\n').filter((l) => /^grant .* to service_role;/.test(l));
    expect(grantsToService).toHaveLength(3);
    expect(sql).toContain('constraint entries_value_positive check (value > 0)');
    expect(sql).toContain('constraint entries_target_source_record_unique unique (target_id, source_id, source_record_id)');
    expect(sql).toContain('constraint entries_target_fk foreign key (target_id, user_id)');
    expect(sql).toMatch(/entry_corrections[^;]*\n[^;]*source_fk[^;]*references public\.sources/);
  });
});
