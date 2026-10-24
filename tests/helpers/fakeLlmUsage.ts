// In-memory stand-in for the llm_usage_logs table and reserve_llm_call() from supabase/migrations/011_llm_usage_logs.sql
// (MOM-73). Tests swap it in for the service-role client with vi.mock('@/lib/supabase/admin', ...), and the signed-in
// client reads the table through usageQuery().
//
// It mirrors the database rules the service relies on, rule for rule, so a call Postgres would refuse is refused here:
// - reserve_llm_call: arguments checked; then, in this order, the user's cap over a rolling 24 hours (reason
//   user_daily), the shared cap (overall_daily), then the spacing between the user's calls (too_soon); a refusal
//   writes nothing; an allowed call inserts a 'pending' row;
// - retry_after_seconds: when the (count - cap + 1)th oldest call leaves the window, or when the spacing ends, rounded
//   up and never less than 1;
// - the finishing update: only a pending row can change, only its result (never user, feature, model or time), and it
//   must be given an outcome; the CHECK constraints on tokens, latency and outcome;
// - privileges: the signed-in client can read its own rows and nothing else; only the service role writes.
// The clock is the database's, kept here as `usage.nowMs`, so a test can move time without sleeping.
// tests/migrations.test.ts keeps this file honest by checking each rule exists in the SQL.

import { LLM_FEATURES, LLM_OUTCOMES } from '@/types/database.types';

export interface UsageRow {
  id: string;
  user_id: string;
  feature: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  outcome: string;
  created_at: string;
}

interface DbError {
  message: string;
  code?: string;
}

export const WINDOW_MS = 24 * 60 * 60 * 1000;

interface UsageState {
  rows: UsageRow[];
  nowMs: number;
  reserveCalls: Array<Record<string, unknown>>;
  updates: Array<Record<string, unknown>>;
  failReserveWith: string | null;
  failUpdateWith: string | null;
  reserveAnswer: unknown;
  noAdminClient: boolean;
  nextId: number;
}

// Kept on globalThis, not in the module, so that several copies of the service loaded in turn (vi.resetModules(), to
// stand in for separate serverless instances) all talk to the one database, as real instances do.
const holder = globalThis as unknown as { __fakeLlmUsage?: UsageState };

export const usage: UsageState = (holder.__fakeLlmUsage ??= {
  rows: [] as UsageRow[],
  // The database's clock.
  nowMs: Date.parse('2026-11-04T12:00:00Z'),
  // Every reserve_llm_call made, with its arguments.
  reserveCalls: [] as Array<Record<string, unknown>>,
  // Every finishing update, with its patch.
  updates: [] as Array<Record<string, unknown>>,
  // Knobs: make the next reserve or update fail like a database error, or answer in an unexpected shape.
  failReserveWith: null as string | null,
  failUpdateWith: null as string | null,
  reserveAnswer: undefined as unknown,
  // Set to true to make createSupabaseAdminClient throw, as when the service-role key is missing.
  noAdminClient: false,
  nextId: 0,
});

const newRowId = () => `00000000-0000-4000-9000-${String(++usage.nextId).padStart(12, '0')}`;

export function resetUsage(nowMs = Date.parse('2026-11-04T12:00:00Z')): void {
  usage.rows = [];
  usage.nowMs = nowMs;
  usage.reserveCalls = [];
  usage.updates = [];
  usage.failReserveWith = null;
  usage.failUpdateWith = null;
  usage.reserveAnswer = undefined;
  usage.noAdminClient = false;
}

// A finished row in the past, for tests that need a user or the whole table to be near a cap.
export function seedUsage(userId: string, agoMs: number, over: Partial<UsageRow> = {}): UsageRow {
  const row: UsageRow = {
    id: newRowId(),
    user_id: userId,
    feature: 'rebalance',
    model: 'claude-opus-5-5',
    input_tokens: 1000,
    output_tokens: 200,
    latency_ms: 5000,
    outcome: 'ok',
    created_at: new Date(usage.nowMs - agoMs).toISOString(),
    ...over,
  };
  usage.rows.push(row);
  return row;
}

