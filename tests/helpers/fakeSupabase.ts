// In-memory stand-in for the Supabase server client, enough for lib/services/tasks.ts.
// Tests swap it in with vi.mock('@/lib/supabase/server', ...).
//
// It mirrors the database rules the service relies on, so a write Postgres would reject fails here
// too:
// - the micro_tasks CHECK constraints from supabase/migrations/001_initial_schema.sql,
// - the task_rebalance_history CHECK constraints from migration 003,
// - row level security: a signed-in user only sees and changes their own rows (switch off with
//   db.rls = false to prove the service filters by user id itself),
// - apply_task_move() from migration 003: moves one unfinished task and records it together.
// It has no working delete(): calling it throws and is counted, so tests can prove nothing is cut.
// tests/migrations.test.ts keeps this file honest by checking each rule exists in the SQL.

export interface TaskRow {
  id: string;
  user_id: string;
  goal_channel_id: string;
  title: string;
  task_type: string;
  minutes: number;
  status: 'todo' | 'done';
  fit: string | null;
  week_of: number;
  due_date: string | null;
  carried_from_week: number | null;
  pulled_from_week: number | null;
  completed_at: string | null;
  created_at: string;
}

export interface HistoryRow {
  id: string;
  user_id: string;
  task_id: string;
  source_week: number;
  target_week: number;
  shift_type: 'carry_over' | 'pull_forward';
  created_at: string;
}

type Row = Record<string, unknown>;

export const db = {
  tasks: [] as TaskRow[],
  history: [] as HistoryRow[],
  user: null as { id: string } | null,
  rls: true,
  updates: [] as Array<Record<string, unknown>>,
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  reads: 0,
  deleteCalls: 0,
  // Runs after each read, to simulate another request changing a row mid-flight.
  afterRead: undefined as (() => void) | undefined,
  clock: 0,
};

export function resetDb(tasks: TaskRow[] = [], user: { id: string } | null = null): void {
  db.tasks = tasks.map((t) => ({ ...t }));
  db.history = [];
  db.user = user;
  db.rls = true;
  db.updates = [];
  db.rpcCalls = [];
  db.reads = 0;
  db.deleteCalls = 0;
  db.afterRead = undefined;
  db.clock = 0;
}

// Constraint names match the migrations so a failure reads like Postgres' own error.
function taskViolation(r: TaskRow): string | null {
  if (r.week_of < 1) return 'micro_tasks_week_of_positive';
  if (r.carried_from_week !== null && !(r.carried_from_week >= 1 && r.carried_from_week < r.week_of)) {
    return 'micro_tasks_carried_from_earlier_week';
  }
  if (r.pulled_from_week !== null && !(r.pulled_from_week > r.week_of)) return 'micro_tasks_pulled_from_later_week';
  if (r.carried_from_week !== null && r.pulled_from_week !== null) return 'micro_tasks_single_move_marker';
  if ((r.status === 'done') !== (r.completed_at !== null)) return 'micro_tasks_completed_at_matches_status';
  return null;
}

function historyViolation(h: HistoryRow): string | null {
  if (h.source_week < 1 || h.target_week < 1) return 'task_rebalance_history_weeks_positive';
  const forward = h.shift_type === 'carry_over' && h.target_week > h.source_week;
  const back = h.shift_type === 'pull_forward' && h.target_week < h.source_week;
  return forward || back ? null : 'task_rebalance_history_direction';
}

type Table = 'micro_tasks' | 'task_rebalance_history';

class Query {
  private op: 'select' | 'update' = 'select';
  private patch: Row = {};
  private cols: string | undefined;
  private filters: Array<(r: Row) => boolean> = [];
  private orders: Array<{ col: string; ascending: boolean; nullsFirst: boolean }> = [];
  private max: number | undefined;
  private returning = false;

  constructor(private readonly table: Table) {}

  private rows(): Row[] {
    const all = (this.table === 'micro_tasks' ? db.tasks : db.history) as unknown as Row[];
    // RLS: a signed-in user sees only their own rows; a signed-out client sees none.
    if (!db.rls) return all;
    return all.filter((r) => db.user !== null && r.user_id === db.user.id);
  }

