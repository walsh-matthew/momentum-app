# Integration Layer Specification & Provider Adapters

As of 2026-10-21. Blueprint for third-party service ingestion and normalization in Momentum.

> **2026-10-26: five rules here are superseded by [`docs/DOMAIN_MODEL.md`](DOMAIN_MODEL.md) (MOM-106).** They are: evidence never completes a task (§1), ingest creates to-do tasks (§1, §6), the hard-coded target goal channel per provider (§2, §3), placement in a 13-week plan (§6), and the native iOS sync line (§3 B). Each carries a pointer. The `InboundActivityPayload` contract, the adapter rules and the security rules still hold. The old ingestion into tasks (§6) still follows them until MOM-115 retires it; MOM-109 added the entries path beside it (§6, "Entries path").

## 1. Executive Purpose & Architectural Strategy

Momentum ingests activity data from heterogeneous external services (REST APIs, OAuth webhooks, client SDKs) to bring what the user has already done into their plan as evidence, without manual entry fatigue. Evidence never completes a task: the user ticks their own tasks and the system never marks one done on their behalf (`NINETY_DAY_PLAN_CONTEXT.md` §3, §5 rule 6). *(Superseded 2026-10-26 by `DOMAIN_MODEL.md` §1.3, §1.5: completion mode per target, auto from a synced source is allowed, always visible and undoable.)*

To ensure the product can scale from 2 initial integrations to 20+ without breaking existing services or requiring database schema refactoring, all integrations follow the **Adapter Pattern**:
1. **Raw Payload Ingestion:** Providers receive raw external JSON via API polling or Webhook routes.
2. **Adapter Normalization:** Individual provider modules transform external payloads into a unified `InboundActivityPayload` schema.
3. **Core Ingestion Engine:** `@/lib/services/ingestion.ts` validates the normalized payload, places it in one of the user's goal channels and plan weeks, and creates an unfinished task that carries the activity as evidence (see §6). *(Superseded 2026-10-26 by `DOMAIN_MODEL.md` §1.6: ingestion creates entries that move targets.)*

---

## 2. Core Normalized Data Contract (`InboundActivityPayload`)

All provider adapters must output data adhering to this standardized interface in `@/lib/services/integrations.ts`:

`export type ExternalProviderId = 'hevy' | 'apple_health' | 'google_calendar' | 'github' | string;`

`export interface InboundActivityPayload {`
  `externalId: string;             // Unique ID from the source provider (e.g. Hevy workout UUID)`
  `provider: ExternalProviderId;   // Source key ('hevy', 'google_calendar', etc.)`
  `timestamp: string;              // ISO-8601 UTC timestamp of activity occurrence`
  `targetGoalChannel: string;      // Internal Goal Channel key ('physical_fitness', 'career_pivot')`  (superseded routing: the person binds each source to a target, `DOMAIN_MODEL.md` §1.5)
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
* **Auth Method:** the user's own API key in the `api-key` header (a UUID from Hevy's developer settings). It is read from the user's stored credential through the integrations service and passed to the adapter; there is no app-wide Hevy key.
* **Base Endpoint:** `https://api.hevyapp.com/v1/workouts`
* **Target Channel:** `physical_fitness` *(superseded: the person binds the source to a target, `DOMAIN_MODEL.md` §1.5)*
* **Sync Strategy:** Polling via `/v1/workouts` (newest first, 10 a page at most) and `/v1/workouts/{workoutId}`; `/v1/workouts/events` (changes since a date) is not built yet. Hevy also supports webhooks (below).
* **Built (MOM-38):** `lib/adapters/hevy.ts` (`listHevyWorkouts`, `getHevyWorkout`, `normalizeHevyWorkout`), checked against Hevy's published API description and a redacted real response (`tests/fixtures/hevy-workouts.redacted.json`).

