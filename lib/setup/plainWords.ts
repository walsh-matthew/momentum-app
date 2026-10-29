// The words setup's model uses that a first-time person may not know (MOM-111, docs/DOMAIN_MODEL.md §2.1 plain language),
// each with the everyday phrases that explain it. A sentence may use an internal word only when it also says what it means:
// "the least you would count as on track (saved as the floor)" passes; "What's your floor?" does not. Tests run this over
// every step summary, example question and card text. It is not a live check on Claude's turns: refusing a turn for a word
// would throw away replies, which is what made setup unclear in the first place. Pure.

import { sentencesOf } from './text';

export interface InternalTerm {
  term: string;
  pattern: RegExp;
  // Any one of these in the same sentence says what the term means.
  plain: string[];
}

export const INTERNAL_TERMS: readonly InternalTerm[] = [
  { term: 'protect', pattern: /\bprotect(ed|ing|s)?\b/i, plain: ['crowd out', 'crowd it out', 'crowd them out', 'room for'] },
  { term: 'priorities', pattern: /\bpriorit(y|ies)\b/i, plain: ['matters', 'matter', 'crowd out'] },
  { term: 'floor', pattern: /\bfloors?\b/i, plain: ['the least', 'at least'] },
  { term: 'aspiration', pattern: /\baspirations?\b/i, plain: ['hoping', 'hope', 'aiming for'] },
  { term: 'target', pattern: /\btargets?\b/i, plain: ['count'] },
  { term: 'effort', pattern: /\befforts?\b/i, plain: ['they do', 'you do'] },
  { term: 'outcome', pattern: /\boutcomes?\b/i, plain: ['result'] },
  { term: 'carry-over', pattern: /\bcarry[- ]?overs?\b|\bcarries over\b/i, plain: ['owed', 'rolls into'] },
  // Momentum's block (the first stretch of an ongoing goal), not the person's own blocks (quilt blocks sewn).
  { term: 'block', pattern: /\b(first|a|each|this|the) block\b|\bblock (length|of)\b/i, plain: ['stretch'] },
  { term: 'anchor', pattern: /\banchors?\b/i, plain: ['time zone', 'week start', 'day ends'] },
  { term: 'quota', pattern: /\bquotas?\b/i, plain: ['as long as the number', 'any time in the week'] },
  { term: 'slot', pattern: /\bslots?\b|\bday-slot\b/i, plain: ['set days'] },
  { term: 'capacity', pattern: /\bcapacity\b/i, plain: ['room for', 'how much time'] },
  { term: 'day type', pattern: /\bday types?\b/i, plain: ['kinds of days', 'kind of day'] },
  { term: 'check-in', pattern: /\bcheck-ins?\b/i, plain: ['how it went'] },
  { term: 'synced', pattern: /\bsync(ed|s)?\b/i, plain: ['read from'] },
  { term: 'manual', pattern: /\bmanual(ly)?\b/i, plain: ['yourself', 'themselves', 'by hand'] },
  { term: 'parked', pattern: /\bpark(ed|s|ing)?\b/i, plain: ['set aside'] },
  { term: 'milestone', pattern: /\bmilestones?\b/i, plain: ['step'] },
  { term: 'metric', pattern: /\bmetrics?\b/i, plain: ['which number'] },
  { term: 'qualifying threshold', pattern: /\b(qualifying|threshold)\b/i, plain: ['only entries'] },
  { term: 'expansion', pattern: /\bexpansion\b/i, plain: ['may not have thought of'] },
  { term: 'balance mentions', pattern: /\bbalance mentions?\b/i, plain: ['taking time from'] },
  { term: 'review depth', pattern: /\breview depth\b/i, plain: ['look-back covers', 'weekly look-back'] },
];

// The internal words in a text that no everyday phrase in the same sentence explains, as "term: sentence".
export function unexplainedTerms(text: string): string[] {
  const out: string[] = [];
  for (const sentence of sentencesOf(text)) {
    const lower = sentence.toLowerCase();
    for (const t of INTERNAL_TERMS) {
      if (t.pattern.test(sentence) && !t.plain.some((p) => lower.includes(p))) out.push(`${t.term}: ${sentence}`);
    }
  }
  return out;
}
