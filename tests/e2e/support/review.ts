// MOM-120: finishing the weekly review in a browser test and waiting until the page has settled.
// After "Finish review" the button is gone, so there is no control to wait for, and Playwright cannot see when the refresh's
// streamed body ends (failure log F-086). The app says it itself: components/review/ReviewSettleRegion.tsx keeps `aria-busy` on
// [data-review-region] "true" from the tap until the finishing transition, including the page refresh, has committed. The wait
// for the finished text comes first, so the "false" wait can never pass before the finish has happened. No timeout, no network idle.

import type { Page } from '@playwright/test';
import { expect } from '../fixtures';

export async function finishReviewAndSettle(page: Page, finishedText: string): Promise<void> {
  await page.getByRole('button', { name: 'Finish review' }).click();
  await expect(page.getByText(finishedText)).toBeVisible();
  await expect(page.locator('[data-review-region][aria-busy="false"]')).toHaveCount(1);
}
