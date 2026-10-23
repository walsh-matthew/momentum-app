// Static checks over supabase/migrations/*.sql. They do not run SQL (that is what supabase/verify/ is
// for); they stop the TypeScript side drifting from the schema:
// - every CHECK constraint the in-memory fake enforces really exists in the migrations,
// - the enum values in types/database.types.ts match the CHECK lists,
// - the invariants "never cut work", "the user owns completion" and "history is append-only" are
//   still written into the SQL that implements them.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONSTRAINTS,
  CREDENTIAL_STATUSES,
  GOAL_CHANNEL_STATUSES,
  GOAL_TYPES,
  PACES,
  INTEGRATION_AUTH_TYPES,
  SHIFT_TYPES,
  TASK_STATUSES,
  TASK_TYPES,
} from '@/types/database.types';

const DIR = join(process.cwd(), 'supabase', 'migrations');
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
const sqlOf = (prefix: string) => {
  const file = files.find((f) => f.startsWith(prefix));
  if (!file) throw new Error(`no migration ${prefix}`);
  // Comments say "never delete" and similar; only the statements count.
  return readFileSync(join(DIR, file), 'utf8').replace(/--.*$/gm, '');
};
const all = files.map((f) => sqlOf(f.slice(0, 3))).join('\n');

// The text of a constraint's check list, e.g. `status in ('todo', 'done')`, as a set of values.
function inList(sql: string, constraint: string): string[] {
  const match = new RegExp(`constraint ${constraint}\\s+check\\s*\\(\\s*(?:[a-z_]+)\\s+in\\s*\\(([^)]*)\\)`, 'i').exec(sql);
  if (!match) throw new Error(`no IN-list check named ${constraint}`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('migration files', () => {
  it('are numbered 001, 002, ... with no gaps', () => {
    expect(files.map((f) => f.slice(0, 3))).toEqual(files.map((_, i) => String(i + 1).padStart(3, '0')));
  });
});

describe('CHECK constraints the fake enforces exist in the SQL', () => {
  it.each([
    'micro_tasks_week_of_positive',
    'micro_tasks_carried_from_earlier_week',
    'micro_tasks_pulled_from_later_week',
    'micro_tasks_single_move_marker',
    'micro_tasks_completed_at_matches_status',
    'task_rebalance_history_weeks_positive',
    'task_rebalance_history_direction',
    'task_rebalance_history_shift_type_check',
    'goal_channels_goal_type_check',
    'goal_channels_preferences_shape',
  ])('%s', (name) => expect(all).toMatch(new RegExp(`constraint ${name}\\b`, 'i')));

  it('micro_tasks: done exactly when completed_at is set', () => {
    expect(sqlOf('001')).toMatch(/micro_tasks_completed_at_matches_status\s+check\s*\(\s*\(status = 'done'\) = \(completed_at is not null\)\s*\)/i);
  });
  it('micro_tasks: a carry-over comes from an earlier week, a pull-forward from a later one', () => {
    const sql = sqlOf('001');
    expect(sql).toMatch(/carried_from_week >= 1 and carried_from_week < week_of/);
    expect(sql).toMatch(/pulled_from_week > week_of/);
  });
  it('task_rebalance_history: direction is tied to the shift type', () => {
    const sql = sqlOf('003');
    expect(sql).toMatch(/shift_type = 'carry_over' and target_week > source_week/);
    expect(sql).toMatch(/shift_type = 'pull_forward' and target_week < source_week/);
  });
});

describe('enum values match types/database.types.ts', () => {
  it('task statuses', () => expect(inList(sqlOf('001'), 'micro_tasks_status_check')).toEqual([...TASK_STATUSES]));
  it('task types', () => expect(inList(sqlOf('001'), 'micro_tasks_task_type_check').sort()).toEqual([...TASK_TYPES].sort()));
  it('goal channel statuses', () => {
    expect(inList(sqlOf('001'), 'goal_channels_status_check')).toEqual([...GOAL_CHANNEL_STATUSES]);
  });
  it('shift types', () => {
    expect(inList(sqlOf('003'), 'task_rebalance_history_shift_type_check')).toEqual([...SHIFT_TYPES]);
  });
});

// MOM-34: the wizard's answers are stored on goal_channels, and the SQL lists must be the TypeScript ones.
describe('goal_channels wizard answers (migration 008)', () => {
  const sql = sqlOf('008');

  it('goal types', () => expect(inList(sql, 'goal_channels_goal_type_check')).toEqual([...GOAL_TYPES]));
  it('constraints in the preferences check', () => {
    const list = /<@\s*'\[([^\]]*)\]'::jsonb/.exec(sql)?.[1] ?? '';
    expect([...list.matchAll(/"([^"]+)"/g)].map((m) => m[1])).toEqual([...CONSTRAINTS]);
  });
  it('paces in the preferences check', () => {
    const list = /\(preferences ->> 'pace'\)\s+in\s*\(([^)]*)\)/.exec(sql)?.[1] ?? '';
    expect([...list.matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...PACES]);
  });
  it('preferences allow only the two answers', () => {
    expect(sql).toMatch(/\(preferences - 'constraints' - 'pace'\) = '\{\}'::jsonb/);
  });
  it('goal_type is nullable and preferences defaults to an empty object', () => {
    expect(sql).toMatch(/add column goal_type\s+text,/);
    expect(sql).toMatch(/add column preferences jsonb not null default '\{\}'::jsonb/);
  });
  it('a new goal cannot start with a ticked criterion, but the owner can still tick one later', () => {
    expect(sql).toMatch(/create trigger goal_channels_guard_new_criteria\s+before insert on public\.goal_channels/i);
    expect(sql).not.toMatch(/before (insert or update|update)/i);
    expect(sql).toMatch(/\(c -> 'done'\) is distinct from 'false'::jsonb/);
  });
  it('the guard function is not executable by API roles', () => {
    expect(sql).toMatch(/revoke execute on function public\.goal_channels_guard_new_criteria\(\) from public, anon, authenticated, service_role/);
  });
  it('the signup seed records the type, and the backfill covers only the seeded default', () => {
    expect(sql).toMatch(/criteria, goal_type\)/);
    expect(sql).toMatch(/where is_default and channel_key = 'career_pivot' and goal_type is null/);
  });
});

describe('the user owns completion (migration 002)', () => {
  const sql = sqlOf('002');
  it('guards inserts and updates on micro_tasks with a trigger', () => {
    expect(sql).toMatch(/create trigger micro_tasks_guard_completion\s+before insert or update on public\.micro_tasks/i);
  });
  it('allows a change only for the authenticated owner', () => {
    expect(sql).toMatch(/current_user <> 'authenticated'/);
    expect(sql).toMatch(/auth\.uid\(\) is distinct from new\.user_id/);
  });
  it('covers both status and completed_at, and fails with a permission error', () => {
    expect(sql).toMatch(/new\.status is distinct from old\.status/);
    expect(sql).toMatch(/new\.completed_at is distinct from old\.completed_at/);
    expect(sql).toMatch(/errcode = '42501'/);
  });
});

describe('rebalancing moves work and nothing else (migration 003)', () => {
  const sql = sqlOf('003');
  const fn = /create or replace function public\.apply_task_move[\s\S]*?\n\$\$;/i.exec(sql)?.[0] ?? '';
  const setClause = /\bset\b([\s\S]*?)\bwhere\b/i.exec(fn.slice(fn.indexOf('update public.micro_tasks')))?.[1] ?? '';

  it('finds the function and its SET clause', () => {
    expect(fn).not.toBe('');
    expect(setClause).toMatch(/week_of/);
  });
  it('never sets status or completed_at, and never deletes', () => {
    expect(setClause).not.toMatch(/status|completed_at/i);
    expect(fn).not.toMatch(/\bdelete\b/i);
  });
  it('only moves an unfinished task owned by the signed-in user', () => {
    expect(fn).toMatch(/user_id = v_uid/);
    expect(fn).toMatch(/status = 'todo'/);
    expect(fn).toMatch(/auth\.uid\(\)/);
  });
  it('is callable only by signed-in users', () => {
    expect(sql).toMatch(/revoke execute on function public\.apply_task_move\([^)]*\)\s+from public, anon, authenticated, service_role/i);
    expect(sql).toMatch(/grant execute on function public\.apply_task_move\([^)]*\) to authenticated/i);
  });
});

