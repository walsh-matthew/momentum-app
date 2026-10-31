// Screenshots of the main screens in the theme the browser is set to (MOM-30), at 390px (a phone) and 1280px, for the owner to
// look at before the merge. It runs only when THEME_SCREENSHOT_DIR names a folder (outside the repo); the files go in
// <folder>/<theme>/<screen>-<width>.png, and the theme is the one E2E_COLOR_SCHEME gives the browser (light by default). The
// setup cards are photographed by tests/e2e/setup-cards.spec.ts, which takes SETUP_SCREENSHOT_DIR and SETUP_SHOT_WIDTH.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { WIDTHS, expect, signUpAndConfirm, test } from './fixtures';
import { seedPlan } from './support/planSeed';
import { seedReview } from './support/reviewSeed';

const SHOTS = process.env.THEME_SCREENSHOT_DIR;
const THEME = process.env.E2E_COLOR_SCHEME === 'dark' ? 'dark' : 'light';
const LA = 'America/Los_Angeles';

async function shot(page: Page, name: string, width: number, fullPage = true): Promise<void> {
  const dir = join(SHOTS!, THEME);
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}-${width}.png`), fullPage });
}

for (const [label, width] of Object.entries(WIDTHS)) {
  test.describe(`${THEME} theme at ${width}px (${label})`, () => {
    test.skip(!SHOTS, 'screenshots are taken only when THEME_SCREENSHOT_DIR is set');
    test.use({ viewport: { width, height: 900 } });

    test('sign-in, home, plan, connections, settings and the review', async ({ page }) => {
      test.setTimeout(240_000);
      await page.goto('/login');
      await expect(page.getByRole('heading', { name: 'Sign in to Momentum' })).toBeVisible();
      await shot(page, 'signin', width);

      const email = await signUpAndConfirm(page, `shots-${THEME}-${width}`);
      await seedPlan(email, { timeZone: LA, weekStart: 1, weekly: true });
      for (const [path, name] of [
        ['/', 'home'],
        ['/plan', 'plan'],
        ['/connections', 'connections'],
        ['/settings', 'settings'],
      ] as const) {
        await page.goto(path);
        await expect(page.locator('main h1, main h2').first()).toBeVisible();
        await page.waitForLoadState('networkidle');
        await shot(page, name, width);
      }

      // A second account for the review: sign the first one out, or /login would send this one straight home.
      await page.context().clearCookies();
      const reviewer = await signUpAndConfirm(page, `shots-review-${THEME}-${width}`);
      await seedReview(reviewer, { closesEarly: false, planning: 'today', timeZone: LA, finished: false });
      await page.goto('/review');
      await expect(page.locator('main h1').first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      await shot(page, 'review', width);
    });

    // The goal wizard and the rebalance drawer are not reachable from home any more (MOM-115), so there is no shot of either.
    test('home for a brand-new account', async ({ page }) => {
      await signUpAndConfirm(page, `shots-home-${THEME}-${width}`);
      await page.waitForLoadState('networkidle');
      await shot(page, 'home-empty', width);
    });
  });
}
