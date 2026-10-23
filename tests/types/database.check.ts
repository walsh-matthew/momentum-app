// Compile-time checks for the central database types (types/database.types.ts). There is nothing to
// run: `npx tsc --noEmit` fails if a @ts-expect-error below stops being an error, or if a valid call
// stops compiling. File is not named *.test.ts, so Vitest skips it.

import { createClient } from '@supabase/supabase-js';
import type { Database, GoalChannel, MicroTask } from '@/types/database.types';

const sb = createClient<Database>('https://example.supabase.co', 'anon-key');

export async function typeChecks() {
  const { data } = await sb.from('micro_tasks').select('*').eq('week_of', 2);
  const tasks: MicroTask[] | null = data;

  const { data: channel } = await sb.from('goal_channels').select('id, criteria').single();
  const done: boolean | undefined = channel?.criteria[0]?.done;

  await sb.from('micro_tasks').insert({ user_id: 'u', goal_channel_id: 'g', title: 't', task_type: 'build', minutes: 30, week_of: 3 });
  // @ts-expect-error task_type must be one of the lowercase keys
  await sb.from('micro_tasks').insert({ user_id: 'u', goal_channel_id: 'g', title: 't', task_type: 'Build', minutes: 30, week_of: 3 });
  // @ts-expect-error status must be 'todo' or 'done'
  await sb.from('micro_tasks').update({ status: 'completed' }).eq('id', 'x');
  // @ts-expect-error goal channel status must be active, paused or done
  await sb.from('goal_channels').update({ status: 'archived' }).eq('id', 'x');

  // History is read-only to clients: only apply_task_move writes it (migration 003).
  await sb.from('task_rebalance_history').select('*').eq('task_id', 'x');
  // @ts-expect-error clients cannot insert history rows
  await sb.from('task_rebalance_history').insert({ user_id: 'u', task_id: 't', source_week: 2, target_week: 3, shift_type: 'carry_over' });
  // @ts-expect-error clients cannot edit history rows
  await sb.from('task_rebalance_history').update({ target_week: 9 }).eq('id', 'x');

  // apply_task_move takes only a carry-over or a pull-forward; there is no delete action.
  await sb.rpc('apply_task_move', { p_task_id: 't', p_from_week: 2, p_to_week: 3, p_action: 'carry_over', p_due_date: null });
  // @ts-expect-error 'delete' is not a rebalance action
  await sb.rpc('apply_task_move', { p_task_id: 't', p_from_week: 2, p_to_week: 3, p_action: 'delete', p_due_date: null });

  // The wizard's answers (migration 008). goal_type is a known key or null; preferences hold only constraints and pace.
  await sb.from('goal_channels').insert({
    user_id: 'u',
    channel_key: 'k',
    title: 't',
    goal_type: 'get_certified',
    preferences: { constraints: ['flexible_hours'], pace: 'lighter' },
  });
  // @ts-expect-error goal_type must be one of the lowercase goal type keys
  await sb.from('goal_channels').insert({ user_id: 'u', channel_key: 'k', title: 't', goal_type: 'Career pivot' });
  // @ts-expect-error pace must be one of the pace keys
  await sb.from('goal_channels').insert({ user_id: 'u', channel_key: 'k', title: 't', preferences: { pace: 'turbo' } });
  // @ts-expect-error constraints must be known keys
  await sb.from('goal_channels').insert({ user_id: 'u', channel_key: 'k', title: 't', preferences: { constraints: ['work_weekends'] } });
  // @ts-expect-error preferences take no other keys
  await sb.from('goal_channels').insert({ user_id: 'u', channel_key: 'k', title: 't', preferences: { theme: 'dark' } });
  const goalType: GoalChannel['goal_type'] = null;
  const prefs: GoalChannel['preferences'] = {};

  const status: GoalChannel['status'] = 'paused';
  return { tasks, done, status, goalType, prefs };
}
