// Goal wizard input and the generated week-one plan (lib/goals/taskPlan.ts). A model's plan goes
// through the same strict schema as the built-in stub, so it can never carry a status or an
// unknown task type (docs/NINETY_DAY_PLAN_CONTEXT.md §3, PRODUCT_STRATEGY.md §4).

import { describe, expect, it } from 'vitest';
import { TITLE_MAX_LENGTH, buildStubTaskPlan, parseTaskPlan, parseWizardInput } from '@/lib/goals/taskPlan';

const base = { title: ' Ship it ', goalType: 'career_pivot', constraints: [], pace: null, reviewPrompts: [] };

describe('parseWizardInput', () => {
  it('accepts valid input and trims the title', () => {
    const r = parseWizardInput(base);
    expect(r.ok && r.data.title).toBe('Ship it');
  });
  it('rejects a blank title', () => expect(parseWizardInput({ ...base, title: '   ' }).ok).toBe(false));
  it('rejects an unknown goal type', () => expect(parseWizardInput({ ...base, goalType: 'nope' }).ok).toBe(false));
  it('rejects a title over the limit, and accepts one at the limit', () => {
    expect(parseWizardInput({ ...base, title: 'x'.repeat(TITLE_MAX_LENGTH + 1) }).ok).toBe(false);
    expect(parseWizardInput({ ...base, title: 'x'.repeat(TITLE_MAX_LENGTH) }).ok).toBe(true);
  });
  it('rejects an unknown pace', () => expect(parseWizardInput({ ...base, pace: 'turbo' }).ok).toBe(false));
});

describe('buildStubTaskPlan', () => {
  const plan = (pace: string | null) => {
    const r = parseWizardInput({ ...base, pace, reviewPrompts: ['took_longer', 'skipped'] });
    if (!r.ok) throw new Error(r.error);
    return buildStubTaskPlan(r.data);
  };

  it('always ends with a Friday review task, all in week 1', () => {
    for (const pace of [null, 'lighter', 'heavier', 'behind']) {
      const tasks = plan(pace).tasks;
      expect(tasks.at(-1)?.taskType).toBe('review');
      expect(tasks.every((t) => t.weekOf === 1)).toBe(true);
    }
  });

  it('lighter and heavier resize the plan; behind leaves a new plan unchanged', () => {
    const normal = plan(null).tasks.filter((t) => t.taskType !== 'review');
    const resized = (factor: number) => normal.map((t) => Math.max(5, Math.round((t.minutes * factor) / 5) * 5));
    expect(plan('lighter').tasks.filter((t) => t.taskType !== 'review').map((t) => t.minutes)).toEqual(resized(0.5));
    expect(plan('heavier').tasks.filter((t) => t.taskType !== 'review').map((t) => t.minutes)).toEqual(resized(1.5));
    expect(plan('behind').tasks).toEqual(plan(null).tasks);
  });

  it('every stub plan passes the same schema a model plan must', () => {
    for (const pace of [null, 'lighter', 'heavier', 'behind']) expect(parseTaskPlan(plan(pace)).ok).toBe(true);
  });
});

describe('parseTaskPlan (a model-written plan)', () => {
  const task = { title: 'a', taskType: 'build', minutes: 30, weekOf: 1 };

  it('accepts a valid plan', () => expect(parseTaskPlan({ tasks: [task] }).ok).toBe(true));
  it('rejects a task that sets a status (a model cannot tick a task)', () => {
    expect(parseTaskPlan({ tasks: [{ ...task, status: 'done' }] }).ok).toBe(false);
  });
  it('rejects an unknown task type', () => expect(parseTaskPlan({ tasks: [{ ...task, taskType: 'delete' }] }).ok).toBe(false));
  it('rejects zero minutes', () => expect(parseTaskPlan({ tasks: [{ ...task, minutes: 0 }] }).ok).toBe(false));
  it('rejects a week past the plan (14)', () => expect(parseTaskPlan({ tasks: [{ ...task, weekOf: 14 }] }).ok).toBe(false));
  it('rejects an empty plan', () => expect(parseTaskPlan({ tasks: [] }).ok).toBe(false));
});
