import { AppShell } from '@/components/layout/AppShell';
import { getFocusTask } from '@/lib/services/tasks';
import type { MicroTask } from '@/types/database.types';

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

export default async function HomePage() {
  return <AppShell focusTask={await loadFocusTask()} />;
}
