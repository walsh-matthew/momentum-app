import { redirect } from 'next/navigation';
import { KindTimesScreen } from '@/components/forecast/KindTimesScreen';
import { KINDS_PAGE_HEADING, LOAD_FAILED } from '@/components/forecast/wording';
import { PageBackRow } from '@/components/layout/PageBackRow';
import { getCurrentUser } from '@/lib/services/auth';
import { getDayKindTimes } from '@/lib/services/forecastEdits';

// Reads the signed-in user's session and rows, so this page renders per request.
export const dynamic = 'force-dynamic';

// How much time each of the person's own kinds of days usually gives (MOM-138). Home's forecast says when a kind has no usual
// time yet and leads here; the week plan links here too. proxy.ts sends a signed-out visitor to /login before this renders;
// the redirect below is the same safe default as the other pages'.
export default async function KindTimesPage() {
  const user = await getCurrentUser().catch(() => null);
  if (!user || !user.ok || user.data === null) redirect('/login');

  const kinds = await getDayKindTimes().catch(() => null);

  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl px-4 py-6">
      <PageBackRow />
      <main>
        <h1 className="mt-3 text-[25px] font-semibold leading-tight tracking-[-0.055em]">{KINDS_PAGE_HEADING}</h1>
        <div className="mt-5">
          {kinds === null || !kinds.ok ? (
            <p role="alert" className="text-sm text-danger">
              {kinds === null ? LOAD_FAILED : kinds.error}
            </p>
          ) : (
            <KindTimesScreen kinds={kinds.data} />
          )}
        </div>
      </main>
    </div>
  );
}
