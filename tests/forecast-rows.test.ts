// The deadline forecast on home (lib/services/forecastRows.ts, MOM-112 slice 2): what a deadline task is given from the days
// the person set aside, and what home says of the engine's verdict. Pure: rows in, a view out. The rules each test names
// come from docs/DOMAIN_MODEL.md §1.4, RAID A-07 and the owner's decisions of 2026-10-29:
// - a day gives the usual time of the kind the person said it is, shared equally among what they put on it, in minutes;
// - the forecast is a fact about the days set aside, never a promise, and it shows no minutes or capacity figure;
// - never assume: a day with no kind, a kind with no usual time, or time counted in sessions gives no verdict;
// - the due date past the last planned day: if the days set aside so far are already enough, say so; otherwise say how many
//   days are set aside, with no tight or short claim until the planned days reach the due date;
// - only a deadline task has a forecast, and finished work has none.
// The reads, and one person never reading another's rows, are in tests/scoreboard-service.test.ts.

import { describe, expect, it } from 'vitest';
import { FORECAST_TOLERANCE } from '@/lib/engine';
import { NO_FORECAST_ROWS, planForecasts, type ForecastRows, type ForecastThing } from '@/lib/services/forecastRows';
import {
  buildHomeScoreboard,
  type CorrectionRead,
  type EntryRead,
  type GoalRead,
  type HomeRows,
  type ItemRead,
  type SettingsRead,
  type StepRead,
  type TargetRead,
} from '@/lib/services/scoreboardRows';
import type { ForecastView, HomeScoreboard, MilestoneView } from '@/types/home';

// Thursday 2026-10-29, noon in Los Angeles. The person's today is 2026-10-29.
const NOW = Date.UTC(2026, 9, 29, 19, 0, 0);
const TODAY = '2026-10-29';
const SETTINGS: SettingsRead = { time_zone: 'America/Los_Angeles', week_start: null, day_end: '00:00:00', tone: null, celebrations: null };

const goal: GoalRead = { id: 'g', title: 'Land the new role', state: 'active', shape: 'project', start_date: '2026-10-05', end_date: '2026-12-18', created_at: '2026-10-01T00:00:00.000Z' };
const tracked: TargetRead = {
  id: 'tracked',
  goal_id: 'g',
  title: 'Time on the portfolio',
  measure: 'time',
  unit: 'min',
  role: 'effort',
  period_kind: 'deadline',
  due_date: '2026-12-18',
  slot_weekdays: null,
  floor: 6000,
  aspiration: null,
  qualifying_threshold: null,
  carry_over_kind: 'cumulative',
  created_at: '2026-10-01T00:00:01.000Z',
};

let seq = 0;
const item = (id: string, over: Partial<ItemRead> = {}): ItemRead => ({
  id,
  goal_id: 'g',
  target_id: null,
  kind: 'deadline_task',
  title: id,
  due_date: '2026-10-30',
  sort_order: seq++,
  created_at: `2026-10-02T00:00:${String(seq).padStart(2, '0')}.000Z`,
  ...over,
});
const step = (id: string, itemId: string): StepRead => ({ id, work_item_id: itemId, title: id, sort_order: seq++ });
const entry = (id: string, targetId: string, day: string, value: number, recordId = id): EntryRead => ({
  id,
  target_id: targetId,
  source_id: 'src',
  source_record_id: recordId,
  occurred_at: `${day}T19:00:00+00:00`,
  value,
  evidence: {},
});

// What the person said about a deadline task at setup.
const extra = (id: string, over: Partial<ForecastRows['items'][number]> = {}) => ({ id, date_can_move: true, estimate_minutes: null, completed_at: null, ...over });

const WORK = { id: 'k-work', name: 'Work day', capacity_unit: 'hours' as const, capacity_amount: 4 };
const pick = (itemId: string, ...dates: string[]) => dates.map((plan_date) => ({ work_item_id: itemId, plan_date }));
const kinds = (kind: string, ...dates: string[]) => dates.map((plan_date) => ({ plan_date, day_type_id: kind }));

function rowsOf(over: Partial<HomeRows> = {}, forecast: Partial<ForecastRows> = {}): HomeRows {
  return {
    settings: SETTINGS,
    goals: [goal],
    targets: [tracked],
    items: [],
    steps: [],
    entries: [],
    corrections: [],
    snapshots: [],
    forecast: { ...NO_FORECAST_ROWS, dayTypes: [WORK], ...forecast },
    ...over,
  };
}

