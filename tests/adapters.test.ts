// The provider adapters (MOM-38): lib/adapters/hevy.ts and lib/adapters/google.ts. No test here touches the
// network: every call is given a fake `fetch`. The Hevy tests run against a redacted real GET /v1/workouts response
// (tests/fixtures/hevy-workouts.redacted.json). There is no recorded Google response yet, so the Google tests use
// bodies built from Google's Calendar API documentation; they prove the mapping, not Google's current behaviour.
//
// What they hold the adapters to (docs/INTEGRATIONS_SPEC.md §1, §2):
// - every activity an adapter returns passes the ingestion engine's strict InboundActivityPayloadSchema;
// - a bad answer from a provider is a fixed failure word, never a thrown error and never the provider's text;
// - the credential goes only into the right header, and an adapter never touches Supabase, the environment, or a
//   task's status or completed_at.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { getHevyWorkout, listHevyWorkouts, normalizeHevyWorkout } from '@/lib/adapters/hevy';
import { GOOGLE_EVENTS_URL, listGoogleCalendarEvents, normalizeGoogleEvent } from '@/lib/adapters/google';
import { ADAPTER_FAILURES, MAX_RESPONSE_CHARS, minutesBetween } from '@/lib/adapters/shared';
import { InboundActivityPayloadSchema } from '@/lib/services/ingestion';

const readText = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/^﻿/, '');
const FIXTURE = JSON.parse(readText('tests', 'fixtures', 'hevy-workouts.redacted.json'));
const WORKOUT = FIXTURE.workouts[0];
const WORKOUT_ID: string = WORKOUT.id;
const API_KEY = '11111111-2222-4333-8444-555555555555';
const TOKEN = 'ya29.test-access-token_123';

const json = (body: unknown, status = 200) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
// A fake fetch that answers once and remembers how it was called.
const answering = (response: Response | (() => Response)) =>
  vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => (typeof response === 'function' ? response() : response));
const asFetch = (fn: ReturnType<typeof answering>) => ({ fetch: fn as unknown as typeof fetch });
const calledWith = (fn: ReturnType<typeof answering>) => ({
  url: String(fn.mock.calls[0][0]),
  headers: (fn.mock.calls[0][1]?.headers ?? {}) as Record<string, string>,
  init: fn.mock.calls[0][1] as RequestInit,
});

const workoutWith = (over: Record<string, unknown>) => ({ ...structuredClone(WORKOUT), ...over });
const exercise = (sets: unknown[]) => ({ title: 'Bench Press', sets });

// ---------------------------------------------------------------------------
// Hevy
// ---------------------------------------------------------------------------

describe('Hevy: the redacted real response', () => {
  it('turns the one workout into a valid activity', async () => {
    const f = answering(json(FIXTURE));
    const result = await listHevyWorkouts(API_KEY, {}, asFetch(f));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data).toMatchObject({ page: 1, pageCount: 111, rejected: [] });
    expect(result.data.activities).toHaveLength(1);
    const activity = result.data.activities[0];
    expect(InboundActivityPayloadSchema.safeParse(activity).success).toBe(true);
    expect(activity).toMatchObject({
      externalId: WORKOUT_ID,
      provider: 'hevy',
      timestamp: '2026-10-19T18:12:38.000Z',
      targetGoalChannel: 'physical_fitness',
      activityType: 'strength_workout',
      title: 'Upper A (Heavy Bench)',
      durationMinutes: 44.07,
    });
    // 18 logged sets, all of type normal, 6200 lb moved (kg converted once, at the end).
    expect(activity.metrics).toMatchObject({ volumeLbs: 6200, setsCompleted: 18, metadata: { exerciseCount: 6, warmupSets: 0 } });
  });

  it('copes with a set that leaves a key out entirely (the sample has one with no distance)', () => {
    const result = normalizeHevyWorkout(WORKOUT);
    expect(result.ok).toBe(true);
  });

  it('copes with a timed set that has no weight or reps (the rowing machine)', () => {
    const result = normalizeHevyWorkout(workoutWith({ exercises: [exercise([{ type: 'normal', weight_kg: null, reps: null, duration_seconds: 600 }])] }));
    expect(result.ok && result.data.metrics).toMatchObject({ volumeLbs: 0, setsCompleted: 1 });
  });

  it('puts nothing the provider sent beyond the mapped fields into the activity', async () => {
    const f = answering(json(FIXTURE));
    const result = await listHevyWorkouts(API_KEY, {}, asFetch(f));
    if (!result.ok) throw new Error('expected ok');
    const text = JSON.stringify(result.data.activities);
    expect(text).not.toContain('routine_id');
    expect(text).not.toContain('exercise_template_id');
    expect(text).not.toContain('Rowing Machine');
  });
});

