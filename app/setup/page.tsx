import { redirect } from 'next/navigation';
import { PageBackRow } from '@/components/layout/PageBackRow';
import { AddToGoals } from '@/components/setup/AddToGoals';
import { SetupConversation } from '@/components/setup/SetupConversation';
import { ADD_WORDS } from '@/lib/setup/addWords';
import { getCurrentUser } from '@/lib/services/auth';
import { getAddOptions, getSetupStart } from '@/lib/services/setup';

// Reads the signed-in user's session and rows, so this page renders per request.
export const dynamic = 'force-dynamic';
// The setup turn's Server Action runs under this page's limit (MOM-111 round 2, C). It is set here, not left to the platform
// default, because lib/services/setup.ts plans each turn inside it (SETUP_TURN_BUDGET_MS) and stops retrying before it.
export const maxDuration = 300;

// Guided setup (MOM-111): the conversation that turns an idea into goals, targets and sources. proxy.ts sends a signed-out
// visitor to /login before this renders; the redirect below is the same safe default as the other pages'.
// A person who has not set up starts the first setup; a person who has is asked what they would like to add (MOM-132 part 2): a new
// goal, or a target for a goal they have. The first setup's save refuses a second setup (migration 015), so an addition is a save of
// its own (migration 021) and the page for it is the same one.
export default async function SetupPage() {
  const user = await getCurrentUser().catch(() => null);
  if (!user || !user.ok || user.data === null) redirect('/login');

  const start = await getSetupStart();
  const options = start.ok && start.data.alreadySetUp ? await getAddOptions() : null;
  const adding = options !== null;

  return (
    <div className="mx-auto min-h-dvh w-full max-w-xl px-4 py-6">
      <PageBackRow />
      <main>
        <h1 className="mt-3 text-[25px] font-semibold leading-tight tracking-[-0.055em]">{adding ? ADD_WORDS.pageTitle : 'Set up your goals'}</h1>
        <div className="mt-5">
          {!start.ok ? (
            <p role="alert" className="text-sm text-danger">
              {start.error}
            </p>
          ) : options !== null ? (
            options.ok ? (
              <AddToGoals userId={user.data.id} options={options.data} />
            ) : (
              <p role="alert" className="text-sm text-danger">
                {options.error}
              </p>
            )
          ) : (
            <SetupConversation userId={user.data.id} />
          )}
        </div>
      </main>
    </div>
  );
}
