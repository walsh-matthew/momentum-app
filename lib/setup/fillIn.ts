// What the quick path card lets the person fill in, and how a filled-in value enters the draft (MOM-111, docs/DOMAIN_MODEL.md
// §2.1 and §2.3). When setup stops using Claude, a person who has not given, say, a time zone must not lose everything they
// said. Each item the saved model still needs becomes a control on the card; what they set is added to the draft the way an
// answer to Claude is, so the same validator and the same first-setup save apply, unchanged:
// - a typed (or picked) value is a code-written question, in the card's exact words, then the person's own message holding the
//   value, and the draft records it as `said`;
// - a suggestion they took (only the device's time zone, and today for a start date) is a code-written proposal showing it,
//   then a yes, and the draft records it as `accepted`, so it is marked a starting point and checked at the first review.
// No default is ever applied (principle 1): nothing is filled in without the person's tap, and no suggestion exists for the
// floor, the day end, the week start, the unit or the source. A source is one the code already supports (lib/integrations/
// catalog.ts), or the person logging it themselves. Claude is not called. Pure.

import { casualDate } from '@/lib/dates/casual';
import { INTEGRATION_CATALOG, quantityMetricsOf } from '@/lib/integrations/catalog';
import { isTimeZone, validateDraft, type DraftIssue } from './validate';
import { describeIssue, type MissingWords } from './quickPath';
import { PROPOSAL_YES_TEXT, pickedDateText } from './session';
import {
  MAX_TRANSCRIPT_MESSAGES,
  SETUP_CHUNKS,
  SetupSessionSchema,
  type AssistantTurn,
  type GoalDraft,
  type SetupModel,
  type SetupSession,
  type SetupTopic,
  type TargetDraft,
  type WorkItemDraft,
} from '@/types/setup';
import type { QuantityMetric } from '@/types/database.types';
import type { FillInChoice, FillInItem, FillInKind, FillInSuggestion } from '@/types/setupScreen';

