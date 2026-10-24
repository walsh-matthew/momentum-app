// Runs every SQL verify script in supabase/verify/ against the LOCAL Supabase database and fails if any check
// fails (MOM-67). The same command runs on a developer machine and in CI (.github/workflows/ci.yml).
//
//   npm run verify:sql                          run every script in supabase/verify/
//   npm run verify:sql -- supabase/verify/002_completion_guard.sql     only the named script(s)
//   options: --dir <dir>   --container <name>   --config <file>
//
// Before running anything it checks that the database has exactly the migrations in supabase/migrations/ applied.
//
// Each script ends with `select * from <results> order by n`, a table of (n, check_name, passed, detail). A script
// passes only if it printed that table, with at least one check, and every `passed` is true. A script that errors,
// prints nothing, or prints a row with no pass/fail value fails too, so a broken script can never read as green.
//
// How it connects: `docker exec` into the local stack's database container (supabase_db_<project_id>, started by
// `npx supabase start`) and pipes the file into psql. This is not `supabase db query --local -f`: that command
// sends a file as one prepared statement and refuses these scripts ("cannot insert multiple commands into a
// prepared statement"), and the scripts need several statements in one session because their results sit in a
// temp table. Because the only target is a local container, the runner cannot reach a hosted project, and it
// refuses a container whose name does not start with supabase_db_. No credentials are needed or read.
//
// Runs on Node 22.18 or newer, which executes .ts files directly. The file is self-contained (node: imports only)
// so that works, and every function the tests need is exported.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

// ---------------------------------------------------------------------------
// Reading a script's result table
// ---------------------------------------------------------------------------

export interface Check {
  n: number;
  name: string;
  passed: boolean;
  detail: string;
}

export interface ParsedOutput {
  checks: Check[];
  // Why the output cannot be trusted as a result table; null when it can. When set, `checks` is empty.
  problem: string | null;
}

// RFC 4180 CSV, which is what `psql --csv` prints: fields in double quotes may hold commas, line breaks and
// doubled quotes ("") for a quote. Throws on an unterminated quote.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      // A blank line is not a row.
      if (!(row.length === 1 && row[0] === '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (quoted) throw new Error('A quoted field is never closed.');
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const REQUIRED_COLUMNS = 'select * from <results> order by n';

function toBoolean(value: string): boolean | null {
  if (value === 't' || value === 'true') return true;
  if (value === 'f' || value === 'false') return false;
  return null;
}

// Turns psql's CSV output for one script into its checks. Fails closed: anything that is not a clean result table
// is a problem, never an empty list of failures.
export function parseVerifyOutput(csv: string): ParsedOutput {
  const fail = (problem: string): ParsedOutput => ({ checks: [], problem });
  let rows: string[][];
  try {
    rows = parseCsv(csv.replace(/^﻿/, ''));
  } catch (error) {
    return fail(`The output is not a result table (${error instanceof Error ? error.message : 'unreadable'}).`);
  }
  if (rows.length === 0) return fail(`The script printed no result table. It must end with: ${REQUIRED_COLUMNS}`);

  const header = rows[0];
  const nameColumn = header.indexOf('check_name');
  const passedColumn = header.indexOf('passed');
  if (nameColumn < 0 || passedColumn < 0) {
    return fail(`The last result has no check_name and passed columns. The script must end with: ${REQUIRED_COLUMNS}`);
  }
  const numberColumn = header.indexOf('n');
  const detailColumn = header.indexOf('detail');
  if (rows.length === 1) return fail('The result table has no checks.');

  const checks: Check[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (row.length !== header.length) return fail(`Row ${i} has ${row.length} fields; the table has ${header.length} columns.`);
    const number = numberColumn >= 0 ? Number(row[numberColumn]) : i;
    const label = Number.isFinite(number) ? `check ${number}` : `row ${i}`;
    const passed = toBoolean(row[passedColumn]);
    if (passed === null) return fail(`${label} ("${row[nameColumn]}") has no pass or fail value.`);
    checks.push({
      n: Number.isFinite(number) ? number : i,
      name: row[nameColumn],
      passed,
      detail: detailColumn >= 0 ? row[detailColumn] : '',
    });
  }
  return { checks, problem: null };
}

// ---------------------------------------------------------------------------
// Running scripts
// ---------------------------------------------------------------------------

export interface ScriptResult {
  file: string;
  checks: Check[];
  failed: Check[];
  // The script could not be run, errored, or printed something that is not a result table.
  problem: string | null;
}

export interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  // Set when the command could not be started at all (for example docker is not installed).
  error?: string;
}

export interface Io {
  cwd: string;
  out: (text: string) => void;
  err: (text: string) => void;
  // Runs a command with `input` on its standard input. Injected so tests need no Docker.
  run: (command: string, args: string[], input: string) => RunResult;
}

const CONTAINER_PATTERN = /^supabase_db_[A-Za-z0-9_.-]+$/;

// supabase_db_<project_id>, the name `supabase start` gives the local database container.
export function containerFromConfig(configToml: string): string | null {
  const match = /^\s*project_id\s*=\s*"([^"]+)"/m.exec(configToml);
  const name = match ? `supabase_db_${match[1]}` : null;
  return name && CONTAINER_PATTERN.test(name) ? name : null;
}

