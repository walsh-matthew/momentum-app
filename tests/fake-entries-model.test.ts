// Keeps tests/helpers/fakeEntriesModel.ts honest (MOM-110): every constraint and policy name it enforces really exists in
// migration 013, and the grants it assumes for the authenticated role are the ones the migration gives. The SQL itself
// is exercised by supabase/verify/013_goal_model_tables.sql; this only stops the fake drifting from it.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENFORCED_CONSTRAINTS, ENFORCED_REVIEW_CONSTRAINTS } from './helpers/fakeEntriesModel';

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
    ['period_snapshots', 'select, insert'],
  ])('%s grants the authenticated role at least what the fake allows the service', (table, grant) => {
    expect(sql).toContain(`grant ${grant} on table public.${table} to authenticated;`);
  });

  it('an entry can be neither updated nor deleted by the person: a removal is a correction', () => {
    expect(sql).toContain('grant select, insert on table public.entries to authenticated;');
    expect(sql).not.toMatch(/grant[^;]*\b(update|delete)\b[^;]*on table public\.entries to authenticated/i);
  });
});

// Migration 018 (MOM-113): the weekly_reviews table the fake also stands in for.
const sql018 = readFileSync(join(process.cwd(), 'supabase', 'migrations', '018_weekly_reviews.sql'), 'utf8').replace(/--.*$/gm, '');

describe('the goal model fake matches migration 018', () => {
  it.each([...ENFORCED_REVIEW_CONSTRAINTS])('%s exists in the SQL', (name) => {
    expect(sql018).toMatch(new RegExp(`(constraint|policy)\\s+"?${name}"?\\b`, 'i'));
  });

  it('the person can select and insert a record and nothing else, as the fake allows', () => {
    expect(sql018).toContain('grant select, insert on table public.weekly_reviews to authenticated;');
    expect(sql018).not.toMatch(/grant[^;]*\b(update|delete)\b[^;]*on table public\.weekly_reviews/i);
  });

  it('finished_at is set by a BEFORE INSERT trigger, as the fake does', () => {
    expect(sql018).toMatch(/create trigger weekly_reviews_set_finished_at before insert on public\.weekly_reviews/);
    expect(sql018).toMatch(/new\.finished_at := now\(\)/);
  });
});
