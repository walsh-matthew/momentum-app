// MOM-179: the week questions of guided setup as cards code writes, walked by taps on a phone. The fake model of tests/e2e/support/
// fakeAnthropic.ts answers as Claude (no paid call, no key) with the scripted case `run-p-week-cards`: Claude asks the day end (its question
// goes out as a card), the kinds of days, and how much time each has (also a card); code writes the rest.
//
// What it holds the code to, at 390px:
// 1. Every week card has exactly one bold line, nothing past the screen edge, nothing pre-selected, no dimmed main button, and
//    "Type your answer" under it; the callouts name what is missing.
// 2. The order: day end, week start, [the kinds of days: Claude's], time for each kind, set days (three days for "at least 2"), when to
//    plan, then the planning part played back by code.
// 3. The count of Claude calls from the person's answer to "where do you track this" to the planning playback: three (the day end, the kinds
//    of days, and the time for each), where the same questions cost seven before this block.
//
// Screenshots are written only when SETUP_SCREENSHOT_DIR names a folder (outside the repo); without it the checks still run.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { PROPOSAL_YES_TEXT } from '@/lib/setup/session';
import { expect, signUpAndConfirm, test } from './fixtures';
import { answerCodeCard, codeCardOn } from './support/codeCards';
import { FAKE_MODEL_PORT } from './support/localStack';
import { elementsOffScreen } from './support/setupCards';
import { WEEK_CARDS_CASE } from '../setup-evals/cases';

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

// One bold line, nothing past the edge, no sideways scroll, no main button that is dimmed.
async function fits(page: Page, what: string): Promise<void> {
  expect(await elementsOffScreen(page), `${what}: nothing sits past the screen edge`).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), `${what}: no sideways scroll`).toBe(false);
  await expect(page.locator('[data-slot="card-lead"]'), `${what}: exactly one bold line`).toHaveCount(1);
  for (const main of await page.locator('[data-tone="main"]').all()) await expect(main, `${what}: no dimmed main button`).toBeEnabled();
  await expect(page.locator('[aria-pressed="true"]'), `${what}: nothing is pre-selected`).toHaveCount(0);
}

