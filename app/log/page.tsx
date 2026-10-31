import { redirect } from 'next/navigation';
import { ManualEntryPanel } from '@/components/entries/ManualEntryPanel';
import { PageBackRow } from '@/components/layout/PageBackRow';
import { getCurrentUser } from '@/lib/services/auth';
import { getLogPanel } from '@/lib/services/entries';

// Reads the signed-in user's session and rows, so this page renders per request.
export const dynamic = 'force-dynamic';

// A minimal place to try manual entry (MOM-110): the controls for every target, behind sign-in. MOM-112 puts them on
// home and retires this page. proxy.ts sends a signed-out visitor to /login before this renders; the redirect below
// is the same safe default as the other pages'. It is not in the navigation on purpose.
export default async function LogPage() {
  const user = await getCurrentUser().catch(() => null);
  if (!user || !user.ok || user.data === null) redirect('/login');

  const panel = await getLogPanel();

  return (
    <div className="mx-auto min-h-dvh w-full max-w-xl px-4 py-6">
      <PageBackRow />
      <main>
        <h1 className="mt-3 text-[25px] font-semibold leading-tight tracking-[-0.055em]">Log an entry</h1>
        {panel.ok ? (
          <ManualEntryPanel panel={panel.data} />
        ) : (
          <p role="alert" className="mt-5 text-sm text-danger">
            {panel.error}
          </p>
        )}
      </main>
    </div>
  );
}
