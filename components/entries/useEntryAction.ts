import { useState, useTransition } from 'react';

// Shown when the request itself fails (offline, server down), as opposed to the service refusing it.
export const ENTRY_NETWORK_ERROR = 'Could not reach the server. Nothing was changed. Try again.';

// What a server action answers: the shape of a ServiceResult, spelled out here because a component never imports
// from the services (CLAUDE.md, Architectural Directive 1).
type ActionResult = { ok: true; data?: unknown } | { ok: false; error: string };

// One control's pending and error state, in the same shape as useTaskToggle. It only runs when the person taps:
// nothing in the app logs, removes or restores an entry on their behalf. A control is disabled while its request
// is running, so a double tap cannot log twice. `onDone` runs only after the service accepted the change.
export function useEntryAction() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<ActionResult>, onDone?: () => void) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) onDone?.();
        else setError(result.error);
      } catch {
        // A rejected action (network, server error) must not leave a button stuck or silently fail.
        setError(ENTRY_NETWORK_ERROR);
      }
    });
  };

  return { pending, error, run, setError };
}
