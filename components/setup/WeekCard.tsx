'use client';

import { useState } from 'react';
import { WEEKDAYS } from '@/lib/setup/fillIn';
import { WEEK_WORDS, WHAT_TIME, WHAT_TIME_DAY_ENDS, WHICH_DAY, planningLeft, weekCardDetail, type WeekAnswer } from '@/lib/setup/weekCards';
import type { AssistantTurn } from '@/types/setup';
import { PickTimeButton } from './PickTimeButton';
import { WeekdayGrid } from './QuickPathFillIn';
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

// A time, answered only by a button that is always there (never dimmed, never on change): an iPhone time wheel changes the box on its first scroll,
// so a change alone sends nothing (the date picker's lesson, MOM-177). The time is picked with a full-width "Pick a time" button that reads the
// chosen time (components/setup/PickTimeButton.tsx, MOM-180 B1); a tap on "Use this time" with no time picked shows the callout instead.
function DayEndControls({ busy, onAnswer }: Pick<WeekCardProps, 'busy' | 'onAnswer'>) {
  const [time, setTime] = useState('');
  const [tried, setTried] = useState(false);
  const tap = () => {
    if (time === '') setTried(true);
    else onAnswer({ topic: 'day_end', time });
  };
  return (
    <div className="space-y-3">
      <PickTimeButton ariaLabel="Time your day ends" value={time} disabled={busy} onPick={setTime} />
      {tried && time === '' && <WeekCallout>{WHAT_TIME_DAY_ENDS}</WeekCallout>}
      <SetupButton tone="main" size="answer" busy={busy} onClick={tap}>
        {WEEK_WORDS.useThisTime}
      </SetupButton>
    </div>
  );
}

function PlanningControls({ turn, busy, onAnswer }: Pick<WeekCardProps, 'turn' | 'busy' | 'onAnswer'>) {
  const left = planningLeft(turn.draft.model);
  const [weekday, setWeekday] = useState<string | null>(null);
  const [time, setTime] = useState('');
  const [tried, setTried] = useState(false);
  const missingDay = left.weekday && weekday === null;
  const missingTime = left.time && time === '';
  const tap = () => {
    if (missingDay || missingTime) setTried(true);
    else onAnswer({ topic: 'planning_moment', ...(left.weekday ? { weekday: Number(weekday) } : {}), ...(left.time ? { time } : {}) });
  };
  return (
    <div className="space-y-3">
      {left.weekday && <WeekdayGrid choices={WEEKDAYS} answer={weekday} disabled={busy} onPick={setWeekday} />}
      {left.time && <PickTimeButton ariaLabel="Time to plan" value={time} disabled={busy} onPick={setTime} />}
      {tried && missingDay && <WeekCallout>{WHICH_DAY}</WeekCallout>}
      {tried && missingTime && <WeekCallout>{WHAT_TIME}</WeekCallout>}
      <SetupButton tone="main" size="answer" busy={busy} onClick={tap}>
        {WEEK_WORDS.next}
      </SetupButton>
    </div>
  );
}

// The week questions, as cards written by code (MOM-179): the one the newest turn is, by its topic. Nothing is pre-selected on any of them.
export function WeekCard({ turn, said, busy, onAnswer, onType }: WeekCardProps) {
  switch (turn.topic) {
    case 'day_end':
      return (
        <WeekCardFrame topic="day_end" question={WEEK_WORDS.dayEndQuestion} detail={weekCardDetail('day_end')} busy={busy} onType={onType}>
          <DayEndControls busy={busy} onAnswer={onAnswer} />
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
