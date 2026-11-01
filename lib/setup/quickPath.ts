// What the person sees when Claude is no longer used for their setup (MOM-111, docs/DOMAIN_MODEL.md §2.3: "play back what
// was collected, offer the quick path, save nothing unapproved"). Both pieces are written by code from the draft, never by
// Claude: every part played back, and a list, in plain words, of what the draft still lacks before it can be saved. Pure.

import { INTEGRATION_CATALOG, quantityMetricsOf } from '@/lib/integrations/catalog';
import { SETUP_CHUNKS, type SetupChunk, type SetupModel } from '@/types/setup';
import type { PlaybackSection, QuickPathReason } from '@/types/setupScreen';
import { numberQuestion } from './numbers';
import { renderPlayback, type PlaybackOptions } from './playback';
import type { DraftIssue } from './validate';

export const CHUNK_TITLES: Record<SetupChunk, string> = {
  goals: 'Your goals',
  targets: "What you'll count",
  planning: 'Your days and weeks',
  talk: 'How Momentum talks to you',
};

// Every part, in the order setup plays them back.
export function quickPathSections(model: SetupModel, options: PlaybackOptions = {}): PlaybackSection[] {
  return SETUP_CHUNKS.map((chunk) => ({ chunk, title: CHUNK_TITLES[chunk], lines: renderPlayback(model, chunk, options) }));
}

const FALLBACK = 'Something in your answers needs another look.';

// What a missing-fact line needs to say a counted thing in the person's words, and a deadline as a date.
export interface MissingWords {
  today?: string | null;
  said?: readonly string[];
}

// One validator issue as a thing the person has not told us yet. The validator's own messages are written for Claude
// ("Ask the time zone before a target is saved"), so they are not shown. The `approved.*` issues are skipped: saving from
// the quick path is the person's approval of every part shown.
export function describeIssue(model: SetupModel, issue: DraftIssue, words: MissingWords): string | null {
  const parts = issue.path.split('.');
  if (parts[0] === 'approved') return null;
  if (parts[0] === 'person') {
    switch (parts[1]) {
      case 'timeZone':
        return 'Your time zone.';
      case 'dayEnd':
        return 'When your day ends.';
      case 'weekStart':
        return 'Which day your week starts.';
      default:
        return 'A little more about you.';
    }
  }
  if (parts[0] === 'goals' && parts.length === 1) return 'At least one goal.';
  if (parts[0] === 'goals' && parts.length >= 3) {
    const goal = model.goals.find((g) => g.key === parts[1]);
    const goalName = goal ? `"${goal.title}"` : 'a goal';
    if (parts[2] === 'targets' && parts.length >= 5) {
      const target = goal?.targets.find((t) => t.key === parts[3]);
      const name = target ? `"${target.title}"` : 'something you count';
      switch (parts[4]) {
        // The same question, in the same words, as the number card (lib/setup/numbers.ts); round 3d.
        case 'floor':
          return target ? numberQuestion('floor', target, words.today ?? null, words.said ?? []) : `The number that would still count in a hard week for ${name}.`;
        case 'sources': {
          // An app with more than one number to count asks which one; otherwise the question is where it is tracked.
          const open = target?.sources.find((src) => src.kind === 'synced' && src.metric === null && target.measure === 'quantity' && quantityMetricsOf(src.provider).length > 0);
          return open?.kind === 'synced' ? `Which number counts for ${name} in ${INTEGRATION_CATALOG.find((e) => e.provider === open.provider)?.name ?? 'that app'}.` : `Where ${name} is tracked.`;
        }
        case 'unit':
          return `The unit for ${name}.`;
        default:
          return `A little more about ${name}.`;
      }
    }
    if (parts[2] === 'items' && parts.length >= 5) {
      const item = goal?.items.find((i) => i.key === parts[3]);
      const name = item ? `"${item.title}"` : 'a step';
      switch (parts[4]) {
        case 'dueDate':
          return `The date for ${name}.`;
        case 'dateCanMove':
          return `Whether the date for ${name} can move.`;
        case 'targetKey':
          return `What ${name} counts toward.`;
        default:
          return `A little more about ${name}.`;
      }
    }
    switch (parts[2]) {
      case 'startDate':
        return `A start date for ${goalName}.`;
      case 'shape':
        return `Whether ${goalName} keeps going, has an end date, or has a deadline.`;
      case 'endDate':
        return `The end date for ${goalName}.`;
      case 'blockWeeks':
        return `How many weeks the first stretch of ${goalName} runs.`;
      case 'targets':
        return `At least one thing to count for ${goalName}.`;
      case 'returnWhen':
        return `When ${goalName} comes back.`;
      default:
        return `A little more about ${goalName}.`;
    }
  }
  return FALLBACK;
}

// What is still missing, in plain words and without repeats. Empty when the draft can be saved.
export function describeMissing(model: SetupModel, issues: DraftIssue[], words: MissingWords = {}): string[] {
  const seen = new Set<string>();
  for (const issue of issues) {
    const line = describeIssue(model, issue, words);
    if (line) seen.add(line);
  }
  return [...seen];
}


// The words of the quick-path card, in everyday words, written by code. No default is ever applied, so an incomplete setup is never
// saved: what is missing is asked for, one plain question at a time, and the way forward is stated before any button.
export const QUICK_PATH_WORDS = {
  // The top line of a card with questions left: how many quick steps remain (one step may hold several answers).
  topLine: (steps: number): string => `Almost done: ${steps} quick ${steps === 1 ? 'step' : 'steps'} and your setup is saved`,
  readyTop: 'Everything is in. Look it over, then save.',
  // Something only Claude could ask for is missing (a goal to add): the card cannot finish it.
  stuckTop: "This setup can't be saved yet",
  stuckHelp: "Only Claude could ask for this, and it can't right now. Start again to begin a new setup.",
  stepOf: (step: number, steps: number): string => `${step} of ${steps}`,
  // Why setup stopped, once, at the top of a card that still has questions.
  reasonLimit: 'Claude has hit its question limit for this setup. Everything you said is kept, and these last answers finish it.',
  reasonWait: "Claude can't take more questions right now. Everything you said is kept, and these last answers finish it.",
  needsAnswer: 'Needs your answer',
  yourAnswer: 'Your answer',
  cantAnswerHere: "Can't be answered here",
  next: 'Next',
  back: 'Back',
  save: 'Save my setup',
  setItem: 'Set',
  startAgain: 'Start again',
  confirmStartOver: 'This clears everything you told me. Start again?',
  confirmYes: 'Yes, start again',
  confirmNo: 'Keep what I have',
  fillStays: 'What you answer here stays in this tab until you save.',
  searchZones: 'Search time zones',
  noZones: 'No time zone matches that.',
  fillFailed: "That didn't go through. Nothing was changed. Try again.",
  useDeviceZone: (zone: string): string => `Use this device's time zone: ${zone}`,
  useToday: (day: string): string => `Use today, ${day}`,
} as const;

// Whether waiting helps (MOM-111, quick-path card): the shared limit, a per-person limit and a limit check that failed all lift on
// their own, and the person's answers stay in their tab until then. A setup's own budget does not: that setup can not ask more.
export function quickPathCanWait(reason: QuickPathReason): boolean {
  return reason === 'shared_cap' || reason === 'person_cap' || reason === 'unchecked';
}

// The one line that says why setup stopped using Claude.
export const quickPathReason = (reason: QuickPathReason): string => (quickPathCanWait(reason) ? QUICK_PATH_WORDS.reasonWait : QUICK_PATH_WORDS.reasonLimit);
