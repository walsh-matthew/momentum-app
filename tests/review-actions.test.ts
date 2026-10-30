// The weekly review's two server actions (app/actions/review.ts, MOM-113 block 3.3): they pass the person's choice to the
// service and nothing else, and refresh the pages that show the review only when the review was really saved. The services are
// stubbed, so no model, no database and no cache. A Server Action is reachable by direct POST, so these also pin that it takes
// no user and no time from the caller.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidatePath = vi.fn();
const getReviewLine = vi.fn();
const recordFinishedReview = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }));
vi.mock('@/lib/services/reviewReflection', () => ({ getReviewLine: () => getReviewLine() }));
vi.mock('@/lib/services/reviewRecords', () => ({ recordFinishedReview: (outcome: unknown) => recordFinishedReview(outcome) }));

import { askForReviewLine, finishReview } from '@/app/actions/review';

beforeEach(() => {
  revalidatePath.mockReset();
  getReviewLine.mockReset();
  recordFinishedReview.mockReset();
});

describe('askForReviewLine', () => {
  it('returns what the service said, takes nothing from the caller, and refreshes nothing', async () => {
    const result = { ok: true, data: { kind: 'line', line: 'A steady week.', source: 'claude', calls: 1 } };
    getReviewLine.mockResolvedValue(result);
    expect(await askForReviewLine()).toBe(result);
    expect(getReviewLine).toHaveBeenCalledTimes(1);
    expect(askForReviewLine.length).toBe(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('finishReview', () => {
  it('passes the choice to the service as it came (the service validates it) and refreshes the review and home once saved', async () => {
    recordFinishedReview.mockResolvedValue({ ok: true, data: { id: 'r1', weekStart: '2026-10-19' } });
    expect(await finishReview('declined')).toEqual({ ok: true, data: { id: 'r1', weekStart: '2026-10-19' } });
    expect(recordFinishedReview).toHaveBeenCalledWith('declined');
    expect(revalidatePath.mock.calls.map((c) => c[0]).sort()).toEqual(['/', '/review']);
  });

  it('hands a choice it cannot read to the service untouched, so the service is the one that refuses it', async () => {
    recordFinishedReview.mockResolvedValue({ ok: false, error: 'That choice could not be read. Nothing was saved.' });
    expect(await finishReview({ outcome: 'changed' })).toEqual({ ok: false, error: 'That choice could not be read. Nothing was saved.' });
    expect(recordFinishedReview).toHaveBeenCalledWith({ outcome: 'changed' });
  });

  it('refreshes nothing when nothing was saved', async () => {
    recordFinishedReview.mockResolvedValue({ ok: false, error: "You already finished this week's review." });
    await finishReview('skipped');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('takes the choice and nothing else: no user, no week, no time', () => {
    expect(finishReview.length).toBe(1);
  });
});
