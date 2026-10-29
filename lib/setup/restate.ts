// The person's words, restated in the second person by code for the playback (docs/DOMAIN_MODEL.md §2.1 plain language,
// MOM-111): "To stay healthy for my family." plays back as "you want to stay healthy for your family", never pasted back as
// typed. Only the voice changes ("my" to "your", "I" to "you"); no word is added or reworded beyond that, so the person
// still approves exactly what is saved. Words these rules cannot restate safely give null, and the playback shows them as
// said, in quotes. Pure.

// Where the words sit in the line the playback writes around them.
// - clause: after "because" (a goal's why)
// - item: in a list, or after "It comes back"
// - title: at the start of a line ("Goal: ...")
export type RestatePlace = 'clause' | 'item' | 'title';

// First words that are never a name, so lowercasing one at the start of a clause or list item cannot change a name. Any
// other first word keeps its capital, because it may be a name ("Emma's recitals").
const NEVER_NAMES = new Set([
  'it', 'its', "it's", 'that', "that's", 'this', 'these', 'those', 'the', 'a', 'an', 'there', "there's", 'so', 'for', 'just',
  'being', 'to',
]);

const SWAPS: Record<string, string> = {
  i: 'you',
  me: 'you',
  my: 'your',
  mine: 'yours',
  myself: 'yourself',
  "i'm": "you're",
  "i've": "you've",
  "i'd": "you'd",
  "i'll": "you'll",
  we: 'you',
  us: 'you',
  our: 'your',
  ours: 'yours',
  ourselves: 'yourselves',
  "we're": "you're",
  "we've": "you've",
  "we'd": "you'd",
  "we'll": "you'll",
};
const SWAPPED = new Set(Object.values(SWAPS));

// Words that cannot be restated: the person speaking to someone ("you"), a question, quotes of their own, or more than one
// sentence.
const SECOND_PERSON = /\b(you|your|yours|yourself|yourselves|you're|you've|you'd|you'll|u|ur|ya|y'all|yall)\b/i;
const NOT_ONE_SENTENCE = /[?"“”;\n]|[.!]\s+\S/;

// "My wife and I", "Sam and I", "for my kids and me": the person goes first when restated ("you and your wife"). Only at
// the start or after a comma or a small linking word, where the words before "and" are a name or a "my ..." phrase.
const PARTNER_AND_ME = /(^|,\s*|\b(?:with|for|to|of|from|between|and|both)\s+)((?:(?:my|our|his|her|their|the|a|an)\s+)?[A-Za-z][\w'-]*)\s+and\s+(?:I|me)\b/gi;
const DETERMINER = /^(my|our|his|her|their|the|a|an)\b/i;
// After the swaps: a word joined with "and I" that was not moved first, or "you" listed twice, reads oddly.
const LEFT_OVER_AND_ME = /\b[\w'-]+\s+and\s+(?:I|me)\b/i;
const YOU_TWICE = /\b(you|yours|yourself|yourselves)\b(?:\s*,\s*|\s+(?:and|or)\s+)(you|yours|yourself|yourselves)\b/i;

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const lowerFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

// The words, trimmed, with closing full stops and the like taken off: the playback adds its own.
export const trimmed = (words: string): string => words.replace(/[’‘]/g, "'").trim().replace(/[\s.!…,:]+$/u, '');

// Shown as said: the person's words exactly, in quotes, for anything restate() cannot do.
export const asSaid = (words: string): string => `"${words.trim()}"`;

function swapWords(text: string): string {
  return text
    .replace(/[A-Za-z]+(?:'[A-Za-z]+)?/g, (word) => {
      // "US" is a country, not "us".
      if (word.length > 1 && word === word.toUpperCase()) return word;
      const swap = SWAPS[word.toLowerCase()];
      if (!swap) return word;
      // "I" and "I'm" are capitals of grammar, not of a sentence start: mid-sentence they become "you", "you're".
      return !/^I('|$)/.test(word) && /^[A-Z]/.test(word) ? capitalize(swap) : swap;
    })
    .replace(/\b(you) am\b/gi, '$1 are')
    .replace(/\b(you) was\b/gi, '$1 were');
}

export function restate(words: string, place: RestatePlace): string | null {
  let text = trimmed(words);
  if (!text || SECOND_PERSON.test(text) || NOT_ONE_SENTENCE.test(text)) return null;

  let wants = false;
  if (place === 'clause') {
    text = text.replace(/^(because|cause|'cause|bc)\b,?\s*/i, '');
    if (/^to\s/i.test(text)) {
      wants = true;
      text = lowerFirst(text);
    }
  }
  text = text.replace(PARTNER_AND_ME, (_all, before: string, partner: string) => `${before}I and ${DETERMINER.test(partner) ? lowerFirst(partner) : partner}`);
  if (LEFT_OVER_AND_ME.test(text.replace(/\bI and\b/g, ''))) return null;

  text = swapWords(text);
  if (!text || YOU_TWICE.test(text)) return null;

  const first = (text.match(/^[A-Za-z]+(?:'[A-Za-z]+)?/)?.[0] ?? '').toLowerCase();
  if (place === 'title') {
    if (SWAPPED.has(first)) text = capitalize(text);
  } else if (SWAPPED.has(first) || NEVER_NAMES.has(first)) {
    text = lowerFirst(text);
  }
  return wants ? `you want ${text}` : text;
}

// "a", "a and b", "a, b and c".
export function listOf(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// One item of a list, restated, or as said in quotes.
export const itemOf = (words: string): string => restate(words, 'item') ?? asSaid(words);
// A title at the start of a line, restated, or as said in quotes.
export const titleOf = (words: string): string => restate(words, 'title') ?? asSaid(words);
