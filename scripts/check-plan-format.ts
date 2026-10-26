// Checks docs/plans/NEXT_BUILD_PLAN.md against the plan format contract and finds one block by its ticket key
// (MOM-75; docs/mom-75-plan-execution-spec.md sections 3 and 4). The commands in .claude/commands/ rely on this contract
// and never name a ticket, so a plan that breaks it has to fail loudly, naming the block, before a command trips on it.
//
//   npm run plan:check                          check docs/plans/NEXT_BUILD_PLAN.md
//   npm run plan:check -- path/to/plan.md       check another file
//   npm run plan:check -- --strict              warnings fail too (day-end step E runs this on tomorrow's plan)
//   npm run plan:check -- --block MOM-61        print one block: where it is, its CLI Session Config, its session's
//                                               prerequisites, its prompt lines and gate, and the next command in the
//                                               runbook (for /run-block's close-out); exit 1 on zero or several matches
//   options: --plan <file>
//
// What the contract is (errors fail the check; warnings are printed but pass unless --strict):
// - a metadata header: `> **Date:** YYYY-MM-DD | **Active Epic:** MOM-n | **Base Commit:** <hash>`;
// - a "Today's runbook" section before the first block, with exactly one row per block, in the plan's order, each
//   with the `/run-block MOM-n` command and a plain-language "what to check at the gate";
// - every block: a heading `## Block <n>.<m>: <title> (MOM-<n>)` with exactly one ticket key, unique in the plan; a
//   `CLI Session Config` line naming model and effort; exactly one fenced `text` prompt, which names the same ticket and
//   a commit message carrying its key; and a `User Verification Gate` with at least one checklist item;
// - every session that has blocks: a clearly labelled prerequisites note before its first block;
// - warning: a prompt that still tells the CLI to merge into main locally (`--no-ff`). Since main is protected, work
//   reaches it only through a pull request (CLAUDE.md), and /run-block overrides that wording.
// - warning (MOM-104): a runbook whose first row is not `/day-start` or whose last row is not `/day-end`. No command trips
//   on a missing row, but step E runs --strict, so tomorrow's plan cannot be committed without them.
// It reads one file and nothing else: it does not look at today's date, at git, or at Jira, so a plan does not fail
// just because a session is not today's.
//
// Runs on Node 22.18 or newer, which executes .ts files directly. The file is self-contained (node: imports only)
// so that works, and every function the tests need is exported.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const DEFAULT_PLAN = 'docs/plans/NEXT_BUILD_PLAN.md';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Fence {
  // The text after the opening backticks: `text`, `bash`, ''.
  info: string;
  // 1-based lines of the opening and closing fence; `end` is null when the fence is never closed.
  start: number;
  end: number | null;
  content: string;
}

export interface Block {
  // How messages name it: `Block 1.2 (MOM-19)`, or `Block 1.2 "<title>"` when the heading has no usable key.
  label: string;
  heading: string;
  // 1-based line of the heading, and of the last line of the block's section.
  line: number;
  endLine: number;
  number: string;
  title: string;
  // The one ticket key in the heading, or null when there is none or more than one.
  key: string | null;
  keysInHeading: string[];
  // The session heading it sits under, e.g. `SESSION 3: E2E, HYDRATION & COMPONENT TESTS`, or null.
  session: string | null;
  // As written in the `CLI Session Config` line, e.g. model `Sonnet`, effort `Medium`; null when the line is missing.
  model: string | null;
  effort: string | null;
  configLine: number | null;
  fences: Fence[];
  prompt: Fence | null;
  gateLine: number | null;
  gateItems: string[];
}

export interface Session {
  // `SESSION 3: E2E, HYDRATION & COMPONENT TESTS`
  heading: string;
  line: number;
  blockCount: number;
  prerequisites: { line: number; text: string } | null;
}

export interface RunbookEntry {
  key: string;
  line: number;
  // What follows the command (or, in a table row, its last cell): the "what to check at the gate" text.
  gateText: string;
}

// A row of the runbook that is a day command rather than a block: `/day-start` or `/day-end`.
export interface RunbookDayRow {
  command: '/day-start' | '/day-end';
  line: number;
  // The "Session setting" cell of a table row, e.g. `Opus / High`; null for a list-style row.
  setting: string | null;
}

