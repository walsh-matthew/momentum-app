// Password reset through the normal forms against the local stack (MOM-64): request on /login, the email from the
// local Mailpit inbox, the emailed link, a new password, and sign-in with it. Asking for a reset for an address
// that has no account gives the same answer and sends nothing. A throwaway account is made for each test through the
// sign-up form; the standing smoke-test account is never used.

import { PASSWORD, expect, expectHomeLoaded, messageCountFor, recoveryLinkFor, signUpAndConfirm, submitCredentials, test, uniqueEmail } from './fixtures';

test.use({ viewport: { width: 1280, height: 900 } });

const NEW_PASSWORD = 'e2e-brand-new-password-2';
const NEUTRAL = 'If that email has an account, we have sent a link to set a new password.';

async function signOutFromSettings(page: import('@playwright/test').Page) {
  await page.goto('/settings');
  await page.getByRole('main').getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

async function requestReset(page: import('@playwright/test').Page, email: string) {
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toHaveText(NEUTRAL);
}

test.describe('password reset', () => {
  test('request, follow the emailed link, set a new password, sign in with it', async ({ page, browser }) => {
    const email = await signUpAndConfirm(page, 'reset');

    // A normal sign-in is not a recovery session: the new-password page refuses to act on it.
    await page.goto('/auth/reset');
    await expect(page.getByRole('heading', { name: 'This link has expired' })).toBeVisible();
    await expect(page.getByLabel('Confirm new password')).toHaveCount(0);

    await signOutFromSettings(page);

    // Ask for the reset from /login.
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await expect(page).toHaveURL(/\/login\?reset=1$/);
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
    await requestReset(page, email);

    // The emailed link is a token link: opened here, it lands signed in on the new-password page. (The next test opens
    // it in a browser that never asked.)
    const link = await recoveryLinkFor(email);
    await page.goto(link);
    await expect(page).toHaveURL(/\/auth\/reset$/);
    await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible();

    // Two different passwords are refused and the page stays.
    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Confirm new password').fill('something-else-entirely');
    await page.getByRole('button', { name: 'Set new password' }).click();
    await expect(page.locator('form [role="alert"]')).toHaveText('The two passwords do not match.');
    await expect(page).toHaveURL(/\/auth\/reset$/);

    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Confirm new password').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Set new password' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expectHomeLoaded(page);

    // Sign in with the new password; the old one no longer works.
    await signOutFromSettings(page);
    await submitCredentials(page, email, PASSWORD, 'Sign in');
    await expect(page.locator('form [role="alert"]')).toHaveText(/invalid login credentials/i);
    await submitCredentials(page, email, NEW_PASSWORD, 'Sign in');
    await expect(page).toHaveURL(/\/$/);
    await expectHomeLoaded(page);

    // The link works once: opened again (here in a fresh browser) it is used up, and goes back to /login with the way
    // to ask for another.
    const stranger = await browser.newContext();
    const strangerPage = await stranger.newPage();
    await strangerPage.goto(link);
    await expect(strangerPage).toHaveURL(/\/login\?error=reset$/);
    await expect(strangerPage.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
    await expect(strangerPage.locator('form [role="alert"]')).toContainText('reset link is invalid or has expired');
    await stranger.close();
  });

  test('a link asked for in one browser opens and works in another, once', async ({ page, browser }) => {
    const email = await signUpAndConfirm(page, 'other-browser');
    await signOutFromSettings(page);
    await page.goto('/login?reset=1');
    await requestReset(page, email);
    const link = await recoveryLinkFor(email);

    // The "phone": a separate browser context with none of the laptop's cookies, so none of the request's PKCE state.
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const phonePage = await phone.newPage();
    await phonePage.goto(link);
    await expect(phonePage).toHaveURL(/\/auth\/reset$/);
    await expect(phonePage.getByRole('heading', { name: 'Set a new password' })).toBeVisible();
    await phonePage.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
    await phonePage.getByLabel('Confirm new password').fill(NEW_PASSWORD);
    await phonePage.getByRole('button', { name: 'Set new password' }).click();
    await expect(phonePage).toHaveURL(/\/$/);
    await expectHomeLoaded(phonePage);
    await phone.close();

    // The laptop never held a session; the new password signs in there, and the link is now used up.
    await page.goto('/login');
    await submitCredentials(page, email, NEW_PASSWORD, 'Sign in');
    await expect(page).toHaveURL(/\/$/);
    const again = await browser.newContext();
    const againPage = await again.newPage();
    await againPage.goto(link);
    await expect(againPage).toHaveURL(/\/login\?error=reset$/);
    await expect(againPage.locator('form [role="alert"]')).toContainText('reset link is invalid or has expired');
    await again.close();
  });

  test('an address with no account gets the same answer and no email', async ({ page }) => {
    const nobody = uniqueEmail('nobody');
    await page.goto('/login?reset=1');
    await requestReset(page, nobody);
    await expect(page.locator('form [role="alert"]')).toHaveCount(0);
    // Give a message time to arrive if one were going to.
    await page.waitForTimeout(2_000);
    expect(await messageCountFor(nobody)).toBe(0);
  });

  test('an address with an account gets the identical answer, and an email', async ({ page }) => {
    const email = await signUpAndConfirm(page, 'known');
    await signOutFromSettings(page);
    await page.goto('/login?reset=1');
    await requestReset(page, email);
    await expect(page.locator('form [role="alert"]')).toHaveCount(0);
    await recoveryLinkFor(email);
  });

  test('the new-password page needs a session, and a bad or missing link goes back to /login', async ({ page }) => {
    await page.goto('/auth/reset');
    await expect(page).toHaveURL(/\/login$/);

    for (const path of [
      '/auth/callback/reset',
      '/auth/callback/reset?code=not-a-real-code',
      '/auth/callback/reset?token_hash=not-a-real-token&type=recovery',
      '/auth/callback/reset?token_hash=not-a-real-token&type=signup',
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?error=reset$/);
      await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
      await expect(page.locator('form [role="alert"]')).toContainText('reset link is invalid or has expired');
    }
  });
});