const WEEKDAYS: FillInChoice[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((label, i) => ({
  value: String(i + 1),
  label,
}));

const SHAPES: FillInChoice[] = [
  { value: 'ongoing', label: 'It keeps going' },
  { value: 'finite', label: 'It has an end date' },
  { value: 'project', label: 'It has a deadline' },
];

const YES_NO: FillInChoice[] = [
  { value: 'yes', label: 'Yes, it can move' },
  { value: 'no', label: "No, it can't move" },
];

const MANUAL: FillInChoice = { value: 'manual', label: "I'll log it myself" };

// What an item sets and how: its control, its suggestion, the question's topic, and the functions that read and write the draft.
interface ItemKind {
  kind: FillInKind;
  topic: SetupTopic;
  suggestion: FillInSuggestion | null;
  // The choices on offer for this draft (the same ones the server checks the value against).
  choices: (model: SetupModel, parts: string[]) => FillInChoice[];
  // The person's words for the value (their message), or null when the value is not one this kind accepts.
  words: (value: string, choices: FillInChoice[]) => string | null;
  // Sets the value in the model. Returns false when the model has nothing at that path.
  set: (model: SetupModel, parts: string[], value: string) => boolean;
  // What the draft holds there now: null when nothing (so the item is offered), else the value.
  current: (model: SetupModel, parts: string[]) => unknown;
  // A suggestion's text, for the proposal that shows it, given the device's today.
  shown?: (value: string, today: string) => string;
  // A value that already breaks a rule can be replaced here (a time zone name nobody knows).
  fixesRule?: boolean;
}

const goalAt = (model: SetupModel, parts: string[]): GoalDraft | undefined => model.goals.find((g) => g.key === parts[1]);
const targetAt = (model: SetupModel, parts: string[]): TargetDraft | undefined => goalAt(model, parts)?.targets.find((t) => t.key === parts[3]);
const itemAt = (model: SetupModel, parts: string[]): WorkItemDraft | undefined => goalAt(model, parts)?.items.find((i) => i.key === parts[3]);
const noChoices = (): FillInChoice[] => [];

const isRealDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const dateWords = (value: string): string | null => (isRealDate(value) ? pickedDateText(value) : null);

// The source a target still needs the person to say, or the number to count in an app that has more than one.
function openSource(target: TargetDraft): { kind: 'where' } | { kind: 'metric'; provider: string } | null {
  if (target.sources.length === 0) return { kind: 'where' };
  for (const source of target.sources) {
    if (source.kind === 'synced' && source.metric === null && target.measure === 'quantity' && quantityMetricsOf(source.provider).length > 0) {
      return { kind: 'metric', provider: source.provider };
    }
  }
  return null;
}

// The targets an item can feed: a checklist for one with steps, a repeating target for a habit.
function targetsFor(goal: GoalDraft, item: WorkItemDraft): TargetDraft[] {
  if (item.steps.length > 0) return goal.targets.filter((t) => t.measure === 'checklist');
  if (item.kind === 'habit') return goal.targets.filter((t) => t.period.kind !== 'deadline');
  return [];
}

const KINDS: Record<string, ItemKind> = {
  timeZone: {
    kind: 'timeZone',
    topic: 'time_zone',
    suggestion: 'device_time_zone',
    choices: noChoices,
    words: (value) => (isTimeZone(value) && /^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(value) ? value : null),
    set: (model, _parts, value) => {
      model.person.timeZone = value;
      return true;
    },
    current: (model) => model.person.timeZone,
    shown: (value) => value,
    fixesRule: true,
  },
  dayEnd: {
    kind: 'time',
    topic: 'day_end',
    suggestion: null,
    choices: noChoices,
    words: (value) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null),
    set: (model, _parts, value) => {
      model.person.dayEnd = value;
      return true;
    },
    current: (model) => model.person.dayEnd,
  },
  weekStart: {
    kind: 'weekday',
    topic: 'week_start',
    suggestion: null,
    choices: () => WEEKDAYS,
    words: (value, choices) => choices.find((c) => c.value === value)?.label ?? null,
    set: (model, _parts, value) => {
      model.person.weekStart = Number(value);
      return true;
    },
    current: (model) => model.person.weekStart,
  },
  floor: {
    kind: 'number',
    topic: 'floor',
    suggestion: null,
    choices: noChoices,
    words: (value) => (/^\d+(\.\d+)?$/.test(value.trim()) && Number(value) > 0 && Number(value) <= 1_000_000 ? value.trim() : null),
    set: (model, parts, value) => {
      const target = targetAt(model, parts);
      if (!target) return false;
      target.floor = Number(value);
      return true;
    },
    current: (model, parts) => targetAt(model, parts)?.floor ?? null,
  },
  unit: {
    kind: 'text',
    topic: 'target',
    suggestion: null,
    choices: noChoices,
    words: (value) => (value.trim().length > 0 && value.trim().length <= 300 ? value.trim() : null),
    set: (model, parts, value) => {
      const target = targetAt(model, parts);
      if (!target) return false;
      target.unit = value.trim();
      return true;
    },
    current: (model, parts) => targetAt(model, parts)?.unit ?? null,
  },
  startDate: {
    kind: 'date',
    topic: 'start_date',
    suggestion: 'today',
    choices: noChoices,
    words: dateWords,
    set: (model, parts, value) => {
      const goal = goalAt(model, parts);
      if (!goal) return false;
      goal.startDate = value;
      return true;
    },
    current: (model, parts) => goalAt(model, parts)?.startDate ?? null,
    // Written the way code writes a date it suggests, so the person's yes reads as accepting it (lib/setup/codeTurns.ts).
    shown: (value, today) => `today, ${casualDate(value, today, { relative: false })}`,
  },
  shape: {
    kind: 'choice',
    topic: 'shape',
    suggestion: null,
    choices: () => SHAPES,
    words: (value, choices) => choices.find((c) => c.value === value)?.label ?? null,
    set: (model, parts, value) => {
      const goal = goalAt(model, parts);
      if (!goal) return false;
      goal.shape = value as GoalDraft['shape'];
      return true;
    },
    current: (model, parts) => goalAt(model, parts)?.shape ?? null,
  },
  endDate: {
    kind: 'date',
    topic: 'end_date',
    suggestion: null,
    choices: noChoices,
    words: dateWords,
    set: (model, parts, value) => {
      const goal = goalAt(model, parts);
      if (!goal) return false;
      goal.endDate = value;
      return true;
    },
    current: (model, parts) => goalAt(model, parts)?.endDate ?? null,
  },
  source: {
    kind: 'choice',
    topic: 'source',
    suggestion: null,
    // Only the sources the code already supports: logging it yourself, or an app in the integration catalog.
    choices: () => [MANUAL, ...INTEGRATION_CATALOG.map((e) => ({ value: e.provider, label: e.name }))],
    words: (value, choices) => choices.find((c) => c.value === value)?.label ?? null,
    set: (model, parts, value) => {
      const target = targetAt(model, parts);
      if (!target) return false;
      target.sources = value === 'manual' ? [{ kind: 'manual' }] : [{ kind: 'synced', provider: value, metric: null }];
      return true;
    },
    current: (model, parts) => (targetAt(model, parts)?.sources.length ? 'set' : null),
  },
  metric: {
    kind: 'choice',
    topic: 'metric',
    suggestion: null,
    choices: (model, parts) => {
      const target = targetAt(model, parts);
      const open = target ? openSource(target) : null;
      return open?.kind === 'metric' ? quantityMetricsOf(open.provider).map((m) => ({ value: m.id, label: m.label })) : [];
    },
    words: (value, choices) => choices.find((c) => c.value === value)?.label ?? null,
    set: (model, parts, value) => {
      const target = targetAt(model, parts);
      const open = target ? openSource(target) : null;
      if (!target || open?.kind !== 'metric') return false;
      const source = target.sources.find((s) => s.kind === 'synced' && s.provider === open.provider && s.metric === null);
      if (source?.kind !== 'synced') return false;
      source.metric = value as QuantityMetric;
      return true;
    },
    current: () => null,
  },
  itemDueDate: {
    kind: 'date',
    topic: 'deadline_date',
    suggestion: null,
    choices: noChoices,
    words: dateWords,
    set: (model, parts, value) => {
      const item = itemAt(model, parts);
      if (!item) return false;
      item.dueDate = value;
      return true;
    },
    current: (model, parts) => itemAt(model, parts)?.dueDate ?? null,
  },
  dateCanMove: {
    kind: 'yesNo',
    topic: 'date_can_move',
    suggestion: null,
    choices: () => YES_NO,
    words: (value, choices) => choices.find((c) => c.value === value)?.label ?? null,
    set: (model, parts, value) => {
      const item = itemAt(model, parts);
      if (!item) return false;
      item.dateCanMove = value === 'yes';
      return true;
    },
    current: (model, parts) => itemAt(model, parts)?.dateCanMove ?? null,
    // An answer in the draft that the person never gave (Claude set it without asking) is asked again.
    fixesRule: true,
  },
  itemTarget: {
    kind: 'choice',
    topic: 'target',
    suggestion: null,
    choices: (model, parts) => {
      const goal = goalAt(model, parts);
      const item = itemAt(model, parts);
      return goal && item ? targetsFor(goal, item).map((t) => ({ value: t.key, label: t.title })) : [];
    },
    words: (value, choices) => choices.find((c) => c.value === value)?.label ?? null,
    set: (model, parts, value) => {
      const item = itemAt(model, parts);
      if (!item) return false;
      item.targetKey = value;
      return true;
    },
    current: (model, parts) => itemAt(model, parts)?.targetKey ?? null,
  },
};

