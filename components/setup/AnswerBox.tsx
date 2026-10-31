'use client';

import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { MAX_PERSON_CHARS } from '@/types/setup';
import { HelpLink } from './HelpLink';
import { SetupButton } from './SetupButton';

// The placeholder on every setup answer box (MOM-111 finding 1).
export const ANSWER_PLACEHOLDER = 'Type your answer';
export const CLEAR_ANSWER = 'Clear answer';

interface AnswerBoxProps {
  // What the field is for, read by a screen reader.
  label: string;
  submitLabel: string;
  placeholder?: string;
  busy: boolean;
  onSubmit: (text: string) => void;
  // A second button beside the send button, the same size (for example "Keep it as it is" in the change box).
  secondary?: { label: string; onClick: () => void };
  // "What does this mean?" under Send, small and muted (components/setup/HelpLink.tsx): code's own explanation, shown in
  // place, or a way to ask Claude.
  help?: { explain?: string | null; onAsk?: () => void };
  // Words already in the box when it opens: the person's last answer, put back to edit ("Change my answer").
  initialText?: string;
  // Focus the box as it opens, with any words in it selected, so a phone shows its keyboard (round 2, finding 13). The tap
  // that opened it must commit synchronously (SetupConversation uses flushSync) for a phone to accept the focus.
  focusOnOpen?: boolean;
  // Send is the card's second choice, not its main one: a card that already has a main answer (a proposal's Yes) keeps
  // one main button (round 2, finding 8).
  submitTone?: 'main' | 'second';
}

// A text box and a send button, for every setup card that takes the person's own words (MOM-111 findings 1 and 2): the box,
// then Send straight under it, then any help link, small and muted. The box has a visible border, a slightly lighter fill
// than the card and a clear focus ring; Send is dimmed only while the box is empty. The text is sent as typed, trimmed, and
// the box empties after it is sent. It is the card's one submit button (round 2, finding 8), and a small × clears the box.
export function AnswerBox({
  label,
  submitLabel,
  placeholder = ANSWER_PLACEHOLDER,
  busy,
  onSubmit,
  secondary,
  help,
  initialText = '',
  focusOnOpen = false,
  submitTone = 'main',
}: AnswerBoxProps) {
  const [text, setText] = useState(initialText);
  const box = useRef<HTMLTextAreaElement>(null);
  const hasText = text.trim().length > 0;

  useLayoutEffect(() => {
    if (!focusOnOpen || !box.current) return;
    box.current.focus();
    box.current.select();
  }, [focusOnOpen]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!hasText || busy) return;
    onSubmit(text.trim());
    setText('');
  };

  const clear = () => {
    setText('');
    box.current?.focus();
  };

  return (
    <form onSubmit={submit} className="min-w-0 space-y-3" noValidate>
      <div className="relative">
        <textarea
          ref={box}
          aria-label={label}
          placeholder={placeholder}
          value={text}
          maxLength={MAX_PERSON_CHARS}
          rows={3}
          disabled={busy}
          onChange={(event) => setText(event.target.value)}
          className="block min-h-24 w-full min-w-0 rounded-2xl border ctl-30 field-input py-3 pr-11 pl-4 text-base text-foreground placeholder:text-muted focus-visible:border-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        />
        {hasText && !busy && (
          <button
            type="button"
            aria-label={CLEAR_ANSWER}
            onClick={clear}
            className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full text-lg leading-none text-muted hover:bg-foreground/[0.08] hover:text-foreground"
          >
            ×
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <SetupButton tone={submitTone} type="submit" disabled={!hasText} aria-disabled={!hasText || busy}>
          {busy ? 'Thinking…' : submitLabel}
        </SetupButton>
        {secondary && (
          <SetupButton tone="second" disabled={busy} onClick={secondary.onClick}>
            {secondary.label}
          </SetupButton>
        )}
      </div>
      {help && <HelpLink disabled={busy} explain={help.explain} onAsk={help.onAsk} />}
    </form>
  );
}