describe('task_rebalance_history is append-only for API roles', () => {
  const sql = sqlOf('003');
  it('revokes everything, then grants SELECT only', () => {
    expect(sql).toMatch(/revoke all on table public\.task_rebalance_history from anon, authenticated, service_role/i);
    expect(sql).toMatch(/grant select on table public\.task_rebalance_history to authenticated/i);
  });
  it('has no insert, update or delete policy anywhere', () => {
    expect(all).not.toMatch(/create policy[^;]*on public\.task_rebalance_history\s+for (insert|update|delete|all)/i);
  });
  it('is removed with its task and with the account', () => {
    expect(sql).toMatch(/foreign key \(task_id, user_id\) references public\.micro_tasks \(id, user_id\) on delete cascade/i);
    expect(sql).toMatch(/user_id\s+uuid not null references public\.users \(id\) on delete cascade/i);
  });
});

describe('functions only the database should call have no EXECUTE grant', () => {
  it.each([
    ['002', 'micro_tasks_guard_completion'],
    ['004', 'micro_tasks_record_initial_move'],
  ])('migration %s: %s', (prefix, fn) => {
    expect(sqlOf(prefix)).toMatch(new RegExp(`revoke execute on function public\\.${fn}\\(\\) from public, anon, authenticated, service_role`, 'i'));
  });
  it('seed_career_pivot is not callable by API roles', () => {
    expect(sqlOf('001')).toMatch(/revoke execute on function public\.seed_career_pivot\(uuid\) from public, anon, authenticated/i);
  });
});

