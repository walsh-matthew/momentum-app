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

// The type on every card on screen (MOM-111 round 3c, finding 1): each setup card (its section, or an alert standing on its
// own outside one), with every visible element that holds words of its own, the ones set bold (font-weight 600 or more),
// the bold weight, and the heaviest weight on the card.
export interface CardType {
  card: string;
  bold: string[];
  boldWeight: number;
  heaviest: { weight: number; text: string };
}
export async function cardTypes(page: Page): Promise<CardType[]> {
  return page.evaluate(() => {
    const sections = [...document.querySelectorAll('main section.channel-card')];
    const loose = [...document.querySelectorAll('main [data-slot="setup-alert"]')].filter((el) => !el.closest('section.channel-card'));
    return [...sections, ...loose].map((card) => {
      const texts = [card, ...card.querySelectorAll('*')]
        .filter((el) => {
          if (el.closest('.sr-only')) return false;
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) return false;
          return [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '');
        })
        .map((el) => ({ weight: Number(getComputedStyle(el).fontWeight), text: (el.textContent ?? '').trim().slice(0, 60) }));
      const bold = texts.filter((t) => t.weight >= 600);
      const heaviest = texts.reduce((a, b) => (b.weight > a.weight ? b : a), { weight: 0, text: '' });
      const label = card.getAttribute('aria-labelledby') ?? card.getAttribute('data-slot') ?? card.tagName.toLowerCase();
      return { card: label, bold: bold.map((t) => t.text), boldWeight: bold[0]?.weight ?? 0, heaviest };
    });
  });
}

export const cardOf = (page: Page): Locator => page.locator(CARD).first();
// The whole card the heading belongs to: its section, with the answers and buttons in it (round 3).
export const sectionOf = (page: Page): Locator => page.locator('main section.channel-card').filter({ has: page.locator(CARD) }).first();
export const headingOf = async (page: Page): Promise<string> => ((await cardOf(page).textContent()) ?? '').trim();
