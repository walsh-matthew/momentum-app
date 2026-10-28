// The words for a Hevy sync (MOM-129, docs/DOMAIN_MODEL.md principle 5: say what happened, plainly). Pure: turns the
// service's HevySyncResult into the small HevySyncView a card can show. Nothing the provider wrote is passed on.

import type { HevySyncResult } from '@/lib/services/syncedEntries';
import type { HevySyncView } from '@/types/integrations';

export const HEVY_SYNC_MESSAGES = {
  nothingNew: 'Up to date. Nothing new from Hevy.',
  // The instruction to bind a target returns when there is a screen to do it on (outside first setup).
  noTarget: 'No target uses Hevy yet, so nothing was counted.',
  syncOff: 'Syncing is paused. Switch it on to sync.',
  refusedKey: 'Hevy refused your key. Reconnect it to continue.',
  unusableAnswer: 'Hevy sent an answer Momentum could not use. Try again later.',
  noAnswer: "Hevy didn't answer. Nothing was changed. Try again.",
  busy: 'A sync is already running.',
  notSaved: 'Some entries could not be saved. Sync again to retry them.',
} as const;

const entries = (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'}`;

function counts(added: number, updated: number): string {
  const parts: string[] = [];
  if (added > 0) parts.push(`Added ${entries(added)}`);
  if (updated > 0) parts.push(added > 0 ? `updated ${updated}` : `Updated ${entries(updated)}`);
  return parts.join(', ');
}

export function describeHevySync(result: HevySyncResult): HevySyncView {
  const summary = result.entries;
  const added = summary?.created ?? 0;
  const updated = summary?.updated ?? 0;
  const view = (kind: HevySyncView['kind'], message: string): HevySyncView => ({ kind, message, added, updated });
  const changed = counts(added, updated);

  if (result.status === 'sync_off') return view('sync_off', HEVY_SYNC_MESSAGES.syncOff);

  if (result.status === 'failed') {
    const failure = result.failure;
    if (failure === 'unauthorized') return view('failed_fixable', HEVY_SYNC_MESSAGES.refusedKey);
    if (failure === 'bad_response' || failure === 'not_found') {
      return view('failed_fixable', changed ? `${changed}, then ${HEVY_SYNC_MESSAGES.unusableAnswer}` : HEVY_SYNC_MESSAGES.unusableAnswer);
    }
    // Timeout, 429 or 5xx. Entries from earlier pages are kept (a resync cannot duplicate them).
    return view('failed_retry', changed ? `${changed}, then Hevy stopped answering. Try again.` : HEVY_SYNC_MESSAGES.noAnswer);
  }

  if (!summary) return view('nothing_new', HEVY_SYNC_MESSAGES.nothingNew);

  const tail: string[] = [];
  if (summary.invalid > 0) tail.push(`${summary.invalid} ${summary.invalid === 1 ? 'workout' : 'workouts'} could not be read.`);
  if (summary.failed > 0) tail.push(HEVY_SYNC_MESSAGES.notSaved);
  const withTail = (head: string) => [head, ...tail].join(' ');

  if (added + updated > 0) return view('done', withTail(`${changed}.`));

  const skipped = summary.results.filter((r) => r.outcome === 'skipped');
  if (skipped.length > 0) {
    if (skipped.every((r) => r.reason === 'no_bound_target' || r.reason === 'no_source')) {
      return view('no_target', HEVY_SYNC_MESSAGES.noTarget);
    }
    return view('nothing_counted', withTail(skipped.find((r) => r.message)?.message ?? 'Nothing was counted.'));
  }
  if (summary.failed > 0) return view('error', tail.join(' '));
  return view('nothing_new', withTail(HEVY_SYNC_MESSAGES.nothingNew));
}
