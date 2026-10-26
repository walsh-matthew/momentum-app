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
  BALANCE_MENTIONS,
  CAPACITY_UNITS,
  CARRY_OVER_KINDS,
  CELEBRATION_LEVELS,
  CHECK_IN_MODES,
  COMPLETED_VIA,
  COMPLETION_MODES,
  CONSTRAINTS,
  CORRECTION_ACTIONS,
  CREDENTIAL_STATUSES,
  GOAL_CHANNEL_STATUSES,
  GOAL_SHAPES,
  GOAL_STATES,
  GOAL_TYPES,
  MEASURES,
  PACES,
  PERIOD_KINDS,
  INTEGRATION_AUTH_TYPES,
  LLM_FEATURES,
  LLM_OUTCOMES,
  REMINDER_MODES,
  RETURN_KINDS,
  REVIEW_DEPTHS,
  REVIEW_PLANNING_MODES,
  SHIFT_TYPES,
  SOURCE_KINDS,
  TARGET_ROLES,
  TASK_STATUSES,
  TASK_TYPES,
  TONES,
  WORK_ITEM_KINDS,
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
    // The week 1 plan path (migration 009) inserts tasks, so the fake enforces these two as well.
    'micro_tasks_title_not_blank',
    'micro_tasks_task_type_check',
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

