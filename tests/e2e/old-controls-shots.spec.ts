// Screenshots of home without the old model's controls (MOM-115, trial subset), for the owner to look at before the commit. They run only
// when MOM115_SHOT_DIR names a folder (outside the repo); E2E_COLOR_SCHEME=dark gives the dark set. For each width (390 and 1280) it
// saves home for a person with no setup, with a saved setup, and with a scoreboard that could not be read. The last one needs a page that
// renders home with an unreadable scoreboard, which a real account cannot produce, so it is taken only when the throwaway page
// app/shot-unreadable/page.tsx exists (never committed).

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { WIDTHS, expect, signUpAndConfirm, test } from './fixtures';
import { seedHome } from './support/homeSeed';

const SHOTS = process.env.MOM115_SHOT_DIR;
const THEME = process.env.E2E_COLOR_SCHEME === 'dark' ? 'dark' : 'light';

for (const [label, width] of Object.entries(WIDTHS)) {
  test.describe(`${THEME} theme at ${width}px (${label})`, () => {
    test.skip(!SHOTS, 'screenshots are taken only when MOM115_SHOT_DIR is set');
    test.use({ viewport: { width, height: 900 } });

    test('home with no setup, with a saved setup, and with an unreadable scoreboard', async ({ page }) => {
      mkdirSync(SHOTS!, { recursive: true });
      const shot = (name: string) => page.screenshot({ path: join(SHOTS!, `home-${name}-${THEME}-${width}.png`), fullPage: true });

      await signUpAndConfirm(page, `mom115-a-${THEME}-${width}`);
      await page.goto('/');
      await expect(page.getByRole('region', { name: 'Set up your goals' })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await shot('no-setup');

      if (existsSync(join(process.cwd(), 'app', 'shot-unreadable', 'page.tsx'))) {
        await page.goto('/shot-unreadable');
        await expect(page.getByRole('alert')).toContainText("Your goals didn't load just now.");
        await page.waitForLoadState('networkidle');
        await shot('unreadable');
      }

      // A second account for the saved setup: clear the first one's session, or /login would send it straight home.
      await page.context().clearCookies();
      const email = await signUpAndConfirm(page, `mom115-b-${THEME}-${width}`);
      await seedHome(email, { timeZone: 'America/Los_Angeles', weekStart: 1, weekly: true });
      await page.goto('/');
      await expect(page.getByRole('region', { name: 'This week' })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await shot('saved-setup');
    });
  });
}
