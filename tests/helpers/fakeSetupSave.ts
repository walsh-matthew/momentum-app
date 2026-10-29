// An in-memory stand-in for the signed-in Supabase client, as guided setup's save uses it (MOM-111): the session, a count of
// the person's goals, and the save_guided_setup() function of migrations 015, 016 and 017 (the deployed one is 017's),
// written in TypeScript. Like tests/helpers/fakeLlmUsage.ts for reserve_llm_call(), it follows the SQL statement by
// statement, and a test in tests/setup-service.test.ts reads those migrations and fails when the keys the SQL reads and the
// keys the app sends differ, so the two cannot drift apart unseen. What the real function does inside the database
// (constraints, row level security, the rollback) is covered by supabase/verify/015_save_guided_setup.sql and
// supabase/verify/017_starting_points.sql.
//
// The one property modelled here is the one the service depends on: the function is ONE transaction. It works on a copy of
// the tables and replaces them only when it reaches the end, so an error part-way leaves the tables as they were.

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
const asArray = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : []);

function saveGuidedSetup(payload: unknown): { data: unknown; error: null } | { data: null; error: { code: string } } {
  const uid = fakeSave.user?.id;
  if (!uid) return { data: null, error: { code: '42501' } };
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

  try {
    const p = payload as Json;
    if (typeof p !== 'object' || p === null || Array.isArray(p)) throw new DbError('22023');
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

    // 4. goals, targets, bindings, work items, steps
    let manualId: string | null = null;
    for (const g of goals) {
      // goals_shape_start_required (migration 014)
      if (g.state !== 'parked' && (g.shape == null || g.start_date == null)) throw new DbError('23514');
      const goal = write('goals', {
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
      });
      mark(g, 'goal', { goal_id: goal.id });
      const targetIds = new Map<string, string>();
      for (const t of asArray(g.targets)) {
        const target = write('targets', {
          goal_id: goal.id,
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
        });
        targetIds.set(String(t.key), target.id);
        mark(t, 'target', { target_id: target.id });
        for (const s of asArray(t.sources)) {
          let sourceId: string;
          if (s.kind === 'manual') {
            manualId ??=
              working.sources.find((r) => r.user_id === uid && r.kind === 'manual')?.id ??
              write('sources', { kind: 'manual', provider: null, label: 'Manual' }).id;
            sourceId = manualId;
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
        }
      }
      for (const i of asArray(g.items)) {
        let targetId: string | null = null;
        if (i.target_key != null) {
          const found = targetIds.get(String(i.target_key));
          if (!found) throw new DbError('22023');
          targetId = found;
        }
        const item = write('work_items', {
          goal_id: goal.id,
          target_id: targetId,
          kind: i.kind,
          title: i.title,
          sort_order: i.sort_order ?? 0,
          due_date: i.due_date ?? null,
          date_can_move: i.date_can_move ?? null,
          estimate_minutes: i.estimate_minutes ?? null,
        });
        mark(i, 'work_item', { work_item_id: item.id });
        for (const s of asArray(i.steps)) write('work_item_steps', { work_item_id: item.id, title: s.title, sort_order: s.sort_order ?? 0 });
      }
    }

    fakeSave.tables = working; // commit
    return {
      data: {
        goals: goals.length,
        targets: goals.reduce((n, g) => n + asArray(g.targets).length, 0),
        work_items: goals.reduce((n, g) => n + asArray(g.items).length, 0),
        steps: goals.reduce((n, g) => n + asArray(g.items).reduce((m, i) => m + asArray(i.steps).length, 0), 0),
        bindings: goals.reduce((n, g) => n + asArray(g.targets).reduce((m, t) => m + asArray(t.sources).length, 0), 0),
      },
      error: null,
    };
  } catch (e) {
    if (e instanceof DbError) return { data: null, error: { code: e.code } };
    throw e;
  }
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
      if (fn !== 'save_guided_setup') throw new Error(`the fake does not model "${fn}"`);
      return saveGuidedSetup(args.p_payload);
    },
  };
}

export async function createSupabaseServerClient() {
  return fakeClient();
}
