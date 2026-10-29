// Guided setup, end to end on the local stack (MOM-111): a throwaway account runs a whole scripted conversation through the
// real screen, server action, setup service, budget and database, with the FAKE model of tests/e2e/support/fakeAnthropic.ts
// answering as Claude (no paid call, no key). The person's lines come from the same eval case the fake replays, so the draft
// the model "fills" matches what the person "said". At 390px and 1280px it checks that:
// - nothing asks Claude until Start is tapped, and the device's date goes with the request as a suggestion;
// - one question is on screen at a time (and at 390px nothing scrolls sideways);
// - a part is played back and approved with a tap, and the conversation survives a reload in the same tab;
// - (MOM-111) "Keep it as it is" in the change box approves a part, "Not sure what I mean?" sends "What do you mean?", and the
//   answer box and both buttons sit inside the screen at each width;
// - (MOM-111 smoke-test round) at 390px nothing on any setup card scrolls sideways, no card shows a date as YYYY-MM-DD, a
//   reload opens straight on the question, and while a reply is slow, or after replies are thrown away, the question stays
//   on screen (finding 10);
// - nothing is saved before Save: the log page still has no targets at the final confirmation;
// - after Save the goal's targets are there to log against, the tab's copy is gone, and a second setup is refused.
// The scripted model is written for a fixed order, so the spec answers exactly the scripted lines. The spacing limit
// (a second between one person's calls) can answer "wait"; the spec taps Try again, as a person would.

import type { Locator, Page } from '@playwright/test';
import { MACHINE_DATE } from '@/lib/dates/casual';
import { runSetupEval } from '@/lib/setup/evals';
import { APPROVE_TEXT, CHANGE_PROMPT, KEEP_IT, MEANING_LINK, MEANING_TEXT, PROPOSAL_YES_TEXT, SETUP_STORAGE_PREFIX, TYPE_INSTEAD } from '@/lib/setup/session';
import { acceptsText } from '@/lib/setup/text';
import { WIDTHS, expect, signUpAndConfirm, test } from './fixtures';
import { FAKE_MODEL_PORT } from './support/localStack';
import { elementsOffScreen } from './support/setupCards';
import { e2eCase } from './support/setupConversation';
import { scriptedModel } from '../helpers/setupScript';

const CARD = 'h2#setup-question, h2#setup-playback, h2#setup-final, h2#setup-retry, h2#setup-quick-path';

interface FakeLast {
  setupRequests: number;
  lastSetupUserText: string;
}
const fakeLast = async (): Promise<FakeLast> => (await fetch(`http://127.0.0.1:${FAKE_MODEL_PORT}/__fake/last`)).json() as Promise<FakeLast>;
// Holds each fake answer back, or makes the next ones unusable (tests/e2e/support/fakeAnthropic.ts).
const fakeControl = async (path: string): Promise<void> => {
  await fetch(`http://127.0.0.1:${FAKE_MODEL_PORT}${path}`, { method: 'POST' });
};

// Nothing on a phone scrolls sideways, and no date shows as YYYY-MM-DD (MOM-111 findings 7 and 13).
async function cardIsReadable(page: Page, width: number): Promise<void> {
  if (width < 600) {
    const scrolls = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(scrolls, 'nothing scrolls sideways on a phone').toBe(false);
    // Every element on the card, not only the page (MOM-111 round 2, finding 5).
    expect(await elementsOffScreen(page), 'nothing on the card sits past the screen edge').toEqual([]);
  }
  const text = (await page.locator('main').textContent()) ?? '';
  expect(text, 'no date on screen as YYYY-MM-DD').not.toMatch(MACHINE_DATE);
}

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

// Visible, and inside the screen's width (at 390px nothing may sit off to the side).
async function inView(page: Page, locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  expect(box, 'the element has a box').not.toBeNull();
  if (box) expect(box.x + box.width, 'the element fits the screen width').toBeLessThanOrEqual(width + 1);
}
const headingOf = async (page: Page): Promise<string> => ((await cardOf(page).textContent()) ?? '').trim();

