// What the quick path card asks, and how an answer enters the draft (MOM-111, docs/DOMAIN_MODEL.md §2.1 and §2.3). When setup
// stops using Claude, a person who has not given, say, a time zone must not lose everything they said. Each thing the saved model
// still needs becomes a plain question on the card, with a control; what they answer is added to the draft the way an answer to
// Claude is, so the same validator and the same first-setup save apply, unchanged:
// - a typed (or picked) value is a code-written question, in the card's exact words, then the person's own message holding the
//   value, and the draft records it as `said`;
// - a suggestion they took (only the device's time zone, and today for a start date) is a code-written proposal showing it,
//   then a yes, and the draft records it as `accepted`, so it is marked a starting point and checked at the first review.
// Every code-written question carries FILL_IN_MARK in its detail line, so an answer given here can be told from one given to
// Claude: the card lets the person change their own answers, and nothing else.
// No default is ever applied (principle 1): nothing is filled in without the person's tap, and no suggestion exists for the
// floor, the day end, the week start, the unit or the source. A source is one the code already supports (lib/integrations/
// catalog.ts), or the person logging it themselves. Claude is not called. Pure.

import { casualDate } from '@/lib/dates/casual';
import { INTEGRATION_CATALOG, quantityMetricsOf } from '@/lib/integrations/catalog';
import type { QuantityMetric } from '@/types/database.types';
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
import type { FillInChoice, FillInItem, FillInKind, FillInSuggestion, QuickStep } from '@/types/setupScreen';
import { latestProvenance } from './leaves';
import { numberQuestion, countedThing } from './numbers';
import { countedWords } from './playback';
import { describeIssue, type MissingWords } from './quickPath';
import { DAYS_STEP_ID, goalStepId, itemStepId, targetStepId } from './quickRecap';
import { titleOf } from './restate';
import { PROPOSAL_YES_TEXT, pickedDateText } from './session';
import { isTimeZone, validateDraft, type DraftIssue } from './validate';

// The detail line of every question code writes on the quick path. Claude, if it ever takes the conversation up again, reads it as
// what it is.
export const FILL_IN_MARK = 'Set on the quick path.';

