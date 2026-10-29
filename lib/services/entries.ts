// Manual entry data access (MOM-110). The only code that writes entries, entry_corrections and the person's manual
// source for manual logging (CLAUDE.md, Architectural Directive 1). Server-side only: it reads the request's auth
// cookies and always runs as the signed-in user through the anon-key client, so RLS scopes every read and write to
// their own rows. There is no actor parameter and no service-role path: the database lets a person insert entries
// only through their own manual source (migration 013), so a browser cannot forge a synced record.
//
// The four ways to log, one per target measure (docs/DOMAIN_MODEL.md §1.3): a tap is a count of 1, one number is a
// quantity, a start/stop timer is minutes, a checklist tick is 1 against the step. Each is an entry the person made
// themselves, so the entry is the confirmation (§1.5). Nothing here adds anything up or scores anything: the engine
// computes the scoreboard from entries (§1.7), and Claude never scores.
//
// The person's word beats any source (principle 3): removing an entry writes an entry_corrections row (action
// hide) keyed to the record's own id, and restoring deletes it; the entry row is never edited. Un-ticking a step is
// removing its tick, and re-ticking is restoring it, so a step has at most one entry ever (the owner's decision,
// 2026-10-26).
//
// Never assume (principle 1): logging refuses until the person has set a time zone, and a missing or invalid one is
// never replaced by a default. Logging does not bind the manual source to the target; bindings are the person's own
// setting, made in setup (MOM-111). Entries from a synced source are not touched here (MOM-109).
//
// When it happened (MOM-110 part 2): a log is now, or a chosen day within the last 7 local days. The browser sends only
// a date; the day is read in the person's own time zone and day end (resolveOccurredAt), and an earlier day is stored
// as noon on that day, shown as a day only. Typed minutes are the alternative to the timer on a time target. The
// engine counts nothing before a goal's start date, so an entry that falls before it is saved and the person is told,
// in the result and in the recent list, never left to find out (the owner's decision, 2026-10-28). A closed week needs
// no recomputing for a late entry: results are never stored, and a snapshot holds only the target's values.

import { casualDate } from '@/lib/dates/casual';
import { addDays, assertDate, localDay, localNoon } from '@/lib/engine';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Json, Measure } from '@/types/database.types';
import type { LogDay, LogItem, LogPanel, LogTarget, LoggedEntry } from '@/types/entries';
import { UNIQUE_VIOLATION } from './goals';
import type { ServiceResult } from './result';

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MANUAL_SOURCE_LABEL = 'Manual';
const RECENT_LIMIT = 20;

// A quantity above this is almost certainly a slip of the finger. The limit is ours, not the person's; the message
// says so and nothing is logged.
export const MAX_QUANTITY = 1_000_000;
// A timer shorter than this is a mis-tap, longer than a day is a forgotten timer. Neither is logged or rounded.
export const MIN_TIMER_SECONDS = 30;
export const MAX_TIMER_SECONDS = 24 * 60 * 60;
// How far a timer's start may be ahead of the server's clock (clock drift between the phone and the server).
const CLOCK_SKEW_MS = 5_000;
// Typed minutes: whole minutes, up to a day, the same ceiling as a timer.
export const MAX_MINUTES = 24 * 60;
// How many local days back a log may be dated: today and the 7 before it.
export const MAX_DAYS_BACK = 7;

export const NO_TIME_ZONE =
  'Set your time zone before logging, so your entries land on the right day. Nothing was logged.';
export const BAD_TIME_ZONE = 'The time zone you saved is not a real one. Set it again before logging. Nothing was logged.';
export const NO_DAY_END =
  'Set your day end before choosing a day, so the day you pick is the day you mean. Nothing was logged.';
export const NOT_A_DATE = 'That day is not a real date. Nothing was logged.';
export const DAY_IN_FUTURE = "That day hasn't happened yet, so nothing was logged.";
export const DAY_TOO_OLD = `You can log up to ${MAX_DAYS_BACK} days back. That day is older, so nothing was logged.`;
export const TIMER_HAS_NO_DAY = 'A timer logs the time it ran. To log another day, type the minutes.';
const SAVE_FAILED = 'Could not save your entry. Nothing was saved.';
const NOT_FOUND_ENTRY = 'Entry not found.';
const NOT_FOUND_STEP = 'Step not found.';
const NOT_FOUND_TARGET = 'Target not found.';
const NO_CHECKLIST_TARGET = "This item isn't feeding a checklist target yet.";
const NOT_MANUAL = 'Only entries you logged yourself can be changed here.';

