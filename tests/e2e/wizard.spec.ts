// The old goal wizard is not on home any more (MOM-115, trial subset), in a real browser against the local stack, at both widths: a
// brand-new account (no setup) and an account with a saved setup both see no "New Goal Wizard" button, banner or sidebar button, no
// goal channel list or goal cards, no empty feed heading and no "No goals yet" card. MOM-115 retires the wizard modal itself;
// tests/goal-wizard.test.tsx covers its content, which the browser can no longer reach. Before this change this spec walked the wizard from
// a new account (MOM-61); the paths it walked (Generate failing, Try again, the wait message, the starter plan, Create) are in that
// component test and in the guided setup specs.

import { WIDTHS, expect, expectHomeLoaded, signUpAndConfirm, test } from './fixtures';
import { seedHome } from './support/homeSeed';
import { expectNoOldControls } from './support/oldControls';

for (const [name, width] of Object.entries(WIDTHS)) {
  test.describe(`at ${width}px (${name})`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('a person with no setup sees the setup card and no wizard button', async ({ page }) => {
      await signUpAndConfirm(page, `wizard-${width}`);
      await page.waitForLoadState('networkidle');
      await expectHomeLoaded(page);
      await expect(page.getByRole('heading', { name: 'Set up your goals' })).toBeVisible();
      await expectNoOldControls(page, width);
    });

    test('a person with a saved setup sees their week and no wizard button', async ({ page }) => {
      const email = await signUpAndConfirm(page, `wizard-saved-${width}`);
      await seedHome(email, { timeZone: 'America/Los_Angeles', weekStart: 1, weekly: true });
      await page.goto('/');
      await expect(page.getByRole('region', { name: 'This week' })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('region', { name: 'Set up your goals' })).toHaveCount(0);
      await expectNoOldControls(page, width);
    });
  });
}
