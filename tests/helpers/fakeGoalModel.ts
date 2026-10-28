// In-memory stand-ins for the two Supabase clients lib/services/syncedEntries.ts uses (MOM-109), covering the goal
// model tables of migration 013 that the sync touches: sources, target_sources, targets, entries, entry_corrections.
// connected_apps and integration_credentials are delegated to ./fakeIntegrations, so one client serves both.
//
// It mirrors what the service depends on, so a write Postgres would refuse fails here too:
// - who may do what (the grant table in 013's header): the signed-in role reads its own rows and inserts manual
//   entries and its own corrections; the service role reads sources and target_sources, reads, inserts and updates
//   entries, and has NO grant on targets or entry_corrections (42501), and no delete anywhere,
// - row level security for the signed-in role (own rows only; the service role bypasses it, which is why the tests
//   switch nothing off and prove the service filters by user id itself),
// - the entries rules: value above zero, a non-blank record id, an object for evidence, one entry per target,
//   source and record id, and a target and source that belong to the same person (the composite foreign keys).
// tests/synced-entries.test.ts checks these rules exist in the SQL.

import { createSupabaseAdminClient as createIntegrationsAdminClient, createSupabaseServerClient as createIntegrationsServerClient, idb } from './fakeIntegrations';

type Row = Record<string, unknown>;
type GoalTable = 'sources' | 'target_sources' | 'targets' | 'entries' | 'entry_corrections';
type Role = 'session' | 'admin';
type Op = 'select' | 'insert' | 'update';

const GOAL_TABLES: ReadonlySet<string> = new Set(['sources', 'target_sources', 'targets', 'entries', 'entry_corrections']);

// Migration 013, section 7.
const GRANTS: Record<Role, Partial<Record<GoalTable, readonly Op[]>>> = {
  session: {
    sources: ['select'],
    target_sources: ['select'],
    targets: ['select'],
    entries: ['select', 'insert'],
    entry_corrections: ['select', 'insert'],
  },
  admin: {
    sources: ['select'],
    target_sources: ['select'],
    entries: ['select', 'insert', 'update'],
  },
};

export const gm = {
  sources: [] as Row[],
  targetSources: [] as Row[],
  targets: [] as Row[],
  entries: [] as Row[],
  corrections: [] as Row[],
  // Every write the service role made, to prove what it did and did not touch.
  adminWrites: [] as Array<{ table: string; op: string }>,
  // Every table the service role tried to reach, to prove what it never asked for.
  adminTables: [] as string[],
  clock: 0,
};

export function resetGm(): void {
  gm.sources = [];
  gm.targetSources = [];
  gm.targets = [];
  gm.entries = [];
  gm.corrections = [];
  gm.adminWrites = [];
  gm.adminTables = [];
  gm.clock = 0;
}