// How a target is logged, for the message when a control is used on the wrong kind of target.
const WAY_TO_LOG: Record<Measure, string> = {
  count: 'a tap',
  quantity: 'one number',
  time: 'a timer',
  checklist: 'a tick on each step',
};

export interface LogOptions {
  // The day the person chose, as a local date (YYYY-MM-DD), or nothing for now. See resolveOccurredAt.
  when?: unknown;
  // The clock, for tests. Never set from a request.
  now?: () => number;
}

// What a successful log answers. `notice` is set when the entry was saved but the engine will not count it.
export type LogResult = ServiceResult<{ entryId: string; notice?: string }>;

// True for a real IANA zone name ("America/Los_Angeles"). The database only checks that the text is not blank.
export function isRealTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

// When an entry happened: the instant it is stored at, the person's local day it falls on, and the day they chose.
export interface Occurrence {
  occurredAt: string;
  // The local day, read with the person's time zone and day end. Null when a log is made now and no day end is set
  // yet: the engine needs both and none is assumed.
  day: string | null;
  // Set only when the person chose an earlier day; null for a log made now.
  chosenDay: string | null;
}

const isRealDate = (text: string): boolean => {
  try {
    assertDate(text);
    return true;
  } catch {
    return false;
  }
};

// The day end column is a time ("22:00:00"); the engine wants minutes after midnight. Anything else is not a day end.
export function dayEndMinutesOf(dayEnd: string | null): number | null {
  const match = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(dayEnd ?? '');
  if (!match) return null;
  const [hours, minutes] = [Number(match[1]), Number(match[2])];
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

// When an entry happened. Now is the server's clock, never the browser's. A chosen day (a local date, YYYY-MM-DD) is
// read in the person's own time zone and day end (docs/DOMAIN_MODEL.md principle 1): it must be a real date, not after
// today, and no more than MAX_DAYS_BACK days before it. Today's date is the same as now. Any earlier day is stored as
// noon on that day, the one time no daylight-saving change or early day end can move to another date; it stands for
// "that day", not for a time. A chosen day needs the day end as well as the time zone, because where a day starts is
// the person's to say, and none is assumed.
export function resolveOccurredAt(
  when: unknown,
  context: { nowMs: number; timeZone: string; dayEndMinutes: number | null },
): ServiceResult<Occurrence> {
  const nowIso = new Date(context.nowMs).toISOString();
  const { timeZone, dayEndMinutes } = context;
  const today = dayEndMinutes === null ? null : localDay(nowIso, { timeZone, dayEndMinutes, weekStartsOn: null });
  if (when === undefined) return { ok: true, data: { occurredAt: nowIso, day: today, chosenDay: null } };

  if (typeof when !== 'string' || !isRealDate(when)) return { ok: false, error: NOT_A_DATE };
  if (today === null) return { ok: false, error: NO_DAY_END };
  if (when > today) return { ok: false, error: DAY_IN_FUTURE };
  if (when < addDays(today, -MAX_DAYS_BACK)) return { ok: false, error: DAY_TOO_OLD };
  if (when === today) return { ok: true, data: { occurredAt: nowIso, day: today, chosenDay: null } };
  return { ok: true, data: { occurredAt: localNoon(when, timeZone), day: when, chosenDay: when } };
}

// "Oct 26" (the year only when it is not the year of `near`) and "Mon", for a local date, through the app's one date formatter
// (lib/dates/casual.ts, MOM-111 finding 7). The date is read as a calendar date, so no zone moves it.
const shortDate = (date: string, near: string | null): string => casualDate(date, near, { weekday: 'none', relative: false });
const shortWeekday = (date: string): string =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(new Date(`${date}T12:00:00Z`));

// What the person is told when an entry is saved but falls before its goal's start date. The engine counts nothing
// before a target starts (types/scoreboard.ts), so the entry is kept and the person hears about it at once.
async function startDateNotice(supabase: Client, userId: string, goalId: string, day: string | null): Promise<string | undefined> {
  if (day === null) return undefined;
  const { data, error } = await supabase.from('goals').select('start_date').eq('id', goalId).eq('user_id', userId).maybeSingle();
  if (error) {
    console.error('[manual-entry] could not check the goal start date', { code: error.code });
    return undefined;
  }
  // A parked goal may have no start yet (migration 014), and then nothing is before it.
  if (!data || data.start_date === null || day >= data.start_date) return undefined;
  return `Saved. It's before this goal's start date (${shortDate(data.start_date, day)}), so it won't count unless you move the start date earlier.`;
}

async function signedInUser(supabase: Client, message: string): Promise<ServiceResult<string>> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { ok: false, error: message };
  return { ok: true, data: data.user.id };
}

