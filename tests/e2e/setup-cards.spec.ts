// Every kind of guided setup card on a phone (MOM-111 round 2, finding 5 and the screenshot step; round 3; round 3b): at
// 390px, nothing on any card sits past the screen's edge, element by element; and the cards are saved as screenshots, numbered
// in the order a person sees them, so the owner can look at them before the merge. The fake model of
// tests/e2e/support/fakeAnthropic.ts answers as Claude (no paid call, no key): run-i gives a question, a question with an
// option to tap, a date confirmation, starting ideas, the playbacks and the final card; the reading case is the same walk for
// a goal that is not exercise (round 3b, finding 4); run-a gives a date question with nothing to suggest.
//
// Every error card is shown in place, under the question it belongs to (round 3b, findings 5 to 7): stuck (replies the fake
// makes unusable), busy (the fake's 429), no answer (its 500), not configured (its 401), the time limit (the server's own busy
// answer relabelled on its way to the browser, since a real time limit takes 270 seconds), the network (a request the browser
// never lets out) and an unsent answer (a reload while the reply is on its way).
//
// The date picker shots use Playwright's iPhone profile (round 3b, finding 3) on Chromium, the browser installed here. On that
// profile headless Chromium draws no calendar of its own when the field is tapped (on the desktop profile it did), so each
// date card is saved closed and right after the tap, the phone's own picker being outside the page; the checks prove
// nothing opens in place.
//
// Every card on screen, on every step of every walk and on the iPhone profile, has exactly one bold line (font-weight 600 or
// more) and nothing heavier (round 3c, finding 1): the check runs with the screen-edge check in fits().
//
// Screenshots are written only when SETUP_SCREENSHOT_DIR names a folder (outside the repo); without it the checks still run.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { devices, type Locator, type Page } from '@playwright/test';
import { APPROVE_TEXT, CHANGE_ANSWER, MEANING_LINK, MEANING_TEXT, PICK_DATE, PICK_ONE, PICK_OTHER_DATE, PROPOSAL_YES_TEXT, SEND_AGAIN, SETUP_STORAGE_PREFIX, TRY_AGAIN, TYPE_INSTEAD, errorCopy, pickedDateText, type RetryCause } from '@/lib/setup/session';
import { emptyDraft } from '@/lib/setup/draft';
import { runSetupEval } from '@/lib/setup/evals';
import { QUICK_PATH_WORDS } from '@/lib/setup/quickPath';
import { READING_CASE_ID, SETUP_CASES, type ScriptedCase } from '../setup-evals/cases';
import { goal, scriptedModel, target } from '../helpers/setupScript';
import { expect, signUpAndConfirm, test } from './fixtures';
import { FAKE_MODEL_PORT } from './support/localStack';
import { CARD, cardOf, cardTypes, elementsOffScreen, headingOf, sectionOf } from './support/setupCards';
import { dateQuestionCase, e2eCase } from './support/setupConversation';

const SHOTS = process.env.SETUP_SCREENSHOT_DIR;
type CardKind = 'question' | 'question-with-options' | 'date-question' | 'date-confirmation' | 'ideas' | 'playback' | 'final';

const fakeControl = async (path: string): Promise<void> => {
  await fetch(`http://127.0.0.1:${FAKE_MODEL_PORT}${path}`, { method: 'POST' });
};
const resetFake = async (): Promise<void> => {
  await fakeControl('/__fake/unusable?count=0');
  await fakeControl('/__fake/slow?ms=0');
  await fakeControl('/__fake/fail?count=0');
};

// Screenshots numbered in the order they are taken, which is the order a person sees the cards: "<set>-01-question.png".
function shooter(set: string) {
  let n = 0;
  return async (page: Page, name: string): Promise<void> => {
    if (!SHOTS) return;
    mkdirSync(SHOTS, { recursive: true });
    n += 1;
    await page.screenshot({ path: join(SHOTS, `${set}-${String(n).padStart(2, '0')}-${name}.png`), fullPage: true });
  };
}

