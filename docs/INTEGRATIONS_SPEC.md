# Integration Layer Specification & Provider Adapters

As of 2026-10-21. Blueprint for third-party service ingestion and normalization in Momentum.

## 1. Executive Purpose & Architectural Strategy

Momentum ingests activity data from heterogeneous external services (REST APIs, OAuth webhooks, client SDKs) to bring what the user has already done into their plan as evidence, without manual entry fatigue. Evidence never completes a task: the user ticks their own tasks and the system never marks one done on their behalf (`NINETY_DAY_PLAN_CONTEXT.md` §3, §5 rule 6).

To ensure the product can scale from 2 initial integrations to 20+ without breaking existing services or requiring database schema refactoring, all integrations follow the **Adapter Pattern**:
1. **Raw Payload Ingestion:** Providers receive raw external JSON via API polling or Webhook routes.
2. **Adapter Normalization:** Individual provider modules transform external payloads into a unified `InboundActivityPayload` schema.
3. **Core Ingestion Engine:** `@/lib/services/ingestion.ts` validates the normalized payload, places it in one of the user's goal channels and plan weeks, and creates an unfinished task that carries the activity as evidence (see §6).

---

## 2. Core Normalized Data Contract (`InboundActivityPayload`)

All provider adapters must output data adhering to this standardized interface in `@/lib/services/integrations.ts`:

`export type ExternalProviderId = 'hevy' | 'apple_health' | 'google_calendar' | 'github' | string;`

`export interface InboundActivityPayload {`
  `externalId: string;             // Unique ID from the source provider (e.g. Hevy workout UUID)`
  `provider: ExternalProviderId;   // Source key ('hevy', 'google_calendar', etc.)`
  `timestamp: string;              // ISO-8601 UTC timestamp of activity occurrence`
  `targetGoalChannel: string;      // Internal Goal Channel key ('physical_fitness', 'career_pivot')`
  `activityType: string;           // Provider action type ('strength_workout', 'calendar_block')`
  `title: string;                  // Presentation label (e.g. "Upper Body Strength", "Focus Time")`
  `durationMinutes: number;        // Active duration in minutes`
  `metrics: {`
    `volumeLbs?: number;           // Weight lifting volume`
    `setsCompleted?: number;       // Completed sets count`
    `activeCalories?: number;      // Caloric burn / energy`
    `eventCompleted?: boolean;     // Binary check for calendar events/tasks`
    `metadata?: Record<string, any>; // Flexible extension store for provider-specific extras`
  `};`
`}`

---

## 3. Provider Specifications

### A. Hevy Strength Training (REST API)
* **Auth Method:** Direct API key header (`api-key: <HEVY_API_KEY>`).
* **Base Endpoint:** `https://api.hevyapp.com/v1/workouts`
* **Target Channel:** `physical_fitness`
* **Sync Strategy:** Polling via `/v1/workouts/events` (or `/v1/workouts`).

**Hevy Mapping Rules:**
* `externalId` <- `workout.id`
* `timestamp` <- `workout.end_time`
* `title` <- `workout.title` (e.g., "Push Day")
* `durationMinutes` <- `(end_time - start_time)` in minutes
* `metrics.volumeLbs` <- sum of `(reps * weight_kg/lbs)` across all completed sets
* `metrics.setsCompleted` <- count of sets where `indicator == 'completed'`

**Sample Mock Ingest Payload (for MOM-13 development):**
{
"externalId": "hev_w_8f9a21b",
"provider": "hevy",
"timestamp": "2026-10-21T07:15:00Z",
"targetGoalChannel": "physical_fitness",
"activityType": "strength_workout",
"title": "Upper Body Strength",
"durationMinutes": 45,
"metrics": {
"volumeLbs": 12450,
"setsCompleted": 16,
"metadata": { "primary_muscle": "chest_shoulders" }
}
}


---

### B. Apple Health / Apple Fitness (Client Sync / Webhook)
* **Auth Method:** Device Local Sync / OAuth Grant Token.
* **Target Channel:** `physical_fitness`
* **Sync Strategy:** Native iOS Background App Refresh or client Bridge payload.

**Apple Health Mapping Rules:**
* `externalId` <- `HKWorkout.uuid`
* `timestamp` <- `HKWorkout.endDate`
* `activityType` <- `HKWorkoutActivityType` (e.g., `running`, `functionalStrengthTraining`)
* `durationMinutes` <- `HKWorkout.duration` in minutes
* `metrics.activeCalories` <- `HKQuantityTypeIdentifierActiveEnergyBurned`

---

