// The rebalance drawer's entry points are not on home any more (MOM-115, trial subset), in a real browser at both widths: no "Adjust Weekly
// Pace" in the banner or the sidebar, no rebalance nudge, no "AI Assistant" tab with the rebalance card, for a person with no setup and for
// one with a saved setup. From 1280px the right-hand column is the connected stack alone, with nothing blank beside it. MOM-115 retires
// the drawer itself; tests/rebalance-drawer.test.tsx and tests/rebalance-drawer-dom.test.tsx cover its content, which the browser can no
// longer reach. Before this change this spec opened the drawer from the banner (MOM-61, for MOM-59's second criterion).

import { WIDTHS, expect, expectHomeLoaded, signUpAndConfirm, test } from './fixtures';
import { seedHome } from './support/homeSeed';
import { expectNoOldControls } from './support/oldControls';

for (const [name, width] of Object.entries(WIDTHS)) {
  test.describe(`at ${width}px (${name})`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('a person with no setup has no way to open the rebalance drawer', async ({ page }) => {
      await signUpAndConfirm(page, `drawer-${width}`);
      await page.waitForLoadState('networkidle');
      await expectHomeLoaded(page);
      await expect(page.getByRole('button', { name: 'Adjust Weekly Pace' })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Rebalance your plan' })).toHaveCount(0);
      await expect(page.getByText('MOMENTUM AI')).toHaveCount(0);
      await expectNoOldControls(page, width);
    });

    test('a person with a saved setup has no way to open it either', async ({ page }) => {
      const email = await signUpAndConfirm(page, `drawer-saved-${width}`);
      await seedHome(email, { timeZone: 'America/Los_Angeles', weekStart: 1, weekly: true });
      await page.goto('/');
      await expect(page.getByRole('region', { name: 'This week' })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('button', { name: 'Adjust Weekly Pace' })).toHaveCount(0);
      await expect(page.getByText('MOMENTUM AI')).toHaveCount(0);
      await expect(page.getByRole('tab', { name: 'AI Assistant' })).toHaveCount(0);
      await expectNoOldControls(page, width);
    });
  });
}
