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
// - the CHECK, unique and composite foreign key constraints of entries, entry_corrections, sources and steps,
// - weekly_reviews (migration 018): select and insert only, one record per person and week, its CHECKs, and the trigger
//   that sets finished_at whatever an insert sends.
// - the week plan (migration 019): a pick is selected, inserted and deleted and never updated; a date's kind can also be
//   updated, but only its day_type_id (a column grant); a pick is once per item and date, a kind once per person and date,
//   and each points at the same person's own item or day type.
// - target_changes (migration 020): select and insert only, its CHECKs, the same-person target key, and the trigger that sets created_at
//   (the fake's clock, so a later save is always later) whatever an insert sends. No unique key: a second save is a second row.
// - starting_points (migration 017, read by the weekly review since MOM-113 block 3.4): select; an unanswered mark can be answered and an answered one
//   cannot, only answered_at and outcome can be updated, the outcome is kept or changed, and both are set together.
// ENFORCED_CONSTRAINTS, ENFORCED_REVIEW_CONSTRAINTS, ENFORCED_PLAN_CONSTRAINTS and ENFORCED_TARGET_CHANGE_CONSTRAINTS list every name it enforces;
// tests/fake-entries-model.test.ts checks each one exists in the SQL.

import { REVIEW_ADJUSTMENT_KINDS, REVIEW_ADJUSTMENT_OUTCOMES } from '@/types/database.types';

type Row = Record<string, unknown>;

export const ME = '11111111-1111-4111-8111-111111111111';
export const OTHER = '22222222-2222-4222-8222-222222222222';

export const newId = () => crypto.randomUUID();

type TableName =
  | 'person_settings'
  | 'person_priorities'
  | 'person_day_types'
  | 'goals'
  | 'targets'
  | 'work_items'
  | 'work_item_steps'
  | 'sources'
  | 'entries'
  | 'entry_corrections'
  | 'period_snapshots'
  | 'weekly_reviews'
  | 'week_plan_picks'
  | 'week_plan_day_types'
  | 'target_changes'
  | 'starting_points';

