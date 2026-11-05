// MOM-180 part A: "What does this mean?" answered by code, walked on a phone. The fake model of tests/e2e/support/fakeAnthropic.ts answers as
// Claude (no paid call, no key) with the scripted case `run-p-week-cards`.
//
// What it holds the code to, at 390px:
// 1. On a simple card (the first question, about the idea) the link opens code's explanation in place, with no request to Claude and no
//    "Still not clear? Ask Claude" link.
// 2. On a concept topic (what to count) the same link opens the explanation with "Still not clear? Ask Claude" under it; opening it
//    makes no request either, and nothing sits past the screen edge.
// 3. A week card (the day end) explains itself in code's words too, with no Ask Claude.
//
// Screenshots are written only when SETUP_SCREENSHOT_DIR names a folder (outside the repo); without it the checks still run.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { EXPLANATIONS } from '@/lib/setup/explain';
import { ASK_CLAUDE, MEANING_LINK, PROPOSAL_YES_TEXT } from '@/lib/setup/session';
import { expect, signUpAndConfirm, test } from './fixtures';
import { answerCodeCard, codeCardOn } from './support/codeCards';
import { FAKE_MODEL_PORT } from './support/localStack';
import { elementsOffScreen } from './support/setupCards';
import { WEEK_CARDS_CASE } from '../setup-evals/cases';

const SHOTS = process.env.SETUP_SCREENSHOT_DIR;
const CARD = 'h2#setup-question, h2#setup-playback, h2#setup-final, h2#setup-retry, h2#setup-quick-path';
const PERSON_ZONE = 'America/Denver';

const cardOf = (page: Page): Locator => page.locator(CARD).first();
const headingOf = async (page: Page): Promise<string> => ((await cardOf(page).textContent()) ?? '').trim();
const requests = async (): Promise<number> => ((await (await fetch(`http://127.0.0.1:${FAKE_MODEL_PORT}/__fake/last`)).json()) as { setupRequests: number }).setupRequests;

async function nextCard(page: Page, previous: string | null): Promise<string> {
  const wait = page.locator('[data-retry-cause="wait"]');
  for (let attempt = 0; attempt < 8; attempt++) {
    await expect(cardOf(page)).toBeVisible();
    if (previous !== null) await expect.poll(async () => ((await wait.count()) > 0 ? 'wait' : await headingOf(page)), { message: 'waiting for the next card' }).not.toBe(previous);
    if ((await wait.count()) > 0) {
      await page.waitForTimeout(1200);
      await page.getByRole('button', { name: 'Try again' }).click();
      await expect(wait).toBeHidden();
      continue;
    }
    return headingOf(page);
  }
  throw new Error('The setup kept asking to wait.');
}

test.describe('"What does this mean?" at 390px', () => {
  test.use({ viewport: { width: 390, height: 900 }, timezoneId: PERSON_ZONE, colorScheme: 'light' });

  const shot = async (page: Page, name: string) => {
    if (!SHOTS) return;
    mkdirSync(SHOTS, { recursive: true });
    // The pointer is left where the last tap put it, which gives that control its hover fill; park it away and let the fade finish.
    await page.mouse.move(0, 0);
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
  };

  // Opens the link and checks what it shows; returns whether "Still not clear? Ask Claude" is there.
  const openExplanation = async (page: Page, words: string): Promise<boolean> => {
    const before = await requests();
    await page.getByRole('button', { name: MEANING_LINK }).click();
    const shown = page.locator('[data-slot="help-explain"]');
    await expect(shown).toBeVisible();
    await expect(shown).toContainText(words);
    expect(await requests(), 'the explanation makes no call to Claude').toBe(before);
    expect(await elementsOffScreen(page), 'nothing sits past the screen edge').toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), 'no sideways scroll').toBe(false);
    return (await page.getByRole('button', { name: ASK_CLAUDE }).count()) > 0;
  };

  test('a simple card and a concept topic, explained by code', async ({ page }) => {
    test.setTimeout(240_000);
    await signUpAndConfirm(page, 'explain-390');
    await page.goto('/setup');
    await page.getByRole('button', { name: 'Start' }).click();
    let heading = await nextCard(page, null);

    let simple = false;
    let concept = false;
    let week = false;
    for (const person of WEEK_CARDS_CASE.person) {
      await expect(page.locator(CARD)).toHaveCount(1);
      const code = await codeCardOn(page);

      if (!simple && /What would you like to work on/.test(heading)) {
        simple = true;
        expect(await openExplanation(page, EXPLANATIONS.idea ?? ''), 'a simple card has no Ask Claude').toBe(false);
        await shot(page, 'simple-card-explanation');
      }
      if (!concept && /What would you like to count/.test(heading)) {
        concept = true;
        expect(await openExplanation(page, 'the thing you will count'), 'what to count offers Ask Claude').toBe(true);
        await shot(page, 'concept-topic-ask-claude');
      }
      if (!week && code === 'week' && /When does your day end/.test(heading)) {
        week = true;
        expect(await openExplanation(page, 'the time you would say your day is done'), 'a week card has no Ask Claude').toBe(false);
      }

      if (code !== null) {
        await answerCodeCard(page, code, person, PERSON_ZONE);
        heading = await nextCard(page, heading);
        continue;
      }
      if (await page.getByRole('button', { name: 'Yes, that is right' }).count()) {
        await page.getByRole('button', { name: 'Yes, that is right' }).click();
      } else if (person.say === PROPOSAL_YES_TEXT && (await page.getByRole('button', { name: 'Yes', exact: true }).count()) > 0) {
        await page.getByRole('button', { name: 'Yes', exact: true }).click();
      } else {
        if ((await page.getByLabel('Your answer').count()) === 0) await page.getByRole('button', { name: /Type it instead/ }).click();
        await page.getByLabel('Your answer').fill(person.say);
        await page.getByRole('button', { name: 'Send' }).click();
      }
      heading = await nextCard(page, heading);
    }

    expect(simple, 'the idea question was seen').toBe(true);
    expect(concept, 'the question about what to count was seen').toBe(true);
    expect(week, 'the day-end card was seen').toBe(true);
  });
});
