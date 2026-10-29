// The week plan's data access (MOM-112 block 2): the person's own choice of which things to do on which of their days, and
// which of their own kinds of days each date is. The only code that reads or writes week_plan_picks and
// week_plan_day_types (CLAUDE.md, Architectural Directive 1). Server-side only: it runs as the signed-in person through
// the anon-key client, so row level security limits every read and write to their own rows, and it also filters by their
// id. There is no actor parameter and no service-role path.
//
// Nothing here chooses for the person (docs/DOMAIN_MODEL.md §1.4, §4.2 principles 1 and 12). A pick is a thing on a date:
// never a time, never a slot. A date's kind is only ever one the person set (or copied with their own tap). The person's
// days need their time zone and day end; without them there is no plan and no write, and nothing is guessed. A day that
// has passed is read-only. The mapping and the rules are pure and live in lib/services/weekPlanRows.ts, where they are
// tested row by row. No Claude call: the plan is the engine's rules and the person's choices.

import { addDays } from '@/lib/engine';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { HomePlanView, PlanChange, WeekPlanView } from '@/types/plan';
import { UNIQUE_VIOLATION } from './goals';
import type { ServiceResult } from './result';
import {
  LOOK_BACK_DAYS,
  buildHomePlan,
  buildWeekPlan,
  dateProblem,
  kindsToCopy,
  planContext,
  planWindow,
  setDayDates,
  type DateProblem,
  type PlanRows,
} from './weekPlanRows';

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SIGNED_OUT = 'Sign in to plan your week.';
export const LOAD_FAILED = 'Could not load your plan.';
export const SAVE_FAILED = 'Could not save that. Nothing was changed.';
export const NO_DAYS_YET = 'Set your time zone and the time your day ends before planning, so the days are yours. Nothing was changed.';
export const NOT_FOUND_ITEM = 'That is not one of your steps or habits. Nothing was changed.';
export const NOT_FOUND_KIND = 'That is not one of your kinds of days. Nothing was changed.';
export const NO_SET_DAYS = 'This habit has no set days. Nothing was changed.';
const DATE_MESSAGE: Record<DateProblem, string> = {
  not_a_date: 'That is not a real day. Nothing was changed.',
  past: "That day has already passed, so it can't be changed. Nothing was changed.",
  too_far: 'That day is too far ahead to plan yet. Nothing was changed.',
};

export interface WeekPlanDeps {
  // The clock, for tests. Never set from a request.
  now?: () => number;
}


const isId = (value: unknown): value is string => typeof value === 'string' && UUID_PATTERN.test(value);

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

