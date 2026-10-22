import { FocusTaskCard } from '@/components/tasks/FocusTaskCard';
import { VelocityHero } from '@/components/velocity/VelocityHero';
import type { VelocitySnapshot } from '@/lib/utils/velocity';
import type { MicroTask } from '@/types/database.types';
import type { TaskMoveChains } from '@/types/rebalance';

interface MainFeedProps {
  focusTask: MicroTask | null;
  velocity: VelocitySnapshot | null;
  moveChains: TaskMoveChains;
  className?: string;
}

export function MainFeed({ focusTask, velocity, moveChains, className = '' }: MainFeedProps) {
  return (
    <main className={`min-h-0 flex-1 flex-col overflow-y-auto p-4 lg:p-6 ${className}`}>
      {velocity && (
        <div className="mb-6">
          <VelocityHero velocity={velocity} />
        </div>
      )}
      <h1 className="text-xl font-semibold">Today</h1>
      {focusTask ? (
        <div className="mt-6">
          <FocusTaskCard key={focusTask.id} task={focusTask} moves={moveChains[focusTask.id] ?? []} />
        </div>
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
