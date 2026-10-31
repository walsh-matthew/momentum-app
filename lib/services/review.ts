// MOM-113: facts for the layered weekly review (docs/DOMAIN_MODEL.md §3), read-only. Maps the signed-in person's rows
// onto the scoreboard engine the same way lib/services/scoreboard.ts does (CLAUDE.md Architectural Directive 1), then
// asks lib/engine/review.ts which week is being reviewed and what layer 1 and layer 3 show. Block 3.2 adds what
// migration 018 stores: whether this week's review is already finished, the last finished one, and which earlier
// recaps a later entry has changed since (RAID R-26).
//
// "Still right for you?" (block 3.4): the setup suggestions on a target's numbers that nobody has asked about yet, from
// lib/services/startingPoints.ts; lib/review/stillRight.ts picks the ones to ask.
//
// Nothing here writes a weekly_reviews row (lib/services/reviewRecords.ts does, from block 3.3's finish button) or
// calls Claude (lib/services/reviewReflection.ts does, only when the person taps for a line).
//
// The week closes early when the planning day is the week's own last day: the engine calls that week open until the
// day after, so the review asks it about the day after (reviewAsOf) and the recap says it counts through that day.
//
// Deadline forecasts: home maps a deadline task's days set aside onto a ForecastRequest (lib/services/forecastRows.ts,
// MOM-112), but this service still passes the engine an empty forecast list, by the owner's decision of 2026-10-29: wiring
// it in changes what Claude is told at the review and wakes selectLayerThreeAdjustment's deadline forecast candidate, so it
// needs its own approval. Until then that candidate does not fire in production; it is written and tested in
// lib/engine/review.ts. This service would read the same rows as home and call planForecasts.

import {
  buildLayer1Facts,
  canGrade,
  changeEffectiveFrom,
  closesEarly,
  compareRecapToLive,
  computeScoreboard,
  localDay,
  reviewAsOf,
  selectLayerThreeAdjustment,
  specProblem,
  targetInForce,
  weeklyReviewWindow,
} from '@/lib/engine';
import { DEFAULT_REVIEW_DEPTH, DEFAULT_REVIEW_PLANNING, DEFAULT_TONE } from '@/lib/home/defaults';
import { stillRightMarks } from '@/lib/review/stillRight';
import { parseStoredRecap } from '@/lib/review/storedRecap';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { PersonPriority, PersonSettingsRow, WeeklyReviewRow } from '@/types/database.types';
import type { PriorityLine, RecapChange, StoredReview, TargetEdit, UnconfirmedStartingPoint, WeeklyReviewFacts } from '@/types/review';
import type { Scoreboard, ScoreboardTarget, TimeAnchors } from '@/types/scoreboard';
import type { ServiceResult } from './result';
import { buildStoredRecap, recapValues } from './reviewRecap';
import { readUnconfirmedStartingPoints } from './startingPoints';
import {
  rowInForce,
  toAnchors,
  toScoreboardEntries,
  toScoreboardTarget,
  toSnapshot,
  toWeekday,
  type ActiveGoalRead,
  type CorrectionRead,
  type EntryRead,
  type GoalRead,
  type ItemRead,
  type SnapshotRead,
  type StepRead,
  type TargetChangeRead,
  type TargetRead,
} from './scoreboardRows';

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const LOAD_FAILED = 'Could not load your weekly review.';
const SIGNED_OUT = 'Sign in to see your weekly review.';

// The API returns at most this many rows a request, so entries are read a page at a time (same as scoreboard.ts).
const PAGE_SIZE = 1000;

// How many finished reviews are read, and how many of the latest are compared with the live numbers. A late entry
// reaches back 7 local days (MOM-110), so only the newest recaps can have changed; reading a few more costs nothing.
const REVIEWS_READ = 12;
const REVIEWS_COMPARED = 4;

export type ReviewSettingsRead = Pick<
  PersonSettingsRow,
  'time_zone' | 'week_start' | 'day_end' | 'planning_weekday' | 'review_depth' | 'review_planning' | 'slipping_periods' | 'tone'
>;
export type PriorityRead = Pick<PersonPriority, 'id' | 'label'>;
export type ReviewRead = Pick<WeeklyReviewRow, 'id' | 'week_start' | 'week_end' | 'recap' | 'adjustment_kind' | 'adjustment_outcome' | 'finished_at'>;

