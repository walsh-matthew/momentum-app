// Screenshots of every screen the forecast's edits added or changed (MOM-138) at 390px and 1280px, in the theme the browser is set to,
// for the owner to look at before the commit: the kinds screen, a task's screen (open, with its callouts, with the date locked and
// finished), and home with the new links on its forecast lines. It runs only when FORECAST_EDIT_SHOT_DIR names a folder (outside the
// repo); the files go in <folder>/<screen>-<theme>-<width>.png, and the theme is the one E2E_COLOR_SCHEME gives the browser (light by
// default). Like the other screenshot specs it asserts almost nothing: tests/e2e/forecast-edits.spec.ts proves the behaviour. Run it
// only after any other browser run has finished.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { WIDTHS, expect, signUpAndConfirm, test } from './fixtures';
import { FORECAST_TITLES, seedForecast } from './support/forecastSeed';
import { HOME_TITLES } from './support/homeSeed';

const SHOTS = process.env.FORECAST_EDIT_SHOT_DIR;
const THEME = process.env.E2E_COLOR_SCHEME === 'dark' ? 'dark' : 'light';
const LA = 'America/Los_Angeles';
const BOTH_DAYS = [
  { offset: 0, kind: true },
  { offset: 1, kind: true },
];

// FORECAST_EDIT_SHOT_ONLY="task-callouts,home-short" retakes just those screens (a retake after a change); empty takes every one.
const ONLY = (process.env.FORECAST_EDIT_SHOT_ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);

async function shot(page: Page, screen: string, width: number): Promise<void> {
  if (ONLY.length > 0 && !ONLY.includes(screen)) return;
  mkdirSync(SHOTS!, { recursive: true });
  // The development server's own badge sits over the corner of the page and is not part of the screen; and a choice that was just
  // tapped fades to its new colour over 150ms, so the shot waits for it to stop.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS!, `${screen}-${THEME}-${width}.png`), fullPage: true });
}

for (const width of [WIDTHS.phone, WIDTHS.desktop]) {
  test.describe(`${THEME} theme, the forecast's edits at ${width}px`, () => {
    test.skip(!SHOTS, 'screenshots are taken only when FORECAST_EDIT_SHOT_DIR is set');
    test.use({ viewport: { width, height: 900 } });

    test('the kinds screen, and home when a kind has no usual time', async ({ page }) => {
      test.setTimeout(300_000);
      const email = await signUpAndConfirm(page, `shots-kinds-${THEME}-${width}`);
      const { kindId } = await seedForecast(email, { timeZone: LA, weekStart: 1, weekly: true, dueInDays: 1, estimateMinutes: 1200, plannedDays: BOTH_DAYS, workHours: null });

      await page.goto('/');
      const goal = page.getByRole('region', { name: HOME_TITLES.goal });
      await expect(goal.getByRole('heading', { name: FORECAST_TITLES.task })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(goal.getByRole('link', { name: `Set the usual time for “${FORECAST_TITLES.work}”` })).toBeVisible();
      await shot(page, 'home-no-time', width);

      await page.goto('/plan/kinds');
      await page.waitForLoadState('networkidle');
      const kind = page.locator(`#kind-${kindId}`);
      await expect(kind.getByText('No usual time yet')).toBeVisible();
      await shot(page, 'kinds', width);

      await kind.getByRole('button', { name: `Save time for “${FORECAST_TITLES.work}”` }).click();
      await expect(kind.getByRole('alert')).toHaveText('Choose hours or sessions first.');
      await shot(page, 'kinds-callout', width);

      await kind.getByRole('button', { name: 'Sessions' }).click();
      await kind.getByLabel('How many?').fill('2');
      await shot(page, 'kinds-sessions', width);
    });

    test('a task’s screen, open and with its callouts, and home when it is short', async ({ page }) => {
      test.setTimeout(300_000);
      const email = await signUpAndConfirm(page, `shots-task-${THEME}-${width}`);
      const { taskId } = await seedForecast(email, { timeZone: LA, weekStart: 1, weekly: true, dueInDays: 1, estimateMinutes: 1200, plannedDays: BOTH_DAYS });

      await page.goto('/');
      const goal = page.getByRole('region', { name: HOME_TITLES.goal });
      await expect(goal.getByRole('heading', { name: FORECAST_TITLES.task })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(goal.getByRole('link', { name: 'Move the date' })).toBeVisible();
      await shot(page, 'home-short', width);

      // Two steps, so the screen shows what a task with steps looks like; then a reload so "Saved." is not in the shot.
      await page.goto(`/task/${taskId}`);
      await page.waitForLoadState('networkidle');
      for (const title of ['Write the letter', 'Send it']) {
        await page.getByLabel('Add a step').fill(title);
        await page.getByRole('button', { name: 'Add step' }).click();
        await expect(page.getByRole('list', { name: 'Steps' }).getByText(title)).toBeVisible();
      }
      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('list', { name: 'Steps' }).getByText('Send it')).toBeVisible();
      await shot(page, 'task-open', width);

      // Every callout at once: an empty size, an empty step, and a rename with nothing.
      await page.getByLabel('Rough size, in hours').fill('');
      await page.getByRole('button', { name: 'Save size' }).click();
      await page.getByRole('button', { name: 'Add step' }).click();
      await page.getByRole('button', { name: 'Rename Send it' }).click();
      await page.getByLabel('Rename Send it').fill('');
      await page.getByRole('button', { name: 'Save name' }).click();
      await expect(page.locator('[data-slot="missing-callout"]')).toHaveCount(3);
      await shot(page, 'task-callouts', width);
    });

    test('a task’s screen when the date cannot move', async ({ page }) => {
      test.setTimeout(300_000);
      const email = await signUpAndConfirm(page, `shots-locked-${THEME}-${width}`);
      const { taskId } = await seedForecast(email, { timeZone: LA, weekStart: 1, weekly: true, dueInDays: 1, estimateMinutes: 1200, plannedDays: BOTH_DAYS, dateCanMove: false });
      await page.goto(`/task/${taskId}`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/You said this date can't move\./)).toBeVisible();
      await shot(page, 'task-locked', width);
    });

    test('a task’s screen when it is finished', async ({ page }) => {
      test.setTimeout(300_000);
      const email = await signUpAndConfirm(page, `shots-done-${THEME}-${width}`);
      const { taskId } = await seedForecast(email, { timeZone: LA, weekStart: 1, weekly: true, dueInDays: 1, estimateMinutes: 120, plannedDays: BOTH_DAYS, finished: true });
      await page.goto(`/task/${taskId}`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByText('This one is finished.')).toBeVisible();
      await shot(page, 'task-finished', width);
    });

    test('home when a task has no rough size', async ({ page }) => {
      test.setTimeout(300_000);
      const email = await signUpAndConfirm(page, `shots-nosize-${THEME}-${width}`);
      await seedForecast(email, { timeZone: LA, weekStart: 1, weekly: true, dueInDays: 1, estimateMinutes: null, plannedDays: BOTH_DAYS });
      await page.goto('/');
      const goal = page.getByRole('region', { name: HOME_TITLES.goal });
      await expect(goal.getByRole('heading', { name: FORECAST_TITLES.task })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(goal.getByRole('link', { name: 'Say how big this is' })).toBeVisible();
      await shot(page, 'home-no-size', width);
    });
  });
}
