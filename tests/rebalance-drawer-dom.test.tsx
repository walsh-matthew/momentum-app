// @vitest-environment jsdom
//
// The rebalance drawer's two interactions in a DOM (MOM-61, closing what MOM-59 listed): a successful "Ask Claude
// to review" replacing the proposal on screen, and Apply. Both server actions are mocked; the actions themselves are
// covered in tests/rebalance-model.test.ts and tests/tasks-service.test.ts. The drawer's states rendered to HTML are
// in tests/rebalance-drawer.test.tsx, and its channel wiring in tests/channel-selection.test.tsx.
//
// Nothing changes the plan except the user's own Apply click (docs/NINETY_DAY_PLAN_CONTEXT.md §5 rule 1): every
// test checks that nothing was applied before it.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RebalanceDrawer } from '@/components/rebalance/RebalanceDrawer';
import type { RebalanceProposalView } from '@/types/rebalance';

// The default of 1 second is too tight when the whole suite runs in parallel.
const actions = vi.hoisted(() => ({ apply: vi.fn(), ask: vi.fn() }));
vi.mock('@/app/actions/tasks', () => ({
  applyRebalanceProposal: actions.apply,
  askClaudeToRebalance: actions.ask,
}));

const CHANNEL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const TASKS = {
  [A]: { id: A, title: 'Study cloud security', taskType: 'certify' as const, minutes: 45 },
  [B]: { id: B, title: 'Build the demo', taskType: 'build' as const, minutes: 60 },
};

const rulesView = (): RebalanceProposalView => ({
  source: 'rules',
  model: null,
  notice: null,
  currentWeek: 4,
  proposal: {
    summary: 'Rule-based: 2 unfinished tasks can be carried over.',
    moves: [
      { action: 'carry_over', taskId: A, fromWeek: 2, toWeek: 4, reason: 'Unfinished in week 2; week 4 has room.' },
      { action: 'carry_over', taskId: B, fromWeek: 3, toWeek: 5, reason: 'Week 4 is full.' },
    ],
    warnings: [],
  },
  tasks: TASKS,
});

// Claude's answer: a different summary and only one move, so replacement is visible on screen.
const modelView = (): RebalanceProposalView => ({
  source: 'model',
  model: 'claude-opus-5-5',
  notice: null,
  currentWeek: 4,
  proposal: {
    summary: 'Claude: move the certification block first.',
    moves: [{ action: 'carry_over', taskId: A, fromWeek: 2, toWeek: 4, reason: 'It unblocks the exam date.' }],
    warnings: [],
  },
  tasks: TASKS,
});

function open(view: RebalanceProposalView | null = rulesView()) {
  return render(<RebalanceDrawer open onClose={() => {}} view={view} channelId={CHANNEL} moveChains={{}} />);
}
// The dialog's name is its current heading, which changes after Apply ("Moved 2 tasks"), so find it by role.
const drawer = () => within(screen.getByRole('dialog'));

beforeEach(() => {
  actions.apply.mockReset();
  actions.ask.mockReset();
  // jsdom has no <dialog>.showModal; this stand-in only opens and closes it.
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});
afterEach(cleanup);

