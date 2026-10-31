// Guided setup's contract (MOM-111, docs/DOMAIN_MODEL.md §2). Three things live here:
// - SetupModel: everything setup can save, shaped to migration 013's tables. The saved model passes this same schema
//   (§2.3), so what the person approves is exactly what is saved.
// - SetupDraft: the model plus where each number, date, time and weekday came from (`said`) and which parts the
//   person has approved (`approved`). Claude returns the whole draft every turn; code validates it (lib/setup/validate.ts).
// - AssistantTurn: one turn of Claude's, in a shape the eight hard rules (§2.1) can be checked on automatically.
//
// Every object is strict, so a stray key such as `score` is rejected instead of ignored (principle 9: Claude never
// scores). Fields the person has not answered yet are null; "not chosen" is never filled in with a default
// (principle 1). Whether a draft is complete enough to save is decided by validateDraft(..., 'final'), not here.
//
// A key Claude leaves out reads as "not answered" (MOM-111 round 2, B2): every nullable key defaults to null and every list
// to empty, so a reply that forgets one is not thrown away. Those are the same values the key would have before the person
// answered, so no answer is ever filled in. The prompt still shows every key as required (lib/setup/schemaText.ts renders
// the output shape, where a defaulted key is required), and unknown keys are still refused.

import { z } from 'zod';
import { SUPPORTED_PROVIDER_IDS } from '@/lib/integrations/catalog';
import {
  BALANCE_MENTIONS,
  CAPACITY_UNITS,
  CARRY_OVER_KINDS,
  CELEBRATION_LEVELS,
  CHECK_IN_MODES,
  COMPLETION_MODES,
  GOAL_SHAPES,
  GOAL_STATES,
  MEASURES,
  QUANTITY_METRICS,
  REMINDER_MODES,
  REVIEW_DEPTHS,
  REVIEW_PLANNING_MODES,
  TARGET_ROLES,
  TONES,
  WORK_ITEM_KINDS,
} from './database.types';

// The eight hard rules of §2.1, in the doc's order. Each has an automatic check in lib/setup/checks.ts.
export const HARD_RULE_IDS = [
  'one_question',
  'assume_nothing',
  'no_announced_reminder',
  'choice_before_examples',
  'skip_answered',
  'numbered_interpretations',
  'chunked_playback',
  'no_math',
] as const;
export type HardRuleId = (typeof HARD_RULE_IDS)[number];

// The parts the person approves as they finish (§2.2 step 12): after steps 3, 7, 10 and 11.
export const SETUP_CHUNKS = ['goals', 'targets', 'planning', 'talk'] as const;
export type SetupChunk = (typeof SETUP_CHUNKS)[number];

// What a question is about. Lets a check see "this was already answered" without reading prose.
export const SETUP_TOPICS = [
  'idea',
  'why',
  'breakup',
  'sequencing',
  'parked_return',
  'priorities',
  'starting_point',
  'shape',
  'start_date',
  'end_date',
  'block_length',
  'deadline_date',
  'date_can_move',
  'target',
  'role',
  'floor',
  'aspiration',
  'expansion',
  'source',
  'metric',
  'time_zone',
  'day_end',
  'week_start',
  'day_types',
  'capacity',
  'slots_or_quota',
  'planning_moment',
  'tone',
  'reminders',
  'check_ins',
  'celebrations',
  'quiet_times',
  'balance_mentions',
  'review_depth',
  'review_planning',
] as const;
export type SetupTopic = (typeof SETUP_TOPICS)[number];

// What a turn is. playback and final carry no words of Claude's: the screen renders them from the validated draft.
export const TURN_KINDS = [
  'question',
  'offer_ideas',
  'ideas',
  'interpretations',
  'proposal',
  'playback',
  'final',
] as const;
export type TurnKind = (typeof TURN_KINDS)[number];

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

const isRealDate = (s: string): boolean => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

// The describe() texts below are read by lib/setup/schemaText.ts, which writes the exact shape of a draft into the setup
// prompt from these same schemas (MOM-128). They carry what the type alone cannot say; keep them free of colons.
const Key = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,31}$/, 'A key is lowercase letters, digits and underscores.')
  .describe('name made of a lowercase letter then lowercase letters, digits or underscores, at most 32 characters, unique within its list');
