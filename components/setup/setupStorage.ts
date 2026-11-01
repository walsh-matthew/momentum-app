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

// What a person adding to a finished setup is in the middle of (MOM-132 part 2), kept in this tab like the conversation itself: a new goal,
// or a target for one goal. A reload then opens straight on the conversation instead of asking the first question again. The goal's id is
// the person's own saved goal; it never leaves the device except in the request for Claude's next turn, where the server checks it.
export interface AddPointer {
  mode: 'add_goal' | 'add_target';
  goalId: string | null;
}

const addPointerKey = (userId: string): string => `momentum.setup.add.${userId}`;

export function loadAddPointer(userId: string): AddPointer | null {
  try {
    const raw = window.sessionStorage.getItem(addPointerKey(userId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { mode, goalId } = parsed as Record<string, unknown>;
    if (mode === 'add_goal') return { mode, goalId: null };
    if (mode === 'add_target' && typeof goalId === 'string') return { mode, goalId };
    return null;
  } catch {
    return null;
  }
}

export function storeAddPointer(userId: string, pointer: AddPointer): void {
  try {
    window.sessionStorage.setItem(addPointerKey(userId), JSON.stringify(pointer));
  } catch {
    // Storage unavailable: the person simply picks again after a reload.
  }
}

export function clearAddPointer(userId: string): void {
  try {
    window.sessionStorage.removeItem(addPointerKey(userId));
  } catch {
    // Nothing to clear.
  }
}
