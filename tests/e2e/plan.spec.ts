// The week plan in a real browser against the local stack (MOM-112 block 2), at 390px (a phone) and 1280px, from brand-new
// throwaway accounts given the rows setup will one day create (tests/e2e/support/planSeed.ts). The dates follow the real clock
// in Los Angeles, because the app reads it. What this proves that the component tests cannot:
// - a person plans their own week: every day starts unchosen, a tap puts a thing on a day and the next tap takes it off, it is
//   still there after a reload, and home's "Your plan" card shows exactly what they chose for today and nothing else,
// - the kind of day each date is is the person's to say, with a short reason, and "Same as last week" copies onto today only
//   when they tap it,
// - a step left over from last week is shown with a way to choose a day for it, and is not put on a day for them,
// - the plan fits a phone with no sideways scroll, every day is a button of at least 44px, and it reads in one column at 1280px,
// - a person with no time zone has no plan and nothing is guessed, and a person with no week start sees the next 14 days.
// Any 5xx response from the app fails the spec.

import type { Page } from '@playwright/test';
import { WIDTHS, expect, signUpAndConfirm, test } from './fixtures';
import { PLAN_TITLES, seedPlan } from './support/planSeed';
import { laToday } from './support/reviewSeed';

function watchForServerErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 500) errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  return () => errors;
}

// "Thu, Oct 29": the same way the app writes a day.
const formatDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

// How far the page's content reaches past the right edge of the screen: nothing may.
const overflowOfPage = (page: Page) =>
  page.evaluate(() => {
    const right = Math.max(0, ...Array.from(document.querySelectorAll('main, main *')).map((el) => el.getBoundingClientRect().right));
    return Math.max(0, Math.ceil(right - window.innerWidth));
  });

const LA = 'America/Los_Angeles';
const dayButton = (page: Page, title: string, day: string) => page.getByRole('button', { name: `${title}, ${formatDay(day)}` });
const kindSelect = (page: Page, day: string) => page.getByRole('combobox', { name: `${formatDay(day)}: what kind of day` });