### C. Google Calendar / Reminders (OAuth2)
* **Auth Method:** OAuth2 (`Bearer <access_token>`) with Refresh Token rotation.
* **Target Channel:** `career_pivot` / `productivity`
* **Sync Strategy:** Push Notification Webhook triggers or periodic sync tokens (`/calendar/v3/users/me/calendarList`).

**Google Calendar Mapping Rules:**
* `externalId` <- `event.id`
* `timestamp` <- `event.end.dateTime`
* `title` <- `event.summary`
* `durationMinutes` <- Difference between `event.end` and `event.start`
* `metrics.eventCompleted` <- `true` if event time has elapsed and wasn't canceled

---

## 4. Phase 1 vs. Phase 2 Scope Boundary

* **Phase 1 (MOM-13 Implementation):**
  * Define `@/lib/services/integrations.ts` using the `InboundActivityPayload` interface.
  * Implement mock provider adapters (`getMockHevyActivity()`, `getMockCalendarActivity()`).
  * Build UI toggle cards in the Integration Panel that store active states in Supabase `connected_apps` without making live third-party network requests.
* **Phase 2 (Post-MVP):**
  * Implement real HTTP clients (`@/lib/adapters/hevy.ts`, `@/lib/adapters/google.ts`) utilizing stored API keys/OAuth tokens from `integration_credentials` (via `getAccessToken()` in `@/lib/services/integrations.ts`).
  * Add background webhook route handlers at `app/api/webhooks/[provider]/route.ts`.

---

## 5. Security & Secret Safeguards

1. **Zero Secret Leakage:** Provider API keys and OAuth client secrets MUST NEVER be rendered on client components or stored in frontend state.
2. **Database Storage:** Provider API keys and OAuth tokens live in `integration_credentials` (migration 005), not on `connected_apps`. RLS alone is not enough for secrets: a policy of `auth.uid() = user_id` would still let the owner's browser session (and anything that runs in it, such as an XSS bug) read their own tokens. So that table has RLS on with no policies and no grants for `anon` or `authenticated`: no browser role can read or write it. Only server code using the service-role client (`@/lib/supabase/admin`) does.
3. **User Isolation:** The service-role client bypasses RLS, so `@/lib/services/integrations.ts` enforces isolation itself. Session-bound functions take no user id and read it from the verified session (`getUser()`); `getAccessToken(userId, provider)` is for code with no session (a signed webhook, a sync job) and must be given an id the caller resolved itself, never one a client supplied. `integration_credentials` has a same-owner foreign key to `connected_apps`, which keeps the user's own RLS-protected row as the anchor.
4. **No Secret in Errors or Logs:** Tokens are never logged or returned in an error. Database errors are replaced with fixed wording (a failed CHECK reports the offending row), and the status shown to a client (`IntegrationAccount`, `types/integrations.ts`) has no secret field.
5. **Environment Placeholders:** Local testing keys are stored in `.env.local` and mirrored with placeholder variables in `.env.example`.

---

## 6. Ingestion Engine (`@/lib/services/ingestion.ts`)

`ingestActivities(batch)` turns normalized activity into tasks for the signed-in user.

1. **Contract:** each item is checked against `InboundActivityPayloadSchema` (strict: UTC ISO timestamp, lower-case keys, no extra fields). An invalid item is reported as `invalid` and does not stop the batch.
2. **Handler per provider:** Hevy activity is always real; a Google Calendar item with `metrics.eventCompleted === false` (not yet elapsed, or cancelled) is set aside as `activity_not_completed`.
3. **Placement:** `targetGoalChannel` must be one of the user's *active* goal channels. `week_of` is the plan week of the activity's UTC date relative to the channel's `start_date`, and `due_date` is that date. Activity before the channel began, or after plan week 13, is set aside (`before_plan_start`, `after_plan_end`), never squeezed into week 1 or 13.
4. **The task:** `task_type` is `event` (a timed, dated item), `minutes` is the rounded duration (at least 1), `status` is `'todo'` and `completed_at` is unset. The normalized activity is kept in `micro_tasks.source_evidence`, with `source_provider` and `source_external_id` (migration 007).
5. **Idempotent:** a provider and external id make at most one task per user, so webhook retries and overlapping polls create nothing new. Re-ingesting never touches a task the user has since edited or ticked.
6. **Set aside, not lost:** every skipped, invalid or failed item appears in the returned summary and is logged (provider, id and reason only).
7. **Scope:** it runs as the signed-in user through RLS and only inserts. Code with no session (a signed webhook) needs its own entry point; see `BACKLOG.md`.
