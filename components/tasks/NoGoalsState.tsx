export interface NoGoalsStateProps {
  // Opens the goal wizard (owned by AppShell, so this and the sidebar button open the same one).
  onNewGoal: () => void;
}

// Signed in with no active goal channel (FeedState 'no_goals'): there is nothing to show yet, and the next
// step is the wizard. Opening it creates nothing; the user's own answers do.
export function NoGoalsState({ onNewGoal }: NoGoalsStateProps) {
  return (
    <section aria-labelledby="no-goals-heading" className="mt-6 rounded-lg border border-dashed border-border p-6">
      <h2 id="no-goals-heading" className="text-sm font-semibold">
        No goals yet
      </h2>
      <p className="mt-2 text-sm text-muted">
        Start with a goal and the wizard will build your first week of tasks.
      </p>
      <button
        type="button"
        onClick={onNewGoal}
        className="mt-4 min-h-11 rounded-md bg-accent px-5 text-sm font-medium text-background"
      >
        Set up your first goal
      </button>
    </section>
  );
}
