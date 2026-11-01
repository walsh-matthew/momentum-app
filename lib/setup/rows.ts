// Turns a final, approved draft into the rows of migration 013 (docs/DOMAIN_MODEL.md §2.3). It runs validateDraft(...,
// 'final') first, so nothing the draft cannot save ever becomes a row, and the save service (lib/services/setup.ts) uses
// this same function. The rows carry the draft's keys where a database id will be: save_guided_setup() (migration 015)
// creates the ids and fills goal_id, target_id and work_item_id from the keys, and takes the person's id from the
// session. toSavePayload() is the shape that function reads. Pure: no database call.
//
// Where a value came from (MOM-134): the values the person accepted from a suggestion travel as `startingPoints`, and
// toSavePayload() nests each one's saved column name under the person, day type, goal, target or work item it belongs to,
// as a `starting_points` list that migration 017's version of the function marks on the row it has just written.

import type { QuantityMetric, TablesInsert } from '@/types/database.types';
import type { SetupDraft, Transcript } from '@/types/setup';
import { INTEGRATION_CATALOG } from '@/lib/integrations/catalog';
import { shownModel } from './paraphrase';
import { acceptedStartingPoints, type StartingPointMark, type StartingPointSubject } from './startingPoints';
import { validateDraft, type DraftIssue, type ValidateOptions } from './validate';

type Without<T, K extends string> = Omit<T, K | 'user_id' | 'created_at' | 'updated_at'>;

export type PersonSettingsRow = Without<TablesInsert<'person_settings'>, never>;
export type DayTypeRow = Without<TablesInsert<'person_day_types'>, 'id'>;
export type PriorityRow = Without<TablesInsert<'person_priorities'>, 'id'>;
export type GoalRow = Without<TablesInsert<'goals'>, 'id'>;
export type TargetRow = Without<TablesInsert<'targets'>, 'id' | 'goal_id'>;
export type WorkItemRow = Without<TablesInsert<'work_items'>, 'id' | 'goal_id' | 'target_id'>;
export type StepRow = Without<TablesInsert<'work_item_steps'>, 'id' | 'work_item_id'>;
export type SourceNeed = { kind: 'manual' } | { kind: 'synced'; provider: string; metric: QuantityMetric | null };

export interface SetupRows {
  personSettings: PersonSettingsRow;
  dayTypes: DayTypeRow[];
  priorities: PriorityRow[];
  goals: { key: string; row: GoalRow }[];
  targets: { key: string; goalKey: string; row: TargetRow }[];
  workItems: { key: string; goalKey: string; targetKey: string | null; row: WorkItemRow }[];
  steps: { goalKey: string; itemKey: string; row: StepRow }[];
  // The sources the targets name. The person's manual source is created on first use (MOM-110); a synced one exists
  // only when they have connected the app.
  targetSources: { goalKey: string; targetKey: string; source: SourceNeed }[];
  // The values that came from an accepted suggestion (lib/setup/startingPoints.ts), by the draft's keys.
  startingPoints: StartingPointMark[];
}

export type DraftRowsResult = { ok: true; rows: SetupRows } | { ok: false; issues: DraftIssue[] };

// What save_guided_setup() takes (migration 015). Nested, with the keys kept, because the function creates the ids and
// resolves a work item's target by key. There is no user id anywhere in it: the function takes the owner from the session.
export type SavePayloadSource = { kind: 'manual' } | { kind: 'synced'; provider: string; label: string; metric: QuantityMetric | null };
// The saved column names on this row whose value came from an accepted suggestion (migration 017). Absent when none did.
interface WithStartingPoints {
  starting_points?: string[];
}
export interface SavePayload {
  person: PersonSettingsRow & WithStartingPoints;
  day_types: (DayTypeRow & WithStartingPoints)[];
  priorities: PriorityRow[];
  goals: (GoalRow &
    WithStartingPoints & {
      key: string;
      targets: (TargetRow & WithStartingPoints & { key: string; sources: SavePayloadSource[] })[];
      items: (WorkItemRow & WithStartingPoints & { key: string; target_key: string | null; steps: StepRow[] })[];
    })[];
}

