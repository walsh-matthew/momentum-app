// A count of one meets a unit (MOM-167 part 9): "1 hour", "1 pound", never "1 hours". One rule for every place that writes a
// number before a unit, whether the unit is ours (hours, sessions) or the person's own word (pounds, pages). Pure.

// The owner's rule (2026-11-02): a word ending in "sses", "xes", "ches" or "shes" drops the "es" (glasses to glass, boxes to
// box, inches to inch); any other word ending in "s" but not "ss" drops the "s" (pounds, chapters, miles, pages); anything else
// stays as the person said it. It cannot tell that "series" or "gas" are not plurals, so it is only used for a count of exactly 1.
export const singularUnit = (word: string): string =>
  /(ss|sh|ch|x)es$/i.test(word) ? word.slice(0, -2) : /[^s]s$/i.test(word) ? word.slice(0, -1) : word;

// The first plural word of a phrase made singular, the rest as written: "pounds lifted" to "pound lifted". A phrase with no
// plural word stays as it is.
export function singularFirstWord(phrase: string): string {
  const words = phrase.split(' ');
  const at = words.findIndex((w) => singularUnit(w) !== w);
  return at < 0 ? phrase : words.map((w, i) => (i === at ? singularUnit(w) : w)).join(' ');
}

// A unit for this amount: singular only when the amount is exactly 1, and only a single word (a longer phrase is left as written).
export const unitFor = (amount: number, unit: string): string => (amount === 1 && unit !== '' && !/\s/.test(unit) ? singularUnit(unit) : unit);

// "1 hour", "2 hours", "5000 pounds". A missing unit gives the number alone.
export const unitCount = (amount: number, unit: string | null | undefined): string => {
  const word = unit ? unitFor(amount, unit) : '';
  return word === '' ? String(amount) : `${amount} ${word}`;
};
