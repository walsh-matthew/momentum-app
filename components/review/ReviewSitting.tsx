'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { askForReviewLine, finishReview } from '@/app/actions/review';
import { busyProps } from '@/lib/forms/mainButton';
import type { ReviewAdjustmentOutcome } from '@/types/database.types';
import type { ReviewLineResult, SavedTargetChange, TargetEdit } from '@/types/review';
import { CHOICE_ORDER, NO_ADJUSTMENT, type AdjustmentView } from './adjustmentWording';
import {
  ASKING_CLAUDE,
  FINISH_BUTTON,
  FINISHING,
  LINE_BUTTON,
  LINE_FAILED,
  LINE_HEADING,
  LINE_HELP,
  LINE_SOURCE,
} from './sittingWording';
import { TargetChangeForm } from './TargetChangeForm';
import { CHANGE_AGAIN, savedLine } from './targetChangeWording';

// The look of a tappable answer, the same as the theme choice in settings: at least 44px tall, so a thumb can hit it, and the
// accent outline (components layer, app/globals.css) until it is the one chosen.
const BUTTON_BASE = 'min-h-11 rounded-xl border py-2 text-sm font-medium transition-colors disabled:opacity-70';

interface ReviewSittingProps {
  // Whether the line from Claude is offered at all (the review depth setting, and something to look back on).
  offerLine: boolean;
  // The one adjustment the engine picked, in words, or null when it raised nothing.
  adjustment: AdjustmentView | null;
  // What "Yes, I want to change it" opens: the edit of the adjustment's target. Null when it cannot be edited here (MOM-146).
  edit?: TargetEdit | null;
}

// The rest of the sitting after layer 1's recap (docs/DOMAIN_MODEL.md §3.1): layer 2's one-line look back, only when the person
// taps for it; layer 3's one question, with three equal choices; and the one button that finishes the review. Everything the
// screen shows is decided on the server: the words are templates in code and the line is checked there. The recap above and the
// record that is stored never depend on anything here but the person's choice. "Yes, I want to change it" opens the edit of that
// target in the same card (MOM-146), so the choice and the line from Claude are not lost; the stored outcome stays "changed".
// The finish button appears when there is something to finish: after a choice, or after the change was saved (MOM-145: no button
// that is there but cannot be used).
export function ReviewSitting({ offerLine, adjustment, edit = null }: ReviewSittingProps) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [line, setLine] = useState<ReviewLineResult | null>(null);
  const [lineError, setLineError] = useState<string | null>(null);
  const [choice, setChoice] = useState<ReviewAdjustmentOutcome | null>(null);
  const [saved, setSaved] = useState<SavedTargetChange | null>(null);
  // Whether the form is open again after a save ("Change it again").
  const [reopened, setReopened] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [finishing, startFinish] = useTransition();
  const savedNote = useRef<HTMLParagraphElement>(null);

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
  const changing = choice === 'changed' && edit !== null;
  const formOpen = changing && (saved === null || reopened);
  const savedShown = changing && saved !== null && !reopened;
  // Nothing to finish yet while the edit is open and unsaved, or before a choice.
  const canFinish = adjustment === null || (choice !== null && !formOpen);

  // After a save the form is gone: move to the sentence that says what was saved, so a screen reader and the keyboard follow.
  useEffect(() => {
    if (savedShown) savedNote.current?.focus();
  }, [savedShown, saved]);

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
          <div role="radiogroup" aria-label="Your choice" className="review-choices">
            {CHOICE_ORDER.map((outcome) => (
              <button
                key={outcome}
                type="button"
                role="radio"
                aria-checked={choice === outcome}
                // A saved change stays saved: the other answers would say the opposite of what was done.
                disabled={finishing || (saved !== null && choice !== outcome)}
                onClick={() => setChoice(outcome)}
                className={`${BUTTON_BASE} flex items-center gap-2 px-3 text-left ${choice === outcome ? 'border-transparent bg-primary text-primary-foreground' : 'answer-choice text-foreground'}`}
              >
                {/* The check mark says "this one" without colour, in both themes. */}
                {choice === outcome && <span aria-hidden="true">✓</span>}
                <span>{adjustment.choices[outcome]}</span>
              </button>
            ))}
          </div>
          {formOpen && edit !== null && (
            <TargetChangeForm
              edit={edit}
              start={
                saved === null
                  ? { floor: edit.floor, aspiration: edit.aspiration, days: edit.days }
                  : { floor: saved.floor, aspiration: saved.aspiration, days: saved.days }
              }
              onSaved={(result) => {
                setSaved(result);
                setReopened(false);
              }}
              onCancel={() => {
                if (saved === null) setChoice(null);
                else setReopened(false);
              }}
            />
          )}
          <div role="status" aria-live="polite" className="grid gap-2">
            {savedShown && edit !== null && saved !== null && (
              <>
                <p ref={savedNote} tabIndex={-1} className="review-after">
                  {savedLine(saved.effectiveFrom, edit, saved.floor, saved.aspiration, edit.today)}
                </p>
                <button type="button" onClick={() => setReopened(true)} className="answer-choice min-h-11 justify-self-start rounded-xl border px-4 text-sm font-medium text-foreground">
                  {CHANGE_AGAIN}
                </button>
              </>
            )}
            {choice !== null && !changing && <p className="review-after">{adjustment.afterChoice[choice]}</p>}
          </div>
        </section>
      )}

      {canFinish && (
        <section aria-label="Finish your review" className="home-notice review-card">
          {adjustment === null && <p className="home-note">{NO_ADJUSTMENT}</p>}
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
      )}
    </div>
  );
}
