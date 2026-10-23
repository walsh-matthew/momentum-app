// Goal channel data access. The only place goal_channels is queried (CLAUDE.md, Architectural
// Directive 1). Server-side only: it reads the request's auth cookies.

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { InitialCriteriaSchema, criteriaFor } from '@/lib/goals/criteria';
import { DEFAULT_HORIZON_DAYS, parseWizardInput, preferencesFrom, type WizardInput } from '@/lib/goals/taskPlan';
import type { GoalChannel, GoalChannelInsert, GoalCriterion, GoalPreferences, GoalType } from '@/types/database.types';
import type { ServiceResult } from './result';

export const UNIQUE_VIOLATION = '23505';
export const MAX_KEY_ATTEMPTS = 5;

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

// The first attempt uses the plain key; a collision with another of the user's channels adds a number.
export const channelKeyFor = (title: string, attempt: number) => {
  const base = toChannelKey(title);
  return attempt === 1 ? base : `${base}_${attempt}`;
};

// What a wizard goal is created with, apart from its key and owner. Shared by createGoalChannel and by
// createGoalWithWeekOnePlan (tasks.ts), so a goal starts the same way whichever way it is saved: the goal
// type and preferences the user chose, criteria from the goal type, all unticked, and a day-90 checkpoint.
export interface NewGoalFields {
  title: string;
  goal_type: GoalType;
  preferences: GoalPreferences;
  criteria: GoalCriterion[];
  start_date: string;
  target_date: string;
}

export function buildNewGoalFields(input: WizardInput, now: Date = new Date()): ServiceResult<NewGoalFields> {
  const criteria = InitialCriteriaSchema.safeParse(criteriaFor(input.goalType));
  if (!criteria.success) return { ok: false, error: 'Could not build the starting criteria for this goal type.' };

  const target = new Date(now);
  target.setUTCDate(target.getUTCDate() + DEFAULT_HORIZON_DAYS);
  return {
    ok: true,
    data: {
      title: input.title,
      goal_type: input.goalType,
      preferences: preferencesFrom(input),
      criteria: criteria.data,
      start_date: isoDate(now),
      target_date: isoDate(target),
    },
  };
}

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
// from any caller, not just the wizard UI. The goal type, constraints and pace are stored on the row
// (migration 008), so they reload with the goal; review prompts only shape the starter plan. The
// criteria come from the goal type and start unticked: the user owns completion.
export async function createGoalChannel(rawInput: unknown): Promise<ServiceResult<GoalChannel>> {
  const parsed = parseWizardInput(rawInput);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const input = parsed.data;

  const fields = buildNewGoalFields(input);
  if (!fields.ok) return fields;

  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return { ok: false, error: 'Sign in to create a goal.' };

  for (let attempt = 1; attempt <= MAX_KEY_ATTEMPTS; attempt++) {
    const row: GoalChannelInsert = {
      user_id: auth.user.id,
      channel_key: channelKeyFor(input.title, attempt),
      ...fields.data,
      status: 'active',
      // The one-default-per-user index belongs to the seeded channel; wizard goals are never default.
      is_default: false,
    };
    const { data, error } = await supabase.from('goal_channels').insert(row).select().single();
    if (!error) return { ok: true, data };
    if (error.code !== UNIQUE_VIOLATION) return { ok: false, error: error.message };
    // Key already taken by one of this user's channels; retry with a numeric suffix.
  }
  return { ok: false, error: 'You already have goals with similar names. Try a different title.' };
}