// One deadline task due Friday Oct 30 (tomorrow), alone on today and tomorrow, each a four-hour work day: 480 minutes.
function oneTask(over: { item?: Partial<ItemRead>; extra?: Partial<ForecastRows['items'][number]>; rows?: Partial<HomeRows>; forecast?: Partial<ForecastRows> } = {}): HomeRows {
  const t = item('task', { target_id: 'tracked', ...over.item });
  return rowsOf(
    { items: [t], ...over.rows },
    {
      items: [extra('task', { estimate_minutes: 360, ...over.extra })],
      picks: pick('task', TODAY, '2026-10-30'),
      dayKinds: kinds('k-work', TODAY, '2026-10-30'),
      ...over.forecast,
    },
  );
}

const ready = (view: HomeScoreboard) => {
  if (view.state !== 'ready') throw new Error(`not ready: ${view.state}`);
  return view;
};
const milestones = (r: HomeRows): MilestoneView[] => ready(buildHomeScoreboard(r, NOW)).goals[0].milestones;
const forecastOf = (r: HomeRows, id = 'task'): ForecastView | null => milestones(r).find((m) => m.id === id)?.forecast ?? null;

describe('what a deadline task is given', () => {
  const thing = (over: Partial<ForecastThing> = {}): ForecastThing => ({ id: 'task', kind: 'deadline_task', dueOn: '2026-10-30', targetId: null, stepCount: 0, stepsDone: 0, ...over });
  const plan = (forecast: Partial<ForecastRows>, things = [thing()], logged = new Map<string, number>()) =>
    planForecasts({ today: TODAY, rows: { ...NO_FORECAST_ROWS, dayTypes: [WORK], ...forecast }, things, loggedMinutes: logged });

  it('turns a kind of day in hours into minutes', () => {
    const half = { id: 'k-half', name: 'Short day', capacity_unit: 'hours' as const, capacity_amount: 1.5 };
    const planned = plan({ dayTypes: [half], picks: pick('task', TODAY), dayKinds: kinds('k-half', TODAY), items: [extra('task', { estimate_minutes: 60 })] });
    expect(planned.requests[0].availableDays).toEqual([{ date: TODAY, capacity: 90 }]);
  });

  it('shares a day equally among everything unfinished the person put on it, so a busy day gives each less', () => {
    const planned = plan(
      {
        picks: [...pick('task', TODAY, '2026-10-30'), ...pick('run', TODAY), ...pick('book', TODAY, '2026-10-30')],
        dayKinds: kinds('k-work', TODAY, '2026-10-30'),
        items: [extra('task', { estimate_minutes: 60 })],
      },
      [thing(), thing({ id: 'run', kind: 'habit', dueOn: null }), thing({ id: 'book', kind: 'milestone', dueOn: null })],
    );
    // Three things on today (240 / 3 = 80), two on tomorrow (240 / 2 = 120).
    expect(planned.requests[0].availableDays).toEqual([
      { date: TODAY, capacity: 80 },
      { date: '2026-10-30', capacity: 120 },
    ]);
  });

  it('gives a task nothing on a day it is not on', () => {
    const planned = plan({ picks: [...pick('run', TODAY), ...pick('task', '2026-10-30')], dayKinds: kinds('k-work', TODAY, '2026-10-30'), items: [extra('task', { estimate_minutes: 60 })] }, [
      thing(),
      thing({ id: 'run', kind: 'habit', dueOn: null }),
    ]);
    expect(planned.requests[0].availableDays).toEqual([{ date: '2026-10-30', capacity: 240 }]);
  });

  it('does not count finished work, a day that has passed or a day after the due date', () => {
    const planned = plan(
      {
        picks: [...pick('task', TODAY, '2026-10-30', '2026-11-02'), ...pick('done', TODAY), ...pick('task', '2026-10-27')],
        dayKinds: kinds('k-work', TODAY, '2026-10-30', '2026-11-02', '2026-10-27'),
        items: [extra('task', { estimate_minutes: 60 }), extra('done', { completed_at: '2026-10-28T00:00:00.000Z' })],
      },
      [thing(), thing({ id: 'done', kind: 'milestone', dueOn: null })],
    );
    expect(planned.requests[0].availableDays).toEqual([
      { date: TODAY, capacity: 240 },
      { date: '2026-10-30', capacity: 240 },
    ]);
  });

  it('gives the rough size less what is logged, as a band of the engine’s tolerance either side', () => {
    const planned = plan({ picks: pick('task', TODAY), dayKinds: kinds('k-work', TODAY), items: [extra('task', { estimate_minutes: 600 })] }, [thing({ targetId: 'tracked' })], new Map([['tracked', 200]]));
    expect(planned.requests[0].logged).toBe(200);
    expect(planned.requests[0].estimateRemaining).toEqual({ low: 400 * (1 - FORECAST_TOLERANCE), high: 400 * (1 + FORECAST_TOLERANCE) });
  });

  it('gives no work left when the size is more than done, and no size when the person gave none', () => {
    const over = plan({ picks: pick('task', TODAY), dayKinds: kinds('k-work', TODAY), items: [extra('task', { estimate_minutes: 100 })] }, [thing({ targetId: 'tracked' })], new Map([['tracked', 150]]));
    expect(over.requests[0].estimateRemaining).toEqual({ low: 0, high: 0 });
    const none = plan({ picks: pick('task', TODAY), dayKinds: kinds('k-work', TODAY), items: [extra('task')] });
    expect(none.requests[0].estimateRemaining).toBeNull();
  });

  it('offers to move the date only when setup recorded that it can move', () => {
    const request = (canMove: boolean | null) => plan({ items: [extra('task', { date_can_move: canMove })] }).requests[0].canMove;
    expect(request(true)).toBe(true);
    expect(request(false)).toBe(false);
    expect(request(null)).toBe(false);
  });

  it('asks the engine about deadline tasks only, and not about finished ones', () => {
    const planned = plan(
      { items: [extra('task'), extra('done', { completed_at: '2026-10-28T00:00:00.000Z' })] },
      [thing(), thing({ id: 'm', kind: 'milestone' }), thing({ id: 'h', kind: 'habit', dueOn: null }), thing({ id: 'done' }), thing({ id: 'steps', stepCount: 2, stepsDone: 2 })],
    );
    expect(planned.requests.map((r) => r.itemId)).toEqual(['task']);
  });
});

