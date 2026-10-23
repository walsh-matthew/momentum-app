import { AppShell } from '@/components/layout/AppShell';
import { listGoalChannels } from '@/lib/services/goals';
import { listConnectedApps } from '@/lib/services/integrations';
import { getFocusFeed, listMicroTasks, listRebalanceHistory, proposeRebalance } from '@/lib/services/tasks';
import { groupMovesByTask } from '@/lib/utils/rebalance';
import { computeVelocity, currentPlanWeek } from '@/lib/utils/velocity';
import type { ConnectedAppPublic, MicroTask, TaskRebalanceHistory } from '@/types/database.types';
import { EMPTY_FOCUS_FEED, type FocusFeed } from '@/types/focusFeed';
import type { RebalanceProposalView } from '@/types/rebalance';

// Reads the signed-in user's session, so this page renders per request.
export const dynamic = 'force-dynamic';

async function loadFocusFeed(): Promise<FocusFeed> {
  try {
    const result = await getFocusFeed();
    return result.ok ? result.data : EMPTY_FOCUS_FEED;
  } catch {
    // Supabase env vars are not configured; show the empty state instead of failing the page.
    return EMPTY_FOCUS_FEED;
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
  // Every move the user's tasks have made, read once here for velocity, the focus card and the drawer.
  history: TaskRebalanceHistory[];
  week: number;
  today: string;
}

// The user's tasks, their move history and the plan week of the first active goal (the default goal
// sorts first), read once and shared by velocity, the focus card and rebalancing. null hides them
// when there is no goal or the data cannot be read. History is one query for all tasks, never one
// per task, and losing it only drops the chain detail: the plan still loads.
async function loadPlan(): Promise<PlanState | null> {
  try {
    const [goals, tasks, history] = await Promise.all([
      listGoalChannels(),
      listMicroTasks(),
      listRebalanceHistory(),
    ]);
    if (!goals.ok || !tasks.ok) return null;
    const goal = goals.data.find((g) => g.status === 'active');
    if (!goal) return null;
    const today = new Date().toISOString().slice(0, 10);
    const week = currentPlanWeek(goal.start_date, today);
    return week === null ? null : { tasks: tasks.data, history: history.ok ? history.data : [], week, today };
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
  const [feed, plan, connectedApps] = await Promise.all([
    loadFocusFeed(),
    loadPlan(),
    loadConnectedApps(),
  ]);
  const velocity = plan ? computeVelocity(plan.tasks, plan.week, plan.today, plan.history) : null;
  const moveChains = groupMovesByTask(plan?.history ?? []);
  const rebalance = await loadRebalance(plan);
  return (
    <AppShell
      feed={feed}
      velocity={velocity}
      connectedApps={connectedApps}
      rebalance={rebalance}
      moveChains={moveChains}
    />
  );
}
