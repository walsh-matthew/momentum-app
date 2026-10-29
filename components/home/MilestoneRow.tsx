import type { MilestoneView } from '@/types/home';
import type { LocalDate } from '@/types/scoreboard';
import { formatDay, stepsText } from './wording';

interface MilestoneRowProps {
  milestone: MilestoneView;
  // The steps as a list. Off in the deadlines hero, which shows only how far along each milestone is.
  showSteps?: boolean;
  // Name the goal the milestone belongs to (the deadlines hero lists milestones from every goal).
  showGoal?: boolean;
  // The person's today, so the due date reads "Due tomorrow" or "Due Fri, Nov 20" (MOM-111 finding 7).
  today?: LocalDate | null;
}

// A milestone or a deadline task: the steps done and the due date. There is no forecast verdict here: it needs the days
// the person has set aside, which come with the weekly plan, so nothing is said about whether it fits.
export function MilestoneRow({ milestone, showSteps = true, showGoal = false, today = null }: MilestoneRowProps) {
  const { title, goalTitle, dueOn, steps } = milestone;
  return (
    <div className="home-target">
      <div className="home-target-row">
        <h4>{title}</h4>
        {dueOn && <span className="chip">Due {formatDay(dueOn, today)}</span>}
      </div>
      {showGoal && <p className="home-note">{goalTitle}</p>}
      <p className="home-count">
        {milestone.stepsDone} of {steps.length}
        <span>{steps.length === 1 ? 'step' : 'steps'} done</span>
      </p>
      {showSteps && steps.length > 0 && (
        <ul className="home-steps" aria-label={stepsText(milestone)}>
          {steps.map((s) => (
            <li key={s.id} data-done={s.done ? 'true' : undefined}>
              <i aria-hidden="true" />
              <span className="sr-only">{s.done ? 'Done: ' : 'To do: '}</span>
              {s.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
