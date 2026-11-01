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
//
// "Still right for you?" (MOM-113 block 3.4): when the review asked about setup suggestions, the person's answers arrive with the finish.
// The server recomputes which marks were asked (never trusts the browser for that), stores the review first (adjustment kind
// 'still_right', holding mark ids, fields and answers and nothing the person said), and then records each answer through
// answerStartingPoint(). A mark the person had already changed is recorded as changed, unless they answered it in this sitting. If an
// answer cannot be written, the review stays finished and that mark is asked again at the next review.

import { canGrade, localDay, weeklyReviewWindow } from '@/lib/engine';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  REVIEW_ADJUSTMENT_OUTCOMES,
  STARTING_POINT_OUTCOMES,
  type Json,
  type PersonSettingsRow,
  type ReviewAdjustmentKind,
  type ReviewAdjustmentOutcome,
  type StartingPointOutcome,
} from '@/types/database.types';
import type { ReviewPrompt } from '@/types/review';
import type { ReviewWindow } from '@/types/scoreboard';
import type { ServiceResult } from './result';
import { getWeeklyReviewFacts, type WeeklyReviewFactsDeps } from './review';
import { toAnchors, toWeekday } from './scoreboardRows';
import { answerStartingPoint } from './startingPoints';

const SIGNED_OUT = 'Sign in to finish your weekly review.';
const NOT_READY = 'There is no weekly review to finish right now.';
const ALREADY_FINISHED = "You already finished this week's review.";
const BAD_REQUEST = 'That choice could not be read. Nothing was saved.';
const FINISH_FAILED = 'Could not save your weekly review.';

export interface FinishedReview {
  id: string;
  weekStart: string;
}

// The answers to "Still right for you?" as the browser sent them: mark id to kept or changed. Ids that are not marks of this review are
// left out (they can touch nothing); a value that is not an answer, or a shape that is not a plain object, is refused.
function readAnswers(raw: unknown, known: ReadonlySet<string>): Map<string, StartingPointOutcome> | null {
  const answers = new Map<string, StartingPointOutcome>();
  if (raw === undefined || raw === null) return answers;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  for (const [id, value] of Object.entries(raw)) {
    const answer = STARTING_POINT_OUTCOMES.find((o) => o === value);
    if (answer === undefined) return null;
    if (known.has(id)) answers.set(id, answer);
  }
  return answers;
}

// Stores the review that is due now, with the person's choice about the one adjustment it offered. `outcome` is required
// when an adjustment was offered and must be absent when none was: a choice with nothing offered cannot be recorded.
// `answers` are the person's answers to "Still right for you?" when the review asked it; that card takes the adjustment's place, so
// `outcome` is absent then and every mark that was asked needs an answer.
export async function recordFinishedReview(outcome: unknown, deps: WeeklyReviewFactsDeps = {}, answers?: unknown): Promise<ServiceResult<FinishedReview>> {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return { ok: false, error: SIGNED_OUT };
  const userId = auth.user.id;

  const read = await getWeeklyReviewFacts(deps);
  if (!read.ok) return read;
  const facts = read.data;
  if (facts.state === 'reviewed') return { ok: false, error: ALREADY_FINISHED };
  if (facts.state !== 'ready') return { ok: false, error: NOT_READY };

  const { asking, changed } = facts.stillRight;
  const marks = [...asking, ...changed];
  const given = readAnswers(answers, new Set(marks.map((m) => m.id)));
  if (given === null) return { ok: false, error: BAD_REQUEST };
  // The card was shown when something was asked, or when the person answered marks in this sitting (their change moved them out of
  // the asked list). Either way it took the engine's adjustment's place, so no choice about one comes with it.
  const stillRight = asking.length > 0 || given.size > 0;

  let chosen: ReviewAdjustmentOutcome | null;
  let kind: ReviewAdjustmentKind | null;
  let adjustment: Json | null;
  if (stillRight) {
    if (outcome !== undefined && outcome !== null) return { ok: false, error: BAD_REQUEST };
    if (asking.some((m) => !given.has(m.id))) return { ok: false, error: BAD_REQUEST };
    const items = marks.filter((m) => given.has(m.id)).map((m) => ({ id: m.id, field: m.field, outcome: given.get(m.id) as StartingPointOutcome }));
    kind = 'still_right';
    adjustment = { v: 1, items };
    chosen = items.some((i) => i.outcome === 'changed') ? 'changed' : 'declined';
  } else {
    const picked = outcome === undefined || outcome === null ? null : (REVIEW_ADJUSTMENT_OUTCOMES.find((o) => o === outcome) ?? false);
    if (picked === false) return { ok: false, error: BAD_REQUEST };
    if ((facts.adjustment === null) !== (picked === null)) return { ok: false, error: BAD_REQUEST };
    chosen = picked;
    kind = facts.adjustment?.kind ?? null;
    adjustment = facts.adjustment === null ? null : (facts.adjustment as unknown as Json);
  }

  const { data, error } = await supabase
    .from('weekly_reviews')
    .insert({
      user_id: userId,
      week_start: facts.window.start,
      week_end: facts.window.end,
      recap: facts.recap as unknown as Json,
      adjustment_kind: kind,
      adjustment,
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

  // Each mark gets its one answer: the person's own, or changed for one they had already changed. A failure is logged and the review
  // stays finished; that mark is asked again at the next review.
  for (const mark of marks) {
    const answer = given.get(mark.id) ?? (changed.some((c) => c.id === mark.id) ? 'changed' : null);
    if (answer === null) continue;
    const saved = await answerStartingPoint(mark.id, answer, deps);
    if (!saved.ok) console.error('[weekly-review] could not record an answer to a starting point');
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