describe('Hevy: what a workout becomes', () => {
  it('counts warm-up sets in the total and separately', () => {
    const result = normalizeHevyWorkout(
      workoutWith({
        exercises: [
          exercise([
            { type: 'warmup', weight_kg: 20, reps: 10 },
            { type: 'normal', weight_kg: 100, reps: 5 },
            { type: 'dropset', weight_kg: 60, reps: 8 },
            { type: 'failure', weight_kg: 100, reps: 3 },
          ]),
        ],
      }),
    );
    expect(result.ok && result.data.metrics).toMatchObject({
      setsCompleted: 4,
      metadata: { exerciseCount: 1, warmupSets: 1 },
      // (20x10 + 100x5 + 60x8 + 100x3) = 1480 kg
      volumeLbs: Math.round(1480 * 2.2046226218 * 10) / 10,
    });
  });

  it('a bodyweight set (no weight) adds sets but no volume', () => {
    const result = normalizeHevyWorkout(workoutWith({ exercises: [exercise([{ type: 'normal', weight_kg: null, reps: 12 }])] }));
    expect(result.ok && result.data.metrics).toMatchObject({ volumeLbs: 0, setsCompleted: 1 });
  });

  it('ignores a negative weight or rep count rather than subtracting from the total', () => {
    const result = normalizeHevyWorkout(workoutWith({ exercises: [exercise([{ type: 'normal', weight_kg: -50, reps: 10 }, { type: 'normal', weight_kg: 50, reps: 10 }])] }));
    expect(result.ok && result.data.metrics).toMatchObject({ volumeLbs: Math.round(500 * 2.2046226218 * 10) / 10 });
  });

  it('a workout with no exercises is still a workout, with zero of everything', () => {
    const result = normalizeHevyWorkout(workoutWith({ exercises: [] }));
    expect(result.ok && result.data.metrics).toMatchObject({ volumeLbs: 0, setsCompleted: 0, metadata: { exerciseCount: 0, warmupSets: 0 } });
  });

  it('turns a +00:00 or other offset time into UTC', () => {
    const result = normalizeHevyWorkout(workoutWith({ start_time: '2026-10-19T12:00:00-05:00', end_time: '2026-10-19T13:00:00-05:00' }));
    expect(result.ok && result.data.timestamp).toBe('2026-10-19T18:00:00.000Z');
    expect(result.ok && result.data.durationMinutes).toBe(60);
  });

  it('falls back to "Workout" for a missing, null or blank title, and trims a long one', () => {
    for (const title of [undefined, null, '', '   ']) {
      const result = normalizeHevyWorkout(workoutWith({ title }));
      expect(result.ok && result.data.title).toBe('Workout');
    }
    const long = normalizeHevyWorkout(workoutWith({ title: 'x'.repeat(400) }));
    expect(long.ok && long.data.title).toHaveLength(200);
  });

  it('uses a channel the caller names instead of the default', () => {
    const result = normalizeHevyWorkout(WORKOUT, { targetGoalChannel: 'health' });
    expect(result.ok && result.data.targetGoalChannel).toBe('health');
  });
});

