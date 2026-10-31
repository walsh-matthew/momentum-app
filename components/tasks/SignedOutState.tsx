import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

export interface SignedOutStateProps {
  // Where the sign-in form lives.
  signInHref?: string;
}

// Shown when the page rendered with no session (FeedState 'signed_out'). proxy.ts redirects a signed-out visitor
// to /login before this can render, so it is the safe default for a session that ends in between: it asks to
// sign in and shows nothing of anyone's plan.
export function SignedOutState({ signInHref = '/login' }: SignedOutStateProps) {
  return (
    <section aria-labelledby="signed-out-heading" className="channel-card mt-6 p-6">
      <h2 id="signed-out-heading" className="card-title">
        Sign in to see your plan
      </h2>
      <p className="mt-2 text-sm text-muted">Your session has ended. Sign in again to pick up where you left off.</p>
      <Link href={signInHref} className={`${buttonVariants()} mt-4`}>
        Sign in
      </Link>
    </section>
  );
}
