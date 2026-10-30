// What a retry is told when Claude's reply was thrown away (MOM-111 root cause A). A retry used to send exactly the same input,
// so Claude repeated the same mistake until "Try again", which failed the same way. Now the next attempt hears, in fixed words
// written here, which rule failed and what to do instead. Nothing the person typed goes into it, and nothing of the turn that
// failed: only these sentences and, for a draft rule, the paths it failed at (keys and field names, never values). Pure.

import type { z } from 'zod';
import { AssistantTurnSchema } from '@/types/setup';
import type { Violation, ViolationCode } from './checks';
import { describeAt } from './schemaText';

const ASK_DONT_GUESS = 'Ask the person for it in this turn, in plain words; do not guess another value and do not write it in the draft until they say it.';

export const RETRY_FEEDBACK: Record<ViolationCode, string> = {
  'one_question.none': 'Ask one question, in the "question" field.',
  'one_question.marks': 'Use exactly one question mark in the whole turn, at the end of the "question" field.',
  'one_question.no_mark': 'End the question with a question mark.',
  'one_question.hidden': 'Put no question in "say", "detail" or "options"; only the "question" field asks.',
  'one_question.sentences': 'Make the question one sentence.',
  'one_question.joined': 'Ask one thing only; leave the second ask for its own turn.',
  'one_question.options': 'Give options only on an ideas, interpretations or proposal turn.',
  'assume_nothing.word': 'Leave out any day, part of a day or clock time the person has not said.',
  'assume_nothing.changed': 'Change a value only when the person\'s newest message changes it; keep the rest of the draft as it was.',
  no_announced_reminder: 'Ask whether they would like a reminder; never say there will be one.',
  'choice.ideas_unasked':
    'Give starting ideas only after the person asks for ideas, examples or a recommendation. Ask "Do you have something in mind, or would some starting ideas help?" instead.',
  'choice.offer_words': 'The offer is "Do you have something in mind, or would some starting ideas help?"',
  'choice.offer_examples': 'The offer itself holds no examples and no options.',
  'choice.examples':
    'A question about the goal itself or a number holds no examples unless the person asked for ideas, a recommendation, or what the question means.',
  'skip.repeat': 'That topic is already answered: skip it in one line and ask the next thing.',
  'skip.unanswered': 'Skip only a topic the person has already answered.',
  'skip.long': 'Make the skip line one short sentence.',
  'interpretations.count': 'Offer two to four interpretations.',
  'interpretations.guessed': 'The answer did not fit the question: offer two to four interpretations instead of guessing.',
  'interpretations.changed': 'Change nothing in the draft until the person picks an interpretation.',
  'playback.words': 'On a playback or final turn, "say" is "", "question" is null and "options" is []; code writes the playback.',
  'playback.final_changed': 'The final confirmation changes nothing in the model.',
  'playback.no_chunk': 'A playback turn names its part in "chunk".',
  'playback.stray_chunk': 'Only a playback turn sets "chunk"; set it to null.',
  'playback.early_final': 'Play back and get approval for every part before the final confirmation.',
  'playback.final_long': 'The final confirmation is a few lines; code writes it.',
  'playback.unapproved': 'Mark a part approved only after its playback and the person\'s yes.',
  'playback.changed_after': 'That part changed after it was approved: take it out of "approved" and play it back again.',
  'math.score': 'Do not score, grade or rate anything.',
  'math.arithmetic': 'Do no arithmetic.',
  'math.number': 'Write no number the person has not said, except inside starting ideas, interpretations or a proposal.',
  'draft.no_source': `A value in the draft has no source. ${ASK_DONT_GUESS}`,
  'draft.not_said': `A value in the draft is not in the person's message. ${ASK_DONT_GUESS}`,
  'draft.not_accepted': `A value in the draft was not shown to the person and accepted. ${ASK_DONT_GUESS}`,
  'draft.rule': 'The draft breaks a rule at the paths below; fix only those values, from what the person said.',
  'plain.lead_in':
    'The "say" line only reacts to the person\'s last answer, in one short line, or is "". Never preview the question ("Next, I\'ll...", "Next is..."); the question carries the meaning on its own.',
  'plain.activity':
    'Name no activity (exercising, working out, running, lifting, the gym and the like) the person has not said. Use their own words, or general ones like moving more.',
  'plain.question_long': 'Keep "question" to the core ask, in at most about 12 words; move the examples and the reason into "detail".',
  'plain.date_lead_in': 'On a date question or a date proposal, "say" is "" or a short reaction that does not repeat the date; the question shows it.',
  'choice.ideas_context':
    'Give an offer of ideas, and starting ideas, a "detail" line saying what the options count and that they are starting points, from what the person said.',
  'choice.ideas_bare':
    'Write each option that has a number with what is counted, in the person\'s words, and its period ("2 sessions a week"), never a bare number or "3 a week".',
  'choice.ideas_scale':
    'Do not list a fixed run of numbers. Give two to four options that follow the goal and how often it happens, from what the person said.',
};

const DRAFT_CODES = new Set<ViolationCode>(['draft.no_source', 'draft.not_said', 'draft.not_accepted', 'draft.rule']);

// A reply that was not one readable turn at all, when nothing more specific can be said.
export const SHAPE_FEEDBACK = 'Reply with exactly one JSON object in the shape given, with every key, and nothing else.';