const Text = z.string().trim().min(1).max(300);
const DateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isRealDate, 'That is not a real date.')
  .describe('date written YYYY-MM-DD');
const ClockTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'A time is HH:MM, 24 hour.')
  .describe('clock time written HH:MM on a 24 hour clock');
// 1 to 7, Monday is 1 (as in person_settings.week_start and targets.slot_weekdays).
const Weekday = z.number().int().min(1).max(7).describe('weekday number from 1 to 7 where Monday is 1 and Sunday is 7');
const Positive = z.number().positive().max(1_000_000);

// "Not answered" when the key is left out (B2). The value is the one the key holds before the person answers.
const orNull = <T extends z.ZodType>(schema: T) => schema.nullable().default(null);
const list = <T extends z.ZodType>(item: T, max: number) => z.array(item).max(max).default([]);

export const PersonSchema = z.strictObject({
  // An IANA name such as 'America/Chicago'. Null until the person says where they are.
  timeZone: orNull(z.string().trim().min(1).max(64)),
  // When the person's day ends. After midnight and before 06:00 moves the day boundary; any other time is a
  // check-in time (MOM-125, MOM-108 rule D1).
  dayEnd: orNull(ClockTime),
  // Asked only when a weekly or day-slot target needs it (MOM-125).
  weekStart: orNull(Weekday),
  dayTypes: list(
    z.strictObject({
      name: Text,
      capacityUnit: orNull(z.enum(CAPACITY_UNITS)),
      capacityAmount: orNull(z.number().min(0).max(10_000)),
    }),
    12,
  ),
  // Life areas the person named as protected, in their words.
  priorities: list(Text, 12),
  // The planning moment the weekly review runs at.
  planning: z.strictObject({ weekday: orNull(Weekday), time: orNull(ClockTime) }).default({ weekday: null, time: null }),
});

// "How Momentum talks to me" (§4.1). Null means not chosen yet; the code supplies the starting value.
export const SettingsSchema = z.strictObject({
  tone: orNull(z.enum(TONES)),
  reminders: orNull(z.enum(REMINDER_MODES)),
  checkIns: orNull(z.enum(CHECK_IN_MODES)),
  celebrations: orNull(z.enum(CELEBRATION_LEVELS)),
  balanceMentions: orNull(z.enum(BALANCE_MENTIONS)),
  reviewDepth: orNull(z.enum(REVIEW_DEPTHS)),
  reviewPlanning: orNull(z.enum(REVIEW_PLANNING_MODES)),
  // Null: not asked. []: asked, and none. Each is the person's words.
  quietTimes: orNull(z.array(Text).max(12)),
});

const PeriodSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('weekly') }),
  z.strictObject({ kind: z.literal('day_slots'), weekdays: z.array(Weekday).min(1).max(7) }),
  z.strictObject({ kind: z.literal('deadline'), dueDate: DateString }),
]);

// Only an app Momentum can read (MOM-111 round 2, B1). The first phone run's replies wrote "Hevy" and "apple watch" here,
// which the old free-text pattern refused as a shape error with no word of why; now the prompt lists the allowed values.
const ProviderId = z
  .enum(SUPPORTED_PROVIDER_IDS as [string, ...string[]])
  .describe(`${SUPPORTED_PROVIDER_IDS.map((p) => JSON.stringify(p)).join(' | ')}, the only apps Momentum can read; for any other app the source is the manual kind`);

const SourceRefSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('manual') }),
  z.strictObject({
    kind: z.literal('synced'),
    provider: ProviderId,
    // Which number a quantity target counts in this app (MOM-111, MOM-109 design review): null until the person
    // answers the metric question, and for a quantity target not bound to an app with more than one metric, or for
    // any other measure. Never worked out from the target's own unit text.
    metric: orNull(z.enum(QUANTITY_METRICS)).describe(
      `null unless this target is a quantity counted in that app, then the person's answer to which number counts, one of ${QUANTITY_METRICS.map((m) => JSON.stringify(m)).join(' | ')}`,
    ),
  }),
]);

