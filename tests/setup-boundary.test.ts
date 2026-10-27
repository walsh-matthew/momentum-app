// What setup's pure logic may and may not reach (MOM-111, CLAUDE.md Architectural Directive 1). lib/setup/ and
// types/setup.ts decide whether a draft can be trusted, so they must be callable from anywhere, tested without a database,
// and unable to call a model, the network or a clock. The one Claude call lives in lib/ai/setup.ts, which is server-only.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HARD_RULE_IDS, SETUP_TOPICS, TURN_KINDS, SETUP_CHUNKS } from '@/types/setup';
import * as db from '@/types/database.types';
import { HARD_RULES, SETUP_STEPS } from '@/lib/setup/steps';

const root = process.cwd();
const pureFiles = [
  ...readdirSync(join(root, 'lib', 'setup')).map((f) => join(root, 'lib', 'setup', f)),
  join(root, 'types', 'setup.ts'),
];

describe('lib/setup and types/setup are pure', () => {
  it('finds the files', () => expect(pureFiles.length).toBeGreaterThan(8));

  it.each([
    "'server-only'",
    '@/lib/ai/',
    '@/lib/services/',
    '@/lib/supabase/',
    '@/lib/config/env',
    '@anthropic-ai/',
    'ANTHROPIC_API_KEY',
    'process.env',
    'fetch(',
    'XMLHttpRequest',
  ])('nothing in them mentions %s', (forbidden) => {
    const offenders = pureFiles.filter((file) => readFileSync(file, 'utf8').includes(forbidden));
    expect(offenders.map((f) => f.replace(root, ''))).toEqual([]);
  });

  it('reads no clock: "today" is an input, not Date.now() or new Date()', () => {
    // The validator builds a Date only to check that an ISO date text is a real one; nothing asks what time it is.
    const offenders = pureFiles.filter((file) => /Date\.now\(|new Date\(\)/.test(readFileSync(file, 'utf8')));
    expect(offenders.map((f) => f.replace(root, ''))).toEqual([]);
  });

  it('the components never import them as a way round the service layer to the database', () => {
    const components = readdirSync(join(root, 'components'), { recursive: true, encoding: 'utf8' }).filter((f) => /\.tsx?$/.test(f));
    const offenders = components.filter((f) => /@\/lib\/setup\/(rows|evals)/.test(readFileSync(join(root, 'components', f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});

describe('the contract matches the rest of the app', () => {
  it('reuses the database enums rather than copying them', () => {
    // If a value is added to a database enum, the draft accepts it without a second edit.
    expect(db.MEASURES).toContain('checklist');
    expect(db.WORK_ITEM_KINDS).toEqual(['habit', 'milestone', 'deadline_task']);
  });

  it('has one hard rule id for each rule of the doc, in the doc\'s order', () => {
    expect(HARD_RULE_IDS).toHaveLength(8);
    expect(HARD_RULES.map((r) => r.id)).toEqual([...HARD_RULE_IDS]);
  });

  it('plays a part back after steps 3, 7, 10 and 11, and no other step', () => {
    expect(SETUP_STEPS.filter((s) => s.playbackAfter).map((s) => [s.n, s.playbackAfter])).toEqual([
      [3, 'goals'],
      [7, 'targets'],
      [10, 'planning'],
      [11, 'talk'],
    ]);
    expect(SETUP_CHUNKS).toHaveLength(4);
  });

  it('gives every topic and turn kind a home', () => {
    const stepTopics = new Set(SETUP_STEPS.flatMap((s) => s.topics));
    // 'starting_point' and the like are in steps; every topic a step lists must exist, and every topic must be in a step.
    for (const topic of SETUP_TOPICS) expect(stepTopics.has(topic), topic).toBe(true);
    expect(TURN_KINDS).toContain('playback');
  });
});
