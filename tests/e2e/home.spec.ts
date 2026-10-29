// Home's goal model scoreboard in a real browser against the local stack (MOM-112): the week hero and a goal with its
// scoreboard above today's feed, at 390px (a phone) and 1280px, from a brand-new throwaway account given the rows setup
// will one day create (tests/e2e/support/homeSeed.ts). Three more states at 390px: a person who has not set the day their
// week starts, a person with deadline goals only (never asked for it), and a person with no time zone. The old feed stays
// where it is. A deadline task says, in plain words, whether the days the person set aside look like enough for what is left
// (MOM-112 slice 2): at both widths, and at 390px when the plan does not reach the due date, when nothing is set aside, when a day
// has no kind, and for a person with deadline goals only. Any 5xx response from the app fails the spec.

import type { Page } from '@playwright/test';
import { WIDTHS, expect, signUpAndConfirm, test } from './fixtures';
import { FORECAST_TITLES, seedForecast } from './support/forecastSeed';
import { HOME_TITLES, seedHome } from './support/homeSeed';
import { shiftDay } from './support/reviewSeed';

function watchForServerErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 500) errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  return () => errors;
}

// How far the new cards reach past the right edge of the screen: nothing inside them may. This looks at the new section
// only. The sticky header's "Signed in as" row, which is not part of this block, can run wider than a phone with a long
// email address (BACKLOG.md, MOM-112).
const overflowOfScoreboard = (page: Page) =>
  page.evaluate(() => {
    const right = Math.max(0, ...Array.from(document.querySelectorAll('.home-scoreboard, .home-scoreboard *')).map((el) => el.getBoundingClientRect().right));
    return Math.max(0, Math.ceil(right - window.innerWidth));
  });

for (const [name, width] of Object.entries(WIDTHS)) {
  test.describe(`at ${width}px (${name})`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('shows the week hero and a goal with its scoreboard above the unchanged feed', async ({ page }) => {
      const serverErrors = watchForServerErrors(page);
      const email = await signUpAndConfirm(page, `home-${width}`);
      await seedHome(email, { timeZone: 'America/Los_Angeles', weekStart: 1, weekly: true });

      await page.goto('/');
      const hero = page.getByRole('region', { name: 'This week' });
      await expect(hero).toBeVisible();
      await page.waitForLoadState('networkidle');

      // The hero: floors met as a ring in words, the week's biggest crossing alone, and the entries on each day.
      await expect(hero.getByRole('img', { name: '1 of 2 floors met this week' })).toBeVisible();
      // Two targets reached their floor today (the workouts, and the checklist's first step took it to its floor), so both
      // are named, in title order, and none is picked: the person's own order of goals is not stored yet.
      await expect(hero.getByRole('heading', { name: `${HOME_TITLES.prep} and ${HOME_TITLES.workouts}: floor met`, exact: true })).toBeVisible();
      await expect(hero.getByRole('img', { name: /^Entries per day: .*\b4\b/ })).toBeVisible();
      // Celebrated alone: nothing about the next level in the hero, which lives on the target's own card.
      await expect(hero).not.toContainText(/aspiration/i);
      await expect(hero).not.toContainText('%');

      // The goal card: levels in words, the line to the aspiration on the target's own card, and the milestone's steps.
      const goal = page.getByRole('region', { name: HOME_TITLES.goal });
      await expect(goal).toBeVisible();
      await expect(goal.getByText('Floor met')).toBeVisible();
      await expect(goal.getByText('2 more to reach your aspiration')).toBeVisible();
      await expect(goal.getByText('Partway · 4 km to floor')).toBeVisible();
      await expect(goal.getByRole('heading', { name: HOME_TITLES.prep })).toBeVisible();
      await expect(goal.getByText(/^1 of 2\s*steps done/)).toBeVisible();
      // A milestone has no forecast: nothing about whether it fits.
      await expect(goal).not.toContainText(/\b(fits|tight|on track|behind)\b/i);

      // Above the old feed, which is unchanged and still there.
      const feed = page.getByRole('heading', { name: 'Make today count.' });
      await expect(feed).toBeVisible();
      const heroBox = await hero.boundingBox();
      const feedBox = await feed.boundingBox();
      expect(heroBox && feedBox && heroBox.y < feedBox.y).toBe(true);

      if (width === WIDTHS.phone) {
        // One column: nothing in the new cards runs past the screen.
        expect(await overflowOfScoreboard(page)).toBe(0);
        expect(heroBox?.width ?? 0).toBeLessThanOrEqual(width);
      } else {
        // Three columns: the new cards take the top of the middle one, between the sidebar and the right column.
        expect(heroBox?.x ?? 0).toBeGreaterThan(232);
        expect((heroBox?.x ?? 0) + (heroBox?.width ?? 0)).toBeLessThanOrEqual(900);
      }
      expect(serverErrors()).toEqual([]);
    });

    test('says a deadline task looks short for the days set aside, with the ways forward', async ({ page }) => {
      const serverErrors = watchForServerErrors(page);
      const email = await signUpAndConfirm(page, `forecast-${width}`);
      // Due tomorrow, a rough size of 20 hours, and two 3-hour days set aside: 6 hours, and the plan reaches the date.
      await seedForecast(email, { timeZone: 'America/Los_Angeles', weekStart: 1, weekly: true, dueInDays: 1, estimateMinutes: 1200, plannedDays: [{ offset: 0, kind: true }, { offset: 1, kind: true }] });

      await page.goto('/');
      const goal = page.getByRole('region', { name: HOME_TITLES.goal });
      await expect(goal.getByRole('heading', { name: FORECAST_TITLES.task })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(goal.getByText('Short on time')).toBeVisible();
      await expect(goal.getByText("The days you've set aside look short for what's left.")).toBeVisible();
      await expect(goal.getByText("You could add more days, make what's left smaller, move the date or keep going as it is.")).toBeVisible();
      // A fact about the days set aside: no minutes, hours or promise, and only the deadline task has one (not the milestone).
      await expect(goal).not.toContainText(/\b\d+(\.\d+)?\s*(min|minutes|hrs?|hours)\b/i);
      await expect(goal).not.toContainText(/\b(guarantee|promise|on track|behind)\b/i);
      await expect(goal.locator('.home-forecast')).toHaveCount(1);
      if (width === WIDTHS.phone) expect(await overflowOfScoreboard(page)).toBe(0);

      // The way to more days is the week plan.
      await goal.getByRole('link', { name: 'Plan more days' }).click();
      await expect(page).toHaveURL(/\/plan$/);
      expect(serverErrors()).toEqual([]);
    });
  });
}

