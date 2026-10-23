// The rebalance drawer in a real browser at both widths (MOM-61, for MOM-59's second criterion): it opens from the
// goal-builder banner's "Adjust Weekly Pace", shows its state, and closes by every route without changing anything.
//
// What this does NOT reach: a proposal with moves (Ask Claude, Apply). A new account's tasks are all in week 1, so
// nothing is behind, and making a task behind would need a database write the specs deliberately do not make. Those
// states are covered in a DOM by tests/rebalance-drawer-dom.test.tsx.

import type { Page } from '@playwright/test';
import { WIDTHS, expect, signUpAndConfirm, test } from './fixtures';

// An account with one goal and its starter-plan tasks. The starter plan needs no model.
async function accountWithGoal(page: Page, label: string) {
  await signUpAndConfirm(page, label);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Set up your first goal' }).click();
  const wizard = page.getByRole('dialog', { name: 'New goal wizard' });
  await wizard.getByRole('button', { name: 'Get certified' }).click();
  for (let i = 0; i < 3; i++) await wizard.getByRole('button', { name: 'Next' }).click();
  await wizard.getByRole('button', { name: 'Use the starter plan instead' }).click();
  await wizard.getByRole('button', { name: 'Create goal' }).click();
  await expect(wizard.getByRole('heading', { name: 'Goal created' })).toBeVisible();
  await wizard.getByRole('button', { name: 'Done' }).click();
  await expect(wizard).toBeHidden();
}

for (const [name, width] of Object.entries(WIDTHS)) {
  test.describe(`at ${width}px (${name})`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('opens, says nothing is behind, and closes without changing anything', async ({ page }) => {
      await accountWithGoal(page, `drawer-${width}`);
      const banner = page.getByRole('group', { name: 'Quick goal actions' });

      await banner.getByRole('button', { name: 'Adjust Weekly Pace' }).click();
      const drawer = page.getByRole('dialog', { name: 'Rebalance your plan' });
      await expect(drawer).toBeVisible();
      // The drawer fills the height and sits against the right edge, whatever the width.
      const box = await drawer.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x + box!.width).toBeGreaterThan(width - 2);
      expect(box!.height).toBeGreaterThan(500);
      await expect(drawer.getByText('Nothing is behind, so there is nothing to rebalance.')).toBeVisible();
      // A plan with nothing to move offers nothing to apply.
      await expect(drawer.getByRole('button', { name: /^Apply/ })).toHaveCount(0);

      // Escape closes it, and so does the button; neither changes the plan.
      await page.keyboard.press('Escape');
      await expect(drawer).toBeHidden();
      await banner.getByRole('button', { name: 'Adjust Weekly Pace' }).click();
      await expect(drawer).toBeVisible();
      await drawer.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(drawer).toBeHidden();

      // Still no tasks done and the same focus task: nothing moved or ticked.
      await expect(page.getByRole('checkbox')).toHaveAttribute('aria-checked', 'false');
      await expect(page.getByRole('heading', { name: 'Recently done' })).toHaveCount(0);
    });
  });
}
