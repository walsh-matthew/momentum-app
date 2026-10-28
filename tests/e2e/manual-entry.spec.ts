// Manual entry in a real browser against the local stack (MOM-110): one of each way to log, a remove and a restore,
// and un-ticking then ticking a step again, from a brand-new throwaway account, at 390px (a phone) and 1280px. A second
// test checks that logging refuses, in words, until the person has a time zone. The throwaway account is given the
// rows setup will one day create by tests/e2e/support/goalModelSeed.ts, as that person through row level security.
//
// The timer needs at least 30 seconds to log, so the spec starts it through the page and then moves its saved start
// five minutes back (the only thing the browser keeps) rather than waiting. Any 5xx response from the app fails the spec.
//
// MOM-110 part 2 adds: a log on yesterday and on the oldest day the picker offers (shown as a day, not a clock time),
// typed minutes, a first tick on a chosen day that a re-tick keeps, the notice and the label for an entry before its
// goal's start date, and the note when no day end is set. The picker offers only valid days, so a future or too-old
// day cannot be reached from the page; those refusals are proven by tests/entries-service.test.ts.

import type { Page } from '@playwright/test';
import { WIDTHS, expect, signUpAndConfirm, test } from './fixtures';
import { SEED_TITLES, dateFromToday, seedGoalModel } from './support/goalModelSeed';

// Fails the spec at the end if the app answered anything with a server error.
function watchForServerErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 500) errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  return () => errors;
}

const recent = (page: Page) => page.getByRole('region', { name: 'Recent entries' });
const section = (page: Page, title: string) => page.getByRole('region', { name: title, exact: true });

