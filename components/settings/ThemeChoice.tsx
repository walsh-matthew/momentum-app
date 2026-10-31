'use client';

import { useState, useTransition } from 'react';
import { setThemeChoice } from '@/app/actions/theme';
import { THEME_CHOICES, type ThemeChoice as Choice } from '@/lib/theme/theme';

interface ThemeChoiceProps {
  // What the server read from the cookie: "system" when the person has not chosen.
  initial: Choice;
}

// The light / dark / system control on Settings (MOM-30). The page changes at once (data-theme on <html>, the same attribute
// the server sets on a reload), and the cookie is saved in the background, so the choice is there with no flash next time.
// "Match my device" removes the attribute, and the stylesheet follows the device again.
export function ThemeChoice({ initial }: ThemeChoiceProps) {
  const [choice, setChoice] = useState<Choice>(initial);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const pick = (next: Choice) => {
    if (next === choice) return;
    const before = choice;
    setChoice(next);
    setFailed(false);
    const root = document.documentElement;
    if (next === 'system') delete root.dataset.theme;
    else root.dataset.theme = next;
    startTransition(async () => {
      const result = await setThemeChoice(next).catch(() => ({ ok: false }));
      if (!result.ok) {
        // A state update after an await is not part of the transition (React 19), so it is wrapped again: the alert, the
        // choice put back and the buttons ready again show in the same render.
        startTransition(() => {
          setFailed(true);
          setChoice(before);
        });
        if (before === 'system') delete root.dataset.theme;
        else root.dataset.theme = before;
      }
    });
  };

  return (
    <div>
      <div role="radiogroup" aria-label="Theme" className="mt-3 grid grid-cols-3 gap-2">
        {THEME_CHOICES.map(({ value, label }) => {
          const on = choice === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={pending}
              onClick={() => pick(value)}
              className={`min-h-11 rounded-xl border px-2 text-sm font-medium transition-colors disabled:opacity-70 ${
                on ? 'border-transparent bg-primary text-primary-foreground' : 'answer-choice text-foreground'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      {failed && (
        <p role="alert" className="mt-2 text-sm text-danger">
          Could not save that choice. Try again.
        </p>
      )}
    </div>
  );
}