describe('Ask Claude to review', () => {
  it('shows the rule-based proposal first and calls nothing on open', () => {
    open();
    expect(drawer().getByText('Rule-based: 2 unfinished tasks can be carried over.')).toBeTruthy();
    expect(drawer().getByText('Rule-based suggestion', { exact: false })).toBeTruthy();
    expect(actions.ask).not.toHaveBeenCalled();
    expect(actions.apply).not.toHaveBeenCalled();
  });

  it('a successful answer replaces the proposal on screen, and applies nothing', async () => {
    actions.ask.mockResolvedValue({ ok: true, data: modelView() });
    open();

    fireEvent.click(drawer().getByRole('button', { name: 'Ask Claude to review' }));

    await waitFor(() => expect(drawer().getByText('Claude: move the certification block first.')).toBeTruthy());
    expect(actions.ask).toHaveBeenCalledTimes(1);
    expect(actions.ask).toHaveBeenCalledWith(CHANNEL);
    // The rule-based text and Build the demo's move are gone; Claude's one move is the proposal now.
    expect(drawer().queryByText('Rule-based: 2 unfinished tasks can be carried over.')).toBeNull();
    expect(drawer().queryByText('Build the demo')).toBeNull();
    expect(drawer().getByText('Study cloud security')).toBeTruthy();
    expect(drawer().getByText('It unblocks the exam date.')).toBeTruthy();
    expect(drawer().getByText(/Suggested by Claude \(claude-opus-5-5\)/)).toBeTruthy();
    expect(await drawer().findByRole('button', { name: 'Ask Claude again' })).toBeTruthy();
    expect(await drawer().findByRole('button', { name: 'Apply 1 shift' })).toBeTruthy();
    // Only the user's click applies anything.
    expect(actions.apply).not.toHaveBeenCalled();
  });

  it('shows "Asking Claude…" while it waits, and blocks a second click', async () => {
    let resolve!: (v: unknown) => void;
    actions.ask.mockReturnValue(new Promise((r) => (resolve = r)));
    open();

    fireEvent.click(drawer().getByRole('button', { name: 'Ask Claude to review' }));

    const busy = await drawer().findByRole('button', { name: 'Asking Claude…' });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(busy);
    expect(actions.ask).toHaveBeenCalledTimes(1);

    resolve({ ok: true, data: modelView() });
    await waitFor(() => expect(drawer().getByText('Claude: move the certification block first.')).toBeTruthy());
  });

  it('a refused answer keeps the proposal and shows the reason', async () => {
    actions.ask.mockResolvedValue({ ok: false, error: 'Please wait a few seconds before asking again.' });
    open();

    fireEvent.click(drawer().getByRole('button', { name: 'Ask Claude to review' }));

    expect((await drawer().findByRole('alert')).textContent).toBe('Please wait a few seconds before asking again.');
    expect(drawer().getByText('Rule-based: 2 unfinished tasks can be carried over.')).toBeTruthy();
    expect(await drawer().findByRole('button', { name: 'Ask Claude to review' })).toBeTruthy();
    expect(actions.apply).not.toHaveBeenCalled();
  });

  it('when Claude falls back to the rules it says so, in a notice', async () => {
    actions.ask.mockResolvedValue({
      ok: true,
      data: { ...rulesView(), notice: "Claude's suggestion could not be used, so this is the rule-based one." },
    });
    open();

    fireEvent.click(drawer().getByRole('button', { name: 'Ask Claude to review' }));

    expect((await drawer().findByRole('status')).textContent).toContain('could not be used');
  });
});

