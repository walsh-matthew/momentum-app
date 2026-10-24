// In-memory stand-in for the Supabase server client, enough for lib/services/tasks.ts.
// Tests swap it in with vi.mock('@/lib/supabase/server', ...).
//
// It mirrors the database rules the service relies on, so a write Postgres would reject fails here
// too:
// - the micro_tasks CHECK constraints from supabase/migrations/001_initial_schema.sql,
// - the task_rebalance_history CHECK constraints from migration 003,
// - the micro_tasks source columns from migration 007 (a source is a provider plus an id, both or
//   neither, and unique per user),
// - row level security: a signed-in user only sees and changes their own rows, and an insert for another
//   user fails (switch off with db.rls = false to prove the service filters by user id itself),
// - goal_channels inserts: the 001 CHECK constraints and unique key, the 008 goal_type and preferences
//   checks, and the 008 trigger that rejects a new goal with a ticked criterion,
// - create_goal_with_week_one_plan() from migration 009: the goal and its week 1 tasks are saved together or
//   not at all, the owner is the signed-in user, and every task is 'todo' in week 1,
// - apply_task_move() from migration 003: moves one unfinished task and records it together.
// It has no working delete(): calling it throws and is counted, so tests can prove nothing is cut.
// tests/migrations.test.ts keeps this file honest by checking each rule exists in the SQL.

import { CONSTRAINTS, GOAL_TYPES, PACES, TASK_TYPES } from '@/types/database.types';

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
  source_provider: string | null;
  source_external_id: string | null;
  source_evidence: Record<string, unknown> | null;
  created_at: string;
}

export interface ChannelRow {
  id: string;
  user_id: string;
  channel_key: string;
  title: string;
  status: 'active' | 'paused' | 'done';
  is_default: boolean;
  start_date: string;
  target_date: string | null;
  criteria: unknown;
  goal_type: string | null;
  preferences: unknown;
  created_at: string;
  updated_at: string;
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
  channels: [] as ChannelRow[],
  user: null as { id: string } | null,
  rls: true,
  updates: [] as Array<Record<string, unknown>>,
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  reads: 0,
  deleteCalls: 0,
  inserts: [] as Array<Record<string, unknown>>,
  // When set, the next insert fails with this message (a stand-in for a database error, which can quote the row).
  failNextInsert: null as string | null,
  // When set, create_goal_with_week_one_plan fails on the task at this index, after the goal row exists,
  // to prove the whole call rolls back.
  failTaskAt: null as number | null,
  // Runs after each read, to simulate another request changing a row mid-flight.
  afterRead: undefined as (() => void) | undefined,
  clock: 0,
};

export function resetDb(tasks: TaskRow[] = [], user: { id: string } | null = null): void {
  db.tasks = tasks.map((t) => ({ ...t }));
  db.history = [];
  db.channels = [];
  db.user = user;
  db.rls = true;
  db.updates = [];
  db.rpcCalls = [];
  db.reads = 0;
  db.deleteCalls = 0;
  db.inserts = [];
  db.failNextInsert = null;
  db.failTaskAt = null;
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
  if ((r.source_provider === null) !== (r.source_external_id === null)) return 'micro_tasks_source_pair';
  if (r.source_evidence !== null && r.source_provider === null) return 'micro_tasks_source_evidence_object';
  if (r.source_external_id !== null && r.source_external_id.trim() === '') return 'micro_tasks_source_external_id_not_blank';
  if (r.minutes <= 0) return 'micro_tasks_minutes_positive';
  if (r.title.trim().length === 0) return 'micro_tasks_title_not_blank';
  if (!(TASK_TYPES as readonly string[]).includes(r.task_type)) return 'micro_tasks_task_type_check';
  return null;
}