describe('what home says of a deadline task', () => {
  it('fits: the days set aside look like enough, when the plan reaches the due date', () => {
    // 360 minutes left is 270 to 450, and two days alone give 480.
    expect(forecastOf(oneTask())).toEqual({ state: 'fits', soFar: false });
  });

  it('tight: the days set aside are close to what is left', () => {
    // 600 left is 450 to 750 against 480.
    expect(forecastOf(oneTask({ extra: { estimate_minutes: 600 } }))).toEqual({ state: 'tight' });
  });

  it('does not fit, with the options, and move the date only when it can move', () => {
    const movable = forecastOf(oneTask({ extra: { estimate_minutes: 1200, date_can_move: true } }));
    expect(movable).toEqual({ state: 'does_not_fit', options: ['more_time', 'smaller_scope', 'move_date', 'accept_risk'] });
    const fixed = forecastOf(oneTask({ extra: { estimate_minutes: 1200, date_can_move: false } }));
    expect(fixed).toEqual({ state: 'does_not_fit', options: ['more_time', 'smaller_scope', 'accept_risk'] });
  });

  it('a busier day makes a task that fit alone not fit', () => {
    const alone = oneTask({ extra: { estimate_minutes: 360 } });
    expect(forecastOf(alone)).toEqual({ state: 'fits', soFar: false });
    const busy = oneTask({
      extra: { estimate_minutes: 360 },
      rows: { items: [item('task', { target_id: 'tracked' }), item('run', { kind: 'habit', due_date: null, target_id: 'tracked' })] },
      forecast: { picks: [...pick('task', TODAY, '2026-10-30'), ...pick('run', TODAY, '2026-10-30')] },
    });
    // Half of 480 is 240 against 270 to 450.
    expect(forecastOf(busy)).toEqual({ state: 'does_not_fit', options: ['more_time', 'smaller_scope', 'move_date', 'accept_risk'] });
  });

  it('shows no minutes, capacity or slot: only the verdict and the words around it', () => {
    const text = JSON.stringify(forecastOf(oneTask({ extra: { estimate_minutes: 1200 } })));
    expect(text).not.toMatch(/capacity|minutes|slot|free/i);
  });

  it('past due is said first, even with nothing set aside', () => {
    const r = oneTask({ item: { due_date: '2026-10-20' }, forecast: { picks: [], dayKinds: [] } });
    expect(forecastOf(r)).toEqual({ state: 'past_due' });
  });

  it('not enough to say is said before a missing day kind, when there is no size and no pace', () => {
    const r = oneTask({ extra: { estimate_minutes: null }, forecast: { dayKinds: [] } });
    expect(forecastOf(r)).toEqual({ state: 'not_enough_data' });
    expect(forecastOf(oneTask({ extra: { estimate_minutes: null }, forecast: { picks: [] } }))).toEqual({ state: 'not_enough_data' });
  });

  it('the pace so far beats the rough size once steps are ticked and time is logged', () => {
    // Four steps, two ticked, 120 minutes logged: 120 left, 90 to 150, against 480. The size of 6,000 minutes alone would not fit.
    const r = oneTask({
      extra: { estimate_minutes: 6000 },
      rows: {
        items: [item('task', { target_id: 'tracked' })],
        steps: ['s1', 's2', 's3', 's4'].map((id) => step(id, 'task')),
        entries: [entry('t1', 'tracked', '2026-10-27', 60), entry('t2', 'tracked', '2026-10-28', 60), entry('k1', 'tracked', '2026-10-27', 1, 's1'), entry('k2', 'tracked', '2026-10-28', 1, 's2')],
      },
    });
    expect(forecastOf(r)).toEqual({ state: 'fits', soFar: false });
    // The two ticks are ticks, not minutes: without the time, the size is used and does not fit.
    const noTime = oneTask({
      extra: { estimate_minutes: 6000 },
      rows: {
        items: [item('task', { target_id: 'tracked' })],
        steps: ['s1', 's2', 's3', 's4'].map((id) => step(id, 'task')),
        entries: [entry('k1', 'tracked', '2026-10-27', 1, 's1'), entry('k2', 'tracked', '2026-10-28', 1, 's2')],
      },
    });
    expect(forecastOf(noTime)).toMatchObject({ state: 'does_not_fit' });
  });

  it('time the person hid is not logged', () => {
    const base = {
      extra: { estimate_minutes: 6000 },
      rows: {
        items: [item('task', { target_id: 'tracked' })],
        steps: ['s1', 's2', 's3', 's4'].map((id) => step(id, 'task')),
        entries: [entry('t1', 'tracked', '2026-10-27', 120), entry('k1', 'tracked', '2026-10-27', 1, 's1'), entry('k2', 'tracked', '2026-10-28', 1, 's2')],
      },
    };
    expect(forecastOf(oneTask(base))).toEqual({ state: 'fits', soFar: false });
    const hide: CorrectionRead = { source_id: 'src', source_record_id: 't1', action: 'hide' };
    expect(forecastOf(oneTask({ ...base, rows: { ...base.rows, corrections: [hide] } }))).toMatchObject({ state: 'does_not_fit' });
  });

  it('finished work, and a milestone, have no forecast', () => {
    expect(forecastOf(oneTask({ extra: { completed_at: '2026-10-28T00:00:00.000Z' } }))).toBeNull();
    const ticked = oneTask({ rows: { items: [item('task', { target_id: 'tracked' })], steps: [step('s1', 'task')], entries: [entry('k1', 'tracked', '2026-10-28', 1, 's1')] } });
    expect(forecastOf(ticked)).toBeNull();
    const milestone = oneTask({ item: { kind: 'milestone' }, extra: { date_can_move: null } });
    expect(forecastOf(milestone)).toBeNull();
  });

  it('is shown to a person with no week start, because a deadline never needs one', () => {
    expect(SETTINGS.week_start).toBeNull();
    expect(forecastOf(oneTask())).toEqual({ state: 'fits', soFar: false });
  });
});