const WEEKDAYS: FillInChoice[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((label, i) => ({
  value: String(i + 1),
  label,
}));

const SHAPES: FillInChoice[] = [
  { value: 'ongoing', label: 'It keeps going' },
  { value: 'finite', label: 'It ends on a date' },
  { value: 'project', label: 'It has a deadline' },
];

const YES_NO: FillInChoice[] = [
  { value: 'yes', label: 'Yes, it can move' },
  { value: 'no', label: "No, it can't move" },
];

const MANUAL: FillInChoice = { value: 'manual', label: "I'll log it myself" };

const DAY_END_HINT = "If you're often up past midnight, pick when your day really ends, like 2:00 AM. Late entries then count toward the day before.";

// What an item asks and how it sets the draft: its control, its question, its suggestion, and the functions that read and write the
// draft.
interface ItemKind {
  kind: FillInKind;
  topic: SetupTopic;
  suggestion: FillInSuggestion | null;
  // The question, in plain words. It is also what the transcript records, so the transcript reads as the person saw it.
  question: (model: SetupModel, parts: string[], words: MissingWords) => string;
  hint?: string;
  // The choices on offer for this draft (the same ones the server checks the value against).
  choices: (model: SetupModel, parts: string[]) => FillInChoice[];
  // The person's words for the value (their message), or null when the value is not one this kind accepts.
  words: (value: string, choices: FillInChoice[]) => string | null;
  // Sets the value in the model. Returns false when the model has nothing at that path.
  set: (model: SetupModel, parts: string[], value: string) => boolean;
  // What the draft holds there now, as the control writes it: null when nothing is set.
  answer: (model: SetupModel, parts: string[]) => string | null;
  // A suggestion's text, for the proposal that shows it, given the device's today.
  shown?: (value: string, today: string) => string;
  // A value that already breaks a rule can be replaced here (a time zone name nobody knows).
  fixesRule?: boolean;
}

const goalAt = (model: SetupModel, parts: string[]): GoalDraft | undefined => model.goals.find((g) => g.key === parts[1]);
const targetAt = (model: SetupModel, parts: string[]): TargetDraft | undefined => goalAt(model, parts)?.targets.find((t) => t.key === parts[3]);
const itemAt = (model: SetupModel, parts: string[]): WorkItemDraft | undefined => goalAt(model, parts)?.items.find((i) => i.key === parts[3]);
const noChoices = (): FillInChoice[] => [];
const textOf = (v: string | number | null | undefined): string | null => (v === null || v === undefined ? null : String(v));

const isRealDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const dateWords = (value: string): string | null => (isRealDate(value) ? pickedDateText(value) : null);
const labelOf = (value: string, choices: FillInChoice[]): string | null => choices.find((c) => c.value === value)?.label ?? null;

// The source a target counts in an app that has more than one number to count: the one whose number is still to be chosen, or
// already chosen.
function metricSource(target: TargetDraft) {
  if (target.measure !== 'quantity') return undefined;
  return target.sources.find((s) => s.kind === 'synced' && quantityMetricsOf(s.provider).length > 0);
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
    question: () => 'Which time zone are you in?',
    choices: noChoices,
    words: (value) => (isTimeZone(value) && /^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(value) ? value : null),
    set: (model, _parts, value) => {
      model.person.timeZone = value;
      return true;
    },
    answer: (model) => model.person.timeZone,
    shown: (value) => value,
    fixesRule: true,
  },
  dayEnd: {
    kind: 'time',
    topic: 'day_end',
    suggestion: null,
    question: () => 'What time do you check in each day?',
    hint: DAY_END_HINT,
    choices: noChoices,
    words: (value) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null),
    set: (model, _parts, value) => {
      model.person.dayEnd = value;
      return true;
    },
    answer: (model) => model.person.dayEnd,
  },
  weekStart: {
    kind: 'weekday',
    topic: 'week_start',
    suggestion: null,
    question: () => 'Which day does your week start on?',
    choices: () => WEEKDAYS,
    words: labelOf,
    set: (model, _parts, value) => {
      model.person.weekStart = Number(value);
      return true;
    },
    answer: (model) => textOf(model.person.weekStart),
  },
  floor: {
    kind: 'number',
    topic: 'floor',
    suggestion: null,
    question: (model, parts, words) => {
      const t = targetAt(model, parts);
      return t ? numberQuestion('floor', t, words.today ?? null, words.said ?? []) : 'In a hard week, how many would still count?';
    },
    choices: noChoices,
    words: (value) => (/^\d+(\.\d+)?$/.test(value.trim()) && Number(value) > 0 && Number(value) <= 1_000_000 ? value.trim() : null),
    set: (model, parts, value) => {
      const target = targetAt(model, parts);
      if (!target) return false;
      target.floor = Number(value);
      return true;
    },
    answer: (model, parts) => textOf(targetAt(model, parts)?.floor),
  },
  unit: {
    kind: 'text',
    topic: 'target',
    suggestion: null,
    question: (model, parts, words) => {
      const t = targetAt(model, parts);
      return t ? `What unit do you count ${countedWords(t.title, words.said ?? [])} in?` : 'What unit do you count it in?';
    },
    choices: noChoices,
    words: (value) => (value.trim().length > 0 && value.trim().length <= 300 ? value.trim() : null),
    set: (model, parts, value) => {
      const target = targetAt(model, parts);
      if (!target) return false;
      target.unit = value.trim();
      return true;
    },
    answer: (model, parts) => targetAt(model, parts)?.unit ?? null,
  },
  startDate: {
    kind: 'date',
    topic: 'start_date',
    suggestion: 'today',
    question: () => 'When do you want to start this goal?',
    choices: noChoices,
    words: dateWords,
    set: (model, parts, value) => {
      const goal = goalAt(model, parts);
      if (!goal) return false;
      goal.startDate = value;
      return true;
    },
    answer: (model, parts) => goalAt(model, parts)?.startDate ?? null,
    // Written the way code writes a date it suggests, so the person's yes reads as accepting it (lib/setup/codeTurns.ts).
    shown: (value, today) => `today, ${casualDate(value, today, { relative: false })}`,
  },
  shape: {
    kind: 'choice',
    topic: 'shape',
    suggestion: null,
    question: () => 'Does this goal keep going, end on a date, or have a deadline?',
    choices: () => SHAPES,
    words: labelOf,
    set: (model, parts, value) => {
      const goal = goalAt(model, parts);
      if (!goal) return false;
      goal.shape = value as GoalDraft['shape'];
      // Changing the answer: a goal that keeps going has no end date, and one with no end date needs none kept.
      if (value === 'ongoing') goal.endDate = null;
      return true;
    },
    answer: (model, parts) => goalAt(model, parts)?.shape ?? null,
  },
  endDate: {
    kind: 'date',
    topic: 'end_date',
    suggestion: null,
    question: () => 'What date should this goal end on?',
    choices: noChoices,
    words: dateWords,
    set: (model, parts, value) => {
      const goal = goalAt(model, parts);
      if (!goal) return false;
      goal.endDate = value;
      return true;
    },
    answer: (model, parts) => goalAt(model, parts)?.endDate ?? null,
  },
  source: {
    kind: 'choice',
    topic: 'source',
    suggestion: null,
    question: (model, parts, words) => {
      const t = targetAt(model, parts);
      return t ? `Where do you track ${countedThing(t, words.said ?? [])}?` : 'Where do you track this?';
    },
    // Only the sources the code already supports: logging it yourself, or an app in the integration catalog.
    choices: () => [MANUAL, ...INTEGRATION_CATALOG.map((e) => ({ value: e.provider, label: e.name }))],
    words: labelOf,
    set: (model, parts, value) => {
      const target = targetAt(model, parts);
      if (!target) return false;
      target.sources = value === 'manual' ? [{ kind: 'manual' }] : [{ kind: 'synced', provider: value, metric: null }];
      return true;
    },
    answer: (model, parts) => {
      const source = targetAt(model, parts)?.sources[0];
      return source ? (source.kind === 'manual' ? 'manual' : source.provider) : null;
    },
  },
  metric: {
    kind: 'choice',
    topic: 'metric',
    suggestion: null,
    question: (model, parts, words) => {
      const t = targetAt(model, parts);
      const source = t ? metricSource(t) : undefined;
      const app = source?.kind === 'synced' ? (INTEGRATION_CATALOG.find((e) => e.provider === source.provider)?.name ?? 'that app') : 'that app';
      return t ? `Which number counts for ${countedThing(t, words.said ?? [])} in ${app}?` : 'Which number counts?';
    },
    choices: (model, parts) => {
      const t = targetAt(model, parts);
      const source = t ? metricSource(t) : undefined;
      return source?.kind === 'synced' ? quantityMetricsOf(source.provider).map((m) => ({ value: m.id, label: m.label })) : [];
    },
    words: labelOf,
    set: (model, parts, value) => {
      const t = targetAt(model, parts);
      const source = t ? metricSource(t) : undefined;
      if (source?.kind !== 'synced') return false;
      source.metric = value as QuantityMetric;
      return true;
    },
    answer: (model, parts) => {
      const t = targetAt(model, parts);
      const source = t ? metricSource(t) : undefined;
      return source?.kind === 'synced' ? source.metric : null;
    },
  },
  itemDueDate: {
    kind: 'date',
    topic: 'deadline_date',
    suggestion: null,
    question: () => 'What date is this due?',
    choices: noChoices,
    words: dateWords,
    set: (model, parts, value) => {
      const item = itemAt(model, parts);
      if (!item) return false;
      item.dueDate = value;
      return true;
    },
    answer: (model, parts) => itemAt(model, parts)?.dueDate ?? null,
  },
  dateCanMove: {
    kind: 'yesNo',
    topic: 'date_can_move',
    suggestion: null,
    question: () => 'Can that date move?',
    choices: () => YES_NO,
    words: labelOf,
    set: (model, parts, value) => {
      const item = itemAt(model, parts);
      if (!item) return false;
      item.dateCanMove = value === 'yes';
      return true;
    },
    answer: (model, parts) => {
      const moves = itemAt(model, parts)?.dateCanMove;
      return moves === null || moves === undefined ? null : moves ? 'yes' : 'no';
    },
    // An answer in the draft that the person never gave (Claude set it without asking) is asked again.
    fixesRule: true,
  },
  itemTarget: {
    kind: 'choice',
    topic: 'target',
    suggestion: null,
    question: () => 'What does this count toward?',
    choices: (model, parts) => {
      const goal = goalAt(model, parts);
      const item = itemAt(model, parts);
      return goal && item ? targetsFor(goal, item).map((t) => ({ value: t.key, label: t.title })) : [];
    },
    words: labelOf,
    set: (model, parts, value) => {
      const item = itemAt(model, parts);
      if (!item) return false;
      item.targetKey = value;
      return true;
    },
    answer: (model, parts) => itemAt(model, parts)?.targetKey ?? null,
  },
};

