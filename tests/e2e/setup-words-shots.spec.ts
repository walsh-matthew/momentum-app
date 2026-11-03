// Screenshots of MOM-167's screens, for the owner to read before the commit: the playback with the new short titles, the playback after a
// change is applied (closed, "Yes, that is right" as the main answer), what the person sees while their request is cut off by an app switch
// and sent again, the "Your setup is saved" card (Go to Home first, Log an entry second) and Home after it (Log an entry as the main button,
// Add to your goals under it). They run only when MOM167_SHOT_DIR names a folder (outside the repo); E2E_COLOR_SCHEME=dark gives the dark
// set. Each width (390 and 1280) saves six pictures. The "after a change" picture asks the fake model to repeat its last turn (/__fake/repeat), because
// the script has no second playback to give; it is the screen a real reply produces.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { CHANGE_PROMPT, MEANING_LINK, MEANING_TEXT, PROPOSAL_YES_TEXT, TYPE_INSTEAD } from '@/lib/setup/session';
import { WIDTHS, expect, signUpAndConfirm, test } from './fixtures';
import { FAKE_MODEL_PORT } from './support/localStack';
import { e2eCase } from './support/setupConversation';

const SHOTS = process.env.MOM167_SHOT_DIR;
const THEME = process.env.E2E_COLOR_SCHEME === 'dark' ? 'dark' : 'light';
const CARD = 'h2#setup-question, h2#setup-playback, h2#setup-final, h2#setup-retry, h2#setup-quick-path';

const cardOf = (page: Page): Locator => page.locator(CARD).first();
const headingOf = async (page: Page): Promise<string> => ((await cardOf(page).textContent()) ?? '').trim();
const fakeControl = async (path: string): Promise<void> => {
  await fetch(`http://127.0.0.1:${FAKE_MODEL_PORT}${path}`, { method: 'POST' });
};

// The next card after `previous`, getting past the spacing limit's "wait" by tapping Try again, as the person would.
async function nextCard(page: Page, previous: string | null): Promise<{ id: string; heading: string }> {
  const waitAlert = page.locator('[data-retry-cause="wait"]');
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
    return { id: (await cardOf(page).getAttribute('id')) ?? '', heading: await headingOf(page) };
  }
  throw new Error('The setup kept asking to wait.');
}

// Answers the card on screen the way the scripted person does.
async function answer(page: Page, card: { id: string }, line: string): Promise<void> {
  if (card.id === 'setup-playback') {
    await page.getByRole('button', { name: 'Yes, that is right' }).click();
    return;
  }
  const yes = page.getByRole('button', { name: 'Yes', exact: true });
  if (line === MEANING_TEXT) {
    await page.getByRole('button', { name: MEANING_LINK }).click();
  } else if (line === PROPOSAL_YES_TEXT && (await yes.count()) > 0) {
    await yes.click();
  } else {
    if ((await page.getByLabel('Your answer').count()) === 0) await page.getByRole('button', { name: TYPE_INSTEAD }).click();
    await page.getByLabel('Your answer').fill(line);
    await page.getByRole('button', { name: 'Send' }).click();
  }
}

