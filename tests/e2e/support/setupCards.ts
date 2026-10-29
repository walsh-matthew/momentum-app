// Helpers the guided setup browser specs share (MOM-111 round 2). Each setup card's heading carries the card's id, so the
// heading is what identifies the card on screen.

import type { Locator, Page } from '@playwright/test';

export const CARD = 'h2#setup-question, h2#setup-playback, h2#setup-final, h2#setup-retry, h2#setup-quick-path';

// Every element on the page that sits past either side of the screen (MOM-111 round 2, finding 5: the date input ran past the
// right edge on a phone, while the old check, which only asked whether the page scrolled sideways, passed). An element with
// no size, or kept for screen readers only, takes no room. Each is named by its tag and a few words of its label or text.
export async function elementsOffScreen(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return [...document.querySelectorAll('main *')]
      .filter((el) => {
        if (el.closest('.sr-only')) return false;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return false;
        return r.left < -0.5 || r.right > width + 0.5;
      })
      .map((el) => `${el.tagName.toLowerCase()}: ${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}`);
  });
}

export const cardOf = (page: Page): Locator => page.locator(CARD).first();
export const headingOf = async (page: Page): Promise<string> => ((await cardOf(page).textContent()) ?? '').trim();
