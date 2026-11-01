'use client';

import { ADD_WORDS } from '@/lib/setup/addWords';
import type { AddGoalOption } from '@/types/setupScreen';
import { AnswerChoice } from './AnswerChoice';
import { CARD_TEXT, CardLead } from './cardText';

interface AddChooserProps {
  // Whether the person has an active goal a target could be added to.
  hasActiveGoal: boolean;
  onNewGoal: () => void;
  onNewTarget: () => void;
}

// What a person who has finished setup is asked on /setup (MOM-132 part 2): a new goal, or a target for a goal they have. It replaces
// the old "Setup is already done" card. Nothing is asked of Claude here; the tap starts the conversation, as Start does in a first setup.
// The way back to home is the page's own "Back to home" row at the top (components/layout/PageBackRow.tsx).
export function AddChooser({ hasActiveGoal, onNewGoal, onNewTarget }: AddChooserProps) {
  return (
    <section aria-labelledby="add-choose" className="channel-card space-y-4 p-4">
      <CardLead id="add-choose">{ADD_WORDS.chooseLead}</CardLead>
      <p className={CARD_TEXT.secondary}>{ADD_WORDS.chooseDetail}</p>
      <div className="flex flex-col gap-2">
        <AnswerChoice onClick={onNewGoal}>{ADD_WORDS.newGoal}</AnswerChoice>
        {hasActiveGoal ? <AnswerChoice onClick={onNewTarget}>{ADD_WORDS.newTarget}</AnswerChoice> : <p className={CARD_TEXT.note}>{ADD_WORDS.noActiveGoal}</p>}
      </div>
    </section>
  );
}

interface AddGoalPickerProps {
  goals: AddGoalOption[];
  onPick: (goal: AddGoalOption) => void;
}

// Which goal a target is for: one button per active goal. A parked goal is not listed; a target can only be added to a goal that is going.
export function AddGoalPicker({ goals, onPick }: AddGoalPickerProps) {
  return (
    <section aria-labelledby="add-which" className="channel-card space-y-4 p-4">
      <CardLead id="add-which">{ADD_WORDS.whichLead}</CardLead>
      <p className={CARD_TEXT.secondary}>{ADD_WORDS.whichDetail}</p>
      <div className="flex flex-col gap-2">
        {goals.map((goal) => (
          <AnswerChoice key={goal.id} onClick={() => onPick(goal)}>
            {goal.title}
          </AnswerChoice>
        ))}
      </div>
    </section>
  );
}
