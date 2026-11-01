// @vitest-environment jsdom
//
// "Still right for you?" in the weekly review's sitting (components/review/StillRightCard.tsx inside ReviewSitting, MOM-113 block 3.4,
// docs/DOMAIN_MODEL.md §2.1 rule 4 and §3.2), in a DOM. The actions are stubbed, so no database, no model and no network. What these hold fixed:
// - the card asks one question in bold, says why, and lists each suggestion as a sentence with two equal answers, none chosen; it takes
//   layer 3's place, and the finish is not there until every row is answered (never a button that is there but cannot be used),
// - "No, change it" opens MOM-146's form under the last row of that target; saving settles the target's rows (locked, and an unanswered
//   row of it is the person's change), and "Never mind" takes the answers it opened for back,
// - the finish sends every answer once, with no choice about an adjustment, and cannot be tapped twice,
// - the words are plain (no "floor", "aspiration" or "target" on their own) and the chosen answer carries a check mark, not only a colour.
// A state update after an await inside a transition is waited for with findByRole (F-072).

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adjustmentView } from '@/components/review/adjustmentWording';
import { ReviewSitting } from '@/components/review/ReviewSitting';
import type { ServiceResult } from '@/lib/services/result';
import type { SavedTargetChange, StillRightItem, TargetEdit } from '@/types/review';

const refresh = vi.fn();
const changeTarget = vi.fn<(input: unknown) => Promise<ServiceResult<SavedTargetChange>>>();
const finishReview = vi.fn<(outcome: unknown, answers?: unknown) => Promise<ServiceResult<{ id: string; weekStart: string }>>>();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/app/actions/review', () => ({
  askForReviewLine: vi.fn(),
  finishReview: (outcome: unknown, answers?: unknown) => finishReview(outcome, answers),
}));
vi.mock('@/app/actions/targetChange', () => ({ changeTarget: (input: unknown) => changeTarget(input) }));

beforeEach(() => {
  refresh.mockReset();
  changeTarget.mockReset();
  finishReview.mockReset();
  finishReview.mockResolvedValue({ ok: true, data: { id: 'r1', weekStart: '2026-10-26' } });
});
afterEach(cleanup);

const GYM = '11111111-1111-4111-8111-111111111111';
const READ = '22222222-2222-4222-8222-222222222222';
const edit = (over: Partial<TargetEdit> = {}): TargetEdit => ({
  targetId: GYM,
  title: 'Workouts',
  measure: 'count',
  unit: null,
  period: 'weekly',
  floor: 2,
  aspiration: 3,
  days: null,
  weekStartsOn: 1,
  lastCounted: 1,
  effectiveFrom: '2026-11-02',
  today: '2026-10-31',
  ...over,
});
const FLOOR: StillRightItem = { id: 'm-floor', targetId: GYM, field: 'floor' };
const ASPIRATION: StillRightItem = { id: 'm-asp', targetId: GYM, field: 'aspiration' };
const READ_FLOOR: StillRightItem = { id: 'm-read', targetId: READ, field: 'floor' };

// What the answers are called for a screen reader: the target's name, then the row.
const SENTENCE = {
  floor: 'Workouts: 2 workouts in a hard week still count',
  aspiration: 'Workouts: Hoping for 3 workouts a week',
  read: 'Pages: 5 pages in a hard week still count',
};
// The row as it is read on the screen, with no name in it.
const ROW = { floor: '2 workouts in a hard week still count.', aspiration: 'Hoping for 3 workouts a week.', read: '5 pages in a hard week still count.' };

const sitting = (items: StillRightItem[] = [FLOOR, ASPIRATION], edits: TargetEdit[] = [edit(), edit({ targetId: READ, title: 'Pages', measure: 'quantity', unit: 'pages', floor: 5, aspiration: null })]) =>
  render(<ReviewSitting offerLine={false} adjustment={null} stillRight={{ items, edits }} />);

const group = (sentence: string) => screen.getByRole('radiogroup', { name: sentence });
const answer = (sentence: string, label: 'Yes, it fits' | 'No, change it') =>
  fireEvent.click(within(group(sentence)).getByRole('radio', { name: new RegExp(`^(✓)?${label}$`) }));
