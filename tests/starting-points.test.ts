// Which saved values came from a suggestion the person accepted (MOM-134, lib/setup/startingPoints.ts), and how the marks
// travel in the save payload (lib/setup/rows.ts). Pure: no database. What the save does with them is in
// tests/setup-service.test.ts; what the database does is in supabase/verify/017_starting_points.sql.

import { describe, expect, it } from 'vitest';
import { emptyDraft } from '@/lib/setup/draft';
import { PROVENANCE_PATH_FORMS, latestProvenance, provenanceLeaves } from '@/lib/setup/leaves';
import { toSavePayload, type SetupRows } from '@/lib/setup/rows';
import { acceptedStartingPoints, startingPointForPath } from '@/lib/setup/startingPoints';
import { STARTING_POINT_FIELDS, STARTING_POINT_KINDS } from '@/types/database.types';
import type { GoalDraft, Provenance, SetupDraft } from '@/types/setup';

const goal = (over: Partial<GoalDraft> = {}): GoalDraft => ({
  key: 'g1',
  title: 'Get fit',
  why: null,
  startDate: null,
  shape: null,
  endDate: null,
  blockWeeks: null,
  state: 'active',
  returnWhen: null,
  completionMode: null,
  tone: null,
  targets: [],
  items: [],
  ...over,
});

// A draft with the given goals and provenance. Not validated: these tests are about which entries become marks.
function draftWith(said: Provenance[], build: (d: SetupDraft) => void = () => {}): SetupDraft {
  const draft = emptyDraft();
  build(draft);
  draft.said = said;
  return draft;
}
const accepted = (path: string, turn = 2): Provenance => ({ path, turn, how: 'accepted' });
const said = (path: string, turn = 2): Provenance => ({ path, turn, how: 'said' });

// Every kind of value setup can record where it came from, so each path form has a leaf.
function everyLeafDraft(): SetupDraft {
  return draftWith([], (d) => {
    d.model.person.dayEnd = '21:00';
    d.model.person.weekStart = 1;
    d.model.person.planning = { weekday: 7, time: '18:00' };
    d.model.person.dayTypes = [{ name: 'Work Day', capacityUnit: 'hours', capacityAmount: 2 }];
    d.model.goals = [
      goal({
        startDate: '2026-10-29',
        endDate: '2027-01-29',
        blockWeeks: 10,
        returnWhen: { kind: 'date', date: '2027-03-01' },
        targets: [
          {
            key: 'gym', title: 'Gym', measure: 'count', unit: null, role: 'effort', period: { kind: 'day_slots', weekdays: [1, 3] },
            floor: 2, aspiration: 3, qualifyingThreshold: 1, carryOver: 'habit', completionMode: null, tone: null, sources: [],
          },
          {
            key: 'form', title: 'Form', measure: 'checklist', unit: null, role: 'outcome', period: { kind: 'deadline', dueDate: '2026-12-01' },
            floor: null, aspiration: null, qualifyingThreshold: null, carryOver: 'cumulative', completionMode: null, tone: null, sources: [],
          },
        ],
        items: [{ key: 'trainer', kind: 'deadline_task', title: 'Book a trainer', targetKey: null, dueDate: '2026-11-15', dateCanMove: false, estimateMinutes: 60, steps: [] }],
      }),
    ];
  });
}

