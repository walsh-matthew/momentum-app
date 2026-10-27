// A running timer lives in this browser only (MOM-110): there is no table for it, and a schema change is not part of
// this block. It survives a reload but not a change of device; BACKLOG.md carries that limit. Storage can be missing
// or throw (a private window, blocked site data), so every access is guarded and the page works without it: the
// timer then runs until the page is closed.

const KEY_PREFIX = 'momentum:timer:';

const keyFor = (targetId: string) => `${KEY_PREFIX}${targetId}`;

// When the target's timer was started (an ISO instant), or null when none is running or storage is unavailable.
export function readTimerStart(targetId: string): string | null {
  try {
    const value = window.localStorage.getItem(keyFor(targetId));
    return value !== null && !Number.isNaN(Date.parse(value)) ? value : null;
  } catch {
    return null;
  }
}

export function saveTimerStart(targetId: string, startedAt: string): void {
  try {
    window.localStorage.setItem(keyFor(targetId), startedAt);
  } catch {}
}

export function clearTimerStart(targetId: string): void {
  try {
    window.localStorage.removeItem(keyFor(targetId));
  } catch {}
}
