'use client';

import { useState } from 'react';
import { NavSidebar } from './NavSidebar';
import { MainFeed } from './MainFeed';
import { ConnectedStackPanel } from './ConnectedStackPanel';
import { MobileTabBar } from './MobileTabBar';
import { RebalanceDrawer } from '@/components/rebalance/RebalanceDrawer';
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

// Owns the mobile view selection, the selected goal channel and whether the rebalance drawer is open. The
// initial state is constant (feed panel, all channels), so the server render and first client render match
// (no hydration mismatch).
export function AppShell({ views, connectedApps, moveChains }: AppShellProps) {
  const [view, setView] = useState<WorkspaceView>('feed');
  const [selected, setSelected] = useState<string>(ALL_CHANNELS);
  const [rebalanceOpen, setRebalanceOpen] = useState(false);

  // A selection that is no longer a channel (the goal was paused, say) falls back to all channels.
  const channelId = resolveChannel(views, selected);
  const channel = views.byChannel[channelId];
  const channelTitle = views.channels.find((c) => c.id === channelId)?.title ?? null;

  // Below lg only the active panel shows; from lg up all three show in a grid.
  const panelClass = (own: WorkspaceView) => (view === own ? 'flex' : 'hidden') + ' lg:flex';

  return (
    <div className="flex h-dvh flex-col lg:grid lg:grid-cols-[16rem_minmax(0,1fr)_22rem]">
      <NavSidebar
        className={panelClass('channels')}
        channels={views.channels}
        selected={channelId}
        onSelect={(id) => {
          setSelected(id);
          setView('feed');
        }}
        onAdjustPace={() => setRebalanceOpen(true)}
      />
      <MainFeed
        feed={channel.feed}
        velocity={channel.velocity}
        velocityHint={channel.velocityHint}
        channelTitle={channelTitle}
        moveChains={moveChains}
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
    </div>
  );
}
