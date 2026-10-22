// Generates ready-to-paste build prompts for a coding CLI from BACKLOG.md (MOM-63).
//
//   npm run plan                       list every ticket with its open and resolved BACKLOG items
//   npm run plan -- MOM-22             print the build prompt for one ticket
//   npm run plan -- MOM-22 MOM-29      several tickets, one after another
//   npm run plan -- --area Rebalance   every ticket in an area of the BACKLOG table
//   npm run plan -- --all              every ticket that still has an open item
//   npm run plan -- MOM-22 --json      the same thing as structured JSON
//   options: --type feat|fix|test|docs|chore   --slug <words> (one ticket)   --backlog <file>   --claude <file>
//
// What it reads: BACKLOG.md for the tickets and their items, and CLAUDE.md for the repository standards
// (the Definition of Done, the domain docs to read first, the branch and commit patterns), so a prompt
// follows whatever those files say today. It never calls Jira and needs no network or secrets: a title
// comes from the ticket's first open BACKLOG item, because BACKLOG.md holds keys, not titles. Each prompt
// therefore tells the reader to check the ticket in Jira first and stop if the two disagree.
//
// Runs on Node 22.18 or newer, which executes .ts files directly. The file is self-contained (node:
// imports only) so that works, and every function the tests need is exported.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

// ---------------------------------------------------------------------------
// BACKLOG.md
// ---------------------------------------------------------------------------

export interface BacklogItem {
  // 1-based line in BACKLOG.md.
  line: number;
  done: boolean;
  text: string;
  source: string | null;
  // Ticket keys from the item's *Jira: ...* field. Empty when it has none.
  tickets: string[];
}

export interface Backlog {
  // The "Phase 2 Tickets" table: an area and the tickets filed under it.
  areas: Array<{ area: string; tickets: string[] }>;
  items: BacklogItem[];
}

const TICKET_KEY = /MOM-\d+/g;

export function parseBacklog(markdown: string): Backlog {
  const lines = markdown.split(/\r?\n/);
  const areas: Backlog['areas'] = [];
  const items: BacklogItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const row = /^\|\s*([^|]+?)\s*\|\s*(MOM-\d+(?:\s*,\s*MOM-\d+)*)\s*\|\s*$/.exec(lines[i]);
    if (row) {
      areas.push({ area: row[1], tickets: row[2].match(TICKET_KEY) ?? [] });
      continue;
    }

    const bullet = /^- \[( |x|X)\]\s+(.*)$/.exec(lines[i]);
    if (!bullet) continue;
    const startLine = i + 1;
    let raw = bullet[2];
    // An item is normally one line; an indented line after it continues it.
    while (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1]) && !/^\s*- \[/.test(lines[i + 1])) {
      raw += ` ${lines[++i].trim()}`;
    }

    const jira = /\*Jira:\s*([^*]+?)\s*\*/.exec(raw);
    const source = /\*Source:\s*(.+?)\*(?=\s|$)/.exec(raw);
    const markers = [raw.indexOf('*Source:'), raw.indexOf('*Jira:')].filter((n) => n >= 0);
    const textEnd = markers.length > 0 ? Math.min(...markers) : raw.length;
    items.push({
      line: startLine,
      done: bullet[1] !== ' ',
      text: raw.slice(0, textEnd).trim(),
      source: source ? source[1].trim() : null,
      tickets: [...new Set(jira ? (jira[1].match(TICKET_KEY) ?? []) : [])],
    });
  }
  return { areas, items };
}

const keyNumber = (key: string) => Number(key.slice(4));

// ---------------------------------------------------------------------------
// CLAUDE.md: the repository standards a prompt must follow
// ---------------------------------------------------------------------------

export interface Standards {
  // Verbatim bullets of the "Definition of Done" checklist.
  definitionOfDone: string[];
  // Documents CLAUDE.md says to read before changing domain logic.
  domainDocs: string[];
  // e.g. feature/MOM-<number>-short-description
  branchPattern: string;
  // e.g. feat(MOM-<number>): concise description of changes
  commitPattern: string;
}

