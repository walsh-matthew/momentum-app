// Home's read of the goal model (MOM-112): the signed-in person's settings, active goals, targets, work items,
// entries, corrections and closed-period snapshots, mapped onto the scoreboard engine and shaped for the page
// (CLAUDE.md, Architectural Directive 1). Server-side only, and read only: it runs as the signed-in person through the
// anon-key client, so row level security limits every read to their own rows, and it also filters by their id. It
// writes nothing and never touches the service role. It also reads the week plan (picks, kinds of days) and the person's
// kinds of days for the deadline forecast; those reads are the person's own rows too.
//
// The mapping itself is pure and lives in lib/services/scoreboardRows.ts, where it is tested row by row. Nothing here
// adds anything up or scores anything: the engine does (docs/DOMAIN_MODEL.md §1.7), and Claude never scores.

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { HomeScoreboard } from '@/types/home';
import type { ServiceResult } from './result';
import { buildHomeScoreboard, type EntryRead, type HomeRows } from './scoreboardRows';

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const LOAD_FAILED = 'Could not load your scoreboard.';
const SIGNED_OUT = 'Sign in to see your scoreboard.';

// The API returns at most this many rows a request, so entries are read a page at a time.
const PAGE_SIZE = 1000;

export interface HomeScoreboardDeps {
  // The clock, for tests. Never set from a request.
  now?: () => number;
}

// Every entry of the person, oldest first, a page at a time. The engine counts from each target's start, and a pattern
// looks back over closed weeks, so the whole history is read, not a window. Null when a page could not be read.
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

export async function getHomeScoreboard(deps: HomeScoreboardDeps = {}): Promise<ServiceResult<HomeScoreboard>> {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return { ok: false, error: SIGNED_OUT };
  const userId = auth.user.id;

  // The plan is read from two days before the server's date, which is never later than the person's today; the mapping
  // keeps only the dates from their own today on.
  const planFrom = new Date((deps.now ?? Date.now)() - 2 * 86_400_000).toISOString().slice(0, 10);

  const [settings, goals, targets, items, steps, corrections, snapshots, entries, picks, dayKinds, dayTypes] = await Promise.all([
    supabase.from('person_settings').select('time_zone, week_start, day_end, tone, celebrations').eq('user_id', userId).maybeSingle(),
    supabase.from('goals').select('id, title, state, shape, start_date, end_date, created_at').eq('user_id', userId),
    supabase
      .from('targets')
      .select('id, goal_id, title, measure, unit, role, period_kind, due_date, slot_weekdays, floor, aspiration, qualifying_threshold, carry_over_kind, created_at')
      .eq('user_id', userId),
    supabase
      .from('work_items')
      .select('id, goal_id, target_id, kind, title, due_date, sort_order, created_at, date_can_move, estimate_minutes, completed_at')
      .eq('user_id', userId),
    supabase.from('work_item_steps').select('id, work_item_id, title, sort_order').eq('user_id', userId),
    supabase.from('entry_corrections').select('source_id, source_record_id, action').eq('user_id', userId),
    supabase
      .from('period_snapshots')
      .select('target_id, period_start, period_end, measure, unit, role, period_kind, slot_weekdays, floor, aspiration, qualifying_threshold, carry_over_kind')
      .eq('user_id', userId),
    readEntries(supabase, userId),
    supabase.from('week_plan_picks').select('work_item_id, plan_date').eq('user_id', userId).gte('plan_date', planFrom),
    supabase.from('week_plan_day_types').select('plan_date, day_type_id').eq('user_id', userId).gte('plan_date', planFrom),
    supabase.from('person_day_types').select('id, name, capacity_unit, capacity_amount').eq('user_id', userId),
  ]);
  if (
    settings.error ||
    goals.error ||
    targets.error ||
    items.error ||
    steps.error ||
    corrections.error ||
    snapshots.error ||
    entries === null ||
    picks.error ||
    dayKinds.error ||
    dayTypes.error
  ) {
    return { ok: false, error: LOAD_FAILED };
  }

  const rows: HomeRows = {
    settings: settings.data,
    goals: goals.data,
    targets: targets.data,
    items: items.data,
    steps: steps.data,
    entries,
    corrections: corrections.data,
    snapshots: snapshots.data,
    forecast: { items: items.data, picks: picks.data, dayKinds: dayKinds.data, dayTypes: dayTypes.data },
  };
  return { ok: true, data: buildHomeScoreboard(rows, (deps.now ?? Date.now)()) };
}
