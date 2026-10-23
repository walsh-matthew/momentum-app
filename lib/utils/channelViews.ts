// Builds the per-channel views the home page switches between (MOM-44). Pure: no database, no clock (the
// caller passes today's date) and no writes, so it can never complete, reopen or move a task
// (docs/NINETY_DAY_PLAN_CONTEXT.md §3, §5 rule 6). It only slices the goals and tasks it is given, which the
// caller read through the user's own session (RLS), so another user's data cannot appear here.
//
// Each channel's velocity uses that channel's own start date for its plan week, because the weeks of two goals
// that started on different days are not comparable. "All channels" shows every active goal's tasks in one
// feed; it has a velocity only when exactly one goal is active, and otherwise says to pick a channel, rather
// than blend weeks that mean different things.

import type { GoalChannel, MicroTask } from '@/types/database.types';
import { ALL_CHANNELS, type ChannelView, type ChannelViews } from '@/types/channelViews';
import { buildFocusFeed } from './focusFeed';
import { computeVelocity, currentPlanWeek, type VelocityMove } from './velocity';

type ChannelGoal = Pick<GoalChannel, 'id' | 'title' | 'status' | 'start_date'>;

export function buildChannelViews(
  goals: readonly ChannelGoal[],
  tasks: readonly MicroTask[],
  history: readonly VelocityMove[],
  today: string,
): ChannelViews {
  // Only active goals are channels. A paused or finished goal's tasks stay out of every view; they are not
  // deleted, and reappear if the goal becomes active again.
  const active = goals.filter((g) => g.status === 'active');
  const tasksByGoal = new Map<string, MicroTask[]>(active.map((g) => [g.id, []]));
  for (const task of tasks) tasksByGoal.get(task.goal_channel_id)?.push(task);

  const byChannel: Record<string, ChannelView> = {};
  for (const goal of active) {
    const own = tasksByGoal.get(goal.id) ?? [];
    const week = currentPlanWeek(goal.start_date, today);
    byChannel[goal.id] = {
      feed: buildFocusFeed(own),
      velocity: week === null ? null : computeVelocity(own, week, today, history),
      velocityHint: null,
    };
  }

  const everyActiveTask = active.flatMap((g) => tasksByGoal.get(g.id) ?? []);
  byChannel[ALL_CHANNELS] = {
    feed: buildFocusFeed(everyActiveTask),
    velocity: active.length === 1 ? byChannel[active[0].id].velocity : null,
    velocityHint: active.length > 1 ? 'choose_channel' : null,
  };

  return { channels: active.map((g) => ({ id: g.id, title: g.title })), byChannel };
}

// The view to show for a selection. A selection that is no longer a channel (the goal was paused, or the page
// was refreshed after it changed) falls back to all channels instead of showing nothing.
export function resolveChannel(views: ChannelViews, selected: string): string {
  return Object.hasOwn(views.byChannel, selected) ? selected : ALL_CHANNELS;
}
