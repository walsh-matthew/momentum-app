// Sign-up, confirmation, route guards, sign-out and sign-in through the normal forms against the local stack
// (MOM-61). The confirmation link comes from the local Mailpit inbox. No account is made through the auth admin API
// (it returns 500 here; see BACKLOG.md).

import {
  PASSWORD,
  WIDTHS,
  confirmationLinkFor,
  expect,
  expectCheckYourEmail,
  expectHomeLoaded,
  messageCountFor,
  openCreateAccount,
  signUpAndConfirm,
  submitCredentials,
  test,
  uniqueEmail,
} from './fixtures';

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
    await expectCheckYourEmail(page, email);

    // Not signed in yet: the account is unconfirmed, so signing in is refused and the guard still holds.
    await page.goto('/login');
    await submitCredentials(page, email, PASSWORD, 'Sign in');
    await expect(page.locator('form [role="alert"]')).toBeVisible();
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);

    // Follow the link from the Mailpit inbox, in the same browser: lands signed in on the home page.
    await page.goto(await confirmationLinkFor(email));
    await expect(page).toHaveURL(/\/$/);
    await expectHomeLoaded(page);
    // A new account starts empty (migration 010): no goals, so home offers setup (MOM-143) in place of the old "No goals yet" card.
    await expect(page.getByRole('heading', { name: 'Set up your goals' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No goals yet' })).toHaveCount(0);

    // The other protected pages open now.
    await page.goto('/connections');
    await expect(page.getByRole('heading', { name: 'Connected apps' })).toBeVisible();
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByRole('main').getByText(`Signed in as ${email}`)).toBeVisible();

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
    await expectHomeLoaded(page);
  });

  test('the sidebar and the mobile header show who is signed in (MOM-64)', async ({ page }) => {
    const email = await signUpAndConfirm(page, 'who');

    // Desktop: the sidebar names the account on the home page and on the other pages.
    await expect(page.getByRole('complementary', { name: 'Workspace' }).getByText(email)).toBeVisible();
    await page.goto('/connections');
    await expect(page.getByRole('complementary', { name: 'Workspace' }).getByText(email)).toBeVisible();

    // Phone width: the sticky header names the account and signs out.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    // By class, not by role: the header sits inside a <section>, so a browser does not expose it as a banner.
    const header = page.locator('header.mobile-header');
    await expect(header.getByText(`Signed in as ${email}`)).toBeVisible();
    await header.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('a wrong password is refused with a message and stays on /login', async ({ page }) => {
    const email = uniqueEmail('wrong');
    await page.goto('/login');
    await submitCredentials(page, email, PASSWORD, 'Create account');
    await expectCheckYourEmail(page, email);
    await page.goto(await confirmationLinkFor(email));
    await page.goto('/settings');
    await page.getByRole('main').getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await submitCredentials(page, email, 'not-the-password-1', 'Sign in');
    await expect(page.locator('form [role="alert"]')).toHaveText(/invalid login credentials/i);
    await expect(page).toHaveURL(/\/login$/);
  });
});

// Creating an account has its own screen and its own "Check your email" state (MOM-150).
for (const [name, width] of Object.entries(WIDTHS)) {
  test.describe(`creating an account at ${width}px (${name})`, () => {
    test.use({ viewport: { width, height: width === WIDTHS.phone ? 844 : 900 } });

    test('sign-in leads to a create-account screen; an empty form gets the plain callout; the check-your-email state names the address', async ({
      page,
    }) => {
      await page.goto('/login');
      await expect(page.getByRole('heading', { name: 'Sign in to Momentum' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Create account' })).toHaveCount(0);

      await openCreateAccount(page);
      await expect(page).toHaveURL(/\/login\?signup=1$/);
      await expect(page.getByText("We'll email you a link to confirm your account.")).toBeVisible();

      // An empty form: the plain callout, nothing sent, and the browser's own bubble never appears (the form has no native validation).
      const create = page.getByRole('button', { name: 'Create account' });
      await create.click();
      // Scoped to the form: Next's route announcer is also an alert.
      const callout = page.locator('form [role="alert"]');
      await expect(callout).toHaveText('Enter your email address to continue.');
      await expect(page).toHaveURL(/\/login\?signup=1$/);
      await expect(page.locator('form')).toHaveAttribute('novalidate', '');
      await expect(create).toBeEnabled();

      // A short password is named, too.
      const email = uniqueEmail('signup');
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Password').fill('abc123');
      await create.click();
      await expect(callout).toHaveText('Your password needs at least 8 characters.');

      // A good one: the check-your-email state, with the address and no "then sign in".
      await page.getByLabel('Password').fill(PASSWORD);
      await create.click();
      await expectCheckYourEmail(page, email);
      await expect(page.getByText('Open the email and tap the link. It confirms your account and signs you in.')).toBeVisible();
      await expect(page.getByText(/then sign in/i)).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Check your email' })).toBeFocused();

      // "Start again" is a way back to an empty form.
      await page.getByRole('button', { name: 'Start again' }).click();
      await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
      await expect(page.getByLabel('Email')).toHaveValue('');
    });
  });
}

test.describe('what the check-your-email words promise (MOM-150)', () => {
  test('the confirm link signs the person in, and signing up again with the same unconfirmed address sends a new link', async ({ page }) => {
    const email = uniqueEmail('promise');
    await page.goto('/login');
    await submitCredentials(page, email, PASSWORD, 'Create account');
    await expectCheckYourEmail(page, email);
    const first = await confirmationLinkFor(email);
    expect(await messageCountFor(email)).toBe(1);

    // "Go back and create the account again with the same address, and we'll send a new link." Supabase sends at most one email per
    // address in its max_frequency window (1s on the local stack, supabase/config.toml), which is what "after a few minutes" allows for.
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Start again' }).click();
    await submitCredentials(page, email, PASSWORD, 'Create account');
    await expectCheckYourEmail(page, email);
    await expect.poll(() => messageCountFor(email), { timeout: 30_000 }).toBe(2);
    let second = first;
    const deadline = Date.now() + 30_000;
    while (second === first && Date.now() < deadline) {
      second = await confirmationLinkFor(email);
      if (second === first) await new Promise((r) => setTimeout(r, 500));
    }
    expect(second, 'the second email carries a new link').not.toBe(first);

    // "It confirms your account and signs you in": the link lands signed in, with no sign-in step.
    await page.goto(second);
    await expect(page).toHaveURL(/\/$/);
    await expectHomeLoaded(page);
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole('main').getByText(`Signed in as ${email}`)).toBeVisible();
  });
});
