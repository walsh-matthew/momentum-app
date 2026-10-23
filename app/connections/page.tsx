import { redirect } from 'next/navigation';
import { IntegrationCardList } from '@/components/integrations/IntegrationCardList';
import { PageFrame } from '@/components/layout/PageFrame';
import { getCurrentUser } from '@/lib/services/auth';
import { listConnectedApps } from '@/lib/services/integrations';
import type { ConnectedAppPublic } from '@/types/database.types';

// Reads the signed-in user's session and connected apps, so this page renders per request.
export const dynamic = 'force-dynamic';

async function loadConnectedApps(): Promise<ConnectedAppPublic[]> {
  try {
    const result = await listConnectedApps();
    return result.ok ? result.data : [];
  } catch {
    return [];
  }
}

// The Connected Apps page: where the user switches each app on or off, on every screen size. The connect forms
// (Google sign-in, the Hevy key) will land here too (MOM-62). proxy.ts sends a signed-out visitor to /login
// before this renders; the redirect below is the same safe default as the home page's, for a session that ends
// in between.
export default async function ConnectionsPage() {
  const user = await getCurrentUser().catch(() => null);
  if (!user || !user.ok || user.data === null) redirect('/login');
  const connectedApps = await loadConnectedApps();

  return (
    <PageFrame active="connections" title="Connected apps" userEmail={user.data.email}>
      <p className="mt-2 max-w-prose text-sm text-muted">
        Your routines, working together in the background. Switching an app on only records your choice for now;
        nothing is requested from the app until its connect step is ready.
      </p>
      <div className="mt-6 max-w-xl">
        <IntegrationCardList connectedApps={connectedApps} />
      </div>
    </PageFrame>
  );
}
