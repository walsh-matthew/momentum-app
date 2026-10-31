// The goal wizard's live paths from a brand-new account, against the local stack with NO model key (MOM-61; the live
// paths the MOM-83 production smoke test could not reach, see BACKLOG.md): Generate failing, a working Try again, the
// 20 second wait message, the starter plan, Create, and the goal showing with unticked tasks, surviving a reload and
// the back button. It runs at both widths: at 1280px the goal is in the sidebar, at 390px it is a goal card.
//
// The dev server is started with a dummy ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL pointing at the fake model on this
// machine (playwright.config.ts, MOM-111). The fake answers 401 to anything that is not a guided setup turn, which the
// app reports as "not configured", so Generate always fails with the same fixed wording. If it does not, this spec
// stops: a different message would mean a real model is reachable and a paid request may have been made.

import type { Page } from '@playwright/test';
import { WIDTHS, expect, signUpAndConfirm, test } from './fixtures';

const NOT_CONFIGURED = "Claude plans aren't set up on the server yet. Nothing was saved or substituted.";
const WAIT = 'Please wait a few seconds before asking again. Nothing was saved or substituted.';

// Where the user picks a channel: the sidebar's buttons from 1200px, the goal cards' links below it.
function channelPicker(page: Page, width: number) {
  if (width >= 1200) {
    const sidebar = page.getByRole('complementary', { name: 'Goal channels' });
    return {
      goal: sidebar.getByRole('button', { name: 'Get certified', exact: true }),
      all: sidebar.getByRole('button', { name: 'All channels' }),
      progress: (tasks: number) => sidebar.getByText(`0 of ${tasks} tasks done`).first(),
    };
  }
  const cards = page.getByRole('region', { name: 'Your goals' });
  return {
    goal: cards.getByRole('link', { name: /Get certified/ }),
    all: cards.getByRole('link', { name: /All channels/ }),
    progress: (tasks: number) => cards.getByText(`0 of ${tasks} tasks done`).first(),
  };
}

for (const [name, width] of Object.entries(WIDTHS)) {
  test.describe(`at ${width}px (${name})`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('wizard: failure, Try again, the wait message, the starter plan, Create, and the goal in the picker', async ({ page }) => {
      await signUpAndConfirm(page, `wizard-${width}`);
      // A new account has no goals, so home offers setup (MOM-143) in place of the old "No goals yet" card.
      await expect(page.getByRole('heading', { name: 'Set up your goals' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'No goals yet' })).toHaveCount(0);
      await page.waitForLoadState('networkidle');

      // Open the wizard from the banner and walk the steps.
      await page.getByRole('group', { name: 'Quick goal actions' }).getByRole('button', { name: 'New Goal Wizard' }).click();
      const wizard = page.getByRole('dialog', { name: 'New goal wizard' });
      await expect(wizard).toBeVisible();
      await wizard.getByRole('button', { name: 'Get certified' }).click();
      await expect(wizard.getByLabel('Title')).toHaveValue('Get certified');
      await wizard.getByRole('button', { name: 'Next' }).click();
      await wizard.getByRole('button', { name: 'Next' }).click();
      await wizard.getByRole('button', { name: 'Next' }).click();
      await expect(wizard.getByRole('region', { name: 'Week 1 plan' })).toBeVisible();
      await expect(wizard.getByRole('button', { name: 'Create goal' })).toBeDisabled();

      // Generate with no model key: the fixed failure message, no plan, and no automatic fallback.
      await wizard.getByRole('button', { name: 'Generate week 1 plan with Claude' }).click();
      const alert = wizard.getByRole('alert');
      await expect(alert).toBeVisible();
      const first = (await alert.textContent())?.trim();
      expect(
        first,
        'Generate did not fail with the not-configured message: a model key may be reachable. Stop and check the dev server environment.',
      ).toBe(NOT_CONFIGURED);
      await expect(wizard.getByText(/Written by Claude/)).toHaveCount(0);
      await expect(wizard.getByText(/Starter plan/)).toHaveCount(0);
      await expect(wizard.getByRole('button', { name: 'Create goal' })).toBeDisabled();

      // Try again at once: a failed request still counts toward the 20 second limit, so this is the wait message.
      await wizard.getByRole('button', { name: 'Try again' }).click();
      await expect(alert).toHaveText(WAIT);
      await expect(wizard.getByRole('button', { name: 'Try again' })).toBeVisible();
      await expect(wizard.getByRole('button', { name: 'Create goal' })).toBeDisabled();

      // The user chooses the starter plan: labelled as such, and only now can the goal be created.
      await wizard.getByRole('button', { name: 'Use the starter plan instead' }).click();
      await expect(wizard.getByText('Starter plan (rule-based, not written by Claude)')).toBeVisible();
      await expect(wizard.getByRole('alert')).toHaveCount(0);
      await wizard.getByRole('button', { name: 'Create goal' }).click();

      await expect(wizard.getByRole('heading', { name: 'Goal created' })).toBeVisible();
      const saved = /(\d+) week 1 tasks? (?:is|are) saved, all unticked/.exec((await wizard.textContent()) ?? '');
      expect(saved, 'the success screen says how many tasks were saved, all unticked').not.toBeNull();
      const taskCount = Number(saved![1]);
      expect(taskCount).toBeGreaterThan(0);
      await wizard.getByRole('button', { name: 'Done' }).click();
      await expect(wizard).toBeHidden();

      // The goal is there with its real progress: nothing done.
      const picker = channelPicker(page, width);
      await expect(picker.goal).toBeVisible();
      await expect(picker.progress(taskCount)).toBeAttached();
      await expect(picker.all).toHaveAttribute('aria-current', 'page');

      // The feed holds unticked tasks: the focus task's checkbox is not checked, nothing is in Recently done.
      await expect(page.getByRole('checkbox')).toHaveAttribute('aria-checked', 'false');
      await expect(page.getByRole('heading', { name: 'Recently done' })).toHaveCount(0);

      // Choosing the goal puts its id in the address.
      await picker.goal.click();
      await expect(page).toHaveURL(/\/\?channel=[0-9a-f-]{36}$/);
      await expect(picker.goal).toHaveAttribute('aria-current', 'page');
      const channelUrl = page.url();

      // A reload on that address keeps the channel.
      await page.reload();
      await expect(page).toHaveURL(channelUrl);
      await expect(picker.goal).toHaveAttribute('aria-current', 'page');
      await expect(picker.all).not.toHaveAttribute('aria-current', 'page');

      // The back button returns to All channels.
      await page.goBack();
      // Let the page finish loading before the test ends: closing the page mid-stream makes the dev server log "The
      // destination stream errored while writing data" (MOM-120).
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(/\/$/);
      await expect(picker.all).toHaveAttribute('aria-current', 'page');
    });
  });
}
