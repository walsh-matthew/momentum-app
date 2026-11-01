// Screenshots of the sign-in, create-account (empty, and with the plain callout) and check-your-email screens (MOM-150), for the owner to
// read before the commit. They run only when MOM150_SHOT_DIR names a folder (outside the repo); E2E_COLOR_SCHEME=dark gives the dark set.
// Each width (390 and 1280) saves four pictures.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PASSWORD, WIDTHS, expect, expectCheckYourEmail, openCreateAccount, test, uniqueEmail } from './fixtures';

const SHOTS = process.env.MOM150_SHOT_DIR;
const THEME = process.env.E2E_COLOR_SCHEME === 'dark' ? 'dark' : 'light';

for (const [label, width] of Object.entries(WIDTHS)) {
  test.describe(`${THEME} theme at ${width}px (${label})`, () => {
    test.skip(!SHOTS, 'screenshots are taken only when MOM150_SHOT_DIR is set');
    test.use({ viewport: { width, height: 900 } });

    test('sign-in, create-account, its callout and the check-your-email state', async ({ page }) => {
      mkdirSync(SHOTS!, { recursive: true });
      const shot = (n: number, name: string) =>
        page.screenshot({ path: join(SHOTS!, `${n}-${name}-${THEME}-${width}.png`), fullPage: true });

      await page.goto('/login');
      await expect(page.getByRole('heading', { name: 'Sign in to Momentum' })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await shot(1, 'sign-in');

      await openCreateAccount(page);
      await page.waitForLoadState('networkidle');
      await shot(2, 'create-account');

      await page.getByRole('button', { name: 'Create account' }).click();
      await expect(page.locator('form [role="alert"]')).toBeVisible();
      await shot(3, 'create-account-empty-callout');

      const email = uniqueEmail(`mom150-${THEME}-${width}`);
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Password').fill(PASSWORD);
      await page.getByRole('button', { name: 'Create account' }).click();
      await expectCheckYourEmail(page, email);
      await shot(4, 'check-your-email');
    });
  });
}
