'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { addStep, changeTaskDate, changeTaskSize, removeStep, renameStep } from '@/app/actions/forecastEdits';
import { MainButton } from '@/components/ui/MainButton';
import { MissingCallout } from '@/components/ui/MissingCallout';
import { RENAME_MISSING, checkNewDueDate, checkSizeHours, checkStepTitle, hoursText } from '@/lib/forecast/edits';
import type { TaskEditView, TaskStepView } from '@/types/forecastEdits';
import { EditNotes } from './EditNotes';
import { useEditAction } from './useEditAction';
import {
  ADD_STEP,
  ADD_STEP_LABEL,
  DATE_HEADING,
  MOVE_DATE,
  MOVE_DATE_LABEL,
  NEVER_MIND,
  REMOVE,
  RENAME,
  SAVE_NAME,
  SAVE_SIZE,
  SAVING,
  SIZE_HEADING,
  SIZE_HELP,
  SIZE_LABEL,
  STEPS_HEADING,
  STEPS_HELP,
  STEP_DONE,
  TASK_FINISHED,
  dueLine,
  goalLine,
} from './wording';

// The same look as the other fields (MOM-30): at least 44px tall, the 3:1 control border, no tint.
const FIELD = 'field-input min-h-11 w-full rounded-lg border ctl-45 px-3 text-base font-normal text-foreground placeholder:text-muted';
const LABEL = 'text-sm font-semibold text-foreground';

type Run = ReturnType<typeof useEditAction>['run'];

interface TaskEditScreenProps {
  task: TaskEditView;
}

// A deadline task's own edit (MOM-138): its rough size, its steps and, only when setup recorded that it can move, its due date.
// Every control is the person's tap and nothing is filled in for them. The main buttons are always there and solid; a tap
// with something missing answers with one plain callout that names it and moves to it (MOM-145). A finished task shows no
// controls. What was saved is read by home's forecast on its next load.
export function TaskEditScreen({ task }: TaskEditScreenProps) {
  const { pending, active, error, saved, run } = useEditAction();

  return (
    <div className="plan-screen">
      <p className="plan-note">{goalLine(task.goalTitle)}</p>
      <EditNotes error={error} saved={saved} />
      {task.finished ? (
        <p className="home-notice">{TASK_FINISHED}</p>
      ) : (
        <>
          <SizeSection task={task} pending={pending} active={active} run={run} />
          <StepsSection task={task} pending={pending} active={active} run={run} />
          <DateSection task={task} pending={pending} active={active} run={run} />
        </>
      )}
    </div>
  );
}

interface SectionProps {
  task: TaskEditView;
  // Some tap is being saved: every control ignores a new tap until it is done.
  pending: boolean;
  // Which tap is being saved, so only its own button shows the busy word.
  active: string | null;
  run: Run;
}

function SizeSection({ task, pending, active, run }: SectionProps) {
  const ids = { field: useId(), problem: useId() };
  const [hours, setHours] = useState(task.estimateHours === null ? '' : hoursText(task.estimateHours));
  const [problem, setProblem] = useState<string | null>(null);
  const fieldRef = useRef<HTMLInputElement>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const checked = checkSizeHours(hours);
    if (!checked.ok) {
      setProblem(checked.error);
      fieldRef.current?.focus();
      return;
    }
    setProblem(null);
    run('size', () => changeTaskSize(task.id, hours));
  }

  return (
    <section aria-labelledby="task-size" className="plan-section plan-goal">
      <h2 id="task-size" className="card-title">
        {SIZE_HEADING}
      </h2>
      <p className="plan-note">{SIZE_HELP}</p>
      <form noValidate onSubmit={submit} className="grid gap-3">
        <div className="grid gap-1.5">
          <label htmlFor={ids.field} className={LABEL}>
            {SIZE_LABEL}
          </label>
          <input
            ref={fieldRef}
            id={ids.field}
            name="hours"
            inputMode="decimal"
            autoComplete="off"
            value={hours}
            onChange={(e) => {
              setHours(e.target.value);
              setProblem(null);
            }}
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? ids.problem : undefined}
            className={FIELD}
          />
          <MissingCallout id={ids.problem} message={problem} />
        </div>
        <div>
          <MainButton type="submit" busy={active === 'size'} busyLabel={SAVING}>
            {SAVE_SIZE}
          </MainButton>
        </div>
      </form>
    </section>
  );
}