describe('provider tokens are out of reach of the browser (migration 005)', () => {
  const sql = sqlOf('005');

  it('removes the browser-readable connected_apps.credentials column', () => {
    expect(sql).toMatch(/alter table public\.connected_apps drop column credentials/i);
    expect(sql).toMatch(/alter table public\.connected_apps drop constraint connected_apps_credentials_is_object/i);
  });
  it('turns row level security on and takes every grant from the API roles', () => {
    expect(sql).toMatch(/alter table public\.integration_credentials enable row level security/i);
    expect(sql).toMatch(/revoke all on table public\.integration_credentials from anon, authenticated/i);
  });
  it('defines no policy and grants nothing to a browser role', () => {
    expect(all).not.toMatch(/create policy[^;]*on public\.integration_credentials/i);
    expect(all).not.toMatch(/grant [^;]*on (table )?public\.integration_credentials[^;]* to [^;]*\b(anon|authenticated|public)\b/i);
  });
  it('ties each credential to a connected app of the same user, and removes it with the app', () => {
    expect(sql).toMatch(
      /foreign key \(user_id, provider\) references public\.connected_apps \(user_id, provider\) on delete cascade/i,
    );
    expect(sql).toMatch(/integration_credentials_user_provider_unique unique \(user_id, provider\)/i);
  });
  it('keeps the auth type and status lists in step with the TypeScript types', () => {
    expect(inList(sql, 'integration_credentials_auth_type_check')).toEqual([...INTEGRATION_AUTH_TYPES]);
    expect(inList(sql, 'integration_credentials_status_check')).toEqual([...CREDENTIAL_STATUSES]);
  });
  it.each(['integration_credentials_secret_matches_type', 'integration_credentials_secrets_not_blank'])(
    'has the %s constraint the fake enforces',
    (name) => expect(sql).toMatch(new RegExp(`constraint ${name}\\b`, 'i')),
  );
  it('an OAuth credential has an access token and no key; a key credential has a key and no tokens', () => {
    expect(sql).toMatch(/auth_type = 'oauth2'\s+and access_token is not null and api_key is null/i);
    expect(sql).toMatch(/auth_type = 'api_key' and api_key is not null and access_token is null and refresh_token is null/i);
  });
});

describe('the service role is granted the credential table explicitly (migration 006)', () => {
  // This project's default privileges give the API roles no read/write on new tables, and 005 assumed
  // otherwise, so the service role could not use the table until 006 granted it.
  it('grants select, insert, update and delete to service_role and to nobody else', () => {
    const sql = sqlOf('006');
    expect(sql).toMatch(
      /grant select, insert, update, delete on table public\.integration_credentials to service_role\s*;/i,
    );
    expect(sql).not.toMatch(/\bto\b[^;]*\b(anon|authenticated|public)\b/i);
  });
});

describe('ingested tasks record their source (migration 007)', () => {
  const sql = sqlOf('007');

  it('adds the three source columns to micro_tasks', () => {
    for (const [column, type] of [
      ['source_provider', 'text'],
      ['source_external_id', 'text'],
      ['source_evidence', 'jsonb'],
    ]) {
      expect(sql).toMatch(new RegExp(`add column\\s+${column}\\s+${type}\\b`, 'i'));
    }
  });
  it.each([
    'micro_tasks_source_pair',
    'micro_tasks_source_evidence_object',
    'micro_tasks_source_external_id_not_blank',
    'micro_tasks_source_unique',
  ])('has the %s constraint the fake enforces', (name) => expect(sql).toMatch(new RegExp(`constraint ${name}\\b`, 'i')));

  it('a source is a provider plus an id, both or neither', () => {
    expect(sql).toMatch(/\(source_provider is null\) = \(source_external_id is null\)/);
  });
  it('is unique per user, as a plain constraint so an insert can name it', () => {
    expect(sql).toMatch(/unique \(user_id, source_provider, source_external_id\)/i);
    expect(sql).not.toMatch(/create (unique )?index/i);
  });
  it('only adds structure: it does not touch status or completed_at', () => {
    expect(sql).not.toMatch(/\b(status|completed_at)\b/i);
    expect(sql).not.toMatch(/\b(update|delete|insert)\b/i);
  });
});
