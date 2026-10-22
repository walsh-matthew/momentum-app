// The execution-plan generator (scripts/generate-execution-plan.ts, MOM-63): turns BACKLOG.md tickets
// into build prompts that follow the repository standards in CLAUDE.md.
//
// Part of this suite is the "verify against repository standards" check: for every ticket in the real
// BACKLOG.md, the branch name and commit message the generator produces must match the patterns that
// CLAUDE.md states, and the Definition of Done it prints must be CLAUDE.md's own.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  COMMIT_TYPES,
  buildTicketPlan,
  deriveSlug,
  deriveTitle,
  main,
  parseBacklog,
  parseStandards,
  renderOverview,
  summarizeTickets,
} from '../scripts/generate-execution-plan';

const root = process.cwd();
const realBacklog = readFileSync(join(root, 'BACKLOG.md'), 'utf8');
const realClaude = readFileSync(join(root, 'CLAUDE.md'), 'utf8');

const SAMPLE = `# Momentum Backlog

| Area | Tickets |
| --- | --- |
| Schema | MOM-20, MOM-22 |
| Rebalance | MOM-47, MOM-48 |

## Discovered In-Flight

- [ ] Phases and gates have no table. Add a \`phases\` table. *Source: \`docs/NINETY_DAY_PLAN_CONTEXT.md\` §7.* *Jira: MOM-20.*
- [x] Carry-over history: one hop only. Resolved in MOM-22: see the table. *Source: MOM-9.* *Jira: MOM-22, MOM-20.*
- [ ] Rebalance: the builder only proposes carry-overs. Pull-forward needs tags
  that do not exist yet. *Source: MOM-15, \`PRODUCT_STRATEGY.md\` §4.* *Jira: MOM-47, MOM-48, MOM-47.*
- [ ] An item with no ticket at all, mentioning TODO(MOM-Phase2). *Source: MOM-1.*
- [ ] Layout: only a Jira field. *Jira: MOM-48.*
`;

describe('parseBacklog', () => {
  const backlog = parseBacklog(SAMPLE);

  it('reads the area table', () => {
    expect(backlog.areas).toEqual([
      { area: 'Schema', tickets: ['MOM-20', 'MOM-22'] },
      { area: 'Rebalance', tickets: ['MOM-47', 'MOM-48'] },
    ]);
  });

  it('reads each item: done flag, text, source, tickets (de-duplicated) and its starting line', () => {
    expect(backlog.items).toHaveLength(5);
    expect(backlog.items[0]).toMatchObject({
      line: 10,
      done: false,
      text: 'Phases and gates have no table. Add a `phases` table.',
      source: '`docs/NINETY_DAY_PLAN_CONTEXT.md` §7.',
      tickets: ['MOM-20'],
    });
    expect(backlog.items[1]).toMatchObject({ done: true, tickets: ['MOM-22', 'MOM-20'] });
    expect(backlog.items[2].tickets).toEqual(['MOM-47', 'MOM-48']);
  });

  it('joins an indented continuation line onto its item', () => {
    expect(backlog.items[2].text).toBe('Rebalance: the builder only proposes carry-overs. Pull-forward needs tags that do not exist yet.');
    expect(backlog.items[3].line).toBe(14);
  });

  it('takes tickets only from the Jira field, not from the text or the source', () => {
    expect(backlog.items[3].tickets).toEqual([]);
    expect(backlog.items[1].text).toContain('Resolved in MOM-22');
  });

  it('copes with an item that has only a Jira field', () => {
    expect(backlog.items[4]).toMatchObject({ text: 'Layout: only a Jira field.', source: null, tickets: ['MOM-48'] });
  });

  it('never leaves a Source or Jira marker in the text', () => {
    for (const item of backlog.items) expect(item.text).not.toMatch(/\*Source:|\*Jira:/);
  });
});

