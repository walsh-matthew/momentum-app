// Adding a goal, and a target for a goal the person already has, after their first setup (MOM-132 part 2), end to end on the local stack at
// 390px and 1280px: a throwaway account with a saved setup (tests/e2e/support/homeSeed.ts) goes through the real screens, server actions,
// service, budget and database, with the FAKE model of tests/e2e/support/fakeAnthropic.ts answering as Claude (no paid call, no key). The
// person's lines come from the returning eval cases the fake replays, which `npm test` already checked against the same rules the app
// applies. It checks that:
// - home offers "Add to your goals" once setup is saved, /setup asks what to add instead of "Setup is already done", and nothing asks
//   Claude until a tap;
// - a returning conversation asks nothing about the person's days or settings, and what is sent to Claude names no saved value;
// - an added goal shows on home once, beside the goal that was there, whose numbers are exactly as they were, even after a double tap on
//   "Add it" and a first attempt that never reached the server;
// - a target added to a goal that has already started is graded only from its own start: home says when it starts, a start before the
//   goal started is refused in words, and the older targets are not touched.
// With SETUP_ADD_SHOT_DIR set to a folder outside the repo it also saves screenshots of each screen (E2E_COLOR_SCHEME=dark for the dark
// set), for the owner to read before the commit.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { MACHINE_DATE, casualDate, dateInZone } from '@/lib/dates/casual';
import { RETURNING_FIRST_LINE } from '@/lib/setup/returning';
import { PROPOSAL_YES_TEXT, TYPE_INSTEAD } from '@/lib/setup/session';
import { WIDTHS, expect, signUpAndConfirm, test } from './fixtures';
import { HOME_TITLES, seedHome } from './support/homeSeed';
import { FAKE_MODEL_PORT } from './support/localStack';
import { elementsOffScreen } from './support/setupCards';
import { SEEDED_GOAL_TITLE, SWIMS, addGoalCase, addTargetFor } from './support/setupConversation';

const ZONE = 'America/Los_Angeles';
const CARD = 'h2#setup-question, h2#setup-playback, h2#setup-final, h2#setup-retry, h2#setup-quick-path, h2#setup-start';
const SHOTS = process.env.SETUP_ADD_SHOT_DIR;
const THEME = process.env.E2E_COLOR_SCHEME === 'dark' ? 'dark' : 'light';

interface FakeLast {
  setupRequests: number;
  lastSetupUserText: string;
}
const fakeLast = async (): Promise<FakeLast> => (await fetch(`http://127.0.0.1:${FAKE_MODEL_PORT}/__fake/last`)).json() as Promise<FakeLast>;

const addDays = (iso: string, days: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
// The Monday on or before a date: the day the seeded goal starts (homeSeed.ts).
const mondayOnOrBefore = (iso: string): string => addDays(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));

// The screens, in the order a person meets them, so a file's number says where it comes in whichever test took it.
const SHOT_ORDER = [
  'home-add-link',
  'chooser',
  'which-goal',
  'intro',
  'intro-target',
  'first-question',
  'start-question',
  'start-too-early',
  'final-target',
  'saved-target',
  'home-after-target',
  'final-goal',
  'problem-goal',
  'saved-goal',
] as const;

// A screenshot of the page as it stands, when the owner asked for them.
async function shot(page: Page, width: number, name: (typeof SHOT_ORDER)[number]): Promise<void> {
  if (!SHOTS) return;
  // SETUP_ADD_SHOT_ONLY (screen names, comma separated) and SETUP_ADD_SHOT_WIDTH re-shoot only some screens, as the owner asks.
  const only = process.env.SETUP_ADD_SHOT_ONLY?.split(',').map((x) => x.trim());
  if (only && !only.includes(name)) return;
  if (process.env.SETUP_ADD_SHOT_WIDTH && Number(process.env.SETUP_ADD_SHOT_WIDTH) !== width) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.waitForLoadState('networkidle');
  const number = String(SHOT_ORDER.indexOf(name) + 1).padStart(2, '0');
  await page.screenshot({ path: join(SHOTS, `${number}-${name}-${THEME}-${width}.png`), fullPage: true });
}

// Nothing on a phone scrolls sideways, and no date shows as YYYY-MM-DD.
async function readable(page: Page, width: number): Promise<void> {
  if (width < 600) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), 'nothing scrolls sideways on a phone').toBe(false);
    expect(await elementsOffScreen(page), 'nothing sits past the screen edge').toEqual([]);
  }
  expect((await page.locator('main').textContent()) ?? '', 'no date on screen as YYYY-MM-DD').not.toMatch(MACHINE_DATE);
}