describe('Hevy: workouts it refuses, each with a fixed reason', () => {
  it.each([
    ['an end before the start', { start_time: '2026-10-19T19:00:00Z', end_time: '2026-10-19T18:00:00Z' }],
    ['an unparseable start', { start_time: 'last tuesday' }],
    ['an unparseable end', { end_time: 'later' }],
    ['a workout longer than a day', { start_time: '2026-10-18T00:00:00Z', end_time: '2026-10-19T18:00:00Z' }],
    ['a missing id', { id: undefined }],
    ['a blank id', { id: '  ' }],
    ['a missing start', { start_time: undefined }],
    ['exercises that are not a list', { exercises: 'none' }],
    ['a set with no type', { exercises: [exercise([{ weight_kg: 1, reps: 1 }])] }],
    ['a set whose reps are text', { exercises: [exercise([{ type: 'normal', reps: 'ten' }])] }],
  ])('%s', (_name, over) => {
    const result = normalizeHevyWorkout(workoutWith(over));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/^The (workout|activity|start)/);
  });

  it.each([null, undefined, 'a string', 42, [], true])('a non-object (%j)', (value) => {
    expect(normalizeHevyWorkout(value).ok).toBe(false);
  });

  it('never repeats the provider\'s values in the reason', () => {
    const result = normalizeHevyWorkout(workoutWith({ start_time: 'SECRET-LOOKING-VALUE' }));
    expect(JSON.stringify(result)).not.toContain('SECRET-LOOKING-VALUE');
  });

  it('one bad workout in a page is rejected by position and the rest are kept', async () => {
    const page = { page: 2, page_count: 5, workouts: [WORKOUT, { id: 'broken' }, workoutWith({ id: 'second' })] };
    const result = await listHevyWorkouts(API_KEY, { page: 2 }, asFetch(answering(json(page))));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.activities.map((a) => a.externalId)).toEqual([WORKOUT_ID, 'second']);
    expect(result.data.rejected).toEqual([{ index: 1, reason: expect.any(String) }]);
    expect(result.data).toMatchObject({ page: 2, pageCount: 5 });
  });

  it('every activity from a mixed page still validates', async () => {
    const page = { page: 1, page_count: 1, workouts: [WORKOUT, workoutWith({ id: 'b', title: null }), workoutWith({ id: 'c', exercises: [] })] };
    const result = await listHevyWorkouts(API_KEY, {}, asFetch(answering(json(page))));
    if (!result.ok) throw new Error('expected ok');
    for (const activity of result.data.activities) expect(InboundActivityPayloadSchema.safeParse(activity).success).toBe(true);
  });
});