export function psqlArgs(container: string): string[] {
  // -X: ignore any psqlrc. -q: no banners. --csv: machine-readable. ON_ERROR_STOP: the first error ends the run
  // with a non-zero status instead of carrying on to a table that looks fine.
  return ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-q', '--csv', '-v', 'ON_ERROR_STOP=1'];
}

function firstLines(text: string, count: number): string {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '' && !/^NOTICE:/.test(line))
    .slice(0, count)
    .join(' | ');
}

export function runScript(file: string, sql: string, container: string, run: Io['run']): ScriptResult {
  const name = basename(file);
  const result = run('docker', psqlArgs(container), sql);
  if (result.error) {
    return { file: name, checks: [], failed: [], problem: `Could not start docker: ${result.error}` };
  }
  if (result.status !== 0) {
    const why = firstLines(result.stderr, 3) || `exit status ${result.status}`;
    return { file: name, checks: [], failed: [], problem: `The script errored: ${why}` };
  }
  const parsed = parseVerifyOutput(result.stdout);
  return {
    file: name,
    checks: parsed.checks,
    failed: parsed.checks.filter((check) => !check.passed),
    problem: parsed.problem,
  };
}

export function listVerifyScripts(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => join(dir, name));
}

// The version in a migration file name: 007_task_source_evidence.sql -> "007".
export function migrationVersions(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .map((name) => /^(\d+)_/.exec(name)?.[1] ?? name)
    .sort();
}

// null when the database has exactly the migrations in `dir` applied; otherwise what is different. The verify
// scripts test the schema as it is, so a database that is missing a migration (or has a leftover one) must not
// be reported as verified.
export function checkMigrationsApplied(container: string, dir: string, run: Io['run']): string | null {
  const args = [...psqlArgs(container).filter((a) => a !== '--csv' && a !== '-q'), '-A', '-t', '-c'];
  const result = run('docker', [...args, 'select version from supabase_migrations.schema_migrations order by version'], '');
  if (result.error) return `Could not start docker: ${result.error}`;
  if (result.status !== 0) return `Could not read the applied migrations: ${firstLines(result.stderr, 3) || `exit status ${result.status}`}`;
  const applied = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).sort();
  const files = migrationVersions(dir);
  const notApplied = files.filter((v) => !applied.includes(v));
  const leftover = applied.filter((v) => !files.includes(v));
  if (notApplied.length === 0 && leftover.length === 0) return null;
  const parts: string[] = [];
  if (notApplied.length > 0) parts.push(`not applied: ${notApplied.join(', ')}`);
  if (leftover.length > 0) parts.push(`applied but no file in ${basename(dir)}: ${leftover.join(', ')}`);
  return `The database does not match the migrations (${parts.join('; ')}). Rebuild it with: npx supabase db reset --local`;
}

export function isGreen(results: ScriptResult[]): boolean {
  return results.length > 0 && results.every((r) => r.problem === null && r.checks.length > 0 && r.failed.length === 0);
}

