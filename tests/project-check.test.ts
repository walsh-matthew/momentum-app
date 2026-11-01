// The repository check (scripts/project-check.ts, MOM-124 item d). The git command is replaced by a fake, so
// nothing here runs git or touches the network, and the tests prove the one printed line never carries the URL
// or the credentials part of it.

import { describe, expect, it } from 'vitest';
import { type Io, type RunResult, NO_REMOTE, OK, UNREADABLE, main, mismatch, parseRemote } from '../scripts/project-check';

function check(run: Io['run']): { code: number; lines: string[] } {
  const lines: string[] = [];
  const code = main({ out: (text) => lines.push(text), run });
  return { code, lines };
}

const remote = (url: string): Io['run'] => () => ({ status: 0, stdout: `${url}\n` });

describe('parseRemote', () => {
  it.each([
    'https://github.com/walsh-matthew/momentum-app',
    'https://github.com/walsh-matthew/momentum-app.git',
    'https://github.com/walsh-matthew/momentum-app/',
    'https://github.com/walsh-matthew/momentum-app.git/',
    'https://ghp_faketoken123@github.com/walsh-matthew/momentum-app.git',
    'https://user:ghp_faketoken123@github.com/walsh-matthew/momentum-app.git',
    'git@github.com:walsh-matthew/momentum-app.git',
    'git@github.com:walsh-matthew/momentum-app',
    'ssh://git@github.com/walsh-matthew/momentum-app.git',
    'ssh://git@github.com:22/walsh-matthew/momentum-app',
  ])('reads the owner and repository from %s', (url) => {
    expect(parseRemote(url)).toEqual({ owner: 'walsh-matthew', repo: 'momentum-app' });
  });

  it.each(['', 'not a url', 'https://gitlab.com/walsh-matthew/momentum-app.git', 'https://github.com/walsh-matthew', '/some/local/path'])(
    'returns null for %j',
    (url) => {
      expect(parseRemote(url)).toBeNull();
    },
  );
});

describe('main', () => {
  it.each([
    'https://github.com/walsh-matthew/momentum-app.git',
    'https://github.com/walsh-matthew/momentum-app',
    'https://x-access-token:ghp_faketoken123@github.com/walsh-matthew/momentum-app.git',
    'git@github.com:walsh-matthew/momentum-app.git',
    'ssh://git@github.com/walsh-matthew/momentum-app.git',
    'https://github.com/Walsh-Matthew/Momentum-App.git',
  ])('passes, exit 0, for %s', (url) => {
    const { code, lines } = check(remote(url));
    expect(code).toBe(0);
    expect(lines).toEqual([OK]);
  });

  it('fails with exit 1 and its own line for another owner', () => {
    const { code, lines } = check(remote('https://github.com/someone-else/momentum-app.git'));
    expect(code).toBe(1);
    expect(lines).toEqual(['Project check: origin is someone-else/momentum-app, expected walsh-matthew/momentum-app']);
    expect(lines).toEqual([mismatch('someone-else/momentum-app')]);
  });

  it('fails with exit 1 for a fork of this repository (a different owner)', () => {
    const { code, lines } = check(remote('git@github.com:a-forker/momentum-app.git'));
    expect(code).toBe(1);
    expect(lines).toEqual(['Project check: origin is a-forker/momentum-app, expected walsh-matthew/momentum-app']);
  });

  it('fails with exit 1 and its own line for another repository under the same owner', () => {
    const { code, lines } = check(remote('https://github.com/walsh-matthew/other-project.git'));
    expect(code).toBe(1);
    expect(lines).toEqual(['Project check: origin is walsh-matthew/other-project, expected walsh-matthew/momentum-app']);
  });

  it('fails with exit 1 and its own line when git reports no origin remote', () => {
    const run: Io['run'] = (): RunResult => ({ status: 2, stdout: '' });
    const { code, lines } = check(run);
    expect(code).toBe(1);
    expect(lines).toEqual(['Project check: no origin remote (expected walsh-matthew/momentum-app)']);
    expect(lines).toEqual([NO_REMOTE]);
  });

  it('fails with exit 1 and the no-remote line when git cannot start', () => {
    const run: Io['run'] = (): RunResult => ({ status: null, stdout: '', error: 'spawn git ENOENT' });
    const { code, lines } = check(run);
    expect(code).toBe(1);
    expect(lines).toEqual([NO_REMOTE]);
  });

  it('fails with exit 1 and its own line for a host that is not github.com', () => {
    const { code, lines } = check(remote('https://gitlab.com/walsh-matthew/momentum-app.git'));
    expect(code).toBe(1);
    expect(lines).toEqual(['Project check: origin is not a readable github.com remote (expected walsh-matthew/momentum-app)']);
    expect(lines).toEqual([UNREADABLE]);
  });

  it('fails with exit 1 and the unreadable line for a garbage URL', () => {
    const { code, lines } = check(remote('not a url at all'));
    expect(code).toBe(1);
    expect(lines).toEqual([UNREADABLE]);
  });

  it.each([
    'https://user:ghp_faketoken123@github.com/walsh-matthew/momentum-app.git',
    'https://ghp_faketoken123@github.com/someone-else/momentum-app.git',
    'https://user:ghp_faketoken123@github.com/walsh-matthew/other-project.git',
    'https://user:ghp_faketoken123@gitlab.com/walsh-matthew/momentum-app.git',
  ])('never prints the URL, host or credentials for %s', (url) => {
    const { lines } = check(remote(url));
    const printed = lines.join('\n');
    expect(lines).toHaveLength(1);
    // "github.com" is allowed: the fixed unreadable-remote phrase names it. The URL's own parts are not.
    expect(printed).not.toMatch(/ghp_|faketoken|user:|https?:|@|gitlab\.com|\.git\b/);
  });

  it('prints nothing from the runner beyond the owner/repository pair', () => {
    const run: Io['run'] = (): RunResult => ({ status: 0, stdout: 'git@github.com:walsh-matthew/other-project.git\nextra SECRET_TOKEN_LINE\n' });
    const { lines } = check(run);
    expect(lines.join('\n')).not.toMatch(/SECRET_TOKEN_LINE/);
  });
});
