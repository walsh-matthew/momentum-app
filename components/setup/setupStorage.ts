// The one place guided setup uses the browser's sessionStorage (MOM-111). It keeps a setup conversation in progress in this
// browser tab, so a reload (or a phone dropping a background tab) does not lose a 20-turn conversation. It is cleared when
// the person saves the setup, and the browser drops it when the tab is closed. It never leaves the device except as part of
// the request for Claude's next turn, which the privacy notice already says. The notice's line for it is in
// lib/config/privacy.ts (DEVICE_STORAGE). Every access is guarded: private windows and blocked storage throw, and setup
// must work without it.

import { parseStoredSession, setupStorageKey } from '@/lib/setup/session';
import type { SetupSession } from '@/types/setup';

export function loadStoredSession(userId: string): SetupSession | null {
  try {
    return parseStoredSession(window.sessionStorage.getItem(setupStorageKey(userId)));
  } catch {
    return null;
  }
}

export function storeSession(userId: string, session: SetupSession): void {
  try {
    window.sessionStorage.setItem(setupStorageKey(userId), JSON.stringify(session));
  } catch {
    // Storage unavailable or full: the setup carries on in memory.
  }
}

export function clearStoredSession(userId: string): void {
  try {
    window.sessionStorage.removeItem(setupStorageKey(userId));
  } catch {
    // Nothing to clear.
  }
}
