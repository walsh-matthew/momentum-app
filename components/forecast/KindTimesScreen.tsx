'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { changeKindTime } from '@/app/actions/forecastEdits';
import { MainButton } from '@/components/ui/MainButton';
import { MissingCallout } from '@/components/ui/MissingCallout';
import { CAPACITY_UNITS, type CapacityUnit } from '@/types/database.types';
import { checkKindTime, hoursText } from '@/lib/forecast/edits';
import type { DayKindTimeView } from '@/types/forecastEdits';
import { EditNotes } from './EditNotes';
import { useEditAction } from './useEditAction';
import { AMOUNT_LABEL, HOURS, KINDS_PAGE_HELP, NO_KINDS_YET, SAVING, SESSIONS, SESSIONS_NOTE, saveKindTime, usuallyText } from './wording';

// The same look as the other fields (MOM-30): at least 44px tall, the 3:1 control border, no tint.
const FIELD = 'field-input min-h-11 w-full rounded-lg border ctl-45 px-3 text-base font-normal text-foreground placeholder:text-muted';
const LABEL = 'text-sm font-semibold text-foreground';
// A choice, the look of the week plan's days: at least 44px, the accent outline until it is on, then solid.
const CHOICE = 'min-h-11 min-w-11 flex-1 rounded-xl border px-3 text-sm font-medium transition-colors';
const UNIT_WORDS: Record<CapacityUnit, string> = { hours: HOURS, sessions: SESSIONS };

interface KindTimesScreenProps {
  kinds: DayKindTimeView[];
}

// How much time each of the person's own kinds of days usually gives (MOM-138). Said by the person, one kind at a time, in
// hours or in sessions, with nothing chosen for them. Momentum uses it only for the deadline check; it never fills in a day.
export function KindTimesScreen({ kinds }: KindTimesScreenProps) {
  const { pending, active, error, saved, run } = useEditAction();

  return (
    <div className="plan-screen">
      <p className="plan-note">{KINDS_PAGE_HELP}</p>
      <EditNotes error={error} saved={saved} />
      {kinds.length === 0 ? (
        <p className="plan-note">{NO_KINDS_YET}</p>
      ) : (
        kinds.map((kind) => <KindTime key={kind.id} kind={kind} pending={pending} active={active} run={run} />)
      )}
    </div>
  );
}

interface KindTimeProps {
  kind: DayKindTimeView;
  // Some tap is being saved: every control ignores a new tap until it is done.
  pending: boolean;
  // Which tap is being saved, so only its own button shows the busy word.
  active: string | null;
  run: ReturnType<typeof useEditAction>['run'];
}

function KindTime({ kind, pending, active, run }: KindTimeProps) {
  const ids = { title: useId(), amount: useId(), problem: useId() };
  // Nothing is chosen until the person chooses: a kind with no usual time starts with neither unit on.
  const [unit, setUnit] = useState<CapacityUnit | null>(kind.unit);
  const [amount, setAmount] = useState(kind.amount === null ? '' : hoursText(kind.amount));
  const [problem, setProblem] = useState<{ field: 'unit' | 'amount'; message: string } | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const unitsRef = useRef<HTMLDivElement>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const checked = checkKindTime(unit, amount);
    if (!checked.ok) {
      const field = unit === null ? 'unit' : 'amount';
      setProblem({ field, message: checked.error });
      if (field === 'unit') unitsRef.current?.querySelector<HTMLElement>('button')?.focus();
      else amountRef.current?.focus();
      return;
    }
    setProblem(null);
    run(`kind:${kind.id}`, () => changeKindTime(kind.id, unit, amount));
  }

  return (
    <section id={`kind-${kind.id}`} aria-labelledby={ids.title} className="plan-section plan-goal">
      <h2 id={ids.title} className="card-title">
        {kind.name}
      </h2>
      <p className="plan-note">{usuallyText(kind.unit, kind.amount)}</p>
      <form noValidate onSubmit={submit} className="grid gap-3">
        <div className="grid gap-1.5">
          <div ref={unitsRef} role="group" aria-label={`${kind.name}: ${HOURS} or ${SESSIONS}`} className="flex gap-1.5">
            {CAPACITY_UNITS.map((u) => (
              <button
                key={u}
                type="button"
                aria-pressed={unit === u}
                onClick={() => {
                  setUnit(u);
                  setProblem(null);
                }}
                className={`${CHOICE} ${unit === u ? 'border-transparent bg-primary text-primary-foreground' : 'answer-choice text-foreground'}`}
              >
                {UNIT_WORDS[u]}
              </button>
            ))}
          </div>
          <MissingCallout id={ids.problem} message={problem?.field === 'unit' ? problem.message : null} />
          {unit === 'sessions' && <p className="plan-note">{SESSIONS_NOTE}</p>}
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={ids.amount} className={LABEL}>
            {AMOUNT_LABEL}
          </label>
          <input
            ref={amountRef}
            id={ids.amount}
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setProblem(null);
            }}
            aria-invalid={problem?.field === 'amount' ? true : undefined}
            aria-describedby={problem?.field === 'amount' ? ids.problem : undefined}
            className={FIELD}
          />
          <MissingCallout id={ids.problem} message={problem?.field === 'amount' ? problem.message : null} />
        </div>
        <div>
          <MainButton type="submit" busy={active === `kind:${kind.id}`} busyLabel={SAVING}>
            {saveKindTime(kind.name)}
          </MainButton>
        </div>
      </form>
    </section>
  );
}
