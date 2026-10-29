// The week plan's rules, row by row (lib/services/weekPlanRows.ts, MOM-112 block 2). Pure: rows in, a view out.
//
// What these tests hold in place (docs/DOMAIN_MODEL.md §1.4, §4.2):
// - nothing is chosen for the person: with no picks and no kinds, every day is empty and no kind is set (principles 1, 12),
// - a time anchor that is not set is never filled in: no time zone or day end gives no plan, and no week start gives the
//   next 14 dates and no talk of weeks or of anything moved,
// - unfinished steps move forward and are listed (principle 11), a habit never carries over, and finished work is not
//   planned again,
// - "Same as last week" copies only onto dates from today on that have no kind yet,
// - a date that has passed, is not real or is too far ahead is refused.

import { describe, expect, it } from 'vitest';
import {
  MAX_WEEKS_AHEAD,
  buildHomePlan,
  buildWeekPlan,
  dateProblem,
  kindsToCopy,
  planContext,
  planWindow,
  sanitizeOffset,
  setDayDates,
  type PlanDayKindRead,
  type PlanDayTypeRead,
  type PlanGoalRead,
  type PlanItemRead,
  type PlanPickRead,
  type PlanRows,
  type PlanSettingsRead,
  type PlanTargetRead,
} from '@/lib/services/weekPlanRows';
import type { StepRead } from '@/lib/services/scoreboardRows';
import type { WeekPlanView } from '@/types/plan';
import type { TimeAnchors } from '@/types/scoreboard';

// Thursday 2026-10-29, noon in Los Angeles. The week starts Monday: 10-26 to 11-01. Last week is 10-19 to 10-25.
const NOW = Date.UTC(2026, 9, 29, 19, 0, 0);
const TODAY = '2026-10-29';

const settings = (over: Partial<PlanSettingsRead> = {}): PlanSettingsRead => ({ time_zone: 'America/Los_Angeles', week_start: 1, day_end: '00:00:00', ...over });
const goal = (id: string, over: Partial<PlanGoalRead> = {}): PlanGoalRead => ({ id, title: `Goal ${id}`, state: 'active', created_at: `2026-10-0${id}T00:00:00.000Z`, ...over });
const item = (id: string, over: Partial<PlanItemRead> = {}): PlanItemRead => ({
  id,
  goal_id: '1',
  target_id: null,
  kind: 'milestone',
  title: `Item ${id}`,
  due_date: null,
  sort_order: 0,
  created_at: `2026-10-01T00:00:0${id}.000Z`,
  completed_at: null,
  ...over,
});
const step = (id: string, itemId: string): StepRead => ({ id, work_item_id: itemId, title: `Step ${id}`, sort_order: 0 });
const pick = (itemId: string, date: string): PlanPickRead => ({ work_item_id: itemId, plan_date: date });
const kind = (date: string, dayTypeId: string): PlanDayKindRead => ({ plan_date: date, day_type_id: dayTypeId });
const dayType = (id: string, name: string): PlanDayTypeRead => ({ id, name, created_at: `2026-10-01T00:00:0${id}.000Z` });
const target = (id: string, over: Partial<PlanTargetRead> = {}): PlanTargetRead => ({ id, period_kind: 'weekly', slot_weekdays: null, due_date: null, ...over });

const rows = (over: Partial<PlanRows> = {}): PlanRows => ({
  settings: settings(),
  goals: [goal('1')],
  targets: [],
  items: [],
  steps: [],
  ticks: [],
  corrections: [],
  picks: [],
  dayKinds: [],
  dayTypes: [],
  ...over,
});

const ready = (plan: WeekPlanView) => {
  if (plan.state !== 'ready') throw new Error(`not ready: ${plan.state}`);
  return plan;
};