export const rowsFor = (userId: string) => usage.rows.filter((r) => r.user_id === userId);

// ---------------------------------------------------------------------------
// reserve_llm_call
// ---------------------------------------------------------------------------

function reserve(args: Record<string, unknown>): { data: unknown; error: DbError | null } {
  usage.reserveCalls.push(args);
  if (usage.failReserveWith) {
    const message = usage.failReserveWith;
    usage.failReserveWith = null;
    return { data: null, error: { message, code: 'XX000' } };
  }
  if (usage.reserveAnswer !== undefined) {
    const answer = usage.reserveAnswer;
    usage.reserveAnswer = undefined;
    return { data: answer, error: null };
  }

  const userId = args.p_user_id as string | null;
  const interval = args.p_min_interval_seconds as number | null;
  const userCap = args.p_user_daily_cap as number | null;
  const overallCap = args.p_overall_daily_cap as number | null;
  const positive = (n: number | null) => typeof n === 'number' && Number.isInteger(n) && n >= 1;
  if (!userId || !positive(interval) || !positive(userCap) || !positive(overallCap)) {
    return { data: null, error: { message: 'A user and positive limits are required.', code: '22023' } };
  }

  const now = usage.nowMs;
  const created = (r: UsageRow) => Date.parse(r.created_at);
  const inWindow = (r: UsageRow) => created(r) > now - WINDOW_MS;
  const secondsUntil = (ms: number) => Math.max(1, Math.ceil((ms - now) / 1000));

  const mine = usage.rows.filter((r) => r.user_id === userId && inWindow(r)).sort((a, b) => created(a) - created(b));
  if (mine.length >= (userCap as number)) {
    const frees = mine[mine.length - (userCap as number)];
    return { data: { allowed: false, reason: 'user_daily', retry_after_seconds: secondsUntil(created(frees) + WINDOW_MS) }, error: null };
  }

  const everyone = usage.rows.filter(inWindow).sort((a, b) => created(a) - created(b));
  if (everyone.length >= (overallCap as number)) {
    const frees = everyone[everyone.length - (overallCap as number)];
    return { data: { allowed: false, reason: 'overall_daily', retry_after_seconds: secondsUntil(created(frees) + WINDOW_MS) }, error: null };
  }

  const last = usage.rows.filter((r) => r.user_id === userId).reduce((max, r) => Math.max(max, created(r)), -Infinity);
  if (last > now - (interval as number) * 1000) {
    return { data: { allowed: false, reason: 'too_soon', retry_after_seconds: secondsUntil(last + (interval as number) * 1000) }, error: null };
  }

  const feature = args.p_feature as string;
  const model = args.p_model as string;
  if (!(LLM_FEATURES as readonly string[]).includes(feature)) {
    return { data: null, error: { message: 'new row violates check constraint "llm_usage_logs_feature_check"', code: '23514' } };
  }
  if (typeof model !== 'string' || model.length < 1 || model.length > 100) {
    return { data: null, error: { message: 'new row violates check constraint "llm_usage_logs_model_check"', code: '23514' } };
  }
  const row: UsageRow = {
    id: newRowId(),
    user_id: userId,
    feature,
    model,
    input_tokens: null,
    output_tokens: null,
    latency_ms: null,
    outcome: 'pending',
    created_at: new Date(now).toISOString(),
  };
  usage.rows.push(row);
  return { data: { allowed: true, log_id: row.id }, error: null };
}

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

const FINISH_KEYS = new Set(['outcome', 'input_tokens', 'output_tokens', 'latency_ms']);

