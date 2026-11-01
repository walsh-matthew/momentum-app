'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { EditChange } from '@/types/forecastEdits';

// Runs one of the person's taps against a server action (MOM-138). While it runs, only the button that was tapped shows its busy
// word (the others stay as they are and ignore taps until it is done), a refusal is shown in words, and a success says "Saved."
// and refreshes the page so it shows what was saved. Nothing is changed on the screen before the server has said so. `onSaved`
// runs only after a success (to empty a box that has been used). `key` names the tap, so a screen can tell which button is busy.
export function useEditAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function run(key: string, action: () => Promise<EditChange>, onSaved?: () => void) {
    // Set now, outside the transition: React holds an update made inside an async transition until it finishes, and the busy word
    // has to show while the save runs.
    setActive(key);
    setSaved(false);
    startTransition(async () => {
      const result = await action();
      // Wrapped again: a state update after an await is not part of the transition (React 19; MOM-147, F-072).
      startTransition(() => {
        setActive(null);
        if (result.ok) {
          setError(null);
          setSaved(true);
          onSaved?.();
          router.refresh();
        } else {
          setError(result.error);
        }
      });
    });
  }

  return { pending, active, error, saved, run };
}
