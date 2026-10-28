'use client';

import { CalendarDays } from 'lucide-react';
import { useState } from 'react';
import type { LogDay } from '@/types/entries';

interface DayPickerProps {
  // Today first, then the days back to the edge of the log window, built by the server in the person's time zone.
  days: LogDay[];
  // The chosen date (YYYY-MM-DD), or null for now.
  value: string | null;
  onChange: (date: string | null) => void;
  disabled?: boolean;
  // Names the group for a screen reader: the target the day is for.
  name: string;
  // What the day is for, in the summary line ("When", "Day for the next tick").
  caption?: string;
}

// Which day a log is for, with no keyboard: a summary line that opens a grid of large buttons, one per day. Choosing
// today means "now" (null), so the server's clock stays the time of an ordinary log. The grid closes after a choice.
export function DayPicker({ days, value, onChange, disabled = false, name, caption = 'When' }: DayPickerProps) {
  const [open, setOpen] = useState(false);
  const chosen = value === null ? null : days.find((day) => day.date === value);
  const summary = value === null ? 'Today' : chosen ? `${chosen.label}, ${chosen.detail}` : value;

  return (
    <div className="mb-3">
      <button
        type="button"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-border px-3 text-left text-sm disabled:opacity-60"
      >
        <CalendarDays className="size-4 shrink-0 text-muted" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          {caption}: <span className="font-medium">{summary}</span>
        </span>
        <span className="text-muted underline-offset-4">{open ? 'Close' : 'Change day'}</span>
      </button>
      {open && (
        <div role="radiogroup" aria-label={`Day for ${name}`} className="mt-2 grid grid-cols-4 gap-2">
          {days.map((day, index) => {
            const selected = index === 0 ? value === null : value === day.date;
            return (
              <button
                key={day.date}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`${day.label}, ${day.detail}`}
                disabled={disabled}
                onClick={() => {
                  onChange(index === 0 ? null : day.date);
                  setOpen(false);
                }}
                className={`flex min-h-14 flex-col items-center justify-center rounded-xl border px-1 transition-transform active:scale-[0.97] disabled:opacity-60 ${
                  selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-secondary'
                }`}
              >
                <span className="text-sm font-medium">{day.label}</span>
                <span className={`text-xs ${selected ? '' : 'text-muted'}`}>{day.detail}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
