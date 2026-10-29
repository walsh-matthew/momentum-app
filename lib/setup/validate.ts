// Checks a setup draft in code (docs/DOMAIN_MODEL.md §2.3): the same checks run every turn while Claude fills the draft
// ('progress') and again before anything is saved ('final'), so what the person approves is exactly what can be saved.
// What it enforces:
// - the shape (types/setup.ts) and every CHECK constraint of migration 013 that the draft can break;
// - the rules the database cannot check (BACKLOG, MOM-107): a real IANA time zone, each slot weekday once, a habit has
//   no steps;
// - principle 1 and rule 8: every number, date, clock time, weekday and yes/no answer in the draft points at something
//   the person said or accepted, and no free text carries a day or time word nobody said;
// - the deadline rule: a deadline task says whether its date can move, in both modes;
// - the rules the save needs (MOM-111): a synced source is an app Momentum can connect, and a work item with steps feeds a
//   checklist target (manual entry ticks a step through the item's target);
// - the ordering rule (MOM-107, MOM-125): a saved target needs the time zone and the day end, and the week start when a
//   weekly or day-slot target needs it. Setup collects them at step 10, after the targets, so only 'final' asks.
// Issues are written for the person-facing reader of the log, not as error codes, and never quote a value: a thrown-away
// reply is retried with them (lib/setup/feedback.ts, MOM-111 root cause A). Each carries a `code` for that feedback. Pure.

import { SUPPORTED_PROVIDER_IDS, quantityMetricsOf } from '@/lib/integrations/catalog';
import {
  SETUP_CHUNKS,
  SetupDraftSchema,
  type GoalDraft,
  type SetupDraft,
  type Transcript,
} from '@/types/setup';
import { freeTextLeaves, latestProvenance, provenanceLeaves, type Leaf } from './leaves';
import { personWords } from './said';
import {
  acceptsText,
  dateIsIn,
  datesIn,
  dayTimeWords,
  minutesOfClock,
  numbersIn,
  timesIn,
  weekdaysIn,
} from './text';

// no_source, not_said and not_accepted: a value in the draft the person did not give. The retry is told to ask for it in
// that turn and not to guess another value (MOM-111 finding 9). rule: anything else.
export type DraftIssueCode = 'no_source' | 'not_said' | 'not_accepted' | 'rule';

export interface DraftIssue {
  path: string;
  message: string;
  code: DraftIssueCode;
}
export type DraftMode = 'progress' | 'final';
export interface DraftValidation {
  ok: boolean;
  issues: DraftIssue[];
}

