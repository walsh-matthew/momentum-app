'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { PlanChange } from '@/types/plan';

// Runs one of the person's taps against a server action. While it runs the controls are disabled, a refusal is shown in
// words, and a success refreshes the page so it shows what was saved. Nothing is changed on the screen before the server
// has said so.
export function usePlanAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<PlanChange>) {
    startTransition(async () => {
      const result = await action();
      // Wrapped again: a state update after an await is not part of the transition (React 19; MOM-147, F-072).
      startTransition(() => {
        if (result.ok) {
          setError(null);
          router.refresh();
        } else {
          setError(result.error);
        }
      });
    });
  }

  return { pending, error, run };
}
