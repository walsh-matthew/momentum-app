// Builds a scripted setup conversation for the eval set (MOM-111): Claude's turns and the person's replies together, with
// the draft and its provenance accumulated as the script goes. The transcript alternates, assistant first, so assistant
// turn t sits at index 2t and the person's reply to it at 2t + 1. A step's `said` paths point at the person's newest
// message (the reply to the turn before) unless written "path@n", the reply to assistant turn n.

import { emptyDraft } from '@/lib/setup/draft';
import type { PersonLine, SetupModelFn } from '@/lib/setup/evals';
import type {
  AssistantTurn,
  GoalDraft,
  PlainWords,
  SetupChunk,
  SetupDraft,
  SetupModel,
  SetupTopic,
  TargetDraft,
  TurnKind,
  WorkItemDraft,
} from '@/types/setup';

export const goal = (key: string, title: string, over: Partial<GoalDraft> = {}): GoalDraft => ({
  key,
  title,
  why: null,
  startDate: null,
  shape: null,
  endDate: null,
  blockWeeks: null,
  state: 'active',
  returnWhen: null,
  completionMode: null,
  tone: null,
  targets: [],
  items: [],
  ...over,
});

export const target = (key: string, title: string, over: Partial<TargetDraft> = {}): TargetDraft => ({
  key,
  title,
  measure: 'count',
  unit: null,
  role: 'effort',
  period: { kind: 'weekly' },
  floor: null,
  aspiration: null,
  qualifyingThreshold: null,
  carryOver: 'habit',
  completionMode: null,
  tone: null,
  sources: [],
  ...over,
});

export const item = (key: string, kind: WorkItemDraft['kind'], title: string, over: Partial<WorkItemDraft> = {}): WorkItemDraft => ({
  key,
  kind,
  title,
  targetKey: null,
  dueDate: null,
  dateCanMove: null,
  estimateMinutes: null,
  steps: [],
  ...over,
});

export const goalOf = (m: SetupModel, key: string): GoalDraft => {
  const g = m.goals.find((x) => x.key === key);
  if (!g) throw new Error(`no goal ${key}`);
  return g;
};
export const targetOf = (m: SetupModel, goalKey: string, key: string): TargetDraft => {
  const t = goalOf(m, goalKey).targets.find((x) => x.key === key);
  if (!t) throw new Error(`no target ${key}`);
  return t;
};

export interface Step {
  kind?: TurnKind;
  topic?: SetupTopic;
  chunk?: SetupChunk;
  say?: string;
  question?: string;
  // The question's examples and reason, under it in regular weight (MOM-111 round 2, finding 1).
  detail?: string;
  options?: string[];
  skipped?: { topic: SetupTopic; line: string };
  // Changes to the model this turn makes (it applies the person's last reply).
  edit?: (model: SetupModel) => void;
  said?: string[];
  accepted?: string[];
  approve?: SetupChunk[];
  unapprove?: SetupChunk[];
  // Do not approve the part just played back (a replay after a change).
  noApproval?: boolean;
  // Claude's clean versions of the person's words this turn adds (MOM-111 finding 11).
  plain?: PlainWords[];
  // The person's reply to this turn.
  reply?: string | PersonLine;
}

export class Script {
  readonly turns: AssistantTurn[] = [];
  readonly person: PersonLine[] = [];
  private draft: SetupDraft;
  private pending: SetupChunk | null = null;

  // `start` is the draft the conversation begins from: the blank one for a first setup, or a returning person's (MOM-132 part 2).
  constructor(start: SetupDraft = emptyDraft()) {
    this.draft = structuredClone(start);
  }

  // The index the next assistant turn will have, to point at the reply to a turn about to be added.
  get next(): number {
    return this.turns.length;
  }

  add(step: Step): this {
    const t = this.turns.length;
    const draft = this.draft;
    step.edit?.(draft.model);
    const mark = (spec: string, how: 'said' | 'accepted') => {
      const [path, at] = spec.split('@');
      const turn = at === undefined ? 2 * t - 1 : 2 * Number(at) + 1;
      draft.said = draft.said.filter((s) => s.path !== path);
      draft.said.push({ path, turn, how });
    };
    step.said?.forEach((s) => mark(s, 'said'));
    step.accepted?.forEach((s) => mark(s, 'accepted'));
    for (const p of step.plain ?? []) draft.plain = [...draft.plain.filter((x) => x.path !== p.path), p];

    const approve = [...(this.pending && !step.noApproval ? [this.pending] : []), ...(step.approve ?? [])];
    this.pending = null;
    for (const c of approve) if (!draft.approved.includes(c)) draft.approved.push(c);
    if (step.unapprove) draft.approved = draft.approved.filter((c) => !step.unapprove?.includes(c));

    this.turns.push({
      kind: step.kind ?? 'question',
      chunk: step.chunk ?? null,
      skipped: step.skipped ?? null,
      say: step.say ?? '',
      question: step.question ?? null,
      detail: step.detail ?? null,
      topic: step.topic ?? null,
      options: step.options ?? [],
      draft: structuredClone(draft),
    });
    if (step.reply !== undefined) this.person.push(typeof step.reply === 'string' ? { say: step.reply } : step.reply);
    return this;
  }

  playback(chunk: SetupChunk, reply: string | PersonLine = 'Yes, that is right.', extra: Step = {}): this {
    this.add({ ...extra, kind: 'playback', chunk, reply });
    this.pending = chunk;
    return this;
  }

  final(): this {
    return this.add({ kind: 'final' });
  }
}

// A model that says exactly what the script says, turn by turn.
export function scriptedModel(turns: AssistantTurn[]): SetupModelFn {
  return ({ transcript }) => {
    const n = transcript.filter((m) => m.role === 'assistant').length;
    const turn = turns[n];
    if (!turn) throw new Error(`the script has no turn ${n}`);
    return structuredClone(turn);
  };
}
