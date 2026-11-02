import Link from 'next/link';
import { setupButtonClasses } from '@/components/setup/SetupButton';
import { AddGoalsLink } from './AddGoalsLink';

interface HomeActionsProps {
  // True when the person has a goal to log against. False when every goal they have is set aside: then there is nothing to log, and
  // "Add to your goals" is the one main button.
  canLog: boolean;
}

// What a person with a saved setup can do from home (MOM-167 part 14, owner 2026-11-02): "Log an entry" as the one main button, then "Add to
// your goals" as a secondary button, at the top of the page so neither can sit under a phone browser's bottom toolbar. Stacked and full width
// on a phone, side by side from 640px. A person with no saved setup sees the setup card instead (AppShell), never this.
export function HomeActions({ canLog }: HomeActionsProps) {
  return (
    <nav aria-label="Home actions" className="mt-4 mb-5 flex flex-col gap-2 sm:flex-row">
      {canLog && (
        <Link href="/log" className={setupButtonClasses('main')} data-tone="main">
          Log an entry
        </Link>
      )}
      <AddGoalsLink main={!canLog} />
    </nav>
  );
}
