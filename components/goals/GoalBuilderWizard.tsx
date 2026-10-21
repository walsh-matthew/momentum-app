'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { createGoalFromWizard } from '@/app/actions/goals';
import {
  CONSTRAINTS,
  CONSTRAINT_LABELS,
  GOAL_TYPES,
  GOAL_TYPE_LABELS,
  PACES,
  PACE_LABELS,
  REVIEW_PROMPTS,
  REVIEW_PROMPT_LABELS,
  WIZARD_STEPS,
  WIZARD_STEP_LABELS,
  type Constraint,
  type GoalType,
  type Pace,
  type ReviewPrompt,
  type WizardStep,
} from '@/lib/goals/vocabulary';
import {
  TITLE_MAX_LENGTH,
  buildStubTaskPlan,
  defaultTitleFor,
  parseWizardInput,
} from '@/lib/goals/taskPlan';
import type { GoalChannel } from '@/types/database.types';

interface GoalBuilderWizardProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (goal: GoalChannel) => void;
}

interface ChipProps {
  label: string;
  selected: boolean;
  onToggle: () => void;
}

function Chip({ label, selected, onToggle }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={`min-h-11 rounded-full border px-4 text-sm ${
        selected
          ? 'border-accent bg-accent/10 font-medium text-accent'
          : 'border-border hover:bg-foreground/5'
      }`}
    >
      {label}
    </button>
  );
}

const toggleIn = <T,>(list: T[], item: T) =>
  list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

interface WizardBodyProps {
  onClose: () => void;
  onCreated?: (goal: GoalChannel) => void;
  onPendingChange: (pending: boolean) => void;
}

