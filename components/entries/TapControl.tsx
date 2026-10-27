'use client';

import { Loader2, Plus } from 'lucide-react';
import { logTapEntry } from '@/app/actions/entries';
import type { LogTarget } from '@/types/entries';
import { useEntryAction } from './useEntryAction';

interface TapControlProps {
  target: LogTarget;
}

// A count target: one large button, no keyboard. Each tap is one entry of 1, made by the person.
export function TapControl({ target }: TapControlProps) {
  const { pending, error, run } = useEntryAction();

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => logTapEntry(target.id))}
        className="flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-primary px-5 text-lg font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <Plus className="size-5" aria-hidden="true" />}
        <span>{pending ? 'Saving…' : `Log one: ${target.title}`}</span>
      </button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