export interface ParsedPlan {
  headerLine: number | null;
  header: { date: string; epic: string; baseCommit: string } | null;
  // A line that starts like the header but does not match, for a precise message.
  malformedHeader: string | null;
  runbook: { line: number; endLine: number; entries: RunbookEntry[]; dayRows: RunbookDayRow[] } | null;
  blocks: Block[];
  sessions: Session[];
}

export type Severity = 'error' | 'warning';

export interface Violation {
  rule: string;
  severity: Severity;
  // The block the message is about (its label), or null for the plan as a whole.
  block: string | null;
  line: number | null;
  message: string;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const KEY = /MOM-\d+/g;
const BLOCK_HEADING = /^## Block (\d+\.\d+):\s*(.*?)\s*$/;
const SESSION_HEADING = /^# (SESSION \d+\b.*?)\s*$/i;
const CONFIG_LINE = /\*\*CLI Session Config:?\*\*:?\s*Model:\s*([A-Za-z0-9. -]+?)\s*\|\s*Effort:\s*([A-Za-z]+)/i;
const GATE_MARKER = /\*\*User Verification Gate:?\*\*/i;
const CHECKLIST_ITEM = /^\s*[-*]\s+\[[ xX]\]\s+\S/;
const PREREQUISITES = /\*\*(?:Your )?prerequisites before this session:?\*\*/i;
const RUNBOOK_HEADING = /^## Today['’]s runbook\s*$/i;
const RUN_BLOCK_COMMAND = /\/run-block\s+(MOM-\d+)/;
// The day commands in a runbook row: a table cell holding only the command, or a list item that starts with it. The prose
// around the table, and a gate text that mentions them, are not rows.
const DAY_COMMAND_CELL = /^`?\/(day-start|day-end)`?$/;
const DAY_COMMAND_LEAD = /^\s*(?:[-*]|\d+[.)])\s+`?\/(day-start|day-end)\b/;
const ROW_START = /^\s*(?:[-*]\s|\d+[.)]\s)/;
const HEADER = /^> \*\*Date:\*\* (\d{4}-\d{2}-\d{2}) \| \*\*Active Epic:\*\* (MOM-\d+) \| \*\*Base Commit:\*\* ([0-9a-f]{7,40})\s*$/;
const COMMIT_WITH_KEY = /\b(feat|fix|test|docs|chore|refactor|perf)\((MOM-\d+)\):/g;
// The pre-PR wording: "... merge into main with --no-ff". A prompt that says "never merge into main" does not match.
const LEGACY_MERGE = /\bmerge[^.\n]*--no-ff/i;

// Splits text into lines, whatever the line endings.
const toLines = (text: string): string[] => text.replace(/^﻿/, '').split(/\r\n|\r|\n/);

interface Scanned {
  lines: string[];
  // true for every line that is inside a fenced code block or is a fence line itself.
  inFence: boolean[];
  fences: Fence[];
}

// Finds the fenced code blocks, so that nothing inside a prompt is mistaken for a heading or a gate.
function scanFences(lines: string[]): Scanned {
  const inFence: boolean[] = new Array(lines.length).fill(false);
  const fences: Fence[] = [];
  let open: { ticks: number; info: string; start: number; body: string[] } | null = null;
  lines.forEach((line, i) => {
    if (open) {
      inFence[i] = true;
      const close = /^\s{0,3}(`{3,})\s*$/.exec(line);
      if (close && close[1].length >= open.ticks) {
        fences.push({ info: open.info, start: open.start, end: i + 1, content: open.body.join('\n') });
        open = null;
      } else {
        open.body.push(line);
      }
      return;
    }
    const start = /^\s{0,3}(`{3,})\s*([^`]*?)\s*$/.exec(line);
    if (start) {
      inFence[i] = true;
      open = { ticks: start[1].length, info: start[2], start: i + 1, body: [] };
    }
  });
  if (open) {
    const unclosed: { info: string; start: number; body: string[] } = open;
    fences.push({ info: unclosed.info, start: unclosed.start, end: null, content: unclosed.body.join('\n') });
  }
  return { lines, inFence, fences };
}

