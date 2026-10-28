// Mapping the goal model's rows onto the scoreboard engine and shaping home (lib/services/scoreboardRows.ts, MOM-112).
// Pure: rows in, a view out. The rules each test names come from docs/DOMAIN_MODEL.md and the owner's decisions of
// 2026-10-28:
// - every number on a card is a fact the engine produced, mapped row by row (the numbers below are worked by hand
//   from the entries, and the same engine produced them);
// - never assume: a time anchor not set is never filled in, and a target that cannot be graded is shown, not graded;
// - a weekly or day-slot target waits for the week start, and only that kind ever says so: a person with only deadline
//   goals is never asked for one (§2.2 step 10);
// - the person's word beats any source: a hide or a count-anyway correction is applied by the source's record id;
// - a tie for the week's biggest crossing names every tied target, in title then id order, and picks none.
// The reads and one person never reading another's rows are in tests/scoreboard-service.test.ts.

import { describe, expect, it } from 'vitest';
import {
  buildHomeScoreboard,
  toAnchors,
  toScoreboardEntries,
  toScoreboardTarget,
  toSnapshot,
  toSpec,
  type CorrectionRead,
  type EntryRead,
  type GoalRead,
  type HomeRows,
  type ItemRead,
  type SettingsRead,
  type StepRead,
  type TargetRead,
} from '@/lib/services/scoreboardRows';
import { DEFAULT_CELEBRATION, DEFAULT_TONE } from '@/lib/home/defaults';
import type { HomeScoreboard, TargetCardView } from '@/types/home';

// Thursday 2026-10-29, noon in Los Angeles (UTC-7 until 2026-11-01). The person's week runs Monday 26th to Sunday 1st.
const NOW = Date.UTC(2026, 9, 29, 19, 0, 0);
const SETTINGS: SettingsRead = { time_zone: 'America/Los_Angeles', week_start: 1, day_end: '00:00:00', tone: null, celebrations: null };

let seq = 0;
const stamp = () => `2026-10-01T00:00:${String(seq++).padStart(2, '0')}.000Z`;

const goal = (id: string, over: Partial<GoalRead> = {}): GoalRead => ({
  id,
  title: `Goal ${id}`,
  state: 'active',
  shape: 'ongoing',
  start_date: '2026-10-05',
  end_date: null,
  created_at: stamp(),
  ...over,
});

const target = (id: string, goalId: string, over: Partial<TargetRead> = {}): TargetRead => ({
  id,
  goal_id: goalId,
  title: id,
  measure: 'count',
  unit: null,
  role: 'effort',
  period_kind: 'weekly',
  due_date: null,
  slot_weekdays: null,
  floor: 3,
  aspiration: 5,
  qualifying_threshold: null,
  carry_over_kind: 'habit',
  created_at: stamp(),
  ...over,
});

const item = (id: string, goalId: string, over: Partial<ItemRead> = {}): ItemRead => ({
  id,
  goal_id: goalId,
  target_id: null,
  kind: 'milestone',
  title: id,
  due_date: null,
  sort_order: 0,
  created_at: stamp(),
  ...over,
});

const step = (id: string, itemId: string, over: Partial<StepRead> = {}): StepRead => ({ id, work_item_id: itemId, title: id, sort_order: 0, ...over });

let entryNo = 0;
// A manual entry at noon Los Angeles time on a day (all the worked weeks are in daylight time).
const entry = (targetId: string, day: string, over: Partial<EntryRead> = {}): EntryRead => {
  const n = ++entryNo;
  return {
    id: `e${n}`,
    target_id: targetId,
    source_id: 'src',
    source_record_id: `rec${n}`,
    occurred_at: `${day}T19:00:00+00:00`,
    value: 1,
    evidence: {},
    ...over,
  };
};
const on = (targetId: string, ...days: string[]) => days.map((d) => entry(targetId, d));

const rows = (over: Partial<HomeRows> = {}): HomeRows => ({
  settings: SETTINGS,
  goals: [],
  targets: [],
  items: [],
  steps: [],
  entries: [],
  corrections: [],
  snapshots: [],
  ...over,
});

const ready = (view: HomeScoreboard) => {
  expect(view.state).toBe('ready');
  if (view.state !== 'ready') throw new Error('not ready');
  return view;
};
const card = (view: HomeScoreboard, goalId: string, targetId: string): TargetCardView => {
  const found = ready(view).goals.find((g) => g.id === goalId)?.targets.find((t) => t.id === targetId);
  if (!found) throw new Error(`no card for ${targetId}`);
  return found;
};
const counted = (c: TargetCardView) => {
  if (c.status !== 'counted') throw new Error(`${c.id} is ${c.status}`);
  return c;
};

