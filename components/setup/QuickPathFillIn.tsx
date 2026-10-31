'use client';

import { useState, type FormEvent } from 'react';
import { QUICK_PATH_WORDS } from '@/lib/setup/quickPath';
import type { FillInItem } from '@/types/setupScreen';
import { AnswerChoice } from './AnswerChoice';
import { CARD_TEXT } from './cardText';
import { SetupButton } from './SetupButton';
import { TimeZonePicker } from './TimeZonePicker';

export type FillHow = 'said' | 'accepted';

interface QuickPathFillInProps {
  item: FillInItem;
  // Nothing can be tapped while a value is being set or the setup is being saved.
  disabled: boolean;
  // The zone this device reports, offered as the one suggestion for a time zone.
  deviceZone: string | null;
  onFill: (item: FillInItem, value: string, how: FillHow) => void;
}

const FIELD =
  'block min-h-12 w-full min-w-0 rounded-2xl border ctl-30 field-input px-4 text-base text-foreground placeholder:text-muted focus-visible:border-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';

interface FieldProps {
  label: string;
  type: 'text' | 'time';
  inputMode?: 'decimal';
  disabled: boolean;
  onSet: (value: string) => void;
}

// One box and a Set button, for a time, a number or a few words. Set is off until the box has something in it.
function Field({ label, type, inputMode, disabled, onSet }: FieldProps) {
  const [value, setValue] = useState('');
  const has = value.trim().length > 0;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (has && !disabled) onSet(value.trim());
  };
  return (
    <form onSubmit={submit} className="flex min-w-0 flex-col gap-2 sm:flex-row" noValidate>
      <input type={type} inputMode={inputMode} aria-label={label} value={value} disabled={disabled} onChange={(event) => setValue(event.target.value)} className={FIELD} />
      <SetupButton tone="second" type="submit" disabled={!has || disabled}>
        {QUICK_PATH_WORDS.setItem}
      </SetupButton>
    </form>
  );
}

// The control for one missing item on the quick path card (MOM-111): the item's own line, then the one control its kind needs.
// Every value is the person's tap or typing; the only suggestion is the device's time zone, and it is a button, never filled in.
export function QuickPathFillIn({ item, disabled, deviceZone, onFill }: QuickPathFillInProps) {
  const said = (value: string) => onFill(item, value, 'said');
  const labelId = `fill-${item.id}`;
  return (
    <div role="group" aria-labelledby={labelId} data-fill-in={item.id} className="space-y-2">
      <p id={labelId} className={CARD_TEXT.body}>
        {item.line}
      </p>
      {item.kind === 'timeZone' && <TimeZonePicker deviceZone={deviceZone} disabled={disabled} onPick={(zone, how) => onFill(item, zone, how)} />}
      {item.kind === 'time' && <Field label={item.line} type="time" disabled={disabled} onSet={said} />}
      {item.kind === 'number' && <Field label={item.line} type="text" inputMode="decimal" disabled={disabled} onSet={said} />}
      {item.kind === 'text' && <Field label={item.line} type="text" disabled={disabled} onSet={said} />}
      {(item.kind === 'weekday' || item.kind === 'choice' || item.kind === 'yesNo') && (
        <div className="flex flex-col gap-2">
          {item.choices.map((choice) => (
            <AnswerChoice key={choice.value} disabled={disabled} onClick={() => said(choice.value)}>
              {choice.label}
            </AnswerChoice>
          ))}
        </div>
      )}
    </div>
  );
}
