// Starting criteria for a wizard goal (lib/goals/criteria.ts). The user owns completion, so every
// template starts unticked and the schema cannot accept a ticked criterion
// (docs/NINETY_DAY_PLAN_CONTEXT.md §3, §5 rule 6).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { InitialCriteriaSchema, criteriaFor } from '@/lib/goals/criteria';
import { GOAL_TYPES } from '@/lib/goals/vocabulary';

describe('criteriaFor', () => {
  it.each(GOAL_TYPES)('%s has criteria, all unticked, that pass the creation schema', (type) => {
    const criteria = criteriaFor(type);
    expect(criteria.length).toBeGreaterThan(0);
    expect(criteria.every((c) => c.done === false)).toBe(true);
    expect(InitialCriteriaSchema.safeParse(criteria).success).toBe(true);
  });

  it('career_pivot is the plan\'s seven completion criteria', () => {
    expect(criteriaFor('career_pivot')).toHaveLength(7);
  });

  it('returns a fresh copy, so a caller cannot change a template', () => {
    const first = criteriaFor('get_certified');
    first[0].done = true;
    first.pop();
    const second = criteriaFor('get_certified');
    expect(second[0].done).toBe(false);
    expect(second.length).toBeGreaterThan(first.length);
  });

  // seed_career_pivot() (migration 008, section 4) and the career_pivot template describe the same
  // checklist. If either changes alone, a seeded goal and a wizard "Career pivot" goal diverge.
  it('career_pivot matches the criteria in the signup seed', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '008_goal_preferences.sql'), 'utf8');
    const seeded = [...sql.matchAll(/\{"key": "([a-z_]+)",\s+"label": "((?:[^"])*)",\s+"done": (false|true)\}/g)].map((m) => ({
      key: m[1],
      label: m[2].replace(/''/g, "'"),
      done: m[3] === 'true',
    }));
    expect(seeded).toHaveLength(7);
    expect(criteriaFor('career_pivot')).toEqual(seeded);
  });
});

describe('InitialCriteriaSchema', () => {
  const ok = { key: 'a_b', label: 'Something concrete', done: false };

  it('accepts unticked criteria', () => expect(InitialCriteriaSchema.safeParse([ok]).success).toBe(true));
  it('rejects a ticked criterion', () => {
    expect(InitialCriteriaSchema.safeParse([{ ...ok, done: true }]).success).toBe(false);
  });
  it('rejects a missing or non-boolean done', () => {
    expect(InitialCriteriaSchema.safeParse([{ key: 'a', label: 'x' }]).success).toBe(false);
    expect(InitialCriteriaSchema.safeParse([{ ...ok, done: 'false' }]).success).toBe(false);
  });
  it('rejects an empty list, a duplicate key, a bad key and extra fields', () => {
    expect(InitialCriteriaSchema.safeParse([]).success).toBe(false);
    expect(InitialCriteriaSchema.safeParse([ok, ok]).success).toBe(false);
    expect(InitialCriteriaSchema.safeParse([{ ...ok, key: 'Not A Key' }]).success).toBe(false);
    expect(InitialCriteriaSchema.safeParse([{ ...ok, completedAt: 'now' }]).success).toBe(false);
  });
});
