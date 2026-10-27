// The Google Calendar client and normalizer (MOM-38, docs/INTEGRATIONS_SPEC.md §3.C). Pure HTTP and Zod: it never
// touches Supabase and never reads an environment variable. The caller passes the user's own access token (from
// getMyAccessToken / getAccessToken, which refreshes it when it has expired).
//
// Written against Google's public Calendar API (https://developers.google.com/calendar/api/v3/reference/events/list:
// GET /calendar/v3/calendars/primary/events, which the calendar.readonly scope allows). With singleEvents=true a
// recurring event comes back as one item per occurrence, each with its own id, so an id is a stable external id.
// There is no recorded real response in the repo yet: the tests use responses built from Google's documentation.
//
// What an event becomes (an InboundActivityPayload), following the spec's mapping rules:
//   externalId        event.id
//   timestamp         event.end.dateTime, as UTC
//   title             the fixed text 'Calendar event'. The event's own title is never requested or kept (MOM-102):
//                     the goal model reads the calendar for busy and free time, which needs only the time block.
//   durationMinutes   event.end minus event.start
//   metrics.eventCompleted   true when the event's end has passed and it was not cancelled
// Only the user's primary calendar is read. All-day events (they have a date, not a dateTime) are not timed blocks,
// so they are counted and set aside, not turned into activities.

import { z } from 'zod';
import type { InboundActivityPayload } from '@/lib/services/integrations';
import {
  HEADER_SAFE,
  minutesBetween,
  requestJson,
  type ActivityPage,
  type AdapterDeps,
  type AdapterResult,
  type RejectedItem,
} from './shared';

export const GOOGLE_EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
// INTEGRATIONS_SPEC.md §3.C: career_pivot / productivity. A caller that knows the user's channel passes it.
export const GOOGLE_TARGET_CHANNEL = 'career_pivot';
export const GOOGLE_MAX_RESULTS = 250;
// What every event is called. The contract needs a title; the person's own event titles are not requested.
export const CALENDAR_EVENT_TITLE = 'Calendar event';
const DEFAULT_MAX_RESULTS = 100;

// ---------------------------------------------------------------------------
// What Google sends (loose: unknown fields are dropped)
// ---------------------------------------------------------------------------

const EventTimeSchema = z.looseObject({
  dateTime: z.string().max(64).optional(),
  date: z.string().max(16).optional(),
});

const GoogleEventSchema = z.looseObject({
  id: z.string().trim().min(1).max(200),
  status: z.string().max(40).optional(),
  start: EventTimeSchema.optional(),
  end: EventTimeSchema.optional(),
});
type GoogleEvent = z.infer<typeof GoogleEventSchema>;

const GoogleEventsPageSchema = z.looseObject({
  items: z.array(z.unknown()).max(2500).default([]),
  nextPageToken: z.string().min(1).max(2048).optional(),
});

// ---------------------------------------------------------------------------
// Normalizing
// ---------------------------------------------------------------------------

export interface GoogleNormalizeOptions {
  targetGoalChannel?: string;
  // What "now" is, for deciding whether an event has elapsed.
  now?: () => Date;
}

type EventOutcome =
  | { kind: 'activity'; data: InboundActivityPayload }
  | { kind: 'set_aside'; why: 'all_day' | 'cancelled' }
  | { kind: 'rejected'; reason: string };

function toActivity(event: GoogleEvent, options: GoogleNormalizeOptions): EventOutcome {
  const cancelled = event.status === 'cancelled';
  const startText = event.start?.dateTime;
  const endText = event.end?.dateTime;

  // A cancelled occurrence can come back with nothing but its id and status.
  if (cancelled && (!startText || !endText)) return { kind: 'set_aside', why: 'cancelled' };
  // An all-day event has a date, not a time: it is not a timed block.
  if (!startText && !endText && event.start?.date && event.end?.date) return { kind: 'set_aside', why: 'all_day' };
  if (!startText || !endText) return { kind: 'rejected', reason: 'The event has no start or end time.' };

  const start = new Date(startText);
  const end = new Date(endText);
  const duration = minutesBetween(start, end);
  if (!duration.ok) return { kind: 'rejected', reason: duration.reason };

  const now = (options.now ?? (() => new Date()))();
  return {
    kind: 'activity',
    data: {
      externalId: event.id,
      provider: 'google_calendar',
      timestamp: end.toISOString(),
      targetGoalChannel: options.targetGoalChannel ?? GOOGLE_TARGET_CHANNEL,
      activityType: 'calendar_block',
      title: CALENDAR_EVENT_TITLE,
      durationMinutes: duration.minutes,
      metrics: { eventCompleted: !cancelled && end.getTime() <= now.getTime() },
    },
  };
}

