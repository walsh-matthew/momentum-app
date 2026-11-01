import { useState, useTransition } from 'react';

// Shown when the request itself fails (offline, server down), as opposed to the service refusing it.
export const ENTRY_NETWORK_ERROR = 'Could not reach the server. Nothing was changed. Try again.';

// What a server action answers: the shape of a ServiceResult, spelled out here because a component never imports
// from the services (CLAUDE.md, Architectural Directive 1).
type ActionResult = { ok: true; data?: unknown } | { ok: false; error: string };

// A saved entry can carry a notice (it falls before its goal's start date, so it will not count). It is shown as said.
function noticeOf(data: unknown): string | null {
  if (typeof data !== 'object' || data === null || !('notice' in data)) return null;
  return typeof data.notice === 'string' ? data.notice : null;
}

// One control's pending, error and notice state, in the same shape as useTaskToggle. It only runs when the person
// taps: nothing in the app logs, removes or restores an entry on their behalf. A control is disabled while its
// request is running, so a double tap cannot log twice. `onDone` runs only after the service accepted the change.
export function useEntryAction() {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<ActionResult>, onDone?: () => void) => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await action();
        // A state update after an await is not part of the transition (React 19), so each is wrapped again: the result and
        // the control being ready again show in the same render (MOM-147, failure log F-072).
        if (result.ok) {
          startTransition(() => {
            setNotice(noticeOf(result.data));
            onDone?.();
          });
        } else startTransition(() => setError(result.error));
      } catch {
        // A rejected action (network, server error) must not leave a button stuck or silently fail.
        startTransition(() => setError(ENTRY_NETWORK_ERROR));
      }
    });
  };

  return { pending, error, notice, run, setError };
}
