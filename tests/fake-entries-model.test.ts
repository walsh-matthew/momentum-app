// Keeps tests/helpers/fakeEntriesModel.ts honest (MOM-110): every constraint and policy name it enforces really exists in
// migration 013, and the grants it assumes for the authenticated role are the ones the migration gives. The SQL itself
// is exercised by supabase/verify/013_goal_model_tables.sql; this only stops the fake drifting from it.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENFORCED_CONSTRAINTS } from './helpers/fakeEntriesModel';

// Statements only: comments say things like "never edited" and would match.
const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '013_goal_model_tables.sql'), 'utf8').replace(/--.*$/gm, '');

describe('the goal model fake matches migration 013', () => {
  it.each([...ENFORCED_CONSTRAINTS])('%s exists in the SQL', (name) => {
    expect(sql).toMatch(new RegExp(`(constraint|policy)\\s+"?${name}"?\\b`, 'i'));
  });

  it.each([
    ['entries', 'select, insert'],
    ['entry_corrections', 'select, insert, update, delete'],
    ['sources', 'select, insert, update, delete'],
    ['work_item_steps', 'select, insert, update, delete'],
    ['person_settings', 'select, insert, update'],
    ['goals', 'select, insert, update'],
    ['targets', 'select, insert, update'],
    ['work_items', 'select, insert, update, delete'],
  ])('%s grants the authenticated role at least what the fake allows the service', (table, grant) => {
    expect(sql).toContain(`grant ${grant} on table public.${table} to authenticated;`);
  });

  it('an entry can be neither updated nor deleted by the person: a removal is a correction', () => {
    expect(sql).toContain('grant select, insert on table public.entries to authenticated;');
    expect(sql).not.toMatch(/grant[^;]*\b(update|delete)\b[^;]*on table public\.entries to authenticated/i);
  });
});
