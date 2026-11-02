// Titles are short names, not sentences (MOM-167 part 1, docs/DOMAIN_MODEL.md §2.1 plain language). The playback writes a
// title into its own sentences ("{title} keeps going", "at least 2 {title} a week") and home prints it as a heading, so a title
// that is the person's whole sentence ("I want to get back into running") reads as "You want to get back into running keeps going".
// This is a heuristic over words, not language understanding, and it errs toward flagging: a flagged title is a reply to look
// at, retried once with fixed words (lib/setup/feedback.ts) and then shown, never a reason for "Try again" (owner decision
// 2026-11-02). A short imperative name ("Read more", "Get back into running") passes: it reads as a name. Pure.

import type { SetupModel } from '@/types/setup';

// The most words a name may have before it reads as a sentence.
export const TITLE_MAX_WORDS = 6;

// A title that starts like speech ("I want ...", "you want ...", "to get fit", "need to ...").
const SPEECH_START = /^(i|i'm|i've|i'd|i'll|we|we're|we've|we'll|you|you're|you've|you'll|let's|lets|want|wants|wanna|need to|needs to|going to|gonna|trying to|to)(\s|$)/i;
// A title that holds a clause of its own, whatever it starts with.
const CLAUSE = /\b(?:wants?|wanted) to\b|\bneeds? to\b|\bgoing to\b|\bwould like\b|\b(?:am|is|are|was|were)\b/i;
const ENDS_LIKE_SENTENCE = /[.!?]\s*$/;

const normal = (title: string): string => title.replace(/[’‘]/g, "'").trim();

// Does this title read as a sentence rather than a name?
export function isSentenceTitle(title: string): boolean {
  const text = normal(title);
  if (!text) return false;
  if (ENDS_LIKE_SENTENCE.test(text)) return true;
  if (SPEECH_START.test(text) || CLAUSE.test(text)) return true;
  return text.split(/\s+/).length > TITLE_MAX_WORDS;
}

// Is this draft path a title (a goal's, target's or work item's)? A clean version of one is the short name, never a sentence.
export const isTitlePath = (path: string): boolean => path.endsWith('.title');

// Every title the playback or home prints as a name, by the path the retry note names. A day type's path leaves its name out:
// the name is the person's own word and never goes into a note to Claude.
export function titleLeaves(model: SetupModel): { path: string; title: string }[] {
  const out: { path: string; title: string }[] = [];
  for (const d of model.person.dayTypes) out.push({ path: 'person.dayTypes', title: d.name });
  for (const g of model.goals) {
    out.push({ path: `goals.${g.key}.title`, title: g.title });
    for (const t of g.targets) out.push({ path: `goals.${g.key}.targets.${t.key}.title`, title: t.title });
    for (const i of g.items) out.push({ path: `goals.${g.key}.items.${i.key}.title`, title: i.title });
  }
  return out;
}

// The paths of sentence-shaped titles in `model` that are new or changed since `before`. A title the conversation has already
// met (and was retried for) is not flagged again on every later turn, which would cost a retry on each of them.
export function newSentenceTitlePaths(model: SetupModel, before: SetupModel): string[] {
  const earlier = new Set(titleLeaves(before).map((l) => `${l.path}\u0000${l.title}`));
  const paths = titleLeaves(model)
    .filter((l) => !earlier.has(`${l.path}\u0000${l.title}`) && isSentenceTitle(l.title))
    .map((l) => l.path);
  return [...new Set(paths)];
}