function StepsSection({ task, pending, active, run }: SectionProps) {
  const ids = { field: useId(), problem: useId() };
  const [title, setTitle] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const fieldRef = useRef<HTMLInputElement>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const checked = checkStepTitle(title);
    if (!checked.ok) {
      setProblem(checked.error);
      fieldRef.current?.focus();
      return;
    }
    setProblem(null);
    run('add', () => addStep(task.id, title), () => setTitle(''));
  }

  return (
    <section aria-labelledby="task-steps" className="plan-section plan-goal">
      <h2 id="task-steps" className="card-title">
        {STEPS_HEADING}
      </h2>
      <p className="plan-note">{STEPS_HELP}</p>
      {task.steps.length > 0 && (
        <ul className="edit-steps" aria-label={STEPS_HEADING}>
          {task.steps.map((step) => (
            <StepRow key={step.id} step={step} pending={pending} active={active} run={run} />
          ))}
        </ul>
      )}
      <form noValidate onSubmit={submit} className="grid gap-3">
        <div className="grid gap-1.5">
          <label htmlFor={ids.field} className={LABEL}>
            {ADD_STEP_LABEL}
          </label>
          <input
            ref={fieldRef}
            id={ids.field}
            name="title"
            autoComplete="off"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setProblem(null);
            }}
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? ids.problem : undefined}
            className={FIELD}
          />
          <MissingCallout id={ids.problem} message={problem} />
        </div>
        <div>
          <MainButton type="submit" busy={active === 'add'} busyLabel={SAVING}>
            {ADD_STEP}
          </MainButton>
        </div>
      </form>
    </section>
  );
}

interface StepRowProps {
  step: TaskStepView;
  pending: boolean;
  active: string | null;
  run: Run;
}

// A step that is not ticked can be renamed or removed; a ticked step shows "Done" and nothing else.
function StepRow({ step, pending, active, run }: StepRowProps) {
  const ids = { field: useId(), problem: useId() };
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(step.title);
  const [problem, setProblem] = useState<string | null>(null);
  const fieldRef = useRef<HTMLInputElement>(null);

  if (step.done) {
    return (
      <li className="edit-step" data-done="true">
        <span className="edit-step-title">{step.title}</span>
        <span className="chip chip-accent">{STEP_DONE}</span>
      </li>
    );
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const checked = checkStepTitle(title, RENAME_MISSING);
    if (!checked.ok) {
      setProblem(checked.error);
      fieldRef.current?.focus();
      return;
    }
    setProblem(null);
    run(`rename:${step.id}`, () => renameStep(step.id, title), () => setEditing(false));
  }

  if (editing) {
    return (
      <li className="edit-step">
        <form noValidate onSubmit={save} className="grid w-full gap-2">
          <input
            ref={fieldRef}
            id={ids.field}
            name="title"
            autoComplete="off"
            aria-label={`${RENAME} ${step.title}`}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setProblem(null);
            }}
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? ids.problem : undefined}
            className={FIELD}
          />
          <MissingCallout id={ids.problem} message={problem} />
          <div className="flex flex-wrap gap-2">
            <MainButton type="submit" busy={active === `rename:${step.id}`} busyLabel={SAVING}>
              {SAVE_NAME}
            </MainButton>
            <button
              type="button"
              className="plan-button"
              disabled={pending}
              onClick={() => {
                setEditing(false);
                setTitle(step.title);
                setProblem(null);
              }}
            >
              {NEVER_MIND}
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="edit-step">
      <span className="edit-step-title">{step.title}</span>
      <span className="edit-step-actions">
        <button
          type="button"
          className="plan-button"
          disabled={pending}
          aria-label={`${RENAME} ${step.title}`}
          onClick={() => {
            // It opens with the step's current name, so the person changes it rather than typing it all again.
            setTitle(step.title);
            setProblem(null);
            setEditing(true);
          }}
        >
          {RENAME}
        </button>
        <button type="button" className="plan-button" disabled={pending} aria-label={`${REMOVE} ${step.title}`} onClick={() => run(`remove:${step.id}`, () => removeStep(step.id))}>
          {REMOVE}
        </button>
      </span>
    </li>
  );
}

// The due date. Said as it is; changed only when setup recorded that it can move, and never to a day that has passed.
function DateSection({ task, pending, active, run }: SectionProps) {
  const ids = { field: useId(), problem: useId() };
  const [date, setDate] = useState(task.dueOn);
  const [problem, setProblem] = useState<string | null>(null);
  const fieldRef = useRef<HTMLInputElement>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const checked = checkNewDueDate(date, task.today);
    if (!checked.ok) {
      setProblem(checked.error);
      fieldRef.current?.focus();
      return;
    }
    setProblem(null);
    run('date', () => changeTaskDate(task.id, date));
  }

  return (
    <section id="date" aria-labelledby="task-date" className="plan-section plan-goal">
      <h2 id="task-date" className="card-title">
        {DATE_HEADING}
      </h2>
      <p className="plan-note">{dueLine(task.dueOn, task.today, task.dateCanMove)}</p>
      {task.dateCanMove && (
        <form noValidate onSubmit={submit} className="grid gap-3">
          <div className="grid gap-1.5">
            <label htmlFor={ids.field} className={LABEL}>
              {MOVE_DATE_LABEL}
            </label>
            <input
              ref={fieldRef}
              id={ids.field}
              name="date"
              type="date"
              min={task.today}
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setProblem(null);
              }}
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? ids.problem : undefined}
              className={FIELD}
            />
            <MissingCallout id={ids.problem} message={problem} />
          </div>
          <div>
            <MainButton type="submit" busy={active === 'date'} busyLabel={SAVING}>
              {MOVE_DATE}
            </MainButton>
          </div>
        </form>
      )}
    </section>
  );
}
