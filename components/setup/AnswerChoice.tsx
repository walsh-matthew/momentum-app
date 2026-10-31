'use client';

import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

interface AnswerChoiceProps {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  // 'main': the one answer the card suggests (a proposal's Yes). 'answer': any other answer to the question.
  tone?: 'main' | 'answer';
  // A choice the person makes and can come back to (MOM-111, the quick path): true for the one they chose, false for the others.
  // Left out, the button is an ordinary answer and says nothing about being chosen.
  selected?: boolean;
}

// An answer the person can tap instead of typing, on every setup card: a starting idea, an interpretation, a proposal's Yes
// or its other answer (MOM-111 findings 2 and 13). It looks like an answer, not a link, and its words wrap and sit to the
// left, so a long option never runs off a phone's screen (the shared Button keeps its text on one line). Same 44px touch
// target as the rest of the app. Regular weight: the card's lead is its one bold line (round 3c, finding 1).
//
// While a reply loads every answer fades the same way (MOM-111 round 2, finding 2): the main one drops its fill, so a faded
// green button never looks like the one that was picked. What was sent shows under the question instead.
//
// A choice that can be come back to (`selected` given) has two looks, so the chosen one cannot be mistaken (MOM-111, the owner's
// review of the quick path): the others are plain, with the card's own colour and a border, and the chosen one is filled with the
// accent and a check mark. It says which in aria-pressed.
export function AnswerChoice({ children, disabled, onClick, tone = 'answer', selected }: AnswerChoiceProps) {
  const toggle = selected !== undefined;
  return (
    <button
      type="button"
      data-slot="answer-choice"
      data-tone={tone}
      data-selected={toggle ? selected : undefined}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={toggle ? choiceClasses(selected, disabled === true) : answerChoiceClasses(tone, disabled === true)}
    >
      {children}
      {selected && <ChoiceMark className="ml-auto" />}
    </button>
  );
}

// The check that marks the chosen answer. It sits at the end of the button, so no answer's words ever move when another is chosen.
export function ChoiceMark({ className }: { className?: string }) {
  return <Check aria-hidden="true" data-slot="choice-check" className={cn('size-4 shrink-0', className)} />;
}

// The look of a choice that can be come back to: plain (the card's colour, a border that reaches 3:1) or chosen (the accent fill,
// the same filled look as the card's main button, so it reads at 4.5:1 in both themes and is a shape of its own against the card).
// tests/theme-contrast.test.ts pins both.
// `compact` is for a cell in a grid (the days of the week): centred, with little padding, so the check and the word both fit.
export function choiceClasses(selected: boolean, disabled: boolean, compact = false): string {
  return cn(
    'flex min-h-11 w-full items-center rounded-lg border py-2 text-base font-normal whitespace-normal break-words transition-colors select-none disabled:pointer-events-none disabled:opacity-50',
    compact ? 'justify-center gap-1 px-1 text-center' : 'justify-start gap-3 px-4 text-left',
    selected ? 'border-transparent bg-primary text-primary-foreground primary-hover' : 'ctl-45 bg-transparent text-foreground hover:bg-secondary',
  );
}

// The look of an answer, for a control that must look like one without being a <button>: the date picker trigger in
// components/setup/DateAnswer.tsx has the same shape, width, border and type as every other answer (round 3b, finding 3).
export function answerChoiceClasses(tone: AnswerChoiceProps['tone'], disabled: boolean): string {
  const filled = tone === 'main' && !disabled;
  return cn(
    'flex min-h-11 w-full items-center justify-start rounded-lg border px-4 py-2 text-left text-base font-normal whitespace-normal break-words transition-colors select-none disabled:pointer-events-none disabled:opacity-50',
    filled
      ? 'border-transparent bg-primary text-primary-foreground primary-hover'
      : 'answer-choice text-foreground',
  );
}
