// An in-memory stand-in for the signed-in Supabase client, as guided setup's saves use it (MOM-111, MOM-132): the session, a count
// of the person's goals, and the functions of migrations 015 to 021 written in TypeScript: save_guided_setup() (the deployed one is
// 021's), add_goals_after_setup() and add_targets_after_setup(), all three sharing one writer of a goal's targets, bindings, items
// and steps, as write_setup_targets() does in SQL. Like tests/helpers/fakeLlmUsage.ts for reserve_llm_call(), it follows the SQL
// statement by statement, and a test in tests/setup-service.test.ts reads those migrations and fails when the keys the SQL reads
// and the keys the app sends differ, so the two cannot drift apart unseen. What the real functions do inside the database
// (constraints, row level security, the rollback, the lock) is covered by supabase/verify/015_save_guided_setup.sql,
// 017_starting_points.sql and 021_add_after_setup.sql.
//
// The one property modelled here is the one the service depends on: each function is ONE transaction. It works on a copy of the
// tables and replaces them only when it reaches the end, so an error part-way leaves the tables as they were.

import { STARTING_POINT_FIELDS, type StartingPointKind } from '@/types/database.types';

type Row = Record<string, unknown> & { id: string; user_id: string };
const TABLES = [
  'person_settings',
  'person_day_types',
  'person_priorities',
  'goals',
  'targets',
  'work_items',
  'work_item_steps',
  'sources',
  'target_sources',
  'starting_points',
  'setup_additions',
] as const;
type TableName = (typeof TABLES)[number];
type Tables = Record<TableName, Row[]>;

const emptyTables = (): Tables => Object.fromEntries(TABLES.map((t) => [t, [] as Row[]])) as unknown as Tables;

export const fakeSave = {
  user: null as { id: string } | null,
  tables: emptyTables(),
  rpcCalls: [] as { fn: string; args: Record<string, unknown> }[],
  // Make the function fail with this SQLSTATE after this many row writes (to prove nothing of a failed save is kept).
  failAfterWrites: null as number | null,
  failCode: '23514',
  // The answer to a goals read that is not a plain empty/non-empty check.
  goalsReadError: false,
};

export function resetFakeSave(user: { id: string } | null = null): void {
  fakeSave.user = user;
  fakeSave.tables = emptyTables();
  fakeSave.rpcCalls = [];
  fakeSave.failAfterWrites = null;
  fakeSave.failCode = '23514';
  fakeSave.goalsReadError = false;
}

export const rowsOf = (table: TableName, userId?: string): Row[] =>
  fakeSave.tables[table].filter((r) => userId === undefined || r.user_id === userId);

export function seedRow(table: TableName, row: Record<string, unknown> & { user_id: string }): Row {
  const full = { id: crypto.randomUUID(), ...row } as Row;
  fakeSave.tables[table].push(full);
  return full;
}

class DbError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

type Json = Record<string, unknown>;
type Answer = { data: unknown; error: null } | { data: null; error: { code: string } };
const asArray = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : []);
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sameText = (a: unknown, b: unknown) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

// One transaction: a copy of the tables that replaces the real ones only on commit.
function begin(uid: string) {
  const working = structuredClone(fakeSave.tables);
  let writes = 0;
  const write = (table: TableName, row: Record<string, unknown>): Row => {
    writes += 1;
    if (fakeSave.failAfterWrites !== null && writes > fakeSave.failAfterWrites) throw new DbError(fakeSave.failCode);
    const full = { id: crypto.randomUUID(), user_id: uid, ...row } as Row;
    working[table].push(full);
    return full;
  };
  // 017: one starting_points row for each saved column named in `subject.starting_points`. The CHECK (only the fields setup
  // can record, for the kind) and the unique index (one mark per saved value) are enforced as the database does.
  const mark = (subject: Json, kind: StartingPointKind, ids: Record<string, string>): void => {
    const list = subject.starting_points;
    if (list === undefined) return;
    if (!Array.isArray(list)) throw new DbError('22023');
    const subjectId = Object.values(ids)[0] ?? uid;
    for (const field of list) {
      if (!(STARTING_POINT_FIELDS[kind] as readonly unknown[]).includes(field)) throw new DbError('23514');
      const taken = working.starting_points.some(
        (r) => r.subject_kind === kind && r.field === field && (r.day_type_id ?? r.goal_id ?? r.target_id ?? r.work_item_id ?? uid) === subjectId,
      );
      if (taken) throw new DbError('23505');
      write('starting_points', { subject_kind: kind, day_type_id: null, goal_id: null, target_id: null, work_item_id: null, ...ids, field, answered_at: null, outcome: null });
    }
  };
  return { working, write, mark, commit: () => (fakeSave.tables = working) };
}

