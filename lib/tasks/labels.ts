// Presentation strings for task types and rebalancing (docs/NINETY_DAY_PLAN_CONTEXT.md §3, §5, §10).
// Storage keeps the lowercase machine keys; labels live here.

import type { TaskType } from '@/types/database.types';
import type { RebalanceAction, TimelineWarningKind } from '@/types/rebalance';

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  job_search: 'Job search',
  interview_fill_in: 'Interview fill-in',
  interview_prep: 'Interview prep',
  build: 'Build',
  learn: 'Learn',
  certify: 'Certify',
  position: 'Position',
  event: 'Event',
  publish: 'Publish',
  review: 'Review',
  funnel_check: 'Funnel check',
};

// Carry-over language from §3 (task markers) and §5 rule 1. There is deliberately no label for
// removing a task.
export const REBALANCE_ACTION_LABELS: Record<RebalanceAction, string> = {
  carry_over: 'Carry over',
  pull_forward: 'Pull forward',
};

export const TIMELINE_WARNING_LABELS: Record<TimelineWarningKind, string> = {
  compression: 'Heavy week ahead',
  cannot_hold: "Timeline can't hold",
};
