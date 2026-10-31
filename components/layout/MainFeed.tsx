import { AllDoneState } from '@/components/tasks/AllDoneState';
import { FocusTaskCard } from '@/components/tasks/FocusTaskCard';
import { LoadFailedState } from '@/components/tasks/LoadFailedState';
import { NoGoalsState } from '@/components/tasks/NoGoalsState';
import { NoTasksState } from '@/components/tasks/NoTasksState';
import { RecentlyDoneList } from '@/components/tasks/RecentlyDoneList';
import { SignedOutState } from '@/components/tasks/SignedOutState';
import { UpNextList } from '@/components/tasks/UpNextList';
import { VelocityHero } from '@/components/velocity/VelocityHero';
import type { VelocitySnapshot } from '@/lib/utils/velocity';
import type { FeedState, VelocityHint } from '@/types/channelViews';
import type { FocusFeed } from '@/types/focusFeed';
import type { TaskMoveChains } from '@/types/rebalance';

interface MainFeedProps {
  // Which screen to show. Decided where the views are built (buildChannelViews), never worked out from the feed.
  feedState: FeedState;
  feed: FocusFeed;
  velocity: VelocitySnapshot | null;
  // Why there is no velocity number, when that is on purpose (see types/channelViews.ts).
  velocityHint?: VelocityHint | null;
  // The goal channel the feed is for; null for all channels.
  channelTitle?: string | null;
  moveChains: TaskMoveChains;
  // Opens the goal wizard, for the empty states that offer a goal.
  onNewGoal: () => void;
  // True when the "No goals yet" card must not show (MOM-143): home shows the setup card, which says the same, or the person's
  // setup is saved and the old model's empty state would contradict it.
  hideNoGoals?: boolean;
  className?: string;
}

export function MainFeed({
  feedState,
  feed,
  velocity,
  velocityHint = null,
  channelTitle = null,
  moveChains,
  onNewGoal,
  hideNoGoals = false,
  className = '',
}: MainFeedProps) {
  const { focus, upNext, recentlyDone } = feed;
  return (
    <main className={`min-w-0 pt-5 ${className}`}>
      <p className="eyebrow">{channelTitle ?? 'All channels'}</p>
      <h1 className="mt-1.5 text-[25px] font-semibold leading-tight tracking-[-0.055em] min-[1200px]:text-[34px]">
        Make today count.
      </h1>
      {velocity ? (
        <div className="mt-5">
          <VelocityHero velocity={velocity} />
        </div>
      ) : (
        velocityHint === 'choose_channel' && (
          <section aria-label="Velocity" className="score-card mt-5">
            <div className="relative z-10 min-w-0">
              <p className="eyebrow">Velocity</p>
              <p className="mt-2 text-sm text-muted">
                Velocity is worked out for one goal at a time, because each goal&apos;s weeks count from its own start
                date. Choose a channel in the sidebar or from your goal cards to see it.
              </p>
            </div>
          </section>
        )
      )}
      {feedState === 'signed_out' && <SignedOutState />}
      {feedState === 'load_failed' && <LoadFailedState />}
      {feedState === 'no_goals' && !hideNoGoals && <NoGoalsState onNewGoal={onNewGoal} />}
      {feedState === 'no_tasks' && <NoTasksState channelTitle={channelTitle} onNewGoal={onNewGoal} />}
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