test.describe('the week cards at 390px', () => {
  test.use({ viewport: { width: 390, height: 900 }, timezoneId: PERSON_ZONE, colorScheme: 'light' });

  const shot = async (page: Page, name: string) => {
    if (!SHOTS) return;
    mkdirSync(SHOTS, { recursive: true });
    // The pointer is left where the last tap put it, which gives that control its hover fill; park it away and let the fade finish.
    await page.mouse.move(0, 0);
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
  };

  test('a scripted first setup, the week questions answered by taps', async ({ page }) => {
    test.setTimeout(240_000);
    await signUpAndConfirm(page, 'week-cards-390');
    await page.goto('/setup');
    await page.getByRole('button', { name: 'Start' }).click();
    let heading = await nextCard(page, null);

    let before: number | null = null;
    let during: number | null = null;
    const seen: string[] = [];

    for (const person of WEEK_CARDS_CASE.person) {
      await expect(page.locator(CARD)).toHaveCount(1);
      const code = await codeCardOn(page);

      if (code === 'week') {
        const topic = (await page.locator('[data-card="week"]').getAttribute('data-topic')) ?? '';
        seen.push(topic);
        await fits(page, `the ${topic} card`);
        await expect(page.getByRole('button', { name: 'Type your answer' }), `${topic}: a way to type`).toBeVisible();
        if (topic === 'day_end') {
          await expect(page.getByRole('heading', { name: 'When does your day end?' })).toBeVisible();
          await expect(page.getByText(/If your day ends after midnight and before 6 in the morning/)).toBeVisible();
          // The button is always there and answers nothing until tapped: a time alone sends nothing, and a tap with none shows the callout.
          await expect(page.getByRole('button', { name: 'Use this time', exact: true })).toBeEnabled();
          await shot(page, 'day-end');
        } else if (topic === 'week_start') {
          await expect(page.getByRole('heading', { name: 'Which day does your week start on?' })).toBeVisible();
        } else if (topic === 'capacity') {
          await expect(page.getByRole('heading', { name: 'Time you have for your goals' })).toBeVisible();
          await expect(page.locator('fieldset[data-day-type]')).toHaveCount(3);
          // Next is always there; a half-filled row is named in a callout.
          await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
          await page.locator('fieldset[data-day-type]').first().getByRole('textbox').fill('20');
          await page.getByRole('button', { name: 'Next', exact: true }).click();
          await expect(page.getByText('Choose minutes or hours for Busy days.')).toBeVisible();
          await shot(page, 'time-per-day-callout');
          await page.reload();
          await expect(page.getByRole('heading', { name: 'Time you have for your goals' })).toBeVisible();
          await shot(page, 'time-per-day');
        } else if (topic === 'slots_or_quota') {
          await expect(page.getByRole('heading', { name: 'Would you rather do runs on set days, or any day?' })).toBeVisible();
          await expect(page.getByRole('button', { name: "Any day, as long as the week's number is met" })).toBeVisible();
          await page.getByRole('button', { name: 'On set days', exact: true }).click();
          await expect(page.getByText('Pick a day.')).toBeVisible();
          await expect(page.getByRole('button', { name: 'Next', exact: true })).toHaveCount(0);
          // The chips are open and nothing is chosen (the "On set days" button itself shows it is open).
          await expect(page.locator('[role="group"] [aria-pressed="true"]')).toHaveCount(0);
          await shot(page, 'set-days-open');
          for (const day of ['Monday', 'Wednesday', 'Friday']) await page.getByRole('button', { name: day, exact: true }).click();
          await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
          await shot(page, 'set-days-three');
          await page.getByRole('button', { name: 'Next', exact: true }).click();
          heading = await nextCard(page, heading);
          continue;
        } else if (topic === 'planning_moment') {
          await expect(page.getByRole('heading', { name: 'When would you like to plan your week?' })).toBeVisible();
          await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
          await shot(page, 'planning-moment');
        }
        await answerCodeCard(page, 'week', person, PERSON_ZONE);
        heading = await nextCard(page, heading);
        continue;
      }

      if (code !== null) {
        // Since MOM-180 B2 the source question is a card code writes right after the time zone tap, so the count starts there; the person types the answer.
        if (code === 'step' && /Where do you track/.test(heading)) before = await requests();
        await answerCodeCard(page, code, person, PERSON_ZONE);
        heading = await nextCard(page, heading);
        continue;
      }

      if (/Where do you track/.test(heading)) before = await requests();
      if (/did I get this right/i.test(heading) && /days and weeks/i.test(heading)) {
        // The planning part, played back by code once the last planning answer was in.
        during = await requests();
        await expect(page.getByText(/Your kinds of days: Busy days \(20 minutes\), Usual days \(45 minutes\) and Easy days \(2 hours\)\./)).toBeVisible();
        // The set days the person chose are said back, one line for the target.
        await expect(page.getByText('Runs: on Monday, Wednesday and Friday.', { exact: true })).toBeVisible();
        await fits(page, 'the planning playback');
        await shot(page, 'planning-playback');
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

    // The final card carries them too.
    await expect(page.locator('#setup-final')).toBeVisible();
    await expect(page.locator('main')).toContainText('Monday, Wednesday and Friday');
    expect(seen, 'the order the week cards came in').toEqual(['day_end', 'week_start', 'capacity', 'slots_or_quota', 'planning_moment']);
    expect(before, 'the sources question was seen').not.toBeNull();
    expect(during, 'the planning playback was seen').not.toBeNull();
    // From the answer to "where do you track this" to the planning playback: the day end and the answer to the kinds of days (code asks that
    // question in fixed words since MOM-180 B3).
    const calls = (during as number) - (before as number);
    console.log(`CLAUDE_REQUESTS_STEP_10_WEEK_CARDS=${calls}`);
    expect(calls, "Claude's calls from the sources answer to the planning playback").toBe(2);
  });
});
