'use client';

import { Check, Circle, Clock3, Loader2 } from 'lucide-react';
import { TASK_TYPE_LABELS } from '@/lib/tasks/labels';
import { describeMoveChain } from '@/lib/utils/rebalance';
import type { MicroTask } from '@/types/database.types';
import type { TaskMove } from '@/types/rebalance';
import { useTaskToggle } from './useTaskToggle';

interface FocusTaskCardProps {
  task: MicroTask;
  // Every move this task has made, oldest first (task_rebalance_history), passed in from the page's
  // single history query. The chips below show only the last hop; this shows the whole path.
  moves: TaskMove[];
}

// The user ticks their own task; the card never completes anything by itself
// (docs/NINETY_DAY_PLAN_CONTEXT.md §3).
export function FocusTaskCard({ task, moves }: FocusTaskCardProps) {
  const { pending, error, toggle } = useTaskToggle(task.id);
  const done = task.status === 'done';

  const onToggle = () => toggle(done ? 'todo' : 'done');
  const label = pending ? 'Saving…' : done ? 'Mark as not done' : 'Mark as done';

  return (
    <article aria-labelledby={`focus-task-${task.id}`} className={`focus-card${done ? ' is-complete' : ''}`}>
      {/* The check is the whole control. Its text is for screen readers (and is what shows the saving state);
          the icon changes shape between not done, saving and done, so the state never rests on color. */}
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        disabled={pending}
        onClick={onToggle}
        title={label}
        className="task-check mt-0.5"
      >
        {pending ? (
          <Loader2 className="size-[18px] animate-spin" aria-hidden="true" />
        ) : done ? (
          <Check className="size-[18px]" aria-hidden="true" />
        ) : (
          <Circle className="size-[20px]" aria-hidden="true" />
        )}
        <span className="sr-only">{label}</span>
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip chip-accent">{TASK_TYPE_LABELS[task.task_type]}</span>
          <span className="effort-tag">
            <Clock3 className="size-3" aria-hidden="true" />
            {task.minutes} min
          </span>
          {task.carried_from_week !== null && (
            <span className="chip">Carried over from week {task.carried_from_week}</span>
          )}
          {task.pulled_from_week !== null && (
            <span className="chip">Pulled forward from week {task.pulled_from_week}</span>
          )}
        </div>

        {moves.length > 1 && (
          <p className="mt-2 text-xs text-muted">
            Moved {moves.length} times: {describeMoveChain(moves)}
          </p>
        )}

        <h2 id={`focus-task-${task.id}`} className="mt-2.5 text-base font-semibold tracking-[-0.02em]">
          {task.title}
        </h2>

        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </article>
  );
}
