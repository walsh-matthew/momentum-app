// Maps the week plan and a deadline task's own facts onto the engine's forecast request, and the engine's verdict onto
// what home says (MOM-112, slice 2). Pure: rows in, requests and views out, no database and no clock. The engine decides
// the verdict (lib/engine/forecast.ts); this file only says what each request is given, and when the engine is not asked.
//
// What a deadline task is given (docs/DOMAIN_MODEL.md §1.4, RAID A-07). All work and time are in minutes.
// - Its capacity is the days the person put it on, from today to its due date. A day gives the usual time of the kind the
//   person said that date is (hours times 60), shared equally among everything unfinished that they put on that day, so a
//   busy day gives each thing less. A day the task is not on gives it nothing. The result is a fact about the days set
//   aside, never a promise.
// - Its work left is the pace so far when steps are ticked and time is logged against it (the engine's rule); otherwise
//   the person's own rough size less what is logged, as a band of FORECAST_TOLERANCE either side because the size is rough.
// - Whether the date can move is what setup recorded. Nothing is assumed for a task that has no answer.
//
// Never assume (principle 1): a day with no kind, a kind with no usual time, or time counted in sessions (a task is sized in
// minutes) is not guessed at. The engine is then not trusted with a made-up capacity: the state says what is missing. A
// not-enough-data or past-due verdict does not depend on capacity, so it is still said first.
//
// When the due date is later than the last day the person has planned anything, the days to come have no kind and no picks
// yet. The engine still runs on the days set aside so far: if those are already enough, that is said (and counts for the
// days to come); otherwise no tight or short claim is made, because the plan does not reach the date yet (owner decision,
// 2026-10-29).

import { FORECAST_TOLERANCE } from '@/lib/engine';
import type { PersonDayTypeRow, WeekPlanDayTypeRow, WeekPlanPickRow, WorkItemKind, WorkItemRow } from '@/types/database.types';
import type { ForecastView } from '@/types/home';
import type { DeadlineForecast, ForecastRequest, LocalDate } from '@/types/scoreboard';

export type ForecastItemRead = Pick<WorkItemRow, 'id' | 'date_can_move' | 'estimate_minutes' | 'completed_at'>;
export type ForecastPickRead = Pick<WeekPlanPickRow, 'work_item_id' | 'plan_date'>;
export type ForecastDayKindRead = Pick<WeekPlanDayTypeRow, 'plan_date' | 'day_type_id'>;
export type ForecastDayTypeRead = Pick<PersonDayTypeRow, 'id' | 'name' | 'capacity_unit' | 'capacity_amount'>;

// The extra columns and the week plan the forecast reads beside home's own rows.
export interface ForecastRows {
  items: ForecastItemRead[];
  picks: ForecastPickRead[];
  dayKinds: ForecastDayKindRead[];
  dayTypes: ForecastDayTypeRead[];
}

export const NO_FORECAST_ROWS: ForecastRows = { items: [], picks: [], dayKinds: [], dayTypes: [] };

// An unfinished or finished thing of an active goal, with its steps counted. `stepsDone` counts ticked steps.
export interface ForecastThing {
  id: string;
  kind: WorkItemKind;
  dueOn: LocalDate | null;
  targetId: string | null;
  stepCount: number;
  stepsDone: number;
}

export interface ForecastInput {
  today: LocalDate;
  rows: ForecastRows;
  // Every item of the person's active goals, habits included: a habit on a day shares that day's time.
  things: ForecastThing[];
  // Minutes logged against each time-measure target, hidden entries left out.
  loggedMinutes: ReadonlyMap<string, number>;
}

interface Pending {
  // Why the engine's answer on capacity is not used, or null when the capacity is known.
  blocked: ForecastView | null;
  // Set when the due date is later than the last day the person has planned.
  beyond: { days: number; through: LocalDate } | null;
}

export interface PlannedForecasts {
  requests: ForecastRequest[];
  pending: ReadonlyMap<string, Pending>;
}

const MINUTES_PER_HOUR = 60;

// Finished work is not planned or forecast: marked done by the person, or every one of its steps ticked.
export function isFinished(thing: ForecastThing, completedAt: string | null): boolean {
  if (thing.kind === 'habit') return false;
  return completedAt !== null || (thing.stepCount > 0 && thing.stepsDone === thing.stepCount);
}

