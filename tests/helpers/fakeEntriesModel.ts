// In-memory stand-in for the Supabase server client over the goal model tables (migration 013), enough for
// lib/services/entries.ts (MOM-110). Tests swap it in with vi.mock('@/lib/supabase/server', ...). It is separate from
// tests/helpers/fakeSupabase.ts, which is built around the old task tables.
//
// It mirrors the database rules the service relies on, so a write Postgres would reject fails here too, with the
// same code (23505 unique, 23514 check, 23503 foreign key, 42501 permission or row level security):
// - grants: entries can be selected and inserted and nothing else; entry_corrections, sources and the display
//   column of a step can be written; person settings, goals, targets and work items are read-only here,
// - row level security: a signed-in person sees and changes only their own rows (switch off with gm.rls = false to
//   prove the service filters by user id itself), and an entry can only be inserted through the person's own
//   manual source (entries_insert_own_manual),
// - the CHECK, unique and composite foreign key constraints of entries, entry_corrections, sources and steps.
// ENFORCED_CONSTRAINTS lists every name it enforces; tests/fake-entries-model.test.ts checks each one exists in the SQL.

type Row = Record<string, unknown>;

export const ME = '11111111-1111-4111-8111-111111111111';
export const OTHER = '22222222-2222-4222-8222-222222222222';

export const newId = () => crypto.randomUUID();

type TableName =
  | 'person_settings'
  | 'goals'
  | 'targets'
  | 'work_items'
  | 'work_item_steps'
  | 'sources'
  | 'entries'
  | 'entry_corrections'
  | 'period_snapshots';

// What the authenticated role may do on each table (migration 013, section 7).
const GRANTS: Record<TableName, ReadonlySet<'select' | 'insert' | 'update' | 'delete'>> = {
  person_settings: new Set(['select']),
  goals: new Set(['select']),
  targets: new Set(['select']),
  work_items: new Set(['select']),
  work_item_steps: new Set(['select', 'update']),
  sources: new Set(['select', 'insert', 'update', 'delete']),
  entries: new Set(['select', 'insert']),
  entry_corrections: new Set(['select', 'insert', 'update', 'delete']),
  period_snapshots: new Set(['select']),
};

export const ENFORCED_CONSTRAINTS = [
  'sources_kind_check',
  'sources_provider_matches_kind',
  'sources_label_not_blank',
  'entries_record_id_not_blank',
  'entries_value_positive',
  'entries_evidence_is_object',
  'entries_target_source_record_unique',
  'entries_target_fk',
  'entries_source_fk',
  'entries_work_item_fk',
  'entries_insert_own_manual',
  'entry_corrections_action_check',
  'entry_corrections_record_id_not_blank',
  'entry_corrections_source_record_unique',
  'entry_corrections_source_fk',
  'work_item_steps_completed_together',
] as const;

export const gm = {
  tables: {
    person_settings: [] as Row[],
    goals: [] as Row[],
    targets: [] as Row[],
    work_items: [] as Row[],
    work_item_steps: [] as Row[],
    sources: [] as Row[],
    entries: [] as Row[],
    entry_corrections: [] as Row[],
    period_snapshots: [] as Row[],
  } satisfies Record<TableName, Row[]>,
  user: null as { id: string } | null,
  rls: true,
  // Every write that reached a table, in order: { table, op }.
  writes: [] as Array<{ table: TableName; op: 'insert' | 'update' | 'delete' }>,
  // When set, the next write to this table (any op) fails with this message, like a database error that quotes the row.
  failNextWrite: null as { table: TableName; message: string } | null,
  // When set, the next read of this table fails, like a database that cannot be reached.
  failNextRead: null as { table: TableName; message: string } | null,
  clock: 0,
};

export function resetGoalModel(user: { id: string } | null = null): void {
  for (const name of Object.keys(gm.tables) as TableName[]) gm.tables[name] = [];
  gm.user = user;
  gm.rls = true;
  gm.writes = [];
  gm.failNextWrite = null;
  gm.failNextRead = null;
  gm.clock = 0;
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

const stamp = () => new Date(Date.UTC(2026, 9, 27, 12, 0, gm.clock++)).toISOString();

export function add(table: TableName, row: Row): Row {
  const stored = { ...row };
  gm.tables[table].push(stored);
  return stored;
}

export const goalRow = (userId: string, over: Row = {}): Row => ({
  id: newId(),
  user_id: userId,
  title: 'Stay fit',
  state: 'active',
  ...over,
});

export const targetRow = (userId: string, goalId: unknown, measure: string, over: Row = {}): Row => ({
  id: newId(),
  user_id: userId,
  goal_id: goalId,
  title: `A ${measure} target`,
  measure,
  unit: measure === 'quantity' ? 'km' : null,
  created_at: stamp(),
  ...over,
});

export const itemRow = (userId: string, goalId: unknown, targetId: unknown, over: Row = {}): Row => ({
  id: newId(),
  user_id: userId,
  goal_id: goalId,
  target_id: targetId,
  kind: 'milestone',
  title: 'Prep checklist',
  sort_order: 0,
  ...over,
});

export const stepRow = (userId: string, itemId: unknown, over: Row = {}): Row => ({
  id: newId(),
  user_id: userId,
  work_item_id: itemId,
  title: 'A step',
  sort_order: 0,
  completed_at: null,
  completed_via: null,
  ...over,
});

export const settingsRow = (userId: string, timeZone: string | null): Row => ({ user_id: userId, time_zone: timeZone });

// ---------------------------------------------------------------------------
// Constraints
// ---------------------------------------------------------------------------

interface Violation {
  code: '23505' | '23514' | '23503' | '42501';
  name: string;
}

const isBlank = (v: unknown) => typeof v !== 'string' || v.trim().length === 0;
const isObject = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);

