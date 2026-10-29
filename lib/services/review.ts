// MOM-113 block 1: facts for the layered weekly review (docs/DOMAIN_MODEL.md §3), read-only. Maps the signed-in
// person's rows onto the scoreboard engine the same way lib/services/scoreboard.ts does (CLAUDE.md Architectural
// Directive 1), then asks lib/engine/review.ts which week is being reviewed and what layer 1 and layer 3 show.
//
// Nothing here writes a weekly_reviews row (the table does not exist yet: block 3.2) or calls Claude (block 3.3).
// No screen reads this yet either.
//
// Deadline forecasts: lib/services/scoreboard.ts passes the engine an empty forecast list, because mapping a
// deadline task's logged time and remaining capacity onto a ForecastRequest needs groundwork that is not built yet
// (BACKLOG.md, MOM-108/MOM-112). This service does the same for now, so selectLayerThreeAdjustment's deadline
// forecast candidate does not fire in production yet; it is written and tested in lib/engine/review.ts so it
// starts working the day that mapping lands, with no change here.

import { buildLayer1Facts, canGrade, computeScoreboard, localDay, selectLayerThreeAdjustment, specProblem, weeklyReviewWindow } from '@/lib/engine';
import { DEFAULT_REVIEW_DEPTH } from '@/lib/home/defaults';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { PersonPriority, PersonSettingsRow } from '@/types/database.types';
import type { PriorityLine, WeeklyReviewFacts } from '@/types/review';
import type { ScoreboardTarget } from '@/types/scoreboard';
import type { ServiceResult } from './result';
import {
  toAnchors,
  toScoreboardEntries,
  toScoreboardTarget,
  toSnapshot,
  type ActiveGoalRead,
  type CorrectionRead,
  type EntryRead,
  type GoalRead,
  type ItemRead,
  type SnapshotRead,
  type StepRead,
  type TargetRead,
} from './scoreboardRows';

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const LOAD_FAILED = 'Could not load your weekly review.';
const SIGNED_OUT = 'Sign in to see your weekly review.';

// The API returns at most this many rows a request, so entries are read a page at a time (same as scoreboard.ts).
const PAGE_SIZE = 1000;

export type ReviewSettingsRead = Pick<
  PersonSettingsRow,
  'time_zone' | 'week_start' | 'day_end' | 'planning_weekday' | 'review_depth' | 'slipping_periods'
>;
export type PriorityRead = Pick<PersonPriority, 'id' | 'label'>;

export interface ReviewRows {
  settings: ReviewSettingsRead | null;
  goals: GoalRead[];
  targets: TargetRead[];
  items: ItemRead[];
  steps: StepRead[];
  entries: EntryRead[];
  corrections: CorrectionRead[];
  snapshots: SnapshotRead[];
  priorities: PriorityRead[];
}

export interface WeeklyReviewFactsDeps {
  // The clock, for tests. Never set from a request.
  now?: () => number;
}

const byCreated = <T extends { created_at: string; id: string }>(a: T, b: T) =>
  a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

const isActiveGoal = (g: GoalRead): g is ActiveGoalRead => g.state === 'active' && g.shape !== null && g.start_date !== null;

// The database counts weekdays 1 to 7 with Monday as 1; the engine counts 0 to 6 with Sunday as 0. Same mapping as
// scoreboardRows.ts's toWeekday, duplicated here only because that one is not exported.
const toWeekday = (day: number) => (day % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6;

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
  if (window === null) return { state: 'not_due' };

  const targets = rows.targets.filter((t) => goalById.has(t.goal_id)).sort(byCreated);
  const stepIdsOfTarget = (targetId: string) => {
    const itemIds = new Set(rows.items.filter((i) => i.target_id === targetId).map((i) => i.id));
    return rows.steps.filter((s) => itemIds.has(s.work_item_id)).map((s) => s.id);
  };

  const engineTargets: ScoreboardTarget[] = [];
  for (const t of targets) {
    const stepIds = stepIdsOfTarget(t.id);
    const target = toScoreboardTarget(t, goalById.get(t.goal_id) as ActiveGoalRead, stepIds);
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
    today,
    anchors,
    targets: engineTargets,
    entries,
    snapshots,
    steps: [],
    forecasts: [],
    patterns: patternOverrides,
  });

  const priorities: PriorityLine[] = rows.priorities.map((p) => ({ id: p.id, label: p.label }));
  const offerReflection = (rows.settings?.review_depth ?? DEFAULT_REVIEW_DEPTH) !== 'recap_only';

  return {
    state: 'ready',
    window,
    targets: buildLayer1Facts(scoreboard, window),
    priorities,
    offerReflection,
    adjustment: selectLayerThreeAdjustment(scoreboard, window),
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

  const [settings, goals, targets, items, steps, corrections, snapshots, priorities, entries] = await Promise.all([
    supabase
      .from('person_settings')
      .select('time_zone, week_start, day_end, planning_weekday, review_depth, slipping_periods')
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
    supabase.from('person_priorities').select('id, label').eq('user_id', userId).order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
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
    priorities.error ||
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
    priorities: priorities.data,
  };
  return { ok: true, data: buildWeeklyReviewFacts(rows, (deps.now ?? Date.now)()) };
}
