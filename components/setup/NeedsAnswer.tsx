import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { QUICK_PATH_WORDS } from '@/lib/setup/quickPath';
import { cn } from '@/lib/utils/cn';
import { CARD_TEXT } from './cardText';

interface NeedsAnswerProps {
  // The draft path this question sets, so a test and a screen reader can find it.
  id: string;
  // The question, in plain words.
  question: string;
  // A short note under the question, when it needs one.
  hint?: string | null;
  // True once the person has answered it: the callout stays, in a quieter look, so they can change the answer.
  answered?: boolean;
  // The words that stand in for the label when it is not the usual "Needs your answer" (what only Claude could ask for).
  label?: string;
  children?: ReactNode;
}

// A question the quick path still needs answered, in place where its answer will be read (MOM-111): an amber callout marked
// "Needs your answer", the question in plain words, and its control right there. The amber is the one SetupAlert and the warning
// chips use (--streak over its own 8% tint), contrast-tested in both themes (tests/theme-contrast.test.ts). Once answered it
// keeps its question and control with a neutral look and the label "Your answer". Regular weight throughout: the card's top line
// is its one bold line (round 3c, finding 1).
export function NeedsAnswer({ id, question, hint = null, answered = false, label, children }: NeedsAnswerProps) {
  const questionId = `needs-${id}`;
  return (
    <div
      role="group"
      aria-labelledby={questionId}
      data-slot="needs-answer"
      data-fill-in={id}
      data-state={answered ? 'answered' : 'missing'}
      className={cn('min-w-0 space-y-3 rounded-2xl border p-4', answered ? 'border-foreground/25' : 'border-warn/50 bg-warn/[0.08]')}
    >
      <p className={cn('flex items-center gap-2 text-sm leading-snug font-normal', answered ? 'text-muted' : 'text-warn')}>
        <Info aria-hidden="true" className="size-4 shrink-0" />
        {label ?? (answered ? QUICK_PATH_WORDS.yourAnswer : QUICK_PATH_WORDS.needsAnswer)}
      </p>
      <p id={questionId} className={CARD_TEXT.body}>
        {question}
      </p>
      {hint && <p className={CARD_TEXT.note}>{hint}</p>}
      {children}
    </div>
  );
}
