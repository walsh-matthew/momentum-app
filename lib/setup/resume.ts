// When Claude is back for a person who used up their allowance (test day 1). The limit is a rolling 24 hours: reserve_llm_call()
// answers with the seconds until the oldest call in the window ages out, so the time Claude is back is the clock plus those
// seconds. Said as a clock time in the person's own time zone ("You can use Claude for setup again after about 9:15 AM."); on a
// phone with no saved zone the card formats it in the phone's own zone (display only, never saved or sent); where that is not
// possible, "in about 3 hours". Rounded up to the minute, never early. Pure.

import type { ResumeInfo } from '@/types/setupScreen';

const LEAD = 'You can use Claude for setup again';

// The clock-time sentence in `timeZone`, or in the device's own zone when none is given. Null when the zone or Intl is unusable.
export function resumeSentence(atMs: number, nowMs: number, timeZone?: string): string | null {
  try {
    const at = Math.ceil(atMs / 60_000) * 60_000;
    const clock = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(at).replace(/[  ]/g, ' ');
    const day = (ms: number) => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(ms);
    return `${LEAD} after about ${clock}${day(at) === day(nowMs) ? '' : ' tomorrow'}.`;
  } catch {
    return null;
  }
}

// The wait in hours or minutes, rounded up: "in about 3 hours".
export function resumeFallback(retryAfterSeconds: number): string {
  const s = Number.isFinite(retryAfterSeconds) ? Math.max(1, Math.ceil(retryAfterSeconds)) : 1;
  if (s < 60) return `${LEAD} in under a minute.`;
  const minutes = Math.ceil(s / 60);
  if (minutes <= 90) return `${LEAD} in about ${minutes === 1 ? '1 minute' : `${minutes} minutes`}.`;
  const hours = Math.ceil(s / 3600);
  return `${LEAD} in about ${hours === 1 ? '1 hour' : `${hours} hours`}.`;
}

// What the server hands the card: the time, the sentence in the saved zone when there is one, and the fallback.
export function resumeInfo(retryAfterSeconds: number, nowMs: number, savedZone: string | null): ResumeInfo {
  const atMs = nowMs + Math.max(1, Math.ceil(retryAfterSeconds)) * 1000;
  return { atMs, sentence: savedZone ? resumeSentence(atMs, nowMs, savedZone) : null, fallback: resumeFallback(retryAfterSeconds) };
}
