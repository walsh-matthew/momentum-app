// @vitest-environment jsdom
//
// The rest of the weekly review's sitting after layer 1's recap, in a DOM (components/review/ReviewSitting.tsx, MOM-113 block 3.3,
// docs/DOMAIN_MODEL.md §3 and §4.2). The component only lays out what the server decided and calls two actions; both are stubbed
// here, so no model, no network and no database. What these hold fixed:
// - nothing asks Claude until the person taps, and the line is shown with who wrote it, with nothing to answer next to it (a
//   celebration is never paired with a request),
// - a limit, an error or a thrown action leaves the review going on, with the button still there to try again,
// - layer 3's one question has three equal choices, each says plainly what it did, and "Change it" says when nothing in the app
//   can change that yet,
// - the finish is one button that calls the action once with the person's choice, is off until a choice is made when something
//   was offered, and cannot be tapped twice,
// - the words are plain (the round 3c rules apply to the review's cards too).

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adjustmentView, optionsInWords, type AdjustmentView } from '@/components/review/adjustmentWording';
import { ReviewSitting } from '@/components/review/ReviewSitting';
import { LINE_BUTTON, LINE_SOURCE } from '@/components/review/sittingWording';
import type { ServiceResult } from '@/lib/services/result';
import type { ReviewLineResult } from '@/types/review';
import type { LayerThreeAdjustment } from '@/types/scoreboard';

const refresh = vi.fn();
const askForReviewLine = vi.fn<() => Promise<ServiceResult<ReviewLineResult>>>();
const finishReview = vi.fn<(outcome: unknown) => Promise<ServiceResult<{ id: string; weekStart: string }>>>();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/app/actions/review', () => ({
  askForReviewLine: () => askForReviewLine(),
  finishReview: (outcome: unknown) => finishReview(outcome),
}));

beforeEach(() => {
  refresh.mockReset();
  askForReviewLine.mockReset();
  finishReview.mockReset();
  finishReview.mockResolvedValue({ ok: true, data: { id: 'r1', weekStart: '2026-10-19' } });
});
afterEach(cleanup);

const titles = { target: (id: string) => (id === 't1' ? 'Workouts' : null), item: (id: string) => (id === 'i1' ? 'Send the form' : null) };
const SLIPPING: LayerThreeAdjustment = { kind: 'slipping_check_in', targetId: 't1', periods: 2 };
const REBASE: LayerThreeAdjustment = { kind: 'rebaseline', targetId: 't1', periods: 3 };
const FORECAST: LayerThreeAdjustment = {
  kind: 'deadline_forecast',
  itemId: 'i1',
  verdict: 'does_not_fit',
  options: ['more_time', 'smaller_scope', 'move_date', 'accept_risk'],
};

const view = (adjustment: LayerThreeAdjustment | null): AdjustmentView | null => (adjustment === null ? null : adjustmentView(adjustment, titles));
const sitting = (over: { offerLine?: boolean; adjustment?: LayerThreeAdjustment | null } = {}) =>
  render(<ReviewSitting offerLine={over.offerLine ?? true} adjustment={view(over.adjustment === undefined ? SLIPPING : over.adjustment)} />);

const line = (over: Partial<Extract<ReviewLineResult, { kind: 'line' }>> = {}): ServiceResult<ReviewLineResult> => ({
  ok: true,
  data: { kind: 'line', line: 'You kept Workouts steady through the week.', source: 'claude', calls: 1, ...over },
});