describe("the person's days need a time zone and a day end, and nothing else", () => {
  it('says which one is missing and builds no plan', () => {
    expect(planContext(null, NOW)).toEqual({ ok: false, anchor: 'time_zone', reason: 'not_set' });
    expect(planContext(settings({ time_zone: null }), NOW)).toEqual({ ok: false, anchor: 'time_zone', reason: 'not_set' });
    expect(planContext(settings({ day_end: null }), NOW)).toEqual({ ok: false, anchor: 'day_end', reason: 'not_set' });
    expect(buildWeekPlan(rows({ settings: null }), NOW)).toEqual({ state: 'needs_day_anchors', anchor: 'time_zone', reason: 'not_set' });
    expect(buildHomePlan(rows({ settings: null, items: [item('1')] }), NOW)).toEqual({ state: 'none' });
  });

  it('reads today in the person\'s own time zone, not the server\'s', () => {
    // 03:00 UTC on the 30th is still the evening of the 29th in Los Angeles.
    const ctx = planContext(settings(), Date.UTC(2026, 9, 30, 3, 0, 0));
    expect(ctx).toMatchObject({ ok: true, today: '2026-10-29' });
  });
});

describe('the dates shown', () => {
  const anchors = (weekStartsOn: TimeAnchors['weekStartsOn']): TimeAnchors => ({ timeZone: 'America/Los_Angeles', dayEndMinutes: 0, weekStartsOn });

  it('is the week from the person\'s own week start, seven dates', () => {
    const w = planWindow(TODAY, anchors(1), 0);
    expect(w).toMatchObject({ kind: 'week', offset: 0, start: '2026-10-26', end: '2026-11-01', hasPrevious: false, hasNext: true });
    expect(w.dates).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
    // A Sunday start gives a different week: the day the week starts is the person's.
    expect(planWindow(TODAY, anchors(0), 0)).toMatchObject({ start: '2026-10-25', end: '2026-10-31' });
  });

  it('steps forward a week at a time, as far as the plan reaches', () => {
    expect(planWindow(TODAY, anchors(1), 1)).toMatchObject({ start: '2026-11-02', hasPrevious: true });
    expect(planWindow(TODAY, anchors(1), MAX_WEEKS_AHEAD)).toMatchObject({ hasNext: false, hasPrevious: true });
  });

  it('treats a week that is not a whole number in range as this week', () => {
    for (const bad of [-1, 1.5, MAX_WEEKS_AHEAD + 1, 'abc', '', null, undefined, '1e3', '-2', {}]) expect(sanitizeOffset(bad), String(bad)).toBe(0);
    expect(sanitizeOffset('2')).toBe(2);
    expect(sanitizeOffset(3)).toBe(3);
  });

  it('is the next 14 dates from today when no week start is set, with no weeks to step through', () => {
    const w = planWindow(TODAY, anchors(null), 5);
    expect(w).toMatchObject({ kind: 'next_14_days', offset: 0, start: TODAY, end: '2026-11-11', hasPrevious: false, hasNext: false });
    expect(w.dates).toHaveLength(14);
    expect(w.dates[0]).toBe(TODAY);
  });
});

describe('a date that can take a change', () => {
  it('is a real date, today or later, within the plan\'s reach', () => {
    expect(dateProblem(TODAY, TODAY)).toBeNull();
    expect(dateProblem('2026-11-30', TODAY)).toBeNull();
    expect(dateProblem('2026-10-28', TODAY)).toBe('past');
    for (const bad of ['2026-02-30', '2026-13-01', 'tomorrow', '2026-1-1', '', 20261029, null, undefined, {}]) expect(dateProblem(bad, TODAY), String(bad)).toBe('not_a_date');
    expect(dateProblem('2028-01-01', TODAY)).toBe('too_far');
  });
});

