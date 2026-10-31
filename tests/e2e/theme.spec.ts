// The light palette and the theme choice in a real browser against the local stack (MOM-30), at 390px (a phone) and 1280px.
// What this proves that the unit tests cannot:
// - with no choice made, the app follows the device's setting (Playwright's colorScheme emulation) and changes when the device
//   switches, with no reload,
// - a choice made in Settings is one cookie holding only "light" or "dark", the server writes it onto <html> (read from the HTML
//   the server sent, before any script runs, so there is no flash of the other theme), it survives a reload, and "Match my
//   device" removes it,
// - every main screen loads and hydrates with no console message in both themes (the `test` from ./fixtures fails any spec whose
//   console shows an error or warning that mentions hydration),
// - a control's border is the strength the stylesheet says in each theme (the max() the control utilities use is understood).
// Any 5xx response from the app fails the spec.

import type { Page } from '@playwright/test';
import { WIDTHS, expect, signUpAndConfirm, test } from './fixtures';
import { seedPlan } from './support/planSeed';

const LA = 'America/Los_Angeles';
const COOKIE = 'momentum-theme';

function watchForServerErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 500) errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  return () => errors;
}

// How light a property of an element is, 0 (black) to 1 (white), as the browser really paints it: the computed colour is drawn
// on a canvas and read back, so oklch() and color-mix() come out as the screen shows them.
const lightness = (page: Page, selector: string, property: 'backgroundColor' | 'color'): Promise<number> =>
  page.evaluate(
    ([sel, prop]) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`no ${sel}`);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#000';
      ctx.fillStyle = getComputedStyle(el)[prop as 'backgroundColor' | 'color'];
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    },
    [selector, property] as const,
  );

const theme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme ?? null);