describe('Apply', () => {
  it('applies the selected moves only when clicked, then shows what moved', async () => {
    actions.apply.mockResolvedValue({ ok: true, data: { moved: [A, B], skipped: [] } });
    open();
    expect(actions.apply).not.toHaveBeenCalled();

    fireEvent.click(drawer().getByRole('button', { name: 'Apply 2 shifts' }));

    await waitFor(() => expect(actions.apply).toHaveBeenCalledTimes(1));
    const sent = actions.apply.mock.calls[0][0];
    expect(sent.moves.map((m: { taskId: string }) => m.taskId)).toEqual([A, B]);
    expect(sent.summary).toBe('Rule-based: 2 unfinished tasks can be carried over.');
    expect(await drawer().findByRole('heading', { name: 'Moved 2 tasks' })).toBeTruthy();
    expect(drawer().getByText(/Nothing was deleted or marked done/)).toBeTruthy();
    expect(drawer().getByRole('button', { name: 'Done' })).toBeTruthy();
  });

  it('sends only the moves that are still ticked', async () => {
    actions.apply.mockResolvedValue({ ok: true, data: { moved: [B], skipped: [] } });
    open();

    fireEvent.click(drawer().getByRole('checkbox', { name: /Study cloud security/ }));
    expect(drawer().getByRole('button', { name: 'Apply 1 shift' })).toBeTruthy();
    fireEvent.click(drawer().getByRole('button', { name: 'Apply 1 shift' }));

    await waitFor(() => expect(actions.apply).toHaveBeenCalledTimes(1));
    expect(actions.apply.mock.calls[0][0].moves.map((m: { taskId: string }) => m.taskId)).toEqual([B]);
    expect(await drawer().findByRole('heading', { name: 'Moved 1 task' })).toBeTruthy();
  });

  it('with every move unticked, Apply stays solid; a tap says "Choose at least one shift.", moves to the shifts and applies nothing (MOM-145)', () => {
    open();
    fireEvent.click(drawer().getByRole('checkbox', { name: /Study cloud security/ }));
    fireEvent.click(drawer().getByRole('checkbox', { name: /Build the demo/ }));
    const apply = drawer().getByRole('button', { name: 'Apply shifts' }) as HTMLButtonElement;
    expect(apply.disabled).toBe(false);
    fireEvent.click(apply);
    expect(drawer().getByRole('alert').textContent).toBe('Choose at least one shift.');
    expect(document.activeElement).toBe(drawer().getAllByRole('checkbox')[0]);
    expect(actions.apply).not.toHaveBeenCalled();
    fireEvent.click(drawer().getByRole('checkbox', { name: /Study cloud security/ }));
    expect(drawer().queryByText('Choose at least one shift.')).toBeNull();
  });

  it('lists the tasks the server left where they were, with its reason', async () => {
    actions.apply.mockResolvedValue({
      ok: true,
      data: { moved: [B], skipped: [{ taskId: A, reason: 'You ticked it off in the meantime.' }] },
    });
    open();

    fireEvent.click(drawer().getByRole('button', { name: 'Apply 2 shifts' }));

    expect(await drawer().findByRole('heading', { name: 'Moved 1 task' })).toBeTruthy();
    const skipped = within(drawer().getByRole('region', { name: 'Tasks that did not move' }));
    expect(skipped.getByText('Study cloud security')).toBeTruthy();
    expect(skipped.getByText('You ticked it off in the meantime.')).toBeTruthy();
  });

  it('a refusal keeps the proposal on screen and shows the error beside the buttons', async () => {
    actions.apply.mockResolvedValue({ ok: false, error: 'Your plan changed. Close this and try again.' });
    open();

    fireEvent.click(drawer().getByRole('button', { name: 'Apply 2 shifts' }));

    expect((await drawer().findByRole('alert')).textContent).toBe('Your plan changed. Close this and try again.');
    expect(await drawer().findByRole('button', { name: 'Apply 2 shifts' })).toBeTruthy();
  });

  it('a thrown action shows a plain message instead of failing silently', async () => {
    actions.apply.mockRejectedValue(new Error('boom'));
    open();

    fireEvent.click(drawer().getByRole('button', { name: 'Apply 2 shifts' }));

    expect((await drawer().findByRole('alert')).textContent).toContain('Your plan is unchanged');
  });

  it('applies Claude\'s proposal, not the rule-based one, once Claude has answered', async () => {
    actions.ask.mockResolvedValue({ ok: true, data: modelView() });
    actions.apply.mockResolvedValue({ ok: true, data: { moved: [A], skipped: [] } });
    open();

    fireEvent.click(drawer().getByRole('button', { name: 'Ask Claude to review' }));
    await waitFor(() => expect(drawer().getByRole('button', { name: 'Apply 1 shift' })).toBeTruthy());
    expect(actions.apply).not.toHaveBeenCalled();
    fireEvent.click(drawer().getByRole('button', { name: 'Apply 1 shift' }));

    await waitFor(() => expect(actions.apply).toHaveBeenCalledTimes(1));
    expect(actions.apply.mock.calls[0][0].summary).toBe('Claude: move the certification block first.');
    expect(actions.apply.mock.calls[0][0].moves).toHaveLength(1);
  });
});

describe('closing', () => {
  it('"Keep my plan" closes without applying or asking anything', () => {
    const onClose = vi.fn();
    render(<RebalanceDrawer open onClose={onClose} view={rulesView()} channelId={CHANNEL} moveChains={{}} />);
    fireEvent.click(drawer().getByRole('button', { name: 'Keep my plan' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(actions.apply).not.toHaveBeenCalled();
    expect(actions.ask).not.toHaveBeenCalled();
  });
});
