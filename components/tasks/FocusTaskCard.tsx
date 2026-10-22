'use client';

import { useState, useTransition } from 'react';
import { toggleTaskStatus } from '@/app/actions/tasks';
import { TASK_TYPE_LABELS } from '@/lib/tasks/labels';
import { describeMoveChain } from '@/lib/utils/rebalance';
import type { MicroTask } from '@/types/database.types';
import type { TaskMove } from '@/types/rebalance';

interface FocusTaskCardProps {
  task: MicroTask;
  // Every move this task has made, oldest first (task_rebalance_history), passed in from the page's
  // single history query. The chips below show only the last hop; this shows the whole path.
  moves: TaskMove[];
}

// The user ticks their own task; the card never completes anything by itself
// (docs/NINETY_DAY_PLAN_CONTEXT.md §3).
export function FocusTaskCard({ task, moves }: FocusTaskCardProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const done = task.status === 'done';

  const onToggle = () => {
    setError(null);
    startTransition(async () => {
      const result = await toggleTaskStatus(task.id, done ? 'todo' : 'done');
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <article
      aria-labelledby={`focus-task-${task.id}`}
      className="rounded-lg border border-border bg-panel p-4 lg:p-6"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-accent/10 px-2.5 py-1 font-medium text-accent">
          {TASK_TYPE_LABELS[task.task_type]}
        </span>
        <span className="text-muted">{task.minutes} min</span>
        {task.carried_from_week !== null && (
          <span className="rounded-full border border-border px-2.5 py-1 text-muted">
            Carried over from week {task.carried_from_week}
          </span>
        )}
        {task.pulled_from_week !== null && (
          <span className="rounded-full border border-border px-2.5 py-1 text-muted">
            Pulled forward from week {task.pulled_from_week}
          </span>
        )}
      </div>

      {moves.length > 1 && (
        <p className="mt-2 text-xs text-muted">
          Moved {moves.length} times: {describeMoveChain(moves)}
        </p>
      )}

      <h2
        id={`focus-task-${task.id}`}
        className={`mt-3 text-lg font-semibold ${done ? 'text-muted line-through' : ''}`}
      >
        {task.title}
      </h2>

      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        disabled={pending}
        onClick={onToggle}
        className={`mt-4 min-h-11 w-full rounded-md border px-4 text-sm font-medium disabled:opacity-60 sm:w-auto ${
          done
            ? 'border-border hover:bg-foreground/5'
            : 'border-accent bg-accent text-background hover:opacity-90'
        }`}
      >
        {pending ? 'Saving…' : done ? 'Mark as not done' : 'Mark as done'}
      </button>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </article>
  );
}