**Hevy webhooks.** Hevy lets the user register a webhook in the Hevy app (Settings, Developer). Facts, from the owner's own setup of it:
* The body is only `{"workoutId": "<uuid>"}`: no workout data, so the handler fetches the workout with `getHevyWorkout()` using that user's stored key.
* Authentication is **not a signature**. Hevy sends a static `Authorization` header whose value the user typed into Hevy. It can be checked only against a secret we issued to that user.
* Hevy expects an HTTP 200 within 5 seconds, so the handler must verify, answer, and do the work without waiting on the provider call.
* Hevy's public API description has **no endpoint that registers or lists webhook subscriptions** (checked 2026-10: the description has no webhook path at all). The user pastes our address and token into Hevy by hand.
* Because the only credential is a static header, a webhook route needs a stored per-user token (hashed at rest) to tell which user a call is for; without one it cannot resolve a user id. See "Webhook endpoints" below.

**Hevy Mapping Rules:**
* `externalId` <- `workout.id`
* `timestamp` <- `workout.end_time`
* `title` <- `workout.title` (e.g., "Push Day")
* `durationMinutes` <- `(end_time - start_time)` in minutes
* `metrics.volumeLbs` <- sum of `(reps * weight_kg)` over the sets that have both, converted to pounds (Hevy always sends kilograms), rounded to 0.1
* `metrics.setsCompleted` <- the number of sets in the workout. **Changed in MOM-38:** this rule used to read "count of sets where `indicator == 'completed'`", but Hevy has no such field. Its API returns only logged sets, each with a `type` of `normal`, `warmup`, `dropset` or `failure`, so every set counts, and `metrics.metadata.warmupSets` records how many were warm-ups. The owner should confirm this reading.
* `metrics.metadata` <- `{ exerciseCount, warmupSets }`
* `timestamp` is `end_time` converted to UTC (Hevy sends `+00:00` offsets); a workout that ends before it starts, or lasts more than a day, is refused with a fixed reason.

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
* **Target Channel:** `physical_fitness` *(superseded: the person binds the source to a target, `DOMAIN_MODEL.md` §1.5)*
* **Sync Strategy:** Native iOS Background App Refresh or client Bridge payload. *(Superseded 2026-10-26: no native app is planned; a missing integration is bridged or falls back to manual entry, `DOMAIN_MODEL.md` §1.5.)*

**Apple Health Mapping Rules:**
* `externalId` <- `HKWorkout.uuid`
* `timestamp` <- `HKWorkout.endDate`
* `activityType` <- `HKWorkoutActivityType` (e.g., `running`, `functionalStrengthTraining`)
* `durationMinutes` <- `HKWorkout.duration` in minutes
* `metrics.activeCalories` <- `HKQuantityTypeIdentifierActiveEnergyBurned`

---

### C. Google Calendar / Reminders (OAuth2)
* **Auth Method:** OAuth2 (`Bearer <access_token>`) with Refresh Token rotation.
* **Target Channel:** `career_pivot` / `productivity` *(superseded: the person binds the source to a target, `DOMAIN_MODEL.md` §1.5)*
* **Sync Strategy:** Push Notification Webhook triggers or periodic sync tokens (`/calendar/v3/users/me/calendarList`).
* **Built (MOM-38):** `lib/adapters/google.ts` (`listGoogleCalendarEvents`, `normalizeGoogleEvent`). It lists the primary calendar (`GET /calendar/v3/calendars/primary/events`, allowed by the `calendar.readonly` scope) with `singleEvents=true`, so each occurrence of a recurring event has its own id. All-day events (a `date`, not a `dateTime`) and cancelled events with no times are counted and set aside, not turned into tasks. There is no recorded real Google response yet; the tests use bodies built from Google's documentation.

**Google push notifications.** Facts from Google's documentation, which shape the follow-up:
* A push message has **no body**. The call carries `X-Goog-Channel-ID`, `X-Goog-Channel-Token`, `X-Goog-Resource-State` (`sync` on creation, then `exists`) and `X-Goog-Message-Number` headers, so it only says "something changed"; the handler lists events to find out what.
* A watch channel is registered per user (`events.watch`) with a channel id and a token we choose, and the address must be HTTPS on a domain verified in the Google Cloud console. It cannot be tested on localhost.
* A channel expires (Google returns the expiry when the channel is created; check the current maximum lifetime in its docs before building) and is not renewed by Google: we must register a new one before it lapses, or fall back to polling.
* Messages can repeat or arrive out of order, so the handler keeps the last message number per channel.
* So, like Hevy, a handler needs a stored mapping from channel id and token to a user. See "Webhook endpoints" below.

