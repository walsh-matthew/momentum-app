import { Clock3 } from 'lucide-react';
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
      <h2 id="up-next-heading" className="section-title">
        Up next
      </h2>
      {tasks.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Nothing is queued after this one.</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-2">
          {tasks.map((task) => (
            <li key={task.id} className="channel-card flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <span className="text-sm font-medium">{task.title}</span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <span>{TASK_TYPE_LABELS[task.task_type]}</span>
                <span className="inline-flex items-center gap-1">
                  <Clock3 className="size-3" aria-hidden="true" />
                  {task.minutes} min
                </span>
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
