import { AllDoneState } from '@/components/tasks/AllDoneState';
import { FocusTaskCard } from '@/components/tasks/FocusTaskCard';
import { RecentlyDoneList } from '@/components/tasks/RecentlyDoneList';
import { SignedOutState } from '@/components/tasks/SignedOutState';
import { UpNextList } from '@/components/tasks/UpNextList';
import { VelocityHero } from '@/components/velocity/VelocityHero';
import type { VelocitySnapshot } from '@/lib/utils/velocity';
import type { FeedState } from '@/types/channelViews';
import type { FocusFeed } from '@/types/focusFeed';
import type { TaskMoveChains } from '@/types/rebalance';

interface MainFeedProps {
  // Which screen to show. Decided where the views are built (buildChannelViews), never worked out from the feed.
  feedState: FeedState;
  feed: FocusFeed;
  velocity: VelocitySnapshot | null;
  // The goal channel the feed is for; null for all channels.
  channelTitle?: string | null;
  moveChains: TaskMoveChains;
  className?: string;
}

// Whether home shows the old model's feed (MOM-115, trial subset): only when it has something to show, which is tasks to do, a
// finished list, or the signed-out card. Its empty and failed states are not shown on home any more: they offered the old wizard,
// said "No goals yet" to a person whose setup may be saved, or repeated what the scoreboard already says. The old model's code,
// tables and services stay until MOM-115 is done.
export function showsOldFeed(feedState: FeedState): boolean {
  return feedState === 'signed_out' || feedState === 'tasks' || feedState === 'all_done';
}

export function MainFeed({ feedState, feed, velocity, channelTitle = null, moveChains, className = '' }: MainFeedProps) {
  const { focus, upNext, recentlyDone } = feed;
  if (!showsOldFeed(feedState)) return null;
  return (
    <main className={`min-w-0 pt-5 ${className}`}>
      <p className="eyebrow">{channelTitle ?? 'All channels'}</p>
      <h1 className="mt-1.5 text-[25px] font-semibold leading-tight tracking-[-0.055em] min-[1200px]:text-[34px]">
        Make today count.
      </h1>
      {velocity && (
        <div className="mt-5">
          <VelocityHero velocity={velocity} />
        </div>
      )}
      {feedState === 'signed_out' && <SignedOutState />}
      {feedState === 'all_done' && (
        // Nothing left to do, but the user may have just finished the last task by mistake: keep the undo.
        <>
          <AllDoneState channelTitle={channelTitle} />
          <div className="mt-6">
            <RecentlyDoneList tasks={recentlyDone} />
          </div>
        </>
      )}
      {feedState === 'tasks' && focus && (
        <div className="mt-6 flex flex-col gap-6">
          <FocusTaskCard key={focus.id} task={focus} moves={moveChains[focus.id] ?? []} />
          <UpNextList tasks={upNext} />
          <RecentlyDoneList tasks={recentlyDone} />
        </div>
      )}
    </main>
  );
}
