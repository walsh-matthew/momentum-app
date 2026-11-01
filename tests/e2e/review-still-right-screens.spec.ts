// Screenshots of every screen "Still right for you?" changed (MOM-113 block 3.4) at 390px, in the theme the browser is set to, for the
// owner to look at before the commit. It runs only when REVIEW_SCREENSHOT_DIR names a folder (outside the repo); the files go in
// <folder>/<state>-<theme>-390<suffix>.png, and the theme is the one E2E_COLOR_SCHEME gives the browser (light by default). The suffix is
// REVIEW_SCREENSHOT_SUFFIX (for a retake, "-r2"), empty by default.
// Like review-change-screens.spec.ts it asserts almost nothing: tests/e2e/review.spec.ts is the spec that proves the behaviour. Run it
// only after any other browser run has finished.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { WIDTHS, expect, signUpAndConfirm, test } from './fixtures';
import { seedReview } from './support/reviewSeed';

const SHOTS = process.env.REVIEW_SCREENSHOT_DIR;
const THEME = process.env.E2E_COLOR_SCHEME === 'dark' ? 'dark' : 'light';
const SUFFIX = process.env.REVIEW_SCREENSHOT_SUFFIX ?? '';
const LA = 'America/Los_Angeles';

async function shot(page: Page, state: string): Promise<void> {
  mkdirSync(SHOTS!, { recursive: true });
  // The development server's own badge sits over the corner of the page and is not part of the screen; and a choice that was just
  // tapped fades to its new colour over 150ms, so the shot waits for it to stop.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS!, `${state}-${THEME}-390${SUFFIX}.png`), fullPage: true });
}

test.describe(`${THEME} theme, "Still right for you?" at 390px`, () => {
  test.skip(!SHOTS, 'screenshots are taken only when REVIEW_SCREENSHOT_DIR is set');
  test.use({ viewport: { width: WIDTHS.phone, height: 900 } });

  test('every changed state', async ({ page }) => {
    test.setTimeout(300_000);
    const email = await signUpAndConfirm(page, `shots-still-right-${THEME}`);
    await seedReview(email, { closesEarly: false, planning: 'today', timeZone: LA, finished: false, week: 'none', suggestions: ['floor', 'aspiration'] });
    await page.goto('/review');
    await page.waitForLoadState('networkidle');
    const card = page.getByRole('region', { name: 'Still right for you?' });
    await expect(card.getByRole('radio')).toHaveCount(4);
    await shot(page, 'still-right-asking');

    // Opened for the aspiration, to show the form under the target's first row.
    await card.getByRole('radiogroup', { name: 'Workouts: Hoping for 4 workouts a week' }).getByRole('radio', { name: 'No, change it' }).click();
    await expect(card.getByRole('form', { name: 'Change this target' })).toBeVisible();
    await shot(page, 'still-right-change-open');

    // Back out and answer both, so the finish is there.
    await card.getByRole('button', { name: 'Never mind' }).click();
    await card.getByRole('radiogroup', { name: 'Workouts: 2 workouts in a hard week still count' }).getByRole('radio', { name: 'Yes, it fits' }).click();
    await card.getByRole('radiogroup', { name: 'Workouts: Hoping for 4 workouts a week' }).getByRole('radio', { name: 'Yes, it fits' }).click();
    await expect(page.getByRole('button', { name: 'Finish review' })).toBeVisible();
    await shot(page, 'still-right-all-answered');
  });
});