interface TimeAnchorsOfPerson {
  timeZone: string;
  // Null until the person has set a day end. Logging for now does not need it; choosing a day does.
  dayEndMinutes: number | null;
}

// The person's own time zone, or the reason there is none. Logging goes no further without it. The day end comes
// from the same row and may still be missing.
async function anchorsFor(supabase: Client, userId: string): Promise<ServiceResult<TimeAnchorsOfPerson>> {
  const { data, error } = await supabase.from('person_settings').select('time_zone, day_end').eq('user_id', userId).maybeSingle();
  if (error) return { ok: false, error: 'Could not check your time zone. Nothing was logged.' };
  const zone = data?.time_zone ?? null;
  if (zone === null) return { ok: false, error: NO_TIME_ZONE };
  if (!isRealTimeZone(zone)) return { ok: false, error: BAD_TIME_ZONE };
  return { ok: true, data: { timeZone: zone, dayEndMinutes: dayEndMinutesOf(data?.day_end ?? null) } };
}

// The oldest manual source of the person, or null when they have not logged anything yet.
async function findManualSource(supabase: Client, userId: string): Promise<ServiceResult<string | null>> {
  const { data, error } = await supabase
    .from('sources')
    .select('id')
    .eq('user_id', userId)
    .eq('kind', 'manual')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1);
  if (error) return { ok: false, error: SAVE_FAILED };
  return { ok: true, data: data[0]?.id ?? null };
}

// The person's manual source, created on first use. Nothing makes sure there is only one (a null provider is
// unique to nothing), so two first logs at the same instant could each create one; every call uses the oldest, so
// the entries still land on one source.
async function ensureManualSource(supabase: Client, userId: string): Promise<ServiceResult<string>> {
  const found = await findManualSource(supabase, userId);
  if (!found.ok) return found;
  if (found.data !== null) return { ok: true, data: found.data };
  const { error } = await supabase
    .from('sources')
    .insert({ user_id: userId, kind: 'manual', provider: null, label: MANUAL_SOURCE_LABEL });
  if (error) {
    console.error('[manual-entry] could not create the manual source', { code: error.code });
    return { ok: false, error: SAVE_FAILED };
  }
  const created = await findManualSource(supabase, userId);
  if (!created.ok) return created;
  if (created.data === null) return { ok: false, error: SAVE_FAILED };
  return { ok: true, data: created.data };
}

interface LoggingContext extends TimeAnchorsOfPerson {
  supabase: Client;
  userId: string;
}

// Everything every log needs before it touches a target: a verified session and the person's own time zone.
async function openForLogging(): Promise<ServiceResult<LoggingContext>> {
  const supabase = await createSupabaseServerClient();
  const user = await signedInUser(supabase, 'Sign in to log.');
  if (!user.ok) return user;
  const anchors = await anchorsFor(supabase, user.data);
  if (!anchors.ok) return anchors;
  return { ok: true, data: { supabase, userId: user.data, ...anchors.data } };
}

// A target of the signed-in person, held to the measure the control logs. The id comes from the browser, so it is
// only trusted after it is found among the person's own targets. The goal comes back for the start-date check.
async function loadTarget(supabase: Client, userId: string, targetId: string, measure: Measure): Promise<ServiceResult<{ goalId: string }>> {
  const { data, error } = await supabase.from('targets').select('id, measure, goal_id').eq('id', targetId).eq('user_id', userId).maybeSingle();
  if (error) return { ok: false, error: SAVE_FAILED };
  if (!data) return { ok: false, error: NOT_FOUND_TARGET };
  if (data.measure !== measure) return { ok: false, error: `That target is logged with ${WAY_TO_LOG[data.measure]}.` };
  return { ok: true, data: { goalId: data.goal_id } };
}

interface NewEntry {
  targetId: string;
  measure: Measure;
  value: number;
  evidence: Record<string, Json | undefined>;
}

// The entry's evidence with the day the person chose, when they chose one, so the list can show it as a day.
const withChosenDay = (evidence: NewEntry['evidence'], chosenDay: string | null): NewEntry['evidence'] =>
  chosenDay === null ? evidence : { ...evidence, chosenDay };

