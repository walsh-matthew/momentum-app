'use client';

import { useState, useTransition } from 'react';
import { syncHevyNow } from '@/app/actions/integrations';
import { Button } from '@/components/ui/button';
import type { HevySyncView } from '@/types/integrations';

// "Sync now" on a connected Hevy card (MOM-129). One tap runs the sync on the server and shows what happened in
// words. The words come from the server (HevySyncView): this component never sees a key or a raw result. A timeout
// is not retried for the person: the message says to try again and the button is ready.
export function HevySyncControl() {
  const [view, setView] = useState<HevySyncView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function sync() {
    setView(null);
    setError(null);
    startTransition(async () => {
      try {
        const result = await syncHevyNow();
        if (result.ok) setView(result.data);
        else setError(result.error);
      } catch {
        setError('Could not reach the server. Nothing was changed. Try again.');
      }
    });
  }

  const needsAttention = view?.kind === 'failed_fixable' || view?.kind === 'failed_retry' || view?.kind === 'error';

  return (
    <div className="mt-3">
      <Button variant="outline" disabled={pending} aria-busy={pending} onClick={sync}>
        {pending ? 'Syncing…' : 'Sync now'}
      </Button>
      {view && (
        <p role={needsAttention ? 'alert' : 'status'} className={`mt-2 text-sm ${needsAttention ? 'text-warn' : 'text-muted'}`}>
          {view.message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
