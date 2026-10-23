// What the dashboard can say about how far along a goal is (MOM-86). Derived on read from the user's own goals
// and tasks; nothing here is stored, and nothing here can change a task.

import type { GoalChannelStatus } from './database.types';

// Where the checklist stands, from the task counts alone.
//   empty        the goal has no tasks yet
//   in_progress  some tasks are done or all are still open
//   complete     it has tasks and every one is done
export type GoalCompletion = 'empty' | 'in_progress' | 'complete';

// Where "today" falls in the 13-week plan, from the goal's start date alone.
//   not_started  today is before the start date
//   active       inside weeks 1 to PLAN_WEEKS
//   past_plan    after week PLAN_WEEKS (the day-90 checkpoint has gone by)
//   unknown      the start date could not be read
export type GoalTimeline = 'not_started' | 'active' | 'past_plan' | 'unknown';

export interface GoalProgress {
  goalId: string;
  title: string;
  status: GoalChannelStatus;
  // Finished tasks and all tasks in this goal. Counts tasks, never minutes: hours are not tracked
  // (docs/NINETY_DAY_PLAN_CONTEXT.md §5 rule 4).
  done: number;
  total: number;
  remaining: number;
  // Whole percent of tasks done, rounded down so the figure is never flattering: 100 only when every task is
  // done (§5 rule 8). 0 when the goal has no tasks.
  percent: number;
  completion: GoalCompletion;
  timeline: GoalTimeline;
  // The plan week (1 to PLAN_WEEKS) today falls in; null unless the timeline is 'active'.
  week: number | null;
}
