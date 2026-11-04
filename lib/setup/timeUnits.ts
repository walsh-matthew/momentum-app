// The unit a time target is counted in, as the person's own words name it (test day 1, "minutes of hours"). A time target's
// numbers are stored in minutes (entries.value is minutes for time). Words that already name a time unit ("hours of reading",
// "minutes of practice") need no "minutes of" in front, and a question that names hours is answered in hours: code stores the
// number in minutes. Pure.

const HOURS = /\b(hours?|hrs?)\b/i;
const MINUTES = /\b(minutes?|mins?)\b/i;

export const namesHours = (words: string): boolean => HOURS.test(words);
export const namesMinutes = (words: string): boolean => MINUTES.test(words);
export const namesTimeUnit = (words: string): boolean => namesHours(words) || namesMinutes(words);

// Whether a time amount (stored in minutes) is said in hours, one rule for the setup playback and Home (MOM-180 B1): hours when the person's words for
// what is counted name hours ("hours of reading"), or when the amount is a whole number of hours (120 minutes is "2 hours"); otherwise minutes
// ("45 minutes"). Words that name minutes and not hours ("minutes of practice") keep minutes.
export const readsInHours = (words: string, minutes: number): boolean => namesHours(words) || (!namesMinutes(words) && minutes > 0 && minutes % 60 === 0);

// Minutes as hours, to two places ("3", "1.5", "0.25"), for a time target whose words name hours.
export const minutesAsHours = (minutes: number): number => Math.round((minutes / 60) * 100) / 100;

// A number of hours as the person's goal says it: "1 hour", "3 hours", "1.5 hours".
export const hoursText = (minutes: number): string => {
  const hours = minutesAsHours(minutes);
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
};

// A number of hours in minutes: 3 is 180, 1.5 is 90.
export const hoursToMinutes = (hours: number): number => Math.round(hours * 60 * 100) / 100;
