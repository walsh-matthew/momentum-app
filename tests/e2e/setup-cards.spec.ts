// Every kind of guided setup card on a phone (MOM-111 round 2, findings 5 and the screenshot step): at 390px, nothing on any
// card sits past the screen's edge, element by element, with the date picker open on the date cards; and each kind of card
// is saved as a screenshot so the owner can look at it before the merge. The fake model of tests/e2e/support/fakeAnthropic.ts
// answers as Claude (no paid call, no key): run-i gives a question, a question with an option to tap, a date confirmation,
// starting ideas, the playbacks and the final card; run-a gives a date question. The stuck-reply card comes from replies the
// fake makes unusable, and the network card from a request the browser never lets out.
//
// Screenshots are written only when SETUP_SCREENSHOT_DIR names a folder (outside the repo); without it the checks still run.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { APPROVE_TEXT, CHANGE_ANSWER, MEANING_LINK, MEANING_TEXT, PICK_DATE, PICK_OTHER_DATE, PROPOSAL_YES_TEXT, TRY_AGAIN, TYPE_INSTEAD } from '@/lib/setup/session';
import { expect, signUpAndConfirm, test } from './fixtures';
import { FAKE_MODEL_PORT } from './support/localStack';
import { CARD, cardOf, elementsOffScreen, headingOf } from './support/setupCards';
import { dateQuestionCase, e2eCase } from './support/setupConversation';

const SHOTS = process.env.SETUP_SCREENSHOT_DIR;
const ORDER = ['question', 'question-with-options', 'date-question', 'date-confirmation', 'ideas', 'playback', 'final', 'stuck-error', 'network-error'] as const;
type CardKind = (typeof ORDER)[number];

const fakeControl = async (path: string): Promise<void> => {
  await fetch(`http://127.0.0.1:${FAKE_MODEL_PORT}${path}`, { method: 'POST' });
};

async function shot(page: Page, kind: CardKind, suffix = ''): Promise<void> {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  const n = String(ORDER.indexOf(kind) + 1).padStart(2, '0');
  await page.screenshot({ path: join(SHOTS, `${n}-${kind}${suffix}.png`), fullPage: true });
}

async function fits(page: Page, what: string): Promise<void> {
  expect(await elementsOffScreen(page), `${what}: nothing sits past the screen edge`).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), `${what}: no sideways scroll`).toBe(false);
}

async function kindOf(page: Page): Promise<CardKind> {
  if ((await page.locator('h2#setup-playback').count()) > 0) return 'playback';
  if ((await page.locator('h2#setup-final').count()) > 0) return 'final';
  if ((await page.getByRole('button', { name: PICK_OTHER_DATE }).count()) > 0) return 'date-confirmation';
  if ((await page.getByRole('button', { name: PICK_DATE, exact: true }).count()) > 0) return 'date-question';
  if ((await page.locator('ol [data-slot="answer-choice"]').count()) > 0) return 'ideas';
  if ((await page.locator('[data-slot="answer-choice"]').count()) > 0) return 'question-with-options';
  return 'question';
}

// The next card after the one with heading `previous`, getting past the spacing limit's "wait" as the person would.
async function nextCard(page: Page, previous: string | null): Promise<string> {
  const waitAlert = page.getByRole('alert').filter({ hasText: /wait a few seconds/ });
  for (let attempt = 0; attempt < 8; attempt++) {
    await expect(cardOf(page)).toBeVisible();
    if (previous !== null) {
      await expect.poll(async () => ((await waitAlert.count()) > 0 ? 'wait' : await headingOf(page)), { message: 'waiting for the next card' }).not.toBe(previous);
    }
    if ((await waitAlert.count()) > 0) {
      await page.waitForTimeout(1200);
      await page.getByRole('button', { name: TRY_AGAIN }).click();
      await expect(waitAlert).toBeHidden();
      continue;
    }
    return headingOf(page);
  }
  throw new Error('The setup kept asking to wait.');
}

// Answers the card on screen with the scripted person's line, the way a person would tap or type it.
async function answer(page: Page, line: string): Promise<void> {
  if ((await page.locator('h2#setup-playback').count()) > 0) {
    await page.getByRole('button', { name: 'Yes, that is right' }).click();
    return;
  }
  const yes = page.getByRole('button', { name: 'Yes', exact: true });
  if (line === MEANING_TEXT) await page.getByRole('button', { name: MEANING_LINK }).click();
  else if (line === PROPOSAL_YES_TEXT && (await yes.count()) > 0) await yes.click();
  else {
    if ((await page.getByLabel('Your answer').count()) === 0) await page.getByRole('button', { name: TYPE_INSTEAD }).click();
    await page.getByLabel('Your answer').fill(line);
    await page.getByRole('button', { name: 'Send' }).click();
  }
}

