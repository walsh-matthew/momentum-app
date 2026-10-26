// "Claude never scores" (docs/DOMAIN_MODEL.md §4.2 principle 9, CLAUDE.md service layer): lib/engine/ is pure. It
// imports no service, database, model or network package, and calls no clock. This reads the source, like
// tests/ai-boundary.test.ts, so a slip fails here and names the file.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const engineDir = join(root, 'lib', 'engine');
const files = [
  ...readdirSync(engineDir).filter((n) => n.endsWith('.ts')).map((n) => join(engineDir, n)),
  join(root, 'types', 'scoreboard.ts'),
];

const IMPORT = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)'([^']+)'/g;
const importsOf = (source: string) => [...source.matchAll(IMPORT)].map((m) => m[1]);

// An engine file may import its own siblings and the engine's types, and nothing else.
const allowed = (specifier: string) => specifier.startsWith('./') || specifier === '@/types/scoreboard';

const CALLS: [string, RegExp][] = [
  ['fetch', /\bfetch\s*\(/],
  ['XMLHttpRequest', /XMLHttpRequest/],
  ['process.env', /process\.env/],
  ['Date.now', /Date\.now\s*\(/],
  ['new Date() with no argument', /new Date\s*\(\s*\)/],
  ['performance.now', /performance\.now/],
  ['Math.random', /Math\.random/],
  ['a timer', /\bset(?:Timeout|Interval)\s*\(/],
];

const problemsIn = (source: string) => [
  ...importsOf(source).filter((s) => !allowed(s)).map((s) => `imports ${s}`),
  ...CALLS.filter(([, pattern]) => pattern.test(source)).map(([name]) => `calls ${name}`),
];

describe('lib/engine imports nothing outside itself', () => {
  it('finds the engine files', () => expect(files.length).toBeGreaterThan(10));

  it.each(['@/lib/services', '@/lib/supabase', '@/lib/ai', '@/lib/config', '@anthropic-ai/', '@supabase/', 'server-only', 'next'])(
    'no engine file imports %s',
    (forbidden) => {
      const offenders = files.filter((f) => importsOf(readFileSync(f, 'utf8')).some((s) => s === forbidden || s.startsWith(forbidden)));
      expect(offenders.map((f) => f.replace(root, ''))).toEqual([]);
    },
  );

  it('every import is a sibling file or the engine’s own types', () => {
    const offenders = files.flatMap((f) => problemsIn(readFileSync(f, 'utf8')).filter((p) => p.startsWith('imports')).map((p) => `${f.replace(root, '')} ${p}`));
    expect(offenders).toEqual([]);
  });
});

describe('lib/engine reads no clock and makes no call out', () => {
  it('has no network, environment, clock, random or timer call', () => {
    const offenders = files.flatMap((f) => problemsIn(readFileSync(f, 'utf8')).filter((p) => p.startsWith('calls')).map((p) => `${f.replace(root, '')} ${p}`));
    expect(offenders).toEqual([]);
  });

  it('the check itself catches each of them', () => {
    expect(problemsIn("import { x } from '@/lib/services/goals';")).toEqual(['imports @/lib/services/goals']);
    expect(problemsIn("import Anthropic from '@anthropic-ai/sdk';")).toEqual(['imports @anthropic-ai/sdk']);
    expect(problemsIn('const t = Date.now();')).toEqual(['calls Date.now']);
    expect(problemsIn('const d = new Date();')).toEqual(['calls new Date() with no argument']);
    expect(problemsIn('await fetch(url);')).toEqual(['calls fetch']);
    expect(problemsIn('const d = new Date(ms);')).toEqual([]);
  });
});
