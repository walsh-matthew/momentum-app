'use client';

import { useEffect, useRef } from 'react';
import type { StartingPointOutcome } from '@/types/database.types';
import type { SavedTargetChange, StillRightItem, TargetEdit } from '@/types/review';
import { FIT_LABELS, FIT_ORDER, STILL_RIGHT_DETAIL, STILL_RIGHT_TITLE, stillRightLabel, stillRightSentence } from './stillRightWording';
import { TargetChangeForm } from './TargetChangeForm';
import { CHANGE_AGAIN, savedLine } from './targetChangeWording';

// The look of a tappable answer, the same as layer 3's choices: at least 44px tall, the accent outline until it is the one chosen.
const BUTTON_BASE = 'min-h-11 rounded-xl border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-70';

export type FitAnswers = Record<string, StartingPointOutcome>;

interface StillRightCardProps {
  items: StillRightItem[];
  edits: TargetEdit[];
  answers: FitAnswers;
  // The target whose form is open, if any.
  formFor: string | null;
  // The changes saved in this sitting, by target.
  saved: Record<string, SavedTargetChange>;
  disabled: boolean;
  onAnswer: (item: StillRightItem, answer: StartingPointOutcome) => void;
  onSaved: (targetId: string, saved: SavedTargetChange) => void;
  onCancel: (targetId: string) => void;
  onReopen: (targetId: string) => void;
}

// "Still right for you?" (MOM-113 block 3.4, docs/DOMAIN_MODEL.md §3.2): the setup suggestions on a target's numbers, each a sentence with
// two equal answers. "No, change it" opens MOM-146's form for that target under the target's last row; once it is saved, that
// target's rows are settled (the numbers are the person's own now) and the sentence says what was saved. The card holds no state of its
// own: the sitting does, because the finish needs the answers.
export function StillRightCard({ items, edits, answers, formFor, saved, disabled, onAnswer, onSaved, onCancel, onReopen }: StillRightCardProps) {
  const editOf = new Map(edits.map((e) => [e.targetId, e]));
  const savedNote = useRef<HTMLParagraphElement>(null);
  const lastSaved = Object.values(saved).length;

  // After a save the form is gone: move to the sentence that says what was saved, so a screen reader and the keyboard follow.
  useEffect(() => {
    if (lastSaved > 0 && formFor === null) savedNote.current?.focus();
  }, [lastSaved, formFor]);

  // The rows of each target together, in the order the targets first appear, under the target's name shown once. The target's form
  // and its saved sentence sit after its last row, so every answer for the target comes before them.
  const groups = new Map<string, StillRightItem[]>();
  for (const item of items) {
    if (!editOf.has(item.targetId)) continue;
    groups.set(item.targetId, [...(groups.get(item.targetId) ?? []), item]);
  }

  return (
    <section aria-label={STILL_RIGHT_TITLE} className="home-notice review-card">
      <h2 className="card-title">{STILL_RIGHT_TITLE}</h2>
      <p className="home-note">{STILL_RIGHT_DETAIL}</p>
      <ul className="review-fit-rows">
        {[...groups.entries()].map(([targetId, rows]) => {
          const edit = editOf.get(targetId)!;
          const change = saved[targetId];
          return (
            <li key={targetId} className="review-fit-target">
              <h3 className="review-fit-name">{edit.title}</h3>
              {rows.map((item) => {
                const answer = answers[item.id];
                const sentenceId = `fit-${item.id}`;
                return (
                  <div key={item.id} className="review-fit-row">
                    <p id={sentenceId} className="review-fit-sentence">
                      {stillRightSentence(item, edit)}
                    </p>
                    <div role="radiogroup" aria-label={stillRightLabel(item, edit)} className="review-fit-answers">
                      {FIT_ORDER.map((outcome) => (
                        <button
                          key={outcome}
                          type="button"
                          role="radio"
                          aria-checked={answer === outcome}
                          // A saved change settles the target's rows: another answer would say the opposite of what was done.
                          disabled={disabled || change !== undefined}
                          onClick={() => onAnswer(item, outcome)}
                          className={`${BUTTON_BASE} flex items-center justify-center gap-2 ${answer === outcome ? 'border-transparent bg-primary text-primary-foreground' : 'answer-choice text-foreground'}`}
                        >
                          {/* The check mark says "this one" without colour, in both themes. */}
                          {answer === outcome && <span aria-hidden="true">✓</span>}
                          <span>{FIT_LABELS[outcome]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {formFor === targetId && (
                <TargetChangeForm
                  edit={edit}
                  start={change === undefined ? { floor: edit.floor, aspiration: edit.aspiration, days: edit.days } : { floor: change.floor, aspiration: change.aspiration, days: change.days }}
                  onSaved={(result) => onSaved(targetId, result)}
                  onCancel={() => onCancel(targetId)}
                />
              )}
              {change !== undefined && formFor !== targetId && (
                <div role="status" aria-live="polite" className="grid gap-2">
                  <p ref={savedNote} tabIndex={-1} className="review-after">
                    {savedLine(change.effectiveFrom, edit, change.floor, change.aspiration, edit.today)}
                  </p>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onReopen(targetId)}
                    className="answer-choice min-h-11 justify-self-start rounded-xl border px-4 text-sm font-medium text-foreground"
                  >
                    {CHANGE_AGAIN}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
