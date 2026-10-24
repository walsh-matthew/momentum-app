// The plan format check (scripts/check-plan-format.ts, MOM-75; docs/mom-75-plan-execution-spec.md sections 3 and 4).
//
// The commands in .claude/commands/ never name a ticket: they read whatever docs/plans/NEXT_BUILD_PLAN.md is current. So
// the plan has to keep the contract, and this test fails, naming the block, when it does not. It has three parts:
// - the real plan on disk passes (whatever blocks it holds today: nothing here names a ticket or a session);
// - for every rule there is a fixture in tests/fixtures/plans/ that breaks only that rule, and the check names the block;
// - the helper /run-block uses to find a block by key stops on zero or several matches.
// The check reads one file. It does not look at today's date, git or Jira.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PLAN,
  checkPlanFormat,
  describeBlock,
  findBlocks,
  main,
  parsePlan,
  renderViolation,
  type Violation,
} from '../scripts/check-plan-format';

const root = process.cwd();
const fixtureDir = join(root, 'tests', 'fixtures', 'plans');
const fixture = (name: string) => readFileSync(join(fixtureDir, name), 'utf8');
const realPlan = readFileSync(join(root, DEFAULT_PLAN), 'utf8');

const errorsOf = (text: string): Violation[] => checkPlanFormat(text).filter((v) => v.severity === 'error');
const rulesOf = (violations: Violation[]): string[] => violations.map((v) => v.rule).sort();