describe('nothing is chosen for the person', () => {
  it('with no picks and no kinds every day is empty, and no day has a kind', () => {
    const plan = ready(buildWeekPlan(rows({ items: [item('1'), item('2', { kind: 'habit' })], dayTypes: [dayType('1', 'Work day')] }), NOW));
    expect(plan.days).toHaveLength(7);
    for (const day of plan.days) {
      expect(day.itemIds).toEqual([]);
      expect(day.dayTypeId).toBeNull();
    }
    expect(plan.copyableKinds).toBe(0);
  });

  it('puts a thing only on the days the person chose, and a kind only on the dates they gave one', () => {
    const plan = ready(
      buildWeekPlan(
        rows({ items: [item('1')], picks: [pick('1', '2026-10-30'), pick('1', '2026-11-01')], dayKinds: [kind('2026-10-30', '1')], dayTypes: [dayType('1', 'Work day')] }),
        NOW,
      ),
    );
    expect(plan.days.filter((d) => d.itemIds.includes('1')).map((d) => d.date)).toEqual(['2026-10-30', '2026-11-01']);
    expect(plan.days.filter((d) => d.dayTypeId !== null).map((d) => d.date)).toEqual(['2026-10-30']);
    expect(plan.days.find((d) => d.date === TODAY)).toMatchObject({ isToday: true, isPast: false });
    expect(plan.days.find((d) => d.date === '2026-10-28')).toMatchObject({ isToday: false, isPast: true });
  });
});

describe("the person's kinds of days", () => {
  it('come back in the order they were made, and kinds made together in setup come back by name, not by chance', () => {
    const together = '2026-10-01T00:00:00.000Z';
    const kinds = [
      { id: 'z-id', name: 'Work day', created_at: together },
      { id: 'a-id', name: 'Rest day', created_at: together },
      { id: 'm-id', name: 'Light day', created_at: '2026-09-01T00:00:00.000Z' },
    ];
    const names = (rowsIn: typeof kinds) => ready(buildWeekPlan(rows({ dayTypes: rowsIn }), NOW)).dayKinds.map((k) => k.name);
    expect(names(kinds)).toEqual(['Light day', 'Rest day', 'Work day']);
    // The same whichever order the database returned them in.
    expect(names([...kinds].reverse())).toEqual(['Light day', 'Rest day', 'Work day']);
  });
});

describe('what can be put on a day', () => {
  it('lists habits, and milestones and deadline tasks that are not finished, of active goals, in the person\'s order', () => {
    const plan = ready(
      buildWeekPlan(
        rows({
          goals: [goal('1'), goal('2'), goal('3', { state: 'parked' })],
          items: [
            item('1', { goal_id: '2', title: 'Second goal, first' }),
            item('2', { goal_id: '1', title: 'First goal, second', sort_order: 2 }),
            item('3', { goal_id: '1', title: 'First goal, first', sort_order: 1, kind: 'habit' }),
            item('4', { goal_id: '3', title: 'In a parked goal' }),
            item('5', { goal_id: '1', title: 'Marked finished', completed_at: '2026-10-20T00:00:00.000Z' }),
          ],
        }),
        NOW,
      ),
    );
    expect(plan.items.map((i) => i.title)).toEqual(['First goal, first', 'First goal, second', 'Second goal, first']);
  });

  it('does not offer a milestone again once every step is ticked, and keeps one with a step left', () => {
    const base = { items: [item('1'), item('2')], steps: [step('a', '1'), step('b', '1'), step('c', '2')] };
    const ticks = [
      { source_id: 's', source_record_id: 'a', occurred_at: '2026-10-27T19:00:00.000Z' },
      { source_id: 's', source_record_id: 'b', occurred_at: '2026-10-28T19:00:00.000Z' },
    ];
    const plan = ready(buildWeekPlan(rows({ ...base, ticks }), NOW));
    expect(plan.items.map((i) => i.id)).toEqual(['2']);
    // A hidden tick is not a tick: the step is not done.
    const hidden = ready(buildWeekPlan(rows({ ...base, ticks, corrections: [{ source_id: 's', source_record_id: 'b', action: 'hide' }] }), NOW));
    expect(hidden.items.map((i) => i.id)).toEqual(['1', '2']);
  });

  it('shows a due date from the item or from the deadline target it feeds, and the habit\'s set days in the order of the week', () => {
    const plan = ready(
      buildWeekPlan(
        rows({
          targets: [target('t1', { period_kind: 'deadline', due_date: '2026-12-01' }), target('t2', { period_kind: 'day_slots', slot_weekdays: [5, 1, 3, 1] })],
          items: [
            item('1', { kind: 'deadline_task', due_date: '2026-11-20' }),
            item('2', { target_id: 't1' }),
            item('3', { kind: 'habit', target_id: 't2' }),
            item('4', { kind: 'habit', target_id: 't3' }),
          ],
        }),
        NOW,
      ),
    );
    const byId = Object.fromEntries(plan.items.map((i) => [i.id, i]));
    expect(byId['1'].dueOn).toBe('2026-11-20');
    expect(byId['2'].dueOn).toBe('2026-12-01');
    // The database counts Monday as 1 and the engine counts Sunday as 0; the days come back as weekdays (0 is Sunday).
    expect(byId['3'].setDays).toEqual([1, 3, 5]);
    expect(byId['4'].setDays).toBeNull();
    expect(byId['1'].setDays).toBeNull();
  });
});

