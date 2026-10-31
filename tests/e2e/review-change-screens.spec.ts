// Screenshots of every screen the review's "change" edit changed (MOM-146) at 390px, in the theme the browser is set to, for the owner to
// look at before the commit. It runs only when REVIEW_SCREENSHOT_DIR names a folder (outside the repo); the files go in
// <folder>/<screen>-<theme>-390<suffix>.png, and the theme is the one E2E_COLOR_SCHEME gives the browser (light by default). The suffix
// is REVIEW_SCREENSHOT_SUFFIX (for a retake, "-r2"), empty by default.
// Like review-screens.spec.ts it asserts almost nothing: tests/e2e/review.spec.ts is the spec that proves the behaviour. Run it only
// after any other browser run has finished.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { WIDTHS, expect, signUpAndConfirm, test } from './fixtures';
import { seedReview } from './support/reviewSeed';

const SHOTS = process.env.REVIEW_SCREENSHOT_DIR;
const THEME = process.env.E2E_COLOR_SCHEME === 'dark' ? 'dark' : 'light';
const SUFFIX = process.env.REVIEW_SCREENSHOT_SUFFIX ?? '';
const LA = 'America/Los_Angeles';

async function shot(page: Page, screen: string): Promise<void> {
  mkdirSync(SHOTS!, { recursive: true });
  // The development server's own badge sits over the corner of the page and is not part of the screen; and a choice that was just
  // tapped fades to its new colour over 150ms, so the shot waits for it to stop.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS!, `${screen}-${THEME}-390${SUFFIX}.png`), fullPage: true });
}

test.describe(`${THEME} theme, the review's change edit at 390px`, () => {
  test.skip(!SHOTS, 'screenshots are taken only when REVIEW_SCREENSHOT_DIR is set');
  test.use({ viewport: { width: WIDTHS.phone, height: 900 } });

  test('every changed screen', async ({ page }) => {
    test.setTimeout(300_000);
    // A slipping week: layer 3 raises the check-in for the workouts target.
    const email = await signUpAndConfirm(page, `shots-change-${THEME}`);
    await seedReview(email, { closesEarly: false, planning: 'today', timeZone: LA, finished: false, week: 'none' });
    await page.goto('/review');
    await page.waitForLoadState('networkidle');
    const question = page.getByRole('region', { name: 'One thing to decide' });
    await expect(question.getByRole('radio')).toHaveCount(3);
    await shot(page, 'review-change-card');

    await question.getByRole('radio', { name: 'Yes, I want to change it' }).click();
    const edit = question.getByRole('form', { name: 'Change this target' });
    await expect(edit).toBeVisible();
    await shot(page, 'review-change-form');

    await edit.getByRole('textbox', { name: /would still count/ }).fill('');
    await edit.getByRole('button', { name: 'Save the change' }).click();
    await expect(edit.getByRole('alert')).toHaveText('Enter a number above 0.');
    await shot(page, 'review-change-missing');

    await edit.getByRole('textbox', { name: /would still count/ }).fill('3');
    await edit.getByRole('textbox', { name: /hoping for/ }).fill('5');
    await edit.getByRole('button', { name: 'Save the change' }).click();
    await expect(question.getByText(/^Saved\. From /)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Finish review' })).toBeVisible();
    await shot(page, 'review-change-saved');

    await page.getByRole('button', { name: 'Finish review' }).click();
    await expect(page.getByText('You finished this review today. It stays as it was said.')).toBeVisible();
    await page.goto('/');
    // The change started today, so home shows the new numbers in force, and the slipping note no longer points at the finished review.
    await expect(page.getByText('Floor 3 a week · aspiration 5')).toBeVisible();
    await expect(page.getByText('Under the floor 3 weeks running.', { exact: true })).toBeVisible();
    await shot(page, 'home-target-changed');
  });
});