export function renderReport(results: ScriptResult[]): string {
  const lines: string[] = [];
  for (const r of results) {
    if (r.problem) {
      lines.push(`FAIL  ${r.file}: ${r.problem}`);
    } else if (r.failed.length > 0) {
      lines.push(`FAIL  ${r.file}: ${r.failed.length} of ${r.checks.length} checks failed`);
      for (const check of r.failed) lines.push(`        check ${check.n}: ${check.name}${check.detail ? ` (${check.detail})` : ''}`);
    } else {
      lines.push(`ok    ${r.file}: ${r.checks.length} checks passed`);
    }
  }
  const checks = results.reduce((sum, r) => sum + r.checks.length, 0);
  const failedChecks = results.reduce((sum, r) => sum + r.failed.length, 0);
  const brokenScripts = results.filter((r) => r.problem !== null).length;
  lines.push('');
  lines.push(
    `${results.length} scripts, ${checks} checks, ${failedChecks} failed checks, ${brokenScripts} scripts that errored or printed no usable result.`,
  );
  lines.push(isGreen(results) ? 'SQL verify: PASSED' : 'SQL verify: FAILED');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------

const HELP = `Usage: npm run verify:sql -- [script.sql ...] [options]

  (no arguments)        run every .sql file in supabase/verify/ against the local Supabase database
  script.sql ...        run only these files
  --dir <dir>           default supabase/verify
  --container <name>    default supabase_db_<project_id from supabase/config.toml>; must start with supabase_db_
  --config <file>       default supabase/config.toml
  --migrations <dir>    default supabase/migrations; the database must have exactly these applied
  -h, --help            this text

Needs the local stack: npx supabase start (Docker).`;

export function main(argv: string[], io: Io): number {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        dir: { type: 'string' },
        container: { type: 'string' },
        config: { type: 'string' },
        migrations: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (error) {
    io.err(`${error instanceof Error ? error.message : 'Invalid arguments.'}\n\n${HELP}`);
    return 2;
  }
  const values = parsed.values as Record<string, string | boolean | undefined>;
  if (values.help) {
    io.out(HELP);
    return 0;
  }

  let container = typeof values.container === 'string' ? values.container : null;
  if (container === null) {
    const configPath = resolve(io.cwd, typeof values.config === 'string' ? values.config : join('supabase', 'config.toml'));
    if (!existsSync(configPath)) {
      io.err(`Cannot find ${configPath}. Pass --container <name>.`);
      return 1;
    }
    container = containerFromConfig(readFileSync(configPath, 'utf8'));
    if (container === null) {
      io.err(`No project_id in ${configPath}. Pass --container <name>.`);
      return 1;
    }
  }
  if (!CONTAINER_PATTERN.test(container)) {
    io.err(`Refusing container "${container}": only the local stack's database container (supabase_db_...) is allowed.`);
    return 2;
  }

  const dir = resolve(io.cwd, typeof values.dir === 'string' ? values.dir : join('supabase', 'verify'));
  let files: string[];
  if (parsed.positionals.length > 0) {
    files = parsed.positionals.map((p) => resolve(io.cwd, p));
  } else {
    if (!existsSync(dir)) {
      io.err(`Cannot find ${dir}.`);
      return 1;
    }
    files = listVerifyScripts(dir);
  }
  if (files.length === 0) {
    io.err(`No .sql files to run in ${dir}. A pipeline that checks nothing must not pass.`);
    return 1;
  }
  const missing = files.filter((f) => !existsSync(f));
  if (missing.length > 0) {
    io.err(`Cannot find: ${missing.join(', ')}`);
    return 1;
  }

  const migrationsDir = resolve(io.cwd, typeof values.migrations === 'string' ? values.migrations : join('supabase', 'migrations'));
  if (!existsSync(migrationsDir)) {
    io.err(`Cannot find ${migrationsDir}.`);
    return 1;
  }
  const mismatch = checkMigrationsApplied(container, migrationsDir, io.run);
  if (mismatch) {
    io.err(mismatch);
    if (/Could not start docker|No such container|is not running/.test(mismatch)) io.err('Is the local stack running? Start it with: npx supabase start');
    return 1;
  }

  const results = files.map((file) => runScript(file, readFileSync(file, 'utf8'), container as string, io.run));
  io.out(renderReport(results));
  if (results.some((r) => r.problem?.startsWith('Could not start docker') || /No such container|is not running/.test(r.problem ?? ''))) {
    io.err('Is the local stack running? Start it with: npx supabase start');
  }
  return isGreen(results) ? 0 : 1;
}

function runCommand(command: string, args: string[], input: string): RunResult {
  const result = spawnSync(command, args, { input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 300_000 });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error ? result.error.message : undefined,
  };
}

// Runs only when started from the command line, not when a test imports the functions above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = main(process.argv.slice(2), {
    cwd: process.cwd(),
    out: (text) => process.stdout.write(`${text}\n`),
    err: (text) => process.stderr.write(`${text}\n`),
    run: runCommand,
  });
  process.exitCode = code;
}
