// MOM-134: the setup values a person took from a suggestion, for the weekly review to ask about at the first review
// ("Still right for you?", docs/DOMAIN_MODEL.md §2.1 rule 4 and §3.2). Migration 017's save_guided_setup writes them; this
// reads them and records the person's answer. Both are the signed-in person's own rows (row level security, and an explicit
// user filter here as every service does). A starting point is a question yet to be asked, never a fact about the person.
//
// Reading returns facts only: what each one is about, in the person's words, and what is saved there now. Whether to raise
// the question, once and only at the first review, is the weekly review's trigger (MOM-113 block 3.4), and the screen that
// shows it calls answerStartingPoint(). Nothing here makes a Claude call.

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { STARTING_POINT_OUTCOMES, type StartingPointKind, type StartingPointOutcome } from '@/types/database.types';
import type { UnconfirmedStartingPoint } from '@/types/review';
import type { ServiceResult } from './result';

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type Row = Record<string, unknown>;

const SIGNED_OUT = 'Sign in to see your starting points.';
const LOAD_FAILED = 'Could not load your starting points.';
const ANSWER_FAILED = 'Could not save your answer.';
const NOT_FOUND = 'That question is not waiting for an answer.';
const BAD_REQUEST = 'That answer could not be read. Nothing was saved.';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Subject {
  table: 'person_day_types' | 'goals' | 'targets' | 'work_items';
  // The column that says what the row is, in the person's words.
  label: 'name' | 'title';
  // The columns a starting point of this kind can name (migration 017's starting_points_field_check).
  columns: string;
}
const SUBJECTS: Record<Exclude<StartingPointKind, 'person'>, Subject> = {
  day_type: { table: 'person_day_types', label: 'name', columns: 'capacity_amount' },
  goal: { table: 'goals', label: 'title', columns: 'start_date, end_date, block_weeks, return_date' },
  target: { table: 'targets', label: 'title', columns: 'floor, aspiration, qualifying_threshold, due_date, slot_weekdays' },
  work_item: { table: 'work_items', label: 'title', columns: 'due_date, estimate_minutes' },
};
const SUBJECT_ID = { day_type: 'day_type_id', goal: 'goal_id', target: 'target_id', work_item: 'work_item_id' } as const;

// The saved value as text, so the question can name it. A weekday list reads "1,3". Null when nothing is saved there now.
const asText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? value.join(',') : String(value);
};

async function signedIn(): Promise<ServiceResult<{ userId: string; supabase: Client }>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { ok: false, error: SIGNED_OUT };
  return { ok: true, data: { userId: data.user.id, supabase } };
}

