// Service-layer invariants for lib/services/entries.ts (MOM-110), run against the in-memory goal model fake
// (tests/helpers/fakeEntriesModel.ts):
// - the four ways to log each write one entry the person made, at the server's clock, on their own manual source,
// - removing is a hide correction and restoring deletes it; un-ticking and re-ticking do the same for a step, and the
//   entry row is never edited (the owner's decision, 2026-10-26),
// - logging refuses without a real time zone and never defaults one (principle 1),
// - a log can be dated on a chosen day (today and the 7 before it, read in the person's time zone and day end),
//   typed minutes are whole minutes, and an entry before its goal's start date is saved with a notice (MOM-110 part 2),
// - a late entry in a closed week counts the next time the week is computed and changes no snapshot,
// - one person never reads or writes another's rows, and a synced entry is not changed here (principle 3, MOM-109).
// The database side of the same rules (RLS, grants, constraints) is covered by supabase/verify/013_goal_model_tables.sql.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluateTarget, snapshotPeriod } from '@/lib/engine';
import {
  BAD_TIME_ZONE,
  DAY_IN_FUTURE,
  DAY_TOO_OLD,
  MAX_MINUTES,
  MAX_QUANTITY,
  NOT_A_DATE,
  NO_DAY_END,
  NO_TIME_ZONE,
  TIMER_HAS_NO_DAY,
  dayEndMinutesOf,
  getLogPanel,
  isRealTimeZone,
  logMinutes,
  logNumber,
  logTap,
  logTimer,
  removeEntry,
  resolveOccurredAt,
  restoreEntry,
  tickStep,
  untickStep,
} from '@/lib/services/entries';
import type { ScoreboardEntry } from '@/types/scoreboard';
import { anchors as engineAnchors, target as engineTarget } from './helpers/engineFixtures';
import { ME, OTHER, add, goalRow, gm, itemRow, newId, resetGoalModel, settingsRow, stepRow, targetRow } from './helpers/fakeEntriesModel';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeEntriesModel');
  return { createSupabaseServerClient };
});

const NOW = Date.UTC(2026, 9, 27, 15, 30, 0);
const now = () => NOW;
const at = { now };
const iso = (ms: number) => new Date(ms).toISOString();

// One signed-in person with a time zone and a day end (22:00, so the day boundary is midnight), an active goal, a
// target of each measure, and a checklist item with two steps. `goalStart` moves the goal's start date.
function world(userId = ME, timeZone: string | null = 'America/Los_Angeles', dayEnd: string | null = '22:00:00', goalStart?: string) {
  if (timeZone !== null) add('person_settings', settingsRow(userId, timeZone, dayEnd));
  const goal = goalRow(userId, goalStart === undefined ? {} : { start_date: goalStart });
  add('goals', goal);
  const targets = {
    count: targetRow(userId, goal.id, 'count', { title: 'Workouts' }),
    quantity: targetRow(userId, goal.id, 'quantity', { title: 'Distance' }),
    time: targetRow(userId, goal.id, 'time', { title: 'Study time' }),
    checklist: targetRow(userId, goal.id, 'checklist', { title: 'Prep' }),
  };
  for (const t of Object.values(targets)) add('targets', t);
  const item = itemRow(userId, goal.id, targets.checklist.id);
  add('work_items', item);
  const steps = [stepRow(userId, item.id, { title: 'Read the brief', sort_order: 0 }), stepRow(userId, item.id, { title: 'Book the room', sort_order: 1 })];
  for (const s of steps) add('work_item_steps', s);
  return { goal, targets, item, steps };
}

const id = (row: Record<string, unknown>) => row.id as string;
const entries = () => gm.tables.entries;
const corrections = () => gm.tables.entry_corrections;
const manualSources = () => gm.tables.sources.filter((s) => s.kind === 'manual');
const stepNow = (stepId: string) => gm.tables.work_item_steps.find((s) => s.id === stepId) as Record<string, unknown>;

beforeEach(() => resetGoalModel({ id: ME }));

describe('a tap on a count target', () => {
  it('writes one entry of 1 at the server clock, on a manual source made on first use', async () => {
    const { targets } = world();
    const r = await logTap(id(targets.count), at);
    expect(r.ok).toBe(true);

    expect(entries()).toHaveLength(1);
    expect(entries()[0]).toMatchObject({
      user_id: ME,
      target_id: id(targets.count),
      value: 1,
      occurred_at: iso(NOW),
      evidence: { via: 'tap' },
      work_item_id: null,
    });
    expect(manualSources()).toHaveLength(1);
    expect(manualSources()[0]).toMatchObject({ user_id: ME, kind: 'manual', provider: null });
    expect(entries()[0].source_id).toBe(id(manualSources()[0]));
  });

  it('gives each tap its own record id and reuses the one manual source', async () => {
    const { targets } = world();
    await logTap(id(targets.count), at);
    await logTap(id(targets.count), at);
    expect(entries()).toHaveLength(2);
    expect(new Set(entries().map((e) => e.source_record_id)).size).toBe(2);
    expect(manualSources()).toHaveLength(1);
  });

  it('writes only entries and the manual source: it never binds a source to a target', async () => {
    const { targets } = world();
    await logTap(id(targets.count), at);
    expect([...new Set(gm.writes.map((w) => w.table))].sort()).toEqual(['entries', 'sources']);
  });

  it('refuses a tap on a target that is not a count, and says how it is logged', async () => {
    const { targets } = world();
    const r = await logTap(id(targets.quantity), at);
    expect(r).toEqual({ ok: false, error: 'That target is logged with one number.' });
    expect(entries()).toHaveLength(0);
    expect(manualSources()).toHaveLength(0);
  });
});

describe('one number on a quantity target', () => {
  it('stores the number as typed', async () => {
    const { targets } = world();
    const r = await logNumber(id(targets.quantity), 12.5, at);
    expect(r.ok).toBe(true);
    expect(entries()[0]).toMatchObject({ value: 12.5, evidence: { via: 'number' }, occurred_at: iso(NOW) });
  });

  it.each([0, -3, Number.NaN, Number.POSITIVE_INFINITY, '12', null, undefined, {}, MAX_QUANTITY + 1])(
    'refuses %s and writes nothing',
    async (value) => {
      const { targets } = world();
      const r = await logNumber(id(targets.quantity), value, at);
      expect(r.ok).toBe(false);
      expect(entries()).toHaveLength(0);
      expect(gm.writes).toHaveLength(0);
    },
  );

  it('accepts the largest allowed number', async () => {
    const { targets } = world();
    expect((await logNumber(id(targets.quantity), MAX_QUANTITY, at)).ok).toBe(true);
  });
});