let seq = 0;
const newId = () => `10000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const stamp = () => new Date(Date.UTC(2026, 0, 1, 0, 0, ++gm.clock)).toISOString();

const rowsOf = (table: GoalTable): Row[] =>
  ({ sources: gm.sources, target_sources: gm.targetSources, targets: gm.targets, entries: gm.entries, entry_corrections: gm.corrections })[table];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

type Failure = { message: string; code?: string };

class Query {
  private op: Op = 'select';
  private payload: Row = {};
  private cols: string | undefined;
  private filters: Array<(r: Row) => boolean> = [];
  private returning = false;

  constructor(
    private readonly table: GoalTable,
    private readonly role: Role,
  ) {
    if (role === 'admin') gm.adminTables.push(table);
  }

  select(cols?: string) {
    this.cols = cols;
    if (this.op !== 'select') this.returning = true;
    return this;
  }
  insert(row: Row) {
    this.op = 'insert';
    this.payload = row;
    return this;
  }
  update(patch: Row) {
    this.op = 'update';
    this.payload = patch;
    return this;
  }
  delete(): never {
    throw new Error('delete() is not supported: nothing in the sync can delete');
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  gte(col: string, val: string) {
    this.filters.push((r) => String(r[col]) >= val);
    return this;
  }

  private project(r: Row): Row {
    if (!this.cols || this.cols === '*') return { ...r };
    return Object.fromEntries(
      this.cols
        .split(',')
        .map((c) => c.trim())
        .map((c) => [c, r[c]]),
    );
  }

  private visible(): Row[] {
    const all = rowsOf(this.table);
    // The service role bypasses row level security; the signed-in role sees only its own rows.
    if (this.role === 'admin') return all;
    return all.filter((r) => idb.user !== null && r.user_id === idb.user.id);
  }

  private run(): { data: Row[] | null; error: Failure | null } {
    if (!GRANTS[this.role][this.table]?.includes(this.op)) {
      return { data: null, error: { message: `permission denied for table ${this.table}`, code: '42501' } };
    }
    if (this.role === 'admin' && this.op !== 'select') gm.adminWrites.push({ table: this.table, op: this.op });

    if (this.op === 'select') {
      return { data: this.visible().filter((r) => this.filters.every((f) => f(r))).map((r) => this.project(r)), error: null };
    }
    if (this.op === 'insert') return this.runInsert();

    const changed: Row[] = [];
    for (const r of this.visible().filter((row) => this.filters.every((f) => f(row)))) {
      const next = { ...r, ...this.payload, updated_at: stamp() };
      const violated = this.violation(next);
      if (violated) return { data: null, error: { message: `new row violates check constraint "${violated}"`, code: '23514' } };
      Object.assign(r, next);
      changed.push(r);
    }
    return { data: this.returning ? changed.map((r) => this.project(r)) : [], error: null };
  }

  private violation(r: Row): string | null {
    if (this.table !== 'entries') return null;
    if (typeof r.value !== 'number' || !(r.value > 0)) return 'entries_value_positive';
    if (typeof r.source_record_id !== 'string' || r.source_record_id.trim() === '') return 'entries_record_id_not_blank';
    if (!isObject(r.evidence)) return 'entries_evidence_is_object';
    return null;
  }

  private runInsert(): { data: Row[] | null; error: Failure | null } {
    if (this.table === 'entry_corrections') {
      const row: Row = { id: newId(), created_at: stamp(), updated_at: stamp(), ...this.payload };
      if (this.role === 'session' && row.user_id !== idb.user?.id) {
        return { data: null, error: { message: 'new row violates row-level security policy for table "entry_corrections"', code: '42501' } };
      }
      if (gm.corrections.some((c) => c.source_id === row.source_id && c.source_record_id === row.source_record_id)) {
        return { data: null, error: { message: 'duplicate key value violates unique constraint "entry_corrections_source_record_unique"', code: '23505' } };
      }
      gm.corrections.push(row);
      return { data: [this.project(row)], error: null };
    }

    const row: Row = { id: newId(), work_item_id: null, evidence: {}, created_at: stamp(), updated_at: stamp(), ...this.payload };
    const violated = this.violation(row);
    if (violated) return { data: null, error: { message: `new row violates check constraint "${violated}"`, code: '23514' } };
    const source = gm.sources.find((s) => s.id === row.source_id && s.user_id === row.user_id);
    // A signed-in person writes entries only through their own manual sources (policy entries_insert_own_manual).
    if (this.role === 'session' && (row.user_id !== idb.user?.id || source?.kind !== 'manual')) {
      return { data: null, error: { message: 'new row violates row-level security policy for table "entries"', code: '42501' } };
    }
    if (!gm.targets.some((t) => t.id === row.target_id && t.user_id === row.user_id)) {
      return { data: null, error: { message: 'violates foreign key constraint "entries_target_fk"', code: '23503' } };
    }
    if (!source) return { data: null, error: { message: 'violates foreign key constraint "entries_source_fk"', code: '23503' } };
    if (gm.entries.some((e) => e.target_id === row.target_id && e.source_id === row.source_id && e.source_record_id === row.source_record_id)) {
      return { data: null, error: { message: 'duplicate key value violates unique constraint "entries_target_source_record_unique"', code: '23505' } };
    }
    gm.entries.push(row);
    return { data: [this.project(row)], error: null };
  }

  single() {
    const { data, error } = this.run();
    if (error) return Promise.resolve({ data: null, error });
    return Promise.resolve(data?.[0] ? { data: data[0], error: null } : { data: null, error: { message: 'no row' } });
  }
  maybeSingle() {
    const { data, error } = this.run();
    return Promise.resolve({ data: data?.[0] ?? null, error });
  }
  then<T>(resolve: (v: { data: Row[] | null; error: Failure | null }) => T, reject?: (e: unknown) => T) {
    return Promise.resolve(this.run()).then(resolve, reject);
  }
}

export async function createSupabaseServerClient() {
  const base = await createIntegrationsServerClient();
  return {
    auth: base.auth,
    from: (table: string) => (GOAL_TABLES.has(table) ? new Query(table as GoalTable, 'session') : base.from(table)),
  };
}

export function createSupabaseAdminClient() {
  const base = createIntegrationsAdminClient();
  return { from: (table: string) => (GOAL_TABLES.has(table) ? new Query(table as GoalTable, 'admin') : base.from(table)) };
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

export type Seeded = Row & { id: string; user_id: string };

export function seedSource(userId: string, over: Row = {}): Seeded {
  const row: Seeded = { id: newId(), user_id: userId, kind: 'synced', provider: 'hevy', label: 'Hevy', created_at: stamp(), updated_at: stamp(), ...over };
  gm.sources.push(row);
  return row;
}

export function seedTarget(userId: string, over: Row = {}): Seeded {
  const row: Seeded = { id: newId(), user_id: userId, measure: 'count', unit: null, ...over };
  gm.targets.push(row);
  return row;
}

export function bind(userId: string, target: Seeded, source: Seeded, metric: string | null = null): void {
  gm.targetSources.push({ target_id: target.id, source_id: source.id, user_id: userId, metric, created_at: stamp() });
}

export function seedEntry(over: Row & { user_id: string }): Seeded {
  const row: Seeded = { id: newId(), work_item_id: null, evidence: {}, created_at: stamp(), updated_at: stamp(), ...over };
  gm.entries.push(row);
  return row;
}
