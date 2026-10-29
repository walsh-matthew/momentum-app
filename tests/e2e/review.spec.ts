// The weekly review's layer 1 recap in a real browser against the local stack (MOM-113 block 3.2), at 390px (a phone) and
// 1280px, from brand-new throwaway accounts given the rows setup will one day create (tests/e2e/support/reviewSeed.ts). The
// dates follow the real clock in Los Angeles, because the app reads it. What this proves that the component tests cannot:
// - home shows the one-line notice on the person's planning day and it leads to /review, which reads the person's own rows
//   through row level security and renders every number from the engine,
// - the recap fits a phone with no sideways scroll and reads in one centred column at 1280px,
// - the last-day case says in words that the recap counts through today (RAID I-11),
// - a finished review reads back as it was said, with a later entry shown under "Since this recap" and never in its place (R-26),
// - a person who has not chosen their planning day, has no time zone, or is not on their planning day gets no review, and
//   nothing is guessed.
// Any 5xx response from the app fails the spec.

import type { Page } from '@playwright/test';
import { WIDTHS, expect, signUpAndConfirm, test } from './fixtures';
import { REVIEW_TITLES, laToday, seedReview, shiftDay } from './support/reviewSeed';

function watchForServerErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 500) errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  return () => errors;
}

const FULL_WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// "Mon, Oct 19": the same way the app writes a day.
const formatDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

// How far the review's content reaches past the right edge of the screen: nothing inside it may.
const overflowOfReview = (page: Page) =>
  page.evaluate(() => {
    const right = Math.max(0, ...Array.from(document.querySelectorAll('main, main *')).map((el) => el.getBoundingClientRect().right));
    return Math.max(0, Math.ceil(right - window.innerWidth));
  });

const LA = 'America/Los_Angeles';

for (const [name, width] of Object.entries(WIDTHS)) {
  test.describe(`at ${width}px (${name})`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('home points at the review on the planning day, and the recap shows the week from the engine', async ({ page }) => {
      const serverErrors = watchForServerErrors(page);
      const email = await signUpAndConfirm(page, `review-${width}`);
      const seed = await seedReview(email, { closesEarly: false, planning: 'today', timeZone: LA, finished: false });

      await page.goto('/');
      const notice = page.getByRole('region', { name: 'Weekly review' });
      await expect(notice.getByText('Your week is ready to look back on.')).toBeVisible();
      await page.waitForLoadState('networkidle');
      await notice.getByRole('link', { name: 'See your weekly review' }).click();
      await expect(page).toHaveURL(/\/review$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Weekly review' })).toBeVisible();

      // The week, as dates.
      await expect(page.getByText(`${formatDay(seed.window.start)} to ${formatDay(seed.window.end)}`)).toBeVisible();

      // The goal and its target as the week ended: the level in words, "that week", how far short of the aspiration, and when
      // the floor was reached. Two workouts against a floor of 2 and an aspiration of 4.
      const goal = page.getByRole('region', { name: REVIEW_TITLES.goal });
      await expect(goal).toBeVisible();
      await expect(goal.getByRole('heading', { name: REVIEW_TITLES.workouts })).toBeVisible();
      await expect(goal.getByText('Floor met')).toBeVisible();
      await expect(goal.getByText('that week', { exact: true })).toBeVisible();
      await expect(goal.getByText('2 short of your aspiration that week')).toBeVisible();
      await expect(goal.getByText(`Reached your floor on ${formatDay(shiftDay(seed.window.start, 2))}`)).toBeVisible();

      // The priority, in the person's own words, with no score. Nothing asked, nothing in the way of closing the page.
      const priorities = page.getByRole('region', { name: 'Priorities you named' });
      await expect(priorities.getByText(REVIEW_TITLES.priority)).toBeVisible();
      await expect(priorities.getByText('In your own words. They have no score.')).toBeVisible();
      await expect(page.locator('main')).not.toContainText('%');
      await expect(page.locator('main')).not.toContainText('counts through today');
      await expect(page.locator('main').getByRole('button')).toHaveCount(0);
      // No Claude call: layer 2's offer and layer 3's adjustment are not on this screen yet.
      await expect(page.locator('main')).not.toContainText(/reflect|adjust|re-baseline/i);

      const main = await page.locator('main').boundingBox();
      if (width === WIDTHS.phone) {
        expect(await overflowOfReview(page)).toBe(0);
        expect(main?.width ?? 0).toBeLessThanOrEqual(width);
      } else {
        // One centred reading column, not the three-column home.
        expect(main?.width ?? 0).toBeLessThanOrEqual(700);
        expect(main?.x ?? 0).toBeGreaterThan(200);
      }
      expect(serverErrors()).toEqual([]);
    });
  });
}

