// The Connected Apps page's connect flows in a real browser, against the local stack (MOM-62). Nothing here reaches
// Google or Hevy: the E2E dev server runs with the Google client pinned empty, so the Connect button comes straight
// back with "isn't set up on the server yet", and the Hevy key is only stored, never sent anywhere. The live
// consent screen and a real key are for the owner to check (see the ticket).

import type { Page } from '@playwright/test';
import { WIDTHS, expect, signUpAndConfirm, test } from './fixtures';
import { countEntries, seedHevyBinding } from './support/hevySeed';

const KEY = 'e2e-hevy-key-0123456789abcdef';
// The test server answers Hevy from a canned stand-in chosen by the key (lib/testing/fakeHevyFetch.ts, MOM-129).
const OK_KEY = 'e2e-hevy-ok-0123456789abcdef';
const REFUSED_KEY = 'e2e-hevy-refused-0123456789';
const SLOW_KEY = 'e2e-hevy-slow-0123456789abcd';
const card = (page: Page, name: string) => page.getByRole('heading', { name, level: 3 }).locator('xpath=ancestor::li[1]');

// Signs up, connects Hevy with `key`, and returns the card. `bound` gives the person a target that counts Hevy.
async function connectedHevy(page: Page, label: string, key: string, bound: boolean) {
  const email = await signUpAndConfirm(page, label);
  await seedHevyBinding(email, bound);
  await page.goto('/connections');
  await page.waitForLoadState('networkidle');
  const hevy = card(page, 'Hevy');
  await hevy.getByLabel('Hevy API key').fill(key);
  await hevy.getByRole('button', { name: 'Connect Hevy' }).click();
  await expect(hevy.getByText('Connected', { exact: true })).toBeVisible();
  return { email, hevy };
}

// Fails the spec at the end if the app answered anything with a server error.
function watchForServerErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 500) errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  return () => errors;
}

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

    test('Sync now: the first tap adds entries, the second adds none, and the card fits the screen', async ({ page }) => {
      const serverErrors = watchForServerErrors(page);
      const { email, hevy } = await connectedHevy(page, `sync-${width}`, OK_KEY, true);
      const sync = hevy.getByRole('button', { name: 'Sync now' });
      expect((await sync.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      await expect(hevy.getByRole('status')).toHaveCount(0);

      await sync.click();
      await expect(hevy.getByRole('status')).toHaveText('Added 2 entries.');
      expect(await countEntries(email)).toBe(2);

      await hevy.getByRole('button', { name: 'Sync now' }).click();
      await expect(hevy.getByRole('status')).toHaveText('Up to date. Nothing new from Hevy.');
      expect(await countEntries(email)).toBe(2);

      // The card and its button stay inside the screen (the page's own signed-in header is wider than a phone at 390px
      // today, which is not this card's doing: it is in the ticket's notes).
      for (const box of [await hevy.boundingBox(), await hevy.getByRole('button', { name: 'Sync now' }).boundingBox()]) {
        expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
      }
      expect(serverErrors()).toEqual([]);
    });

    test('Sync now with no target bound to Hevy says so and writes nothing', async ({ page }) => {
      const serverErrors = watchForServerErrors(page);
      const { email, hevy } = await connectedHevy(page, `sync-unbound-${width}`, OK_KEY, false);
      await hevy.getByRole('button', { name: 'Sync now' }).click();
      await expect(hevy.getByRole('status')).toHaveText('No target uses Hevy yet, so nothing was counted.');
      expect(await countEntries(email)).toBe(0);
      expect(serverErrors()).toEqual([]);
    });

    test('Sync now with a refused key shows the one notice and the card asks to reconnect', async ({ page }) => {
      const serverErrors = watchForServerErrors(page);
      const { email } = await connectedHevy(page, `sync-refused-${width}`, REFUSED_KEY, true);
      await card(page, 'Hevy').getByRole('button', { name: 'Sync now' }).click();
      await expect(card(page, 'Hevy').getByText('Needs reconnect')).toBeVisible();
      await expect(card(page, 'Hevy').getByText(/The provider refused the key\./)).toBeVisible();
      await expect(card(page, 'Hevy').getByRole('button', { name: 'Sync now' })).toHaveCount(0);
      expect(await countEntries(email)).toBe(0);
      expect(serverErrors()).toEqual([]);
    });

    test('Sync now when Hevy does not answer says to try again, changes nothing, and stays connected', async ({ page }) => {
      const serverErrors = watchForServerErrors(page);
      const { email, hevy } = await connectedHevy(page, `sync-slow-${width}`, SLOW_KEY, true);
      await hevy.getByRole('button', { name: 'Sync now' }).click();
      await expect(hevy.getByRole('alert')).toHaveText("Hevy didn't answer. Nothing was changed. Try again.");
      await expect(hevy.getByText('Connected', { exact: true })).toBeVisible();
      await expect(hevy.getByRole('button', { name: 'Sync now' })).toBeEnabled();
      expect(await countEntries(email)).toBe(0);
      expect(serverErrors()).toEqual([]);
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
