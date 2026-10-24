// The SQL verify runner (scripts/run-sql-verify.ts, MOM-67): runs every script in supabase/verify/ against the
// local database and fails the build if any check fails. Nothing here needs Docker: the command that would run
// psql is replaced by a fake, so these tests prove the pass/fail logic, and that a broken script can never read
// as a passing one. The real run against the local stack is the CI job (.github/workflows/ci.yml).

import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  type Io,
  type RunResult,
  checkMigrationsApplied,
  containerFromConfig,
  isGreen,
  main,
  migrationVersions,
  parseCsv,
  parseVerifyOutput,
  psqlArgs,
  renderReport,
  runScript,
} from '../scripts/run-sql-verify';

const root = process.cwd();
const HEADER = 'n,check_name,passed,detail';

describe('parseCsv', () => {
  it('reads plain rows', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('reads quoted fields with commas, doubled quotes and line breaks', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n"line1\nline2",z\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['line1\nline2', 'z'],
    ]);
  });
  it('reads CRLF line endings, a missing final newline, empty fields and blank lines', () => {
    expect(parseCsv('a,b\r\n1,\r\n\r\n,2')).toEqual([['a', 'b'], ['1', ''], ['', '2']]);
  });
  it('returns no rows for empty text', () => {
    expect(parseCsv('')).toEqual([]);
  });
  it('throws on a quote that is never closed', () => {
    expect(() => parseCsv('a,b\n"oops,1\n')).toThrow(/never closed/);
  });
});

describe('parseVerifyOutput', () => {
  it('reads a table where every check passed', () => {
    const out = parseVerifyOutput(`${HEADER}\n1,First,t,fine\n2,Second,t,\n`);
    expect(out.problem).toBeNull();
    expect(out.checks).toEqual([
      { n: 1, name: 'First', passed: true, detail: 'fine' },
      { n: 2, name: 'Second', passed: true, detail: '' },
    ]);
  });

  it('reads failed checks as failed', () => {
    const out = parseVerifyOutput(`${HEADER}\n1,A,t,\n2,B,f,got 3\n`);
    expect(out.problem).toBeNull();
    expect(out.checks.filter((c) => !c.passed).map((c) => c.name)).toEqual(['B']);
  });

  it('accepts true and false as well as t and f', () => {
    const out = parseVerifyOutput(`${HEADER}\n1,A,true,\n2,B,false,\n`);
    expect(out.checks.map((c) => c.passed)).toEqual([true, false]);
  });

  it('keeps a check name or detail that holds commas, quotes and line breaks', () => {
    const out = parseVerifyOutput(`${HEADER}\n1,"Name, with ""quotes""",t,"two\nlines"\n`);
    expect(out.checks[0]).toMatchObject({ name: 'Name, with "quotes"', detail: 'two\nlines' });
  });

  it('ignores a leading byte order mark', () => {
    expect(parseVerifyOutput(`﻿${HEADER}\n1,A,t,\n`).problem).toBeNull();
  });

  it('works when the table has only the columns it needs', () => {
    const out = parseVerifyOutput('check_name,passed\nA,t\n');
    expect(out.problem).toBeNull();
    expect(out.checks).toEqual([{ n: 1, name: 'A', passed: true, detail: '' }]);
  });

  // Each of these must be a problem, never an empty list that looks like "nothing failed".
  it.each([
    ['empty output', ''],
    ['only whitespace', '\n\n'],
    ['a header and no checks', `${HEADER}\n`],
    ['a table without the passed column', 'n,check_name,detail\n1,A,x\n'],
    ['a table without the check_name column', 'n,passed\n1,t\n'],
    ['a different result table', 'count\n5\n'],
    ['a null pass value', `${HEADER}\n1,A,,x\n`],
    ['a pass value that is not a boolean', `${HEADER}\n1,A,yes,x\n`],
    ['a row with the wrong number of fields', `${HEADER}\n1,A,t\n`],
    ['an unterminated quote', `${HEADER}\n1,"A,t,x\n`],
    ['a second result table after the first', `${HEADER}\n1,A,t,x\n${HEADER}\n`],
  ])('treats %s as a problem', (_name, csv) => {
    const out = parseVerifyOutput(csv);
    expect(out.problem).toEqual(expect.any(String));
    expect(out.checks).toEqual([]);
  });

  it('names the check that has no pass value', () => {
    expect(parseVerifyOutput(`${HEADER}\n1,A,t,\n7,Seventh,,\n`).problem).toMatch(/check 7 \("Seventh"\)/);
  });
});