**Google Calendar Mapping Rules:**
* `externalId` <- `event.id`
* `timestamp` <- `event.end.dateTime`
* `title` <- the fixed text `Calendar event` (the event's own title is never requested or kept; MOM-102)
* `durationMinutes` <- Difference between `event.end` and `event.start`
* `metrics.eventCompleted` <- `true` if event time has elapsed and wasn't canceled

**Connect flow (MOM-62).** The Connected Apps page posts to `/api/integrations/google/start`, which sends the signed-in user to Google's consent screen with the single scope `https://www.googleapis.com/auth/calendar.readonly`, `access_type=offline`, `prompt=consent`, a random `state` and a PKCE S256 challenge. The `state`, the code verifier, the user id and the redirect URI sit in a ten-minute httpOnly, SameSite=Lax cookie scoped to the callback path. Google returns to `/api/auth/callback/google`, an authenticated route (not in `PUBLIC_PATHS`), which refuses a missing session, a missing or expired cookie, a state that does not match, a different user or a different address; reads a denial as `denied`; exchanges the code on the server with the client secret and the verifier; refuses a response that lacks the calendar scope; and passes the validated response to `saveOAuthTokens()`. It always redirects to `/connections?google=<outcome>` with one of a fixed set of outcome codes and clears the cookie: no token, code or provider text goes in an address or a log. The redirect URI to register in the Google Cloud console is `<origin>/api/auth/callback/google` for each origin the app is served from (for example `http://localhost:3000` and the production domain); preview deployments need their own entries. All of this is in `lib/services/googleOAuth.ts`; no component imports it.

**Hevy key form (MOM-62).** A Server Action (`saveHevyApiKey`) passes the pasted key to `saveApiKey()`. The key is checked for shape only; it goes into a password field, is not echoed or kept in client state, and the form returns only a message. Calling Hevy to confirm the key works (for example `GET /v1/user/info`) is not built yet; see `BACKLOG.md`.

---

## 4. Phase 1 vs. Phase 2 Scope Boundary

* **Phase 1 (MOM-13 Implementation):**
  * Define `@/lib/services/integrations.ts` using the `InboundActivityPayload` interface.
  * Implement mock provider adapters (`getMockHevyActivity()`, `getMockCalendarActivity()`).
  * Build UI toggle cards in the Integration Panel that store active states in Supabase `connected_apps` without making live third-party network requests.
* **Phase 2 (Post-MVP):**
  * Real HTTP clients (`@/lib/adapters/hevy.ts`, `@/lib/adapters/google.ts`) utilizing stored API keys/OAuth tokens from `integration_credentials` (via `getAccessToken()` in `@/lib/services/integrations.ts`). **Built in MOM-38**, along with the session-less ingestion entry point (below).
  * Background webhook route handlers at `app/api/webhooks/[provider]/route.ts`. **Not built yet**: they need the webhook endpoint storage below, which needs a migration. Tracked in `BACKLOG.md`.

### Webhook endpoints (planned)

Neither provider's webhook can say which user it is for on its own: Hevy sends a user-chosen static header and a workout id, Google sends headers and no body. So both need a stored per-user record, which one migration can cover for both providers:
* a **hashed** token (the plain value is shown to the user once, to paste into Hevy, or sent to Google as the channel token; only its hash is stored);
* for Google: the channel id, its expiry, the last message number seen, and a renewal step before expiry;
* a route per provider that checks the token **before any database read of user data**, resolves the user id from that record only, answers 200 quickly, and returns the same generic 401 for every failure. The routes are public to the session proxy (`PUBLIC_PATHS`) because they authenticate by token instead.

The "webhook rejects an unauthenticated call" acceptance criterion belongs to that follow-up, and it must be tested on a production or preview deployment, not on localhost (Google needs a verified HTTPS domain).

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

*(This section describes today's code. Under `DOMAIN_MODEL.md` §1.5 and §1.6, MOM-109 changes it to write entries bound to the target the person chose; idempotency, set-aside reporting and the service-role isolation rules carry over.)*

1. **Contract:** each item is checked against `InboundActivityPayloadSchema` (strict: UTC ISO timestamp, lower-case keys, no extra fields). An invalid item is reported as `invalid` and does not stop the batch.
2. **Handler per provider:** Hevy activity is always real; a Google Calendar item with `metrics.eventCompleted === false` (not yet elapsed, or cancelled) is set aside as `activity_not_completed`.
3. **Placement:** `targetGoalChannel` must be one of the user's *active* goal channels. `week_of` is the plan week of the activity's UTC date relative to the channel's `start_date`, and `due_date` is that date. Activity before the channel began, or after plan week 13, is set aside (`before_plan_start`, `after_plan_end`), never squeezed into week 1 or 13. *(Superseded 2026-10-26 by `DOMAIN_MODEL.md` §1.1, §1.2: goals have any timeframe, and placement follows the person's own time anchors.)*
4. **The task:** `task_type` is `event` (a timed, dated item), `minutes` is the rounded duration (at least 1), `status` is `'todo'` and `completed_at` is unset. The normalized activity is kept in `micro_tasks.source_evidence`, with `source_provider` and `source_external_id` (migration 007).
5. **Idempotent:** a provider and external id make at most one task per user, so webhook retries and overlapping polls create nothing new. Re-ingesting never touches a task the user has since edited or ticked.
6. **Set aside, not lost:** every skipped, invalid or failed item appears in the returned summary and is logged (provider, id and reason only).
7. **Scope:** `ingestActivities()` runs as the signed-in user through RLS and only inserts.
8. **No session (MOM-38):** `ingestActivitiesForUser(userId, batch)` in `@/lib/services/ingestionForUser.ts` is for a verified webhook or a sync job. It runs the same core (`runBatch`) with the service-role client, which bypasses RLS, so isolation is the code's job: every query is keyed on the given user id, every insert sets it, and the task table's same-owner foreign key refuses another user's goal channel. The id must be a `VerifiedUserId` (made only by `asVerifiedUserId()`, which checks the shape), and the caller must have resolved it from verified credentials, never from a request body, header or address. The batch is checked before the service-role client is made. `ingestion.ts` itself never imports that client, and a test enforces it.

### Entries path (MOM-109)

`@/lib/services/syncedEntries.ts` turns normalized activity into entries under `DOMAIN_MODEL.md` §1.5 and §1.6. The old path above is left as it is, and nothing calls it today.

1. **Binding, not routing:** the person's `sources` row for the provider and its `target_sources` decide where a record goes. `targetGoalChannel` is never read. A record with no source, or a source with no bound target, makes no entry and returns a fixed reason (`no_source`, `no_bound_target`) with plain wording.
2. **One entry per bound target:** keyed by target, source and the provider's own record id, so a resync is the same entry (updated if the provider changed the workout, untouched if not). Hevy maps as: a count is 1; time is `durationMinutes`; a quantity is the metric its unit names (lb or lbs: `volumeLbs`, kg: `volumeLbs` converted, sets: `setsCompleted`, minutes: `durationMinutes`); a checklist target takes no workout. A target whose value would be 0 or missing, or whose unit is not one of these, makes no entry and says which rule. `occurred_at` is the activity `timestamp`; `evidence` keeps the activity type, title, duration and metrics.
3. **Corrections survive a resync:** the sync never reads, writes or deletes `entry_corrections` (the service role has no grant on it), and it deletes no entry. A workout deleted in Hevy keeps its entry.
4. **Merges are suggested, never silent:** `listMergeSuggestions()` returns one suggestion per group of possible duplicates (`lib/entries/mergeSuggestions.ts`): the same target, one manual and one synced entry, neither hidden, 4 hours apart at most and, for time and quantity, values within 25%. It writes nothing.
5. **A failing source:** a sync that fails for a reason only the person can fix sets `integration_credentials.status` (`needs_reauth` for a refused key, `error` otherwise) and returns `notice: 'raised'` once; later failures are quiet until the key is saved again or a sync succeeds. Timeouts, network errors, 429 and 5xx change nothing and raise no notice.
6. **Who runs as whom:** `syncHevyEntries()` reads the bindings through the signed-in person's session (the service role cannot read `targets`) and writes entries with the service-role client, keyed on the verified user id.
