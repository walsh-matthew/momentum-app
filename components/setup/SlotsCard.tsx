'use client';

import { useState } from 'react';
import { WEEKDAYS } from '@/lib/setup/fillIn';
import { PICK_A_DAY, WEEK_WORDS, slotTargetsLeft, slotsProblem, slotsQuestion, thingOf, type SlotsAnswer } from '@/lib/setup/weekCards';
import type { SetupDraft } from '@/types/setup';
import { AnswerChoice, ChoiceMark, choiceClasses } from './AnswerChoice';
import { CARD_TEXT } from './cardText';
import { SetupButton } from './SetupButton';
import { WeekCallout, WeekCardFrame } from './WeekCardFrame';

interface SlotsCardProps {
  draft: SetupDraft;
  // What the person has said so far, so the thing counted keeps their words.
  said: readonly string[];
  busy: boolean;
  onAnswer: (answer: SlotsAnswer) => void;
  onType: (text: string) => void;
}

// "Would you rather do <the thing> on set days, or any day?" (MOM-179), one card for each target that needs it. "Any day" answers at once.
// "On set days" opens the weekdays (several, at least one); the count check for a count target shows in place, and Next appears once the
// days fit, so no main button is ever dimmed. Written by code: no Claude call.
export function SlotsCard({ draft, said, busy, onAnswer, onType }: SlotsCardProps) {
  const first = slotTargetsLeft(draft)[0];
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<number[]>([]);
  if (!first) return null;
  const { target } = first;
  const problem = open ? slotsProblem(target, { kind: 'days', weekdays: days }) : null;
  const toggle = (day: number) => setDays((now) => (now.includes(day) ? now.filter((d) => d !== day) : [...now, day].sort((a, b) => a - b)));

  return (
    <WeekCardFrame topic="slots_or_quota" question={slotsQuestion(thingOf(target, said))} busy={busy} onType={onType}>
      <div className="flex flex-col gap-2">
        <AnswerChoice disabled={busy} selected={open} onClick={() => setOpen((o) => !o)}>
          {WEEK_WORDS.onSetDays}
        </AnswerChoice>
        <AnswerChoice disabled={busy} onClick={() => onAnswer({ kind: 'any' })}>
          {WEEK_WORDS.anyDay}
        </AnswerChoice>
      </div>
      {open && (
        <div className="space-y-3">
          <p className={CARD_TEXT.body}>{WEEK_WORDS.setDaysPrompt}</p>
          <div className="grid grid-cols-4 gap-2" role="group" aria-label={WEEK_WORDS.setDaysPrompt}>
            {WEEKDAYS.map((day) => {
              const n = Number(day.value);
              const selected = days.includes(n);
              return (
                <button
                  key={day.value}
                  type="button"
                  data-slot="answer-choice"
                  data-selected={selected}
                  aria-label={day.label}
                  aria-pressed={selected}
                  disabled={busy}
                  onClick={() => toggle(n)}
                  className={choiceClasses(selected, busy, true)}
                >
                  {selected && <ChoiceMark />}
                  {day.label.slice(0, 3)}
                </button>
              );
            })}
          </div>
          {days.length === 0 ? <WeekCallout>{PICK_A_DAY}</WeekCallout> : problem ? <WeekCallout>{problem}</WeekCallout> : null}
          {days.length > 0 && !problem && (
            <SetupButton tone="main" busy={busy} onClick={() => onAnswer({ kind: 'days', weekdays: days })}>
              {WEEK_WORDS.next}
            </SetupButton>
          )}
        </div>
      )}
    </WeekCardFrame>
  );
}
