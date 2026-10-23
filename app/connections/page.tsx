import { CircleAlert, CircleCheck } from 'lucide-react';
import { redirect } from 'next/navigation';
import { IntegrationCardList } from '@/components/integrations/IntegrationCardList';
import { PageFrame } from '@/components/layout/PageFrame';
import { noticeFor } from '@/lib/integrations/connectNotices';
import { getCurrentUser } from '@/lib/services/auth';
import { listConnectedApps, listIntegrationAccounts } from '@/lib/services/integrations';
import type { ConnectedAppPublic } from '@/types/database.types';
import type { IntegrationAccount } from '@/types/integrations';

// Reads the signed-in user's session and connected apps, so this page renders per request.
export const dynamic = 'force-dynamic';

interface ConnectionsPageProps {
  searchParams: Promise<{ google?: string | string[] }>;
}

async function loadConnectedApps(): Promise<ConnectedAppPublic[]> {
  try {
    const result = await listConnectedApps();
    return result.ok ? result.data : [];
  } catch {
    return [];
  }
}

// Connection status for each app: metadata only, never a token or a key. null when it cannot be read, in which case
// the cards fall back to the plain switches instead of claiming a status they do not know.
async function loadAccounts(): Promise<IntegrationAccount[] | null> {
  try {
    const result = await listIntegrationAccounts();
    return result.ok ? result.data : null;
  } catch {
    return null;
  }
}

// The Connected Apps page: where the user connects and disconnects each app (Google Calendar through Google's
// consent screen, Hevy with its API key) and switches syncing on or off, on every screen size. proxy.ts sends a
// signed-out visitor to /login before this renders; the redirect below is the same safe default as the home
// page's, for a session that ends in between.
export default async function ConnectionsPage({ searchParams }: ConnectionsPageProps) {
  const user = await getCurrentUser().catch(() => null);
  if (!user || !user.ok || user.data === null) redirect('/login');
  const [connectedApps, accounts, query] = await Promise.all([loadConnectedApps(), loadAccounts(), searchParams]);
  // The sentence for how the Google sign-in ended, from a fixed list; anything else in the address is ignored.
  const notice = noticeFor(query.google);

  return (
    <PageFrame active="connections" title="Connected apps" userEmail={user.data.email}>
      <p className="mt-2 max-w-prose text-sm text-muted">
        Your routines, working together in the background. Connecting gives Momentum read access to count what you
        did toward your goals. It never ticks a task for you: that stays your click.
      </p>
      {notice && (
        <p
          role={notice.tone === 'ok' ? 'status' : 'alert'}
          className={`mt-4 flex max-w-xl items-start gap-2 text-sm ${notice.tone === 'ok' ? 'text-foreground' : 'text-warn'}`}
        >
          {notice.tone === 'ok' ? (
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
          ) : (
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          )}
          {notice.text}
        </p>
      )}
      <div className="mt-6 max-w-xl">
        <IntegrationCardList connectedApps={connectedApps} accounts={accounts ?? undefined} />
      </div>
    </PageFrame>
  );
}
