'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export interface LoadFailedStateProps {
  // Replaces the default of refreshing the route; for a caller that has its own way to read again.
  onRetry?: () => void;
}

// The plan could not be read (FeedState 'load_failed'). It says only that, because a failed read tells us nothing
// about the person's goals: no "no goals yet", no invitation to start one, and nothing that can be ticked. Try
// again asks Next to render the page again, which reads the plan again on the server; this component fetches
// nothing and writes nothing. The wording is calm and names no cause, and MOM-103 reuses it.
export function LoadFailedState({ onRetry }: LoadFailedStateProps) {
  const router = useRouter();
  return (
    <section aria-labelledby="load-failed-heading" role="alert" className="channel-card mt-6 p-6">
      <h2 id="load-failed-heading" className="card-title">
        We couldn&apos;t load your plan
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
