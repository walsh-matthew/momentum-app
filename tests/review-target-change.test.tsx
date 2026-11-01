// @vitest-environment jsdom
//
// The edit the weekly review opens from "Yes, I want to change it" (components/review/TargetChangeForm.tsx inside ReviewSitting,
// MOM-146, docs/DOMAIN_MODEL.md §1.7 and §3.2). The save action is stubbed, so no database and no network. What these hold fixed:
// - the choice opens the edit in the same card, with the numbers asked for by what they are for (setup's own questions), what they
//   are now, what last week came to and the day the change starts; the finish is not there until the change is saved,
// - "Save the change" is always there and solid: tapped with something missing or wrong it sends nothing, answers with one callout that
//   names it and moves to it (MOM-145); while saving it says "Saving…" and is not disabled,
// - a save that fails says nothing was changed and lets the person try again; "Never mind" returns to the three choices unchanged,
// - after a save the sentence says what was saved and from when, the finish appears, "Change it again" reopens with the saved numbers,
//   and the other answers are locked so none says the opposite of what was done,
// - the chosen answer carries a check mark, not only a colour.
// A state update after an await inside a transition is waited for with findByRole (F-072).

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adjustmentView } from '@/components/review/adjustmentWording';
import { ReviewSitting } from '@/components/review/ReviewSitting';
import { CHANGE_PROBLEMS, CHANGE_SAVE_FAILED } from '@/lib/review/targetChange';
import type { ServiceResult } from '@/lib/services/result';
import type { SavedTargetChange, TargetEdit } from '@/types/review';
import type { LayerThreeAdjustment } from '@/types/scoreboard';

const refresh = vi.fn();
const changeTarget = vi.fn<(input: unknown) => Promise<ServiceResult<SavedTargetChange>>>();
const finishReview = vi.fn<(outcome: unknown) => Promise<ServiceResult<{ id: string; weekStart: string }>>>();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/app/actions/review', () => ({ askForReviewLine: vi.fn(), finishReview: (outcome: unknown) => finishReview(outcome) }));
vi.mock('@/app/actions/targetChange', () => ({ changeTarget: (input: unknown) => changeTarget(input) }));

beforeEach(() => {
  refresh.mockReset();
  changeTarget.mockReset();
  finishReview.mockReset();
  finishReview.mockResolvedValue({ ok: true, data: { id: 'r1', weekStart: '2026-10-19' } });
});
afterEach(cleanup);

const SLIPPING: LayerThreeAdjustment = { kind: 'slipping_check_in', targetId: 't1', periods: 2 };
const REBASE: LayerThreeAdjustment = { kind: 'rebaseline', targetId: 't1', periods: 3 };

const EDIT: TargetEdit = {
  targetId: '11111111-1111-4111-8111-111111111111',
  title: 'Runs',
  measure: 'count',
  unit: null,
  period: 'weekly',
  floor: 3,
  aspiration: 5,
  days: null,
  weekStartsOn: 1,
  lastCounted: 2,
  effectiveFrom: '2026-11-02',
  today: '2026-10-31',
};
const SLOTS: TargetEdit = { ...EDIT, period: 'day_slots', days: [1, 3, 5], floor: 2, aspiration: null };

const sitting = (adjustment: LayerThreeAdjustment, edit: TargetEdit | null = EDIT) =>
  render(<ReviewSitting offerLine={false} adjustment={adjustmentView(adjustment, { target: () => 'Runs', item: () => null })} edit={edit} />);

const saved = (over: Partial<SavedTargetChange> = {}): ServiceResult<SavedTargetChange> => ({
  ok: true,
  data: { targetId: EDIT.targetId, effectiveFrom: '2026-11-02', floor: 4, aspiration: 6, days: null, ...over },
});

const open = () => fireEvent.click(screen.getByRole('radio', { name: /^(✓)?Yes, I want to change it$/ }));
const form = () => screen.getByRole('form', { name: 'Change this target' });
const type = (name: RegExp | string, value: string) => fireEvent.change(within(form()).getByRole('textbox', { name }), { target: { value } });

