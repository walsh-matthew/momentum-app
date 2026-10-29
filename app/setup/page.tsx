import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SetupConversation } from '@/components/setup/SetupConversation';
import { getCurrentUser } from '@/lib/services/auth';
import { getSetupStart } from '@/lib/services/setup';

// Reads the signed-in user's session and rows, so this page renders per request.
export const dynamic = 'force-dynamic';
// The setup turn's Server Action runs under this page's limit (MOM-111 round 2, C). It is set here, not left to the platform
// default, because lib/services/setup.ts plans each turn inside it (SETUP_TURN_BUDGET_MS) and stops retrying before it.
export const maxDuration = 300;

// Guided setup (MOM-111): the conversation that turns an idea into goals, targets and sources. proxy.ts sends a signed-out
// visitor to /login before this renders; the redirect below is the same safe default as the other pages'. It is not in the
// navigation yet on purpose: the family trial reaches it by address until the home page (MOM-112) links to it.
// First setup only: a person who already has a goal is told so instead of starting a second conversation, because the save
// refuses a second setup (migration 015). Adding a goal later is a later piece of work.
export default async function SetupPage() {
  const user = await getCurrentUser().catch(() => null);
  if (!user || !user.ok || user.data === null) redirect('/login');

  const start = await getSetupStart();

  return (
    <main className="mx-auto min-h-dvh w-full max-w-xl px-4 py-6">
      <Link href="/" className="text-sm text-muted underline-offset-4 hover:underline">
        Back to home
      </Link>
      <h1 className="mt-3 text-[25px] font-semibold leading-tight tracking-[-0.055em]">Set up your goals</h1>
      <div className="mt-5">
        {!start.ok ? (
          <p role="alert" className="text-sm text-danger">
            {start.error}
          </p>
        ) : start.data.alreadySetUp ? (
          <section className="channel-card space-y-3 p-4">
            <h2 className="text-lg font-semibold tracking-[-0.02em]">Setup is already done</h2>
            <p className="text-base">
              You have already set up your goals. Adding another goal from here is not built yet. You can log against what you
              have on the{' '}
              <Link href="/log" className="underline underline-offset-2">
                log page
              </Link>
              .
            </p>
          </section>
        ) : (
          <SetupConversation userId={user.data.id} />
        )}
      </div>
    </main>
  );
}
