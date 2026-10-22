// The ingestion engine (lib/services/ingestion.ts, MOM-40): normalized external activity becomes
// unfinished tasks that carry the activity as evidence.
//
// The rules under test come from docs/NINETY_DAY_PLAN_CONTEXT.md and INTEGRATIONS_SPEC.md:
// - the system never marks a task done: every ingested task starts 'todo', and ingestion only inserts,
// - it works as the signed-in user, so tasks are scoped to the verified session user,
// - it is idempotent, and activity it cannot place is set aside by a fixed rule, reported and logged.
// The database side (the unique source per user, the completion guard) is covered by
// supabase/verify/007_task_source_evidence.sql.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMockCalendarActivity, getMockHevyActivity } from '@/lib/services/integrations';
import {
  InboundActivityPayloadSchema,
  MAX_ACTIVITIES_PER_BATCH,
  ingestActivities,
  placeInPlan,
} from '@/lib/services/ingestion';
import { OTHER_USER, USER, channelRow, db, resetDb, taskById, taskRow } from './helpers/fakeSupabase';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeSupabase');
  return { createSupabaseServerClient };
});
// integrations.ts is imported for the mock adapters only; its credential code is never called here.
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock('@/lib/config/env', () => ({ getGoogleOAuthEnv: () => ({}) }));

// Goal start 2026-10-14: week 1 is Oct 14 to 20, week 2 is Oct 21 to 27, and so on.
const START = '2026-10-14';

const hevy = (over: object = {}) => ({ ...getMockHevyActivity(), ...over });
const calendar = (over: object = {}) => ({ ...getMockCalendarActivity(), ...over });

let warn: ReturnType<typeof vi.spyOn>;
let career: ReturnType<typeof channelRow>;
let fitness: ReturnType<typeof channelRow>;