// Which kind a draft path is, or null for a path the card has no control for (a goal to add, a target to add: only Claude can
// ask for those, so the card says to start again).
function kindOf(model: SetupModel, path: string): ItemKind | null {
  const parts = path.split('.');
  if (path === 'person.timeZone') return KINDS.timeZone;
  if (path === 'person.dayEnd') return KINDS.dayEnd;
  if (path === 'person.weekStart') return KINDS.weekStart;
  if (parts[0] !== 'goals' || !goalAt(model, parts)) return null;
  const goal = goalAt(model, parts) as GoalDraft;
  if (parts.length === 3) {
    if (parts[2] === 'startDate') return KINDS.startDate;
    if (parts[2] === 'shape') return KINDS.shape;
    if (parts[2] === 'endDate') return KINDS.endDate;
    return null;
  }
  if (parts.length !== 5) return null;
  if (parts[2] === 'targets') {
    const target = targetAt(model, parts);
    if (!target) return null;
    if (parts[4] === 'floor') return KINDS.floor;
    if (parts[4] === 'unit') return target.measure === 'quantity' && target.unit === null ? KINDS.unit : null;
    if (parts[4] === 'sources') {
      const open = openSource(target);
      return open?.kind === 'where' ? KINDS.source : open?.kind === 'metric' ? KINDS.metric : null;
    }
    return null;
  }
  if (parts[2] === 'items') {
    const item = itemAt(model, parts);
    if (!item) return null;
    if (parts[4] === 'dueDate') return item.kind === 'deadline_task' ? KINDS.itemDueDate : null;
    if (parts[4] === 'dateCanMove') return item.kind === 'deadline_task' ? KINDS.dateCanMove : null;
    if (parts[4] === 'targetKey') return targetsFor(goal, item).length > 0 ? KINDS.itemTarget : null;
  }
  return null;
}

