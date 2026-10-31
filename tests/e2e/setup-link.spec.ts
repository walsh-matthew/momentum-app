// The way back to guided setup on home in a real browser against the local stack (MOM-143), at 390px (a phone) and 1280px. A
// brand-new account has no saved setup, so home offers it in one card and the link reaches /setup without typing the address;
// the old "No goals yet" card is not there beside it. An account with a saved setup (the rows setup creates, tests/e2e/support/
// homeSeed.ts) is offered no second one. Any 5xx response from the app fails the spec.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { WIDTHS, expect, signUpAndConfirm, test } from './fixtures';
import { seedHome } from './support/homeSeed';

for (const [name, width] of Object.entries(WIDTHS)) {
  test.describe(`at ${width}px (${name})`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('a person with no saved setup reaches setup from home without typing an address', async ({ page }) => {
      const serverErrors: string[] = [];
      page.on('response', (response) => {
        if (response.status() >= 500) serverErrors.push(`${response.status()} ${new URL(response.url()).pathname}`);
      });
      await signUpAndConfirm(page, `setup-link-${width}`);

      await page.goto('/');
      const card = page.getByRole('region', { name: 'Set up your goals' });
      await expect(card).toBeVisible();
      await expect(card.getByText("You haven't saved a setup yet.")).toBeVisible();
      // One message in one place: the old empty-state card is not shown beside it.
      await expect(page.getByRole('heading', { name: 'No goals yet' })).toHaveCount(0);
      // Nothing in the card runs past the screen.
      const box = await card.boundingBox();
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);

      await card.getByRole('link', { name: 'Go to setup' }).click();
      await expect(page).toHaveURL(/\/setup$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Set up your goals', exact: true })).toBeVisible();
      expect(serverErrors).toEqual([]);
    });

    test('a person whose setup is saved is not offered a second one', async ({ page }) => {
      const email = await signUpAndConfirm(page, `setup-saved-${width}`);
      await seedHome(email, { timeZone: 'America/Los_Angeles', weekStart: 1, weekly: true });

      await page.goto('/');
      await expect(page.getByRole('region', { name: 'This week' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Set up your goals' })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Go to setup' })).toHaveCount(0);
      await expect(page.locator('a[href="/setup"]')).toHaveCount(0);
      // The old model's empty state would say the opposite of what is true for this person: it never shows.
      await expect(page.getByRole('heading', { name: 'No goals yet' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Set up your first goal' })).toHaveCount(0);
    });
  });
}

// Screenshots of home at 390px with setup unfinished and with setup saved, in the theme the browser is set to, for the owner to look
// at before the commit. They run only when SETUP_LINK_SHOT_DIR names a folder (outside the repo); E2E_COLOR_SCHEME=dark gives the dark
// pair. Files: 1 and 2 are light, 3 and 4 are dark.
const SHOTS = process.env.SETUP_LINK_SHOT_DIR;
const DARK = process.env.E2E_COLOR_SCHEME === 'dark';

test.describe(`screenshots (${DARK ? 'dark' : 'light'}, 390px)`, () => {
  test.skip(!SHOTS, 'screenshots are taken only when SETUP_LINK_SHOT_DIR is set');
  test.use({ viewport: { width: WIDTHS.phone, height: 900 } });

  test('home with setup unfinished, then with setup saved', async ({ page }) => {
    mkdirSync(SHOTS!, { recursive: true });
    const first = DARK ? 3 : 1;
    const theme = DARK ? 'dark' : 'light';

    await signUpAndConfirm(page, `setup-link-shot-a-${theme}`);
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Set up your goals' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: join(SHOTS!, `${first}-home-setup-unfinished-${theme}-390.png`), fullPage: true });

    // A second account for the saved state: clear the first one's session, or /login would send it straight home.
    await page.context().clearCookies();
    const email = await signUpAndConfirm(page, `setup-link-shot-b-${theme}`);
    await seedHome(email, { timeZone: 'America/Los_Angeles', weekStart: 1, weekly: true });
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'This week' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: join(SHOTS!, `${first + 1}-home-setup-saved-${theme}-390.png`), fullPage: true });
  });
});