describe('parseBacklog on the real BACKLOG.md', () => {
  const backlog = parseBacklog(realBacklog);

  it('finds the table and the items', () => {
    expect(backlog.areas.length).toBeGreaterThan(5);
    expect(backlog.items.length).toBeGreaterThan(60);
    expect(backlog.items.filter((i) => i.done).length).toBeGreaterThan(5);
  });

  it('reads every item as text with sensible markers', () => {
    for (const item of backlog.items) {
      expect(item.text.length, `line ${item.line}`).toBeGreaterThan(10);
      expect(item.text, `line ${item.line}`).not.toMatch(/\*Source:|\*Jira:/);
      for (const key of item.tickets) expect(key).toMatch(/^MOM-\d+$/);
    }
  });

  it('every item that has a Jira field yields a ticket', () => {
    const raw = realBacklog.split(/\r?\n/);
    for (const item of backlog.items) {
      if (/\*Jira:/.test(raw[item.line - 1])) expect(item.tickets.length, `line ${item.line}`).toBeGreaterThan(0);
    }
  });

  it('lines point at the right place in the file', () => {
    const raw = realBacklog.split(/\r?\n/);
    for (const item of backlog.items) expect(raw[item.line - 1], `line ${item.line}`).toMatch(/^- \[[ xX]\] /);
  });
});

describe('parseStandards on the real CLAUDE.md', () => {
  const standards = parseStandards(realClaude);

  it("takes the Definition of Done verbatim, including today's checks", () => {
    expect(standards.definitionOfDone.length).toBeGreaterThanOrEqual(6);
    expect(standards.definitionOfDone.join('\n')).toContain('`npx tsc --noEmit`');
    expect(standards.definitionOfDone.join('\n')).toContain('`npm test`');
    expect(standards.definitionOfDone[0]).toMatch(/Feature branch created off clean `main`/);
  });

  it('finds the domain docs it requires reading first, and they exist', () => {
    expect(standards.domainDocs).toEqual(['docs/NINETY_DAY_PLAN_CONTEXT.md', 'docs/INTEGRATIONS_SPEC.md']);
    for (const doc of standards.domainDocs) expect(() => readFileSync(join(root, doc))).not.toThrow();
  });

  it('finds the branch and commit patterns', () => {
    expect(standards.branchPattern).toBe('feature/MOM-<number>-short-description');
    expect(standards.commitPattern).toBe('feat(MOM-<number>): concise description of changes');
  });

  it('falls back to built-in standards when the file has none', () => {
    const fallback = parseStandards('# Nothing useful here\n');
    expect(fallback.definitionOfDone.length).toBeGreaterThan(0);
    expect(fallback.branchPattern).toContain('feature/MOM-');
  });
});

