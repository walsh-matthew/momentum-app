'use client';

import { useState } from 'react';
import { WEEKDAYS } from '@/lib/setup/fillIn';
import { WEEK_WORDS, WHAT_TIME, WHICH_DAY, planningLeft, weekCardDetail, type WeekAnswer } from '@/lib/setup/weekCards';
import type { AssistantTurn } from '@/types/setup';
import { Field, FIELD, WeekdayGrid } from './QuickPathFillIn';
import { SetupButton } from './SetupButton';
import { DayTimesCard } from './DayTimesCard';
import { SlotsCard } from './SlotsCard';
import { WeekCallout, WeekCardFrame } from './WeekCardFrame';

interface WeekCardProps {
  // The card code wrote (lib/setup/weekCards.ts weekCard): its topic says which one it is, and its draft holds what is known.
  turn: AssistantTurn;
  said: readonly string[];
  busy: boolean;
  onAnswer: (answer: WeekAnswer) => void;
  // "Type your answer": the person's own words, sent to Claude.
  onType: (text: string) => void;
}

function PlanningControls({ turn, busy, onAnswer }: Pick<WeekCardProps, 'turn' | 'busy' | 'onAnswer'>) {
  const left = planningLeft(turn.draft.model);
  const [weekday, setWeekday] = useState<string | null>(null);
  const [time, setTime] = useState('');
  const dayDone = !left.weekday || weekday !== null;
  const timeDone = !left.time || time !== '';
  const ready = dayDone && timeDone;
  return (
    <div className="space-y-3">
      {left.weekday && <WeekdayGrid choices={WEEKDAYS} answer={weekday} disabled={busy} onPick={setWeekday} />}
      {left.time && <input type="time" aria-label="Time to plan" value={time} disabled={busy} onChange={(event) => setTime(event.target.value)} className={FIELD} />}
      {/* A missing item is named only once the other is chosen, so the card does not open with a warning. */}
      {!ready && left.weekday && left.time && (weekday !== null || time !== '') && <WeekCallout>{weekday === null ? WHICH_DAY : WHAT_TIME}</WeekCallout>}
      {ready && (
        <SetupButton
          tone="main"
          busy={busy}
          onClick={() => onAnswer({ topic: 'planning_moment', ...(left.weekday ? { weekday: Number(weekday) } : {}), ...(left.time ? { time } : {}) })}
        >
          {WEEK_WORDS.next}
        </SetupButton>
      )}
    </div>
  );
}

// The week questions, as cards written by code (MOM-179): the one the newest turn is, by its topic. Nothing is pre-selected on any of them.
export function WeekCard({ turn, said, busy, onAnswer, onType }: WeekCardProps) {
  switch (turn.topic) {
    case 'day_end':
      return (
        <WeekCardFrame topic="day_end" question={WEEK_WORDS.dayEndQuestion} detail={weekCardDetail('day_end')} busy={busy} onType={onType}>
          <Field label="Time your day ends" type="time" initial={null} disabled={busy} button={WEEK_WORDS.next} onSet={(time) => onAnswer({ topic: 'day_end', time })} />
        </WeekCardFrame>
      );
    case 'week_start':
      return (
        <WeekCardFrame topic="week_start" question={WEEK_WORDS.weekStartQuestion} detail={WEEK_WORDS.weekStartReason} busy={busy} onType={onType}>
          <WeekdayGrid choices={WEEKDAYS} answer={null} disabled={busy} onPick={(value) => onAnswer({ topic: 'week_start', weekday: Number(value) })} />
        </WeekCardFrame>
      );
    case 'capacity':
      return <DayTimesCard model={turn.draft.model} busy={busy} onAnswer={(rows) => onAnswer({ topic: 'capacity', rows })} onType={onType} />;
    case 'slots_or_quota':
      return <SlotsCard draft={turn.draft} said={said} busy={busy} onAnswer={(answer) => onAnswer({ topic: 'slots_or_quota', answer })} onType={onType} />;
    case 'planning_moment':
      return (
        <WeekCardFrame topic="planning_moment" question={WEEK_WORDS.planningQuestion} detail={WEEK_WORDS.planningReason} busy={busy} onType={onType}>
          <PlanningControls turn={turn} busy={busy} onAnswer={onAnswer} />
        </WeekCardFrame>
      );
    default:
      return null;
  }
}