describe('Hevy: the request', () => {
  it('sends the user\'s key as the api-key header, to the documented address, and nothing else secret', async () => {
    const f = answering(json(FIXTURE));
    await listHevyWorkouts(API_KEY, { page: 3, pageSize: 5 }, asFetch(f));
    const { url, headers, init } = calledWith(f);
    expect(url).toBe('https://api.hevyapp.com/v1/workouts?page=3&pageSize=5');
    expect(headers['api-key']).toBe(API_KEY);
    expect(headers.accept).toBe('application/json');
    expect(Object.keys(headers).map((k) => k.toLowerCase()).sort()).toEqual(['accept', 'api-key']);
    expect(url).not.toContain(API_KEY);
    expect(init.method).toBe('GET');
    expect(init.redirect).toBe('manual');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('clamps the page and page size to what Hevy allows', async () => {
    const f = answering(json(FIXTURE));
    await listHevyWorkouts(API_KEY, { page: -4, pageSize: 500 }, asFetch(f));
    expect(calledWith(f).url).toContain('page=1&pageSize=10');
    const g = answering(json(FIXTURE));
    await listHevyWorkouts(API_KEY, { page: 2.5, pageSize: 0 }, asFetch(g));
    expect(calledWith(g).url).toContain('page=1&pageSize=1');
  });

  it.each([
    ['empty', ''],
    ['with a newline', 'abc\ndef'],
    ['with a space', 'abc def'],
    ['with a carriage return', 'abc\rX-Injected: 1'],
    ['too long', 'a'.repeat(513)],
    ['not a string', 123 as unknown as string],
  ])('a key %s is refused before any request is made', async (_name, key) => {
    const f = answering(json(FIXTURE));
    expect(await listHevyWorkouts(key, {}, asFetch(f))).toEqual({ ok: false, reason: 'unauthorized' });
    expect(await getHevyWorkout(key, WORKOUT_ID, {}, asFetch(f))).toEqual({ ok: false, reason: 'unauthorized' });
    expect(f).not.toHaveBeenCalled();
  });
});

describe('Hevy: one workout by id (the webhook will use this)', () => {
  it('fetches it, checks it is the one asked for, and returns a valid activity', async () => {
    const f = answering(json(WORKOUT));
    const result = await getHevyWorkout(API_KEY, WORKOUT_ID, {}, asFetch(f));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(InboundActivityPayloadSchema.safeParse(result.data).success).toBe(true);
    expect(result.data.externalId).toBe(WORKOUT_ID);
    expect(calledWith(f).url).toBe(`https://api.hevyapp.com/v1/workouts/${WORKOUT_ID}`);
    expect(calledWith(f).headers['api-key']).toBe(API_KEY);
  });

  it.each([
    ['empty', ''],
    ['a path', '../v1/user/info'],
    ['a query', `${WORKOUT_ID}?x=1`],
    ['a slash', `${WORKOUT_ID}/exercises`],
    ['not a uuid', 'abc'],
    ['a uuid with a suffix', `${WORKOUT_ID}x`],
    ['not a string', { id: WORKOUT_ID } as unknown as string],
  ])('an id that is %s never reaches an address', async (_name, id) => {
    const f = answering(json(WORKOUT));
    expect(await getHevyWorkout(API_KEY, id, {}, asFetch(f))).toEqual({ ok: false, reason: 'not_found' });
    expect(f).not.toHaveBeenCalled();
  });

  it('refuses an answer for a different workout than the one asked for', async () => {
    const other = workoutWith({ id: '00000000-0000-0000-0000-0000000000ff' });
    expect(await getHevyWorkout(API_KEY, WORKOUT_ID, {}, asFetch(answering(json(other))))).toEqual({ ok: false, reason: 'bad_response' });
  });

  it('accepts the same id in a different letter case', async () => {
    const id = 'ABCDEF00-0000-4000-8000-000000000001';
    const result = await getHevyWorkout(API_KEY, id, {}, asFetch(answering(json(workoutWith({ id: id.toLowerCase() })))));
    expect(result.ok).toBe(true);
  });

  it('a workout in the wrong shape is a bad response, not a throw', async () => {
    expect(await getHevyWorkout(API_KEY, WORKOUT_ID, {}, asFetch(answering(json({ id: WORKOUT_ID }))))).toEqual({ ok: false, reason: 'bad_response' });
  });
});

// ---------------------------------------------------------------------------
// Google Calendar
// ---------------------------------------------------------------------------

const NOW = new Date('2026-10-20T12:00:00.000Z');
const WINDOW = { timeMin: new Date('2026-10-13T00:00:00Z'), timeMax: new Date('2026-10-20T23:59:59Z'), now: () => NOW };
const timed = (over: Record<string, unknown> = {}) => ({
  kind: 'calendar#event',
  id: 'evt1',
  status: 'confirmed',
  summary: 'Interview prep',
  start: { dateTime: '2026-10-19T09:00:00-05:00', timeZone: 'America/Chicago' },
  end: { dateTime: '2026-10-19T10:30:00-05:00', timeZone: 'America/Chicago' },
  ...over,
});

describe('Google: a timed event', () => {
  it('becomes a valid activity, completed because it has ended', () => {
    const outcome = normalizeGoogleEvent(timed(), { now: () => NOW });
    expect(outcome.kind).toBe('activity');
    if (outcome.kind !== 'activity') return;
    expect(InboundActivityPayloadSchema.safeParse(outcome.data).success).toBe(true);
    expect(outcome.data).toMatchObject({
      externalId: 'evt1',
      provider: 'google_calendar',
      timestamp: '2026-10-19T15:30:00.000Z',
      targetGoalChannel: 'career_pivot',
      activityType: 'calendar_block',
      title: 'Interview prep',
      durationMinutes: 90,
      metrics: { eventCompleted: true },
    });
  });

  it('an event that has not ended yet is not completed', () => {
    const outcome = normalizeGoogleEvent(timed({ end: { dateTime: '2026-10-20T13:00:00Z' }, start: { dateTime: '2026-10-20T11:00:00Z' } }), { now: () => NOW });
    expect(outcome.kind === 'activity' && outcome.data.metrics).toEqual({ eventCompleted: false });
  });

  it('an event ending exactly now counts as ended', () => {
    const outcome = normalizeGoogleEvent(timed({ start: { dateTime: '2026-10-20T11:00:00Z' }, end: { dateTime: '2026-10-20T12:00:00Z' } }), { now: () => NOW });
    expect(outcome.kind === 'activity' && outcome.data.metrics).toEqual({ eventCompleted: true });
  });

  it('a cancelled event with times is never completed, even though it ended', () => {
    const outcome = normalizeGoogleEvent(timed({ status: 'cancelled' }), { now: () => NOW });
    expect(outcome.kind === 'activity' && outcome.data.metrics).toEqual({ eventCompleted: false });
  });

  it('falls back to "Calendar event" for a missing or blank title, and trims a long one', () => {
    for (const summary of [undefined, '', '   ']) {
      const outcome = normalizeGoogleEvent(timed({ summary }), { now: () => NOW });
      expect(outcome.kind === 'activity' && outcome.data.title).toBe('Calendar event');
    }
    const long = normalizeGoogleEvent(timed({ summary: 'y'.repeat(900) }), { now: () => NOW });
    expect(long.kind === 'activity' && long.data.title).toHaveLength(200);
  });

  it('uses a channel the caller names', () => {
    const outcome = normalizeGoogleEvent(timed(), { now: () => NOW, targetGoalChannel: 'productivity' });
    expect(outcome.kind === 'activity' && outcome.data.targetGoalChannel).toBe('productivity');
  });

  it('keeps the id of each occurrence of a recurring event distinct', () => {
    const a = normalizeGoogleEvent(timed({ id: 'series_20261019T140000Z' }), { now: () => NOW });
    const b = normalizeGoogleEvent(timed({ id: 'series_20261020T140000Z' }), { now: () => NOW });
    expect(a.kind === 'activity' && b.kind === 'activity' && a.data.externalId !== b.data.externalId).toBe(true);
  });
});

describe('Google: events that are set aside or refused', () => {
  it('an all-day event (a date, not a time) is set aside, not turned into a task', () => {
    const outcome = normalizeGoogleEvent({ id: 'day', status: 'confirmed', summary: 'Holiday', start: { date: '2026-10-19' }, end: { date: '2026-10-20' } });
    expect(outcome).toEqual({ kind: 'set_aside', why: 'all_day' });
  });

  it('a cancelled occurrence that arrives with only an id and status is set aside', () => {
    expect(normalizeGoogleEvent({ id: 'gone', status: 'cancelled' })).toEqual({ kind: 'set_aside', why: 'cancelled' });
  });

  it('a confirmed event with no times is refused', () => {
    expect(normalizeGoogleEvent({ id: 'x', status: 'confirmed', summary: 'No times' }).kind).toBe('rejected');
  });

  it('an event with only a start time is refused', () => {
    expect(normalizeGoogleEvent({ id: 'x', start: { dateTime: '2026-10-19T09:00:00Z' } }).kind).toBe('rejected');
  });

  it.each([
    ['an end before the start', { start: { dateTime: '2026-10-19T10:00:00Z' }, end: { dateTime: '2026-10-19T09:00:00Z' } }],
    ['an unparseable time', { start: { dateTime: 'noon' }, end: { dateTime: 'one' } }],
    ['an event longer than a day', { start: { dateTime: '2026-10-17T10:00:00Z' }, end: { dateTime: '2026-10-19T10:00:00Z' } }],
    ['no id', { id: undefined }],
    ['a blank id', { id: '' }],
  ])('%s', (_name, over) => {
    expect(normalizeGoogleEvent(timed(over), { now: () => NOW }).kind).toBe('rejected');
  });

  it.each([null, undefined, 'event', 5, []])('a non-object (%j)', (value) => {
    expect(normalizeGoogleEvent(value).kind).toBe('rejected');
  });
});

describe('Google: the request and the page', () => {
  const page = (items: unknown[], extra: object = {}) => ({ kind: 'calendar#events', items, ...extra });

  it('asks for single occurrences, in order, with only the fields it reads, using a bearer token', async () => {
    const f = answering(json(page([timed()])));
    await listGoogleCalendarEvents(TOKEN, WINDOW, asFetch(f));
    const { url, headers, init } = calledWith(f);
    const parsed = new URL(url);
    expect(`${parsed.origin}${parsed.pathname}`).toBe(GOOGLE_EVENTS_URL);
    expect(parsed.searchParams.get('singleEvents')).toBe('true');
    expect(parsed.searchParams.get('orderBy')).toBe('startTime');
    expect(parsed.searchParams.get('timeMin')).toBe('2026-10-13T00:00:00.000Z');
    expect(parsed.searchParams.get('timeMax')).toBe('2026-10-20T23:59:59.000Z');
    expect(parsed.searchParams.get('fields')).toBe('nextPageToken,items(id,status,summary,start,end)');
    expect(headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(url).not.toContain(TOKEN);
    expect(init.method).toBe('GET');
    expect(init.redirect).toBe('manual');
  });

  it('returns activities, counts what was set aside, rejects by position, and passes on the next page token', async () => {
    const body = page(
      [
        timed({ id: 'a' }),
        { id: 'b', start: { date: '2026-10-19' }, end: { date: '2026-10-20' } },
        { id: 'c', status: 'cancelled' },
        { id: 'd' },
        timed({ id: 'e', summary: 'Second' }),
      ],
      { nextPageToken: 'tok_2' },
    );
    const result = await listGoogleCalendarEvents(TOKEN, WINDOW, asFetch(answering(json(body))));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.activities.map((a) => a.externalId)).toEqual(['a', 'e']);
    expect(result.data).toMatchObject({ allDay: 1, cancelled: 1, nextPageToken: 'tok_2' });
    expect(result.data.rejected).toEqual([{ index: 3, reason: expect.any(String) }]);
    for (const activity of result.data.activities) expect(InboundActivityPayloadSchema.safeParse(activity).success).toBe(true);
  });

  it('an empty calendar is an empty page with no next token', async () => {
    const result = await listGoogleCalendarEvents(TOKEN, WINDOW, asFetch(answering(json({ kind: 'calendar#events' }))));
    expect(result).toEqual({ ok: true, data: { activities: [], rejected: [], allDay: 0, cancelled: 0, nextPageToken: null } });
  });

  it('sends a page token on, and clamps the page size', async () => {
    const f = answering(json(page([])));
    await listGoogleCalendarEvents(TOKEN, { ...WINDOW, pageToken: 'tok_2', maxResults: 9999 }, asFetch(f));
    const parsed = new URL(calledWith(f).url);
    expect(parsed.searchParams.get('pageToken')).toBe('tok_2');
    expect(parsed.searchParams.get('maxResults')).toBe('250');
    const g = answering(json(page([])));
    await listGoogleCalendarEvents(TOKEN, { ...WINDOW, maxResults: 0 }, asFetch(g));
    expect(new URL(calledWith(g).url).searchParams.get('maxResults')).toBe('1');
  });

  it('uses the clock it is given, from the options or the dependencies', async () => {
    const ended = timed({ end: { dateTime: '2026-10-20T11:00:00Z' }, start: { dateTime: '2026-10-20T10:00:00Z' } });
    const later = await listGoogleCalendarEvents(TOKEN, { timeMin: WINDOW.timeMin, timeMax: WINDOW.timeMax }, { fetch: answering(json(page([ended]))) as unknown as typeof fetch, now: () => NOW });
    expect(later.ok && later.data.activities[0].metrics).toEqual({ eventCompleted: true });
    const earlier = await listGoogleCalendarEvents(TOKEN, { ...WINDOW, now: () => new Date('2026-10-20T10:30:00Z') }, asFetch(answering(json(page([ended])))));
    expect(earlier.ok && earlier.data.activities[0].metrics).toEqual({ eventCompleted: false });
  });

  it.each([
    ['empty', ''],
    ['with a newline', 'abc\ndef'],
    ['with a space', 'abc def'],
    ['too long', 'a'.repeat(4097)],
    ['not a string', null as unknown as string],
  ])('a token %s is refused before any request is made', async (_name, token) => {
    const f = answering(json(page([])));
    expect(await listGoogleCalendarEvents(token, WINDOW, asFetch(f))).toEqual({ ok: false, reason: 'unauthorized' });
    expect(f).not.toHaveBeenCalled();
  });

  it.each([
    ['a window that ends before it starts', { timeMin: WINDOW.timeMax, timeMax: WINDOW.timeMin }],
    ['an empty window', { timeMin: WINDOW.timeMin, timeMax: WINDOW.timeMin }],
    ['an invalid date', { timeMin: new Date('nope'), timeMax: WINDOW.timeMax }],
    ['an empty page token', { ...WINDOW, pageToken: '' }],
    ['an oversized page token', { ...WINDOW, pageToken: 'p'.repeat(2049) }],
  ])('%s is refused before any request is made', async (_name, options) => {
    const f = answering(json(page([])));
    expect(await listGoogleCalendarEvents(TOKEN, options as never, asFetch(f))).toEqual({ ok: false, reason: 'bad_response' });
    expect(f).not.toHaveBeenCalled();
  });

  it.each([
    ['items that are not a list', { items: 'many' }],
    ['a page token that is not text', { items: [], nextPageToken: 7 }],
    ['an empty page token', { items: [], nextPageToken: '' }],
  ])('%s is a bad response', async (_name, body) => {
    expect(await listGoogleCalendarEvents(TOKEN, WINDOW, asFetch(answering(json(body))))).toEqual({ ok: false, reason: 'bad_response' });
  });
});

// ---------------------------------------------------------------------------
// Both: how failures are reported
// ---------------------------------------------------------------------------

type Call = (deps: { fetch: typeof fetch; timeoutMs?: number }) => Promise<{ ok: boolean; reason?: string }>;
const calls: [string, Call][] = [
  ['Hevy list', (deps) => listHevyWorkouts(API_KEY, {}, deps)],
  ['Hevy one workout', (deps) => getHevyWorkout(API_KEY, WORKOUT_ID, {}, deps)],
  ['Google list', (deps) => listGoogleCalendarEvents(TOKEN, WINDOW, deps)],
];

describe.each(calls)('%s: failures', (_name, call) => {
  it.each([
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [404, 'not_found'],
    [429, 'rate_limited'],
    [500, 'unavailable'],
    [503, 'unavailable'],
    [400, 'bad_response'],
    [301, 'bad_response'],
    [302, 'bad_response'],
  ])('status %i is %s', async (status, reason) => {
    const f = answering(() => new Response('{"error":"PROVIDER-WORDS-NOT-FOR-US"}', { status }));
    const result = await call(asFetch(f));
    expect(result).toEqual({ ok: false, reason });
    expect(JSON.stringify(result)).not.toContain('PROVIDER-WORDS');
  });

  it('a network error is "unavailable", and its message is not passed on', async () => {
    const f = vi.fn(async () => {
      throw new Error('connect ECONNREFUSED 10.0.0.1:443 with-a-secret');
    });
    const result = await call({ fetch: f as unknown as typeof fetch });
    expect(result).toEqual({ ok: false, reason: 'unavailable' });
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('a request that is aborted by the timeout is "unavailable"', async () => {
    const f = vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'TimeoutError')));
    }));
    const result = await call({ fetch: f as unknown as typeof fetch, timeoutMs: 20 });
    expect(result).toEqual({ ok: false, reason: 'unavailable' });
  });

  it.each([
    ['not JSON', '<html>gateway</html>'],
    ['empty', ''],
    ['a JSON string', '"hello"'],
    ['a JSON null', 'null'],
    ['a JSON array', '[1,2,3]'],
  ])('a 200 with a body that is %s is a bad response', async (_label, body) => {
    const result = await call(asFetch(answering(() => new Response(body, { status: 200 }))));
    expect(result).toEqual({ ok: false, reason: 'bad_response' });
  });

  it('an oversized answer is refused', async () => {
    const huge = JSON.stringify({ items: [], workouts: [], padding: 'x'.repeat(MAX_RESPONSE_CHARS + 10) });
    expect(await call(asFetch(answering(() => new Response(huge, { status: 200 }))))).toEqual({ ok: false, reason: 'bad_response' });
  });

  it('every failure is one of the fixed words', async () => {
    for (const status of [401, 404, 429, 500, 418]) {
      const result = await call(asFetch(answering(() => new Response('', { status }))));
      expect(result.ok).toBe(false);
      expect(ADAPTER_FAILURES).toContain(result.reason);
    }
  });
});