// The signed-in person's starting points that nobody has asked about yet, oldest first, each with what it is about and what
// is saved there now. A mark whose row is gone is left out (the database removes the mark with the row, so this is only
// a read between two statements).
export async function listUnconfirmedStartingPoints(): Promise<ServiceResult<UnconfirmedStartingPoint[]>> {
  const user = await signedIn();
  if (!user.ok) return user;
  const { userId, supabase } = user.data;

  const marks = await supabase
    .from('starting_points')
    .select('id, subject_kind, day_type_id, goal_id, target_id, work_item_id, field, created_at')
    .eq('user_id', userId)
    .is('answered_at', null)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (marks.error) return { ok: false, error: LOAD_FAILED };
  if (marks.data.length === 0) return { ok: true, data: [] };

  // One read per kind that has a mark, never one per mark.
  const rowsByKind = new Map<string, Map<string, Row>>();
  for (const kind of Object.keys(SUBJECTS) as (keyof typeof SUBJECTS)[]) {
    const ids = [...new Set(marks.data.flatMap((m) => (m.subject_kind === kind ? [m[SUBJECT_ID[kind]]] : [])))].filter((id): id is string => id !== null);
    if (ids.length === 0) continue;
    const { table, label, columns } = SUBJECTS[kind];
    const read = await supabase.from(table).select(`id, ${label}, ${columns}`).eq('user_id', userId).in('id', ids);
    if (read.error) return { ok: false, error: LOAD_FAILED };
    rowsByKind.set(kind, new Map((read.data as unknown as Row[]).map((row) => [String(row.id), row])));
  }

  // A target's numbers the person has since changed in the review (MOM-146, migration 020) are what is saved there now: the newest
  // change by its day, and by when it was saved for one day. A mark whose value they changed is theirs to skip.
  const targetRows = rowsByKind.get('target');
  if (targetRows && targetRows.size > 0) {
    const changes = await supabase
      .from('target_changes')
      .select('target_id, effective_from, floor, aspiration, slot_weekdays, created_at')
      .eq('user_id', userId)
      .in('target_id', [...targetRows.keys()]);
    if (changes.error) return { ok: false, error: LOAD_FAILED };
    const newest = new Map<string, (typeof changes.data)[number]>();
    for (const c of changes.data) {
      const seen = newest.get(c.target_id);
      if (!seen || c.effective_from > seen.effective_from || (c.effective_from === seen.effective_from && c.created_at > seen.created_at)) newest.set(c.target_id, c);
    }
    for (const [id, c] of newest) {
      const row = targetRows.get(id);
      if (!row) continue;
      row.floor = c.floor;
      row.aspiration = c.aspiration;
      if (c.slot_weekdays !== null) row.slot_weekdays = c.slot_weekdays;
    }
  }

  let person: Row | null = null;
  if (marks.data.some((m) => m.subject_kind === 'person')) {
    const read = await supabase
      .from('person_settings')
      .select('day_end, week_start, planning_weekday, planning_time')
      .eq('user_id', userId)
      .maybeSingle();
    if (read.error) return { ok: false, error: LOAD_FAILED };
    person = read.data as Row | null;
  }

  const points: UnconfirmedStartingPoint[] = [];
  for (const m of marks.data) {
    if (m.subject_kind === 'person') {
      if (person) points.push({ id: m.id, kind: 'person', field: m.field, subject: null, value: asText(person[m.field]), createdAt: m.created_at });
      continue;
    }
    const id = m[SUBJECT_ID[m.subject_kind]];
    const row = id === null ? undefined : rowsByKind.get(m.subject_kind)?.get(id);
    if (!row) continue;
    points.push({
      id: m.id,
      kind: m.subject_kind,
      field: m.field,
      subject: asText(row[SUBJECTS[m.subject_kind].label]),
      value: asText(row[m.field]),
      createdAt: m.created_at,
    });
  }
  return { ok: true, data: points };
}

export interface AnswerStartingPointDeps {
  // The clock, for tests. Never set from a request.
  now?: () => number;
}

// Records the person's answer to one starting point: they kept the value, or they changed it. An answer is final: the
// database only lets an unanswered mark be answered, so asking twice answers the first time and refuses the second. This
// records the answer only; changing the value itself is the settings page's job, not this one's.
export async function answerStartingPoint(
  id: unknown,
  outcome: unknown,
  deps: AnswerStartingPointDeps = {},
): Promise<ServiceResult<{ id: string; outcome: StartingPointOutcome }>> {
  if (typeof id !== 'string' || !UUID.test(id)) return { ok: false, error: BAD_REQUEST };
  const answer = STARTING_POINT_OUTCOMES.find((o) => o === outcome);
  if (answer === undefined) return { ok: false, error: BAD_REQUEST };

  const user = await signedIn();
  if (!user.ok) return user;
  const { userId, supabase } = user.data;

  const { data, error } = await supabase
    .from('starting_points')
    .update({ answered_at: new Date((deps.now ?? Date.now)()).toISOString(), outcome: answer })
    .eq('id', id)
    .eq('user_id', userId)
    .is('answered_at', null)
    .select('id');
  if (error) {
    // The code only: the message can quote the row.
    console.error('[starting-points] could not save an answer', { code: error.code ?? 'none' });
    return { ok: false, error: ANSWER_FAILED };
  }
  if (data.length === 0) return { ok: false, error: NOT_FOUND };
  return { ok: true, data: { id, outcome: answer } };
}