export interface ReviewRows {
  settings: ReviewSettingsRead | null;
  goals: GoalRead[];
  targets: TargetRead[];
  items: ItemRead[];
  steps: StepRead[];
  entries: EntryRead[];
  corrections: CorrectionRead[];
  snapshots: SnapshotRead[];
  // The changes the person saved to a target's levels from a later period (migration 020, MOM-146).
  changes: TargetChangeRead[];
  priorities: PriorityRead[];
  // The person's finished reviews, newest week first.
  reviews: ReviewRead[];
  // The setup suggestions nobody has asked about yet (lib/services/startingPoints.ts, MOM-134).
  startingPoints: UnconfirmedStartingPoint[];
}

export interface WeeklyReviewFactsDeps {
  // The clock, for tests. Never set from a request.
  now?: () => number;
}

const byCreated = <T extends { created_at: string; id: string }>(a: T, b: T) =>
  a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

const isActiveGoal = (g: GoalRead): g is ActiveGoalRead => g.state === 'active' && g.shape !== null && g.start_date !== null;

// The finished reviews this code can read, newest week first. A record whose recap does not read (a stored shape this
// code does not know) is left out, never guessed at: it stays in the table untouched.
function readReviews(reviews: ReviewRead[], anchors: TimeAnchors): StoredReview[] {
  return reviews
    .flatMap((r) => {
      const recap = parseStoredRecap(r.recap);
      if (recap === null) return [];
      const adjustment = r.adjustment_kind && r.adjustment_outcome ? { kind: r.adjustment_kind, outcome: r.adjustment_outcome } : null;
      return [
        {
          id: r.id,
          window: { start: r.week_start, end: r.week_end },
          recap,
          adjustment,
          // The person's own day, not the server's.
          finishedOn: localDay(r.finished_at, anchors),
        } satisfies StoredReview,
      ];
    })
    .sort((a, b) => (a.window.start < b.window.start ? 1 : a.window.start > b.window.start ? -1 : 0));
}

// Which of the latest finished reviews a later entry has changed since, in words the screen writes: what the recap said
// and what the engine reads now for the same week. The record is only read here, never rewritten.
function changesSince(scoreboard: Scoreboard, reviews: StoredReview[]): RecapChange[] {
  return reviews.slice(0, REVIEWS_COMPARED).flatMap((review) => {
    const titles = new Map(review.recap.goals.flatMap((g) => g.targets.map((t) => [t.id, t] as const)));
    return compareRecapToLive(recapValues(review.recap), buildLayer1Facts(scoreboard, review.window)).map((c) => ({
      weekStart: review.window.start,
      weekEnd: review.window.end,
      targetId: c.targetId,
      title: titles.get(c.targetId)?.title ?? '',
      unit: titles.get(c.targetId)?.unit ?? null,
      said: c.said,
      now: c.now,
    }));
  });
}

