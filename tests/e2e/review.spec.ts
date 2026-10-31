// The weekly review's layer 1 recap in a real browser against the local stack (MOM-113 block 3.2), at 390px (a phone) and
// 1280px, from brand-new throwaway accounts given the rows setup will one day create (tests/e2e/support/reviewSeed.ts). The
// dates follow the real clock in Los Angeles, because the app reads it. What this proves that the component tests cannot:
// - home shows the one-line notice on the person's planning day and it leads to /review, which reads the person's own rows
//   through row level security and renders every number from the engine,
// - the recap fits a phone with no sideways scroll and reads in one centred column at 1280px,
// - the last-day case says in words that the recap counts through today (RAID I-11),
// - a finished review reads back as it was said, with a later entry shown under "Since this recap" and never in its place (R-26),
// - a person who has not chosen their planning day, has no time zone, or is not on their planning day gets no review, and
//   nothing is guessed,
// - (block 3.3) the whole sitting through the real screen, server actions, services, budget and database, with the FAKE model of
//   tests/e2e/support/fakeAnthropic.ts answering as Claude (no paid call, no key): nothing is asked of Claude until the person
//   taps, the request carries only their target title, one finish stores the review once with their choice, and a reply that
//   fails code's checks is replaced by a plain line from Momentum; the review depth and the planning setting are followed,
// - (block 3.4) "Still right for you?" through the real screen, services and database at 390px: it asks about the setup suggestions on a
//   target's numbers in layer 3's place, stores each answer once with the review, and "No, change it" opens MOM-146's form and settles the target.
// Any 5xx response from the app fails the spec.

import type { Page } from '@playwright/test';
import { WIDTHS, expect, signUpAndConfirm, test } from './fixtures';
import { FAKE_MODEL_PORT } from './support/localStack';
import { REVIEW_TITLES, laToday, readFinishedReviews, readStartingPoints, readTargetChanges, seedReview, shiftDay } from './support/reviewSeed';

// What the fake model has been asked (tests/e2e/support/fakeAnthropic.ts): how many weekly-review lines, and the facts of the newest.
const fakeLast = async (): Promise<{ reviewRequests: number; lastReviewFacts: string }> =>
  (await fetch(`http://127.0.0.1:${FAKE_MODEL_PORT}/__fake/last`)).json() as Promise<{ reviewRequests: number; lastReviewFacts: string }>;
const fakeReviewMode = async (mode: 'good' | 'bad'): Promise<void> => {
  await fetch(`http://127.0.0.1:${FAKE_MODEL_PORT}/__fake/review?mode=${mode}`, { method: 'POST' });
};

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

