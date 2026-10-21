import { AppShell } from '@/components/layout/AppShell';
import { listConnectedApps } from '@/lib/services/integrations';
import { getFocusTask } from '@/lib/services/tasks';
import type { ConnectedAppPublic, MicroTask } from '@/types/database.types';

// Reads the signed-in user's session, so this page renders per request.
export const dynamic = 'force-dynamic';

async function loadFocusTask(): Promise<MicroTask | null> {
  try {
    const result = await getFocusTask();
    return result.ok ? result.data : null;
  } catch {
    // Supabase env vars are not configured; show the empty state instead of failing the page.
    return null;
  }
}

async function loadConnectedApps(): Promise<ConnectedAppPublic[]> {
  try {
    const result = await listConnectedApps();
    return result.ok ? result.data : [];
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const [focusTask, connectedApps] = await Promise.all([loadFocusTask(), loadConnectedApps()]);
  return <AppShell focusTask={focusTask} connectedApps={connectedApps} />;
}
