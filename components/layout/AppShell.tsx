'use client';

import { useState } from 'react';
import { NavSidebar } from './NavSidebar';
import { MainFeed } from './MainFeed';
import { ConnectedStackPanel } from './ConnectedStackPanel';
import { MobileTabBar } from './MobileTabBar';
import { RebalanceDrawer } from '@/components/rebalance/RebalanceDrawer';
import type { VelocitySnapshot } from '@/lib/utils/velocity';
import type { ConnectedAppPublic, MicroTask } from '@/types/database.types';
import type { RebalanceProposalView, TaskMoveChains } from '@/types/rebalance';
import type { WorkspaceView } from './panels';

interface AppShellProps {
  focusTask: MicroTask | null;
  velocity: VelocitySnapshot | null;
  connectedApps: ConnectedAppPublic[];
  rebalance: RebalanceProposalView | null;
  // Each task's moves, from one history query on the page. Read by the focus card and the drawer.
  moveChains: TaskMoveChains;
}

// Owns the mobile view selection and whether the rebalance drawer is open. The initial state is a
// constant, so the server render and first client render match (no hydration mismatch).
export function AppShell({ focusTask, velocity, connectedApps, rebalance, moveChains }: AppShellProps) {
  const [view, setView] = useState<WorkspaceView>('feed');
  const [rebalanceOpen, setRebalanceOpen] = useState(false);

  // Below lg only the active panel shows; from lg up all three show in a grid.
  const panelClass = (own: WorkspaceView) => (view === own ? 'flex' : 'hidden') + ' lg:flex';

  return (
    <div className="flex h-dvh flex-col lg:grid lg:grid-cols-[16rem_minmax(0,1fr)_22rem]">
      <NavSidebar
        className={panelClass('channels')}
        onNavigate={() => setView('feed')}
        onAdjustPace={() => setRebalanceOpen(true)}
      />
      <MainFeed focusTask={focusTask} velocity={velocity} moveChains={moveChains} className={panelClass('feed')} />
      <ConnectedStackPanel
        connectedApps={connectedApps}
        rebalance={rebalance}
        onOpenRebalance={() => setRebalanceOpen(true)}
        className={panelClass('stack')}
      />
      <MobileTabBar active={view} onChange={setView} />
      {/* Rendered here, not inside a panel: below lg the inactive panels are display:none, which would hide a modal opened from one. */}
      <RebalanceDrawer
        open={rebalanceOpen}
        onClose={() => setRebalanceOpen(false)}
        view={rebalance}
        moveChains={moveChains}
      />
    </div>
  );
}