type Tx = ReturnType<typeof begin>;
const nextPlace = (rows: Row[]): number => rows.reduce((top, r) => (typeof r.sort_order === 'number' ? Math.max(top, r.sort_order) : top), -1) + 1;

// write_setup_targets() (migration 021): a goal's targets, their bindings, then its work items and steps. `targetStart` is null for a
// target made with its goal (it counts from the goal's start) and the person's own date for one added later; `firstPlace` is the
// place of the first target in the list.
function writeTargets(tx: Tx, uid: string, goalId: string, targets: Json[], items: Json[], targetStart: string | null, firstPlace: number) {
  const { working, write, mark } = tx;
  if (!working.goals.some((g) => g.id === goalId && g.user_id === uid)) throw new DbError('MS004');
  const counts = { targets: 0, work_items: 0, steps: 0, bindings: 0 };
  const targetIds = new Map<string, string>();
  targets.forEach((t, index) => {
    // targets_start_before_due (migration 021)
    if (targetStart !== null && t.due_date != null && targetStart > String(t.due_date)) throw new DbError('23514');
    const target = write('targets', {
      goal_id: goalId,
      title: t.title,
      measure: t.measure,
      unit: t.unit ?? null,
      role: t.role,
      period_kind: t.period_kind,
      due_date: t.due_date ?? null,
      slot_weekdays: t.slot_weekdays ?? null,
      floor: t.floor ?? null,
      aspiration: t.aspiration ?? null,
      qualifying_threshold: t.qualifying_threshold ?? null,
      carry_over_kind: t.carry_over_kind,
      completion_mode: t.completion_mode ?? null,
      tone: t.tone ?? null,
      start_date: targetStart,
      sort_order: firstPlace + index,
    });
    counts.targets += 1;
    targetIds.set(String(t.key), target.id);
    mark(t, 'target', { target_id: target.id });
    for (const s of asArray(t.sources)) {
      let sourceId: string;
      if (s.kind === 'manual') {
        sourceId =
          working.sources.find((r) => r.user_id === uid && r.kind === 'manual')?.id ?? write('sources', { kind: 'manual', provider: null, label: 'Manual' }).id;
      } else if (s.kind === 'synced') {
        sourceId =
          working.sources.find((r) => r.user_id === uid && r.provider === s.provider)?.id ??
          write('sources', { kind: 'synced', provider: s.provider, label: s.label || s.provider }).id;
      } else {
        throw new DbError('22023');
      }
      if (!working.target_sources.some((r) => r.target_id === target.id && r.source_id === sourceId)) {
        write('target_sources', { target_id: target.id, source_id: sourceId });
      }
      counts.bindings += 1;
    }
  });
  for (const i of items) {
    let targetId: string | null = null;
    if (i.target_key != null) {
      const found = targetIds.get(String(i.target_key));
      if (!found) throw new DbError('22023');
      targetId = found;
    }
    const item = write('work_items', {
      goal_id: goalId,
      target_id: targetId,
      kind: i.kind,
      title: i.title,
      sort_order: i.sort_order ?? 0,
      due_date: i.due_date ?? null,
      date_can_move: i.date_can_move ?? null,
      estimate_minutes: i.estimate_minutes ?? null,
    });
    counts.work_items += 1;
    mark(i, 'work_item', { work_item_id: item.id });
    for (const s of asArray(i.steps)) {
      write('work_item_steps', { work_item_id: item.id, title: s.title, sort_order: s.sort_order ?? 0 });
      counts.steps += 1;
    }
  }
  return counts;
}

// A goal row as save_guided_setup() and add_goals_after_setup() write it; `place` is its sort_order.
function writeGoal(tx: Tx, g: Json, place: number): Row {
  // goals_shape_start_required (migration 014)
  if (g.state !== 'parked' && (g.shape == null || g.start_date == null)) throw new DbError('23514');
  const goal = tx.write('goals', {
    title: g.title,
    why: g.why ?? null,
    start_date: g.start_date ?? null,
    shape: g.shape ?? null,
    end_date: g.end_date ?? null,
    block_weeks: g.block_weeks ?? null,
    state: g.state,
    return_kind: g.return_kind ?? null,
    return_date: g.return_date ?? null,
    return_note: g.return_note ?? null,
    completion_mode: g.completion_mode ?? null,
    tone: g.tone ?? null,
    sort_order: place,
  });
  tx.mark(g, 'goal', { goal_id: goal.id });
  return goal;
}

