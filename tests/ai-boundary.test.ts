// The Claude call and its key stay on the server (CLAUDE.md, Architectural Directive 1; MOM-47).
// Anything under components/ can end up in a browser bundle, so none of it may import the model module,
// the Anthropic SDK or the env module. The build also enforces this for lib/ai/rebalance.ts (it imports
// `server-only`); this test catches it earlier and names the file.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const root = process.cwd();
const clientFiles = filesUnder(join(root, 'components'));

describe('no component reaches the model, the SDK or the key', () => {
  it('finds the component files', () => expect(clientFiles.length).toBeGreaterThan(5));

  it.each(['@/lib/ai/', '@anthropic-ai/', '@/lib/config/env', 'ANTHROPIC_API_KEY', '@/lib/supabase/admin'])(
    'nothing under components/ mentions %s',
    (forbidden) => {
      const offenders = clientFiles.filter((file) => readFileSync(file, 'utf8').includes(forbidden));
      expect(offenders).toEqual([]);
    },
  );
});

describe('the model module is server-only and is the only place that builds a client', () => {
  const source = readFileSync(join(root, 'lib', 'ai', 'rebalance.ts'), 'utf8');

  it("imports 'server-only', so a client import fails the build", () => {
    expect(source).toContain("import 'server-only';");
  });

  it('reads the key through the validated env accessor, never process.env directly', () => {
    expect(source).toContain('getAnthropicApiKey()');
    expect(source).not.toContain('process.env');
  });

  it('only the rebalance service imports it', () => {
    const importers = filesUnder(join(root, 'lib'))
      .concat(filesUnder(join(root, 'app')))
      .filter((file) => !file.endsWith(join('lib', 'ai', 'rebalance.ts')))
      .filter((file) => readFileSync(file, 'utf8').includes('@/lib/ai/rebalance'))
      .map((file) => file.replace(root, '').replaceAll('\\', '/'));
    expect(importers).toEqual(['/lib/services/tasks.ts']);
  });
});

// MOM-35: the week 1 plan call is held to the same boundary as the rebalance call.
describe('the week 1 plan module is server-only and is the only other place that builds a client', () => {
  const source = readFileSync(join(root, 'lib', 'ai', 'taskPlan.ts'), 'utf8');

  it("imports 'server-only', so a client import fails the build", () => {
    expect(source).toContain("import 'server-only';");
  });

  it('reads the key through the validated env accessor, never process.env directly', () => {
    expect(source).toContain('getAnthropicApiKey()');
    expect(source).not.toContain('process.env');
  });

  it('uses the official SDK and no second one', () => {
    expect(source).toContain("from '@anthropic-ai/sdk'");
    expect(source).not.toMatch(/from 'ai'|from '@ai-sdk\//);
  });

  it('no component imports it', () => {
    const offenders = clientFiles.filter((file) => readFileSync(file, 'utf8').includes('@/lib/ai/taskPlan'));
    expect(offenders).toEqual([]);
  });

  it('only the tasks service imports it, not even a Server Action', () => {
    const importers = filesUnder(join(root, 'lib'))
      .concat(filesUnder(join(root, 'app')))
      .filter((file) => !file.endsWith(join('lib', 'ai', 'taskPlan.ts')))
      .filter((file) => readFileSync(file, 'utf8').includes('@/lib/ai/taskPlan'))
      .map((file) => file.replace(root, '').replaceAll('\\', '/'));
    expect(importers).toEqual(['/lib/services/tasks.ts']);
  });
});