export const TargetDraftSchema = z.strictObject({
  key: Key,
  title: Text,
  measure: z.enum(MEASURES),
  // The person's own unit text. Required for a quantity, null for every other measure.
  unit: orNull(Text),
  role: z.enum(TARGET_ROLES),
  period: PeriodSchema,
  floor: orNull(Positive),
  aspiration: orNull(Positive),
  qualifyingThreshold: orNull(z.number().min(0).max(1_000_000)),
  carryOver: z.enum(CARRY_OVER_KINDS),
  completionMode: orNull(z.enum(COMPLETION_MODES)),
  tone: orNull(z.enum(TONES)),
  // Where the person says it is tracked (§1.5): their own taps, numbers and timers, or a synced app. One target may have
  // one source for each way it is tracked ("Hevy for lifts, I log my runs"), with no label of which activity each covers.
  sources: list(SourceRefSchema, 4),
});

export const WorkItemDraftSchema = z.strictObject({
  key: Key,
  kind: z.enum(WORK_ITEM_KINDS),
  title: Text,
  // The target the item feeds. Required for a habit.
  targetKey: orNull(Key),
  // deadline_task only, and then both are the person's answer: there is no default for whether the date can move.
  dueDate: orNull(DateString),
  dateCanMove: orNull(z.boolean()),
  estimateMinutes: orNull(z.number().int().positive().max(100_000)),
  steps: list(Text, 50),
});

export const GoalDraftSchema = z.strictObject({
  key: Key,
  title: Text,
  why: orNull(Text),
  startDate: orNull(DateString),
  shape: orNull(z.enum(GOAL_SHAPES)),
  endDate: orNull(DateString),
  blockWeeks: orNull(z.number().int().positive().max(520)),
  state: z.enum(GOAL_STATES),
  // How a parked goal comes back: a date, a season or condition in the person's words, or only when asked.
  returnWhen: orNull(
    z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('date'), date: DateString }),
      z.strictObject({ kind: z.literal('condition'), note: Text }),
      z.strictObject({ kind: z.literal('on_request') }),
    ]),
  ),
  completionMode: orNull(z.enum(COMPLETION_MODES)),
  tone: orNull(z.enum(TONES)),
  targets: list(TargetDraftSchema, 12),
  items: list(WorkItemDraftSchema, 40),
});

export const SetupModelSchema = z.strictObject({
  person: PersonSchema,
  settings: SettingsSchema,
  goals: list(GoalDraftSchema, 12),
});

// ---------------------------------------------------------------------------
// The draft: the model plus its provenance and approvals
// ---------------------------------------------------------------------------

// Where one value came from. `turn` is an index into the transcript.
// - said: the person's own message at `turn` contains the value.
// - accepted: the person's message at `turn` accepts a visible suggestion (an `ideas`, `interpretations` or `proposal`
//   turn just before it) that contains the value. Marked as a starting point, checked at the first weekly review (§2.1 rule 4).
export const ProvenanceSchema = z.strictObject({
  path: z.string().min(1).max(200),
  turn: z.number().int().min(0),
  how: z.enum(['said', 'accepted']),
});

// Claude's clean version of the person's own words for one free-text value (MOM-111 finding 11): grammar, slang and
// voice-to-text fixed ("wanna" to "want to"), in the person's own voice. `path` names the value by a path in
// lib/setup/leaves.ts PLAIN_PATH_FORMS. Code checks it adds nothing the person did not say (lib/setup/paraphrase.ts); one
// that passes is what the playback shows and, once approved, what is saved (owner decision 1, 2026-10-29). One that fails
// is ignored, and the playback restates the person's own words.
export const PlainWordsSchema = z.strictObject({
  path: z.string().min(1).max(200),
  text: Text,
});

export const SetupDraftSchema = z.strictObject({
  model: SetupModelSchema,
  said: list(ProvenanceSchema, 500),
  approved: list(z.enum(SETUP_CHUNKS), SETUP_CHUNKS.length),
  plain: list(PlainWordsSchema, 200),
});

// ---------------------------------------------------------------------------
// One turn of Claude's
// ---------------------------------------------------------------------------

