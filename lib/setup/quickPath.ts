// What the person sees when Claude is no longer used for their setup (MOM-111, docs/DOMAIN_MODEL.md §2.3: "play back what
// was collected, offer the quick path, save nothing unapproved"). Both pieces are written by code from the draft, never by
// Claude: every part played back, and a list, in plain words, of what the draft still lacks before it can be saved. Pure.

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
        case 'sources':
          return `Where ${name} is tracked.`;
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

// Whether waiting helps (MOM-111, quick-path card): the shared limit, a per-person limit and a limit check that failed all lift on
// their own, and the person's answers stay in their tab until then. A setup's own budget does not: that setup can not ask more.
export function quickPathCanWait(reason: QuickPathReason): boolean {
  return reason === 'shared_cap' || reason === 'person_cap' || reason === 'unchecked';
}

// The words of the quick-path card besides what happened (the server's sentence for the reason) and the playback. Written by
// code, in everyday words, so the person knows what to do next before any button. No default is ever applied, so an incomplete
// setup is never saved, and the way forward is stated, not promised.
export const QUICK_PATH_WORDS = {
  readyTitle: 'Your setup is ready to save',
  missingTitle: "Setup can't be saved yet",
  intro: 'Here is everything you told me so far.',
  readyNext: "Look it over. If it's right, tap \"Save what I have\". Nothing is saved until you do.",
  missingWait:
    "Setup can't be saved without the items above, and Claude can't ask for them right now. Wait a little, then reload this page: your answers stay in this tab and setup picks up where it stopped. Or tap \"Start again\" to begin a new setup; that clears the answers here.",
  missingNoWait:
    "Setup can't be saved without the items above, and this setup can't ask for them any more. Tap \"Start again\" to begin a new setup; that clears the answers here.",
  fillIn:
    "Claude can't ask for the items above right now, so you can set them here. When they are all set, tap \"Save what I have\". Nothing is saved until you do.",
  fillStays: 'What you set here stays in this tab until you save.',
  setItem: 'Set',
  searchZones: 'Search time zones',
  noZones: 'No time zone matches that.',
  fillFailed: "That didn't go through. Nothing was changed. Try again.",
  saveOff: 'Save is off until the items above are set.',
  confirmStartOver: 'Start again? What you have said so far will be cleared.',
  confirmYes: 'Yes, start again',
  confirmNo: 'Keep what I have',
} as const;

// `fillable` is true when every missing item can be set on the card: then the card says so instead of waiting or starting again.
export function quickPathNext(reason: QuickPathReason, complete: boolean, fillable = false): string {
  if (complete) return QUICK_PATH_WORDS.readyNext;
  if (fillable) return QUICK_PATH_WORDS.fillIn;
  return quickPathCanWait(reason) ? QUICK_PATH_WORDS.missingWait : QUICK_PATH_WORDS.missingNoWait;
}