// One tap, number, typed minutes or timer: a new entry with a record id of its own. The time zone was checked in
// openForLogging and the target is held to its measure. A refusal of the chosen day happens before anything is written.
async function insertEntry(context: LoggingContext, entry: NewEntry, options: LogOptions): Promise<LogResult> {
  const { supabase, userId, timeZone, dayEndMinutes } = context;
  const target = await loadTarget(supabase, userId, entry.targetId, entry.measure);
  if (!target.ok) return target;
  const when = resolveOccurredAt(options.when, { nowMs: (options.now ?? Date.now)(), timeZone, dayEndMinutes });
  if (!when.ok) return when;
  const source = await ensureManualSource(supabase, userId);
  if (!source.ok) return source;

  const { data, error } = await supabase
    .from('entries')
    .insert({
      user_id: userId,
      target_id: entry.targetId,
      source_id: source.data,
      source_record_id: crypto.randomUUID(),
      occurred_at: when.data.occurredAt,
      value: entry.value,
      evidence: withChosenDay(entry.evidence, when.data.chosenDay),
    })
    .select('id')
    .single();
  if (error || !data) {
    console.error('[manual-entry] could not save an entry', { code: error?.code ?? 'no_row' });
    return { ok: false, error: SAVE_FAILED };
  }
  const notice = await startDateNotice(supabase, userId, target.data.goalId, when.data.day);
  return { ok: true, data: { entryId: data.id, ...(notice ? { notice } : {}) } };
}

const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_PATTERN.test(value);

// A tap on a count target: one entry of 1.
export async function logTap(targetId: unknown, options: LogOptions = {}): Promise<LogResult> {
  if (!isUuid(targetId)) return { ok: false, error: NOT_FOUND_TARGET };
  const context = await openForLogging();
  if (!context.ok) return context;
  return insertEntry(context.data, { targetId, measure: 'count', value: 1, evidence: { via: 'tap' } }, options);
}

// One number on a quantity target: the number is the entry's value, as the person typed it.
export async function logNumber(targetId: unknown, value: unknown, options: LogOptions = {}): Promise<LogResult> {
  if (!isUuid(targetId)) return { ok: false, error: NOT_FOUND_TARGET };
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return { ok: false, error: 'Enter a number above 0.' };
  if (value > MAX_QUANTITY) {
    return { ok: false, error: `That number is above ${MAX_QUANTITY.toLocaleString('en-US')}, so it was not logged. Check it and try again.` };
  }
  const context = await openForLogging();
  if (!context.ok) return context;
  return insertEntry(context.data, { targetId, measure: 'quantity', value, evidence: { via: 'number' } }, options);
}

// Typed minutes on a time target, for time the person forgot to time (RAID R-20): a whole number from 1 to 1,440, as
// typed. Nothing is rounded for them. It may be dated on a chosen day.
export async function logMinutes(targetId: unknown, minutes: unknown, options: LogOptions = {}): Promise<LogResult> {
  if (!isUuid(targetId)) return { ok: false, error: NOT_FOUND_TARGET };
  if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 1) {
    return { ok: false, error: 'Enter a whole number of minutes, 1 or more.' };
  }
  if (minutes > MAX_MINUTES) {
    return { ok: false, error: `That is more than 24 hours (${MAX_MINUTES.toLocaleString('en-US')} minutes), so it was not logged. Check it and try again.` };
  }
  const context = await openForLogging();
  if (!context.ok) return context;
  return insertEntry(context.data, { targetId, measure: 'time', value: minutes, evidence: { via: 'minutes' } }, options);
}

// Stopping a timer on a time target. The browser sends only when the timer started; the stop is the server's clock,
// and the entry is the whole minutes between them. A start in the future, a timer under 30 seconds and one over 24
// hours are refused rather than guessed at. A timer logs the time that ran, so it takes no chosen day.
export async function logTimer(targetId: unknown, startedAt: unknown, options: LogOptions = {}): Promise<LogResult> {
  if (!isUuid(targetId)) return { ok: false, error: NOT_FOUND_TARGET };
  if (options.when !== undefined) return { ok: false, error: TIMER_HAS_NO_DAY };
  const startedMs = typeof startedAt === 'string' ? Date.parse(startedAt) : Number.NaN;
  if (Number.isNaN(startedMs)) return { ok: false, error: 'The timer has no valid start time. Nothing was logged.' };
  const context = await openForLogging();
  if (!context.ok) return context;

  const nowMs = (options.now ?? Date.now)();
  if (startedMs > nowMs + CLOCK_SKEW_MS) return { ok: false, error: 'The timer starts in the future. Nothing was logged.' };
  const seconds = Math.max(0, (nowMs - startedMs) / 1000);
  if (seconds < MIN_TIMER_SECONDS) return { ok: false, error: 'That timer ran under 30 seconds, so it was not logged.' };
  if (seconds > MAX_TIMER_SECONDS) {
    return { ok: false, error: 'That timer ran for more than 24 hours, so it was not logged.' };
  }
  return insertEntry(
    context.data,
    {
      targetId,
      measure: 'time',
      value: Math.round(seconds / 60),
      evidence: { via: 'timer', startedAt: new Date(startedMs).toISOString(), stoppedAt: new Date(nowMs).toISOString() },
    },
    options,
  );
}