function run(args: string[], cwd = root) {
  const out: string[] = [];
  const err: string[] = [];
  const code = main(args, { cwd, out: (t) => out.push(t), err: (t) => err.push(t) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

// ---------------------------------------------------------------------------
// The real plan
// ---------------------------------------------------------------------------

describe('the current plan (docs/plans/NEXT_BUILD_PLAN.md)', () => {
  it('keeps the format contract', () => {
    const errors = errorsOf(realPlan);
    expect(errors.map(renderViolation), 'run `npm run plan:check` to see the same list').toEqual([]);
  });

  it('has at least one block, each with one key, a config line, one prompt and a gate', () => {
    const plan = parsePlan(realPlan);
    expect(plan.blocks.length).toBeGreaterThan(0);
    for (const block of plan.blocks) {
      expect(block.key, block.label).toMatch(/^MOM-\d+$/);
      expect(block.model && block.effort, block.label).toBeTruthy();
      expect(block.prompt, block.label).not.toBeNull();
      expect(block.gateItems.length, block.label).toBeGreaterThan(0);
    }
  });

  it('has a runbook before its first block, with one row per block, in the plan\'s order', () => {
    const plan = parsePlan(realPlan);
    expect(plan.runbook).not.toBeNull();
    expect(plan.runbook!.line).toBeLessThan(plan.blocks[0].line);
    expect(plan.runbook!.entries.map((e) => e.key)).toEqual(plan.blocks.map((b) => b.key));
  });

  it('can find each of its blocks by key, exactly once', () => {
    const plan = parsePlan(realPlan);
    for (const block of plan.blocks) expect(findBlocks(plan, block.key!)).toHaveLength(1);
  });

  it('does not fail on warnings: plans written before pull requests carry the old merge wording', () => {
    expect(run([]).code).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// A fixture per rule
// ---------------------------------------------------------------------------

describe('the valid fixture', () => {
  it('has no errors and no warnings', () => {
    expect(checkPlanFormat(fixture('valid.md'))).toEqual([]);
  });

  it('still passes with Windows line endings and a byte order mark', () => {
    const crlf = '﻿' + fixture('valid.md').replace(/\n/g, '\r\n');
    expect(checkPlanFormat(crlf)).toEqual([]);
  });

  afterEach(() => vi.useRealTimers());
  it('gives the same answer whatever today\'s date is: a session is never "not today\'s"', () => {
    vi.useFakeTimers();
    const results = ['2020-01-01T00:00:00Z', '2026-10-24T12:00:00Z', '2040-06-30T23:59:59Z'].map((when) => {
      vi.setSystemTime(new Date(when));
      return checkPlanFormat(fixture('valid.md'));
    });
    expect(results).toEqual([[], [], []]);
  });
});

// [fixture, the exact set of error rules it trips, the block the message must name (null = the plan as a whole)]
const FAILING: Array<[string, string[], string | null]> = [
  ['fail-missing-header.md', ['missing-header'], null],
  ['fail-bad-header.md', ['bad-header'], null],
  ['fail-missing-runbook.md', ['missing-runbook'], null],
  ['fail-runbook-after-blocks.md', ['runbook-not-near-top'], null],
  ['fail-runbook-missing-block.md', ['runbook-missing-block'], 'Block 1.2 (MOM-102)'],
  ['fail-runbook-unknown-key.md', ['runbook-unknown-key'], null],
  ['fail-runbook-order.md', ['runbook-order'], null],
  ['fail-runbook-duplicate-entry.md', ['runbook-duplicate-entry'], 'Block 1.1 (MOM-101)'],
  ['fail-runbook-no-gate-text.md', ['runbook-no-gate-text'], 'Block 1.2 (MOM-102)'],
  ['fail-no-blocks.md', ['no-blocks'], null],
  ['fail-heading-no-key.md', ['heading-no-key', 'runbook-unknown-key'], 'Block 1.2 "Thing 2"'],
  ['fail-heading-several-keys.md', ['heading-several-keys', 'runbook-unknown-key'], 'Block 1.2 "Thing 2 (MOM-102, MOM-103)"'],
  ['fail-heading-key-position.md', ['heading-key-position', 'runbook-unknown-key'], 'Block 1.2 "Thing 2 (MOM-102) and more words"'],
  ['fail-duplicate-key.md', ['duplicate-key', 'runbook-unknown-key'], 'Block 1.2 (MOM-101)'],
  ['fail-missing-config.md', ['missing-config'], 'Block 1.2 (MOM-102)'],
  ['fail-config-without-effort.md', ['missing-config'], 'Block 1.2 (MOM-102)'],
  ['fail-missing-prompt.md', ['missing-prompt'], 'Block 1.2 (MOM-102)'],
  ['fail-wrong-fence-language.md', ['missing-prompt'], 'Block 1.2 (MOM-102)'],
  ['fail-several-prompts.md', ['several-prompts'], 'Block 1.2 (MOM-102)'],
  ['fail-unclosed-fence.md', ['unclosed-fence', 'missing-gate'], 'Block 1.2 (MOM-102)'],
  ['fail-prompt-wrong-key.md', ['prompt-wrong-key'], 'Block 1.2 (MOM-102)'],
  ['fail-prompt-no-commit-key.md', ['prompt-no-commit-key'], 'Block 1.2 (MOM-102)'],
  ['fail-prompt-commit-wrong-key.md', ['prompt-commit-wrong-key'], 'Block 1.2 (MOM-102)'],
  ['fail-missing-gate.md', ['missing-gate'], 'Block 1.2 (MOM-102)'],
  ['fail-empty-gate.md', ['empty-gate'], 'Block 1.2 (MOM-102)'],
  ['fail-session-missing-prerequisites.md', ['session-missing-prerequisites'], null],
];

describe('every failing fixture fails, names the block, and trips only the rule it is for', () => {
  it.each(FAILING)('%s', (file, expectedRules, blockLabel) => {
    const errors = errorsOf(fixture(file));
    expect(errors.length).toBeGreaterThan(0);
    expect(rulesOf(errors)).toEqual([...expectedRules].sort());

    // The message names the block when the rule is about one block, and the plan as a whole when it is not.
    const primary = errors.find((v) => v.rule === expectedRules[0])!;
    expect(primary.block).toBe(blockLabel);
    if (blockLabel) expect(renderViolation(primary)).toContain(blockLabel);
    // And points at a line, so it can be fixed.
    if (primary.rule !== 'missing-header' && primary.rule !== 'missing-runbook' && primary.rule !== 'no-blocks') {
      expect(primary.line, primary.rule).not.toBeNull();
    }
  });

  it('a block-level failure in one block does not blame the other', () => {
    for (const [file, , label] of FAILING) {
      if (!label || !label.startsWith('Block 1.2') || file.startsWith('fail-heading') || file === 'fail-duplicate-key.md') continue;
      const blamed = new Set(errorsOf(fixture(file)).map((v) => v.block).filter(Boolean));
      expect(blamed.has('Block 1.1 (MOM-101)'), file).toBe(false);
    }
  });

  it('every rule the checker can report has a fixture that trips it', () => {
    const source = readFileSync(join(root, 'scripts', 'check-plan-format.ts'), 'utf8');
    const rules = new Set([...source.matchAll(/\badd\(\s*'([a-z-]+)'/g)].map((m) => m[1]));
    expect(rules.size).toBeGreaterThan(15);
    const covered = new Set([...FAILING.flatMap(([, r]) => r), 'legacy-merge']);
    expect([...rules].filter((r) => !covered.has(r))).toEqual([]);
  });

  it('every fixture file is listed here (no orphan fixtures, no missing ones)', () => {
    const files = readdirSync(fixtureDir).filter((f) => f.endsWith('.md')).sort();
    const listed = ['valid.md', 'warn-legacy-merge.md', ...FAILING.map(([f]) => f)].sort();
    expect(files).toEqual(listed);
  });
});

describe('the pre-pull-request wording is a warning, not an error', () => {
  it('is reported for a prompt that says to merge into main locally', () => {
    const violations = checkPlanFormat(fixture('warn-legacy-merge.md'));
    expect(violations.map((v) => [v.rule, v.severity, v.block])).toEqual([['legacy-merge', 'warning', 'Block 1.2 (MOM-102)']]);
  });

  it('does not fire for a prompt that says never to merge into main', () => {
    expect(checkPlanFormat(fixture('valid.md')).filter((v) => v.rule === 'legacy-merge')).toEqual([]);
  });

  it('passes by default and fails with --strict', () => {
    const file = join(fixtureDir, 'warn-legacy-merge.md');
    expect(run([file]).code).toBe(0);
    const strict = run([file, '--strict']);
    expect(strict.code).toBe(1);
    expect(strict.out).toContain('legacy-merge');
  });
});

// ---------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------

describe('the parser', () => {
  const planWith = (promptBody: string) =>
    [
      '> **Date:** 2026-10-24 | **Active Epic:** MOM-16 | **Base Commit:** abc1234',
      '',
      "## Today's runbook",
      '| 1 | `/run-block MOM-101` | Sonnet / Low | The page works and tests pass. |',
      '',
      '# SESSION 1: ONE',
      '**Your prerequisites before this session:** none.',
      '## Block 1.1: One (MOM-101)',
      '* **CLI Session Config:** Model: Opus | Effort: High',
      '```text',
      promptBody,
      '```',
      '* **User Verification Gate:**',
      '  - [x] Done.',
    ].join('\n');

  it('ignores heading-like lines, gates and config lines inside a prompt', () => {
    const text = planWith('Implement MOM-101: x. feat(MOM-101): y\n## Block 9.9: Not a block (MOM-9)\n# SESSION 9: not a session\n* **User Verification Gate:** inside\n* **CLI Session Config:** Model: Haiku | Effort: Low');
    const plan = parsePlan(text);
    expect(plan.blocks.map((b) => b.key)).toEqual(['MOM-101']);
    expect(plan.sessions).toHaveLength(1);
    expect(plan.blocks[0]).toMatchObject({ model: 'Opus', effort: 'High', gateItems: ['- [x] Done.'] });
    expect(errorsOf(text)).toEqual([]);
  });

  it('reads the model and effort as written, whatever the case or bullet', () => {
    for (const [line, model, effort] of [
      ['* **CLI Session Config:** Model: Sonnet | Effort: Medium', 'Sonnet', 'Medium'],
      ['- **CLI Session Config:** Model: Opus | Effort: xhigh', 'Opus', 'xhigh'],
      ['**CLI Session Config**: Model: Haiku 5.5 | Effort: low', 'Haiku 5.5', 'low'],
    ] as const) {
      const text = planWith('Implement MOM-101: x. feat(MOM-101): y').replace('* **CLI Session Config:** Model: Opus | Effort: High', line);
      expect(parsePlan(text).blocks[0], line).toMatchObject({ model, effort });
    }
  });

  it('treats a four-backtick fence as one fence, so a fenced example inside a prompt does not end it', () => {
    const text = planWith('Implement MOM-101: x. feat(MOM-101): y').replace('```text', '````text').replace(/\n```\n\* \*\*User/, '\n````\n* **User');
    const plan = parsePlan(text);
    expect(plan.blocks[0].prompt).not.toBeNull();
    expect(errorsOf(text)).toEqual([]);
  });

  it('accepts a list-style runbook row as well as a table row', () => {
    const text = planWith('Implement MOM-101: x. feat(MOM-101): y').replace(
      '| 1 | `/run-block MOM-101` | Sonnet / Low | The page works and tests pass. |',
      '1. `/run-block MOM-101` — check that the page works and the tests pass.',
    );
    expect(errorsOf(text)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The command line, as /run-block and /day-end use it
// ---------------------------------------------------------------------------

describe('npm run plan:check', () => {
  const valid = join(fixtureDir, 'valid.md');

  it('exits 0 and says OK for a good plan', () => {
    const r = run([valid]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^OK: 2 blocks/m);
  });

  it('exits 1 and prints every error with its block for a bad plan', () => {
    const r = run([join(fixtureDir, 'fail-missing-gate.md')]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('[missing-gate] Block 1.2 (MOM-102)');
    expect(r.out).toMatch(/^FAILED:/m);
  });

  it('exits 1 for a file that is not there', () => {
    const r = run([join(fixtureDir, 'nope.md')]);
    expect(r.code).toBe(1);
    expect(r.err).toContain('Cannot find');
  });

  it('exits 2 and prints help for an unknown option', () => {
    expect(run(['--nope']).code).toBe(2);
    expect(run(['--help']).out).toContain('Usage: npm run plan:check');
  });

  describe('--block <MOM-n> (what /run-block needs)', () => {
    it('prints the block\'s config, prerequisites, prompt lines, branch name and gate', () => {
      const r = run([valid, '--block', 'MOM-102']);
      expect(r.code).toBe(0);
      expect(r.out).toContain('Block 1.2: Thing 2 (MOM-102)');
      expect(r.out).toContain('Model: Sonnet | Effort: Medium');
      expect(r.out).toContain('session prerequisites: line');
      expect(r.out).toContain('feature branch named in the prompt: feature/MOM-102-thing-2');
      expect(r.out).toContain('2 items');
      expect(r.out).toContain('- [ ] The first check.');
    });

    it('accepts the bare number', () => {
      expect(run([valid, '--block', '101']).out).toContain('(MOM-101)');
    });

    it('stops on zero matches and lists the blocks that do exist', () => {
      const r = run([valid, '--block', 'MOM-555']);
      expect(r.code).toBe(1);
      expect(r.err).toContain('No block for MOM-555');
      expect(r.err).toContain('MOM-101, MOM-102');
    });

    it('stops on several matches', () => {
      const r = run([join(fixtureDir, 'fail-duplicate-key.md'), '--block', 'MOM-101']);
      expect(r.code).toBe(1);
      expect(r.err).toContain('2 blocks match MOM-101');
    });

    it('refuses something that is not a ticket key', () => {
      expect(run([valid, '--block', 'banana']).code).toBe(2);
    });

    it('works on any block of the real plan without naming one', () => {
      const first = parsePlan(realPlan).blocks[0];
      const r = run(['--block', first.key!]);
      expect(r.code).toBe(0);
      expect(r.out).toContain(first.heading.replace(/^## /, ''));
      expect(describeBlock(first, parsePlan(realPlan))).toContain(`Model: ${first.model} | Effort: ${first.effort}`);
    });
  });
});