const cardOf = (page: Page): Locator => page.locator(CARD).first();
const headingOf = async (page: Page): Promise<string> => ((await cardOf(page).textContent()) ?? '').trim();

// The next card after `previous` (the heading of the one just answered); gets past the spacing limit's "wait" by tapping Try again.
async function nextCard(page: Page, previous: string | null): Promise<{ id: string; heading: string }> {
  const waitAlert = page.locator('[data-retry-cause="wait"]');
  for (let attempt = 0; attempt < 8; attempt++) {
    await expect(cardOf(page)).toBeVisible();
    if (previous !== null) {
      await expect
        .poll(async () => ((await waitAlert.count()) > 0 ? 'wait' : await headingOf(page)), { message: 'waiting for the next card' })
        .not.toBe(previous);
    }
    if ((await waitAlert.count()) > 0) {
      await page.waitForTimeout(1200);
      await page.getByRole('button', { name: 'Try again' }).click();
      await expect(waitAlert).toBeHidden();
      continue;
    }
    const id = (await cardOf(page).getAttribute('id')) ?? '';
    expect(id, 'no reply failed during the scripted conversation').not.toBe('setup-retry');
    return { id, heading: await headingOf(page) };
  }
  throw new Error('The setup kept asking to wait.');
}

// Walks the scripted person's lines through the real screen, one card at a time, and returns the card the conversation ends on. The
// headings of every card on the way are returned too, so the spec can check what was never asked.
async function walk(page: Page, width: number, lines: readonly { say: string }[], afterFirst?: () => Promise<void>): Promise<{ id: string; heading: string; seen: string[] }> {
  const seen: string[] = [];
  let card = await nextCard(page, null);
  for (let k = 0; k < lines.length; k++) {
    seen.push(card.heading);
    await expect(page.locator(CARD)).toHaveCount(1);
    await readable(page, width);
    if (k === 0 && afterFirst) await afterFirst();
    const line = lines[k].say;
    if (card.id === 'setup-playback') {
      await page.getByRole('button', { name: 'Yes, that is right' }).click();
    } else {
      expect(card.id, `turn ${k} should be a question`).toBe('setup-question');
      const yes = page.getByRole('button', { name: 'Yes', exact: true });
      if (line === PROPOSAL_YES_TEXT && (await yes.count()) > 0) {
        await yes.click();
      } else {
        if ((await page.getByLabel('Your answer').count()) === 0) await page.getByRole('button', { name: TYPE_INSTEAD }).click();
        await page.getByLabel('Your answer').fill(line);
        await page.getByRole('button', { name: 'Send' }).click();
      }
    }
    card = await nextCard(page, card.heading);
  }
  return { ...card, seen };
}

// How many copies of an addition in progress this tab holds (the conversation, and the note of what the person was adding).
const kept = (page: Page) => page.evaluate(() => Object.keys(window.sessionStorage).filter((k) => k.startsWith('momentum.setup.')).length);

// The server never answers with an error in these flows.
function watchServerErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 500) errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  return errors;
}

// Server Actions are POSTs that carry a Next-Action header. Drops the next one on the floor, as a lost connection would.
async function dropNextSave(page: Page): Promise<() => Promise<void>> {
  let dropped = false;
  const handler = async (route: import('@playwright/test').Route) => {
    if (!dropped && route.request().method() === 'POST' && route.request().headers()['next-action']) {
      dropped = true;
      await route.abort('connectionfailed');
      return;
    }
    await route.continue();
  };
  await page.route('**/setup', handler);
  return async () => {
    await page.unroute('**/setup', handler);
  };
}

test('the seeded goal is the one the fake model scripts its target conversation for', () => {
  expect(SEEDED_GOAL_TITLE).toBe(HOME_TITLES.goal);
});

