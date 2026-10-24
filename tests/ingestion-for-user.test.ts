// Session-less ingestion (MOM-38): ingestActivitiesForUser() for a verified webhook or a sync job, which has no
// signed-in session. It runs the same code as the signed-in path with the service-role client, which bypasses row
// level security. So these tests switch the fake's row level security OFF (`db.rls = false`) and show that the
// service itself keeps every read and write to the one user id it was given, that it ignores any session, and that
// it can only ever create unfinished tasks (docs/NINETY_DAY_PLAN_CONTEXT.md §3, §5 rule 6).
//
// The signed-in path is covered in tests/ingestion.test.ts; the database rules (the unique source per user, the
// completion guard) in supabase/verify/007_task_source_evidence.sql.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ingestActivities, MAX_ACTIVITIES_PER_BATCH } from '@/lib/services/ingestion';
import { asVerifiedUserId, ingestActivitiesForUser } from '@/lib/services/ingestionForUser';
import { getMockCalendarActivity, getMockHevyActivity } from '@/lib/services/integrations';
import { OTHER_USER, USER, channelRow, db, resetDb } from './helpers/fakeSupabase';

const admin = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeSupabase');
  return { createSupabaseServerClient };
});
vi.mock('@/lib/supabase/admin', async () => {
  const { createSupabaseAdminClient } = await import('./helpers/fakeSupabase');
  return {
    createSupabaseAdminClient: () => {
      admin.calls += 1;
      return createSupabaseAdminClient();
    },
  };
});
vi.mock('@/lib/config/env', () => ({ getGoogleOAuthEnv: () => ({}) }));

const START = '2026-10-14';
const hevy = (over: object = {}) => ({ ...getMockHevyActivity(), ...over });
const calendar = (over: object = {}) => ({ ...getMockCalendarActivity(), ...over });
const verified = (id: string) => asVerifiedUserId(id)!;

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  // No session at all, and no row level security: this is how a webhook's service-role client sees the database.
  resetDb([], null);
  db.rls = false;
  admin.calls = 0;
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

const run = async (userId: string, batch: unknown) => {
  const r = await ingestActivitiesForUser(verified(userId), batch);
  if (!r.ok) throw new Error(r.error);
  return r.data;
};

describe('with no session', () => {
  it('creates the user\'s unfinished tasks, owned by the id it was given', async () => {
    const fitness = channelRow({ user_id: USER, channel_key: 'physical_fitness', start_date: START });
    db.channels = [fitness];

    const summary = await run(USER, [hevy()]);

    expect(summary).toMatchObject({ created: 1, duplicate: 0, skipped: 0, invalid: 0, failed: 0 });
    expect(db.tasks).toHaveLength(1);
    expect(db.tasks[0]).toMatchObject({
      user_id: USER,
      goal_channel_id: fitness.id,
      status: 'todo',
      completed_at: null,
      task_type: 'event',
      source_provider: 'hevy',
      source_external_id: 'hev_w_8f9a21b',
    });
    expect(db.tasks[0].source_evidence).toMatchObject({ activityType: 'strength_workout', durationMinutes: 45 });
  });

  it('works the signed-in engine\'s rules: set aside what is not evidence, place by the plan, one task per activity', async () => {
    db.channels = [channelRow({ user_id: USER, channel_key: 'career_pivot', start_date: START })];
    const summary = await run(USER, [
      calendar({ externalId: 'a' }),
      calendar({ externalId: 'b', metrics: { eventCompleted: false } }),
      calendar({ externalId: 'c', timestamp: '2026-09-01T10:00:00Z' }),
      calendar({ externalId: 'a' }),
      { not: 'an activity' },
    ]);
    expect(summary).toMatchObject({ created: 1, skipped: 2, duplicate: 1, invalid: 1 });
    expect(summary.results.map((r) => r.outcome)).toEqual(['created', 'skipped', 'skipped', 'duplicate', 'invalid']);
    expect(summary.results.map((r) => r.reason).slice(1, 3)).toEqual(['activity_not_completed', 'before_plan_start']);
  });

  it('is idempotent: the same workout twice makes one task', async () => {
    db.channels = [channelRow({ user_id: USER, channel_key: 'physical_fitness', start_date: START })];
    expect((await run(USER, [hevy()])).created).toBe(1);
    const again = await run(USER, [hevy()]);
    expect(again).toMatchObject({ created: 0, duplicate: 1 });
    expect(db.tasks).toHaveLength(1);
  });

  it('ignores a signed-in session: the tasks are for the id it was given, not for whoever is signed in', async () => {
    db.user = { id: OTHER_USER };
    db.channels = [
      channelRow({ user_id: USER, channel_key: 'physical_fitness', start_date: START }),
      channelRow({ user_id: OTHER_USER, channel_key: 'physical_fitness', start_date: START }),
    ];
    await run(USER, [hevy()]);
    expect(db.tasks.map((t) => t.user_id)).toEqual([USER]);
  });
});

