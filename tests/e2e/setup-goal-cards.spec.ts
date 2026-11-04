// MOM-180 B1: the goal questions of guided setup as cards code writes, walked by taps on a phone. The fake model of tests/e2e/support/fakeAnthropic.ts
// answers as Claude (no paid call, no key) with the scripted cases `run-q-goal-cards` and `run-r-deadline-90`.
//
// What it holds the code to, at 390px:
// 1. Every goal card has exactly one bold line, nothing past the screen edge, nothing pre-selected, no dimmed main button, and "Type your answer"
//    and "What does this mean?" under it; "What does this mean?" makes no call to Claude.
// 2. Only the first card of a run costs a Claude call (the question it replaces): the shape, the start date and the first stretch that follow a
//    tap come with no request at all.
// 3. "90 days" said at the start becomes "Done by <date>?" at the deadline question, counted from the start date; a deadline picked on the
//    start date is refused with one plain line, the same question, and no call to Claude.
// 4. The day end card (and the planning time) is a full-width "Pick a time" button that reads the time once it is picked.
//
// Screenshots are written only when SETUP_SCREENSHOT_DIR names a folder (outside the repo); without it the checks still run.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { dateInZone } from '@/lib/dates/casual';
import { AFTER_START_LINE } from '@/lib/setup/codeTurns';
import { PROPOSAL_YES_TEXT } from '@/lib/setup/session';
import { expect, signUpAndConfirm, test } from './fixtures';
import { answerCodeCard, askWhatItMeans, codeCardOn } from './support/codeCards';
import { FAKE_MODEL_PORT } from './support/localStack';
import { elementsOffScreen } from './support/setupCards';
import { scriptedPersonDay } from './support/setupConversation';
import { DEADLINE_90_CASE, GOAL_CARDS_CASE } from '../setup-evals/cases';

const SHOTS = process.env.SETUP_SCREENSHOT_DIR;
const CARD = 'h2#setup-question, h2#setup-playback, h2#setup-final, h2#setup-retry, h2#setup-quick-path';
const PERSON_ZONE = 'America/Denver';

const cardOf = (page: Page): Locator => page.locator(CARD).first();
const headingOf = async (page: Page): Promise<string> => ((await cardOf(page).textContent()) ?? '').trim();
const requests = async (): Promise<number> => ((await (await fetch(`http://127.0.0.1:${FAKE_MODEL_PORT}/__fake/last`)).json()) as { setupRequests: number }).setupRequests;

async function nextCard(page: Page, previous: string | null): Promise<string> {
  const wait = page.locator('[data-retry-cause="wait"]');
  for (let attempt = 0; attempt < 8; attempt++) {
    await expect(cardOf(page)).toBeVisible();
    if (previous !== null) await expect.poll(async () => ((await wait.count()) > 0 ? 'wait' : await headingOf(page)), { message: 'waiting for the next card' }).not.toBe(previous);
    if ((await wait.count()) > 0) {
      await page.waitForTimeout(1200);
      await page.getByRole('button', { name: 'Try again' }).click();
      await expect(wait).toBeHidden();
      continue;
    }
    return headingOf(page);
  }
  throw new Error('The setup kept asking to wait.');
}

// One bold line, nothing past the edge, no sideways scroll, no main button that is dimmed, nothing pre-selected.
async function fits(page: Page, what: string): Promise<void> {
  expect(await elementsOffScreen(page), `${what}: nothing sits past the screen edge`).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), `${what}: no sideways scroll`).toBe(false);
  await expect(page.locator('[data-slot="card-lead"]'), `${what}: exactly one bold line`).toHaveCount(1);
  for (const main of await page.locator('[data-tone="main"]').all()) await expect(main, `${what}: no dimmed main button`).toBeEnabled();
  await expect(page.locator('[aria-pressed="true"]'), `${what}: nothing is pre-selected`).toHaveCount(0);
}

const shotter = (page: Page) => async (name: string) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  // The pointer is left where the last tap put it, which gives that control its hover fill; park it away and let the fade finish.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
};