describe('the command it runs', () => {
  it('execs psql in the named container, reading the script on standard input, stopping at the first error', () => {
    const args = psqlArgs('supabase_db_momentum-app');
    expect(args.slice(0, 4)).toEqual(['exec', '-i', 'supabase_db_momentum-app', 'psql']);
    expect(args).toContain('ON_ERROR_STOP=1');
    expect(args).toContain('--csv');
    expect(args).not.toContain('-f');
  });

  it('takes the container from the project id in config.toml', () => {
    expect(containerFromConfig('# x\nproject_id = "momentum-app"\n[api]\n')).toBe('supabase_db_momentum-app');
    expect(containerFromConfig('[api]\nport = 1\n')).toBeNull();
    expect(containerFromConfig('project_id = "bad name; rm -rf /"')).toBeNull();
  });

  it('the real config.toml gives the container the CI job and `supabase start` use', () => {
    expect(containerFromConfig(readFileSync(join(root, 'supabase', 'config.toml'), 'utf8'))).toBe('supabase_db_momentum-app');
  });
});

// A scripted stand-in for `docker`. psql's CSV result for a verify script, or a canned failure.
interface Call {
  command: string;
  args: string[];
  input: string;
}
function fakeIo(cwd: string, answer: (call: Call) => RunResult, calls: Call[] = []) {
  const out: string[] = [];
  const err: string[] = [];
  const io: Io = {
    cwd,
    out: (t) => out.push(t),
    err: (t) => err.push(t),
    run: (command, args, input) => {
      const call = { command, args, input };
      calls.push(call);
      return answer(call);
    },
  };
  return { io, out, err, calls };
}
const ok = (stdout: string): RunResult => ({ status: 0, stdout, stderr: '' });
const isMigrationQuery = (call: Call) => call.args.includes('-c');

describe('runScript', () => {
  const sql = 'select 1;';
  it('is green for a clean table', () => {
    const r = runScript('/x/001_a.sql', sql, 'supabase_db_x', () => ok(`${HEADER}\n1,A,t,\n2,B,t,\n`));
    expect(r).toMatchObject({ file: '001_a.sql', problem: null });
    expect(r.checks).toHaveLength(2);
    expect(r.failed).toEqual([]);
    expect(isGreen([r])).toBe(true);
  });

  it('is not green when one check failed', () => {
    const r = runScript('/x/001_a.sql', sql, 'supabase_db_x', () => ok(`${HEADER}\n1,A,t,\n2,B,f,why\n`));
    expect(r.failed.map((c) => c.name)).toEqual(['B']);
    expect(isGreen([r])).toBe(false);
  });

  it('sends the script itself to the command', () => {
    let seen: Call | undefined;
    runScript('/x/001_a.sql', 'select 42;', 'supabase_db_x', (command, args, input) => {
      seen = { command, args, input };
      return ok(`${HEADER}\n1,A,t,\n`);
    });
    expect(seen).toMatchObject({ command: 'docker', input: 'select 42;' });
  });

  it('is not green when the script errored, even if it printed a table first', () => {
    const r = runScript('/x/001_a.sql', sql, 'supabase_db_x', () => ({
      status: 3,
      stdout: `${HEADER}\n1,A,t,\n`,
      stderr: 'NOTICE:  noise\nERROR:  relation "t" does not exist\nLINE 1: select',
    }));
    expect(r.problem).toMatch(/errored: ERROR:  relation "t" does not exist/);
    expect(r.problem).not.toMatch(/noise/);
    expect(isGreen([r])).toBe(false);
  });

  it('is not green when the command could not start', () => {
    const r = runScript('/x/001_a.sql', sql, 'supabase_db_x', () => ({ status: null, stdout: '', stderr: '', error: 'spawn docker ENOENT' }));
    expect(r.problem).toMatch(/Could not start docker/);
    expect(isGreen([r])).toBe(false);
  });

  it('is not green when it printed nothing', () => {
    expect(isGreen([runScript('/x/001_a.sql', sql, 'supabase_db_x', () => ok(''))])).toBe(false);
  });
});