describe('acceptedStartingPoints: which values are starting points', () => {
  it('is empty for a draft that accepted nothing: a said value is never marked', () => {
    const draft = everyLeafDraft();
    draft.said = provenanceLeaves(draft.model).map((l) => said(l.path));
    expect(draft.said.length).toBeGreaterThan(10);
    expect(acceptedStartingPoints(draft)).toEqual([]);
    expect(acceptedStartingPoints(emptyDraft())).toEqual([]);
  });

  it('marks one accepted value, and only that one', () => {
    const draft = everyLeafDraft();
    draft.said = [...provenanceLeaves(draft.model).map((l) => said(l.path)), accepted('goals.g1.startDate', 3)];
    expect(acceptedStartingPoints(draft)).toEqual([{ subject: { kind: 'goal', goalKey: 'g1' }, field: 'start_date' }]);
  });

  it('marks several, across the person, a day type, a goal, a target and a work item', () => {
    const draft = everyLeafDraft();
    draft.said = [
      accepted('person.dayEnd'),
      said('person.weekStart'),
      accepted('person.planning.weekday'),
      accepted('person.dayTypes.work day.capacityAmount'),
      accepted('goals.g1.blockWeeks'),
      accepted('goals.g1.targets.gym.floor'),
      said('goals.g1.targets.gym.aspiration'),
      accepted('goals.g1.targets.gym.slotWeekdays'),
      accepted('goals.g1.targets.form.dueDate'),
      accepted('goals.g1.items.trainer.estimateMinutes'),
    ];
    expect(acceptedStartingPoints(draft)).toEqual([
      { subject: { kind: 'person' }, field: 'day_end' },
      { subject: { kind: 'person' }, field: 'planning_weekday' },
      { subject: { kind: 'day_type', name: 'work day' }, field: 'capacity_amount' },
      { subject: { kind: 'goal', goalKey: 'g1' }, field: 'block_weeks' },
      { subject: { kind: 'target', goalKey: 'g1', targetKey: 'gym' }, field: 'floor' },
      { subject: { kind: 'target', goalKey: 'g1', targetKey: 'gym' }, field: 'slot_weekdays' },
      { subject: { kind: 'target', goalKey: 'g1', targetKey: 'form' }, field: 'due_date' },
      { subject: { kind: 'work_item', goalKey: 'g1', itemKey: 'trainer' }, field: 'estimate_minutes' },
    ]);
  });

  it('the newest answer counts: said after accepting is the person\'s own, accepted after saying is a starting point', () => {
    const draft = everyLeafDraft();
    draft.said = [
      accepted('goals.g1.startDate', 1),
      said('goals.g1.startDate', 3),
      said('goals.g1.endDate', 1),
      accepted('goals.g1.endDate', 3),
    ];
    expect(acceptedStartingPoints(draft)).toEqual([{ subject: { kind: 'goal', goalKey: 'g1' }, field: 'end_date' }]);
  });

  it('on a tie the first entry counts, as the validator reads it', () => {
    const entries: Provenance[] = [said('x', 4), accepted('x', 4)];
    expect(latestProvenance(entries, 'x')?.how).toBe('said');
    expect(latestProvenance([accepted('x', 4), said('x', 4)], 'x')?.how).toBe('accepted');
    expect(latestProvenance(entries, 'y')).toBeUndefined();
  });

  it('drops an entry for a value that is not in the draft: a path that maps to nothing is never a mark', () => {
    const draft = everyLeafDraft();
    draft.model.goals[0].endDate = null;
    draft.said = [accepted('goals.g1.endDate'), accepted('goals.gone.startDate'), accepted('goals.g1.targets.ghost.floor'), accepted('person.timeZone')];
    expect(acceptedStartingPoints(draft)).toEqual([]);
  });

  it('never marks whether a deadline date can move: that is the person\'s own answer', () => {
    const draft = everyLeafDraft();
    draft.said = [accepted('goals.g1.items.trainer.dateCanMove')];
    expect(acceptedStartingPoints(draft)).toEqual([]);
    expect(startingPointForPath('goals.g1.items.trainer.dateCanMove')).toBeNull();
  });

  it('marks the first of two day types whose names differ only in case, and only once', () => {
    const draft = everyLeafDraft();
    draft.model.person.dayTypes = [
      { name: 'Work day', capacityUnit: 'hours', capacityAmount: 2 },
      { name: 'work DAY', capacityUnit: 'hours', capacityAmount: 3 },
    ];
    draft.said = [accepted('person.dayTypes.work day.capacityAmount')];
    expect(acceptedStartingPoints(draft)).toEqual([{ subject: { kind: 'day_type', name: 'work day' }, field: 'capacity_amount' }]);
  });
});

describe('startingPointForPath: every path setup can record maps to a column migration 017 allows', () => {
  const draft = everyLeafDraft();
  const leaves = provenanceLeaves(draft.model);
  const flag = (path: string) => path.endsWith('.dateCanMove');

  it('the fixture has a leaf for every path form, so no form is left unchecked', () => {
    const form = (path: string) =>
      path
        .replace(/^person\.dayTypes\..+\.capacityAmount$/, 'person.dayTypes.<name>.capacityAmount')
        .replace(/^goals\.[a-z0-9_]+\./, 'goals.<goalKey>.')
        .replace(/\.targets\.[a-z0-9_]+\./, '.targets.<targetKey>.')
        .replace(/\.items\.[a-z0-9_]+\./, '.items.<itemKey>.');
    expect([...new Set(leaves.map((l) => form(l.path)))].sort()).toEqual([...PROVENANCE_PATH_FORMS].sort());
  });

  it('maps every leaf except the yes/no answer, and the columns are exactly the ones 017 lists for each kind', () => {
    const fieldsByKind = new Map<string, Set<string>>(STARTING_POINT_KINDS.map((k) => [k, new Set<string>()]));
    for (const leaf of leaves) {
      const mark = startingPointForPath(leaf.path);
      if (flag(leaf.path)) {
        expect(mark, leaf.path).toBeNull();
        continue;
      }
      expect(mark, leaf.path).not.toBeNull();
      if (mark) fieldsByKind.get(mark.subject.kind)?.add(mark.field);
    }
    for (const kind of STARTING_POINT_KINDS) {
      expect([...(fieldsByKind.get(kind) ?? [])].sort(), kind).toEqual([...STARTING_POINT_FIELDS[kind]].sort());
    }
  });

  it('maps no other path, and no name that merely exists on every object', () => {
    for (const path of ['person.timeZone', 'goals.g1.title', 'goals.g1.targets.gym.title', 'goals.g1.constructor', 'goals.g1.targets.gym.toString', 'constructor', '']) {
      expect(startingPointForPath(path), path).toBeNull();
    }
  });
});

