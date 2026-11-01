'use client';

import { useSearchParams } from 'next/navigation';
import { ConnectedStackPanel } from './ConnectedStackPanel';
import { MainFeed, showsOldFeed } from './MainFeed';
import { MobileHeader } from './MobileHeader';
import { WorkspaceSidebar } from './WorkspaceSidebar';
import { HomeScoreboardSection } from '@/components/home/HomeScoreboardSection';
import { ReviewNotice } from '@/components/home/ReviewNotice';
import { SetupLinkCard } from '@/components/home/SetupLinkCard';
import { CHANNEL_PARAM } from '@/lib/utils/channelParam';
import { resolveChannel } from '@/lib/utils/channelViews';
import { setupIsOffered } from '@/lib/utils/setupOffer';
import { ALL_CHANNELS, type ChannelViews } from '@/types/channelViews';
import type { ConnectedAppPublic } from '@/types/database.types';
import type { HomeScoreboard } from '@/types/home';
import type { HomePlanView } from '@/types/plan';
import type { TaskMoveChains } from '@/types/rebalance';
import type { ReviewPrompt } from '@/types/review';

interface AppShellProps {
  // One view (feed, velocity and rebalance proposal) per active goal channel plus all channels, built on the
  // server from the user's own data (see lib/utils/channelViews.ts). Home shows only the feed of the old model's
  // tasks, and only when there are some (MOM-115, trial subset).
  views: ChannelViews;
  connectedApps: ConnectedAppPublic[];
  // Each task's moves, from one history query on the page. Read by the focus card.
  moveChains: TaskMoveChains;
  // The signed-in user's email, for the avatar's initials; null when there is no session.
  userEmail?: string | null;
  // The goal model's week hero and goal scoreboards (MOM-112), shown above the feed. undefined shows nothing (signed
  // out); null means they could not be read, which is said in words and is not the same as having no goals.
  home?: HomeScoreboard | null;
  // What the person put on today and what is left over from last week (MOM-112 block 2), shown after the hero. undefined or
  // null shows nothing.
  plan?: HomePlanView | null;
  // The one line about the weekly review on the person's planning day (MOM-113). undefined or none shows nothing.
  reviewPrompt?: ReviewPrompt;
}

// The home page's layout. Below 1200px it is one scrolling column (sticky header, then the page); from 1200px it is three columns
// (sidebar, page, connected stack), arranged by CSS (app/globals.css). The old model's controls are not on home any more (MOM-115,
// trial subset): no goal wizard, no weekly pace, no rebalance, no goal channel list or goal cards. Their code stays until MOM-115 is
// done. The channel in the address (?channel=<goal id>, MOM-88) still chooses which old-model view the feed shows, so an old link
// keeps working; nothing on the page sets it. The server never uses it to load or filter anything.
export function AppShell({ views, connectedApps, moveChains, userEmail = null, home, plan, reviewPrompt }: AppShellProps) {
  const searchParams = useSearchParams();
  // A missing, mistyped, paused or foreign id is not one of this user's channels, so it falls back to all channels.
  const channelId = resolveChannel(views, searchParams.get(CHANNEL_PARAM) ?? ALL_CHANNELS);
  const channel = views.byChannel[channelId];
  const channelTitle = views.channels.find((c) => c.id === channelId)?.title ?? null;
  const burnoutRisk = channel.velocity?.risk ?? null;
  // The way back to setup shows while the first setup is not saved (MOM-143).
  const setupOffered = setupIsOffered(home);
  const oldFeedShown = showsOldFeed(channel.feedState);
  const sections = (
    <>
      {reviewPrompt !== undefined && <ReviewNotice prompt={reviewPrompt} />}
      {setupOffered && <SetupLinkCard />}
      {home !== undefined && <HomeScoreboardSection home={home} plan={plan} />}
    </>
  );

  return (
    <div className="desktop-shell">
      <WorkspaceSidebar ariaLabel="Workspace" active="dashboard" burnoutRisk={burnoutRisk} userEmail={userEmail} />
      <section className="desktop-workspace" aria-label="Daily workspace">
        <div className="workspace-content">
          <MobileHeader active="dashboard" userEmail={userEmail} burnoutRisk={burnoutRisk} />
          {oldFeedShown ? (
            <>
              {sections}
              <MainFeed
                feedState={channel.feedState}
                feed={channel.feed}
                velocity={channel.velocity}
                channelTitle={channelTitle}
                moveChains={moveChains}
              />
            </>
          ) : (
            // The old feed (which has its own main and heading) is not shown, so the page has its own, with a heading out of sight.
            <main className="min-w-0">
              <h1 className="sr-only">Momentum home</h1>
              {sections}
            </main>
          )}
        </div>
      </section>
      <div className="desktop-right">
        <ConnectedStackPanel connectedApps={connectedApps} />
      </div>
    </div>
  );
}
