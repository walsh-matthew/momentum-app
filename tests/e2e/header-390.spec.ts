// The whole page at 390px with a long email address, on every signed-in page (MOM-131, RAID I-09). The sticky header's "Signed in as"
// row used to run wider than a phone, so the page scrolled sideways; the specs before this one looked only at their own section or
// card. Here the page as a whole must not scroll sideways, and every page has a way home and a Sign out button fully on the
// screen: the header's on home, Connected apps and Settings, and the back row's (MOM-148) on the rest. A guard fails the spec when a page is added to app/ without being listed below, so the sweep cannot fall behind.
// Screenshots are written only when HEADER_SCREENSHOT_DIR names a folder (outside the repo), named <page>-<light|dark>-390.png
// (E2E_COLOR_SCHEME=dark for dark); without it the checks still run.

import { mkdirSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Page } from '@playwright/test';
import { WIDTHS, expect, signUpAndConfirm, test } from './fixtures';
import { seedPlan } from './support/planSeed';

const SHOTS = process.env.HEADER_SCREENSHOT_DIR;
const DARK = process.env.E2E_COLOR_SCHEME === 'dark';
const LA = 'America/Los_Angeles';

// Long enough that the address, not the screen, is the widest thing in the row (the local part stays under 64 characters).
const LONG_LABEL = 'a-very-long-throwaway-address-for-390';

// Every signed-in page. `header` is true where the sticky header is on the page; the others have the back row.
const SIGNED_IN = [
  { path: '/', header: true, name: 'home' },
  { path: '/plan', header: false, name: 'plan' },
  { path: '/settings', header: true, name: 'settings' },
  { path: '/connections', header: true, name: 'connections' },
  { path: '/review', header: false, name: 'review' },
  { path: '/log', header: false, name: 'log' },
  { path: '/setup', header: false, name: 'setup' },
  { path: '/privacy', header: false, name: 'privacy' },
] as const;
// Pages a signed-out visitor sees, which have no signed-in row to check.
const SIGNED_OUT = ['/login', '/auth/reset'];

const routesOnDisk = (): string[] => {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name));
      else if (entry.name === 'page.tsx') found.push('/' + relative('app', dir).split(sep).join('/'));
    }
  };
  walk('app');
  return found.map((route) => (route === '/.' || route === '/' ? '/' : route)).sort();
};

const sideways = (page: Page) =>
  page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, view: window.innerWidth }));

test('every page in app/ is in the 390px sweep or is a signed-out page', () => {
  const listed = [...SIGNED_IN.map((p) => p.path), ...SIGNED_OUT].sort();
  expect(routesOnDisk()).toEqual(listed);
});

test.describe(`at ${WIDTHS.phone}px with a long email address`, () => {
  test.use({ viewport: { width: WIDTHS.phone, height: 900 } });

  test('no signed-in page scrolls sideways, and Sign out is fully on the screen', async ({ page }) => {
    test.setTimeout(240_000);
    const email = await signUpAndConfirm(page, LONG_LABEL);
    await seedPlan(email, { timeZone: LA, weekStart: 1, weekly: true });
    if (SHOTS) mkdirSync(SHOTS, { recursive: true });

    for (const route of SIGNED_IN) {
      await page.goto(route.path);
      await expect(page.locator('main h1, main h2').first()).toBeVisible();
      await page.waitForLoadState('networkidle');

      const { scroll, view } = await sideways(page);
      expect(scroll, `${route.path} scrolls sideways`).toBeLessThanOrEqual(view);

      // The header is inside a region on the page, so it is not a "banner" landmark there; the class names it. Without it, the
      // page's own back row holds the way home and Sign out.
      const scope = route.header ? page.locator('.mobile-header') : page.locator('main');
      const signOut = scope.getByRole('button', { name: 'Sign out' });
      await expect(signOut, `${route.path} has a Sign out`).toBeVisible();
      const home = route.header ? scope.getByRole('link', { name: 'Momentum home' }) : scope.getByRole('link', { name: 'Back to home' });
      await expect(home, `${route.path} has a way home`).toBeVisible();
      for (const button of await signOut.all()) {
        const box = await button.boundingBox();
        expect(box, `${route.path}: Sign out has a box`).not.toBeNull();
        expect(box!.x, `${route.path}: Sign out starts on the screen`).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width, `${route.path}: Sign out ends on the screen`).toBeLessThanOrEqual(WIDTHS.phone);
      }

      if (SHOTS) await page.screenshot({ path: join(SHOTS, `${route.name}-${DARK ? 'dark' : 'light'}-${WIDTHS.phone}.png`) });
    }
  });
});

// The back row is the same on a desktop: the way home and Sign out sit on the page too (the owner asked for it at every width,
// MOM-148). The sidebar and the header on home, Connected apps and Settings are not changed.
test.describe(`at ${WIDTHS.desktop}px`, () => {
  test.use({ viewport: { width: WIDTHS.desktop, height: 900 } });

  test('the plan page has the way home and Sign out', async ({ page }) => {
    const email = await signUpAndConfirm(page, LONG_LABEL);
    await seedPlan(email, { timeZone: LA, weekStart: 1, weekly: true });
    await page.goto('/plan');
    await expect(page.locator('main h1, main h2').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main').getByRole('link', { name: 'Back to home' })).toBeVisible();
    await expect(page.locator('main').getByRole('button', { name: 'Sign out' })).toBeVisible();
    if (SHOTS) {
      mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: join(SHOTS, `plan-${DARK ? 'dark' : 'light'}-${WIDTHS.desktop}.png`) });
    }
  });
});