describe('toAnchors: each anchor is the person’s own, and nothing is filled in', () => {
  it('maps the week start from Monday-is-1 to the engine’s Sunday-is-0', () => {
    expect(toAnchors({ ...SETTINGS, week_start: 1 }).weekStartsOn).toBe(1);
    expect(toAnchors({ ...SETTINGS, week_start: 6 }).weekStartsOn).toBe(6);
    expect(toAnchors({ ...SETTINGS, week_start: 7 }).weekStartsOn).toBe(0);
  });

  it('maps the day end to minutes after midnight', () => {
    expect(toAnchors({ ...SETTINGS, day_end: '00:00:00' }).dayEndMinutes).toBe(0);
    expect(toAnchors({ ...SETTINGS, day_end: '02:30:00' }).dayEndMinutes).toBe(150);
    expect(toAnchors({ ...SETTINGS, day_end: '22:00:00' }).dayEndMinutes).toBe(1320);
  });

  it('leaves every anchor null when the person has not set it, and when they have no settings row at all', () => {
    expect(toAnchors({ ...SETTINGS, time_zone: null, week_start: null, day_end: null })).toEqual({ timeZone: null, dayEndMinutes: null, weekStartsOn: null });
    expect(toAnchors(null)).toEqual({ timeZone: null, dayEndMinutes: null, weekStartsOn: null });
    expect(toAnchors({ ...SETTINGS, time_zone: '   ' }).timeZone).toBeNull();
  });
});

describe('target rows become engine targets, one kind at a time', () => {
  const g = goal('g');
  const spec = (t: TargetRead, stepIds: string[] = []) => toSpec(t, stepIds);

  it('a weekly count', () => {
    expect(spec(target('t', 'g'))).toEqual({
      measure: 'count',
      unit: null,
      role: 'effort',
      period: { kind: 'weekly' },
      levels: { floor: 3, aspiration: 5 },
      qualifyingThreshold: null,
      carryOver: 'habit',
      stepIds: null,
    });
  });

  it('a quantity keeps its own unit text', () => {
    expect(spec(target('t', 'g', { measure: 'quantity', unit: 'km', floor: 15, aspiration: 20 }))).toMatchObject({ measure: 'quantity', unit: 'km', levels: { floor: 15, aspiration: 20 } });
  });

  it('a time target, and a floor with no aspiration', () => {
    expect(spec(target('t', 'g', { measure: 'time', floor: 90, aspiration: null }))).toMatchObject({ measure: 'time', levels: { floor: 90, aspiration: null } });
  });

  it('day slots: the database’s Monday-is-1 weekdays become the engine’s', () => {
    expect(spec(target('t', 'g', { period_kind: 'day_slots', slot_weekdays: [1, 3, 7] })).period).toEqual({ kind: 'day_slots', days: [1, 3, 0] });
  });

  it('a deadline target carries its due date and its cumulative carry-over', () => {
    const s = spec(target('t', 'g', { period_kind: 'deadline', due_date: '2026-12-18', carry_over_kind: 'cumulative', floor: 15, aspiration: null }));
    expect(s).toMatchObject({ period: { kind: 'deadline', due: '2026-12-18' }, carryOver: 'cumulative' });
  });

  it('an outcome target with no number has no levels, and a qualifying threshold is kept', () => {
    expect(spec(target('t', 'g', { role: 'outcome', floor: null, aspiration: null })).levels).toBeNull();
    expect(spec(target('t', 'g', { qualifying_threshold: 20 })).qualifyingThreshold).toBe(20);
  });

  it('a checklist target takes the ids of the steps of the items that feed it, and no other measure does', () => {
    expect(spec(target('t', 'g', { measure: 'checklist', period_kind: 'deadline', due_date: '2026-12-18', carry_over_kind: 'cumulative' }), ['s1', 's2']).stepIds).toEqual(['s1', 's2']);
    expect(spec(target('t', 'g'), ['s1']).stepIds).toBeNull();
  });

  it('a target counts from its goal’s start date, and its block ends on the goal’s stored end date, never a computed one', () => {
    const ongoing = toScoreboardTarget(target('t', 'g'), goal('g', { start_date: '2026-10-05', end_date: null }), []);
    expect(ongoing.startsOn).toBe('2026-10-05');
    expect(ongoing.blockEndsOn).toBeNull();
    const finite = toScoreboardTarget(target('t', 'g'), goal('g', { shape: 'finite', start_date: '2026-10-05', end_date: '2026-12-13' }), []);
    expect(finite.blockEndsOn).toBe('2026-12-13');
    expect(finite.versions).toHaveLength(1);
    expect(finite.versions[0].effectiveFrom).toBe('2026-10-05');
  });

  it('a stored snapshot becomes the spec its closed period was judged by', () => {
    const snap = toSnapshot(
      { target_id: 't', period_start: '2026-10-12', period_end: '2026-10-18', measure: 'count', unit: null, role: 'effort', period_kind: 'weekly', slot_weekdays: null, floor: 2, aspiration: null, qualifying_threshold: null, carry_over_kind: 'habit' },
      [],
    );
    expect(snap).toMatchObject({ targetId: 't', periodStart: '2026-10-12', spec: { levels: { floor: 2, aspiration: null }, period: { kind: 'weekly' } } });
    expect(g.id).toBe('g');
  });
});

