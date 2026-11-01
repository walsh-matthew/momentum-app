'use client';

import { useState, type FormEvent } from 'react';
import { casualDate } from '@/lib/dates/casual';
import { QUICK_PATH_WORDS } from '@/lib/setup/quickPath';
import type { FillInItem } from '@/types/setupScreen';
import { AnswerChoice, ChoiceMark, choiceClasses } from './AnswerChoice';
import { SetupButton } from './SetupButton';
import { TimeZonePicker } from './TimeZonePicker';

export type FillHow = 'said' | 'accepted';

interface QuickPathFillInProps {
  item: FillInItem;
  // Nothing can be tapped while an answer is being set or the setup is being saved.
  disabled: boolean;
  // The zone this device reports, offered as the one suggestion for a time zone.
  deviceZone: string | null;
  // The date on this device (YYYY-MM-DD), offered as the one suggestion for a start date.
  today: string | null;
  // What the box's button says when it is the step's own button ("Next"); null means a plain "Set".
  boxButton: string | null;
  onFill: (item: FillInItem, value: string, how: FillHow) => void;
}

const FIELD =
  'block min-h-12 w-full min-w-0 rounded-2xl border ctl-30 field-input px-4 text-base text-foreground placeholder:text-muted focus-visible:border-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';

interface FieldProps {
  label: string;
  type: 'text' | 'time' | 'date';
  inputMode?: 'decimal';
  initial: string | null;
  disabled: boolean;
  button: string | null;
  onSet: (value: string) => void;
}

// One box and its button, for a time, a date, a number or a few words. The button is there only when there is something new to
// set: a box with nothing in it, or the answer it already holds, has no button at all (never a dimmed one).
function Field({ label, type, inputMode, initial, disabled, button, onSet }: FieldProps) {
  const [value, setValue] = useState(initial ?? '');
  const ready = value.trim().length > 0 && value.trim() !== (initial ?? '');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (ready && !disabled) onSet(value.trim());
  };
  return (
    <form onSubmit={submit} className="flex min-w-0 flex-col gap-2 sm:flex-row" noValidate>
      <input type={type} inputMode={inputMode} aria-label={label} value={value} disabled={disabled} onChange={(event) => setValue(event.target.value)} className={FIELD} />
      {ready && (
        <SetupButton tone={button ? 'main' : 'second'} type="submit" disabled={disabled}>
          {button ?? QUICK_PATH_WORDS.setItem}
        </SetupButton>
      )}
    </form>
  );
}

// Seven weekday buttons in a compact grid (four, then three), each its short name on screen and its full name to a screen reader.
function WeekdayGrid({ item, disabled, onPick }: { item: FillInItem; disabled: boolean; onPick: (value: string) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {item.choices.map((choice) => {
        const selected = item.answer === choice.value;
        return (
          <button
            key={choice.value}
            type="button"
            data-slot="answer-choice"
            data-selected={selected}
            aria-label={choice.label}
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onPick(choice.value)}
            className={choiceClasses(selected, disabled, true)}
          >
            {selected && <ChoiceMark />}
            {choice.label.slice(0, 3)}
          </button>
        );
      })}
    </div>
  );
}

// The control for one question on the quick path card (MOM-111): the one control its kind needs. Every answer is the person's tap
// or typing; the only suggestions are the device's time zone and today for a start date, and each is a button, never filled in.
// An answer already given shows as chosen (or in its box), and can be changed.
export function QuickPathFillIn({ item, disabled, deviceZone, today, boxButton, onFill }: QuickPathFillInProps) {
  const said = (value: string) => onFill(item, value, 'said');
  switch (item.kind) {
    case 'timeZone':
      return <TimeZonePicker deviceZone={deviceZone} answer={item.answer} disabled={disabled} onPick={(zone, how) => onFill(item, zone, how)} />;
    case 'time':
      return <Field label={item.line} type="time" initial={item.answer} disabled={disabled} button={boxButton} onSet={said} />;
    case 'date':
      return (
        <div className="space-y-2">
          {item.suggestion === 'today' && today && (
            <AnswerChoice disabled={disabled} selected={item.answer === today} onClick={() => onFill(item, today, 'accepted')}>
              {QUICK_PATH_WORDS.useToday(casualDate(today, today, { relative: false }))}
            </AnswerChoice>
          )}
          <Field label={item.line} type="date" initial={item.answer} disabled={disabled} button={boxButton} onSet={said} />
        </div>
      );
    case 'number':
      return <Field label={item.line} type="text" inputMode="decimal" initial={item.answer} disabled={disabled} button={boxButton} onSet={said} />;
    case 'text':
      return <Field label={item.line} type="text" initial={item.answer} disabled={disabled} button={boxButton} onSet={said} />;
    case 'weekday':
      return <WeekdayGrid item={item} disabled={disabled} onPick={said} />;
    case 'choice':
    case 'yesNo':
      return (
        <div className="flex flex-col gap-2">
          {item.choices.map((choice) => (
            <AnswerChoice key={choice.value} disabled={disabled} selected={item.answer === choice.value} onClick={() => said(choice.value)}>
              {choice.label}
            </AnswerChoice>
          ))}
        </div>
      );
  }
}