// Chunks of ids for an `in` filter, so a long list never makes the request too long.
function chunks<T>(list: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

const NO_ROWS = (settings: PlanRows['settings']): PlanRows => ({
  settings,
  goals: [],
  targets: [],
  items: [],
  steps: [],
  ticks: [],
  corrections: [],
  picks: [],
  dayKinds: [],
  dayTypes: [],
});

// Everything the plan needs, as the signed-in person. With no time zone or day end there is nothing to read: the person's
// days are not known, and the builders answer with that. Null when a read failed, never a plan built from part of the rows.
async function readPlanRows(supabase: Client, userId: string, nowMs: number): Promise<PlanRows | null> {
  const settings = await supabase.from('person_settings').select('time_zone, week_start, day_end').eq('user_id', userId).maybeSingle();
  if (settings.error) return null;
  const ctx = planContext(settings.data, nowMs);
  if (!ctx.ok) return NO_ROWS(settings.data);

  const picksFrom = addDays(ctx.today, -LOOK_BACK_DAYS);
  const kindsFrom = addDays(ctx.today, -14);
  const [goals, targets, items, steps, picks, dayKinds, dayTypes] = await Promise.all([
    supabase.from('goals').select('id, title, state, created_at').eq('user_id', userId),
    supabase.from('targets').select('id, period_kind, slot_weekdays, due_date').eq('user_id', userId),
    supabase.from('work_items').select('id, goal_id, target_id, kind, title, due_date, sort_order, created_at, completed_at').eq('user_id', userId),
    supabase.from('work_item_steps').select('id, work_item_id, title, sort_order').eq('user_id', userId),
    supabase.from('week_plan_picks').select('work_item_id, plan_date').eq('user_id', userId).gte('plan_date', picksFrom),
    supabase.from('week_plan_day_types').select('plan_date, day_type_id').eq('user_id', userId).gte('plan_date', kindsFrom),
    supabase.from('person_day_types').select('id, name, created_at').eq('user_id', userId),
  ]);
  if (goals.error || targets.error || items.error || steps.error || picks.error || dayKinds.error || dayTypes.error) return null;

  // A step's tick is an entry whose record id is the step's id; only those are read, and only their corrections.
  const ids = steps.data.map((s) => s.id);
  const ticks: PlanRows['ticks'] = [];
  const corrections: PlanRows['corrections'] = [];
  for (const part of chunks(ids)) {
    const [t, c] = await Promise.all([
      supabase.from('entries').select('source_id, source_record_id, occurred_at').eq('user_id', userId).in('source_record_id', part),
      supabase.from('entry_corrections').select('source_id, source_record_id, action').eq('user_id', userId).in('source_record_id', part),
    ]);
    if (t.error || c.error) return null;
    ticks.push(...t.data);
    corrections.push(...c.data);
  }

  return {
    settings: settings.data,
    goals: goals.data,
    targets: targets.data,
    items: items.data,
    steps: steps.data,
    ticks,
    corrections,
    picks: picks.data,
    dayKinds: dayKinds.data,
    dayTypes: dayTypes.data,
  };
}

async function signedIn(): Promise<{ ok: true; supabase: Client; userId: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { ok: false, error: SIGNED_OUT };
  return { ok: true, supabase, userId: data.user.id };
}

// The plan screen: the dates of the week asked for (0 is the week that holds today), what the person put on each, and
// their kinds of days. Read only.
export async function getWeekPlan(week: unknown = 0, deps: WeekPlanDeps = {}): Promise<ServiceResult<WeekPlanView>> {
  const session = await signedIn();
  if (!session.ok) return session;
  const nowMs = (deps.now ?? Date.now)();
  const rows = await readPlanRows(session.supabase, session.userId, nowMs);
  if (rows === null) return { ok: false, error: LOAD_FAILED };
  return { ok: true, data: buildWeekPlan(rows, nowMs, week) };
}

// The "Your plan" card on home. Read only.
export async function getHomePlan(deps: WeekPlanDeps = {}): Promise<ServiceResult<HomePlanView>> {
  const session = await signedIn();
  if (!session.ok) return session;
  const nowMs = (deps.now ?? Date.now)();
  const rows = await readPlanRows(session.supabase, session.userId, nowMs);
  if (rows === null) return { ok: false, error: LOAD_FAILED };
  return { ok: true, data: buildHomePlan(rows, nowMs) };
}

// ---------------------------------------------------------------------------
// Writing: every write is the person's own tap
// ---------------------------------------------------------------------------

// Today in the person's own days, or the reason there is none. Reads only their settings.
async function todayOf(supabase: Client, userId: string, nowMs: number) {
  const settings = await supabase.from('person_settings').select('time_zone, week_start, day_end').eq('user_id', userId).maybeSingle();
  if (settings.error) return { ok: false as const, error: SAVE_FAILED };
  const ctx = planContext(settings.data, nowMs);
  return ctx.ok ? ctx : { ok: false as const, error: NO_DAYS_YET };
}

// Puts one of the person's things on one of their days. Already there is fine and changes nothing.
export async function planItemOnDay(itemId: unknown, date: unknown, deps: WeekPlanDeps = {}): Promise<PlanChange> {
  const session = await signedIn();
  if (!session.ok) return session;
  const { supabase, userId } = session;
  const ctx = await todayOf(supabase, userId, (deps.now ?? Date.now)());
  if (!ctx.ok) return ctx;
  const problem = dateProblem(date, ctx.today);
  if (problem) return { ok: false, error: DATE_MESSAGE[problem] };
  if (!isId(itemId)) return { ok: false, error: NOT_FOUND_ITEM };

  const item = await supabase.from('work_items').select('id').eq('id', itemId).eq('user_id', userId).maybeSingle();
  if (item.error) return { ok: false, error: SAVE_FAILED };
  if (!item.data) return { ok: false, error: NOT_FOUND_ITEM };

  const { error } = await supabase.from('week_plan_picks').insert({ user_id: userId, work_item_id: itemId, plan_date: date as string });
  if (error) return error.code === UNIQUE_VIOLATION ? { ok: true, data: { changed: 0 } } : { ok: false, error: SAVE_FAILED };
  return { ok: true, data: { changed: 1 } };
}

// Takes one of the person's things off one of their days. Not on it is fine and changes nothing.
export async function removeItemFromDay(itemId: unknown, date: unknown, deps: WeekPlanDeps = {}): Promise<PlanChange> {
  const session = await signedIn();
  if (!session.ok) return session;
  const { supabase, userId } = session;
  const ctx = await todayOf(supabase, userId, (deps.now ?? Date.now)());
  if (!ctx.ok) return ctx;
  const problem = dateProblem(date, ctx.today);
  if (problem && problem !== 'too_far') return { ok: false, error: DATE_MESSAGE[problem] };
  if (!isId(itemId)) return { ok: false, error: NOT_FOUND_ITEM };

  const { data, error } = await supabase
    .from('week_plan_picks')
    .delete()
    .eq('user_id', userId)
    .eq('work_item_id', itemId)
    .eq('plan_date', date as string)
    .select('id');
  if (error) return { ok: false, error: SAVE_FAILED };
  return { ok: true, data: { changed: data.length } };
}

// Says which of the person's own kinds of days a date is, or changes it. The kind must be one of theirs.
export async function setDayKind(date: unknown, dayTypeId: unknown, deps: WeekPlanDeps = {}): Promise<PlanChange> {
  const session = await signedIn();
  if (!session.ok) return session;
  const { supabase, userId } = session;
  const ctx = await todayOf(supabase, userId, (deps.now ?? Date.now)());
  if (!ctx.ok) return ctx;
  const problem = dateProblem(date, ctx.today);
  if (problem) return { ok: false, error: DATE_MESSAGE[problem] };
  if (!isId(dayTypeId)) return { ok: false, error: NOT_FOUND_KIND };

  const kind = await supabase.from('person_day_types').select('id').eq('id', dayTypeId).eq('user_id', userId).maybeSingle();
  if (kind.error) return { ok: false, error: SAVE_FAILED };
  if (!kind.data) return { ok: false, error: NOT_FOUND_KIND };

  const existing = await supabase.from('week_plan_day_types').select('id, day_type_id').eq('user_id', userId).eq('plan_date', date as string).maybeSingle();
  if (existing.error) return { ok: false, error: SAVE_FAILED };
  if (existing.data) {
    if (existing.data.day_type_id === dayTypeId) return { ok: true, data: { changed: 0 } };
    // Only the kind changes: the database lets a person update day_type_id and nothing else about the row.
    const { error } = await supabase.from('week_plan_day_types').update({ day_type_id: dayTypeId }).eq('id', existing.data.id).eq('user_id', userId);
    return error ? { ok: false, error: SAVE_FAILED } : { ok: true, data: { changed: 1 } };
  }
  const { error } = await supabase.from('week_plan_day_types').insert({ user_id: userId, plan_date: date as string, day_type_id: dayTypeId });
  return error ? { ok: false, error: SAVE_FAILED } : { ok: true, data: { changed: 1 } };
}

// Takes the kind off a date. A date with none is fine and changes nothing.
export async function clearDayKind(date: unknown, deps: WeekPlanDeps = {}): Promise<PlanChange> {
  const session = await signedIn();
  if (!session.ok) return session;
  const { supabase, userId } = session;
  const ctx = await todayOf(supabase, userId, (deps.now ?? Date.now)());
  if (!ctx.ok) return ctx;
  const problem = dateProblem(date, ctx.today);
  if (problem && problem !== 'too_far') return { ok: false, error: DATE_MESSAGE[problem] };

  const { data, error } = await supabase
    .from('week_plan_day_types')
    .delete()
    .eq('user_id', userId)
    .eq('plan_date', date as string)
    .select('id');
  if (error) return { ok: false, error: SAVE_FAILED };
  return { ok: true, data: { changed: data.length } };
}

// "Same as last week": gives each date of the week shown, from today on, the kind its date a week earlier had, only where
// the date has none yet. Nothing is changed unless the person taps this, and a date with a kind keeps it.
export async function copyLastWeeksKinds(week: unknown = 0, deps: WeekPlanDeps = {}): Promise<PlanChange> {
  const session = await signedIn();
  if (!session.ok) return session;
  const { supabase, userId } = session;
  const nowMs = (deps.now ?? Date.now)();
  const settings = await supabase.from('person_settings').select('time_zone, week_start, day_end').eq('user_id', userId).maybeSingle();
  if (settings.error) return { ok: false, error: SAVE_FAILED };
  const ctx = planContext(settings.data, nowMs);
  if (!ctx.ok) return { ok: false, error: NO_DAYS_YET };

  const window = planWindow(ctx.today, ctx.anchors, week);
  const kinds = await supabase
    .from('week_plan_day_types')
    .select('plan_date, day_type_id')
    .eq('user_id', userId)
    .gte('plan_date', addDays(window.start, -7))
    .lte('plan_date', window.end);
  if (kinds.error) return { ok: false, error: SAVE_FAILED };

  const copies = kindsToCopy(kinds.data, window.dates, ctx.today);
  if (copies.length === 0) return { ok: true, data: { changed: 0 } };
  const { error } = await supabase
    .from('week_plan_day_types')
    .insert(copies.map((c) => ({ user_id: userId, plan_date: c.date, day_type_id: c.dayTypeId })));
  return error ? { ok: false, error: SAVE_FAILED } : { ok: true, data: { changed: copies.length } };
}

// "Use these days": puts a habit that has set days on those days in the week shown, from today on, where it is not
// already. They are the days the person named for it; nothing else is chosen.
export async function planSetDays(itemId: unknown, week: unknown = 0, deps: WeekPlanDeps = {}): Promise<PlanChange> {
  const session = await signedIn();
  if (!session.ok) return session;
  const { supabase, userId } = session;
  const nowMs = (deps.now ?? Date.now)();
  const rows = await readPlanRows(supabase, userId, nowMs);
  if (rows === null) return { ok: false, error: SAVE_FAILED };
  const ctx = planContext(rows.settings, nowMs);
  if (!ctx.ok) return { ok: false, error: NO_DAYS_YET };
  if (!isId(itemId)) return { ok: false, error: NOT_FOUND_ITEM };

  const plan = buildWeekPlan(rows, nowMs, week);
  if (plan.state !== 'ready') return { ok: false, error: NO_DAYS_YET };
  const item = plan.items.find((i) => i.id === itemId);
  if (!item) return { ok: false, error: NOT_FOUND_ITEM };
  if (item.setDays === null) return { ok: false, error: NO_SET_DAYS };

  const have = new Set(plan.days.filter((d) => d.itemIds.includes(itemId)).map((d) => d.date));
  const dates = setDayDates(item.setDays, plan.days.map((d) => d.date), ctx.today).filter((d) => !have.has(d));
  if (dates.length === 0) return { ok: true, data: { changed: 0 } };
  const { error } = await supabase.from('week_plan_picks').insert(dates.map((d) => ({ user_id: userId, work_item_id: itemId, plan_date: d })));
  return error ? { ok: false, error: SAVE_FAILED } : { ok: true, data: { changed: dates.length } };
}