describe('new accounts start empty (migration 010, MOM-19)', () => {
  const sql = sqlOf('010');

  it('replaces the signup trigger function without the seed call', () => {
    expect(sql).toMatch(/create or replace function public\.handle_new_user\(\)/i);
    expect(sql).toMatch(/insert into public\.users \(id\) values \(new\.id\) on conflict \(id\) do nothing/i);
    expect(sql).not.toMatch(/seed_career_pivot/i);
  });
  it('is still security definer with an empty search_path', () => {
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = ''/i);
  });
  it('changes no privileges and touches no existing row or function', () => {
    expect(sql).not.toMatch(/\b(grant|revoke)\b/i);
    expect(sql).not.toMatch(/\b(update|delete|drop|alter|truncate)\b/i);
    expect(sql).not.toMatch(/create trigger/i);
  });
  it('leaves the seed function defined, for dev seeding', () => {
    expect(sqlOf('008')).toMatch(/create or replace function public\.seed_career_pivot\(p_user_id uuid\)/i);
    expect(sql).not.toMatch(/function public\.seed_career_pivot/i);
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

describe('the signup and RLS trigger functions are closed to API roles (migration 012, MOM-65)', () => {
  const sql = sqlOf('012');

  it('revokes handle_new_user from public and every API role, and keeps the auth service role', () => {
    expect(sql).toMatch(/revoke execute on function public\.handle_new_user\(\) from public, anon, authenticated, service_role/i);
    expect(sql).toMatch(/grant execute on function public\.handle_new_user\(\) to supabase_auth_admin/i);
    expect(sql).not.toMatch(/grant execute[^;]*\bto\b[^;]*\b(public|anon|authenticated|service_role)\b/i);
  });
  it('revokes rls_auto_enable only when it exists, and stops the migration if an API role can still run it', () => {
    expect(sql).toMatch(/if exists \([\s\S]*proname = 'rls_auto_enable'[\s\S]*\) then/i);
    expect(sql).toMatch(/revoke execute on function public\.rls_auto_enable\(\) from public, anon, authenticated, service_role/i);
    expect(sql).toMatch(/has_function_privilege\('authenticated', 'public\.rls_auto_enable\(\)', 'execute'\)/i);
    expect(sql).toMatch(/raise exception[\s\S]*errcode = '42501'/i);
  });
  it('only narrows privileges: no new function, trigger, policy, table change or row change', () => {
    expect(sql).not.toMatch(/\b(create|drop|alter|insert|update|delete|truncate)\b/i);
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

describe('LLM usage logs and limits (migration 011, MOM-73)', () => {
  const sql = sqlOf('011');
  // The statement that defines the function, so the order of its checks can be read.
  const reserve = sql.slice(sql.indexOf('create function public.reserve_llm_call'));

  it('the feature and outcome lists match types/database.types.ts', () => {
    expect(inList(sql, 'llm_usage_logs_feature_check')).toEqual([...LLM_FEATURES]);
    expect(inList(sql, 'llm_usage_logs_outcome_check')).toEqual([...LLM_OUTCOMES]);
  });

  it('has exactly the approved columns: nothing that could hold a prompt or an answer', () => {
    const body = /create table public\.llm_usage_logs \(([\s\S]*?)\n\);/.exec(sql)![1];
    const columns = [...body.matchAll(/^\s{2}([a-z_]+)\s+(uuid|text|integer|timestamptz)\b/gm)].map((m) => m[1]);
    expect(columns).toEqual(['id', 'user_id', 'feature', 'model', 'input_tokens', 'output_tokens', 'latency_ms', 'outcome', 'created_at']);
    expect(body).not.toMatch(/\b(jsonb?|bytea|xml)\b|\[\]/i);
    // The only text columns are the three that hold a fixed word or a model id, and the model id is length-limited.
    expect([...body.matchAll(/^\s{2}([a-z_]+)\s+text\b/gm)].map((m) => m[1])).toEqual(['feature', 'model', 'outcome']);
    expect(sql).toMatch(/length\(model\) between 1 and 100/);
  });

  it('has the CHECK constraints the fake enforces', () => {
    for (const name of ['llm_usage_logs_tokens_check', 'llm_usage_logs_latency_check', 'llm_usage_logs_finished_check']) {
      expect(sql).toMatch(new RegExp(`constraint ${name}\\b`));
    }
    expect(sql).toMatch(/\(outcome = 'pending'\) = \(latency_ms is null\)/);
  });

  it('is read-only for a signed-in user, limited to their own rows, and closed to a signed-out client', () => {
    expect(sql).toMatch(/alter table public\.llm_usage_logs enable row level security/);
    expect(sql).toMatch(/revoke all on table public\.llm_usage_logs from anon, authenticated, service_role/);
    expect(sql).toMatch(/grant select on table public\.llm_usage_logs to authenticated/);
    expect(sql).toMatch(/for select to authenticated using \(\(select auth\.uid\(\)\) = user_id\)/);
    // No grant to authenticated beyond select, and none at all to anon.
    expect(sql).not.toMatch(/grant [^;]*\bto\b[^;]*\banon\b/i);
    expect([...sql.matchAll(/grant ([a-z, ]+) on table public\.llm_usage_logs to authenticated/g)].map((m) => m[1])).toEqual(['select']);
  });

  it('the service role can read, insert and update, and cannot delete', () => {
    expect(sql).toMatch(/grant select, insert, update on table public\.llm_usage_logs to service_role/);
    expect(sql).not.toMatch(/grant [^;]*\bdelete\b[^;]*llm_usage_logs/i);
  });

  it('only the service role can reserve a call: it is taken from everyone else, then granted to it alone', () => {
    expect(sql).toMatch(
      /revoke execute on function public\.reserve_llm_call\(uuid, text, text, integer, integer, integer\)\s+from public, anon, authenticated, service_role/,
    );
    expect(sql).toMatch(/grant execute on function public\.reserve_llm_call\([^)]*\) to service_role/);
    expect(sql).not.toMatch(/grant execute on function public\.reserve_llm_call\([^)]*\) to [^;]*\b(authenticated|anon|public)\b/);
  });

  it('checks the limits in the order the service and the fake report them: your cap, the shared cap, then the spacing', () => {
    const order = ["'user_daily'", "'overall_daily'", "'too_soon'"].map((word) => reserve.indexOf(word));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('is atomic: one lock covers the check and the insert, and the clock is the database\'s', () => {
    expect(reserve).toMatch(/pg_advisory_xact_lock\(/);
    expect(reserve.indexOf('pg_advisory_xact_lock')).toBeLessThan(reserve.indexOf('insert into public.llm_usage_logs'));
    expect(reserve).toMatch(/clock_timestamp\(\)/);
  });

  it('counts a rolling 24 hours, not a calendar day', () => {
    expect(reserve).toMatch(/interval '24 hours'/);
    expect(reserve).not.toMatch(/date_trunc/i);
  });

  it('a refusal returns before the insert, so a refused call writes nothing', () => {
    const insertAt = reserve.indexOf('insert into public.llm_usage_logs');
    for (const reason of ["'user_daily'", "'overall_daily'", "'too_soon'"]) {
      expect(reserve.indexOf(reason)).toBeLessThan(insertAt);
    }
  });

  it('a finished row cannot change, and its user, feature, model and time never do', () => {
    expect(sql).toMatch(/if old\.outcome <> 'pending' then/);
    expect(sql).toMatch(/new\.user_id <> old\.user_id/);
    expect(sql).toMatch(/new\.created_at <> old\.created_at/);
    expect(sql).toMatch(/create trigger llm_usage_logs_guard before update/);
  });

  it('the owner\'s daily view is for the service role alone', () => {
    expect(sql).toMatch(/create view public\.llm_usage_daily with \(security_invoker = true\)/);
    expect(sql).toMatch(/revoke all on table public\.llm_usage_daily from anon, authenticated, service_role/);
    expect(sql).toMatch(/grant select on table public\.llm_usage_daily to service_role/);
  });

  it('only adds a usage table: it does not touch tasks, status or completed_at', () => {
    expect(sql).not.toMatch(/\b(status|completed_at)\b/i);
    expect(sql).not.toMatch(/micro_tasks|task_rebalance_history|goal_channels/);
  });
});

describe('the goal model tables (migration 013, MOM-107)', () => {
  const sql = sqlOf('013');
  const NEW_TABLES = [
    'person_settings',
    'person_day_types',
    'person_priorities',
    'person_handling_rules',
    'goals',
    'targets',
    'work_items',
    'work_item_steps',
    'sources',
    'target_sources',
    'entries',
    'entry_corrections',
    'period_snapshots',
  ] as const;
  // What each API role is granted, as approved by the owner. anon gets nothing anywhere.
  const APPROVED: Record<string, { authenticated: string; service_role: string }> = {
    person_settings: { authenticated: 'select, insert, update', service_role: '' },
    person_day_types: { authenticated: 'select, insert, update, delete', service_role: '' },
    person_priorities: { authenticated: 'select, insert, update, delete', service_role: '' },
    person_handling_rules: { authenticated: 'select, insert, update, delete', service_role: '' },
    goals: { authenticated: 'select, insert, update', service_role: '' },
    targets: { authenticated: 'select, insert, update', service_role: '' },
    work_items: { authenticated: 'select, insert, update, delete', service_role: '' },
    work_item_steps: { authenticated: 'select, insert, update, delete', service_role: '' },
    sources: { authenticated: 'select, insert, update, delete', service_role: 'select' },
    target_sources: { authenticated: 'select, insert, delete', service_role: 'select' },
    entries: { authenticated: 'select, insert', service_role: 'select, insert, update' },
    entry_corrections: { authenticated: 'select, insert, update, delete', service_role: '' },
    period_snapshots: { authenticated: 'select, insert', service_role: '' },
  };
  const grantsOf = (table: string, role: string) =>
    [...sql.matchAll(new RegExp(`grant ([a-z, ]+) on table public\\.${table} to ${role}\\b`, 'g'))].map((m) => m[1]).join(', ');
  const policiesOn = (table: string) =>
    [...sql.matchAll(new RegExp(`create policy "[^"]+" on public\\.${table}\\s+for (select|insert|update|delete|all)`, 'g'))].map((m) => m[1]);
  const bodyOf = (table: string) => new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`).exec(sql)?.[1] ?? '';

  it('creates exactly the 13 approved tables, each with row level security', () => {
    expect([...sql.matchAll(/create table public\.([a-z_]+)/g)].map((m) => m[1])).toEqual([...NEW_TABLES]);
    for (const table of NEW_TABLES) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table}\\s+enable row level security`));
    }
  });

  it('adds only new tables: no old table, function or row is changed', () => {
    const altered = [...sql.matchAll(/alter table public\.([a-z_]+)/g)].map((m) => m[1]);
    expect(altered.filter((t) => !(NEW_TABLES as readonly string[]).includes(t))).toEqual([]);
    expect(sql).not.toMatch(/\b(drop|truncate|delete from|insert into|update public)\b/i);
    expect(sql).not.toMatch(/create (or replace )?function/i);
    expect(sql).not.toMatch(/on public\.(goal_channels|micro_tasks|task_rebalance_history|connected_apps|users)\b/);
    expect(sql).not.toMatch(/references public\.(goal_channels|micro_tasks|task_rebalance_history|connected_apps)\b/);
  });

  it('takes every default privilege back (TRUNCATE, REFERENCES and TRIGGER included), then grants only the approved', () => {
    const revoke = /revoke all on table([\s\S]*?)from anon, authenticated, service_role/i.exec(sql)?.[1] ?? '';
    expect([...revoke.matchAll(/public\.([a-z_]+)/g)].map((m) => m[1])).toEqual([...NEW_TABLES]);
    for (const table of NEW_TABLES) {
      expect(grantsOf(table, 'authenticated'), `${table} authenticated`).toBe(APPROVED[table].authenticated);
      expect(grantsOf(table, 'service_role'), `${table} service_role`).toBe(APPROVED[table].service_role);
    }
  });

  it('grants nothing to anon or public, and never truncate, references, trigger or all', () => {
    expect(sql).not.toMatch(/grant [^;]*\bto\b[^;]*\b(anon|public)\b/i);
    expect(sql).not.toMatch(/grant [^;]*\b(truncate|references|trigger|all)\b/i);
  });

  it('has a policy for each operation a person is granted, and no other', () => {
    for (const table of NEW_TABLES) {
      expect(policiesOn(table).sort(), table).toEqual(APPROVED[table].authenticated.split(', ').sort());
    }
    expect(sql).not.toMatch(/create policy[^;]*\bto (anon|public|service_role)\b/i);
    expect([...sql.matchAll(/create policy/g)]).toHaveLength(
      NEW_TABLES.reduce((sum, t) => sum + APPROVED[t].authenticated.split(', ').length, 0),
    );
  });

  it('period_snapshots are append-only: select and insert for the person, nothing for the service role', () => {
    expect(grantsOf('period_snapshots', 'authenticated')).toBe('select, insert');
    expect(grantsOf('period_snapshots', 'service_role')).toBe('');
    expect(policiesOn('period_snapshots').sort()).toEqual(['insert', 'select']);
  });

  it('entries: a person writes only through their own manual sources, and nobody deletes', () => {
    expect(sql).toMatch(/create policy "entries_insert_own_manual" on public\.entries\s+for insert to authenticated/);
    expect(sql).toMatch(/s\.id = entries\.source_id and s\.user_id = entries\.user_id and s\.kind = 'manual'/);
    expect(policiesOn('entries').sort()).toEqual(['insert', 'select']);
    expect(grantsOf('entries', 'authenticated')).not.toMatch(/update|delete/);
    expect(grantsOf('entries', 'service_role')).not.toMatch(/delete/);
  });

  it('goals and targets cannot be deleted by an API role: a person parks a goal', () => {
    for (const table of ['goals', 'targets']) {
      expect(grantsOf(table, 'authenticated')).not.toMatch(/delete/);
      expect(policiesOn(table)).not.toContain('delete');
    }
  });

  it('every table is owned by one person and removed with the account', () => {
    for (const table of NEW_TABLES) {
      expect(bodyOf(table), table).toMatch(/user_id\s+uuid (primary key |not null )?references public\.users \(id\) on delete cascade/);
    }
  });

  it('every table with an updated_at column has the trigger that sets it', () => {
    for (const table of NEW_TABLES) {
      if (/\bupdated_at\b/.test(bodyOf(table))) {
        expect(sql, table).toMatch(new RegExp(`create trigger ${table}_set_updated_at before update on public\\.${table}`));
      }
    }
  });

  it("rows that point at another table use a same-owner key, so one person cannot link to another person's row", () => {
    for (const parent of ['goals', 'targets', 'sources', 'work_items']) {
      expect(sql).toMatch(new RegExp(`constraint ${parent}_id_user_unique unique \\(id, user_id\\)`));
    }
    expect(sql).toMatch(/foreign key \(goal_id, user_id\) references public\.goals \(id, user_id\)/);
    expect(sql).toMatch(/foreign key \(target_id, user_id\) references public\.targets \(id, user_id\)/);
    expect(sql).toMatch(/foreign key \(source_id, user_id\) references public\.sources \(id, user_id\)/);
    expect(sql).toMatch(/foreign key \(work_item_id, user_id\)\s+references public\.work_items \(id, user_id\)/);
  });

  describe('never assume anything about the person', () => {
    it('person_settings: every time anchor and setting is nullable with no default', () => {
      const settings = bodyOf('person_settings');
      for (const column of [
        'time_zone', 'week_start', 'day_end', 'tone', 'reminders', 'check_ins', 'celebrations', 'balance_mentions',
        'review_depth', 'review_planning', 'quiet_times', 'slipping_periods', 'planning_weekday', 'planning_time',
      ]) {
        const line = new RegExp(`^\\s{2}${column}\\s+[a-z]+\\s*,`, 'm').exec(settings)?.[0];
        expect(line, column).toBeDefined();
        expect(line, column).not.toMatch(/not null|default/i);
      }
    });
    it("a goal's start date is required with no default, and so is a deadline task's \"date can move\" answer", () => {
      expect(bodyOf('goals')).toMatch(/^\s{2}start_date\s+date not null,/m);
      expect(bodyOf('work_items')).toMatch(/^\s{2}date_can_move\s+boolean,/m);
      expect(sql).toMatch(/constraint work_items_date_can_move_matches_kind check \(\(kind = 'deadline_task'\) = \(date_can_move is not null\)\)/);
    });
    it('no column has a default time zone, week start or day end', () => {
      expect(sql).not.toMatch(/\b(time_zone|week_start|day_end)\b[^,\n]*\bdefault\b/i);
    });
  });

  describe('enum lists match types/database.types.ts', () => {
    it('person_settings and person_day_types', () => {
      expect(inList(sql, 'person_settings_tone_check')).toEqual([...TONES]);
      expect(inList(sql, 'person_settings_reminders_check')).toEqual([...REMINDER_MODES]);
      expect(inList(sql, 'person_settings_check_ins_check')).toEqual([...CHECK_IN_MODES]);
      expect(inList(sql, 'person_settings_celebrations_check')).toEqual([...CELEBRATION_LEVELS]);
      expect(inList(sql, 'person_settings_balance_mentions_check')).toEqual([...BALANCE_MENTIONS]);
      expect(inList(sql, 'person_settings_review_depth_check')).toEqual([...REVIEW_DEPTHS]);
      expect(inList(sql, 'person_settings_review_planning_check')).toEqual([...REVIEW_PLANNING_MODES]);
      expect(inList(sql, 'person_day_types_capacity_unit_check')).toEqual([...CAPACITY_UNITS]);
    });
    it('goals', () => {
      expect(inList(sql, 'goals_shape_check')).toEqual([...GOAL_SHAPES]);
      expect(inList(sql, 'goals_state_check')).toEqual([...GOAL_STATES]);
      expect(inList(sql, 'goals_return_kind_check')).toEqual([...RETURN_KINDS]);
      expect(inList(sql, 'goals_completion_mode_check')).toEqual([...COMPLETION_MODES]);
      expect(inList(sql, 'goals_tone_check')).toEqual([...TONES]);
    });
    it('targets and their snapshots', () => {
      for (const table of ['targets', 'period_snapshots']) {
        expect(inList(sql, `${table}_measure_check`)).toEqual([...MEASURES]);
        expect(inList(sql, `${table}_role_check`)).toEqual([...TARGET_ROLES]);
        expect(inList(sql, `${table}_period_kind_check`)).toEqual([...PERIOD_KINDS]);
        expect(inList(sql, `${table}_carry_over_kind_check`)).toEqual([...CARRY_OVER_KINDS]);
      }
      expect(inList(sql, 'targets_completion_mode_check')).toEqual([...COMPLETION_MODES]);
      expect(inList(sql, 'targets_tone_check')).toEqual([...TONES]);
    });
    it('work items, steps, sources and corrections', () => {
      expect(inList(sql, 'work_items_kind_check')).toEqual([...WORK_ITEM_KINDS]);
      expect(inList(sql, 'work_items_completed_via_check')).toEqual([...COMPLETED_VIA]);
      expect(inList(sql, 'work_item_steps_completed_via_check')).toEqual([...COMPLETED_VIA]);
      expect(inList(sql, 'sources_kind_check')).toEqual([...SOURCE_KINDS]);
      expect(inList(sql, 'entry_corrections_action_check')).toEqual([...CORRECTION_ACTIONS]);
    });
  });

  describe('the rules the engine and the services rely on', () => {
    it('a correction is unique per source and source record id, with no foreign key to entries', () => {
      expect(sql).toMatch(/constraint entry_corrections_source_record_unique unique \(source_id, source_record_id\)/);
      expect(bodyOf('entry_corrections')).not.toMatch(/references public\.entries/);
    });
    it('a resync of the same record is the same entry', () => {
      expect(sql).toMatch(/constraint entries_target_source_record_unique unique \(target_id, source_id, source_record_id\)/);
    });
    it('entries carry only a raw value: no total, count or sum column', () => {
      const body = bodyOf('entries');
      const columns = [...body.matchAll(/^\s{2}([a-z_]+)\s+(uuid|text|timestamptz|numeric|jsonb)\b/gm)].map((m) => m[1]);
      expect(columns).toEqual([
        'id', 'user_id', 'target_id', 'source_id', 'source_record_id', 'work_item_id', 'occurred_at', 'value', 'evidence', 'created_at', 'updated_at',
      ]);
      expect([...body.matchAll(/^\s{2}([a-z_]+)\s+numeric\b/gm)].map((m) => m[1])).toEqual(['value']);
    });
    it('history is never cut: the links to goals, targets and sources have no ON DELETE action', () => {
      for (const constraint of ['targets_goal_fk', 'work_items_goal_fk', 'work_items_target_fk', 'entries_target_fk', 'entries_source_fk', 'period_snapshots_target_fk']) {
        const fk = new RegExp(`constraint ${constraint} foreign key[^;]*?references public\\.[a-z_]+ \\(id, user_id\\)(\\s+on delete)?`).exec(sql);
        expect(fk, constraint).not.toBeNull();
        expect(fk?.[1], constraint).toBeUndefined();
      }
    });
    it("a work item's steps go with it, and its entries stay", () => {
      expect(sql).toMatch(/foreign key \(work_item_id, user_id\)\s+references public\.work_items \(id, user_id\) on delete cascade/);
      expect(sql).toMatch(/references public\.work_items \(id, user_id\)\s+on delete set null \(work_item_id\)/);
    });
    it("a snapshot copies the target's values and the anchors in force, is unique per target and period, and holds no result", () => {
      expect(sql).toMatch(/constraint period_snapshots_target_period_unique unique \(target_id, period_start\)/);
      const body = bodyOf('period_snapshots');
      for (const column of ['time_zone', 'week_start', 'day_end', 'measure', 'role', 'period_kind', 'floor', 'aspiration', 'qualifying_threshold', 'carry_over_kind']) {
        expect(body, column).toMatch(new RegExp(`^\\s{2}${column}\\s`, 'm'));
      }
      expect(body).not.toMatch(/^\s{2}(total|result|count|progress|score)\w*\s/m);
    });
    it('has the other CHECK constraints the services and the verify script rely on', () => {
      for (const name of [
        'goals_end_date_matches_shape', 'goals_parked_return', 'targets_effort_has_floor', 'targets_aspiration_above_floor',
        'targets_cumulative_needs_deadline', 'targets_due_date_matches_period', 'targets_slots_match_period',
        'work_items_habit_has_target', 'work_items_due_date_matches_kind', 'work_items_date_can_move_matches_kind',
        'work_items_habit_never_completes', 'entries_value_positive', 'entries_evidence_is_object',
        'period_snapshots_week_start_needed', 'sources_provider_matches_kind',
      ]) {
        expect(sql, name).toMatch(new RegExp(`constraint ${name}\\b`));
      }
    });
  });
});

describe('the grants allow-list covers the goal model tables (supabase/verify/900_table_grants.sql)', () => {
  const allow = readFileSync(join(process.cwd(), 'supabase', 'verify', '900_table_grants.sql'), 'utf8').replace(/--.*$/gm, '');
  const entry = (table: string, role: string) => new RegExp(`\\('${table}',\\s+'${role}',\\s+'([A-Z,]*)'\\)`).exec(allow)?.[1];

  it.each([
    ['person_settings', 'SELECT,INSERT,UPDATE', ''],
    ['person_day_types', 'SELECT,INSERT,UPDATE,DELETE', ''],
    ['person_priorities', 'SELECT,INSERT,UPDATE,DELETE', ''],
    ['person_handling_rules', 'SELECT,INSERT,UPDATE,DELETE', ''],
    ['goals', 'SELECT,INSERT,UPDATE', ''],
    ['targets', 'SELECT,INSERT,UPDATE', ''],
    ['work_items', 'SELECT,INSERT,UPDATE,DELETE', ''],
    ['work_item_steps', 'SELECT,INSERT,UPDATE,DELETE', ''],
    ['sources', 'SELECT,INSERT,UPDATE,DELETE', 'SELECT'],
    ['target_sources', 'SELECT,INSERT,DELETE', 'SELECT'],
    ['entries', 'SELECT,INSERT', 'SELECT,INSERT,UPDATE'],
    ['entry_corrections', 'SELECT,INSERT,UPDATE,DELETE', ''],
    ['period_snapshots', 'SELECT,INSERT', ''],
  ])('%s: anon nothing, authenticated %s, service_role %s', (table, authenticated, service) => {
    expect(entry(table, 'anon')).toBe('');
    expect(entry(table, 'authenticated')).toBe(authenticated);
    expect(entry(table, 'service_role')).toBe(service);
  });
});
