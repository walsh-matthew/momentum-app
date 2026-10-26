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

// The two places the app calls Claude, and how a call can end. Match llm_usage_logs.feature and .outcome
// (migration 011). 'pending' is a call that has been reserved but not yet recorded as finished.
export const LLM_FEATURES = ['rebalance', 'week_one_plan'] as const;
export type LlmFeature = (typeof LLM_FEATURES)[number];
export const LLM_OUTCOMES = ['pending', 'ok', 'refused', 'provider_rate_limited', 'unavailable', 'bad_output', 'not_configured'] as const;
export type LlmOutcome = (typeof LLM_OUTCOMES)[number];

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
    };
    Views: Record<never, never>;
    // handle_new_user and the other trigger functions are not executable by anon, authenticated or service_role
    // (migrations 002, 004 and 012), and seed_career_pivot is not executable by anon or authenticated (server code
    // with the service role key can still run it, for dev seeding), so none of them is exposed. A signed-in user
    // can call apply_task_move and create_goal_with_week_one_plan, and nothing else.
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

export type GoalChannelInsert = TablesInsert<'goal_channels'>;
export type GoalChannelUpdate = TablesUpdate<'goal_channels'>;
export type MicroTaskInsert = TablesInsert<'micro_tasks'>;
export type MicroTaskUpdate = TablesUpdate<'micro_tasks'>;
export type ConnectedAppInsert = TablesInsert<'connected_apps'>;
export type ConnectedAppUpdate = TablesUpdate<'connected_apps'>;
