import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { SignOutButton } from '@/components/auth/SignOutButton';

export const BACK_HOME_LABEL = 'Back to home';

interface PageBackRowProps {
  // Extra classes for the row, for the space around it on a page.
  className?: string;
}

// The top row of the signed-in pages that have no sidebar or header of their own (plan, review, log, setup, privacy): a
// way home on the left and Sign out on the right, at every width (MOM-148). It shows no email address, so a long one can
// never widen the page; home, Connected apps and Settings already say who is signed in. No data access.
export function PageBackRow({ className = '' }: PageBackRowProps) {
  return (
    <div className={`flex min-w-0 items-center justify-between gap-3 ${className}`}>
      <Link
        href="/"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {BACK_HOME_LABEL}
      </Link>
      <SignOutButton compact />
    </div>
  );
}
