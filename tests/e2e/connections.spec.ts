// The Connected Apps page's connect flows in a real browser, against the local stack (MOM-62). Nothing here reaches
// Google or Hevy: the E2E dev server runs with the Google client pinned empty, so the Connect button comes straight
// back with "isn't set up on the server yet", and the Hevy key is only stored, never sent anywhere. The live
// consent screen and a real key are for the owner to check (see the ticket).

import type { Page } from '@playwright/test';
import { WIDTHS, expect, signUpAndConfirm, test } from './fixtures';

const KEY = 'e2e-hevy-key-0123456789abcdef';
const card = (page: Page, name: string) => page.getByRole('heading', { name, level: 3 }).locator('xpath=ancestor::li[1]');

for (const [name, width] of Object.entries(WIDTHS)) {
  test.describe(`at ${width}px (${name})`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('Hevy: connect with a key, see it connected without the key, then disconnect in two clicks', async ({ page }) => {
      await signUpAndConfirm(page, `connections-${width}`);
      await page.goto('/connections');
      await page.waitForLoadState('networkidle');
      const hevy = card(page, 'Hevy');
      await expect(hevy.getByText('Not connected')).toBeVisible();

      const field = hevy.getByLabel('Hevy API key');
      await expect(field).toHaveAttribute('type', 'password');
      await field.fill(KEY);
      await hevy.getByRole('button', { name: 'Connect Hevy' }).click();

      // Connected: the form is gone, the key is nowhere in the page, and the card offers Disconnect.
      await expect(hevy.getByText('Connected', { exact: true })).toBeVisible();
      await expect(hevy.getByLabel('Hevy API key')).toHaveCount(0);
      await expect(page.locator('body')).not.toContainText(KEY);
      expect(await page.content()).not.toContain(KEY);

      // It survives a reload: the connection is stored, and the key still is not shown.
      await page.reload();
      await expect(card(page, 'Hevy').getByText('Connected', { exact: true })).toBeVisible();
      expect(await page.content()).not.toContain(KEY);

      // Disconnecting asks twice.
      await card(page, 'Hevy').getByRole('button', { name: 'Disconnect', exact: true }).click();
      await expect(card(page, 'Hevy').getByText(/This deletes the stored connection/)).toBeVisible();
      await card(page, 'Hevy').getByRole('button', { name: 'Disconnect Hevy' }).click();
      await expect(card(page, 'Hevy').getByText('Not connected')).toBeVisible();
      await expect(card(page, 'Hevy').getByLabel('Hevy API key')).toBeVisible();
    });

    test('Hevy: a bad key shows a message and is not echoed', async ({ page }) => {
      await signUpAndConfirm(page, `badkey-${width}`);
      await page.goto('/connections');
      await page.waitForLoadState('networkidle');
      const hevy = card(page, 'Hevy');
      await hevy.getByLabel('Hevy API key').fill('has spaces in it, not a key');
      await hevy.getByRole('button', { name: 'Connect Hevy' }).click();
      await expect(hevy.getByRole('alert')).toHaveText('An API key has no spaces or special characters.');
      await expect(hevy.getByLabel('Hevy API key')).toHaveValue('');
      await expect(hevy.getByText('Not connected')).toBeVisible();
    });
  });
}

test.describe('Google Calendar with no client configured', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('the Connect button comes back to the page with a plain message and connects nothing', async ({ page }) => {
    await signUpAndConfirm(page, 'google-unset');
    await page.goto('/connections');
    await page.waitForLoadState('networkidle');
    const google = card(page, 'Google Calendar');
    await expect(google.getByText('Not connected')).toBeVisible();

    await google.getByRole('button', { name: 'Connect Google Calendar' }).click();

    await expect(page).toHaveURL(/\/connections\?google=not_configured$/);
    await expect(page.getByRole('alert').filter({ hasText: "isn't set up on the server yet" })).toBeVisible();
    await expect(card(page, 'Google Calendar').getByText('Not connected')).toBeVisible();
    // No Google cookie is left behind.
    expect((await page.context().cookies()).filter((c) => c.name === 'momentum_google_oauth')).toEqual([]);
  });

  test('a made-up outcome in the address shows nothing', async ({ page }) => {
    await signUpAndConfirm(page, 'google-fake');
    await page.goto('/connections?google=%3Cscript%3Ealert(1)%3C%2Fscript%3E');
    await expect(page.getByRole('heading', { name: 'Connected apps' })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: /Google|connected/i })).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('<script>');
  });

  test('the callback without a flow in progress does nothing but come back with a message', async ({ page }) => {
    await signUpAndConfirm(page, 'google-cb');
    await page.goto('/api/auth/callback/google?code=made-up-code&state=made-up-state');
    await expect(page).toHaveURL(/\/connections\?google=expired$/);
    await expect(page.getByRole('alert').filter({ hasText: 'took too long' })).toBeVisible();
    await expect(card(page, 'Google Calendar').getByText('Not connected')).toBeVisible();
  });

  test('signed out, the callback and the start route send a visitor to /login', async ({ page, request }) => {
    await page.goto('/api/auth/callback/google?code=x&state=y');
    await expect(page).toHaveURL(/\/login$/);
    const res = await request.post('/api/integrations/google/start', { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(new URL(res.headers()['location'], 'http://localhost').pathname).toBe('/login');
  });
});