export function isTimeZone(name: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

// Does this text say this value? `minutes` also accepts hours: "2 hours" says 120.
export function textSaysLeaf(leaf: Leaf, text: string): boolean {
  switch (leaf.kind) {
    case 'number':
      return numbersIn(text).includes(leaf.value as number);
    case 'minutes': {
      const numbers = numbersIn(text);
      const value = leaf.value as number;
      return numbers.includes(value) || (/\b(hours?|hrs?)\b/i.test(text) && numbers.some((n) => n * 60 === value));
    }
    case 'date':
      return dateIsIn(leaf.value as string, datesIn(text));
    case 'time':
      return timesIn(text).includes(minutesOfClock(leaf.value as string));
    case 'weekday':
      return weekdaysIn(text).includes(leaf.value as number);
    case 'weekdays': {
      const said = weekdaysIn(text);
      return (leaf.value as number[]).every((d) => said.includes(d));
    }
    case 'flag':
      return true;
  }
}

// Everything an assistant turn showed the person: its lead-in, question, skip line and options.
const assistantText = (t: { say: string; question: string | null; skipped: { line: string } | null; options: string[] }): string =>
  [t.say, t.question ?? '', t.skipped?.line ?? '', ...t.options].join(' ');

function provenanceIssues(draft: SetupDraft, transcript: Transcript): DraftIssue[] {
  const issues: DraftIssue[] = [];
  for (const leaf of provenanceLeaves(draft.model)) {
    const entry = latestProvenance(draft.said, leaf.path);
    if (entry === undefined) {
      issues.push({
        path: leaf.path,
        code: 'no_source',
        message: 'This value has no source. A number, date, time, weekday or yes/no answer must be one the person said or accepted.',
      });
      continue;
    }
    const message = transcript[entry.turn];
    if (!message || message.role !== 'person') {
      issues.push({ path: leaf.path, code: 'no_source', message: 'The source is not one of the person\'s messages.' });
      continue;
    }
    if (leaf.kind === 'flag') {
      const asked = transcript[entry.turn - 1];
      if (entry.how !== 'said' || asked?.role !== 'assistant' || asked.turn.topic !== 'date_can_move') {
        issues.push({ path: leaf.path, code: 'rule', message: 'Whether a date can move must be the person\'s answer to its own question.' });
      }
      continue;
    }
    if (entry.how === 'said') {
      if (!textSaysLeaf(leaf, message.text)) {
        issues.push({ path: leaf.path, code: 'not_said', message: "The person's message does not say this value. Ask for it instead of working it out." });
      }
      continue;
    }
    // Accepted: a yes to a value the turn just before showed, in its question, lead-in or options, whatever kind of turn it
    // was (MOM-111 root cause B). The value still has to be in what was shown.
    const shown = transcript[entry.turn - 1];
    if (shown?.role !== 'assistant') {
      issues.push({ path: leaf.path, code: 'not_accepted', message: 'An accepted value must follow a suggestion shown to the person.' });
    } else if (!textSaysLeaf(leaf, assistantText(shown.turn))) {
      issues.push({ path: leaf.path, code: 'not_accepted', message: 'The turn the person answered does not show this value.' });
    } else if (!acceptsText(message.text)) {
      issues.push({ path: leaf.path, code: 'not_accepted', message: 'The person did not accept the suggestion.' });
    }
  }
  return issues;
}

function dayTimeIssues(draft: SetupDraft, transcript: Transcript): DraftIssue[] {
  const said = new Set(personWords(transcript).flatMap(dayTimeWords));
  const issues: DraftIssue[] = [];
  for (const { path, text } of freeTextLeaves(draft.model)) {
    const unsaid = dayTimeWords(text).filter((w) => !said.has(w));
    if (unsaid.length > 0) {
      issues.push({ path, code: 'rule', message: `Mentions "${unsaid[0].replace('time:', '')}", which the person did not say.` });
    }
  }
  return issues;
}

function goalIssues(goal: GoalDraft, mode: DraftMode): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const at = (path: string, message: string) => issues.push({ path: `goals.${goal.key}.${path}`, code: 'rule', message });
  const final = mode === 'final';

  if (goal.startDate && goal.endDate && goal.endDate <= goal.startDate) at('endDate', 'The end date must be after the start date.');
  if (goal.shape === 'ongoing' && goal.endDate) at('endDate', 'An ongoing goal has no end date; it runs in blocks.');
  if (goal.shape === 'finite' && !goal.endDate && final) at('endDate', 'A goal with an end date needs the exact date.');
  if (goal.blockWeeks !== null && goal.shape !== null && goal.shape !== 'ongoing') at('blockWeeks', 'Only an ongoing goal has a first-block length.');
  if (goal.state === 'active' && goal.returnWhen) at('returnWhen', 'Only a parked goal has a way back.');
  if (goal.state === 'parked' && !goal.returnWhen && final) at('returnWhen', 'A parked goal needs a way back: a date, a season or condition, or "only when I ask".');
  if (final) {
    // A parked goal is set aside, not planned: it may have neither (migration 014, MOM-128). Any other goal needs both,
    // as the database requires (goals_shape_start_required).
    if (goal.state === 'active') {
      if (!goal.startDate) at('startDate', 'The start date is missing. Propose today and let the person confirm it.');
      if (!goal.shape) at('shape', 'Ask whether the goal is ongoing, has an end date, or is a project.');
      if (goal.targets.length === 0) at('targets', 'An active goal needs at least one target.');
    }
    // With no shape there is no end date and no first block (the database says the same).
    if (goal.shape === null && goal.endDate) at('endDate', 'A goal with no shape has no end date. Ask its shape first.');
    if (goal.shape === null && goal.blockWeeks !== null) at('blockWeeks', 'A goal with no shape has no first-block length. Ask its shape first.');
  }

  const targetKeys = new Set<string>();
  for (const t of goal.targets) {
    const tat = (path: string, message: string) => at(`targets.${t.key}.${path}`, message);
    if (targetKeys.has(t.key)) tat('key', 'Two targets share a key.');
    targetKeys.add(t.key);
    if ((t.measure === 'quantity') !== (t.unit !== null)) tat('unit', 'A quantity needs a unit, and no other measure has one.');
    if (t.aspiration !== null && t.floor === null) tat('aspiration', 'An aspiration needs a floor beneath it.');
    if (t.aspiration !== null && t.floor !== null && t.aspiration < t.floor) tat('aspiration', 'The aspiration cannot be below the floor.');
    if (t.carryOver === 'cumulative' && t.period.kind !== 'deadline') tat('carryOver', 'A shortfall that stays owed needs a deadline.');
    if (t.period.kind === 'day_slots' && new Set(t.period.weekdays).size !== t.period.weekdays.length) {
      tat('period', 'Each named day appears once.');
    }
    for (const source of t.sources) {
      // Only an app Momentum can connect can be named as a source; anything else is manual for now.
      if (source.kind === 'synced' && !SUPPORTED_PROVIDER_IDS.includes(source.provider)) {
        tat('sources', 'That app cannot be connected yet. Offer logging it themselves for now.');
      }
    }
    if (final) {
      if (t.role === 'effort' && t.floor === null) tat('floor', 'An effort target needs a floor, the number the person named.');
      if (t.sources.length === 0) tat('sources', 'Ask where this is tracked (step 9).');
      // A quantity target bound to an app with more than one kind of number needs the person's answer to which one
      // counts (MOM-111, MOM-109 design review): never saved with the question still open.
      if (t.measure === 'quantity') {
        for (const source of t.sources) {
          if (source.kind === 'synced' && source.metric === null && quantityMetricsOf(source.provider).length > 0) {
            tat('sources', 'Ask which number counts for this target in that app.');
          }
        }
      }
    }
  }

  const itemKeys = new Set<string>();
  for (const i of goal.items) {
    const iat = (path: string, message: string) => at(`items.${i.key}.${path}`, message);
    if (itemKeys.has(i.key)) iat('key', 'Two work items share a key.');
    itemKeys.add(i.key);
    const target = i.targetKey === null ? null : goal.targets.find((t) => t.key === i.targetKey);
    if (i.targetKey !== null && !target) iat('targetKey', 'The target this item feeds is not in this goal.');
    // A step is ticked against a checklist target, so an item with steps has to feed one (MOM-110: manual entry finds the
    // target through the item).
    if (i.steps.length > 0) {
      if (target && target.measure !== 'checklist') iat('targetKey', 'An item with steps feeds a checklist target.');
      if (i.targetKey === null && final) iat('targetKey', 'An item with steps must feed a checklist target, so its steps can be ticked.');
    }
    if (i.kind === 'habit') {
      if (i.targetKey === null) iat('targetKey', 'A habit feeds a target.');
      if (target && target.period.kind === 'deadline') iat('targetKey', 'A habit feeds a repeating target, not a deadline.');
      if (i.steps.length > 0) iat('steps', 'A habit has no steps.');
    }
    if (i.kind === 'deadline_task') {
      if (i.dueDate === null) iat('dueDate', 'A deadline task needs its exact date.');
      if (i.dateCanMove === null) iat('dateCanMove', 'Can the date move? Ask the person in a separate question; there is no default.');
    } else {
      if (i.dueDate !== null) iat('dueDate', 'Only a deadline task has a due date.');
      if (i.dateCanMove !== null) iat('dateCanMove', 'Only a deadline task says whether its date can move.');
      if (i.estimateMinutes !== null) iat('estimateMinutes', 'Only a deadline task has an estimate.');
    }
  }
  return issues;
}

