'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { MAX_PERSON_CHARS } from '@/types/setup';

interface AnswerBoxProps {
  // What the field is for, read by a screen reader.
  label: string;
  submitLabel: string;
  placeholder?: string;
  busy: boolean;
  onSubmit: (text: string) => void;
  // Tapping this instead of typing sends a fixed answer (for example "Yes, use that").
  quickAnswers?: { label: string; text: string }[];
  // A second button beside the send button, the same size (for example "Keep it as it is" in the change box).
  secondary?: { label: string; onClick: () => void };
}

// A text box and a send button, for any card that takes the person's own words. The text is sent as typed, trimmed, and the
// box empties after it is sent.
export function AnswerBox({ label, submitLabel, placeholder, busy, onSubmit, quickAnswers = [], secondary }: AnswerBoxProps) {
  const [text, setText] = useState('');
  const ready = text.trim().length > 0 && !busy;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    onSubmit(text.trim());
    setText('');
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      {quickAnswers.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {quickAnswers.map((answer) => (
            <Button key={answer.label} variant="outline" disabled={busy} onClick={() => onSubmit(answer.text)}>
              {answer.label}
            </Button>
          ))}
        </div>
      )}
      <textarea
        aria-label={label}
        placeholder={placeholder}
        value={text}
        maxLength={MAX_PERSON_CHARS}
        rows={3}
        disabled={busy}
        onChange={(event) => setText(event.target.value)}
        className="min-h-24 w-full rounded-2xl border border-border bg-secondary px-4 py-3 text-base text-foreground placeholder:text-muted disabled:opacity-60"
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" size="lg" disabled={!ready} className="w-full sm:w-auto">
          {busy ? 'Thinking…' : submitLabel}
        </Button>
        {secondary && (
          <Button type="button" size="lg" variant="outline" disabled={busy} onClick={secondary.onClick} className="w-full sm:w-auto">
            {secondary.label}
          </Button>
        )}
      </div>
    </form>
  );
}
