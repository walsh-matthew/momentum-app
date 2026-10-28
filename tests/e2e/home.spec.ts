// Home's goal model scoreboard in a real browser against the local stack (MOM-112): the week hero and a goal with its
// scoreboard above today's feed, at 390px (a phone) and 1280px, from a brand-new throwaway account given the rows setup
// will one day create (tests/e2e/support/homeSeed.ts). Three more states at 390px: a person who has not set the day their
// week starts, a person with deadline goals only (never asked for it), and a person with no time zone. The old feed stays
// where it is. Any 5xx response from the app fails the spec.

import type { Page } from '@playwright/test';
import { WIDTHS, expect, signUpAndConfirm, test } from './fixtures';
import { HOME_TITLES, seedHome } from './support/homeSeed';

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
      // No forecast verdict until the weekly plan: nothing about whether it fits.
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
  });
}

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