describe('entry rows become engine entries, with the person’s corrections applied', () => {
  const measures = new Map<string, TargetRead['measure']>([
    ['count', 'count'],
    ['quantity', 'quantity'],
    ['list', 'checklist'],
  ]);

  it('maps the stored value as it is: a quantity is the number, time is minutes, a tap is 1', () => {
    const [e] = toScoreboardEntries([entry('quantity', '2026-10-27', { value: 8.5 })], [], measures);
    expect(e).toMatchObject({ targetId: 'quantity', value: 8.5, removed: false, countAnyway: false, stepId: null });
  });

  it('reads a qualifying size from a synced workout’s duration, and from nothing else', () => {
    const [synced, manual] = toScoreboardEntries(
      [entry('count', '2026-10-27', { evidence: { provider: 'hevy', durationMinutes: 42 } }), entry('count', '2026-10-27', { evidence: { via: 'tap' } })],
      [],
      measures,
    );
    expect(synced.size).toBe(42);
    expect(manual.size).toBeNull();
  });

  it('a hide correction removes the entry and a count-anyway correction lifts the threshold, by the source’s record id', () => {
    const a = entry('count', '2026-10-27');
    const b = entry('count', '2026-10-27');
    const c = entry('count', '2026-10-27');
    const corrections: CorrectionRead[] = [
      { source_id: a.source_id, source_record_id: a.source_record_id, action: 'hide' },
      { source_id: b.source_id, source_record_id: b.source_record_id, action: 'count_anyway' },
    ];
    const [ea, eb, ec] = toScoreboardEntries([a, b, c], corrections, measures);
    expect([ea.removed, ea.countAnyway]).toEqual([true, false]);
    expect([eb.removed, eb.countAnyway]).toEqual([false, true]);
    expect([ec.removed, ec.countAnyway]).toEqual([false, false]);
  });

  it('one correction applies to every target the same source record was written for', () => {
    const a = entry('count', '2026-10-27', { source_record_id: 'workout-1' });
    const b = entry('quantity', '2026-10-27', { source_record_id: 'workout-1' });
    const out = toScoreboardEntries([a, b], [{ source_id: 'src', source_record_id: 'workout-1', action: 'hide' }], measures);
    expect(out.map((e) => e.removed)).toEqual([true, true]);
  });

  it('a correction on another source’s record with the same id changes nothing', () => {
    const a = entry('count', '2026-10-27', { source_record_id: 'r1' });
    const [out] = toScoreboardEntries([a], [{ source_id: 'another-source', source_record_id: 'r1', action: 'hide' }], measures);
    expect(out.removed).toBe(false);
  });

  it('a checklist tick carries its step id, which is its record id', () => {
    const [tick] = toScoreboardEntries([entry('list', '2026-10-27', { source_record_id: 'step-1' })], [], measures);
    expect(tick.stepId).toBe('step-1');
  });

  it('leaves out the entries of a target it was not asked about', () => {
    expect(toScoreboardEntries([entry('someone-elses-target', '2026-10-27')], [], measures)).toEqual([]);
  });
});

