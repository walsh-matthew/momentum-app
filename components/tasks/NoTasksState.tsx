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
    <section aria-labelledby="no-tasks-heading" className="mt-6 rounded-lg border border-dashed border-border p-6">
      <h2 id="no-tasks-heading" className="text-sm font-semibold">
        No tasks yet
      </h2>
      <p className="mt-2 text-sm text-muted">
        {channelTitle ? `${channelTitle} has no tasks yet.` : 'None of your goals has a task yet.'} You can start
        another goal while you decide what goes in here.
      </p>
      <button
        type="button"
        onClick={onNewGoal}
        className="mt-4 min-h-11 rounded-md border border-border px-5 text-sm font-medium hover:bg-foreground/5"
      >
        Start another goal
      </button>
    </section>
  );
}
