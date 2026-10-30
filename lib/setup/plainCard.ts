// Everyday words on every setup card (MOM-111 round 3c, wording fix). In the owner's review of the reading ideas card two lines
// read as jargon without context: "Some starting points for the fewest pages in a week" (what are "fewest pages"?) and
// "Pages a week, from what you said about where you are now" (pages a week? where I am now?). So:
// - no card shows the model's own words for a number ("fewest", "floor", "aspiration") or "baseline", unless the person said
//   the word themselves ("pelvic floor");
// - a line never points at an earlier step by an abstract name ("where you are now", "your baseline", "from what you said"):
//   it quotes the fact itself, in the person's words ("You said you read about 50 pages a week now."), or it is left out;
// - the detail line of starting ideas, which says where they come from, quotes a value the person said or is left out.
// The checks (lib/setup/checks.ts) ask Claude once to fix a line like that; whatever still breaks these rules is left off the
// card by normalizePlainTurn below. Pure.

import type { AssistantTurn, Transcript } from '@/types/setup';
import { personWords } from './said';
import { numbersIn } from './text';

// Words a card never shows unless the person said them.
const JARGON = /\b(fewest|floor|aspirations?|baseline)\b/gi;
// An earlier step pointed at by an abstract name, instead of the fact itself.
export const VAGUE_SOURCE =
  /\b(where you are now|where you're at now|your baseline|what you (said|told me|mentioned) (earlier|before|above)|(from|based on|going by) what you (said|told me|mentioned))\b/i;

// The words of `text` a card may not show: jargon the person never said, and "where you are now".
export function jargonIn(text: string, said: readonly string[]): string[] {
  const theirs = said.join(' \n ').toLowerCase();
  const found = [...text.matchAll(JARGON)].map((m) => m[0].toLowerCase()).filter((w) => !new RegExp(`\\b${w}\\b`).test(theirs));
  if (/\bwhere you are now\b/i.test(text)) found.push('where you are now');
  return [...new Set(found)];
}

// The text quotes a value the person said: a number they said, or words in quotes that they wrote.
export function quotesSaid(text: string, said: readonly string[]): boolean {
  const theirs = new Set(said.flatMap((s) => numbersIn(s, { skipOne: true })));
  if (numbersIn(text, { skipOne: true }).some((n) => theirs.has(n))) return true;
  const lower = said.join(' \n ').toLowerCase();
  return [...text.matchAll(/["“]([^"”]{3,})["”]/g)].some((m) => lower.includes(m[1].toLowerCase()));
}

// A line points at an earlier step by name and quotes nothing the person said.
export const vagueSource = (text: string, said: readonly string[]): boolean => VAGUE_SOURCE.test(text) && !quotesSaid(text, said);

// The detail line of starting ideas: absent, or quoting a value the person said.
export const ideasDetailQuotes = (detail: string | null, said: readonly string[]): boolean => !detail?.trim() || quotesSaid(detail, said);

const ASKING = new Set<AssistantTurn['kind']>(['question', 'offer_ideas', 'ideas', 'interpretations', 'proposal']);

// A turn as a card shows it: a lead-in or detail line with jargon, or pointing at an earlier step without the fact, is left
// out, and so is a detail line of starting ideas that quotes nothing the person said. Any other turn is returned as it is.
export function normalizePlainTurn(turn: AssistantTurn, transcript: Transcript): AssistantTurn {
  if (!ASKING.has(turn.kind)) return turn;
  const said = personWords(transcript);
  const bad = (text: string) => jargonIn(text, said).length > 0 || vagueSource(text, said);
  const say = turn.say && bad(turn.say) ? '' : turn.say;
  const keepDetail = turn.detail !== null && !bad(turn.detail) && (turn.kind !== 'ideas' || ideasDetailQuotes(turn.detail, said));
  const detail = keepDetail ? turn.detail : null;
  return say === turn.say && detail === turn.detail ? turn : { ...turn, say, detail };
}