// ---------------------------------------------------------------------------
// Corrections: remove, restore, un-tick, re-tick
// ---------------------------------------------------------------------------

// Hides one source record. Idempotent, and it turns a "count anyway" on the record into a hide: a removed entry is
// hidden even if it was counted anyway (§1.6).
async function hideRecord(supabase: Client, userId: string, sourceId: string, recordId: string): Promise<ServiceResult<null>> {
  const { data: existing, error: readError } = await supabase
    .from('entry_corrections')
    .select('id, action')
    .eq('user_id', userId)
    .eq('source_id', sourceId)
    .eq('source_record_id', recordId)
    .maybeSingle();
  if (readError) return { ok: false, error: SAVE_FAILED };
  if (existing?.action === 'hide') return { ok: true, data: null };
  const { error } = existing
    ? await supabase.from('entry_corrections').update({ action: 'hide' }).eq('id', existing.id).eq('user_id', userId)
    : await supabase
        .from('entry_corrections')
        .insert({ user_id: userId, source_id: sourceId, source_record_id: recordId, action: 'hide' });
  if (error) {
    console.error('[manual-entry] could not hide a record', { code: error.code });
    return { ok: false, error: SAVE_FAILED };
  }
  return { ok: true, data: null };
}

// Takes the hide off one source record. Idempotent: with no hide there is nothing to delete.
async function unhideRecord(supabase: Client, userId: string, sourceId: string, recordId: string): Promise<ServiceResult<null>> {
  const { error } = await supabase
    .from('entry_corrections')
    .delete()
    .eq('user_id', userId)
    .eq('source_id', sourceId)
    .eq('source_record_id', recordId)
    .eq('action', 'hide');
  if (error) {
    console.error('[manual-entry] could not restore a record', { code: error.code });
    return { ok: false, error: SAVE_FAILED };
  }
  return { ok: true, data: null };
}

// A step's own tick marker, for display only (the column is not read to count anything). A failure here is logged
// and never fails the tick: the entry is the truth.
async function setStepDisplay(supabase: Client, userId: string, stepId: string, ticked: boolean, nowMs: number): Promise<void> {
  const { error } = await supabase
    .from('work_item_steps')
    .update(ticked ? { completed_at: new Date(nowMs).toISOString(), completed_via: 'person' } : { completed_at: null, completed_via: null })
    .eq('id', stepId)
    .eq('user_id', userId);
  if (error) console.error('[manual-entry] could not update a step marker', { code: error.code });
}

interface ManualEntryRef {
  id: string;
  sourceId: string;
  recordId: string;
  // Set for a checklist tick: the step whose marker follows the entry.
  stepId: string | null;
}

