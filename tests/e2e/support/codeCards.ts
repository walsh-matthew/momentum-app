// The two cards code writes in guided setup (MOM-178, lib/setup/cards.ts), as the browser specs answer them: the time zone card the moment
// what counts is approved, and the settings card the moment the planning is. Neither asks Claude, so the scripted person's line for each is
// what they tap, not what they type: a yes to the zone the phone reports (or another zone from the search), and the choices on the card.

import type { Page } from '@playwright/test';
import { SETTINGS_ROWS, type SettingsAnswers } from '../../../lib/setup/cards';

export type CodeCard = 'zone' | 'settings';

// What the scripted person gives each card (the eval case's person lines, lib/setup/evals.ts PersonLine).
export interface CardLine {
  say: string;
  zone?: string;
  settings?: SettingsAnswers;
}

// The card on screen, if it is one of the two code writes.
export async function codeCardOn(page: Page): Promise<CodeCard | null> {
  if ((await page.locator('[data-card="time-zone"]').count()) > 0) return 'zone';
  if ((await page.locator('[data-card="settings"]').count()) > 0) return 'settings';
  return null;
}

// Answers the card the way the scripted person does. A yes counts only while the zone shown is the one the person is in; a phone on another
// zone (the browser's UTC clock in the CI case) is answered with "A different one" and the search, as a person would.
export async function answerCodeCard(page: Page, card: CodeCard, line: CardLine, personZone = 'America/Denver'): Promise<void> {
  if (card === 'zone') {
    const wanted = line.zone ?? personZone;
    const shown = (await page.locator('#setup-question').textContent()) ?? '';
    if (line.zone === undefined && shown.includes(wanted)) {
      await page.getByRole('button', { name: 'Yes', exact: true }).click();
      return;
    }
    const other = page.getByRole('button', { name: 'A different one' });
    if ((await other.count()) > 0) await other.click();
    await page.getByRole('searchbox', { name: 'Search time zones' }).fill(wanted.split('/').pop()!.replace('_', ' '));
    await page.getByRole('list', { name: 'Matching time zones' }).getByRole('button').filter({ hasText: wanted }).first().click();
    return;
  }
  for (const row of SETTINGS_ROWS) {
    const value = line.settings?.[row.topic];
    const label = row.choices.find((c) => c.value === value)?.label;
    if (label) await page.getByRole('button', { name: label, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Next', exact: true }).click();
}
