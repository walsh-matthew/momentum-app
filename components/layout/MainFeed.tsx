import { FocusTaskCard } from '@/components/tasks/FocusTaskCard';
import { RecentlyDoneList } from '@/components/tasks/RecentlyDoneList';
import { UpNextList } from '@/components/tasks/UpNextList';
import { VelocityHero } from '@/components/velocity/VelocityHero';
import type { VelocitySnapshot } from '@/lib/utils/velocity';
import type { VelocityHint } from '@/types/channelViews';
import type { FocusFeed } from '@/types/focusFeed';
import type { TaskMoveChains } from '@/types/rebalance';

interface MainFeedProps {
  feed: FocusFeed;
  velocity: VelocitySnapshot | null;
  // Why there is no velocity number, when that is on purpose (see types/channelViews.ts).
  velocityHint?: VelocityHint | null;
  // The goal channel the feed is for; null for all channels.
  channelTitle?: string | null;
  moveChains: TaskMoveChains;
  className?: string;
}

export function MainFeed({
  feed,
  velocity,
  velocityHint = null,
  channelTitle = null,
  moveChains,
  className = '',
}: MainFeedProps) {
  const { focus, upNext, recentlyDone } = feed;
  return (
    <main className={`min-h-0 flex-1 flex-col overflow-y-auto p-4 lg:p-6 ${className}`}>
      {velocity ? (
        <div className="mb-6">
          <VelocityHero velocity={velocity} />
        </div>
      ) : (
        velocityHint === 'choose_channel' && (
          <section aria-label="Velocity" className="mb-6 rounded-lg border border-border bg-panel p-4 lg:p-6">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Velocity</p>
            <p className="mt-2 text-sm text-muted">
              Velocity is worked out for one goal at a time, because each goal&apos;s weeks count from its own start
              date. Choose a channel in the sidebar to see it.
            </p>
          </section>
        )
      )}
      <h1 className="text-xl font-semibold">Today</h1>
      {channelTitle && <p className="mt-1 text-sm text-muted">{channelTitle}</p>}
      {focus ? (
        <div className="mt-6 flex flex-col gap-6">
          <FocusTaskCard key={focus.id} task={focus} moves={moveChains[focus.id] ?? []} />
          <UpNextList tasks={upNext} />
          <RecentlyDoneList tasks={recentlyDone} />
        </div>
      ) : recentlyDone.length > 0 ? (
        // Nothing left to do, but the user may have just finished the last task by mistake: keep the undo.
        <>
          <p className="mt-1 text-sm text-muted">Everything on your list is done. Reopen a task if you need to.</p>
          <div className="mt-6">
            <RecentlyDoneList tasks={recentlyDone} />
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">Your execution feed will appear here.</p>
          {/* TODO(MOM-Phase2): placeholder empty state. Distinguish signed-out, no tasks, and all done once auth ships. */}
          <div className="mt-6 rounded-lg border border-dashed border-border p-6 text-sm text-muted">
            No tasks yet.
          </div>
        </>
      )}
    </main>
  );
}