export function planForecasts(input: ForecastInput): PlannedForecasts {
  const { today, rows, things, loggedMinutes } = input;
  const extraOf = new Map(rows.items.map((i) => [i.id, i]));
  const live = things.filter((t) => !isFinished(t, extraOf.get(t.id)?.completed_at ?? null));
  const liveIds = new Set(live.map((t) => t.id));

  // Who is on each day from today on: only unfinished things of active goals use a day's time.
  const onDay = new Map<LocalDate, Set<string>>();
  for (const p of rows.picks) {
    if (p.plan_date < today || !liveIds.has(p.work_item_id)) continue;
    const here = onDay.get(p.plan_date) ?? new Set<string>();
    here.add(p.work_item_id);
    onDay.set(p.plan_date, here);
  }
  const kindOnDay = new Map(rows.dayKinds.map((k) => [k.plan_date, k.day_type_id]));
  const typeById = new Map(rows.dayTypes.map((t) => [t.id, t]));

  // The last day the person has planned anything: a thing on it or a kind given to it.
  const plannedDays = [...onDay.keys(), ...rows.dayKinds.map((k) => k.plan_date).filter((d) => d >= today)].sort();
  const lastPlanned = plannedDays.length === 0 ? null : plannedDays[plannedDays.length - 1];

  const requests: ForecastRequest[] = [];
  const pending = new Map<string, Pending>();

  for (const thing of live) {
    if (thing.kind !== 'deadline_task' || thing.dueOn === null) continue;
    const dueOn = thing.dueOn;
    const extra = extraOf.get(thing.id);

    const days = [...onDay.entries()]
      .filter(([date, here]) => date <= dueOn && here.has(thing.id))
      .map(([date]) => date)
      .sort();

    let blocked: ForecastView | null = days.length === 0 && dueOn >= today ? { state: 'nothing_set_aside' } : null;
    const availableDays: ForecastRequest['availableDays'] = [];
    for (const date of days) {
      const type = typeById.get(kindOnDay.get(date) ?? '');
      if (type === undefined) blocked = blocked ?? { state: 'day_without_kind', date };
      else if (type.capacity_amount === null || type.capacity_unit === null) blocked = blocked ?? { state: 'kind_without_time', date, kindName: type.name };
      else if (type.capacity_unit === 'sessions') blocked = blocked ?? { state: 'counted_in_sessions' };
      else availableDays.push({ date, capacity: (Number(type.capacity_amount) * MINUTES_PER_HOUR) / (onDay.get(date)?.size ?? 1) });
    }

    const logged = thing.targetId === null ? 0 : (loggedMinutes.get(thing.targetId) ?? 0);
    const estimate = extra?.estimate_minutes ?? null;
    const left = estimate === null ? null : Math.max(0, estimate - logged);

    requests.push({
      itemId: thing.id,
      dueDate: dueOn,
      canMove: extra?.date_can_move === true,
      steps: { total: thing.stepCount, done: thing.stepsDone },
      logged,
      estimateRemaining: left === null ? null : { low: left * (1 - FORECAST_TOLERANCE), high: left * (1 + FORECAST_TOLERANCE) },
      availableDays: blocked ? [] : availableDays,
    });
    pending.set(thing.id, {
      blocked,
      beyond: lastPlanned !== null && dueOn > lastPlanned ? { days: days.length, through: lastPlanned } : null,
    });
  }
  return { requests, pending };
}

// What home says for each forecast the engine returned. A task without a forecast (a milestone, finished work) has no entry.
export function forecastViews(planned: PlannedForecasts, verdicts: DeadlineForecast[]): Map<string, ForecastView> {
  const out = new Map<string, ForecastView>();
  for (const f of verdicts) {
    const p = planned.pending.get(f.itemId);
    if (!p) continue;
    // These do not depend on capacity, so they are said first.
    if (f.verdict === 'done') continue;
    if (f.verdict === 'past_due') out.set(f.itemId, { state: 'past_due' });
    else if (f.verdict === 'not_enough_data') out.set(f.itemId, { state: 'not_enough_data' });
    else if (p.blocked) out.set(f.itemId, p.blocked);
    else if (f.verdict === 'fits') out.set(f.itemId, { state: 'fits', soFar: p.beyond !== null });
    else if (p.beyond) out.set(f.itemId, { state: 'planned_so_far', days: p.beyond.days, through: p.beyond.through });
    else if (f.verdict === 'tight') out.set(f.itemId, { state: 'tight' });
    else out.set(f.itemId, { state: 'does_not_fit', options: f.options });
  }
  return out;
}
