// Layer 2 of the weekly review: the one plain line Claude writes about the week (docs/DOMAIN_MODEL.md §3.1 and §3.3, MOM-113
// block 3.3). Pure: no database, no model, no network. Two jobs.
//
// 1. buildReflectionFacts() picks the facts Claude is told, and nothing else: the person's own target titles, where each
//    ended as a WORD, what crossed as words, the pattern kinds, the trend's direction and the tone setting. No counts, units,
//    dates, goal titles, priorities or ids. Claude gets no number to repeat, and every field is listed in
//    lib/config/privacy.ts (PROMPTS.review) and pinned by tests/review-prompt-fields.test.ts.
// 2. checkReflectionLine() decides, in code, whether what Claude wrote may be shown. Claude writes words and code checks
//    them (principle 9): one sentence, no digit or number word, no question, no ask, no score. The person's own target
//    titles are exempt as they were sent, because a title can hold a digit ("Run 5k") or a word that looks like an ask
//    ("Try a new recipe"); everything around a title is checked in full, and a word is matched whole, so "retry" is not "try".

import { z } from 'zod';
import type { Tone } from '@/types/database.types';
import type { StoredRecap } from '@/types/review';
import type { Layer1TargetFact } from '@/types/scoreboard';
import { levelWords } from './levelWords';

// A review with more targets than this tells Claude about the first ones only (the order the recap shows them in).
export const REFLECTION_MAX_TARGETS = 20;
export const REFLECTION_MAX_CHARS = 200;

export type ReflectionCrossing = 'floor' | 'aspiration' | 'block_end';
export type ReflectionPattern = 'slipping' | 'holding' | 'aspiration_repeated';
export type ReflectionTrend = 'up' | 'steady' | 'down';

export interface ReflectionTarget {
  // The person's own words, as they wrote it.
  title: string;
  // Where the week ended, in words (lib/review/levelWords.ts).
  level: string;
  crossings: ReflectionCrossing[];
  patterns: ReflectionPattern[];
  trend: ReflectionTrend | null;
}

// Everything the review line is built from. This is what the privacy notice lists, field by field.
export interface ReflectionFacts {
  tone: Tone;
  targets: ReflectionTarget[];
}

const CROSSINGS: readonly string[] = ['floor', 'aspiration', 'block_end'];
const TREND_WORDS = { up: 'up', flat: 'steady', down: 'down', insufficient: null } as const;

const unique = <T>(items: T[]): T[] => [...new Set(items)].sort() as T[];

// The recap's targets in the order the screen shows them, with what the engine found for each. A target the recap names but the
// engine has no fact for is left out. With nothing to say the list is empty, and no call is made.
export function buildReflectionFacts(recap: StoredRecap, facts: Layer1TargetFact[], tone: Tone): ReflectionFacts {
  const byTarget = new Map(facts.map((f) => [f.targetId, f]));
  const targets: ReflectionTarget[] = [];
  for (const goal of recap.goals) {
    for (const target of goal.targets) {
      const fact = byTarget.get(target.id);
      if (fact === undefined) continue;
      targets.push({
        title: target.title,
        level: levelWords(fact.result),
        crossings: unique(fact.crossings.map((c) => c.kind).filter((k): k is ReflectionCrossing => CROSSINGS.includes(k))),
        patterns: unique(fact.patterns.map((p) => p.kind)),
        trend: fact.trend === null ? null : TREND_WORDS[fact.trend.direction],
      });
    }
  }
  return { tone, targets: targets.slice(0, REFLECTION_MAX_TARGETS) };
}

// ---------------------------------------------------------------------------
// The reply
// ---------------------------------------------------------------------------

const ReplySchema = z.object({ line: z.string() }).strict();

export type LineProblem = 'empty' | 'too_long' | 'not_one_sentence' | 'question' | 'number' | 'score' | 'ask' | 'markup';
export type ReplyProblem = LineProblem | 'unreadable';

