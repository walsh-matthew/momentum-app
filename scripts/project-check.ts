// Answers one question: is this checkout of walsh-matthew/momentum-app? (MOM-124, item d.)
//
//   npm run project:check
//
// Step 0 of /day-start, /run-block and /day-end. Reads `git remote get-url origin`, prints exactly one line, and
// exits 0 only when the remote is walsh-matthew/momentum-app on github.com; every failure exits 1.
//
// The line never holds the remote URL. A URL can carry a token (https://user:token@github.com/...), so the only
// values ever printed are the owner/repository pair found (limited to safe characters) or a fixed phrase. The git
// command is injected so tests make no git or network call. Unlike scripts/stack-status.ts this exits nonzero on
// purpose: failing is how the commands know to stop.

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const EXPECTED = 'walsh-matthew/momentum-app';

const NAME = '[A-Za-z0-9._-]+';
// https://[user[:token]@]github.com/o/r[.git][/]
const HTTPS = new RegExp(`^https://(?:[^/@\\s]+@)?github\\.com/(${NAME})/(${NAME}?)(?:\\.git)?/?$`, 'i');
// git@github.com:o/r[.git]
const SCP = new RegExp(`^[^/@\\s]+@github\\.com:(${NAME})/(${NAME}?)(?:\\.git)?/?$`, 'i');
// ssh://[user@]github.com[:port]/o/r[.git][/]
const SSH = new RegExp(`^ssh://(?:[^/@\\s]+@)?github\\.com(?::\\d+)?/(${NAME})/(${NAME}?)(?:\\.git)?/?$`, 'i');

// The owner and repository named by a GitHub remote URL, or null when it is not a GitHub URL this can read.
export function parseRemote(url: string): { owner: string; repo: string } | null {
  const trimmed = url.trim();
  for (const pattern of [HTTPS, SCP, SSH]) {
    const match = pattern.exec(trimmed);
    if (match) return { owner: match[1], repo: match[2] };
  }
  return null;
}

export interface RunResult {
  status: number | null;
  stdout: string;
  error?: string;
}

export interface Io {
  out: (text: string) => void;
  // Runs a command and returns its result. Injected so tests need no git.
  run: (command: string, args: string[]) => RunResult;
}

export const NO_REMOTE = `Project check: no origin remote (expected ${EXPECTED})`;
export const UNREADABLE = `Project check: origin is not a readable github.com remote (expected ${EXPECTED})`;
export const OK = `Project check: ${EXPECTED} (ok)`;
export const mismatch = (found: string): string => `Project check: origin is ${found}, expected ${EXPECTED}`;

export function main(io: Io): number {
  const result = io.run('git', ['remote', 'get-url', 'origin']);
  const url = result.stdout.trim();
  if (result.error || result.status !== 0 || url === '') {
    io.out(NO_REMOTE);
    return 1;
  }
  const found = parseRemote(url);
  if (found === null) {
    io.out(UNREADABLE);
    return 1;
  }
  const name = `${found.owner}/${found.repo}`;
  if (name.toLowerCase() !== EXPECTED) {
    io.out(mismatch(name));
    return 1;
  }
  io.out(OK);
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
  process.exitCode = main({
    out: (text) => process.stdout.write(`${text}\n`),
    run: runCommand,
  });
}
