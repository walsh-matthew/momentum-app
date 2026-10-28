'use client';

import { Check, Circle, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { tickChecklistStep, untickChecklistStep } from '@/app/actions/entries';
import type { LogDay, LogStep, LogTarget } from '@/types/entries';
import { DayPicker } from './DayPicker';
import { EntryFeedback } from './EntryFeedback';
import { useEntryAction } from './useEntryAction';

interface ChecklistControlProps {
  target: LogTarget;
  // The days the person can log on, or null/absent when they cannot choose one yet.
  days?: LogDay[] | null;
}

interface StepRowProps {
  step: LogStep;
  // The day for a first tick, or null for now. A step ticked before keeps its first time and ignores it.
  day: string | null;
  onTicked: () => void;
}

// One step. Ticking logs the step's one entry; un-ticking hides it and ticking again brings it back, so the tap is
// the same whichever way it goes. The state comes from the entries the page loaded, not from this row.
function StepRow({ step, day, onTicked }: StepRowProps) {
  const { pending, error, notice, run } = useEntryAction();

  const tick = () => run(() => (day === null ? tickChecklistStep(step.id) : tickChecklistStep(step.id, day)), onTicked);
  const untick = () => run(() => untickChecklistStep(step.id));

  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={step.ticked}
        aria-busy={pending}
        disabled={pending}
        onClick={step.ticked ? untick : tick}
        className="flex min-h-14 w-full items-center gap-4 rounded-2xl border border-border bg-secondary px-4 text-left transition-transform active:scale-[0.99] disabled:opacity-60"
      >
        <span className="task-check" aria-hidden="true">
          {pending ? <Loader2 className="size-[18px] animate-spin" /> : step.ticked ? <Check className="size-[18px]" /> : <Circle className="size-[20px]" />}
        </span>
        <span className={`min-w-0 flex-1 text-base${step.ticked ? ' text-muted line-through' : ''}`}>{step.title}</span>
      </button>
      <EntryFeedback error={error} notice={notice} />
    </li>
  );
}

// A checklist target: the steps of each item that feeds it, one large tick row per step. No keyboard. One day picker
// for the target says when the next first tick happened; it goes back to today after a tick.
export function ChecklistControl({ target, days = null }: ChecklistControlProps) {
  const [day, setDay] = useState<string | null>(null);

  if (target.items.length === 0) {
    return <p className="text-sm text-muted">No steps feed this target yet.</p>;
  }
  return (
    <div className="space-y-4">
      {days && <DayPicker days={days} value={day} onChange={setDay} name={target.title} caption="Day for the next tick" />}
      {target.items.map((item) => (
        <section key={item.id} aria-label={item.title}>
          <h4 className="mb-2 text-sm font-medium text-muted">{item.title}</h4>
          {item.steps.length === 0 ? (
            <p className="text-sm text-muted">This item has no steps yet.</p>
          ) : (
            <ul className="space-y-2">
              {item.steps.map((step) => (
                <StepRow key={step.id} step={step} day={day} onTicked={() => setDay(null)} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