// Turns one raw Calendar event into an activity, or says why not. Exported for the tests and any caller that already
// holds a parsed event list.
export function normalizeGoogleEvent(raw: unknown, options: GoogleNormalizeOptions = {}): EventOutcome {
  const parsed = GoogleEventSchema.safeParse(raw);
  if (!parsed.success) return { kind: 'rejected', reason: 'The event is not in the shape Google documents.' };
  return toActivity(parsed.data, options);
}

// ---------------------------------------------------------------------------
// The HTTP client
// ---------------------------------------------------------------------------

export interface GoogleListOptions extends GoogleNormalizeOptions {
  // Only events that end after timeMin and start before timeMax.
  timeMin: Date;
  timeMax: Date;
  maxResults?: number;
  // From the previous page's nextPageToken.
  pageToken?: string;
}

export interface GoogleEventsPage extends ActivityPage {
  // All-day and cancelled events that were set aside, counted so nothing disappears silently.
  allDay: number;
  cancelled: number;
  nextPageToken: string | null;
}

// GET events: one page of the user's primary calendar between two instants, as activities. `accessToken` is the
// user's own OAuth access token.
export async function listGoogleCalendarEvents(
  accessToken: string,
  options: GoogleListOptions,
  deps: AdapterDeps = {},
): Promise<AdapterResult<GoogleEventsPage>> {
  if (typeof accessToken !== 'string' || accessToken.length > 4096 || !HEADER_SAFE.test(accessToken)) {
    return { ok: false, reason: 'unauthorized' };
  }
  const { timeMin, timeMax } = options;
  if (Number.isNaN(timeMin.getTime()) || Number.isNaN(timeMax.getTime()) || timeMax <= timeMin) {
    return { ok: false, reason: 'bad_response' };
  }
  if (options.pageToken !== undefined && (options.pageToken.length === 0 || options.pageToken.length > 2048)) {
    return { ok: false, reason: 'bad_response' };
  }

  const query = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: String(Math.min(GOOGLE_MAX_RESULTS, Math.max(1, Math.trunc(options.maxResults ?? DEFAULT_MAX_RESULTS)))),
    // Only what the mapping reads, so the answer carries no title, attendees, descriptions or links.
    fields: 'nextPageToken,items(id,status,start,end)',
  });
  if (options.pageToken) query.set('pageToken', options.pageToken);

  const answer = await requestJson(`${GOOGLE_EVENTS_URL}?${query.toString()}`, { authorization: `Bearer ${accessToken}` }, deps);
  if (!answer.ok) return answer;

  const envelope = GoogleEventsPageSchema.safeParse(answer.data);
  if (!envelope.success) return { ok: false, reason: 'bad_response' };

  const normalizeOptions: GoogleNormalizeOptions = { targetGoalChannel: options.targetGoalChannel, now: options.now ?? deps.now };
  const activities: InboundActivityPayload[] = [];
  const rejected: RejectedItem[] = [];
  let allDay = 0;
  let cancelled = 0;
  envelope.data.items.forEach((raw, index) => {
    const outcome = normalizeGoogleEvent(raw, normalizeOptions);
    if (outcome.kind === 'activity') activities.push(outcome.data);
    else if (outcome.kind === 'rejected') rejected.push({ index, reason: outcome.reason });
    else if (outcome.why === 'all_day') allDay += 1;
    else cancelled += 1;
  });
  return { ok: true, data: { activities, rejected, allDay, cancelled, nextPageToken: envelope.data.nextPageToken ?? null } };
}
