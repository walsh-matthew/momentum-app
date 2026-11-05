// MOM-180 B2: steps 3, 7 and 9 of guided setup as cards code writes, and the time zone tap that makes no call, walked by taps on a phone. The fake model of
// tests/e2e/support/fakeAnthropic.ts answers as Claude (no paid call, no key) with the scripted cases `run-s-step-cards`, `run-t-level-hours`,
// `run-u-numbers-hours` and `run-v-metric`.
//
// What it holds the code to, at 390px:
// 1. Every step card has exactly one bold line, nothing past the screen edge, nothing pre-selected, no dimmed main button, and "Type your answer" and
//    "What does this mean?" under it.
// 2. "A few goals" is followed by code's own question for the names, "<goal> first" by the card for when the other comes back, "Something I do" by the number boxes,
//    and the time zone tap by the source card: none of them makes a request to Claude.
// 3. A refused answer (a day that is not after today, an empty least that counts, an aim below it) says why in the card, and nothing is sent.
// 4. A time counted in hours is asked in hours; "what I'm aiming for" asks only the least that counts; an app with more than one number asks which counts.
// 5. "Use this time" is the size of the other answer buttons.
//
// Screenshots are written only when SETUP_SCREENSHOT_DIR names a folder (outside the repo); without it the checks still run.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { STEP_WORDS } from '@/lib/setup/stepCards';
import { expect, signUpAndConfirm, test } from './fixtures';
import { answerCodeCard, askWhatItMeans, codeCardOn } from './support/codeCards';
import { FAKE_MODEL_PORT } from './support/localStack';
import { elementsOffScreen } from './support/setupCards';
import { LEVEL_HOURS_CASE, METRIC_CASE, NUMBERS_HOURS_CASE, STEP_CARDS_CASE } from '../setup-evals/cases';

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

// The step card on screen: its topic, after the usual checks.
async function stepTopic(page: Page): Promise<string> {
  return (await page.locator('[data-card="step"]').getAttribute('data-topic')) ?? '';
}

async function answerTyped(page: Page, say: string): Promise<void> {
  if ((await page.getByLabel('Your answer').count()) === 0) await page.getByRole('button', { name: /Type it instead|Type your answer/ }).first().click();
  await page.getByLabel('Your answer').fill(say);
  await page.getByRole('button', { name: 'Send' }).click();
}

async function start(page: Page, who: string): Promise<string> {
  await signUpAndConfirm(page, who);
  await page.goto('/setup');
  await page.getByRole('button', { name: 'Start' }).click();
  return nextCard(page, null);
}

