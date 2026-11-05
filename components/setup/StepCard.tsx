'use client';

import { useState } from 'react';
import { countedTarget } from '@/lib/setup/numbers';
import { PICK_DATE, USE_THIS_DATE, pickedDateText } from '@/lib/setup/session';
import { casualDate } from '@/lib/dates/casual';
import {
  STEP_WORDS,
  aimWords,
  numbersProblem,
  returnDateProblem,
  stepCardDetail,
  stepChoices,
  unitOfTarget,
  type NumberUnit,
  type NumbersAnswer,
  type StepAnswer,
} from '@/lib/setup/stepCards';
import { WEEK_WORDS } from '@/lib/setup/weekCards';
import type { AssistantTurn } from '@/types/setup';
import { AnswerChoice } from './AnswerChoice';
import { CARD_TEXT } from './cardText';
import { PickDateButton } from './DateAnswer';
import { FIELD } from './QuickPathFillIn';
import { SetupButton } from './SetupButton';
import { WeekCallout, WeekCardFrame } from './WeekCardFrame';

interface StepCardProps {
  // The card code wrote (lib/setup/stepCards.ts): its topic says which one it is.
  turn: AssistantTurn;
  busy: boolean;
  // The person's own today, for a date that must come after it and a number about a deadline.
  today: string | null;
  // What the person has said, so the counted thing is in their words.
  said: readonly string[];
  // The number boxes only: the person has just said what they are aiming for, which is held in their message, so only the least that counts is asked.
  heldAim?: number | null;
  // A tap, or the number boxes, which the screen reads as the card's answer (lib/setup/stepCards.ts answerStepCard).
  onAnswer: (answer: StepAnswer) => void;
  // "Type your answer": the person's own words, sent to Claude.
  onType: (text: string) => void;
}

const UNITS: { value: NumberUnit; label: string }[] = [
  { value: 'minutes', label: WEEK_WORDS.minutes },
  { value: 'hours', label: WEEK_WORDS.hours },
];

// When a goal set aside comes back (MOM-180 B2): a day from the date picker, or "Only when I ask". The picker follows the date question's rule (MOM-171): nothing
// is picked when the card opens, choosing a day only shows it, and nothing is answered until the person taps "Use this date", which is never dimmed.
function ReturnControls({ busy, today, onAnswer }: Pick<StepCardProps, 'busy' | 'today' | 'onAnswer'>) {
  const [picked, setPicked] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const problem = picked ? returnDateProblem(picked, today) : null;
  const use = () => {
    if (!picked) return;
    if (problem !== null) setTried(true);
    else onAnswer({ kind: 'text', text: pickedDateText(picked) });
  };
  return (
    <div className="flex flex-col gap-2">
      <PickDateButton
        label={PICK_DATE}
        tone="answer"
        disabled={busy}
        chosen={picked ? casualDate(picked, today, { relative: false, weekday: 'short' }) : null}
        onPick={(iso) => {
          setPicked(iso);
          setTried(false);
        }}
      />
      {picked && (
        <SetupButton tone="main" size="answer" busy={busy} onClick={use}>
          {USE_THIS_DATE}
        </SetupButton>
      )}
      {tried && problem && <WeekCallout>{problem}</WeekCallout>}
      <AnswerChoice disabled={busy} onClick={() => onAnswer({ kind: 'text', text: `${STEP_WORDS.onlyWhenAsked}.` })}>
        {STEP_WORDS.onlyWhenAsked}
      </AnswerChoice>
    </div>
  );
}

