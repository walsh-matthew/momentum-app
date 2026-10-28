// What the person sees when Claude is no longer used for their setup (MOM-111, docs/DOMAIN_MODEL.md §2.3: "play back what
// was collected, offer the quick path, save nothing unapproved"). Both pieces are written by code from the draft, never by
// Claude: every part played back, and a list, in plain words, of what the draft still lacks before it can be saved. Pure.

import { SETUP_CHUNKS, type SetupChunk, type SetupModel } from '@/types/setup';
import type { PlaybackSection } from '@/types/setupScreen';
import { renderPlayback } from './playback';
import type { DraftIssue } from './validate';

export const CHUNK_TITLES: Record<SetupChunk, string> = {
  goals: 'Your goals',
  targets: 'What counts',
  planning: 'Planning',
  talk: 'How Momentum talks to you',
};

// Every part, in the order setup plays them back.
export function quickPathSections(model: SetupModel): PlaybackSection[] {
  return SETUP_CHUNKS.map((chunk) => ({ chunk, title: CHUNK_TITLES[chunk], lines: renderPlayback(model, chunk) }));
}

const FALLBACK = 'Something in your answers needs another look.';

// One validator issue as a thing the person has not told us yet. The validator's own messages are written for Claude
// ("Ask the time zone before a target is saved"), so they are not shown. The `approved.*` issues are skipped: saving from
// the quick path is the person's approval of every part shown.
function describeIssue(model: SetupModel, issue: DraftIssue): string | null {
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
      const name = target ? `"${target.title}"` : 'a target';
      switch (parts[4]) {
        case 'floor':
          return `The least you aim for with ${name}.`;
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
      const name = item ? `"${item.title}"` : 'a work item';
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
        return `Whether ${goalName} is ongoing, has an end date, or is a project.`;
      case 'endDate':
        return `The end date for ${goalName}.`;
      case 'blockWeeks':
        return `How long the first block of ${goalName} is.`;
      case 'targets':
        return `At least one target for ${goalName}.`;
      case 'returnWhen':
        return `When ${goalName} comes back.`;
      default:
        return `A little more about ${goalName}.`;
    }
  }
  return FALLBACK;
}

// What is still missing, in plain words and without repeats. Empty when the draft can be saved.
export function describeMissing(model: SetupModel, issues: DraftIssue[]): string[] {
  const seen = new Set<string>();
  for (const issue of issues) {
    const line = describeIssue(model, issue);
    if (line) seen.add(line);
  }
  return [...seen];
}
