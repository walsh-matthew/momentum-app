// Shared pieces for the browser specs (MOM-61): a `test` that fails on any hydration message, helpers to sign up
// through the normal form and confirm through the local Mailpit inbox, and the two viewport widths.
//
// Accounts are created by the sign-up form, never through the local auth admin API: that API returns 500 on this
// stack and leaves NULL token columns (BACKLOG.md, E2E item). Every account has a unique throwaway email, so specs
// never depend on each other or on leftovers from an earlier run.

import { expect, test as base, type Page } from '@playwright/test';
import { assertLocalUrl } from './support/localStack';

export const WIDTHS = { phone: 390, desktop: 1280 } as const;
export const PASSWORD = 'e2e-throwaway-password-1';

const HYDRATION = /hydrat/i;

// Every spec using this `test` collects the console and page errors and fails at the end if any of them mentions
// hydration, whether it is an error or a warning. A spec that wants to look at them reads `hydrationMessages`.
export const test = base.extend<{ hydrationMessages: string[] }>({
  hydrationMessages: [
    async ({ page }, use) => {
      const seen: string[] = [];
      page.on('console', (msg) => {
        if ((msg.type() === 'error' || msg.type() === 'warning') && HYDRATION.test(msg.text())) {
          seen.push(`console.${msg.type()}: ${msg.text().slice(0, 300)}`);
        }
      });
      page.on('pageerror', (err) => {
        if (HYDRATION.test(err.message)) seen.push(`pageerror: ${err.message.slice(0, 300)}`);
      });
      await use(seen);
      expect(seen, 'hydration messages in the browser console').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export const uniqueEmail = (label: string) =>
  `e2e-${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}@example.com`;

function mailpit(): string {
  return assertLocalUrl(process.env.E2E_MAILPIT_URL, 'E2E_MAILPIT_URL');
}

// The confirmation link in the newest message sent to `email`, read from the local Mailpit inbox. Polls, because
// the message arrives a moment after the sign-up returns.
export async function confirmationLinkFor(email: string): Promise<string> {
  const base = mailpit();
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const search = await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    if (search.ok) {
      const { messages } = (await search.json()) as { messages?: { ID: string }[] };
      if (messages && messages.length > 0) {
        const detail = await fetch(`${base}/api/v1/message/${messages[0].ID}`);
        const body = (await detail.json()) as { Text?: string; HTML?: string };
        const text = `${body.Text ?? ''}\n${body.HTML ?? ''}`.replace(/&amp;/g, '&');
        const link = /https?:\/\/[^\s"'<>]*\/auth\/v1\/verify[^\s"'<>]*/.exec(text)?.[0];
        if (link) return link;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No confirmation email for ${email} reached the local Mailpit inbox within 30 seconds.`);
}

// The password reset link in a message sent to `email`: the Auth server's verify link whose type is `recovery`. A
// message that is not a reset (the sign-up confirmation) has `type=signup`, so it is skipped. Polls like the above.
export async function recoveryLinkFor(email: string): Promise<string> {
  const base = mailpit();
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const search = await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    if (search.ok) {
      const { messages } = (await search.json()) as { messages?: { ID: string }[] };
      for (const { ID } of messages ?? []) {
        const detail = await fetch(`${base}/api/v1/message/${ID}`);
        const body = (await detail.json()) as { Text?: string; HTML?: string };
        const text = `${body.Text ?? ''}\n${body.HTML ?? ''}`.replace(/&amp;/g, '&');
        const link = text.match(/https?:\/\/[^\s"'<>]*\/auth\/v1\/verify[^\s"'<>]*/g)?.find((l) => /[?&]type=recovery/.test(l));
        if (link) return link;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No password reset email for ${email} reached the local Mailpit inbox within 30 seconds.`);
}

// How many messages the local Mailpit inbox holds for `email`.
export async function messageCountFor(email: string): Promise<number> {
  const search = await fetch(`${mailpit()}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
  const { messages } = (await search.json()) as { messages?: unknown[] };
  return messages?.length ?? 0;
}

// Fills the sign-in page's form and presses one of its two buttons.
export async function submitCredentials(page: Page, email: string, password: string, button: 'Sign in' | 'Create account') {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: button }).click();
}

// Signs up through the form, follows the emailed link in the same browser (the sign-up keeps its code verifier
// there) and lands signed in on the home page. Returns the email.
export async function signUpAndConfirm(page: Page, label: string): Promise<string> {
  const email = uniqueEmail(label);
  await page.goto('/login');
  await submitCredentials(page, email, PASSWORD, 'Create account');
  await expect(page.getByRole('status')).toHaveText('Check your email for a confirmation link, then sign in.');
  await page.goto(await confirmationLinkFor(email));
  await expect(page).toHaveURL(/\/$/);
  return email;
}