describe('a timer on a time target', () => {
  const stopAfterMinutes = (minutes: number) => iso(NOW - minutes * 60_000);

  it('logs the whole minutes between the start and the server clock, and keeps both instants', async () => {
    const { targets } = world();
    const r = await logTimer(id(targets.time), stopAfterMinutes(25), at);
    expect(r.ok).toBe(true);
    expect(entries()[0]).toMatchObject({
      value: 25,
      occurred_at: iso(NOW),
      evidence: { via: 'timer', startedAt: stopAfterMinutes(25), stoppedAt: iso(NOW) },
    });
  });

  it('rounds to the nearest minute, and 30 seconds is the shortest it logs', async () => {
    const { targets } = world();
    await logTimer(id(targets.time), iso(NOW - 90_000), at);
    await logTimer(id(targets.time), iso(NOW - 30_000), at);
    expect(entries().map((e) => e.value)).toEqual([2, 1]);
  });

  it('refuses a timer under 30 seconds, over 24 hours, in the future, or with no valid start', async () => {
    const { targets } = world();
    const t = id(targets.time);
    expect(await logTimer(t, iso(NOW - 29_000), at)).toEqual({ ok: false, error: 'That timer ran under 30 seconds, so it was not logged.' });
    expect(await logTimer(t, iso(NOW - 24 * 3_600_000 - 1000), at)).toEqual({
      ok: false,
      error: 'That timer ran for more than 24 hours, so it was not logged.',
    });
    expect((await logTimer(t, iso(NOW + 60_000), at)).ok).toBe(false);
    expect((await logTimer(t, 'yesterday-ish', at)).ok).toBe(false);
    expect((await logTimer(t, 12345, at)).ok).toBe(false);
    expect((await logTimer(t, undefined, at)).ok).toBe(false);
    expect(entries()).toHaveLength(0);
  });

  it('refuses a timer on a target that is not a time target', async () => {
    const { targets } = world();
    expect((await logTimer(id(targets.count), stopAfterMinutes(10), at)).ok).toBe(false);
  });
});

describe('a checklist tick', () => {
  it('writes one entry whose record id is the step id, tied to the item, and marks the step for display', async () => {
    const { targets, item, steps } = world();
    const r = await tickStep(id(steps[0]), at);
    expect(r.ok).toBe(true);
    expect(entries()).toHaveLength(1);
    expect(entries()[0]).toMatchObject({
      target_id: id(targets.checklist),
      source_record_id: id(steps[0]),
      work_item_id: id(item),
      value: 1,
      occurred_at: iso(NOW),
      evidence: { via: 'tick', step: 'Read the brief' },
    });
    expect(stepNow(id(steps[0]))).toMatchObject({ completed_at: iso(NOW), completed_via: 'person' });
    expect(stepNow(id(steps[1]))).toMatchObject({ completed_at: null, completed_via: null });
  });

  it('ticking a ticked step changes nothing', async () => {
    const { steps } = world();
    await tickStep(id(steps[0]), at);
    await tickStep(id(steps[0]), at);
    expect(entries()).toHaveLength(1);
    expect(corrections()).toHaveLength(0);
  });

  it('un-ticking hides the entry with a correction, keeps the entry, and clears the display marker', async () => {
    const { steps } = world();
    await tickStep(id(steps[0]), at);
    const before = { ...entries()[0] };
    const r = await untickStep(id(steps[0]), at);

    expect(r.ok).toBe(true);
    expect(corrections()).toHaveLength(1);
    expect(corrections()[0]).toMatchObject({
      user_id: ME,
      source_id: before.source_id,
      source_record_id: id(steps[0]),
      action: 'hide',
    });
    expect(entries()).toHaveLength(1);
    expect(entries()[0]).toEqual(before);
    expect(stepNow(id(steps[0]))).toMatchObject({ completed_at: null, completed_via: null });
  });

  it('ticking again takes the hide off and makes no second entry, so the entry keeps its first time', async () => {
    const { steps } = world();
    await tickStep(id(steps[0]), at);
    await untickStep(id(steps[0]), at);
    const later = await tickStep(id(steps[0]), { now: () => NOW + 3_600_000 });

    expect(later.ok).toBe(true);
    expect(corrections()).toHaveLength(0);
    expect(entries()).toHaveLength(1);
    expect(entries()[0].occurred_at).toBe(iso(NOW));
    expect(stepNow(id(steps[0]))).toMatchObject({ completed_via: 'person' });
  });

  it('un-ticking twice leaves one hide; un-ticking a step never ticked is refused', async () => {
    const { steps } = world();
    expect((await untickStep(id(steps[1]), at)).ok).toBe(false);
    await tickStep(id(steps[0]), at);
    await untickStep(id(steps[0]), at);
    expect((await untickStep(id(steps[0]), at)).ok).toBe(true);
    expect(corrections()).toHaveLength(1);
  });

  it('a step whose item feeds no target, or a target that is not a checklist, cannot be ticked', async () => {
    const { goal, targets } = world();
    const loose = itemRow(ME, goal.id, null, { title: 'Loose milestone' });
    add('work_items', loose);
    const looseStep = stepRow(ME, loose.id);
    add('work_item_steps', looseStep);
    const wrong = itemRow(ME, goal.id, targets.count.id, { title: 'Wrong target' });
    add('work_items', wrong);
    const wrongStep = stepRow(ME, wrong.id);
    add('work_item_steps', wrongStep);

    const expected = { ok: false, error: "This item isn't feeding a checklist target yet." };
    expect(await tickStep(id(looseStep), at)).toEqual(expected);
    expect(await tickStep(id(wrongStep), at)).toEqual(expected);
    expect(entries()).toHaveLength(0);
  });

  it('the display marker failing does not fail the tick: the entry is the truth', async () => {
    const { steps } = world();
    gm.failNextWrite = { table: 'work_item_steps', message: 'could not update the step' };
    const r = await tickStep(id(steps[0]), at);
    expect(r.ok).toBe(true);
    expect(entries()).toHaveLength(1);
    expect(stepNow(id(steps[0]))).toMatchObject({ completed_at: null });
  });
});