export function buildWeeklyReviewFacts(rows: ReviewRows, nowMs: number): WeeklyReviewFacts {
  const goals = rows.goals.filter(isActiveGoal).sort(byCreated);
  if (goals.length === 0) return { state: 'no_goals' };
  const goalById = new Map(goals.map((g) => [g.id, g]));

  const anchors = toAnchors(rows.settings);
  const dayCheck = canGrade(anchors, 'deadline');
  if (!dayCheck.ok) {
    return { state: 'needs_day_anchors', anchor: dayCheck.anchor === 'time_zone' ? 'time_zone' : 'day_end', reason: dayCheck.reason };
  }
  const today = localDay(new Date(nowMs).toISOString(), anchors);

  const planningWeekday = rows.settings?.planning_weekday == null ? null : toWeekday(rows.settings.planning_weekday);
  if (anchors.weekStartsOn === null || planningWeekday === null) return { state: 'needs_planning_setup' };

  const window = weeklyReviewWindow(today, anchors.weekStartsOn, planningWeekday);
  const reviews = readReviews(rows.reviews, anchors);
  const tone = rows.settings?.tone ?? DEFAULT_TONE;
  // Not the planning day and nothing finished before: nothing to show, so nothing is computed.
  if (window === null && reviews.length === 0) return { state: 'not_due', tone, today, planningWeekday, last: null, changes: [] };

  const targets = rows.targets.filter((t) => goalById.has(t.goal_id)).sort(byCreated);
  const stepIdsOfTarget = (targetId: string) => {
    const itemIds = new Set(rows.items.filter((i) => i.target_id === targetId).map((i) => i.id));
    return rows.steps.filter((s) => itemIds.has(s.work_item_id)).map((s) => s.id);
  };

  const engineTargets: ScoreboardTarget[] = [];
  for (const t of targets) {
    const stepIds = stepIdsOfTarget(t.id);
    const target = toScoreboardTarget(t, goalById.get(t.goal_id) as ActiveGoalRead, stepIds, rows.changes);
    const spec = target.versions[0].spec;
    if (!canGrade(anchors, spec.period.kind).ok) continue;
    if (specProblem(spec) !== null) continue;
    engineTargets.push(target);
  }
  const engineIds = new Set(engineTargets.map((t) => t.id));
  const stepIdsByTarget = new Map(targets.filter((t) => engineIds.has(t.id)).map((t) => [t.id, stepIdsOfTarget(t.id)]));

  const measureOf = new Map(targets.filter((t) => engineIds.has(t.id)).map((t) => [t.id, t.measure]));
  const entries = toScoreboardEntries(rows.entries, rows.corrections, measureOf);
  const snapshots = rows.snapshots.filter((s) => engineIds.has(s.target_id)).map((s) => toSnapshot(s, stepIdsByTarget.get(s.target_id) ?? []));

  const patternOverrides = rows.settings?.slipping_periods == null ? undefined : { slippingRun: rows.settings.slipping_periods };
  const scoreboard = computeScoreboard({
    // The day after the week ends when the week closes early, so the week is closed (see reviewAsOf); today otherwise.
    today: window === null ? today : reviewAsOf(today, window),
    anchors,
    targets: engineTargets,
    entries,
    snapshots,
    steps: [],
    forecasts: [],
    patterns: patternOverrides,
  });

  const changes = changesSince(scoreboard, reviews);
  if (window === null) return { state: 'not_due', tone, today, planningWeekday, last: reviews[0] ?? null, changes };

  const finished = reviews.find((r) => r.window.start === window.start);
  if (finished) return { state: 'reviewed', tone, today, review: finished, changes, planning: rows.settings?.review_planning ?? DEFAULT_REVIEW_PLANNING };

  const priorities: PriorityLine[] = rows.priorities.map((p) => ({ id: p.id, label: p.label }));
  const facts = buildLayer1Facts(scoreboard, window);
  // The recap says the numbers the reviewed week was judged by, not ones saved since for a later week.
  const engineById = new Map(engineTargets.map((e) => [e.id, e]));
  const recapTargets = targets.map((t) => {
    const engine = engineById.get(t.id);
    return engine === undefined ? t : rowInForce(t, targetInForce(engine, window.start));
  });
  const engineAdjustment = selectLayerThreeAdjustment(scoreboard, window);
  const offerReflection = (rows.settings?.review_depth ?? DEFAULT_REVIEW_DEPTH) !== 'recap_only';

  // What the edit of the named target starts from: the numbers it will have from the next period (the newest saved change, or the ones
  // in force), and what the week just reviewed came to. Null for a target the edit does not cover.
  const editFor = (targetId: string): TargetEdit | null => {
    const row = targets.find((t) => t.id === targetId);
    const engine = engineById.get(targetId);
    if (row === undefined || engine === undefined || anchors.weekStartsOn === null) return null;
    if ((row.period_kind !== 'weekly' && row.period_kind !== 'day_slots') || row.measure === 'checklist') return null;
    const latest = engine.versions[engine.versions.length - 1].spec;
    if (latest.levels === null) return null;
    return {
      targetId,
      title: row.title,
      measure: row.measure,
      unit: row.unit,
      period: row.period_kind,
      floor: latest.levels.floor,
      aspiration: latest.levels.aspiration,
      days: latest.period.kind === 'day_slots' ? latest.period.days.map((d) => (d === 0 ? 7 : d)).sort((a, b) => a - b) : null,
      weekStartsOn: anchors.weekStartsOn,
      lastCounted: facts.find((f) => f.targetId === targetId)?.result.counted ?? null,
      effectiveFrom: changeEffectiveFrom(window.end, today, (goalById.get(row.goal_id) as ActiveGoalRead).start_date, anchors.weekStartsOn),
      today,
    };
  };

  // "Still right for you?" takes layer 3's place while it has something to ask: the review raises one thing at a time, and the engine's
  // adjustment is found again next review. When every suggestion is already the person's own change there is nothing to ask.
  const stillRight = stillRightMarks(rows.startingPoints, editFor);
  const asking = stillRight.asking.length > 0;
  const adjustment = asking ? null : engineAdjustment;

  return {
    state: 'ready',
    tone,
    today,
    window,
    targets: facts,
    recap: buildStoredRecap({
      window,
      closedEarly: closesEarly(today, window),
      goals,
      targets: recapTargets,
      facts,
      priorities,
      weekStartsOn: anchors.weekStartsOn,
    }),
    priorities,
    offerReflection,
    adjustment,
    edit: adjustment !== null && 'targetId' in adjustment ? editFor(adjustment.targetId) : null,
    stillRight,
    changes,
  };
}

