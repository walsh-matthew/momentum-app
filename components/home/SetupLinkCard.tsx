import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';

// The one calm way back to guided setup, on home while the person's first setup is not saved (MOM-143). It says what setup is and
// that nothing is saved until they say so, then offers the link: no countdown, no pressure. A conversation started in this browser
// tab is picked up by /setup itself (it is kept in the tab, never stored). When this shows, the old "No goals yet" card does not
// (AppShell), so there is one message and one link.
export function SetupLinkCard() {
  return (
    <section aria-labelledby="setup-link-heading" className="home-notice setup-link">
      <h2 id="setup-link-heading" className="card-title text-foreground">
        Set up your goals
      </h2>
      <p className="mt-2 text-sm">
        You haven&apos;t saved a setup yet. It&apos;s a short chat, one question at a time, and nothing is saved until you say so.
      </p>
      <Link href="/setup" className={cn(buttonVariants(), 'mt-4 w-full sm:w-auto')}>
        Go to setup
      </Link>
    </section>
  );
}