describe('minutesBetween', () => {
  it('rounds to two places', () => {
    const r = minutesBetween(new Date('2026-10-19T17:28:34Z'), new Date('2026-10-19T18:12:38Z'));
    expect(r).toEqual({ ok: true, minutes: 44.07 });
  });
  it('allows exactly a day and zero, refuses more and less', () => {
    const t = new Date('2026-10-19T00:00:00Z');
    expect(minutesBetween(t, new Date(t.getTime() + 24 * 3_600_000))).toEqual({ ok: true, minutes: 1440 });
    expect(minutesBetween(t, t)).toEqual({ ok: true, minutes: 0 });
    expect(minutesBetween(t, new Date(t.getTime() + 24 * 3_600_000 + 1000)).ok).toBe(false);
    expect(minutesBetween(t, new Date(t.getTime() - 1000)).ok).toBe(false);
    expect(minutesBetween(t, new Date('x')).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The source: what an adapter cannot do
// ---------------------------------------------------------------------------

describe('the adapter source cannot reach the database, the environment, a log or a task', () => {
  const dir = join(process.cwd(), 'lib', 'adapters');
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
  const code = (file: string) =>
    readText('lib', 'adapters', file)
      .replace(/\r\n/g, '\n')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  it('has the three files it should', () => {
    expect(files.sort()).toEqual(['google.ts', 'hevy.ts', 'shared.ts']);
  });

  it.each(files)('%s has no Supabase, no environment, no logging and no status or completed_at', (file) => {
    const source = code(file);
    expect(source).not.toMatch(/supabase/i);
    expect(source).not.toMatch(/process\.env|getPublicEnv|getGoogleOAuthEnv|SERVICE_ROLE|HEVY_API_KEY|ANTHROPIC/);
    expect(source).not.toMatch(/console\./);
    expect(source).not.toMatch(/\bstatus\s*:\s*['"]|completed_at|setTaskStatus/);
    expect(source).not.toMatch(/['"]server-only['"]|next\/headers|next\/cache/);
  });

  it.each(files)('%s imports only zod, the activity type, and its own siblings', (file) => {
    const specs = [...code(file).matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    for (const spec of specs) expect(['zod', '@/lib/services/integrations', './shared']).toContain(spec);
  });

  it('the only value-level reads of a provider\'s response status are in shared.ts', () => {
    expect(code('hevy.ts')).not.toContain('response.status');
    expect(code('google.ts')).not.toContain('response.status');
  });
});
