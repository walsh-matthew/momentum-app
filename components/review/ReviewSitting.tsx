'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { askForReviewLine, finishReview } from '@/app/actions/review';
import { MissingCallout } from '@/components/ui/MissingCallout';
import { busyProps } from '@/lib/forms/mainButton';
import type { ReviewAdjustmentOutcome } from '@/types/database.types';
import type { ReviewLineResult } from '@/types/review';
import { CHOICE_ORDER, NO_ADJUSTMENT, type AdjustmentView } from './adjustmentWording';
import {
  ASKING_CLAUDE,
  FINISH_BUTTON,
  FINISH_NEEDS_CHOICE,
  FINISHING,
  LINE_BUTTON,
  LINE_FAILED,
  LINE_HEADING,
  LINE_HELP,
  LINE_SOURCE,
} from './sittingWording';

// The look of a tappable answer, the same as the theme choice in settings: at least 44px tall, so a thumb can hit it, and the
// accent outline (components layer, app/globals.css) until it is the one chosen.
const BUTTON_BASE = 'min-h-11 rounded-xl border py-2 text-sm font-medium transition-colors disabled:opacity-70';

interface ReviewSittingProps {
  // Whether the line from Claude is offered at all (the review depth setting, and something to look back on).
  offerLine: boolean;
  // The one adjustment the engine picked, in words, or null when it raised nothing.
  adjustment: AdjustmentView | null;
}

// The rest of the sitting after layer 1's recap (docs/DOMAIN_MODEL.md §3.1): layer 2's one-line look back, only when the person
// taps for it; layer 3's one question, with three equal choices; and the one button that finishes the review. Everything the
// screen shows is decided on the server: the words are templates in code and the line is checked there. The recap above and the
// record that is stored never depend on anything here but the person's choice.
export function ReviewSitting({ offerLine, adjustment }: ReviewSittingProps) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [line, setLine] = useState<ReviewLineResult | null>(null);
  const [lineError, setLineError] = useState<string | null>(null);
  const [choice, setChoice] = useState<ReviewAdjustmentOutcome | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [finishing, startFinish] = useTransition();
  const [needsChoiceShown, setNeedsChoiceShown] = useState(false);
  const choices = useRef<HTMLDivElement>(null);

  async function ask() {
    setAsking(true);
    setLineError(null);
    try {
      const result = await askForReviewLine();
      if (result.ok) setLine(result.data);
      else setLineError(result.error);
    } catch {
      setLineError(LINE_FAILED);
    } finally {
      setAsking(false);
    }
  }

  // A state update after an await is not part of the transition (React 19), so each one is wrapped in startFinish again:
  // the error and the restored "Finish review" button then show in the same render, never the error beside "Saving…".
  function finish() {
    setFinishError(null);
    // The button is always there and solid; with nothing chosen a tap says what is missing and moves to the choices (MOM-145).
    if (adjustment !== null && choice === null) {
      setNeedsChoiceShown(true);
      choices.current?.querySelector<HTMLElement>('[role="radio"]')?.focus();
      return;
    }
    startFinish(async () => {
      try {
        const result = await finishReview(adjustment === null ? null : choice);
        if (result.ok) router.refresh();
        else startFinish(() => setFinishError(result.error));
      } catch {
        startFinish(() => setFinishError('Could not save your weekly review. Nothing was saved.'));
      }
    });
  }

  const lineShown = line !== null && line.kind === 'line';
  const needsChoice = adjustment !== null && choice === null;

  return (
    <div className="review-sitting">
      {offerLine && (
        <section aria-label="A one-line look back" className="home-notice review-card">
          <h2 className="card-title">{LINE_HEADING}</h2>
          {lineShown ? (
            <>
              <p className="review-line">{line.line}</p>
              <p className="home-note">{LINE_SOURCE[line.source]}</p>
            </>
          ) : (
            <>
              <p className="home-note">{LINE_HELP}</p>
              <button type="button" className={`${BUTTON_BASE} answer-choice justify-self-start px-4 text-foreground`} disabled={asking} onClick={ask}>
                {asking ? ASKING_CLAUDE : LINE_BUTTON}
              </button>
            </>
          )}
          <div role="status" aria-live="polite">
            {line !== null && line.kind === 'unavailable' && <p className="home-note">{line.message}</p>}
            {lineError && <p className="home-note">{lineError}</p>}
          </div>
        </section>
      )}

      {adjustment !== null && (
        <section aria-label="One thing to decide" className="home-notice review-card">
          <h2 className="card-title">{adjustment.question}</h2>
          <p className="home-note">{adjustment.detail}</p>
          <div ref={choices} role="radiogroup" aria-label="Your choice" className="review-choices">
            {CHOICE_ORDER.map((outcome) => (
              <button
                key={outcome}
                type="button"
                role="radio"
                aria-checked={choice === outcome}
                disabled={finishing}
                onClick={() => {
                  setNeedsChoiceShown(false);
                  setChoice(outcome);
                }}
                className={`${BUTTON_BASE} px-3 text-left ${choice === outcome ? 'border-transparent bg-primary text-primary-foreground' : 'answer-choice text-foreground'}`}
              >
                {adjustment.choices[outcome]}
              </button>
            ))}
          </div>
          <div role="status" aria-live="polite">
            {choice !== null && <p className="review-after">{adjustment.afterChoice[choice]}</p>}
          </div>
        </section>
      )}

      <section aria-label="Finish your review" className="home-notice review-card">
        {adjustment === null && <p className="home-note">{NO_ADJUSTMENT}</p>}
        {needsChoice && needsChoiceShown && <MissingCallout message={FINISH_NEEDS_CHOICE} />}
        <button
          type="button"
          className="min-h-11 justify-self-start rounded-xl border border-transparent bg-primary px-5 text-sm font-semibold text-primary-foreground primary-hover"
          {...busyProps<HTMLButtonElement>(finishing, finish)}
        >
          {finishing ? FINISHING : FINISH_BUTTON}
        </button>
        {finishError && (
          <p role="alert" className="text-sm text-danger">
            {finishError}
          </p>
        )}
      </section>
    </div>
  );
}
