import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ReviewScreen } from '@/components/review/ReviewScreen';
import { getCurrentUser } from '@/lib/services/auth';
import { getWeeklyReviewFacts } from '@/lib/services/review';

// Reads the signed-in user's session and rows, so this page renders per request.
export const dynamic = 'force-dynamic';

// The weekly review's layer 1 recap, read only (MOM-113 block 3.2). proxy.ts sends a signed-out visitor to /login before
// this renders; the redirect below is the same safe default as the other pages'. It is reached from the notice on home on
// the person's planning day, and by its address.
export default async function ReviewPage() {
  const user = await getCurrentUser().catch(() => null);
  if (!user || !user.ok || user.data === null) redirect('/login');

  const facts = await getWeeklyReviewFacts().catch(() => null);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl px-4 py-6">
      <Link href="/" className="text-sm text-muted underline-offset-4 hover:underline">
        Back to home
      </Link>
      <h1 className="mt-3 text-[25px] font-semibold leading-tight tracking-[-0.055em]">Weekly review</h1>
      <div className="mt-5">
        {facts === null || !facts.ok ? (
          <p role="alert" className="text-sm text-danger">
            {facts === null ? 'Could not load your weekly review.' : facts.error}
          </p>
        ) : (
          <ReviewScreen facts={facts.data} />
        )}
      </div>
    </main>
  );
}