describe('isGreen and renderReport', () => {
  const pass = { file: 'a.sql', checks: [{ n: 1, name: 'A', passed: true, detail: '' }], failed: [], problem: null };
  it('is not green for no results at all', () => {
    expect(isGreen([])).toBe(false);
  });
  it('is not green for a script with no checks, even with no problem recorded', () => {
    expect(isGreen([{ ...pass, checks: [] }])).toBe(false);
  });
  it('totals the scripts and checks and says PASSED', () => {
    const text = renderReport([pass, { ...pass, file: 'b.sql' }]);
    expect(text).toContain('ok    a.sql: 1 checks passed');
    expect(text).toContain('2 scripts, 2 checks, 0 failed checks');
    expect(text).toMatch(/SQL verify: PASSED$/);
  });
  it('lists each failed check with its detail, and says FAILED', () => {
    const failed = { n: 4, name: 'Owner can tick', passed: false, detail: 'got 0 rows' };
    const text = renderReport([{ ...pass, checks: [...pass.checks, failed], failed: [failed] }]);
    expect(text).toContain('FAIL  a.sql: 1 of 2 checks failed');
    expect(text).toContain('check 4: Owner can tick (got 0 rows)');
    expect(text).toMatch(/SQL verify: FAILED$/);
  });
  it('shows a script that errored', () => {
    const text = renderReport([{ file: 'x.sql', checks: [], failed: [], problem: 'The script errored: boom' }]);
    expect(text).toContain('FAIL  x.sql: The script errored: boom');
    expect(text).toMatch(/SQL verify: FAILED$/);
  });
});

describe('checkMigrationsApplied', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mig-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  for (const name of ['001_a.sql', '002_b.sql', '010_c.sql', 'README.md']) writeFileSync(join(dir, name), '-- x');

  it('reads the version from each file name and ignores other files', () => {
    expect(migrationVersions(dir)).toEqual(['001', '002', '010']);
  });
  it('is null when the applied versions match the files', () => {
    expect(checkMigrationsApplied('supabase_db_x', dir, () => ok('001\n002\n010\n'))).toBeNull();
  });
  it('names a migration that was not applied', () => {
    expect(checkMigrationsApplied('supabase_db_x', dir, () => ok('001\n002\n'))).toMatch(/not applied: 010/);
  });
  it('names an applied migration that has no file', () => {
    expect(checkMigrationsApplied('supabase_db_x', dir, () => ok('001\n002\n010\n011\n'))).toMatch(/applied but no file in .*: 011/);
  });
  it('fails when the applied migrations cannot be read', () => {
    expect(checkMigrationsApplied('supabase_db_x', dir, () => ({ status: 2, stdout: '', stderr: 'Error: No such container: x' }))).toMatch(
      /Could not read the applied migrations: Error: No such container/,
    );
  });
  it('asks without the CSV and quiet flags, so the answer is bare versions', () => {
    let seen: string[] = [];
    checkMigrationsApplied('supabase_db_x', dir, (_c, args) => {
      seen = args;
      return ok('001\n002\n010\n');
    });
    expect(seen).not.toContain('--csv');
    expect(seen).toEqual(expect.arrayContaining(['-A', '-t', '-c', 'ON_ERROR_STOP=1']));
  });
});

