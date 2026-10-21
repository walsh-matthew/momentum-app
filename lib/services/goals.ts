// Goal channel data access. The only place goal_channels is queried (CLAUDE.md, Architectural
// Directive 1). Server-side only: it reads the request's auth cookies.

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { DEFAULT_HORIZON_DAYS, parseWizardInput } from '@/lib/goals/taskPlan';
import type { GoalChannel, GoalChannelInsert } from '@/types/database.types';
import type { ServiceResult } from './result';

const UNIQUE_VIOLATION = '23505';
const MAX_KEY_ATTEMPTS = 5;

// channel_key must match ^[a-z][a-z0-9_]*$ (migration 001), and is unique per user.
export function toChannelKey(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (slug === '') return 'goal';
  return /^[a-z]/.test(slug) ? slug : `goal_${slug}`;
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export async function listGoalChannels(): Promise<ServiceResult<GoalChannel[]>> {
  const supabase = await createSupabaseServerClient();
  // RLS limits this to the signed-in user's rows.
  const { data, error } = await supabase
    .from('goal_channels')
    .select('*')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

// Creates a goal channel from raw wizard input. Validates again here because this is reachable
// from any caller, not just the wizard UI. Wizard selections beyond the title are not stored yet
// (no columns for them; see BACKLOG.md).
export async function createGoalChannel(rawInput: unknown): Promise<ServiceResult<GoalChannel>> {
  const parsed = parseWizardInput(rawInput);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const input = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return { ok: false, error: 'Sign in to create a goal.' };

  const start = new Date();
  const target = new Date(start);
  target.setUTCDate(target.getUTCDate() + DEFAULT_HORIZON_DAYS);

  const baseKey = toChannelKey(input.title);
  for (let attempt = 1; attempt <= MAX_KEY_ATTEMPTS; attempt++) {
    const row: GoalChannelInsert = {
      user_id: auth.user.id,
      channel_key: attempt === 1 ? baseKey : `${baseKey}_${attempt}`,
      title: input.title,
      status: 'active',
      // The one-default-per-user index belongs to the seeded channel; wizard goals are never default.
      is_default: false,
      start_date: isoDate(start),
      target_date: isoDate(target),
      criteria: [],
    };
    const { data, error } = await supabase.from('goal_channels').insert(row).select().single();
    if (!error) return { ok: true, data };
    if (error.code !== UNIQUE_VIOLATION) return { ok: false, error: error.message };
    // Key already taken by one of this user's channels; retry with a numeric suffix.
  }
  return { ok: false, error: 'You already have goals with similar names. Try a different title.' };
}
