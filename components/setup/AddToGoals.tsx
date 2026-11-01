'use client';

import { useEffect, useState } from 'react';
import type { ReturningMode } from '@/lib/setup/returning';
import type { AddGoalOption, AddOptions } from '@/types/setupScreen';
import { AddChooser, AddGoalPicker } from './AddChoices';
import { SetupConversation } from './SetupConversation';
import { clearAddPointer, loadAddPointer, storeAddPointer } from './setupStorage';

interface AddToGoalsProps {
  // The signed-in person's id (their own, from the server's session). It only names this tab's copy of what they are in the middle of.
  userId: string;
  // Read on the server from the person's own rows: the goals a target can be added to, their week start and their own today.
  options: AddOptions;
}

type Step = { at: 'loading' } | { at: 'choose' } | { at: 'pick' } | { at: 'chat'; mode: ReturningMode; goal: AddGoalOption | null };

// What a person who has finished setup sees on /setup (MOM-132 part 2): the chooser, which goal, then the same conversation as a first
// setup, held to what is already saved. A reload in the middle of a conversation opens straight back on it (what the person was adding
// is kept in this tab, like the conversation). Claude is asked only after a tap, never on page load.
export function AddToGoals({ userId, options }: AddToGoalsProps) {
  const [step, setStep] = useState<Step>({ at: 'loading' });

  // Read this tab's pointer after the first render, so the server and the browser render the same thing first.
  useEffect(() => {
    const pointer = loadAddPointer(userId);
    if (pointer?.mode === 'add_goal') {
      setStep({ at: 'chat', mode: 'add_goal', goal: null });
      return;
    }
    const goal = pointer ? options.goals.find((g) => g.id === pointer.goalId) : undefined;
    setStep(goal ? { at: 'chat', mode: 'add_target', goal } : { at: 'choose' });
  }, [userId, options.goals]);

  if (step.at === 'loading') return null;
  if (step.at === 'choose') {
    return (
      <AddChooser
        hasActiveGoal={options.goals.length > 0}
        onNewGoal={() => {
          storeAddPointer(userId, { mode: 'add_goal', goalId: null });
          setStep({ at: 'chat', mode: 'add_goal', goal: null });
        }}
        onNewTarget={() => setStep({ at: 'pick' })}
      />
    );
  }
  if (step.at === 'pick') {
    return (
      <AddGoalPicker
        goals={options.goals}
        onPick={(goal) => {
          storeAddPointer(userId, { mode: 'add_target', goalId: goal.id });
          setStep({ at: 'chat', mode: 'add_target', goal });
        }}
      />
    );
  }
  return (
    <SetupConversation
      userId={userId}
      adding={{ mode: step.mode, goal: step.goal, weekStart: options.weekStart, today: options.today, onSaved: () => clearAddPointer(userId) }}
    />
  );
}