const METRIC_SUFFIX = '#metric';
const pathOf = (id: string): string => (id.endsWith(METRIC_SUFFIX) ? id.slice(0, -METRIC_SUFFIX.length) : id);
const partsOf = (id: string): string[] => pathOf(id).split('.');

// The kind an item id is, for this draft, or null when the draft has nothing there that this card can ask about.
function kindOfId(model: SetupModel, id: string): ItemKind | null {
  const path = pathOf(id);
  const parts = path.split('.');
  if (path === 'person.timeZone') return KINDS.timeZone;
  if (path === 'person.dayEnd') return KINDS.dayEnd;
  if (path === 'person.weekStart') return KINDS.weekStart;
  if (parts[0] !== 'goals') return null;
  const goal = goalAt(model, parts);
  if (!goal) return null;
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
    if (parts[4] === 'floor') return id === path ? KINDS.floor : null;
    if (parts[4] === 'unit') return id === path && target.measure === 'quantity' ? KINDS.unit : null;
    if (parts[4] === 'sources') {
      if (id !== path) return metricSource(target) ? KINDS.metric : null;
      return KINDS.source;
    }
    return null;
  }
  if (parts[2] === 'items' && id === path) {
    const item = itemAt(model, parts);
    if (!item) return null;
    if (parts[4] === 'dueDate') return item.kind === 'deadline_task' ? KINDS.itemDueDate : null;
    if (parts[4] === 'dateCanMove') return item.kind === 'deadline_task' ? KINDS.dateCanMove : null;
    if (parts[4] === 'targetKey') return targetsFor(goal, item).length > 0 ? KINDS.itemTarget : null;
  }
  return null;
}

