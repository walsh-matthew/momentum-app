// The CI workflow (.github/workflows/ci.yml, MOM-67). It cannot be run here, so this holds its text to the rules
// the ticket sets: the right commands in the right order, and no credential, token or project reference anywhere.
// Whether it runs green on GitHub is checked there, on the first pull request.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const raw = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8').replace(/\r\n/g, '\n');
// The rules are about what the workflow does, not what its comments say, so comments are removed first.
const workflow = raw.replace(/^\s*#.*$/gm, '').replace(/\s+#\s.*$/gm, '');

// Splits the text of one job out of the workflow: from "  name:" to the next two-space key or the end.
function job(name: string): string {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  expect(start, `job ${name}`).toBeGreaterThan(-1);
  const rest = workflow.slice(start + 1);
  const next = rest.slice(1).search(/\n  [a-z-]+:\n/);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

const indexOfIn = (text: string, needle: string) => {
  const i = text.indexOf(needle);
  expect(i, needle).toBeGreaterThan(-1);
  return i;
};

describe('when it runs', () => {
  it('on every push and every pull request', () => {
    expect(workflow).toMatch(/^on:\n  push:\n  pull_request:\n/m);
  });
  it('has the two jobs branch protection will require', () => {
    expect(workflow).toMatch(/\n  checks:\n    name: checks\n/);
    expect(workflow).toMatch(/\n  database:\n    name: database\n/);
  });
});

describe('the checks job', () => {
  const checks = job('checks');
  it('installs from the lock file, then type checks, tests and builds, in that order', () => {
    const order = ['npm ci', 'npx tsc --noEmit', 'npm test', 'npm run build'].map((c) => indexOfIn(checks, `run: ${c}\n`));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it('builds with placeholder public values only, pointing at this machine', () => {
    expect(checks).toMatch(/NEXT_PUBLIC_SUPABASE_URL: http:\/\/127\.0\.0\.1:54321\n/);
    expect(checks).toMatch(/NEXT_PUBLIC_SUPABASE_ANON_KEY: ci-placeholder-anon-key\n/);
    const names = [...checks.matchAll(/^\s{6}([A-Z][A-Z0-9_]+):/gm)].map((m) => m[1]);
    expect(names.sort()).toEqual(['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_URL']);
  });
  it('needs no database and no Docker', () => {
    expect(checks).not.toMatch(/supabase start|setup-cli|supabase\/|docker|playwright|verify:sql/i);
  });
});

describe('the database job', () => {
  const database = job('database');
  it('starts the local stack, verifies the SQL, then runs the browser tests, in that order', () => {
    const order = [
      'npm ci',
      'supabase start',
      'npm run verify:sql',
      'npx playwright install --with-deps chromium',
      'npm run test:e2e',
    ].map((c) => indexOfIn(database, `run: ${c}\n`));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it('installs the Supabase CLI at the version package.json uses', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const wanted = String(pkg.devDependencies.supabase).replace(/^[^\d]*/, '');
    // package.json allows ^2.121.0; CI pins the version the repository was last verified with, which must be inside it.
    const pinned = /supabase\/setup-cli@v1\n\s+with:\n\s+version: (\d+\.\d+\.\d+)\n/.exec(database)?.[1];
    expect(pinned).toBeDefined();
    expect((pinned as string).split('.')[0]).toBe(wanted.split('.')[0]);
    expect(Number((pinned as string).split('.')[1])).toBeGreaterThanOrEqual(Number(wanted.split('.')[1]));
  });
  it('stops the stack even when a step failed, and keeps browser results only on failure', () => {
    expect(database).toMatch(/if: always\(\)\n\s+run: supabase stop --no-backup\n/);
    expect(database).toMatch(/if: failure\(\)\n\s+uses: actions\/upload-artifact@v4\n/);
  });
});

describe('no credential, token or project reference', () => {
  it.each([
    ['a repository secret', /secrets\./],
    ['the secrets context', /\$\{\{\s*secrets/],
    ['a Supabase access token', /SUPABASE_ACCESS_TOKEN|access[-_]token/i],
    ['a database password or url', /DB_PASSWORD|DATABASE_URL|--db-url|SUPABASE_DB/i],
    ['a service role key', /SERVICE_ROLE/i],
    ['a model key', /ANTHROPIC/i],
    ['a provider key or client', /HEVY|GOOGLE_CLIENT/i],
    ['a project reference or link', /project-ref|--linked|supabase link|projects\/[a-z]{20}/i],
    ['a hosted Supabase address', /\.supabase\.(co|com|in)\b/i],
    ['a push of migrations to a project', /db push|migration up --linked|db remote/i],
    ['a deploy', /vercel|deploy/i],
  ])('has no %s', (_name, pattern) => {
    expect(workflow).not.toMatch(pattern);
  });

  it('grants the token read access to the repository only', () => {
    expect(workflow).toMatch(/^permissions:\n  contents: read\n/m);
    expect(workflow).not.toMatch(/:\s*write\b/);
  });

  it('uses only published releases of actions, never a branch', () => {
    const uses = [...workflow.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
    expect(uses.length).toBeGreaterThanOrEqual(6);
    for (const u of uses) expect(u, u).toMatch(/^[\w.-]+\/[\w.-]+@v\d+$/);
  });
});

describe('.gitattributes', () => {
  it('pins every file to LF so line-ending-only differences stop appearing', () => {
    const attributes = readFileSync(join(root, '.gitattributes'), 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.trim() !== '' && !line.startsWith('#'));
    expect(attributes).toEqual(['* text=auto eol=lf']);
  });
});