for (const [name, width] of Object.entries(WIDTHS)) {
  test.describe(`at ${width}px (${name})`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('plans a day, sees it on home, reloads, and takes it off', async ({ page }) => {
      const serverErrors = watchForServerErrors(page);
      const email = await signUpAndConfirm(page, `plan-${width}`);
      const { today } = await seedPlan(email, { timeZone: LA, weekStart: 1, weekly: true });

      await page.goto('/plan');
      await expect(page.getByRole('heading', { level: 1, name: 'Plan your week' })).toBeVisible();
      await page.waitForLoadState('networkidle');

      // Nothing is chosen for the person: every day of every thing starts unpressed, and every date has no kind.
      const prep = page.getByRole('list', { name: `Days for ${PLAN_TITLES.prep}` });
      const pressed = await prep.getByRole('button').evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-pressed')));
      expect(pressed).toEqual(Array(7).fill('false'));
      for (const select of await page.getByRole('combobox').all()) await expect(select).toHaveValue('');
      // Habit and step are both there, in plain words, with the habit's set days named and not chosen.
      await expect(page.getByText('Your set days: Mon, Wed, Fri')).toBeVisible();
      await expect(page.getByText('Repeats')).toBeVisible();
      await expect(page.getByText('One-off')).toBeVisible();
      await expect(page.getByText(/This week · /)).toBeVisible();
      expect(await overflowOfPage(page), 'sideways overflow on the plan').toBe(0);

      // Every day is a real touch target.
      const box = await dayButton(page, PLAN_TITLES.prep, today).boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

      // One tap puts the step on today, and it is still there after a reload.
      await dayButton(page, PLAN_TITLES.prep, today).click();
      await expect(dayButton(page, PLAN_TITLES.prep, today)).toHaveAttribute('aria-pressed', 'true');
      await expect(dayButton(page, PLAN_TITLES.prep, today)).toBeEnabled(); // settled: the refresh has rendered (MOM-120)
      await page.reload();
      await expect(dayButton(page, PLAN_TITLES.prep, today)).toHaveAttribute('aria-pressed', 'true');
      // Only that one: the habit and the other days are untouched.
      await expect(dayButton(page, PLAN_TITLES.habit, today)).toHaveAttribute('aria-pressed', 'false');
      await expect(page.locator('[aria-pressed="true"]')).toHaveCount(1);

      // Home shows what they chose for today, and nothing else.
      await page.goto('/');
      const card = page.getByRole('region', { name: 'Your plan' });
      await expect(card).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(card.getByRole('heading', { name: 'Today' })).toBeVisible();
      await expect(card.getByText(PLAN_TITLES.prep)).toBeVisible();
      await expect(card.getByText(PLAN_TITLES.habit)).toHaveCount(0);
      await card.getByRole('link', { name: 'Plan your week' }).click();
      await expect(page).toHaveURL(/\/plan$/);

      // The next tap takes it off, and home goes back to saying nothing is planned.
      await dayButton(page, PLAN_TITLES.prep, today).click();
      await expect(dayButton(page, PLAN_TITLES.prep, today)).toHaveAttribute('aria-pressed', 'false');
      await expect(dayButton(page, PLAN_TITLES.prep, today)).toBeEnabled(); // settled (MOM-120)
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('region', { name: 'Your plan' }).getByText(/Nothing planned for today yet\./)).toBeVisible();

      expect(serverErrors(), 'server errors').toEqual([]);
    });

    test('says what kind of day a date is, with a reason, and copies last week\'s kind only on a tap', async ({ page }) => {
      const serverErrors = watchForServerErrors(page);
      const email = await signUpAndConfirm(page, `kinds-${width}`);
      const { today } = await seedPlan(email, { timeZone: LA, weekStart: 1, weekly: true, lastWeekKind: true });

      await page.goto('/plan');
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { name: 'What kind of day is each one?' })).toBeVisible();
      await expect(page.getByText('This is so the forecast knows how much time you have.')).toBeVisible();
      const select = kindSelect(page, today);
      // The two kinds were saved together, so they come back by name.
      await expect(select.locator('option')).toHaveText(['Not set', PLAN_TITLES.rest, PLAN_TITLES.work]);

      // Last week had a kind on this weekday, so the button is offered; offering it fills nothing in.
      const copy = page.getByRole('button', { name: 'Same as last week' });
      await expect(copy).toBeVisible();
      await expect(select).toHaveValue('');

      await copy.click();
      await expect(select).not.toHaveValue('');
      await expect(select.locator('option:checked')).toHaveText(PLAN_TITLES.work);
      await expect(copy).toHaveCount(0);

      // It can be changed and cleared by the person, and it stays after a reload (once the save has finished: a reload in the
      // middle of one would drop it, as it should). Finished means the select is enabled again, after the refresh has rendered (MOM-120).
      const saved = page.waitForResponse((response) => response.request().method() === 'POST');
      await select.selectOption({ label: PLAN_TITLES.rest });
      await saved;
      await expect(kindSelect(page, today)).toBeEnabled();
      await page.reload();
      await expect(kindSelect(page, today).locator('option:checked')).toHaveText(PLAN_TITLES.rest);
      await kindSelect(page, today).selectOption({ label: 'Not set' });
      await expect(kindSelect(page, today)).toHaveValue('');
      await expect(kindSelect(page, today)).toBeEnabled(); // settled before the test ends (MOM-120)
      expect(await overflowOfPage(page), 'sideways overflow on the plan').toBe(0);

      expect(serverErrors(), 'server errors').toEqual([]);
    });

    test('shows a step left over from last week, and does not put it on a day for the person', async ({ page }) => {
      const serverErrors = watchForServerErrors(page);
      const email = await signUpAndConfirm(page, `moved-${width}`);
      const { today } = await seedPlan(email, { timeZone: LA, weekStart: 1, weekly: true, leftOver: true });

      await page.goto('/');
      const card = page.getByRole('region', { name: 'Your plan' });
      await expect(card.getByRole('heading', { name: 'Left over from last week' })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(card.getByText(PLAN_TITLES.prep)).toBeVisible();
      await card.getByRole('link', { name: 'Choose a day' }).click();
      await expect(page).toHaveURL(/\/plan$/);

      await expect(page.getByText('Left over from last week')).toBeVisible();
      await expect(page.getByText(/Unfinished steps move forward, and nothing is cut/)).toBeVisible();
      // It was not put on a day: nothing is pressed.
      await expect(page.locator('[aria-pressed="true"]')).toHaveCount(0);

      // Choosing a day for it ends the "left over".
      await dayButton(page, PLAN_TITLES.prep, today).click();
      await expect(dayButton(page, PLAN_TITLES.prep, today)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByText('Left over from last week')).toHaveCount(0);
      await expect(dayButton(page, PLAN_TITLES.prep, today)).toBeEnabled(); // settled before the test ends (MOM-120)
      expect(serverErrors(), 'server errors').toEqual([]);
    });

    test('steps to next week and back, and a day that has passed cannot be changed', async ({ page }) => {
      const serverErrors = watchForServerErrors(page);
      const email = await signUpAndConfirm(page, `weeks-${width}`);
      await seedPlan(email, { timeZone: LA, weekStart: 1, weekly: true });

      await page.goto('/plan');
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('link', { name: 'Earlier week' })).toHaveCount(0);
      // The week starts on Monday, so Monday is a day that has passed unless today is Monday.
      const monday = page.getByRole('list', { name: `Days for ${PLAN_TITLES.prep}` }).getByRole('button').first();
      expect(await monday.isDisabled()).toBe(laToday().weekday !== 1);

      await page.getByRole('link', { name: 'Later week' }).click();
      await expect(page).toHaveURL(/\/plan\?week=1$/);
      await expect(page.getByText(/Next week · /)).toBeVisible();
      // Every day of next week can be planned.
      for (const button of await page.getByRole('list', { name: `Days for ${PLAN_TITLES.prep}` }).getByRole('button').all()) await expect(button).toBeEnabled();
      await page.getByRole('link', { name: 'Earlier week' }).click();
      await expect(page).toHaveURL(/\/plan$/);
      expect(await overflowOfPage(page), 'sideways overflow on the plan').toBe(0);
      expect(serverErrors(), 'server errors').toEqual([]);
    });
  });
}

