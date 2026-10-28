// Guided setup, end to end on the local stack (MOM-111): a throwaway account runs a whole scripted conversation through the
// real screen, server action, setup service, budget and database, with the FAKE model of tests/e2e/support/fakeAnthropic.ts
// answering as Claude (no paid call, no key). The person's lines come from the same eval case the fake replays, so the draft
// the model "fills" matches what the person "said". At 390px and 1280px it checks that:
// - nothing asks Claude until Start is tapped, and the device's date goes with the request as a suggestion;
// - one question is on screen at a time (and at 390px nothing scrolls sideways);
// - a part is played back and approved with a tap, and the conversation survives a reload in the same tab;
// - nothing is saved before Save: the log page still has no targets at the final confirmation;
// - after Save the goal's targets are there to log against, the tab's copy is gone, and a second setup is refused.
// The scripted model is written for a fixed order, so the spec answers exactly the scripted lines. The spacing limit
// (a second between one person's calls) can answer "wait"; the spec taps Try again, as a person would.

import type { Locator, Page } from '@playwright/test';
import { runSetupEval } from '@/lib/setup/evals';
import { APPROVE_TEXT, SETUP_STORAGE_PREFIX } from '@/lib/setup/session';
import { acceptsText } from '@/lib/setup/text';
import { WIDTHS, expect, signUpAndConfirm, test } from './fixtures';
import { FAKE_MODEL_PORT } from './support/localStack';
import { e2eCase } from './support/setupConversation';
import { scriptedModel } from '../helpers/setupScript';

const CARD = 'h2#setup-question, h2#setup-playback, h2#setup-final, h2#setup-retry, h2#setup-quick-path';

interface FakeLast {
  setupRequests: number;
  lastSetupUserText: string;
}
const fakeLast = async (): Promise<FakeLast> => (await fetch(`http://127.0.0.1:${FAKE_MODEL_PORT}/__fake/last`)).json() as Promise<FakeLast>;

// The date on this machine as the app writes it (the browser's local date).
const localDate = (page: Page) =>
  page.evaluate(() => {
    const now = new Date();
    const two = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
  });

// Each card's heading carries the card's id, so the heading is what identifies the card on screen.
// How many copies of a setup in progress this tab holds (one per signed-in person who used it).
const storedCopies = (page: Page) =>
  page.evaluate((prefix) => Object.keys(window.sessionStorage).filter((k) => k.startsWith(prefix)).length, SETUP_STORAGE_PREFIX);

const cardOf = (page: Page): Locator => page.locator(CARD).first();
const headingOf = async (page: Page): Promise<string> => ((await cardOf(page).textContent()) ?? '').trim();

// The next card after `previous` (the heading of the one just answered): waits for a different heading, and gets past the
// spacing limit's "wait" by tapping Try again, as the person would.
async function nextCard(page: Page, previous: string | null): Promise<{ id: string; heading: string }> {
  for (let attempt = 0; attempt < 8; attempt++) {
    await expect(cardOf(page)).toBeVisible();
    await expect
      .poll(async () => (previous === null ? 'ready' : await headingOf(page)), { message: 'waiting for the next card' })
      .not.toBe(previous ?? '');
    const id = (await cardOf(page).getAttribute('id')) ?? '';
    const heading = await headingOf(page);
    if (id !== 'setup-retry') return { id, heading };
    const message = ((await page.locator('#setup-retry + p').textContent()) ?? '').trim();
    expect(message, 'a card that says the turn did not come through must be the spacing wait').toMatch(/wait a few seconds/);
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Try again' }).click();
    // The screen goes back to the previous card while Claude thinks; wait until the retry card is gone.
    await expect(page.locator('h2#setup-retry')).toBeHidden();
  }
  throw new Error('The setup kept asking to wait.');
}

