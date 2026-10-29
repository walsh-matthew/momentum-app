// Central data models for Momentum. Single source of truth (CLAUDE.md, Architectural Directive 2).
// Derived from supabase/migrations/ (001 onward). Mirrors the shape of `supabase gen types`
// so the generated output can replace the `Database` block later; keep the aliases below it.
// All enum values are lowercase machine keys. Presentation strings belong in the UI.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ---------------------------------------------------------------------------
// Enum unions (enforced by CHECK constraints in the migration)
// ---------------------------------------------------------------------------

export const GOAL_CHANNEL_STATUSES = ['active', 'paused', 'done'] as const;
export type GoalChannelStatus = (typeof GOAL_CHANNEL_STATUSES)[number];

// Wizard answers stored on goal_channels (migration 008). Lowercase machine keys; labels live in
// lib/goals/vocabulary.ts, which re-exports these so the CHECK lists and the wizard share one source.
export const GOAL_TYPES = [
  'career_pivot',
  'get_certified',
  'portfolio_piece',
  'interview_prep',
  'grow_network',
] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

export const CONSTRAINTS = [
  'flexible_hours',
  'contract_work_first',
  'dont_track_hours',
  'flexible_dates',
] as const;
export type Constraint = (typeof CONSTRAINTS)[number];

export const PACES = ['lighter', 'heavier', 'ahead', 'behind', 'carry_over'] as const;
export type Pace = (typeof PACES)[number];

export const TASK_STATUSES = ['todo', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

// How a rebalance moved a task: later (carry_over) or earlier (pull_forward). Matches
// task_rebalance_history.shift_type and the actions in types/rebalance.ts.
export const SHIFT_TYPES = ['carry_over', 'pull_forward'] as const;
export type ShiftType = (typeof SHIFT_TYPES)[number];

// How a provider is authorised: an OAuth2 token pair (Google) or a single API key (Hevy). Matches
// integration_credentials.auth_type (migration 005).
export const INTEGRATION_AUTH_TYPES = ['oauth2', 'api_key'] as const;
export type IntegrationAuthType = (typeof INTEGRATION_AUTH_TYPES)[number];

// State of a stored credential. 'needs_reauth': the provider refused the refresh token and the user
// must connect again. 'error': the last attempt failed for another reason; retrying may work.
export const CREDENTIAL_STATUSES = ['connected', 'needs_reauth', 'error'] as const;
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number];

// The places the app calls Claude, and how a call can end. Match llm_usage_logs.feature and .outcome (migration 011,
// with 'setup' added by 014 and 'weekly_review' by 018). 'pending' is a call that has been reserved but not yet
// recorded as finished.
export const LLM_FEATURES = ['rebalance', 'week_one_plan', 'setup', 'weekly_review'] as const;
export type LlmFeature = (typeof LLM_FEATURES)[number];
export const LLM_OUTCOMES = ['pending', 'ok', 'refused', 'provider_rate_limited', 'unavailable', 'bad_output', 'not_configured'] as const;
export type LlmOutcome = (typeof LLM_OUTCOMES)[number];

// The goal model (migration 013, MOM-107; docs/DOMAIN_MODEL.md section 1). Match the CHECK lists of the new tables.
export const GOAL_SHAPES = ['ongoing', 'finite', 'project'] as const;
export type GoalShape = (typeof GOAL_SHAPES)[number];
export const GOAL_STATES = ['active', 'parked'] as const;
export type GoalState = (typeof GOAL_STATES)[number];
// How a parked goal comes back: on a date, when a condition the person put in words holds, or only when asked.
export const RETURN_KINDS = ['date', 'condition', 'on_request'] as const;
export type ReturnKind = (typeof RETURN_KINDS)[number];
export const COMPLETION_MODES = ['auto', 'confirm', 'manual'] as const;
export type CompletionMode = (typeof COMPLETION_MODES)[number];
export const TONES = ['gentle', 'middle', 'direct'] as const;
export type Tone = (typeof TONES)[number];
export const MEASURES = ['count', 'quantity', 'time', 'checklist'] as const;
export type Measure = (typeof MEASURES)[number];
// Which number a quantity target counts, named by the binding (migration 016, MOM-111/MOM-109): never guessed from
// the target's own unit text.
export const QUANTITY_METRICS = ['volume_lbs', 'volume_kg', 'sets', 'minutes'] as const;
export type QuantityMetric = (typeof QUANTITY_METRICS)[number];
export const TARGET_ROLES = ['effort', 'outcome'] as const;
export type TargetRole = (typeof TARGET_ROLES)[number];
export const PERIOD_KINDS = ['weekly', 'day_slots', 'deadline'] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];
// habit: a shortfall never rolls into the next period. cumulative: it stays owed until the deadline.
export const CARRY_OVER_KINDS = ['habit', 'cumulative'] as const;
export type CarryOverKind = (typeof CARRY_OVER_KINDS)[number];
export const WORK_ITEM_KINDS = ['habit', 'milestone', 'deadline_task'] as const;
export type WorkItemKind = (typeof WORK_ITEM_KINDS)[number];
// Who completed a work item or step: the person, or a source (an automatic completion, shown and undoable).
export const COMPLETED_VIA = ['person', 'source'] as const;
export type CompletedVia = (typeof COMPLETED_VIA)[number];
export const SOURCE_KINDS = ['synced', 'manual'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];
// The person's word on one source record: remove it (restorable) or count it though it is below the threshold.
export const CORRECTION_ACTIONS = ['hide', 'count_anyway'] as const;
export type CorrectionAction = (typeof CORRECTION_ACTIONS)[number];
export const CAPACITY_UNITS = ['hours', 'sessions'] as const;
export type CapacityUnit = (typeof CAPACITY_UNITS)[number];
export const REMINDER_MODES = ['off', 'tied_to_plan'] as const;
export type ReminderMode = (typeof REMINDER_MODES)[number];
export const CHECK_IN_MODES = ['never', 'end_of_day', 'end_of_week'] as const;
export type CheckInMode = (typeof CHECK_IN_MODES)[number];
export const CELEBRATION_LEVELS = ['low_key', 'medium', 'big'] as const;
export type CelebrationLevel = (typeof CELEBRATION_LEVELS)[number];
export const BALANCE_MENTIONS = ['weekly_planning', 'near_deadlines', 'leave_to_me'] as const;
export type BalanceMention = (typeof BALANCE_MENTIONS)[number];
export const REVIEW_DEPTHS = ['recap_only', 'recap_offer', 'full'] as const;
export type ReviewDepth = (typeof REVIEW_DEPTHS)[number];
export const REVIEW_PLANNING_MODES = ['one_sitting', 'separate'] as const;
export type ReviewPlanningMode = (typeof REVIEW_PLANNING_MODES)[number];

