// Keeps the privacy notice in step with the code, by test rather than by memory (MOM-102). lib/config/privacy.ts is what
// the notice prints; these tests fail when the code changes and that file does not:
//   - a table in supabase/migrations with no line in the notice (or on the commented internal list);
//   - a provider's stored fields that differ from what the notice says, or a provider with no entry;
//   - a sign-up bot check the code can run with no entry; browser storage used in a file the notice does not cover.
// The Claude prompts' field lists are checked next to the prompts, in tests/rebalance-model.test.ts and
// tests/task-plan-ai.test.ts.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeGoogleEvent } from '@/lib/adapters/google';
import { normalizeHevyWorkout } from '@/lib/adapters/hevy';
import {
  DEVICE_STORAGE,
  INTERNAL_TABLES,
  PROVIDER_NOTICES,
  SERVICES,
  STORED_GROUPS,
  UNUSED_CAPTCHA_OPTIONS,
  fieldList,
} from '@/lib/config/privacy';
import { INTEGRATION_CATALOG } from '@/lib/integrations/catalog';
import { fieldPaths } from './helpers/fieldPaths';

const ROOT = process.cwd();
const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '');
const stripSqlComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');

function migrationSql(): string {
  const dir = join(ROOT, 'supabase', 'migrations');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => stripSqlComments(readFileSync(join(dir, f), 'utf8')))
    .join('\n');
}

// Tables the migrations create and do not later drop.
function migrationTables(): string[] {
  const sql = migrationSql();
  const tables = new Set<string>();
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/gi)) tables.add(m[1].toLowerCase());
  for (const m of sql.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)) tables.delete(m[1].toLowerCase());
  return [...tables].sort();
}

describe('the privacy notice covers every table (MOM-102)', () => {
  const noticed = STORED_GROUPS.flatMap((g) => g.tables);

  it('every table is created as public.<name>, so this check can see it', () => {
    const sql = migrationSql();
    const all = [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_."]+)/gi)].map((m) => m[1]);
    expect(all.filter((name) => !name.toLowerCase().startsWith('public.'))).toEqual([]);
  });

  it('every table in supabase/migrations has a line in the notice, or is on the commented internal list', () => {
    const missing = migrationTables().filter((t) => !noticed.includes(t) && !INTERNAL_TABLES.includes(t));
    expect(missing, `add these tables to STORED_GROUPS (or INTERNAL_TABLES, with a reason) in lib/config/privacy.ts`).toEqual([]);
  });

  it('the notice names no table the migrations do not have', () => {
    const real = migrationTables();
    expect([...noticed, ...INTERNAL_TABLES].filter((t) => !real.includes(t))).toEqual([]);
  });

  it('no table is in two places', () => {
    const all = [...noticed, ...INTERNAL_TABLES];
    expect(all.filter((t, i) => all.indexOf(t) !== i)).toEqual([]);
  });

  it('every group has plain words and at least one table', () => {
    for (const group of STORED_GROUPS) {
      expect(group.words.length, group.id).toBeGreaterThan(10);
      expect(group.tables.length, group.id).toBeGreaterThan(0);
    }
  });
});

describe('the notice matches what each provider adapter keeps (MOM-102)', () => {
  const hevy = normalizeHevyWorkout({
    id: 'w1',
    title: 'Upper A',
    start_time: '2026-10-19T09:00:00Z',
    end_time: '2026-10-19T10:00:00Z',
    exercises: [
      {
        title: 'Bench Press',
        sets: [
          { type: 'warmup', weight_kg: 40, reps: 8 },
          { type: 'normal', weight_kg: 60, reps: 5 },
        ],
      },
    ],
  });
  const google = normalizeGoogleEvent(
    {
      id: 'evt1',
      status: 'confirmed',
      summary: 'Doctor appointment',
      start: { dateTime: '2026-10-19T09:00:00Z' },
      end: { dateTime: '2026-10-19T10:00:00Z' },
    },
    { now: () => new Date('2026-10-20T00:00:00Z') },
  );

  it('Hevy: the stored fields are exactly the ones the notice lists', () => {
    expect(hevy.ok).toBe(true);
    if (!hevy.ok) return;
    expect(fieldPaths(hevy.data)).toEqual(fieldList(PROVIDER_NOTICES.hevy.stores));
  });

  it('Google Calendar: the stored fields are exactly the ones the notice lists, and the real title is not among them', () => {
    expect(google.kind).toBe('activity');
    if (google.kind !== 'activity') return;
    expect(fieldPaths(google.data)).toEqual(fieldList(PROVIDER_NOTICES.google_calendar.stores));
    expect(JSON.stringify(google.data)).not.toContain('Doctor appointment');
  });

  it('every provider the catalog offers has a notice entry, and the notice has no other', () => {
    const offered = INTEGRATION_CATALOG.map((e) => e.provider).sort();
    expect(Object.keys(PROVIDER_NOTICES).sort()).toEqual(offered);
  });
});

describe('the notice names every service that handles data (MOM-102)', () => {
  it('every sign-up bot check the code can run has a notice entry or is listed as not in use', () => {
    const env = readFileSync(join(ROOT, 'lib', 'config', 'env.ts'), 'utf8');
    const list = /const CAPTCHA_PROVIDERS = \[([^\]]*)\]/.exec(env)?.[1] ?? '';
    const providers = [...list.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(providers.length).toBeGreaterThan(0);
    const known = [...Object.keys(SERVICES), ...UNUSED_CAPTCHA_OPTIONS];
    expect(providers.filter((p) => !known.includes(p))).toEqual([]);
  });

  it('the default sign-up bot check is one the notice names', () => {
    const env = readFileSync(join(ROOT, 'lib', 'config', 'env.ts'), 'utf8');
    const fallback = /NEXT_PUBLIC_CAPTCHA_PROVIDER: z\.enum\(CAPTCHA_PROVIDERS\)\.default\('([a-z]+)'\)/.exec(env)?.[1];
    expect(fallback && Object.keys(SERVICES)).toContain(fallback);
  });
});

describe('the notice covers browser storage (MOM-102)', () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return name === 'node_modules' || name === '.next' ? [] : sourceFiles(full);
      return /\.(ts|tsx)$/.test(name) ? [full] : [];
    });
  }

  it('only the files the notice describes use localStorage, sessionStorage, indexedDB or document.cookie', () => {
    const users = ['app', 'components', 'lib']
      .flatMap((d) => sourceFiles(join(ROOT, d)))
      .filter((file) => /\b(localStorage|sessionStorage|indexedDB)\b|document\.cookie/.test(stripComments(readFileSync(file, 'utf8'))))
      .map((file) => file.slice(ROOT.length + 1).replaceAll('\\', '/'))
      .sort();
    expect(users, 'describe the new storage in DEVICE_STORAGE and list the file in lib/config/privacy.ts').toEqual(
      [...DEVICE_STORAGE.filesUsingBrowserStorage].sort(),
    );
  });
});