// The items the card can offer for these issues, in the order of the "still needed" list, each with that list's own words. An
// item is offered when its value is missing, or is there but the person never said it; a value that breaks a rule on its own
// (an end date before the start) is not something a fill-in can fix, so the card leaves it to start again.
export function fillInItems(model: SetupModel, issues: DraftIssue[], words: MissingWords = {}): FillInItem[] {
  const out: FillInItem[] = [];
  const seen = new Set<string>();
  for (const issue of issues) {
    const line = describeIssue(model, issue, words);
    if (!line || seen.has(issue.path)) continue;
    const kind = kindOf(model, issue.path);
    if (!kind) continue;
    const parts = issue.path.split('.');
    if (issue.code === 'rule' && kind.current(model, parts) !== null && !kind.fixesRule) continue;
    const choices = kind.choices(model, parts);
    if ((kind.kind === 'choice' || kind.kind === 'weekday' || kind.kind === 'yesNo') && choices.length === 0) continue;
    seen.add(issue.path);
    out.push({ id: issue.path, line, kind: kind.kind, choices, suggestion: kind.suggestion });
  }
  return out;
}

export type FillInHow = 'said' | 'accepted';

export interface FillInRequest {
  itemId: string;
  value: string;
  how: FillInHow;
  // The date on the person's device, which a suggested start date must equal.
  today?: string;
}

export type FillInResult = { ok: true; session: SetupSession } | { ok: false; error: string };

export const FILL_IN_ERRORS = {
  notFillable: "That item can't be set here. Nothing was changed.",
  badValue: "That doesn't look right. Nothing was changed.",
  badZone: "That isn't a time zone Momentum knows. Nothing was changed.",
  badDate: "That date doesn't fit with the dates you already gave. Nothing was changed.",
  noSuggestion: 'That item has no suggestion. Nothing was changed.',
  tooMany: "That's more than can be set here. Nothing was changed.",
  notReady: "Setup can't take that right now. Nothing was changed.",
} as const;

const badFor = (kind: ItemKind): string =>
  kind.kind === 'timeZone' ? FILL_IN_ERRORS.badZone : kind.kind === 'date' ? FILL_IN_ERRORS.badDate : FILL_IN_ERRORS.badValue;