beforeEach(() => {
  resetDb([], { id: USER });
  career = channelRow({ channel_key: 'career_pivot', start_date: START });
  fitness = channelRow({ channel_key: 'physical_fitness', start_date: START });
  db.channels = [career, fitness];
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

const run = async (batch: unknown) => {
  const r = await ingestActivities(batch);
  if (!r.ok) throw new Error(r.error);
  return r.data;
};

describe('batch and session checks', () => {
  it('refuses a non-array and an oversized batch', async () => {
    expect(await ingestActivities({ not: 'an array' })).toEqual({ ok: false, error: 'Invalid activity batch.' });
    const big = Array.from({ length: MAX_ACTIVITIES_PER_BATCH + 1 }, () => hevy());
    const r = await ingestActivities(big);
    expect(r.ok).toBe(false);
    expect(db.inserts).toHaveLength(0);
  });

  it('refuses when signed out and writes nothing', async () => {
    resetDb([], null);
    db.channels = [career];
    expect(await ingestActivities([calendar()])).toEqual({ ok: false, error: 'Sign in to sync your activity.' });
    expect(db.inserts).toHaveLength(0);
  });

  it('an empty batch is a no-op that needs no session and no database', async () => {
    resetDb([], null);
    const s = await run([]);
    expect(s).toMatchObject({ created: 0, duplicate: 0, skipped: 0, invalid: 0, failed: 0, results: [] });
    expect(db.reads).toBe(0);
  });
});

describe('what gets created', () => {
  it('turns a Hevy workout into an unfinished event task in the right channel and week', async () => {
    const s = await run([hevy()]);
    expect(s.created).toBe(1);
    const task = db.tasks[0];
    expect(task).toMatchObject({
      user_id: USER,
      goal_channel_id: fitness.id,
      title: 'Upper Body Strength',
      task_type: 'event',
      minutes: 45,
      week_of: 2,
      due_date: '2026-10-21',
      status: 'todo',
      completed_at: null,
      source_provider: 'hevy',
      source_external_id: 'hev_w_8f9a21b',
    });
    expect(s.results[0]).toMatchObject({ outcome: 'created', taskId: task.id, weekOf: 2, provider: 'hevy' });
  });

  it('carries the activity as evidence', async () => {
    await run([hevy()]);
    expect(db.tasks[0].source_evidence).toEqual({
      activityType: 'strength_workout',
      occurredAt: '2026-10-21T07:15:00Z',
      durationMinutes: 45,
      metrics: { volumeLbs: 12450, setsCompleted: 16, metadata: { primary_muscle: 'chest_shoulders' } },
    });
  });

  it('turns a finished calendar block into a task in the career channel', async () => {
    await run([calendar()]);
    expect(db.tasks[0]).toMatchObject({ goal_channel_id: career.id, title: 'Focus Time', minutes: 60, source_provider: 'google_calendar' });
  });

  it.each([
    [0.4, 1],
    [0, 1],
    [45.6, 46],
    [1440, 1440],
  ])('a duration of %s minutes becomes a %s-minute task, with the raw value kept as evidence', async (duration, minutes) => {
    await run([hevy({ durationMinutes: duration })]);
    expect(db.tasks[0].minutes).toBe(minutes);
    expect((db.tasks[0].source_evidence as { durationMinutes: number }).durationMinutes).toBe(duration);
  });

  it('ingests the spec sample payloads from both mock adapters', async () => {
    expect(InboundActivityPayloadSchema.safeParse(getMockHevyActivity()).success).toBe(true);
    expect(InboundActivityPayloadSchema.safeParse(getMockCalendarActivity()).success).toBe(true);
    const s = await run([getMockHevyActivity(), getMockCalendarActivity()]);
    expect(s.created).toBe(2);
  });
});

describe('the system never completes a task', () => {
  it('every created task is unfinished, and ingestion only inserts', async () => {
    await run([hevy(), calendar(), hevy({ externalId: 'hev_w_2', timestamp: '2026-10-28T07:00:00Z' })]);
    expect(db.tasks).toHaveLength(3);
    for (const t of db.tasks) expect(t).toMatchObject({ status: 'todo', completed_at: null });
    expect(db.updates).toHaveLength(0);
    expect(db.deleteCalls).toBe(0);
    expect(db.rpcCalls).toHaveLength(0);
  });

  it('never sends status or completed_at other than an explicit todo', async () => {
    await run([hevy(), calendar()]);
    for (const row of db.inserts) {
      expect(row.status).toBe('todo');
      expect(Object.keys(row)).not.toContain('completed_at');
    }
  });

  it('the activity cannot ask for completion: a status field breaks the contract', async () => {
    const s = await run([hevy({ status: 'done' }), hevy({ metrics: { eventCompleted: true, completed_at: 'now' } })]);
    expect(s.invalid).toBe(2);
    expect(db.tasks).toHaveLength(0);
  });

  it("re-ingesting leaves a task the user has since ticked exactly as it is", async () => {
    await run([hevy()]);
    const task = db.tasks[0];
    task.status = 'done';
    task.completed_at = '2026-10-21T09:00:00Z';
    task.title = 'My own title';
    const s = await run([hevy()]);
    expect(s.duplicate).toBe(1);
    expect(taskById(task.id)).toMatchObject({ status: 'done', completed_at: '2026-10-21T09:00:00Z', title: 'My own title' });
    expect(db.updates).toHaveLength(0);
  });
});

describe('placing an activity in the plan', () => {
  it.each([
    ['2026-10-14T00:00:00Z', 1],
    ['2026-10-20T23:59:59Z', 1],
    ['2026-10-21T00:00:00Z', 2],
    ['2027-01-06T12:00:00Z', 13],
  ])('%s is week %s', (timestamp, week) => {
    expect(placeInPlan(START, timestamp)).toEqual({ ok: true, week, date: timestamp.slice(0, 10) });
  });

  it('has no week before the goal started or after its last plan week', () => {
    expect(placeInPlan(START, '2026-10-13T23:59:59Z')).toEqual({ ok: false, reason: 'before_plan_start' });
    expect(placeInPlan(START, '2027-01-13T00:00:00Z')).toEqual({ ok: false, reason: 'after_plan_end' });
  });

  it('sets week_of from the activity date, not from today', async () => {
    await run([hevy({ externalId: 'a', timestamp: '2026-10-14T10:00:00Z' }), hevy({ externalId: 'b', timestamp: '2026-11-04T10:00:00Z' })]);
    expect(db.tasks.map((t) => [t.source_external_id, t.week_of, t.due_date])).toEqual([
      ['a', 1, '2026-10-14'],
      ['b', 4, '2026-11-04'],
    ]);
  });
});

describe('idempotency', () => {
  it('a second run creates nothing', async () => {
    await run([hevy(), calendar()]);
    const s = await run([hevy(), calendar()]);
    expect(s).toMatchObject({ created: 0, duplicate: 2 });
    expect(db.tasks).toHaveLength(2);
  });

  it('the same activity twice in one batch is one task', async () => {
    const s = await run([hevy(), hevy()]);
    expect(s).toMatchObject({ created: 1, duplicate: 1 });
    expect(db.tasks).toHaveLength(1);
  });

  it('the same id from different providers is two activities', async () => {
    const s = await run([hevy({ externalId: 'same-id' }), calendar({ externalId: 'same-id' })]);
    expect(s.created).toBe(2);
  });

  it('a concurrent request winning the race counts as a duplicate, not a failure', async () => {
    let reads = 0;
    db.afterRead = () => {
      // After the "already ingested?" check (the second read), another request inserts the same item.
      if (++reads === 2) db.tasks.push(taskRow(2, { goal_channel_id: fitness.id, source_provider: 'hevy', source_external_id: 'hev_w_8f9a21b' }));
    };
    const s = await run([hevy()]);
    expect(s).toMatchObject({ created: 0, duplicate: 1, failed: 0 });
    expect(db.tasks).toHaveLength(1);
  });
});

describe('activity that cannot be placed is set aside by a fixed rule, reported and logged', () => {
  const reasonOf = (s: Awaited<ReturnType<typeof run>>, i = 0) => s.results[i].reason;

  it('an unsupported provider', async () => {
    const s = await run([hevy({ provider: 'apple_health' })]);
    expect(s.results[0]).toMatchObject({ outcome: 'skipped', reason: 'unsupported_provider' });
  });

  it('a calendar event that has not finished or was cancelled', async () => {
    const s = await run([calendar({ metrics: { eventCompleted: false } })]);
    expect(s.results[0]).toMatchObject({ outcome: 'skipped', reason: 'activity_not_completed' });
    expect(db.tasks).toHaveLength(0);
  });

  it('a goal channel the user does not have', async () => {
    db.channels = [career];
    const s = await run([hevy()]);
    expect(s.results[0]).toMatchObject({ outcome: 'skipped', reason: 'no_matching_channel' });
  });

  it('a goal channel that is paused or done', async () => {
    fitness.status = 'paused';
    career.status = 'done';
    const s = await run([hevy(), calendar()]);
    expect(s.results.map((r) => r.reason)).toEqual(['channel_not_active', 'channel_not_active']);
    expect(db.tasks).toHaveLength(0);
  });

  it('activity before the goal began or after the plan ended', async () => {
    const s = await run([hevy({ externalId: 'x', timestamp: '2026-10-01T00:00:00Z' }), hevy({ externalId: 'y', timestamp: '2027-03-01T00:00:00Z' })]);
    expect(s.results.map((r) => r.reason)).toEqual(['before_plan_start', 'after_plan_end']);
  });

  it('gives the same answer every time', async () => {
    const batch = [hevy({ provider: 'apple_health' }), calendar({ metrics: { eventCompleted: false } })];
    const first = await run(batch);
    const second = await run(batch);
    expect(second).toEqual(first);
    expect(reasonOf(first, 0)).toBe('unsupported_provider');
  });

  it('logs each one with the provider, id and reason, and nothing the user wrote', async () => {
    await run([hevy({ provider: 'apple_health', title: 'My private workout name', externalId: 'ext-1' })]);
    expect(warn).toHaveBeenCalledTimes(1);
    const text = JSON.stringify(warn.mock.calls[0]);
    expect(text).toContain('apple_health');
    expect(text).toContain('ext-1');
    expect(text).toContain('unsupported_provider');
    expect(text).not.toContain('My private workout name');
  });
});

describe('invalid payloads', () => {
  it.each([
    ['no id', { externalId: '' }],
    ['no title', { title: '   ' }],
    ['a time with no zone', { timestamp: '2026-10-21 07:15:00' }],
    ['a time that is not a time', { timestamp: 'yesterday' }],
    ['a negative duration', { durationMinutes: -5 }],
    ['an absurd duration', { durationMinutes: 100000 }],
    ['a non-numeric duration', { durationMinutes: '45' }],
    ['an upper-case provider', { provider: 'Hevy' }],
    ['a goal channel key with spaces', { targetGoalChannel: 'physical fitness' }],
    ['an unknown field', { user_id: OTHER_USER }],
    ['metrics that are not an object', { metrics: 'lots' }],
    ['negative volume', { metrics: { volumeLbs: -1 } }],
    ['oversized metadata', { metrics: { metadata: { blob: 'x'.repeat(5000) } } }],
  ])('rejects %s without writing', async (_name, over) => {
    const s = await run([hevy(over)]);
    expect(s.results[0].outcome).toBe('invalid');
    expect(db.tasks).toHaveLength(0);
  });

  it('rejects non-objects', async () => {
    const s = await run([null, 'a string', 42, []]);
    expect(s.invalid).toBe(4);
  });

  it('says what was wrong, never the value', async () => {
    const s = await run([hevy({ timestamp: 'secret-looking-value' })]);
    expect(s.results[0].reason).not.toContain('secret-looking-value');
  });

  it("one bad item does not hold up the rest, and results keep the batch's order", async () => {
    const s = await run([hevy({ title: '' }), calendar(), hevy({ externalId: 'ok-2', timestamp: '2026-10-22T08:00:00Z' })]);
    expect(s).toMatchObject({ created: 2, invalid: 1 });
    expect(s.results.map((r) => [r.index, r.outcome])).toEqual([
      [0, 'invalid'],
      [1, 'created'],
      [2, 'created'],
    ]);
  });
});

describe('every task belongs to the signed-in user', () => {
  it('takes user_id from the session, whatever the payload says', async () => {
    await run([hevy()]);
    expect(db.tasks.every((t) => t.user_id === USER)).toBe(true);
    expect(db.inserts.every((row) => row.user_id === USER)).toBe(true);
  });

  it("uses only the user's own goal channels, even with row level security off", async () => {
    // Another user has a channel with the same key; it must not be picked up.
    const theirs = channelRow({ user_id: OTHER_USER, channel_key: 'physical_fitness', start_date: START });
    db.channels = [career, theirs];
    db.rls = false;
    const s = await run([hevy()]);
    expect(s.results[0]).toMatchObject({ outcome: 'skipped', reason: 'no_matching_channel' });
    expect(db.tasks).toHaveLength(0);
  });

  it("another user's earlier ingestion of the same activity is not this user's duplicate", async () => {
    db.tasks.push(taskRow(2, { user_id: OTHER_USER, source_provider: 'hevy', source_external_id: 'hev_w_8f9a21b' }));
    db.rls = false;
    const s = await run([hevy()]);
    expect(s.created).toBe(1);
    expect(db.tasks.filter((t) => t.user_id === USER)).toHaveLength(1);
  });
});

describe('failures', () => {
  it('reports a save that fails as failed, keeps going, and shows no payload content or database text', async () => {
    db.failNextInsert = 'database exploded. Failing row contains (Private meeting name)';
    const s = await run([calendar({ title: 'Private meeting name' }), hevy()]);

    expect(s).toMatchObject({ failed: 1, created: 1 });
    expect(s.results[0]).toMatchObject({ outcome: 'failed', reason: 'The task could not be saved.', taskId: null });
    expect(JSON.stringify(s)).not.toContain('Private meeting name');
    expect(JSON.stringify(s)).not.toContain('exploded');
    expect(db.tasks).toHaveLength(1);
  });

  it('a failed item can be sent again and is then created', async () => {
    db.failNextInsert = 'transient';
    await run([calendar()]);
    const again = await run([calendar()]);
    expect(again.created).toBe(1);
  });
});

describe('the source code has no way to complete a task', () => {
  // The strongest form of "no code path under ingestion changes status or completed_at": the module
  // has no update, delete, upsert or function call at all, and never names completed_at. Comments are
  // stripped first, since they explain these very rules.
  const source = readFileSync(join(process.cwd(), 'lib', 'services', 'ingestion.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it.each(['.update(', '.delete(', '.upsert(', '.rpc(', 'completed_at', 'setTaskStatus', 'createSupabaseAdminClient'])(
    'does not contain %s',
    (forbidden) => expect(source).not.toContain(forbidden),
  );
  it('inserts only into micro_tasks, as the signed-in user', () => {
    expect([...source.matchAll(/\.insert\(/g)]).toHaveLength(1);
    expect(source).toContain("from('micro_tasks').insert(row)");
    expect(source).toContain("status: 'todo'");
  });
});
