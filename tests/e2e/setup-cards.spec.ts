// Every kind of guided setup card on a phone (MOM-111 round 2, findings 5 and the screenshot step; round 3): at 390px,
// nothing on any card sits past the screen's edge, element by element, with the date picker tapped on the date cards; and
// each kind of card is saved as a screenshot so the owner can look at it before the merge. The fake model of
// tests/e2e/support/fakeAnthropic.ts answers as Claude (no paid call, no key): run-i gives a question, a question with an
// option to tap, a date confirmation, starting ideas, the playbacks and the final card; run-a gives a date question with
// nothing to suggest. The stuck-reply card comes from replies the fake makes unusable, the busy card from the fake's 429, and
// the network card from a request the browser never lets out.
//
// Round 3: "Pick a date" is the date field itself (finding 3), so its "-picker-open" screenshot is the card right after the
// tap, with the phone's own picker (outside the page) open over it; the help link reads "What does this mean?" (finding 4);
// and every error card has one button (finding 6).
//
// Screenshots are written only when SETUP_SCREENSHOT_DIR names a folder (outside the repo); without it the checks still run.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import {
  APPROVE_TEXT,
  BUSY_MESSAGE,
  CHANGE_ANSWER,
  MEANING_LINK,
  MEANING_TEXT,
  PICK_DATE,
  PICK_OTHER_DATE,
  PROPOSAL_YES_TEXT,
  STUCK_MESSAGE,
  TRY_AGAIN,
  TYPE_INSTEAD,
  UNREACHABLE_MESSAGE,
  pickedDateText,
} from '@/lib/setup/session';
import { expect, signUpAndConfirm, test } from './fixtures';
import { FAKE_MODEL_PORT } from './support/localStack';
import { CARD, cardOf, elementsOffScreen, headingOf, sectionOf } from './support/setupCards';
import { dateQuestionCase, e2eCase } from './support/setupConversation';

const SHOTS = process.env.SETUP_SCREENSHOT_DIR;
const ORDER = ['question', 'question-with-options', 'date-question', 'date-confirmation', 'ideas', 'playback', 'final', 'stuck-error', 'network-error', 'busy-error'] as const;
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
  if ((await page.getByLabel(PICK_OTHER_DATE, { exact: true }).count()) > 0) return 'date-confirmation';
  if ((await page.getByLabel(PICK_DATE, { exact: true }).count()) > 0) return 'date-question';
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

// The error card's buttons: exactly the one named (finding 6).
async function onlyButton(page: Page, name: string): Promise<void> {
  const other = name === CHANGE_ANSWER ? TRY_AGAIN : CHANGE_ANSWER;
  await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('data-tone', 'main');
  await expect(page.getByRole('button', { name: other, exact: true })).toHaveCount(0);
}