describe("layer 2: Claude's one-line look back", () => {
  it('asks nothing of Claude until the person taps for it', () => {
    sitting();
    expect(askForReviewLine).not.toHaveBeenCalled();
    const card = screen.getByRole('region', { name: 'A one-line look back' });
    expect(within(card).getByRole('heading', { name: 'A one-line look back' })).toBeTruthy();
    expect(within(card).getByText(/Optional\. Claude writes one plain sentence about your week\. It asks nothing of you and isn't saved\./)).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Get a one-line look back from Claude' })).toBeTruthy();
    expect(LINE_BUTTON).toBe('Get a one-line look back from Claude');
  });

  it('shows no such card at all when the depth or the week offers no line', () => {
    sitting({ offerLine: false });
    expect(screen.queryByRole('region', { name: 'A one-line look back' })).toBeNull();
    expect(screen.queryByRole('button', { name: LINE_BUTTON })).toBeNull();
  });

  it('asks once on a tap, shows the line with who wrote it, and leaves nothing to answer beside it', async () => {
    askForReviewLine.mockResolvedValue(line());
    sitting();
    fireEvent.click(screen.getByRole('button', { name: LINE_BUTTON }));
    const card = screen.getByRole('region', { name: 'A one-line look back' });
    await waitFor(() => expect(within(card).getByText('You kept Workouts steady through the week.')).toBeTruthy());
    expect(askForReviewLine).toHaveBeenCalledTimes(1);
    expect(within(card).getByText(LINE_SOURCE.claude)).toBeTruthy();
    // A celebration stands alone: no button, field or question in the card that holds the line.
    expect(within(card).queryAllByRole('button')).toHaveLength(0);
    expect(card.querySelectorAll('input, select, textarea, form')).toHaveLength(0);
    expect(card.textContent).not.toContain('?');
  });

  it('says plainly when the line is one Momentum wrote because Claude\'s did not pass the checks', async () => {
    askForReviewLine.mockResolvedValue(line({ line: 'Here is how your week ended against your own targets.', source: 'fallback', calls: 2 }));
    sitting();
    fireEvent.click(screen.getByRole('button', { name: LINE_BUTTON }));
    expect(await screen.findByText(LINE_SOURCE.fallback)).toBeTruthy();
    expect(screen.queryByText(LINE_SOURCE.claude)).toBeNull();
  });

  it('is off while asking, and says so', async () => {
    let resolve!: (v: ServiceResult<ReviewLineResult>) => void;
    askForReviewLine.mockReturnValue(new Promise((r) => (resolve = r)));
    sitting();
    fireEvent.click(screen.getByRole('button', { name: LINE_BUTTON }));
    const asking = await screen.findByRole('button', { name: 'Asking Claude…' });
    expect((asking as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(asking);
    expect(askForReviewLine).toHaveBeenCalledTimes(1);
    resolve(line());
    await screen.findByText('You kept Workouts steady through the week.');
  });

  it('says why when a limit stopped it, keeps the review going and keeps the button', async () => {
    askForReviewLine.mockResolvedValue({
      ok: true,
      data: { kind: 'unavailable', reason: 'review_budget', message: 'You have already asked Claude for a line today. Your review goes on without it.' },
    });
    sitting();
    fireEvent.click(screen.getByRole('button', { name: LINE_BUTTON }));
    expect(await screen.findByText('You have already asked Claude for a line today. Your review goes on without it.')).toBeTruthy();
    expect(screen.getByRole('button', { name: LINE_BUTTON })).toBeTruthy();
    // The rest of the sitting is unaffected.
    expect(screen.getByRole('button', { name: 'Finish review' })).toBeTruthy();
  });

  it('shows the service\'s reason when it asked for nothing', async () => {
    askForReviewLine.mockResolvedValue({ ok: false, error: 'There is no weekly review to add a line to right now.' });
    sitting();
    fireEvent.click(screen.getByRole('button', { name: LINE_BUTTON }));
    expect(await screen.findByText('There is no weekly review to add a line to right now.')).toBeTruthy();
  });

  it('says so, and goes on, when the action itself fails', async () => {
    askForReviewLine.mockRejectedValue(new Error('network'));
    sitting();
    fireEvent.click(screen.getByRole('button', { name: LINE_BUTTON }));
    expect(await screen.findByText('Claude could not be reached just now. Your review goes on without it.')).toBeTruthy();
    expect(screen.getByRole('button', { name: LINE_BUTTON })).toBeTruthy();
  });
});

describe("layer 3: the one question, with three equal choices", () => {
  it('asks the engine\'s adjustment in plain words: the question in bold as the title, the reason beneath', () => {
    sitting();
    const card = screen.getByRole('region', { name: 'One thing to decide' });
    expect(within(card).getByRole('heading', { name: 'Want to change anything about “Workouts”?' })).toBeTruthy();
    expect(within(card).getByText(/for 2 weeks in a row/)).toBeTruthy();
    expect(within(card).getByText(/It's your call\./)).toBeTruthy();
    // One heading in the card, and it is the question.
    expect(within(card).getAllByRole('heading')).toHaveLength(1);
  });

  it('offers exactly three choices, all there from the start, and none chosen', () => {
    sitting();
    const group = screen.getByRole('radiogroup', { name: 'Your choice' });
    const choices = within(group).getAllByRole('radio');
    expect(choices.map((c) => c.textContent)).toEqual(['Yes, I want to change it', 'No, keep it as it is', 'Skip for now']);
    expect(choices.every((c) => c.getAttribute('aria-checked') === 'false')).toBe(true);
  });

  it('says plainly what each choice did, and that "change" changed nothing where nothing in the app can', () => {
    sitting();
    const group = screen.getByRole('radiogroup', { name: 'Your choice' });
    fireEvent.click(within(group).getByRole('radio', { name: 'Yes, I want to change it' }));
    expect(screen.getByText("Noted. Changing a target isn't in the app yet, so nothing was changed.")).toBeTruthy();
    fireEvent.click(within(group).getByRole('radio', { name: 'No, keep it as it is' }));
    expect(screen.getByText('Okay. It stays as it is.')).toBeTruthy();
    expect(screen.queryByText(/so nothing was changed/)).toBeNull();
    fireEvent.click(within(group).getByRole('radio', { name: 'Skip for now' }));
    expect(screen.getByText('Skipped. Nothing changes.')).toBeTruthy();
    // One choice is checked at a time, and it can be changed before finishing.
    expect(within(group).getAllByRole('radio').filter((c) => c.getAttribute('aria-checked') === 'true')).toHaveLength(1);
  });

  it('has its own question and reason for a re-baseline, in plain words', () => {
    sitting({ adjustment: REBASE });
    const card = screen.getByRole('region', { name: 'One thing to decide' });
    expect(within(card).getByRole('heading', { name: 'Raise the bar on “Workouts”?' })).toBeTruthy();
    expect(within(card).getByText(/reached your aspiration, the number you hoped for, 3 weeks in a row\. You can aim higher from next week\. Past weeks keep the number they had\./)).toBeTruthy();
  });

  it('presents a deadline forecast with the engine\'s own choices, and offers moving the date only when the engine did', () => {
    sitting({ adjustment: FORECAST });
    expect(screen.getByRole('heading', { name: 'Does “Send the form” still work?' })).toBeTruthy();
    expect(screen.getByText(/don't look like enough to finish it by the date\./)).toBeTruthy();
    expect(screen.getByText(/set aside more time before the date, make it smaller, move the date or keep going and accept the risk/)).toBeTruthy();
    cleanup();

    sitting({ adjustment: { ...FORECAST, verdict: 'tight', options: ['more_time', 'smaller_scope', 'accept_risk'] } });
    expect(screen.getByText(/look tight for finishing it by the date\./)).toBeTruthy();
    expect(screen.queryByText(/move the date/)).toBeNull();
  });

  it('says what a deadline choice can do today: more time on the week plan, and nothing else yet', () => {
    sitting({ adjustment: FORECAST });
    fireEvent.click(screen.getByRole('radio', { name: 'Yes, I want to change it' }));
    expect(screen.getByText(/You can set aside more time on your week plan once you've finished\. Changing a deadline or its size isn't in the app yet, so nothing else was changed\./)).toBeTruthy();
    cleanup();
    sitting({ adjustment: { ...FORECAST, options: ['smaller_scope', 'accept_risk'] } });
    fireEvent.click(screen.getByRole('radio', { name: 'Yes, I want to change it' }));
    expect(screen.getByText("Noted. Changing a deadline isn't in the app yet, so nothing was changed.")).toBeTruthy();
  });

  it('never names a task it was not told, and never an empty title', () => {
    expect(adjustmentView(FORECAST, { target: () => null, item: () => null }).question).toBe('Does one of your deadlines still work?');
    expect(adjustmentView(SLIPPING, { target: () => null, item: () => null }).question).toBe('Want to change anything about this target?');
  });

  it('writes the options in the order the engine gave them', () => {
    expect(optionsInWords(['accept_risk'])).toBe('keep going and accept the risk');
    expect(optionsInWords(['smaller_scope', 'more_time'])).toBe('make it smaller or set aside more time before the date');
    expect(optionsInWords([])).toBe('');
  });

  it('uses everyday words: it explains the floor and the aspiration where it uses them, and uses no jargon or percentage', () => {
    for (const adjustment of [SLIPPING, REBASE, FORECAST]) {
      const v = adjustmentView(adjustment, titles);
      const words = [v.question, v.detail, ...Object.values(v.afterChoice), ...Object.values(v.choices)].join(' ');
      expect(words).not.toMatch(/baseline|protected|priorit|effort|outcome|block|slipping|%/i);
      if (/floor/.test(words)) expect(words).toContain('the least that counts');
      if (/aspiration/.test(words)) expect(words).toContain('the number you hoped for');
    }
  });
});

describe('the finish: one button, once', () => {
  it('is solid from the start; tapped with nothing chosen it says "Choose one first.", moves to the choices and saves nothing (MOM-145)', () => {
    sitting();
    const finish = screen.getByRole('button', { name: 'Finish review' }) as HTMLButtonElement;
    expect(finish.disabled).toBe(false);
    expect(screen.queryByText('Choose one first.')).toBeNull();
    fireEvent.click(finish);
    expect(screen.getByRole('alert').textContent).toBe('Choose one first.');
    expect(document.activeElement).toBe(screen.getAllByRole('radio')[0]);
    expect(finishReview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: 'Skip for now' }));
    expect(screen.queryByText('Choose one first.')).toBeNull();
    expect(finish.disabled).toBe(false);
  });

  it.each([
    ['Yes, I want to change it', 'changed'],
    ['No, keep it as it is', 'declined'],
    ['Skip for now', 'skipped'],
  ])('finishes with the choice "%s" as %s, calls the action once, and refreshes the page', async (label, outcome) => {
    sitting();
    fireEvent.click(screen.getByRole('radio', { name: label }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish review' }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(finishReview).toHaveBeenCalledTimes(1);
    expect(finishReview).toHaveBeenCalledWith(outcome);
  });

  it('finishes with no choice when nothing was offered, and says there was nothing to adjust', async () => {
    sitting({ adjustment: null });
    expect(screen.getByText('Nothing to adjust this week.')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'One thing to decide' })).toBeNull();
    const finish = screen.getByRole('button', { name: 'Finish review' }) as HTMLButtonElement;
    expect(finish.disabled).toBe(false);
    fireEvent.click(finish);
    await waitFor(() => expect(finishReview).toHaveBeenCalledWith(null));
    expect(finishReview).toHaveBeenCalledTimes(1);
  });

  it('cannot be tapped twice while it is saving', async () => {
    let resolve!: (v: ServiceResult<{ id: string; weekStart: string }>) => void;
    finishReview.mockReturnValue(new Promise((r) => (resolve = r)));
    sitting();
    fireEvent.click(screen.getByRole('radio', { name: 'Skip for now' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish review' }));
    const saving = (await screen.findByRole('button', { name: 'Saving…' })) as HTMLButtonElement;
    // Busy, not disabled (MOM-145): still solid, says so, and ignores a second tap.
    expect(saving.disabled).toBe(false);
    expect(saving.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(saving);
    fireEvent.click(screen.getByRole('radio', { name: 'No, keep it as it is' }));
    expect(finishReview).toHaveBeenCalledTimes(1);
    resolve({ ok: true, data: { id: 'r1', weekStart: '2026-10-19' } });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('says what went wrong, saves nothing and lets the person try again', async () => {
    finishReview.mockResolvedValueOnce({ ok: false, error: "You already finished this week's review." });
    sitting();
    fireEvent.click(screen.getByRole('radio', { name: 'Skip for now' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish review' }));
    expect((await screen.findByRole('alert')).textContent).toBe("You already finished this week's review.");
    expect(refresh).not.toHaveBeenCalled();
    // The settled state (MOM-96): the button is back, not only the error.
    expect(((await screen.findByRole('button', { name: 'Finish review' })) as HTMLButtonElement).disabled).toBe(false);
  });

  it('says so, and saves nothing, when the action itself fails', async () => {
    finishReview.mockRejectedValueOnce(new Error('network'));
    sitting();
    fireEvent.click(screen.getByRole('radio', { name: 'Skip for now' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish review' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Could not save your weekly review. Nothing was saved.');
    expect(refresh).not.toHaveBeenCalled();
    expect(((await screen.findByRole('button', { name: 'Finish review' })) as HTMLButtonElement).disabled).toBe(false);
  });

  it('does not depend on the line: a review can be finished without ever asking for one', async () => {
    sitting();
    fireEvent.click(screen.getByRole('radio', { name: 'No, keep it as it is' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish review' }));
    await waitFor(() => expect(finishReview).toHaveBeenCalledWith('declined'));
    expect(askForReviewLine).not.toHaveBeenCalled();
  });
});
