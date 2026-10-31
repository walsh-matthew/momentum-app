import type { Page } from '@playwright/test';
import { expect } from '../fixtures';

// Home carries none of the old model's controls (MOM-115, trial subset): no goal wizard, no weekly pace, no rebalance entry, no goal
// channel list or goal cards, no empty feed heading, no "No goals yet" card, and no section with nothing in it. Used by wizard.spec.ts and
// drawer.spec.ts, which used to drive those controls.
export async function expectNoOldControls(page: Page, width: number): Promise<void> {
  for (const name of ['New Goal Wizard', '+ New Goal Wizard', 'Adjust Weekly Pace', 'Set up your first goal', 'Start another goal']) {
    await expect(page.getByRole('button', { name, exact: true }), name).toHaveCount(0);
  }
  await expect(page.getByRole('group', { name: 'Quick goal actions' })).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Goal channels' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Your goals', exact: true })).toHaveCount(0);
  for (const name of ['Goal Channels', 'Your goals', 'No goals yet', 'Make today count.', 'A little room to rebalance?', 'One goal at a time']) {
    await expect(page.getByRole('heading', { name, exact: true }), name).toHaveCount(0);
  }
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Assistant chat coming soon')).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(0);

  // No section is left with nothing in it, and (from 1280px) the right-hand column is the connected stack, not a blank.
  const emptySections = await page.evaluate(() =>
    Array.from(document.querySelectorAll('section'))
      .filter((s) => (s as HTMLElement).offsetParent !== null && (s.textContent ?? '').trim() === '' && !s.querySelector('img,svg,input,button'))
      .map((s) => s.className || s.getAttribute('aria-label') || 'section'),
  );
  expect(emptySections, 'sections with nothing in them').toEqual([]);
  if (width >= 1200) {
    const stack = page.getByLabel('Connected stack');
    await expect(stack).toBeVisible();
    await expect(stack.getByText('Connected stack')).toBeVisible();
    await expect(page.locator('.desktop-right > *')).toHaveCount(1);
  }
}
