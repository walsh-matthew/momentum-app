// Screenshots of the new sign-in and confirm-link words (MOM-163), for the owner to read before the commit: a wrong password, an
// account not confirmed yet, a confirm link already used or expired, the resend line, and the check-your-email card with a long
// address. They run only when MOM163_SHOT_DIR names a folder (outside the repo); E2E_COLOR_SCHEME=dark gives the dark set.
// Each width (390 and 1280) saves five pictures.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PASSWORD, WIDTHS, expect, expectCheckYourEmail, submitCredentials, test, uniqueEmail } from './fixtures';

const SHOTS = process.env.MOM163_SHOT_DIR;
const THEME = process.env.E2E_COLOR_SCHEME === 'dark' ? 'dark' : 'light';

for (const [label, width] of Object.entries(WIDTHS)) {
  test.describe(`${THEME} theme at ${width}px (${label})`, () => {
    test.skip(!SHOTS, 'screenshots are taken only when MOM163_SHOT_DIR is set');
    test.use({ viewport: { width, height: 900 } });

    test('the wrong-password, not-confirmed, used-link, resend and long-address screens', async ({ page }) => {
      mkdirSync(SHOTS!, { recursive: true });
      const shot = async (n: number, name: string) => {
        await page.waitForLoadState('networkidle');
        await page.screenshot({ path: join(SHOTS!, `${n}-${name}-${THEME}-${width}.png`), fullPage: true });
      };

      // 1. A wrong password.
      await page.goto('/login');
      await submitCredentials(page, uniqueEmail(`shot-wrong-${THEME}-${width}`), 'not-the-password-1', 'Sign in');
      await expect(page.locator('form [role="alert"]')).toContainText("That email and password don't match.");
      await shot(1, 'wrong-password');

      // 2. A long address in the check-your-email card (a 50-character name before the @).
      const long = `${'a-very-long-address-'.repeat(2)}${THEME}${width}-${Date.now()}@example.com`;
      await page.goto('/login');
      await submitCredentials(page, long, PASSWORD, 'Create account');
      await expectCheckYourEmail(page, long);
      await shot(2, 'long-address');

      // 3. Signing up again at once with the same address: the resend line (the local window is 1 second, so this may go through
      //    instead; the picture is taken only when the line shows).
      await page.getByRole('button', { name: 'Start again' }).click();
      await submitCredentials(page, long, PASSWORD, 'Create account');
      const tooSoon = page.locator('form [role="alert"]');
      if (await tooSoon.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(tooSoon).toHaveText('We just sent you a link. Wait a minute, then try again.');
        await shot(3, 'resend-line');
      }

      // 4. The right password for an account that is not confirmed yet.
      await page.goto('/login');
      await submitCredentials(page, long, PASSWORD, 'Sign in');
      await expect(page.locator('form [role="alert"]')).toContainText("Your account isn't confirmed yet.");
      await shot(4, 'not-confirmed');

      // 5. A confirm link that was used or has expired.
      await page.goto('/auth/callback?token_hash=not-a-real-token&type=email');
      await expect(page.locator('form [role="alert"]')).toContainText('This link has already been used or has expired.');
      await shot(5, 'link-used-or-expired');
    });
  });
}