// The note a retry carries, in code's own words (never anything the person typed): which rule the last try broke.
export const REFLECTION_RETRY_NOTES: Record<ReplyProblem, string> = {
  unreadable: 'Reply with only the JSON object {"line": "..."}.',
  empty: 'Write one plain sentence about the week.',
  too_long: `Make the line shorter: one sentence under ${REFLECTION_MAX_CHARS} characters.`,
  not_one_sentence: 'Write one sentence only, on one line.',
  question: 'Do not ask a question.',
  number: 'Use no digits and no number words.',
  score: 'Do not use a score, grade, rating or percentage.',
  ask: 'Do not ask or suggest anything. Only say how the week went.',
  markup: 'Write plain text only, with no formatting.',
};

const NUMBER_WORDS = new RegExp(
  '\\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|dozen|half|twice|thrice|double|triple|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\\b',
  'i',
);
const SCORE_WORDS = /%|\b(?:percent|percentage|score|scores|scored|scoring|grade|grades|graded|rating|rated|point|points)\b/i;
// Whole words and phrases only: "retry", "entry" and "mustard" are not asks.
const ASK_WORDS = new RegExp(
  "\\b(?:try|trying|consider|remember|should|shouldn['’]t|must|please|ensure|let['’]s|lets|why not|make sure|don['’]t forget|do not forget|you could|you might want|you may want|you ought|aim|aim to|need to|needs to|have to|plan to|commit to|think about|reflect on|ask yourself|take a moment|keep going|keep it up)\\b",
  'i',
);

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The line with each of the person's titles, exactly as sent, taken out (longest first). A title only counts when it stands
// alone as a whole phrase, so a short title cannot hide the middle of a longer word.
function withoutTitles(line: string, titles: readonly string[]): string {
  const ordered = [...new Set(titles.map((t) => t.trim()).filter((t) => t.length > 0))].sort((a, b) => b.length - a.length);
  let rest = line;
  for (const title of ordered) {
    rest = rest.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(title)}(?![\\p{L}\\p{N}])`, 'gu'), '');
  }
  return rest;
}

export type LineCheck = { ok: true; line: string } | { ok: false; problem: LineProblem };

// May this line be shown? `titles` are the target titles that were sent with the facts.
export function checkReflectionLine(line: unknown, titles: readonly string[]): LineCheck {
  if (typeof line !== 'string') return { ok: false, problem: 'empty' };
  const text = line.trim();
  if (text.length === 0) return { ok: false, problem: 'empty' };
  if (text.length > REFLECTION_MAX_CHARS) return { ok: false, problem: 'too_long' };

  const rest = withoutTitles(text, titles);
  if (/[\r\n]/.test(rest)) return { ok: false, problem: 'not_one_sentence' };
  if (/[*_#`<>[\]{}|\\]/.test(rest)) return { ok: false, problem: 'markup' };
  if (/[?？]/.test(rest)) return { ok: false, problem: 'question' };
  if (/\p{N}/u.test(rest) || NUMBER_WORDS.test(rest)) return { ok: false, problem: 'number' };
  if (SCORE_WORDS.test(rest)) return { ok: false, problem: 'score' };
  if (ASK_WORDS.test(rest)) return { ok: false, problem: 'ask' };
  // One sentence: at most one stop, and only at the end.
  const stops = rest.match(/[.!…]+(?=\s|$)/g) ?? [];
  if (stops.length > 1 || (stops.length === 1 && !/[.!…]+$/.test(rest))) return { ok: false, problem: 'not_one_sentence' };
  return { ok: true, line: text };
}

// The model's parsed JSON as a checked line, or why it cannot be used.
export function readReflectionReply(raw: unknown, titles: readonly string[]): LineCheck | { ok: false; problem: 'unreadable' } {
  const parsed = ReplySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, problem: 'unreadable' };
  return checkReflectionLine(parsed.data.line, titles);
}

// Written by code when Claude's line could not be used after the retry. It says nothing about the week, so it cannot be wrong,
// and the screen says it is Momentum's, not Claude's.
export const REFLECTION_FALLBACK_LINES: Record<Tone, string> = {
  gentle: 'Here is how your week ended, in your own targets.',
  middle: 'Here is how your week ended against your own targets.',
  direct: 'That is how your week ended against your own targets.',
};
