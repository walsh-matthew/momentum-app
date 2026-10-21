import { AppShell } from '@/components/layout/AppShell';
import { listGoalChannels } from '@/lib/services/goals';
import { listConnectedApps } from '@/lib/services/integrations';
import { getFocusTask, listMicroTasks, proposeRebalance } from '@/lib/services/tasks';
import { computeVelocity, currentPlanWeek } from '@/lib/utils/velocity';
import type { ConnectedAppPublic, MicroTask } from '@/types/database.types';
import type { RebalanceProposalView } from '@/types/rebalance';

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

interface PlanState {
  tasks: MicroTask[];
  week: number;
  today: string;
}

// The user's tasks and the plan week of the first active goal (the default goal sorts first), read
// once and shared by velocity and rebalancing. null hides both when there is no goal or the data
// cannot be read.
async function loadPlan(): Promise<PlanState | null> {
  try {
    const [goals, tasks] = await Promise.all([listGoalChannels(), listMicroTasks()]);
    if (!goals.ok || !tasks.ok) return null;
    const goal = goals.data.find((g) => g.status === 'active');
    if (!goal) return null;
    const today = new Date().toISOString().slice(0, 10);
    const week = currentPlanWeek(goal.start_date, today);
    return week === null ? null : { tasks: tasks.data, week, today };
  } catch {
    return null;
  }
}

async function loadRebalance(plan: PlanState | null): Promise<RebalanceProposalView | null> {
  if (!plan) return null;
  try {
    const result = await proposeRebalance(plan.tasks, plan.week, plan.today);
    return result.ok ? result.data : null;
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const [focusTask, plan, connectedApps] = await Promise.all([
    loadFocusTask(),
    loadPlan(),
    loadConnectedApps(),
  ]);
  const velocity = plan ? computeVelocity(plan.tasks, plan.week, plan.today) : null;
  const rebalance = await loadRebalance(plan);
  return (
    <AppShell focusTask={focusTask} velocity={velocity} connectedApps={connectedApps} rebalance={rebalance} />
  );
}
