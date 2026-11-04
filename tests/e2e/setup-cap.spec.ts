// Test day 1: a person who has used their Claude allowance is told when Claude is back, on the quick path card, in the phone's own
// time zone when no zone is saved yet. The local usage log is filled with 100 calls from about 5 hours ago, so the next setup turn
// is refused by the real per-person limit (reserve_llm_call); nothing here reaches a model. The rows are removed afterwards.
//
// Screenshots are written only when SETUP_SCREENSHOT_DIR names a folder (outside the repo).

import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { QUICK_PATH_WORDS } from '@/lib/setup/quickPath';
import { SEND_AGAIN, SETUP_STORAGE_PREFIX } from '@/lib/setup/session';
import { expect, signUpAndConfirm, test } from './fixtures';
import { elementsOffScreen } from './support/setupCards';

const SHOTS = process.env.SETUP_SCREENSHOT_DIR;
const MARK = 'e2e-cap';

function psql(sql: string): void {
  const names = execFileSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' }).split(/\r?\n/);
  const db = names.find((name) => name.startsWith('supabase_db_'));
  if (!db) throw new Error('No local Supabase database container is running. Start it with `npx supabase start`.');
  execFileSync('docker', ['exec', db, 'psql', '-U', 'postgres', '-d', 'postgres', '-c', sql], { stdio: 'ignore' });
}

test.describe('the limit message at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Chicago' });

  test.afterEach(() => psql(`delete from public.llm_usage_logs where model = '${MARK}'`));

  test('the quick path card says when Claude is back, once, with no dimmed button', async ({ page }) => {
    test.setTimeout(180_000);
    await signUpAndConfirm(page, 'setup-cap');
    await page.goto('/setup');
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.locator('h2#setup-question')).toBeVisible({ timeout: 30_000 });

    // 100 calls from this person, the oldest 5 hours ago: room opens in 19 hours.
    psql(
      `insert into public.llm_usage_logs (user_id, feature, model, input_tokens, output_tokens, latency_ms, outcome, created_at)
       select u.id, 'rebalance', '${MARK}', 1, 1, 100, 'ok', now() - interval '5 hours' + (g || ' seconds')::interval
       from public.users u, generate_series(1, 100) g`,
    );

    if ((await page.getByLabel('Your answer').count()) === 0) await page.getByRole('button', { name: 'Type it instead' }).click();
    await page.getByLabel('Your answer').fill('I want to run more');
    await page.getByRole('button', { name: 'Send' }).click();

    const quick = page.locator('section[aria-labelledby="setup-quick-path"]');
    await expect(quick).toBeVisible({ timeout: 30_000 });
    // The reason once, then when Claude is back once, in the phone's own zone (no zone is saved yet).
    await expect(quick.getByText(QUICK_PATH_WORDS.reasonWaitNothing, { exact: true })).toHaveCount(1);
    const line = quick.getByText(/^You can use Claude for setup again after about \d{1,2}:\d{2} (AM|PM)( tomorrow)?\.$/);
    await expect(line).toHaveCount(1);
    expect(await quick.locator('button:disabled, [aria-disabled="true"]').count(), 'no button on the card is dimmed').toBe(0);
    expect(await elementsOffScreen(page), 'nothing sits past the screen edge').toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), 'no sideways scroll').toBe(false);

    // Nothing on this card can be answered (the first goal is all that was said), so it does not say "these last answers finish it",
    // and the callout names the way forward instead of "Start again".
    await expect(quick.getByText(/last answers/)).toHaveCount(0);
    await expect(quick.getByText(QUICK_PATH_WORDS.stuckHelpWait(true), { exact: true })).toHaveCount(1);
    await expect(quick.getByText(/Start again to begin a new setup/)).toHaveCount(0);
    await expect(quick.getByRole('button', { name: QUICK_PATH_WORDS.startAgain })).toHaveCount(1);

    if (SHOTS) {
      mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: join(SHOTS, 'cap-card-light-390.png'), fullPage: true });
    }

    // What the card promises is true: the answers are kept in this tab across a reload, and "Send it again" carries on from there
    // (here the limit is still on, so it lands on the same card, with the same time).
    await page.reload();
    await expect(page.getByRole('button', { name: SEND_AGAIN })).toBeVisible({ timeout: 30_000 });
    const kept = await page.evaluate((prefix) => {
      const key = Object.keys(window.sessionStorage).find((k) => k.startsWith(prefix));
      return key ? window.sessionStorage.getItem(key) : null;
    }, SETUP_STORAGE_PREFIX);
    expect(kept, 'the conversation is still in this tab').toContain('I want to run more');
    await page.getByRole('button', { name: SEND_AGAIN }).click();
    await expect(quick).toBeVisible({ timeout: 30_000 });
    await expect(quick.getByText(/^You can use Claude for setup again after about \d{1,2}:\d{2} (AM|PM)( tomorrow)?\.$/)).toHaveCount(1);
  });
});
