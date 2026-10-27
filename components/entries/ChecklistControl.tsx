'use client';

import { Check, Circle, Loader2 } from 'lucide-react';
import { tickChecklistStep, untickChecklistStep } from '@/app/actions/entries';
import type { LogStep, LogTarget } from '@/types/entries';
import { useEntryAction } from './useEntryAction';

interface ChecklistControlProps {
  target: LogTarget;
}

interface StepRowProps {
  step: LogStep;
}

// One step. Ticking logs the step's one entry; un-ticking hides it and ticking again brings it back, so the tap is
// the same whichever way it goes. The state comes from the entries the page loaded, not from this row.
function StepRow({ step }: StepRowProps) {
  const { pending, error, run } = useEntryAction();

  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={step.ticked}
        aria-busy={pending}
        disabled={pending}
        onClick={() => run(() => (step.ticked ? untickChecklistStep(step.id) : tickChecklistStep(step.id)))}
        className="flex min-h-14 w-full items-center gap-4 rounded-2xl border border-border bg-secondary px-4 text-left transition-transform active:scale-[0.99] disabled:opacity-60"
      >
        <span className="task-check" aria-hidden="true">
          {pending ? <Loader2 className="size-[18px] animate-spin" /> : step.ticked ? <Check className="size-[18px]" /> : <Circle className="size-[20px]" />}
        </span>
        <span className={`min-w-0 flex-1 text-base${step.ticked ? ' text-muted line-through' : ''}`}>{step.title}</span>
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </li>
  );
}

// A checklist target: the steps of each item that feeds it, one large tick row per step. No keyboard.
export function ChecklistControl({ target }: ChecklistControlProps) {
  if (target.items.length === 0) {
    return <p className="text-sm text-muted">No steps feed this target yet.</p>;
  }
  return (
    <div className="space-y-4">
      {target.items.map((item) => (
        <section key={item.id} aria-label={item.title}>
          <h4 className="mb-2 text-sm font-medium text-muted">{item.title}</h4>
          {item.steps.length === 0 ? (
            <p className="text-sm text-muted">This item has no steps yet.</p>
          ) : (
            <ul className="space-y-2">
              {item.steps.map((step) => (
                <StepRow key={step.id} step={step} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
