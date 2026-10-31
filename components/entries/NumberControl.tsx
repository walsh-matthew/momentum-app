'use client';

import { useState, type FormEvent } from 'react';
import { logNumberEntry } from '@/app/actions/entries';
import { busyProps } from '@/lib/forms/mainButton';
import type { LogDay, LogTarget } from '@/types/entries';
import { DayPicker } from './DayPicker';
import { EntryFeedback } from './EntryFeedback';
import { useEntryAction } from './useEntryAction';

interface NumberControlProps {
  target: LogTarget;
  // The days the person can log on, or null/absent when they cannot choose one yet.
  days?: LogDay[] | null;
}

// The amount as the person typed it. A comma is accepted as the decimal mark; anything else that is not a plain
// number is refused rather than guessed at.
function parseAmount(text: string): number | null {
  const cleaned = text.trim().replace(',', '.');
  if (!/^\d*\.?\d+$|^\d+\.$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

// A quantity target: one number. With typed minutes, the only controls that open the number pad (inputMode decimal);
// the amount is the entry's value as typed, now or on a day the person chooses.
export function NumberControl({ target, days = null }: NumberControlProps) {
  const { pending, error, notice, run, setError } = useEntryAction();
  const [text, setText] = useState('');
  const [day, setDay] = useState<string | null>(null);
  const unit = target.unit ?? '';

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const amount = parseAmount(text);
    if (amount === null) {
      setError('Enter a number above 0.');
      return;
    }
    run(
      () => (day === null ? logNumberEntry(target.id, amount) : logNumberEntry(target.id, amount, day)),
      () => {
        setText('');
        setDay(null);
      },
    );
  };

  return (
    <form onSubmit={onSubmit} noValidate>
      {days && <DayPicker days={days} value={day} onChange={setDay} disabled={pending} name={target.title} />}
      <div className="flex gap-3">
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label={`Amount${unit ? ` in ${unit}` : ''} for ${target.title}`}
          placeholder={unit}
          value={text}
          disabled={pending}
          onChange={(event) => setText(event.target.value)}
          className="min-h-16 min-w-0 flex-1 rounded-2xl border ctl-border bg-secondary px-4 text-lg text-foreground placeholder:text-muted"
        />
        {/* One number: the button is not there until there is one (MOM-145). Enter in the field still logs it. */}
        {text.trim().length > 0 && (
          <button
            type="submit"
            {...busyProps<HTMLButtonElement>(pending)}
            className="min-h-16 min-w-24 rounded-2xl bg-primary px-5 text-lg font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
          >
            {pending ? 'Saving…' : 'Log it'}
          </button>
        )}
      </div>
      <EntryFeedback error={error} notice={notice} />
    </form>
  );
}