// On a date card, "Pick a date" is the one date field (finding 3): tapping it opens the browser's own picker, outside the
// page, and adds nothing to the card. The screenshot is the card right after the tap.
async function withPickerTapped(page: Page, kind: CardKind): Promise<void> {
  const field = page.getByLabel(kind === 'date-confirmation' ? PICK_OTHER_DATE : PICK_DATE, { exact: true });
  const card = sectionOf(page);
  await expect(card.locator('input[type="date"]')).toHaveCount(1);
  await expect(card.locator('[data-picker="date"] input[type="date"]')).toHaveCount(1);
  const before = await card.locator('*').count();
  await field.click();
  await expect(field).toBeFocused();
  expect(await card.locator('*').count(), `${kind}: nothing opens in place`).toBe(before);
  await fits(page, `${kind} with the picker tapped`);
  await shot(page, kind, '-picker-open');
  await page.keyboard.press('Escape');
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
    let busyShown = false;

    try {
      for (const { say: line } of scripted.person) {
        await expect(page.locator(CARD)).toHaveCount(1);
        const kind = await kindOf(page);
        await fits(page, kind);
        if (!seen.has(kind)) {
          seen.add(kind);
          await shot(page, kind);
          if (kind === 'date-confirmation' || kind === 'date-question') await withPickerTapped(page, kind);
        }
        if (kind !== 'playback' && kind !== 'final') await expect(page.getByRole('button', { name: MEANING_LINK })).toHaveCount(1);

        if (kind === 'question' && line !== MEANING_TEXT && seen.size >= 2 && !stuckShown) {
          // The stuck-reply card: the replies were thrown away, so the answer could not be understood: only "Change my
          // answer". Each fake answer waits a little, so the tries inside one turn are not refused by the spacing limit.
          stuckShown = true;
          await fakeControl('/__fake/slow?ms=1100');
          await fakeControl('/__fake/unusable?count=3');
          await page.waitForTimeout(1200);
          await answer(page, line);
          await expect(page.locator('main').getByRole('alert')).toHaveText(STUCK_MESSAGE, { timeout: 30_000 });
          await onlyButton(page, CHANGE_ANSWER);
          await fits(page, 'stuck-error');
          await shot(page, 'stuck-error');
          await fakeControl('/__fake/unusable?count=0');
          await fakeControl('/__fake/slow?ms=0');
          // The answer comes back in the box, selected and focused, ready to change.
          await page.getByRole('button', { name: CHANGE_ANSWER }).click();
          await expect(page.getByLabel('Your answer')).toHaveValue(line);
          await expect(page.getByLabel('Your answer')).toBeFocused();
          await page.waitForTimeout(1200);
        } else if (kind === 'question' && line !== MEANING_TEXT && stuckShown && !networkShown) {
          // The network card: the request never leaves the browser, so only "Try again", and the answer is safe.
          networkShown = true;
          await page.route('**/setup', (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()));
          await answer(page, line);
          await expect(page.locator('main').getByRole('alert')).toHaveText(UNREACHABLE_MESSAGE);
          await onlyButton(page, TRY_AGAIN);
          await fits(page, 'network-error');
          await shot(page, 'network-error');
          await page.unroute('**/setup');
          await page.waitForTimeout(1200);
          await page.getByRole('button', { name: TRY_AGAIN }).click();
          heading = await nextCard(page, heading);
          continue;
        } else if (kind === 'question' && line !== MEANING_TEXT && networkShown && !busyShown) {
          // The busy card: Claude answered 429, a technical failure, so only "Try again".
          busyShown = true;
          await fakeControl('/__fake/busy?count=1');
          await page.waitForTimeout(1200);
          await answer(page, line);
          await expect(page.locator('main').getByRole('alert')).toHaveText(BUSY_MESSAGE, { timeout: 30_000 });
          await onlyButton(page, TRY_AGAIN);
          await fits(page, 'busy-error');
          await shot(page, 'busy-error');
          await fakeControl('/__fake/busy?count=0');
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
      await fakeControl('/__fake/busy?count=0');
    }

    expect(await kindOf(page)).toBe('final');
    await fits(page, 'final');
    seen.add('final');
    await shot(page, 'final');
    // Finding 5: the recap names what is counted, in whole sentences, never a title with nothing after it.
    const recap = await page.locator('section[aria-labelledby="setup-final"] li').allTextContents();
    expect(recap.some((l) => /^You'll count .+: .+\.$|^You'll count .+ each week\.$/.test(l)), recap.join(' | ')).toBe(true);
    expect(recap.every((l) => !/: \d+ things? you'll count\.$/.test(l))).toBe(true);
    expect([...seen].sort()).toEqual(['date-confirmation', 'final', 'ideas', 'playback', 'question', 'question-with-options'].sort());
    expect(stuckShown && networkShown && busyShown).toBe(true);
    // The approval line is the person's own words, and the save is still a tap away: nothing is saved here.
    expect(APPROVE_TEXT).toBe('Yes, that is right.');
  });

  test('a date question with nothing to suggest: one "Pick a date" that is the date field, and picking a date answers it', async ({ page }) => {
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
        // Finding 2: never an "exact date".
        await expect(sectionOf(page)).not.toContainText(/exact (date|day)/i);
        await expect(page.locator('[data-picker="date"]')).toHaveAttribute('data-tone', 'main');
        await expect(page.getByRole('button', { name: TYPE_INSTEAD })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Use this date' })).toHaveCount(0);
        await shot(page, 'date-question');
        await withPickerTapped(page, kind);
        // Choosing a date answers the question: it is sent as the person's answer ("Saturday, June 5, 2027"), which the card
        // shows the casual way under the question while it waits.
        expect(pickedDateText('2027-06-05')).toBe('Saturday, June 5, 2027');
        await page.getByLabel(PICK_DATE, { exact: true }).fill('2027-06-05');
        await expect(sectionOf(page).getByText('Saturday, Jun 5, 2027', { exact: true })).toBeVisible();
        return;
      }
      await answer(page, line);
      heading = await nextCard(page, heading);
    }
    throw new Error('The date question never came.');
  });
});