for (const [name, width] of Object.entries(WIDTHS)) {
  test.describe(`at ${width}px (${name})`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('adding a goal after setup: asked nothing about days or settings, a lost save retried, a double tap saves once', async ({ page }) => {
      test.setTimeout(300_000);
      const serverErrors = watchServerErrors(page);
      const scripted = addGoalCase();
      const email = await signUpAndConfirm(page, `setup-add-goal-${width}`);
      await seedHome(email, { timeZone: ZONE, weekStart: 1, weekly: true });
      const asked = (await fakeLast()).setupRequests;

      // Home offers the way, in the owner's words, once setup is saved. The old first-setup card is not there.
      await page.goto('/');
      await expect(page.getByRole('region', { name: HOME_TITLES.goal })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Set up your goals' })).toHaveCount(0);
      await shot(page, width, 'home-add-link');
      await page.getByRole('link', { name: 'Add to your goals' }).click();
      await expect(page).toHaveURL(/\/setup$/);

      // The chooser replaces "Setup is already done".
      await expect(page.getByRole('heading', { level: 1, name: 'Add to your goals' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Setup is already done' })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'What would you like to add?' })).toBeVisible();
      await expect(page.getByText("Nothing you've already set up changes. Nothing is saved until you check it.")).toBeVisible();
      await expect(page.getByRole('button', { name: 'A target for a goal I already have' })).toBeVisible();
      await readable(page, width);
      await shot(page, width, 'chooser');
      await page.waitForLoadState('networkidle');
      expect((await fakeLast()).setupRequests, 'opening the page asks Claude nothing').toBe(asked);

      await page.getByRole('button', { name: 'A new goal' }).click();
      await expect(page.getByRole('heading', { name: "Let's add to your goals" })).toBeVisible();
      expect((await fakeLast()).setupRequests, 'choosing asks Claude nothing').toBe(asked);
      await shot(page, width, 'intro');
      await page.getByRole('button', { name: 'Start' }).click();

      // The first question says once what is skipped; a reload in the middle opens straight back on the conversation.
      const end = await walk(page, width, scripted.person, async () => {
        await expect(page.getByText(RETURNING_FIRST_LINE)).toBeVisible();
        await shot(page, width, 'first-question');
        expect(await kept(page), 'what they were adding is kept in this tab').toBe(2);
      });
      // Nothing about the person's days or settings was ever asked.
      expect(end.seen.join(' | ')).not.toMatch(/time zone|day end|week start|your days|kinds of days|how direct|reminder/i);
      expect(end.id).toBe('setup-final');
      expect(end.heading).toBe('Add this goal?');

      // What was sent to Claude names the saved topics and none of the saved values.
      const sent = (await fakeLast()).lastSetupUserText;
      expect(sent).toContain('Note from code, not the person');
      expect(sent).toContain('adds new goals only');
      expect(sent).not.toContain('Los_Angeles');
      expect(sent).not.toContain(HOME_TITLES.goal);

      await expect(page.getByText("Your other goals and everything you've logged stay exactly as they are.")).toBeVisible();
      // The goal's title first, then its targets as sentences: no "Your goal:" prefix.
      expect(await page.locator('main li').allTextContents()).toEqual(['Read more', 'At least 2 reading sessions a week.']);
      await expect(page.getByText(/Your goal:/)).toHaveCount(0);
      await readable(page, width);
      await shot(page, width, 'final-goal');

      // A lost connection: said in words, the card stays, and nothing is added.
      const restore = await dropNextSave(page);
      await page.getByRole('button', { name: 'Add it' }).click();
      await expect(page.getByRole('alert').filter({ hasText: "Couldn't connect. Nothing was added yet. Check your connection, then try again." })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Add this goal?' })).toBeVisible();
      await readable(page, width);
      await shot(page, width, 'problem-goal');
      await restore();

      // A double tap saves once.
      await page.getByRole('button', { name: 'Add it' }).dblclick();
      await expect(page.getByRole('heading', { name: 'Added.' })).toBeVisible();
      await expect(page.getByText("Nothing you'd already saved changed.")).toBeVisible();
      await expect(page.getByRole('link', { name: 'Back to home' }).last()).toBeVisible();
      expect(await kept(page), "the tab's copy is cleared once it is added").toBe(0);
      await shot(page, width, 'saved-goal');

      // On home: the new goal once, and the one that was there exactly as it was.
      await page.goto('/');
      await expect(page.getByRole('region', { name: 'Read more' })).toHaveCount(1);
      const old = page.getByRole('region', { name: HOME_TITLES.goal });
      await expect(old.getByText('Floor met')).toBeVisible();
      await expect(old.getByText('Partway · 4 km to floor')).toBeVisible();
      await expect(old.getByRole('heading', { name: HOME_TITLES.prep })).toBeVisible();
      expect(serverErrors).toEqual([]);
    });

    test('adding a target to a started goal: the person chooses its start, and it is graded only from there', async ({ page }) => {
      test.setTimeout(300_000);
      const serverErrors = watchServerErrors(page);
      const scripted = addTargetFor(SEEDED_GOAL_TITLE);
      const email = await signUpAndConfirm(page, `setup-add-target-${width}`);
      await seedHome(email, { timeZone: ZONE, weekStart: 1, weekly: true });
      const today = dateInZone(ZONE) ?? '';
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const goalStart = mondayOnOrBefore(today);

      await page.goto('/setup');
      await page.getByRole('button', { name: 'A target for a goal I already have' }).click();
      await expect(page.getByRole('heading', { name: 'Which goal is it for?' })).toBeVisible();
      await expect(page.getByText('Pick one. You can add to another goal after.')).toBeVisible();
      await readable(page, width);
      await shot(page, width, 'which-goal');
      await page.getByRole('button', { name: HOME_TITLES.goal, exact: true }).click();
      // Targets added to one goal: the card names the goal.
      await expect(page.getByRole('heading', { name: `Let's add to "${HOME_TITLES.goal}"` })).toBeVisible();
      await expect(page.getByRole('heading', { name: "Let's add to your goals" })).toHaveCount(0);
      await shot(page, width, 'intro-target');
      await page.getByRole('button', { name: 'Start' }).click();

      const end = await walk(page, width, scripted.person, async () => {
        await expect(page.getByText(RETURNING_FIRST_LINE)).toBeVisible();
      });
      // The goal's own questions were never asked again: only what a target needs.
      expect(end.seen.join(' | ')).not.toMatch(/time zone|day end|week start|keep going|why does this matter/i);

      // The conversation names the goal's title and nothing else that is saved.
      const sent = (await fakeLast()).lastSetupUserText;
      expect(sent).toContain('adding targets to one goal');
      expect(sent).toContain(HOME_TITLES.goal);
      expect(sent).not.toContain('Los_Angeles');
      expect(sent).not.toContain(HOME_TITLES.workouts);

      // The start question, after the targets are approved and before the final card.
      expect(end.id).toBe('setup-start');
      expect(end.heading).toBe('When should this target start counting?');
      await expect(page.getByText(`Weeks before this date won't count for it. Your goal "${HOME_TITLES.goal}" keeps its own start of ${casualDate(goalStart, today, { relative: false })}.`)).toBeVisible();
      await expect(page.getByText(`Start today, ${casualDate(today, today, { relative: false })}?`)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Yes, start today' })).toBeVisible();
      await readable(page, width);
      await shot(page, width, 'start-question');

      // A start before the goal started is refused in words and goes no further.
      const picker = page.getByLabel('Pick another date');
      await picker.fill(addDays(goalStart, -1));
      await expect(page.getByRole('alert').filter({ hasText: `That's before your goal started on ${casualDate(goalStart, today, { relative: false })}. Pick a day on or after it.` })).toBeVisible();
      await expect(page.getByRole('heading', { name: /Add this target/ })).toHaveCount(0);
      await readable(page, width);
      await shot(page, width, 'start-too-early');

      // A start in the future, in the person's own week: nothing before it counts.
      const start = addDays(today, 7);
      await picker.fill(start);
      await expect(page.getByRole('heading', { name: `Add this target to "${HOME_TITLES.goal}"?` })).toBeVisible();
      await expect(
        page.getByText(`It starts counting on ${casualDate(start, today, { relative: false })}. Weeks before that aren't counted. Everything else on this goal stays as it is.`),
      ).toBeVisible();
      await readable(page, width);
      await shot(page, width, 'final-target');

      await page.getByRole('button', { name: 'Add it' }).dblclick();
      await expect(page.getByRole('heading', { name: `Added to "${HOME_TITLES.goal}". It starts counting on ${casualDate(start, today, { relative: false })}.` })).toBeVisible();
      await expect(page.getByText("Nothing you'd already saved changed.")).toBeVisible();
      await shot(page, width, 'saved-target');

      // On home: the target is there once, says when it starts (it is not graded before that), and the older targets are as they were.
      await page.goto('/');
      const goal = page.getByRole('region', { name: HOME_TITLES.goal });
      const row = goal.locator('.home-target', { has: page.getByRole('heading', { name: SWIMS.title, exact: true }) });
      await expect(row).toHaveCount(1);
      await expect(row.locator('.chip')).toHaveText(/^Starts /);
      await expect(goal.getByText('Floor met')).toBeVisible();
      await expect(goal.getByText('Partway · 4 km to floor')).toBeVisible();
      await shot(page, width, 'home-after-target');
      expect(serverErrors).toEqual([]);
    });
  });
}
