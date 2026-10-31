'use client';

import { useEffect, useState } from 'react';

const WIDE = '(min-width: 768px)';

const matches = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(WIDE).matches;

// Whether the screen is wide enough to show every step of the quick path at once (1280px does; a phone shows one step at a time).
// The card only renders after the setup screen has mounted, so the first value is the real one and nothing flickers. Where the
// browser cannot say (a test), it is a phone.
export function useIsWide(): boolean {
  const [wide, setWide] = useState(matches);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(WIDE);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return wide;
}
