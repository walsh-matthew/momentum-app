'use client';

import { useState, type FormEvent } from 'react';
import { logMinutesEntry } from '@/app/actions/entries';
import type { LogDay, LogTarget } from '@/types/entries';
import { DayPicker } from './DayPicker';
import { EntryFeedback } from './EntryFeedback';
import { useEntryAction } from './useEntryAction';

interface MinutesControlProps {
  target: LogTarget;
  // The days the person can log on, or null/absent when they cannot choose one yet.
  days?: LogDay[] | null;
}

// Whole minutes only: digits, nothing else. A decimal or a unit is refused rather than rounded or guessed at.
function parseMinutes(text: string): number | null {
  const cleaned = text.trim();
  if (!/^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

// A time target's alternative to the timer, for time the person forgot to time: type the minutes, now or on a day
// they choose. It opens the number pad (inputMode numeric) and nothing else does.
export function MinutesControl({ target, days = null }: MinutesControlProps) {
  const { pending, error, notice, run, setError } = useEntryAction();
  const [text, setText] = useState('');
  const [day, setDay] = useState<string | null>(null);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const minutes = parseMinutes(text);
    if (minutes === null) {
      setError('Enter a whole number of minutes, 1 or more.');
      return;
    }
    run(
      () => (day === null ? logMinutesEntry(target.id, minutes) : logMinutesEntry(target.id, minutes, day)),
      () => {
        setText('');
        setDay(null);
      },
    );
  };

  return (
    <form onSubmit={onSubmit} noValidate aria-label={`Type the minutes for ${target.title}`}>
      <p className="mb-3 text-sm text-muted">Or type the minutes, for time you did not time.</p>
      {days && <DayPicker days={days} value={day} onChange={setDay} disabled={pending} name={`${target.title} minutes`} />}
      <div className="flex gap-3">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={`Minutes for ${target.title}`}
          placeholder="minutes"
          value={text}
          disabled={pending}
          onChange={(event) => setText(event.target.value)}
          className="min-h-14 min-w-0 flex-1 rounded-2xl border border-border bg-secondary px-4 text-lg text-foreground placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={pending}
          className="min-h-14 min-w-28 rounded-2xl border border-border px-4 text-base font-semibold transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Log minutes'}
        </button>
      </div>
      <EntryFeedback error={error} notice={notice} />
    </form>
  );
}