// The item a validator issue asks for, or null when no control on the card can supply it. An item is offered when its value is
// missing, or is there but the person never said it; a value that breaks a rule on its own (an end date before the start) is not
// something an answer can fix, so the card leaves it to Start again.
function itemForIssue(model: SetupModel, issue: DraftIssue): { id: string; kind: ItemKind } | null {
  const parts = issue.path.split('.');
  let id = issue.path;
  if (parts[0] === 'goals' && parts[2] === 'targets' && parts[4] === 'sources') {
    const target = targetAt(model, parts);
    if (!target) return null;
    if (target.sources.length > 0) {
      const source = metricSource(target);
      if (source?.kind !== 'synced' || source.metric !== null) return null;
      id = `${issue.path}${METRIC_SUFFIX}`;
    }
  }
  const kind = kindOfId(model, id);
  if (!kind) return null;
  if (issue.code === 'rule' && kind.answer(model, partsOf(id)) !== null && !kind.fixesRule) return null;
  return { id, kind };
}

// Was the value at this item answered on the card? Its newest record in the draft must follow one of the questions written here.
function answeredOnCard(session: SetupSession, id: string, kind: ItemKind): boolean {
  const entry = latestProvenance(session.draft.said, id);
  const asked = entry ? session.transcript[entry.turn - 1] : undefined;
  return asked?.role === 'assistant' && asked.turn.detail === FILL_IN_MARK && asked.turn.topic === kind.topic;
}

// Every id the card could ask about for this draft, in the order a person meets them: each goal (its own questions, then each
// thing it counts, then each work item), then their days.
function candidateIds(model: SetupModel): string[] {
  const ids: string[] = [];
  for (const g of model.goals) {
    const base = `goals.${g.key}`;
    ids.push(`${base}.startDate`, `${base}.shape`, `${base}.endDate`);
    for (const t of g.targets) {
      const tb = `${base}.targets.${t.key}`;
      ids.push(`${tb}.floor`, `${tb}.unit`, `${tb}.sources`, `${tb}.sources${METRIC_SUFFIX}`);
    }
    for (const i of g.items) {
      const ib = `${base}.items.${i.key}`;
      ids.push(`${ib}.dueDate`, `${ib}.dateCanMove`, `${ib}.targetKey`);
    }
  }
  ids.push('person.timeZone', 'person.dayEnd', 'person.weekStart');
  return ids;
}