test.describe('the goal cards at 390px', () => {
  test.use({ viewport: { width: 390, height: 900 }, timezoneId: PERSON_ZONE, colorScheme: 'light' });

  test('a scripted first setup, the goal questions answered by taps: only the first card of a run costs a call', async ({ page }) => {
    test.setTimeout(300_000);
    const shot = shotter(page);
    await signUpAndConfirm(page, 'goal-cards-390');
    await page.goto('/setup');
    await page.getByRole('button', { name: 'Start' }).click();
    let heading = await nextCard(page, null);
    const seen: string[] = [];
    const askedWhen: Record<string, number> = {};
    let explained = false;

    for (const person of GOAL_CARDS_CASE.person) {
      await expect(page.locator(CARD)).toHaveCount(1);
      const code = await codeCardOn(page);

      // The start date is the date layout with Yes (QuestionCard), a goal card all the same: its words carry the mark the screen hides.
      if (code === null && /^Start .*today, /.test(heading)) {
        seen.push('start_date');
        askedWhen[`${seen.length}:start_date`] = await requests();
        await fits(page, 'the start date card');
        await expect(page.getByText('Your first week is planned from that day.')).toBeVisible();
        await expect(page.getByLabel('Pick a different date')).toBeVisible();
        await shot(seen.filter((t) => t === 'start_date').length === 1 ? 'start-date' : 'start-date-2');
      }
      if (code === 'goal') {
        const topic = (await page.locator('[data-card="goal"]').getAttribute('data-topic')) ?? '';
        seen.push(topic);
        askedWhen[`${seen.length}:${topic}`] = await requests();
        await fits(page, `the ${topic} card`);
        await expect(page.getByRole('button', { name: 'Type your answer' }), `${topic}: a way to type`).toBeVisible();
        if (!explained) {
          explained = true;
          // "What does this mean?" shows code's words in place, with no call to Claude.
          const before = await requests();
          await page.getByRole('button', { name: 'What does this mean?' }).click();
          await expect(page.locator('[data-slot="help-explain"]')).toBeVisible();
          expect(await requests(), '"What does this mean?" makes no call').toBe(before);
          await shot(`${topic}-explained`);
          await page.getByRole('button', { name: 'What does this mean?' }).click();
        }
        await shot(topic === 'shape' ? `shape-${seen.filter((t) => t === 'shape').length}` : topic);
        await answerCodeCard(page, 'goal', person, PERSON_ZONE);
        heading = await nextCard(page, heading);
        continue;
      }

      if (code === 'week') {
        const topic = (await page.locator('[data-card="week"]').getAttribute('data-topic')) ?? '';
        if (topic === 'day_end') {
          await fits(page, 'the day end card');
          // The time is a full-width answer button that says what it is, and the callout names what is missing when it is tapped with no time.
          const pick = page.locator('[data-picker="time"]');
          await expect(pick).toBeVisible();
          await expect(pick).toContainText('Pick a time');
          const box = await pick.boundingBox();
          expect((box?.width ?? 0) > 300, 'the time button is full width').toBe(true);
          await shot('day-end-before');
          await page.getByLabel('Time your day ends', { exact: true }).fill('21:00');
          await expect(pick).toContainText('9:00 PM');
          await fits(page, 'the day end card with a time');
          await shot('day-end-after');
          await page.getByRole('button', { name: 'Use this time', exact: true }).click();
          heading = await nextCard(page, heading);
          continue;
        }
        await answerCodeCard(page, 'week', person, PERSON_ZONE);
        heading = await nextCard(page, heading);
        continue;
      }

      if (code !== null) {
        await answerCodeCard(page, code, person, PERSON_ZONE);
        heading = await nextCard(page, heading);
        continue;
      }

      if (await page.getByRole('button', { name: 'Yes, that is right' }).count()) {
        await page.getByRole('button', { name: 'Yes, that is right' }).click();
      } else if (person.say === PROPOSAL_YES_TEXT && (await page.getByRole('button', { name: 'Yes', exact: true }).count()) > 0) {
        await page.getByRole('button', { name: 'Yes', exact: true }).click();
      } else {
        if ((await page.getByLabel('Your answer').count()) === 0) await page.getByRole('button', { name: /Type it instead/ }).click();
        await page.getByLabel('Your answer').fill(person.say);
        await page.getByRole('button', { name: 'Send' }).click();
      }
      heading = await nextCard(page, heading);
    }

    expect(seen, 'the order the goal cards came in').toEqual(['starting_point', 'shape', 'start_date', 'block_length', 'shape', 'start_date']);
    // The starting point is the one card Claude's question became (a call); each card after it came with no further request.
    const counts = Object.values(askedWhen);
    expect(counts.slice(1).every((n) => n === counts[0]), 'the cards after the first made no request').toBe(true);
    await expect(page.locator('#setup-final')).toBeVisible();
  });

  test('"90 days" becomes "Done by <date>?", and a deadline on the start date is refused with no call', async ({ page }) => {
    test.setTimeout(240_000);
    const shot = shotter(page);
    await signUpAndConfirm(page, 'deadline-90-390');
    await page.goto('/setup');
    await page.getByRole('button', { name: 'Start' }).click();
    let heading = await nextCard(page, null);
    for (const person of DEADLINE_90_CASE.person.slice(0, 6)) {
      const code = await codeCardOn(page);
      if (code !== null) {
        await answerCodeCard(page, code, person, PERSON_ZONE);
      } else if (await page.getByRole('button', { name: 'Yes, that is right' }).count()) {
        await page.getByRole('button', { name: 'Yes, that is right' }).click();
      } else {
        if ((await page.getByLabel('Your answer').count()) === 0) await page.getByRole('button', { name: /Type it instead/ }).click();
        await page.getByLabel('Your answer').fill(person.say);
        await page.getByRole('button', { name: 'Send' }).click();
      }
      heading = await nextCard(page, heading);
    }
    // The deadline question is Claude's; the date on it is code's, counted from the start date.
    const start = scriptedPersonDay();
    const end = new Date(Date.parse(`${start}T00:00:00Z`) + 90 * 86_400_000).toISOString().slice(0, 10);
    expect(heading).toMatch(/^Done by .+\?$/);
    await expect(page.getByRole('button', { name: 'Yes', exact: true })).toBeVisible();
    await expect(page.getByLabel('Pick a different date')).toBeVisible();
    const casual = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${end}T00:00:00Z`));
    expect(heading, 'the date is 90 days after the start day').toContain(casual);
    await fits(page, 'the Done by card');
    await shot('done-by-from-90-days');

    // Pick the start date as the deadline: refused with one line, the question again, and no request.
    const before = await requests();
    await page.getByLabel('Pick a different date').fill(start);
    await page.getByRole('button', { name: 'Use this date' }).click();
    await expect(page.getByText(AFTER_START_LINE)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Which day does it have to be done by?' })).toBeVisible();
    await expect(page.getByLabel('Pick a date', { exact: true })).toBeVisible();
    expect(await requests(), 'the refusal is code\'s: no call to Claude').toBe(before);
    expect(dateInZone(PERSON_ZONE)).toBeTruthy();
    await fits(page, 'the refusal');
    await shot('deadline-on-start-refused');
  });
});

// Used by the screenshots of the part: "What does this mean?" on a card of buttons needs no helper beyond the one in codeCards.
export { askWhatItMeans };
