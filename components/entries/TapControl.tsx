'use client';

import { Loader2, Plus } from 'lucide-react';
import { useState } from 'react';
import { logTapEntry } from '@/app/actions/entries';
import { busyProps } from '@/lib/forms/mainButton';
import type { LogDay, LogTarget } from '@/types/entries';
import { DayPicker } from './DayPicker';
import { EntryFeedback } from './EntryFeedback';
import { useEntryAction } from './useEntryAction';

interface TapControlProps {
  target: LogTarget;
  // The days the person can log on, or null/absent when they cannot choose one yet.
  days?: LogDay[] | null;
}

// A count target: one large button, no keyboard. Each tap is one entry of 1, made by the person, now or on a day they
// choose. The chosen day goes back to today after a log, so it never carries over to the next one.
export function TapControl({ target, days = null }: TapControlProps) {
  const { pending, error, notice, run } = useEntryAction();
  const [day, setDay] = useState<string | null>(null);

  return (
    <div>
      {days && <DayPicker days={days} value={day} onChange={setDay} disabled={pending} name={target.title} />}
      <button
        type="button"
        {...busyProps<HTMLButtonElement>(pending, () => run(() => (day === null ? logTapEntry(target.id) : logTapEntry(target.id, day)), () => setDay(null)))}
        className="flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-primary px-5 text-lg font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
      >
        {pending ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <Plus className="size-5" aria-hidden="true" />}
        <span>{pending ? 'Saving…' : `Log one: ${target.title}`}</span>
      </button>
      <EntryFeedback error={error} notice={notice} />
    </div>
  );
}
