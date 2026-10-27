// The privacy notice (MOM-102) in a real browser: it loads for someone who is signed out, and sign-up links to it.

import { expect, test } from './fixtures';

test.use({ viewport: { width: 1280, height: 900 } });

test.describe('the privacy notice', () => {
  test('/privacy loads signed out, without being sent to /login', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy notice' })).toBeVisible();
    await expect(page.getByText('for adults only (18 or over)')).toBeVisible();
  });

  test('sign-up on /login links to it, and the link works', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'privacy notice' }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy notice' })).toBeVisible();

    await page.getByRole('link', { name: 'Back to sign in' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
