'use client';

import { useState } from 'react';
import {
  WEEK_WORDS,
  dayTimeProblem,
  dayTypesLeft,
  type DayTimeAnswer,
  type DayTimeAnswers,
  type TimeUnit,
} from '@/lib/setup/weekCards';
import type { SetupModel } from '@/types/setup';
import { AnswerChoice } from './AnswerChoice';
import { CARD_TEXT } from './cardText';
import { FIELD } from './QuickPathFillIn';
import { SetupButton } from './SetupButton';
import { WeekCallout, WeekCardFrame } from './WeekCardFrame';

interface DayTimesCardProps {
  model: SetupModel;
  busy: boolean;
  onAnswer: (rows: DayTimeAnswers) => void;
  onType: (text: string) => void;
}

const UNITS: { value: TimeUnit; label: string }[] = [
  { value: 'minutes', label: WEEK_WORDS.minutes },
  { value: 'hours', label: WEEK_WORDS.hours },
];

// "Time you have for your goals" (MOM-179): one row for each kind of day the person named, in their words, each a number and Minutes or Hours
// (neither pre-selected). Next is always there and never dimmed; a row left empty stays unset, and a row half filled gets a callout that says
// what it needs. Written by code: no Claude call.
export function DayTimesCard({ model, busy, onAnswer, onType }: DayTimesCardProps) {
  const rows = dayTypesLeft(model);
  const [answers, setAnswers] = useState<DayTimeAnswers>({});
  const [tried, setTried] = useState(false);
  const rowAnswer = (name: string): DayTimeAnswer => answers[name.toLowerCase()] ?? { amount: '', unit: null };
  const change = (name: string, patch: Partial<DayTimeAnswer>) =>
    setAnswers((now) => ({ ...now, [name.toLowerCase()]: { ...rowAnswer(name), ...patch } }));
  const problems = rows.map((d) => dayTimeProblem(d.name, answers[d.name.toLowerCase()])).filter((p): p is string => p !== null);

  const next = () => {
    if (problems.length > 0) {
      setTried(true);
      return;
    }
    onAnswer(answers);
  };

  return (
    <WeekCardFrame topic="capacity" question={WEEK_WORDS.timeHeading} busy={busy} onType={onType}>
      <p className={CARD_TEXT.secondary}>{WEEK_WORDS.timeSkipLine}</p>
      {rows.map((d) => {
        const a = rowAnswer(d.name);
        return (
          <fieldset key={d.name} className="min-w-0 space-y-2" data-day-type={d.name}>
            <legend className={`${CARD_TEXT.body} mb-1`}>{d.name}</legend>
            <input
              type="text"
              inputMode="decimal"
              aria-label={`Amount for ${d.name}`}
              value={a.amount}
              disabled={busy}
              onChange={(event) => change(d.name, { amount: event.target.value })}
              className={FIELD}
            />
            <div className="grid grid-cols-2 gap-2">
              {UNITS.map((u) => (
                <AnswerChoice key={u.value} disabled={busy} selected={a.unit === u.value} onClick={() => change(d.name, { unit: a.unit === u.value ? null : u.value })}>
                  {u.label}
                </AnswerChoice>
              ))}
            </div>
          </fieldset>
        );
      })}
      {tried && problems.map((p) => <WeekCallout key={p}>{p}</WeekCallout>)}
      <SetupButton tone="main" busy={busy} onClick={next}>
        {WEEK_WORDS.next}
      </SetupButton>
    </WeekCardFrame>
  );
}
