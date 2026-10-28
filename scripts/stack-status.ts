// Answers one question: is this project's local Supabase stack up? (MOM-124, part 1.)
//
//   npm run stack:status
//
// Prints exactly one line, "Local Supabase stack: running" or "Local Supabase stack: not running", and nothing
// else, on success or failure. Always exits 0: a nonzero exit makes npm print its own error lines on top of the
// one line this script promises, which is the thing MOM-124 exists to stop (F-047, F-049, F-051, F-057 all came
// from running the unfiltered `supabase status`, which prints the local stack's demo keys in plain text).
//
// Checks `docker ps` for a container named exactly `supabase_db_<project_id>` (project_id read from
// supabase/config.toml, the same way scripts/run-sql-verify.ts finds the verify container, duplicated rather
// than imported so this script stays self-contained like that one) rather than calling `supabase status`, so
// there is nothing in its own output that could ever hold a key. A docker error, a missing config file, or no
// matching container are all "not running" - this script only ever has one good answer to give.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CONTAINER_PATTERN = /^supabase_db_[A-Za-z0-9_.-]+$/;

// supabase_db_<project_id>, the name `supabase start` gives the local database container.
export function containerFromConfig(configToml: string): string | null {
  const match = /^\s*project_id\s*=\s*"([^"]+)"/m.exec(configToml);
  const name = match ? `supabase_db_${match[1]}` : null;
  return name && CONTAINER_PATTERN.test(name) ? name : null;
}

export interface RunResult {
  status: number | null;
  stdout: string;
  error?: string;
}

export interface Io {
  cwd: string;
  out: (text: string) => void;
  // Runs a command and returns its result. Injected so tests need no Docker.
  run: (command: string, args: string[]) => RunResult;
}

const RUNNING = 'Local Supabase stack: running';
const NOT_RUNNING = 'Local Supabase stack: not running';

export function isContainerRunning(container: string, names: string): boolean {
  return names
    .split(/\r?\n/)
    .map((line) => line.trim())
    .includes(container);
}

export function main(io: Io): number {
  const configPath = resolve(io.cwd, join('supabase', 'config.toml'));
  if (!existsSync(configPath)) {
    io.out(NOT_RUNNING);
    return 0;
  }
  const container = containerFromConfig(readFileSync(configPath, 'utf8'));
  if (container === null) {
    io.out(NOT_RUNNING);
    return 0;
  }
  const result = io.run('docker', ['ps', '--format', '{{.Names}}']);
  if (result.error || result.status !== 0) {
    io.out(NOT_RUNNING);
    return 0;
  }
  io.out(isContainerRunning(container, result.stdout) ? RUNNING : NOT_RUNNING);
  return 0;
}

function runCommand(command: string, args: string[]): RunResult {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 10_000 });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    error: result.error ? result.error.message : undefined,
  };
}

// Runs only when started from the command line, not when a test imports the functions above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = main({
    cwd: process.cwd(),
    out: (text) => process.stdout.write(`${text}\n`),
    run: runCommand,
  });
  process.exitCode = code;
}
