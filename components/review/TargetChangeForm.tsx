'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { changeTarget } from '@/app/actions/targetChange';
import { weekdayName } from '@/components/home/wording';
import { MainButton } from '@/components/ui/MainButton';
import { MissingCallout } from '@/components/ui/MissingCallout';
import { CHANGE_SAVE_FAILED, checkChange, type ChangeField } from '@/lib/review/targetChange';
import type { SavedTargetChange, TargetEdit } from '@/types/review';
import {
  ASPIRATION_HINT,
  DAYS_HINT,
  DAYS_QUESTION,
  NEVER_MIND,
  SAVE_BUTTON,
  SAVING,
  aspirationQuestion,
  floorQuestion,
  lastWeekLine,
  nowLine,
  startsLine,
} from './targetChangeWording';

// The same look as the other fields (MOM-30): at least 44px tall, the 3:1 control border, no tint.
const FIELD = 'field-input min-h-11 w-full rounded-lg border ctl-45 px-3 text-base font-normal text-foreground placeholder:text-muted';
const LABEL = 'text-sm font-semibold text-foreground';
// A day toggle, the look of the week plan's days: at least 44px, the accent outline until it is on, then solid.
const DAY = 'min-h-11 min-w-11 flex-1 rounded-xl border px-1 text-sm font-medium transition-colors';

interface TargetChangeFormProps {
  edit: TargetEdit;
  // What the boxes start with: the numbers the target will have, or the ones just saved when the person changes it again.
  start: { floor: number; aspiration: number | null; days: number[] | null };
  onSaved: (saved: SavedTargetChange) => void;
  // "Never mind": back to the three choices, nothing changed.
  onCancel: () => void;
}

// The days of a week in the order of the person's own week, as the database counts them (1 to 7, Monday is 1).
function weekOrder(weekStartsOn: number): number[] {
  return Array.from({ length: 7 }, (_, i) => ((weekStartsOn + i) % 7 === 0 ? 7 : (weekStartsOn + i) % 7));
}

// The edit the weekly review opens from "Yes, I want to change it" (MOM-146). The numbers are asked for by what they are for (setup's own
// questions); the main button is always there and solid, and a tap with something missing or wrong answers with one plain callout that
// names it and moves to it (MOM-145). The change starts with the week after the reviewed one (or the week the person is in, when the review is late), and weeks before keep the numbers they had.
export function TargetChangeForm({ edit, start, onSaved, onCancel }: TargetChangeFormProps) {
  const ids = { floor: useId(), aspiration: useId(), days: useId(), problem: useId() };
  const [floor, setFloor] = useState(String(start.floor));
  const [aspiration, setAspiration] = useState(start.aspiration === null ? '' : String(start.aspiration));
  const [days, setDays] = useState<number[] | null>(start.days);
  const [problem, setProblem] = useState<{ field: ChangeField; message: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const floorRef = useRef<HTMLInputElement>(null);
  const aspirationRef = useRef<HTMLInputElement>(null);
  const daysRef = useRef<HTMLDivElement>(null);

  const focusField = (field: ChangeField) => {
    if (field === 'floor') floorRef.current?.focus();
    else if (field === 'aspiration') aspirationRef.current?.focus();
    else daysRef.current?.querySelector<HTMLElement>('button')?.focus();
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaveError(null);
    const checked = checkChange({ floor, aspiration, days }, edit.measure);
    if (!checked.ok) {
      setProblem({ field: checked.field, message: checked.message });
      focusField(checked.field);
      return;
    }
    setProblem(null);
    setSaving(true);
    try {
      const result = await changeTarget({ targetId: edit.targetId, floor, aspiration, days });
      if (result.ok) onSaved(result.data);
      else setSaveError(result.error);
    } catch {
      setSaveError(CHANGE_SAVE_FAILED);
    } finally {
      setSaving(false);
    }
  }

  const toggleDay = (day: number) => {
    setProblem(null);
    setDays((current) => {
      const now = current ?? [];
      return now.includes(day) ? now.filter((d) => d !== day) : [...now, day];
    });
  };

  const invalid = (field: ChangeField) => problem?.field === field || undefined;
  // The callout sits right under the box it is about, so it is plain which one is meant; only one is ever shown (MOM-145).
  const callout = (field: ChangeField) => <MissingCallout id={ids.problem} message={problem?.field === field ? problem.message : null} />;

  return (
    <form noValidate onSubmit={submit} aria-label="Change this target" className="grid gap-4 border-t border-border pt-4">
      <div className="grid gap-1.5">
        <label htmlFor={ids.floor} className={LABEL}>
          {floorQuestion(edit)}
        </label>
        <p className="home-note">
          {nowLine(edit.floor)}
          {edit.lastCounted !== null && ` ${lastWeekLine(edit.lastCounted)}`}
        </p>
        <input
          ref={floorRef}
          id={ids.floor}
          name="floor"
          inputMode="decimal"
          autoComplete="off"
          value={floor}
          onChange={(e) => {
            setFloor(e.target.value);
            setProblem(null);
          }}
          aria-invalid={invalid('floor')}
          aria-describedby={invalid('floor') ? ids.problem : undefined}
          className={FIELD}
        />
        {callout('floor')}
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={ids.aspiration} className={LABEL}>
          {aspirationQuestion(edit)}
        </label>
        <p className="home-note">{edit.aspiration === null ? ASPIRATION_HINT : `${nowLine(edit.aspiration)} ${ASPIRATION_HINT}`}</p>
        <input
          ref={aspirationRef}
          id={ids.aspiration}
          name="aspiration"
          inputMode="decimal"
          autoComplete="off"
          value={aspiration}
          onChange={(e) => {
            setAspiration(e.target.value);
            setProblem(null);
          }}
          aria-invalid={invalid('aspiration')}
          aria-describedby={invalid('aspiration') ? ids.problem : undefined}
          className={FIELD}
        />
        {callout('aspiration')}
      </div>

      {days !== null && (
        <div className="grid gap-1.5" role="group" aria-labelledby={ids.days}>
          <span id={ids.days} className={LABEL}>
            {DAYS_QUESTION}
          </span>
          <p className="home-note">{DAYS_HINT}</p>
          <div ref={daysRef} className="flex gap-1.5">
            {weekOrder(edit.weekStartsOn).map((day) => {
              const on = days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleDay(day)}
                  className={`${DAY} ${on ? 'border-transparent bg-primary text-primary-foreground' : 'answer-choice text-foreground'}`}
                >
                  {weekdayName(day % 7)}
                </button>
              );
            })}
          </div>
          {callout('days')}
        </div>
      )}

      <p className="home-note">{startsLine(edit.effectiveFrom, edit.today)}</p>

      {saveError && (
        <p role="alert" className="text-sm text-danger">
          {saveError}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <MainButton type="submit" busy={saving} busyLabel={SAVING}>
          {SAVE_BUTTON}
        </MainButton>
        <button type="button" onClick={onCancel} disabled={saving} className="answer-choice min-h-11 rounded-xl border px-4 text-sm font-medium text-foreground">
          {NEVER_MIND}
        </button>
      </div>
    </form>
  );
}
