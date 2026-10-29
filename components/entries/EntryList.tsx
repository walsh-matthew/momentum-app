'use client';

import { removeLoggedEntry, restoreLoggedEntry } from '@/app/actions/entries';
import type { LoggedEntry } from '@/types/entries';
import { describeEntry, formatChosenDay, formatEntryTime } from './format';
import { useEntryAction } from './useEntryAction';

interface EntryListProps {
  entries: LoggedEntry[];
  // The person's own time zone, for the times shown. Null when none is set.
  timeZone: string | null;
  // The person's own today, so a day reads "Today" or "Yesterday" (MOM-111 finding 7). Null when it is not known.
  today?: string | null;
}

interface EntryRowProps {
  entry: LoggedEntry;
  timeZone: string | null;
  today: string | null;
}

// One entry. Remove hides it and keeps it here, struck through, with a way back: nothing is deleted. An entry on a
// day the person chose shows the day only, and one that falls before its goal's start says it is not counted.
function EntryRow({ entry, timeZone, today }: EntryRowProps) {
  const { pending, error, run } = useEntryAction();
  const when = entry.chosenDay ? `${formatChosenDay(entry.chosenDay, today)} · the day you chose` : formatEntryTime(entry.occurredAt, timeZone, today);

  return (
    <li className="rounded-2xl border border-border bg-secondary p-4">
      <div className="flex items-center gap-3">
        <div className={`min-w-0 flex-1${entry.removed ? ' text-muted line-through' : ''}`}>
          <p className="text-base font-medium">
            {entry.targetTitle}: {describeEntry(entry)}
          </p>
          {when && <p className="text-sm text-muted">{when}</p>}
          {entry.beforeStart && <p className="text-sm font-medium">Before the goal&apos;s start, not counted</p>}
        </div>
        {entry.removed && <span className="chip">Removed</span>}
        <button
          type="button"
          disabled={pending}
          aria-label={`${entry.removed ? 'Restore' : 'Remove'} ${entry.targetTitle}: ${describeEntry(entry)}`}
          onClick={() => run(() => (entry.removed ? restoreLoggedEntry(entry.id) : removeLoggedEntry(entry.id)))}
          className="min-h-11 min-w-20 rounded-xl border border-border px-3 text-sm font-medium disabled:opacity-60"
        >
          {pending ? 'Saving…' : entry.removed ? 'Restore' : 'Remove'}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </li>
  );
}

// The person's latest manual entries, newest first, removed ones included so they can be restored.
export function EntryList({ entries, timeZone, today = null }: EntryListProps) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted">Nothing logged yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {entries.map((entry) => (
        <EntryRow key={entry.id} entry={entry} timeZone={timeZone} today={today} />
      ))}
    </ul>
  );
}