// Opens a target's day picker and chooses a day. `which` is a radio name pattern, or 'oldest' for the last one the
// picker offers. Returns that day's label as the picker names it ("Yesterday, Oct 27" or "Tue, Oct 21").
async function chooseDay(page: Page, title: string, which: RegExp | 'oldest'): Promise<string> {
  await section(page, title).getByRole('button', { name: /Change day/ }).click();
  const group = section(page, title).getByRole('radiogroup');
  const radio = which === 'oldest' ? group.getByRole('radio').last() : group.getByRole('radio', { name: which }).first();
  const label = (await radio.getAttribute('aria-label')) ?? '';
  expect((await radio.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48);
  await radio.click();
  await expect(group).toHaveCount(0);
  return label;
}

// "Oct 27" from "Yesterday, Oct 27" or "Tue, Oct 21".
const dateOf = (label: string) => label.split(', ')[1];

for (const [name, width] of Object.entries(WIDTHS)) {
  test.describe(`at ${width}px (${name})`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('logs a tap, a number, a timer and a tick; removes and restores; un-ticks and ticks again', async ({ page }) => {
      const serverErrors = watchForServerErrors(page);
      const email = await signUpAndConfirm(page, `entry-${width}`);
      const seeded = await seedGoalModel(email, 'America/Los_Angeles');

      await page.goto('/log');
      await expect(page.getByRole('heading', { name: 'Log an entry' })).toBeVisible();
      await expect(page.getByRole('status')).toHaveCount(0);
      await expect(recent(page).getByText('Nothing logged yet.')).toBeVisible();
      await page.waitForLoadState('networkidle');

      // Phone-first: no sideways scroll, and the tap is a large target.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      const tap = page.getByRole('button', { name: `Log one: ${SEED_TITLES.count}` });
      expect((await tap.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48);

      // A tap: one entry of 1, shown in the person's own time zone.
      await tap.click();
      const tapped = recent(page).getByRole('listitem').filter({ hasText: `${SEED_TITLES.count}: +1` });
      await expect(tapped).toHaveCount(1);
      await expect(tapped).toContainText(/P[SD]T/);

      // A number: one number, as typed.
      await page.getByRole('textbox', { name: `Amount in ${SEED_TITLES.unit} for ${SEED_TITLES.quantity}` }).fill('12.5');
      await page.getByRole('button', { name: 'Log it' }).click();
      await expect(recent(page).getByText(`${SEED_TITLES.quantity}: 12.5 ${SEED_TITLES.unit}`)).toBeVisible();
      await expect(page.getByRole('textbox', { name: `Amount in ${SEED_TITLES.unit} for ${SEED_TITLES.quantity}` })).toHaveValue('');

      // A timer: start it through the page, move the saved start five minutes back, reload, stop.
      await page.getByRole('button', { name: `Start timer: ${SEED_TITLES.time}` }).click();
      await expect(page.getByRole('button', { name: `Stop timer: ${SEED_TITLES.time}` })).toBeVisible();
      await page.evaluate(
        ([key, value]) => window.localStorage.setItem(key, value),
        [`momentum:timer:${seeded.targets.time}`, new Date(Date.now() - 5 * 60_000).toISOString()],
      );
      await page.reload();
      await page.getByRole('button', { name: `Stop timer: ${SEED_TITLES.time}` }).click();
      await expect(recent(page).getByText(`${SEED_TITLES.time}: 5 min`)).toBeVisible();
      await expect(page.getByRole('button', { name: `Start timer: ${SEED_TITLES.time}` })).toBeVisible();

      // A tick, then un-tick, then tick again: one entry the whole time.
      const step = page.getByRole('checkbox', { name: SEED_TITLES.steps[0] });
      await expect(step).toHaveAttribute('aria-checked', 'false');
      await step.click();
      await expect(step).toHaveAttribute('aria-checked', 'true');
      const ticked = recent(page).getByRole('listitem').filter({ hasText: `Ticked: ${SEED_TITLES.steps[0]}` });
      await expect(ticked).toHaveCount(1);
      await expect(ticked.getByText('Removed', { exact: true })).toHaveCount(0);

      await step.click();
      await expect(step).toHaveAttribute('aria-checked', 'false');
      await expect(ticked).toHaveCount(1);
      await expect(ticked.getByText('Removed', { exact: true })).toHaveCount(1);

      await step.click();
      await expect(step).toHaveAttribute('aria-checked', 'true');
      await expect(ticked).toHaveCount(1);
      await expect(ticked.getByText('Removed', { exact: true })).toHaveCount(0);

      // Remove the tapped entry, then restore it.
      await page.getByRole('button', { name: `Remove ${SEED_TITLES.count}: +1` }).click();
      await expect(tapped.getByText('Removed', { exact: true })).toHaveCount(1);
      await page.getByRole('button', { name: `Restore ${SEED_TITLES.count}: +1` }).click();
      await expect(tapped.getByText('Removed', { exact: true })).toHaveCount(0);
      await expect(tapped).toHaveCount(1);

      // It all survives a reload: four entries, the tick still ticked, and nothing removed.
      await page.reload();
      await expect(recent(page).getByRole('listitem')).toHaveCount(4);
      await expect(recent(page).getByText('Removed', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('checkbox', { name: SEED_TITLES.steps[0] })).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByRole('checkbox', { name: SEED_TITLES.steps[1] })).toHaveAttribute('aria-checked', 'false');

      expect(serverErrors(), 'server errors from the app').toEqual([]);
    });

    test('logs on a chosen day, with typed minutes, and a first tick on a chosen day that a re-tick keeps', async ({ page }) => {
      const serverErrors = watchForServerErrors(page);
      const email = await signUpAndConfirm(page, `entry-day-${width}`);
      await seedGoalModel(email, 'America/Los_Angeles');

      await page.goto('/log');
      await expect(page.getByRole('heading', { name: 'Log an entry' })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('status')).toHaveCount(0);

      // A tap on yesterday: shown as that day, not as a made-up clock time, and the picker goes back to today.
      const yesterday = await chooseDay(page, SEED_TITLES.count, /^Yesterday,/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      await page.getByRole('button', { name: `Log one: ${SEED_TITLES.count}` }).click();
      const tapped = recent(page).getByRole('listitem').filter({ hasText: `${SEED_TITLES.count}: +1` });
      await expect(tapped).toHaveCount(1);
      await expect(tapped).toContainText(dateOf(yesterday));
      await expect(tapped).toContainText('the day you chose');
      await expect(tapped).not.toContainText(/AM|PM/);
      await expect(section(page, SEED_TITLES.count).getByRole('button', { name: /When: Today/ })).toBeVisible();

      // A number on the oldest day the picker offers (7 days back).
      const oldest = await chooseDay(page, SEED_TITLES.quantity, 'oldest');
      await page.getByRole('textbox', { name: `Amount in ${SEED_TITLES.unit} for ${SEED_TITLES.quantity}` }).fill('3');
      await page.getByRole('button', { name: 'Log it' }).click();
      const numbered = recent(page).getByRole('listitem').filter({ hasText: `${SEED_TITLES.quantity}: 3 ${SEED_TITLES.unit}` });
      await expect(numbered).toHaveCount(1);
      await expect(numbered).toContainText(oldest);
      await expect(numbered).toContainText('the day you chose');

      // Typed minutes on a time target: one entry with that value, now; then again on a chosen day.
      const minutes = page.getByRole('textbox', { name: `Minutes for ${SEED_TITLES.time}` });
      expect(await minutes.getAttribute('inputmode')).toBe('numeric');
      await minutes.fill('45');
      await page.getByRole('button', { name: 'Log minutes' }).click();
      const nowMinutes = recent(page).getByRole('listitem').filter({ hasText: `${SEED_TITLES.time}: 45 min` });
      await expect(nowMinutes).toHaveCount(1);
      await expect(nowMinutes).toContainText(/P[SD]T/);
      await expect(minutes).toHaveValue('');

      const twoDays = await chooseDay(page, SEED_TITLES.time, /^[A-Z][a-z]{2},/);
      await minutes.fill('20');
      await page.getByRole('button', { name: 'Log minutes' }).click();
      const dayMinutes = recent(page).getByRole('listitem').filter({ hasText: `${SEED_TITLES.time}: 20 min` });
      await expect(dayMinutes).toHaveCount(1);
      await expect(dayMinutes).toContainText(twoDays);

      // Typed minutes that are not whole minutes are refused in words and log nothing.
      await minutes.fill('1.5');
      await page.getByRole('button', { name: 'Log minutes' }).click();
      await expect(section(page, SEED_TITLES.time).getByRole('alert')).toContainText('Enter a whole number of minutes');
      await expect(recent(page).getByRole('listitem').filter({ hasText: `${SEED_TITLES.time}:` })).toHaveCount(2);
      await minutes.fill('');

      // A first tick on a chosen day. Un-tick and tick again keeps the one entry and its day.
      const tickDay = await chooseDay(page, SEED_TITLES.checklist, /^Yesterday,/);
      const step = page.getByRole('checkbox', { name: SEED_TITLES.steps[0] });
      await step.click();
      await expect(step).toHaveAttribute('aria-checked', 'true');
      const ticked = recent(page).getByRole('listitem').filter({ hasText: `Ticked: ${SEED_TITLES.steps[0]}` });
      await expect(ticked).toHaveCount(1);
      await expect(ticked).toContainText(dateOf(tickDay));
      await step.click();
      await expect(step).toHaveAttribute('aria-checked', 'false');
      await chooseDay(page, SEED_TITLES.checklist, 'oldest');
      await step.click();
      await expect(step).toHaveAttribute('aria-checked', 'true');
      await expect(ticked).toHaveCount(1);
      await expect(ticked).toContainText(dateOf(tickDay));
      await expect(ticked.getByText('Removed', { exact: true })).toHaveCount(0);

      // Nothing here was before the goal's start, so there is no notice and no label anywhere.
      await expect(page.getByRole('status')).toHaveCount(0);
      await expect(recent(page).getByText('not counted')).toHaveCount(0);

      // It all survives a reload: five entries, each still on its day.
      await page.reload();
      await expect(recent(page).getByRole('listitem')).toHaveCount(5);
      await expect(recent(page).getByText('the day you chose')).toHaveCount(4);
      await expect(page.getByRole('checkbox', { name: SEED_TITLES.steps[0] })).toHaveAttribute('aria-checked', 'true');

      expect(serverErrors(), 'server errors from the app').toEqual([]);
    });

    test('saves a log before the goal’s start, says so in words, and labels it not counted', async ({ page }) => {
      const serverErrors = watchForServerErrors(page);
      const email = await signUpAndConfirm(page, `entry-start-${width}`);
      // The goal started two days ago: a log now is on or after it; a log 7 days back is before it.
      await seedGoalModel(email, 'America/Los_Angeles', { startDate: dateFromToday(-2) });

      await page.goto('/log');
      await page.waitForLoadState('networkidle');
      const tap = page.getByRole('button', { name: `Log one: ${SEED_TITLES.count}` });

      await tap.click();
      await expect(recent(page).getByRole('listitem').filter({ hasText: `${SEED_TITLES.count}: +1` })).toHaveCount(1);
      await expect(page.getByRole('status')).toHaveCount(0);

      const oldest = await chooseDay(page, SEED_TITLES.count, 'oldest');
      await tap.click();
      await expect(section(page, SEED_TITLES.count).getByRole('status')).toContainText(
        /Saved\. It's before this goal's start date \(\w{3} \d{1,2}\), so it won't count unless you move the start date earlier\./,
      );
      const early = recent(page).getByRole('listitem').filter({ hasText: 'the day you chose' });
      await expect(early).toHaveCount(1);
      await expect(early).toContainText(oldest);
      await expect(early).toContainText("Before the goal's start, not counted");
      await expect(recent(page).getByText("Before the goal's start, not counted")).toHaveCount(1);

      // The label stays after a reload, and the notice was only for that log.
      await page.reload();
      await expect(recent(page).getByText("Before the goal's start, not counted")).toHaveCount(1);
      await expect(page.getByRole('status')).toHaveCount(0);

      expect(serverErrors(), 'server errors from the app').toEqual([]);
    });

    test('says so for a log made now, before a goal that starts in a few days', async ({ page }) => {
      const serverErrors = watchForServerErrors(page);
      const email = await signUpAndConfirm(page, `entry-future-${width}`);
      await seedGoalModel(email, 'America/Los_Angeles', { startDate: dateFromToday(3) });

      await page.goto('/log');
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: `Log one: ${SEED_TITLES.count}` }).click();
      await expect(section(page, SEED_TITLES.count).getByRole('status')).toContainText("Saved. It's before this goal's start date");
      await expect(recent(page).getByText("Before the goal's start, not counted")).toHaveCount(1);

      expect(serverErrors(), 'server errors from the app').toEqual([]);
    });

    test('offers no other day until a day end is set, and still logs for now', async ({ page }) => {
      const serverErrors = watchForServerErrors(page);
      const email = await signUpAndConfirm(page, `entry-noend-${width}`);
      await seedGoalModel(email, 'America/Los_Angeles', { dayEnd: null });

      await page.goto('/log');
      await expect(page.getByRole('status')).toContainText('No day end is set yet');
      await expect(page.getByRole('button', { name: /Change day/ })).toHaveCount(0);
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: `Log one: ${SEED_TITLES.count}` }).click();
      await expect(recent(page).getByRole('listitem').filter({ hasText: `${SEED_TITLES.count}: +1` })).toHaveCount(1);
      // Typed minutes still work for now.
      await page.getByRole('textbox', { name: `Minutes for ${SEED_TITLES.time}` }).fill('10');
      await page.getByRole('button', { name: 'Log minutes' }).click();
      await expect(recent(page).getByRole('listitem').filter({ hasText: `${SEED_TITLES.time}: 10 min` })).toHaveCount(1);

      expect(serverErrors(), 'server errors from the app').toEqual([]);
    });

    test('refuses to log, in words, until a time zone is set', async ({ page }) => {
      const serverErrors = watchForServerErrors(page);
      const email = await signUpAndConfirm(page, `entry-nozone-${width}`);
      await seedGoalModel(email, null);

      await page.goto('/log');
      await expect(page.getByRole('status')).toContainText('No time zone is set yet');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: `Log one: ${SEED_TITLES.count}` }).click();
      await expect(page.getByRole('main').getByRole('alert')).toContainText('Set your time zone before logging');
      await page.getByRole('checkbox', { name: SEED_TITLES.steps[0] }).click();
      await expect(page.getByRole('main').getByRole('alert')).toHaveCount(2);
      await expect(page.getByRole('checkbox', { name: SEED_TITLES.steps[0] })).toHaveAttribute('aria-checked', 'false');

      // Nothing was logged, and nothing was guessed.
      await page.reload();
      await expect(recent(page).getByText('Nothing logged yet.')).toBeVisible();

      expect(serverErrors(), 'server errors from the app').toEqual([]);
    });
  });
}