function historyViolation(h: HistoryRow): string | null {
  if (h.source_week < 1 || h.target_week < 1) return 'task_rebalance_history_weeks_positive';
  const forward = h.shift_type === 'carry_over' && h.target_week > h.source_week;
  const back = h.shift_type === 'pull_forward' && h.target_week < h.source_week;
  return forward || back ? null : 'task_rebalance_history_direction';
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// goal_channels_preferences_shape (migration 008).
function preferencesValid(p: unknown): boolean {
  if (!isObject(p)) return false;
  if (Object.keys(p).some((k) => k !== 'constraints' && k !== 'pace')) return false;
  if ('constraints' in p) {
    if (!Array.isArray(p.constraints)) return false;
    if (!p.constraints.every((c) => (CONSTRAINTS as readonly unknown[]).includes(c))) return false;
  }
  if ('pace' in p && !(typeof p.pace === 'string' && (PACES as readonly string[]).includes(p.pace))) return false;
  return true;
}

// The 001 and 008 rules on a goal_channels row; the trigger counts as a constraint here, named as in SQL.
function channelViolation(r: ChannelRow): string | null {
  if (!/^[a-z][a-z0-9_]*$/.test(r.channel_key)) return 'goal_channels_channel_key_format';
  if (r.title.trim().length === 0) return 'goal_channels_title_not_blank';
  if (!['active', 'paused', 'done'].includes(r.status)) return 'goal_channels_status_check';
  if (!Array.isArray(r.criteria)) return 'goal_channels_criteria_is_array';
  if (r.target_date !== null && !(r.target_date > r.start_date)) return 'goal_channels_target_after_start';
  if (r.goal_type !== null && !(GOAL_TYPES as readonly string[]).includes(r.goal_type)) return 'goal_channels_goal_type_check';
  if (!preferencesValid(r.preferences)) return 'goal_channels_preferences_shape';
  if (r.criteria.some((c) => !isObject(c) || c.done !== false)) return 'goal_channels_guard_new_criteria';
  return null;
}

type Table = 'micro_tasks' | 'task_rebalance_history' | 'goal_channels';

class Query {
  private op: 'select' | 'update' | 'insert' = 'select';
  private payload: Row = {};
  private cols: string | undefined;
  private filters: Array<(r: Row) => boolean> = [];
  private orders: Array<{ col: string; ascending: boolean; nullsFirst: boolean }> = [];
  private max: number | undefined;
  private returning = false;

  constructor(private readonly table: Table) {}

  private rows(): Row[] {
    const all = (
      this.table === 'micro_tasks' ? db.tasks : this.table === 'goal_channels' ? db.channels : db.history
    ) as unknown as Row[];
    // RLS: a signed-in user sees only their own rows; a signed-out client sees none.
    if (!db.rls) return all;
    return all.filter((r) => db.user !== null && r.user_id === db.user.id);
  }

  select(cols?: string) {
    this.cols = cols;
    if (this.op === 'update') this.returning = true;
    return this;
  }
  insert(row: Row) {
    this.op = 'insert';
    this.payload = row;
    db.inserts.push(row);
    return this;
  }
  update(patch: Row) {
    this.op = 'update';
    this.payload = patch;
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

  private run(): { data: Row[]; error: { message: string; code?: string } | null } {
    const matched = this.rows().filter((r) => this.filters.every((f) => f(r)));
    if (this.op === 'select') {
      db.reads++;
      const out = this.sorted(matched).map((r) => this.project(r));
      db.afterRead?.();
      return { data: out, error: null };
    }
    if (this.op === 'insert') return this.runInsert();
    // Only micro_tasks is updatable by a client in these tests; history and channels are not.
    if (this.table !== 'micro_tasks') return { data: [], error: { message: 'permission denied for table' } };
    const changed: Row[] = [];
    for (const r of matched) {
      const next = { ...r, ...this.payload } as unknown as TaskRow;
      const violated = taskViolation(next);
      if (violated) return { data: [], error: { message: `new row violates check constraint "${violated}"` } };
      Object.assign(r, next);
      changed.push(r);
    }
    return { data: this.returning ? changed.map((r) => this.project(r)) : [], error: null };
  }

  // An insert into micro_tasks as a signed-in user: row level security (the new row must be theirs),
  // the table's defaults, its CHECK constraints and the unique source per user (migration 007).
  private runInsert(): { data: Row[]; error: { message: string; code?: string } | null } {
    if (this.table === 'goal_channels') return this.runChannelInsert();
    if (this.table !== 'micro_tasks') return { data: [], error: { message: 'permission denied for table', code: '42501' } };
    const input = this.payload;
    if (db.failNextInsert) {
      const message = db.failNextInsert;
      db.failNextInsert = null;
      return { data: [], error: { message, code: 'XX000' } };
    }
    if (db.rls && (db.user === null || input.user_id !== db.user.id)) {
      return { data: [], error: { message: 'new row violates row-level security policy for table "micro_tasks"', code: '42501' } };
    }
    const row: TaskRow = {
      id: newId(),
      goal_channel_id: '',
      title: '',
      task_type: 'build',
      minutes: 1,
      status: 'todo',
      fit: null,
      week_of: 1,
      due_date: null,
      carried_from_week: null,
      pulled_from_week: null,
      completed_at: null,
      source_provider: null,
      source_external_id: null,
      source_evidence: null,
      created_at: '2026-10-14T00:00:00Z',
      ...(input as unknown as Partial<TaskRow>),
      user_id: input.user_id as string,
    };
    const violated = taskViolation(row);
    if (violated) return { data: [], error: { message: `new row violates check constraint "${violated}"`, code: '23514' } };
    if (!db.channels.some((c) => c.id === row.goal_channel_id && c.user_id === row.user_id)) {
      return { data: [], error: { message: 'violates foreign key constraint "micro_tasks_goal_channel_fk"', code: '23503' } };
    }
    if (
      row.source_provider !== null &&
      db.tasks.some(
        (t) => t.user_id === row.user_id && t.source_provider === row.source_provider && t.source_external_id === row.source_external_id,
      )
    ) {
      return { data: [], error: { message: 'duplicate key value violates unique constraint "micro_tasks_source_unique"', code: '23505' } };
    }
    db.tasks.push(row);
    return { data: [this.project(row as unknown as Row)], error: null };
  }

  // An insert into goal_channels as a signed-in user (see insertChannel).
  private runChannelInsert(): { data: Row[]; error: { message: string; code?: string } | null } {
    const result = insertChannel(this.payload);
    if (result.error) return { data: [], error: result.error };
    return { data: [this.project(result.row as unknown as Row)], error: null };
  }

  single() {
    const { data, error } = this.run();
    if (error) return Promise.resolve({ data: null, error });
    return Promise.resolve(data[0] ? { data: data[0], error: null } : { data: null, error: { message: 'no row' } });
  }
  maybeSingle() {
    const { data, error } = this.run();
    return Promise.resolve({ data: data[0] ?? null, error });
  }
  then<T>(resolve: (v: { data: Row[]; error: { message: string; code?: string } | null }) => T, reject?: (e: unknown) => T) {
    return Promise.resolve(this.run()).then(resolve, reject);
  }
}

// An insert into goal_channels as a signed-in user: row level security (the new row must be theirs), the
// table's defaults, its CHECK constraints, the 008 insert trigger, and the unique channel key and single
// default per user.
function insertChannel(input: Row): { row: ChannelRow; error: null } | { row: null; error: { message: string; code?: string } } {
  if (db.failNextInsert) {
    const message = db.failNextInsert;
    db.failNextInsert = null;
    return { row: null, error: { message, code: 'XX000' } };
  }
  if (db.rls && (db.user === null || input.user_id !== db.user.id)) {
    return { row: null, error: { message: 'new row violates row-level security policy for table "goal_channels"', code: '42501' } };
  }
  const stamp = new Date(Date.UTC(2026, 0, 1, 0, 0, ++db.clock)).toISOString();
  const row: ChannelRow = {
    id: newId(),
    user_id: input.user_id as string,
    channel_key: '',
    title: '',
    status: 'active',
    is_default: false,
    start_date: '2026-10-14',
    target_date: null,
    criteria: [],
    goal_type: null,
    preferences: {},
    created_at: stamp,
    updated_at: stamp,
    ...(input as unknown as Partial<ChannelRow>),
  };
  const violated = channelViolation(row);
  if (violated) {
    const trigger = violated === 'goal_channels_guard_new_criteria';
    return {
      row: null,
      error: {
        message: trigger ? "A new goal's criteria must all start unticked." : `new row violates check constraint "${violated}"`,
        code: '23514',
      },
    };
  }
  if (db.channels.some((c) => c.user_id === row.user_id && c.channel_key === row.channel_key)) {
    return { row: null, error: { message: 'duplicate key value violates unique constraint "goal_channels_user_channel_key_unique"', code: '23505' } };
  }
  if (row.is_default && db.channels.some((c) => c.user_id === row.user_id && c.is_default)) {
    return { row: null, error: { message: 'duplicate key value violates unique constraint "goal_channels_one_default_per_user"', code: '23505' } };
  }
  db.channels.push(row);
  return { row, error: null };
}

// Mirrors public.create_goal_with_week_one_plan (migration 009): acts for the signed-in user only, saves a
// goal and its tasks in one transaction, takes no status or completed_at, and makes every task 'todo' in week 1.
// Any failure restores the state from before the call, so no goal is left without its tasks.
function createGoalWithWeekOnePlan(args: Record<string, unknown>): {
  data: ChannelRow | null;
  error: { message: string; code?: string } | null;
} {
  if (db.user === null) return { data: null, error: { message: 'Sign in to create a goal.', code: '42501' } };
  const tasks = args.p_tasks;
  if (!Array.isArray(tasks)) return { data: null, error: { message: 'p_tasks must be a JSON array of tasks.', code: '22023' } };
  if (tasks.length < 1 || tasks.length > 100) {
    return { data: null, error: { message: 'A week 1 plan needs between 1 and 100 tasks.', code: '22023' } };
  }
  const allowed = new Set(['title', 'task_type', 'minutes']);
  if (tasks.some((t) => !isObject(t) || Object.keys(t).some((k) => !allowed.has(k)))) {
    return { data: null, error: { message: 'Each task may only have title, task_type and minutes.', code: '22023' } };
  }

  const before = { channels: [...db.channels], tasks: [...db.tasks] };
  const rollback = () => {
    db.channels = before.channels;
    db.tasks = before.tasks;
  };

  const goal = insertChannel({
    user_id: db.user.id,
    channel_key: args.p_channel_key,
    title: args.p_title,
    goal_type: args.p_goal_type,
    preferences: args.p_preferences,
    criteria: args.p_criteria,
    start_date: args.p_start_date,
    target_date: args.p_target_date,
  });
  if (goal.error) {
    rollback();
    return { data: null, error: goal.error };
  }

  for (const [i, t] of (tasks as Array<Record<string, unknown>>).entries()) {
    const row: TaskRow = {
      id: newId(),
      user_id: db.user.id,
      goal_channel_id: goal.row.id,
      title: t.title as string,
      task_type: t.task_type as string,
      minutes: t.minutes as number,
      status: 'todo',
      fit: null,
      week_of: 1,
      due_date: null,
      carried_from_week: null,
      pulled_from_week: null,
      completed_at: null,
      source_provider: null,
      source_external_id: null,
      source_evidence: null,
      created_at: new Date(Date.UTC(2026, 9, 14, 0, 0, 0, i + 1)).toISOString(),
    };
    const violated =
      db.failTaskAt === i
        ? 'simulated_task_failure'
        : typeof row.title !== 'string' || typeof row.minutes !== 'number'
          ? 'micro_tasks_not_null'
          : taskViolation(row);
    if (violated) {
      rollback();
      return { data: null, error: { message: `new row violates check constraint "${violated}"`, code: '23514' } };
    }
    db.tasks.push(row);
  }
  return { data: goal.row, error: null };
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

// The fake client itself. createSupabaseServerClient is the signed-in user's client; createSupabaseAdminClient is the
// service-role one, which the real app makes synchronously. Tests that need it to see every user's rows switch
// row level security off with `db.rls = false`, so what they prove is that the service filters by user id itself.
export function fakeClient() {
  return {
    auth: {
      getUser: async () =>
        db.user
          ? { data: { user: db.user }, error: null }
          : { data: { user: null }, error: { message: 'Auth session missing' } },
    },
    from: (table: string) => {
      if (table !== 'micro_tasks' && table !== 'task_rebalance_history' && table !== 'goal_channels') {
        throw new Error(`unexpected table ${table}`);
      }
      return new Query(table);
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      db.rpcCalls.push({ fn, args });
      if (fn === 'create_goal_with_week_one_plan') return createGoalWithWeekOnePlan(args);
      if (fn !== 'apply_task_move') throw new Error(`unexpected function ${fn}`);
      return applyTaskMove(args as Parameters<typeof applyTaskMove>[0]);
    },
  };
}

export async function createSupabaseServerClient() {
  return fakeClient();
}

export const createSupabaseAdminClient = fakeClient;

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
    source_provider: null,
    source_external_id: null,
    source_evidence: null,
    created_at: '2026-10-14T00:00:00Z',
    ...over,
  };
}

export function channelRow(over: Partial<ChannelRow> = {}): ChannelRow {
  return {
    id: newId(),
    user_id: USER,
    channel_key: 'career_pivot',
    title: 'Career Pivot',
    status: 'active',
    is_default: false,
    start_date: '2026-10-14',
    target_date: null,
    criteria: [],
    goal_type: null,
    preferences: {},
    created_at: '2026-10-14T00:00:00Z',
    updated_at: '2026-10-14T00:00:00Z',
    ...over,
  };
}

export const taskById = (id: string): TaskRow => {
  const row = db.tasks.find((t) => t.id === id);
  if (!row) throw new Error(`no task ${id}`);
  return row;
};