test.describe('the other situations a person can be in (390px)', () => {
  test.use({ viewport: { width: WIDTHS.phone, height: 900 } });

  test('a week that ends today is closed early, and the recap says so in words', async ({ page }) => {
    const serverErrors = watchForServerErrors(page);
    const email = await signUpAndConfirm(page, 'review-early');
    const seed = await seedReview(email, { closesEarly: true, planning: 'today', timeZone: LA, finished: false });

    await page.goto('/review');
    await expect(
      page.getByText(`This recap counts through today, ${FULL_WEEKDAY[seed.weekday]}. Anything you log later today will show below under Since this recap.`),
    ).toBeVisible();
    await expect(page.getByText(`${formatDay(seed.window.start)} to ${formatDay(seed.today)}`)).toBeVisible();
    await expect(page.getByRole('region', { name: REVIEW_TITLES.goal }).getByText('Floor met')).toBeVisible();
    expect(await overflowOfReview(page)).toBe(0);
    expect(serverErrors()).toEqual([]);
  });

  test('a finished review reads back as it was said, and a later entry is shown under "Since this recap"', async ({ page }) => {
    const serverErrors = watchForServerErrors(page);
    const email = await signUpAndConfirm(page, 'review-finished');
    const seed = await seedReview(email, { closesEarly: false, planning: 'today', timeZone: LA, finished: true });

    // Home says it is done, and offers the way back to it.
    await page.goto('/');
    const notice = page.getByRole('region', { name: 'Weekly review' });
    await expect(notice.getByText("This week's review is done.")).toBeVisible();
    await page.waitForLoadState('networkidle');
    await notice.getByRole('link', { name: 'See it' }).click();
    await expect(page).toHaveURL(/\/review$/);

    await expect(page.getByText(`You finished this review on ${formatDay(seed.today)}. It stays as it was said.`)).toBeVisible();
    // The record says one workout, partway; two are logged now. The card is the record's, never the live week's.
    const goal = page.getByRole('region', { name: REVIEW_TITLES.goal });
    await expect(goal.getByText('Partway · 1 to floor')).toBeVisible();
    await expect(goal.getByText('Floor met')).toHaveCount(0);
    // The later entry is said beside it, in words, with both numbers.
    const since = page.getByRole('heading', { name: 'Since this recap' }).locator('xpath=ancestor::section[1]');
    await expect(since.getByText(`Week of ${formatDay(seed.window.start)}`)).toBeVisible();
    await expect(
      since.getByText('Workouts: it now reads 2 (floor met). The recap said 1 (partway). An entry logged later for a day in that week changed it.'),
    ).toBeVisible();
    // Nothing offers to review again.
    await expect(page.locator('main').getByRole('button')).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText(/review again|start your review/i);
    expect(await overflowOfReview(page)).toBe(0);
    expect(serverErrors()).toEqual([]);
  });

  test('a person who has not chosen their planning day gets no review, and is told so', async ({ page }) => {
    const serverErrors = watchForServerErrors(page);
    const email = await signUpAndConfirm(page, 'review-noplan');
    await seedReview(email, { closesEarly: false, planning: null, timeZone: LA, finished: false });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('region', { name: 'Weekly review' })).toHaveCount(0);

    await page.goto('/review');
    await expect(
      page.getByText('Choose the day your week starts and the day you plan it, and your weekly review will come on that day. Nothing is guessed.'),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open settings' })).toHaveAttribute('href', '/settings');
    await expect(page.getByRole('region', { name: REVIEW_TITLES.goal })).toHaveCount(0);
    expect(serverErrors()).toEqual([]);
  });

  test('a person with no time zone is asked for it, and nothing is graded or guessed', async ({ page }) => {
    const serverErrors = watchForServerErrors(page);
    const email = await signUpAndConfirm(page, 'review-nozone');
    await seedReview(email, { closesEarly: false, planning: 'today', timeZone: null, finished: false });

    await page.goto('/review');
    await expect(page.getByText('Set your time zone to get a weekly review. Nothing is graded until you do, and nothing is guessed.')).toBeVisible();
    await expect(page.getByRole('region', { name: REVIEW_TITLES.goal })).toHaveCount(0);
    expect(serverErrors()).toEqual([]);
  });

  test('on any other day the review says which day it comes on, and home shows no notice', async ({ page }) => {
    const serverErrors = watchForServerErrors(page);
    const email = await signUpAndConfirm(page, 'review-notdue');
    await seedReview(email, { closesEarly: false, planning: 'tomorrow', timeZone: LA, finished: false });
    const tomorrow = FULL_WEEKDAY[(laToday().weekday + 1) % 7];

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('region', { name: 'Weekly review' })).toHaveCount(0);

    await page.goto('/review');
    await expect(page.getByText(`Your weekly review comes on ${tomorrow}s, the day you chose to plan your week.`)).toBeVisible();
    await expect(page.getByRole('region', { name: REVIEW_TITLES.goal })).toHaveCount(0);
    expect(serverErrors()).toEqual([]);
  });

  test('a signed-out visitor is sent to sign in, and sees none of it', async ({ page }) => {
    await page.goto('/review');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(REVIEW_TITLES.priority)).toHaveCount(0);
  });
});