const find = (table: TableName, match: (r: Row) => boolean) => gm.tables[table].find(match);

// The composite (id, user_id) foreign keys: the referenced row must be the same person's.
const owned = (table: TableName, id: unknown, userId: unknown) => find(table, (r) => r.id === id && r.user_id === userId);

function checkViolation(table: TableName, row: Row): Violation | null {
  if (table === 'sources') {
    if (row.kind !== 'synced' && row.kind !== 'manual') return { code: '23514', name: 'sources_kind_check' };
    if ((row.kind === 'synced') !== (row.provider !== null && row.provider !== undefined)) {
      return { code: '23514', name: 'sources_provider_matches_kind' };
    }
    if (isBlank(row.label)) return { code: '23514', name: 'sources_label_not_blank' };
  }
  if (table === 'entries') {
    if (isBlank(row.source_record_id)) return { code: '23514', name: 'entries_record_id_not_blank' };
    if (typeof row.value !== 'number' || !(row.value > 0)) return { code: '23514', name: 'entries_value_positive' };
    if (!isObject(row.evidence)) return { code: '23514', name: 'entries_evidence_is_object' };
  }
  if (table === 'entry_corrections') {
    if (row.action !== 'hide' && row.action !== 'count_anyway') return { code: '23514', name: 'entry_corrections_action_check' };
    if (isBlank(row.source_record_id)) return { code: '23514', name: 'entry_corrections_record_id_not_blank' };
  }
  if (table === 'work_item_steps') {
    if ((row.completed_at === null) !== (row.completed_via === null)) {
      return { code: '23514', name: 'work_item_steps_completed_together' };
    }
  }
  return null;
}

function uniqueViolation(table: TableName, row: Row, self: Row | null): Violation | null {
  const clash = (match: (r: Row) => boolean) => find(table, (r) => r !== self && match(r));
  if (table === 'entries' && clash((r) => r.target_id === row.target_id && r.source_id === row.source_id && r.source_record_id === row.source_record_id)) {
    return { code: '23505', name: 'entries_target_source_record_unique' };
  }
  if (table === 'entry_corrections' && clash((r) => r.source_id === row.source_id && r.source_record_id === row.source_record_id)) {
    return { code: '23505', name: 'entry_corrections_source_record_unique' };
  }
  return null;
}

function foreignKeyViolation(table: TableName, row: Row): Violation | null {
  if (table === 'entries') {
    if (!owned('targets', row.target_id, row.user_id)) return { code: '23503', name: 'entries_target_fk' };
    if (!owned('sources', row.source_id, row.user_id)) return { code: '23503', name: 'entries_source_fk' };
    if (row.work_item_id !== null && row.work_item_id !== undefined && !owned('work_items', row.work_item_id, row.user_id)) {
      return { code: '23503', name: 'entries_work_item_fk' };
    }
  }
  if (table === 'entry_corrections' && !owned('sources', row.source_id, row.user_id)) {
    return { code: '23503', name: 'entry_corrections_source_fk' };
  }
  return null;
}

