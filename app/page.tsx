import { AppShell } from '@/components/layout/AppShell';
import { listConnectedApps } from '@/lib/services/integrations';
import { getPlanSnapshot, type PlanSnapshot } from '@/lib/services/tasks';
import { buildChannelViews } from '@/lib/utils/channelViews';
import { groupMovesByTask } from '@/lib/utils/rebalance';
import { EMPTY_CHANNEL_VIEWS } from '@/types/channelViews';
import type { ConnectedAppPublic } from '@/types/database.types';

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
// velocity and each channel's rebalance proposal. null shows the empty state when the data cannot be read
// (for example the Supabase env vars are not configured) instead of failing the page.
async function loadSnapshot(): Promise<PlanSnapshot | null> {
  try {
    const result = await getPlanSnapshot();
    return result.ok ? result.data : null;
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const [snapshot, connectedApps] = await Promise.all([loadSnapshot(), loadConnectedApps()]);
  // One view per active goal plus "all channels": its feed, velocity and rule-based rebalance proposal, each
  // from that goal's own tasks and start date. The sidebar switches between them in the browser, so no
  // selection is sent to the server and the server never trusts one.
  const views = snapshot
    ? buildChannelViews(snapshot.goals, snapshot.tasks, snapshot.history, snapshot.today)
    : EMPTY_CHANNEL_VIEWS;
  const moveChains = groupMovesByTask(snapshot?.history ?? []);
  return <AppShell views={views} connectedApps={connectedApps} moveChains={moveChains} />;
}
