// The .gitignore rules for environment files and local-only folders (MOM-68).
//
// `vercel link` once added `.env*`, which also matched the tracked `.env.example`, so edits to the example never
// showed in `git status`. These tests hold the line in both directions: every secret env file stays ignored, and the
// example stays visible. `--no-index` matters: without it git skips tracked files, so `.env.example` would look
// "not ignored" even under the bad pattern and the test would prove nothing.

import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// Exit code of `git check-ignore -q --no-index <path>`: 0 = ignored, 1 = not ignored, anything else = git failed.
function checkIgnore(path: string): number {
  const result = spawnSync('git', ['check-ignore', '-q', '--no-index', path], { cwd: process.cwd() });
  if (result.error) throw result.error;
  return result.status ?? -1;
}

describe('.gitignore', () => {
  it.each(['.env', '.env.local', '.env.production', '.env.development.local', '.vercel'])(
    'ignores the secret or local-only file %s',
    (path) => {
      expect(checkIgnore(path)).toBe(0);
    },
  );

  it('does not ignore the tracked .env.example', () => {
    expect(checkIgnore('.env.example')).toBe(1);
  });

  it.each(['supabase/.branches/', 'supabase/snippets/', 'AGENTS.md'])('ignores the local-only path %s', (path) => {
    expect(checkIgnore(path)).toBe(0);
  });
});
