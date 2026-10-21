import { AppShell } from '@/components/layout/AppShell';
import { listGoalChannels } from '@/lib/services/goals';
import { listConnectedApps } from '@/lib/services/integrations';
import { getFocusTask, listMicroTasks } from '@/lib/services/tasks';
import { computeVelocity, currentPlanWeek, type VelocitySnapshot } from '@/lib/utils/velocity';
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

// Velocity is measured against the plan week of the first active goal (the default goal sorts
// first). null hides the hero when there is no goal or the data cannot be read.
async function loadVelocity(): Promise<VelocitySnapshot | null> {
  try {
    const [goals, tasks] = await Promise.all([listGoalChannels(), listMicroTasks()]);
    if (!goals.ok || !tasks.ok) return null;
    const goal = goals.data.find((g) => g.status === 'active');
    if (!goal) return null;
    const today = new Date().toISOString().slice(0, 10);
    const week = currentPlanWeek(goal.start_date, today);
    return week === null ? null : computeVelocity(tasks.data, week, today);
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const [focusTask, velocity, connectedApps] = await Promise.all([
    loadFocusTask(),
    loadVelocity(),
    loadConnectedApps(),
  ]);
  return <AppShell focusTask={focusTask} velocity={velocity} connectedApps={connectedApps} />;
}
