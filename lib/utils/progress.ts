// Goal progress from a goal's tasks (MOM-86). Pure: no database, no clock (the caller passes today's date),
// no writes. It only counts the tasks it is given, so it can never complete, reopen or change one
// (docs/NINETY_DAY_PLAN_CONTEXT.md §3, §5 rule 6). Completion stays the user's own tick.

import { PLAN_WEEKS, type GoalChannel, type MicroTask } from '@/types/database.types';
import type { GoalCompletion, GoalProgress, GoalTimeline } from '@/types/progress';

const MS_PER_DAY = 86_400_000;
const WEEK_DAYS = 7;

type ProgressGoal = Pick<GoalChannel, 'id' | 'title' | 'status' | 'start_date'>;
type ProgressTask = Pick<MicroTask, 'goal_channel_id' | 'status'>;

// Where `asOf` falls in a plan that starts on `startDate` (both YYYY-MM-DD). Same week arithmetic as
// currentPlanWeek in velocity.ts, but it keeps the two cases that function folds into week 1 and into a
// week past 13 apart, because a goal that has not started or has run out of weeks is not "in week N".
export function planTimeline(startDate: string, asOf: string): { timeline: GoalTimeline; week: number | null } {
  const start = Date.parse(startDate);
  const now = Date.parse(asOf);
  if (Number.isNaN(start) || Number.isNaN(now)) return { timeline: 'unknown', week: null };
  const days = Math.floor((now - start) / MS_PER_DAY);
  if (days < 0) return { timeline: 'not_started', week: null };
  const week = Math.floor(days / WEEK_DAYS) + 1;
  if (week > PLAN_WEEKS) return { timeline: 'past_plan', week: null };
  return { timeline: 'active', week };
}

// Whole percent, rounded down: 199 of 200 is 99, never 100. 100 only when every task is done.
export function percentDone(done: number, total: number): number {
  if (total <= 0) return 0;
  if (done >= total) return 100;
  return Math.floor((done * 100) / total);
}

function completionOf(done: number, total: number): GoalCompletion {
  if (total === 0) return 'empty';
  return done === total ? 'complete' : 'in_progress';
}

function summarize(goal: ProgressGoal, done: number, total: number, asOf: string): GoalProgress {
  const { timeline, week } = planTimeline(goal.start_date, asOf);
  return {
    goalId: goal.id,
    title: goal.title,
    status: goal.status,
    done,
    total,
    remaining: total - done,
    percent: percentDone(done, total),
    completion: completionOf(done, total),
    timeline,
    week,
  };
}

// One goal's progress. Tasks that belong to other goals are ignored, so passing the user's whole task list is safe.
export function summarizeGoalProgress(goal: ProgressGoal, tasks: readonly ProgressTask[], asOf: string): GoalProgress {
  let done = 0;
  let total = 0;
  for (const task of tasks) {
    if (task.goal_channel_id !== goal.id) continue;
    total += 1;
    if (task.status === 'done') done += 1;
  }
  return summarize(goal, done, total, asOf);
}

// Every goal's progress, in the order the goals are given, from one pass over the tasks. A goal with no
// tasks is still listed (0 of 0), and tasks whose goal is not in the list are ignored.
export function summarizeAllGoalProgress(
  goals: readonly ProgressGoal[],
  tasks: readonly ProgressTask[],
  asOf: string,
): GoalProgress[] {
  const counts = new Map<string, { done: number; total: number }>();
  for (const task of tasks) {
    const entry = counts.get(task.goal_channel_id) ?? { done: 0, total: 0 };
    entry.total += 1;
    if (task.status === 'done') entry.done += 1;
    counts.set(task.goal_channel_id, entry);
  }
  return goals.map((goal) => {
    const entry = counts.get(goal.id);
    return summarize(goal, entry?.done ?? 0, entry?.total ?? 0, asOf);
  });
}
