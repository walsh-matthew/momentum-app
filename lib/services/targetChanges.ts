// MOM-146: saves a change to a target's levels from the weekly review's "Yes, I want to change it" (migration 020,
// docs/DOMAIN_MODEL.md §1.7 and §3.2). The only place target_changes is written (CLAUDE.md, Architectural Directive 1).
//
// A change is always a new row that starts with the period right after the reviewed one, and never before the period the person is in
// (lib/engine/baseline.ts changeEffectiveFrom), so a closed period keeps the numbers it was judged by and nothing is ever re-graded.
// The numbers are the person's own and code validates them (the same
// checkChange the form uses, run again here because a Server Action is reachable by direct POST); Claude has no part in it. It runs
// as the signed-in person through the anon-key client, so row level security limits it to their own target. It touches no target row.

import { z } from 'zod';
import { addDays, canGrade, changeEffectiveFrom, localDay, weekRange, weeklyReviewWindow } from '@/lib/engine';
import { CHANGE_NOT_READ, CHANGE_SAVE_FAILED, checkChange } from '@/lib/review/targetChange';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { SavedTargetChange } from '@/types/review';
import type { ServiceResult } from './result';
import { toAnchors, toWeekday } from './scoreboardRows';

const SIGNED_OUT = 'Sign in to change a target.';
const NOT_FOUND = "That target couldn't be found. Nothing was changed.";
const NOT_EDITABLE = "That target can't be changed here. Nothing was changed.";
const NEEDS_WEEK_START = 'Set the day your week starts in settings first. Nothing was changed.';

// What the form sends: the two boxes as typed and, for a day-slots target, the days (1 to 7, Monday is 1).
const Input = z.object({
  targetId: z.string().uuid(),
  floor: z.string().max(24),
  aspiration: z.string().max(24),
  days: z.array(z.number()).max(14).nullable(),
});

export interface TargetChangeDeps {
  // The clock, for tests. Never set from a request.
  now?: () => number;
}

export async function saveTargetChange(raw: unknown, deps: TargetChangeDeps = {}): Promise<ServiceResult<SavedTargetChange>> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: CHANGE_NOT_READ };
  const input = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return { ok: false, error: SIGNED_OUT };
  const userId = auth.user.id;

  const target = await supabase
    .from('targets')
    .select('id, goal_id, measure, period_kind, floor')
    .eq('id', input.targetId)
    .eq('user_id', userId)
    .maybeSingle();
  if (target.error) return { ok: false, error: CHANGE_SAVE_FAILED };
  if (target.data === null) return { ok: false, error: NOT_FOUND };
  const row = target.data;
  // A deadline period has one period and no next one; a checklist's numbers are its steps. Neither is changed here.
  if ((row.period_kind !== 'weekly' && row.period_kind !== 'day_slots') || row.measure === 'checklist' || row.floor === null) {
    return { ok: false, error: NOT_EDITABLE };
  }

  const [goal, settings] = await Promise.all([
    supabase.from('goals').select('id, state, start_date').eq('id', row.goal_id).eq('user_id', userId).maybeSingle(),
    supabase.from('person_settings').select('time_zone, week_start, day_end, planning_weekday').eq('user_id', userId).maybeSingle(),
  ]);
  if (goal.error || settings.error) return { ok: false, error: CHANGE_SAVE_FAILED };
  if (goal.data === null) return { ok: false, error: NOT_FOUND };
  if (goal.data.state !== 'active' || goal.data.start_date === null) return { ok: false, error: NOT_EDITABLE };

  // A weekly target has no days of its own to change.
  const checked = checkChange({ floor: input.floor, aspiration: input.aspiration, days: row.period_kind === 'day_slots' ? (input.days ?? []) : null }, row.measure);
  if (!checked.ok) return { ok: false, error: checked.message };

  const anchors = toAnchors(settings.data);
  if (!canGrade(anchors, 'weekly').ok || anchors.weekStartsOn === null) return { ok: false, error: NEEDS_WEEK_START };
  const today = localDay(new Date((deps.now ?? Date.now)()).toISOString(), anchors);
  // The week the review covers, worked out from the person's own settings, never sent by the browser. Without a review due, the week
  // that last closed stands in for it, so the change still starts with the week the person is in and no closed week moves.
  const planning = settings.data?.planning_weekday == null ? null : toWeekday(settings.data.planning_weekday);
  const reviewed = weeklyReviewWindow(today, anchors.weekStartsOn, planning);
  const reviewedEnd = reviewed === null ? addDays(weekRange(today, anchors.weekStartsOn).start, -1) : reviewed.end;
  const effectiveFrom = changeEffectiveFrom(reviewedEnd, today, goal.data.start_date, anchors.weekStartsOn);

  const { value } = checked;
  const { error } = await supabase.from('target_changes').insert({
    user_id: userId,
    target_id: row.id,
    effective_from: effectiveFrom,
    floor: value.floor,
    aspiration: value.aspiration,
    slot_weekdays: value.days,
  });
  if (error) {
    // The code only: the message can quote the row.
    console.error('[target-change] could not save a change', { code: error.code ?? 'none' });
    return { ok: false, error: CHANGE_SAVE_FAILED };
  }
  return { ok: true, data: { targetId: row.id, effectiveFrom, floor: value.floor, aspiration: value.aspiration, days: value.days } };
}
