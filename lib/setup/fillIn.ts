// What the quick path card lets the person fill in, and how a filled-in value enters the draft (MOM-111, docs/DOMAIN_MODEL.md
// §2.1 and §2.3). When setup stops using Claude, a person who has not given, say, a time zone must not lose everything they
// said. Each item the saved model still needs becomes a control on the card; what they set is added to the draft the way an
// answer to Claude is, so the same validator and the same first-setup save apply, unchanged:
// - a typed (or picked) value is a code-written question, in the card's exact words, then the person's own message holding the
//   value, and the draft records it as `said`;
// - a suggestion they took (only the device's time zone, and today for a start date) is a code-written proposal showing it,
//   then a yes, and the draft records it as `accepted`, so it is marked a starting point and checked at the first review.
// No default is ever applied (principle 1): nothing is filled in without the person's tap, and no suggestion exists for the
// floor, the day end, the week start, the unit or the source. Claude is not called. Pure.

import { isTimeZone, validateDraft, type DraftIssue } from './validate';
import { describeIssue, type MissingWords } from './quickPath';
import { PROPOSAL_YES_TEXT } from './session';
import {
  MAX_TRANSCRIPT_MESSAGES,
  SETUP_CHUNKS,
  SetupSessionSchema,
  type AssistantTurn,
  type SetupModel,
  type SetupSession,
  type SetupTopic,
  type TargetDraft,
} from '@/types/setup';
import type { FillInChoice, FillInItem, FillInKind, FillInSuggestion } from '@/types/setupScreen';

const WEEKDAYS: FillInChoice[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((label, i) => ({
  value: String(i + 1),
  label,
}));

// What an item sets and how: its control, its suggestion, the question's topic, and a function that puts the value in a copy
// of the model.
interface ItemKind {
  kind: FillInKind;
  topic: SetupTopic;
  suggestion: FillInSuggestion | null;
  choices: FillInChoice[];
  // The person's words for the value (their message), or null when the value is not one this kind accepts.
  words: (value: string, choices: FillInChoice[]) => string | null;
  // Sets the value in the model. Returns false when the model has nothing at that path.
  set: (model: SetupModel, parts: string[], value: string) => boolean;
  // A suggestion's text, for the proposal that shows it. Null when this kind has none.
  shown?: (value: string) => string;
}

const targetAt = (model: SetupModel, parts: string[]): TargetDraft | undefined =>
  model.goals.find((g) => g.key === parts[1])?.targets.find((t) => t.key === parts[3]);

const KINDS: Record<string, ItemKind> = {
  timeZone: {
    kind: 'timeZone',
    topic: 'time_zone',
    suggestion: 'device_time_zone',
    choices: [],
    words: (value) => (isTimeZone(value) && /^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(value) ? value : null),
    set: (model, _parts, value) => {
      model.person.timeZone = value;
      return true;
    },
    shown: (value) => value,
  },
  dayEnd: {
    kind: 'time',
    topic: 'day_end',
    suggestion: null,
    choices: [],
    words: (value) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null),
    set: (model, _parts, value) => {
      model.person.dayEnd = value;
      return true;
    },
  },
  weekStart: {
    kind: 'weekday',
    topic: 'week_start',
    suggestion: null,
    choices: WEEKDAYS,
    words: (value, choices) => choices.find((c) => c.value === value)?.label ?? null,
    set: (model, _parts, value) => {
      model.person.weekStart = Number(value);
      return true;
    },
  },
  floor: {
    kind: 'number',
    topic: 'floor',
    suggestion: null,
    choices: [],
    words: (value) => (/^\d+(\.\d+)?$/.test(value.trim()) && Number(value) > 0 && Number(value) <= 1_000_000 ? value.trim() : null),
    set: (model, parts, value) => {
      const target = targetAt(model, parts);
      if (!target) return false;
      target.floor = Number(value);
      return true;
    },
  },
  unit: {
    kind: 'text',
    topic: 'target',
    suggestion: null,
    choices: [],
    words: (value) => (value.trim().length > 0 && value.trim().length <= 300 ? value.trim() : null),
    set: (model, parts, value) => {
      const target = targetAt(model, parts);
      if (!target) return false;
      target.unit = value.trim();
      return true;
    },
  },
};

// Which kind a draft path is, or null for a path the card has no control for (a goal to add, a target to add: only Claude can
// ask for those, so the card says to start again).
function kindOf(model: SetupModel, path: string): ItemKind | null {
  const parts = path.split('.');
  if (path === 'person.timeZone') return KINDS.timeZone;
  if (path === 'person.dayEnd') return KINDS.dayEnd;
  if (path === 'person.weekStart') return KINDS.weekStart;
  if (parts[0] === 'goals' && parts[2] === 'targets' && parts.length === 5) {
    const target = targetAt(model, parts);
    if (!target) return null;
    if (parts[4] === 'floor') return KINDS.floor;
    if (parts[4] === 'unit' && target.measure === 'quantity' && target.unit === null) return KINDS.unit;
  }
  return null;
}

// The items the card can offer for these issues, in the order of the "still needed" list, each with that list's own words.
export function fillInItems(model: SetupModel, issues: DraftIssue[], words: MissingWords = {}): FillInItem[] {
  const out: FillInItem[] = [];
  const seen = new Set<string>();
  for (const issue of issues) {
    const line = describeIssue(model, issue, words);
    if (!line || seen.has(issue.path)) continue;
    const kind = kindOf(model, issue.path);
    if (!kind) continue;
    seen.add(issue.path);
    out.push({ id: issue.path, line, kind: kind.kind, choices: kind.choices, suggestion: kind.suggestion });
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
  noSuggestion: "That item has no suggestion. Nothing was changed.",
  tooMany: "That's more than can be set here. Nothing was changed.",
  notReady: "Setup can't take that right now. Nothing was changed.",
} as const;

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
  if (words === null) return { ok: false, error: kind.kind === 'timeZone' ? FILL_IN_ERRORS.badZone : FILL_IN_ERRORS.badValue };

  let proposal: string | null = null;
  if (request.how === 'accepted') {
    if (kind.suggestion === null || !kind.shown) return { ok: false, error: FILL_IN_ERRORS.noSuggestion };
    proposal = kind.shown(request.value);
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
  if (after.some((i) => i.path === item.id || !before.has(`${i.path}|${i.message}`))) {
    return { ok: false, error: kind.kind === 'timeZone' ? FILL_IN_ERRORS.badZone : FILL_IN_ERRORS.badValue };
  }
  return { ok: true, session: parsed.data };
}