describe('never assume: a day, a kind or a time the person did not give is not guessed', () => {
  it('nothing set aside for the task yet', () => {
    expect(forecastOf(oneTask({ forecast: { picks: pick('other', TODAY) } }))).toEqual({ state: 'nothing_set_aside' });
  });

  it('a day the task is on has no kind', () => {
    expect(forecastOf(oneTask({ forecast: { dayKinds: kinds('k-work', '2026-10-30') } }))).toEqual({ state: 'day_without_kind', date: TODAY });
  });

  it('a kind the person has not given a usual time', () => {
    const rest = { id: 'k-rest', name: 'Rest day', capacity_unit: null, capacity_amount: null };
    expect(forecastOf(oneTask({ forecast: { dayTypes: [WORK, rest], dayKinds: [...kinds('k-work', TODAY), ...kinds('k-rest', '2026-10-30')] } }))).toEqual({
      state: 'kind_without_time',
      date: '2026-10-30',
      kindName: 'Rest day',
    });
  });

  it('time counted in sessions, because a task is sized in minutes', () => {
    const sessions = { id: 'k-sessions', name: 'Study day', capacity_unit: 'sessions' as const, capacity_amount: 2 };
    expect(forecastOf(oneTask({ forecast: { dayTypes: [sessions], dayKinds: kinds('k-sessions', TODAY, '2026-10-30') } }))).toEqual({ state: 'counted_in_sessions' });
  });

  it('a day that has passed, or a day with no pick of this task, does not block it', () => {
    const r = oneTask({ forecast: { picks: [...pick('task', TODAY, '2026-10-30', '2026-10-27')], dayKinds: kinds('k-work', TODAY, '2026-10-30') } });
    expect(forecastOf(r)).toEqual({ state: 'fits', soFar: false });
  });
});

