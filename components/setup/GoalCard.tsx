'use client';

import { BLOCK_CHOICES, SHAPE_CHOICES, STARTING_POINTS, goalCardDetail, type GoalChoice } from '@/lib/setup/goalCards';
import type { AssistantTurn } from '@/types/setup';
import { AnswerChoice } from './AnswerChoice';
import { CARD_TEXT } from './cardText';
import { WeekCardFrame } from './WeekCardFrame';

interface GoalCardProps {
  // The card code wrote (lib/setup/goalCards.ts): its topic says which one it is.
  turn: AssistantTurn;
  busy: boolean;
  // The words of a tap, which the screen reads as the card's answer (lib/setup/goalCards.ts answerGoalCard).
  onAnswer: (text: string) => void;
  // "Type your answer": the person's own words, sent to Claude.
  onType: (text: string) => void;
}

// The choices a button card offers, by topic. A day or a proposal is a card of its own layout (QuestionCard), so it has none here.
export function choicesFor(turn: AssistantTurn): readonly GoalChoice<unknown>[] | null {
  if (turn.topic === 'starting_point') return STARTING_POINTS;
  if (turn.topic === 'shape') return SHAPE_CHOICES;
  if (turn.topic === 'block_length' && turn.kind === 'question') return BLOCK_CHOICES;
  return null;
}

// The goal questions that are a few buttons (MOM-180 B1): where the person is with it, the goal's shape, how many weeks the first stretch runs.
// Nothing is pre-selected. Each tap is the person's own answer; "Type your answer" and "What does this mean?" are on every card, as on the week cards.
export function GoalCard({ turn, busy, onAnswer, onType }: GoalCardProps) {
  const choices = choicesFor(turn) ?? [];
  return (
    <WeekCardFrame card="goal" topic={turn.topic ?? ''} question={turn.question ?? ''} detail={goalCardDetail(turn)} busy={busy} onType={onType}>
      {turn.skipped && <p className={CARD_TEXT.note}>{turn.skipped.line}</p>}
      <div className="flex flex-col gap-2">
        {choices.map((c) => (
          <AnswerChoice key={c.say} disabled={busy} onClick={() => onAnswer(c.say)}>
            {c.label}
          </AnswerChoice>
        ))}
      </div>
    </WeekCardFrame>
  );
}