describe('opening the edit', () => {
  it('opens in the same card when the person says yes, asking each number by what it is for', () => {
    sitting(SLIPPING);
    expect(screen.queryByRole('form')).toBeNull();
    open();
    const card = screen.getByRole('region', { name: 'One thing to decide' });
    expect(within(card).getByRole('form', { name: 'Change this target' })).toBeTruthy();
    const f = form();
    expect(within(f).getByText('In a hard week, how many runs would still count?')).toBeTruthy();
    expect(within(f).getByText('How many runs a week are you hoping for?')).toBeTruthy();
    // What they are now, what last week came to, and when the change starts.
    expect(within(f).getByText('Now: 3. Last week you did 2.')).toBeTruthy();
    expect(within(f).getByText('Now: 5. You can leave this empty.')).toBeTruthy();
    expect(within(f).getByText('This starts Mon, Nov 2. Weeks before that keep the numbers they had.')).toBeTruthy();
    expect((within(f).getByRole('textbox', { name: /would still count/ }) as HTMLInputElement).value).toBe('3');
    expect((within(f).getByRole('textbox', { name: /hoping for/ }) as HTMLInputElement).value).toBe('5');
    // No jargon: the numbers are never called a floor or an aspiration.
    expect(f.textContent).not.toMatch(/floor|aspiration|target(?!s? )/i);
  });

  it('has no finish button while the edit is open, and the main button is there, solid and not disabled', () => {
    sitting(SLIPPING);
    open();
    expect(screen.queryByRole('button', { name: 'Finish review' })).toBeNull();
    const save = within(form()).getByRole('button', { name: 'Save the change' }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    expect(save.getAttribute('aria-disabled')).toBeNull();
    expect(save.type).toBe('submit');
  });

  it('marks the chosen answer with a check mark as well as its colour, and no other', () => {
    sitting(SLIPPING);
    const group = screen.getByRole('radiogroup', { name: 'Your choice' });
    expect(group.textContent).not.toContain('✓');
    open();
    const chosen = within(group).getAllByRole('radio').filter((c) => c.getAttribute('aria-checked') === 'true');
    expect(chosen).toHaveLength(1);
    expect(chosen[0].textContent).toBe('✓Yes, I want to change it');
    expect(group.textContent?.match(/✓/g)).toHaveLength(1);
  });

  it('opens from a re-baseline too, whose first answer is "Yes, raise it"', () => {
    sitting(REBASE);
    fireEvent.click(screen.getByRole('radio', { name: 'Yes, raise it' }));
    expect(form()).toBeTruthy();
  });

  it('says nothing was changed, and shows no edit, where the edit does not cover the target', () => {
    sitting(SLIPPING, null);
    open();
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.getByText("Noted. This target can't be changed here, so nothing was changed.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Finish review' })).toBeTruthy();
  });

  it('"Never mind" closes the edit, clears the choice and saves nothing', () => {
    sitting(SLIPPING);
    open();
    fireEvent.click(within(form()).getByRole('button', { name: 'Never mind' }));
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.getAllByRole('radio').every((c) => c.getAttribute('aria-checked') === 'false')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Finish review' })).toBeNull();
    expect(changeTarget).not.toHaveBeenCalled();
  });
});

describe('a tap with something missing or wrong', () => {
  it('names a missing number in one callout, moves to that box and sends nothing', () => {
    sitting(SLIPPING);
    open();
    type(/would still count/, '');
    fireEvent.click(within(form()).getByRole('button', { name: 'Save the change' }));
    expect(within(form()).getByRole('alert').textContent).toBe(CHANGE_PROBLEMS.floor);
    expect(CHANGE_PROBLEMS.floor).toBe('Enter a number above 0.');
    expect(document.activeElement).toBe(within(form()).getByRole('textbox', { name: /would still count/ }));
    expect(changeTarget).not.toHaveBeenCalled();
  });

  it('refuses 0, a letter and a fraction of a count, in the same words', () => {
    sitting(SLIPPING);
    open();
    for (const [typed, message] of [
      ['0', 'Enter a number above 0.'],
      ['abc', 'Enter a number above 0.'],
      ['2.5', 'Enter a whole number above 0.'],
    ]) {
      type(/would still count/, typed);
      fireEvent.click(within(form()).getByRole('button', { name: 'Save the change' }));
      expect(within(form()).getByRole('alert').textContent).toBe(message);
    }
    expect(changeTarget).not.toHaveBeenCalled();
  });

  it('refuses a number hoped for that is below the one that still counts, and moves to it', () => {
    sitting(SLIPPING);
    open();
    type(/hoping for/, '2');
    fireEvent.click(within(form()).getByRole('button', { name: 'Save the change' }));
    expect(within(form()).getByRole('alert').textContent).toBe("The number you're hoping for can't be less than the one that still counts.");
    expect(document.activeElement).toBe(within(form()).getByRole('textbox', { name: /hoping for/ }));
    expect(changeTarget).not.toHaveBeenCalled();
  });

  it('takes an empty number hoped for as none, and clears the callout as soon as the person types', async () => {
    changeTarget.mockResolvedValue(saved({ aspiration: null }));
    sitting(SLIPPING);
    open();
    type(/would still count/, '');
    fireEvent.click(within(form()).getByRole('button', { name: 'Save the change' }));
    expect(within(form()).getByRole('alert')).toBeTruthy();
    type(/would still count/, '4');
    expect(within(form()).queryByRole('alert')).toBeNull();
    type(/hoping for/, '');
    fireEvent.click(within(form()).getByRole('button', { name: 'Save the change' }));
    await waitFor(() => expect(changeTarget).toHaveBeenCalledTimes(1));
    expect(changeTarget).toHaveBeenCalledWith({ targetId: EDIT.targetId, floor: '4', aspiration: '', days: null });
  });
});

describe('saving', () => {
  it('sends the typed numbers once, then says what was saved and from when, and the finish appears', async () => {
    changeTarget.mockResolvedValue(saved());
    sitting(SLIPPING);
    open();
    type(/would still count/, '4');
    type(/hoping for/, '6');
    fireEvent.click(within(form()).getByRole('button', { name: 'Save the change' }));
    expect(await screen.findByText('Saved. From Mon, Nov 2: 4 runs in a hard week, hoping for 6.')).toBeTruthy();
    expect(changeTarget).toHaveBeenCalledTimes(1);
    expect(changeTarget).toHaveBeenCalledWith({ targetId: EDIT.targetId, floor: '4', aspiration: '6', days: null });
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.getByRole('button', { name: 'Finish review' })).toBeTruthy();
    // The card says it once: the sentence is the only place the new numbers are written.
    expect(screen.getAllByText(/Saved\./)).toHaveLength(1);
  });

  it('leaves out "hoping for" when there is no such number', async () => {
    changeTarget.mockResolvedValue(saved({ floor: 1, aspiration: null }));
    sitting(SLIPPING);
    open();
    type(/hoping for/, '');
    type(/would still count/, '1');
    fireEvent.click(within(form()).getByRole('button', { name: 'Save the change' }));
    expect(await screen.findByText('Saved. From Mon, Nov 2: 1 run in a hard week.')).toBeTruthy();
  });

  it('is busy while saving: still solid, says "Saving…", and a second tap sends nothing', async () => {
    let resolve!: (v: ServiceResult<SavedTargetChange>) => void;
    changeTarget.mockReturnValue(new Promise((r) => (resolve = r)));
    sitting(SLIPPING);
    open();
    fireEvent.click(within(form()).getByRole('button', { name: 'Save the change' }));
    const busy = (await screen.findByRole('button', { name: 'Saving…' })) as HTMLButtonElement;
    expect(busy.disabled).toBe(false);
    expect(busy.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(busy);
    fireEvent.submit(form());
    expect(changeTarget).toHaveBeenCalledTimes(1);
    resolve(saved());
    await screen.findByText(/^Saved\. From Mon, Nov 2/);
  });

  it('says nothing was changed and lets the person try again when the save fails, with the button back', async () => {
    changeTarget.mockResolvedValueOnce({ ok: false, error: CHANGE_SAVE_FAILED });
    sitting(SLIPPING);
    open();
    fireEvent.click(within(form()).getByRole('button', { name: 'Save the change' }));
    expect((await screen.findByRole('alert')).textContent).toBe("Your change didn't save. Nothing was changed. Try again.");
    expect(((await screen.findByRole('button', { name: 'Save the change' })) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('button', { name: 'Finish review' })).toBeNull();
    changeTarget.mockResolvedValueOnce(saved());
    fireEvent.click(screen.getByRole('button', { name: 'Save the change' }));
    expect(await screen.findByText(/^Saved\. From Mon, Nov 2/)).toBeTruthy();
    expect(changeTarget).toHaveBeenCalledTimes(2);
  });

  it('says the same when the action itself throws', async () => {
    changeTarget.mockRejectedValueOnce(new Error('network'));
    sitting(SLIPPING);
    open();
    fireEvent.click(within(form()).getByRole('button', { name: 'Save the change' }));
    expect((await screen.findByRole('alert')).textContent).toBe(CHANGE_SAVE_FAILED);
    expect(((await screen.findByRole('button', { name: 'Save the change' })) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('after a change is saved', () => {
  async function savedSitting() {
    changeTarget.mockResolvedValue(saved());
    sitting(SLIPPING);
    open();
    type(/would still count/, '4');
    type(/hoping for/, '6');
    fireEvent.click(within(form()).getByRole('button', { name: 'Save the change' }));
    await screen.findByText(/^Saved\. From Mon, Nov 2/);
  }

  it('finishes with "changed" and refreshes', async () => {
    await savedSitting();
    fireEvent.click(screen.getByRole('button', { name: 'Finish review' }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(finishReview).toHaveBeenCalledTimes(1);
    expect(finishReview).toHaveBeenCalledWith('changed');
  });

  it('moves to the sentence that says what was saved', async () => {
    await savedSitting();
    await waitFor(() => expect(document.activeElement?.textContent).toMatch(/^Saved\. From Mon, Nov 2/));
  });

  it('locks the other answers, since a saved change stays saved', async () => {
    await savedSitting();
    const others = ['No, keep it as it is', 'Ask me again next week'].map((n) => screen.getByRole('radio', { name: n }) as HTMLButtonElement);
    expect(others.every((b) => b.disabled)).toBe(true);
  });

  it('"Change it again" reopens with the numbers just saved, and "Never mind" keeps them', async () => {
    await savedSitting();
    fireEvent.click(screen.getByRole('button', { name: 'Change it again' }));
    expect((within(form()).getByRole('textbox', { name: /would still count/ }) as HTMLInputElement).value).toBe('4');
    expect((within(form()).getByRole('textbox', { name: /hoping for/ }) as HTMLInputElement).value).toBe('6');
    expect(screen.queryByRole('button', { name: 'Finish review' })).toBeNull();
    fireEvent.click(within(form()).getByRole('button', { name: 'Never mind' }));
    expect(screen.getByText(/^Saved\. From Mon, Nov 2: 4 runs in a hard week, hoping for 6\.$/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Finish review' })).toBeTruthy();
  });

  it('a second save replaces the sentence with the newest numbers', async () => {
    await savedSitting();
    fireEvent.click(screen.getByRole('button', { name: 'Change it again' }));
    changeTarget.mockResolvedValueOnce(saved({ floor: 5, aspiration: null }));
    type(/would still count/, '5');
    type(/hoping for/, '');
    fireEvent.click(within(form()).getByRole('button', { name: 'Save the change' }));
    expect(await screen.findByText('Saved. From Mon, Nov 2: 5 runs in a hard week.')).toBeTruthy();
    expect(screen.queryByText(/4 runs in a hard week/)).toBeNull();
  });
});

describe('a day-slots target', () => {
  it('asks which days, in the order of the person\'s week, with the current days on', () => {
    sitting(SLIPPING, { ...SLOTS, weekStartsOn: 3 });
    open();
    const days = within(form()).getAllByRole('button', { pressed: true }).concat(within(form()).getAllByRole('button', { pressed: false }));
    expect(within(form()).getByText('Which days?')).toBeTruthy();
    expect(days).toHaveLength(7);
    const order = Array.from(form().querySelectorAll('button[aria-pressed]')).map((b) => b.textContent);
    expect(order).toEqual(['Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue']);
    const on = Array.from(form().querySelectorAll('button[aria-pressed="true"]')).map((b) => b.textContent);
    expect(on).toEqual(['Wed', 'Fri', 'Mon']);
  });

  it('sends the days as the database counts them, and asks for at least one', async () => {
    changeTarget.mockResolvedValue(saved({ floor: 2, aspiration: null, days: [2, 4] }));
    sitting(SLIPPING, SLOTS);
    open();
    for (const name of ['Mon', 'Wed', 'Fri']) fireEvent.click(within(form()).getByRole('button', { name }));
    fireEvent.click(within(form()).getByRole('button', { name: 'Save the change' }));
    expect(within(form()).getByRole('alert').textContent).toBe('Pick at least one day.');
    expect(document.activeElement).toBe(within(form()).getAllByRole('button', { pressed: false })[0]);
    expect(changeTarget).not.toHaveBeenCalled();
    for (const name of ['Tue', 'Thu']) fireEvent.click(within(form()).getByRole('button', { name }));
    expect(within(form()).queryByRole('alert')).toBeNull();
    fireEvent.click(within(form()).getByRole('button', { name: 'Save the change' }));
    await waitFor(() => expect(changeTarget).toHaveBeenCalledTimes(1));
    expect(changeTarget).toHaveBeenCalledWith({ targetId: EDIT.targetId, floor: '2', aspiration: '', days: [2, 4] });
  });

  it('shows no days for a weekly target', () => {
    sitting(SLIPPING);
    open();
    expect(within(form()).queryByText('Which days?')).toBeNull();
    expect(form().querySelectorAll('button[aria-pressed]')).toHaveLength(0);
  });
});