const keysIn = (text: string): string[] => text.match(KEY) ?? [];

export function parsePlan(text: string): ParsedPlan {
  const scanned = scanFences(toLines(text));
  const { lines, inFence, fences } = scanned;

  // Headings outside fences: level 1 and 2 only, as the plan uses them.
  interface Heading {
    index: number;
    level: 1 | 2;
    text: string;
  }
  const headings: Heading[] = [];
  lines.forEach((line, index) => {
    if (inFence[index]) return;
    if (line.startsWith('## ')) headings.push({ index, level: 2, text: line });
    else if (line.startsWith('# ')) headings.push({ index, level: 1, text: line });
  });
  const sectionEnd = (h: number): number => (h + 1 < headings.length ? headings[h + 1].index : lines.length);

  // The metadata header: the first `> **Date:**` line near the top.
  let headerLine: number | null = null;
  let header: ParsedPlan['header'] = null;
  let malformedHeader: string | null = null;
  for (let i = 0; i < Math.min(lines.length, 25); i += 1) {
    if (!lines[i].startsWith('> **Date:**')) continue;
    headerLine = i + 1;
    const m = HEADER.exec(lines[i]);
    if (m) header = { date: m[1], epic: m[2], baseCommit: m[3] };
    else malformedHeader = lines[i];
    break;
  }

  // The runbook.
  let runbook: ParsedPlan['runbook'] = null;
  const runbookAt = headings.findIndex((h) => RUNBOOK_HEADING.test(h.text));
  if (runbookAt >= 0) {
    const first = headings[runbookAt].index;
    const last = sectionEnd(runbookAt);
    const entries: RunbookEntry[] = [];
    const dayRows: RunbookDayRow[] = [];
    for (let i = first + 1; i < last; i += 1) {
      if (inFence[i]) continue;
      const m = RUN_BLOCK_COMMAND.exec(lines[i]);
      if (!m) {
        // A day row has the command as a cell of its own (or leads its list item): a gate text that merely mentions
        // "/day-start" does not make its row one.
        const isTable = lines[i].trimStart().startsWith('|');
        const cells = isTable ? lines[i].split('|').slice(1, -1).map((c) => c.trim()) : [];
        const at = cells.findIndex((c) => DAY_COMMAND_CELL.test(c));
        const lead = !isTable && ROW_START.test(lines[i]) ? DAY_COMMAND_LEAD.exec(lines[i]) : null;
        const name = at >= 0 ? DAY_COMMAND_CELL.exec(cells[at])![1] : lead ? lead[1] : null;
        if (name) dayRows.push({ command: `/${name}` as RunbookDayRow['command'], line: i + 1, setting: at >= 0 && cells[at + 1] ? cells[at + 1].replace(/`/g, '') : null });
        continue;
      }
      let gateText: string;
      if (lines[i].trimStart().startsWith('|')) {
        const cells = lines[i].split('|').slice(1, -1).map((c) => c.trim());
        gateText = (cells[cells.length - 1] ?? '').replace(/`/g, '');
      } else {
        gateText = lines[i].slice((m.index ?? 0) + m[0].length).replace(/[`|]/g, '').replace(/^[\s\-–—:)*]+/, '').trim();
      }
      entries.push({ key: m[1], line: i + 1, gateText });
    }
    runbook = { line: first + 1, endLine: last, entries, dayRows };
  }

  // Sessions and blocks, in file order.
  const blocks: Block[] = [];
  const sessions: Session[] = [];
  let currentSession: Session | null = null;
  let currentSessionText: string | null = null;
  let currentSessionBodyStart = 0;
  headings.forEach((h, hi) => {
    if (h.level === 1) {
      const s = SESSION_HEADING.exec(h.text);
      if (s) {
        currentSessionText = s[1];
        currentSessionBodyStart = h.index + 1;
        currentSession = { heading: s[1], line: h.index + 1, blockCount: 0, prerequisites: null };
        sessions.push(currentSession);
      } else {
        currentSession = null;
        currentSessionText = null;
      }
      return;
    }
    const b = BLOCK_HEADING.exec(h.text);
    if (!b) return;

    const end = sectionEnd(hi);
    const number = b[1];
    const title = b[2];
    const keysInHeading = keysIn(title);
    const key = keysInHeading.length === 1 && /\(MOM-\d+\)\s*$/.test(title) ? keysInHeading[0] : null;
    const label = key ? `Block ${number} (${key})` : `Block ${number} "${title}"`;

    // The session's prerequisites note sits between the session heading and its first block.
    if (currentSession) {
      const session: Session = currentSession;
      if (session.blockCount === 0) {
        for (let i = currentSessionBodyStart; i < h.index; i += 1) {
          if (!inFence[i] && PREREQUISITES.test(lines[i])) {
            session.prerequisites = { line: i + 1, text: lines[i].replace(/\*\*/g, '').trim() };
            break;
          }
        }
      }
      session.blockCount += 1;
    }

    const block: Block = {
      label,
      heading: h.text,
      line: h.index + 1,
      endLine: end,
      number,
      title,
      key,
      keysInHeading,
      session: currentSessionText,
      model: null,
      effort: null,
      configLine: null,
      fences: fences.filter((f) => f.start > h.index + 1 && f.start <= end),
      prompt: null,
      gateLine: null,
      gateItems: [],
    };
    for (let i = h.index + 1; i < end; i += 1) {
      if (inFence[i]) continue;
      if (block.configLine === null) {
        const c = CONFIG_LINE.exec(lines[i]);
        if (c) {
          block.configLine = i + 1;
          block.model = c[1].trim();
          block.effort = c[2].trim();
        }
      }
      if (block.gateLine === null && GATE_MARKER.test(lines[i])) {
        block.gateLine = i + 1;
        for (let j = i + 1; j < end; j += 1) {
          if (inFence[j]) break;
          if (CHECKLIST_ITEM.test(lines[j])) block.gateItems.push(lines[j].trim());
        }
      }
    }
    const prompts = block.fences.filter((f) => f.info.toLowerCase() === 'text');
    block.prompt = prompts.length === 1 ? prompts[0] : null;
    blocks.push(block);
  });

  return { headerLine, header, malformedHeader, runbook, blocks, sessions };
}

// ---------------------------------------------------------------------------
// The contract
// ---------------------------------------------------------------------------

export function checkPlanFormat(text: string): Violation[] {
  const plan = parsePlan(text);
  const out: Violation[] = [];
  const add = (rule: string, block: string | null, line: number | null, message: string, severity: Severity = 'error') =>
    out.push({ rule, severity, block, line, message });

  // The plan as a whole.
  if (plan.header === null) {
    if (plan.malformedHeader !== null) {
      add(
        'bad-header',
        null,
        plan.headerLine,
        'The metadata header does not match "> **Date:** YYYY-MM-DD | **Active Epic:** MOM-n | **Base Commit:** <short hash>" (a real commit hash, not a placeholder).',
      );
    } else {
      add('missing-header', null, null, 'The plan has no metadata header: "> **Date:** YYYY-MM-DD | **Active Epic:** MOM-n | **Base Commit:** <short hash>" near the top.');
    }
  }
  if (plan.blocks.length === 0) add('no-blocks', null, null, 'The plan has no "## Block <n>.<m>: <title> (MOM-<n>)" headings.');

  // Each block.
  const seenKeys = new Map<string, Block>();
  for (const block of plan.blocks) {
    const where = block.label;

    if (block.keysInHeading.length === 0) {
      add('heading-no-key', where, block.line, 'The heading has no ticket key. It must end with exactly one key in parentheses, e.g. "(MOM-18)".');
    } else if (block.keysInHeading.length > 1) {
      add('heading-several-keys', where, block.line, `The heading names ${block.keysInHeading.length} ticket keys (${block.keysInHeading.join(', ')}). A block has exactly one.`);
    } else if (block.key === null) {
      add('heading-key-position', where, block.line, `The ticket key ${block.keysInHeading[0]} must be the last thing in the heading, in parentheses.`);
    }
    if (block.key !== null) {
      const first = seenKeys.get(block.key);
      if (first) add('duplicate-key', where, block.line, `${block.key} already heads ${first.label} (line ${first.line}). /run-block stops on several matches, so a key may head one block only.`);
      else seenKeys.set(block.key, block);
    }

    if (block.configLine === null) {
      add('missing-config', where, block.line, 'No "CLI Session Config" line. Expected "* **CLI Session Config:** Model: <model> | Effort: <effort>".');
    }

    const unclosed = block.fences.filter((f) => f.end === null);
    for (const f of unclosed) add('unclosed-fence', where, f.start, `The code fence opened on line ${f.start} is never closed.`);
    const prompts = block.fences.filter((f) => f.info.toLowerCase() === 'text');
    if (prompts.length === 0) {
      const others = block.fences.map((f) => (f.info === '' ? 'untagged' : f.info));
      add(
        'missing-prompt',
        where,
        block.line,
        others.length > 0
          ? `No fenced "text" prompt. Found fences tagged: ${others.join(', ')}. The prompt must be exactly one \`\`\`text fence.`
          : 'No fenced "text" prompt. The prompt must be exactly one ```text fence.',
      );
    } else if (prompts.length > 1) {
      add('several-prompts', where, prompts[1].start, `${prompts.length} fenced "text" prompts (lines ${prompts.map((p) => p.start).join(', ')}). A block has exactly one.`);
    } else if (block.key !== null) {
      const prompt = prompts[0];
      const named = keysIn(prompt.content);
      if (!named.includes(block.key)) {
        add('prompt-wrong-key', where, prompt.start, `The prompt never mentions ${block.key}${named.length ? ` (it names ${[...new Set(named)].join(', ')})` : ''}. A copy-paste mix-up is likely.`);
      } else {
        // The key is in the prompt, so check the commit message carries it (CLAUDE.md: every commit names its Jira key).
        const commits = [...prompt.content.matchAll(COMMIT_WITH_KEY)];
        if (commits.length === 0) {
          add('prompt-no-commit-key', where, prompt.start, `The prompt has no commit message carrying the Jira key, e.g. "feat(${block.key}): ...", which CLAUDE.md requires.`);
        } else if (!commits.some((c) => c[2] === block.key)) {
          add('prompt-commit-wrong-key', where, prompt.start, `The prompt's commit message names ${[...new Set(commits.map((c) => c[2]))].join(', ')}, not ${block.key}.`);
        }
      }
      if (LEGACY_MERGE.test(prompt.content)) {
        add(
          'legacy-merge',
          where,
          prompt.start,
          'The prompt tells the CLI to merge into main locally (--no-ff). main is protected: work reaches it through a pull request (CLAUDE.md). /run-block overrides this step; new plans should not carry it.',
          'warning',
        );
      }
    }

    if (block.gateLine === null) {
      add('missing-gate', where, block.line, 'No "User Verification Gate". Expected "* **User Verification Gate:**" followed by a checklist.');
    } else if (block.gateItems.length === 0) {
      add('empty-gate', where, block.gateLine, 'The User Verification Gate has no checklist items ("- [ ] ...").');
    }
  }

  // Each session with blocks needs its prerequisites note (it can say "none").
  for (const session of plan.sessions) {
    if (session.blockCount > 0 && session.prerequisites === null) {
      add('session-missing-prerequisites', null, session.line, `${session.heading}: no "**Your prerequisites before this session:**" note before its first block (it may say "none").`);
    }
  }

  // The runbook.
  const firstBlockLine = plan.blocks.length > 0 ? plan.blocks[0].line : Infinity;
  if (plan.runbook === null) {
    add('missing-runbook', null, null, 'The plan has no "## Today\'s runbook" section: the block order, the one command per block, and what to check at each gate.');
  } else {
    const { entries } = plan.runbook;
    if (plan.runbook.line > firstBlockLine) {
      add('runbook-not-near-top', null, plan.runbook.line, "\"Today's runbook\" must come before the first block, not after it.");
    }
    const byKey = new Map<string, RunbookEntry[]>();
    for (const e of entries) byKey.set(e.key, [...(byKey.get(e.key) ?? []), e]);
    const blockKeys = plan.blocks.map((b) => b.key).filter((k): k is string => k !== null);

    for (const block of plan.blocks) {
      if (block.key === null) continue;
      const rows = byKey.get(block.key) ?? [];
      if (rows.length === 0) add('runbook-missing-block', block.label, block.line, `The runbook has no "/run-block ${block.key}" row for this block.`);
      else if (rows.length > 1) add('runbook-duplicate-entry', block.label, rows[1].line, `The runbook lists "/run-block ${block.key}" ${rows.length} times (lines ${rows.map((r) => r.line).join(', ')}).`);
    }
    for (const e of entries) {
      if (!blockKeys.includes(e.key)) add('runbook-unknown-key', null, e.line, `The runbook lists "/run-block ${e.key}" but the plan has no block for ${e.key}.`);
      if (e.gateText.length < 10) {
        const owner = plan.blocks.find((b) => b.key === e.key);
        add('runbook-no-gate-text', owner ? owner.label : null, e.line, `The runbook row for ${e.key} says nothing about what to check at the gate (plain words, at least a short sentence).`);
      }
    }
    // Order: the runbook's first row for each key must follow the plan's block order.
    const runbookOrder = [...new Set(entries.map((e) => e.key))].filter((k) => blockKeys.includes(k));
    const planOrder = [...new Set(blockKeys)].filter((k) => runbookOrder.includes(k));
    if (runbookOrder.join(',') !== planOrder.join(',')) {
      add('runbook-order', null, plan.runbook.line, `The runbook order (${runbookOrder.join(', ')}) differs from the order of the blocks in the plan (${planOrder.join(', ')}).`);
    }
    // A day starts with /day-start and ends with /day-end (MOM-104). No command trips on a missing row, so these are
    // warnings; day-end step E runs --strict, so tomorrow's plan cannot be committed without them.
    const firstEntry = entries.length > 0 ? entries[0].line : Infinity;
    const lastEntry = entries.length > 0 ? entries[entries.length - 1].line : -Infinity;
    const dayStart = plan.runbook.dayRows.find((r) => r.command === '/day-start');
    const dayEnd = [...plan.runbook.dayRows].reverse().find((r) => r.command === '/day-end');
    if (!dayStart || dayStart.line > firstEntry) {
      add('runbook-missing-day-start', null, dayStart?.line ?? plan.runbook.line, 'The runbook\'s first row must be "/day-start" (Sonnet / Low), before every "/run-block" row.', 'warning');
    }
    if (!dayEnd || dayEnd.line < lastEntry) {
      add('runbook-missing-day-end', null, dayEnd?.line ?? plan.runbook.line, 'The runbook\'s last row must be "/day-end" (Opus / High), after every "/run-block" row.', 'warning');
    }
  }

  return out;
}

// Finds the block(s) headed by a ticket key, for /run-block.
export function findBlocks(plan: ParsedPlan, key: string): Block[] {
  return plan.blocks.filter((b) => b.key === key || b.keysInHeading.includes(key));
}

// ---------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------

export interface Io {
  cwd: string;
  out: (text: string) => void;
  err: (text: string) => void;
}

const HELP = `Usage: npm run plan:check -- [plan.md] [options]

  (no arguments)        check ${DEFAULT_PLAN} against the plan format contract
  --strict              warnings fail the check too
  --block <MOM-n>       print that block (its config, prerequisites, prompt lines, gate, next runbook command); exit 1 on zero or several matches
  --plan <file>         the plan to read (default ${DEFAULT_PLAN})
  -h, --help            this text`;

export function renderViolation(v: Violation): string {
  const where = [v.block, v.line !== null ? `line ${v.line}` : null].filter(Boolean).join(', ');
  return `${v.severity === 'error' ? 'ERROR  ' : 'warning'} [${v.rule}] ${where ? `${where}: ` : ''}${v.message}`;
}

export function describeBlock(block: Block, plan: ParsedPlan): string {
  const session = plan.sessions.find((s) => s.heading === block.session);
  const branch = block.prompt ? /feature branch `(feature\/MOM-[^`]+)`/.exec(block.prompt.content)?.[1] : undefined;
  const lines = [
    `${block.heading.replace(/^## /, '')}`,
    `  heading on line ${block.line}; section ends line ${block.endLine}`,
    `  session: ${block.session ?? '(none)'}`,
    `  CLI Session Config (line ${block.configLine ?? '-'}): ${block.model && block.effort ? `Model: ${block.model} | Effort: ${block.effort}` : '(missing)'}`,
    `  session prerequisites: ${session?.prerequisites ? `line ${session.prerequisites.line}: ${session.prerequisites.text}` : '(none found)'}`,
    `  prompt: ${block.prompt ? `lines ${block.prompt.start + 1} to ${(block.prompt.end ?? block.prompt.start) - 1} (the fenced text block starts on line ${block.prompt.start})` : '(missing)'}`,
    `  feature branch named in the prompt: ${branch ?? '(none found)'}`,
    `  User Verification Gate (line ${block.gateLine ?? '-'}), ${block.gateItems.length} item${block.gateItems.length === 1 ? '' : 's'}:`,
    ...block.gateItems.map((item) => `    ${item}`),
    `  next in the runbook: ${describeNext(block, plan)}`,
  ];
  return lines.join('\n');
}

// What /run-block's close-out names after this block (MOM-104): the next block's command with its model and effort from
// its own CLI Session Config, or /day-end with the setting on the runbook's /day-end row (Opus / High when it has none).
export function describeNext(block: Block, plan: ParsedPlan): string {
  const entries = plan.runbook?.entries ?? [];
  const at = entries.findIndex((e) => e.key === block.key);
  if (at < 0) return '(this block is not in the runbook)';
  const next = entries.slice(at + 1).map((e) => plan.blocks.find((b) => b.key === e.key)).find((b) => b !== undefined);
  if (next) return `/run-block ${next.key} (${next.model ?? '?'} / ${next.effort ?? '?'})`;
  const dayEnd = plan.runbook?.dayRows.find((r) => r.command === '/day-end');
  return `/day-end (${dayEnd?.setting ?? 'Opus / High'})`;
}

export function main(argv: string[], io: Io): number {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        strict: { type: 'boolean' },
        block: { type: 'string' },
        plan: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (error) {
    io.err(`${error instanceof Error ? error.message : 'Invalid arguments.'}\n\n${HELP}`);
    return 2;
  }
  const values = parsed.values as Record<string, string | boolean | undefined>;
  if (values.help) {
    io.out(HELP);
    return 0;
  }

  const file = resolve(io.cwd, parsed.positionals[0] ?? (typeof values.plan === 'string' ? values.plan : DEFAULT_PLAN));
  if (!existsSync(file)) {
    io.err(`Cannot find ${file}.`);
    return 1;
  }
  const text = readFileSync(file, 'utf8');

  if (typeof values.block === 'string') {
    const key = /^(?:MOM-)?(\d+)$/i.exec(values.block.trim());
    if (!key) {
      io.err(`"${values.block}" is not a ticket key. Use MOM-<number>.`);
      return 2;
    }
    const wanted = `MOM-${Number(key[1])}`;
    const plan = parsePlan(text);
    const found = findBlocks(plan, wanted);
    if (found.length === 0) {
      io.err(`No block for ${wanted} in ${file}. Blocks in this plan: ${plan.blocks.map((b) => b.key ?? b.label).join(', ') || '(none)'}.`);
      return 1;
    }
    if (found.length > 1) {
      io.err(`${found.length} blocks match ${wanted} (${found.map((b) => `${b.label} on line ${b.line}`).join('; ')}). A key must head exactly one block.`);
      return 1;
    }
    io.out(describeBlock(found[0], plan));
    return 0;
  }

  const violations = checkPlanFormat(text);
  const errors = violations.filter((v) => v.severity === 'error');
  const warnings = violations.filter((v) => v.severity === 'warning');
  for (const v of violations) io.out(renderViolation(v));
  const plan = parsePlan(text);
  const failed = errors.length > 0 || (values.strict === true && warnings.length > 0);
  io.out(
    `${failed ? 'FAILED' : 'OK'}: ${plan.blocks.length} blocks in ${file}; ${errors.length} error${errors.length === 1 ? '' : 's'}, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}${values.strict ? ' (strict: warnings fail)' : ''}.`,
  );
  return failed ? 1 : 0;
}

// Runs only when started from the command line, not when a test imports the functions above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2), {
    cwd: process.cwd(),
    out: (text) => process.stdout.write(`${text}\n`),
    err: (text) => process.stderr.write(`${text}\n`),
  });
}