describe('toSavePayload: where the marks go', () => {
  const rows = (startingPoints: SetupRows['startingPoints']): SetupRows => ({
    personSettings: {
      time_zone: 'America/Chicago', week_start: 1, day_end: '21:00:00', tone: null, reminders: null, check_ins: null, celebrations: null,
      balance_mentions: null, review_depth: null, review_planning: null, quiet_times: null, planning_weekday: null, planning_time: null,
    },
    dayTypes: [
      { name: 'Work day', capacity_unit: 'hours', capacity_amount: 2 },
      { name: 'Rest day', capacity_unit: 'hours', capacity_amount: 4 },
    ],
    priorities: [],
    goals: [
      { key: 'g1', row: { title: 'Get fit', why: null, start_date: '2026-10-29', shape: 'ongoing', end_date: null, block_weeks: 10, state: 'active', return_kind: null, return_date: null, return_note: null, completion_mode: null, tone: null } },
      { key: 'g2', row: { title: 'Read', why: null, start_date: '2026-10-29', shape: 'ongoing', end_date: null, block_weeks: null, state: 'active', return_kind: null, return_date: null, return_note: null, completion_mode: null, tone: null } },
    ],
    targets: [
      { key: 'gym', goalKey: 'g1', row: { title: 'Gym', measure: 'count', unit: null, role: 'effort', period_kind: 'weekly', due_date: null, slot_weekdays: null, floor: 2, aspiration: null, qualifying_threshold: null, carry_over_kind: 'habit', completion_mode: null, tone: null } },
      { key: 'gym', goalKey: 'g2', row: { title: 'Pages', measure: 'count', unit: null, role: 'effort', period_kind: 'weekly', due_date: null, slot_weekdays: null, floor: 5, aspiration: null, qualifying_threshold: null, carry_over_kind: 'habit', completion_mode: null, tone: null } },
    ],
    workItems: [
      { key: 'plan', goalKey: 'g1', targetKey: null, row: { kind: 'deadline_task', title: 'Plan', sort_order: 0, due_date: '2026-11-15', date_can_move: false, estimate_minutes: 60 } },
    ],
    steps: [],
    targetSources: [],
    startingPoints,
  });

  it('with no starting points, sends no starting_points key anywhere: the payload of before migration 017', () => {
    const payload = toSavePayload(rows([]));
    expect(JSON.stringify(payload)).not.toContain('starting_points');
    expect(payload.person).not.toHaveProperty('starting_points');
    expect(payload.goals[0]).not.toHaveProperty('starting_points');
  });

  it('puts each mark under the one row it belongs to, by key, and nowhere else', () => {
    const payload = toSavePayload(
      rows([
        { subject: { kind: 'person' }, field: 'day_end' },
        { subject: { kind: 'person' }, field: 'planning_time' },
        { subject: { kind: 'day_type', name: 'work day' }, field: 'capacity_amount' },
        { subject: { kind: 'goal', goalKey: 'g1' }, field: 'block_weeks' },
        // The same target key in two goals: the goal key tells them apart.
        { subject: { kind: 'target', goalKey: 'g2', targetKey: 'gym' }, field: 'floor' },
        { subject: { kind: 'work_item', goalKey: 'g1', itemKey: 'plan' }, field: 'estimate_minutes' },
      ]),
    );
    expect(payload.person.starting_points).toEqual(['day_end', 'planning_time']);
    expect(payload.day_types.map((d) => d.starting_points)).toEqual([['capacity_amount'], undefined]);
    expect(payload.goals.map((g) => g.starting_points)).toEqual([['block_weeks'], undefined]);
    expect(payload.goals[0].targets.map((t) => t.starting_points)).toEqual([undefined]);
    expect(payload.goals[1].targets.map((t) => t.starting_points)).toEqual([['floor']]);
    expect(payload.goals[0].items.map((i) => i.starting_points)).toEqual([['estimate_minutes']]);
  });

  it('marks only the first of two day types that share a lowercase name', () => {
    const duplicated = rows([{ subject: { kind: 'day_type', name: 'work day' }, field: 'capacity_amount' }]);
    duplicated.dayTypes = [
      { name: 'Work day', capacity_unit: 'hours', capacity_amount: 2 },
      { name: 'work DAY', capacity_unit: 'hours', capacity_amount: 3 },
    ];
    expect(toSavePayload(duplicated).day_types.map((d) => d.starting_points)).toEqual([['capacity_amount'], undefined]);
  });

  it('names no person: a mark carries a saved column name and nothing about who', () => {
    const payload = toSavePayload(rows([{ subject: { kind: 'goal', goalKey: 'g1' }, field: 'start_date' }]));
    expect(JSON.stringify(payload)).not.toMatch(/user_id|userId/);
  });
});
