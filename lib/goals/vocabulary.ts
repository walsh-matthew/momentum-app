// Wizard vocabulary: prompt chips drawn from the plan's real language
// (docs/NINETY_DAY_PLAN_CONTEXT.md §9). Keys are lowercase machine keys; labels are presentation.

// The goal type, constraint and pace keys are stored on goal_channels, so they live in
// types/database.types.ts next to the CHECK lists they mirror. Re-exported so wizard code imports
// everything it needs from here.
import {
  CONSTRAINTS,
  GOAL_TYPES,
  PACES,
  type Constraint,
  type GoalType,
  type Pace,
} from '@/types/database.types';

export { CONSTRAINTS, GOAL_TYPES, PACES };
export type { Constraint, GoalType, Pace };

export const WIZARD_STEPS = ['goal_type', 'constraints', 'pace', 'review'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export const WIZARD_STEP_LABELS: Record<WizardStep, string> = {
  goal_type: 'Goal type',
  constraints: 'Constraints',
  pace: 'Pace',
  review: 'Review',
};

export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  career_pivot: 'Career pivot',
  get_certified: 'Get certified',
  portfolio_piece: 'Build a portfolio piece',
  interview_prep: 'Prepare for interviews',
  grow_network: 'Grow my network',
};

export const CONSTRAINT_LABELS: Record<Constraint, string> = {
  flexible_hours: 'Hours are flexible',
  contract_work_first: 'Contract work first',
  dont_track_hours: "Don't track hours",
  flexible_dates: 'Keep dates flexible',
};

export const PACE_LABELS: Record<Pace, string> = {
  lighter: 'Lighter week',
  heavier: 'Heavier week',
  ahead: "I'm ahead",
  behind: 'I fell behind',
  carry_over: 'Carry over what I missed',
};

export const REVIEW_PROMPTS = ['took_longer', 'skipped', 'surprised'] as const;
export type ReviewPrompt = (typeof REVIEW_PROMPTS)[number];

export const REVIEW_PROMPT_LABELS: Record<ReviewPrompt, string> = {
  took_longer: 'What took longer',
  skipped: 'What I skipped',
  surprised: 'What surprised me',
};
