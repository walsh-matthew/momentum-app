// The keyless stack check (scripts/stack-status.ts, MOM-124 part 1). Nothing here needs Docker: the command that
// would run `docker ps` is replaced by a fake, so these tests prove the one-line output never leaks anything the
// fake runner hands back, however it is handed back (F-047, F-049, F-051, F-057).

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type Io, type RunResult, isContainerRunning, main } from '../scripts/stack-status';

const RUNNING = 'Local Supabase stack: running';
const NOT_RUNNING = 'Local Supabase stack: not running';

// stack-status.ts reads supabase/config.toml under cwd; write it at that exact relative path inside the temp dir.
function writeConfig(dir: string, projectId: string): void {
  mkdirSync(join(dir, 'supabase'), { recursive: true });
  writeFileSync(join(dir, 'supabase', 'config.toml'), `project_id = "${projectId}"\n`);
}

function io(cwd: string, run: Io['run']): { io: Io; lines: string[] } {
  const lines: string[] = [];
  return { io: { cwd, out: (text) => lines.push(text), run }, lines };
}

describe('isContainerRunning', () => {
  it('matches an exact name among docker ps output lines', () => {
    expect(isContainerRunning('supabase_db_momentum-app', 'supabase_db_momentum-app\nsupabase_pooler_momentum-app\n')).toBe(true);
  });
  it('does not match a different project\'s container', () => {
    expect(isContainerRunning('supabase_db_momentum-app', 'supabase_db_other-project\n')).toBe(false);
  });
  it('does not match on prefix alone', () => {
    expect(isContainerRunning('supabase_db_momentum-app', 'supabase_db_momentum-app-staging\n')).toBe(false);
  });
});

describe('main', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function tempProjectDir(projectId: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'stack-status-'));
    dirs.push(dir);
    writeConfig(dir, projectId);
    return dir;
  }

  it('prints running when docker ps lists this project\'s container', () => {
    const dir = tempProjectDir('momentum-app');
    const run: Io['run'] = () => ({ status: 0, stdout: 'supabase_db_momentum-app\n' });
    const { io: fakeIo, lines } = io(dir, run);
    expect(main(fakeIo)).toBe(0);
    expect(lines).toEqual([RUNNING]);
  });

  it('prints not running when docker ps does not list this project\'s container', () => {
    const dir = tempProjectDir('momentum-app');
    const run: Io['run'] = () => ({ status: 0, stdout: 'supabase_pooler_momentum-app\n' });
    const { io: fakeIo, lines } = io(dir, run);
    expect(main(fakeIo)).toBe(0);
    expect(lines).toEqual([NOT_RUNNING]);
  });

  it('prints not running, exit 0, when another project\'s local stack is up instead', () => {
    const dir = tempProjectDir('momentum-app');
    const run: Io['run'] = () => ({ status: 0, stdout: 'supabase_db_some-other-app\n' });
    const { io: fakeIo, lines } = io(dir, run);
    expect(main(fakeIo)).toBe(0);
    expect(lines).toEqual([NOT_RUNNING]);
  });

  it('prints not running, exit 0, when docker itself fails to start', () => {
    const dir = tempProjectDir('momentum-app');
    const run: Io['run'] = () => ({ status: null, stdout: '', error: 'spawn docker ENOENT' });
    const { io: fakeIo, lines } = io(dir, run);
    expect(main(fakeIo)).toBe(0);
    expect(lines).toEqual([NOT_RUNNING]);
  });

  it('prints not running, exit 0, when docker exits non-zero', () => {
    const dir = tempProjectDir('momentum-app');
    const run: Io['run'] = () => ({ status: 1, stdout: '' });
    const { io: fakeIo, lines } = io(dir, run);
    expect(main(fakeIo)).toBe(0);
    expect(lines).toEqual([NOT_RUNNING]);
  });

  it('never prints anything from the runner\'s output, even if it holds keys', () => {
    const dir = tempProjectDir('momentum-app');
    const run: Io['run'] = (): RunResult => ({
      status: 0,
      stdout: 'ANON_KEY=eyFakeDemoKeyThatMustNeverAppearInOutput\nsupabase_db_momentum-app\n',
    });
    const { io: fakeIo, lines } = io(dir, run);
    expect(main(fakeIo)).toBe(0);
    expect(lines).toEqual([RUNNING]);
    expect(lines.join('\n')).not.toMatch(/KEY|eyFakeDemoKey/);
  });

  it('prints not running, exit 0, when supabase/config.toml is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stack-status-'));
    dirs.push(dir);
    const run: Io['run'] = () => ({ status: 0, stdout: 'supabase_db_momentum-app\n' });
    const { io: fakeIo, lines } = io(dir, run);
    expect(main(fakeIo)).toBe(0);
    expect(lines).toEqual([NOT_RUNNING]);
  });
});
