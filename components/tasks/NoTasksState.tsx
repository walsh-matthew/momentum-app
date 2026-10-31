import { Button } from '@/components/ui/button';

export interface NoTasksStateProps {
  // The channel with no tasks; null for all channels (goals exist, none has a task).
  channelTitle?: string | null;
  // Opens the goal wizard (owned by AppShell, so this and the sidebar button open the same one).
  onNewGoal: () => void;
}

// A channel (or all channels) whose goals have no tasks at all (FeedState 'no_tasks'). Distinct from all done:
// nothing was ever planned here, so there is nothing to reopen.
export function NoTasksState({ channelTitle = null, onNewGoal }: NoTasksStateProps) {
  return (
    <section aria-labelledby="no-tasks-heading" className="channel-card mt-6 border-dashed p-6">
      <h2 id="no-tasks-heading" className="card-title">
        No tasks yet
      </h2>
      <p className="mt-2 text-sm text-muted">
        {channelTitle ? `${channelTitle} has no tasks yet.` : 'None of your goals has a task yet.'} You can start
        another goal while you decide what goes in here.
      </p>
      <Button variant="outline" onClick={onNewGoal} className="mt-4">
        Start another goal
      </Button>
    </section>
  );
}
