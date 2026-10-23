import Link from 'next/link';

export interface SignedOutStateProps {
  // Where the sign-in form lives.
  signInHref?: string;
}

// Shown when the page rendered with no session (FeedState 'signed_out'). proxy.ts redirects a signed-out visitor
// to /login before this can render, so it is the safe default for a session that ends in between: it asks to
// sign in and shows nothing of anyone's plan.
export function SignedOutState({ signInHref = '/login' }: SignedOutStateProps) {
  return (
    <section aria-labelledby="signed-out-heading" className="mt-6 rounded-lg border border-border bg-panel p-6">
      <h2 id="signed-out-heading" className="text-sm font-semibold">
        Sign in to see your plan
      </h2>
      <p className="mt-2 text-sm text-muted">Your session has ended. Sign in again to pick up where you left off.</p>
      <Link
        href={signInHref}
        className="mt-4 inline-flex min-h-11 items-center rounded-md bg-accent px-5 text-sm font-medium text-background"
      >
        Sign in
      </Link>
    </section>
  );
}
