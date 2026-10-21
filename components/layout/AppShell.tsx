'use client';

import { useState } from 'react';
import { NavSidebar } from './NavSidebar';
import { MainFeed } from './MainFeed';
import { ConnectedStackPanel } from './ConnectedStackPanel';
import { MobileTabBar } from './MobileTabBar';
import type { WorkspaceView } from './panels';

// Owns only the mobile view selection. The initial state is a constant, so the
// server render and first client render match (no hydration mismatch).
export function AppShell() {
  const [view, setView] = useState<WorkspaceView>('feed');

  // Below lg only the active panel shows; from lg up all three show in a grid.
  const panelClass = (own: WorkspaceView) => (view === own ? 'flex' : 'hidden') + ' lg:flex';

  return (
    <div className="flex h-dvh flex-col lg:grid lg:grid-cols-[16rem_minmax(0,1fr)_22rem]">
      <NavSidebar className={panelClass('channels')} onNavigate={() => setView('feed')} />
      <MainFeed className={panelClass('feed')} />
      <ConnectedStackPanel className={panelClass('stack')} />
      <MobileTabBar active={view} onChange={setView} />
    </div>
  );
}
