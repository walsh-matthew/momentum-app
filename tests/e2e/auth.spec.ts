// Sign-up, confirmation, route guards, sign-out and sign-in through the normal forms against the local stack
// (MOM-61). The confirmation link comes from the local Mailpit inbox. No account is made through the auth admin API
// (it returns 500 here; see BACKLOG.md).

import { PASSWORD, confirmationLinkFor, expect, submitCredentials, test, uniqueEmail } from './fixtures';

test.use({ viewport: { width: 1280, height: 900 } });

const PROTECTED = ['/', '/connections', '/settings'];

test.describe('route guards', () => {
  for (const path of PROTECTED) {
    test(`${path} sends a signed-out visitor to /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole('heading', { name: 'Sign in to Momentum' })).toBeVisible();
    });
  }

  test('/login itself is reachable signed out', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('the account lifecycle', () => {
  test('sign up, confirm by email, sign out, sign in again', async ({ page }) => {
    const email = uniqueEmail('auth');

    // Sign up through the normal form.
    await page.goto('/login');
    await submitCredentials(page, email, PASSWORD, 'Create account');
    await expect(page.getByRole('status')).toHaveText('Check your email for a confirmation link, then sign in.');

    // Not signed in yet: the account is unconfirmed, so signing in is refused and the guard still holds.
    await submitCredentials(page, email, PASSWORD, 'Sign in');
    await expect(page.locator('form [role="alert"]')).toBeVisible();
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);

    // Follow the link from the Mailpit inbox, in the same browser: lands signed in on the home page.
    await page.goto(await confirmationLinkFor(email));
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Make today count.' })).toBeVisible();
    // A new account starts empty (migration 010): no goals, and the wizard call to action.
    await expect(page.getByRole('heading', { name: 'No goals yet' })).toBeVisible();

    // The other protected pages open now.
    await page.goto('/connections');
    await expect(page.getByRole('heading', { name: 'Connected apps' })).toBeVisible();
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();

    // Sign out from Settings: back to /login, and the guard holds again.
    await page.getByRole('main').getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    for (const path of PROTECTED) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }

    // Sign in again with the same credentials.
    await submitCredentials(page, email, PASSWORD, 'Sign in');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Make today count.' })).toBeVisible();
  });

  test('a wrong password is refused with a message and stays on /login', async ({ page }) => {
    const email = uniqueEmail('wrong');
    await page.goto('/login');
    await submitCredentials(page, email, PASSWORD, 'Create account');
    await expect(page.getByRole('status')).toBeVisible();
    await page.goto(await confirmationLinkFor(email));
    await page.goto('/settings');
    await page.getByRole('main').getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await submitCredentials(page, email, 'not-the-password-1', 'Sign in');
    await expect(page.locator('form [role="alert"]')).toHaveText(/invalid login credentials/i);
    await expect(page).toHaveURL(/\/login$/);
  });
});
