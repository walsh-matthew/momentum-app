// The person's words in a clean version for the playback (MOM-111 finding 11, docs/DOMAIN_MODEL.md §2.1 plain language).
// Claude writes a clean version of each free-text value in the person's own voice ("I wanna get fit cuz my kids" becomes "I
// want to get fit because of my kids"), and code checks it adds no activity, number, date, clock time or weekday the person
// did not say, and stays one sentence. A version that passes is what the playback shows (restated into "you" by
// lib/setup/restate.ts) and, once the person approves it, what is saved (owner decision 1). One that fails is ignored, and
// the playback restates the person's own words, as before. Pure.

import type { SetupDraft, SetupModel, Transcript } from '@/types/setup';
import { unsaidActivities } from './activities';
import { withFreeText } from './leaves';
import { personWords } from './said';
import { datesIn, dayTimeWords, numbersIn, sentencesOf, timesIn, type MentionedDate } from './text';

// Longer than this many characters beyond the words it cleans up is a rewrite, not a clean-up.
const EXTRA_CHARS = 60;

// Does `clean` add nothing the person did not say? `raw` is the value it replaces; `said` is everything the person said.
export function paraphraseAddsNothing(clean: string, raw: string, said: readonly string[]): boolean {
  const text = clean.trim();
  if (!text || /[?\n"“”]/.test(text) || sentencesOf(text).length > 1) return false;
  if (text.length > raw.trim().length + EXTRA_CHARS) return false;
  const sources = [...said, raw];
  if (unsaidActivities(text, sources).length > 0) return false;
  const numbers = new Set(sources.flatMap((s) => numbersIn(s)));
  if (numbersIn(text, { skipOne: true }).some((n) => !numbers.has(n))) return false;
  const dates = sources.flatMap(datesIn);
  const dateSaid = (d: MentionedDate) => dates.some((x) => x.month === d.month && x.day === d.day && (d.year === null || x.year === null || x.year === d.year));
  if (!datesIn(text).every(dateSaid)) return false;
  const times = new Set(sources.flatMap(timesIn));
  if (timesIn(text).some((t) => !times.has(t))) return false;
  // Weekdays, parts of a day and day words ("evenings", "weekends").
  const dayWords = new Set(sources.flatMap(dayTimeWords));
  return dayTimeWords(text).every((w) => dayWords.has(w));
}

// The model as the person is shown it and, once approved, as it is saved: every clean version that passes the check put in
// place of the words it cleans up. The values that need a source (numbers, dates, times) are not free text and never change.
export function shownModel(draft: SetupDraft, transcript: Transcript): SetupModel {
  if (draft.plain.length === 0) return draft.model;
  const said = personWords(transcript);
  const plain = new Map(draft.plain.map((p) => [p.path, p.text]));
  return withFreeText(draft.model, (path, value) => {
    const clean = plain.get(path);
    return clean !== undefined && paraphraseAddsNothing(clean, value, said) ? clean.trim() : value;
  });
}