// Mounted only while the dialog is open, so every open starts from a clean state.
function WizardBody({ onClose, onCreated, onPendingChange }: WizardBodyProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [goalType, setGoalType] = useState<GoalType | null>(null);
  const [title, setTitle] = useState('');
  const [titleEdited, setTitleEdited] = useState(false);
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [pace, setPace] = useState<Pace | null>(null);
  const [reviewPrompts, setReviewPrompts] = useState<ReviewPrompt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<GoalChannel | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => onPendingChange(pending), [pending, onPendingChange]);

  const step: WizardStep = WIZARD_STEPS[stepIndex];
  const isLast = stepIndex === WIZARD_STEPS.length - 1;

  const parsed = useMemo(
    () => parseWizardInput({ title, goalType, constraints, pace, reviewPrompts }),
    [title, goalType, constraints, pace, reviewPrompts],
  );
  const plan = useMemo(() => (parsed.ok ? buildStubTaskPlan(parsed.data) : null), [parsed]);

  // Step 1 is the only gated step; every chip group after it is optional.
  const canAdvance = step !== 'goal_type' || (goalType !== null && title.trim().length > 0);

  function pickGoalType(type: GoalType) {
    setGoalType(type);
    if (!titleEdited) setTitle(defaultTitleFor(type));
  }

  function submit() {
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createGoalFromWizard(parsed.data);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCreated(result.data);
      onCreated?.(result.data);
    });
  }

  if (created) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <h2 className="text-lg font-semibold">Goal created</h2>
        <p className="text-sm text-muted">
          <span className="font-medium text-foreground">{created.title}</span> is active
          {created.target_date ? ` with a day-90 checkpoint on ${created.target_date}` : ''}.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 self-end rounded-md bg-accent px-5 text-sm font-medium text-background"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (isLast) submit();
        else if (canAdvance) setStepIndex(stepIndex + 1);
      }}
      className="flex max-h-[85dvh] flex-col"
    >
      <header className="shrink-0 border-b border-border p-4 lg:px-6">
        <h2 className="text-lg font-semibold">New goal</h2>
        <ol className="mt-2 flex gap-2 text-xs" aria-label="Wizard steps">
          {WIZARD_STEPS.map((s, i) => (
            <li
              key={s}
              aria-current={i === stepIndex ? 'step' : undefined}
              className={i === stepIndex ? 'font-semibold text-accent' : 'text-muted'}
            >
              {i + 1}. {WIZARD_STEP_LABELS[s]}
            </li>
          ))}
        </ol>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:px-6">
        {step === 'goal_type' && (
          <div className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">What kind of goal is this?</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {GOAL_TYPES.map((t) => (
                  <Chip
                    key={t}
                    label={GOAL_TYPE_LABELS[t]}
                    selected={goalType === t}
                    onToggle={() => pickGoalType(t)}
                  />
                ))}
              </div>
            </fieldset>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Title
              <input
                type="text"
                value={title}
                maxLength={TITLE_MAX_LENGTH}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setTitleEdited(true);
                }}
                className="min-h-11 rounded-md border border-border bg-background px-3 text-base font-normal"
              />
            </label>
          </div>
        )}

        {step === 'constraints' && (
          <fieldset>
            <legend className="text-sm font-medium">Anything the plan should respect?</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {CONSTRAINTS.map((c) => (
                <Chip
                  key={c}
                  label={CONSTRAINT_LABELS[c]}
                  selected={constraints.includes(c)}
                  onToggle={() => setConstraints(toggleIn(constraints, c))}
                />
              ))}
            </div>
          </fieldset>
        )}

        {step === 'pace' && (
          <fieldset>
            <legend className="text-sm font-medium">How should the first week feel?</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {PACES.map((p) => (
                <Chip
                  key={p}
                  label={PACE_LABELS[p]}
                  selected={pace === p}
                  onToggle={() => setPace(pace === p ? null : p)}
                />
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">
              Lighter and heavier resize the starter plan. The others take effect once there is a week to
              rebalance; unfinished work is carried over, never cut.
            </p>
          </fieldset>
        )}

        {step === 'review' && (
          <div className="flex flex-col gap-5">
            <fieldset>
              <legend className="text-sm font-medium">What should the Friday review ask about?</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {REVIEW_PROMPTS.map((r) => (
                  <Chip
                    key={r}
                    label={REVIEW_PROMPT_LABELS[r]}
                    selected={reviewPrompts.includes(r)}
                    onToggle={() => setReviewPrompts(toggleIn(reviewPrompts, r))}
                  />
                ))}
              </div>
            </fieldset>

            <section aria-label="Summary" className="rounded-lg border border-border p-4 text-sm">
              <h3 className="font-medium">{title.trim() || 'Untitled goal'}</h3>
              <p className="mt-1 text-muted">
                {goalType ? GOAL_TYPE_LABELS[goalType] : 'No goal type'} · 90-day checkpoint
                {pace ? ` · ${PACE_LABELS[pace]}` : ''}
              </p>
              {constraints.length > 0 && (
                <p className="mt-1 text-muted">{constraints.map((c) => CONSTRAINT_LABELS[c]).join(', ')}</p>
              )}
            </section>

            {plan && (
              <section aria-label="Week 1 starter plan preview">
                <h3 className="text-sm font-medium">Week 1 starter plan (preview)</h3>
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {plan.tasks.map((t) => (
                    <li key={t.title} className="flex justify-between gap-3">
                      <span>{t.title}</span>
                      <span className="shrink-0 text-muted">{t.minutes} min</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted">
                  Tasks are not saved yet. Creating the goal saves the channel; you tick off your own work.
                </p>
              </section>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>

      <footer className="flex shrink-0 justify-between gap-2 border-t border-border p-4 lg:px-6">
        <button
          type="button"
          disabled={pending}
          onClick={() => (stepIndex === 0 ? onClose() : setStepIndex(stepIndex - 1))}
          className="min-h-11 rounded-md border border-border px-4 text-sm disabled:opacity-50"
        >
          {stepIndex === 0 ? 'Cancel' : 'Back'}
        </button>
        <button
          type="submit"
          disabled={pending || !canAdvance || (isLast && !parsed.ok)}
          className="min-h-11 rounded-md bg-accent px-5 text-sm font-medium text-background disabled:opacity-50"
        >
          {isLast ? (pending ? 'Creating…' : 'Create goal') : 'Next'}
        </button>
      </footer>
    </form>
  );
}

export function GoalBuilderWizard({ open, onClose, onCreated }: GoalBuilderWizardProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);

  // The native dialog gives focus trapping, Escape handling and a backdrop for free.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-label="New goal wizard"
      onClose={onClose}
      onCancel={(e) => {
        if (busy) e.preventDefault();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current && !busy) onClose();
      }}
      className="m-auto w-[min(36rem,calc(100vw-2rem))] rounded-xl border border-border bg-panel p-0 text-foreground backdrop:bg-black/50"
    >
      {open && <WizardBody onClose={onClose} onCreated={onCreated} onPendingChange={setBusy} />}
    </dialog>
  );
}