// Words no card shows (round 3c, wording fix): the model's own words for a number, and an earlier step named, not quoted.
const JARGON = /\b(fewest|floor|aspirations?|baseline)\b|\bwhere you are now\b/i;

// Every card on screen fits, has one bold line with nothing heavier (round 3c, finding 1), and is in everyday words.
async function fits(page: Page, what: string): Promise<void> {
  expect(await elementsOffScreen(page), `${what}: nothing sits past the screen edge`).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), `${what}: no sideways scroll`).toBe(false);
  await oneBoldLine(page, what);
  await expect(page.locator('main'), `${what}: everyday words`).not.toContainText(JARGON);
}

async function oneBoldLine(page: Page, what: string): Promise<void> {
  const cards = await cardTypes(page);
  expect(cards.length, `${what}: a card is on screen`).toBeGreaterThan(0);
  for (const c of cards) {
    expect(c.bold, `${what} (${c.card}): exactly one bold line`).toHaveLength(1);
    expect(c.heaviest.weight, `${what} (${c.card}): nothing heavier than "${c.bold[0]}" (heaviest: "${c.heaviest.text}")`).toBeLessThanOrEqual(c.boldWeight);
  }
}

async function kindOf(page: Page): Promise<CardKind> {
  if ((await page.locator('h2#setup-playback').count()) > 0) return 'playback';
  if ((await page.locator('h2#setup-final').count()) > 0) return 'final';
  if ((await page.getByLabel(PICK_OTHER_DATE, { exact: true }).count()) > 0) return 'date-confirmation';
  if ((await page.getByLabel(PICK_DATE, { exact: true }).count()) > 0) return 'date-question';
  if ((await page.locator('ol [data-slot="answer-choice"]').count()) > 0) return 'ideas';
  if ((await page.locator('[data-slot="answer-choice"]').count()) > 0) return 'question-with-options';
  return 'question';
}

// The next card after the one with heading `previous`, getting past the spacing limit's "wait" as the person would.
async function nextCard(page: Page, previous: string | null): Promise<string> {
  const waitCard = page.locator('[data-retry-cause="wait"]');
  for (let attempt = 0; attempt < 8; attempt++) {
    await expect(cardOf(page)).toBeVisible();
    if (previous !== null) {
      await expect.poll(async () => ((await waitCard.count()) > 0 ? 'wait' : await headingOf(page)), { message: 'waiting for the next card' }).not.toBe(previous);
    }
    if ((await waitCard.count()) > 0) {
      await page.waitForTimeout(1200);
      await page.getByRole('button', { name: TRY_AGAIN }).click();
      await expect(waitCard).toBeHidden();
      continue;
    }
    return headingOf(page);
  }
  throw new Error('The setup kept asking to wait.');
}

// Answers the card on screen with the scripted person's line, the way a person would tap or type it.
async function answer(page: Page, line: string): Promise<void> {
  if ((await page.locator('h2#setup-playback').count()) > 0) {
    await page.getByRole('button', { name: 'Yes, that is right' }).click();
    return;
  }
  const yes = page.getByRole('button', { name: 'Yes', exact: true });
  if (line === MEANING_TEXT) await page.getByRole('button', { name: MEANING_LINK }).click();
  else if (line === PROPOSAL_YES_TEXT && (await yes.count()) > 0) await yes.click();
  else {
    if ((await page.getByLabel('Your answer').count()) === 0) await page.getByRole('button', { name: TYPE_INSTEAD }).click();
    await page.getByLabel('Your answer').fill(line);
    await page.getByRole('button', { name: 'Send' }).click();
  }
}