// What the authenticated role may do on each table (migration 013, section 7).
const GRANTS: Record<TableName, ReadonlySet<'select' | 'insert' | 'update' | 'delete'>> = {
  person_settings: new Set(['select']),
  person_priorities: new Set(['select', 'insert', 'update', 'delete']),
  person_day_types: new Set(['select', 'insert', 'update', 'delete']),
  goals: new Set(['select']),
  targets: new Set(['select']),
  // 013, section 7 (and supabase/verify/900_table_grants.sql): a person edits their own day types, items and steps (MOM-138).
  work_items: new Set(['select', 'insert', 'update', 'delete']),
  work_item_steps: new Set(['select', 'insert', 'update', 'delete']),
  sources: new Set(['select', 'insert', 'update', 'delete']),
  entries: new Set(['select', 'insert']),
  entry_corrections: new Set(['select', 'insert', 'update', 'delete']),
  period_snapshots: new Set(['select']),
  // 018: append-only. No update and no delete grant for the person.
  weekly_reviews: new Set(['select', 'insert']),
  // 019: a pick is added and removed, never edited. A date's kind can be updated, but only day_type_id (see run()).
  week_plan_picks: new Set(['select', 'insert', 'delete']),
  week_plan_day_types: new Set(['select', 'insert', 'update', 'delete']),
  // 020: append-only. No update and no delete grant for the person.
  target_changes: new Set(['select', 'insert']),
  // 017: a mark is selected and answered (answered_at and outcome only, see run()); setup writes it, through save_guided_setup.
  starting_points: new Set(['select', 'insert', 'update']),
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

// Migration 018's constraints the fake enforces; the names are checked against the SQL.
export const ENFORCED_REVIEW_CONSTRAINTS = [
  'weekly_reviews_week_is_seven_days',
  'weekly_reviews_recap_is_object',
  'weekly_reviews_adjustment_kind_check',
  'weekly_reviews_adjustment_is_object',
  'weekly_reviews_adjustment_outcome_check',
  'weekly_reviews_adjustment_together',
  'weekly_reviews_user_week_unique',
] as const;

// Migration 019's constraints the fake enforces; the names are checked against the SQL.
export const ENFORCED_PLAN_CONSTRAINTS = [
  'week_plan_picks_work_item_fk',
  'week_plan_picks_item_day_unique',
  'week_plan_day_types_day_type_fk',
  'week_plan_day_types_user_day_unique',
] as const;

// Migration 020's constraints the fake enforces; the names are checked against the SQL.
export const ENFORCED_TARGET_CHANGE_CONSTRAINTS = [
  'target_changes_floor_positive',
  'target_changes_aspiration_above_floor',
  'target_changes_slots_valid',
  'target_changes_target_fk',
] as const;

// Migration 013's constraints the forecast edits depend on (MOM-138) and the fake enforces; the names are checked against the SQL.
export const ENFORCED_FORECAST_EDIT_CONSTRAINTS = [
  'work_items_title_not_blank',
  'work_items_due_date_matches_kind',
  'work_items_date_can_move_matches_kind',
  'work_items_estimate_check',
  'work_item_steps_title_not_blank',
  'work_item_steps_item_fk',
  'person_day_types_name_not_blank',
  'person_day_types_capacity_unit_check',
  'person_day_types_capacity_amount_check',
  'person_day_types_capacity_both_or_neither',
] as const;

// Migration 017's constraints and policy the fake enforces; the names are checked against the SQL.
export const ENFORCED_STARTING_POINT_CONSTRAINTS = ['starting_points_outcome_check', 'starting_points_answered_together', 'starting_points_update_own'] as const;

export const gm = {
  tables: {
    person_settings: [] as Row[],
    person_priorities: [] as Row[],
    person_day_types: [] as Row[],
    goals: [] as Row[],
    targets: [] as Row[],
    work_items: [] as Row[],
    work_item_steps: [] as Row[],
    sources: [] as Row[],
    entries: [] as Row[],
    entry_corrections: [] as Row[],
    period_snapshots: [] as Row[],
    weekly_reviews: [] as Row[],
    week_plan_picks: [] as Row[],
    week_plan_day_types: [] as Row[],
    target_changes: [] as Row[],
    starting_points: [] as Row[],
  } satisfies Record<TableName, Row[]>,
  user: null as { id: string } | null,
  rls: true,
  // Every write that reached a table, in order: { table, op }.
  writes: [] as Array<{ table: TableName; op: 'insert' | 'update' | 'delete' }>,
  // When set, the next write to this table (any op) fails with this message, like a database error that quotes the row.
  failNextWrite: null as { table: TableName; message: string } | null,
  // When set, the next read of this table fails, like a database that cannot be reached.
  failNextRead: null as { table: TableName; message: string } | null,
  // Runs just before every write reaches a table, so a test can change a row between a service's read and its write (a race).
  beforeWrite: null as ((table: TableName, op: 'insert' | 'update' | 'delete') => void) | null,
  clock: 0,
  // The database's own time (an ISO instant), which weekly_reviews.finished_at takes whatever an insert sends. Null: the fake's clock.
  dbNow: null as string | null,
};

export function resetGoalModel(user: { id: string } | null = null): void {
  for (const name of Object.keys(gm.tables) as TableName[]) gm.tables[name] = [];
  gm.user = user;
  gm.rls = true;
  gm.writes = [];
  gm.failNextWrite = null;
  gm.failNextRead = null;
  gm.beforeWrite = null;
  gm.clock = 0;
  gm.dbNow = null;
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
  // Before every date the tests log on, so nothing is "before the start" unless a test moves it.
  start_date: '2026-10-01',
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

// `dayEnd` is the column's own text ("22:00:00"); null is a person who has not set one. An evening day end leaves the
// day boundary at midnight; "02:00:00" moves it to 02:00.
export const settingsRow = (userId: string, timeZone: string | null, dayEnd: string | null = '22:00:00'): Row => ({
  user_id: userId,
  time_zone: timeZone,
  day_end: dayEnd,
});

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
    if (isBlank(row.title)) return { code: '23514', name: 'work_item_steps_title_not_blank' };
    if ((row.completed_at === null) !== (row.completed_via === null)) {
      return { code: '23514', name: 'work_item_steps_completed_together' };
    }
  }
  if (table === 'work_items') {
    const deadline = row.kind === 'deadline_task';
    if (isBlank(row.title)) return { code: '23514', name: 'work_items_title_not_blank' };
    if (deadline !== ((row.due_date ?? null) !== null)) return { code: '23514', name: 'work_items_due_date_matches_kind' };
    if (deadline !== ((row.date_can_move ?? null) !== null)) return { code: '23514', name: 'work_items_date_can_move_matches_kind' };
    const estimate = row.estimate_minutes ?? null;
    if (estimate !== null && !(deadline && typeof estimate === 'number' && estimate > 0)) return { code: '23514', name: 'work_items_estimate_check' };
  }
  if (table === 'person_day_types') {
    const unit = row.capacity_unit ?? null;
    const amount = row.capacity_amount ?? null;
    if (isBlank(row.name)) return { code: '23514', name: 'person_day_types_name_not_blank' };
    if (unit !== null && unit !== 'hours' && unit !== 'sessions') return { code: '23514', name: 'person_day_types_capacity_unit_check' };
    if (amount !== null && !(typeof amount === 'number' && amount >= 0)) return { code: '23514', name: 'person_day_types_capacity_amount_check' };
    if ((unit === null) !== (amount === null)) return { code: '23514', name: 'person_day_types_capacity_both_or_neither' };
  }
  if (table === 'weekly_reviews') {
    const start = Date.parse(`${String(row.week_start)}T00:00:00Z`);
    if (!(new Date(start + 6 * 86_400_000).toISOString().slice(0, 10) === row.week_end)) {
      return { code: '23514', name: 'weekly_reviews_week_is_seven_days' };
    }
    if (!isObject(row.recap)) return { code: '23514', name: 'weekly_reviews_recap_is_object' };
    if (row.adjustment_kind !== null && !(REVIEW_ADJUSTMENT_KINDS as readonly unknown[]).includes(row.adjustment_kind)) {
      return { code: '23514', name: 'weekly_reviews_adjustment_kind_check' };
    }
    if (row.adjustment !== null && !isObject(row.adjustment)) return { code: '23514', name: 'weekly_reviews_adjustment_is_object' };
    if (row.adjustment_outcome !== null && !(REVIEW_ADJUSTMENT_OUTCOMES as readonly unknown[]).includes(row.adjustment_outcome)) {
      return { code: '23514', name: 'weekly_reviews_adjustment_outcome_check' };
    }
    const none = [row.adjustment_kind === null, row.adjustment === null, row.adjustment_outcome === null];
    if (!(none.every(Boolean) || none.every((n) => !n))) return { code: '23514', name: 'weekly_reviews_adjustment_together' };
  }
  if (table === 'starting_points') {
    if (row.outcome !== null && row.outcome !== undefined && row.outcome !== 'kept' && row.outcome !== 'changed') {
      return { code: '23514', name: 'starting_points_outcome_check' };
    }
    if (((row.answered_at ?? null) === null) !== ((row.outcome ?? null) === null)) return { code: '23514', name: 'starting_points_answered_together' };
  }
  if (table === 'target_changes') {
    if (typeof row.floor !== 'number' || !(row.floor > 0)) return { code: '23514', name: 'target_changes_floor_positive' };
    if (row.aspiration !== null && row.aspiration !== undefined && (typeof row.aspiration !== 'number' || row.aspiration < row.floor)) {
      return { code: '23514', name: 'target_changes_aspiration_above_floor' };
    }
    const days = row.slot_weekdays;
    if (days !== null && days !== undefined) {
      const ok = Array.isArray(days) && days.length >= 1 && days.length <= 7 && days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7);
      if (!ok) return { code: '23514', name: 'target_changes_slots_valid' };
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
  if (table === 'weekly_reviews' && clash((r) => r.user_id === row.user_id && r.week_start === row.week_start)) {
    return { code: '23505', name: 'weekly_reviews_user_week_unique' };
  }
  if (table === 'week_plan_picks' && clash((r) => r.work_item_id === row.work_item_id && r.plan_date === row.plan_date)) {
    return { code: '23505', name: 'week_plan_picks_item_day_unique' };
  }
  if (table === 'week_plan_day_types' && clash((r) => r.user_id === row.user_id && r.plan_date === row.plan_date)) {
    return { code: '23505', name: 'week_plan_day_types_user_day_unique' };
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
  if (table === 'work_item_steps' && !owned('work_items', row.work_item_id, row.user_id)) {
    return { code: '23503', name: 'work_item_steps_item_fk' };
  }
  if (table === 'target_changes' && !owned('targets', row.target_id, row.user_id)) {
    return { code: '23503', name: 'target_changes_target_fk' };
  }
  if (table === 'week_plan_picks' && !owned('work_items', row.work_item_id, row.user_id)) {
    return { code: '23503', name: 'week_plan_picks_work_item_fk' };
  }
  if (table === 'week_plan_day_types' && !owned('person_day_types', row.day_type_id, row.user_id)) {
    return { code: '23503', name: 'week_plan_day_types_day_type_fk' };
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
  is(column: string, value: null) {
    this.filters.push((r) => (r[column] ?? null) === value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((r) => values.includes(r[column]));
    return this;
  }
  // ISO dates and instants compare as text, which is how the database orders them.
  gte(column: string, value: string) {
    this.filters.push((r) => (r[column] as string) >= value);
    return this;
  }
  lte(column: string, value: string) {
    this.filters.push((r) => (r[column] as string) <= value);
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

    gm.beforeWrite?.(this.table, this.op);

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
        if (this.table === 'weekly_reviews') {
          row.adjustment_kind ??= null;
          row.adjustment ??= null;
          row.adjustment_outcome ??= null;
          // The BEFORE INSERT trigger: the database's time, whatever the insert sent.
          row.finished_at = gm.dbNow ?? stamp();
        }
        if (this.table === 'target_changes') {
          row.aspiration ??= null;
          row.slot_weekdays ??= null;
          // The BEFORE INSERT trigger: the database's own time, whatever the insert sent.
          row.created_at = stamp();
        }
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

    let rows = this.matched();
    if (this.op === 'update') {
      // 017: UPDATE is granted for answered_at and outcome alone, and the policy only lets an unanswered mark be answered.
      if (this.table === 'starting_points') {
        if (Object.keys(this.payload as Row).some((column) => column !== 'answered_at' && column !== 'outcome')) {
          return failure('42501', 'permission denied for table starting_points');
        }
        if (gm.rls) rows = rows.filter((r) => (r.answered_at ?? null) === null);
      }
      // 019: UPDATE on a day kind is granted for day_type_id alone, so a statement that sets any other column is refused.
      if (this.table === 'week_plan_day_types' && Object.keys(this.payload as Row).some((column) => column !== 'day_type_id')) {
        return failure('42501', 'permission denied for table week_plan_day_types');
      }
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