// Row level security's WITH CHECK on insert, for the one policy that is more than "it is yours".
function insertPolicyViolation(table: TableName, row: Row): Violation | null {
  if (!gm.user) return { code: '42501', name: `${table} (not signed in)` };
  if (!gm.rls) return null;
  if (row.user_id !== gm.user.id) return { code: '42501', name: `${table}_insert_own` };
  if (table === 'entries') {
    const source = owned('sources', row.source_id, row.user_id);
    if (!source || source.kind !== 'manual') return { code: '42501', name: 'entries_insert_own_manual' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// The query builder
// ---------------------------------------------------------------------------

interface DbError {
  code: string;
  message: string;
}
interface Result {
  data: unknown;
  error: DbError | null;
}

const failure = (code: string, message: string): Result => ({ data: null, error: { code, message } });

class Query implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private columns: string | undefined;
  private filters: Array<(r: Row) => boolean> = [];
  private orders: Array<{ column: string; ascending: boolean }> = [];
  private max: number | null = null;
  private offset = 0;
  private mode: 'many' | 'maybe' | 'one' = 'many';
  private payload: Row | Row[] | null = null;
  private returning = false;

  constructor(private readonly table: TableName) {}

  select(columns?: string) {
    if (this.op === 'select') this.columns = columns;
    else {
      this.returning = true;
      this.columns = columns;
    }
    return this;
  }
  insert(payload: Row | Row[]) {
    this.op = 'insert';
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.op = 'update';
    this.payload = payload;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((r) => r[column] === value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((r) => values.includes(r[column]));
    return this;
  }
  order(column: string, options: { ascending?: boolean } = {}) {
    this.orders.push({ column, ascending: options.ascending ?? true });
    return this;
  }
  limit(count: number) {
    this.max = count;
    return this;
  }
  // Rows from..to, both inclusive, like the API's range header.
  range(from: number, to: number) {
    this.offset = from;
    this.max = to - from + 1;
    return this;
  }
  maybeSingle() {
    this.mode = 'maybe';
    return this;
  }
  single() {
    this.mode = 'one';
    return this;
  }

  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }

  private project(row: Row): Row {
    if (this.columns === undefined || this.columns.trim() === '*') return { ...row };
    const out: Row = {};
    for (const column of this.columns.split(',').map((c) => c.trim())) out[column] = row[column];
    return out;
  }

  // Rows this person may see: their own under RLS, none when signed out.
  private visible(): Row[] {
    const rows = gm.tables[this.table];
    if (!gm.rls) return rows;
    if (!gm.user) return [];
    return rows.filter((r) => r.user_id === gm.user?.id);
  }

  private matched(): Row[] {
    return this.visible().filter((r) => this.filters.every((f) => f(r)));
  }

  private shape(rows: Row[]): Result {
    const projected = rows.map((r) => this.project(r));
    if (this.mode === 'many') return { data: projected, error: null };
    if (projected.length > 1) return failure('PGRST116', 'JSON object requested, multiple (or no) rows returned');
    if (projected.length === 0) {
      return this.mode === 'maybe' ? { data: null, error: null } : failure('PGRST116', 'JSON object requested, multiple (or no) rows returned');
    }
    return { data: projected[0], error: null };
  }

  private run(): Result {
    if (!GRANTS[this.table].has(this.op)) return failure('42501', `permission denied for table ${this.table}`);

    if (this.op === 'select') {
      if (gm.failNextRead?.table === this.table) {
        const { message } = gm.failNextRead;
        gm.failNextRead = null;
        return failure('XX000', message);
      }
      const rows = this.matched();
      for (const { column, ascending } of [...this.orders].reverse()) {
        rows.sort((a, b) => {
          const x = a[column] as string | number;
          const y = b[column] as string | number;
          return (x < y ? -1 : x > y ? 1 : 0) * (ascending ? 1 : -1);
        });
      }
      return this.shape(rows.slice(this.offset, this.max === null ? undefined : this.offset + this.max));
    }

    if (gm.failNextWrite?.table === this.table) {
      const { message } = gm.failNextWrite;
      gm.failNextWrite = null;
      return failure('XX000', message);
    }

    if (this.op === 'insert') {
      const incoming = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      const added: Row[] = [];
      for (const raw of incoming) {
        const row: Row = { ...raw };
        row.id ??= newId();
        row.created_at ??= stamp();
        row.updated_at ??= row.created_at;
        if (this.table === 'entries') {
          row.evidence ??= {};
          row.work_item_id ??= null;
        }
        if (this.table === 'sources') row.provider ??= null;
        const violation =
          insertPolicyViolation(this.table, row) ??
          checkViolation(this.table, row) ??
          foreignKeyViolation(this.table, row) ??
          uniqueViolation(this.table, row, null);
        if (violation) return failure(violation.code, `violates ${violation.name}`);
        added.push(row);
      }
      for (const row of added) gm.tables[this.table].push(row);
      gm.writes.push(...added.map(() => ({ table: this.table, op: 'insert' as const })));
      return this.returning ? this.shape(added) : { data: null, error: null };
    }

    const rows = this.matched();
    if (this.op === 'update') {
      for (const row of rows) {
        const next = { ...row, ...(this.payload as Row), updated_at: stamp() };
        const violation = checkViolation(this.table, next) ?? uniqueViolation(this.table, next, row) ?? foreignKeyViolation(this.table, next);
        if (violation) return failure(violation.code, `violates ${violation.name}`);
        Object.assign(row, next);
        gm.writes.push({ table: this.table, op: 'update' });
      }
      return this.returning ? this.shape(rows) : { data: null, error: null };
    }

    gm.tables[this.table] = gm.tables[this.table].filter((r) => !rows.includes(r));
    for (let i = 0; i < rows.length; i++) gm.writes.push({ table: this.table, op: 'delete' });
    return this.returning ? this.shape(rows) : { data: null, error: null };
  }
}

export async function createSupabaseServerClient() {
  return {
    auth: {
      getUser: async () =>
        gm.user
          ? { data: { user: { id: gm.user.id, email: 'person@example.com' } }, error: null }
          : { data: { user: null }, error: { message: 'Auth session missing!' } },
    },
    from: (table: TableName) => new Query(table),
  };
}