const form = () => screen.getByRole('form', { name: 'Change this target' });
const saved = (over: Partial<SavedTargetChange> = {}): ServiceResult<SavedTargetChange> => ({
  ok: true,
  data: { targetId: GYM, effectiveFrom: '2026-11-02', floor: 3, aspiration: 4, days: null, ...over },
});

describe('the card', () => {
  it('asks one question in bold, says why, and lists each suggestion with two equal answers, none chosen', () => {
    sitting();
    const card = screen.getByRole('region', { name: 'Still right for you?' });
    expect(within(card).getByRole('heading', { name: 'Still right for you?' })).toBeTruthy();
    expect(within(card).getByText('At setup you took these as suggestions instead of saying them yourself. Does each one still fit?')).toBeTruthy();
    for (const sentence of [SENTENCE.floor, SENTENCE.aspiration]) {
      const radios = within(group(sentence)).getAllByRole('radio');
      expect(radios.map((r) => r.textContent)).toEqual(['Yes, it fits', 'No, change it']);
      expect(radios.every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
    }
    expect(card.textContent).not.toContain('✓');
    for (const row of [ROW.floor, ROW.aspiration]) expect(within(card).getByText(row)).toBeTruthy();
  });

  it("shows each target's name once, as a small heading above its rows, with no quotes and no name in the row sentences", () => {
    sitting([FLOOR, READ_FLOOR, ASPIRATION]);
    const card = screen.getByRole('region', { name: 'Still right for you?' });
    const names = within(card).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    // Rows are grouped by target, in the order the targets first appear, even when the marks are not in that order.
    expect(names).toEqual(['Workouts', 'Pages']);
    expect(card.textContent).not.toMatch(/[“”]/);
    expect(card.textContent?.match(/Workouts/g)).toHaveLength(1);
    const [workouts, pages] = within(card).getAllByRole('listitem');
    expect(within(workouts).getAllByRole('radiogroup').map((g) => g.getAttribute('aria-label'))).toEqual([SENTENCE.floor, SENTENCE.aspiration]);
    expect(within(pages).getAllByRole('radiogroup').map((g) => g.getAttribute('aria-label'))).toEqual([SENTENCE.read]);
  });

  it('uses everyday words: it never says "floor", "aspiration" or "target" on its own, and shows no number Claude wrote', () => {
    sitting();
    const text = screen.getByRole('region', { name: 'Still right for you?' }).textContent ?? '';
    expect(text).not.toMatch(/\bfloor\b|\baspiration\b|\btarget\b|%/i);
  });

  it('takes layer 3\'s place: no "One thing to decide" card beside it', () => {
    sitting();
    expect(screen.queryByRole('region', { name: 'One thing to decide' })).toBeNull();
  });

  it('is not there at all when there is nothing to ask, so no empty card and layer 3 is as before', () => {
    render(
      <ReviewSitting
        offerLine={false}
        adjustment={adjustmentView({ kind: 'slipping_check_in', targetId: 't1', periods: 2 }, { target: () => 'Gym', item: () => null })}
        stillRight={{ items: [], edits: [] }}
      />,
    );
    expect(screen.queryByRole('region', { name: 'Still right for you?' })).toBeNull();
    expect(screen.getByRole('region', { name: 'One thing to decide' })).toBeTruthy();
  });

  it('lists a day-slots target\'s days in words', () => {
    render(
      <ReviewSitting
        offerLine={false}
        adjustment={null}
        stillRight={{ items: [{ id: 'm-days', targetId: GYM, field: 'slot_weekdays' }], edits: [edit({ period: 'day_slots', days: [1, 3, 5], aspiration: null })] }}
      />,
    );
    expect(screen.getByText('Counts on Mon, Wed and Fri.')).toBeTruthy();
  });
});

describe('the finish', () => {
  it('is not there until every row is answered, and is solid once it is', () => {
    sitting();
    expect(screen.queryByRole('button', { name: 'Finish review' })).toBeNull();
    answer(SENTENCE.floor, 'Yes, it fits');
    expect(screen.queryByRole('button', { name: 'Finish review' })).toBeNull();
    answer(SENTENCE.aspiration, 'Yes, it fits');
    const finish = screen.getByRole('button', { name: 'Finish review' }) as HTMLButtonElement;
    expect(finish.disabled).toBe(false);
    expect(finish.getAttribute('aria-disabled')).toBeNull();
    // No "Nothing to adjust" line: something was asked.
    expect(screen.queryByText('Nothing to adjust this week.')).toBeNull();
  });

  it('marks the chosen answer with a check mark as well as its colour, one per row, and lets the person take it back', () => {
    sitting();
    answer(SENTENCE.floor, 'Yes, it fits');
    const chosen = within(group(SENTENCE.floor)).getAllByRole('radio').filter((r) => r.getAttribute('aria-checked') === 'true');
    expect(chosen).toHaveLength(1);
    expect(chosen[0].textContent).toBe('✓Yes, it fits');
    answer(SENTENCE.floor, 'No, change it');
    expect(within(group(SENTENCE.floor)).getAllByRole('radio').filter((r) => r.getAttribute('aria-checked') === 'true')[0].textContent).toBe('✓No, change it');
  });

  it('sends every answer once, with no choice about an adjustment, and refreshes the review', async () => {
    sitting([FLOOR, READ_FLOOR]);
    answer(SENTENCE.floor, 'Yes, it fits');
    answer(SENTENCE.read, 'Yes, it fits');
    fireEvent.click(screen.getByRole('button', { name: 'Finish review' }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(finishReview).toHaveBeenCalledTimes(1);
    expect(finishReview).toHaveBeenCalledWith(null, { 'm-floor': 'kept', 'm-read': 'kept' });
  });

  it('says what went wrong, saves nothing and lets the person try again', async () => {
    finishReview.mockResolvedValue({ ok: false, error: 'Could not save your weekly review.' });
    sitting([FLOOR]);
    answer(SENTENCE.floor, 'Yes, it fits');
    fireEvent.click(screen.getByRole('button', { name: 'Finish review' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Could not save your weekly review.');
    expect(await screen.findByRole('button', { name: 'Finish review' })).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('"No, change it" opens the form for that target', () => {
  it('opens MOM-146\'s form under the last row of the target, so every answer for it comes first, with no finish until it is saved', () => {
    sitting();
    answer(SENTENCE.aspiration, 'No, change it');
    expect(within(screen.getByRole('region', { name: 'Still right for you?' })).getByRole('form', { name: 'Change this target' })).toBeTruthy();
    expect(within(form()).getByText('In a hard week, how many workouts would still count?')).toBeTruthy();
    // The form sits under the target's last row, whichever row asked for it.
    const last = group(SENTENCE.aspiration);
    expect(last.compareDocumentPosition(form()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(group(SENTENCE.floor).compareDocumentPosition(form()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    answer(SENTENCE.floor, 'Yes, it fits');
    expect(screen.queryByRole('button', { name: 'Finish review' })).toBeNull();
  });

  it('settles the target after a save: says what was saved, locks its rows, and counts an unanswered row of it as changed', async () => {
    changeTarget.mockResolvedValue(saved());
    sitting();
    answer(SENTENCE.floor, 'No, change it');
    fireEvent.click(within(form()).getByRole('button', { name: 'Save the change' }));
    expect(await screen.findByText('Saved. From Mon, Nov 2: 3 workouts in a hard week, hoping for 4.')).toBeTruthy();
    expect(screen.queryByRole('form')).toBeNull();
    // Both rows are the person's change now, and neither can say the opposite.
    for (const sentence of [SENTENCE.floor, SENTENCE.aspiration]) {
      const radios = within(group(sentence)).getAllByRole('radio') as HTMLButtonElement[];
      expect(radios.every((r) => r.disabled)).toBe(true);
      expect(radios.find((r) => r.getAttribute('aria-checked') === 'true')?.textContent).toBe('✓No, change it');
    }
    fireEvent.click(screen.getByRole('button', { name: 'Finish review' }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(finishReview).toHaveBeenCalledWith(null, { 'm-floor': 'changed', 'm-asp': 'changed' });
  });

  it('keeps the person\'s own "yes, it fits" on a row of a target they changed', async () => {
    changeTarget.mockResolvedValue(saved());
    sitting();
    answer(SENTENCE.aspiration, 'Yes, it fits');
    answer(SENTENCE.floor, 'No, change it');
    fireEvent.click(within(form()).getByRole('button', { name: 'Save the change' }));
    await screen.findByText(/^Saved\./);
    fireEvent.click(screen.getByRole('button', { name: 'Finish review' }));
    await waitFor(() => expect(finishReview).toHaveBeenCalledWith(null, { 'm-asp': 'kept', 'm-floor': 'changed' }));
  });

  it('"Never mind" closes the form and takes the answer it opened for back, saving nothing', () => {
    sitting();
    answer(SENTENCE.floor, 'No, change it');
    fireEvent.click(within(form()).getByRole('button', { name: 'Never mind' }));
    expect(screen.queryByRole('form')).toBeNull();
    expect(within(group(SENTENCE.floor)).getAllByRole('radio').every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
    expect(changeTarget).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Finish review' })).toBeNull();
  });

  it('closes the form again when the only "change" is taken back with "Yes, it fits"', () => {
    sitting([FLOOR]);
    answer(SENTENCE.floor, 'No, change it');
    expect(form()).toBeTruthy();
    answer(SENTENCE.floor, 'Yes, it fits');
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.getByRole('button', { name: 'Finish review' })).toBeTruthy();
  });

  it('opens one form at a time: asking to change another target closes the first and takes its answer back', () => {
    sitting([FLOOR, READ_FLOOR]);
    answer(SENTENCE.floor, 'No, change it');
    answer(SENTENCE.read, 'No, change it');
    expect(screen.getAllByRole('form')).toHaveLength(1);
    expect(within(form()).getByText(/how many pages would still count/)).toBeTruthy();
    expect(within(group(SENTENCE.floor)).getAllByRole('radio').every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
  });

  it('keeps the questions it began with when the page refreshes after a save, because the server then counts them as changed', async () => {
    changeTarget.mockResolvedValue(saved());
    const props = { offerLine: false, adjustment: null } as const;
    const items = [FLOOR, ASPIRATION];
    const edits = [edit()];
    const { rerender } = render(<ReviewSitting {...props} stillRight={{ items, edits }} />);
    answer(SENTENCE.floor, 'No, change it');
    fireEvent.click(within(form()).getByRole('button', { name: 'Save the change' }));
    await screen.findByText(/^Saved./);
    // The save revalidated the page: the server now has nothing left to ask, and layer 3's question may be back.
    rerender(
      <ReviewSitting
        {...props}
        adjustment={adjustmentView({ kind: 'slipping_check_in', targetId: 't1', periods: 2 }, { target: () => 'Workouts', item: () => null })}
        stillRight={{ items: [], edits: [] }}
      />,
    );
    expect(screen.getByRole('region', { name: 'Still right for you?' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'One thing to decide' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Finish review' }));
    await waitFor(() => expect(finishReview).toHaveBeenCalledWith(null, { 'm-floor': 'changed', 'm-asp': 'changed' }));
  });

  it('lets the person change a saved change again, with the saved numbers in the boxes', async () => {
    changeTarget.mockResolvedValue(saved());
    sitting([FLOOR]);
    answer(SENTENCE.floor, 'No, change it');
    fireEvent.click(within(form()).getByRole('button', { name: 'Save the change' }));
    await screen.findByText(/^Saved\./);
    fireEvent.click(screen.getByRole('button', { name: 'Change it again' }));
    expect((within(form()).getByRole('textbox', { name: /would still count/ }) as HTMLInputElement).value).toBe('3');
    expect(screen.queryByRole('button', { name: 'Finish review' })).toBeNull();
  });
});
