// Hydration in a real browser (MOM-61, closing the MOM-54 criterion): /login and, signed in, the home page, each at
// 390px and 1280px. The `test` from ./fixtures fails any spec whose console shows an error or a warning that
// mentions hydration, so these specs only have to load the page and wait until it is interactive.
//
// The jsdom hydration test in tests/channel-selection.test.tsx stands in for Next's router; this is the real one.

import { WIDTHS, expect, signUpAndConfirm, test } from './fixtures';

for (const [name, width] of Object.entries(WIDTHS)) {
  test.describe(`at ${width}px (${name})`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('/login hydrates without a console message', async ({ page }) => {
      await page.goto('/login');
      await expect(page.getByRole('heading', { name: 'Sign in to Momentum' })).toBeVisible();
      await page.waitForLoadState('networkidle');
      // Interact, so the check is not passing on a page that never hydrated.
      await page.getByLabel('Email').fill('hydration@example.com');
      await expect(page.getByLabel('Email')).toHaveValue('hydration@example.com');
    });

    test('the signed-in home page hydrates without a console message', async ({ page }) => {
      await signUpAndConfirm(page, `hydration-${width}`);
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Make today count.' })).toBeVisible();
      await page.waitForLoadState('networkidle');
      // Interact: open and close the goal wizard, which only works once the page has hydrated.
      await page.getByRole('group', { name: 'Quick goal actions' }).getByRole('button', { name: 'New Goal Wizard' }).click();
      await expect(page.getByRole('dialog', { name: 'New goal wizard' })).toBeVisible();
      await page.getByRole('button', { name: 'Cancel' }).click();
      await expect(page.getByRole('dialog', { name: 'New goal wizard' })).toBeHidden();
    });
  });
}
