// The edits behind home's deadline forecast in a real browser against the local stack (MOM-138), at 390px (a phone) and 1280px,
// from brand-new throwaway accounts given the rows setup will one day create (tests/e2e/support/forecastSeed.ts). From a
// forecast line to its edit and back to the new forecast: a kind of day with no usual time, a task with no rough size, a short
// task whose date can move, a task's steps (add, rename, remove), and a date that cannot move (no way to move it). The week plan
// links to the kinds screen, and a task that is not the person's own is refused in words. Any 5xx response from the app fails the
// spec. A browser spec waits for the settled control ("Saved.") before it navigates (MOM-120).

import type { Page } from '@playwright/test';
import { WIDTHS, expect, signUpAndConfirm, test } from './fixtures';
import { FORECAST_TITLES, seedForecast } from './support/forecastSeed';
import { HOME_TITLES } from './support/homeSeed';
import { shiftDay } from './support/reviewSeed';

const LA = 'America/Los_Angeles';
const BOTH_DAYS = [
  { offset: 0, kind: true },
  { offset: 1, kind: true },
];

function watchForServerErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 500) errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  return () => errors;
}

// The plain callout of a form that is missing something (not Next's own route announcer, which is also an alert).
const callout = (page: Page) => page.locator('[data-slot="missing-callout"]');

// Nothing on the page may reach past the right edge of the screen.
const sidewaysScroll = (page: Page) => page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));

// "Thu, Oct 29": the same way the app writes a day inside a sentence.
const formatDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

