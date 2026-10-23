'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { NavSidebar } from './NavSidebar';
import { MainFeed } from './MainFeed';
import { ConnectedStackPanel } from './ConnectedStackPanel';
import { MobileTabBar } from './MobileTabBar';
import { GoalBuilderWizard } from '@/components/goals/GoalBuilderWizard';
import { RebalanceDrawer } from '@/components/rebalance/RebalanceDrawer';
import { CHANNEL_PARAM, withChannelParam } from '@/lib/utils/channelParam';
import { resolveChannel } from '@/lib/utils/channelViews';
import { ALL_CHANNELS, type ChannelViews } from '@/types/channelViews';
import type { ConnectedAppPublic } from '@/types/database.types';
import type { TaskMoveChains } from '@/types/rebalance';
import type { WorkspaceView } from './panels';

interface AppShellProps {
  // One view (feed, velocity and rebalance proposal) per active goal channel plus all channels, built on the
  // server from the user's own data (see lib/utils/channelViews.ts). The sidebar only chooses between them.
  views: ChannelViews;
  connectedApps: ConnectedAppPublic[];
  // Each task's moves, from one history query on the page. Read by the focus card and the drawer.
  moveChains: TaskMoveChains;
}

// Owns the mobile view selection and whether the rebalance drawer and the goal wizard are open. The selected goal channel is not
// state here: it is the ?channel=<goal id> in the address bar (MOM-88), read with useSearchParams. The page is
// rendered per request, so that hook has the same value on the server and in the browser's first render: a
// reload or a shared link lands on the right channel with no flash and no hydration mismatch. The server
// never uses the parameter to load or filter anything; it only chooses among the user's own views below.
export function AppShell({ views, connectedApps, moveChains }: AppShellProps) {
  const [view, setView] = useState<WorkspaceView>('feed');
  const [rebalanceOpen, setRebalanceOpen] = useState(false);
  // The one goal wizard, opened from the sidebar button and from the empty states' call to action.
  const [wizardOpen, setWizardOpen] = useState(false);

  const searchParams = useSearchParams();
  // A missing, mistyped, paused or foreign id is not one of this user's channels, so it falls back to all channels.
  const channelId = resolveChannel(views, searchParams.get(CHANNEL_PARAM) ?? ALL_CHANNELS);
  const channel = views.byChannel[channelId];
  const channelTitle = views.channels.find((c) => c.id === channelId)?.title ?? null;

  // Puts the choice in the address bar with the browser's own history API, which Next.js syncs with
  // useSearchParams, so nothing is fetched and the back button steps through the choices. Reads the live URL,
  // not the render's, and does nothing when the address would not change (no duplicate history entries).
  function selectChannel(id: string) {
    const next = withChannelParam(window.location.search, id);
    if (next !== window.location.search) window.history.pushState(null, '', `${window.location.pathname}${next}`);
  }

  // Below lg only the active panel shows; from lg up all three show in a grid.
  const panelClass = (own: WorkspaceView) => (view === own ? 'flex' : 'hidden') + ' lg:flex';

  return (
    <div className="flex h-dvh flex-col lg:grid lg:grid-cols-[16rem_minmax(0,1fr)_22rem]">
      <NavSidebar
        className={panelClass('channels')}
        channels={views.channels}
        selected={channelId}
        onSelect={(id) => {
          selectChannel(id);
          setView('feed');
        }}
        onAdjustPace={() => setRebalanceOpen(true)}
        onNewGoal={() => setWizardOpen(true)}
      />
      <MainFeed
        feedState={channel.feedState}
        feed={channel.feed}
        velocity={channel.velocity}
        velocityHint={channel.velocityHint}
        channelTitle={channelTitle}
        moveChains={moveChains}
        onNewGoal={() => setWizardOpen(true)}
        className={panelClass('feed')}
      />
      <ConnectedStackPanel
        connectedApps={connectedApps}
        rebalance={channel.rebalance}
        rebalanceHint={channel.rebalanceHint}
        onOpenRebalance={() => setRebalanceOpen(true)}
        className={panelClass('stack')}
      />
      <MobileTabBar active={view} onChange={setView} />
      {/* Rendered here, not inside a panel: below lg the inactive panels are display:none, which would hide a modal opened from one. */}
      <RebalanceDrawer
        open={rebalanceOpen}
        onClose={() => setRebalanceOpen(false)}
        view={channel.rebalance}
        channelId={channel.rebalanceChannelId}
        hint={channel.rebalanceHint}
        moveChains={moveChains}
      />
      <GoalBuilderWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  );
}