describe('main', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'verify-'));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  // A project folder with a config, two migrations and the given verify scripts.
  function project(name: string, scripts: Record<string, string>): string {
    const cwd = join(tmp, name);
    mkdirSync(join(cwd, 'supabase', 'verify'), { recursive: true });
    mkdirSync(join(cwd, 'supabase', 'migrations'), { recursive: true });
    writeFileSync(join(cwd, 'supabase', 'config.toml'), 'project_id = "demo"\n');
    for (const m of ['001_a.sql', '002_b.sql']) writeFileSync(join(cwd, 'supabase', 'migrations', m), '-- x');
    for (const [file, sql] of Object.entries(scripts)) writeFileSync(join(cwd, 'supabase', 'verify', file), sql);
    return cwd;
  }
  // The fake answers the migration query with both versions, and each script by what it contains.
  const answerBy = (results: Record<string, RunResult>) => (call: Call) =>
    isMigrationQuery(call) ? ok('001\n002\n') : (results[call.input] ?? ok(''));

  it('is green and exits 0 when every script passes', () => {
    const cwd = project('green', { '001_a.sql': 'A', '002_b.sql': 'B' });
    const { io, out, err, calls } = fakeIo(cwd, answerBy({ A: ok(`${HEADER}\n1,x,t,\n`), B: ok(`${HEADER}\n1,y,t,\n2,z,t,\n`) }));
    expect(main([], io)).toBe(0);
    expect(out.join('\n')).toContain('2 scripts, 3 checks, 0 failed checks');
    expect(err).toEqual([]);
    // The migration check first, then each script in name order, all in the local container.
    expect(calls.map((c) => c.input)).toEqual(['', 'A', 'B']);
    expect(calls.every((c) => c.command === 'docker' && c.args.includes('supabase_db_demo'))).toBe(true);
  });

  it('exits 1 when any check fails, and still reports the other scripts', () => {
    const cwd = project('onefail', { '001_a.sql': 'A', '002_b.sql': 'B' });
    const { io, out } = fakeIo(cwd, answerBy({ A: ok(`${HEADER}\n1,x,t,\n`), B: ok(`${HEADER}\n1,y,f,bad\n`) }));
    expect(main([], io)).toBe(1);
    expect(out.join('\n')).toContain('ok    001_a.sql');
    expect(out.join('\n')).toContain('FAIL  002_b.sql: 1 of 1 checks failed');
  });

  it('exits 1 when a script errors', () => {
    const cwd = project('errored', { '001_a.sql': 'A' });
    const { io } = fakeIo(cwd, answerBy({ A: { status: 3, stdout: '', stderr: 'ERROR:  boom' } }));
    expect(main([], io)).toBe(1);
  });

  it('exits 1 when there are no scripts: checking nothing must not pass', () => {
    const cwd = project('empty', {});
    const { io, err, calls } = fakeIo(cwd, answerBy({}));
    expect(main([], io)).toBe(1);
    expect(err.join('\n')).toMatch(/No \.sql files/);
    expect(calls).toEqual([]);
  });

  it('exits 1, running no script, when the database is missing a migration', () => {
    const cwd = project('stale', { '001_a.sql': 'A' });
    const { io, err, calls } = fakeIo(cwd, (call) => (isMigrationQuery(call) ? ok('001\n') : ok(`${HEADER}\n1,x,t,\n`)));
    expect(main([], io)).toBe(1);
    expect(err.join('\n')).toMatch(/not applied: 002/);
    expect(calls).toHaveLength(1);
  });

  it('says to start the stack when docker cannot reach the container', () => {
    const cwd = project('nostack', { '001_a.sql': 'A' });
    const { io, err } = fakeIo(cwd, () => ({ status: 1, stdout: '', stderr: 'Error response from daemon: No such container: supabase_db_demo' }));
    expect(main([], io)).toBe(1);
    expect(err.join('\n')).toMatch(/npx supabase start/);
  });

  it('runs only the scripts it is given', () => {
    const cwd = project('subset', { '001_a.sql': 'A', '002_b.sql': 'B' });
    const { io, calls } = fakeIo(cwd, answerBy({ B: ok(`${HEADER}\n1,y,t,\n`) }));
    expect(main([join('supabase', 'verify', '002_b.sql')], io)).toBe(0);
    expect(calls.map((c) => c.input)).toEqual(['', 'B']);
  });

  it('exits 1 for a named script that does not exist', () => {
    const cwd = project('missing', { '001_a.sql': 'A' });
    const { io, err, calls } = fakeIo(cwd, answerBy({}));
    expect(main(['nope.sql'], io)).toBe(1);
    expect(err.join('\n')).toMatch(/Cannot find/);
    expect(calls).toEqual([]);
  });

  it.each([
    ['a hosted-looking name', 'db.abcdefgh.supabase.co'],
    ['a container that is not the database', 'supabase_auth_demo'],
    ['an empty name', ''],
    ['a name with a shell character', 'supabase_db_x;rm'],
  ])('refuses %s as the container, before any command runs', (_name, container) => {
    const cwd = project(`refuse-${container.length}-${_name.length}`, { '001_a.sql': 'A' });
    const { io, err, calls } = fakeIo(cwd, answerBy({}));
    expect(main(['--container', container], io)).toBe(2);
    expect(err.join('\n')).toMatch(/Refusing container/);
    expect(calls).toEqual([]);
  });

  it('accepts an explicit supabase_db_ container', () => {
    const cwd = project('explicit', { '001_a.sql': 'A' });
    const { io, calls } = fakeIo(cwd, answerBy({ A: ok(`${HEADER}\n1,x,t,\n`) }));
    expect(main(['--container', 'supabase_db_other'], io)).toBe(0);
    expect(calls.every((c) => c.args.includes('supabase_db_other'))).toBe(true);
  });

  it('exits 1 when config.toml is missing and no container is given', () => {
    const cwd = project('noconfig', { '001_a.sql': 'A' });
    rmSync(join(cwd, 'supabase', 'config.toml'));
    const { io, err } = fakeIo(cwd, answerBy({}));
    expect(main([], io)).toBe(1);
    expect(err.join('\n')).toMatch(/Cannot find .*config\.toml/);
  });

  it('exits 2 with help for an unknown option, and 0 for --help', () => {
    const cwd = project('args', { '001_a.sql': 'A' });
    const bad = fakeIo(cwd, answerBy({}));
    expect(main(['--nope'], bad.io)).toBe(2);
    const help = fakeIo(cwd, answerBy({}));
    expect(main(['--help'], help.io)).toBe(0);
    expect(help.out.join('\n')).toContain('Usage: npm run verify:sql');
    expect(help.calls).toEqual([]);
  });
});