test.describe('the deadline forecast in other states (390px)', () => {
  test.use({ viewport: { width: WIDTHS.phone, height: 900 } });
  const LA = 'America/Los_Angeles';
  // "Thu, Oct 29": the same way the app writes a day inside a sentence.
  const formatDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

  test('when the plan does not reach the due date, it says how many days are set aside, with no short or close claim', async ({ page }) => {
    const serverErrors = watchForServerErrors(page);
    const email = await signUpAndConfirm(page, 'forecast-sofar');
    // Due in six days, a rough size of 20 hours, and two 3-hour days set aside so far: not enough yet, but the plan stops tomorrow.
    const { today } = await seedForecast(email, { timeZone: LA, weekStart: 1, weekly: true, dueInDays: 6, estimateMinutes: 1200, plannedDays: [{ offset: 0, kind: true }, { offset: 1, kind: true }] });

    await page.goto('/');
    const goal = page.getByRole('region', { name: HOME_TITLES.goal });
    await expect(goal.getByRole('heading', { name: FORECAST_TITLES.task })).toBeVisible();
    await page.waitForLoadState('networkidle');
    const forecast = goal.locator('.home-forecast');
    await expect(forecast).toContainText(`You've set aside 2 days through ${formatDay(shiftDay(today, 1))}. Plan more days as you go.`);
    await expect(forecast).not.toContainText(/short|close|enough|options|could/i);
    await expect(forecast.locator('.chip')).toHaveCount(0);
    expect(await overflowOfScoreboard(page)).toBe(0);
    expect(serverErrors()).toEqual([]);
  });

  test('when the days set aside so far are already enough, it says so', async ({ page }) => {
    const serverErrors = watchForServerErrors(page);
    const email = await signUpAndConfirm(page, 'forecast-enough');
    // Due in six days, a rough size of 2 hours, and two 3-hour days set aside so far: already enough.
    await seedForecast(email, { timeZone: LA, weekStart: 1, weekly: true, dueInDays: 6, estimateMinutes: 120, plannedDays: [{ offset: 0, kind: true }, { offset: 1, kind: true }] });

    await page.goto('/');
    const goal = page.getByRole('region', { name: HOME_TITLES.goal });
    await expect(goal.getByRole('heading', { name: FORECAST_TITLES.task })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(goal.getByText("The days you've set aside so far look like enough for what's left.")).toBeVisible();
    expect(serverErrors()).toEqual([]);
  });

  test('with nothing set aside, it says so and leads to the plan, without a guess', async ({ page }) => {
    const serverErrors = watchForServerErrors(page);
    const email = await signUpAndConfirm(page, 'forecast-none');
    await seedForecast(email, { timeZone: LA, weekStart: 1, weekly: true, dueInDays: 3, estimateMinutes: 240, plannedDays: [] });

    await page.goto('/');
    const goal = page.getByRole('region', { name: HOME_TITLES.goal });
    await expect(goal.getByRole('heading', { name: FORECAST_TITLES.task })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(goal.getByText("You haven't set aside any days for this yet.")).toBeVisible();
    await expect(goal.getByRole('link', { name: 'Plan your week' })).toBeVisible();
    await expect(goal.locator('.home-forecast .chip')).toHaveCount(0);
    expect(serverErrors()).toEqual([]);
  });

  test('a day with no kind is asked for, not guessed', async ({ page }) => {
    const serverErrors = watchForServerErrors(page);
    const email = await signUpAndConfirm(page, 'forecast-nokind');
    const { today } = await seedForecast(email, { timeZone: LA, weekStart: 1, weekly: true, dueInDays: 1, estimateMinutes: 240, plannedDays: [{ offset: 0, kind: false }, { offset: 1, kind: true }] });

    await page.goto('/');
    const goal = page.getByRole('region', { name: HOME_TITLES.goal });
    await expect(goal.getByRole('heading', { name: FORECAST_TITLES.task })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(goal.getByText(`Say what kind of day ${formatDay(today)} is, so we can tell how much time it gives.`)).toBeVisible();
    await expect(goal.locator('.home-forecast')).not.toContainText(/look like enough|close to|look short/i);
    await expect(goal.getByRole('link', { name: 'Say what kind of day' })).toBeVisible();
    expect(serverErrors()).toEqual([]);
  });

  test('a person with deadline goals only sees it in their deadlines, and is never asked for a week start', async ({ page }) => {
    const serverErrors = watchForServerErrors(page);
    const email = await signUpAndConfirm(page, 'forecast-deadline');
    await seedForecast(email, { timeZone: LA, weekStart: null, weekly: false, dueInDays: 1, estimateMinutes: 240, plannedDays: [{ offset: 0, kind: true }, { offset: 1, kind: true }] });

    await page.goto('/');
    const hero = page.getByRole('region', { name: 'Your deadlines' });
    await expect(hero.getByRole('heading', { name: FORECAST_TITLES.task })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(hero.getByText("The days you've set aside look like enough for what's left.")).toBeVisible();
    await expect(page.getByRole('region', { name: 'Your week' })).not.toContainText(/week start/i);
    await expect(page.getByText('Needs your week start')).toHaveCount(0);
    expect(serverErrors()).toEqual([]);
  });
});

test.describe('the states a person can be in (390px)', () => {
  test.use({ viewport: { width: WIDTHS.phone, height: 900 } });

  test('a person who has not set the day their week starts is asked, and their weekly targets wait', async ({ page }) => {
    const serverErrors = watchForServerErrors(page);
    const email = await signUpAndConfirm(page, 'home-noweek');
    await seedHome(email, { timeZone: 'America/Los_Angeles', weekStart: null, weekly: true });

    await page.goto('/');
    const hero = page.getByRole('region', { name: 'This week' });
    await expect(hero.getByRole('heading', { name: 'Set the day your week starts' })).toBeVisible();
    // No ring and no bars without a week.
    await expect(hero.getByRole('img')).toHaveCount(0);
    const goal = page.getByRole('region', { name: HOME_TITLES.goal });
    await expect(goal.getByText('Needs your week start')).toHaveCount(2);
    // The milestone still shows its steps and due date, and says nothing about a week start.
    await expect(goal.getByRole('heading', { name: HOME_TITLES.prep })).toBeVisible();
    await expect(goal.getByText(/^1 of 2\s*steps done/)).toBeVisible();
    expect(await overflowOfScoreboard(page)).toBe(0);
    expect(serverErrors()).toEqual([]);
  });

  test('a person with only deadline goals is never asked for a week start', async ({ page }) => {
    const serverErrors = watchForServerErrors(page);
    const email = await signUpAndConfirm(page, 'home-deadline');
    await seedHome(email, { timeZone: 'America/Los_Angeles', weekStart: null, weekly: false });

    await page.goto('/');
    const hero = page.getByRole('region', { name: 'Your deadlines' });
    await expect(hero).toBeVisible();
    await expect(hero.getByRole('heading', { name: HOME_TITLES.prep })).toBeVisible();
    await expect(hero.getByText(/^1 of 2\s*steps done/)).toBeVisible();
    const main = page.getByRole('region', { name: 'Your week' });
    await expect(main).not.toContainText(/week start/i);
    await expect(page.getByText('Needs your week start')).toHaveCount(0);
    expect(serverErrors()).toEqual([]);
  });

  test('a person with no time zone is asked for it, and nothing is graded or guessed', async ({ page }) => {
    const serverErrors = watchForServerErrors(page);
    const email = await signUpAndConfirm(page, 'home-nozone');
    await seedHome(email, { timeZone: null, weekStart: null, weekly: true });

    await page.goto('/');
    await expect(page.getByText(/Set your time zone to see your week/)).toBeVisible();
    await expect(page.getByRole('region', { name: 'This week' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Make today count.' })).toBeVisible();
    expect(serverErrors()).toEqual([]);
  });
});