describe('a due date past the last day the person has planned', () => {
  // Due Friday Nov 6; the person has planned today, tomorrow, Monday and Tuesday, 240 minutes alone on each: 960.
  const longer = (estimate: number, over: { forecast?: Partial<ForecastRows> } = {}) =>
    oneTask({
      item: { due_date: '2026-11-06' },
      extra: { estimate_minutes: estimate },
      forecast: { picks: pick('task', TODAY, '2026-10-30', '2026-11-02', '2026-11-03'), dayKinds: kinds('k-work', TODAY, '2026-10-30', '2026-11-02', '2026-11-03'), ...over.forecast },
    });

  it('already enough on the days set aside so far: says so, and that the days to come are not counted', () => {
    // 600 left is 450 to 750, and 960 is set aside.
    expect(forecastOf(longer(600))).toEqual({ state: 'fits', soFar: true });
  });

  it('close to what is left on the days so far: no tight claim, just the days set aside and how far the plan goes', () => {
    // 1,200 left is 900 to 1,500 against 960, which on its own would be tight.
    expect(forecastOf(longer(1200))).toEqual({ state: 'planned_so_far', days: 4, through: '2026-11-03' });
  });

  it('short on the days so far: no short claim and no options until the plan reaches the date', () => {
    // 2,400 left would not fit on 960, but the days to come are not planned yet.
    const view = forecastOf(longer(2400));
    expect(view).toEqual({ state: 'planned_so_far', days: 4, through: '2026-11-03' });
    expect(JSON.stringify(view)).not.toMatch(/options|does_not_fit|tight/);
  });

  it('counts the plan as reaching the date once something is planned on or after it', () => {
    const reaching = longer(1200, { forecast: { picks: pick('task', TODAY, '2026-10-30', '2026-11-02', '2026-11-03', '2026-11-06'), dayKinds: kinds('k-work', TODAY, '2026-10-30', '2026-11-02', '2026-11-03', '2026-11-06') } });
    // Five days, 1,200 against 900 to 1,500: now a plain tight, because the plan reaches the date.
    expect(forecastOf(reaching)).toEqual({ state: 'tight' });
  });

  it('a kind given to a later day, with nothing on it, also counts as planned', () => {
    const r = longer(2400, { forecast: { dayKinds: kinds('k-work', TODAY, '2026-10-30', '2026-11-02', '2026-11-03', '2026-11-06') } });
    expect(forecastOf(r)).toMatchObject({ state: 'does_not_fit' });
  });

  it('a missing day kind still asks for the kind, whatever the plan reaches', () => {
    expect(forecastOf(longer(600, { forecast: { dayKinds: kinds('k-work', TODAY, '2026-10-30', '2026-11-02') } }))).toEqual({ state: 'day_without_kind', date: '2026-11-03' });
  });
});
