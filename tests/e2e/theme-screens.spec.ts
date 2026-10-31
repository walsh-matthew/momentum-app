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

    // MOM-145: the plain callout of a form that is missing something, on sign-in and on the review's one question.
    test('the missing-field callouts: sign-in and the review', async ({ page }) => {
      test.setTimeout(240_000);
      await page.goto('/login');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page.getByRole('alert').filter({ hasText: 'Enter your email address' })).toHaveText('Enter your email address to continue.');
      await shot(page, 'signin-missing', width);

      const reviewer = await signUpAndConfirm(page, `shots-missing-${THEME}-${width}`);
      await seedReview(reviewer, { closesEarly: false, planning: 'today', timeZone: LA, finished: false, week: 'none', reviewDepth: 'full' });
      await page.goto('/review');
      await page.getByRole('button', { name: 'Finish review' }).click();
      await expect(page.getByRole('alert').filter({ hasText: 'Choose one first.' })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await shot(page, 'review-missing', width);
    });

    test('the goal wizard, a goal on home, and the rebalance drawer', async ({ page }) => {
      test.setTimeout(240_000);
      await signUpAndConfirm(page, `shots-wizard-${THEME}-${width}`);
      await page.waitForLoadState('networkidle');
      await shot(page, 'home-empty', width);
      await page.getByRole('group', { name: 'Quick goal actions' }).getByRole('button', { name: 'New Goal Wizard' }).click();
      const wizard = page.getByRole('dialog', { name: 'New goal wizard' });
      await expect(wizard).toBeVisible();
      await shot(page, 'wizard', width, false);
      await wizard.getByRole('button', { name: 'Get certified' }).click();
      for (let i = 0; i < 3; i++) await wizard.getByRole('button', { name: 'Next' }).click();
      await wizard.getByRole('button', { name: 'Use the starter plan instead' }).click();
      await wizard.getByRole('button', { name: 'Create goal' }).click();
      await expect(wizard.getByRole('heading', { name: 'Goal created' })).toBeVisible();
      await wizard.getByRole('button', { name: 'Done' }).click();
      await expect(wizard).toBeHidden();
      await page.waitForLoadState('networkidle');
      await shot(page, 'home-goal', width);
      await page.getByRole('group', { name: 'Quick goal actions' }).getByRole('button', { name: 'Adjust Weekly Pace' }).click();
      await expect(page.getByRole('dialog', { name: 'Rebalance your plan' })).toBeVisible();
      // The drawer slides in over 200ms; the shot is taken once it has stopped.
      await page.waitForTimeout(500);
      await shot(page, 'drawer', width, false);
    });
  });
}