describe('remove and restore', () => {
  it('removing hides the entry with a correction keyed to its record, and leaves the entry untouched', async () => {
    const { targets } = world();
    await logTap(id(targets.count), at);
    const entry = { ...entries()[0] };

    const r = await removeEntry(entry.id, at);
    expect(r).toEqual({ ok: true, data: { entryId: entry.id } });
    expect(corrections()).toHaveLength(1);
    expect(corrections()[0]).toMatchObject({ source_id: entry.source_id, source_record_id: entry.source_record_id, action: 'hide' });
    expect(entries()).toEqual([entry]);
  });

  it('restoring deletes the hide, and removing then restoring leaves everything as it was', async () => {
    const { targets } = world();
    await logTap(id(targets.count), at);
    const entry = { ...entries()[0] };
    await removeEntry(entry.id, at);
    const r = await restoreEntry(entry.id, at);

    expect(r.ok).toBe(true);
    expect(corrections()).toHaveLength(0);
    expect(entries()).toEqual([entry]);
  });

  it('removing twice leaves one hide, and restoring something never removed is harmless', async () => {
    const { targets } = world();
    await logTap(id(targets.count), at);
    const entry = entries()[0];
    expect((await restoreEntry(entry.id, at)).ok).toBe(true);
    await removeEntry(entry.id, at);
    expect((await removeEntry(entry.id, at)).ok).toBe(true);
    expect(corrections()).toHaveLength(1);
  });

  it('removing a tick is un-ticking it, and restoring it is ticking again, markers included', async () => {
    const { steps } = world();
    await tickStep(id(steps[0]), at);
    const entry = entries()[0];

    await removeEntry(entry.id, at);
    expect(corrections()).toHaveLength(1);
    expect(stepNow(id(steps[0]))).toMatchObject({ completed_at: null });

    await restoreEntry(entry.id, at);
    expect(corrections()).toHaveLength(0);
    expect(stepNow(id(steps[0]))).toMatchObject({ completed_at: iso(NOW), completed_via: 'person' });
  });

  it('turns a count-anyway into a hide when the person removes the entry', async () => {
    const { targets } = world();
    await logTap(id(targets.count), at);
    const entry = entries()[0];
    add('entry_corrections', { id: newId(), user_id: ME, source_id: entry.source_id, source_record_id: entry.source_record_id, action: 'count_anyway' });
    await removeEntry(entry.id, at);
    expect(corrections()).toHaveLength(1);
    expect(corrections()[0].action).toBe('hide');
  });

  it('does not change an entry from a synced source: those are corrected where they sync', async () => {
    const { targets } = world();
    const synced = add('sources', { id: newId(), user_id: ME, kind: 'synced', provider: 'hevy', label: 'Hevy', created_at: 'x' });
    const entry = add('entries', {
      id: newId(),
      user_id: ME,
      target_id: targets.count.id,
      source_id: synced.id,
      source_record_id: 'w1',
      work_item_id: null,
      occurred_at: iso(NOW),
      value: 1,
      evidence: {},
    });
    expect(await removeEntry(id(entry), at)).toEqual({ ok: false, error: 'Only entries you logged yourself can be changed here.' });
    expect(await restoreEntry(id(entry), at)).toEqual({ ok: false, error: 'Only entries you logged yourself can be changed here.' });
    expect(corrections()).toHaveLength(0);
  });
});

