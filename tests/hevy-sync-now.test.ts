// "Sync now" for Hevy (lib/services/syncedEntries.ts runHevySync, MOM-129): the entries sync on the signed-in
// person's own session, one at a time per person, answered in words. Runs against the same fakes as
// tests/synced-entries.test.ts, which enforce the grants of migration 013.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HEVY_SYNC_MESSAGES } from '@/lib/integrations/hevySyncView';
import { runHevySync } from '@/lib/services/syncedEntries';
import { USER_A, USER_B, idb, resetIdb, seedConnection } from './helpers/fakeIntegrations';
import { bind, gm, resetGm, seedEntry, seedSource, seedTarget } from './helpers/fakeGoalModel';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeGoalModel');
  return { createSupabaseServerClient };
});
vi.mock('@/lib/supabase/admin', async () => {
  const { createSupabaseAdminClient } = await import('./helpers/fakeGoalModel');
  return { createSupabaseAdminClient };
});
vi.mock('@/lib/config/env', () => ({ getGoogleOAuthEnv: () => ({}), getFakeHevyEnv: () => ({}) }));

const HEVY_KEY = '12345678-1234-4234-8234-123456789012';
const workout = (id: string, end = '2026-10-27T18:00:00Z') => ({
  id,
  title: 'Upper',
  start_time: '2026-10-27T17:00:00Z',
  end_time: end,
  exercises: [{ title: 'Bench', sets: [{ type: 'normal', weight_kg: 60, reps: 8 }] }],
});
const page = (workouts: unknown[], p = 1, count = 1) => new Response(JSON.stringify({ page: p, page_count: count, workouts }), { status: 200 });
const respond = (...queue: Array<Response | Error>) =>
  vi.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error('unexpected request');
    if (next instanceof Error) throw next;
    return next;
  });
const asFetch = (f: ReturnType<typeof respond>) => f as unknown as typeof globalThis.fetch;