// The number boxes (MOM-180 B2): the least that counts and the number the person is hoping for, each shown only when the draft lacks it. A time whose own words
// name no unit asks minutes or hours, with neither chosen. Next is always there and never dimmed; what is missing is named in a callout and nothing is sent
// until it is whole. The number hoped for may be left empty. Stored in minutes for a time.
function NumberControls({ turn, busy, today, said, heldAim = null, onAnswer }: Pick<StepCardProps, 'turn' | 'busy' | 'today' | 'said' | 'heldAim' | 'onAnswer'>) {
  const target = countedTarget(turn.draft, 'floor');
  const [floor, setFloor] = useState('');
  const [aspiration, setAspiration] = useState('');
  const [unit, setUnit] = useState<NumberUnit | null>(null);
  const [tried, setTried] = useState(false);
  if (!target) return null;
  const needsFloor = target.floor === null;
  const needsAim = target.aspiration === null && heldAim === null;
  const asksUnit = unitOfTarget(target, said) === 'ask';
  const answer: NumbersAnswer = { floor: needsFloor ? floor : undefined, aspiration: needsAim ? aspiration : undefined, unit };
  const problem = numbersProblem(turn.draft, answer, said, heldAim);
  const next = () => {
    if (problem !== null) setTried(true);
    else onAnswer({ kind: 'numbers', answer });
  };
  const both = needsFloor && needsAim;
  return (
    <div className="space-y-3">
      {needsFloor && (
        <div className="min-w-0 space-y-1">
          {both && <label htmlFor="step-floor" className={CARD_TEXT.body}>{STEP_WORDS.leastBox}</label>}
          <input
            id="step-floor"
            type="text"
            inputMode="decimal"
            aria-label={STEP_WORDS.leastBox}
            data-field="floor"
            value={floor}
            disabled={busy}
            onChange={(event) => setFloor(event.target.value)}
            className={FIELD}
          />
        </div>
      )}
      {needsAim && (
        <div className="min-w-0 space-y-1">
          {both && <label htmlFor="step-aspiration" className={CARD_TEXT.body}>{aimWords(target, today, said)}</label>}
          <input
            id="step-aspiration"
            type="text"
            inputMode="decimal"
            aria-label={both ? aimWords(target, today, said) : 'The number you are hoping for'}
            data-field="aspiration"
            value={aspiration}
            disabled={busy}
            onChange={(event) => setAspiration(event.target.value)}
            className={FIELD}
          />
          {both && <p className={CARD_TEXT.note}>{STEP_WORDS.skipLine}</p>}
        </div>
      )}
      {asksUnit && (
        <div className="grid grid-cols-2 gap-2" data-slot="number-unit">
          {UNITS.map((u) => (
            <AnswerChoice key={u.value} disabled={busy} selected={unit === u.value} onClick={() => setUnit(unit === u.value ? null : u.value)}>
              {u.label}
            </AnswerChoice>
          ))}
        </div>
      )}
      {tried && problem && <WeekCallout>{problem}</WeekCallout>}
      <SetupButton tone="main" size="answer" busy={busy} onClick={next}>
        {STEP_WORDS.next}
      </SetupButton>
    </div>
  );
}

// The cards for steps 3, 7 and 9 (MOM-180 B2): one goal or a few, together or one first, when a goal set aside comes back, something I do or a result, which level
// a number is, the number boxes, and where a thing is tracked. Nothing is pre-selected. Each tap is the person's own answer; "Type your answer" and "What does
// this mean?" are on every card, as on the week cards. Written by code: no Claude call.
export function StepCard({ turn, busy, today, said, heldAim = null, onAnswer, onType }: StepCardProps) {
  const choices = stepChoices(turn);
  const numbers = turn.topic === 'floor' || turn.topic === 'aspiration';
  return (
    <WeekCardFrame card="step" topic={turn.topic ?? ''} question={turn.question ?? ''} detail={stepCardDetail(turn)} draft={turn.draft} today={today} busy={busy} onType={onType}>
      {turn.skipped && <p className={CARD_TEXT.note}>{turn.skipped.line}</p>}
      {numbers ? (
        <NumberControls turn={turn} busy={busy} today={today} said={said} heldAim={heldAim} onAnswer={onAnswer} />
      ) : turn.topic === 'parked_return' ? (
        <ReturnControls busy={busy} today={today} onAnswer={onAnswer} />
      ) : (
        <div className="flex flex-col gap-2">
          {(choices ?? []).map((c) => (
            <AnswerChoice key={c.say} disabled={busy} onClick={() => onAnswer({ kind: 'text', text: c.say })}>
              {c.label}
            </AnswerChoice>
          ))}
        </div>
      )}
    </WeekCardFrame>
  );
}

