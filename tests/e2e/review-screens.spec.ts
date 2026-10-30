// Screenshots of every screen the weekly review's sitting changed (MOM-113 block 3.3) at 390px, in the theme the browser is set to,
// for the owner to look at before the commit. It runs only when REVIEW_SCREENSHOT_DIR names a folder (outside the repo); the files
// go in <folder>/<number>-<screen>-<theme>.png, and the theme is the one E2E_COLOR_SCHEME gives the browser (light by default).
// The fake model of tests/e2e/support/fakeAnthropic.ts answers as Claude, so no paid call is made. Like theme-screens.spec.ts it
// asserts almost nothing: tests/e2e/review.spec.ts is the spec that proves the behaviour.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { WIDTHS, expect, signUpAndConfirm, test } from './fixtures';
import { FAKE_MODEL_PORT } from './support/localStack';
import { seedReview } from './support/reviewSeed';

const SHOTS = process.env.REVIEW_SCREENSHOT_DIR;
const THEME = process.env.E2E_COLOR_SCHEME === 'dark' ? 'dark' : 'light';
const LA = 'America/Los_Angeles';
const ASK = 'Get a one-line look back from Claude';

const fakeReviewMode = async (mode: 'good' | 'bad'): Promise<void> => {
  await fetch(`http://127.0.0.1:${FAKE_MODEL_PORT}/__fake/review?mode=${mode}`, { method: 'POST' });
};

async function shot(page: Page, number: string, name: string): Promise<void> {
  mkdirSync(SHOTS!, { recursive: true });
  // The development server's own badge sits over the corner of the page and is not part of the screen; and a choice that was just
  // tapped fades to its new colour over 150ms, so the shot waits for it to stop.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS!, `${number}-${name}-${THEME}.png`), fullPage: true });
}

test.describe(`${THEME} theme, the weekly review's sitting at 390px`, () => {
  test.skip(!SHOTS, 'screenshots are taken only when REVIEW_SCREENSHOT_DIR is set');
  test.use({ viewport: { width: WIDTHS.phone, height: 900 } });

  test('every changed screen', async ({ page }) => {
    test.setTimeout(300_000);
    await fakeReviewMode('good');
    try {
      // A slipping week: layer 3 raises the check-in. 01 before anything is asked, 02 with a line and a choice, 06 once finished.
      const first = await signUpAndConfirm(page, `shots-sitting-${THEME}`);
      await seedReview(first, { closesEarly: false, planning: 'today', timeZone: LA, finished: false, week: 'none' });
      await page.goto('/review');
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('button', { name: ASK })).toBeVisible();
      await shot(page, '01', 'before-asking');

      await page.getByRole('button', { name: ASK }).click();
      await expect(page.getByText('From Claude.')).toBeVisible();
      await page.getByRole('radio', { name: 'Yes, I want to change it' }).click();
      await expect(page.getByText("Noted. Changing a target isn't in the app yet, so nothing was changed.")).toBeVisible();
      await shot(page, '02', 'line-and-choice');

      await page.getByRole('button', { name: 'Finish review' }).click();
      await expect(page.getByText('You finished this review today. It stays as it was said.')).toBeVisible();
      await shot(page, '06', 'finished-plan-next');

      // A week that ended at the floor: nothing for layer 3. 03 before asking; with Claude's reply failing code's checks, 04 shows
      // the line Momentum wrote; asking twice more uses the day's calls, and 05 shows the limit in words.
      await page.context().clearCookies();
      const second = await signUpAndConfirm(page, `shots-sitting-b-${THEME}`);
      await seedReview(second, { closesEarly: false, planning: 'today', timeZone: LA, finished: false });
      await fakeReviewMode('bad');
      await page.goto('/review');
      await page.waitForLoadState('networkidle');
      await expect(page.getByText('Nothing to adjust this week.')).toBeVisible();
      await shot(page, '03', 'nothing-to-adjust');

      await page.getByRole('button', { name: ASK }).click();
      await expect(page.getByText("From Momentum. Claude's line didn't pass our checks, so this one is plain.")).toBeVisible();
      await shot(page, '04', 'line-from-momentum');

      for (let i = 0; i < 2; i++) {
        await page.reload();
        await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: ASK }).click();
        if (i === 0) await expect(page.getByText("From Momentum. Claude's line didn't pass our checks, so this one is plain.")).toBeVisible();
      }
      await expect(page.getByText('You have already asked Claude for a line today. Your review goes on without it.')).toBeVisible();
      await shot(page, '05', 'limit-in-words');

      // Planning kept separate: one quiet line and a way in.
      await page.context().clearCookies();
      const third = await signUpAndConfirm(page, `shots-sitting-c-${THEME}`);
      await seedReview(third, { closesEarly: false, planning: 'today', timeZone: LA, finished: false, reviewPlanning: 'separate' });
      await page.goto('/review');
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: 'Finish review' }).click();
      await expect(page.getByText("You chose to plan your week separately, so it's there when you want it.")).toBeVisible();
      await shot(page, '07', 'finished-planning-separate');
    } finally {
      await fakeReviewMode('good');
    }
  });
});