// On a date card, the picker opens in place and still fits the screen (finding 5).
async function withPickerOpen(page: Page, kind: CardKind): Promise<void> {
  await page.getByRole('button', { name: kind === 'date-confirmation' ? PICK_OTHER_DATE : PICK_DATE, exact: true }).click();
  await expect(page.locator('input[type="date"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await fits(page, `${kind} with the picker open`);
  await shot(page, kind, '-picker-open');
}

test.describe('at 390px (phone)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('every kind of setup card fits the screen, element by element, and is saved as a screenshot', async ({ page }) => {
    test.setTimeout(300_000);
    const scripted = e2eCase();
    await signUpAndConfirm(page, 'setup-cards');
    await page.goto('/setup');
    await page.getByRole('button', { name: 'Start' }).click();
    let heading = await nextCard(page, null);
    const seen = new Set<CardKind>();
    let stuckShown = false;
    let networkShown = false;

    try {
      for (const { say: line } of scripted.person) {
        await expect(page.locator(CARD)).toHaveCount(1);
        const kind = await kindOf(page);
        await fits(page, kind);
        if (!seen.has(kind)) {
          seen.add(kind);
          await shot(page, kind);
          if (kind === 'date-confirmation') await withPickerOpen(page, kind);
        }

        if (kind === 'question' && line !== MEANING_TEXT && seen.size >= 2 && !stuckShown) {
          // The stuck-reply card (findings 12 and 14): replies thrown away, so "Change my answer" leads. Each fake answer waits a
          // little, so the tries inside one turn are not refused by the one-second spacing limit.
          stuckShown = true;
          await fakeControl('/__fake/slow?ms=1100');
          await fakeControl('/__fake/unusable?count=3');
          await page.waitForTimeout(1200);
          await answer(page, line);
          await expect(page.locator('main').getByRole('alert')).toHaveText("I got stuck on that one. Could you say it another way?", { timeout: 30_000 });
          await expect(page.getByRole('button', { name: CHANGE_ANSWER })).toHaveAttribute('data-tone', 'main');
          await fits(page, 'stuck-error');
          await shot(page, 'stuck-error');
          await fakeControl('/__fake/unusable?count=0');
          await fakeControl('/__fake/slow?ms=0');
          // Finding 13: the answer comes back in the box, selected, ready to change.
          await page.getByRole('button', { name: CHANGE_ANSWER }).click();
          await expect(page.getByLabel('Your answer')).toHaveValue(line);
          await expect(page.getByLabel('Your answer')).toBeFocused();
          await page.waitForTimeout(1200);
        } else if (kind === 'question' && line !== MEANING_TEXT && stuckShown && !networkShown) {
          // The network card: the request never leaves the browser, so "Try again" leads and the answer is safe.
          networkShown = true;
          await page.route('**/setup', (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()));
          await answer(page, line);
          await expect(page.locator('main').getByRole('alert')).toHaveText("We couldn't reach Momentum just now. Your answer is safe.");
          await expect(page.getByRole('button', { name: TRY_AGAIN })).toHaveAttribute('data-tone', 'main');
          await fits(page, 'network-error');
          await shot(page, 'network-error');
          await page.unroute('**/setup');
          await page.waitForTimeout(1200);
          await page.getByRole('button', { name: TRY_AGAIN }).click();
          heading = await nextCard(page, heading);
          continue;
        }
        await answer(page, line);
        heading = await nextCard(page, heading);
      }
    } finally {
      await fakeControl('/__fake/unusable?count=0');
      await fakeControl('/__fake/slow?ms=0');
    }

    expect(await kindOf(page)).toBe('final');
    await fits(page, 'final');
    seen.add('final');
    await shot(page, 'final');
    expect([...seen].sort()).toEqual(['date-confirmation', 'final', 'ideas', 'playback', 'question', 'question-with-options'].sort());
    expect(stuckShown && networkShown).toBe(true);
    // The approval line is the person's own words, and the save is still a tap away: nothing is saved here.
    expect(APPROVE_TEXT).toBe('Yes, that is right.');
  });

  test('a date question: the picker in place, a small "Type it instead" link, and no second date field', async ({ page }) => {
    test.setTimeout(180_000);
    const scripted = dateQuestionCase();
    await signUpAndConfirm(page, 'setup-date-question');
    await page.goto('/setup');
    await page.getByRole('button', { name: 'Start' }).click();
    let heading = await nextCard(page, null);
    for (const { say: line } of scripted.person) {
      const kind = await kindOf(page);
      await fits(page, kind);
      if (kind === 'date-question') {
        await expect(page.getByRole('button', { name: PICK_DATE, exact: true })).toHaveAttribute('data-tone', 'main');
        await expect(page.getByRole('button', { name: TYPE_INSTEAD })).toBeVisible();
        await expect(page.locator('input[type="date"]')).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Use this date' })).toHaveCount(0);
        await shot(page, 'date-question');
        await withPickerOpen(page, kind);
        return;
      }
      await answer(page, line);
      heading = await nextCard(page, heading);
    }
    throw new Error('The date question never came.');
  });
});
