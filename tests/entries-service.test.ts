// Service-layer invariants for lib/services/entries.ts (MOM-110), run against the in-memory goal model fake
// (tests/helpers/fakeEntriesModel.ts):
// - the four ways to log each write one entry the person made, at the server's clock, on their own manual source,
// - removing is a hide correction and restoring deletes it; un-ticking and re-ticking do the same for a step, and the
//   entry row is never edited (the owner's decision, 2026-10-26),
// - logging refuses without a real time zone and never defaults one (principle 1),
// - one person never reads or writes another's rows, and a synced entry is not changed here (principle 3, MOM-109).
// The database side of the same rules (RLS, grants, constraints) is covered by supabase/verify/013_goal_model_tables.sql.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BAD_TIME_ZONE,
  MAX_QUANTITY,
  NO_TIME_ZONE,
  getLogPanel,
  isRealTimeZone,
  logNumber,
  logTap,
  logTimer,
  removeEntry,
  resolveOccurredAt,
  restoreEntry,
  tickStep,
  untickStep,
} from '@/lib/services/entries';
import { ME, OTHER, add, goalRow, gm, itemRow, newId, resetGoalModel, settingsRow, stepRow, targetRow } from './helpers/fakeEntriesModel';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeEntriesModel');
  return { createSupabaseServerClient };
});

const NOW = Date.UTC(2026, 9, 27, 15, 30, 0);
const now = () => NOW;
const at = { now };
const iso = (ms: number) => new Date(ms).toISOString();

// One signed-in person with a time zone, an active goal, a target of each measure, and a checklist item with two steps.
function world(userId = ME, timeZone: string | null = 'America/Los_Angeles') {
  if (timeZone !== null) add('person_settings', settingsRow(userId, timeZone));
  const goal = goalRow(userId);
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

describe('when an entry happened', () => {
  it('is the server clock, and a chosen time is not accepted yet (part 2 of MOM-110)', async () => {
    const { targets, steps } = world();
    const chosen = { now, when: '2026-10-25' };
    expect((await logTap(id(targets.count), chosen)).ok).toBe(false);
    expect((await logNumber(id(targets.quantity), 3, chosen)).ok).toBe(false);
    expect((await tickStep(id(steps[0]), chosen)).ok).toBe(false);
    expect(entries()).toHaveLength(0);
  });

  it('resolveOccurredAt gives now as an instant, and refuses anything chosen', () => {
    const context = { nowMs: NOW, timeZone: 'America/Los_Angeles' };
    expect(resolveOccurredAt(undefined, context)).toEqual({ ok: true, data: iso(NOW) });
    expect(resolveOccurredAt('2026-10-25', context).ok).toBe(false);
    expect(resolveOccurredAt(null, context).ok).toBe(false);
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
});
