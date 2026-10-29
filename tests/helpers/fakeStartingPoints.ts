// In-memory stand-in for the signed-in Supabase client over the tables lib/services/startingPoints.ts reads and writes
// (MOM-134, migration 017). Tests swap it in with vi.mock('@/lib/supabase/server', ...). It mirrors the rules the service
// relies on, with the SQLSTATE Postgres would raise:
// - row level security: a signed-in person sees and changes only their own rows (switch off with sp.rls = false to prove the
//   service filters by user id itself); an unanswered mark can be answered, an answered one cannot (starting_points_update_own);
// - grants: starting_points can be selected and updated, and only answered_at and outcome can be updated (42501 otherwise);
//   the subject tables can only be read;
// - the CHECK constraints on an answer: the outcome is kept or changed, and answered_at and outcome are set together (23514).
// ENFORCED_NAMES lists the constraint and policy names it enforces; tests/starting-points-service.test.ts checks each one
// exists in migration 017, so the fake cannot drift from the SQL.

type Row = Record<string, unknown>;

export const ME = '11111111-1111-4111-8111-111111111111';
export const OTHER = '22222222-2222-4222-8222-222222222222';
export const newId = () => crypto.randomUUID();

type TableName = 'starting_points' | 'person_settings' | 'person_day_types' | 'goals' | 'targets' | 'work_items';

export const ENFORCED_NAMES = [
  'starting_points_select_own',
  'starting_points_update_own',
  'starting_points_outcome_check',
  'starting_points_answered_together',
] as const;

const UPDATABLE_COLUMNS = new Set(['answered_at', 'outcome']);

export const sp = {
  tables: {
    starting_points: [] as Row[],
    person_settings: [] as Row[],
    person_day_types: [] as Row[],
    goals: [] as Row[],
    targets: [] as Row[],
    work_items: [] as Row[],
  } satisfies Record<TableName, Row[]>,
  user: null as { id: string } | null,
  rls: true,
  // Every update that reached starting_points: the columns it set.
  updates: [] as string[][],
  // When set, the next read or write of this table fails like a database that cannot be reached, with a message that quotes a row.
  failNext: null as { table: TableName; message: string } | null,
  // How many requests each table has served, so a test can show reads are by kind and not one per row.
  reads: {} as Record<string, number>,
};

export function resetStartingPoints(user: { id: string } | null = null): void {
  for (const name of Object.keys(sp.tables) as TableName[]) sp.tables[name] = [];
  sp.user = user;
  sp.rls = true;
  sp.updates = [];
  sp.failNext = null;
  sp.reads = {};
}

export const add = (table: TableName, row: Row): Row => {
  const stored = { ...row };
  sp.tables[table].push(stored);
  return stored;
};

let clock = 0;
const stamp = () => new Date(Date.UTC(2026, 9, 29, 12, 0, clock++)).toISOString();

export const markRow = (userId: string, subject: Row, field: string, over: Row = {}): Row => ({
  id: newId(),
  user_id: userId,
  subject_kind: 'person',
  day_type_id: null,
  goal_id: null,
  target_id: null,
  work_item_id: null,
  field,
  created_at: stamp(),
  answered_at: null,
  outcome: null,
  ...subject,
  ...over,
});

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
  private op: 'select' | 'update' = 'select';
  private columns: string | undefined;
  private filters: Array<(r: Row) => boolean> = [];
  private orders: Array<{ column: string; ascending: boolean }> = [];
  private payload: Row | null = null;
  private returning = false;
  private mode: 'many' | 'maybe' = 'many';

  constructor(private readonly table: TableName) {}

  select(columns?: string) {
    if (this.op === 'update') this.returning = true;
    this.columns = columns;
    return this;
  }
  update(payload: Row) {
    this.op = 'update';
    this.payload = payload;
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
  is(column: string, value: null) {
    this.filters.push((r) => (r[column] ?? null) === value);
    return this;
  }
  order(column: string, options: { ascending?: boolean } = {}) {
    this.orders.push({ column, ascending: options.ascending ?? true });
    return this;
  }
  maybeSingle() {
    this.mode = 'maybe';
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

  private visible(): Row[] {
    const rows = sp.tables[this.table];
    if (!sp.rls) return rows;
    if (!sp.user) return [];
    return rows.filter((r) => r.user_id === sp.user?.id);
  }

  private run(): Result {
    if (sp.failNext?.table === this.table) {
      const { message } = sp.failNext;
      sp.failNext = null;
      return failure('XX000', message);
    }
    let rows = this.visible().filter((r) => this.filters.every((f) => f(r)));

    if (this.op === 'select') {
      sp.reads[this.table] = (sp.reads[this.table] ?? 0) + 1;
      rows = [...rows];
      for (const { column, ascending } of [...this.orders].reverse()) {
        rows.sort((a, b) => ((a[column] as string) < (b[column] as string) ? -1 : (a[column] as string) > (b[column] as string) ? 1 : 0) * (ascending ? 1 : -1));
      }
      const projected = rows.map((r) => this.project(r));
      if (this.mode === 'maybe') {
        if (projected.length > 1) return failure('PGRST116', 'multiple rows returned');
        return { data: projected[0] ?? null, error: null };
      }
      return { data: projected, error: null };
    }

    // update: only starting_points, only answered_at and outcome (the column privilege)
    if (this.table !== 'starting_points') return failure('42501', `permission denied for table ${this.table}`);
    const patch = this.payload ?? {};
    if (Object.keys(patch).some((c) => !UPDATABLE_COLUMNS.has(c))) return failure('42501', 'permission denied for table starting_points');
    if (!sp.user) return failure('42501', 'permission denied for table starting_points');
    // starting_points_update_own: using (own row and answered_at is null)
    if (sp.rls) rows = rows.filter((r) => r.answered_at === null || r.answered_at === undefined);
    for (const row of rows) {
      const next = { ...row, ...patch };
      if (next.outcome !== null && next.outcome !== undefined && next.outcome !== 'kept' && next.outcome !== 'changed') {
        return failure('23514', 'violates starting_points_outcome_check');
      }
      if (((next.answered_at ?? null) === null) !== ((next.outcome ?? null) === null)) {
        return failure('23514', 'violates starting_points_answered_together');
      }
    }
    for (const row of rows) Object.assign(row, patch);
    sp.updates.push(Object.keys(patch));
    return { data: this.returning ? rows.map((r) => this.project(r)) : null, error: null };
  }
}

export async function createSupabaseServerClient() {
  return {
    auth: {
      getUser: async () =>
        sp.user
          ? { data: { user: { id: sp.user.id, email: 'person@example.com' } }, error: null }
          : { data: { user: null }, error: { message: 'Auth session missing!' } },
    },
    from: (table: TableName) => new Query(table),
  };
}
