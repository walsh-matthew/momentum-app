// What the person said, wherever they said it (MOM-111 root cause B). The checks used to decide by which kind of screen came
// before ("ideas only straight after the offer of ideas"), so a person who asked for ideas anywhere else, or tapped a
// "starting ideas" option in a list of interpretations, had their answer refused three times. These read the words instead:
// a tapped option ("Option 2") counts as that option's words, and every check that asks "did the person say this?" reads
// personWords(). Pure.

import type { AssistantTurn, Transcript } from '@/types/setup';

const ORDINALS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, '1st': 1, '2nd': 2, '3rd': 3, '4th': 4 };

// Which option of the turn just before an answer picks: "Option 2", "number 2", "the second one". Null for anything else.
export function pickedOptionIndex(text: string): number | null {
  const t = text.toLowerCase().trim();
  const m = /^(?:option|number|no\.?)\s*(\d)\b/.exec(t) ?? /^(?:the\s+)?(first|second|third|fourth|1st|2nd|3rd|4th)\b(?:\s+one)?[.!]?$/.exec(t);
  if (!m) return null;
  const n = /^\d$/.test(m[1]) ? Number(m[1]) : ORDINALS[m[1]];
  return n >= 1 ? n - 1 : null;
}

// The option an answer picked, in the words it was shown with, or null.
export function pickedOption(answer: string, shown: AssistantTurn | null): string | null {
  if (!shown || shown.options.length === 0) return null;
  const index = pickedOptionIndex(answer);
  return index === null ? null : (shown.options[index] ?? null);
}

export interface PersonAnswer {
  // Where the answer sits in the transcript.
  index: number;
  // What they typed or tapped.
  text: string;
  // The option it picked from the turn before, in that option's words.
  picked: string | null;
  // The turn it answers.
  answers: AssistantTurn | null;
}

// The person's answer at `index`, read with the turn before it.
export function answerAt(transcript: Transcript, index: number): PersonAnswer | null {
  const message = transcript[index];
  if (message?.role !== 'person') return null;
  const before = transcript[index - 1];
  const answers = before?.role === 'assistant' ? before.turn : null;
  return { index, text: message.text, picked: pickedOption(message.text, answers), answers };
}

// The person's newest answer, or null before they have said anything.
export function latestAnswer(transcript: Transcript): PersonAnswer | null {
  for (let i = transcript.length - 1; i >= 0; i--) {
    if (transcript[i].role === 'person') return answerAt(transcript, i);
  }
  return null;
}

// Everything the person has said in this setup, with every tapped option read as its words. A check that asks whether the
// person said a word (a day, a number, an activity) reads this.
export function personWords(transcript: Transcript): string[] {
  const out: string[] = [];
  transcript.forEach((m, i) => {
    if (m.role !== 'person') return;
    out.push(m.text);
    const picked = answerAt(transcript, i)?.picked;
    if (picked) out.push(picked);
  });
  return out;
}

// The words of an answer as the checks should read them: what was typed, and the option it picked.
export const answerWords = (answer: PersonAnswer): string => (answer.picked ? `${answer.text} \n ${answer.picked}` : answer.text);