function connected(userId = USER_A) {
  idb.user = { id: userId };
  return seedConnection(userId, 'hevy', { auth_type: 'api_key', api_key: HEVY_KEY });
}
function person(userId: string, targets: Array<Record<string, unknown>> = [{ measure: 'count' }]) {
  const source = seedSource(userId);
  targets.forEach((t) => bind(userId, seedTarget(userId, t), source));
  return source;
}
const credential = (userId = USER_A) => idb.creds.find((c) => c.user_id === userId && c.provider === 'hevy')!;
const view = async (f: ReturnType<typeof respond>) => {
  const r = await runHevySync({ fetch: asFetch(f) });
  if (!r.ok) throw new Error(r.error);
  return r.data;
};

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetIdb();
  resetGm();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe('Sync now', () => {
  it('turns the person’s workouts into entries and counts them in words', async () => {
    connected();
    person(USER_A);
    expect(await view(respond(page([workout('w1'), workout('w2')])))).toEqual({ kind: 'done', message: 'Added 2 entries.', added: 2, updated: 0 });
    expect(gm.entries.filter((e) => e.user_id === USER_A)).toHaveLength(2);
  });

  it('a second tap adds nothing and duplicates nothing', async () => {
    connected();
    person(USER_A);
    await view(respond(page([workout('w1'), workout('w2')])));
    expect(await view(respond(page([workout('w1'), workout('w2')])))).toMatchObject({ kind: 'nothing_new', message: HEVY_SYNC_MESSAGES.nothingNew, added: 0 });
    expect(gm.entries).toHaveLength(2);
  });

  it('a workout Hevy changed is updated, not added again', async () => {
    connected();
    person(USER_A);
    await view(respond(page([workout('w1')])));
    expect(await view(respond(page([workout('w1', '2026-10-27T18:30:00Z')])))).toMatchObject({ kind: 'done', message: 'Updated 1 entry.', added: 0, updated: 1 });
    expect(gm.entries).toHaveLength(1);
  });

  it('with no bound target says why and writes nothing', async () => {
    connected();
    person(USER_A, []);
    expect(await view(respond(page([workout('w1')])))).toEqual({
      kind: 'no_target',
      message: 'No target uses Hevy yet, so nothing was counted.',
      added: 0,
      updated: 0,
    });
    expect(gm.entries).toEqual([]);
  });

  it('with no Hevy source at all says the same and writes nothing', async () => {
    connected();
    expect((await view(respond(page([workout('w1')])))).kind).toBe('no_target');
    expect(gm.entries).toEqual([]);
  });

  it('a refused key raises the one notice, then the next try is quiet', async () => {
    connected();
    person(USER_A);
    expect(await view(respond(new Response('{}', { status: 401 })))).toMatchObject({ kind: 'failed_fixable', message: HEVY_SYNC_MESSAGES.refusedKey });
    expect(credential()).toMatchObject({ status: 'needs_reauth', last_error: 'The provider refused the key.' });
    const fetch = respond();
    expect((await runHevySync({ fetch: asFetch(fetch) })).ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('a timeout says to try again and changes nothing', async () => {
    connected();
    person(USER_A);
    const before = JSON.stringify({ creds: idb.creds, apps: idb.apps });
    expect(await view(respond(new Error('The request timed out.')))).toEqual({ kind: 'failed_retry', message: HEVY_SYNC_MESSAGES.noAnswer, added: 0, updated: 0 });
    expect(gm.entries).toEqual([]);
    expect(JSON.stringify({ creds: idb.creds, apps: idb.apps })).toBe(before);
    expect(credential()).toMatchObject({ status: 'connected', last_error: null });
  });

  it('a timeout on a later page keeps what the first page added', async () => {
    connected();
    person(USER_A);
    const v = await view(respond(page([workout('w1')], 1, 2), new Response('', { status: 503 })));
    expect(v).toMatchObject({ kind: 'failed_retry', message: 'Added 1 entry, then Hevy stopped answering. Try again.', added: 1 });
    expect(gm.entries).toHaveLength(1);
  });

  it('with syncing paused does not call Hevy', async () => {
    connected();
    idb.apps[0].is_active = false;
    person(USER_A);
    const fetch = respond();
    expect(await view(fetch)).toMatchObject({ kind: 'sync_off', message: HEVY_SYNC_MESSAGES.syncOff });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('signed out, says to sign in and calls nobody', async () => {
    idb.user = null;
    const fetch = respond();
    expect(await runHevySync({ fetch: asFetch(fetch) })).toEqual({ ok: false, error: 'Sign in to sync your workouts.' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('one person’s sync never touches another’s rows', async () => {
    connected(USER_B);
    const b = person(USER_B);
    const bTarget = gm.targets.find((t) => t.user_id === USER_B)!;
    const bEntry = seedEntry({ user_id: USER_B, target_id: bTarget.id, source_id: b.id, source_record_id: 'w1', occurred_at: '2026-10-27T18:00:00Z', value: 7 });
    const bBefore = JSON.stringify(bEntry);

    connected(USER_A);
    person(USER_A);
    await view(respond(page([workout('w1')])));

    expect(gm.entries.filter((e) => e.user_id === USER_A)).toHaveLength(1);
    expect(JSON.stringify(gm.entries.find((e) => e.id === bEntry.id))).toBe(bBefore);
    expect(credential(USER_B)).toMatchObject({ status: 'connected' });
  });
});

describe('one sync at a time per person', () => {
  // A fetch that waits until the test lets it answer.
  function gated() {
    let release: (r: Response) => void = () => {};
    const gate = new Promise<Response>((resolve) => (release = resolve));
    const fetch = vi.fn(async () => gate);
    return { fetch: fetch as unknown as typeof globalThis.fetch, calls: fetch, release };
  }

  it('a second tap while one runs answers busy and starts nothing', async () => {
    connected();
    person(USER_A);
    const slow = gated();
    const first = runHevySync({ fetch: slow.fetch });
    await vi.waitFor(() => expect(slow.calls).toHaveBeenCalledTimes(1));

    const second = await runHevySync({ fetch: asFetch(respond()) });
    expect(second).toEqual({ ok: true, data: { kind: 'busy', message: HEVY_SYNC_MESSAGES.busy, added: 0, updated: 0 } });

    slow.release(page([workout('w1')]));
    expect(await first).toMatchObject({ ok: true, data: { kind: 'done', added: 1 } });
    expect(slow.calls).toHaveBeenCalledTimes(1);
    expect(gm.entries).toHaveLength(1);
  });

  it('the lock is let go afterwards, even when the sync fails', async () => {
    connected();
    person(USER_A);
    await view(respond(new Error('network down')));
    expect(await view(respond(page([workout('w1')])))).toMatchObject({ kind: 'done' });
  });

  it('another person is not held up by someone else’s running sync', async () => {
    connected(USER_A);
    person(USER_A);
    const slow = gated();
    const first = runHevySync({ fetch: slow.fetch });
    await vi.waitFor(() => expect(slow.calls).toHaveBeenCalledTimes(1));

    connected(USER_B);
    person(USER_B);
    expect(await view(respond(page([workout('w9')])))).toMatchObject({ kind: 'done', added: 1 });

    slow.release(page([workout('w1')]));
    await first;
  });
});

describe('the boundaries hold', () => {
  it('the button imports an action, never a service, a client or an environment variable', () => {
    const component = readFileSync(join(__dirname, '..', 'components/integrations/HevySyncControl.tsx'), 'utf8');
    expect(component).toMatch(/@\/app\/actions\/integrations/);
    expect(component).not.toMatch(/supabase|lib\/services|process\.env/);
  });
});