// An entry of the signed-in person, held to their own manual source. Entries from a synced source are refused: they
// are corrected where they are synced (MOM-109).
async function loadManualEntry(supabase: Client, userId: string, entryId: string): Promise<ServiceResult<ManualEntryRef>> {
  const { data: entry, error } = await supabase
    .from('entries')
    .select('id, source_id, source_record_id, evidence')
    .eq('id', entryId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { ok: false, error: SAVE_FAILED };
  if (!entry) return { ok: false, error: NOT_FOUND_ENTRY };
  const { data: source, error: sourceError } = await supabase
    .from('sources')
    .select('kind')
    .eq('id', entry.source_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (sourceError) return { ok: false, error: SAVE_FAILED };
  if (source?.kind !== 'manual') return { ok: false, error: NOT_MANUAL };
  const via = (entry.evidence as Record<string, Json | undefined>).via;
  return {
    ok: true,
    data: { id: entry.id, sourceId: entry.source_id, recordId: entry.source_record_id, stepId: via === 'tick' ? entry.source_record_id : null },
  };
}

// Removes one of the person's own manual entries: hidden, kept, and restorable.
export async function removeEntry(entryId: unknown, deps: { now?: () => number } = {}): Promise<ServiceResult<{ entryId: string }>> {
  if (!isUuid(entryId)) return { ok: false, error: NOT_FOUND_ENTRY };
  const supabase = await createSupabaseServerClient();
  const user = await signedInUser(supabase, 'Sign in to change your entries.');
  if (!user.ok) return user;
  const entry = await loadManualEntry(supabase, user.data, entryId);
  if (!entry.ok) return entry;
  const hidden = await hideRecord(supabase, user.data, entry.data.sourceId, entry.data.recordId);
  if (!hidden.ok) return hidden;
  if (entry.data.stepId !== null) await setStepDisplay(supabase, user.data, entry.data.stepId, false, (deps.now ?? Date.now)());
  return { ok: true, data: { entryId } };
}

// Brings a removed manual entry back by deleting its hide. Needs no time zone: it makes no new time.
export async function restoreEntry(entryId: unknown, deps: { now?: () => number } = {}): Promise<ServiceResult<{ entryId: string }>> {
  if (!isUuid(entryId)) return { ok: false, error: NOT_FOUND_ENTRY };
  const supabase = await createSupabaseServerClient();
  const user = await signedInUser(supabase, 'Sign in to change your entries.');
  if (!user.ok) return user;
  const entry = await loadManualEntry(supabase, user.data, entryId);
  if (!entry.ok) return entry;
  const shown = await unhideRecord(supabase, user.data, entry.data.sourceId, entry.data.recordId);
  if (!shown.ok) return shown;
  if (entry.data.stepId !== null) await setStepDisplay(supabase, user.data, entry.data.stepId, true, (deps.now ?? Date.now)());
  return { ok: true, data: { entryId } };
}

interface StepContext {
  step: { id: string; title: string };
  itemId: string;
  targetId: string;
  goalId: string;
}

// A step of the signed-in person, with the checklist target its item feeds. An item that feeds no target (a
// milestone need not) or feeds one that is not a checklist cannot take a tick.
async function loadStep(supabase: Client, userId: string, stepId: string): Promise<ServiceResult<StepContext>> {
  const { data: step, error } = await supabase
    .from('work_item_steps')
    .select('id, title, work_item_id')
    .eq('id', stepId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { ok: false, error: SAVE_FAILED };
  if (!step) return { ok: false, error: NOT_FOUND_STEP };
  const { data: item, error: itemError } = await supabase
    .from('work_items')
    .select('id, target_id')
    .eq('id', step.work_item_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (itemError) return { ok: false, error: SAVE_FAILED };
  if (!item || item.target_id === null) return { ok: false, error: NO_CHECKLIST_TARGET };
  const target = await loadTarget(supabase, userId, item.target_id, 'checklist');
  if (!target.ok) return target.error.startsWith('That target is logged') ? { ok: false, error: NO_CHECKLIST_TARGET } : target;
  return {
    ok: true,
    data: { step: { id: step.id, title: step.title }, itemId: item.id, targetId: item.target_id, goalId: target.data.goalId },
  };
}

// The step's entry on a manual source, if it has one (hidden or not).
function findTickEntry(supabase: Client, userId: string, targetId: string, sourceId: string, stepId: string) {
  return supabase
    .from('entries')
    .select('id')
    .eq('user_id', userId)
    .eq('target_id', targetId)
    .eq('source_id', sourceId)
    .eq('source_record_id', stepId)
    .maybeSingle();
}

interface FirstTick {
  entryId: string;
  sourceId: string;
  notice?: string;
}

// The step's first tick: its one entry, on the chosen day or now. The day is checked here and nowhere else, before
// anything is written, because only a first tick makes a time.
async function writeFirstTick(context: LoggingContext, step: StepContext, stepId: string, options: LogOptions, nowMs: number): Promise<ServiceResult<FirstTick>> {
  const { supabase, userId, timeZone, dayEndMinutes } = context;
  const when = resolveOccurredAt(options.when, { nowMs, timeZone, dayEndMinutes });
  if (!when.ok) return when;
  const source = await ensureManualSource(supabase, userId);
  if (!source.ok) return source;

  const { data, error } = await supabase
    .from('entries')
    .insert({
      user_id: userId,
      target_id: step.targetId,
      source_id: source.data,
      source_record_id: stepId,
      work_item_id: step.itemId,
      occurred_at: when.data.occurredAt,
      value: 1,
      evidence: withChosenDay({ via: 'tick', step: step.step.title }, when.data.chosenDay),
    })
    .select('id')
    .single();
  if (error?.code === UNIQUE_VIOLATION) {
    // A second tap landed first: the step already has its entry, which is all this tick needed.
    const raced = await findTickEntry(supabase, userId, step.targetId, source.data, stepId);
    if (raced.error || !raced.data) return { ok: false, error: SAVE_FAILED };
    return { ok: true, data: { entryId: raced.data.id, sourceId: source.data } };
  }
  if (error || !data) {
    console.error('[manual-entry] could not save a tick', { code: error?.code ?? 'no_row' });
    return { ok: false, error: SAVE_FAILED };
  }
  const notice = await startDateNotice(supabase, userId, step.goalId, when.data.day);
  return { ok: true, data: { entryId: data.id, sourceId: source.data, ...(notice ? { notice } : {}) } };
}

// Ticks a step. The first tick writes the step's one entry (the step's id is its record id, so a second can never
// exist); a tick after an un-tick only takes the hide off, so the entry keeps its original time, and a day sent with
// it is not read. Ticking a step that is already ticked changes nothing.
export async function tickStep(stepId: unknown, options: LogOptions = {}): Promise<LogResult> {
  if (!isUuid(stepId)) return { ok: false, error: NOT_FOUND_STEP };
  const context = await openForLogging();
  if (!context.ok) return context;
  const { supabase, userId } = context.data;
  const nowMs = (options.now ?? Date.now)();

  const step = await loadStep(supabase, userId, stepId);
  if (!step.ok) return step;
  const found = await findManualSource(supabase, userId);
  if (!found.ok) return found;

  let tick: FirstTick | null = null;
  if (found.data !== null) {
    const existing = await findTickEntry(supabase, userId, step.data.targetId, found.data, stepId);
    if (existing.error) return { ok: false, error: SAVE_FAILED };
    if (existing.data) tick = { entryId: existing.data.id, sourceId: found.data };
  }
  if (tick === null) {
    const first = await writeFirstTick(context.data, step.data, stepId, options, nowMs);
    if (!first.ok) return first;
    tick = first.data;
  }

  const shown = await unhideRecord(supabase, userId, tick.sourceId, stepId);
  if (!shown.ok) return shown;
  await setStepDisplay(supabase, userId, stepId, true, nowMs);
  return { ok: true, data: { entryId: tick.entryId, ...(tick.notice ? { notice: tick.notice } : {}) } };
}

// Un-ticks a step: hides its tick. The entry stays, so a later tick brings it back.
export async function untickStep(stepId: unknown, deps: { now?: () => number } = {}): Promise<ServiceResult<{ entryId: string }>> {
  if (!isUuid(stepId)) return { ok: false, error: NOT_FOUND_STEP };
  const supabase = await createSupabaseServerClient();
  const user = await signedInUser(supabase, 'Sign in to change your entries.');
  if (!user.ok) return user;
  const userId = user.data;

  const step = await loadStep(supabase, userId, stepId);
  if (!step.ok) return step;
  const source = await findManualSource(supabase, userId);
  if (!source.ok) return source;
  if (source.data === null) return { ok: false, error: 'That step is not ticked.' };
  const { data: tick, error } = await supabase
    .from('entries')
    .select('id')
    .eq('user_id', userId)
    .eq('target_id', step.data.targetId)
    .eq('source_id', source.data)
    .eq('source_record_id', stepId)
    .maybeSingle();
  if (error) return { ok: false, error: SAVE_FAILED };
  if (!tick) return { ok: false, error: 'That step is not ticked.' };

  const hidden = await hideRecord(supabase, userId, source.data, stepId);
  if (!hidden.ok) return hidden;
  await setStepDisplay(supabase, userId, stepId, false, (deps.now ?? Date.now)());
  return { ok: true, data: { entryId: tick.id } };
}

// ---------------------------------------------------------------------------
// The page's read
// ---------------------------------------------------------------------------

const LOAD_FAILED = 'Could not load your targets.';

const textOf = (value: Json | undefined): string | null => (typeof value === 'string' ? value : null);

// What the minimal page at /log shows (MOM-110): the person's time zone, the targets they can log against with the
// checklist steps of each, and their latest manual entries. Read-only. MOM-112 builds the real home page from the
// goal services; this is the smallest read that lets the controls be tried on the local stack. Only targets of an
// active goal are offered. Each step is ticked when its entry exists and is not hidden; the step row's own marker
// is not read. The days a person can log on are built here, in their own time zone and day end, so the browser's clock
// never decides what today is.
export async function getLogPanel(deps: { now?: () => number } = {}): Promise<ServiceResult<LogPanel>> {
  const supabase = await createSupabaseServerClient();
  const user = await signedInUser(supabase, 'Sign in to log.');
  if (!user.ok) return user;
  const userId = user.data;

  const [settings, goals, targets, items, steps, source] = await Promise.all([
    supabase.from('person_settings').select('time_zone, day_end').eq('user_id', userId).maybeSingle(),
    supabase.from('goals').select('id, title, state, start_date').eq('user_id', userId),
    supabase.from('targets').select('id, goal_id, title, measure, unit, created_at').eq('user_id', userId).order('created_at', { ascending: true }),
    supabase.from('work_items').select('id, target_id, title, sort_order').eq('user_id', userId).order('sort_order', { ascending: true }),
    supabase.from('work_item_steps').select('id, work_item_id, title, sort_order').eq('user_id', userId).order('sort_order', { ascending: true }),
    findManualSource(supabase, userId),
  ]);
  if (settings.error || goals.error || targets.error || items.error || steps.error || !source.ok) {
    return { ok: false, error: LOAD_FAILED };
  }

  // The entries and the hides on the manual source: what is ticked, and what the recent list shows as removed.
  let hidden = new Set<string>();
  let tickedIds = new Set<string>();
  let recentRows: {
    id: string;
    target_id: string;
    source_record_id: string;
    value: number;
    occurred_at: string;
    evidence: Record<string, Json | undefined>;
  }[] = [];
  if (source.data !== null) {
    const stepIds = steps.data.map((s) => s.id);
    const [corrections, ticks, recent] = await Promise.all([
      supabase.from('entry_corrections').select('source_record_id').eq('user_id', userId).eq('source_id', source.data).eq('action', 'hide'),
      stepIds.length === 0
        ? Promise.resolve({ data: [] as { source_record_id: string }[], error: null })
        : supabase.from('entries').select('source_record_id').eq('user_id', userId).eq('source_id', source.data).in('source_record_id', stepIds),
      supabase
        .from('entries')
        .select('id, target_id, source_record_id, value, occurred_at, evidence')
        .eq('user_id', userId)
        .eq('source_id', source.data)
        .order('occurred_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(RECENT_LIMIT),
    ]);
    if (corrections.error || ticks.error || recent.error) return { ok: false, error: LOAD_FAILED };
    hidden = new Set(corrections.data.map((c) => c.source_record_id));
    tickedIds = new Set(ticks.data.map((t) => t.source_record_id));
    recentRows = recent.data;
  }

  const activeGoals = new Map(goals.data.filter((g) => g.state === 'active').map((g) => [g.id, g.title]));
  const stepsOf = (itemId: string) =>
    steps.data
      .filter((s) => s.work_item_id === itemId)
      .map((s) => ({ id: s.id, title: s.title, ticked: tickedIds.has(s.id) && !hidden.has(s.id) }));
  const itemsOf = (targetId: string): LogItem[] =>
    items.data.filter((i) => i.target_id === targetId).map((i) => ({ id: i.id, title: i.title, steps: stepsOf(i.id) }));

  const loggable: LogTarget[] = targets.data
    .filter((t) => activeGoals.has(t.goal_id))
    .map((t) => ({
      id: t.id,
      title: t.title,
      goalTitle: activeGoals.get(t.goal_id) ?? '',
      measure: t.measure,
      unit: t.unit,
      items: t.measure === 'checklist' ? itemsOf(t.id) : [],
    }));

  // The anchors the engine reads days with. Without a real zone and a day end, no entry can be placed on a local day,
  // so none is judged against its goal's start and no day is offered.
  const rawZone = settings.data?.time_zone ?? null;
  const zone = rawZone !== null && isRealTimeZone(rawZone) ? rawZone : null;
  const dayEnd = dayEndMinutesOf(settings.data?.day_end ?? null);
  const anchors = zone !== null && dayEnd !== null ? { timeZone: zone, dayEndMinutes: dayEnd, weekStartsOn: null } : null;

  const goalStart = new Map(goals.data.map((g) => [g.id, g.start_date]));
  const byTarget = new Map(targets.data.map((t) => [t.id, t]));
  const recent: LoggedEntry[] = recentRows.map((row) => {
    const target = byTarget.get(row.target_id);
    const chosenDay = textOf(row.evidence.chosenDay);
    const day = chosenDay ?? (anchors === null ? null : localDay(row.occurred_at, anchors));
    const start = target ? goalStart.get(target.goal_id) : undefined;
    return {
      id: row.id,
      targetId: row.target_id,
      targetTitle: target?.title ?? 'A target',
      measure: target?.measure ?? 'count',
      unit: target?.unit ?? null,
      value: row.value,
      occurredAt: row.occurred_at,
      via: textOf(row.evidence.via),
      detail: textOf(row.evidence.step),
      chosenDay,
      beforeStart: day !== null && start !== undefined && start !== null && day < start,
      removed: hidden.has(row.source_record_id),
    };
  });

  let days: LogDay[] | null = null;
  if (anchors !== null) {
    const today = localDay(new Date((deps.now ?? Date.now)()).toISOString(), anchors);
    days = Array.from({ length: MAX_DAYS_BACK + 1 }, (_, back) => {
      const date = addDays(today, -back);
      return { date, label: back === 0 ? 'Today' : back === 1 ? 'Yesterday' : shortWeekday(date), detail: shortDate(date, today) };
    });
  }
  return { ok: true, data: { timeZone: zone, days, targets: loggable, recent } };
}
