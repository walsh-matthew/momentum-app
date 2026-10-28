// Turns a final, approved draft into the rows of migration 013 (docs/DOMAIN_MODEL.md §2.3). It runs validateDraft(...,
// 'final') first, so nothing the draft cannot save ever becomes a row, and the save service (lib/services/setup.ts) uses
// this same function. The rows carry the draft's keys where a database id will be: save_guided_setup() (migration 015)
// creates the ids and fills goal_id, target_id and work_item_id from the keys, and takes the person's id from the
// session. toSavePayload() is the shape that function reads. Pure: no database call.

import type { TablesInsert } from '@/types/database.types';
import type { SetupDraft, Transcript } from '@/types/setup';
import { INTEGRATION_CATALOG } from '@/lib/integrations/catalog';
import { validateDraft, type DraftIssue } from './validate';

type Without<T, K extends string> = Omit<T, K | 'user_id' | 'created_at' | 'updated_at'>;

export type PersonSettingsRow = Without<TablesInsert<'person_settings'>, never>;
export type DayTypeRow = Without<TablesInsert<'person_day_types'>, 'id'>;
export type PriorityRow = Without<TablesInsert<'person_priorities'>, 'id'>;
export type GoalRow = Without<TablesInsert<'goals'>, 'id'>;
export type TargetRow = Without<TablesInsert<'targets'>, 'id' | 'goal_id'>;
export type WorkItemRow = Without<TablesInsert<'work_items'>, 'id' | 'goal_id' | 'target_id'>;
export type StepRow = Without<TablesInsert<'work_item_steps'>, 'id' | 'work_item_id'>;
export type SourceNeed = { kind: 'manual' } | { kind: 'synced'; provider: string };

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
}

export type DraftRowsResult = { ok: true; rows: SetupRows } | { ok: false; issues: DraftIssue[] };

// What save_guided_setup() takes (migration 015). Nested, with the keys kept, because the function creates the ids and
// resolves a work item's target by key. There is no user id anywhere in it: the function takes the owner from the session.
export type SavePayloadSource = { kind: 'manual' } | { kind: 'synced'; provider: string; label: string };
export interface SavePayload {
  person: PersonSettingsRow;
  day_types: DayTypeRow[];
  priorities: PriorityRow[];
  goals: (GoalRow & {
    key: string;
    targets: (TargetRow & { key: string; sources: SavePayloadSource[] })[];
    items: (WorkItemRow & { key: string; target_key: string | null; steps: StepRow[] })[];
  })[];
}

const asTime = (hhmm: string | null): string | null => (hhmm === null ? null : `${hhmm}:00`);

export function draftToRows(draft: SetupDraft, transcript: Transcript): DraftRowsResult {
  const validation = validateDraft(draft, transcript, 'final');
  if (!validation.ok) return { ok: false, issues: validation.issues };

  const { person, settings, goals } = draft.model;
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

// The rows of a validated draft as the one payload the save function takes. Pure.
export function toSavePayload(rows: SetupRows): SavePayload {
  return {
    person: rows.personSettings,
    day_types: rows.dayTypes,
    priorities: rows.priorities,
    goals: rows.goals.map(({ key, row }) => ({
      key,
      ...row,
      targets: rows.targets
        .filter((t) => t.goalKey === key)
        .map((t) => ({
          key: t.key,
          ...t.row,
          sources: rows.targetSources
            .filter((s) => s.goalKey === key && s.targetKey === t.key)
            .map((s): SavePayloadSource =>
              s.source.kind === 'manual'
                ? { kind: 'manual' }
                : { kind: 'synced', provider: s.source.provider, label: providerLabel(s.source.provider) },
            ),
        })),
      items: rows.workItems
        .filter((i) => i.goalKey === key)
        .map((i) => ({
          key: i.key,
          target_key: i.targetKey,
          ...i.row,
          steps: rows.steps.filter((s) => s.goalKey === key && s.itemKey === i.key).map((s) => s.row),
        })),
    })),
  };
}