for (const [name, width] of Object.entries(WIDTHS)) {
  test.describe(`at ${width}px (${name})`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('setup: a scripted conversation, approved part by part, saved once, and usable', async ({ page, context }) => {
      test.setTimeout(240_000);
      const scripted = e2eCase();
      const report = await runSetupEval(scripted, scriptedModel(scripted.script));
      expect(report.finished, 'the scripted case finishes').toBe(true);
      const targetTitles = report.draft.model.goals.flatMap((g) => g.targets.map((t) => t.title));
      expect(targetTitles.length).toBeGreaterThan(0);

      await signUpAndConfirm(page, `setup-${width}`);
      const before = (await fakeLast()).setupRequests;

      // The intro asks Claude nothing.
      await page.goto('/setup');
      await expect(page.getByRole('heading', { level: 1, name: 'Set up your goals' })).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect((await fakeLast()).setupRequests, 'opening the page must not ask Claude anything').toBe(before);

      await page.getByRole('button', { name: 'Start' }).click();
      let card = await nextCard(page, null);
      const lines = scripted.person;
      let reloaded = false;

      for (let k = 0; k < lines.length; k++) {
        // One question on screen, and (on a phone) no sideways scroll.
        await expect(page.locator(CARD)).toHaveCount(1);
        if (width < 600) {
          const scrolls = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
          expect(scrolls, 'nothing scrolls sideways on a phone').toBe(false);
        }

        // A reload in the middle keeps the conversation in this tab.
        if (k === 3 && !reloaded) {
          reloaded = true;
          expect(await storedCopies(page), 'the conversation is kept in this tab').toBe(1);
          const asked = (await fakeLast()).setupRequests;
          await page.reload();
          await expect(page.getByRole('heading', { name: 'You have a setup in progress' })).toBeVisible();
          expect((await fakeLast()).setupRequests, 'a reload asks Claude nothing').toBe(asked);
          await page.getByRole('button', { name: 'Continue' }).click();
          await expect(page.locator('h2#setup-question, h2#setup-playback, h2#setup-final')).toHaveCount(1);
          card = { id: (await cardOf(page).getAttribute('id')) ?? '', heading: await headingOf(page) };
        }

        const line = lines[k].say;
        if (card.id === 'setup-playback') {
          // The Approve button sends its own sentence; the scripted person's "yes" must be an acceptance too.
          expect(acceptsText(line), 'the scripted person approves a playback').toBe(true);
          expect(acceptsText(APPROVE_TEXT)).toBe(true);
          await page.getByRole('button', { name: 'Yes, that is right' }).click();
        } else {
          expect(card.id, `turn ${k} should be a question`).toBe('setup-question');
          await page.getByLabel('Your answer').fill(line);
          await page.getByRole('button', { name: 'Send' }).click();
        }
        card = await nextCard(page, card.heading);
      }

      // The final confirmation: nothing is saved yet.
      expect(card.id).toBe('setup-final');
      await expect(page.getByText('Nothing is saved until you tap Save.')).toBeVisible();
      const log = await context.newPage();
      await log.goto('/log');
      await expect(log.getByText(/No targets yet/)).toBeVisible();
      await log.close();

      // The suggested start date was the browser's own date, labelled as a suggestion.
      const last = await fakeLast();
      expect(last.lastSetupUserText).toContain(`Suggested start date (today's date on the person's device, a suggestion only): ${await localDate(page)}`);

      await page.getByRole('button', { name: 'Save my setup' }).click();
      await expect(page.getByRole('heading', { name: 'Your setup is saved' })).toBeVisible();
      expect(await storedCopies(page), "the tab's copy is cleared on save").toBe(0);

      // The targets are there to log against.
      await page.getByRole('link', { name: 'Log an entry' }).click();
      await expect(page).toHaveURL(/\/log$/);
      for (const title of targetTitles) await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();

      // First setup only.
      await page.goto('/setup');
      await expect(page.getByRole('heading', { name: 'Setup is already done' })).toBeVisible();
      await page.waitForLoadState('networkidle');
    });
  });
}