describe('the time zone', () => {
  const everyLog = (w: ReturnType<typeof world>) => [
    () => logTap(id(w.targets.count), at),
    () => logNumber(id(w.targets.quantity), 5, at),
    () => logTimer(id(w.targets.time), iso(NOW - 600_000), at),
    () => tickStep(id(w.steps[0]), at),
  ];

  it.each([
    ['not saved at all (no settings row yet)', () => undefined, NO_TIME_ZONE],
    ['saved as nothing', () => add('person_settings', settingsRow(ME, null)), NO_TIME_ZONE],
    ['saved as something that is not a real zone', () => add('person_settings', settingsRow(ME, 'Mars/Olympus_Mons')), BAD_TIME_ZONE],
  ])('refuses every way of logging when it is %s, and writes nothing', async (_label, setSettings, message) => {
    const w = world(ME, null);
    setSettings();
    for (const log of everyLog(w)) {
      expect(await log()).toEqual({ ok: false, error: message });
    }
    expect(gm.writes).toHaveLength(0);
    expect(manualSources()).toHaveLength(0);
  });

  it('does not stop a person removing, restoring or un-ticking what they already logged', async () => {
    const w = world();
    await logTap(id(w.targets.count), at);
    await tickStep(id(w.steps[0]), at);
    gm.tables.person_settings = [];

    const tap = entries().find((e) => e.target_id === w.targets.count.id) as Record<string, unknown>;
    expect((await removeEntry(tap.id, at)).ok).toBe(true);
    expect((await restoreEntry(tap.id, at)).ok).toBe(true);
    expect((await untickStep(id(w.steps[0]), at)).ok).toBe(true);
  });

  it('knows a real zone from an invented one', () => {
    expect(isRealTimeZone('America/Los_Angeles')).toBe(true);
    expect(isRealTimeZone('UTC')).toBe(true);
    expect(isRealTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(isRealTimeZone('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// MOM-110 part 2: the day it happened, typed minutes, and the start date
// ---------------------------------------------------------------------------

// NOW is Tuesday 2026-10-27, 08:30 in Los Angeles (daylight time, UTC-7). With a 22:00 day end the day boundary is
// midnight, so today is 2026-10-27 and the window runs back to 2026-10-20. Noon on a chosen day is 19:00 UTC.
const LA = 'America/Los_Angeles';
const noon = (date: string) => `${date}T19:00:00.000Z`;
const context = (over: Partial<{ nowMs: number; dayEndMinutes: number | null }> = {}) => ({
  nowMs: NOW,
  timeZone: LA,
  dayEndMinutes: 1320 as number | null,
  ...over,
});

describe('resolveOccurredAt', () => {
  it('gives now as the server clock, with the local day it falls on and no chosen day', () => {
    expect(resolveOccurredAt(undefined, context())).toEqual({
      ok: true,
      data: { occurredAt: iso(NOW), day: '2026-10-27', chosenDay: null },
    });
  });

  it('gives now with no local day when the day end is not set, and assumes none', () => {
    expect(resolveOccurredAt(undefined, context({ dayEndMinutes: null }))).toEqual({
      ok: true,
      data: { occurredAt: iso(NOW), day: null, chosenDay: null },
    });
  });

  it("takes today's date as now, not as noon", () => {
    expect(resolveOccurredAt('2026-10-27', context())).toEqual({
      ok: true,
      data: { occurredAt: iso(NOW), day: '2026-10-27', chosenDay: null },
    });
  });

  it('puts an earlier day at noon on that day in the person’s zone, back to 7 days', () => {
    expect(resolveOccurredAt('2026-10-26', context())).toEqual({
      ok: true,
      data: { occurredAt: noon('2026-10-26'), day: '2026-10-26', chosenDay: '2026-10-26' },
    });
    expect(resolveOccurredAt('2026-10-20', context())).toEqual({
      ok: true,
      data: { occurredAt: noon('2026-10-20'), day: '2026-10-20', chosenDay: '2026-10-20' },
    });
  });

  it('refuses a day in the future, one older than 7 days, and anything that is not a real date', () => {
    expect(resolveOccurredAt('2026-10-28', context())).toEqual({ ok: false, error: DAY_IN_FUTURE });
    expect(resolveOccurredAt('2026-10-19', context())).toEqual({ ok: false, error: DAY_TOO_OLD });
    for (const bad of ['2026-02-30', '2026-13-01', '2026-10-5', 'yesterday', '10/25/2026', '', 20261025, null, {}, true]) {
      expect(resolveOccurredAt(bad, context())).toEqual({ ok: false, error: NOT_A_DATE });
    }
  });

  it('refuses a chosen day until a day end is set, but still calls garbage garbage', () => {
    expect(resolveOccurredAt('2026-10-26', context({ dayEndMinutes: null }))).toEqual({ ok: false, error: NO_DAY_END });
    expect(resolveOccurredAt('nonsense', context({ dayEndMinutes: null }))).toEqual({ ok: false, error: NOT_A_DATE });
  });

  it('reads the 7-day edge in the person’s zone, not UTC', () => {
    // 03:30 UTC on Oct 28 is still the evening of Oct 27 in Los Angeles.
    const lateEvening = context({ nowMs: Date.UTC(2026, 9, 28, 3, 30) });
    expect(resolveOccurredAt('2026-10-28', lateEvening)).toEqual({ ok: false, error: DAY_IN_FUTURE });
    expect(resolveOccurredAt('2026-10-27', lateEvening).ok).toBe(true);
    expect(resolveOccurredAt('2026-10-20', lateEvening).ok).toBe(true);
    expect(resolveOccurredAt('2026-10-19', lateEvening)).toEqual({ ok: false, error: DAY_TOO_OLD });
  });

  it('moves today with an early day end: at 01:30 with a 02:00 day end it is still yesterday', () => {
    // 08:30 UTC on Oct 28 is 01:30 in Los Angeles.
    const early = context({ nowMs: Date.UTC(2026, 9, 28, 8, 30), dayEndMinutes: 120 });
    expect(resolveOccurredAt(undefined, early)).toMatchObject({ ok: true, data: { day: '2026-10-27' } });
    expect(resolveOccurredAt('2026-10-28', early)).toEqual({ ok: false, error: DAY_IN_FUTURE });
    expect(resolveOccurredAt('2026-10-27', early)).toMatchObject({ ok: true, data: { chosenDay: null, day: '2026-10-27' } });
    expect(resolveOccurredAt('2026-10-26', early)).toMatchObject({ ok: true, data: { chosenDay: '2026-10-26' } });
    expect(resolveOccurredAt('2026-10-20', early).ok).toBe(true);
    expect(resolveOccurredAt('2026-10-19', early)).toEqual({ ok: false, error: DAY_TOO_OLD });

    // The same instant with an evening day end is Oct 28 already.
    const evening = context({ nowMs: Date.UTC(2026, 9, 28, 8, 30), dayEndMinutes: 1320 });
    expect(resolveOccurredAt(undefined, evening)).toMatchObject({ ok: true, data: { day: '2026-10-28' } });
  });

  it('reads a day end column as minutes after midnight, and nothing else as a day end', () => {
    expect(dayEndMinutesOf('22:00:00')).toBe(1320);
    expect(dayEndMinutesOf('02:00')).toBe(120);
    expect(dayEndMinutesOf('00:00:00')).toBe(0);
    for (const bad of [null, '', 'late', '25:00:00', '12:60:00']) expect(dayEndMinutesOf(bad)).toBeNull();
  });
});

describe('logging on a chosen day', () => {
  const on = (when: unknown) => ({ now, when });

  it('puts a tap, a number, typed minutes and a first tick on the chosen day at noon, and records the day', async () => {
    const w = world();
    expect((await logTap(id(w.targets.count), on('2026-10-26'))).ok).toBe(true);
    expect((await logNumber(id(w.targets.quantity), 5, on('2026-10-25'))).ok).toBe(true);
    expect((await logMinutes(id(w.targets.time), 40, on('2026-10-24'))).ok).toBe(true);
    expect((await tickStep(id(w.steps[0]), on('2026-10-23'))).ok).toBe(true);

    const byTarget = (target: Record<string, unknown>) => entries().find((e) => e.target_id === target.id) as Record<string, unknown>;
    expect(byTarget(w.targets.count)).toMatchObject({ occurred_at: noon('2026-10-26'), evidence: { via: 'tap', chosenDay: '2026-10-26' } });
    expect(byTarget(w.targets.quantity)).toMatchObject({ occurred_at: noon('2026-10-25'), value: 5, evidence: { via: 'number', chosenDay: '2026-10-25' } });
    expect(byTarget(w.targets.time)).toMatchObject({ occurred_at: noon('2026-10-24'), value: 40, evidence: { via: 'minutes', chosenDay: '2026-10-24' } });
    expect(byTarget(w.targets.checklist)).toMatchObject({
      occurred_at: noon('2026-10-23'),
      evidence: { via: 'tick', step: 'Read the brief', chosenDay: '2026-10-23' },
    });
  });

  it('logs today’s own date as now, with no chosen day on the entry', async () => {
    const { targets } = world();
    await logTap(id(targets.count), on('2026-10-27'));
    expect(entries()[0]).toMatchObject({ occurred_at: iso(NOW), evidence: { via: 'tap' } });
    expect(entries()[0].evidence).not.toHaveProperty('chosenDay');
  });

  it('gives an ordinary log no chosen day', async () => {
    const { targets } = world();
    await logTap(id(targets.count), at);
    expect(entries()[0].evidence).toEqual({ via: 'tap' });
  });

  const everyLogOn = (w: ReturnType<typeof world>, when: unknown) => [
    () => logTap(id(w.targets.count), { now, when }),
    () => logNumber(id(w.targets.quantity), 5, { now, when }),
    () => logMinutes(id(w.targets.time), 30, { now, when }),
    () => tickStep(id(w.steps[0]), { now, when }),
  ];

  it.each([
    ['tomorrow', '2026-10-28', DAY_IN_FUTURE],
    ['8 days back', '2026-10-19', DAY_TOO_OLD],
    ['a day that does not exist', '2026-02-30', NOT_A_DATE],
    ['words', 'yesterday', NOT_A_DATE],
    ['a number', 20261025, NOT_A_DATE],
    ['null', null, NOT_A_DATE],
  ])('refuses %s on every way of logging, in words, and writes nothing', async (_label, when, message) => {
    const w = world();
    for (const log of everyLogOn(w, when)) expect(await log()).toEqual({ ok: false, error: message });
    expect(gm.writes).toHaveLength(0);
    expect(manualSources()).toHaveLength(0);
  });

  it('refuses a chosen day on every way of logging until a day end is set, but logging for now still works', async () => {
    const w = world(ME, LA, null);
    for (const log of everyLogOn(w, '2026-10-26')) expect(await log()).toEqual({ ok: false, error: NO_DAY_END });
    expect(gm.writes).toHaveLength(0);

    expect((await logTap(id(w.targets.count), at)).ok).toBe(true);
    expect(entries()).toHaveLength(1);
  });

  it('refuses a chosen day with no time zone, with the time zone message', async () => {
    const w = world(ME, null);
    for (const log of everyLogOn(w, '2026-10-26')) expect(await log()).toEqual({ ok: false, error: NO_TIME_ZONE });
    expect(gm.writes).toHaveLength(0);
  });

  it('takes no day on a timer, which logs the time that ran', async () => {
    const { targets } = world();
    expect(await logTimer(id(targets.time), iso(NOW - 600_000), on('2026-10-26'))).toEqual({ ok: false, error: TIMER_HAS_NO_DAY });
    expect(gm.writes).toHaveLength(0);
    expect((await logTimer(id(targets.time), iso(NOW - 600_000), at)).ok).toBe(true);
    expect(entries()[0]).toMatchObject({ value: 10, occurred_at: iso(NOW) });
  });

  it('keeps a step’s first time on a re-tick, and does not read a day sent with it', async () => {
    const { steps } = world();
    await tickStep(id(steps[0]), on('2026-10-22'));
    await untickStep(id(steps[0]), at);

    // A different day, and even one that would be refused, changes nothing on a re-tick.
    expect((await tickStep(id(steps[0]), on('2026-10-26'))).ok).toBe(true);
    expect(entries()).toHaveLength(1);
    expect(entries()[0]).toMatchObject({ occurred_at: noon('2026-10-22'), evidence: { chosenDay: '2026-10-22' } });
    expect(corrections()).toHaveLength(0);

    await untickStep(id(steps[0]), at);
    expect((await tickStep(id(steps[0]), on('nonsense'))).ok).toBe(true);
    expect(entries()).toHaveLength(1);
    expect(entries()[0].occurred_at).toBe(noon('2026-10-22'));
  });

  it('refuses a first tick on a bad day before anything is written', async () => {
    const { steps } = world();
    expect(await tickStep(id(steps[0]), on('2026-10-28'))).toEqual({ ok: false, error: DAY_IN_FUTURE });
    expect(gm.writes).toHaveLength(0);
    expect(manualSources()).toHaveLength(0);
  });
});

describe('typed minutes', () => {
  it('stores the whole minutes as typed, now, as the person’s own entry', async () => {
    const { targets } = world();
    const r = await logMinutes(id(targets.time), 45, at);
    expect(r.ok).toBe(true);
    expect(entries()).toHaveLength(1);
    expect(entries()[0]).toMatchObject({
      user_id: ME,
      target_id: id(targets.time),
      value: 45,
      occurred_at: iso(NOW),
      evidence: { via: 'minutes' },
    });
    expect(manualSources()).toHaveLength(1);
  });

  it('takes 1 and 1,440, and nothing in between is rounded', async () => {
    const { targets } = world();
    expect((await logMinutes(id(targets.time), 1, at)).ok).toBe(true);
    expect((await logMinutes(id(targets.time), MAX_MINUTES, at)).ok).toBe(true);
    expect(entries().map((e) => e.value)).toEqual([1, 1440]);
  });

  it.each([0, -5, 1.5, 0.4, Number.NaN, Number.POSITIVE_INFINITY, '45', null, undefined, {}])(
    'refuses %s in words and writes nothing',
    async (value) => {
      const { targets } = world();
      expect(await logMinutes(id(targets.time), value, at)).toEqual({ ok: false, error: 'Enter a whole number of minutes, 1 or more.' });
      expect(gm.writes).toHaveLength(0);
    },
  );

  it('refuses more than 24 hours, and says the limit is ours', async () => {
    const { targets } = world();
    const r = await logMinutes(id(targets.time), MAX_MINUTES + 1, at);
    expect(r).toEqual({ ok: false, error: 'That is more than 24 hours (1,440 minutes), so it was not logged. Check it and try again.' });
    expect(gm.writes).toHaveLength(0);
  });

  it('only logs on a time target, and says how the other one is logged', async () => {
    const { targets } = world();
    expect(await logMinutes(id(targets.count), 30, at)).toEqual({ ok: false, error: 'That target is logged with a tap.' });
    expect(await logMinutes(id(targets.quantity), 30, at)).toEqual({ ok: false, error: 'That target is logged with one number.' });
    expect(await logMinutes('not-a-uuid', 30, at)).toEqual({ ok: false, error: 'Target not found.' });
    expect(entries()).toHaveLength(0);
  });

  it('refuses with no time zone, like every other log', async () => {
    const { targets } = world(ME, null);
    expect(await logMinutes(id(targets.time), 30, at)).toEqual({ ok: false, error: NO_TIME_ZONE });
  });
});

describe('an entry before its goal’s start date', () => {
  // The goal starts on Monday 2026-10-26; NOW is Tuesday the 27th.
  const START = '2026-10-26';
  const NOTICE = "Saved. It's before this goal's start date (Oct 26), so it won't count unless you move the start date earlier.";
  const on = (when: unknown) => ({ now, when });

  it('saves a log on a chosen day before the start, and says so in words on every way of logging', async () => {
    const w = world(ME, LA, '22:00:00', START);
    const results = [
      await logTap(id(w.targets.count), on('2026-10-24')),
      await logNumber(id(w.targets.quantity), 5, on('2026-10-24')),
      await logMinutes(id(w.targets.time), 30, on('2026-10-24')),
      await tickStep(id(w.steps[0]), on('2026-10-24')),
    ];
    for (const r of results) expect(r).toMatchObject({ ok: true, data: { notice: NOTICE } });
    expect(entries()).toHaveLength(4);
  });

  it('says nothing for the start day itself or a day after it', async () => {
    const { targets } = world(ME, LA, '22:00:00', START);
    for (const when of ['2026-10-26', undefined]) {
      const r = await logTap(id(targets.count), on(when));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.data).not.toHaveProperty('notice');
    }
    expect(entries()).toHaveLength(2);
  });

  it('says so for a log made now, before a goal that starts later', async () => {
    const w = world(ME, LA, '22:00:00', '2026-11-02');
    const later = "Saved. It's before this goal's start date (Nov 2), so it won't count unless you move the start date earlier.";
    const results = [
      await logTap(id(w.targets.count), at),
      await logNumber(id(w.targets.quantity), 5, at),
      await logMinutes(id(w.targets.time), 30, at),
      await tickStep(id(w.steps[0]), at),
      await logTimer(id(w.targets.time), iso(NOW - 600_000), at),
    ];
    for (const r of results) expect(r).toMatchObject({ ok: true, data: { notice: later } });
    expect(entries()).toHaveLength(5);
  });

  it('cannot judge a log made now when no day end is set, so it says nothing and saves it', async () => {
    const { targets } = world(ME, LA, null, '2026-11-02');
    const r = await logTap(id(targets.count), at);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).not.toHaveProperty('notice');
    expect(entries()).toHaveLength(1);
  });

  it('says it once, on the tick that wrote the entry, and not on a re-tick', async () => {
    const { steps } = world(ME, LA, '22:00:00', START);
    expect(await tickStep(id(steps[0]), on('2026-10-24'))).toMatchObject({ data: { notice: NOTICE } });
    await untickStep(id(steps[0]), at);
    const again = await tickStep(id(steps[0]), at);
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.data).not.toHaveProperty('notice');
  });

  it('still saves the entry when the start date cannot be read', async () => {
    const { targets } = world(ME, LA, '22:00:00', START);
    gm.tables.goals = [];
    const r = await logTap(id(targets.count), on('2026-10-24'));
    expect(r.ok).toBe(true);
    expect(entries()).toHaveLength(1);
  });
});

describe('a late entry in a closed week', () => {
  // Weeks start on Monday. Today is Tuesday 2026-10-27, so the week of 2026-10-19 to 10-25 is closed and the week of
  // 10-26 is open. The target is three a week (floor 3, aspiration 5), started on 2026-10-05.
  const PREVIOUS = '2026-10-19';
  const THIS = '2026-10-26';

  const scoreboardEntries = (): ScoreboardEntry[] =>
    entries().map((e) => ({
      id: e.id as string,
      targetId: e.target_id as string,
      occurredAt: e.occurred_at as string,
      value: e.value as number,
      size: null,
      stepId: null,
      removed: false,
      countAnyway: false,
    }));

  it('counts when the week is next computed, is judged by the same snapshot, and changes nothing stored', async () => {
    const { targets } = world();
    const scored = engineTarget({ id: id(targets.count), startsOn: '2026-10-05' });
    const anchors = engineAnchors({ dayEndMinutes: 1320 });
    const evaluate = (periodStart: string, snapshots: ReturnType<typeof snapshotPeriod>[]) =>
      evaluateTarget({ target: scored, periodStart, today: '2026-10-27', anchors, entries: scoreboardEntries(), snapshots });

    // Two taps in the previous week, and the snapshot taken when it closed: the target it was judged by.
    await logTap(id(targets.count), { now, when: '2026-10-20' });
    await logTap(id(targets.count), { now, when: '2026-10-21' });
    const snapshot = snapshotPeriod(scored, PREVIOUS);
    const frozen = structuredClone(snapshot);

    const before = evaluate(PREVIOUS, [snapshot]);
    expect(before).toMatchObject({ status: 'closed', judgedBy: 'snapshot', counted: 2, level: 'partway' });

    // The late entry: last week's Thursday, logged this week. Everything the service wrote goes to entries and the
    // manual source; no stored result and no snapshot exists to go stale.
    gm.writes = [];
    const late = await logTap(id(targets.count), { now, when: '2026-10-22' });
    expect(late).toMatchObject({ ok: true });
    expect([...new Set(gm.writes.map((w) => w.table))].sort()).toEqual(['entries']);
    expect(entries()[entries().length - 1]).toMatchObject({ occurred_at: noon('2026-10-22'), evidence: { chosenDay: '2026-10-22' } });

    // The next compute counts it in the closed week: three taps meet the floor. Same snapshot, untouched.
    const after = evaluate(PREVIOUS, [snapshot]);
    expect(after).toMatchObject({ status: 'closed', judgedBy: 'snapshot', counted: 3, level: 'floor' });
    expect(snapshot).toEqual(frozen);

    // And it did not leak into the open week.
    expect(evaluate(THIS, [])).toMatchObject({ status: 'open', counted: 0 });
  });

  it('counts a late entry the same way when the week had no snapshot yet (judged by the target’s history)', async () => {
    const { targets } = world();
    const scored = engineTarget({ id: id(targets.count), startsOn: '2026-10-05' });
    await logTap(id(targets.count), { now, when: '2026-10-21' });
    await logTap(id(targets.count), { now, when: '2026-10-22' });
    await logTap(id(targets.count), { now, when: '2026-10-23' });
    const result = evaluateTarget({
      target: scored,
      periodStart: PREVIOUS,
      today: '2026-10-27',
      anchors: engineAnchors({ dayEndMinutes: 1320 }),
      entries: scoreboardEntries(),
      snapshots: [],
    });
    expect(result).toMatchObject({ status: 'closed', judgedBy: 'history', counted: 3, level: 'floor' });
  });

  it('puts the chosen day on the right local day for the engine, even right after a daylight-saving change', async () => {
    // Daylight time ends on 2026-11-01. On 2026-11-02 at 08:30 Los Angeles is UTC-8, and noon on the 1st is 20:00 UTC.
    const { targets } = world();
    const afterChange = { now: () => Date.UTC(2026, 10, 2, 16, 30), when: '2026-11-01' };
    await logTap(id(targets.count), afterChange);
    expect(entries()[0].occurred_at).toBe('2026-11-01T20:00:00.000Z');
    const scored = engineTarget({ id: id(targets.count), startsOn: '2026-10-05' });
    const result = evaluateTarget({
      target: scored,
      periodStart: '2026-10-26',
      today: '2026-11-02',
      anchors: engineAnchors({ dayEndMinutes: 1320 }),
      entries: scoreboardEntries(),
      snapshots: [],
    });
    expect(result).toMatchObject({ status: 'closed', counted: 1 });
  });
});

describe('signed out, bad input and other people', () => {
  it('refuses every function when signed out, and writes nothing', async () => {
    const w = world();
    await logTap(id(w.targets.count), at);
    const entry = entries()[0];
    gm.writes = [];
    gm.user = null;

    const results = [
      await logTap(id(w.targets.count), at),
      await logNumber(id(w.targets.quantity), 4, at),
      await logTimer(id(w.targets.time), iso(NOW - 600_000), at),
      await tickStep(id(w.steps[0]), at),
      await untickStep(id(w.steps[0]), at),
      await removeEntry(entry.id, at),
      await restoreEntry(entry.id, at),
      await getLogPanel(),
    ];
    for (const r of results) expect(r.ok).toBe(false);
    expect(gm.writes).toHaveLength(0);
  });

  it('refuses an id that is not a uuid before touching the database', async () => {
    world();
    for (const bad of ['', 'abc', null, undefined, 42, {}, "1' or '1'='1"]) {
      expect((await logTap(bad, at)).ok).toBe(false);
      expect((await tickStep(bad, at)).ok).toBe(false);
      expect((await removeEntry(bad, at)).ok).toBe(false);
    }
    expect(gm.writes).toHaveLength(0);
  });

  it("will not log against another person's target, tick their step, or touch their entry", async () => {
    world();
    const theirs = world(OTHER);
    // A real entry of theirs, made as them.
    gm.user = { id: OTHER };
    await logTap(id(theirs.targets.count), at);
    const theirEntry = entries().find((e) => e.user_id === OTHER) as Record<string, unknown>;
    gm.user = { id: ME };
    const before = JSON.stringify(gm.tables);

    expect(await logTap(id(theirs.targets.count), at)).toEqual({ ok: false, error: 'Target not found.' });
    expect(await logNumber(id(theirs.targets.quantity), 9, at)).toEqual({ ok: false, error: 'Target not found.' });
    expect(await tickStep(id(theirs.steps[0]), at)).toEqual({ ok: false, error: 'Step not found.' });
    expect(await removeEntry(theirEntry.id, at)).toEqual({ ok: false, error: 'Entry not found.' });
    expect(await restoreEntry(theirEntry.id, at)).toEqual({ ok: false, error: 'Entry not found.' });
    expect(JSON.stringify(gm.tables)).toBe(before);
  });

  it('still refuses another person when row level security is off, because the service filters by user id itself', async () => {
    world();
    const theirs = world(OTHER);
    gm.rls = false;
    expect(await logTap(id(theirs.targets.count), at)).toEqual({ ok: false, error: 'Target not found.' });
    expect(await tickStep(id(theirs.steps[0]), at)).toEqual({ ok: false, error: 'Step not found.' });
    expect(entries()).toHaveLength(0);
  });

  it('shows a database failure as a fixed message that quotes nothing', async () => {
    const { targets } = world();
    gm.failNextWrite = { table: 'sources', message: 'duplicate key value (secret-user@example.com)' };
    const r = await logTap(id(targets.count), at);
    expect(r).toEqual({ ok: false, error: 'Could not save your entry. Nothing was saved.' });
    expect(JSON.stringify(r)).not.toContain('secret-user');
  });
});

describe('the page read (getLogPanel)', () => {
  it('lists the targets of active goals, with the checklist steps and what is ticked', async () => {
    const w = world();
    const parked = goalRow(ME, { title: 'Parked goal', state: 'parked' });
    add('goals', parked);
    add('targets', targetRow(ME, parked.id, 'count', { title: 'Hidden target' }));
    await tickStep(id(w.steps[0]), at);

    const panel = await getLogPanel();
    expect(panel.ok).toBe(true);
    if (!panel.ok) return;
    expect(panel.data.timeZone).toBe('America/Los_Angeles');
    expect(panel.data.targets.map((t) => t.title)).toEqual(['Workouts', 'Distance', 'Study time', 'Prep']);
    expect(panel.data.targets[0].goalTitle).toBe('Stay fit');
    const prep = panel.data.targets[3];
    expect(prep.items).toHaveLength(1);
    expect(prep.items[0].steps).toEqual([
      { id: id(w.steps[0]), title: 'Read the brief', ticked: true },
      { id: id(w.steps[1]), title: 'Book the room', ticked: false },
    ]);
    expect(panel.data.targets[0].items).toEqual([]);
  });

  it('shows an un-ticked step as not ticked, and a re-ticked one as ticked again', async () => {
    const w = world();
    await tickStep(id(w.steps[0]), at);
    await untickStep(id(w.steps[0]), at);
    const read = async () => {
      const panel = await getLogPanel();
      if (!panel.ok) throw new Error(panel.error);
      return panel.data.targets[3].items[0].steps[0].ticked;
    };
    expect(await read()).toBe(false);
    await tickStep(id(w.steps[0]), at);
    expect(await read()).toBe(true);
  });

  it('lists recent entries newest first, flags removed ones, and caps the list at 20', async () => {
    const { targets } = world();
    for (let i = 0; i < 22; i++) await logTap(id(targets.count), { now: () => NOW + i * 60_000 });
    const newest = entries().find((e) => e.occurred_at === iso(NOW + 21 * 60_000)) as Record<string, unknown>;
    await removeEntry(newest.id, at);

    const panel = await getLogPanel();
    if (!panel.ok) throw new Error(panel.error);
    expect(panel.data.recent).toHaveLength(20);
    expect(panel.data.recent[0]).toMatchObject({ id: newest.id, removed: true, targetTitle: 'Workouts', via: 'tap', value: 1 });
    expect(panel.data.recent[1].removed).toBe(false);
    expect(panel.data.recent.map((e) => e.occurredAt)).toEqual([...panel.data.recent.map((e) => e.occurredAt)].sort().reverse());
  });

  it('reports no time zone as null, for a missing, empty or invented one', async () => {
    world(ME, null);
    const read = async () => {
      const panel = await getLogPanel();
      if (!panel.ok) throw new Error(panel.error);
      return panel.data.timeZone;
    };
    expect(await read()).toBeNull();
    add('person_settings', settingsRow(ME, 'Nowhere/Land'));
    expect(await read()).toBeNull();
  });

  it("never shows another person's targets or entries, even with row level security off", async () => {
    world();
    const theirs = world(OTHER);
    gm.user = { id: OTHER };
    await logTap(id(theirs.targets.count), at);
    gm.user = { id: ME };
    gm.rls = false;

    const panel = await getLogPanel();
    if (!panel.ok) throw new Error(panel.error);
    const theirTargetIds = new Set(Object.values(theirs.targets).map(id));
    expect(panel.data.targets).toHaveLength(4);
    expect(panel.data.targets.some((t) => theirTargetIds.has(t.id))).toBe(false);
    expect(panel.data.recent).toHaveLength(0);
  });

  it('reads and writes nothing it should not: a page load changes no row', async () => {
    world();
    await getLogPanel();
    expect(gm.writes).toHaveLength(0);
  });

  const read = async (deps: { now?: () => number } = at) => {
    const panel = await getLogPanel(deps);
    if (!panel.ok) throw new Error(panel.error);
    return panel.data;
  };

  it('offers today and the 7 days before it, built in the person’s own zone', async () => {
    world();
    const { days } = await read();
    expect(days).toEqual([
      { date: '2026-10-27', label: 'Today', detail: 'Oct 27' },
      { date: '2026-10-26', label: 'Yesterday', detail: 'Oct 26' },
      { date: '2026-10-25', label: 'Sun', detail: 'Oct 25' },
      { date: '2026-10-24', label: 'Sat', detail: 'Oct 24' },
      { date: '2026-10-23', label: 'Fri', detail: 'Oct 23' },
      { date: '2026-10-22', label: 'Thu', detail: 'Oct 22' },
      { date: '2026-10-21', label: 'Wed', detail: 'Oct 21' },
      { date: '2026-10-20', label: 'Tue', detail: 'Oct 20' },
    ]);
  });

  it('starts the list on the person’s own today, which an early day end moves back', async () => {
    world(ME, LA, '02:00:00');
    const { days } = await read({ now: () => Date.UTC(2026, 9, 28, 8, 30) });
    expect(days?.[0]).toEqual({ date: '2026-10-27', label: 'Today', detail: 'Oct 27' });
    expect(days).toHaveLength(8);
  });

  it('offers no days without a day end or without a time zone, and assumes neither', async () => {
    world(ME, LA, null);
    expect((await read()).days).toBeNull();
    resetGoalModel({ id: ME });
    world(ME, null);
    expect((await read()).days).toBeNull();
  });

  it('shows a chosen-day entry as a day, and flags an entry before its goal’s start as not counted', async () => {
    const w = world(ME, LA, '22:00:00', '2026-10-26');
    await logTap(id(w.targets.count), { now, when: '2026-10-24' });
    await logTap(id(w.targets.count), { now, when: '2026-10-26' });
    await logNumber(id(w.targets.quantity), 5, at);

    const { recent } = await read();
    const early = recent.find((e) => e.chosenDay === '2026-10-24');
    const onStart = recent.find((e) => e.chosenDay === '2026-10-26');
    const justNow = recent.find((e) => e.targetTitle === 'Distance');
    expect(early).toMatchObject({ beforeStart: true, via: 'tap', occurredAt: noon('2026-10-24') });
    expect(onStart).toMatchObject({ beforeStart: false });
    expect(justNow).toMatchObject({ beforeStart: false, chosenDay: null });
  });

  it('flags a log made now before a goal that starts later, and none when the day end is missing', async () => {
    const w = world(ME, LA, '22:00:00', '2026-11-02');
    await logTap(id(w.targets.count), at);
    expect((await read()).recent[0].beforeStart).toBe(true);

    resetGoalModel({ id: ME });
    const noDayEnd = world(ME, LA, null, '2026-11-02');
    await logTap(id(noDayEnd.targets.count), at);
    expect((await read()).recent[0].beforeStart).toBe(false);
  });
});