// The next card after `previous` (the heading of the one just answered): waits for a different heading, and gets past the
// spacing limit's "wait" by tapping Try again, as the person would. Since MOM-111 finding 10 the wait shows under the card
// being answered, which stays on screen, so a wait is an alert there rather than a card of its own.
async function nextCard(page: Page, previous: string | null): Promise<{ id: string; heading: string }> {
  const waitAlert = page.getByRole('alert').filter({ hasText: /wait a few seconds/ });
  for (let attempt = 0; attempt < 8; attempt++) {
    await expect(cardOf(page)).toBeVisible();
    if (previous !== null) {
      await expect
        .poll(async () => ((await waitAlert.count()) > 0 ? 'wait' : await headingOf(page)), { message: 'waiting for the next card' })
        .not.toBe(previous);
    }
    if ((await waitAlert.count()) > 0) {
      await page.waitForTimeout(1200);
      await page.getByRole('button', { name: 'Try again' }).click();
      await expect(waitAlert).toBeHidden();
      continue;
    }
    const id = (await cardOf(page).getAttribute('id')) ?? '';
    const heading = await headingOf(page);
    expect(id, 'no reply failed during the scripted conversation').not.toBe('setup-retry');
    return { id, heading };
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
      let keptAsIs = false;
      let askedMeaning = false;

      for (let k = 0; k < lines.length; k++) {
        // One question on screen, readable on a phone, with no machine date (MOM-111 findings 7 and 13).
        await expect(page.locator(CARD)).toHaveCount(1);
        await cardIsReadable(page, width);

        // A reload in the middle keeps the conversation in this tab, and opens straight on the card it was on (finding 10).
        if (k === 3 && !reloaded) {
          reloaded = true;
          expect(await storedCopies(page), 'the conversation is kept in this tab').toBe(1);
          const asked = (await fakeLast()).setupRequests;
          const before = card.heading;
          await page.reload();
          await expect(page.locator('h2#setup-question, h2#setup-playback, h2#setup-final')).toHaveCount(1);
          await expect(page.getByRole('heading', { name: 'You have a setup in progress' })).toHaveCount(0);
          expect(await headingOf(page), 'the reload opens on the same card').toBe(before);
          expect((await fakeLast()).setupRequests, 'a reload asks Claude nothing').toBe(asked);
          card = { id: (await cardOf(page).getAttribute('id')) ?? '', heading: await headingOf(page) };
        }

        const line = lines[k].say;
        if (card.id === 'setup-playback') {
          // The Approve button sends its own sentence; the scripted person's "yes" must be an acceptance too.
          expect(acceptsText(line), 'the scripted person approves a playback').toBe(true);
          expect(acceptsText(APPROVE_TEXT)).toBe(true);
          if (!keptAsIs) {
            // The first playback: the person opens the change box, then decides nothing needs to change (MOM-111). The way out
            // is a real button beside "Send the change", and it approves the part in one tap.
            keptAsIs = true;
            await page.getByRole('button', { name: 'Change something' }).click();
            await expect(page.getByLabel(CHANGE_PROMPT)).toHaveAttribute('placeholder', 'Type your answer');
            await expect(page.getByRole('button', { name: 'Send the change' })).toBeVisible();
            await inView(page, page.getByRole('button', { name: KEEP_IT }));
            await page.getByRole('button', { name: KEEP_IT }).click();
          } else {
            await page.getByRole('button', { name: 'Yes, that is right' }).click();
          }
        } else {
          expect(card.id, `turn ${k} should be a question`).toBe('setup-question');
          // "Not sure what I mean?" is on every question, inside the screen's width.
          await inView(page, page.getByRole('button', { name: MEANING_LINK }));
          const yes = page.getByRole('button', { name: 'Yes', exact: true });
          if ((await page.getByLabel('Your answer').count()) > 0) {
            // A plain question: the answer box, Send and the help link, in that order.
            await inView(page, page.getByLabel('Your answer'));
            const boxY = (await page.getByLabel('Your answer').boundingBox())?.y ?? 0;
            const sendY = (await page.getByRole('button', { name: 'Send' }).boundingBox())?.y ?? 0;
            const helpY = (await page.getByRole('button', { name: MEANING_LINK }).boundingBox())?.y ?? 0;
            expect(boxY < sendY && sendY < helpY, 'box, then Send, then the help link').toBe(true);
          } else {
            // A proposal or a date question (MOM-111 round 2, findings 4, 8 and 9): Yes or "Pick a date" leads, and the box
            // opens from a small "Type it instead" link.
            await inView(page, page.getByRole('button', { name: TYPE_INSTEAD }));
          }
          if (line === MEANING_TEXT) {
            askedMeaning = true;
            await page.getByRole('button', { name: MEANING_LINK }).click();
          } else if (line === PROPOSAL_YES_TEXT && (await yes.count()) > 0) {
            await yes.click();
          } else {
            if ((await page.getByLabel('Your answer').count()) === 0) await page.getByRole('button', { name: TYPE_INSTEAD }).click();
            await page.getByLabel('Your answer').fill(line);
            await page.getByRole('button', { name: 'Send' }).click();
          }
        }
        card = await nextCard(page, card.heading);
      }

      expect(keptAsIs, 'a playback was approved with "Keep it as it is"').toBe(true);
      expect(askedMeaning, 'the person asked "What do you mean?" with its link').toBe(true);

      // The final confirmation: nothing is saved yet.
      expect(card.id).toBe('setup-final');
      await cardIsReadable(page, width);
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

    // MOM-111 finding 10, as reproduced on 2026-10-29: the screen never leaves the question while its answer waits. A slow
    // reply shows the answer and a thinking state under the question; thrown-away replies keep the question with Try again and
    // Change my answer; a reload while a reply is in flight (a phone dropping a background tab) opens on the question with the
    // answer still waiting, never on a screen in front of it.
    test('setup: the question stays on screen while a reply is slow, thrown away, or cut off by a reload', async ({ page }) => {
      test.setTimeout(120_000);
      const scripted = e2eCase();
      await signUpAndConfirm(page, `setup-slow-${width}`);
      await page.goto('/setup');
      await page.getByRole('button', { name: 'Start' }).click();
      const first = scripted.script[0].question ?? '';
      const question = page.getByRole('heading', { name: first });
      await expect(question).toBeVisible();
      try {
        // Slow: the question, the answer just sent, and Thinking, the whole time. Each send waits out the spacing limit (a
        // second between one person's calls).
        const spaced = () => page.waitForTimeout(1200);
        await fakeControl('/__fake/slow?ms=2500');
        await spaced();
        await page.getByLabel('Your answer').fill(scripted.person[0].say);
        await page.getByRole('button', { name: 'Send' }).click();
        await expect(page.getByRole('status')).toHaveText('Thinking…');
        for (let i = 0; i < 5; i++) {
          await expect(question).toBeVisible();
          await expect(page.getByText(scripted.person[0].say, { exact: true })).toBeVisible();
          await page.waitForTimeout(300);
        }
        expect((await nextCard(page, first)).heading).toBe(scripted.script[1].question ?? '');

        // Thrown away three times: the question stays, with Try again and Change my answer.
        const second = page.getByRole('heading', { name: scripted.script[1].question ?? '' });
        await fakeControl('/__fake/slow?ms=0');
        await fakeControl('/__fake/unusable?count=3');
        await spaced();
        await page.getByLabel('Your answer').fill('First try at this');
        await page.getByRole('button', { name: 'Send' }).click();
        await expect(page.getByRole('alert')).toBeVisible();
        await expect(second).toBeVisible();
        await cardIsReadable(page, width);
        await page.getByRole('button', { name: 'Change my answer' }).click();
        await expect(page.getByLabel('Your answer')).toHaveValue('First try at this');

        // Cut off by a reload while the reply is in flight.
        await fakeControl('/__fake/slow?ms=4000');
        await spaced();
        await page.getByLabel('Your answer').fill(scripted.person[1].say);
        await page.getByRole('button', { name: 'Send' }).click();
        await page.waitForTimeout(800);
        await page.reload();
        await expect(second).toBeVisible();
        await expect(page.getByRole('heading', { name: 'You have a setup in progress' })).toHaveCount(0);
        await expect(page.getByText(scripted.person[1].say, { exact: true })).toBeVisible();
        await fakeControl('/__fake/slow?ms=0');
        await spaced();
        await page.getByRole('button', { name: 'Send it again' }).click();
        // The cut-off call may still count against the spacing limit, so a "wait" is answered as the person would.
        const next = await nextCard(page, scripted.script[1].question ?? '');
        expect(next.heading).toBe(scripted.script[2].question ?? '');
      } finally {
        await fakeControl('/__fake/slow?ms=0');
        await fakeControl('/__fake/unusable?count=0');
      }
    });
  });
}