// A worked person: three goals like the ones the owner reviewed in the mock-up. Weeks are Monday to Sunday.
function worked(over: Partial<HomeRows> = {}): HomeRows {
  const g1 = goal('g1', { title: 'Get stronger' });
  const g2 = goal('g2', { title: 'Land the new role', shape: 'project', end_date: '2026-12-18' });
  const g3 = goal('g3', { title: 'Learn Spanish', start_date: '2026-10-27' });
  const targets = [
    target('workouts', 'g1', { title: 'Workouts' }),
    target('run', 'g1', { title: 'Long run', measure: 'quantity', unit: 'km', floor: 15, aspiration: 20 }),
    target('mobility', 'g1', { title: 'Mobility', period_kind: 'day_slots', slot_weekdays: [1, 3, 5], floor: 3, aspiration: null }),
    target('apps', 'g2', { title: 'Applications sent', floor: 5, aspiration: 7 }),
    target('interviews', 'g2', { title: 'Interviews', role: 'outcome', floor: null, aspiration: null }),
    target('spanish', 'g3', { title: 'Practice', measure: 'time', unit: 'min', floor: 90, aspiration: 150 }),
  ];
  const entries = [
    ...on('workouts', '2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12', '2026-10-13', '2026-10-15', '2026-10-17', '2026-10-20', '2026-10-22', '2026-10-25', '2026-10-26', '2026-10-28', '2026-10-29'),
    entry('run', '2026-10-06', { value: 5 }), entry('run', '2026-10-10', { value: 7 }), entry('run', '2026-10-14', { value: 10 }),
    entry('run', '2026-10-21', { value: 6 }), entry('run', '2026-10-24', { value: 8 }),
    entry('run', '2026-10-26', { value: 8 }), entry('run', '2026-10-28', { value: 7 }),
    ...on('mobility', '2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12', '2026-10-14', '2026-10-16', '2026-10-19', '2026-10-21', '2026-10-26', '2026-10-28'),
    ...on('apps', '2026-10-05', '2026-10-06', '2026-10-08', '2026-10-09', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-23', '2026-10-26', '2026-10-26', '2026-10-27', '2026-10-27', '2026-10-28', '2026-10-29'),
    ...on('interviews', '2026-10-15', '2026-10-21', '2026-10-23', '2026-10-28'),
    entry('spanish', '2026-10-27', { value: 25 }), entry('spanish', '2026-10-29', { value: 30 }),
  ];
  return rows({ goals: [g1, g2, g3], targets, entries, ...over });
}

describe('every number on a card is the engine’s, row by row', () => {
  const view = buildHomeScoreboard(worked(), NOW);

  it('a habit at its floor, with the pattern the closed weeks made', () => {
    expect(counted(card(view, 'g1', 'workouts'))).toMatchObject({ counted: 3, graded: true, level: 'floor', remainingToFloor: 0, remainingToAspiration: 2, floor: 3, aspiration: 5, pattern: { kind: 'holding', periods: 3 } });
  });

  it('a quantity sums the stored numbers in its own unit, and slipping is named for the closed weeks under the floor', () => {
    expect(counted(card(view, 'g1', 'run'))).toMatchObject({ counted: 15, unit: 'km', level: 'floor', remainingToAspiration: 5, pattern: { kind: 'slipping', periods: 3 } });
  });

  it('day slots show how many of the named days are filled and which days they named, in the person’s week order', () => {
    expect(counted(card(view, 'g1', 'mobility'))).toMatchObject({ counted: 2, level: 'partway', remainingToFloor: 1, slots: { filled: 2, total: 3, weekdays: [1, 3, 5] } });
  });

  it('a habit just past its floor says what is left to the aspiration', () => {
    expect(counted(card(view, 'g2', 'apps'))).toMatchObject({ counted: 6, level: 'floor', remainingToAspiration: 1 });
  });

  it('an outcome target is tracked and not judged: no level, no pattern, and its last closed weeks', () => {
    expect(counted(card(view, 'g2', 'interviews'))).toMatchObject({ counted: 1, graded: false, level: null, pattern: null, trend: { counts: [0, 1, 2], direction: 'up' } });
  });

  it('week days start on the person’s week start', () => {
    const sunday = buildHomeScoreboard(worked({ settings: { ...SETTINGS, week_start: 7 } }), NOW);
    const hero = ready(sunday).hero;
    expect(hero?.kind === 'week' && hero.start).toBe('2026-10-25');
    // The mobility target names Monday, Wednesday and Friday: in a week that starts on Sunday they come in that order.
    expect(counted(card(sunday, 'g1', 'mobility')).slots?.weekdays).toEqual([1, 3, 5]);
  });
});

describe('a target that started partway through its week is shown and not graded', () => {
  const view = buildHomeScoreboard(worked(), NOW);

  it('the engine gives it a level, and the card says it is not graded', () => {
    const c = counted(card(view, 'g3', 'spanish'));
    expect(c).toMatchObject({ counted: 55, startedPartway: true, graded: false });
    // Not graded, yet the engine's result carries a level: a card must key on `graded`, never on `level`.
    expect(c.level).toBe('partway');
  });

  it('has no holding or slipping line, and is not one of the floors in play', () => {
    expect(counted(card(view, 'g3', 'spanish')).pattern).toBeNull();
    const hero = ready(view).hero;
    expect(hero?.kind).toBe('week');
    if (hero?.kind === 'week') expect(hero.floorsInPlay).toBe(4);
  });
});

describe('the week hero', () => {
  const view = ready(buildHomeScoreboard(worked(), NOW));
  const hero = view.hero;
  if (hero?.kind !== 'week') throw new Error('expected the week hero');

  it('counts the floors met among the graded effort targets only', () => {
    // Workouts, long run and applications are at their floor; mobility is not. The outcome and the midweek start are out.
    expect([hero.floorsMet, hero.floorsInPlay]).toEqual([3, 4]);
  });

  it('is the person’s own week, with the entries that counted on each day and today marked', () => {
    expect(hero.start).toBe('2026-10-26');
    expect(hero.end).toBe('2026-11-01');
    expect(hero.days.map((d) => d.count)).toEqual([5, 3, 5, 3, 0, 0, 0]);
    expect(hero.days.map((d) => d.isToday)).toEqual([false, false, false, true, false, false, false]);
    expect(hero.days.map((d) => d.isFuture)).toEqual([false, false, false, false, true, true, true]);
    expect(hero.empty).toBe(false);
  });

  it('the headline is the week’s biggest crossing: the latest day', () => {
    expect(hero.headline).toEqual({ kind: 'floor', titles: ['Workouts'] });
  });

  it('is a calm empty state with no entries this week, and still not a percentage', () => {
    const quiet = ready(buildHomeScoreboard(worked({ entries: [] }), NOW)).hero;
    expect(quiet).toMatchObject({ kind: 'week', empty: true, headline: null, floorsMet: 0, floorsInPlay: 4 });
  });

  it('a step ticked on a milestone is a crossing too: named by the step’s own title, and the headline when it is the latest', () => {
    // A weekly habit reaches its floor on Wednesday; a checklist step is ticked on Thursday, the later day.
    const g = goal('g');
    const r = rows({
      goals: [g],
      targets: [
        target('w', 'g', { title: 'Workouts', floor: 1, aspiration: null }),
        target('list', 'g', { title: 'Prep', measure: 'checklist', period_kind: 'deadline', due_date: '2026-12-18', carry_over_kind: 'cumulative', floor: 2, aspiration: null }),
      ],
      items: [item('i', 'g', { target_id: 'list', title: 'Prep the talk' })],
      steps: [step('s1', 'i', { title: 'Write the case studies' }), step('s2', 'i', { title: 'Book the room', sort_order: 1 })],
      entries: [entry('w', '2026-10-28'), entry('list', '2026-10-29', { source_record_id: 's1' })],
    });
    const hero = ready(buildHomeScoreboard(r, NOW)).hero;
    expect(hero?.kind === 'week' && hero.headline).toEqual({ kind: 'step', titles: ['Write the case studies'] });
  });

  it('a hidden tick is no crossing: the step is not done', () => {
    const g = goal('g');
    const r = rows({
      goals: [g],
      targets: [target('list', 'g', { title: 'Prep', measure: 'checklist', period_kind: 'deadline', due_date: '2026-12-18', carry_over_kind: 'cumulative', floor: 1, aspiration: null }), target('w', 'g', { floor: 3, aspiration: null })],
      items: [item('i', 'g', { target_id: 'list' })],
      steps: [step('s1', 'i')],
      entries: [entry('list', '2026-10-29', { source_record_id: 's1' })],
      corrections: [{ source_id: 'src', source_record_id: 's1', action: 'hide' }],
    });
    const hero = ready(buildHomeScoreboard(r, NOW)).hero;
    expect(hero?.kind === 'week' && hero.headline).toBeNull();
  });
});

describe('a tie for the biggest crossing names every tied target, in title then id order, and picks none', () => {
  // Three habits that each reach their floor of 1 on the same Wednesday, listed in the order the database made them.
  const tied = (order: string[]) => {
    const g = goal('g');
    const make = (id: string, title: string) => target(id, 'g', { title, floor: 1, aspiration: null });
    const byId: Record<string, TargetRead> = { a: make('id-a', 'Workouts'), b: make('id-b', 'Long run'), c: make('id-c', 'Apples') };
    return rows({
      goals: [g],
      targets: order.map((k) => byId[k]),
      entries: ['id-a', 'id-b', 'id-c'].map((id) => entry(id, '2026-10-28')),
    });
  };

  it('names all three, sorted by title', () => {
    const hero = ready(buildHomeScoreboard(tied(['a', 'b', 'c']), NOW)).hero;
    expect(hero?.kind === 'week' && hero.headline).toEqual({ kind: 'floor', titles: ['Apples', 'Long run', 'Workouts'] });
  });

  it('is the same whatever order the rows come in', () => {
    const one = ready(buildHomeScoreboard(tied(['a', 'b', 'c']), NOW)).hero;
    const two = ready(buildHomeScoreboard(tied(['c', 'a', 'b']), NOW)).hero;
    expect(two).toEqual(one);
  });

  it('two with the same title come out in id order', () => {
    const g = goal('g');
    const r = rows({
      goals: [g],
      targets: [target('id-2', 'g', { title: 'Run', floor: 1, aspiration: null }), target('id-1', 'g', { title: 'Run', floor: 1, aspiration: null })],
      entries: [entry('id-2', '2026-10-28'), entry('id-1', '2026-10-28')],
    });
    const hero = ready(buildHomeScoreboard(r, NOW)).hero;
    expect(hero?.kind === 'week' && hero.headline?.titles).toEqual(['Run', 'Run']);
  });

  it('the bigger crossing on the same day wins over a floor', () => {
    const g = goal('g');
    const r = rows({
      goals: [g],
      targets: [target('floor', 'g', { title: 'Reading', floor: 1, aspiration: 3 }), target('asp', 'g', { title: 'Writing', floor: 1, aspiration: 2 })],
      entries: [entry('floor', '2026-10-28'), entry('asp', '2026-10-28'), entry('asp', '2026-10-28')],
    });
    const hero = ready(buildHomeScoreboard(r, NOW)).hero;
    expect(hero?.kind === 'week' && hero.headline).toEqual({ kind: 'aspiration', titles: ['Writing'] });
  });
});

describe('never assume: a target waits for the anchor it needs, and only that kind says so', () => {
  it('without a time zone nothing is graded and the person is asked for the time zone', () => {
    expect(buildHomeScoreboard(worked({ settings: { ...SETTINGS, time_zone: null } }), NOW)).toEqual({ state: 'needs_day_anchors', anchor: 'time_zone', reason: 'not_set' });
  });

  it('without a day end nothing is graded and the person is asked for the day end', () => {
    expect(buildHomeScoreboard(worked({ settings: { ...SETTINGS, day_end: null } }), NOW)).toEqual({ state: 'needs_day_anchors', anchor: 'day_end', reason: 'not_set' });
  });

  it('a time zone that is not a real one is invalid, and no default is put in its place', () => {
    expect(buildHomeScoreboard(worked({ settings: { ...SETTINGS, time_zone: 'Mars/Phobos' } }), NOW)).toEqual({ state: 'needs_day_anchors', anchor: 'time_zone', reason: 'invalid' });
  });

  it('with no settings row at all, the same: nothing is assumed about a person who has not been through setup', () => {
    expect(buildHomeScoreboard(worked({ settings: null }), NOW)).toMatchObject({ state: 'needs_day_anchors', anchor: 'time_zone' });
  });

  describe('no week start', () => {
    const noWeek = buildHomeScoreboard(worked({ settings: { ...SETTINGS, week_start: null } }), NOW);

    it('a weekly or day-slot target is shown with its levels and no count, and never graded', () => {
      for (const id of ['workouts', 'run', 'mobility', 'apps', 'interviews', 'spanish']) {
        const g = ready(noWeek).goals.flatMap((x) => x.targets).find((t) => t.id === id);
        expect(g?.status, id).toBe('needs_week_start');
      }
      expect(card(noWeek, 'g1', 'workouts')).toMatchObject({ status: 'needs_week_start', floor: 3, aspiration: 5 });
    });

    it('the hero asks for the week start, because this person has weekly targets, and shows no ring and no bars', () => {
      expect(ready(noWeek).hero).toEqual({ kind: 'needs_week_start' });
    });
  });

  describe('a person with only deadline goals is never asked for a week start', () => {
    const g = goal('g', { shape: 'project', end_date: '2026-12-18' });
    const only = (extra: Partial<HomeRows> = {}) =>
      rows({
        settings: { ...SETTINGS, week_start: null },
        goals: [g],
        targets: [target('list', 'g', { title: 'Prep', measure: 'checklist', period_kind: 'deadline', due_date: '2026-12-18', carry_over_kind: 'cumulative', floor: 2, aspiration: null })],
        items: [item('portfolio', 'g', { title: 'Portfolio ready', target_id: 'list', kind: 'deadline_task', due_date: '2026-11-20' }), item('prep', 'g', { title: 'Prep the talk', due_date: '2026-11-05' })],
        steps: [step('s1', 'portfolio', { title: 'Pick three projects' }), step('s2', 'portfolio', { title: 'Write them up', sort_order: 1 }), step('s3', 'prep', { title: 'Outline' })],
        entries: [entry('list', '2026-10-27', { source_record_id: 's1' })],
        ...extra,
      });

    it('the hero shows their milestones, nearest due date first, with no week-start prompt', () => {
      const hero = ready(buildHomeScoreboard(only(), NOW)).hero;
      expect(hero?.kind).toBe('deadlines');
      if (hero?.kind !== 'deadlines') return;
      expect(hero.items.map((m) => [m.title, m.dueOn, m.stepsDone, m.steps.length])).toEqual([
        ['Prep the talk', '2026-11-05', 0, 1],
        ['Portfolio ready', '2026-11-20', 1, 2],
      ]);
    });

    it('their deadline target is graded without a week start', () => {
      const view = buildHomeScoreboard(only({ goals: [g], items: [], steps: [] }), NOW);
      // With no milestone feeding it, the checklist target has no steps: it is tracked, not counted, never an error.
      expect(card(view, 'g', 'list').status).toBe('not_counted');
      const plain = buildHomeScoreboard(
        rows({ settings: { ...SETTINGS, week_start: null }, goals: [g], targets: [target('d', 'g', { title: 'Items', period_kind: 'deadline', due_date: '2026-12-18', carry_over_kind: 'cumulative', unit: null, measure: 'count', floor: 15, aspiration: null })], entries: on('d', '2026-10-27', '2026-10-28') }),
        NOW,
      );
      expect(counted(card(plain, 'g', 'd'))).toMatchObject({ counted: 2, graded: true, level: 'partway' });
      expect(ready(plain).hero).toBeNull();
    });

    it('no card says it needs a week start', () => {
      const view = ready(buildHomeScoreboard(only(), NOW));
      expect(JSON.stringify(view)).not.toContain('needs_week_start');
    });

    it('a checklist target a milestone feeds is shown as that milestone, with its steps and its due date', () => {
      const view = ready(buildHomeScoreboard(only(), NOW));
      expect(view.goals[0].targets).toEqual([]);
      const portfolio = view.goals[0].milestones.find((m) => m.title === 'Portfolio ready');
      expect(portfolio).toMatchObject({ dueOn: '2026-11-20', stepsDone: 1, steps: [{ id: 's1', done: true }, { id: 's2', done: false }] });
    });

    it('a milestone has no forecast verdict: it shows steps and the due date only', () => {
      const m = ready(buildHomeScoreboard(only(), NOW)).goals[0].milestones[0];
      expect(Object.keys(m).sort()).toEqual(['dueOn', 'goalId', 'goalTitle', 'id', 'kind', 'steps', 'stepsDone', 'title']);
    });
  });
});

describe('what is shown when there is nothing to grade', () => {
  it('no goals, or only a parked one, is no_goals', () => {
    expect(buildHomeScoreboard(rows(), NOW)).toEqual({ state: 'no_goals' });
    expect(buildHomeScoreboard(rows({ goals: [goal('g', { state: 'parked' })] }), NOW)).toEqual({ state: 'no_goals' });
  });

  it('a goal with no targets and no milestones still has its card, and no hero', () => {
    const view = ready(buildHomeScoreboard(rows({ goals: [goal('g', { title: 'Someday' })] }), NOW));
    expect(view.hero).toBeNull();
    expect(view.goals).toEqual([{ id: 'g', title: 'Someday', shape: 'ongoing', targets: [], milestones: [] }]);
  });

  it('a target whose goal starts after today is not started, never a miss', () => {
    const r = rows({ goals: [goal('g', { start_date: '2026-11-09' })], targets: [target('t', 'g')] });
    expect(card(buildHomeScoreboard(r, NOW), 'g', 't')).toMatchObject({ status: 'not_started', startsOn: '2026-11-09' });
  });

  it('a target set up so the engine cannot judge it is tracked, not counted, and the page still loads', () => {
    const g = goal('g');
    const r = rows({
      goals: [g],
      targets: [
        // A habit with a deadline period, and a checklist with no steps yet: neither is stopped by the database.
        target('habit-deadline', 'g', { period_kind: 'deadline', due_date: '2026-12-18', carry_over_kind: 'habit' }),
        target('empty-list', 'g', { measure: 'checklist', period_kind: 'deadline', due_date: '2026-12-18', carry_over_kind: 'cumulative' }),
        target('fine', 'g'),
      ],
      entries: on('fine', '2026-10-28'),
    });
    const view = buildHomeScoreboard(r, NOW);
    expect(card(view, 'g', 'habit-deadline').status).toBe('not_counted');
    expect(card(view, 'g', 'empty-list').status).toBe('not_counted');
    expect(counted(card(view, 'g', 'fine')).counted).toBe(1);
  });
});

describe('a person’s corrections beat any source', () => {
  it('a hidden entry is not counted, and a hidden tick un-ticks its step', () => {
    const g = goal('g', { shape: 'project', end_date: '2026-12-18' });
    const tick = entry('list', '2026-10-27', { source_record_id: 's1' });
    const base = rows({
      goals: [g],
      targets: [target('list', 'g', { measure: 'checklist', period_kind: 'deadline', due_date: '2026-12-18', carry_over_kind: 'cumulative', floor: 1, aspiration: null }), target('w', 'g', { floor: 1, aspiration: null })],
      items: [item('i', 'g', { target_id: 'list', due_date: '2026-11-20' })],
      steps: [step('s1', 'i')],
      entries: [tick, entry('w', '2026-10-28', { source_record_id: 'w1' })],
    });
    const open = ready(buildHomeScoreboard(base, NOW));
    expect(open.goals[0].milestones[0].stepsDone).toBe(1);
    expect(counted(open.goals[0].targets[0]).counted).toBe(1);

    const hidden = ready(buildHomeScoreboard({ ...base, corrections: [{ source_id: 'src', source_record_id: 's1', action: 'hide' }, { source_id: 'src', source_record_id: 'w1', action: 'hide' }] }, NOW));
    expect(hidden.goals[0].milestones[0].stepsDone).toBe(0);
    expect(counted(hidden.goals[0].targets[0]).counted).toBe(0);
  });

  it('an entry below the person’s qualifying threshold is kept and shown as below, until they count it anyway', () => {
    const g = goal('g');
    const t = target('w', 'g', { floor: 1, aspiration: null, qualifying_threshold: 20 });
    const small = entry('w', '2026-10-28', { evidence: { durationMinutes: 10 } });
    const base = rows({ goals: [g], targets: [t], entries: [small] });
    expect(counted(card(buildHomeScoreboard(base, NOW), 'g', 'w'))).toMatchObject({ counted: 0, belowThreshold: 1 });
    const lifted = buildHomeScoreboard({ ...base, corrections: [{ source_id: small.source_id, source_record_id: small.source_record_id, action: 'count_anyway' }] }, NOW);
    expect(counted(card(lifted, 'g', 'w'))).toMatchObject({ counted: 1, belowThreshold: 0 });
  });
});

describe('how Momentum talks: the person’s stored choice, or the code’s starting value', () => {
  it('uses the stored tone and celebration setting when the person chose them', () => {
    const view = ready(buildHomeScoreboard(worked({ settings: { ...SETTINGS, tone: 'gentle', celebrations: 'big' } }), NOW));
    expect([view.tone, view.celebration]).toEqual(['gentle', 'big']);
  });

  it('falls back to the defaults, kept in one place, when they have not chosen', () => {
    const view = ready(buildHomeScoreboard(worked(), NOW));
    expect([view.tone, view.celebration]).toEqual([DEFAULT_TONE, DEFAULT_CELEBRATION]);
  });

  // The literal values, from DOMAIN_MODEL §4.1: a null setting means not chosen yet, and the default there is low-key
  // celebrations and a middle tone. Written out so a change to the defaults file cannot quietly change what they mean.
  it('a null celebrations setting is low-key and a null tone is middle (§4.1)', () => {
    const view = ready(buildHomeScoreboard(worked({ settings: { ...SETTINGS, tone: null, celebrations: null } }), NOW));
    expect(view.celebration).toBe('low_key');
    expect(view.tone).toBe('middle');
  });

  it('no settings row at all is the same, with the anchors asked for first', () => {
    expect(buildHomeScoreboard(worked({ settings: null }), NOW).state).toBe('needs_day_anchors');
  });

  it('a chosen celebrations setting is never replaced by the default', () => {
    for (const level of ['low_key', 'medium', 'big'] as const) {
      expect(ready(buildHomeScoreboard(worked({ settings: { ...SETTINGS, celebrations: level } }), NOW)).celebration).toBe(level);
    }
  });
});

describe('goals and targets come in the order the database made them, not an order of importance', () => {
  it('lists goals, then targets, by creation, then id', () => {
    const view = ready(buildHomeScoreboard(worked(), NOW));
    expect(view.goals.map((g) => g.id)).toEqual(['g1', 'g2', 'g3']);
    expect(view.goals[0].targets.map((t) => t.id)).toEqual(['workouts', 'run', 'mobility']);
  });
});