export function validateDraft(input: unknown, transcript: Transcript, mode: DraftMode): DraftValidation {
  const parsed = SetupDraftSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      // zod's own messages name the expected shape, never the value given.
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.') || '(draft)', code: 'rule' as const, message: i.message })),
    };
  }
  const draft = parsed.data;
  const { model } = draft;
  const issues: DraftIssue[] = [];
  const rule = (path: string, message: string) => issues.push({ path, code: 'rule', message });

  const goalKeys = new Set<string>();
  for (const goal of model.goals) {
    if (goalKeys.has(goal.key)) rule(`goals.${goal.key}.key`, 'Two goals share a key.');
    goalKeys.add(goal.key);
    issues.push(...goalIssues(goal, mode));
  }

  const { person } = model;
  if (person.timeZone !== null && !isTimeZone(person.timeZone)) {
    rule('person.timeZone', 'That is not a time zone name such as America/Chicago.');
  }
  const dayTypeNames = new Set<string>();
  for (const d of person.dayTypes) {
    if (dayTypeNames.has(d.name.toLowerCase())) rule(`person.dayTypes.${d.name.toLowerCase()}`, 'Two day types share a name.');
    dayTypeNames.add(d.name.toLowerCase());
    if ((d.capacityUnit === null) !== (d.capacityAmount === null)) {
      rule(`person.dayTypes.${d.name.toLowerCase()}`, 'A capacity is an amount and a unit together.');
    }
  }

  if (mode === 'final') {
    const targets = model.goals.flatMap((g) => g.targets);
    if (model.goals.length === 0) rule('goals', 'There is no goal to save.');
    if (targets.length > 0) {
      if (person.timeZone === null) rule('person.timeZone', 'Ask the time zone before a target is saved.');
      if (person.dayEnd === null) rule('person.dayEnd', 'Ask the day end before a target is saved.');
      if (person.weekStart === null && targets.some((t) => t.period.kind !== 'deadline')) {
        rule('person.weekStart', 'A weekly or day-slot target needs the week start. Ask for it.');
      }
    }
    for (const chunk of SETUP_CHUNKS) {
      if (!draft.approved.includes(chunk)) rule(`approved.${chunk}`, `The "${chunk}" part has not been played back and approved.`);
    }
  }

  issues.push(...provenanceIssues(draft, transcript));
  issues.push(...dayTimeIssues(draft, transcript));
  return { ok: issues.length === 0, issues };
}
