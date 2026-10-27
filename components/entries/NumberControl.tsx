'use client';

import { useState, type FormEvent } from 'react';
import { logNumberEntry } from '@/app/actions/entries';
import type { LogTarget } from '@/types/entries';
import { useEntryAction } from './useEntryAction';

interface NumberControlProps {
  target: LogTarget;
}

// The amount as the person typed it. A comma is accepted as the decimal mark; anything else that is not a plain
// number is refused rather than guessed at.
function parseAmount(text: string): number | null {
  const cleaned = text.trim().replace(',', '.');
  if (!/^\d*\.?\d+$|^\d+\.$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

// A quantity target: one number. This is the only control that opens the number pad (inputMode decimal); the
// amount is the entry's value as typed.
export function NumberControl({ target }: NumberControlProps) {
  const { pending, error, run, setError } = useEntryAction();
  const [text, setText] = useState('');
  const unit = target.unit ?? '';

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const amount = parseAmount(text);
    if (amount === null) {
      setError('Enter a number above 0.');
      return;
    }
    run(
      () => logNumberEntry(target.id, amount),
      () => setText(''),
    );
  };

  return (
    <form onSubmit={onSubmit} noValidate>
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
          className="min-h-16 min-w-0 flex-1 rounded-2xl border border-border bg-secondary px-4 text-lg text-foreground placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={pending}
          className="min-h-16 min-w-24 rounded-2xl bg-primary px-5 text-lg font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Log it'}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