// Every entry of the person, oldest first, a page at a time (same as lib/services/scoreboard.ts).
async function readEntries(supabase: Client, userId: string): Promise<EntryRead[] | null> {
  const all: EntryRead[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('entries')
      .select('id, target_id, source_id, source_record_id, occurred_at, value, evidence')
      .eq('user_id', userId)
      .order('occurred_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return null;
    all.push(...data);
    if (data.length < PAGE_SIZE) return all;
  }
}

export async function getWeeklyReviewFacts(deps: WeeklyReviewFactsDeps = {}): Promise<ServiceResult<WeeklyReviewFacts>> {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return { ok: false, error: SIGNED_OUT };
  const userId = auth.user.id;

  const [settings, goals, targets, items, steps, corrections, snapshots, changes, priorities, reviews, startingPoints, entries] = await Promise.all([
    supabase
      .from('person_settings')
      .select('time_zone, week_start, day_end, planning_weekday, review_depth, review_planning, slipping_periods, tone')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase.from('goals').select('id, title, state, shape, start_date, end_date, created_at').eq('user_id', userId),
    supabase
      .from('targets')
      .select(
        'id, goal_id, title, measure, unit, role, period_kind, due_date, slot_weekdays, floor, aspiration, qualifying_threshold, carry_over_kind, created_at',
      )
      .eq('user_id', userId),
    supabase.from('work_items').select('id, goal_id, target_id, kind, title, due_date, sort_order, created_at').eq('user_id', userId),
    supabase.from('work_item_steps').select('id, work_item_id, title, sort_order').eq('user_id', userId),
    supabase.from('entry_corrections').select('source_id, source_record_id, action').eq('user_id', userId),
    supabase
      .from('period_snapshots')
      .select('target_id, period_start, period_end, measure, unit, role, period_kind, slot_weekdays, floor, aspiration, qualifying_threshold, carry_over_kind')
      .eq('user_id', userId),
    supabase.from('target_changes').select('id, target_id, effective_from, floor, aspiration, slot_weekdays, created_at').eq('user_id', userId),
    supabase.from('person_priorities').select('id, label').eq('user_id', userId).order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
    supabase
      .from('weekly_reviews')
      .select('id, week_start, week_end, recap, adjustment_kind, adjustment_outcome, finished_at')
      .eq('user_id', userId)
      .order('week_start', { ascending: false })
      .limit(REVIEWS_READ),
    readUnconfirmedStartingPoints(supabase, userId),
    readEntries(supabase, userId),
  ]);
  if (
    settings.error ||
    goals.error ||
    targets.error ||
    items.error ||
    steps.error ||
    corrections.error ||
    snapshots.error ||
    changes.error ||
    priorities.error ||
    reviews.error ||
    !startingPoints.ok ||
    entries === null
  ) {
    return { ok: false, error: LOAD_FAILED };
  }

  const rows: ReviewRows = {
    settings: settings.data,
    goals: goals.data,
    targets: targets.data,
    items: items.data,
    steps: steps.data,
    entries,
    corrections: corrections.data,
    snapshots: snapshots.data,
    changes: changes.data,
    priorities: priorities.data,
    reviews: reviews.data,
    startingPoints: startingPoints.data,
  };
  return { ok: true, data: buildWeeklyReviewFacts(rows, (deps.now ?? Date.now)()) };
}
