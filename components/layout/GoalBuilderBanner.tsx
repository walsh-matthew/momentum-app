import { Plus, SlidersHorizontal, Sparkles } from 'lucide-react';

interface GoalBuilderBannerProps {
  // Opens the goal wizard (the one AppShell renders).
  onNewGoal: () => void;
  // Opens the rebalance drawer, where any change is the user's own click.
  onAdjustPace: () => void;
  // True while the plan could not be loaded (FeedState 'load_failed'): the actions need data that was not read.
  actionsDisabled?: boolean;
}

// The wireframe's goal-builder banner. The copy shows from 1200px; the two actions show at every width, because
// below 1200px there is no sidebar to hold them. "Review Milestones" from the wireframe is left out: nothing in
// the app is a milestone review yet.
export function GoalBuilderBanner({ onNewGoal, onAdjustPace, actionsDisabled = false }: GoalBuilderBannerProps) {
  return (
    <section className="goal-builder-banner" aria-labelledby="goal-builder-title">
      <div className="goal-builder-copy">
        <span className="goal-builder-icon" aria-hidden="true">
          <Sparkles className="size-[17px]" />
        </span>
        <div>
          <p className="goal-builder-eyebrow">A calmer way to make progress</p>
          <h2 id="goal-builder-title">Shape your goals around real life.</h2>
          <p className="goal-builder-description">
            Start with a simple next step. Momentum will help you map the rest.
          </p>
        </div>
      </div>
      <div className="goal-builder-actions" role="group" aria-label="Quick goal actions">
        <button type="button" className="builder-chip" onClick={onNewGoal} disabled={actionsDisabled}>
          <Plus aria-hidden="true" />
          New Goal Wizard
        </button>
        <button type="button" className="builder-chip" onClick={onAdjustPace} disabled={actionsDisabled}>
          <SlidersHorizontal aria-hidden="true" />
          Adjust Weekly Pace
        </button>
      </div>
    </section>
  );
}
