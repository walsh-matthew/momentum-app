// MOM-147 (failure log F-072, F-079): a transition settles in one render. In React 19 an update made after an await inside a
// transition's start function is not part of the transition, so it can render before the pending flag clears (an error beside
// "Saving…", a result beside a disabled button). Every such update is wrapped in the start function again:
//   startTransition(async () => { const r = await act(); startTransition(() => setX(r)); });
// This sweep reads the source of components/ and app/ and fails on an unwrapped update after an await. It counts three kinds:
// a set-state call (setX(...)), a router.refresh(), and a callback prop (onDone, onCreated, onModelView: any onXxx(...) or onXxx?.(...)),
// because a callback usually sets the parent's state. Pure: it reads the source, with no browser and no network.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(ts|tsx)$/.test(path) ? [path] : [];
  });
const FILES = ['components', 'app'].flatMap((d) => walk(join(ROOT, d))).map((p) => relative(ROOT, p).split(sep).join('/'));

const blank = (text: string) => text.replace(/[^\n]/g, ' ');

// The source with its comments and string contents blanked (same length, same line breaks), so a word inside either is never
// read as code. A '...' or "..." string ends at the end of its line, so an apostrophe in JSX text cannot swallow the file.
export function maskSource(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      for (; j < source.length; j++) {
        if (source[j] === '\\') j++;
        else if (source[j] === c) break;
        else if (source[j] === '\n' && c !== '`') break;
      }
      out += c + blank(source.slice(i + 1, j)) + (source[j] === c ? c : '');
      i = source[j] === c ? j + 1 : j;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

// The index of the bracket that closes the one at `open`.
function closing(text: string, open: number): number {
  const pair: Record<string, string> = { '(': ')', '{': '}' };
  const opener = text[open];
  const closer = pair[opener];
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === opener) depth++;
    else if (text[i] === closer && --depth === 0) return i;
  }
  return text.length - 1;
}

export interface Finding {
  line: number;
  call: string;
}

// A call that is itself awaited (`await setThemeChoice(next)`) is the action being run, not an update after it.
const SET_STATE = /(?<!\bawait\s+)\bset[A-Z]\w*\s*\(/g;
const ROUTER_REFRESH = /\brouter\s*\.\s*refresh\s*\(/g;
const CALLBACK_PROP = /(?<!\bawait\s+)\bon[A-Z]\w*\s*(?:\?\.)?\s*\(/g;

// Every update after an await inside an `async` start function that is not itself inside a start call.
export function unwrappedAfterAwait(source: string): Finding[] {
  const code = maskSource(source);
  const names = new Set<string>(['startTransition']);
  for (const m of code.matchAll(/\[\s*\w+\s*,\s*(\w+)\s*\]\s*=\s*useTransition\s*\(\s*\)/g)) names.add(m[1]);
  const findings: Finding[] = [];

  for (const name of names) {
    const open = new RegExp(`\\b${name}\\s*\\(\\s*async\\s*(?:\\([^)]*\\))?\\s*=>\\s*\\{`, 'g');
    for (const m of code.matchAll(open)) {
      const bodyOpen = m.index + m[0].length - 1;
      const bodyClose = closing(code, bodyOpen);
      let body = code.slice(bodyOpen + 1, bodyClose);
      const awaitAt = body.search(/\bawait\b/);
      if (awaitAt === -1) continue;
      // Blank every re-wrapping start call, so what is left is what runs outside the transition.
      for (const other of names) {
        const wrap = new RegExp(`\\b${other}\\s*\\(`, 'g');
        for (let w = wrap.exec(body); w; w = wrap.exec(body)) {
          if (w.index < awaitAt) continue;
          const end = closing(body, w.index + w[0].length - 1);
          body = body.slice(0, w.index) + blank(body.slice(w.index, end + 1)) + body.slice(end + 1);
          wrap.lastIndex = end + 1;
        }
      }
      const after = body.slice(awaitAt);
      for (const re of [SET_STATE, ROUTER_REFRESH, CALLBACK_PROP]) {
        for (const hit of after.matchAll(re)) {
          const at = bodyOpen + 1 + awaitAt + (hit.index ?? 0);
          findings.push({ line: code.slice(0, at).split('\n').length, call: hit[0].replace(/\s*\($/, '').trim() });
        }
      }
    }
  }
  return findings.sort((a, b) => a.line - b.line);
}

// The fixtures: BAD is the pattern the sweep must catch (each kind of update), GOOD is the same code wrapped again.
const BAD = `
const [pending, startTransition] = useTransition();
function run() {
  startTransition(async () => {
    try {
      const result = await action();
      if (result.ok) {
        setNotice(result.data);
        onDone?.();
        router.refresh();
        onCreated(result.goal);
      } else setError(result.error);
    } catch {
      setError('Could not reach the server.');
    }
  });
}`;
const GOOD = `
const [pending, startTransition] = useTransition();
function run() {
  setError(null);
  startTransition(async () => {
    setBusy(true);
    try {
      const result = await action();
      startTransition(() => {
        if (result.ok) {
          setNotice(result.data);
          onDone?.();
          router.refresh();
          onCreated(result.goal);
        } else setError(result.error);
      });
    } catch {
      startTransition(() => setError('Could not reach the server.'));
    }
  });
}`;

describe('the transition sweep (MOM-147)', () => {
  it('fails on a deliberately bad fixture, naming each kind of update', () => {
    const calls = unwrappedAfterAwait(BAD).map((f) => f.call);
    expect(calls).toEqual(['setNotice', 'onDone?.', 'router.refresh', 'onCreated', 'setError', 'setError']);
  });

  it('passes the same code once each update is wrapped again, and ignores updates before the await', () => {
    expect(unwrappedAfterAwait(GOOD)).toEqual([]);
  });

  it('reads a second start function and an alias of the start name', () => {
    const source = `
      const [a, startAsking] = useTransition();
      function ask() { startAsking(async () => { const r = await go(); onModelView(r); }); }`;
    expect(unwrappedAfterAwait(source).map((f) => f.call)).toEqual(['onModelView']);
  });

  it('does not read a word in a comment or a string as an update', () => {
    const source = `
      const [p, startTransition] = useTransition();
      startTransition(async () => {
        const r = await go();
        // setError(r) would be wrong here
        startTransition(() => setLabel('onDone(setError) router.refresh()'));
      });`;
    expect(unwrappedAfterAwait(source)).toEqual([]);
  });

  it('finds no unwrapped update after an await in components/ or app/', () => {
    const found = FILES.flatMap((file) =>
      unwrappedAfterAwait(readFileSync(join(ROOT, file), 'utf8')).map((f) => `${file}:${f.line} ${f.call}`),
    );
    expect(found).toEqual([]);
  });
});