describe('unfinished work moves forward and a habit never carries over (principle 11)', () => {
  const lastWeek = '2026-10-21';

  it('lists a step left over from a week that has closed, once the week has ended', () => {
    const plan = ready(buildWeekPlan(rows({ items: [item('1'), item('2')], picks: [pick('1', lastWeek)] }), NOW));
    expect(plan.items.find((i) => i.id === '1')?.movedFromLastWeek).toBe(true);
    // Never put on a day at all: nothing moved, it is simply not planned.
    expect(plan.items.find((i) => i.id === '2')?.movedFromLastWeek).toBe(false);
  });

  it('does not list it once the person has put it on a day this week or later', () => {
    for (const date of ['2026-10-27', '2026-11-03']) {
      const plan = ready(buildWeekPlan(rows({ items: [item('1')], picks: [pick('1', lastWeek), pick('1', date)] }), NOW));
      expect(plan.items[0].movedFromLastWeek, date).toBe(false);
    }
  });

  it('does not list a habit missed last week: it is not owed', () => {
    const plan = ready(buildWeekPlan(rows({ items: [item('1', { kind: 'habit' })], picks: [pick('1', lastWeek)] }), NOW));
    expect(plan.items[0].movedFromLastWeek).toBe(false);
    const card = buildHomePlan(rows({ items: [item('1', { kind: 'habit' })], picks: [pick('1', lastWeek)] }), NOW);
    expect(card).toMatchObject({ state: 'ready', moved: [] });
  });

  it('does not list finished work', () => {
    const finished = rows({ items: [item('1')], steps: [step('a', '1')], ticks: [{ source_id: 's', source_record_id: 'a', occurred_at: '2026-10-27T19:00:00.000Z' }], picks: [pick('1', lastWeek)] });
    expect(ready(buildWeekPlan(finished, NOW)).items).toEqual([]);
    expect(buildHomePlan(finished, NOW)).toEqual({ state: 'none' });
  });

  it('says nothing moved without a week start: it will not guess where a week ends', () => {
    const noStart = rows({ settings: settings({ week_start: null }), items: [item('1')], picks: [pick('1', lastWeek)] });
    expect(ready(buildWeekPlan(noStart, NOW)).items[0].movedFromLastWeek).toBe(false);
    expect(buildHomePlan(noStart, NOW)).toMatchObject({ state: 'ready', moved: [] });
  });

  it('puts the left-over step on the card at home, with its goal', () => {
    const card = buildHomePlan(rows({ items: [item('1', { title: 'Book the room' })], picks: [pick('1', lastWeek)] }), NOW);
    expect(card).toEqual({ state: 'ready', today: TODAY, todayItems: [], plannedLater: false, moved: [{ id: '1', title: 'Book the room', goalTitle: 'Goal 1' }] });
  });
});

