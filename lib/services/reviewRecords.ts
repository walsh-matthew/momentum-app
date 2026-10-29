// MOM-113 block 3.2: the weekly review's record (migration 018) and the light read behind home's notice.
//
// recordFinishedReview() stores what a finished review said, once per week. It recomputes the review on the server
// (getWeeklyReviewFacts) and stores that, never anything the browser sends beyond the person's own choice, so the record
// is the engine's recap and nothing else. A second write for the same week is refused, here and by the database's unique
// key, and a stored record is never updated or deleted (the table has no such grant): a later entry is shown against it in
// words instead (RAID R-26). Nothing calls this yet: the finish button is block 3.3, with layer 3's choice.
//
// getReviewPrompt() answers only "is a review due, or already done?", for the one line home shows. It reads the settings and
// this week's record, never the scoreboard, so home does not read every entry a second time. Neither function makes a
// Claude call.

import { canGrade, localDay, weeklyReviewWindow } from '@/lib/engine';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { REVIEW_ADJUSTMENT_OUTCOMES, type Json, type PersonSettingsRow } from '@/types/database.types';
import type { ReviewPrompt } from '@/types/review';
import type { ReviewWindow } from '@/types/scoreboard';
import type { ServiceResult } from './result';
import { getWeeklyReviewFacts, type WeeklyReviewFactsDeps } from './review';
import { toAnchors, toWeekday } from './scoreboardRows';

const SIGNED_OUT = 'Sign in to finish your weekly review.';
const NOT_READY = 'There is no weekly review to finish right now.';
const ALREADY_FINISHED = "You already finished this week's review.";
const BAD_REQUEST = 'That choice could not be read. Nothing was saved.';
const FINISH_FAILED = 'Could not save your weekly review.';

export interface FinishedReview {
  id: string;
  weekStart: string;
}

// Stores the review that is due now, with the person's choice about the one adjustment it offered. `outcome` is required
// when an adjustment was offered and must be absent when none was: a choice with nothing offered cannot be recorded.
export async function recordFinishedReview(outcome: unknown, deps: WeeklyReviewFactsDeps = {}): Promise<ServiceResult<FinishedReview>> {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return { ok: false, error: SIGNED_OUT };
  const userId = auth.user.id;

  const read = await getWeeklyReviewFacts(deps);
  if (!read.ok) return read;
  const facts = read.data;
  if (facts.state === 'reviewed') return { ok: false, error: ALREADY_FINISHED };
  if (facts.state !== 'ready') return { ok: false, error: NOT_READY };

  const chosen = outcome === undefined || outcome === null ? null : (REVIEW_ADJUSTMENT_OUTCOMES.find((o) => o === outcome) ?? false);
  if (chosen === false) return { ok: false, error: BAD_REQUEST };
  if ((facts.adjustment === null) !== (chosen === null)) return { ok: false, error: BAD_REQUEST };

  const { data, error } = await supabase
    .from('weekly_reviews')
    .insert({
      user_id: userId,
      week_start: facts.window.start,
      week_end: facts.window.end,
      recap: facts.recap as unknown as Json,
      adjustment_kind: facts.adjustment?.kind ?? null,
      adjustment: facts.adjustment === null ? null : (facts.adjustment as unknown as Json),
      adjustment_outcome: chosen,
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') return { ok: false, error: ALREADY_FINISHED };
    // The code only: the message can quote the row.
    console.error('[weekly-review] could not save a finished review', { code: error.code ?? 'none' });
    return { ok: false, error: FINISH_FAILED };
  }
  return { ok: true, data: { id: data.id, weekStart: facts.window.start } };
}

export type PromptSettings = Pick<PersonSettingsRow, 'time_zone' | 'week_start' | 'day_end' | 'planning_weekday'>;

// Pure: the week a review would cover today, or null. Only on the person's own planning day, and only once the week start
// and the planning day are chosen (principle 1: nothing is guessed).
export function promptWindow(settings: PromptSettings | null, nowMs: number): ReviewWindow | null {
  if (settings === null || settings.planning_weekday === null) return null;
  const anchors = toAnchors(settings);
  if (!canGrade(anchors, 'deadline').ok || anchors.weekStartsOn === null) return null;
  const today = localDay(new Date(nowMs).toISOString(), anchors);
  return weeklyReviewWindow(today, anchors.weekStartsOn, toWeekday(settings.planning_weekday));
}

// Pure: due when there is a window and no record for it, reviewed when there is one, and nothing without an active goal.
// `reviewedWeekStarts` are the week starts that already have a record.
export function reviewPromptFor(
  input: { settings: PromptSettings | null; hasActiveGoal: boolean; reviewedWeekStarts: string[] },
  nowMs: number,
): ReviewPrompt {
  const window = input.hasActiveGoal ? promptWindow(input.settings, nowMs) : null;
  if (window === null) return { state: 'none' };
  return input.reviewedWeekStarts.includes(window.start) ? { state: 'reviewed' } : { state: 'due' };
}

// Home's one line about the review. A read that fails is "none": the line is a convenience, and the review page is
// still there, so home never fails over it.
export async function getReviewPrompt(deps: WeeklyReviewFactsDeps = {}): Promise<ReviewPrompt> {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return { state: 'none' };
  const userId = auth.user.id;
  const nowMs = (deps.now ?? Date.now)();

  const [settings, goals] = await Promise.all([
    supabase.from('person_settings').select('time_zone, week_start, day_end, planning_weekday').eq('user_id', userId).maybeSingle(),
    supabase.from('goals').select('id').eq('user_id', userId).eq('state', 'active').limit(1),
  ]);
  if (settings.error || goals.error) return { state: 'none' };
  const hasActiveGoal = goals.data.length > 0;

  // Which week this is needs the settings first, so the record is read second and only for that week.
  const window = hasActiveGoal ? promptWindow(settings.data, nowMs) : null;
  if (window === null) return { state: 'none' };
  const done = await supabase.from('weekly_reviews').select('week_start').eq('user_id', userId).eq('week_start', window.start).limit(1);
  if (done.error) return { state: 'none' };
  return reviewPromptFor({ settings: settings.data, hasActiveGoal, reviewedWeekStarts: done.data.map((r) => r.week_start) }, nowMs);
}