// A day as the app writes it after a change: "Mon, Nov 2", with the year only when it is not this year.
const dayWords = (day: string) => {
  const words = formatDay(day);
  return day.slice(0, 4) === laToday().today.slice(0, 4) ? words : `${words}, ${day.slice(0, 4)}`;
};

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
      // The recap itself asks for nothing. What follows it (the sitting) is where anything is asked.
      await expect(page.getByRole('region', { name: "This week's recap" }).getByRole('button')).toHaveCount(0);
      // A week that ended at the floor raises nothing for layer 3, and no line is asked for until the person taps.
      await expect(page.getByText('Nothing to adjust this week.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Get a one-line look back from Claude' })).toBeVisible();
      await expect(page.getByRole('radiogroup')).toHaveCount(0);

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

    test('the whole sitting: a line when asked for, one question, one finish, then the week plan (MOM-113 block 3.3)', async ({ page }) => {
      const serverErrors = watchForServerErrors(page);
      const email = await signUpAndConfirm(page, `sitting-${width}`);
      // No workout in the reviewed week or the two before it: the floor is missed three weeks running, so layer 3 raises the
      // slipping check-in.
      const seed = await seedReview(email, { closesEarly: false, planning: 'today', timeZone: LA, finished: false, week: 'none' });
      await fakeReviewMode('good');
      const before = (await fakeLast()).reviewRequests;

      await page.goto('/review');
      await page.waitForLoadState('networkidle');

      // Layer 2 is there to ask for, and nothing has been asked of Claude.
      const lineCard = page.getByRole('region', { name: 'A one-line look back' });
      await expect(lineCard.getByText(/Optional\. Claude writes one plain sentence about your week/)).toBeVisible();
      expect((await fakeLast()).reviewRequests).toBe(before);

      // Layer 3: the engine's one question with three equal choices; the finish waits for one of them.
      const question = page.getByRole('region', { name: 'One thing to decide' });
      await expect(question.getByRole('heading', { name: `Want to change anything about “${REVIEW_TITLES.workouts}”?` })).toBeVisible();
      await expect(question.getByText(/weeks in a row/)).toBeVisible();
      await expect(question.getByRole('radio')).toHaveCount(3);
      // The finish is not there until the question is answered (MOM-146): no button that cannot be used.
      await expect(page.getByRole('button', { name: 'Finish review' })).toHaveCount(0);
      if (width === WIDTHS.phone) expect(await overflowOfReview(page)).toBe(0);

      // Tap for the line: one request, which carries the person's own target title and nothing about the goal, a priority or a number.
      await lineCard.getByRole('button', { name: 'Get a one-line look back from Claude' }).click();
      await expect(lineCard.getByText(`You kept ${REVIEW_TITLES.workouts} going through the week.`)).toBeVisible();
      await expect(lineCard.getByText('From Claude.')).toBeVisible();
      await expect(lineCard.getByRole('button')).toHaveCount(0);
      const after = await fakeLast();
      expect(after.reviewRequests).toBe(before + 1);
      expect(after.lastReviewFacts).toContain(REVIEW_TITLES.workouts);
      expect(after.lastReviewFacts).not.toContain(REVIEW_TITLES.goal);
      expect(after.lastReviewFacts).not.toContain(REVIEW_TITLES.priority);
      expect(after.lastReviewFacts).not.toMatch(/\d/);

      // "Yes" opens the edit of that target in the same card (MOM-146). A number left empty is answered by one callout that names it.
      await question.getByRole('radio', { name: 'Yes, I want to change it' }).click();
      const edit = question.getByRole('form', { name: 'Change this target' });
      await expect(edit.getByText('In a hard week, how many workouts would still count?')).toBeVisible();
      await expect(edit.getByText('Now: 2. Last week you did 0.')).toBeVisible();
      // The reviewed week ended yesterday and the person's week began today, so the change starts today: the week right after the
      // reviewed one, which is also the week they are in. Weeks before it keep their numbers.
      const startsOn = seed.today;
      await expect(edit.getByText(`This starts ${dayWords(startsOn)}. Weeks before that keep the numbers they had.`)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Finish review' })).toHaveCount(0);
      await edit.getByRole('textbox', { name: /would still count/ }).fill('');
      await edit.getByRole('button', { name: 'Save the change' }).click();
      await expect(edit.getByRole('alert')).toHaveText('Enter a number above 0.');
      await expect(edit.getByRole('textbox', { name: /would still count/ })).toBeFocused();
      if (width === WIDTHS.phone) expect(await overflowOfReview(page)).toBe(0);

      // Save new numbers: the sentence says what was saved and from when, and only then is there something to finish.
      await edit.getByRole('textbox', { name: /would still count/ }).fill('3');
      await edit.getByRole('textbox', { name: /hoping for/ }).fill('5');
      await edit.getByRole('button', { name: 'Save the change' }).click();
      await expect(question.getByText(`Saved. From ${dayWords(startsOn)}: 3 workouts in a hard week, hoping for 5.`)).toBeVisible();
      await expect(question.getByRole('form')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Finish review' })).toBeEnabled();
      expect(await readTargetChanges(email)).toEqual([{ effective_from: startsOn, floor: 3, aspiration: 5, slot_weekdays: null }]);
      if (width === WIDTHS.phone) expect(await overflowOfReview(page)).toBe(0);

      // Finish once. The page reads back as a finished review, and planning follows in the same sitting as a link.
      await page.getByRole('button', { name: 'Finish review' }).click();
      await expect(page.getByText('You finished this review today. It stays as it was said.')).toBeVisible();
      const next = page.getByRole('region', { name: 'Plan your week' });
      await expect(next.getByText("Your review is done. Next, choose what you'll do on which days.")).toBeVisible();
      await expect(next.getByRole('link', { name: 'Plan your week' })).toHaveAttribute('href', '/plan');
      await expect(page.locator('main').getByRole('button')).toHaveCount(0);
      if (width === WIDTHS.phone) expect(await overflowOfReview(page)).toBe(0);

      // Stored once, with the choice, for kill criterion 4; a reload offers nothing to finish again.
      expect(await readFinishedReviews(email)).toEqual([{ week_start: seed.window.start, adjustment_kind: 'slipping_check_in', adjustment_outcome: 'changed' }]);
      await page.reload();
      await expect(page.getByText('You finished this review today. It stays as it was said.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Finish review' })).toHaveCount(0);
      // The reviewed week keeps the numbers it was judged by: nothing on the finished review says the new numbers.
      await expect(page.getByText(/3 workouts in a hard week/)).toHaveCount(0);

      // And the change shows on home: it started today, so the new numbers are the ones in force, and the slipping note no longer sends
      // the person to a review they have just finished.
      await page.goto('/');
      await expect(page.getByText('Floor 3 a week · aspiration 5')).toBeVisible();
      await expect(page.getByText('Under the floor 3 weeks running.', { exact: true })).toBeVisible();
      await expect(page.getByText(/Worth a look at your weekly review/)).toHaveCount(0);
      if (width === WIDTHS.phone) expect(await overflowOfReview(page)).toBe(0);
      expect(serverErrors()).toEqual([]);
    });
  });
}

