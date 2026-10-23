import { AppShell } from '@/components/layout/AppShell';
import { listConnectedApps } from '@/lib/services/integrations';
import { getPlanSnapshot, proposeRebalance, type PlanSnapshot } from '@/lib/services/tasks';
import { buildChannelViews } from '@/lib/utils/channelViews';
import { groupMovesByTask } from '@/lib/utils/rebalance';
import { currentPlanWeek } from '@/lib/utils/velocity';
import { EMPTY_CHANNEL_VIEWS } from '@/types/channelViews';
import type { ConnectedAppPublic } from '@/types/database.types';
import type { RebalanceProposalView } from '@/types/rebalance';

// Reads the signed-in user's session, so this page renders per request.
export const dynamic = 'force-dynamic';

async function loadConnectedApps(): Promise<ConnectedAppPublic[]> {
  try {
    const result = await listConnectedApps();
    return result.ok ? result.data : [];
  } catch {
    return [];
  }
}

// The user's goals, tasks and move history, read once and shared by the channel feeds, each channel's
// velocity and rebalancing. null shows the empty state when the data cannot be read (for example the
// Supabase env vars are not configured) instead of failing the page.
async function loadSnapshot(): Promise<PlanSnapshot | null> {
  try {
    const result = await getPlanSnapshot();
    return result.ok ? result.data : null;
  } catch {
    return null;
  }
}

interface RebalancePlan {
  snapshot: PlanSnapshot;
  week: number;
}

// What rebalancing works from: all the user's tasks and the plan week of the first active goal (the default
// goal sorts first). null when there is no active goal. Rebalancing does not follow the selected channel yet
// (BACKLOG.md); the feeds and velocity do.
function rebalancePlanFrom(snapshot: PlanSnapshot | null): RebalancePlan | null {
  if (!snapshot) return null;
  const goal = snapshot.goals.find((g) => g.status === 'active');
  if (!goal) return null;
  const week = currentPlanWeek(goal.start_date, snapshot.today);
  return week === null ? null : { snapshot, week };
}

async function loadRebalance(plan: RebalancePlan | null): Promise<RebalanceProposalView | null> {
  if (!plan) return null;
  try {
    const result = await proposeRebalance(plan.snapshot.tasks, plan.week, plan.snapshot.today);
    return result.ok ? result.data : null;
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const [snapshot, connectedApps] = await Promise.all([loadSnapshot(), loadConnectedApps()]);
  // One view per active goal plus "all channels"; the sidebar switches between them in the browser, so no
  // selection is sent to the server and the server never trusts one.
  const views = snapshot
    ? buildChannelViews(snapshot.goals, snapshot.tasks, snapshot.history, snapshot.today)
    : EMPTY_CHANNEL_VIEWS;
  const moveChains = groupMovesByTask(snapshot?.history ?? []);
  const rebalance = await loadRebalance(rebalancePlanFrom(snapshot));
  return <AppShell views={views} connectedApps={connectedApps} rebalance={rebalance} moveChains={moveChains} />;
}
