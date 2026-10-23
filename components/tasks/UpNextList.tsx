import { TASK_TYPE_LABELS } from '@/lib/tasks/labels';
import type { MicroTask } from '@/types/database.types';

interface UpNextListProps {
  // The unfinished tasks after the focus task, already in work order (buildFocusFeed).
  tasks: MicroTask[];
}

// What is queued behind the focus task. Read-only on purpose: there is one task in focus at a time, and
// completing a task is the user's own tick on the focus card (docs/NINETY_DAY_PLAN_CONTEXT.md §3).
export function UpNextList({ tasks }: UpNextListProps) {
  return (
    <section aria-labelledby="up-next-heading">
      <h2 id="up-next-heading" className="text-sm font-semibold">
        Up next
      </h2>
      {tasks.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Nothing is queued after this one.</p>
      ) : (
        <ol className="mt-2 flex flex-col divide-y divide-border rounded-lg border border-border bg-panel">
          {tasks.map((task) => (
            <li key={task.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <span className="text-sm">{task.title}</span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <span>{TASK_TYPE_LABELS[task.task_type]}</span>
                <span>{task.minutes} min</span>
                <span>Week {task.week_of}</span>
                {task.carried_from_week !== null && <span>Carried over from week {task.carried_from_week}</span>}
                {task.pulled_from_week !== null && <span>Pulled forward from week {task.pulled_from_week}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