// Everything the validator reports, keyed so an issue that was already there can be told from one a new value caused.
const keyed = (issues: DraftIssue[]): Set<string> => new Set(issues.map((i) => `${i.path}|${i.message}`));

// The quick path counts as the person's approval of every part (lib/services/setup.ts withAllApproved).
const approvedAll = (session: SetupSession): SetupSession => ({ ...session, draft: { ...session.draft, approved: [...SETUP_CHUNKS] } });

// The session with one item filled in, or the plain reason it cannot be. `items` are the ones the server worked out from this
// same session, never the browser's: the item's id, words and kind come from there. The value is checked twice, first by its
// kind and then by the setup validator, which must have no issue at the item's own path and no issue it did not have before.
export function applyFillIn(session: SetupSession, items: FillInItem[], request: FillInRequest): FillInResult {
  const item = items.find((i) => i.id === request.itemId);
  if (!item) return { ok: false, error: FILL_IN_ERRORS.notFillable };
  const kind = kindOf(session.draft.model, item.id);
  const last = session.transcript[session.transcript.length - 1];
  if (!kind) return { ok: false, error: FILL_IN_ERRORS.notFillable };
  if (last?.role !== 'person') return { ok: false, error: FILL_IN_ERRORS.notReady };
  if (session.transcript.length + 2 > MAX_TRANSCRIPT_MESSAGES) return { ok: false, error: FILL_IN_ERRORS.tooMany };

  const words = kind.words(request.value, item.choices);
  if (words === null) return { ok: false, error: badFor(kind) };

  let proposal: string | null = null;
  if (request.how === 'accepted') {
    // Only the suggestion code showed: the device's time zone, or today for a start date.
    const offered = kind.suggestion === 'device_time_zone' || (kind.suggestion === 'today' && request.today !== undefined && request.value === request.today);
    if (!offered || !kind.shown) return { ok: false, error: FILL_IN_ERRORS.noSuggestion };
    proposal = kind.shown(request.value, request.today ?? request.value);
  }

  const model = structuredClone(session.draft.model);
  if (!kind.set(model, item.id.split('.'), request.value)) return { ok: false, error: FILL_IN_ERRORS.notFillable };

  // The question is the card's own line for the item, so the transcript reads as the person saw it.
  const asked: AssistantTurn = {
    kind: proposal === null ? 'question' : 'proposal',
    chunk: null,
    skipped: null,
    say: '',
    question: item.line,
    detail: null,
    topic: kind.topic,
    options: proposal === null ? [] : [proposal],
    draft: structuredClone(session.draft),
  };
  // A typed date is the date picker's own words (an exact date, with its year); anything else is the words the control showed.
  const answerAt = session.transcript.length + 1;
  const next: SetupSession = {
    ...session,
    transcript: [...session.transcript, { role: 'assistant', turn: asked }, { role: 'person', text: proposal === null ? words : PROPOSAL_YES_TEXT }],
    draft: { ...session.draft, model, said: [...session.draft.said, { path: item.id, turn: answerAt, how: request.how }] },
  };

  const parsed = SetupSessionSchema.safeParse(next);
  if (!parsed.success) return { ok: false, error: FILL_IN_ERRORS.badValue };
  const before = keyed(validateDraft(approvedAll(session).draft, session.transcript, 'final').issues);
  const after = validateDraft(approvedAll(parsed.data).draft, parsed.data.transcript, 'final').issues;
  // A new issue is fine only when it is the next thing to fill in (a shape that has an end date now needs the date; an app with
  // more than one number now needs which one counts). One at the item's own path, or a rule the new value broke, is not.
  const nextModel = parsed.data.draft.model;
  const followsUp = (i: DraftIssue): boolean => {
    const next = kindOf(nextModel, i.path);
    return next !== null && next.current(nextModel, i.path.split('.')) === null;
  };
  if (after.some((i) => (i.path === item.id || !before.has(`${i.path}|${i.message}`)) && !followsUp(i))) return { ok: false, error: badFor(kind) };
  return { ok: true, session: parsed.data };
}