const asTime = (hhmm: string | null): string | null => (hhmm === null ? null : `${hhmm}:00`);

// `options` is set only for an addition after first setup (lib/setup/validate.ts): the person's saved anchors stand in for the ones a
// returning draft does not hold. A first setup passes none.
export function draftToRows(draft: SetupDraft, transcript: Transcript, options: ValidateOptions = {}): DraftRowsResult {
  const validation = validateDraft(draft, transcript, 'final', options);
  if (!validation.ok) return { ok: false, issues: validation.issues };

  // What the person approved: the playback showed Claude's clean version of their words where it passed the check, so that
  // is what is saved (MOM-111 finding 11, owner decision 1). Their raw words stay only in the conversation, which is not
  // stored.
  const { person, settings, goals } = shownModel(draft, transcript);
  const rows: SetupRows = {
    personSettings: {
      time_zone: person.timeZone,
      week_start: person.weekStart,
      day_end: asTime(person.dayEnd),
      tone: settings.tone,
      reminders: settings.reminders,
      check_ins: settings.checkIns,
      celebrations: settings.celebrations,
      balance_mentions: settings.balanceMentions,
      review_depth: settings.reviewDepth,
      review_planning: settings.reviewPlanning,
      quiet_times: settings.quietTimes === null ? null : settings.quietTimes.map((text) => ({ text })),
      planning_weekday: person.planning.weekday,
      planning_time: asTime(person.planning.time),
    },
    dayTypes: person.dayTypes.map((d) => ({
      name: d.name,
      capacity_unit: d.capacityUnit,
      capacity_amount: d.capacityAmount,
    })),
    priorities: person.priorities.map((label, sort_order) => ({ label, sort_order })),
    goals: [],
    targets: [],
    workItems: [],
    steps: [],
    targetSources: [],
    startingPoints: acceptedStartingPoints(draft),
  };

  for (const g of goals) {
    rows.goals.push({
      key: g.key,
      row: {
        title: g.title,
        why: g.why,
        // Final validation guarantees both for an active goal; a parked goal may have neither (migration 014).
        start_date: g.startDate,
        shape: g.shape,
        end_date: g.endDate,
        block_weeks: g.blockWeeks,
        state: g.state,
        return_kind: g.returnWhen?.kind ?? null,
        return_date: g.returnWhen?.kind === 'date' ? g.returnWhen.date : null,
        return_note: g.returnWhen?.kind === 'condition' ? g.returnWhen.note : null,
        completion_mode: g.completionMode,
        tone: g.tone,
      },
    });
    for (const t of g.targets) {
      rows.targets.push({
        key: t.key,
        goalKey: g.key,
        row: {
          title: t.title,
          measure: t.measure,
          unit: t.unit,
          role: t.role,
          period_kind: t.period.kind,
          due_date: t.period.kind === 'deadline' ? t.period.dueDate : null,
          slot_weekdays: t.period.kind === 'day_slots' ? t.period.weekdays : null,
          floor: t.floor,
          aspiration: t.aspiration,
          qualifying_threshold: t.qualifyingThreshold,
          carry_over_kind: t.carryOver,
          completion_mode: t.completionMode,
          tone: t.tone,
        },
      });
      for (const source of t.sources) rows.targetSources.push({ goalKey: g.key, targetKey: t.key, source });
    }
    g.items.forEach((i, sort_order) => {
      rows.workItems.push({
        key: i.key,
        goalKey: g.key,
        targetKey: i.targetKey,
        row: {
          kind: i.kind,
          title: i.title,
          sort_order,
          due_date: i.dueDate,
          date_can_move: i.dateCanMove,
          estimate_minutes: i.estimateMinutes,
        },
      });
      i.steps.forEach((title, step_order) => rows.steps.push({ goalKey: g.key, itemKey: i.key, row: { title, sort_order: step_order } }));
    });
  }
  return { ok: true, rows };
}

// The name a synced source is saved under: the catalog's name for the app, else the provider id.
const providerLabel = (provider: string): string => INTEGRATION_CATALOG.find((e) => e.provider === provider)?.name ?? provider;

