import type { MouseEvent } from 'react';

// The rule for a main button (MOM-145): it is the solid accent and never disabled or faded. Two things used to disable it, and each has
// its own answer.
// - While work is in flight (a save, a reply), the button stays solid, says it is busy (aria-busy, and its own busy word such as "Saving…")
//   and ignores taps and the Enter key, which is what busyProps gives it.
// - When something is missing, a single-answer input shows no button until it has a value (nothing to disable), and a form with
//   several fields shows the button anyway and answers a tap with a plain callout naming what is missing (lib/forms/missing.ts).
// tests/main-button-rule.test.ts finds every main button in the components and fails on a disabled or faded one.

type Tap<E extends HTMLElement> = (event: MouseEvent<E>) => void;

// The props that make a main button busy: aria-busy, and a click (which Enter in a form also fires on its default button) that does
// nothing while busy. Spread them on the button; they carry onClick, so pass the button's own handler in here.
export function busyProps<E extends HTMLElement>(busy: boolean, onClick?: Tap<E>): { 'aria-busy'?: true; onClick: Tap<E> } {
  return {
    'aria-busy': busy ? true : undefined,
    onClick: (event) => {
      if (busy) {
        event.preventDefault();
        return;
      }
      onClick?.(event);
    },
  };
}
