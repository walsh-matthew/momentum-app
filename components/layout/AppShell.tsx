'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { NavSidebar } from './NavSidebar';
import { MainFeed } from './MainFeed';
import { ConnectedStackPanel } from './ConnectedStackPanel';
import { GoalBuilderBanner } from './GoalBuilderBanner';
import { GoalCards } from './GoalCards';
import { MobileHeader } from './MobileHeader';
import { RebalanceNudge } from './RebalanceNudge';
import { GoalBuilderWizard } from '@/components/goals/GoalBuilderWizard';
import { HomeScoreboardSection } from '@/components/home/HomeScoreboardSection';
import { RebalanceDrawer } from '@/components/rebalance/RebalanceDrawer';
import { CHANNEL_PARAM, withChannelParam } from '@/lib/utils/channelParam';
import { resolveChannel } from '@/lib/utils/channelViews';
import { ALL_CHANNELS, type ChannelViews } from '@/types/channelViews';
import type { ConnectedAppPublic } from '@/types/database.types';
import type { HomeScoreboard } from '@/types/home';
import type { GoalProgress } from '@/types/progress';
import type { TaskMoveChains } from '@/types/rebalance';

interface AppShellProps {
  // One view (feed, velocity and rebalance proposal) per active goal channel plus all channels, built on the
  // server from the user's own data (see lib/utils/channelViews.ts). The sidebar only chooses between them.
  views: ChannelViews;
  connectedApps: ConnectedAppPublic[];
  // Each task's moves, from one history query on the page. Read by the focus card and the drawer.
  moveChains: TaskMoveChains;
  // Each active goal's tasks done and total, from the page's one snapshot (summarizeActiveGoalProgress).
  progress?: GoalProgress[];
  // The signed-in user's email, for the avatar's initials; null when there is no session.
  userEmail?: string | null;
  // The goal model's week hero and goal scoreboards (MOM-112), shown above the feed. undefined shows nothing (signed
  // out); null means they could not be read, which is said in words and is not the same as having no goals.
  home?: HomeScoreboard | null;
}

// The home page's layout. Below 1200px it is one scrolling column (sticky header, feed, goal cards, and the nudge
// as a bottom sheet); from 1200px it is three columns (sidebar, feed, connected stack and nudge). Both are the
// same elements, arranged by CSS (app/globals.css), so there is no view state to keep in step with the address.
// It owns only whether the rebalance drawer and the goal wizard are open. The selected goal channel is not
// state here: it is the ?channel=<goal id> in the address bar (MOM-88), read with useSearchParams. The page is
// rendered per request, so that hook has the same value on the server and in the browser's first render: a
// reload or a shared link lands on the right channel with no flash and no hydration mismatch. The server
// never uses the parameter to load or filter anything; it only chooses among the user's own views below.
export function AppShell({ views, connectedApps, moveChains, progress = [], userEmail = null, home }: AppShellProps) {
  const [rebalanceOpen, setRebalanceOpen] = useState(false);
  // The one goal wizard, opened from the sidebar, the banner and the empty states' call to action.
  const [wizardOpen, setWizardOpen] = useState(false);

  const searchParams = useSearchParams();
  // A missing, mistyped, paused or foreign id is not one of this user's channels, so it falls back to all channels.
  const channelId = resolveChannel(views, searchParams.get(CHANNEL_PARAM) ?? ALL_CHANNELS);
  const channel = views.byChannel[channelId];
  const channelTitle = views.channels.find((c) => c.id === channelId)?.title ?? null;
  const burnoutRisk = channel.velocity?.risk ?? null;
  // The plan could not be read: the wizard and the rebalance drawer need data that is not there, so their buttons are disabled.
  const loadFailed = channel.feedState === 'load_failed';

  // The address that selects a channel, for the goal cards' links. Built from the render's own search params, so
  // the server and the browser produce the same text.
  const hrefFor = (id: string) => `/${withChannelParam(searchParams.toString(), id)}`;

  // Puts the choice in the address bar with the browser's own history API, which Next.js syncs with
  // useSearchParams, so nothing is fetched and the back button steps through the choices. Reads the live URL,
  // not the render's, and does nothing when the address would not change (no duplicate history entries).
  function selectChannel(id: string) {
    const next = withChannelParam(window.location.search, id);
    if (next !== window.location.search) window.history.pushState(null, '', `${window.location.pathname}${next}`);
  }

  return (
    <>
      <div className="desktop-shell">
        <NavSidebar
          channels={views.channels}
          selected={channelId}
          onSelect={selectChannel}
          onAdjustPace={() => setRebalanceOpen(true)}
          onNewGoal={() => setWizardOpen(true)}
          progress={progress}
          burnoutRisk={burnoutRisk}
          actionsDisabled={loadFailed}
          userEmail={userEmail}
        />
        <section className="desktop-workspace" aria-label="Daily workspace">
          <div className="workspace-content">
            <MobileHeader active="dashboard" userEmail={userEmail} burnoutRisk={burnoutRisk} />
            <GoalBuilderBanner
              onNewGoal={() => setWizardOpen(true)}
              onAdjustPace={() => setRebalanceOpen(true)}
              actionsDisabled={loadFailed}
            />
            {home !== undefined && <HomeScoreboardSection home={home} />}
            <MainFeed
              feedState={channel.feedState}
              feed={channel.feed}
              velocity={channel.velocity}
              velocityHint={channel.velocityHint}
              channelTitle={channelTitle}
              moveChains={moveChains}
              onNewGoal={() => setWizardOpen(true)}
            />
            <GoalCards
              channels={views.channels}
              selected={channelId}
              hrefFor={hrefFor}
              onSelect={selectChannel}
              progress={progress}
            />
          </div>
        </section>
        <div className="desktop-right">
          <ConnectedStackPanel
            connectedApps={connectedApps}
            rebalance={channel.rebalance}
            rebalanceHint={channel.rebalanceHint}
            onOpenRebalance={() => setRebalanceOpen(true)}
          />
          <RebalanceNudge
            channelId={channelId}
            view={channel.rebalance}
            hint={channel.rebalanceHint}
            onReview={() => setRebalanceOpen(true)}
          />
        </div>
      </div>
      {/* Rendered here, outside the layout: a modal opened from inside a hidden part of it would be hidden too. */}
      <GoalBuilderWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
      <RebalanceDrawer
        open={rebalanceOpen}
        onClose={() => setRebalanceOpen(false)}
        view={channel.rebalance}
        channelId={channel.rebalanceChannelId}
        hint={channel.rebalanceHint}
        moveChains={moveChains}
      />
    </>
  );
}
