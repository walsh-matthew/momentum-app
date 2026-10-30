// What the person sees when Claude is no longer used for their setup (MOM-111, docs/DOMAIN_MODEL.md §2.3: "play back what
// was collected, offer the quick path, save nothing unapproved"). Both pieces are written by code from the draft, never by
// Claude: every part played back, and a list, in plain words, of what the draft still lacks before it can be saved. Pure.

import { SETUP_CHUNKS, type SetupChunk, type SetupModel } from '@/types/setup';
import type { PlaybackSection } from '@/types/setupScreen';
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
function describeIssue(model: SetupModel, issue: DraftIssue, words: MissingWords): string | null {
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
          return target ? numberQuestion('floor', target, words.today ?? null, words.said ?? []) : `The number that makes a week count for ${name}.`;
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