type Counts = { targets: number; work_items: number; steps: number; bindings: number };
const add = (a: Counts, b: Counts): Counts => ({ targets: a.targets + b.targets, work_items: a.work_items + b.work_items, steps: a.steps + b.steps, bindings: a.bindings + b.bindings });
const none: Counts = { targets: 0, work_items: 0, steps: 0, bindings: 0 };

const answered = (run: () => unknown): Answer => {
  try {
    return { data: run(), error: null };
  } catch (e) {
    if (e instanceof DbError) return { data: null, error: { code: e.code } };
    throw e;
  }
};

function saveGuidedSetup(payload: unknown): Answer {
  const uid = fakeSave.user?.id;
  if (!uid) return { data: null, error: { code: '42501' } };
  return answered(() => {
    const tx = begin(uid);
    const { working, write, mark } = tx;
    const p = payload as Json;
    if (!isObject(p)) throw new DbError('22023');
    const extra = Object.keys(p).filter((k) => !['person', 'day_types', 'priorities', 'goals'].includes(k));
    if (extra.length > 0) throw new DbError('22023');
    const goals = asArray(p.goals);
    if (goals.length < 1 || goals.length > 12) throw new DbError('22023');
    // First setup only.
    if (fakeSave.tables.goals.some((g) => g.user_id === uid)) throw new DbError('MS001');

    // 1. person_settings (an upsert: one row per person)
    const person = p.person as Json;
    working.person_settings = working.person_settings.filter((r) => r.user_id !== uid);
    write('person_settings', {
      time_zone: person.time_zone ?? null,
      week_start: person.week_start ?? null,
      day_end: person.day_end ?? null,
      tone: person.tone ?? null,
      reminders: person.reminders ?? null,
      check_ins: person.check_ins ?? null,
      celebrations: person.celebrations ?? null,
      balance_mentions: person.balance_mentions ?? null,
      review_depth: person.review_depth ?? null,
      review_planning: person.review_planning ?? null,
      quiet_times: Array.isArray(person.quiet_times) ? person.quiet_times : null,
      planning_weekday: person.planning_weekday ?? null,
      planning_time: person.planning_time ?? null,
    });
    // 017: the person's own facts that came from an accepted suggestion
    mark(person, 'person', {});
    // 2. day types (one at a time since 017, to mark each), 3. priorities
    for (const d of asArray(p.day_types)) {
      const dayType = write('person_day_types', { name: d.name, capacity_unit: d.capacity_unit ?? null, capacity_amount: d.capacity_amount ?? null });
      mark(d, 'day_type', { day_type_id: dayType.id });
    }
    for (const pr of asArray(p.priorities)) write('person_priorities', { label: pr.label, sort_order: pr.sort_order });

    // 4. goals in the order given (021), each with its targets, bindings, work items and steps
    let counts = none;
    goals.forEach((g, index) => {
      const goal = writeGoal(tx, g, index);
      counts = add(counts, writeTargets(tx, uid, goal.id, asArray(g.targets), asArray(g.items), null, 0));
    });

    tx.commit();
    return { goals: goals.length, ...counts };
  });
}

// The first thing both add functions do: the person, the payload's shape, the submission id, and a repeat of the same approval,
// which gives the first answer back and writes nothing.
function beginAddition(payload: unknown, allowed: string[]): { uid: string; submission: string; p: Json; replay?: Json } {
  const uid = fakeSave.user?.id;
  if (!uid) throw new DbError('42501');
  if (!isObject(payload)) throw new DbError('22023');
  if (Object.keys(payload).some((k) => !allowed.includes(k))) throw new DbError('22023');
  const submission = payload.submission_id;
  if (typeof submission !== 'string' || !UUID.test(submission)) throw new DbError('22023');
  const prior = fakeSave.tables.setup_additions.find((r) => r.user_id === uid && r.id === submission);
  return { uid, submission, p: payload, replay: prior ? { ...(prior.result as Json), replayed: true } : undefined };
}

