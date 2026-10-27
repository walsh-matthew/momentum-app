'use client';

import { Play, Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import { logTimerEntry } from '@/app/actions/entries';
import type { LogTarget } from '@/types/entries';
import { formatElapsed } from './format';
import { clearTimerStart, readTimerStart, saveTimerStart } from './timerStorage';
import { useEntryAction } from './useEntryAction';

interface TimerControlProps {
  target: LogTarget;
}

// A time target: start, then stop. Only the start is kept (in this browser, see timerStorage.ts); stopping sends it
// and the server's clock sets the stop, so the entry is the minutes between them. The saved start is read after the
// first render, never during it, so the server and browser renders agree.
export function TimerControl({ target }: TimerControlProps) {
  const { pending, error, run, setError } = useEntryAction();
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setStartedAt(readTimerStart(target.id));
  }, [target.id]);

  useEffect(() => {
    if (startedAt === null) return;
    setNow(Date.now());
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [startedAt]);

  const start = () => {
    const at = new Date().toISOString();
    saveTimerStart(target.id, at);
    setError(null);
    setStartedAt(at);
  };
  const discard = () => {
    clearTimerStart(target.id);
    setError(null);
    setStartedAt(null);
  };
  const stop = () => {
    if (startedAt === null) return;
    run(
      () => logTimerEntry(target.id, startedAt),
      () => discard(),
    );
  };

  const running = startedAt !== null;
  const elapsed = running && now !== null ? formatElapsed(now - Date.parse(startedAt)) : '0:00';

  return (
    <div>
      {running && (
        <p className="mb-3 text-center text-3xl font-semibold tabular-nums" role="timer" aria-label={`Elapsed time for ${target.title}`}>
          {elapsed}
        </p>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={running ? stop : start}
        className="flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-primary px-5 text-lg font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        {running ? <Square className="size-5" aria-hidden="true" /> : <Play className="size-5" aria-hidden="true" />}
        <span>{pending ? 'Saving…' : running ? `Stop timer: ${target.title}` : `Start timer: ${target.title}`}</span>
      </button>
      {running && (
        <button
          type="button"
          disabled={pending}
          onClick={discard}
          className="mt-2 min-h-11 w-full rounded-xl text-sm text-muted underline-offset-4 hover:underline disabled:opacity-60"
        >
          Discard this timer without logging
        </button>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
