'use client';

import { Button } from '@/components/ui/button';

// The goal model's scoreboard could not be read (MOM-115, trial subset). A failed read says nothing about the person's goals, so this
// says only that, with the one way forward: read the page again. It offers no setup and no wizard (never assume), and reading again
// changes nothing. It replaces the old "No goals yet" card for this case.
export function ScoreboardLoadFailed() {
  return (
    <section role="alert" aria-labelledby="scoreboard-failed-heading" className="home-notice">
      <h2 id="scoreboard-failed-heading" className="card-title text-foreground">
        Your goals didn&apos;t load just now.
      </h2>
      <p className="mt-2 text-sm">Nothing is lost.</p>
      <Button onClick={() => window.location.reload()} className="mt-4 w-full sm:w-auto">
        Reload
      </Button>
    </section>
  );
}
