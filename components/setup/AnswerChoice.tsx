'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

interface AnswerChoiceProps {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  // 'main': the one answer the card suggests (a proposal's Yes). 'answer': any other answer to the question.
  tone?: 'main' | 'answer';
}

// An answer the person can tap instead of typing, on every setup card: a starting idea, an interpretation, a proposal's Yes
// or its other answer (MOM-111 findings 2 and 13). It looks like an answer, not a link, and its words wrap and sit to the
// left, so a long option never runs off a phone's screen (the shared Button keeps its text on one line). Same 44px touch
// target as the rest of the app. Regular weight: the card's lead is its one bold line (round 3c, finding 1).
//
// While a reply loads every answer fades the same way (MOM-111 round 2, finding 2): the main one drops its fill, so a faded
// green button never looks like the one that was picked. What was sent shows under the question instead.
export function AnswerChoice({ children, disabled, onClick, tone = 'answer' }: AnswerChoiceProps) {
  return (
    <button
      type="button"
      data-slot="answer-choice"
      data-tone={tone}
      disabled={disabled}
      onClick={onClick}
      className={answerChoiceClasses(tone, disabled === true)}
    >
      {children}
    </button>
  );
}

// The look of an answer, for a control that must look like one without being a <button>: the date picker trigger in
// components/setup/DateAnswer.tsx has the same shape, width, border and type as every other answer (round 3b, finding 3).
export function answerChoiceClasses(tone: AnswerChoiceProps['tone'], disabled: boolean): string {
  const filled = tone === 'main' && !disabled;
  return cn(
    'flex min-h-11 w-full items-center justify-start rounded-lg border px-4 py-2 text-left text-base font-normal whitespace-normal break-words transition-colors select-none disabled:pointer-events-none disabled:opacity-50',
    filled
      ? 'border-transparent bg-primary text-primary-foreground hover:bg-primary/85'
      : 'border-foreground/20 bg-foreground/[0.04] text-foreground hover:bg-foreground/[0.08]',
  );
}
