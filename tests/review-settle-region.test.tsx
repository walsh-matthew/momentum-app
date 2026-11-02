// @vitest-environment jsdom
//
// The settled marker of the weekly review (components/review/ReviewSettleRegion.tsx, MOM-120). The region keeps aria-busy on
// [data-review-region] "true" from the tap on "Finish review" until the finishing transition has committed, and it must do so even
// after the sitting (and its button) has unmounted, because that is what the browser tests wait on. Both actions are stubbed, so no
// model, no network and no database.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adjustmentView } from '@/components/review/adjustmentWording';
import { ReviewSettleRegion } from '@/components/review/ReviewSettleRegion';
import { ReviewSitting } from '@/components/review/ReviewSitting';
import type { ServiceResult } from '@/lib/services/result';
import type { LayerThreeAdjustment } from '@/types/scoreboard';

type Finished = ServiceResult<{ id: string; weekStart: string }>;
const refresh = vi.fn();
const finishReview = vi.fn<(outcome: unknown) => Promise<Finished>>();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/app/actions/review', () => ({
  askForReviewLine: vi.fn(),
  finishReview: (outcome: unknown) => finishReview(outcome),
}));

const SLIPPING: LayerThreeAdjustment = { kind: 'slipping_check_in', targetId: 't1', periods: 2 };
const OK: Finished = { ok: true, data: { id: 'r1', weekStart: '2026-10-19' } };

// What the page does: the sitting is shown until the finished review replaces it. `showFinished` stands in for the server's new page.
let showFinished: () => void = () => {};
function Page() {
  const [done, setDone] = useState(false);
  showFinished = () => act(() => setDone(true));
  return (
    <ReviewSettleRegion>
      {done ? (
        <p>You finished this review today.</p>
      ) : (
        <ReviewSitting offerLine={false} adjustment={adjustmentView(SLIPPING, { target: () => 'Workouts', item: () => null })} />
      )}
    </ReviewSettleRegion>
  );
}

const region = () => document.querySelector('[data-review-region]') as HTMLElement;
const finish = () => {
  fireEvent.click(screen.getByRole('radio', { name: 'Ask me again next week' }));
  fireEvent.click(screen.getByRole('button', { name: 'Finish review' }));
};

beforeEach(() => {
  refresh.mockReset();
  finishReview.mockReset();
  finishReview.mockResolvedValue(OK);
});
afterEach(cleanup);

describe('the settled marker', () => {
  it('reads false at rest', () => {
    render(<Page />);
    expect(region().getAttribute('aria-busy')).toBe('false');
  });

  it('reads true while the finish is saving, and false once it has settled', async () => {
    let resolve!: (v: Finished) => void;
    finishReview.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<Page />);
    finish();
    await screen.findByRole('button', { name: 'Saving…' });
    expect(region().getAttribute('aria-busy')).toBe('true');
    resolve(OK);
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(region().getAttribute('aria-busy')).toBe('false'));
  });

  it('stays true after the sitting has unmounted, until the transition settles (why the region owns it)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    // The action's own response replaces the page (the sitting unmounts) while the transition is still running.
    finishReview.mockImplementation(async () => {
      // After an await, as a real response is: an update made synchronously in the start function would join the transition.
      await Promise.resolve();
      showFinished();
      await gate;
      return OK;
    });
    render(<Page />);
    finish();
    await screen.findByText('You finished this review today.');
    expect(screen.queryByRole('button', { name: /Finish review|Saving…/ })).toBeNull();
    expect(region().getAttribute('aria-busy')).toBe('true');
    release();
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(region().getAttribute('aria-busy')).toBe('false'));
  });

  it('reads false again, with the error shown, when the finish is refused', async () => {
    finishReview.mockResolvedValue({ ok: false, error: "You already finished this week's review." });
    render(<Page />);
    finish();
    expect((await screen.findByRole('alert')).textContent).toBe("You already finished this week's review.");
    await waitFor(() => expect(region().getAttribute('aria-busy')).toBe('false'));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('reads false again, with the error shown, when the action throws', async () => {
    finishReview.mockRejectedValue(new Error('network'));
    render(<Page />);
    finish();
    expect((await screen.findByRole('alert')).textContent).toBe('Could not save your weekly review. Nothing was saved.');
    await waitFor(() => expect(region().getAttribute('aria-busy')).toBe('false'));
  });
});