export const TASK_TYPES = [
  'job_search',
  'interview_fill_in',
  'interview_prep',
  'build',
  'learn',
  'certify',
  'position',
  'event',
  'publish',
  'review',
  'funnel_check',
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

// Weeks in a 90-day plan (docs/NINETY_DAY_PLAN_CONTEXT.md §2). micro_tasks.week_of only requires >= 1;
// the plan itself ends here, so generators and rebalancing must not place work past it.
export const PLAN_WEEKS = 13;

export const FITS = ['strong', 'good', 'stretch'] as const;
export type Fit = (typeof FITS)[number];

// Open-ended, matching INTEGRATIONS_SPEC.md §2. Stored as a lowercase key.
export type ExternalProviderId = 'hevy' | 'apple_health' | 'google_calendar' | 'github' | (string & {});

// What an external activity looked like when it was ingested (migration 007). Kept on the task it
// created as evidence the user can see when deciding whether to tick it. Mirrors
// InboundActivityPayload (docs/INTEGRATIONS_SPEC.md §2) without the fields stored in columns.
export interface TaskSourceEvidence {
  activityType: string;
  // ISO-8601 UTC time the activity ended.
  occurredAt: string;
  durationMinutes: number;
  metrics: {
    volumeLbs?: number;
    setsCompleted?: number;
    activeCalories?: number;
    eventCompleted?: boolean;
    metadata?: Record<string, unknown>;
  };
}

// One item of goal_channels.criteria. The user ticks criteria; the system never does.
export interface GoalCriterion {
  key: string;
  label: string;
  done: boolean;
}

// One task passed to create_goal_with_week_one_plan. Only these three keys are accepted by the function.
export interface WeekOneTaskArg {
  title: string;
  task_type: TaskType;
  minutes: number;
}

// goal_channels.preferences. Only the answers the user gave are present: an unset pace is omitted, and
// a goal with no constraints has no `constraints` key. Shape is enforced by goal_channels_preferences_shape.
export interface GoalPreferences {
  constraints?: Constraint[];
  pace?: Pace;
}

// A goal_channels row. Named so create_goal_with_week_one_plan can return it. A type alias, not an
// interface: supabase-js needs rows to be assignable to Record<string, unknown>.
export type GoalChannelRow = {
  id: string;
  user_id: string;
  channel_key: string;
  title: string;
  status: GoalChannelStatus;
  is_default: boolean;
  start_date: string;
  target_date: string | null;
  criteria: GoalCriterion[];
  // Null for goals created before migration 008 recorded it.
  goal_type: GoalType | null;
  preferences: GoalPreferences;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Goal model rows (migration 013, MOM-107). Dates are 'YYYY-MM-DD' strings, times of day 'HH:MM:SS', and numeric
// columns are numbers. Type aliases, not interfaces, for the same reason as GoalChannelRow.
// ---------------------------------------------------------------------------

// One row per person, created by the first setup. Every time anchor and setting is null until the person chooses it:
// nothing about their life is assumed, and the code supplies the starting values (docs/DOMAIN_MODEL.md section 4.1).
export type PersonSettingsRow = {
  user_id: string;
  time_zone: string | null;
  // 1 to 7, Monday is 1. A label for the day the person's week starts on.
  week_start: number | null;
  day_end: string | null;
  tone: Tone | null;
  reminders: ReminderMode | null;
  check_ins: CheckInMode | null;
  celebrations: CelebrationLevel | null;
  balance_mentions: BalanceMention | null;
  review_depth: ReviewDepth | null;
  review_planning: ReviewPlanningMode | null;
  // Null: not asked yet. []: asked, and none.
  quiet_times: Json[] | null;
  slipping_periods: number | null;
  planning_weekday: number | null;
  planning_time: string | null;
  created_at: string;
  updated_at: string;
};

export type PersonDayTypeRow = {
  id: string;
  user_id: string;
  name: string;
  capacity_unit: CapacityUnit | null;
  capacity_amount: number | null;
  reminder_time: string | null;
  created_at: string;
  updated_at: string;
};

export type PersonPriorityRow = {
  id: string;
  user_id: string;
  label: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type PersonHandlingRuleRow = {
  id: string;
  user_id: string;
  rule_text: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type GoalRow = {
  id: string;
  user_id: string;
  title: string;
  why: string | null;
  // Null only for a parked goal (migration 014, MOM-128): any other goal has both.
  start_date: string | null;
  shape: GoalShape | null;
  end_date: string | null;
  block_weeks: number | null;
  state: GoalState;
  return_kind: ReturnKind | null;
  return_date: string | null;
  return_note: string | null;
  completion_mode: CompletionMode | null;
  tone: Tone | null;
  created_at: string;
  updated_at: string;
};

export type TargetRow = {
  id: string;
  user_id: string;
  goal_id: string;
  title: string;
  measure: Measure;
  unit: string | null;
  role: TargetRole;
  period_kind: PeriodKind;
  due_date: string | null;
  // day_slots only: the weekdays the person named, 1 to 7 (Monday is 1).
  slot_weekdays: number[] | null;
  floor: number | null;
  aspiration: number | null;
  qualifying_threshold: number | null;
  carry_over_kind: CarryOverKind;
  completion_mode: CompletionMode | null;
  tone: Tone | null;
  created_at: string;
  updated_at: string;
};

export type WorkItemRow = {
  id: string;
  user_id: string;
  goal_id: string;
  target_id: string | null;
  kind: WorkItemKind;
  title: string;
  sort_order: number;
  due_date: string | null;
  date_can_move: boolean | null;
  estimate_minutes: number | null;
  completed_at: string | null;
  completed_via: CompletedVia | null;
  created_at: string;
  updated_at: string;
};

export type WorkItemStepRow = {
  id: string;
  user_id: string;
  work_item_id: string;
  title: string;
  sort_order: number;
  // For display. Checklist progress is computed from entries: a tick writes a manual entry whose source_record_id
  // is this step's id.
  completed_at: string | null;
  completed_via: CompletedVia | null;
  created_at: string;
  updated_at: string;
};

export type SourceRow = {
  id: string;
  user_id: string;
  kind: SourceKind;
  // Required for a synced source, null for a manual one.
  provider: ExternalProviderId | null;
  label: string;
  created_at: string;
  updated_at: string;
};

export type TargetSourceRow = {
  target_id: string;
  source_id: string;
  user_id: string;
  // Which number a quantity target counts, for a synced provider with more than one (migration 016). Null for a
  // manual source, or a synced one with no metric to choose.
  metric: QuantityMetric | null;
  created_at: string;
};

export type EntryRow = {
  id: string;
  user_id: string;
  target_id: string;
  source_id: string;
  // The source's own id for the record (a checklist tick uses the step's id).
  source_record_id: string;
  work_item_id: string | null;
  occurred_at: string;
  // The raw amount: 1 for a count or a tick, the number for a quantity, minutes for time. Never a total.
  value: number;
  evidence: Record<string, Json | undefined>;
  created_at: string;
  updated_at: string;
};

export type EntryCorrectionRow = {
  id: string;
  user_id: string;
  source_id: string;
  source_record_id: string;
  action: CorrectionAction;
  created_at: string;
  updated_at: string;
};

// The target a closed period was judged by, with the time anchors in force, copied when the period closed.
export type PeriodSnapshotRow = {
  id: string;
  user_id: string;
  target_id: string;
  period_start: string;
  period_end: string;
  time_zone: string;
  week_start: number | null;
  day_end: string | null;
  measure: Measure;
  unit: string | null;
  role: TargetRole;
  period_kind: PeriodKind;
  slot_weekdays: number[] | null;
  floor: number | null;
  aspiration: number | null;
  qualifying_threshold: number | null;
  carry_over_kind: CarryOverKind;
  created_at: string;
};

// A setup value the person took from a suggestion (migration 017, MOM-134). A starting point is a question the first
// weekly review has yet to ask ("Still right for you?"), never a fact about the person (docs/DOMAIN_MODEL.md §2.1 rule 4).
// The kinds and the field each can name are the CHECK constraints of 017; tests/migrations.test.ts compares them.
export const STARTING_POINT_KINDS = ['person', 'day_type', 'goal', 'target', 'work_item'] as const;
export type StartingPointKind = (typeof STARTING_POINT_KINDS)[number];
export const STARTING_POINT_FIELDS = {
  person: ['day_end', 'week_start', 'planning_weekday', 'planning_time'],
  day_type: ['capacity_amount'],
  goal: ['start_date', 'end_date', 'block_weeks', 'return_date'],
  target: ['floor', 'aspiration', 'qualifying_threshold', 'due_date', 'slot_weekdays'],
  work_item: ['due_date', 'estimate_minutes'],
} as const satisfies Record<StartingPointKind, readonly string[]>;
export const STARTING_POINT_OUTCOMES = ['kept', 'changed'] as const;
export type StartingPointOutcome = (typeof STARTING_POINT_OUTCOMES)[number];

export type StartingPointRow = {
  id: string;
  user_id: string;
  subject_kind: StartingPointKind;
  // Exactly the one that matches subject_kind; all null for the person's own settings.
  day_type_id: string | null;
  goal_id: string | null;
  target_id: string | null;
  work_item_id: string | null;
  // The saved column that holds the value, one of STARTING_POINT_FIELDS[subject_kind].
  field: string;
  created_at: string;
  // Set together when the person is asked at their first review.
  answered_at: string | null;
  outcome: StartingPointOutcome | null;
};

// A finished weekly review (migration 018, MOM-113): what the recap said, the week it covered, and the one adjustment
// offered with what the person chose. Written once and never changed (docs/DOMAIN_MODEL.md §3, RAID R-26). The kinds
// are the six of §3.2 and the outcomes are the three kill criterion 4 counts; tests/migrations.test.ts compares both with
// 018's CHECK constraints.
export const REVIEW_ADJUSTMENT_KINDS = [
  'deadline_forecast',
  'slipping_check_in',
  'rebaseline',
  'priority_changed',
  'handling_preference',
  'still_right',
] as const;
export type ReviewAdjustmentKind = (typeof REVIEW_ADJUSTMENT_KINDS)[number];
export const REVIEW_ADJUSTMENT_OUTCOMES = ['changed', 'declined', 'skipped'] as const;
export type ReviewAdjustmentOutcome = (typeof REVIEW_ADJUSTMENT_OUTCOMES)[number];

export type WeeklyReviewRow = {
  id: string;
  user_id: string;
  // The week reviewed, as the person's own calendar dates (seven days).
  week_start: string;
  week_end: string;
  // What layer 1 showed, as stored (types/review.ts StoredRecap); read through lib/review/storedRecap.ts, never trusted as typed.
  recap: Json;
  // Offered means all three are set, not offered means none are.
  adjustment_kind: ReviewAdjustmentKind | null;
  adjustment: Json | null;
  adjustment_outcome: ReviewAdjustmentOutcome | null;
  // Set by a trigger to the database's own time, whatever an insert sends.
  finished_at: string;
};

// The week plan (migration 019, MOM-112): the person's own choice of which work items to do on which of their dates, and
// which of their own day types a date is. A pick is an item on a date, never a time or a slot (docs/DOMAIN_MODEL.md §1.4,
// §4.2 principle 12).
export type WeekPlanPickRow = {
  id: string;
  user_id: string;
  work_item_id: string;
  // The person's own calendar date (YYYY-MM-DD) in their own time zone.
  plan_date: string;
  created_at: string;
};

export type WeekPlanDayTypeRow = {
  id: string;
  user_id: string;
  plan_date: string;
  day_type_id: string;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Database (supabase-js generic)
// ---------------------------------------------------------------------------

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          display_name: string | null;
          created_at: string;
          updated_at: string;
        };
        // Rows are created by the signup trigger; clients only update.
        Insert: {
          id: string;
          display_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      goal_channels: {
        Row: GoalChannelRow;
        Insert: {
          id?: string;
          user_id: string;
          channel_key: string;
          title: string;
          status?: GoalChannelStatus;
          is_default?: boolean;
          start_date?: string;
          target_date?: string | null;
          criteria?: GoalCriterion[];
          goal_type?: GoalType | null;
          preferences?: GoalPreferences;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          channel_key?: string;
          title?: string;
          status?: GoalChannelStatus;
          is_default?: boolean;
          start_date?: string;
          target_date?: string | null;
          criteria?: GoalCriterion[];
          goal_type?: GoalType | null;
          preferences?: GoalPreferences;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'goal_channels_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      micro_tasks: {
        Row: {
          id: string;
          user_id: string;
          goal_channel_id: string;
          title: string;
          task_type: TaskType;
          minutes: number;
          status: TaskStatus;
          fit: Fit | null;
          week_of: number;
          due_date: string | null;
          carried_from_week: number | null;
          pulled_from_week: number | null;
          completed_at: string | null;
          // Set only on tasks the ingestion pipeline created from an external activity (migration 007).
          source_provider: ExternalProviderId | null;
          source_external_id: string | null;
          source_evidence: TaskSourceEvidence | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          goal_channel_id: string;
          title: string;
          task_type: TaskType;
          minutes: number;
          status?: TaskStatus;
          fit?: Fit | null;
          week_of: number;
          due_date?: string | null;
          carried_from_week?: number | null;
          pulled_from_week?: number | null;
          completed_at?: string | null;
          source_provider?: ExternalProviderId | null;
          source_external_id?: string | null;
          source_evidence?: TaskSourceEvidence | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          goal_channel_id?: string;
          title?: string;
          task_type?: TaskType;
          minutes?: number;
          status?: TaskStatus;
          fit?: Fit | null;
          week_of?: number;
          due_date?: string | null;
          carried_from_week?: number | null;
          pulled_from_week?: number | null;
          completed_at?: string | null;
          source_provider?: ExternalProviderId | null;
          source_external_id?: string | null;
          source_evidence?: TaskSourceEvidence | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'micro_tasks_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'micro_tasks_goal_channel_fk';
            columns: ['goal_channel_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'goal_channels';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      connected_apps: {
        Row: {
          id: string;
          user_id: string;
          provider: ExternalProviderId;
          is_active: boolean;
          goal_channel_id: string | null;
          last_synced_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider: ExternalProviderId;
          is_active?: boolean;
          goal_channel_id?: string | null;
          last_synced_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider?: ExternalProviderId;
          is_active?: boolean;
          goal_channel_id?: string | null;
          last_synced_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'connected_apps_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'connected_apps_goal_channel_fk';
            columns: ['goal_channel_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'goal_channels';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      // Append-only audit trail of every rebalance move (migration 003). Clients can only read it;
      // apply_task_move writes it, so Insert and Update are typed `never`.
      task_rebalance_history: {
        Row: {
          id: string;
          user_id: string;
          task_id: string;
          source_week: number;
          target_week: number;
          shift_type: ShiftType;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'task_rebalance_history_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_rebalance_history_task_fk';
            columns: ['task_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'micro_tasks';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      // Provider tokens (migration 005). Server only: no browser role can read it, so it is reached
      // only through the service-role client in lib/supabase/admin.ts. Never import its Row type into
      // a client component; clients get IntegrationAccount (types/integrations.ts) instead.
      integration_credentials: {
        Row: {
          id: string;
          user_id: string;
          provider: ExternalProviderId;
          auth_type: IntegrationAuthType;
          access_token: string | null;
          refresh_token: string | null;
          api_key: string | null;
          expires_at: string | null;
          scope: string | null;
          status: CredentialStatus;
          last_error: string | null;
          last_refreshed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider: ExternalProviderId;
          auth_type: IntegrationAuthType;
          access_token?: string | null;
          refresh_token?: string | null;
          api_key?: string | null;
          expires_at?: string | null;
          scope?: string | null;
          status?: CredentialStatus;
          last_error?: string | null;
          last_refreshed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider?: ExternalProviderId;
          auth_type?: IntegrationAuthType;
          access_token?: string | null;
          refresh_token?: string | null;
          api_key?: string | null;
          expires_at?: string | null;
          scope?: string | null;
          status?: CredentialStatus;
          last_error?: string | null;
          last_refreshed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'integration_credentials_app_fk';
            columns: ['user_id', 'provider'];
            isOneToOne: true;
            referencedRelation: 'connected_apps';
            referencedColumns: ['user_id', 'provider'];
          },
        ];
      };
      // One row per Claude call (migration 011): who, which feature and model, tokens, latency, outcome. It has
      // no prompt or answer column. A signed-in user can read their own rows; only the service-role client in
      // lib/services/llm.ts writes them (reserve_llm_call inserts, the finishing update fills in the result).
      llm_usage_logs: {
        Row: {
          id: string;
          user_id: string;
          feature: LlmFeature;
          model: string;
          input_tokens: number | null;
          output_tokens: number | null;
          latency_ms: number | null;
          outcome: LlmOutcome;
          created_at: string;
        };
        // Reserved by reserve_llm_call, never inserted directly by the app, so Insert is typed `never`.
        Insert: never;
        // Only how the call ended can be recorded, and only once (the database guard refuses anything else).
        Update: {
          input_tokens?: number | null;
          output_tokens?: number | null;
          latency_ms?: number | null;
          outcome?: LlmOutcome;
        };
        Relationships: [
          {
            foreignKeyName: 'llm_usage_logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      // The goal model (migration 013, MOM-107). Only services in lib/services/ touch these tables. A signed-in
      // person reaches their own rows through RLS; the service role reaches only sources, target_sources and
      // entries (ingestion without a session).
      person_settings: {
        Row: PersonSettingsRow;
        Insert: {
          user_id: string;
          time_zone?: string | null;
          week_start?: number | null;
          day_end?: string | null;
          tone?: Tone | null;
          reminders?: ReminderMode | null;
          check_ins?: CheckInMode | null;
          celebrations?: CelebrationLevel | null;
          balance_mentions?: BalanceMention | null;
          review_depth?: ReviewDepth | null;
          review_planning?: ReviewPlanningMode | null;
          quiet_times?: Json[] | null;
          slipping_periods?: number | null;
          planning_weekday?: number | null;
          planning_time?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          time_zone?: string | null;
          week_start?: number | null;
          day_end?: string | null;
          tone?: Tone | null;
          reminders?: ReminderMode | null;
          check_ins?: CheckInMode | null;
          celebrations?: CelebrationLevel | null;
          balance_mentions?: BalanceMention | null;
          review_depth?: ReviewDepth | null;
          review_planning?: ReviewPlanningMode | null;
          quiet_times?: Json[] | null;
          slipping_periods?: number | null;
          planning_weekday?: number | null;
          planning_time?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'person_settings_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      person_day_types: {
        Row: PersonDayTypeRow;
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          capacity_unit?: CapacityUnit | null;
          capacity_amount?: number | null;
          reminder_time?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          capacity_unit?: CapacityUnit | null;
          capacity_amount?: number | null;
          reminder_time?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'person_day_types_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      person_priorities: {
        Row: PersonPriorityRow;
        Insert: {
          id?: string;
          user_id: string;
          label: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          label?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'person_priorities_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      person_handling_rules: {
        Row: PersonHandlingRuleRow;
        Insert: {
          id?: string;
          user_id: string;
          rule_text: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          rule_text?: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'person_handling_rules_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      // No delete for any API role: a person parks a goal.
      goals: {
        Row: GoalRow;
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          why?: string | null;
          // No database default: the person's own date (setup proposes today visibly). The database requires both of
          // these unless the goal is parked (goals_shape_start_required, migration 014), so leaving one out for any
          // other goal is refused there, not here.
          start_date?: string | null;
          shape?: GoalShape | null;
          end_date?: string | null;
          block_weeks?: number | null;
          state?: GoalState;
          return_kind?: ReturnKind | null;
          return_date?: string | null;
          return_note?: string | null;
          completion_mode?: CompletionMode | null;
          tone?: Tone | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          why?: string | null;
          start_date?: string | null;
          shape?: GoalShape | null;
          end_date?: string | null;
          block_weeks?: number | null;
          state?: GoalState;
          return_kind?: ReturnKind | null;
          return_date?: string | null;
          return_note?: string | null;
          completion_mode?: CompletionMode | null;
          tone?: Tone | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'goals_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      // No delete for any API role: a target with history stays.
      targets: {
        Row: TargetRow;
        Insert: {
          id?: string;
          user_id: string;
          goal_id: string;
          title: string;
          measure: Measure;
          unit?: string | null;
          role: TargetRole;
          period_kind: PeriodKind;
          due_date?: string | null;
          slot_weekdays?: number[] | null;
          floor?: number | null;
          aspiration?: number | null;
          qualifying_threshold?: number | null;
          carry_over_kind: CarryOverKind;
          completion_mode?: CompletionMode | null;
          tone?: Tone | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          goal_id?: string;
          title?: string;
          measure?: Measure;
          unit?: string | null;
          role?: TargetRole;
          period_kind?: PeriodKind;
          due_date?: string | null;
          slot_weekdays?: number[] | null;
          floor?: number | null;
          aspiration?: number | null;
          qualifying_threshold?: number | null;
          carry_over_kind?: CarryOverKind;
          completion_mode?: CompletionMode | null;
          tone?: Tone | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'targets_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'targets_goal_fk';
            columns: ['goal_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'goals';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      work_items: {
        Row: WorkItemRow;
        Insert: {
          id?: string;
          user_id: string;
          goal_id: string;
          target_id?: string | null;
          kind: WorkItemKind;
          title: string;
          sort_order?: number;
          due_date?: string | null;
          // Required for a deadline task, with no default: the person answers whether the date can move.
          date_can_move?: boolean | null;
          estimate_minutes?: number | null;
          completed_at?: string | null;
          completed_via?: CompletedVia | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          goal_id?: string;
          target_id?: string | null;
          kind?: WorkItemKind;
          title?: string;
          sort_order?: number;
          due_date?: string | null;
          date_can_move?: boolean | null;
          estimate_minutes?: number | null;
          completed_at?: string | null;
          completed_via?: CompletedVia | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'work_items_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_items_goal_fk';
            columns: ['goal_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'goals';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'work_items_target_fk';
            columns: ['target_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'targets';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      work_item_steps: {
        Row: WorkItemStepRow;
        Insert: {
          id?: string;
          user_id: string;
          work_item_id: string;
          title: string;
          sort_order?: number;
          completed_at?: string | null;
          completed_via?: CompletedVia | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          work_item_id?: string;
          title?: string;
          sort_order?: number;
          completed_at?: string | null;
          completed_via?: CompletedVia | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'work_item_steps_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_item_steps_item_fk';
            columns: ['work_item_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'work_items';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      sources: {
        Row: SourceRow;
        Insert: {
          id?: string;
          user_id: string;
          kind: SourceKind;
          provider?: ExternalProviderId | null;
          label: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          kind?: SourceKind;
          provider?: ExternalProviderId | null;
          label?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sources_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      // The person's binding of a source to a target. A binding has no update: it is added or removed.
      target_sources: {
        Row: TargetSourceRow;
        Insert: {
          target_id: string;
          source_id: string;
          user_id: string;
          metric?: QuantityMetric | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'target_sources_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'target_sources_target_fk';
            columns: ['target_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'targets';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'target_sources_source_fk';
            columns: ['source_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'sources';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      // Raw records, never totals. A signed-in person inserts only through their own manual sources and cannot
      // update or delete (a removal is an entry_corrections row); the service role inserts and updates synced ones.
      entries: {
        Row: EntryRow;
        Insert: {
          id?: string;
          user_id: string;
          target_id: string;
          source_id: string;
          source_record_id: string;
          work_item_id?: string | null;
          occurred_at: string;
          value: number;
          evidence?: Record<string, Json | undefined>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          target_id?: string;
          source_id?: string;
          source_record_id?: string;
          work_item_id?: string | null;
          occurred_at?: string;
          value?: number;
          evidence?: Record<string, Json | undefined>;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'entries_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'entries_target_fk';
            columns: ['target_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'targets';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'entries_source_fk';
            columns: ['source_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'sources';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'entries_work_item_fk';
            columns: ['work_item_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'work_items';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      // The person's word on one source record, keyed to the source's own record id (no foreign key to entries, so
      // a resync cannot undo it). Restoring deletes the row.
      entry_corrections: {
        Row: EntryCorrectionRow;
        Insert: {
          id?: string;
          user_id: string;
          source_id: string;
          source_record_id: string;
          action: CorrectionAction;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          source_id?: string;
          source_record_id?: string;
          action?: CorrectionAction;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'entry_corrections_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'entry_corrections_source_fk';
            columns: ['source_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'sources';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      // Append-only: the person's session inserts a snapshot before a re-baseline; no role updates or deletes one.
      period_snapshots: {
        Row: PeriodSnapshotRow;
        Insert: {
          id?: string;
          user_id: string;
          target_id: string;
          period_start: string;
          period_end: string;
          time_zone: string;
          week_start?: number | null;
          day_end?: string | null;
          measure: Measure;
          unit?: string | null;
          role: TargetRole;
          period_kind: PeriodKind;
          slot_weekdays?: number[] | null;
          floor?: number | null;
          aspiration?: number | null;
          qualifying_threshold?: number | null;
          carry_over_kind: CarryOverKind;
          created_at?: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'period_snapshots_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'period_snapshots_target_fk';
            columns: ['target_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'targets';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      // Setup values taken from a suggestion (migration 017). The save writes them in the person's session; a person may
      // read their own and answer an unanswered one (answered_at and outcome are the only updatable columns); no delete.
      starting_points: {
        Row: StartingPointRow;
        Insert: {
          id?: string;
          user_id: string;
          subject_kind: StartingPointKind;
          day_type_id?: string | null;
          goal_id?: string | null;
          target_id?: string | null;
          work_item_id?: string | null;
          field: string;
          created_at?: string;
        };
        Update: {
          answered_at?: string | null;
          outcome?: StartingPointOutcome | null;
        };
        Relationships: [
          {
            foreignKeyName: 'starting_points_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'starting_points_day_type_fk';
            columns: ['day_type_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'person_day_types';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'starting_points_goal_fk';
            columns: ['goal_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'goals';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'starting_points_target_fk';
            columns: ['target_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'targets';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'starting_points_work_item_fk';
            columns: ['work_item_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'work_items';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      // Append-only (migration 018): the person's session inserts a finished review once per week; no role updates or
      // deletes one. finished_at is set by a trigger, so an insert never needs to send it.
      weekly_reviews: {
        Row: WeeklyReviewRow;
        Insert: {
          id?: string;
          user_id: string;
          week_start: string;
          week_end: string;
          recap: Json;
          adjustment_kind?: ReviewAdjustmentKind | null;
          adjustment?: Json | null;
          adjustment_outcome?: ReviewAdjustmentOutcome | null;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'weekly_reviews_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      // Migration 019: a pick is added and removed, never edited (no update grant).
      week_plan_picks: {
        Row: WeekPlanPickRow;
        Insert: {
          id?: string;
          user_id: string;
          work_item_id: string;
          plan_date: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'week_plan_picks_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'week_plan_picks_work_item_fk';
            columns: ['work_item_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'work_items';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      // Migration 019: a date's kind can change, but only its day_type_id (a column grant): never its date or owner.
      week_plan_day_types: {
        Row: WeekPlanDayTypeRow;
        Insert: {
          id?: string;
          user_id: string;
          plan_date: string;
          day_type_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          day_type_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'week_plan_day_types_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'week_plan_day_types_day_type_fk';
            columns: ['day_type_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'person_day_types';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
    };
    Views: Record<never, never>;
    // handle_new_user and the other trigger functions are not executable by anon, authenticated or service_role
    // (migrations 002, 004 and 012), and seed_career_pivot is not executable by anon or authenticated (server code
    // with the service role key can still run it, for dev seeding), so none of them is exposed. A signed-in user
    // can call apply_task_move, create_goal_with_week_one_plan and (since migration 015) save_guided_setup, and nothing else.
    Functions: {
      // Creates a wizard goal and its week 1 tasks in one transaction (migration 009). The owner is
      // auth.uid(); there is no user id, status or completed_at argument, every task is 'todo' in week 1, and
      // a failure on any task rolls the goal back. Returns the new goal.
      create_goal_with_week_one_plan: {
        Args: {
          p_channel_key: string;
          p_title: string;
          p_goal_type: GoalType | null;
          p_preferences: GoalPreferences;
          p_criteria: GoalCriterion[];
          p_start_date: string;
          p_target_date: string | null;
          p_tasks: WeekOneTaskArg[];
        };
        Returns: GoalChannelRow;
      };
      // Moves one unfinished task to another week and records it, in one transaction. Returns false
      // when the task is not eligible (not theirs, already done, or not in p_from_week).
      apply_task_move: {
        Args: {
          p_task_id: string;
          p_from_week: number;
          p_to_week: number;
          p_action: ShiftType;
          p_due_date: string | null;
        };
        Returns: boolean;
      };
      // Reserves one Claude call for a user, or says which limit stopped it (migration 011). Executable by the
      // service role only, never by a signed-in browser. Returns { allowed, reason, retry_after_seconds, log_id }.
      reserve_llm_call: {
        Args: {
          p_user_id: string;
          p_feature: LlmFeature;
          p_model: string;
          p_min_interval_seconds: number;
          p_user_daily_cap: number;
          p_overall_daily_cap: number;
        };
        Returns: unknown;
      };
      // Saves an approved guided setup in one transaction (migration 015, MOM-111): the person's settings, day types,
      // priorities, goals, targets, work items, steps and bindings, or nothing. The owner is auth.uid() and the payload
      // has no user id. First setup only: it refuses (SQLSTATE MS001) when the person already has a goal. The payload is
      // built by toSavePayload() in lib/setup/rows.ts. Returns { goals, targets, work_items, steps, bindings }. Since
      // migration 017 (MOM-134) it also reads an optional "starting_points" list of saved column names on the person, each
      // day type, goal, target and work item, and marks those values; the answer is unchanged.
      save_guided_setup: {
        Args: { p_payload: Json };
        Returns: unknown;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

// ---------------------------------------------------------------------------
// Table helpers and domain aliases
// ---------------------------------------------------------------------------

type PublicTables = Database['public']['Tables'];

export type Tables<T extends keyof PublicTables> = PublicTables[T]['Row'];
export type TablesInsert<T extends keyof PublicTables> = PublicTables[T]['Insert'];
export type TablesUpdate<T extends keyof PublicTables> = PublicTables[T]['Update'];

export type User = Tables<'users'>;
export type GoalChannel = Tables<'goal_channels'>;
export type MicroTask = Tables<'micro_tasks'>;
export type TaskRebalanceHistory = Tables<'task_rebalance_history'>;
// Provider tokens live in integration_credentials (server only), not on this row, so a ConnectedApp is
// safe to send to the client.
export type ConnectedApp = Tables<'connected_apps'>;
export type ConnectedAppPublic = ConnectedApp;
// Server only. Holds secrets: never pass it to a client component or return it from an action.
export type IntegrationCredential = Tables<'integration_credentials'>;

// The goal model (migration 013). Not to be confused with the old GoalChannel and MicroTask above.
export type PersonSettings = Tables<'person_settings'>;
export type PersonDayType = Tables<'person_day_types'>;
export type PersonPriority = Tables<'person_priorities'>;
export type PersonHandlingRule = Tables<'person_handling_rules'>;
export type Goal = Tables<'goals'>;
export type Target = Tables<'targets'>;
export type WorkItem = Tables<'work_items'>;
export type WorkItemStep = Tables<'work_item_steps'>;
export type Source = Tables<'sources'>;
export type TargetSource = Tables<'target_sources'>;
export type Entry = Tables<'entries'>;
export type EntryCorrection = Tables<'entry_corrections'>;
export type PeriodSnapshot = Tables<'period_snapshots'>;
export type StartingPoint = Tables<'starting_points'>;
export type WeeklyReview = Tables<'weekly_reviews'>;
export type WeekPlanPick = Tables<'week_plan_picks'>;
export type WeekPlanDayType = Tables<'week_plan_day_types'>;

export type GoalChannelInsert = TablesInsert<'goal_channels'>;
export type GoalChannelUpdate = TablesUpdate<'goal_channels'>;
export type MicroTaskInsert = TablesInsert<'micro_tasks'>;
export type MicroTaskUpdate = TablesUpdate<'micro_tasks'>;
export type ConnectedAppInsert = TablesInsert<'connected_apps'>;
export type ConnectedAppUpdate = TablesUpdate<'connected_apps'>;