// ---------------------------------------------------------------------------
// A reply that did not match the shape, or was not a reply at all (MOM-111 round 2, A)
// ---------------------------------------------------------------------------
//
// In the second phone run every reply at the "where do you track it" step was thrown away as 'schema' or 'output', seven
// times, and each retry heard only SHAPE_FEEDBACK, so it made the same mistake again. Now a retry hears each place the reply
// broke the shape and what the schema needs there, from the same schema the prompt's shape text is written from, and a reply
// that was not usable says which way: cut off at the length limit, no text, or not JSON.

// Why a model answer could not be read as JSON (lib/ai/setup.ts).
export const OUTPUT_PROBLEMS = ['max_tokens', 'no_text', 'not_json'] as const;
export type OutputProblem = (typeof OUTPUT_PROBLEMS)[number];

export const OUTPUT_FEEDBACK: Record<OutputProblem, string> = {
  max_tokens:
    'Your reply was cut off at the length limit before it ended. Think briefly, keep "say" and "detail" short, and write the JSON object straight away.',
  no_text: 'Your reply had no text in it. Reply with the JSON object.',
  not_json: 'Your reply was not one valid JSON object. Reply with exactly one JSON object and no other text, not even a code fence.',
};

const MAX_SHAPE_LINES = 6;
const MAX_NEED_CHARS = 300;

// A path as the reply writes it: draft.model.goals[0].targets[0].sources[0].provider.
export function pathText(path: readonly PropertyKey[]): string {
  return path.reduce<string>((out, step) => (typeof step === 'number' ? `${out}[${step}]` : out ? `${out}.${String(step)}` : String(step)), '') || '(the reply)';
}

const clip = (text: string): string => (text.length > MAX_NEED_CHARS ? `${text.slice(0, MAX_NEED_CHARS - 1)}…` : text);

// One line per place the reply broke the shape, at most MAX_SHAPE_LINES, each naming the path and what goes there. The key
// names in an "unrecognized key" issue are Claude's own, never the person's words; a value is never quoted.
export function shapeFeedback(issues: readonly z.core.$ZodIssue[]): string[] {
  const lines: string[] = [];
  for (const issue of issues) {
    const at = pathText(issue.path);
    let line: string;
    if (issue.code === 'unrecognized_keys') {
      const keys = issue.keys.map((k) => JSON.stringify(k)).join(', ');
      line = `${at}: remove ${issue.keys.length === 1 ? 'the key' : 'the keys'} ${keys}; only the keys of the shape given are allowed there, and every one of them is required.`;
    } else {
      const need = describeAt(AssistantTurnSchema, issue.path as (string | number)[]);
      line = need === null ? `${at}: this is not part of the shape; leave it out.` : `${at}: must be ${clip(need)}.`;
    }
    if (!lines.includes(line)) lines.push(line);
    if (lines.length === MAX_SHAPE_LINES) break;
  }
  return lines.length > 0 ? lines : [SHAPE_FEEDBACK];
}

// A key name as it may be logged: a key-like name, or <key> for anything else (it could be text Claude copied).
const loggableKey = (key: PropertyKey): string | number => (typeof key === 'number' ? key : /^[A-Za-z_][A-Za-z0-9_]{0,40}$/.test(String(key)) ? String(key) : '<key>');

// The shape issues of a thrown-away reply, for the log: paths and zod's issue codes only, never a value (MOM-111 round 2, A).
export function shapeIssuesForLog(issues: readonly z.core.$ZodIssue[]): { path: string; code: string; keys?: string[] }[] {
  return issues.slice(0, 12).map((issue) => {
    const entry: { path: string; code: string; keys?: string[] } = { path: issue.path.map(loggableKey).join('.') || '(reply)', code: issue.code };
    if (issue.code === 'unrecognized_keys') entry.keys = issue.keys.map((k) => String(loggableKey(k)));
    return entry;
  });
}

export const RETRY_HEADER ='Your last reply was not used, because it broke these rules. Write the turn again, fixing them:';

// The feedback for one thrown-away reply: one line per rule that failed, in a fixed order, with the draft paths it failed at.
export function retryFeedback(violations: readonly Violation[]): string[] {
  const byCode = new Map<ViolationCode, Set<string>>();
  for (const x of violations) {
    const paths = byCode.get(x.code) ?? new Set<string>();
    if (x.path && (DRAFT_CODES.has(x.code) || x.code === 'plain.activity' || x.code === 'assume_nothing.changed')) paths.add(x.path);
    byCode.set(x.code, paths);
  }
  return [...byCode.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, paths]) => (paths.size > 0 ? `${RETRY_FEEDBACK[code]} Paths: ${[...paths].sort().join(', ')}.` : RETRY_FEEDBACK[code]));
}

// The draft paths a thrown-away reply failed at, for the log (MOM-111: paths only, never values). A day type's path carries
// its name, which is the person's own words, so the log shows <name> there instead.
export const failingPaths = (violations: readonly Violation[]): string[] =>
  [...new Set(violations.flatMap((x) => (x.path ? [x.path.replace(/^person\.dayTypes\.[^.]+/, 'person.dayTypes.<name>')] : [])))].sort();
