// Manual entry in a real browser against the local stack (MOM-110): one of each way to log, a remove and a restore,
// and un-ticking then ticking a step again, from a brand-new throwaway account, at 390px (a phone) and 1280px. A second
// test checks that logging refuses, in words, until the person has a time zone. The throwaway account is given the
// rows setup will one day create by tests/e2e/support/goalModelSeed.ts, as that person through row level security.
//
// The timer needs at least 30 seconds to log, so the spec starts it through the page and then moves its saved start
// five minutes back (the only thing the browser keeps) rather than waiting. Any 5xx response from the app fails the spec.

import type { Page } from '@playwright/test';
import { WIDTHS, expect, signUpAndConfirm, test } from './fixtures';
import { SEED_TITLES, seedGoalModel } from './support/goalModelSeed';

// Fails the spec at the end if the app answered anything with a server error.
function watchForServerErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 500) errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  return () => errors;
}

const recent = (page: Page) => page.getByRole('region', { name: 'Recent entries' });

for (const [name, width] of Object.entries(WIDTHS)) {
  test.describe(`at ${width}px (${name})`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('logs a tap, a number, a timer and a tick; removes and restores; un-ticks and ticks again', async ({ page }) => {
      const serverErrors = watchForServerErrors(page);
      const email = await signUpAndConfirm(page, `entry-${width}`);
      const seeded = await seedGoalModel(email, 'America/Los_Angeles');

      await page.goto('/log');
      await expect(page.getByRole('heading', { name: 'Log an entry' })).toBeVisible();
      await expect(page.getByRole('status')).toHaveCount(0);
      await expect(recent(page).getByText('Nothing logged yet.')).toBeVisible();
      await page.waitForLoadState('networkidle');

      // Phone-first: no sideways scroll, and the tap is a large target.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      const tap = page.getByRole('button', { name: `Log one: ${SEED_TITLES.count}` });
      expect((await tap.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48);

      // A tap: one entry of 1, shown in the person's own time zone.
      await tap.click();
      const tapped = recent(page).getByRole('listitem').filter({ hasText: `${SEED_TITLES.count}: +1` });
      await expect(tapped).toHaveCount(1);
      await expect(tapped).toContainText(/P[SD]T/);

      // A number: one number, as typed.
      await page.getByRole('textbox', { name: `Amount in ${SEED_TITLES.unit} for ${SEED_TITLES.quantity}` }).fill('12.5');
      await page.getByRole('button', { name: 'Log it' }).click();
      await expect(recent(page).getByText(`${SEED_TITLES.quantity}: 12.5 ${SEED_TITLES.unit}`)).toBeVisible();
      await expect(page.getByRole('textbox')).toHaveValue('');

      // A timer: start it through the page, move the saved start five minutes back, reload, stop.
      await page.getByRole('button', { name: `Start timer: ${SEED_TITLES.time}` }).click();
      await expect(page.getByRole('button', { name: `Stop timer: ${SEED_TITLES.time}` })).toBeVisible();
      await page.evaluate(
        ([key, value]) => window.localStorage.setItem(key, value),
        [`momentum:timer:${seeded.targets.time}`, new Date(Date.now() - 5 * 60_000).toISOString()],
      );
      await page.reload();
      await page.getByRole('button', { name: `Stop timer: ${SEED_TITLES.time}` }).click();
      await expect(recent(page).getByText(`${SEED_TITLES.time}: 5 min`)).toBeVisible();
      await expect(page.getByRole('button', { name: `Start timer: ${SEED_TITLES.time}` })).toBeVisible();

      // A tick, then un-tick, then tick again: one entry the whole time.
      const step = page.getByRole('checkbox', { name: SEED_TITLES.steps[0] });
      await expect(step).toHaveAttribute('aria-checked', 'false');
      await step.click();
      await expect(step).toHaveAttribute('aria-checked', 'true');
      const ticked = recent(page).getByRole('listitem').filter({ hasText: `Ticked: ${SEED_TITLES.steps[0]}` });
      await expect(ticked).toHaveCount(1);
      await expect(ticked.getByText('Removed', { exact: true })).toHaveCount(0);

      await step.click();
      await expect(step).toHaveAttribute('aria-checked', 'false');
      await expect(ticked).toHaveCount(1);
      await expect(ticked.getByText('Removed', { exact: true })).toHaveCount(1);

      await step.click();
      await expect(step).toHaveAttribute('aria-checked', 'true');
      await expect(ticked).toHaveCount(1);
      await expect(ticked.getByText('Removed', { exact: true })).toHaveCount(0);

      // Remove the tapped entry, then restore it.
      await page.getByRole('button', { name: `Remove ${SEED_TITLES.count}: +1` }).click();
      await expect(tapped.getByText('Removed', { exact: true })).toHaveCount(1);
      await page.getByRole('button', { name: `Restore ${SEED_TITLES.count}: +1` }).click();
      await expect(tapped.getByText('Removed', { exact: true })).toHaveCount(0);
      await expect(tapped).toHaveCount(1);

      // It all survives a reload: four entries, the tick still ticked, and nothing removed.
      await page.reload();
      await expect(recent(page).getByRole('listitem')).toHaveCount(4);
      await expect(recent(page).getByText('Removed', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('checkbox', { name: SEED_TITLES.steps[0] })).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByRole('checkbox', { name: SEED_TITLES.steps[1] })).toHaveAttribute('aria-checked', 'false');

      expect(serverErrors(), 'server errors from the app').toEqual([]);
    });

    test('refuses to log, in words, until a time zone is set', async ({ page }) => {
      const serverErrors = watchForServerErrors(page);
      const email = await signUpAndConfirm(page, `entry-nozone-${width}`);
      await seedGoalModel(email, null);

      await page.goto('/log');
      await expect(page.getByRole('status')).toContainText('No time zone is set yet');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: `Log one: ${SEED_TITLES.count}` }).click();
      await expect(page.getByRole('main').getByRole('alert')).toContainText('Set your time zone before logging');
      await page.getByRole('checkbox', { name: SEED_TITLES.steps[0] }).click();
      await expect(page.getByRole('main').getByRole('alert')).toHaveCount(2);
      await expect(page.getByRole('checkbox', { name: SEED_TITLES.steps[0] })).toHaveAttribute('aria-checked', 'false');

      // Nothing was logged, and nothing was guessed.
      await page.reload();
      await expect(recent(page).getByText('Nothing logged yet.')).toBeVisible();

      expect(serverErrors(), 'server errors from the app').toEqual([]);
    });
  });
}