for (const [name, width] of Object.entries(WIDTHS)) {
  test.describe(`at ${width}px (${name})`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const scheme of ['light', 'dark'] as const) {
      test(`with no choice made, the page is ${scheme} when the device is ${scheme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto('/login');
        await expect(page.getByRole('heading', { name: 'Sign in to Momentum' })).toBeVisible();
        expect(await theme(page)).toBeNull();
        const page_ = await lightness(page, 'body', 'backgroundColor');
        const text = await lightness(page, 'body', 'color');
        if (scheme === 'light') {
          expect(page_, 'the page is light').toBeGreaterThan(0.9);
          expect(text, 'its text is dark').toBeLessThan(0.2);
        } else {
          expect(page_, 'the page is dark').toBeLessThan(0.1);
          expect(text, 'its text is light').toBeGreaterThan(0.8);
        }
      });
    }

    test('switches with the device while the page is open, with no reload', async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'light' });
      await page.goto('/login');
      await expect(page.getByRole('heading', { name: 'Sign in to Momentum' })).toBeVisible();
      expect(await lightness(page, 'body', 'backgroundColor')).toBeGreaterThan(0.9);
      await page.emulateMedia({ colorScheme: 'dark' });
      await expect.poll(() => lightness(page, 'body', 'backgroundColor')).toBeLessThan(0.1);
      await page.emulateMedia({ colorScheme: 'light' });
      await expect.poll(() => lightness(page, 'body', 'backgroundColor')).toBeGreaterThan(0.9);
    });

    test('a control border is the strength the stylesheet gives it in each theme', async ({ page }) => {
      for (const [scheme, alpha] of [['dark', '0.45'], ['light', '0.58']] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto('/login');
        const border = await page.getByLabel('Email').evaluate((el) => getComputedStyle(el).borderTopColor);
        // A valid max() inside color-mix() gives a translucent colour; a rejected one would fall back to the text colour (opaque).
        expect(border, `${scheme}: the email field's border`).toMatch(new RegExp(`/ ${alpha}\\)$`));
      }
    });

    test('a choice made in Settings is on <html> in the HTML the server sends, survives a reload, and can be removed', async ({ page }) => {
      const serverErrors = watchForServerErrors(page);
      await page.emulateMedia({ colorScheme: 'light' });
      await signUpAndConfirm(page, `theme-${width}`);
      await page.goto('/settings');
      await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
      await page.waitForLoadState('networkidle');

      const choice = (label: string) => page.getByRole('radio', { name: label });
      await expect(choice('Match my device')).toHaveAttribute('aria-checked', 'true');
      expect(await theme(page)).toBeNull();
      expect(await lightness(page, 'body', 'backgroundColor')).toBeGreaterThan(0.9);

      // Dark on a light device: the page changes at once, and the cookie holds only that word.
      await choice('Dark').click();
      await expect(choice('Dark')).toHaveAttribute('aria-checked', 'true');
      await expect.poll(() => lightness(page, 'body', 'backgroundColor')).toBeLessThan(0.1);
      await expect.poll(async () => (await page.context().cookies()).find((c) => c.name === COOKIE)?.value).toBe('dark');
      const cookie = (await page.context().cookies()).find((c) => c.name === COOKIE)!;
      expect(cookie.httpOnly).toBe(true);
      expect(cookie.sameSite).toBe('Lax');

      // No flash: the HTML the server sends already says dark, before any script runs, on a signed-in page and on /login.
      for (const path of ['/settings', '/login']) {
        const html = await (await page.request.get(path)).text();
        expect(html, `${path}: <html> carries the choice`).toMatch(/<html[^>]*\sdata-theme="dark"/);
      }
      await page.reload();
      expect(await theme(page)).toBe('dark');
      await expect(choice('Dark')).toHaveAttribute('aria-checked', 'true');
      expect(await lightness(page, 'body', 'backgroundColor')).toBeLessThan(0.1);

      // Light on a light device keeps light; then back to the device, which removes the cookie and the attribute.
      await choice('Light').click();
      await expect.poll(async () => (await page.context().cookies()).find((c) => c.name === COOKIE)?.value).toBe('light');
      await choice('Match my device').click();
      await expect.poll(async () => (await page.context().cookies()).find((c) => c.name === COOKIE)).toBeUndefined();
      await page.reload();
      expect(await theme(page)).toBeNull();
      const html = await (await page.request.get('/settings')).text();
      expect(html).not.toMatch(/<html[^>]*data-theme=/);

      // The choice beats the device: dark chosen on a light device stays dark, and follows nothing.
      await choice('Dark').click();
      await expect.poll(async () => (await page.context().cookies()).find((c) => c.name === COOKIE)?.value).toBe('dark');
      await page.emulateMedia({ colorScheme: 'light' });
      expect(await lightness(page, 'body', 'backgroundColor')).toBeLessThan(0.1);
      await choice('Light').click();
      await page.emulateMedia({ colorScheme: 'dark' });
      await expect.poll(() => lightness(page, 'body', 'backgroundColor')).toBeGreaterThan(0.9);
      expect(serverErrors()).toEqual([]);
    });

    for (const scheme of ['light', 'dark'] as const) {
      test(`every main screen loads and hydrates with no console message in the ${scheme} theme`, async ({ page }) => {
        test.setTimeout(150_000);
        const serverErrors = watchForServerErrors(page);
        await page.emulateMedia({ colorScheme: scheme });
        const email = await signUpAndConfirm(page, `theme-screens-${scheme}-${width}`);
        // Interact on a page that only works once hydrated: the setup card's link goes through Next's client router (a new account has no goal yet).
        await page.goto('/');
        await page.getByRole('link', { name: 'Go to setup' }).click();
        await expect(page).toHaveURL(/\/setup$/);
        await seedPlan(email, { timeZone: LA, weekStart: 1, weekly: true });
        for (const path of ['/', '/plan', '/review', '/connections', '/settings']) {
          await page.goto(path);
          await expect(page.locator('main h1').first()).toBeVisible();
          await page.waitForLoadState('networkidle');
          const bg = await lightness(page, 'body', 'backgroundColor');
          expect(scheme === 'light' ? bg > 0.9 : bg < 0.1, `${path}: the page is ${scheme}`).toBe(true);
        }
        expect(serverErrors()).toEqual([]);
      });
    }
  });
}