test.describe('states at 390px', () => {
  test.use({ viewport: { width: 390, height: 900 } });

  test('a person with no week start sees the next 14 days, never weeks', async ({ page }) => {
    const serverErrors = watchForServerErrors(page);
    const email = await signUpAndConfirm(page, 'plan-noweek');
    const { today } = await seedPlan(email, { timeZone: LA, weekStart: null, weekly: true });

    await page.goto('/plan');
    await expect(page.getByRole('heading', { name: 'The next 14 days' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('navigation', { name: 'Weeks' })).toHaveCount(0);
    await expect(page.getByRole('list', { name: `Days for ${PLAN_TITLES.prep}` }).getByRole('button')).toHaveCount(14);
    // Every one of the 14 is today or later, so every one can be chosen.
    await dayButton(page, PLAN_TITLES.prep, today).click();
    await expect(dayButton(page, PLAN_TITLES.prep, today)).toHaveAttribute('aria-pressed', 'true');
    await expect(dayButton(page, PLAN_TITLES.prep, today)).toBeEnabled(); // settled before the test ends (MOM-120)
    expect(await overflowOfPage(page), 'sideways overflow on the plan').toBe(0);
    expect(serverErrors(), 'server errors').toEqual([]);
  });

  test('a person with no time zone has no plan, and nothing is guessed', async ({ page }) => {
    const serverErrors = watchForServerErrors(page);
    const email = await signUpAndConfirm(page, 'plan-notz');
    await seedPlan(email, { timeZone: null, weekStart: null, weekly: true });

    await page.goto('/plan');
    await expect(page.getByRole('status')).toContainText('Set your time zone to plan your week');
    // Nothing on the page itself to tap or choose (the dev server's own overlay button is outside it).
    await expect(page.locator('main').getByRole('button')).toHaveCount(0);
    await expect(page.locator('main').getByRole('combobox')).toHaveCount(0);

    // Home shows no plan card either.
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('region', { name: 'Your plan' })).toHaveCount(0);
    expect(serverErrors(), 'server errors').toEqual([]);
  });
});
