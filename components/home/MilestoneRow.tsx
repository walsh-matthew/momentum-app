import Link from 'next/link';
import type { MilestoneView } from '@/types/home';
import type { LocalDate } from '@/types/scoreboard';
import { forecastLine, formatDay, stepsText, taskEditHref } from './wording';

const EDIT_THIS_TASK = 'Edit this task';

interface MilestoneRowProps {
  milestone: MilestoneView;
  // The steps as a list. Off in the deadlines hero, which shows only how far along each milestone is.
  showSteps?: boolean;
  // Name the goal the milestone belongs to (the deadlines hero lists milestones from every goal).
  showGoal?: boolean;
  // The person's today, so the due date reads "Due tomorrow" or "Due Fri, Nov 20" (MOM-111 finding 7).
  today?: LocalDate | null;
}

const CHIP_CLASS = { accent: 'chip chip-accent', warn: 'chip chip-warn', plain: 'chip' } as const;

// A milestone or a deadline task: the steps done and the due date, and for a deadline task whether the days the person set
// aside look like enough. That is a fact about those days, never a promise, and a milestone has none.
export function MilestoneRow({ milestone, showSteps = true, showGoal = false, today = null }: MilestoneRowProps) {
  const { title, goalTitle, dueOn, steps, forecast } = milestone;
  // A deadline task's own edit (MOM-138): its lines lead to it, and a task whose line does not gets the quiet link below.
  const task = milestone.kind === 'deadline_task' ? { id: milestone.id, dateCanMove: milestone.dateCanMove } : null;
  const line = forecast ? forecastLine(forecast, today, task) : null;
  const editHref = task ? taskEditHref(task.id) : null;
  const leadsToEdit = line !== null && line.links.some((l) => l.href.startsWith(`/task/${milestone.id}`));
  return (
    <div className="home-target">
      <div className="home-target-row">
        <h4>{title}</h4>
        {dueOn && <span className="chip">Due {formatDay(dueOn, today)}</span>}
      </div>
      {showGoal && <p className="home-note">{goalTitle}</p>}
      {/* No steps, nothing to count: "0 of 0 steps done" says nothing (MOM-138). */}
      {steps.length > 0 && (
        <p className="home-count">
          {milestone.stepsDone} of {steps.length}
          <span>{steps.length === 1 ? 'step' : 'steps'} done</span>
        </p>
      )}
      {forecast && line && (
        <div className="home-forecast" data-state={forecast.state}>
          {line.chip && <span className={CHIP_CLASS[line.chip.tone]}>{line.chip.label}</span>}
          <p className="home-note">{line.text}</p>
          {line.could && <p className="home-note">{line.could}</p>}
          {line.links.length > 0 && (
            <div className="home-forecast-links">
              {line.links.map((link) => (
                <Link key={link.href + link.label} href={link.href} className="review-link">
                  {link.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
      {forecast && editHref && !leadsToEdit && (
        <Link href={editHref} className="review-link">
          {EDIT_THIS_TASK}
        </Link>
      )}
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
