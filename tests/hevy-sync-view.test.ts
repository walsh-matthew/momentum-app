// The words for a Hevy sync (lib/integrations/hevySyncView.ts, MOM-129): every result a sync can have, in plain words.

import { describe, expect, it } from 'vitest';
import { HEVY_SYNC_MESSAGES, describeHevySync } from '@/lib/integrations/hevySyncView';
import type { HevySyncResult } from '@/lib/services/syncedEntries';
import type { SyncedEntryResult, SyncedEntrySummary } from '@/types/integrations';

const result = (over: Partial<SyncedEntryResult> = {}): SyncedEntryResult => ({
  index: 0,
  externalId: 'w1',
  targetId: 't1',
  outcome: 'created',
  reason: null,
  message: null,
  ...over,
});
const summary = (results: SyncedEntryResult[]): SyncedEntrySummary => {
  const n = (o: SyncedEntryResult['outcome']) => results.filter((r) => r.outcome === o).length;
  return { created: n('created'), updated: n('updated'), unchanged: n('unchanged'), skipped: n('skipped'), invalid: n('invalid'), failed: n('failed'), results };
};
const synced = (results: SyncedEntryResult[] | null): HevySyncResult => ({
  status: 'synced',
  entries: results ? summary(results) : null,
  failure: null,
  notice: 'none',
});
const failed = (failure: HevySyncResult['failure'], results: SyncedEntryResult[] | null = null, notice: HevySyncResult['notice'] = 'none'): HevySyncResult => ({
  status: 'failed',
  entries: results ? summary(results) : null,
  failure,
  notice,
});

describe('a sync that worked', () => {
  it('says how many entries were added and updated', () => {
    expect(describeHevySync(synced([result(), result({ index: 1 }), result({ index: 2, outcome: 'updated' })]))).toEqual({
      kind: 'done',
      message: 'Added 2 entries, updated 1.',
      added: 2,
      updated: 1,
    });
    expect(describeHevySync(synced([result()])).message).toBe('Added 1 entry.');
    expect(describeHevySync(synced([result({ outcome: 'updated' })])).message).toBe('Updated 1 entry.');
  });

  it('a second sync of the same workouts says nothing is new', () => {
    const view = describeHevySync(synced([result({ outcome: 'unchanged' }), result({ index: 1, outcome: 'unchanged' })]));
    expect(view).toEqual({ kind: 'nothing_new', message: HEVY_SYNC_MESSAGES.nothingNew, added: 0, updated: 0 });
  });

  it('Hevy having no workouts is also nothing new', () => {
    expect(describeHevySync(synced(null)).kind).toBe('nothing_new');
  });

  it('mentions workouts it could not read and entries it could not save', () => {
    const view = describeHevySync(synced([result(), result({ index: -1, outcome: 'invalid', reason: 'x' }), result({ index: 2, outcome: 'failed' })]));
    expect(view.kind).toBe('done');
    expect(view.message).toBe(`Added 1 entry. 1 workout could not be read. ${HEVY_SYNC_MESSAGES.notSaved}`);
  });

  it('entries that could not be saved, with nothing added, is an error and not "up to date"', () => {
    const view = describeHevySync(synced([result({ outcome: 'failed' })]));
    expect(view).toMatchObject({ kind: 'error', message: HEVY_SYNC_MESSAGES.notSaved });
  });
});

describe('no target', () => {
  it('says so in the agreed words, and nothing about binding', () => {
    const view = describeHevySync(synced([result({ outcome: 'skipped', reason: 'no_bound_target', targetId: null })]));
    expect(view).toEqual({ kind: 'no_target', message: 'No target uses Hevy yet, so nothing was counted.', added: 0, updated: 0 });
    expect(view.message).not.toMatch(/bind/i);
  });

  it('no Hevy source at all reads the same', () => {
    expect(describeHevySync(synced([result({ outcome: 'skipped', reason: 'no_source', targetId: null })])).kind).toBe('no_target');
  });

  it('a target a workout cannot fill says why, using the rule’s own words', () => {
    const view = describeHevySync(
      synced([result({ outcome: 'skipped', reason: 'measure_not_supported', message: 'This target counts checklist steps, which a workout cannot tick.' })]),
    );
    expect(view).toMatchObject({ kind: 'nothing_counted', message: 'This target counts checklist steps, which a workout cannot tick.' });
  });
});

describe('a sync that did not', () => {
  it('a refused key says to reconnect', () => {
    expect(describeHevySync(failed('unauthorized', null, 'raised'))).toMatchObject({ kind: 'failed_fixable', message: HEVY_SYNC_MESSAGES.refusedKey });
  });

  it('an unusable answer is for the person to wait out', () => {
    expect(describeHevySync(failed('bad_response', null, 'raised'))).toMatchObject({ kind: 'failed_fixable', message: HEVY_SYNC_MESSAGES.unusableAnswer });
    expect(describeHevySync(failed('not_found')).kind).toBe('failed_fixable');
  });

  it('a timeout, a rate limit or a 5xx says nothing changed and to try again', () => {
    for (const failure of ['unavailable', 'rate_limited'] as const) {
      expect(describeHevySync(failed(failure))).toEqual({ kind: 'failed_retry', message: HEVY_SYNC_MESSAGES.noAnswer, added: 0, updated: 0 });
    }
  });

  it('a later page failing keeps, and says so about, what earlier pages added', () => {
    expect(describeHevySync(failed('unavailable', [result(), result({ index: 1 })]))).toMatchObject({
      kind: 'failed_retry',
      message: 'Added 2 entries, then Hevy stopped answering. Try again.',
      added: 2,
    });
  });

  it('paused syncing says how to switch it on', () => {
    expect(describeHevySync({ status: 'sync_off', entries: null, failure: null, notice: 'none' })).toMatchObject({ kind: 'sync_off', message: HEVY_SYNC_MESSAGES.syncOff });
  });

  it('never carries anything but our own fixed words', () => {
    for (const failure of ['unauthorized', 'not_found', 'rate_limited', 'unavailable', 'bad_response'] as const) {
      expect(describeHevySync(failed(failure)).message).not.toMatch(/api-key|token|http|status \d/i);
    }
  });
});