test.describe('the sitting in the situations a person can be in (390px)', () => {
  test.use({ viewport: { width: WIDTHS.phone, height: 900 } });

  test('"Never mind" saves nothing and goes back to the three choices, and "Ask me again next week" is stored as skipped (MOM-146)', async ({ page }) => {
    const serverErrors = watchForServerErrors(page);
    const email = await signUpAndConfirm(page, 'sitting-nevermind');
    const seed = await seedReview(email, { closesEarly: false, planning: 'today', timeZone: LA, finished: false, week: 'none' });
    await page.goto('/review');
    await page.waitForLoadState('networkidle');
    const question = page.getByRole('region', { name: 'One thing to decide' });
    await question.getByRole('radio', { name: 'Yes, I want to change it' }).click();
    await expect(question.getByRole('form', { name: 'Change this target' })).toBeVisible();
    await question.getByRole('button', { name: 'Never mind' }).click();
    await expect(question.getByRole('form')).toHaveCount(0);
    await expect(question.getByRole('radio', { checked: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Finish review' })).toHaveCount(0);
    expect(await readTargetChanges(email)).toEqual([]);

    await question.getByRole('radio', { name: 'Ask me again next week' }).click();
    await expect(question.getByText("Okay. I'll ask again next week.")).toBeVisible();
    await page.getByRole('button', { name: 'Finish review' }).click();
    await expect(page.getByText('You finished this review today. It stays as it was said.')).toBeVisible();
    expect(await readFinishedReviews(email)).toEqual([{ week_start: seed.window.start, adjustment_kind: 'slipping_check_in', adjustment_outcome: 'skipped' }]);
    expect(await readTargetChanges(email)).toEqual([]);
    expect(serverErrors()).toEqual([]);
  });

  test('"Still right for you?" takes the place of layer 3\'s question at the review, and each answer is stored once with it (MOM-113 block 3.4)', async ({ page }) => {
    const serverErrors = watchForServerErrors(page);
    const email = await signUpAndConfirm(page, 'sitting-still-right');
    // A slipping week would raise layer 3's check-in; the two suggestions take its place for this sitting.
    const seed = await seedReview(email, { closesEarly: false, planning: 'today', timeZone: LA, finished: false, week: 'none', suggestions: ['floor', 'aspiration'] });
    await page.goto('/review');
    await page.waitForLoadState('networkidle');
    const card = page.getByRole('region', { name: 'Still right for you?' });
    await expect(card.getByRole('heading', { name: 'Still right for you?' })).toBeVisible();
    await expect(card.getByText('At setup you took these as suggestions instead of saying them yourself. Does each one still fit?')).toBeVisible();
    await expect(page.getByRole('region', { name: 'One thing to decide' })).toHaveCount(0);
    await expect(card.getByRole('heading', { name: 'Workouts', level: 3 })).toHaveCount(1);
    await expect(card.getByText('2 workouts in a hard week still count.')).toBeVisible();
    await expect(card.getByText('Hoping for 4 workouts a week.')).toBeVisible();
    await expect(card.getByRole('radio', { checked: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Finish review' })).toHaveCount(0);
    expect(await overflowOfReview(page)).toBe(0);

    await card.getByRole('radiogroup', { name: 'Workouts: 2 workouts in a hard week still count' }).getByRole('radio', { name: 'Yes, it fits' }).click();
    await expect(page.getByRole('button', { name: 'Finish review' })).toHaveCount(0);
    await card.getByRole('radiogroup', { name: 'Workouts: Hoping for 4 workouts a week' }).getByRole('radio', { name: 'Yes, it fits' }).click();
    await expect(card.getByRole('radio', { checked: true })).toHaveCount(2);
    await page.getByRole('button', { name: 'Finish review' }).click();
    await expect(page.getByText('You finished this review today. It stays as it was said.')).toBeVisible();

    expect(await readFinishedReviews(email)).toEqual([{ week_start: seed.window.start, adjustment_kind: 'still_right', adjustment_outcome: 'declined' }]);
    expect(await readStartingPoints(email)).toEqual([
      { field: 'floor', outcome: 'kept', answered: true },
      { field: 'aspiration', outcome: 'kept', answered: true },
    ]);
    expect(await readTargetChanges(email)).toEqual([]);
    expect(serverErrors()).toEqual([]);
  });

  test('"No, change it" opens the form, a saved change settles the target, and both suggestions are recorded as changed (MOM-113 block 3.4)', async ({ page }) => {
    const serverErrors = watchForServerErrors(page);
    const email = await signUpAndConfirm(page, 'sitting-still-right-change');
    const seed = await seedReview(email, { closesEarly: false, planning: 'today', timeZone: LA, finished: false, week: 'none', suggestions: ['floor', 'aspiration'] });
    await page.goto('/review');
    await page.waitForLoadState('networkidle');
    const card = page.getByRole('region', { name: 'Still right for you?' });
    await card.getByRole('radiogroup', { name: 'Workouts: Hoping for 4 workouts a week' }).getByRole('radio', { name: 'No, change it' }).click();
    const edit = card.getByRole('form', { name: 'Change this target' });
    await expect(edit).toBeVisible();
    await expect(page.getByRole('button', { name: 'Finish review' })).toHaveCount(0);
    await edit.getByRole('textbox', { name: /would still count/ }).fill('3');
    await edit.getByRole('textbox', { name: /hoping for/ }).fill('5');
    await edit.getByRole('button', { name: 'Save the change' }).click();
    await expect(card.getByText(/^Saved\. From /)).toBeVisible();
    await expect(card.getByRole('form')).toHaveCount(0);
    // The target is settled: both rows are the person's change and neither can say the opposite.
    await expect(card.getByRole('radio', { checked: true })).toHaveCount(2);
    for (const radio of await card.getByRole('radio').all()) await expect(radio).toBeDisabled();
    await page.getByRole('button', { name: 'Finish review' }).click();
    await expect(page.getByText('You finished this review today. It stays as it was said.')).toBeVisible();

    expect(await readFinishedReviews(email)).toEqual([{ week_start: seed.window.start, adjustment_kind: 'still_right', adjustment_outcome: 'changed' }]);
    expect(await readStartingPoints(email)).toEqual([
      { field: 'floor', outcome: 'changed', answered: true },
      { field: 'aspiration', outcome: 'changed', answered: true },
    ]);
    expect(await readTargetChanges(email)).toEqual([expect.objectContaining({ floor: 3, aspiration: 5 })]);
    expect(serverErrors()).toEqual([]);
  });

  test('a reply that fails the checks twice is replaced by a plain line from Momentum, and says so', async ({ page }) => {
    const serverErrors = watchForServerErrors(page);
    const email = await signUpAndConfirm(page, 'sitting-fallback');
    const seed = await seedReview(email, { closesEarly: false, planning: 'today', timeZone: LA, finished: false });
    await fakeReviewMode('bad');
    try {
      const before = (await fakeLast()).reviewRequests;
      await page.goto('/review');
      await page.waitForLoadState('networkidle');
      const lineCard = page.getByRole('region', { name: 'A one-line look back' });
      await lineCard.getByRole('button', { name: 'Get a one-line look back from Claude' }).click();
      await expect(lineCard.getByText("From Momentum. Claude's line didn't pass our checks, so this one is plain.")).toBeVisible();
      await expect(lineCard.getByText('Here is how your week ended against your own targets.')).toBeVisible();
      // The first reply and its one retry, and no more.
      expect((await fakeLast()).reviewRequests).toBe(before + 2);
      await expect(lineCard).not.toContainText(/\d/);
      expect(await overflowOfReview(page)).toBe(0);

      // Nothing was raised for layer 3, so the review finishes with no choice, and stores none.
      await expect(page.getByText('Nothing to adjust this week.')).toBeVisible();
      await page.getByRole('button', { name: 'Finish review' }).click();
      await expect(page.getByText('You finished this review today. It stays as it was said.')).toBeVisible();
      expect(await readFinishedReviews(email)).toEqual([{ week_start: seed.window.start, adjustment_kind: null, adjustment_outcome: null }]);
    } finally {
      await fakeReviewMode('good');
    }
    expect(serverErrors()).toEqual([]);
  });

  test('a person who chose the recap only is offered no line, and one who chose to plan separately is not pushed to plan', async ({ page }) => {
    const serverErrors = watchForServerErrors(page);
    const email = await signUpAndConfirm(page, 'sitting-recaponly');
    await seedReview(email, { closesEarly: false, planning: 'today', timeZone: LA, finished: false, reviewDepth: 'recap_only', reviewPlanning: 'separate' });
    const before = (await fakeLast()).reviewRequests;

    await page.goto('/review');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('region', { name: 'A one-line look back' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Get a one-line look back from Claude' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Finish review' }).click();

    await expect(page.getByText('You finished this review today. It stays as it was said.')).toBeVisible();
    const next = page.getByRole('region', { name: 'Plan your week' });
    await expect(next.getByText("You chose to plan your week separately, so it's there when you want it.")).toBeVisible();
    await expect(next.getByRole('link', { name: 'Open your week plan' })).toHaveAttribute('href', '/plan');
    await expect(next.getByRole('heading')).toHaveCount(0);
    expect((await fakeLast()).reviewRequests).toBe(before);
    expect(serverErrors()).toEqual([]);
  });
});

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

    // Finished today, so the app's one casual date formatter says "today" (MOM-111 finding 7).
    await expect(page.getByText('You finished this review today. It stays as it was said.')).toBeVisible();
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