describe('without a week start', () => {
  it('is the next 14 dates, never weeks, and still plans', () => {
    const plan = ready(buildWeekPlan(rows({ settings: settings({ week_start: null }), items: [item('1')], picks: [pick('1', '2026-11-05')] }), NOW));
    expect(plan).toMatchObject({ window: 'next_14_days', offset: 0, hasPrevious: false, hasNext: false, start: TODAY });
    expect(plan.days).toHaveLength(14);
    expect(plan.days.filter((d) => d.itemIds.length > 0).map((d) => d.date)).toEqual(['2026-11-05']);
  });
});

describe('"Same as last week"', () => {
  const dates = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'];

  it('copies a kind onto a date from today on that has none, from the date a week earlier', () => {
    // 10-20 had a kind, and 10-27 (a day that has passed) has none: it is not given one.
    const before = [kind('2026-10-20', 'z'), kind('2026-10-22', 'a'), kind('2026-10-23', 'b'), kind('2026-10-25', 'a')];
    expect(kindsToCopy(before, dates, TODAY)).toEqual([
      { date: '2026-10-29', dayTypeId: 'a' },
      { date: '2026-10-30', dayTypeId: 'b' },
      { date: '2026-11-01', dayTypeId: 'a' },
    ]);
  });

  it('never overwrites a kind the person already gave, and never touches a day that has passed', () => {
    const before = [kind('2026-10-19', 'a'), kind('2026-10-22', 'a'), kind('2026-10-23', 'b')];
    const now = [kind('2026-10-26', 'c'), kind('2026-10-30', 'c')];
    expect(kindsToCopy([...before, ...now], dates, TODAY)).toEqual([{ date: '2026-10-29', dayTypeId: 'a' }]);
  });

  it('copies nothing when last week had no kinds, and the button count says so', () => {
    expect(kindsToCopy([], dates, TODAY)).toEqual([]);
    const plan = ready(buildWeekPlan(rows({ dayTypes: [dayType('1', 'Work day')], dayKinds: [kind('2026-10-30', '1')] }), NOW));
    expect(plan.copyableKinds).toBe(0);
    const withLast = ready(buildWeekPlan(rows({ dayTypes: [dayType('1', 'Work day')], dayKinds: [kind('2026-10-23', '1')] }), NOW));
    expect(withLast.copyableKinds).toBe(1);
  });
});

describe('a habit\'s set days', () => {
  it('are the dates in the week on the days the person named, from today on', () => {
    const dates = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'];
    // Monday, Wednesday, Friday: Monday and Wednesday have passed.
    expect(setDayDates([1, 3, 5], dates, TODAY)).toEqual(['2026-10-30']);
    expect(setDayDates([4], dates, TODAY)).toEqual([TODAY]);
    expect(setDayDates([], dates, TODAY)).toEqual([]);
  });
});

describe('the "Your plan" card on home', () => {
  it('shows nothing when there is nothing to put on a day', () => {
    expect(buildHomePlan(rows(), NOW)).toEqual({ state: 'none' });
  });

  it('names what the person put on today, and whether days ahead are planned, and picks nothing itself', () => {
    const empty = buildHomePlan(rows({ items: [item('1'), item('2')] }), NOW);
    expect(empty).toEqual({ state: 'ready', today: TODAY, todayItems: [], plannedLater: false, moved: [] });
    const planned = buildHomePlan(rows({ items: [item('1'), item('2')], picks: [pick('1', TODAY), pick('2', '2026-10-31')] }), NOW);
    expect(planned).toMatchObject({ todayItems: [{ id: '1', title: 'Item 1', goalTitle: 'Goal 1' }], plannedLater: true });
  });

  it('does not count a day that has passed as planned ahead', () => {
    const card = buildHomePlan(rows({ items: [item('1', { kind: 'habit' })], picks: [pick('1', '2026-10-27')] }), NOW);
    expect(card).toMatchObject({ todayItems: [], plannedLater: false });
  });
});