// The error card for `cause`, in place: the question above it, the alert look, its words, its one button, and its help.
async function errorCard(page: Page, cause: RetryCause, heading: string): Promise<void> {
  const copy = errorCopy(cause, true);
  const card = page.locator(`[data-retry-cause="${cause}"]`);
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(cardOf(page)).toHaveText(heading);
  await expect(card.locator('[data-slot="setup-alert"]')).toHaveClass(/border-warn/);
  await expect(card.getByRole(cause === 'unsent' ? 'status' : 'alert')).toHaveText(`${copy.headline}${copy.line ?? ''}`);
  const only = copy.action === 'change' ? CHANGE_ANSWER : copy.action === 'send' ? SEND_AGAIN : TRY_AGAIN;
  await expect(card.locator('button[data-tone]')).toHaveText([only]);
  // The question sits above the card it belongs to.
  const [q, a] = await Promise.all([cardOf(page).boundingBox(), card.boundingBox()]);
  expect((q?.y ?? 0) < (a?.y ?? 0), `${cause}: the question is above the error card`).toBe(true);
  await fits(page, `${cause} error`);
}

const pause = (page: Page) => page.waitForTimeout(1200);

// One scripted conversation, start to final, a screenshot of every new kind of card (or of every card, for the reading set).
async function walk(page: Page, scripted: ScriptedCase, shot: (page: Page, name: string) => Promise<void>, opts: { everyCard: boolean; errors: boolean }) {
  await page.goto('/setup');
  await fits(page, 'intro');
  await page.getByRole('button', { name: 'Start' }).click();
  let heading = await nextCard(page, null);
  const seen = new Set<CardKind>();
  let errorsShown = false;
  let stuckShown = false;
  // The ideas card's lead line, in code's words (round 3c, finding 2), and its detail line.
  let ideasLead: string | null = null;
  let ideasDetail: string | null = null;
  // The idea buttons as shown (round 3d, finding c): each names the counted thing.
  let ideasOptions: string[] = [];

  for (const { say: line } of scripted.person) {
    await expect(page.locator(CARD)).toHaveCount(1);
    const kind = await kindOf(page);
    await fits(page, kind);
    if (kind === 'ideas') {
      ideasLead = heading;
      await expect(sectionOf(page).getByText(PICK_ONE, { exact: true })).toBeVisible();
      // Code's line is the only lead: Claude's lead-in is not shown.
      const say = scripted.script.find((t) => t.kind === 'ideas')?.say.trim();
      if (say) await expect(sectionOf(page)).not.toContainText(say);
      const detail = sectionOf(page).locator('[data-slot="question-detail"]');
      ideasDetail = (await detail.count()) > 0 ? ((await detail.textContent()) ?? '').trim() : null;
      ideasOptions = (await sectionOf(page).locator('ol [data-slot="answer-choice"]').allTextContents()).map((t) => t.trim());
    }
    if (opts.everyCard || !seen.has(kind)) await shot(page, kind);
    seen.add(kind);
    if (kind !== 'playback' && kind !== 'final') await expect(page.getByRole('button', { name: MEANING_LINK })).toHaveCount(1);

    if (opts.errors && kind === 'question' && line !== MEANING_TEXT && seen.size >= 2 && !stuckShown) {
      // Stuck: every reply thrown away. Each fake answer waits a little, so the tries are not refused by the spacing limit.
      stuckShown = true;
      await fakeControl('/__fake/slow?ms=1100');
      await fakeControl('/__fake/unusable?count=3');
      await pause(page);
      await answer(page, line);
      await errorCard(page, 'stuck', heading);
      await shot(page, 'error-stuck');
      await resetFake();
      await page.getByRole('button', { name: CHANGE_ANSWER }).click();
      await expect(page.getByLabel('Your answer')).toHaveValue(line);
      await expect(page.getByLabel('Your answer')).toBeFocused();
      await pause(page);
    } else if (opts.errors && kind === 'question' && line !== MEANING_TEXT && stuckShown && !errorsShown) {
      // Every technical card, one after another on the same question, each answered with Try again.
      errorsShown = true;
      await fakeControl('/__fake/fail?status=429&count=1');
      await pause(page);
      await answer(page, line);
      await errorCard(page, 'busy', heading);
      await shot(page, 'error-busy');
      for (const [status, cause] of [
        [500, 'no_answer'],
        [401, 'not_configured'],
      ] as const) {
        await fakeControl(`/__fake/fail?status=${status}&count=1`);
        await pause(page);
        await page.getByRole('button', { name: TRY_AGAIN }).click();
        await errorCard(page, cause, heading);
        await shot(page, `error-${cause.replace('_', '-')}`);
      }
      // The time limit: the server's busy answer, relabelled on its way back.
      await fakeControl('/__fake/fail?status=429&count=1');
      await page.route('**/setup', async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        const res = await route.fetch();
        await route.fulfill({ response: res, body: (await res.text()).replaceAll('"reason":"busy"', '"reason":"timed_out"') });
      });
      await pause(page);
      await page.getByRole('button', { name: TRY_AGAIN }).click();
      await errorCard(page, 'timed_out', heading);
      await shot(page, 'error-time-limit');
      await page.unroute('**/setup');
      // The network: the request never leaves the browser.
      await page.route('**/setup', (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()));
      await pause(page);
      await page.getByRole('button', { name: TRY_AGAIN }).click();
      await errorCard(page, 'network', heading);
      await shot(page, 'error-network');
      await page.unroute('**/setup');
      // Unsent: the page reloads while the reply is on its way.
      await fakeControl('/__fake/slow?ms=4000');
      await pause(page);
      await page.getByRole('button', { name: TRY_AGAIN }).click();
      await page.waitForTimeout(800);
      await page.reload();
      await errorCard(page, 'unsent', heading);
      await shot(page, 'error-unsent');
      await fakeControl('/__fake/slow?ms=0');
      await page.waitForTimeout(4500);
      await page.getByRole('button', { name: SEND_AGAIN }).click();
      heading = await nextCard(page, heading);
      continue;
    }
    await answer(page, line);
    heading = await nextCard(page, heading);
  }

  expect(await kindOf(page)).toBe('final');
  await fits(page, 'final');
  await shot(page, 'final');
  seen.add('final');
  return { seen, errorsShown: errorsShown && stuckShown, ideasLead, ideasDetail, ideasOptions };
}