// The saved column names marked on one subject, or nothing at all when there are none: a setup with no value taken from a
// suggestion sends exactly the payload it sent before migration 017, which the function also reads without any list.
function startingPointsOf(rows: SetupRows, isSubject: (subject: StartingPointSubject) => boolean): WithStartingPoints {
  const fields = rows.startingPoints.filter((m) => isSubject(m.subject)).map((m) => m.field);
  return fields.length > 0 ? { starting_points: fields } : {};
}

// What add_goals_after_setup() takes (migration 021, MOM-132): the goals as the first-setup save reads them, with their targets,
// items and starting-point marks, and the id the browser made for this one approval. Nothing about the person (facts, day types,
// priorities) travels: an addition never touches what is already saved. There is no user id: the function takes the owner from the
// session.
export interface AddGoalsPayload {
  submission_id: string;
  goals: SavePayload['goals'];
}

// What add_targets_after_setup() takes: the new targets (and the items that feed them) of ONE goal the person already has, starting on
// the date they gave. The goal's own columns, the person's facts and any mark on the goal itself are not sent.
export interface AddTargetsPayload {
  submission_id: string;
  goal_id: string;
  start_date: string;
  targets: SavePayload['goals'][number]['targets'];
  items: SavePayload['goals'][number]['items'];
}

// The goals of a validated draft as the add-a-goal payload. Pure. The goals come in the order the person gave them.
export function toAddGoalsPayload(rows: SetupRows, submissionId: string): AddGoalsPayload {
  return { submission_id: submissionId, goals: toSavePayload(rows).goals };
}

// The targets of a validated draft's one goal as the add-a-target payload. Pure. Null when the draft does not hold exactly one goal
// with at least one target: adding targets is to one goal, and a draft of anything else is not what the person approved.
export function toAddTargetsPayload(rows: SetupRows, goalId: string, startDate: string, submissionId: string): AddTargetsPayload | null {
  const [goal, ...others] = toSavePayload(rows).goals;
  if (goal === undefined || others.length > 0 || goal.targets.length === 0) return null;
  return { submission_id: submissionId, goal_id: goalId, start_date: startDate, targets: goal.targets, items: goal.items };
}

// The rows of a validated draft as the one payload the save function takes. Pure.
export function toSavePayload(rows: SetupRows): SavePayload {
  const lower = (name: string) => name.toLowerCase();
  return {
    person: { ...rows.personSettings, ...startingPointsOf(rows, (s) => s.kind === 'person') },
    // Day types that differ only in case share one path, and only the first of them is marked.
    day_types: rows.dayTypes.map((d, i) => ({
      ...d,
      ...(rows.dayTypes.findIndex((other) => lower(other.name) === lower(d.name)) === i
        ? startingPointsOf(rows, (s) => s.kind === 'day_type' && s.name === lower(d.name))
        : {}),
    })),
    priorities: rows.priorities,
    goals: rows.goals.map(({ key, row }) => ({
      key,
      ...row,
      ...startingPointsOf(rows, (s) => s.kind === 'goal' && s.goalKey === key),
      targets: rows.targets
        .filter((t) => t.goalKey === key)
        .map((t) => ({
          key: t.key,
          ...t.row,
          ...startingPointsOf(rows, (s) => s.kind === 'target' && s.goalKey === key && s.targetKey === t.key),
          sources: rows.targetSources
            .filter((s) => s.goalKey === key && s.targetKey === t.key)
            .map((s): SavePayloadSource =>
              s.source.kind === 'manual'
                ? { kind: 'manual' }
                : { kind: 'synced', provider: s.source.provider, label: providerLabel(s.source.provider), metric: s.source.metric },
            ),
        })),
      items: rows.workItems
        .filter((i) => i.goalKey === key)
        .map((i) => ({
          key: i.key,
          target_key: i.targetKey,
          ...i.row,
          ...startingPointsOf(rows, (s) => s.kind === 'work_item' && s.goalKey === key && s.itemKey === i.key),
          steps: rows.steps.filter((s) => s.goalKey === key && s.itemKey === i.key).map((s) => s.row),
        })),
    })),
  };
}