function addGoalsAfterSetup(payload: unknown): Answer {
  return answered(() => {
    const { uid, submission, p, replay } = beginAddition(payload, ['submission_id', 'goals']);
    const goals = asArray(p.goals);
    if (!Array.isArray(p.goals) || goals.length < 1 || goals.length > 12) throw new DbError('22023');
    if (replay) return replay;
    if (!fakeSave.tables.goals.some((g) => g.user_id === uid)) throw new DbError('MS003');

    const tx = begin(uid);
    const base = nextPlace(tx.working.goals.filter((g) => g.user_id === uid));
    let counts = none;
    goals.forEach((g, index) => {
      // The same title and start, case and spacing aside, is a goal already saved.
      const dup = tx.working.goals.some((r) => r.user_id === uid && sameText(r.title, g.title) && (r.start_date ?? null) === (g.start_date ?? null));
      if (dup) throw new DbError('MS002');
      const goal = writeGoal(tx, g, base + index);
      // A target made with its goal counts from its goal's start: no start of its own.
      counts = add(counts, writeTargets(tx, uid, goal.id, asArray(g.targets), asArray(g.items), null, 0));
    });
    const result = { goals: goals.length, ...counts };
    tx.write('setup_additions', { id: submission, kind: 'goals', result });
    tx.commit();
    return result;
  });
}

function addTargetsAfterSetup(payload: unknown): Answer {
  return answered(() => {
    const { uid, submission, p, replay } = beginAddition(payload, ['submission_id', 'goal_id', 'start_date', 'targets', 'items']);
    const targets = asArray(p.targets);
    const start = p.start_date;
    if (typeof p.goal_id !== 'string' || !UUID.test(p.goal_id) || typeof start !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new DbError('22023');
    if (!Array.isArray(p.targets) || targets.length < 1 || targets.length > 12) throw new DbError('22023');
    if (p.items !== undefined && !Array.isArray(p.items)) throw new DbError('22023');
    if (replay) return replay;
    if (!fakeSave.tables.goals.some((g) => g.user_id === uid)) throw new DbError('MS003');

    const goal = fakeSave.tables.goals.find((g) => g.id === p.goal_id && g.user_id === uid);
    if (!goal || goal.state !== 'active' || goal.start_date == null) throw new DbError('MS004');
    if (start < String(goal.start_date) || (goal.end_date != null && start > String(goal.end_date))) throw new DbError('MS005');
    for (const t of targets) {
      const dup = fakeSave.tables.targets.some(
        (r) => r.user_id === uid && r.goal_id === goal.id && sameText(r.title, t.title) && (r.start_date ?? goal.start_date) === start,
      );
      if (dup) throw new DbError('MS002');
    }

    const tx = begin(uid);
    const base = nextPlace(tx.working.targets.filter((r) => r.user_id === uid && r.goal_id === goal.id));
    const counts = writeTargets(tx, uid, goal.id, targets, asArray(p.items), start, base);
    const result = { goals: 0, ...counts };
    tx.write('setup_additions', { id: submission, kind: 'targets', result });
    tx.commit();
    return result;
  });
}

function fakeClient() {
  return {
    auth: {
      getUser: async () => (fakeSave.user ? { data: { user: { id: fakeSave.user.id } }, error: null } : { data: { user: null }, error: { message: 'no session' } }),
    },
    // Only what the setup service reads: whether the person has a goal.
    from: (table: string) => {
      if (table !== 'goals') throw new Error(`the fake does not model "${table}"`);
      let userId: string | null = null;
      const query = {
        select: () => query,
        eq: (_column: string, value: string) => {
          userId = value;
          return query;
        },
        limit: async () =>
          fakeSave.goalsReadError
            ? { data: null, error: { code: 'XX000' } }
            : { data: fakeSave.tables.goals.filter((g) => g.user_id === userId).slice(0, 1), error: null },
      };
      return query;
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      fakeSave.rpcCalls.push({ fn, args });
      if (fn === 'save_guided_setup') return saveGuidedSetup(args.p_payload);
      if (fn === 'add_goals_after_setup') return addGoalsAfterSetup(args.p_payload);
      if (fn === 'add_targets_after_setup') return addTargetsAfterSetup(args.p_payload);
      throw new Error(`the fake does not model "${fn}"`);
    },
  };
}

export async function createSupabaseServerClient() {
  return fakeClient();
}
