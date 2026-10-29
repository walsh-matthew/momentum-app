'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { MAX_PERSON_CHARS } from '@/types/setup';

// The placeholder on every setup answer box (MOM-111 finding 1).
export const ANSWER_PLACEHOLDER = 'Type your answer';

interface AnswerBoxProps {
  // What the field is for, read by a screen reader.
  label: string;
  submitLabel: string;
  placeholder?: string;
  busy: boolean;
  onSubmit: (text: string) => void;
  // A second button beside the send button, the same size (for example "Keep it as it is" in the change box).
  secondary?: { label: string; onClick: () => void };
  // A small muted link under Send (for example "Not sure what I mean?" on a question).
  help?: { label: string; onClick: () => void };
  // Words already in the box when it opens: the person's last answer, put back to edit ("Change my answer").
  initialText?: string;
}

// A text box and a send button, for every setup card that takes the person's own words (MOM-111 findings 1 and 2): the box,
// then Send straight under it, then any help link, small and muted. The box has a visible border, a slightly lighter fill
// than the card and a clear focus ring; Send is dimmed only while the box is empty. The text is sent as typed, trimmed, and
// the box empties after it is sent.
export function AnswerBox({ label, submitLabel, placeholder = ANSWER_PLACEHOLDER, busy, onSubmit, secondary, help, initialText = '' }: AnswerBoxProps) {
  const [text, setText] = useState(initialText);
  const hasText = text.trim().length > 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!hasText || busy) return;
    onSubmit(text.trim());
    setText('');
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <textarea
        aria-label={label}
        placeholder={placeholder}
        value={text}
        maxLength={MAX_PERSON_CHARS}
        rows={3}
        disabled={busy}
        onChange={(event) => setText(event.target.value)}
        className="min-h-24 w-full rounded-2xl border border-foreground/30 bg-foreground/[0.06] px-4 py-3 text-base text-foreground placeholder:text-muted focus-visible:border-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" size="lg" disabled={!hasText} aria-disabled={!hasText || busy} className="w-full sm:w-auto">
          {busy ? 'Thinking…' : submitLabel}
        </Button>
        {secondary && (
          <Button type="button" size="lg" variant="outline" disabled={busy} onClick={secondary.onClick} className="w-full sm:w-auto">
            {secondary.label}
          </Button>
        )}
      </div>
      {help && (
        <button
          type="button"
          disabled={busy}
          onClick={help.onClick}
          className="block text-sm text-muted underline underline-offset-4 hover:text-foreground disabled:opacity-50"
        >
          {help.label}
        </button>
      )}
    </form>
  );
}
