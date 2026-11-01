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
  REVIEW_ADJUSTMENT_KINDS,
  REVIEW_ADJUSTMENT_OUTCOMES,
  REVIEW_DEPTHS,
  REVIEW_PLANNING_MODES,
  SHIFT_TYPES,
  SOURCE_KINDS,
  STARTING_POINT_FIELDS,
  STARTING_POINT_KINDS,
  STARTING_POINT_OUTCOMES,
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
    // 011 defined the feature list; 014 (MOM-128) replaced it with one that adds 'setup', and 018 (MOM-113) with one that
    // adds 'weekly_review', so the types follow 018.
    expect(inList(sql, 'llm_usage_logs_feature_check')).toEqual(['rebalance', 'week_one_plan']);
    expect(inList(sqlOf('014'), 'llm_usage_logs_feature_check')).toEqual(['rebalance', 'week_one_plan', 'setup']);
    expect(inList(sqlOf('018'), 'llm_usage_logs_feature_check')).toEqual([...LLM_FEATURES]);
    expect(LLM_FEATURES).toEqual(['rebalance', 'week_one_plan', 'setup', 'weekly_review']);
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

describe('the setup budget migration (014, MOM-128)', () => {
  const sql = sqlOf('014');
  const flat = sql.replace(/\s+/g, ' ');

  it('makes a goal\'s shape and start date optional, and keeps both required for any goal that is not parked', () => {
    expect(flat).toMatch(/alter table public\.goals alter column start_date drop not null;/);
    expect(flat).toMatch(/alter table public\.goals alter column shape drop not null;/);
    expect(flat).toMatch(
      /add constraint goals_shape_start_required check \(state = 'parked' or \(shape is not null and start_date is not null\)\)/,
    );
  });

  it('restates the two checks that would pass on NULL, with an explicit branch for "no shape"', () => {
    expect(flat).toMatch(/drop constraint goals_end_date_matches_shape;/);
    expect(flat).toMatch(/\(shape is null and end_date is null\) or \(shape is not null and \(/);
    expect(flat).toMatch(/drop constraint goals_block_weeks_check;/);
    expect(flat).toMatch(/block_weeks is null or \(shape is not null and shape = 'ongoing' and block_weeks >= 1\)/);
  });

  it('adds \'setup\' to the usage log\'s feature check and keeps the two it had', () => {
    expect(inList(sql, 'llm_usage_logs_feature_check')).toEqual(['rebalance', 'week_one_plan', 'setup']);
  });

  it('adds no table, grant, policy or function, and writes no data', () => {
    expect(sql).not.toMatch(/\b(create|grant|revoke)\b/i);
    expect(sql).not.toMatch(/\b(insert|update|delete)\b/i);
  });

  it('leaves 011 and 013 as they were: the original columns and checks are still written there', () => {
    expect(sqlOf('013')).toMatch(/^\s{2}start_date\s+date not null,/m);
    expect(sqlOf('013')).toMatch(/^\s{2}shape\s+text not null,/m);
    expect(inList(sqlOf('011'), 'llm_usage_logs_feature_check')).toEqual(['rebalance', 'week_one_plan']);
  });

  it('is checked by a verify script that includes the checks that would pass on NULL', () => {
    const verify = readFileSync(join(process.cwd(), 'supabase', 'verify', '014_setup_budget.sql'), 'utf8');
    expect(verify).toMatch(/An active goal without a shape is rejected/);
    expect(verify).toMatch(/A goal with no shape cannot have an end date/);
    expect(verify).toMatch(/A goal with no shape cannot have a first-block length/);
    expect(verify).toMatch(/A setup call can be reserved and is logged under ''setup''/);
    // 013's script expects the check, not the not-null rule, for an active goal with no start date.
    const verify013 = readFileSync(join(process.cwd(), 'supabase', 'verify', '013_goal_model_tables.sql'), 'utf8');
    expect(verify013).toMatch(/An active goal has no start date unless the person gives one'.*= '23514'\);/);
  });
});

describe('migration 015 saves an approved guided setup in one transaction (MOM-111)', () => {
  const sql = sqlOf('015');
  const fn = /create or replace function public\.save_guided_setup[\s\S]*?\n\$\$;/i.exec(sql)?.[0] ?? '';

  it('finds the function', () => {
    expect(fn.length).toBeGreaterThan(500);
  });

  it('is SECURITY INVOKER with an empty search_path, so row level security applies as for a direct insert', () => {
    expect(fn).toMatch(/security invoker/i);
    expect(fn).not.toMatch(/security definer/i);
    expect(fn).toMatch(/set search_path = ''/i);
  });

  it('takes the owner from auth.uid() and has no user id argument anywhere', () => {
    expect(fn).toMatch(/v_uid\s+uuid := auth\.uid\(\)/);
    expect(fn).toMatch(/create or replace function public\.save_guided_setup\(p_payload jsonb\)/i);
    expect(fn).not.toMatch(/p_user|->>?\s*'user_id'/i);
    expect(fn).toMatch(/Sign in to save your setup\./);
  });

  it('refuses a second setup (first setup only) with its own SQLSTATE, before it writes anything', () => {
    expect(fn).toMatch(/errcode = 'MS001'/);
    expect(fn.indexOf("errcode = 'MS001'")).toBeLessThan(fn.indexOf('insert into public.person_settings'));
    expect(fn).toMatch(/exists \(select 1 from public\.goals where user_id = v_uid\)/);
  });

  it('writes all nine kinds of rows, in an order each foreign key allows', () => {
    const at = (table: string) => fn.indexOf(`insert into public.${table}`);
    const tables = [
      'person_settings',
      'person_day_types',
      'person_priorities',
      'goals',
      'targets',
      'sources',
      'target_sources',
      'work_items',
      'work_item_steps',
    ];
    for (const t of tables) expect(at(t), t).toBeGreaterThan(-1);
    // Settings, day types, priorities, goals, targets; items only after the targets they feed; steps after their item.
    expect(at('person_settings')).toBeLessThan(at('person_day_types'));
    expect(at('person_day_types')).toBeLessThan(at('person_priorities'));
    expect(at('person_priorities')).toBeLessThan(at('goals'));
    expect(at('goals')).toBeLessThan(at('targets'));
    expect(at('targets')).toBeLessThan(at('work_items'));
    expect(at('work_items')).toBeLessThan(at('work_item_steps'));
  });

  it('refuses any payload key it does not read, rather than ignoring it', () => {
    expect(fn).toMatch(/p_payload - 'person' - 'day_types' - 'priorities' - 'goals'/);
  });

  it('is executable by signed-in users only', () => {
    expect(sql).toMatch(/revoke execute on function public\.save_guided_setup\(jsonb\) from public, anon, authenticated, service_role/i);
    expect(sql).toMatch(/grant execute on function public\.save_guided_setup\(jsonb\) to authenticated/i);
    // One grant, and it is to authenticated: nothing is granted to anon, public or the service role.
    expect(sql.match(/grant execute/gi) ?? []).toHaveLength(1);
  });

  it('adds no table, column, policy or table grant, and changes no earlier object', () => {
    expect(sql).not.toMatch(/create table|alter table|create policy|drop |create index/i);
    expect(sql).not.toMatch(/grant (select|insert|update|delete)/i);
  });

  it('is checked by a verify script that proves a failed save keeps nothing, and that it is first setup only', () => {
    const verify = readFileSync(join(process.cwd(), 'supabase', 'verify', '015_save_guided_setup.sql'), 'utf8');
    expect(verify).toMatch(/Nothing of the failed setup was kept in any of the nine tables/);
    expect(verify).toMatch(/A second setup by the same person is refused/);
    expect(verify).toMatch(/The service role cannot call it/);
    expect(verify).toMatch(/A signed-out client cannot call it/);
    expect(verify).toMatch(/A setup with only a parked goal and no person facts saves/);
  });
});


describe('migration 017 stores which setup values came from a suggestion (MOM-134)', () => {
  const sql = sqlOf('017');
  const table = /create table public\.starting_points \(([\s\S]*?)\n\);/.exec(sql)?.[1] ?? '';
  const fn = /create or replace function public\.save_guided_setup[\s\S]*?\n\$\$;/i.exec(sql)?.[0] ?? '';
  const verify = readFileSync(join(process.cwd(), 'supabase', 'verify', '017_starting_points.sql'), 'utf8');

  it('leaves 013, 015 and 016 as they were: the new table and the new function version live only in 017', () => {
    for (const earlier of ['013', '015', '016']) expect(sqlOf(earlier), earlier).not.toMatch(/starting_points/);
    expect(sql).toMatch(/create or replace function public\.save_guided_setup\(p_payload jsonb\)/i);
    // The one change to an applied table is a unique key, never an edit of its columns.
    const altered = [...sql.matchAll(/alter table public\.([a-z_]+)\s+(add|drop|alter)\s+(\w+)/gi)].map((m) => `${m[1]} ${m[2]} ${m[3]}`.toLowerCase());
    expect(altered).toEqual(['person_day_types add constraint']);
    expect(sql).toMatch(/add constraint person_day_types_id_user_unique unique \(id, user_id\)/);
  });

  it('keeps its kinds, fields and outcomes in step with types/database.types.ts', () => {
    expect(inList(table, 'starting_points_kind_check')).toEqual([...STARTING_POINT_KINDS]);
    expect(inList(table, 'starting_points_outcome_check')).toEqual([...STARTING_POINT_OUTCOMES]);
    const fieldCheck = /constraint starting_points_field_check check \(([\s\S]*?)\n  \),/.exec(table)?.[1] ?? '';
    const pairs = new Map<string, string[]>();
    for (const m of fieldCheck.matchAll(/subject_kind = '([a-z_]+)'\s+and field (?:in \(([^)]*)\)|= '([a-z_]+)')/g)) {
      pairs.set(m[1], m[2] ? [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [m[3]]);
    }
    expect([...pairs.keys()].sort()).toEqual([...STARTING_POINT_KINDS].sort());
    for (const kind of STARTING_POINT_KINDS) expect(pairs.get(kind), kind).toEqual([...STARTING_POINT_FIELDS[kind]]);
  });

  it('points at the person\'s own rows only: every foreign key is (id, user_id) and removes the mark with its row', () => {
    for (const [name, parent] of [
      ['starting_points_day_type_fk', 'person_day_types'],
      ['starting_points_goal_fk', 'goals'],
      ['starting_points_target_fk', 'targets'],
      ['starting_points_work_item_fk', 'work_items'],
    ]) {
      expect(table).toMatch(new RegExp(`constraint ${name} foreign key \\([a-z_]+, user_id\\)\\s+references public\\.${parent} \\(id, user_id\\) on delete cascade`));
    }
    expect(table).toMatch(/user_id\s+uuid not null references public\.users \(id\) on delete cascade/);
    expect(table).toMatch(/constraint starting_points_subject_matches_kind/);
    expect(table).toMatch(/constraint starting_points_answered_together check \(\(answered_at is null\) = \(outcome is null\)\)/);
  });

  it('turns row level security on, takes every default privilege back, and grants only what is approved', () => {
    expect(sql).toMatch(/alter table public\.starting_points enable row level security/);
    expect(sql).toMatch(/revoke all on table public\.starting_points from anon, authenticated, service_role/);
    const grants = [...sql.matchAll(/grant ([a-z, ()_]+) on table public\.starting_points to ([a-z_]+)/g)].map((m) => `${m[2]}: ${m[1]}`);
    expect(grants).toEqual(['authenticated: select, insert', 'authenticated: update (answered_at, outcome)']);
    expect(sql).not.toMatch(/grant [^;]*\b(delete|truncate|references|trigger|all)\b[^;]*on table public\.starting_points/i);
  });

  it('has a select, an insert and an update policy, all the owner\'s, and no delete policy', () => {
    const policies = [...sql.matchAll(/create policy "([^"]+)" on public\.starting_points\s+for (select|insert|update|delete|all)/g)].map((m) => `${m[1]} ${m[2]}`);
    expect(policies).toEqual([
      'starting_points_select_own select',
      'starting_points_insert_own insert',
      'starting_points_update_own update',
    ]);
    // A new mark is unanswered, and an answered one cannot be answered again.
    expect(sql).toMatch(/starting_points_insert_own[\s\S]*?with check \(\(select auth\.uid\(\)\) = user_id and answered_at is null and outcome is null\)/);
    expect(sql).toMatch(/starting_points_update_own[\s\S]*?using \(\(select auth\.uid\(\)\) = user_id and answered_at is null\)/);
  });

  it('the new function version is SECURITY INVOKER, takes the owner from auth.uid(), and refuses a second setup and an unknown top-level key as before', () => {
    expect(fn.length).toBeGreaterThan(1000);
    expect(fn).toMatch(/security invoker/i);
    expect(fn).not.toMatch(/security definer/i);
    expect(fn).toMatch(/set search_path = ''/i);
    expect(fn).toMatch(/v_uid\s+uuid := auth\.uid\(\)/);
    expect(fn).toMatch(/p_payload - 'person' - 'day_types' - 'priorities' - 'goals'/);
    expect(fn).not.toMatch(/p_payload - [^<]*starting_points/);
    expect(fn).toMatch(/errcode = 'MS001'/);
    expect(fn.indexOf("errcode = 'MS001'")).toBeLessThan(fn.indexOf('insert into public.person_settings'));
    // Its answer is 016's, key for key, so nothing that reads the answer (and no earlier verify script) changes.
    expect(fn).toMatch(/return jsonb_build_object\('goals', n_goals, 'targets', n_targets, 'work_items', n_items, 'steps', n_steps, 'bindings', n_bindings\);/);
    expect(sql.match(/grant execute/gi) ?? []).toHaveLength(1);
    expect(sql).toMatch(/revoke execute on function public\.save_guided_setup\(jsonb\) from public, anon, authenticated, service_role/i);
    expect(sql).toMatch(/grant execute on function public\.save_guided_setup\(jsonb\) to authenticated/i);
  });

  it('writes a mark only where it holds the new row\'s id, and treats a payload with no list as no marks', () => {
    // Each list is read with coalesce(..., '[]'), so a payload without the key (an older app) marks nothing.
    const reads = [...fn.matchAll(/coalesce\((v_[a-z_]+) -> 'starting_points', '\[\]'::jsonb\)/g)].map((m) => m[1]);
    expect(reads).toEqual(['v_person', 'v_day_type', 'v_goal', 'v_target', 'v_item']);
    const ids = [...fn.matchAll(/insert into public\.starting_points \(([^)]*)\) values \(([^)]*)\)/g)].map((m) => `${m[1]} | ${m[2]}`);
    expect(ids).toEqual([
      "user_id, subject_kind, field | v_uid, 'person', v_mark",
      "user_id, subject_kind, day_type_id, field | v_uid, 'day_type', v_dt_id, v_mark",
      "user_id, subject_kind, goal_id, field | v_uid, 'goal', v_goal_id, v_mark",
      "user_id, subject_kind, target_id, field | v_uid, 'target', v_target_id, v_mark",
      "user_id, subject_kind, work_item_id, field | v_uid, 'work_item', v_item_id, v_mark",
    ]);
  });

  it('is checked by a verify script with the named checks, including an older payload that must still save', () => {
    expect(verify).toMatch(/An older payload with no starting_points saves exactly as before/);
    expect(verify).toMatch(/A second setup by the same person is still refused/);
    expect(verify).toMatch(/A value the person said is saved but has no mark/);
    expect(verify).toMatch(/A person reads their own 9 marks and none of anyone else/);
    expect(verify).toMatch(/Answering another person''s mark touches no row/);
    expect(verify).toMatch(/An answered mark cannot be answered again/);
    expect(verify).toMatch(/Nothing of any refused save was kept/);
  });

  it('the verify script leaves nothing behind: every write is inside one block that always rolls back', () => {
    // All the script's writes (accounts, setups, marks) are in the one DO block; outside it there are only temporary objects.
    const doBlock = /\ndo \$\$[\s\S]*?\n\$\$;/.exec(verify)?.[0] ?? '';
    expect(doBlock.length).toBeGreaterThan(1000);
    const outside = verify.replace(doBlock, '');
    expect(outside).not.toMatch(/\b(insert into|update|delete from|truncate)\s+(public|auth)\./i);
    expect(outside.match(/create (or replace )?function (?!pg_temp\.)/gi) ?? []).toEqual([]);
    expect(outside).not.toMatch(/\bcommit\b/i);
    // The inner block's last statement is the exception that undoes it, and its handler expects exactly that one.
    expect(doBlock).toMatch(/raise exception 'mom134_rollback';\s+exception when others then\s+if sqlerrm <> 'mom134_rollback' then/);
    expect(doBlock).not.toMatch(/\bcommit\b/i);
    // After the rollback it proves nothing is left: no account, and no row for any of the four in any table it wrote to.
    expect(verify).toMatch(/The rollback left no throwaway account behind/);
    expect(verify).toMatch(/The rollback left no row for any of them in any table the script wrote to/);
    for (const t of ['users', 'person_settings', 'person_day_types', 'person_priorities', 'goals', 'targets', 'work_items', 'work_item_steps', 'sources', 'target_sources', 'starting_points']) {
      expect(verify, t).toMatch(new RegExp(`from public\\.${t} where (user_)?id in \\(a, b, c, e\\)|from public\\.${t} where user_id in \\(a, b, c, e\\)`));
    }
  });
});

describe('migration 018 stores a finished weekly review once and never changes it (MOM-113)', () => {
  const sql = sqlOf('018');
  const table = /create table public\.weekly_reviews \(([\s\S]*?)\n\);/.exec(sql)?.[1] ?? '';
  const fn = /create function public\.weekly_reviews_set_finished_at\(\)[\s\S]*?\n\$\$;/i.exec(sql)?.[0] ?? '';
  const verify = readFileSync(join(process.cwd(), 'supabase', 'verify', '018_weekly_reviews.sql'), 'utf8');

  it('adds the table and the feature name, and leaves every earlier migration as it was', () => {
    for (const earlier of ['011', '013', '014', '017']) expect(sqlOf(earlier), earlier).not.toMatch(/weekly_reviews/);
    expect(inList(sqlOf('014'), 'llm_usage_logs_feature_check')).not.toContain('weekly_review');
    // The one change to an applied table is the usage log's feature check, dropped and re-added as 014 did.
    const altered = [...sql.matchAll(/alter table public\.([a-z_]+)\s+(add|drop|alter|enable)\s+(\w+)/gi)].map((m) => `${m[1]} ${m[2]} ${m[3]}`.toLowerCase());
    expect(altered).toEqual(['weekly_reviews enable row', 'llm_usage_logs drop constraint', 'llm_usage_logs add constraint']);
  });

  it('keeps its kinds and outcomes in step with types/database.types.ts', () => {
    expect(inList(table, 'weekly_reviews_adjustment_kind_check')).toEqual([...REVIEW_ADJUSTMENT_KINDS]);
    expect(inList(table, 'weekly_reviews_adjustment_outcome_check')).toEqual([...REVIEW_ADJUSTMENT_OUTCOMES]);
    expect(REVIEW_ADJUSTMENT_KINDS).toHaveLength(6);
    expect(REVIEW_ADJUSTMENT_OUTCOMES).toEqual(['changed', 'declined', 'skipped']);
  });

  it('is written once per person and week, seven days long, and goes with the account', () => {
    expect(table).toMatch(/user_id\s+uuid not null references public\.users \(id\) on delete cascade/);
    expect(table).toMatch(/constraint weekly_reviews_user_week_unique unique \(user_id, week_start\)/);
    expect(table).toMatch(/constraint weekly_reviews_week_is_seven_days check \(week_end = week_start \+ 6\)/);
    expect(table).toMatch(/constraint weekly_reviews_adjustment_together/);
  });

  it('turns row level security on, takes every default privilege back, and grants select and insert only', () => {
    expect(sql).toMatch(/alter table public\.weekly_reviews enable row level security/);
    expect(sql).toMatch(/revoke all on table public\.weekly_reviews from anon, authenticated, service_role/);
    const grants = [...sql.matchAll(/grant ([a-z, ()_]+) on table public\.weekly_reviews to ([a-z_]+)/g)].map((m) => `${m[2]}: ${m[1]}`);
    expect(grants).toEqual(['authenticated: select, insert']);
    expect(sql).not.toMatch(/grant [^;]*\b(update|delete|truncate|references|trigger|all)\b[^;]*on table public\.weekly_reviews/i);
  });

  it('has an owner-only select and insert policy and no update or delete policy', () => {
    const policies = [...sql.matchAll(/create policy "([^"]+)" on public\.weekly_reviews\s+for (select|insert|update|delete|all)/g)].map((m) => `${m[1]} ${m[2]}`);
    expect(policies).toEqual(['weekly_reviews_select_own select', 'weekly_reviews_insert_own insert']);
  });

  it('sets finished_at in a BEFORE INSERT trigger, and the trigger function follows 012: no EXECUTE for any API role', () => {
    expect(fn).toMatch(/returns trigger/);
    expect(fn).toMatch(/set search_path = ''/);
    expect(fn).toMatch(/new\.finished_at := now\(\)/);
    expect(sql).toMatch(/create trigger weekly_reviews_set_finished_at before insert on public\.weekly_reviews\s+for each row execute function public\.weekly_reviews_set_finished_at\(\)/);
    expect(sql).toMatch(/revoke execute on function public\.weekly_reviews_set_finished_at\(\) from public, anon, authenticated, service_role/);
    expect(sql).not.toMatch(/grant execute on function public\.weekly_reviews_set_finished_at/i);
  });

  it('adds \'weekly_review\' to the usage log\'s feature check and keeps the three it had', () => {
    expect(inList(sql, 'llm_usage_logs_feature_check')).toEqual(['rebalance', 'week_one_plan', 'setup', 'weekly_review']);
  });

  it('is checked by a verify script with checks that fail without the trigger, the revoke and the missing grants', () => {
    expect(verify).toMatch(/It reads back within a minute of now, not a week ago/);
    expect(verify).toMatch(/anon, authenticated and service_role cannot execute the trigger function/);
    expect(verify).toMatch(/PUBLIC cannot execute the trigger function either/);
    expect(verify).toMatch(/Calling the trigger function directly is refused by privilege for each of the three/);
    expect(verify).toMatch(/A person cannot rewrite their own record/);
    expect(verify).toMatch(/A person cannot delete their own record/);
    expect(verify).toMatch(/A second record for the same week is refused by the unique key/);
    expect(verify).toMatch(/A weekly_review call is accepted by the usage log/);
  });

  it('leaves nothing behind on production: one block that always rolls back, then checks that run after it', () => {
    expect(verify).toMatch(/raise exception 'mom113_rollback'/);
    expect(verify.indexOf("raise exception 'mom113_rollback'")).toBeLessThan(verify.indexOf('The rollback left no throwaway account behind'));
    expect(verify).toMatch(/The rollback left no throwaway account behind/);
    expect(verify).toMatch(/The rollback left no weekly_reviews row, usage row or user row for either of them/);
    expect(verify).toMatch(/from public\.weekly_reviews where user_id in \(a, b\)/);
    // Every write is a throwaway account's own, in the one inner block before the handler.
    const block = verify.slice(verify.indexOf('begin\n    insert into auth.users'), verify.indexOf("exception when others then\n    if sqlerrm"));
    expect(block.match(/insert into auth\.users/g)).toHaveLength(1);
  });
});

describe('migration 019 stores the person\'s own week plan: picks of items for days, and the kind of each date (MOM-112)', () => {
  const sql = sqlOf('019');
  const table = (name: string) => new RegExp(`create table public\\.${name} \\(([\\s\\S]*?)\\n\\);`).exec(sql)?.[1] ?? '';
  const verify = readFileSync(join(process.cwd(), 'supabase', 'verify', '019_week_plan.sql'), 'utf8');

  it('adds two tables and changes no applied table, and leaves every earlier migration as it was', () => {
    for (const earlier of ['001', '013', '014', '015', '016', '017', '018']) expect(sqlOf(earlier), earlier).not.toMatch(/week_plan/);
    // The only alter statements are the new tables' own row level security.
    const altered = [...sql.matchAll(/alter table public\.([a-z_]+)\s+(add|drop|alter|enable)\s+(\w+)/gi)].map((m) => `${m[1]} ${m[2]} ${m[3]}`.toLowerCase());
    expect(altered).toEqual(['week_plan_picks enable row', 'week_plan_day_types enable row']);
    // The key a day kind points at is already there (017), so 019 does not add it.
    expect(sqlOf('017')).toMatch(/add constraint person_day_types_id_user_unique unique \(id, user_id\)/);
    expect(sql).not.toMatch(/person_day_types_id_user_unique/);
  });

  it('points a pick at the person\'s own work item, once per item and day, and removes it with the item', () => {
    const picks = table('week_plan_picks');
    expect(picks).toMatch(/user_id\s+uuid not null references public\.users \(id\) on delete cascade/);
    expect(picks).toMatch(/plan_date\s+date not null/);
    expect(picks).toMatch(/foreign key \(work_item_id, user_id\)\s+references public\.work_items \(id, user_id\) on delete cascade/);
    expect(picks).toMatch(/constraint week_plan_picks_item_day_unique unique \(work_item_id, plan_date\)/);
  });

  it('points a date\'s kind at the person\'s own day type, one kind per date, and removes it with the day type', () => {
    const kinds = table('week_plan_day_types');
    expect(kinds).toMatch(/user_id\s+uuid not null references public\.users \(id\) on delete cascade/);
    expect(kinds).toMatch(/foreign key \(day_type_id, user_id\)\s+references public\.person_day_types \(id, user_id\) on delete cascade/);
    expect(kinds).toMatch(/constraint week_plan_day_types_user_day_unique unique \(user_id, plan_date\)/);
    expect(sql).toMatch(/create trigger week_plan_day_types_set_updated_at before update on public\.week_plan_day_types\s+for each row execute function public\.set_updated_at\(\)/);
  });

  it('stores no time of day, no slot and no capacity: a pick is an item on a date', () => {
    for (const name of ['week_plan_picks', 'week_plan_day_types']) {
      const columns = [...table(name).matchAll(/^\s{2}([a-z_]+)\s+(?:uuid|date|timestamptz|text|time|numeric|integer)\b/gm)].map((m) => m[1]);
      expect(columns, name).not.toEqual([]);
      for (const column of columns) expect(column, name).not.toMatch(/time|hour|minute|slot|capacity|start|end/);
    }
  });

  it('turns row level security on, takes every default privilege back, and grants only what is approved', () => {
    expect(sql).toMatch(/alter table public\.week_plan_picks\s+enable row level security/);
    expect(sql).toMatch(/alter table public\.week_plan_day_types\s+enable row level security/);
    expect(sql).toMatch(/revoke all on table public\.week_plan_picks, public\.week_plan_day_types from anon, authenticated, service_role/);
    const grants = [...sql.matchAll(/grant ([a-z, ()_]+) on table public\.(week_plan_[a-z_]+) to ([a-z_]+)/g)].map((m) => `${m[2]} ${m[3]}: ${m[1]}`);
    // A date's kind can change, but only its day_type_id: the update grant is on that column, never on the table.
    expect(grants).toEqual([
      'week_plan_picks authenticated: select, insert, delete',
      'week_plan_day_types authenticated: select, insert, delete',
      'week_plan_day_types authenticated: update (day_type_id)',
    ]);
    expect(sql).not.toMatch(/grant [^;]*\b(truncate|references|trigger|all)\b[^;]*on table public\.week_plan/i);
  });

  it('creates no function and changes no function\'s privileges: the updated_at trigger reuses set_updated_at from 001', () => {
    expect(sql).not.toMatch(/create (or replace )?function/i);
    expect(sql).not.toMatch(/(grant|revoke) execute/i);
    expect(sqlOf('001')).toMatch(/create or replace function public\.set_updated_at\(\)/);
    // With no new function there is nothing for an API role to execute (012's rule); the verify script checks it.
    expect(verify).toMatch(/The trigger runs the existing public\.set_updated_at, and no function of its own was created/);
  });

  it('has owner-only policies: none for a pick\'s update, and every policy keyed to the signed-in person', () => {
    const policies = [...sql.matchAll(/create policy "([^"]+)" on public\.(week_plan_[a-z_]+)\s+for (select|insert|update|delete|all)/g)].map((m) => `${m[1]} ${m[3]}`);
    expect(policies).toEqual([
      'week_plan_picks_select_own select',
      'week_plan_picks_insert_own insert',
      'week_plan_picks_delete_own delete',
      'week_plan_day_types_select_own select',
      'week_plan_day_types_insert_own insert',
      'week_plan_day_types_update_own update',
      'week_plan_day_types_delete_own delete',
    ]);
    expect([...sql.matchAll(/\(select auth\.uid\(\)\) = user_id/g)]).toHaveLength(8);
  });

  it('is checked by a verify script with checks that fail without the keys, the grants and the policies', () => {
    expect(verify).toMatch(/The same item on the same day twice is refused by the unique key/);
    expect(verify).toMatch(/A pick of another person''s item is refused by the composite foreign key/);
    expect(verify).toMatch(/A pick cannot be edited, only added and removed/);
    expect(verify).toMatch(/A second kind for the same date is refused by the unique key/);
    expect(verify).toMatch(/A signed-in person may update only the day_type_id of a day kind/);
    expect(verify).toMatch(/Updating the date of a day kind is refused/);
    expect(verify).toMatch(/Updating the owner of a day kind is refused/);
    expect(verify).toMatch(/A kind that points at another person''s day type is refused by the composite foreign key/);
    expect(verify).toMatch(/Deleting an item removes its picks/);
    expect(verify).toMatch(/Deleting a day type removes the kinds that used it/);
    expect(verify).toMatch(/person_day_types has the unique key on \(id, user_id\)/);
  });

  it('leaves nothing behind on production: one block that always rolls back, then checks that run after it', () => {
    expect(verify).toMatch(/raise exception 'mom112_rollback'/);
    expect(verify.indexOf("raise exception 'mom112_rollback'")).toBeLessThan(verify.indexOf('The rollback left no throwaway account behind'));
    expect(verify).toMatch(/The rollback left no throwaway account behind/);
    expect(verify).toMatch(/The rollback left no row for either of them in any table the script wrote to/);
    for (const t of ['users', 'week_plan_picks', 'week_plan_day_types', 'person_day_types', 'work_items', 'goals']) {
      expect(verify, t).toMatch(new RegExp(`from public\\.${t} where (user_)?id in \\(a, b\\)|from public\\.${t} where user_id in \\(a, b\\)`));
    }
    // Every write is a throwaway account's own, in the one inner block before the handler.
    const block = verify.slice(verify.indexOf('begin\n    insert into auth.users'), verify.indexOf("exception when others then\n    if sqlerrm"));
    expect(block.match(/insert into auth\.users/g)).toHaveLength(1);
    expect(verify.slice(0, verify.indexOf('begin\n    insert into auth.users'))).not.toMatch(/\b(insert into|update|delete from)\s+(public|auth)\./i);
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
    // 017: UPDATE of answered_at and outcome is a column privilege, so the table-level check lists SELECT and INSERT only.
    ['starting_points', 'SELECT,INSERT', ''],
    // 018: a finished review is written once and never changed.
    ['weekly_reviews', 'SELECT,INSERT', ''],
    // 019: a pick is added and removed, never edited. A date's kind can be changed, but UPDATE of day_type_id is a column
    // privilege, so the table-level check lists SELECT, INSERT and DELETE only.
    ['week_plan_picks', 'SELECT,INSERT,DELETE', ''],
    ['week_plan_day_types', 'SELECT,INSERT,DELETE', ''],
  ])('%s: anon nothing, authenticated %s, service_role %s', (table, authenticated, service) => {
    expect(entry(table, 'anon')).toBe('');
    expect(entry(table, 'authenticated')).toBe(authenticated);
    expect(entry(table, 'service_role')).toBe(service);
  });
});

describe('migration 020 stores the changes a person makes to a target from a later period, append-only (MOM-146)', () => {
  const sql = sqlOf('020');
  const table = /create table public\.target_changes \(([\s\S]*?)\n\);/.exec(sql)?.[1] ?? '';
  const fn = /create function public\.target_changes_set_created_at\(\)[\s\S]*?\n\$\$;/i.exec(sql)?.[0] ?? '';
  const verify = readFileSync(join(process.cwd(), 'supabase', 'verify', '020_target_changes.sql'), 'utf8');

  it('adds the one table and changes no applied table, function or grant', () => {
    for (const earlier of files.slice(0, -1).map((f) => f.slice(0, 3))) expect(sqlOf(earlier), earlier).not.toMatch(/target_changes/);
    const altered = [...sql.matchAll(/alter table public\.([a-z_]+)\s+(add|drop|alter|enable)\s+(\w+)/gi)].map((m) => `${m[1]} ${m[2]} ${m[3]}`.toLowerCase());
    expect(altered).toEqual(['target_changes enable row']);
    expect(files[files.length - 1]).toMatch(/^020_/);
  });

  it('points a change at the person\'s own target, with no ON DELETE action, and goes with the account', () => {
    expect(table).toMatch(/user_id\s+uuid not null references public\.users \(id\) on delete cascade/);
    expect(table).toMatch(/constraint target_changes_target_fk foreign key \(target_id, user_id\) references public\.targets \(id, user_id\),/);
    expect(table).not.toMatch(/targets \(id, user_id\) on delete/);
  });

  it('has no unique key, so a second save for the same date is a second row (the newest created_at wins), and so no upsert', () => {
    expect(table).not.toMatch(/\bunique\b/i);
    expect(sql).not.toMatch(/create unique index/i);
    expect(table).toMatch(/effective_from\s+date not null/);
    expect(table).toMatch(/created_at\s+timestamptz not null default clock_timestamp\(\)/);
  });

  it('keeps the same level rules as a target: a floor above 0, an aspiration not below it, days 1 to 7', () => {
    expect(table).toMatch(/constraint target_changes_floor_positive check \(floor > 0\)/);
    expect(table).toMatch(/constraint target_changes_aspiration_above_floor check \(aspiration is null or aspiration >= floor\)/);
    expect(table).toMatch(/constraint target_changes_slots_valid check/);
    expect(table).toMatch(/cardinality\(slot_weekdays\) between 1 and 7/);
    expect(table).toMatch(/floor\s+numeric not null/);
  });

  it('changes nothing else about a target: no measure, role, unit, period kind or due date column', () => {
    const columns = [...table.matchAll(/^\s{2}([a-z_]+)\s+(?:uuid|date|timestamptz|numeric|smallint\[\])(?=[\s,])/gm)].map((m) => m[1]);
    expect(columns).toEqual(['id', 'user_id', 'target_id', 'effective_from', 'floor', 'aspiration', 'slot_weekdays', 'created_at']);
  });

  it('turns row level security on, takes every default privilege back, and grants select and insert only', () => {
    expect(sql).toMatch(/alter table public\.target_changes enable row level security/);
    expect(sql).toMatch(/revoke all on table public\.target_changes from anon, authenticated, service_role/);
    const grants = [...sql.matchAll(/grant ([a-z, ()_]+) on table public\.target_changes to ([a-z_]+)/g)].map((m) => `${m[2]}: ${m[1]}`);
    expect(grants).toEqual(['authenticated: select, insert']);
    expect(sql).not.toMatch(/grant [^;]*\b(update|delete|truncate|references|trigger|all)\b[^;]*on table public\.target_changes/i);
  });

  it('has an owner-only select and insert policy and no update or delete policy', () => {
    const policies = [...sql.matchAll(/create policy "([^"]+)" on public\.target_changes\s+for (select|insert|update|delete|all)/g)].map((m) => `${m[1]} ${m[2]}`);
    expect(policies).toEqual(['target_changes_select_own select', 'target_changes_insert_own insert']);
    expect(sql).toMatch(/for select to authenticated using \(\(select auth\.uid\(\)\) = user_id\)/);
    expect(sql).toMatch(/for insert to authenticated with check \(\(select auth\.uid\(\)\) = user_id\)/);
  });

  it('sets created_at in a BEFORE INSERT trigger, and the trigger function follows 012: no EXECUTE for any API role', () => {
    expect(fn).toMatch(/returns trigger/);
    expect(fn).toMatch(/set search_path = ''/);
    expect(fn).toMatch(/new\.created_at := clock_timestamp\(\)/);
    expect(sql).toMatch(/create trigger target_changes_set_created_at before insert on public\.target_changes\s+for each row execute function public\.target_changes_set_created_at\(\)/);
    expect(sql).toMatch(/revoke execute on function public\.target_changes_set_created_at\(\) from public, anon, authenticated, service_role/);
    expect(sql).not.toMatch(/grant execute on function public\.target_changes_set_created_at/i);
  });

  it('is checked by a verify script with checks that fail without the trigger, the grants or the foreign key', () => {
    expect(verify).toMatch(/A second change for the same target and date is accepted \(no unique key, no upsert\)/);
    expect(verify).toMatch(/The newest created_at is the second save, so it is the one that wins/);
    expect(verify).toMatch(/It reads back within a minute of now, not a week ago/);
    expect(verify).toMatch(/A person cannot rewrite their own change/);
    expect(verify).toMatch(/A person cannot delete their own change/);
    expect(verify).toMatch(/A change for another person''s target, in one''s own name, is refused by the composite foreign key/);
    expect(verify).toMatch(/anon, authenticated and service_role cannot execute the trigger function/);
    expect(verify).toMatch(/Calling the trigger function directly is refused by privilege for each of the three/);
  });

  it('leaves nothing behind on production: one block that always rolls back, then checks that run after it', () => {
    expect(verify).toMatch(/raise exception 'mom146_rollback'/);
    expect(verify.indexOf("raise exception 'mom146_rollback'")).toBeLessThan(verify.indexOf('The rollback left no throwaway account behind'));
    expect(verify).toMatch(/The rollback left no goal, target, change or user row for either of them/);
    const block = verify.slice(verify.indexOf('begin\n    insert into auth.users'), verify.indexOf("exception when others then\n    if sqlerrm"));
    expect(block.match(/insert into auth\.users/g)).toHaveLength(1);
  });

  it('is in the grants allow-list with the approved grants', () => {
    const allow = readFileSync(join(process.cwd(), 'supabase', 'verify', '900_table_grants.sql'), 'utf8');
    for (const [role, privs] of [['anon', ''], ['authenticated', 'SELECT,INSERT'], ['service_role', '']]) {
      expect(allow).toMatch(new RegExp(`\\('target_changes',\\s+'${role}',\\s+'${privs}'\\)`));
    }
  });
});
