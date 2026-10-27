// Verify scripts may change only their own throwaway data (MOM-121, RAID R-19). Day-end step B runs every script
// in supabase/verify/ against production, so an insert, update or delete there that is not limited to the script's
// own throwaway user(s) could change a real person's data. This reads each script as text and fails on any write
// to a table that is not provably limited to them. A write passes when:
//   - an insert puts one of the script's own users in its user_id column (or, for insert ... select, selects it
//     there or filters the select on it);
//   - an update or delete has a top-level `where` that is not an `or` and contains `user_id = <own user>`
//     (`id = <own user>` for auth.users), or `id`/`<x>_id = <own id>`, an id variable that the script itself got
//     from its own insert ... returning id, from `select id into` rows filtered on its own user, or from an id it
//     declared as gen_random_uuid() and then inserted for its own user;
//   - or it is in ALLOWED below, each with a reason.
// Its own users are the ones the script inserts into auth.users: each id must be a variable declared as
// gen_random_uuid() and each email must end in @example.invalid.
// Not covered: a write made by calling a function (seed_career_pivot(a), reserve_llm_call(a, ...)), which can only
// be judged by reading the function; those calls take the script's own user or are expected to be refused.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Allowed {
  file: string;
  statement: RegExp;
  reason: string;
}

// Matched against the statement with whitespace collapsed and any format() placeholders filled in.
const ALLOWED: Allowed[] = [
  {
    file: '001_initial_schema.sql',
    statement: /^insert into public\.users%/,
    reason: 'Not a write: text inside a pattern that looks for "insert into public.users" in a function body.',
  },
  {
    file: '012_revoke_trigger_function_execute.sql',
    statement: /^insert into public\.users%/,
    reason: 'Not a write: text inside a pattern that looks for "insert into public.users" in a function body.',
  },
  {
    file: '011_llm_usage_logs.sql',
    statement: /^insert into public\.llm_usage_logs .* values \(gen_random_uuid\(\)/,
    reason: 'A row for a user that does not exist, expected to be refused by the foreign key (23503), so nothing is written.',
  },
  {
    file: '011_llm_usage_logs.sql',
    statement: /^update public\.llm_usage_logs .* where id = log_a$/,
    reason: 'log_a is the id of the row reserve_llm_call wrote for throwaway user a, taken from the call result.',
  },
  {
    file: '013_goal_model_tables.sql',
    statement: /^insert into public\.targets .* values \(p_user, /,
    reason: 'Helper whose p_user parameter is always throwaway user a or b in the calls that follow it.',
  },
];

interface Finding {
  file: string;
  line: number;
  why: string;
  statement: string;
}

interface Write {
  kind: 'insert' | 'update' | 'delete';
  schema: string | null;
  table: string;
  line: number;
  sql: string;
}

// ---------------------------------------------------------------------------
// Reading SQL as text
// ---------------------------------------------------------------------------

// Blanks `-- ...` comments, keeping line breaks so line numbers stay right.
function stripComments(sql: string): string {
  let out = '';
  let quoted = false;
  for (let i = 0; i < sql.length; i += 1) {
    const c = sql[i];
    if (c === "'") quoted = !quoted;
    if (!quoted && c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i += 1;
      out += '\n';
      continue;
    }
    out += c;
  }
  return out;
}

// Same length as `s`, with quoted text and anything inside brackets replaced by `_`, so a search finds only what is
// at the top level of the statement.
function mask(s: string): string {
  let out = '';
  let depth = 0;
  let quoted = false;
  for (const c of s) {
    if (quoted) {
      out += '_';
      if (c === "'") quoted = false;
    } else if (c === "'") {
      quoted = true;
      out += '_';
    } else if (c === '(' || c === '[') {
      out += depth === 0 ? c : '_';
      depth += 1;
    } else if (c === ')' || c === ']') {
      depth -= 1;
      out += depth === 0 ? c : '_';
    } else {
      out += depth > 0 ? '_' : c;
    }
  }
  return out;
}

// The pieces of `s` between top-level matches of `separator`.
function splitOn(s: string, separator: RegExp): string[] {
  const masked = mask(s);
  const pieces: string[] = [];
  let from = 0;
  for (const m of masked.matchAll(new RegExp(separator.source, 'gi'))) {
    pieces.push(s.slice(from, m.index));
    from = (m.index ?? 0) + m[0].length;
  }
  pieces.push(s.slice(from));
  return pieces.map((p) => p.trim());
}

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
const stripCast = (s: string) => s.trim().replace(/\s*::\s*\w+(\[\])?$/, '');
const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length;

// "(a, 'x'), (b, 'y')" -> [['a', "'x'"], ['b', "'y'"]]
function parseTuples(rest: string): string[][] {
  const tuples: string[][] = [];
  let pos = 0;
  for (;;) {
    const open = /^\s*,?\s*\(/.exec(rest.slice(pos));
    if (!open) return tuples;
    const start = pos + open[0].length - 1;
    const masked = mask(rest.slice(start));
    const end = start + masked.indexOf(')', 1);
    tuples.push(splitOn(rest.slice(start + 1, end), /,/));
    pos = end + 1;
  }
}

// The arguments after a format() string: ", a, ga)) = 'x'" -> ['a', 'ga'].
function formatArgs(rest: string): string[] {
  const head = /^\s*,/.exec(rest);
  if (!head) return [];
  const args: string[] = [];
  let current = '';
  let depth = 0;
  let quoted = false;
  for (let i = head[0].length; i < rest.length; i += 1) {
    const c = rest[i];
    if (c === "'") quoted = !quoted;
    if (!quoted) {
      if (c === '(' || c === '[') depth += 1;
      else if (c === ')' || c === ']') {
        if (depth === 0) break;
        depth -= 1;
      } else if (c === ',' && depth === 0) {
        args.push(current.trim());
        current = '';
        continue;
      }
    }
    current += c;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

// The statement that starts at `start`, and the format() arguments when it is the text of a format() string.
function statementAt(text: string, start: number): { body: string; args: string[] | null } {
  const before = text.slice(Math.max(0, start - 12), start);
  const tag = /(\$\w+\$)\s*$/.exec(before);
  if (tag) {
    const end = text.indexOf(tag[1], start);
    return { body: text.slice(start, end), args: formatArgs(text.slice(end + tag[1].length)) };
  }
  if (/format\(\s*'\s*$/i.test(before)) {
    let end = start;
    while (end < text.length && !(text[end] === "'" && text[end + 1] !== "'")) end += text[end] === "'" ? 2 : 1;
    return { body: text.slice(start, end), args: formatArgs(text.slice(end + 1)) };
  }
  let quoted = false;
  let end = start;
  for (; end < text.length; end += 1) {
    if (text[end] === "'") quoted = !quoted;
    else if (text[end] === ';' && !quoted) break;
  }
  return { body: text.slice(start, end), args: null };
}

// "%L" and "%I" in a format() string, replaced by the argument they stand for.
function fill(body: string, args: string[] | null): string {
  if (!args) return body;
  let next = 0;
  return body.replace(/%[LIs]/g, () => stripCast(args[next++] ?? '?'));
}

const TABLE = String.raw`(?:(\w+)\.)?(\w+|%I)`;
const WRITE = new RegExp(
  String.raw`\b(?:insert\s+into\s+${TABLE}|delete\s+from\s+${TABLE}|update\s+${TABLE}\s+(?:as\s+\w+\s+)?set\b)`,
  'gi',
);

// Every insert, update and delete against a table that is not a temp table or the script's own results table.
function findWrites(clean: string): Write[] {
  const writes: Write[] = [];
  for (const m of clean.matchAll(WRITE)) {
    const index = m.index ?? 0;
    if (/\bdo\s+$/i.test(clean.slice(Math.max(0, index - 8), index))) continue; // on conflict ... do update set
    const kind = m[2] ? 'insert' : m[4] ? 'delete' : 'update';
    const schema = m[1] ?? m[3] ?? m[5] ?? null;
    const table = m[2] ?? m[4] ?? m[6];
    if (schema === 'pg_temp' || (schema === null && /_results$/.test(table))) continue;
    const { body, args } = statementAt(clean, index);
    writes.push({ kind, schema, table, line: lineOf(clean, index), sql: normalize(fill(body, args)) });
  }
  return writes;
}

// ---------------------------------------------------------------------------
// Is a write limited to the script's own throwaway data?
// ---------------------------------------------------------------------------

interface Own {
  users: Set<string>;
  ids: Set<string>;
}

const declaredRandom = (clean: string, name: string) => new RegExp(`\\b${name}\\s+uuid\\s*:=\\s*gen_random_uuid\\(\\)`).test(clean);

// 'user' when a top-level `and` condition ties the write to an own user, 'id' when to an own id, otherwise null.
function limitedBy(where: string, userColumn: string, own: Own): 'user' | 'id' | null {
  if (/\bor\b/i.test(mask(where))) return null;
  let found: 'user' | 'id' | null = null;
  for (const condition of splitOn(where, /\band\b/)) {
    const m = /^(?:\w+\.)?(\w+)\s*(=|in)\s*([\s\S]+)$/i.exec(condition);
    if (!m) continue;
    const [, column, op, rhs] = m;
    const items = op.toLowerCase() === 'in' ? (/^\(([\s\S]*)\)$/.exec(rhs.trim())?.[1] ?? '').split(',') : [rhs];
    const names = items.map(stripCast);
    if (names.length === 0 || names.some((n) => n === '')) continue;
    if (column === userColumn && names.every((n) => own.users.has(n))) return 'user';
    if (column !== 'user_id' && (column === 'id' || column.endsWith('_id')) && names.every((n) => own.ids.has(n))) found = 'id';
  }
  return found;
}

// null when the write is limited; otherwise why it is not. `own.ids` is filled in as inserts are read.
function checkInsert(w: Write, own: Own, clean: string): string | null {
  const m = /^insert\s+into\s+\S+?\s*\(([^)]*)\)\s*(values|select)\b([\s\S]*)$/i.exec(w.sql);
  if (!m) return 'an insert with no column list, so the user it is for cannot be read';
  const columns = m[1].split(',').map((c) => c.trim().toLowerCase());
  const userAt = columns.indexOf('user_id');
  if (userAt < 0) return 'an insert with no user_id column';
  const idAt = columns.indexOf('id');
  const isOwn = (expr: string | undefined) => expr !== undefined && own.users.has(stripCast(expr));

  if (m[2].toLowerCase() === 'values') {
    const tuples = parseTuples(m[3]);
    if (tuples.length === 0) return 'an insert whose values cannot be read';
    const bad = tuples.find((t) => !isOwn(t[userAt]));
    if (bad) return `a row whose user_id is ${bad[userAt] ?? 'missing'}, not one of the script's own users`;
    if (idAt >= 0) {
      for (const t of tuples) if (/^\w+$/.test(t[idAt] ?? '') && declaredRandom(clean, t[idAt])) own.ids.add(t[idAt]);
    }
  } else {
    const masked = mask(m[3]);
    const fromAt = masked.search(/\bfrom\b/i);
    const selected = splitOn(fromAt < 0 ? m[3] : m[3].slice(0, fromAt), /,/);
    const whereAt = masked.search(/\bwhere\b/i);
    const filtered = whereAt >= 0 && limitedBy(m[3].slice(whereAt + 5), 'user_id', own) === 'user';
    if (!isOwn(selected[userAt]) && !filtered) return 'an insert ... select with no filter on the script\'s own user';
  }
  const returned = /\breturning\s+id\s+into\s+(\w+)/i.exec(w.sql);
  if (returned) own.ids.add(returned[1]);
  return null;
}

function checkChange(w: Write, own: Own): string | null {
  const masked = mask(w.sql);
  const whereAt = masked.search(/\bwhere\b/i);
  if (whereAt < 0) return `a ${w.kind} with no where, so it reaches every row`;
  const userColumn = w.schema === 'auth' && w.table === 'users' ? 'id' : 'user_id';
  return limitedBy(w.sql.slice(whereAt + 5), userColumn, own)
    ? null
    : `a ${w.kind} whose where is not limited to the script's own user or its own rows`;
}

// Reads the script's own throwaway users from its inserts into auth.users.
function readOwnUsers(writes: Write[], clean: string, file: string): { users: Set<string>; findings: Finding[] } {
  const users = new Set<string>();
  const findings: Finding[] = [];
  for (const w of writes.filter((x) => x.kind === 'insert' && x.schema === 'auth' && x.table === 'users')) {
    const m = /^insert\s+into\s+auth\.users\s*\(([^)]*)\)\s*values\b([\s\S]*)$/i.exec(w.sql);
    const columns = m ? m[1].split(',').map((c) => c.trim().toLowerCase()) : [];
    const tuples = m ? parseTuples(m[2]) : [];
    const problem = (why: string) => findings.push({ file, line: w.line, why, statement: w.sql });
    if (tuples.length === 0 || columns.indexOf('id') < 0 || columns.indexOf('email') < 0) {
      problem('an auth.users insert that cannot be read as (id, email) values (...)');
      continue;
    }
    for (const t of tuples) {
      const id = t[columns.indexOf('id')] ?? '';
      const email = t[columns.indexOf('email')] ?? '';
      if (!/^\w+$/.test(id) || !declaredRandom(clean, id)) problem(`a user id, ${id}, that is not a variable declared as gen_random_uuid()`);
      else if (!/@example\.invalid'$/.test(email)) problem(`a throwaway user whose email is ${email}, not @example.invalid`);
      else users.add(id);
    }
  }
  return { users, findings };
}

function analyze(file: string, sql: string): { findings: Finding[]; allowedUsed: Allowed[] } {
  const clean = stripComments(sql);
  const writes = findWrites(clean);
  const { users, findings } = readOwnUsers(writes, clean, file);
  const own: Own = { users, ids: new Set() };
  // Ids from `select id into x from <table> where user_id = <own user>`.
  for (const m of clean.matchAll(/\bselect\s+id\s+into\s+(\w+)\s+from\s+[\w.]+\s+where\s+([^;]*);/gi)) {
    if (limitedBy(m[2], 'user_id', own) === 'user') own.ids.add(m[1]);
  }

  const allowedUsed: Allowed[] = [];
  const isAllowed = (w: Write) => {
    const entry = ALLOWED.find((a) => a.file === file && a.statement.test(w.sql));
    if (entry) allowedUsed.push(entry);
    return entry !== undefined;
  };
  const report = (w: Write, why: string | null) => {
    if (why) findings.push({ file, line: w.line, why, statement: w.sql });
  };

  // Inserts first: they are where the script's own ids come from.
  const others = writes.filter((w) => !(w.kind === 'insert' && w.schema === 'auth' && w.table === 'users'));
  for (const w of others.filter((x) => x.kind === 'insert')) if (!isAllowed(w)) report(w, checkInsert(w, own, clean));
  for (const w of others.filter((x) => x.kind !== 'insert')) if (!isAllowed(w)) report(w, checkChange(w, own));
  return { findings, allowedUsed };
}

const show = (f: Finding) => `${f.file}:${f.line} ${f.why}: ${f.statement.slice(0, 120)}`;

// ---------------------------------------------------------------------------
// The scripts
// ---------------------------------------------------------------------------

const verifyDir = join(process.cwd(), 'supabase', 'verify');
const scripts = readdirSync(verifyDir).filter((f) => f.endsWith('.sql'));

describe('every verify script limits its writes to its own throwaway users', () => {
  it.each(scripts)('%s', (file) => {
    const { findings } = analyze(file, readFileSync(join(verifyDir, file), 'utf8'));
    expect(findings.map(show)).toEqual([]);
  });

  it('finds the writes it is meant to check', () => {
    const counts = scripts.map((f) => findWrites(stripComments(readFileSync(join(verifyDir, f), 'utf8'))).length);
    expect(counts.filter((n) => n > 0).length).toBeGreaterThanOrEqual(10);
    expect(counts.reduce((sum, n) => sum + n, 0)).toBeGreaterThan(200);
  });

  it('keeps every allow-list entry to a statement that still exists, with a reason', () => {
    const used = new Set<Allowed>();
    for (const file of scripts) for (const a of analyze(file, readFileSync(join(verifyDir, file), 'utf8')).allowedUsed) used.add(a);
    expect(ALLOWED.filter((a) => !used.has(a)).map((a) => `${a.file} ${a.statement}`)).toEqual([]);
    expect(ALLOWED.filter((a) => a.reason.trim() === '' || a.reason.includes('\n'))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The check itself: what it flags, and what it lets through
// ---------------------------------------------------------------------------

const wrap = (body: string) => `
do $$
declare
  a uuid := gen_random_uuid();
  a_task uuid;
begin
  insert into auth.users (id, email) values (a, 'x-verify@example.invalid');
${body}
  delete from auth.users where id = a;
end;
$$;`;

const flagged = (body: string) => analyze('fixture.sql', wrap(body)).findings.map((f) => f.why);

// The backfill statement as migration 004 has it, repeated in verify/004 before MOM-121.
const BACKFILL = `
  insert into public.task_rebalance_history (user_id, task_id, source_week, target_week, shift_type, created_at)
  select t.user_id, t.id, coalesce(t.carried_from_week, t.pulled_from_week), t.week_of,
         case when t.carried_from_week is not null then 'carry_over' else 'pull_forward' end, t.created_at
  from public.micro_tasks t
  where (t.carried_from_week is not null or t.pulled_from_week is not null)
    and not exists (select 1 from public.task_rebalance_history h where h.task_id = t.id);`;

describe('the write check', () => {
  it('flags the old 004 backfill, which had no filter on the script\'s user', () => {
    expect(flagged(BACKFILL)).toEqual(["an insert ... select with no filter on the script's own user"]);
  });

  it('passes the backfill once it is limited to the script\'s user', () => {
    const fixed = BACKFILL.replace('where (t.carried', 'where t.user_id = a\n    and (t.carried');
    expect(flagged(fixed)).toEqual([]);
  });

  it('flags a filter that sits only in a subquery or behind an or', () => {
    expect(flagged(BACKFILL.replace('and not exists (select 1', 'and not exists (select 1 from x where user_id = a'))).toHaveLength(1);
    expect(flagged(BACKFILL.replace('where (t.carried', 'where t.user_id = a or (t.carried'))).toHaveLength(1);
  });

  it('flags an update or delete with no where, or whose where is not limited', () => {
    expect(flagged('  update public.micro_tasks set minutes = 1;')).toEqual(['a update with no where, so it reaches every row']);
    expect(flagged('  delete from public.micro_tasks where status = \'todo\';')).toHaveLength(1);
    expect(flagged('  delete from public.goal_channels where user_id = a or is_default;')).toHaveLength(1);
    expect(flagged('  update public.goal_channels set goal_type = \'x\' where is_default and goal_type is null;')).toHaveLength(1);
  });

  it('passes writes filtered on the script\'s own user', () => {
    expect(flagged('  delete from public.task_rebalance_history where user_id = a;')).toEqual([]);
    expect(flagged('  update public.goal_channels set goal_type = null where user_id = a and is_default;')).toEqual([]);
    expect(flagged('  insert into public.goal_channels (user_id, channel_key, title) values (a, \'k\', \'T\');')).toEqual([]);
  });

  it('flags an insert for a user that is not the script\'s own', () => {
    expect(flagged('  insert into public.goal_channels (user_id, channel_key, title) values (gen_random_uuid(), \'k\', \'T\');')).toHaveLength(1);
    expect(flagged('  insert into public.goal_channels (user_id, channel_key, title) values (a, \'k\', \'T\'), (some_real_user, \'k\', \'T\');')).toHaveLength(1);
    expect(flagged('  insert into public.goal_channels (channel_key, title) values (\'k\', \'T\');')).toEqual(['an insert with no user_id column']);
  });

  it('flags a write to a table with no schema, like one with one', () => {
    expect(flagged('  delete from micro_tasks;')).toHaveLength(1);
    expect(flagged('  update micro_tasks set minutes = 1;')).toHaveLength(1);
  });

  it('lets an id-filtered write through only when the id came from the script\'s own rows', () => {
    const own = '  select id into a_task from public.micro_tasks where user_id = a and week_of = 2;\n';
    const change = '  update public.micro_tasks set status = \'done\' where id = a_task;';
    expect(flagged(own + change)).toEqual([]);
    // Any row, not the script's: the id does not belong to it.
    expect(flagged('  select id into a_task from public.micro_tasks limit 1;\n' + change)).toHaveLength(1);
    expect(flagged('  select id into a_task from public.micro_tasks where week_of = 2;\n' + change)).toHaveLength(1);
    // No assignment at all.
    expect(flagged(change)).toHaveLength(1);
    // Returned by the script's own insert.
    const insert = '  insert into public.micro_tasks (user_id, goal_channel_id, title) values (a, null, \'t\') returning id into a_task;\n';
    expect(flagged(insert + change)).toEqual([]);
    // Returned by an insert that is not limited: the id does not count, and the insert is flagged itself.
    const stray = '  insert into public.micro_tasks (user_id, title) select user_id, title from public.micro_tasks returning id into a_task;\n';
    expect(flagged(stray + change)).toHaveLength(2);
  });

  it('counts an id declared as gen_random_uuid() and inserted for the script\'s own user', () => {
    const sql = `
do $$
declare
  a uuid := gen_random_uuid();
  g uuid := gen_random_uuid();
  other uuid;
begin
  insert into auth.users (id, email) values (a, 'x@example.invalid');
  insert into public.goals (id, user_id, title) values (g, a, 'G');
  delete from public.goals where id = g;
  delete from public.goals where id = other;
end;
$$;`;
    expect(analyze('fixture.sql', sql).findings.map((f) => f.statement)).toEqual(['delete from public.goals where id = other']);
  });

  it('reads writes built inside format() strings, with their arguments filled in', () => {
    const ok = `  perform pg_temp.state(format($q$insert into public.goals (user_id, title) values (%L, 'g')$q$, a));`;
    const bad = `  perform pg_temp.state(format($q$insert into public.goals (user_id, title) values (%L, 'g')$q$, someone));`;
    const del = `  perform pg_temp.state(format('delete from public.goals where user_id = %L', a));`;
    const delBad = `  perform pg_temp.state(format('delete from public.goals where user_id = %L', someone));`;
    expect(flagged(ok)).toEqual([]);
    expect(flagged(bad)).toHaveLength(1);
    expect(flagged(del)).toEqual([]);
    expect(flagged(delBad)).toHaveLength(1);
  });

  it('does not read a write inside a comment, a results table, a temp table or on conflict ... do update', () => {
    expect(flagged('  -- delete from public.micro_tasks;\n  insert into mom_results (n) values (1);\n  update pg_temp.x set y = 1;')).toEqual([]);
    expect(
      flagged('  insert into public.goal_channels (user_id, channel_key, title) values (a, \'k\', \'T\') on conflict (user_id) do update set title = \'x\';'),
    ).toEqual([]);
  });

  it('accepts a delete of the script\'s own auth user only', () => {
    expect(flagged('  delete from auth.users where id = a;')).toEqual([]);
    expect(flagged('  delete from auth.users where id in (a);')).toEqual([]);
    expect(flagged('  delete from auth.users;')).toHaveLength(1);
    expect(flagged('  delete from auth.users where id = someone;')).toHaveLength(1);
  });

  it('flags a throwaway user that is not a random id or has a real-looking email', () => {
    const real = "do $$ declare a uuid := '11111111-1111-1111-1111-111111111111'; begin insert into auth.users (id, email) values (a, 'x@example.invalid'); end $$;";
    const mail = "do $$ declare a uuid := gen_random_uuid(); begin insert into auth.users (id, email) values (a, 'me@gmail.com'); end $$;";
    expect(analyze('fixture.sql', real).findings).toHaveLength(1);
    expect(analyze('fixture.sql', mail).findings).toHaveLength(1);
  });

  it('applies an allow-list entry only to its own file', () => {
    const sql = wrap("  insert into public.llm_usage_logs (user_id, feature) values (gen_random_uuid(), 'x');");
    expect(analyze('011_llm_usage_logs.sql', sql).findings).toEqual([]);
    expect(analyze('fixture.sql', sql).findings).toHaveLength(1);
  });
});
