'use client';

import { Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TASK_TYPE_LABELS } from '@/lib/tasks/labels';
import type { MicroTask } from '@/types/database.types';
import { useTaskToggle } from './useTaskToggle';

interface RecentlyDoneListProps {
  // The most recently completed tasks, newest first (buildFocusFeed).
  tasks: MicroTask[];
}

interface RecentlyDoneRowProps {
  task: MicroTask;
}

function RecentlyDoneRow({ task }: RecentlyDoneRowProps) {
  const { pending, error, toggle } = useTaskToggle(task.id);

  return (
    <li className="channel-card flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted line-through decoration-accent/60">{task.title}</p>
          <p className="mt-0.5 text-xs text-muted">
            {TASK_TYPE_LABELS[task.task_type]} · {task.minutes} min
          </p>
        </div>
        {/* One click puts the task back on the list. Only this click does it: nothing reopens a task for the user. */}
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => toggle('todo')}
          aria-label={`Reopen ${task.title}`}
          className="shrink-0"
        >
          {!pending && <Undo2 aria-hidden="true" />}
          {pending ? 'Reopening…' : 'Reopen'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </li>
  );
}

// The tasks the user just finished, each with a one-action undo. Reopening is the same user-initiated
// switch as ticking (setTaskStatus via the toggleTaskStatus action), so the same rules apply: it runs as
// the signed-in user, on their own task only (docs/NINETY_DAY_PLAN_CONTEXT.md §3, §5 rule 6).
export function RecentlyDoneList({ tasks }: RecentlyDoneListProps) {
  if (tasks.length === 0) return null;
  return (
    <section aria-labelledby="recently-done-heading">
      <h2 id="recently-done-heading" className="section-title">
        Recently done
      </h2>
      <ul className="mt-3 flex flex-col gap-2">
        {tasks.map((task) => (
          <RecentlyDoneRow key={task.id} task={task} />
        ))}
      </ul>
    </section>
  );
}