export const AssistantTurnSchema = z.strictObject({
  kind: z.enum(TURN_KINDS),
  // The part being played back (kind 'playback' only).
  chunk: orNull(z.enum(SETUP_CHUNKS)),
  // One line saying a question is skipped because it is already answered (rule 5).
  skipped: orNull(z.strictObject({ topic: z.enum(SETUP_TOPICS), line: z.string() })),
  // Words before the question. Never a question itself.
  say: z.string().default(''),
  // The one question (rule 1): the core ask only, in bold on screen. Null on playback and final turns.
  question: orNull(z.string()),
  // The question's examples and its reason, in regular weight under it (MOM-111 round 2, finding 1). Never a question.
  detail: orNull(z.string()),
  topic: orNull(z.enum(SETUP_TOPICS)),
  // Starting ideas (kind 'ideas') or interpretations (kind 'interpretations'); the screen numbers them.
  options: list(z.string(), 8),
  // The whole draft after this turn.
  draft: SetupDraftSchema,
});

export type SetupModel = z.infer<typeof SetupModelSchema>;
export type SetupPerson = z.infer<typeof PersonSchema>;
export type SetupSettings = z.infer<typeof SettingsSchema>;
export type GoalDraft = z.infer<typeof GoalDraftSchema>;
export type TargetDraft = z.infer<typeof TargetDraftSchema>;
export type WorkItemDraft = z.infer<typeof WorkItemDraftSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
export type SetupDraft = z.infer<typeof SetupDraftSchema>;
export type PlainWords = z.infer<typeof PlainWordsSchema>;
export type AssistantTurn = z.infer<typeof AssistantTurnSchema>;

// What has been said so far. A person's message is their own words; an assistant message is Claude's turn.
export type TranscriptMessage = { role: 'person'; text: string } | { role: 'assistant'; turn: AssistantTurn };
export type Transcript = TranscriptMessage[];

// ---------------------------------------------------------------------------
// The conversation as it travels between the browser and the server (MOM-111)
// ---------------------------------------------------------------------------

// Nothing about a setup is stored on our side before the person approves it (the owner's 2026-10-27 decision), so the
// browser holds the whole conversation and sends it with each turn. A Server Action is reachable by direct POST, so the
// server treats it as untrusted input: these bounds keep a forged one from making a request (and its cost) larger than a
// real setup can be. 40 assistant turns is the setup budget (lib/services/llm.ts); a person message is at most this long.
export const MAX_PERSON_CHARS = 2000;
// 82 is the budget's 40 assistant turns and 41 answers, with a message to spare. The quick path adds a question and an answer for
// each item the person answers on the card (lib/setup/fillIn.ts), at most MAX_FILL_INS of them, and they must still fit after a
// spent budget: 82 + 2 x 20 = 122. This only bounds what a request may hold; no Claude call is made once 40 of Claude's turns are in
// the conversation (lib/services/llm.ts setupBudgetStatus), so the bound adds no room to any call. Pinned in
// tests/setup-transcript-bound.test.ts.
export const MAX_FILL_INS = 20;
export const MAX_TRANSCRIPT_MESSAGES = 82 + 2 * MAX_FILL_INS;
export const MAX_SPENT_TOKENS = 100_000_000;

export const TranscriptMessageSchema = z.discriminatedUnion('role', [
  z.strictObject({ role: z.literal('person'), text: z.string().trim().min(1).max(MAX_PERSON_CHARS) }),
  z.strictObject({ role: z.literal('assistant'), turn: AssistantTurnSchema }),
]);

// Assistant first, then strictly taking turns: the same shape the provenance indexes in a draft assume.
export const TranscriptSchema = z
  .array(TranscriptMessageSchema)
  .max(MAX_TRANSCRIPT_MESSAGES)
  .refine((t) => t.every((m, i) => m.role === (i % 2 === 0 ? 'assistant' : 'person')), 'The conversation alternates, Claude first.');

export const SetupSessionSchema = z.strictObject({
  transcript: TranscriptSchema,
  draft: SetupDraftSchema,
  // Input plus output tokens used so far by this setup's Claude calls (the setup budget counts them).
  spentTokens: z.number().int().min(0).max(MAX_SPENT_TOKENS),
});

// Everything a setup is, between turns. Held in the browser tab until the person saves it or closes the tab.
export type SetupSession = z.infer<typeof SetupSessionSchema>;

// The date on the person's device, which the browser sends as a suggestion for a start date.
export const SuggestedDateSchema = DateString;

// The person's locale as their browser reports it ("en-US"), which the browser sends so a clock time in the playback reads
// the way they write times. Only its shape is checked here; a value Intl cannot use is ignored by the playback.
export const PersonLocaleSchema = z.string().regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8}){0,4}$/).max(35);