// SETUP_SHOT_WIDTH takes the same screenshots at another width (1280 for the desktop set, MOM-30); the checks run there too.
const SHOT_WIDTH = Number(process.env.SETUP_SHOT_WIDTH) || 390;

test.describe(`at ${SHOT_WIDTH}px (phone)`, () => {
  test.use({ viewport: { width: SHOT_WIDTH, height: SHOT_WIDTH === 390 ? 844 : 900 } });

  test('every kind of setup card, and every error card in place, fits the screen and is saved as a screenshot', async ({ page }) => {
    test.setTimeout(420_000);
    await signUpAndConfirm(page, 'setup-cards');
    try {
      const { seen, errorsShown, ideasLead, ideasDetail, ideasOptions } = await walk(page, e2eCase(), shooter('main'), { everyCard: false, errors: true });
      expect([...seen].sort()).toEqual(['date-confirmation', 'final', 'ideas', 'playback', 'question', 'question-with-options'].sort());
      expect(errorsShown).toBe(true);
      expect(ideasLead).toBe('In a hard week, how many runs would still count?');
      expect(ideasDetail).toBe('You said you run about 2 times a week now.');
      expect(ideasOptions.length).toBeGreaterThan(1);
      for (const option of ideasOptions) expect(option).toMatch(/^\d\. At least \d+ runs a week$/);
      // Round 3, finding 5; round 3c, finding 3: the recap reads as the person's goal, in whole sentences.
      const recap = await page.locator('section[aria-labelledby="setup-final"] li').allTextContents();
      expect(recap[0]).toMatch(/^Your goal: at least \d+ runs a week\.$/);
    } finally {
      await resetFake();
    }
    // The approval line is the person's own words, and the save is still a tap away: nothing is saved here.
    expect(APPROVE_TEXT).toBe('Yes, that is right.');
  });

  test('a goal that is not exercise: every card of the reading conversation counts "pages", the person\'s own word', async ({ page }) => {
    test.setTimeout(300_000);
    const reading = SETUP_CASES.find((c) => c.id === READING_CASE_ID)!;
    await signUpAndConfirm(page, 'setup-reading');
    const { ideasLead, ideasDetail, ideasOptions } = await walk(page, reading, shooter('reading'), { everyCard: true, errors: false });
    expect(ideasLead).toBe('In a hard week, how many pages would still count?');
    expect(ideasDetail).toBe('You said you read about 50 pages a week now.');
    expect(ideasOptions.length).toBeGreaterThan(1);
    for (const option of ideasOptions) expect(option).toMatch(/^\d\. At least \d+ pages a week$/);
    const recap = await page.locator('section[aria-labelledby="setup-final"] li').allTextContents();
    expect(recap[0]).toBe('Your goal: at least 100 pages a week.');
    await expect(page.locator('main')).not.toContainText(/sessions/i);
  });

  // The quick-path card (MOM-111, the owner's review): what happened, what it has, what to do next and why Save is off, before any
  // button; real nested lists with a hanging indent; Start again asks first; and in round 3d the missing number is the number
  // question itself. A conversation that has used its 40 turns is put in this tab's session storage and the waiting answer is
  // sent, so the server offers the quick path.
  async function openQuickPath(page: Page, label: string, session: object): Promise<Locator> {
    await signUpAndConfirm(page, label);
    await page.goto('/setup');
    await page.getByRole('button', { name: 'Start' }).click();
    await nextCard(page, null);
    const key = await page.evaluate((prefix) => Object.keys(window.sessionStorage).find((k) => k.startsWith(prefix)) ?? null, SETUP_STORAGE_PREFIX);
    expect(key, 'the tab keeps the conversation in progress').not.toBeNull();
    await page.evaluate(([k, value]) => window.sessionStorage.setItem(k, value), [key!, JSON.stringify(session)] as const);
    await page.reload();
    await page.getByRole('button', { name: SEND_AGAIN }).click();
    const quick = page.locator('section[aria-labelledby="setup-quick-path"]');
    await expect(quick).toBeVisible({ timeout: 30_000 });
    return quick;
  }

  // Real lists: nothing on the card keeps its shape with pre-wrap, every list shows a bullet, and a line that wraps lines up under
  // its own first word (every line of a text node starts at the same left edge).
  async function expectRealLists(quick: Locator): Promise<void> {
    const state = await quick.evaluate((root) => {
      const pre = [...root.querySelectorAll('*')].filter((n) => getComputedStyle(n).whiteSpace.startsWith('pre')).length;
      const lists = [...root.querySelectorAll('ul')];
      const bulleted = lists.every((u) => /disc|circle/.test(getComputedStyle(u).listStyleType));
      const ragged: string[] = [];
      for (const li of root.querySelectorAll('li')) {
        const text = [...li.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '');
        if (!text) continue;
        const range = document.createRange();
        range.selectNodeContents(text);
        const lefts = [...range.getClientRects()].map((r) => Math.round(r.left));
        if (lefts.length > 1 && Math.max(...lefts) - Math.min(...lefts) > 1) ragged.push((li.textContent ?? '').slice(0, 40));
      }
      return { pre, lists: lists.length, bulleted, ragged, nested: root.querySelectorAll('li > ul').length };
    });
    expect(state.pre, 'nothing is shaped with pre-wrap').toBe(0);
    expect(state.lists).toBeGreaterThan(2);
    expect(state.bulleted, 'every list shows a bullet').toBe(true);
    expect(state.ragged, 'a wrapped line lines up under its own first word').toEqual([]);
  }

  test('the quick path with something missing says why Save is off and what to do, in real lists, and Start again asks first', async ({ page }) => {
    test.setTimeout(120_000);
    const draft = emptyDraft();
    draft.model.goals.push({ ...goal('g1', 'Get stronger and keep it up through the whole winter season'), targets: [target('t1', 'Workouts'), target('t2', 'Pages of the training book')] });
    const claude = { kind: 'question', chunk: null, skipped: null, say: '', question: 'Anything else?', detail: null, topic: 'idea', options: [], draft };
    const transcript = Array.from({ length: 40 }, () => [{ role: 'assistant', turn: claude }, { role: 'person', text: 'That is all.' }]).flat();
    const quick = await openQuickPath(page, 'setup-quick-path', { transcript, draft, spentTokens: 0 });

    await expect(quick.getByRole('heading', { name: QUICK_PATH_WORDS.missingTitle })).toBeVisible();
    await expect(quick.getByText("This setup has used up the questions Claude gets for one setup, so it can't ask any more.", { exact: true })).toBeVisible();
    await expect(quick.getByText(QUICK_PATH_WORDS.intro, { exact: true })).toBeVisible();
    await expect(quick.getByText(QUICK_PATH_WORDS.missingNoWait, { exact: true })).toBeVisible();
    await expect(quick.getByText(QUICK_PATH_WORDS.saveOff, { exact: true })).toBeVisible();
    await expect(quick.getByRole('button', { name: 'Save what I have' })).toBeDisabled();
    // The words come before the buttons.
    const [words, buttons] = await Promise.all([quick.getByText(QUICK_PATH_WORDS.missingNoWait, { exact: true }).boundingBox(), quick.getByRole('button', { name: 'Save what I have' }).boundingBox()]);
    expect((words?.y ?? 0) < (buttons?.y ?? 0)).toBe(true);
    // Round 3d: the missing number is the number question itself, and nothing promises a default.
    await expect(quick.locator('ul li').filter({ hasText: 'In a hard week, how many workouts would still count?' })).toHaveCount(1);
    await expect(quick).not.toContainText(/least you aim for|default/i);
    await expectRealLists(quick);
    await fits(page, 'quick path, missing');
    await shooter('quick-path')(page, 'missing');

    // Start again asks first: the first tap clears nothing.
    await quick.getByRole('button', { name: 'Start again' }).click();
    await expect(quick.getByText(QUICK_PATH_WORDS.confirmStartOver, { exact: true })).toBeVisible();
    expect(await page.evaluate((prefix) => Object.keys(window.sessionStorage).some((k) => k.startsWith(prefix)), SETUP_STORAGE_PREFIX)).toBe(true);
    await quick.getByRole('button', { name: QUICK_PATH_WORDS.confirmNo }).click();
    await expect(quick.getByRole('button', { name: 'Save what I have' })).toBeVisible();
  });

  test('the quick path with nothing missing says it is ready, and Save is on', async ({ page }) => {
    test.setTimeout(120_000);
    // A real, validated setup: the e2e case's whole conversation, with filler turns in front so the 40-turn budget is spent.
    const c = e2eCase();
    const report = await runSetupEval(c, scriptedModel(c.script));
    expect(report.finalIssues ?? []).toEqual([]);
    const assistants = report.transcript.filter((m) => m.role === 'assistant').length;
    // The real conversation comes first and untouched (what the person said is judged by where it sits in it); the filler that spends
    // the budget follows it, holding the same final draft, so it changes nothing the checks compare.
    const claude = { kind: 'question', chunk: null, skipped: null, say: '', question: 'Anything else?', detail: null, topic: 'idea', options: [], draft: report.draft };
    const filler = Array.from({ length: Math.max(0, 40 - assistants) }, () => [{ role: 'assistant', turn: claude }, { role: 'person', text: 'That is all.' }]).flat();
    const transcript = [...report.transcript, { role: 'person', text: 'Yes, that is right.' }, ...filler];
    const quick = await openQuickPath(page, 'setup-quick-path-ready', { transcript, draft: report.draft, spentTokens: 0 });

    await expect(quick.getByRole('heading', { name: QUICK_PATH_WORDS.readyTitle })).toBeVisible();
    await expect(quick.getByText(QUICK_PATH_WORDS.readyNext, { exact: true })).toBeVisible();
    await expect(quick.getByText(QUICK_PATH_WORDS.saveOff)).toHaveCount(0);
    await expect(quick.getByRole('button', { name: 'Save what I have' })).toBeEnabled();
    await expect(quick).not.toContainText(/default/i);
    await expectRealLists(quick);
    await fits(page, 'quick path, ready');
    await shooter('quick-path')(page, 'ready');
  });
});

