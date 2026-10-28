import { AppShell } from '@/components/layout/AppShell';
import { getCurrentUser, type SessionUser } from '@/lib/services/auth';
import { listConnectedApps } from '@/lib/services/integrations';
import { getHomeScoreboard } from '@/lib/services/scoreboard';
import { getPlanSnapshot, type PlanSnapshot } from '@/lib/services/tasks';
import { buildChannelViews } from '@/lib/utils/channelViews';
import { summarizeActiveGoalProgress } from '@/lib/utils/progress';
import { groupMovesByTask } from '@/lib/utils/rebalance';
import { LOAD_FAILED_CHANNEL_VIEWS, SIGNED_OUT_CHANNEL_VIEWS } from '@/types/channelViews';
import type { ConnectedAppPublic } from '@/types/database.types';
import type { HomeScoreboard } from '@/types/home';

// Reads the signed-in user's session, so this page renders per request.
export const dynamic = 'force-dynamic';

// The signed-in user, or null when there is no session right now. proxy.ts redirects a signed-out visitor to
// /login before this page renders, so null means the session ended in between. A session that cannot be checked
// counts as none: the page then reads nothing.
async function sessionUser(): Promise<SessionUser | null> {
  try {
    const result = await getCurrentUser();
    return result.ok ? result.data : null;
  } catch {
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

// The user's goals, tasks and move history, read once and shared by the channel feeds, each channel's
// velocity and each channel's rebalance proposal. null means the data could not be read (an error result or a
// throw, for example the Supabase env vars are not configured); the page then shows the could-not-load state
// instead of failing. A read that succeeds is never null, even with no goals, so "failed" and "found nothing"
// stay apart.
async function loadSnapshot(): Promise<PlanSnapshot | null> {
  try {
    const result = await getPlanSnapshot();
    return result.ok ? result.data : null;
  } catch {
    return null;
  }
}

// The goal model's scoreboard (MOM-112), read on its own so a failure here never makes the plan below look failed, and
// the other way round. null means it could not be read (an error result or a throw); a read that succeeds is never
// null, even for a person with no goals.
async function loadHome(): Promise<HomeScoreboard | null> {
  try {
    const result = await getHomeScoreboard();
    return result.ok ? result.data : null;
  } catch {
    return null;
  }
}

export default async function HomePage() {
  // Asked first, so a signed-out render reads nothing.
  const user = await sessionUser();
  if (user === null) {
    return <AppShell views={SIGNED_OUT_CHANNEL_VIEWS} connectedApps={[]} moveChains={{}} />;
  }
  const [snapshot, connectedApps, home] = await Promise.all([loadSnapshot(), loadConnectedApps(), loadHome()]);
  // One view per active goal plus "all channels": its feed, velocity and rule-based rebalance proposal, each
  // from that goal's own tasks and start date. The sidebar switches between them in the browser, so no
  // selection is sent to the server and the server never trusts one.
  const views = snapshot
    ? buildChannelViews(snapshot.goals, snapshot.tasks, snapshot.history, snapshot.today)
    : LOAD_FAILED_CHANNEL_VIEWS;
  const moveChains = groupMovesByTask(snapshot?.history ?? []);
  // Progress per active goal for the sidebar and the goal cards, counted from the same snapshot (no second
  // read), so it only ever covers this user's own goals and tasks.
  const progress = snapshot ? summarizeActiveGoalProgress(snapshot.goals, snapshot.tasks, snapshot.today) : [];
  return (
    <AppShell
      views={views}
      connectedApps={connectedApps}
      moveChains={moveChains}
      progress={progress}
      userEmail={user.email}
      home={home}
    />
  );
}
