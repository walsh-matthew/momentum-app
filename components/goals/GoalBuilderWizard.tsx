'use client';

import { Check, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { createGoalWithPlanAction, generateWeekOnePlanAction } from '@/app/actions/goals';
import { Button } from '@/components/ui/button';
import { MainButton } from '@/components/ui/MainButton';
import { MissingCallout } from '@/components/ui/MissingCallout';
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
import { criteriaFor } from '@/lib/goals/criteria';
import {
  TITLE_MAX_LENGTH,
  buildStubTaskPlan,
  defaultTitleFor,
  parseWizardInput,
  type TaskPlan,
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
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm ${
        selected
          ? 'border-accent/50 bg-accent/10 font-medium text-accent'
          : 'border-input hover:bg-foreground/[0.06]'
      }`}
    >
      {/* The check repeats what aria-pressed says, so a selected chip is not told apart by color alone. */}
      {selected && <Check className="size-3.5 shrink-0" aria-hidden="true" />}
      {label}
    </button>
  );
}

const toggleIn = <T,>(list: T[], item: T) =>
  list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

// A week 1 plan the user is looking at. `forKey` ties it to the answers it was made for: change an answer
// and it no longer applies, so it is never saved against different answers.
interface PlanDraft {
  plan: TaskPlan;
  source: 'claude' | 'starter';
  model: string | null;
  forKey: string;
}

interface CreatedState {
  goal: GoalChannel;
  tasksSaved: number;
}

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
  const [missing, setMissing] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedState | null>(null);
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [planError, setPlanError] = useState<{ message: string; forKey: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [generating, startGenerating] = useTransition();

  const busy = pending || generating;
  useEffect(() => onPendingChange(busy), [busy, onPendingChange]);

  const step: WizardStep = WIZARD_STEPS[stepIndex];
  const isLast = stepIndex === WIZARD_STEPS.length - 1;

  const parsed = useMemo(
    () => parseWizardInput({ title, goalType, constraints, pace, reviewPrompts }),
    [title, goalType, constraints, pace, reviewPrompts],
  );
  const inputKey = parsed.ok ? JSON.stringify(parsed.data) : null;
  // Only a plan made for the current answers counts.
  const plan = draft && draft.forKey === inputKey ? draft : null;
  const shownPlanError = planError && planError.forKey === inputKey ? planError.message : null;

  // What the next tap needs first (MOM-145). Step 1 is the only gated step, and the last needs a week 1 plan; every chip group between is
  // optional. The button stays visible and solid either way: a tap with a gap shows the callout, focuses what is missing and sends nothing.
  function nextGap(): { message: string; target: 'goal-type' | 'title' | 'plan' } | null {
    if (step === 'goal_type') {
      if (goalType === null) return { message: 'Choose a kind of goal to continue.', target: 'goal-type' };
      if (title.trim().length === 0) return { message: 'Enter a title for your goal to continue.', target: 'title' };
    }
    if (isLast && plan === null) return { message: 'Make a week 1 plan first: generate one, or use the starter plan.', target: 'plan' };
    return null;
  }

  function pickGoalType(type: GoalType) {
    setGoalType(type);
    setMissing(null);
    if (!titleEdited) setTitle(defaultTitleFor(type));
  }

  // Runs only from the Generate button. Nothing calls it on load or from an effect: each call is a paid
  // model request. The plan is shown for review and saved only when the user confirms.
  function generate() {
    if (!parsed.ok || inputKey === null) return;
    const input = parsed.data;
    const forKey = inputKey;
    setPlanError(null);
    startGenerating(async () => {
      const result = await generateWeekOnePlanAction(input);
      if (!result.ok) {
        setPlanError({ message: result.error, forKey });
        return;
      }
      setDraft({ plan: result.data.plan, source: 'claude', model: result.data.model, forKey });
    });
  }

  // The rule-based plan, only when the user asks for it. It is never swapped in after a failure.
  function useStarterPlan() {
    if (!parsed.ok || inputKey === null) return;
    setPlanError(null);
    setDraft({ plan: buildStubTaskPlan(parsed.data), source: 'starter', model: null, forKey: inputKey });
  }

  function submit() {
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    if (!plan) {
      setError('Generate a week 1 plan, or choose the starter plan, before creating the goal.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createGoalWithPlanAction(parsed.data, plan.plan);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCreated(result.data);
      onCreated?.(result.data.goal);
    });
  }

  if (created) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-[-0.03em]">
          <span className="ai-icon" aria-hidden="true">
            <Check className="size-[17px]" />
          </span>
          Goal created
        </h2>
        <p className="text-sm text-muted">
          <span className="font-medium text-foreground">{created.goal.title}</span> is active
          {created.goal.target_date ? ` with a day-90 checkpoint on ${created.goal.target_date}` : ''}.{' '}
          {created.tasksSaved} week 1 {created.tasksSaved === 1 ? 'task is' : 'tasks are'} saved, all unticked.
        </p>
        <Button onClick={onClose} className="self-end">
          Done
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const gap = nextGap();
        setMissing(gap?.message ?? null);
        if (gap) {
          e.currentTarget.querySelector<HTMLElement>(`[data-gap="${gap.target}"]`)?.focus();
          return;
        }
        if (isLast) submit();
        else setStepIndex(stepIndex + 1);
      }}
      className="flex max-h-[85dvh] flex-col"
    >
      <header className="shrink-0 border-b border-border p-4 lg:px-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-[-0.03em]">
          <Sparkles className="size-4 text-accent" aria-hidden="true" />
          New goal
        </h2>
        <ol className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Wizard steps">
          {WIZARD_STEPS.map((s, i) => (
            <li
              key={s}
              aria-current={i === stepIndex ? 'step' : undefined}
              className={i === stepIndex ? 'font-semibold text-accent underline underline-offset-4' : 'text-muted'}
            >
              {i + 1}. {WIZARD_STEP_LABELS[s]}
            </li>
          ))}
        </ol>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:px-6">
        {step === 'goal_type' && (
          <div className="flex flex-col gap-4">
            <fieldset data-gap="goal-type" tabIndex={-1} className="flex flex-col gap-2 focus-visible:outline-offset-4">
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
                data-gap="title"
                value={title}
                maxLength={TITLE_MAX_LENGTH}
                onChange={(e) => {
                  setMissing(null);
                  setTitle(e.target.value);
                  setTitleEdited(true);
                }}
                className="min-h-11 rounded-lg border ctl-45 bg-background px-3 text-base font-normal"
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

            <section aria-label="Summary" className="channel-card p-4 text-sm">
              <h3 className="card-title">{title.trim() || 'Untitled goal'}</h3>
              <p className="mt-1 text-muted">
                {goalType ? GOAL_TYPE_LABELS[goalType] : 'No goal type'} · 90-day checkpoint
                {pace ? ` · ${PACE_LABELS[pace]}` : ''}
              </p>
              {constraints.length > 0 && (
                <p className="mt-1 text-muted">{constraints.map((c) => CONSTRAINT_LABELS[c]).join(', ')}</p>
              )}
            </section>

            {goalType && (
              <section aria-label="Completion criteria">
                <h3 className="text-sm font-medium">Completion criteria</h3>
                <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm">
                  {criteriaFor(goalType).map((c) => (
                    <li key={c.key}>{c.label}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted">
                  The goal starts with these, all unticked. You tick them off when the work is real.
                </p>
              </section>
            )}

            <section aria-label="Week 1 plan">
              <h3 className="text-sm font-medium">Week 1 plan</h3>
              <p className="mt-1 text-xs text-muted">
                Claude sees only what you entered in this wizard: your title, goal type, constraints, pace and
                review choices. Nothing from your other goals or tasks is sent.
              </p>

              {plan && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-accent">
                    {plan.source === 'claude'
                      ? `Written by Claude${plan.model ? ` (${plan.model})` : ''}`
                      : 'Starter plan (rule-based, not written by Claude)'}
                  </p>
                  <ul className="mt-2 flex flex-col gap-1 text-sm">
                    {plan.plan.tasks.map((t, i) => (
                      <li key={`${i}-${t.title}`} className="flex justify-between gap-3">
                        <span>{t.title}</span>
                        <span className="shrink-0 text-muted">{t.minutes} min</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted">
                    Creating the goal saves these as week 1 tasks, all unticked. You tick off your own work.
                  </p>
                </div>
              )}

              {generating && (
                <p role="status" className="mt-3 text-sm text-muted">
                  Asking Claude to write your week 1 plan…
                </p>
              )}

              {shownPlanError && (
                <p role="alert" className="mt-3 text-sm text-danger">
                  {shownPlanError} Nothing was saved or substituted.
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" data-gap="plan" onClick={generate} disabled={busy || !parsed.ok}>
                  {generating
                    ? 'Asking Claude…'
                    : shownPlanError
                      ? 'Try again'
                      : plan
                        ? 'Ask Claude again'
                        : 'Generate week 1 plan with Claude'}
                </Button>
                {plan?.source !== 'starter' && (
                  <Button variant="outline" onClick={useStarterPlan} disabled={busy || !parsed.ok}>
                    Use the starter plan instead
                  </Button>
                )}
              </div>
            </section>
          </div>
        )}

        {missing !== null && (
          <div className="mt-4">
            <MissingCallout message={missing} />
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      <footer className="flex shrink-0 justify-between gap-2 border-t border-border p-4 lg:px-6">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => (stepIndex === 0 ? onClose() : setStepIndex(stepIndex - 1))}
        >
          {stepIndex === 0 ? 'Cancel' : 'Back'}
        </Button>
        <MainButton type="submit" busy={busy} busyLabel={isLast && pending ? 'Creating…' : undefined}>
          {isLast ? 'Create goal' : 'Next'}
        </MainButton>
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
      className="sheet-surface m-auto w-[min(36rem,calc(100vw-2rem))] rounded-2xl p-0 text-foreground backdrop:bg-black/60"
    >
      {open && <WizardBody onClose={onClose} onCreated={onCreated} onPendingChange={setBusy} />}
    </dialog>
  );
}