// What a finishing update must satisfy: the guard trigger and the CHECK constraints.
function finishViolation(row: UsageRow, patch: Record<string, unknown>): DbError | null {
  const guard = (message: string): DbError => ({ message, code: '23514' });
  if (row.outcome !== 'pending') return guard('A finished usage row cannot change.');
  if (Object.keys(patch).some((k) => !FINISH_KEYS.has(k))) return guard('Only the result of a call can be recorded on a usage row.');
  const next = { ...row, ...patch } as UsageRow;
  if (next.outcome === 'pending') return guard('Record how the call ended.');
  if (!(LLM_OUTCOMES as readonly string[]).includes(next.outcome)) return guard('new row violates check constraint "llm_usage_logs_outcome_check"');
  if ((next.input_tokens === null) !== (next.output_tokens === null)) return guard('new row violates check constraint "llm_usage_logs_tokens_check"');
  if (next.input_tokens !== null && (next.input_tokens < 0 || (next.output_tokens ?? 0) < 0)) {
    return guard('new row violates check constraint "llm_usage_logs_tokens_check"');
  }
  if (next.latency_ms === null || next.latency_ms < 0) return guard('new row violates check constraint "llm_usage_logs_finished_check"');
  return null;
}

class UsageQuery {
  private op: 'select' | 'update' = 'select';
  private patch: Record<string, unknown> = {};
  private filters: Array<(r: UsageRow) => boolean> = [];
  private ordering: { col: keyof UsageRow; ascending: boolean } | null = null;
  private max: number | undefined;

  // `visibleTo`: a user id for the signed-in client (their rows only), 'all' for the service role, null for no session.
  constructor(
    private readonly visibleTo: string | 'all' | null,
    private readonly canWrite: boolean,
  ) {}

  select(_cols?: string) {
    return this;
  }
  update(patch: Record<string, unknown>) {
    this.op = 'update';
    this.patch = patch;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => (r as unknown as Record<string, unknown>)[col] === val);
    return this;
  }
  order(col: string, opts: { ascending?: boolean } = {}) {
    this.ordering = { col: col as keyof UsageRow, ascending: opts.ascending ?? true };
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }

  private run(): { data: UsageRow[]; error: DbError | null } {
    const visible = usage.rows.filter((r) => this.visibleTo === 'all' || (this.visibleTo !== null && r.user_id === this.visibleTo));
    const matched = visible.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === 'select') {
      if (this.visibleTo === null) return { data: [], error: { message: 'permission denied for table llm_usage_logs', code: '42501' } };
      const out = [...matched];
      if (this.ordering) {
        const { col, ascending } = this.ordering;
        out.sort((a, b) => (a[col]! < b[col]! ? -1 : a[col]! > b[col]! ? 1 : 0) * (ascending ? 1 : -1));
      }
      return { data: (this.max === undefined ? out : out.slice(0, this.max)).map((r) => ({ ...r })), error: null };
    }
    usage.updates.push(this.patch);
    if (!this.canWrite) return { data: [], error: { message: 'permission denied for table llm_usage_logs', code: '42501' } };
    if (usage.failUpdateWith) {
      const message = usage.failUpdateWith;
      usage.failUpdateWith = null;
      return { data: [], error: { message, code: 'XX000' } };
    }
    for (const row of matched) {
      const violated = finishViolation(row, this.patch);
      if (violated) return { data: [], error: violated };
    }
    for (const row of matched) Object.assign(row, this.patch);
    return { data: [], error: null };
  }

  then<T>(resolve: (v: { data: UsageRow[]; error: DbError | null }) => T, reject?: (e: unknown) => T) {
    return Promise.resolve(this.run()).then(resolve, reject);
  }
}

// The table as a signed-in user (or the service role, with 'all' and canWrite) sees it.
export function usageQuery(visibleTo: string | 'all' | null, canWrite = false) {
  return new UsageQuery(visibleTo, canWrite);
}

// The service-role client: it reads every row, writes, and is the only one that can call reserve_llm_call.
export function createSupabaseAdminClient() {
  if (usage.noAdminClient) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn !== 'reserve_llm_call') throw new Error(`unexpected function ${fn}`);
      return reserve(args);
    },
    from: (table: string) => {
      if (table !== 'llm_usage_logs') throw new Error(`unexpected table ${table}`);
      return usageQuery('all', true);
    },
  };
}