// Says it was saved, then follows the way home, where the forecast reads the change.
async function savedThenHome(page: Page) {
  await expect(page.getByRole('status')).toHaveText('Saved. See it on home.');
  await page.getByRole('link', { name: 'See it on home.' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.waitForLoadState('networkidle');
}

for (const width of [WIDTHS.phone, WIDTHS.desktop]) {
  test.describe(`the forecast's edits at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('a kind of day with no usual time: the line leads to it, and saving it changes the forecast', async ({ page }) => {
      const serverErrors = watchForServerErrors(page);
      const email = await signUpAndConfirm(page, `kind-${width}`);
      const { kindId } = await seedForecast(email, { timeZone: LA, weekStart: 1, weekly: true, dueInDays: 1, estimateMinutes: 1200, plannedDays: BOTH_DAYS, workHours: null });

      await page.goto('/');
      const goal = page.getByRole('region', { name: HOME_TITLES.goal });
      await expect(goal.getByRole('heading', { name: FORECAST_TITLES.task })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(goal.getByText(`"${FORECAST_TITLES.work}" has no usual amount of time yet`, { exact: false })).toBeVisible();
      await goal.getByRole('link', { name: `Set the usual time for “${FORECAST_TITLES.work}”` }).click();
      await expect(page).toHaveURL(new RegExp(`/plan/kinds#kind-${kindId}$`));
      await expect(page.getByRole('heading', { name: 'How much time each kind of day gives', level: 1 })).toBeVisible();

      const kind = page.locator(`#kind-${kindId}`);
      await expect(kind.getByText('No usual time yet')).toBeVisible();
      // Nothing is chosen for the person: neither unit is on, and a tap with nothing says so.
      await expect(kind.getByRole('button', { name: 'Hours' })).toHaveAttribute('aria-pressed', 'false');
      await kind.getByRole('button', { name: `Save time for “${FORECAST_TITLES.work}”` }).click();
      await expect(kind.getByRole('alert')).toHaveText('Choose hours or sessions first.');
      await kind.getByRole('button', { name: 'Hours' }).click();
      await kind.getByRole('button', { name: `Save time for “${FORECAST_TITLES.work}”` }).click();
      await expect(kind.getByRole('alert')).toHaveText('Say how many first.');
      await kind.getByLabel('How many?').fill('20');
      await kind.getByRole('button', { name: `Save time for “${FORECAST_TITLES.work}”` }).click();
      await expect(kind.getByText('Usually 20 hours')).toBeVisible();
      if (width === WIDTHS.phone) expect(await sidewaysScroll(page)).toBe(0);

      await savedThenHome(page);
      await expect(goal.getByText('Enough time')).toBeVisible();
      await expect(goal.getByText("The days you've set aside look like enough for what's left.")).toBeVisible();
      expect(serverErrors()).toEqual([]);
    });

    test('a task with no rough size: the line leads to its size, and saving it changes the forecast', async ({ page }) => {
      const serverErrors = watchForServerErrors(page);
      const email = await signUpAndConfirm(page, `size-${width}`);
      const { taskId } = await seedForecast(email, { timeZone: LA, weekStart: 1, weekly: true, dueInDays: 1, estimateMinutes: null, plannedDays: BOTH_DAYS });

      await page.goto('/');
      const goal = page.getByRole('region', { name: HOME_TITLES.goal });
      await expect(goal.getByRole('heading', { name: FORECAST_TITLES.task })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(goal.getByText('Not enough to say yet', { exact: false })).toBeVisible();
      await goal.getByRole('link', { name: 'Say how big this is' }).click();
      await expect(page).toHaveURL(new RegExp(`/task/${taskId}$`));
      await expect(page.getByRole('heading', { name: FORECAST_TITLES.task, level: 1 })).toBeVisible();
      await expect(page.getByText(`Goal: ${HOME_TITLES.goal}`)).toBeVisible();

      // A tap with nothing typed says so and sends nothing.
      await page.getByRole('button', { name: 'Save size' }).click();
      await expect(callout(page)).toHaveText('Say roughly how many hours first.');
      await page.getByLabel('Rough size, in hours').fill('2');
      await page.getByRole('button', { name: 'Save size' }).click();
      if (width === WIDTHS.phone) expect(await sidewaysScroll(page)).toBe(0);

      await savedThenHome(page);
      await expect(goal.getByText('Enough time')).toBeVisible();
      expect(serverErrors()).toEqual([]);
    });

    test('a short task whose date can move: "Move the date" leads to the date, and moving it changes the forecast', async ({ page }) => {
      const serverErrors = watchForServerErrors(page);
      const email = await signUpAndConfirm(page, `date-${width}`);
      const { taskId, today } = await seedForecast(email, { timeZone: LA, weekStart: 1, weekly: true, dueInDays: 1, estimateMinutes: 1200, plannedDays: BOTH_DAYS });

      await page.goto('/');
      const goal = page.getByRole('region', { name: HOME_TITLES.goal });
      await expect(goal.getByRole('heading', { name: FORECAST_TITLES.task })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(goal.getByText('Short on time')).toBeVisible();
      // The ways forward that can be acted on are links; "keep going as it is" is only words.
      await expect(goal.getByRole('link', { name: "Make what's left smaller" })).toBeVisible();
      await expect(goal.getByRole('link', { name: /keep going/i })).toHaveCount(0);
      await goal.getByRole('link', { name: 'Move the date' }).click();
      await expect(page).toHaveURL(new RegExp(`/task/${taskId}#date$`));
      await expect(page.getByText('You said this date can move.', { exact: false })).toBeVisible();

      // A day that has passed is refused in words, before anything is sent.
      await page.getByLabel('Move the date to').fill(shiftDay(today, -2));
      await page.getByRole('button', { name: 'Move date' }).click();
      await expect(callout(page)).toHaveText('That day has passed. Pick a day from today on.');
      const later = shiftDay(today, 10);
      await page.getByLabel('Move the date to').fill(later);
      await page.getByRole('button', { name: 'Move date' }).click();
      await expect(page.getByText(`Due ${formatDay(later)}. You said this date can move.`)).toBeVisible();

      await savedThenHome(page);
      await expect(goal.getByText(`Due ${formatDay(later)}`)).toBeVisible();
      // The plan no longer reaches the date: the days set aside so far are said, with no short or close claim.
      await expect(goal.locator('.home-forecast')).toContainText(`You've set aside 2 days through ${formatDay(shiftDay(today, 1))}. Plan more days as you go.`);
      expect(serverErrors()).toEqual([]);
    });

    test('a task’s steps: add one, rename it, remove it, each on the person’s own tap', async ({ page }) => {
      const serverErrors = watchForServerErrors(page);
      const email = await signUpAndConfirm(page, `steps-${width}`);
      const { taskId } = await seedForecast(email, { timeZone: LA, weekStart: 1, weekly: true, dueInDays: 1, estimateMinutes: 120, plannedDays: BOTH_DAYS });

      await page.goto('/');
      const goal = page.getByRole('region', { name: HOME_TITLES.goal });
      await expect(goal.getByRole('heading', { name: FORECAST_TITLES.task })).toBeVisible();
      await page.waitForLoadState('networkidle');
      // Every unfinished deadline task has the quiet link to its edit, whatever its forecast says.
      await goal.getByRole('link', { name: 'Edit this task' }).click();
      await expect(page).toHaveURL(new RegExp(`/task/${taskId}$`));
      await expect(page.getByRole('list', { name: 'Steps' })).toHaveCount(0);

      await page.getByRole('button', { name: 'Add step' }).click();
      await expect(callout(page)).toHaveText('Write the step first.');
      await page.getByLabel('Add a step').fill('Get a reference');
      await page.getByRole('button', { name: 'Add step' }).click();
      const steps = page.getByRole('list', { name: 'Steps' });
      await expect(steps.getByText('Get a reference')).toBeVisible();
      await expect(page.getByLabel('Add a step')).toHaveValue('');
      await expect(page.getByRole('status')).toHaveText('Saved. See it on home.');

      await page.getByRole('button', { name: 'Rename Get a reference' }).click();
      await page.getByLabel('Rename Get a reference').fill('Ask for a reference');
      await page.getByRole('button', { name: 'Save name' }).click();
      await expect(steps.getByText('Ask for a reference')).toBeVisible();
      await expect(steps.getByText('Get a reference')).toHaveCount(0);
      if (width === WIDTHS.phone) expect(await sidewaysScroll(page)).toBe(0);

      await savedThenHome(page);
      await expect(goal.getByText('Ask for a reference')).toBeVisible();

      await goal.getByRole('link', { name: 'Edit this task' }).click();
      await page.getByRole('button', { name: 'Remove Ask for a reference' }).click();
      await expect(page.getByRole('list', { name: 'Steps' })).toHaveCount(0);
      await savedThenHome(page);
      await expect(goal.getByText('Ask for a reference')).toHaveCount(0);
      expect(serverErrors()).toEqual([]);
    });

    test('a date that cannot move: no way to move it, and no link that says so', async ({ page }) => {
      const serverErrors = watchForServerErrors(page);
      const email = await signUpAndConfirm(page, `locked-${width}`);
      const { taskId } = await seedForecast(email, { timeZone: LA, weekStart: 1, weekly: true, dueInDays: 1, estimateMinutes: 1200, plannedDays: BOTH_DAYS, dateCanMove: false });

      await page.goto('/');
      const goal = page.getByRole('region', { name: HOME_TITLES.goal });
      await expect(goal.getByRole('heading', { name: FORECAST_TITLES.task })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(goal.getByText('Short on time')).toBeVisible();
      await expect(goal.getByRole('link', { name: 'Move the date' })).toHaveCount(0);
      await expect(goal.getByRole('link', { name: "Make what's left smaller" })).toBeVisible();

      await page.goto(`/task/${taskId}`);
      await expect(page.getByText(/^Due \w{3}, \w{3} \d{1,2}\. You said this date can't move\.$/)).toBeVisible();
      await expect(page.getByLabel('Move the date to')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Move date' })).toHaveCount(0);
      expect(serverErrors()).toEqual([]);
    });

    test('a finished task shows only that it is finished', async ({ page }) => {
      const serverErrors = watchForServerErrors(page);
      const email = await signUpAndConfirm(page, `done-${width}`);
      const { taskId } = await seedForecast(email, { timeZone: LA, weekStart: 1, weekly: true, dueInDays: 1, estimateMinutes: 120, plannedDays: BOTH_DAYS, finished: true });

      await page.goto(`/task/${taskId}`);
      await expect(page.getByRole('heading', { name: FORECAST_TITLES.task, level: 1 })).toBeVisible();
      await expect(page.getByText('This one is finished.')).toBeVisible();
      await expect(page.getByRole('button', { name: /Save size|Add step|Move date/ })).toHaveCount(0);
      expect(serverErrors()).toEqual([]);
    });

    test('the week plan links to the kinds screen, and a task that is not the person’s own is refused in words', async ({ page }) => {
      const serverErrors = watchForServerErrors(page);
      const email = await signUpAndConfirm(page, `plan-${width}`);
      await seedForecast(email, { timeZone: LA, weekStart: 1, weekly: true, dueInDays: 1, estimateMinutes: 1200, plannedDays: BOTH_DAYS });

      await page.goto('/plan');
      await page.waitForLoadState('networkidle');
      await page.getByRole('link', { name: 'Change how much time each kind gives' }).click();
      await expect(page).toHaveURL(/\/plan\/kinds$/);
      await expect(page.getByRole('heading', { name: FORECAST_TITLES.work, level: 2 })).toBeVisible();
      await expect(page.getByText('Usually 3 hours')).toBeVisible();

      await page.goto('/task/00000000-0000-4000-8000-000000000000');
      await expect(page.locator('main').getByRole('alert')).toHaveText('That is not one of your tasks. Nothing was changed.');
      expect(serverErrors()).toEqual([]);
    });
  });
}
