// The PM docs source check (MOM-164, finishes MOM-144).
//
// docs/product/USER_JOURNEYS.md, PRD.md and EVALS.md are non-binding and drift as the app changes. So each section
// names its sources on a `Sources:` line, and this test fails when:
// - a section (a `##` or `###` heading) has no `Sources:` line before the next heading; or
// - a repo file, directory or glob that a Sources line lists in backticks no longer exists.
//
// What counts as a listed repo file: a backticked token that is path-shaped (it holds a `/`, or it is a bare name
// ending in .md, .ts, .tsx or .json), has no space, `<`, `=` or `§`, and does not start with `/` (a route such as
// `/log` is not a file). A bare name beside listed paths (`QuestionCard.tsx` after `components/setup/...`) must
// exist in one of those paths' directories; with no such directory it is looked up at the repo root. A trailing
// `/` means a directory; a `*` in the last part is a glob that must match at least one file. Jira keys, pull
// request numbers, URLs, comment dates and phrases such as "design record §5" are not backticked paths, so they are
// not checked. A leftover `Stale:` line is reported as a warning and never fails the test.
//
// The check reads files only. It makes no network call and does not look at git or Jira.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const fixtureDir = join(root, 'tests', 'fixtures', 'pm-docs');

export const PM_DOCS = [
  'docs/product/USER_JOURNEYS.md',
  'docs/product/PRD.md',
  'docs/product/EVALS.md',
] as const;

export interface SourceViolation {
  kind: 'no_sources' | 'missing_path';
  section: string;
  path?: string;
}

export interface SourceReport {
  violations: SourceViolation[];
  stale: { section: string; line: string }[];
  sections: number;
}

interface Section {
  title: string;
  lines: string[];
}