// The date cards on Playwright's iPhone profile (finding 3), on Chromium. Its own browser type (WebKit) is not installed here.
const { defaultBrowserType: _webkit, ...iPhone } = devices['iPhone 13'];

test.describe('date cards on an iPhone profile', () => {
  test.use(iPhone);

  // The picker is the answer itself: one date field inside it, nothing opening in place, and choosing a date answers.
  async function pickerCard(page: Page, kind: 'date-question' | 'date-confirmation', shot: (page: Page, name: string) => Promise<void>) {
    const field = page.getByLabel(kind === 'date-confirmation' ? PICK_OTHER_DATE : PICK_DATE, { exact: true });
    const card = sectionOf(page);
    await expect(card.locator('input[type="date"]')).toHaveCount(1);
    const trigger = card.locator('[data-picker="date"]');
    await expect(trigger).toHaveAttribute('data-slot', 'answer-choice');
    await expect(trigger.locator('[data-slot="picker-icon"]')).toHaveCount(1);
    // The same width as the other answers on the card.
    const other = card.locator('button[data-slot="answer-choice"]').first();
    if ((await other.count()) > 0) expect((await trigger.boundingBox())?.width).toBe((await other.boundingBox())?.width);
    await fits(page, kind);
    await shot(page, kind);
    const before = await card.locator('*').count();
    await field.tap();
    expect(await card.locator('*').count(), `${kind}: nothing opens in place`).toBe(before);
    await shot(page, `${kind}-picker-tapped`);
    await page.keyboard.press('Escape');
  }

  test('the date confirmation and the date question, closed and with the picker tapped', async ({ page }) => {
    test.setTimeout(300_000);
    const shot = shooter('iphone');
    await signUpAndConfirm(page, 'setup-iphone-dates');
    for (const [scripted, kind] of [
      [e2eCase(), 'date-confirmation'],
      [dateQuestionCase(), 'date-question'],
    ] as const) {
      if (kind === 'date-question') {
        await page.getByRole('button', { name: 'Start again' }).click();
        await page.getByRole('button', { name: 'Yes, start again' }).click();
      } else {
        await page.goto('/setup');
      }
      await page.getByRole('button', { name: 'Start' }).click();
      let heading = await nextCard(page, null);
      for (const { say: line } of scripted.person) {
        if ((await kindOf(page)) === kind) break;
        await answer(page, line);
        heading = await nextCard(page, heading);
      }
      expect(await kindOf(page)).toBe(kind);
      // Finding 2: a date question shows no date and never asks for an "exact date".
      if (kind === 'date-question') await expect(sectionOf(page)).not.toContainText(/exact (date|day)/i);
      await pickerCard(page, kind, shot);
      if (kind === 'date-question') {
        expect(pickedDateText('2027-06-05')).toBe('Saturday, June 5, 2027');
        await page.getByLabel(PICK_DATE, { exact: true }).fill('2027-06-05');
        await expect(sectionOf(page).getByText('Saturday, Jun 5, 2027', { exact: true })).toBeVisible();
      }
    }
  });
});
