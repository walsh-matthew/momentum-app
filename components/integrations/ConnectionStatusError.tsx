'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export interface ConnectionStatusErrorProps {
  // Replaces the default of refreshing the route; for a caller that has its own way to read again.
  onRetry?: () => void;
}

// The Connected Apps page could not read connection status (MOM-103). It says only that: a failed read tells us
// nothing about which apps are connected, so there are no cards, no "Connected" or "Not connected" and no connect,
// disconnect or switch control. The text is fixed and names no cause, setting or key. Try again asks Next to render
// the page again, which reads the status again on the server; this component fetches nothing and writes nothing.
// The wording matches LoadFailedState from MOM-93 until the two share one component (see BACKLOG.md).
export function ConnectionStatusError({ onRetry }: ConnectionStatusErrorProps) {
  const router = useRouter();
  return (
    <section aria-labelledby="connection-status-error-heading" role="alert" className="channel-card p-6">
      <h2 id="connection-status-error-heading" className="card-title">
        We couldn&apos;t load connection status
      </h2>
      <p className="mt-2 text-sm text-muted">
        Something got in the way of loading it just now. Try again in a moment.
      </p>
      <Button onClick={onRetry ?? (() => router.refresh())} className="mt-4">
        Try again
      </Button>
    </section>
  );
}