// Which step an item is in, and what the step is called. Time zone, day end and week start are one step, "Your days".
function stepFor(model: SetupModel, id: string): { id: string; sectionId: string; title: string } {
  const parts = partsOf(id);
  if (parts[0] === 'person') return { id: DAYS_STEP_ID, sectionId: DAYS_STEP_ID, title: 'Your days' };
  const goal = goalAt(model, parts) as GoalDraft;
  const section = goalStepId(goal);
  if (parts[2] === 'targets') {
    const t = targetAt(model, parts) as TargetDraft;
    return { id: targetStepId(goal, t), sectionId: section, title: titleOf(t.title) };
  }
  if (parts[2] === 'items') {
    const i = itemAt(model, parts) as WorkItemDraft;
    return { id: itemStepId(goal, i), sectionId: section, title: titleOf(i.title) };
  }
  return { id: section, sectionId: section, title: titleOf(goal.title) };
}

export interface FillInPlan {
  // Every item, answered or not, in the order a person meets them.
  all: FillInItem[];
  // The ones still missing.
  missing: FillInItem[];
  steps: QuickStep[];
  // What is missing and nothing on the card can supply, in plain words.
  stuck: string[];
}

// The quick path's questions for a session: what is missing now, what the person already answered on the card (which they can
// change), the steps they fall into, and what only Claude could have asked for.
export function planFillIn(session: SetupSession, issues: DraftIssue[], words: MissingWords = {}): FillInPlan {
  const model = session.draft.model;
  const wanted = new Map<string, ItemKind>();
  const stuck: string[] = [];
  for (const issue of issues) {
    const line = describeIssue(model, issue, words);
    if (!line) continue;
    const found = itemForIssue(model, issue);
    if (found) wanted.set(found.id, found.kind);
    else if (!stuck.includes(line)) stuck.push(line);
  }

  const build = (id: string, kind: ItemKind, answered: boolean): FillInItem => {
    const parts = partsOf(id);
    return {
      id,
      line: kind.question(model, parts, words),
      hint: kind.hint ?? null,
      kind: kind.kind,
      choices: kind.choices(model, parts),
      suggestion: kind.suggestion,
      answered,
      answer: answered ? kind.answer(model, parts) : null,
    };
  };

  const all: FillInItem[] = [];
  for (const id of candidateIds(model)) {
    const missingKind = wanted.get(id);
    if (missingKind) {
      all.push(build(id, missingKind, false));
      continue;
    }
    const kind = kindOfId(model, id);
    if (kind && kind.answer(model, partsOf(id)) !== null && answeredOnCard(session, id, kind)) all.push(build(id, kind, true));
  }
  // A choice with nothing to choose from (a habit with no target to feed) cannot be answered here.
  const answerable = all.filter((i) => (i.kind !== 'choice' && i.kind !== 'weekday' && i.kind !== 'yesNo') || i.choices.length > 0);
  const steps: QuickStep[] = [];
  for (const item of answerable) {
    const step = stepFor(model, item.id);
    const have = steps.find((s) => s.id === step.id);
    if (have) have.items.push(item);
    else steps.push({ ...step, items: [item] });
  }
  return { all: answerable, missing: answerable.filter((i) => !i.answered), steps, stuck };
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
  notFillable: "That can't be answered here. Nothing was changed.",
  badValue: "That doesn't look right. Nothing was changed.",
  badZone: "That isn't a time zone Momentum knows. Nothing was changed.",
  badDate: "That date doesn't fit with the dates you already gave. Nothing was changed.",
  noSuggestion: 'That has no suggestion. Nothing was changed.',
  tooMany: "That's more than can be answered here. Nothing was changed.",
  notReady: "Setup can't take that right now. Nothing was changed.",
} as const;

const badFor = (kind: ItemKind): string =>
  kind.kind === 'timeZone' ? FILL_IN_ERRORS.badZone : kind.kind === 'date' ? FILL_IN_ERRORS.badDate : FILL_IN_ERRORS.badValue;

