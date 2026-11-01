'use client';

import { useState } from 'react';
import { casualDate } from '@/lib/dates/casual';
import { ADD_WORDS } from '@/lib/setup/addWords';
import { nextWeekStart, startProblem, startsMidWeek } from '@/lib/setup/addStart';
import type { AddGoalOption } from '@/types/setupScreen';
import { AnswerChoice } from './AnswerChoice';
import { CARD_TEXT, CardLead } from './cardText';
import { PickDateButton } from './DateAnswer';
import { SetupAlert } from './SetupAlert';

interface StartQuestionProps {
  // The goal the target is being added to: its own dates bound the start.
  goal: AddGoalOption;
  // The person's own today, YYYY-MM-DD.
  today: string;
  // Their saved week start (1 Monday to 7 Sunday), or null when none is saved.
  weekStart: number | null;
  // The day the person chose, YYYY-MM-DD. Only a day inside the goal's dates reaches it.
  onChoose: (date: string) => void;
}

// The date as the person reads it elsewhere in setup, never as YYYY-MM-DD.
const longDate = (iso: string, today: string): string => casualDate(iso, today, { relative: false });
const shortDate = (iso: string, today: string): string => casualDate(iso, today, { relative: false, weekday: 'short' });

// The start of a target added to a goal the person already has (MOM-132 part 2). Code proposes the person's own today and the person
// chooses; nothing is picked for them. A day before the goal started or after it ends is refused here in words and goes no further.
// Next week's start is offered only when the week start is saved and today is not it. No Claude call is made on this card.
export function StartQuestion({ goal, today, weekStart, onChoose }: StartQuestionProps) {
  const [problem, setProblem] = useState<string | null>(null);

  const choose = (date: string) => {
    const wrong = startProblem(date, goal);
    if (wrong === 'too_early') setProblem(ADD_WORDS.tooEarly(longDate(goal.startDate, today)));
    else if (wrong === 'too_late' && goal.endDate !== null) setProblem(ADD_WORDS.tooLate(longDate(goal.endDate, today)));
    else {
      setProblem(null);
      onChoose(date);
    }
  };

  const next = nextWeekStart(today, weekStart);
  return (
    <section aria-labelledby="setup-start" className="channel-card space-y-4 p-4">
      <CardLead id="setup-start" leads={problem === null}>
        {ADD_WORDS.startLead}
      </CardLead>
      <p className={CARD_TEXT.secondary}>{ADD_WORDS.startDetail(goal.title, longDate(goal.startDate, today))}</p>
      <p className={CARD_TEXT.body}>{ADD_WORDS.startToday(longDate(today, today))}</p>
      {startsMidWeek(today, weekStart) && <p className={CARD_TEXT.note}>{ADD_WORDS.partWay}</p>}
      {problem && <SetupAlert headline={problem} />}
      <div className="flex flex-col gap-2">
        <AnswerChoice tone="main" onClick={() => choose(today)}>
          {ADD_WORDS.yesToday}
        </AnswerChoice>
        {next !== null && <AnswerChoice onClick={() => choose(next)}>{ADD_WORDS.nextWeek(shortDate(next, today))}</AnswerChoice>}
        <PickDateButton label={ADD_WORDS.pickAnother} tone="answer" disabled={false} onPick={choose} />
      </div>
    </section>
  );
}
