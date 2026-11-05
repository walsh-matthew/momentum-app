'use client';

import { Clock } from 'lucide-react';
import type { MouseEvent } from 'react';
import { clockWords } from '@/lib/setup/weekCards';
import { cn } from '@/lib/utils/cn';
import { answerChoiceClasses } from './AnswerChoice';

export const PICK_TIME = 'Pick a time';

interface PickTimeButtonProps {
  // The input's name for a screen reader and a test ("Time your day ends"). The visible words are "Pick a time", or the time once one is chosen.
  ariaLabel: string;
  // The time chosen, as HH:MM (24 hour), or '' before a pick.
  value: string;
  disabled: boolean;
  // Choosing a time only reports it: the card shows it and waits for its own button (an iPhone's time wheel fires a change on its first scroll).
  onPick: (hhmm: string) => void;
}

// A time, laid out like DateAnswer's PickDateButton (components/setup/DateAnswer.tsx), so it fits a phone: a full-width answer button with a
// small clock, and the phone's own time input laid over it, unseen (opacity 0, no native look). A bare input type="time" ran past the card on an
// iPhone's Safari and showed as an empty box with nothing to say it sets a time (MOM-180 B1). The button reads the chosen time ("10:30 PM")
// once there is one; a tap on it opens the phone's own picker (showPicker on a computer, the tap itself on a phone).
export function PickTimeButton({ ariaLabel, value, disabled, onPick }: PickTimeButtonProps) {
  const open = (event: MouseEvent<HTMLInputElement>) => {
    try {
      event.currentTarget.showPicker();
    } catch {
      // Already open (a phone opens it on the tap itself), or the browser has no showPicker: the tap is enough.
    }
  };
  return (
    <label
      data-slot="answer-choice"
      data-tone="answer"
      data-picker="time"
      className={cn(answerChoiceClasses('answer', disabled), 'relative cursor-pointer gap-2 focus-within:ring-2 focus-within:ring-ring', disabled && 'pointer-events-none opacity-50')}
    >
      <Clock aria-hidden="true" data-slot="picker-icon" className="size-4 shrink-0" />
      <span aria-hidden="true">{value ? clockWords(value) : PICK_TIME}</span>
      <input
        type="time"
        aria-label={ariaLabel}
        value={value}
        disabled={disabled}
        onClick={open}
        onChange={(event) => onPick(event.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none text-base opacity-0"
      />
    </label>
  );
}
