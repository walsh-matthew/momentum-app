import { useState, useTransition } from 'react';
import { toggleTaskStatus } from '@/app/actions/tasks';
import type { TaskStatus } from '@/types/database.types';

// Shown when the request itself fails (offline, server down), as opposed to the service refusing it.
export const TOGGLE_NETWORK_ERROR = 'Could not reach the server. Nothing was changed. Try again.';

// One task's done/not-done switch, shared by the focus card (mark done) and the recently-done list
// (reopen). It only runs when the user clicks: nothing in the app calls toggle() on their behalf
// (docs/NINETY_DAY_PLAN_CONTEXT.md §3, §5 rule 6). The server action authenticates, scopes the write to
// the signed-in user's own task and revalidates the page, so a success moves the task between the lists.
export function useTaskToggle(taskId: string) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (next: TaskStatus) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await toggleTaskStatus(taskId, next);
        // Wrapped again: a state update after an await is not part of the transition (React 19; MOM-147, F-072).
        if (!result.ok) startTransition(() => setError(result.error));
      } catch {
        // A rejected action (network, server error) must not leave a button stuck or silently fail.
        startTransition(() => setError(TOGGLE_NETWORK_ERROR));
      }
    });
  };

  return { pending, error, toggle };
}
