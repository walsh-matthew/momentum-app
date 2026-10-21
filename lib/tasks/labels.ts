// Presentation strings for task types (docs/NINETY_DAY_PLAN_CONTEXT.md §3). Storage keeps the
// lowercase machine keys; labels live here.

import type { TaskType } from '@/types/database.types';

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