const DEFAULT_STANDARDS: Standards = {
  definitionOfDone: [
    'Feature branch created off clean `main`.',
    'Static type verification passes (`npx tsc --noEmit`).',
    'Code committed using `feat(MOM-X)` message format.',
    'Branch merged to `main` and Jira ticket moved to `Done`.',
  ],
  domainDocs: ['docs/NINETY_DAY_PLAN_CONTEXT.md', 'docs/INTEGRATIONS_SPEC.md'],
  branchPattern: 'feature/MOM-<number>-short-description',
  commitPattern: 'feat(MOM-<number>): concise description of changes',
};

export function parseStandards(claudeMd: string): Standards {
  const lines = claudeMd.split(/\r?\n/);

  const dodStart = lines.findIndex((l) => /^#{2,4}\s*\d*\.?\s*Definition of Done/i.test(l));
  const definitionOfDone: string[] = [];
  if (dodStart >= 0) {
    for (const line of lines.slice(dodStart + 1)) {
      const bullet = /^- \[[ xX]\]\s+(.*\S)\s*$/.exec(line);
      if (bullet) definitionOfDone.push(bullet[1]);
      else if (/^#{1,4}\s/.test(line) || /^---\s*$/.test(line)) break;
    }
  }

  const domainDocs = [...claudeMd.matchAll(/^- \*\*`([^`]+\.md)`\*\*/gm)].map((m) => m[1]);
  const branchPattern = /\*\*Branch Naming Pattern:\*\*\s*`([^`]+)`/.exec(claudeMd)?.[1];
  const commitPattern = /\*\*Pattern:\*\*\s*`([^`]+)`/.exec(claudeMd)?.[1];

  return {
    definitionOfDone: definitionOfDone.length > 0 ? definitionOfDone : DEFAULT_STANDARDS.definitionOfDone,
    domainDocs: domainDocs.length > 0 ? domainDocs : DEFAULT_STANDARDS.domainDocs,
    branchPattern: branchPattern ?? DEFAULT_STANDARDS.branchPattern,
    commitPattern: commitPattern ?? DEFAULT_STANDARDS.commitPattern,
  };
}

// ---------------------------------------------------------------------------
// One ticket's plan
// ---------------------------------------------------------------------------

export const COMMIT_TYPES = ['feat', 'fix', 'test', 'docs', 'chore'] as const;
export type CommitType = (typeof COMMIT_TYPES)[number];

export interface TicketPlan {
  ticket: string;
  area: string;
  title: string;
  slug: string;
  branch: string;
  commitMessage: string;
  openItems: BacklogItem[];
  resolvedItems: BacklogItem[];
  // Other tickets that share a BACKLOG item with this one.
  relatedTickets: string[];
  docs: string[];
  prompt: string;
}

export interface TicketSummary {
  ticket: string;
  area: string;
  open: number;
  resolved: number;
  title: string;
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have', 'in', 'is', 'it', 'its', 'no', 'not',
  'of', 'on', 'only', 'or', 'so', 'that', 'the', 'their', 'there', 'this', 'to', 'was', 'were', 'with', 'yet',
]);

// "Rebalance: the rule-based builder only proposes carry-overs. Pull-forward..." ->
// "the rule-based builder only proposes carry-overs". The area prefix is dropped, the first sentence kept.
export function deriveTitle(itemText: string | undefined, ticket: string): string {
  if (!itemText) return `See Jira for the scope of ${ticket}`;
  let text = itemText.replace(/\s+/g, ' ').trim();
  const prefix = /^([A-Za-z][A-Za-z /-]{0,30}):\s+/.exec(text);
  if (prefix && prefix[1].split(' ').length <= 4) text = text.slice(prefix[0].length);
  const sentence = /^(.+?[.!?])(?:\s|$)/.exec(text);
  text = (sentence ? sentence[1] : text).replace(/[.!?]+$/, '').trim();
  if (text.length > 100) text = `${text.slice(0, 100).replace(/\s+\S*$/, '')}...`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function deriveSlug(title: string): string {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w));
  const slug = words.slice(0, 4).join('-').slice(0, 40).replace(/-+$/, '');
  return slug || 'backlog-items';
}

// First letter lower-cased for a commit subject, unless the title starts with an acronym or code.
function toSubject(title: string): string {
  const clean = title.replace(/`/g, '').replace(/\.\.\.$/, '').trim();
  const subject = /^[A-Z][a-z]/.test(clean) ? clean.charAt(0).toLowerCase() + clean.slice(1) : clean;
  return subject.length > 64 ? subject.slice(0, 64).replace(/\s+\S*$/, '') : subject;
}

export interface PlanOptions {
  type?: CommitType;
  slug?: string;
}

export function buildTicketPlan(
  ticket: string,
  backlog: Backlog,
  standards: Standards,
  options: PlanOptions = {},
): TicketPlan {
  const own = backlog.items.filter((item) => item.tickets.includes(ticket));
  const openItems = own.filter((item) => !item.done);
  const resolvedItems = own.filter((item) => item.done);
  const area = backlog.areas.find((a) => a.tickets.includes(ticket))?.area ?? 'Unlisted';
  const title = deriveTitle(openItems[0]?.text ?? resolvedItems[0]?.text, ticket);
  // A ticket with no BACKLOG item has no description to name a branch or a commit after; its scope is in Jira.
  const hasItems = own.length > 0;
  const slug = options.slug ? deriveSlug(options.slug) : hasItems ? deriveSlug(title) : 'jira-scope';
  const type = options.type ?? 'feat';
  const branch = `feature/${ticket}-${slug}`;
  const commitMessage = `${type}(${ticket}): ${hasItems ? toSubject(title) : 'implement as scoped in Jira'}`;

  const relatedTickets = [...new Set(own.flatMap((item) => item.tickets))]
    .filter((key) => key !== ticket)
    .sort((a, b) => keyNumber(a) - keyNumber(b));

  // Documents named in the items' Source fields join the ones CLAUDE.md always requires.
  const mentioned = own.flatMap((item) => item.source?.match(/[A-Za-z_/]+\.md/g) ?? []);
  const docs = [...new Set([...standards.domainDocs, ...mentioned.filter((d) => /^[A-Z_]+\.md$|^docs\//.test(d))])];

  const plan: Omit<TicketPlan, 'prompt'> = {
    ticket,
    area,
    title,
    slug,
    branch,
    commitMessage,
    openItems,
    resolvedItems,
    relatedTickets,
    docs,
  };
  return { ...plan, prompt: renderPrompt(plan, standards) };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export function renderPrompt(plan: Omit<TicketPlan, 'prompt'>, standards: Standards): string {
  const steps: string[] = [];
  steps.push(
    `Read ticket ${plan.ticket} in Jira first and use its acceptance criteria as the definition of done. The title and items below come from BACKLOG.md, which holds keys and not titles. If they disagree with the ticket, stop and flag it instead of picking one.`,
  );
  steps.push(
    `Read CLAUDE.md and ${plan.docs.map((d) => `\`${d}\``).join(', ')} before writing or changing any domain logic. If the code and these documents disagree, stop and flag it.`,
  );
  if (plan.openItems.length === 0) {
    steps.push(
      `No open BACKLOG.md item references ${plan.ticket}. Work from the Jira ticket alone, and add anything you discover to the bottom of BACKLOG.md with this ticket key.`,
    );
  }
  for (const item of plan.openItems) {
    const where = item.source ? ` (Source: ${item.source})` : '';
    steps.push(`Resolve BACKLOG.md line ${item.line}: ${item.text}${where}`);
  }
  steps.push(
    'Add or update tests in `tests/` for any change to domain logic, services or SQL migrations. Apply a migration to production only after it has been reviewed and approved, then run the verify scripts in `supabase/verify/`.',
  );
  steps.push('Update BACKLOG.md: tick the items you resolved and add anything new you found, each ending with its ticket key.');
  steps.push('Check every item of the Definition of Done below, and report anything you could not verify.');
  steps.push(
    `Create the feature branch \`${plan.branch}\` off a clean \`main\`, commit with "${plan.commitMessage}", and merge it into \`main\` with \`--no-ff\`.`,
  );
  steps.push(
    `Move ${plan.ticket} to Done in Jira only if its acceptance criteria are met. If any are not, say which and leave it open. If the ticket turns out to be obsolete or redundant, move it to Closed instead, with a comment saying why.`,
  );

  const lines: string[] = [];
  lines.push(`Implement ${plan.ticket}: ${plan.title}.`);
  lines.push('');
  lines.push(`Area: ${plan.area}.`);
  if (plan.relatedTickets.length > 0) lines.push(`Related tickets: ${plan.relatedTickets.join(', ')}.`);
  if (plan.resolvedItems.length > 0) {
    lines.push(`Already resolved in BACKLOG.md: ${plan.resolvedItems.length} ${plan.resolvedItems.length === 1 ? 'item' : 'items'} (not listed below).`);
  }
  lines.push('');
  lines.push('Task Instructions:');
  steps.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
  lines.push('');
  lines.push('Definition of Done (from CLAUDE.md):');
  for (const done of standards.definitionOfDone) lines.push(`- [ ] ${done}`);
  lines.push('');
  lines.push('Please review the requirements, check BACKLOG.md, and begin implementation.');
  return lines.join('\n');
}

export function summarizeTickets(backlog: Backlog): TicketSummary[] {
  const keys = new Set<string>([...backlog.areas.flatMap((a) => a.tickets), ...backlog.items.flatMap((i) => i.tickets)]);
  return [...keys]
    .sort((a, b) => keyNumber(a) - keyNumber(b))
    .map((ticket) => {
      const own = backlog.items.filter((item) => item.tickets.includes(ticket));
      const open = own.filter((item) => !item.done);
      const area = backlog.areas.find((a) => a.tickets.includes(ticket))?.area ?? 'Unlisted';
      return {
        ticket,
        area,
        open: open.length,
        resolved: own.length - open.length,
        title: deriveTitle((open[0] ?? own[0])?.text, ticket),
      };
    });
}

export function renderOverview(backlog: Backlog): string {
  const summaries = summarizeTickets(backlog);
  const withOpen = summaries.filter((s) => s.open > 0);
  const unticketed = backlog.items.filter((item) => !item.done && item.tickets.length === 0);
  const rows = summaries.map((s) =>
    [s.ticket.padEnd(7), s.area.padEnd(26), String(s.open).padStart(4), String(s.resolved).padStart(8), s.title].join('  '),
  );
  return [
    `${summaries.length} tickets in BACKLOG.md, ${withOpen.length} with open items.`,
    '',
    ['TICKET ', 'AREA'.padEnd(26), '  OPEN', ' RESOLVED', 'TITLE (first open item)'].join('  '),
    ...rows,
    '',
    unticketed.length > 0
      ? `${unticketed.length} open ${unticketed.length === 1 ? 'item has' : 'items have'} no Jira key (BACKLOG.md line${unticketed.length === 1 ? '' : 's'} ${unticketed.map((i) => i.line).join(', ')}).`
      : 'Every open item has a Jira key.',
    '',
    'Print a prompt with: npm run plan -- MOM-<n>   (add --json for structured output)',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------

export interface Io {
  cwd: string;
  out: (text: string) => void;
  err: (text: string) => void;
}

const HELP = `Usage: npm run plan -- [MOM-<n> ...] [options]

  (no arguments)        list every ticket with its open and resolved BACKLOG items
  MOM-<n> ...           print the build prompt for each ticket ("22" also works)
  --area <name>         every ticket under that area of the BACKLOG table
  --all                 every ticket that still has an open item
  --json                structured output instead of text
  --type <type>         commit type: ${COMMIT_TYPES.join(', ')} (default feat)
  --slug <words>        override the branch slug (one ticket only)
  --backlog <file>      default BACKLOG.md          --claude <file>   default CLAUDE.md
  -h, --help            this text`;

function normalizeKey(raw: string): string | null {
  const match = /^(?:MOM-)?(\d+)$/i.exec(raw.trim());
  return match ? `MOM-${Number(match[1])}` : null;
}

export function main(argv: string[], io: Io): number {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        area: { type: 'string' },
        all: { type: 'boolean' },
        json: { type: 'boolean' },
        type: { type: 'string' },
        slug: { type: 'string' },
        backlog: { type: 'string' },
        claude: { type: 'string' },
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

  const type = (values.type as string | undefined) ?? 'feat';
  if (!(COMMIT_TYPES as readonly string[]).includes(type)) {
    io.err(`Unknown --type "${type}". Use one of: ${COMMIT_TYPES.join(', ')}.`);
    return 2;
  }

  const backlogPath = resolve(io.cwd, (values.backlog as string | undefined) ?? 'BACKLOG.md');
  if (!existsSync(backlogPath)) {
    io.err(`Cannot find ${backlogPath}.`);
    return 1;
  }
  const backlog = parseBacklog(readFileSync(backlogPath, 'utf8'));
  const claudePath = resolve(io.cwd, (values.claude as string | undefined) ?? 'CLAUDE.md');
  const standards = existsSync(claudePath) ? parseStandards(readFileSync(claudePath, 'utf8')) : DEFAULT_STANDARDS;
  if (!existsSync(claudePath)) io.err(`Warning: ${claudePath} not found; using built-in standards.`);

  const summaries = summarizeTickets(backlog);
  const known = new Set(summaries.map((s) => s.ticket));

  // Which tickets to print.
  const wanted: string[] = [];
  for (const raw of parsed.positionals) {
    const key = normalizeKey(raw);
    if (!key) {
      io.err(`"${raw}" is not a ticket key. Use MOM-<number>.`);
      return 2;
    }
    wanted.push(key);
  }
  if (typeof values.area === 'string') {
    const area = backlog.areas.find((a) => a.area.toLowerCase() === (values.area as string).toLowerCase());
    if (!area) {
      io.err(`No area "${values.area}". Areas: ${backlog.areas.map((a) => a.area).join(', ')}.`);
      return 1;
    }
    wanted.push(...area.tickets);
  }
  if (values.all) wanted.push(...summaries.filter((s) => s.open > 0).map((s) => s.ticket));

  if (wanted.length === 0) {
    io.out(values.json ? JSON.stringify({ tickets: summaries }, null, 2) : renderOverview(backlog));
    return 0;
  }

  const unknown = [...new Set(wanted)].filter((key) => !known.has(key));
  if (unknown.length > 0) {
    io.err(`Not in BACKLOG.md: ${unknown.join(', ')}. Run "npm run plan" to list the tickets it knows.`);
    return 1;
  }
  const keys = [...new Set(wanted)].sort((a, b) => keyNumber(a) - keyNumber(b));
  if (typeof values.slug === 'string' && keys.length > 1) {
    io.err('--slug applies to one ticket only.');
    return 2;
  }

  const plans = keys.map((key) =>
    buildTicketPlan(key, backlog, standards, {
      type: type as CommitType,
      slug: typeof values.slug === 'string' ? values.slug : undefined,
    }),
  );
  if (values.json) {
    io.out(JSON.stringify({ standards, tickets: plans }, null, 2));
  } else {
    io.out(plans.map((plan) => plan.prompt).join('\n\n----------------------------------------\n\n'));
  }
  return 0;
}

// Runs only when started from the command line, not when a test imports the functions above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = main(process.argv.slice(2), {
    cwd: process.cwd(),
    out: (text) => process.stdout.write(`${text}\n`),
    err: (text) => process.stderr.write(`${text}\n`),
  });
  process.exitCode = code;
}