function sectionsOf(markdown: string): Section[] {
  const sections: Section[] = [];
  let inFence = false;
  let current: Section | null = null;
  let parent = '';
  for (const raw of markdown.split(/\r?\n/)) {
    if (/^\s*```/.test(raw)) {
      inFence = !inFence;
      if (current) current.lines.push(raw);
      continue;
    }
    const heading = !inFence ? /^(#{1,6})\s+(.*)$/.exec(raw) : null;
    if (heading) {
      const level = heading[1].length;
      const title = heading[2].trim();
      if (level === 2) parent = title;
      // A "### 2. Tasks" repeats under every journey, so its name carries the "##" heading it sits under.
      current = level === 2 ? { title, lines: [] } : level === 3 ? { title: parent ? `${parent} > ${title}` : title, lines: [] } : null;
      if (current) sections.push(current);
      continue;
    }
    if (current) current.lines.push(raw);
  }
  return sections;
}

const SOURCES_LINE = /^\s*\*?Sources:/;

function backticked(line: string): string[] {
  return [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
}

function isPathShaped(token: string): boolean {
  if (/[\s<=§]/.test(token) || token.startsWith('/') || /^https?:/.test(token)) return false;
  return token.includes('/') || /\.(md|ts|tsx|json)$/.test(token);
}

function globMatches(dir: string, pattern: string): boolean {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return false;
  const re = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`);
  return readdirSync(dir).some((name) => re.test(name));
}

function pathExists(repoRoot: string, token: string): boolean {
  const clean = token.replace(/:\d+$/, '');
  const full = join(repoRoot, clean);
  const last = clean.split('/').pop() ?? '';
  if (last.includes('*')) return globMatches(dirname(full), last);
  return existsSync(full);
}

/** Checks one doc's text. `repoRoot` is where listed paths are resolved. */
export function checkSources(markdown: string, repoRoot: string = root): SourceReport {
  const violations: SourceViolation[] = [];
  const stale: { section: string; line: string }[] = [];
  const sections = sectionsOf(markdown);
  for (const section of sections) {
    for (const line of section.lines) if (/^\s*Stale:/.test(line)) stale.push({ section: section.title, line: line.trim() });
    const sourcesLines = section.lines.filter((l) => SOURCES_LINE.test(l));
    if (sourcesLines.length === 0) {
      violations.push({ kind: 'no_sources', section: section.title });
      continue;
    }
    for (const line of sourcesLines) {
      const tokens = backticked(line).filter(isPathShaped);
      const dirs = tokens
        .filter((t) => t.includes('/'))
        .map((t) => (t.endsWith('/') ? t : dirname(t)).replace(/:\d+$/, ''));
      for (const token of tokens) {
        if (token.includes('/')) {
          if (!pathExists(repoRoot, token)) violations.push({ kind: 'missing_path', section: section.title, path: token });
        } else {
          const found = dirs.length === 0 ? pathExists(repoRoot, token) : [...dirs, '.'].some((d) => pathExists(repoRoot, `${d}/${token}`));
          if (!found) violations.push({ kind: 'missing_path', section: section.title, path: token });
        }
      }
    }
  }
  return { violations, stale, sections: sections.length };
}

export function renderSourceViolation(doc: string, v: SourceViolation): string {
  return v.kind === 'no_sources'
    ? `${doc}: section "${v.section}" has no Sources: line`
    : `${doc}: section "${v.section}" lists ${v.path}, which does not exist`;
}

const fixture = (name: string) => readFileSync(join(fixtureDir, name), 'utf8');

// ---------------------------------------------------------------------------
// The fixtures prove the check can fail
// ---------------------------------------------------------------------------

describe('the source check on fixtures', () => {
  it('passes a doc whose sections all name real sources, and ignores headings inside a fence', () => {
    const report = checkSources(fixture('good.md'));
    expect(report.violations).toEqual([]);
    expect(report.sections).toBe(3);
  });

  it('fails a section with no Sources: line, naming the section', () => {
    const report = checkSources(fixture('no-sources.md'));
    expect(report.violations).toEqual([{ kind: 'no_sources', section: 'Has none' }]);
    expect(renderSourceViolation('fixture.md', report.violations[0])).toBe(
      'fixture.md: section "Has none" has no Sources: line',
    );
  });

  it('fails a listed file that does not exist, naming the section and the path', () => {
    const report = checkSources(fixture('missing-file.md'));
    expect(report.violations).toEqual([
      { kind: 'missing_path', section: 'Lists a missing file', path: 'docs/NO_SUCH_FILE.md' },
      { kind: 'missing_path', section: 'Lists a missing bare name', path: 'components/home/NoSuchCard.tsx' },
      { kind: 'missing_path', section: 'Lists a missing bare name', path: 'components/setup/NoSuchCard.tsx' },
    ]);
  });

  it('fails a glob that matches nothing and a directory that does not exist', () => {
    const report = checkSources(fixture('empty-glob.md'));
    expect(report.violations.map((v) => v.path)).toEqual(['tests/e2e/*.no-such-suffix.ts', 'docs/no-such-dir/']);
  });

  it('resolves paths from the root it is given', () => {
    const report = checkSources('## S\n\n*Sources: `a/b.md`.*\n', fixtureDir);
    expect(report.violations).toEqual([{ kind: 'missing_path', section: 'S', path: 'a/b.md' }]);
  });

  it('reports a leftover Stale: line as a warning and does not fail', () => {
    const report = checkSources(fixture('good.md'));
    expect(report.stale).toEqual([{ section: 'Three', line: 'Stale: a source changed and no auto-fill covered it.' }]);
    expect(report.violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The real docs
// ---------------------------------------------------------------------------

describe('the PM docs (docs/product/)', () => {
  for (const doc of PM_DOCS) {
    it(`${doc}: every section has a Sources: line and every listed repo file exists`, () => {
      const report = checkSources(readFileSync(join(root, doc), 'utf8'));
      if (report.stale.length > 0) {
        process.stderr.write(report.stale.map((s) => `PM docs warning: ${doc}: section "${s.section}": ${s.line}\n`).join(''));
      }
      expect(report.sections, `${doc} should have sections`).toBeGreaterThan(0);
      expect(report.violations.map((v) => renderSourceViolation(doc, v))).toEqual([]);
    });
  }
});