for (const [label, width] of Object.entries(WIDTHS)) {
  test.describe(`${THEME} theme at ${width}px (${label})`, () => {
    test.skip(!SHOTS, 'screenshots are taken only when MOM167_SHOT_DIR is set');
    test.use({ viewport: { width, height: 900 } });

    const shot = async (page: Page, n: number, name: string) => {
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: join(SHOTS!, `${n}-${name}-${THEME}-${width}.png`), fullPage: true });
    };

    // Drives the scripted conversation to the playback of what will be counted (the card with the short titles), taking pictures there when
    // asked, and on to the saved card and home when `toTheEnd` is set.
    async function drive(page: Page, name: string, onTargets: ((page: Page) => Promise<void>) | null, toTheEnd: boolean) {
      const scripted = e2eCase();
      await signUpAndConfirm(page, `words-shots-${name}-${THEME}-${width}`);
      await page.goto('/setup');
      await page.getByRole('button', { name: 'Start' }).click();
      let card = await nextCard(page, null);
      for (const person of scripted.person) {
        await expect(page.locator(CARD)).toHaveCount(1);
        if (onTargets && card.id === 'setup-playback' && /what you'll count/i.test(card.heading)) {
          await onTargets(page);
          return;
        }
        await answer(page, card, person.say);
        card = await nextCard(page, card.heading);
      }
      expect(card.id).toBe('setup-final');
      if (!toTheEnd) return;
      await page.getByRole('button', { name: 'Save my setup' }).click();
      await expect(page.getByRole('heading', { name: 'Your setup is saved' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Go to Home' })).toHaveAttribute('data-tone', 'main');
      await expect(page.getByRole('link', { name: 'Log an entry' })).toHaveAttribute('data-tone', 'second');
      await shot(page, 4, 'setup-saved');
      await page.getByRole('link', { name: 'Go to Home' }).click();
      await expect(page.getByRole('navigation', { name: 'Home actions' })).toBeVisible();
      await shot(page, 5, 'home');
    }

    test('the playback with the new titles, and the playback after a change', async ({ page }) => {
      test.setTimeout(240_000);
      mkdirSync(SHOTS!, { recursive: true });
      try {
        await drive(page, 'playback', async (p) => {
          await shot(p, 1, 'playback-new-titles');
          // Change something: the box opens, a change is sent, and the part comes back (the fake answers with the same playback).
          await p.getByRole('button', { name: 'Change something' }).click();
          await p.getByLabel(CHANGE_PROMPT).fill('Make it three a week instead');
          await shot(p, 2, 'playback-change-box');
          await fakeControl('/__fake/repeat?count=1');
          await p.waitForTimeout(1200);
          await p.getByRole('button', { name: 'Send the change' }).click();
          await expect(p.getByRole('button', { name: 'Yes, that is right' })).toBeVisible({ timeout: 30_000 });
          await expect(p.getByLabel(CHANGE_PROMPT)).toHaveCount(0);
          await expect(p.getByRole('button', { name: 'Keep it as it is' })).toHaveCount(0);
          await shot(p, 3, 'playback-after-change');
        }, false);
      } finally {
        await fakeControl('/__fake/repeat?count=0');
      }
    });

    // MOM-167 parts 8, 9 and 11 (Block 1.3): the "Your days and weeks" playback (the time zone as a plain name) and the tone question
    // (its detail line runs gentle to direct). The scripted person is in America/Denver, so the line reads "You're on Mountain Time.".
    test('the days and weeks playback and the tone question', async ({ page }) => {
      test.setTimeout(240_000);
      mkdirSync(SHOTS!, { recursive: true });
      const scripted = e2eCase();
      await signUpAndConfirm(page, `words-shots-days-${THEME}-${width}`);
      await page.goto('/setup');
      await page.getByRole('button', { name: 'Start' }).click();
      let card = await nextCard(page, null);
      let sawDays = false;
      let sawTone = false;
      for (const person of scripted.person) {
        await expect(page.locator(CARD)).toHaveCount(1);
        if (card.id === 'setup-playback' && /days and weeks/i.test(card.heading)) {
          await expect(page.getByText("You're on Mountain Time.")).toBeVisible();
          await expect(page.getByText(/time zone\.$/)).toHaveCount(0);
          await shot(page, 7, 'playback-days-and-weeks');
          sawDays = true;
        }
        if (card.id === 'setup-question' && (await page.getByText('Anywhere from gentle to direct. Momentum talks to you that way.').count()) > 0) {
          await shot(page, 8, 'tone-question');
          sawTone = true;
        }
        if (sawDays && sawTone) return;
        await answer(page, card, person.say);
        card = await nextCard(page, card.heading);
      }
      expect({ sawDays, sawTone }).toEqual({ sawDays: true, sawTone: true });
    });

    test('the saved card and home', async ({ page }) => {
      test.setTimeout(240_000);
      mkdirSync(SHOTS!, { recursive: true });
      await drive(page, 'saved', null, true);
    });

    // What the person sees while a request is cut off by an app switch and sent again: their question, their answer and "Thinking…",
    // with no error card.
    test('the screen while a cut-off request is sent again', async ({ page }) => {
      test.setTimeout(120_000);
      mkdirSync(SHOTS!, { recursive: true });
      const scripted = e2eCase();
      await signUpAndConfirm(page, `words-shots-switch-${THEME}-${width}`);
      await page.goto('/setup');
      await page.getByRole('button', { name: 'Start' }).click();
      await expect(page.getByRole('heading', { name: scripted.script[0].question ?? '' })).toBeVisible();

      let cutOff = 0;
      let release!: () => void;
      const away = new Promise<void>((resolve) => (release = resolve));
      await page.route('**/setup', async (route) => {
        const isTurn = route.request().method() === 'POST' && route.request().headers()['next-action'] !== undefined;
        if (isTurn && cutOff === 0) {
          cutOff += 1;
          await away;
          await route.abort('failed');
        } else {
          await route.continue();
        }
      });
      try {
        await fakeControl('/__fake/slow?ms=3000');
        await page.waitForTimeout(1200);
        await page.getByLabel('Your answer').fill(scripted.person[0].say);
        await page.getByRole('button', { name: 'Send' }).click();
        await expect(page.getByRole('status')).toHaveText('Thinking…');
        await page.evaluate(() => {
          Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
          document.dispatchEvent(new Event('visibilitychange'));
          Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
          document.dispatchEvent(new Event('visibilitychange'));
        });
        // The screen on return, while the request is sent again: the same as while it waited.
        await shot(page, 6, 'back-from-another-app');
        release();
        await expect(page.getByRole('heading', { name: scripted.script[1].question ?? '' })).toBeVisible({ timeout: 30_000 });
      } finally {
        release();
        await fakeControl('/__fake/slow?ms=0');
        await page.unroute('**/setup');
      }
    });
  });
}