describe('the repository itself', () => {
  const verifyDir = join(root, 'supabase', 'verify');
  const scripts = readdirSync(verifyDir).filter((f) => f.endsWith('.sql'));

  it('has verify scripts for the runner to find', () => {
    expect(scripts.length).toBeGreaterThanOrEqual(8);
  });

  // The runner reads the table a script ends with. Without this, a new script that forgot it would fail only in CI.
  it.each(scripts)('%s ends by selecting its result table in order', (file) => {
    const text = readFileSync(join(verifyDir, file), 'utf8').replace(/\r\n/g, '\n').trimEnd();
    const lastStatement = text.split('\n').pop() ?? '';
    expect(lastStatement).toMatch(/^select \* from \w+_results order by n;$/);
    expect(text).toMatch(/create temp table \w+_results \(n int, check_name text, passed boolean, detail text\);/);
  });

  it('reads no environment variable and cannot reach a hosted project', () => {
    const source = readFileSync(join(root, 'scripts', 'run-sql-verify.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(source).not.toMatch(/process\.env/);
    expect(source).not.toMatch(/--linked|--db-url|project-ref|SUPABASE_ACCESS_TOKEN|DATABASE_URL|supabase\.co/);
  });

  it('is wired to npm run verify:sql', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    expect(pkg.scripts['verify:sql']).toMatch(/scripts\/run-sql-verify\.ts$/);
  });
});
