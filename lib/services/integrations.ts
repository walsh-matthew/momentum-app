// Integration layer (docs/INTEGRATIONS_SPEC.md). The only place connected_apps is queried
// (CLAUDE.md, Architectural Directive 1). Server-side only: it reads the request's auth cookies.
//
// Phase 1 (MOM-13): the payload contract, mock adapters, and the toggle state in connected_apps.
// Nothing here makes a network request to a third party.

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SUPPORTED_PROVIDER_IDS } from '@/lib/integrations/catalog';
import type { ConnectedAppInsert, ConnectedAppPublic, ExternalProviderId } from '@/types/database.types';
import type { ServiceResult } from './result';

export type { ExternalProviderId };

// ---------------------------------------------------------------------------
// Normalized contract (INTEGRATIONS_SPEC.md §2)
// ---------------------------------------------------------------------------

export interface InboundActivityPayload {
  externalId: string; // Unique ID from the source provider (e.g. Hevy workout UUID)
  provider: ExternalProviderId; // Source key ('hevy', 'google_calendar', ...)
  timestamp: string; // ISO-8601 UTC timestamp of activity occurrence
  targetGoalChannel: string; // Internal Goal Channel key ('physical_fitness', 'career_pivot')
  activityType: string; // Provider action type ('strength_workout', 'calendar_block')
  title: string; // Presentation label
  durationMinutes: number; // Active duration in minutes
  metrics: {
    volumeLbs?: number; // Weight lifting volume
    setsCompleted?: number; // Completed sets count
    activeCalories?: number; // Caloric burn / energy
    eventCompleted?: boolean; // Binary check for calendar events/tasks
    metadata?: Record<string, unknown>; // Provider-specific extras
  };
}

// Adapter contract: a provider module turns its raw external payload into the normalized one.
// Adapters are pure. They never touch Supabase, and they never mark a task done (the user owns
// completion; docs/NINETY_DAY_PLAN_CONTEXT.md §3).
export interface ProviderAdapter<TRaw = unknown> {
  provider: ExternalProviderId;
  normalize(raw: TRaw): InboundActivityPayload;
}

// ---------------------------------------------------------------------------
// Mock adapters (INTEGRATIONS_SPEC.md §3.A, §3.C). Fixed fixtures, no network.
// ---------------------------------------------------------------------------

// Sample payload from the spec, verbatim.
export function getMockHevyActivity(): InboundActivityPayload {
  return {
    externalId: 'hev_w_8f9a21b',
    provider: 'hevy',
    timestamp: '2026-10-21T07:15:00Z',
    targetGoalChannel: 'physical_fitness',
    activityType: 'strength_workout',
    title: 'Upper Body Strength',
    durationMinutes: 45,
    metrics: {
      volumeLbs: 12450,
      setsCompleted: 16,
      metadata: { primary_muscle: 'chest_shoulders' },
    },
  };
}

// The spec gives mapping rules but no sample for Google Calendar. This follows those rules for
// a finished 60-minute focus block: timestamp is event.end, duration is end minus start.
export function getMockCalendarActivity(): InboundActivityPayload {
  return {
    externalId: 'gcal_e_3c71d0a',
    provider: 'google_calendar',
    timestamp: '2026-10-21T16:00:00Z',
    targetGoalChannel: 'career_pivot',
    activityType: 'calendar_block',
    title: 'Focus Time',
    durationMinutes: 60,
    metrics: {
      eventCompleted: true,
    },
  };
}

// ---------------------------------------------------------------------------
// Connected apps (toggle state)
// ---------------------------------------------------------------------------

// Explicit column list: `credentials` is server-only (INTEGRATIONS_SPEC.md §5) and must never
// reach a client component, so it is never selected here.
const PUBLIC_COLUMNS = 'id, user_id, provider, is_active, goal_channel_id, last_synced_at, created_at, updated_at';

export function isSupportedProvider(value: unknown): value is ExternalProviderId {
  return typeof value === 'string' && (SUPPORTED_PROVIDER_IDS as readonly string[]).includes(value);
}

export async function listConnectedApps(): Promise<ServiceResult<ConnectedAppPublic[]>> {
  const supabase = await createSupabaseServerClient();
  // RLS limits this to the signed-in user's rows.
  const { data, error } = await supabase.from('connected_apps').select(PUBLIC_COLUMNS).order('created_at');
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

// Turns a provider on or off for the signed-in user. Only flips the flag: no OAuth, no API key,
// no request to the provider. Validates its input because it is reachable by a direct Server
// Action POST.
export async function setConnectedAppActive(
  provider: unknown,
  isActive: unknown,
): Promise<ServiceResult<ConnectedAppPublic>> {
  if (!isSupportedProvider(provider)) return { ok: false, error: 'That app is not available yet.' };
  if (typeof isActive !== 'boolean') return { ok: false, error: 'Invalid state.' };

  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return { ok: false, error: 'Sign in to connect apps.' };

  // Upsert on (user_id, provider) leaves `credentials` untouched for an existing row.
  const row: ConnectedAppInsert = { user_id: auth.user.id, provider, is_active: isActive };
  const { data, error } = await supabase
    .from('connected_apps')
    .upsert(row, { onConflict: 'user_id,provider' })
    .select(PUBLIC_COLUMNS)
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

// TODO(MOM-Phase2): real OAuth2 connect flow for Google Calendar (consent redirect, token
// exchange, refresh rotation) and Hevy API-key entry, stored in connected_apps.credentials.
// TODO(MOM-Phase2): real HTTP clients in @/lib/adapters/hevy.ts and @/lib/adapters/google.ts.
// TODO(MOM-Phase2): webhook handlers at app/api/webhooks/[provider]/route.ts.