describe('one user\'s data never reaches another', () => {
  it('another user\'s channel with the same key is not used: nothing is created and it is set aside', async () => {
    // Only the OTHER user has a physical_fitness channel. With row level security off, a query that forgot the
    // user filter would find it and put USER's workout in someone else's plan.
    db.channels = [channelRow({ user_id: OTHER_USER, channel_key: 'physical_fitness', start_date: START })];
    const summary = await run(USER, [hevy()]);
    expect(summary).toMatchObject({ created: 0, skipped: 1 });
    expect(summary.results[0].reason).toBe('no_matching_channel');
    expect(db.tasks).toHaveLength(0);
  });

  it('with channels for both users, each user\'s activity lands in their own channel', async () => {
    const mine = channelRow({ user_id: USER, channel_key: 'physical_fitness', start_date: START });
    const theirs = channelRow({ user_id: OTHER_USER, channel_key: 'physical_fitness', start_date: START });
    db.channels = [theirs, mine];
    await run(USER, [hevy()]);
    await run(OTHER_USER, [hevy({ externalId: 'other-workout' })]);
    const byUser = Object.fromEntries(db.tasks.map((t) => [t.user_id, t.goal_channel_id]));
    expect(byUser).toEqual({ [USER]: mine.id, [OTHER_USER]: theirs.id });
  });

  it('another user\'s task with the same provider and external id does not count as this user\'s duplicate', async () => {
    db.channels = [
      channelRow({ user_id: USER, channel_key: 'physical_fitness', start_date: START }),
      channelRow({ user_id: OTHER_USER, channel_key: 'physical_fitness', start_date: START }),
    ];
    await run(OTHER_USER, [hevy()]);
    const mine = await run(USER, [hevy()]);
    expect(mine.created).toBe(1);
    expect(db.tasks.map((t) => t.user_id).sort()).toEqual([OTHER_USER, USER].sort());
  });

  it('never takes a user id from the payload: an extra user_id field is invalid, and nothing is written for it', async () => {
    db.channels = [channelRow({ user_id: USER, channel_key: 'physical_fitness', start_date: START })];
    const summary = await run(USER, [{ ...hevy(), user_id: OTHER_USER }]);
    expect(summary).toMatchObject({ created: 0, invalid: 1 });
    expect(db.tasks).toHaveLength(0);
  });
});

describe('the user id must be verified, and bad batches never reach the database', () => {
  it.each([
    ['empty', ''],
    ['a name', 'matt'],
    ['an email', 'matt@example.com'],
    ['a path', '../' + USER],
    ['a uuid with a suffix', USER + 'x'],
    ['not a string', 123],
    ['null', null],
    ['an object', { id: USER }],
  ])('asVerifiedUserId refuses %s', (_name, value) => {
    expect(asVerifiedUserId(value)).toBeNull();
  });

  it('asVerifiedUserId accepts a uuid in either case', () => {
    expect(asVerifiedUserId(USER)).toBe(USER);
    expect(asVerifiedUserId(USER.toUpperCase())).toBe(USER.toUpperCase());
  });

  it('refuses an id that was not made by asVerifiedUserId, before the service-role client is created', async () => {
    const r = await ingestActivitiesForUser('not-a-user-id' as never, [hevy()]);
    expect(r).toEqual({ ok: false, error: 'Invalid user.' });
    expect(admin.calls).toBe(0);
  });

  it('refuses a non-array and an oversized batch before the service-role client is created', async () => {
    expect(await ingestActivitiesForUser(verified(USER), { not: 'an array' })).toEqual({ ok: false, error: 'Invalid activity batch.' });
    const big = Array.from({ length: MAX_ACTIVITIES_PER_BATCH + 1 }, () => hevy());
    expect((await ingestActivitiesForUser(verified(USER), big)).ok).toBe(false);
    expect(admin.calls).toBe(0);
  });

  it('an empty batch succeeds without touching the database', async () => {
    const r = await ingestActivitiesForUser(verified(USER), []);
    expect(r).toMatchObject({ ok: true, data: { created: 0, results: [] } });
    expect(admin.calls).toBe(0);
  });

  it('the signed-in path still refuses a signed-out caller, and never uses the service-role client', async () => {
    resetDb([], null);
    expect(await ingestActivities([hevy()])).toEqual({ ok: false, error: 'Sign in to sync your activity.' });
    expect(admin.calls).toBe(0);
  });
});

describe('it can only create unfinished tasks', () => {
  it('every row it writes is todo with no completion time, and it updates and deletes nothing', async () => {
    db.channels = [channelRow({ user_id: USER, channel_key: 'physical_fitness', start_date: START })];
    await run(USER, Array.from({ length: 5 }, (_, i) => hevy({ externalId: `w${i}` })));
    expect(db.tasks).toHaveLength(5);
    for (const t of db.tasks) {
      expect(t.status).toBe('todo');
      expect(t.completed_at).toBeNull();
    }
    expect(db.updates).toEqual([]);
    expect(db.deleteCalls).toBe(0);
  });

  it('a payload that claims the work is done changes nothing about the task', async () => {
    db.channels = [channelRow({ user_id: USER, channel_key: 'physical_fitness', start_date: START })];
    const summary = await run(USER, [{ ...hevy(), status: 'done', completed_at: '2026-10-20T00:00:00Z' }]);
    expect(summary.invalid).toBe(1);
    expect(db.tasks).toHaveLength(0);
  });

  const code = (file: string) =>
    readFileSync(join(process.cwd(), 'lib', 'services', file), 'utf8')
      .replace(/\r\n/g, '\n')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  it('neither ingestion file can update, delete or write a status or completion time: they only insert', () => {
    for (const file of ['ingestion.ts', 'ingestionForUser.ts']) {
      const source = code(file);
      expect(source, file).not.toMatch(/\.(update|delete|upsert|rpc)\(/);
      expect(source, file).not.toMatch(/completed_at/);
    }
    expect([...code('ingestion.ts').matchAll(/status: '/g)]).toHaveLength(1);
    expect(code('ingestion.ts')).toMatch(/status: 'todo'/);
  });

  it('the service-role client lives in the session-less file alone, and that file runs no query of its own', () => {
    expect(code('ingestion.ts')).not.toContain('createSupabaseAdminClient');
    expect(code('ingestionForUser.ts')).toContain('createSupabaseAdminClient');
    expect(code('ingestionForUser.ts')).not.toMatch(/\.from\(|\.insert\(|\.select\(/);
  });
});