// Everything the validator reports, keyed so an issue that was already there can be told from one a new value caused.
const keyed = (issues: DraftIssue[]): Set<string> => new Set(issues.map((i) => `${i.path}|${i.message}`));

// The quick path counts as the person's approval of every part (lib/services/setup.ts withAllApproved).
const approvedAll = (session: SetupSession): SetupSession => ({ ...session, draft: { ...session.draft, approved: [...SETUP_CHUNKS] } });

// The session with one answer in it, or the plain reason it cannot be. `items` are the ones the server worked out from this same
// session (planFillIn(...).all), never the browser's: the item's id, words and kind come from there. An item already answered on
// the card can be answered again; the newest answer is the one that counts (rule 7). The value is checked twice, first by its kind
// and then by the setup validator, which must have no issue it did not have before, except the next thing to answer.
export function applyFillIn(session: SetupSession, items: FillInItem[], request: FillInRequest): FillInResult {
  const item = items.find((i) => i.id === request.itemId);
  if (!item) return { ok: false, error: FILL_IN_ERRORS.notFillable };
  const kind = kindOfId(session.draft.model, item.id);
  const last = session.transcript[session.transcript.length - 1];
  if (!kind) return { ok: false, error: FILL_IN_ERRORS.notFillable };
  if (last?.role !== 'person') return { ok: false, error: FILL_IN_ERRORS.notReady };
  // The same answer again changes nothing, and adds nothing to the conversation.
  if (item.answered && request.how === 'said' && item.answer === request.value) return { ok: true, session };
  if (session.transcript.length + 2 > MAX_TRANSCRIPT_MESSAGES) return { ok: false, error: FILL_IN_ERRORS.tooMany };

  const personWords = kind.words(request.value, item.choices);
  if (personWords === null) return { ok: false, error: badFor(kind) };

  let proposal: string | null = null;
  if (request.how === 'accepted') {
    // Only the suggestion code showed: the device's time zone, or today for a start date.
    const offered = kind.suggestion === 'device_time_zone' || (kind.suggestion === 'today' && request.today !== undefined && request.value === request.today);
    if (!offered || !kind.shown) return { ok: false, error: FILL_IN_ERRORS.noSuggestion };
    proposal = kind.shown(request.value, request.today ?? request.value);
  }

  const model = structuredClone(session.draft.model);
  if (!kind.set(model, partsOf(item.id), request.value)) return { ok: false, error: FILL_IN_ERRORS.notFillable };

  // The question is the card's own line for the item, so the transcript reads as the person saw it.
  const asked: AssistantTurn = {
    kind: proposal === null ? 'question' : 'proposal',
    chunk: null,
    skipped: null,
    say: '',
    question: item.line,
    detail: FILL_IN_MARK,
    topic: kind.topic,
    options: proposal === null ? [] : [proposal],
    draft: structuredClone(session.draft),
  };
  const answerAt = session.transcript.length + 1;
  const next: SetupSession = {
    ...session,
    transcript: [...session.transcript, { role: 'assistant', turn: asked }, { role: 'person', text: proposal === null ? personWords : PROPOSAL_YES_TEXT }],
    draft: { ...session.draft, model, said: [...session.draft.said, { path: item.id, turn: answerAt, how: request.how }] },
  };

  const parsed = SetupSessionSchema.safeParse(next);
  if (!parsed.success) return { ok: false, error: FILL_IN_ERRORS.badValue };
  const before = keyed(validateDraft(approvedAll(session).draft, session.transcript, 'final').issues);
  const after = validateDraft(approvedAll(parsed.data).draft, parsed.data.transcript, 'final').issues;
  // A new issue is fine only when it is the next thing to answer (a shape that ends on a date now needs the date; an app with more
  // than one number now needs which one counts). One for this same item, or a rule the new value broke, is not.
  const nextModel = parsed.data.draft.model;
  const followsUp = (i: DraftIssue): boolean => {
    const found = itemForIssue(nextModel, i);
    return found !== null && found.id !== item.id && found.kind.answer(nextModel, partsOf(found.id)) === null;
  };
  const touchesItem = (i: DraftIssue): boolean => i.path === pathOf(item.id);
  if (after.some((i) => (touchesItem(i) || !before.has(`${i.path}|${i.message}`)) && !followsUp(i))) return { ok: false, error: badFor(kind) };
  return { ok: true, session: parsed.data };
}
