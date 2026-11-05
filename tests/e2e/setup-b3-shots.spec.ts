// MOM-180 part B3: the screens code now writes, photographed at 390px in light and dark for the owner to read before the commit: the idea and
// the why at Start, the goals playback (one goal, and two), "what else matters" and "what to count" in their fixed words, the number boxes with
// the aim callout's new words, the targets playback, the kinds of days, and the final card. Each screen is also held to the screen checklist:
// one bold line, nothing past the screen edge, no sideways scroll, no dimmed main button, nothing pre-selected.
//
// Runs only when SETUP_SCREENSHOT_DIR names a folder (outside the repo); a run without it skips, so it is not a pass. Every request goes to the
// local fake model, which serves the scripts in tests/setup-evals/exactCallCases.ts; the spec also checks the fake was asked only where a call is listed.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { FIXED_WORDS } from '@/lib/setup/fixedQuestions';
import { STEP_WORDS } from '@/lib/setup/stepCards';
import { expect, signUpAndConfirm, test } from './fixtures';
import { answerCodeCard, codeCardOn, type CardLine } from './support/codeCards';
import { FAKE_MODEL_PORT } from './support/localStack';
import { elementsOffScreen } from './support/setupCards';
import { ONE_GOAL_CASE, TWO_TOGETHER_CASE } from '../setup-evals/exactCallCases';
import type { ScriptedCase } from '../setup-evals/cases';

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
    await expect(page.getByRole('status')).toHaveCount(0);
    return headingOf(page);
  }
  throw new Error('The setup kept asking to wait.');
}

async function fits(page: Page, what: string): Promise<void> {
  expect(await elementsOffScreen(page), `${what}: nothing sits past the screen edge`).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), `${what}: no sideways scroll`).toBe(false);
  await expect(page.locator('[data-slot="card-lead"]'), `${what}: exactly one bold line`).toHaveCount(1);
  for (const main of await page.locator('[data-tone="main"]').all()) await expect(main, `${what}: no dimmed main button`).toBeEnabled();
  await expect(page.locator('[aria-pressed="true"]'), `${what}: nothing is pre-selected`).toHaveCount(0);
}

async function answer(page: Page, line: CardLine): Promise<void> {
  const code = await codeCardOn(page);
  if (code !== null) return answerCodeCard(page, code, line, PERSON_ZONE);
  if ((await page.locator('#setup-playback').count()) > 0) return page.getByRole('button', { name: 'Yes, that is right' }).click();
  if ((await page.getByLabel('Your answer').count()) === 0) await page.getByRole('button', { name: /Type it instead|Type your answer/ }).first().click();
  await page.getByLabel('Your answer').fill(line.say);
  await page.getByRole('button', { name: 'Send' }).click();
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`the B3 screens at 390px, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 900 }, timezoneId: PERSON_ZONE, colorScheme: theme });
    test.skip(!SHOTS, 'SETUP_SCREENSHOT_DIR is not set');

    // Numbered in the order a person meets them (NN-screen-width-theme.png), so the owner can read them as a sequence.
    const ORDER = ['idea', 'why', 'goals-playback-one', 'goals-playback-two', 'what-else-matters', 'what-else-matters-two', 'what-to-count', 'what-to-count-two', 'numbers', 'aim-callout', 'targets-playback', 'kinds-of-days', 'final'];
    const shot = async (page: Page, name: string) => {
      mkdirSync(SHOTS as string, { recursive: true });
      await page.mouse.move(0, 0);
      await page.waitForTimeout(600);
      const n = String(ORDER.indexOf(name) + 1).padStart(2, '0');
      await page.screenshot({ path: join(SHOTS as string, `${n}-${name}-390-${theme}.png`), fullPage: true });
    };

    // Walks a scripted setup by its person's lines, photographing each screen `named` picks out by its heading; returns how many requests it made.
    const walk = async (page: Page, c: ScriptedCase, who: string, named: (heading: string, playbacks: number, isPlayback: boolean) => string | null, until: 'final' | number) => {
      await signUpAndConfirm(page, who);
      await page.goto('/setup');
      await page.getByRole('button', { name: 'Start' }).click();
      const before = await requests();
      let heading = await nextCard(page, null);
      let playbacks = 0;
      for (const [i, line] of c.person.entries()) {
        if (typeof until === 'number' && i >= until) break;
        const isPlayback = (await page.locator('#setup-playback').count()) > 0;
        if (isPlayback) playbacks += 1;
        const name = named(heading, playbacks, isPlayback);
        if (name) {
          await fits(page, name);
          await shot(page, name);
          // The number boxes: the aim callout in its new words, before the person's own answer.
          if (name === 'numbers') {
            await page.locator('[data-field="floor"]').fill('2');
            await page.locator('[data-field="aspiration"]').fill('lots');
            await page.getByRole('button', { name: 'Next', exact: true }).click();
            await expect(page.getByText(STEP_WORDS.addAim, { exact: true })).toBeVisible();
            await fits(page, 'the aim callout');
            await shot(page, 'aim-callout');
            await page.locator('[data-field="aspiration"]').fill('');
          }
        }
        await answer(page, line);
        heading = await nextCard(page, heading);
      }
      if (until === 'final') {
        await expect(page.locator('#setup-final')).toBeVisible();
        await fits(page, 'the final card');
        await shot(page, 'final');
      }
      return (await requests()) - before;
    };

    test('one goal, from Start to the final card', async ({ page }) => {
      test.setTimeout(420_000);
      const calls = await walk(
        page,
        ONE_GOAL_CASE,
        `b3-one-${theme}`,
        (heading, playbacks, isPlayback) => {
          if (heading === FIXED_WORDS.ideaQuestion) return 'idea';
          if (heading === FIXED_WORDS.whyQuestion) return 'why';
          if (heading === FIXED_WORDS.prioritiesQuestion) return 'what-else-matters';
          if (heading === FIXED_WORDS.targetQuestion) return 'what-to-count';
          if (heading === FIXED_WORDS.dayTypesQuestion) return 'kinds-of-days';
          if (/^In a hard week, how many runs would still count\?$/.test(heading)) return 'numbers';
          if (isPlayback && playbacks === 1) return 'goals-playback-one';
          if (isPlayback && playbacks === 2) return 'targets-playback';
          return null;
        },
        'final',
      );
      // Four calls, as tests/setup-exact-calls.test.ts lists them.
      expect(calls).toBe(4);
    });

    test('two goals together: the goals playback and what to count, by goal', async ({ page }) => {
      test.setTimeout(420_000);
      // Up to the first "what to count": the opening, one goal or a few, the names, together, the playback, what else matters, and the goal cards.
      await walk(
        page,
        TWO_TOGETHER_CASE,
        `b3-two-${theme}`,
        (heading, playbacks, isPlayback) => {
          if (isPlayback && playbacks === 1) return 'goals-playback-two';
          if (heading === FIXED_WORDS.prioritiesQuestionMany) return 'what-else-matters-two';
          return null;
        },
        14,
      );
      await expect(page.getByRole('heading', { name: 'What would you like to count for "Lift weights"?' })).toBeVisible();
      await fits(page, 'what to count, by goal');
      await shot(page, 'what-to-count-two');
    });
  });
}