test.describe('the step cards at 390px', () => {
  test.use({ viewport: { width: 390, height: 900 }, timezoneId: PERSON_ZONE, colorScheme: 'light' });

  test('steps 3, 7 and 9 as cards, and the time zone tap, walked by taps: the hand-offs make no request', async ({ page }) => {
    test.setTimeout(420_000);
    const shot = shotter(page);
    let heading = await start(page, 'step-cards-390');
    const seen: string[] = [];
    const askedAt: Record<string, number> = {};
    let explained = false;

    for (const person of STEP_CARDS_CASE.person) {
      await expect(page.locator(CARD)).toHaveCount(1);
      const code = await codeCardOn(page);

      if (code === 'step') {
        const topic = await stepTopic(page);
        seen.push(topic);
        askedAt[`${seen.length}:${topic}`] = await requests();
        await fits(page, `the ${topic} card`);
        await expect(page.getByRole('button', { name: 'Type your answer' }), `${topic}: a way to type`).toBeVisible();
        if (!explained) {
          explained = true;
          await askWhatItMeansInPlace(page);
          await shot(`${topic}-explained`);
          await page.getByRole('button', { name: 'What does this mean?' }).click();
        }

        if (topic === 'parked_return') {
          // Nothing is picked when the card opens, and "Use this date" is not there until a day is: a day that is not after today is refused in the card.
          await expect(page.getByRole('button', { name: 'Use this date' })).toHaveCount(0);
          await expect(page.getByRole('button', { name: STEP_WORDS.onlyWhenAsked, exact: true })).toBeVisible();
          await shot('return');
          const before = await requests();
          await page.locator('[data-picker="date"] input').fill('2020-01-01');
          await page.getByRole('button', { name: 'Use this date' }).click();
          await expect(page.getByText(STEP_WORDS.pickDayAfterToday)).toBeVisible();
          expect(await requests(), 'a refused day makes no call').toBe(before);
          await expect(page.getByRole('heading', { name: /^When should .* come back\?$/ })).toBeVisible();
          await fits(page, 'the return card after a refusal');
          await shot('return-refused');
        } else if (topic === 'floor') {
          // The two boxes, with nothing in them: Next names what is missing, and an aim below the least that counts is refused. Nothing is sent either time.
          await expect(page.locator('[data-field="floor"]')).toHaveValue('');
          await expect(page.locator('[data-field="aspiration"]')).toHaveValue('');
          await shot('floor-and-aspiration');
          const before = await requests();
          await page.getByRole('button', { name: 'Next', exact: true }).click();
          await expect(page.getByText('Add a number for the least that counts.')).toBeVisible();
          await page.locator('[data-field="floor"]').fill('4');
          await page.locator('[data-field="aspiration"]').fill('3');
          await page.getByRole('button', { name: 'Next', exact: true }).click();
          await expect(page.getByText(STEP_WORDS.aimBelowLeast)).toBeVisible();
          expect(await requests(), 'a refused answer makes no call').toBe(before);
          await shot('floor-and-aspiration-refused');
          await page.locator('[data-field="aspiration"]').fill('');
        } else {
          await shot(topic === 'source' ? 'source' : topic);
        }
        await answerCodeCard(page, 'step', person, PERSON_ZONE);
        heading = await nextCard(page, heading);
        continue;
      }

      if (code === 'week') {
        const topic = (await page.locator('[data-card="week"]').getAttribute('data-topic')) ?? '';
        if (topic === 'planning_moment') {
          await fits(page, 'the planning card');
          // "Use this time" is the size of the other answer buttons (the weekday buttons and "Pick a time").
          const sizes = await page.evaluate(() => {
            const px = (el: Element | null) => (el ? getComputedStyle(el).fontSize : null);
            const use = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Use this time' || b.textContent?.trim() === 'Next');
            return { use: px(use ?? null), day: px(document.querySelector('[data-slot="answer-choice"]')) };
          });
          expect(sizes.use, 'the main button is the size of the answer buttons').toBe(sizes.day);
          await shot('planning');
        }
        if (topic === 'day_end') {
          await fits(page, 'the day end card');
          const sizes = await page.evaluate(() => {
            const px = (el: Element | null) => (el ? getComputedStyle(el).fontSize : null);
            const use = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Use this time');
            return { use: px(use ?? null), pick: px(document.querySelector('[data-picker="time"]')) };
          });
          expect(sizes.use, '"Use this time" is the size of "Pick a time"').toBe(sizes.pick);
          await shot('day-end');
        }
        await answerCodeCard(page, 'week', person, PERSON_ZONE);
        heading = await nextCard(page, heading);
        continue;
      }

      if (code === 'zone') {
        const before = await requests();
        await answerCodeCard(page, 'zone', person, PERSON_ZONE);
        // The next step is the source card, which code writes: it is there at once, with no "Thinking" and no request.
        await expect(page.getByRole('heading', { name: /^Where do you track .* now, if anywhere\?$/ })).toBeVisible();
        await expect(page.getByText('Thinking…')).toHaveCount(0);
        expect(await requests(), 'the time zone tap makes no call').toBe(before);
        await fits(page, 'the source card after the time zone tap');
        await shot('source-after-zone');
        heading = await headingOf(page);
        continue;
      }

      if (code !== null) {
        await answerCodeCard(page, code, person, PERSON_ZONE);
        heading = await nextCard(page, heading);
        continue;
      }

      // Claude's own turns: a typed answer, a playback to approve, or a yes.
      if (heading === STEP_WORDS.namesQuestion) {
        // "A few goals" was followed by code's own question for the names: no request was made for it.
        expect(askedAt[`${seen.length}:breakup`], 'the names question came with no request').toBe(await requests());
        await fits(page, 'the names card');
        await shot('names');
      }
      if (await page.getByRole('button', { name: 'Yes, that is right' }).count()) {
        await page.getByRole('button', { name: 'Yes, that is right' }).click();
      } else {
        await answerTyped(page, person.say);
      }
      heading = await nextCard(page, heading);
    }

    expect(seen, 'the order the step cards came in').toEqual(['breakup', 'sequencing', 'parked_return', 'role', 'floor', 'source']);
    // Every card after the one Claude's question became came with no request: the goals' names, the way back, the number boxes and the source.
    const at = (key: string): number => askedAt[Object.keys(askedAt).find((k) => k.endsWith(`:${key}`)) ?? ''];
    expect(at('parked_return'), 'the way back came with no request after the sequencing tap').toBe(at('sequencing'));
    expect(at('floor'), 'the number boxes came with no request after the role tap').toBe(at('role'));
    await expect(page.locator('#setup-final')).toBeVisible();
  });

  test('which level a number is, for a time counted in hours: "aiming for" asks only the least that counts, in hours', async ({ page }) => {
    test.setTimeout(240_000);
    const shot = shotter(page);
    let heading = await start(page, 'level-hours-390');
    for (const person of LEVEL_HOURS_CASE.person.slice(0, 1)) {
      await answerTyped(page, person.say);
      heading = await nextCard(page, heading);
    }
    // Claude's question about the level goes out as the card, which quotes the number in its own words.
    expect(heading).toBe("Is 2 hours the least that counts, or what you're aiming for?");
    await fits(page, 'the level card');
    await expect(page.locator('[data-slot="question-detail"]')).toHaveCount(0);
    await shot('level');
    const before = await requests();
    await page.getByRole('button', { name: "What I'm aiming for", exact: true }).click();
    // Only the least that counts is asked, in hours; the number said is held in the tap and written with it.
    await expect(page.getByRole('heading', { name: 'In a hard week, how many hours of reading would still count?' })).toBeVisible();
    heading = await headingOf(page);
    expect(await requests(), 'the tap makes no call').toBe(before);
    await expect(page.locator('[data-field="aspiration"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Minutes', exact: true })).toHaveCount(0);
    await fits(page, 'the least that counts, in hours');
    await shot('level-aiming-floor');
    await page.locator('[data-field="floor"]').fill('3');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText('Your aim can\'t be lower than the least that counts.')).toBeVisible();
    await page.locator('[data-field="floor"]').fill('1');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    expect(await nextCard(page, heading)).toBe('Why does this matter to you?');
  });

  test('the number boxes for a time counted in hours: both numbers, asked in hours', async ({ page }) => {
    test.setTimeout(240_000);
    const shot = shotter(page);
    let heading = await start(page, 'numbers-hours-390');
    await answerTyped(page, NUMBERS_HOURS_CASE.person[0].say);
    heading = await nextCard(page, heading);
    expect(heading).toBe('In a hard week, how many hours of practice would still count?');
    await expect(page.getByText('How many hours of practice a week are you hoping for?')).toBeVisible();
    // The words name hours, so there is no minutes or hours to choose.
    await expect(page.getByRole('button', { name: 'Minutes', exact: true })).toHaveCount(0);
    await fits(page, 'the number boxes in hours');
    await shot('floor-and-aspiration-hours');
    await page.locator('[data-field="floor"]').fill('2');
    await page.locator('[data-field="aspiration"]').fill('3');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    expect(await nextCard(page, heading)).toBe('Why does this matter to you?');
  });

  test('an app that counts more than one number asks which counts, and the day end card follows with no call', async ({ page }) => {
    test.setTimeout(240_000);
    const shot = shotter(page);
    let heading = await start(page, 'metric-390');
    await answerTyped(page, METRIC_CASE.person[0].say);
    heading = await nextCard(page, heading);
    expect(heading).toBe('Where do you track weight lifted now, if anywhere?');
    await expect(page.getByText('An app can count it for you, or you can log it yourself with a tap.')).toBeVisible();
    await fits(page, 'the source card');
    await shot('source-apps');
    const before = await requests();
    await page.getByRole('button', { name: 'Hevy', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Which number counts for weight lifted in Hevy?' })).toBeVisible();
    expect(await requests(), 'the app tap makes no call').toBe(before);
    for (const label of ['pounds lifted', 'kilograms lifted', 'sets', 'minutes']) await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
    await fits(page, 'the metric card');
    await shot('metric');
    await page.getByRole('button', { name: 'pounds lifted', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'When does your day end?' })).toBeVisible();
    await expect(page.getByText('Thinking…')).toHaveCount(0);
    expect(await requests(), 'the number that counts makes no call, and the day end card is code\'s').toBe(before);
  });
});

// "What does this mean?" shows code's words in place and makes no call; the spec closes it again.
async function askWhatItMeansInPlace(page: Page): Promise<void> {
  const before = await requests();
  await page.getByRole('button', { name: 'What does this mean?' }).click();
  await expect(page.locator('[data-slot="help-explain"]')).toBeVisible();
  expect(await requests(), '"What does this mean?" makes no call').toBe(before);
}

export { askWhatItMeans };