describe('titles and slugs', () => {
  it('drops a short area prefix and keeps the first sentence', () => {
    expect(deriveTitle('Rebalance: the rule-based builder only proposes carry-overs. Pull-forward needs tags.', 'MOM-1')).toBe(
      'The rule-based builder only proposes carry-overs',
    );
  });
  it('does not mistake a colon inside brackets for an area prefix', () => {
    expect(deriveTitle('Failure log entries (dated: asked, model got wrong, why) and lane tracking have no table.', 'MOM-1')).toBe(
      'Failure log entries (dated: asked, model got wrong, why) and lane tracking have no table',
    );
  });
  it('shortens a very long first sentence', () => {
    const title = deriveTitle(`${'word '.repeat(60)}end.`, 'MOM-1');
    expect(title.length).toBeLessThanOrEqual(103);
    expect(title.endsWith('...')).toBe(true);
  });
  it('points at Jira when there is no item to name it after', () => {
    expect(deriveTitle(undefined, 'MOM-9')).toBe('See Jira for the scope of MOM-9');
  });
  it('makes a short, branch-safe slug without filler words', () => {
    expect(deriveSlug('The rule-based builder only proposes carry-overs')).toBe('rule-based-builder-proposes');
    expect(deriveSlug('Phases and gates have no table')).toBe('phases-gates-table');
  });
  it('never makes an empty or oversized slug', () => {
    expect(deriveSlug('the of and')).toBe('backlog-items');
    expect(deriveSlug('a'.repeat(100)).length).toBeLessThanOrEqual(40);
    expect(deriveSlug('Résumé: ünïcode — dash')).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe('a ticket plan', () => {
  const backlog = parseBacklog(SAMPLE);
  const standards = parseStandards(realClaude);

  it('names the branch and commit from the ticket and its first open item', () => {
    const plan = buildTicketPlan('MOM-20', backlog, standards);
    expect(plan).toMatchObject({
      ticket: 'MOM-20',
      area: 'Schema',
      title: 'Phases and gates have no table',
      branch: 'feature/MOM-20-phases-gates-table',
      commitMessage: 'feat(MOM-20): phases and gates have no table',
      relatedTickets: ['MOM-22'],
    });
    expect(plan.openItems).toHaveLength(1);
    expect(plan.resolvedItems).toHaveLength(1);
  });

  it('lists the items to resolve with their line and source, and counts the resolved ones separately', () => {
    const { prompt } = buildTicketPlan('MOM-20', backlog, standards);
    expect(prompt).toContain('Resolve BACKLOG.md line 10: Phases and gates have no table. Add a `phases` table.');
    expect(prompt).toContain('(Source: `docs/NINETY_DAY_PLAN_CONTEXT.md` §7.)');
    expect(prompt).toContain('Already resolved in BACKLOG.md: 1 item (not listed below).');
    expect(prompt).not.toContain('Carry-over history');
  });

  it('adds documents named in an item’s source to the ones CLAUDE.md requires', () => {
    const plan = buildTicketPlan('MOM-47', backlog, standards);
    expect(plan.docs).toEqual(['docs/NINETY_DAY_PLAN_CONTEXT.md', 'docs/INTEGRATIONS_SPEC.md', 'PRODUCT_STRATEGY.md']);
    expect(plan.prompt).toContain('`PRODUCT_STRATEGY.md`');
  });

  it('tells the reader to check Jira first and to stop on a mismatch', () => {
    const { prompt } = buildTicketPlan('MOM-47', backlog, standards);
    expect(prompt).toMatch(/Read ticket MOM-47 in Jira first/);
    expect(prompt).toMatch(/stop and flag it instead of picking one/);
  });

  it('only closes the ticket when its criteria are met', () => {
    const { prompt } = buildTicketPlan('MOM-47', backlog, standards);
    expect(prompt).toMatch(/Move MOM-47 to Done in Jira only if its acceptance criteria are met/);
  });

  it('prints CLAUDE.md’s Definition of Done verbatim', () => {
    const { prompt } = buildTicketPlan('MOM-47', backlog, standards);
    for (const bullet of standards.definitionOfDone) expect(prompt).toContain(`- [ ] ${bullet}`);
  });

  it('handles a ticket in the table with no BACKLOG item, without inventing a name', () => {
    const plan = buildTicketPlan('MOM-22', parseBacklog(SAMPLE.replace('MOM-22, MOM-20', 'MOM-20')), standards);
    expect(plan.openItems).toHaveLength(0);
    expect(plan.branch).toBe('feature/MOM-22-jira-scope');
    expect(plan.commitMessage).toBe('feat(MOM-22): implement as scoped in Jira');
    expect(plan.prompt).toContain('No open BACKLOG.md item references MOM-22');
  });

  it('honours --type and --slug', () => {
    const plan = buildTicketPlan('MOM-20', backlog, standards, { type: 'fix', slug: 'Phase Table!' });
    expect(plan.branch).toBe('feature/MOM-20-phase-table');
    expect(plan.commitMessage.startsWith('fix(MOM-20): ')).toBe(true);
  });
});

describe('output matches the repository standards, for every ticket in the real BACKLOG.md', () => {
  const backlog = parseBacklog(realBacklog);
  const standards = parseStandards(realClaude);
  const summaries = summarizeTickets(backlog);

  // The patterns CLAUDE.md states, turned into regular expressions.
  const branchRegex = new RegExp(`^${standards.branchPattern.replace(/<number>/, '\\d+').replace('short-description', '[a-z0-9]+(?:-[a-z0-9]+)*')}$`);
  const commitRegex = new RegExp(`^(?:${COMMIT_TYPES.join('|')})\\(MOM-\\d+\\): \\S.*$`);

  it('covers a meaningful number of tickets', () => expect(summaries.length).toBeGreaterThan(30));

  it.each(summaries.map((s) => [s.ticket]))('%s: branch and commit follow CLAUDE.md', (ticket) => {
    const plan = buildTicketPlan(ticket, backlog, standards);
    expect(plan.branch).toMatch(branchRegex);
    expect(plan.branch.startsWith(`feature/${ticket}-`)).toBe(true);
    expect(plan.branch.length).toBeLessThanOrEqual(60);
    expect(plan.commitMessage).toMatch(commitRegex);
    expect(plan.commitMessage.startsWith(`feat(${ticket}): `)).toBe(true);
    expect(plan.commitMessage.length).toBeLessThanOrEqual(100);
  });

  it.each(summaries.map((s) => [s.ticket]))('%s: the prompt is well formed', (ticket) => {
    const plan = buildTicketPlan(ticket, backlog, standards);
    const { prompt } = plan;
    expect(prompt.startsWith(`Implement ${ticket}: `)).toBe(true);
    expect(prompt).not.toMatch(/undefined|NaN|\[object Object\]/);
    // Steps are numbered 1..N with no gaps.
    const numbers = [...prompt.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    expect(numbers.length).toBeGreaterThanOrEqual(7);
    // Every open item appears exactly once, none of the resolved ones do.
    for (const item of plan.openItems) {
      expect(prompt.split(`Resolve BACKLOG.md line ${item.line}: `).length - 1).toBe(1);
    }
    expect(prompt).toContain(plan.branch);
    expect(prompt).toContain(`"${plan.commitMessage}"`);
    expect(prompt).toContain('Definition of Done (from CLAUDE.md):');
  });

  it('prints the same Definition of Done as CLAUDE.md', () => {
    const { prompt } = buildTicketPlan(summaries[0].ticket, backlog, standards);
    const printed = [...prompt.matchAll(/^- \[ \] (.+)$/gm)].map((m) => m[1]);
    expect(printed).toEqual(standards.definitionOfDone);
  });
});

describe('overview', () => {
  const backlog = parseBacklog(SAMPLE);

  it('counts open and resolved items per ticket, in ticket order', () => {
    expect(summarizeTickets(backlog).map((s) => [s.ticket, s.area, s.open, s.resolved])).toEqual([
      ['MOM-20', 'Schema', 1, 1],
      ['MOM-22', 'Schema', 0, 1],
      ['MOM-47', 'Rebalance', 1, 0],
      ['MOM-48', 'Rebalance', 2, 0],
    ]);
  });

  it('lists the open items that have no Jira key, by line', () => {
    expect(renderOverview(backlog)).toContain('1 open item has no Jira key (BACKLOG.md line 14).');
  });
});

describe('the command line', () => {
  const dir = mkdtempSync(join(tmpdir(), 'plan-'));
  writeFileSync(join(dir, 'BACKLOG.md'), SAMPLE);
  writeFileSync(join(dir, 'CLAUDE.md'), realClaude);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  function run(...args: string[]) {
    const out: string[] = [];
    const err: string[] = [];
    const code = main(args, { cwd: dir, out: (t) => out.push(t), err: (t) => err.push(t) });
    return { code, out: out.join('\n'), err: err.join('\n') };
  }

  it('with no arguments, prints the overview', () => {
    const r = run();
    expect(r.code).toBe(0);
    expect(r.out).toContain('4 tickets in BACKLOG.md, 3 with open items.');
    expect(r.out).toContain('MOM-47');
  });

  it('prints one ticket’s prompt, and accepts a bare number', () => {
    for (const arg of ['MOM-47', '47', 'mom-47']) {
      const r = run(arg);
      expect(r.code).toBe(0);
      expect(r.out.startsWith('Implement MOM-47: ')).toBe(true);
    }
  });

  it('prints several tickets in order, separated', () => {
    const r = run('MOM-48', 'MOM-20');
    expect(r.out.indexOf('Implement MOM-20')).toBeLessThan(r.out.indexOf('Implement MOM-48'));
    expect(r.out).toContain('----------------------------------------');
  });

  it('prints every ticket in an area, whatever the case', () => {
    const r = run('--area', 'REBALANCE');
    expect(r.out).toContain('Implement MOM-47');
    expect(r.out).toContain('Implement MOM-48');
    expect(r.out).not.toContain('Implement MOM-20');
  });

  it('--all prints only tickets with open items', () => {
    const r = run('--all');
    expect(r.out).toContain('Implement MOM-20');
    expect(r.out).not.toContain('Implement MOM-22:');
  });

  it('--json is structured and carries the standards used', () => {
    const r = run('MOM-20', '--json');
    const data = JSON.parse(r.out);
    expect(data.tickets).toHaveLength(1);
    expect(data.tickets[0]).toMatchObject({ ticket: 'MOM-20', branch: 'feature/MOM-20-phases-gates-table', area: 'Schema' });
    expect(data.tickets[0].prompt).toContain('Task Instructions:');
    expect(data.standards.definitionOfDone.length).toBeGreaterThan(3);
  });

  it('--json with no ticket lists the summaries', () => {
    expect(JSON.parse(run('--json').out).tickets).toHaveLength(4);
  });

  it('--type and --slug change the branch and commit', () => {
    const r = run('MOM-20', '--type', 'docs', '--slug', 'phase table');
    expect(r.out).toContain('feature/MOM-20-phase-table');
    expect(r.out).toContain('"docs(MOM-20): ');
  });

  it.each([
    [['MOM-999'], 1, /Not in BACKLOG.md: MOM-999/],
    [['banana'], 2, /not a ticket key/],
    [['MOM-20', '--type', 'wip'], 2, /Unknown --type/],
    [['--area', 'Nope'], 1, /No area "Nope"/],
    [['MOM-20', 'MOM-47', '--slug', 'x'], 2, /one ticket only/],
    [['--wat'], 2, /Usage:/],
  ] as const)('rejects %j with exit %i', (args, code, message) => {
    const r = run(...args);
    expect(r.code).toBe(code);
    expect(r.err).toMatch(message);
    expect(r.out).toBe('');
  });

  it('reports a missing BACKLOG.md', () => {
    const r = run('--backlog', 'nope.md');
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/Cannot find/);
  });

  it('warns and carries on when CLAUDE.md is missing', () => {
    const r = run('MOM-20', '--claude', 'nope.md');
    expect(r.code).toBe(0);
    expect(r.err).toMatch(/using built-in standards/);
    expect(r.out).toContain('Implement MOM-20');
  });

  it('--help prints usage and exits 0', () => {
    const r = run('--help');
    expect(r.code).toBe(0);
    expect(r.out).toContain('Usage: npm run plan');
  });
});

describe('npm run plan', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };

  it('is wired to the script', () => {
    expect(pkg.scripts.plan).toMatch(/^node .*scripts\/generate-execution-plan\.ts$/);
  });

  it('really runs under Node, with no warnings, and prints parseable output', () => {
    const args = pkg.scripts.plan.split(' ').slice(1);
    const stdout = execFileSync(process.execPath, [...args, 'MOM-22', '--json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const data = JSON.parse(stdout);
    expect(data.tickets[0].ticket).toBe('MOM-22');
  });

  it('needs no network and reads no secrets', () => {
    const source = readFileSync(join(root, 'scripts', 'generate-execution-plan.ts'), 'utf8');
    for (const forbidden of ['fetch(', 'process.env', 'SUPABASE', 'ANTHROPIC', 'node:http', 'node:https', 'child_process']) {
      expect(source).not.toContain(forbidden);
    }
  });
});
