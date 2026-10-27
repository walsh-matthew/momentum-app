// The setup draft schema (types/setup.ts, MOM-111): what shape it accepts and what it refuses. The saved model passes this
// same schema; the checks that need a conversation (sources, ordering, completeness) are in setup-validate.test.ts.

import { describe, expect, it } from 'vitest';
import { emptyDraft } from '@/lib/setup/draft';
import {
  AssistantTurnSchema,
  GoalDraftSchema,
  SetupDraftSchema,
  SetupModelSchema,
  TargetDraftSchema,
  WorkItemDraftSchema,
} from '@/types/setup';
import { goal, item, target } from './helpers/setupScript';

describe('the blank draft', () => {
  it('passes the schema, with every person fact and setting "not chosen"', () => {
    const draft = emptyDraft();
    expect(SetupDraftSchema.safeParse(draft).success).toBe(true);
    const { person, settings } = draft.model;
    expect([person.timeZone, person.dayEnd, person.weekStart, person.planning.weekday, person.planning.time]).toEqual([null, null, null, null, null]);
    expect(Object.values(settings).every((v) => v === null)).toBe(true);
    expect(draft.model.goals).toEqual([]);
    expect(draft.approved).toEqual([]);
  });

  it('is a new object each time, so one setup never shares state with another', () => {
    const a = emptyDraft();
    a.model.goals.push(goal('g1', 'A'));
    expect(emptyDraft().model.goals).toEqual([]);
  });
});

describe('every object is strict', () => {
  it('refuses a score, a status or any other key at every level', () => {
    const base = emptyDraft().model;
    expect(SetupModelSchema.safeParse({ ...base, score: 1 }).success).toBe(false);
    expect(SetupModelSchema.safeParse({ ...base, person: { ...base.person, score: 1 } }).success).toBe(false);
    expect(SetupModelSchema.safeParse({ ...base, settings: { ...base.settings, mood: 'x' } }).success).toBe(false);
    expect(GoalDraftSchema.safeParse({ ...goal('g1', 'A'), score: 1 }).success).toBe(false);
    expect(TargetDraftSchema.safeParse({ ...target('t1', 'T'), percentComplete: 50 }).success).toBe(false);
    expect(WorkItemDraftSchema.safeParse({ ...item('i1', 'habit', 'H'), status: 'done' }).success).toBe(false);
    expect(SetupDraftSchema.safeParse({ ...emptyDraft(), extra: true }).success).toBe(false);
  });

  it('has no field that could hold a result, a total or a grade', () => {
    const keys = new Set<string>();
    const walk = (value: unknown) => {
      if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
          keys.add(k);
          walk(v);
        }
      }
    };
    walk({ ...goal('g1', 'A'), ...target('t1', 'T'), ...item('i1', 'habit', 'H'), ...emptyDraft().model.person, ...emptyDraft().model.settings });
    for (const k of keys) expect(k).not.toMatch(/score|grade|total|progress|percent|result|status|completed/i);
  });
});

describe('what a field may hold', () => {
  it('takes a date only as a real YYYY-MM-DD, and a time only as HH:MM', () => {
    expect(GoalDraftSchema.safeParse(goal('g1', 'A', { startDate: '2026-10-27' })).success).toBe(true);
    expect(GoalDraftSchema.safeParse(goal('g1', 'A', { startDate: '2026-02-30' })).success).toBe(false);
    expect(GoalDraftSchema.safeParse(goal('g1', 'A', { startDate: 'next week' })).success).toBe(false);
    const d = emptyDraft();
    d.model.person.dayEnd = '25:00';
    expect(SetupDraftSchema.safeParse(d).success).toBe(false);
    d.model.person.dayEnd = '02:00';
    expect(SetupDraftSchema.safeParse(d).success).toBe(true);
  });

  it('numbers weekdays 1 to 7, Monday first, and refuses 0 and 8', () => {
    const d = emptyDraft();
    for (const bad of [0, 8, 1.5]) {
      d.model.person.weekStart = bad;
      expect(SetupDraftSchema.safeParse(d).success).toBe(false);
    }
    d.model.person.weekStart = 7;
    expect(SetupDraftSchema.safeParse(d).success).toBe(true);
  });

  it('takes a target period as exactly one of three shapes', () => {
    const ok = (period: unknown) => TargetDraftSchema.safeParse({ ...target('t1', 'T'), period }).success;
    expect(ok({ kind: 'weekly' })).toBe(true);
    expect(ok({ kind: 'day_slots', weekdays: [1, 3] })).toBe(true);
    expect(ok({ kind: 'deadline', dueDate: '2027-06-14' })).toBe(true);
    expect(ok({ kind: 'weekly', dueDate: '2027-06-14' })).toBe(false);
    expect(ok({ kind: 'day_slots', weekdays: [] })).toBe(false);
    expect(ok({ kind: 'monthly' })).toBe(false);
  });

  it('takes a way back for a parked goal as a date, a condition in words, or only on request', () => {
    const ok = (returnWhen: unknown) => GoalDraftSchema.safeParse({ ...goal('g1', 'A', { state: 'parked' }), returnWhen }).success;
    expect(ok({ kind: 'date', date: '2027-03-01' })).toBe(true);
    expect(ok({ kind: 'condition', note: 'in the spring' })).toBe(true);
    expect(ok({ kind: 'on_request' })).toBe(true);
    expect(ok({ kind: 'condition' })).toBe(false);
    expect(ok({ kind: 'sometime' })).toBe(false);
  });

  it('refuses a level that is not a positive number, and a blank title', () => {
    expect(TargetDraftSchema.safeParse(target('t1', 'T', { floor: 0 })).success).toBe(false);
    expect(TargetDraftSchema.safeParse(target('t1', 'T', { floor: -1 })).success).toBe(false);
    expect(TargetDraftSchema.safeParse(target('t1', '   ')).success).toBe(false);
    expect(TargetDraftSchema.safeParse(target('Bad Key', 'T')).success).toBe(false);
  });
});

describe('a turn of Claude\'s', () => {
  const turn = {
    kind: 'question',
    chunk: null,
    skipped: null,
    say: '',
    question: 'What would you like to work on?',
    topic: 'idea',
    options: [],
    draft: emptyDraft(),
  };

  it('has exactly the fields the checks read', () => {
    expect(AssistantTurnSchema.safeParse(turn).success).toBe(true);
    expect(AssistantTurnSchema.safeParse({ ...turn, mood: 'x' }).success).toBe(false);
    expect(AssistantTurnSchema.safeParse({ ...turn, kind: 'chat' }).success).toBe(false);
    expect(AssistantTurnSchema.safeParse({ ...turn, topic: 'weather' }).success).toBe(false);
    expect(AssistantTurnSchema.safeParse({ ...turn, draft: undefined }).success).toBe(false);
  });
});