  select(cols?: string) {
    this.cols = cols;
    if (this.op === 'update') this.returning = true;
    return this;
  }
  update(patch: Row) {
    this.op = 'update';
    this.patch = patch;
    db.updates.push(patch);
    return this;
  }
  delete(): never {
    db.deleteCalls++;
    throw new Error('delete() is not supported: tasks are never deleted');
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  order(col: string, opts: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    this.orders.push({ col, ascending: opts.ascending ?? true, nullsFirst: opts.nullsFirst ?? false });
    return this;
  }
  limit(n: number) {
    this.max = n;
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

  private sorted(matched: Row[]): Row[] {
    const out = [...matched];
    out.sort((a, b) => {
      for (const { col, ascending, nullsFirst } of this.orders) {
        const x = a[col] as string | number | null;
        const y = b[col] as string | number | null;
        if (x === y) continue;
        if (x === null) return nullsFirst ? -1 : 1;
        if (y === null) return nullsFirst ? 1 : -1;
        return (x < y ? -1 : 1) * (ascending ? 1 : -1);
      }
      return 0;
    });
    return this.max === undefined ? out : out.slice(0, this.max);
  }

  private run(): { data: Row[]; error: { message: string } | null } {
    const matched = this.rows().filter((r) => this.filters.every((f) => f(r)));
    if (this.op === 'select') {
      db.reads++;
      const out = this.sorted(matched).map((r) => this.project(r));
      db.afterRead?.();
      return { data: out, error: null };
    }
    // Only micro_tasks is updatable by a client in these tests; history is append-only.
    if (this.table !== 'micro_tasks') return { data: [], error: { message: 'permission denied for table' } };
    const changed: Row[] = [];
    for (const r of matched) {
      const next = { ...r, ...this.patch } as unknown as TaskRow;
      const violated = taskViolation(next);
      if (violated) return { data: [], error: { message: `new row violates check constraint "${violated}"` } };
      Object.assign(r, next);
      changed.push(r);
    }
    return { data: this.returning ? changed.map((r) => this.project(r)) : [], error: null };
  }

  maybeSingle() {
    const { data, error } = this.run();
    return Promise.resolve({ data: data[0] ?? null, error });
  }
  then<T>(resolve: (v: { data: Row[]; error: { message: string } | null }) => T, reject?: (e: unknown) => T) {
    return Promise.resolve(this.run()).then(resolve, reject);
  }
}

// Mirrors public.apply_task_move (migration 003): acts for the signed-in user only, only on their own
// unfinished task still in p_from_week; sets week_of, one marker (clearing the other) and due_date;
// records the move. Never touches status or completed_at and never deletes. A constraint violation
// rolls the whole call back, so no history row is written for a move that did not happen.
function applyTaskMove(args: {
  p_task_id: string;
  p_from_week: number;
  p_to_week: number;
  p_action: string;
  p_due_date: string | null;
}): { data: boolean | null; error: { message: string } | null } {
  if (db.user === null) return { data: null, error: { message: 'Sign in to rebalance your plan.' } };
  if (args.p_action !== 'carry_over' && args.p_action !== 'pull_forward') {
    return { data: null, error: { message: 'Unknown rebalance action.' } };
  }
  const row = db.tasks.find(
    (t) =>
      t.id === args.p_task_id &&
      t.user_id === db.user!.id &&
      t.status === 'todo' &&
      t.week_of === args.p_from_week,
  );
  if (!row) return { data: false, error: null };

  const next: TaskRow = {
    ...row,
    week_of: args.p_to_week,
    carried_from_week: args.p_action === 'carry_over' ? args.p_from_week : null,
    pulled_from_week: args.p_action === 'pull_forward' ? args.p_from_week : null,
    due_date: args.p_due_date,
  };
  const entry: HistoryRow = {
    id: `h-${db.history.length + 1}`,
    user_id: db.user.id,
    task_id: row.id,
    source_week: args.p_from_week,
    target_week: args.p_to_week,
    shift_type: args.p_action,
    created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, ++db.clock)).toISOString(),
  };
  const violated = taskViolation(next) ?? historyViolation(entry);
  if (violated) return { data: null, error: { message: `new row violates check constraint "${violated}"` } };
  Object.assign(row, next);
  db.history.push(entry);
  return { data: true, error: null };
}

export async function createSupabaseServerClient() {
  return {
    auth: {
      getUser: async () =>
        db.user
          ? { data: { user: db.user }, error: null }
          : { data: { user: null }, error: { message: 'Auth session missing' } },
    },
    from: (table: string) => {
      if (table !== 'micro_tasks' && table !== 'task_rebalance_history') throw new Error(`unexpected table ${table}`);
      return new Query(table);
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      db.rpcCalls.push({ fn, args });
      if (fn !== 'apply_task_move') throw new Error(`unexpected function ${fn}`);
      return applyTaskMove(args as Parameters<typeof applyTaskMove>[0]);
    },
  };
}

// ---------------------------------------------------------------------------
// Row builders shared by the tests
// ---------------------------------------------------------------------------

let counter = 0;
export const newId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

export const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const OTHER_USER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

export function taskRow(week_of: number, over: Partial<TaskRow> = {}): TaskRow {
  return {
    id: newId(),
    user_id: USER,
    goal_channel_id: 'g',
    title: `task w${week_of}`,
    task_type: 'build',
    minutes: 30,
    status: 'todo',
    fit: null,
    week_of,
    due_date: null,
    carried_from_week: null,
    pulled_from_week: null,
    completed_at: null,
    created_at: '2026-10-14T00:00:00Z',
    ...over,
  };
}

export const taskById = (id: string): TaskRow => {
  const row = db.tasks.find((t) => t.id === id);
  if (!row) throw new Error(`no task ${id}`);
  return row;
};
