// @vitest-environment jsdom
//
// The sidebar's channel selection in a DOM (MOM-44): the feed and the velocity hero follow the channel the
// user picks, "All channels" is the default, and picking a channel never touches a task. These render the real
// AppShell, sidebar, feed and hero with views built by the real buildChannelViews; only the server actions
// behind the buttons are replaced. The views themselves are covered in tests/channel-views.test.ts.
//
// Completion is human-only (docs/NINETY_DAY_PLAN_CONTEXT.md §3, §5 rule 6): every test that switches channel
// also checks nothing was ticked, reopened or moved.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/components/layout/AppShell';
import { buildChannelViews } from '@/lib/utils/channelViews';
import { EMPTY_CHANNEL_VIEWS } from '@/types/channelViews';
import type { MicroTask } from '@/types/database.types';

const actions = vi.hoisted(() => ({
  toggleTaskStatus: vi.fn(),
  applyRebalanceProposal: vi.fn(),
  askClaudeToRebalance: vi.fn(),
  createGoalWithPlanAction: vi.fn(),
  generateWeekOnePlanAction: vi.fn(),
  signOutAction: vi.fn(),
  toggleConnectedApp: vi.fn(),
}));
vi.mock('@/app/actions/tasks', () => ({
  toggleTaskStatus: actions.toggleTaskStatus,
  applyRebalanceProposal: actions.applyRebalanceProposal,
  askClaudeToRebalance: actions.askClaudeToRebalance,
}));
vi.mock('@/app/actions/goals', () => ({
  createGoalWithPlanAction: actions.createGoalWithPlanAction,
  generateWeekOnePlanAction: actions.generateWeekOnePlanAction,
}));
vi.mock('@/app/actions/auth', () => ({ signOutAction: actions.signOutAction, authenticate: vi.fn() }));
vi.mock('@/app/actions/integrations', () => ({ toggleConnectedApp: actions.toggleConnectedApp }));

const TODAY = '2026-10-23';
let n = 0;
function task(goalId: string, week: number, over: Partial<MicroTask> = {}): MicroTask {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    user_id: 'u',
    goal_channel_id: goalId,
    title: `Task ${n}`,
    task_type: 'build',
    minutes: 30,
    status: 'todo',
    fit: null,
    week_of: week,
    due_date: null,
    carried_from_week: null,
    pulled_from_week: null,
    completed_at: null,
    source_provider: null,
    source_external_id: null,
    source_evidence: null,
    created_at: '2026-10-14T00:00:00Z',
    updated_at: '2026-10-14T00:00:00Z',
    ...over,
  };
}
const finished = (goalId: string, week: number, over: Partial<MicroTask> = {}) =>
  task(goalId, week, { status: 'done', completed_at: '2026-10-22T09:00:00Z', ...over });

// Career Pivot started 30 days ago (plan week 5) and is going well; Side Project started today (week 1).
const goals = [
  { id: 'career', title: 'Career Pivot', status: 'active' as const, start_date: '2026-09-23' },
  { id: 'side', title: 'Side Project', status: 'active' as const, start_date: '2026-10-23' },
];
const tasks = [
  finished('career', 5, { title: 'Career shipped demo' }),
  finished('career', 5, { title: 'Career wrote notes' }),
  task('career', 5, { title: 'Career open task' }),
  finished('side', 1, { title: 'Side kickoff done' }),
  task('side', 1, { title: 'Side focus task' }),
  task('side', 1, { title: 'Side second task' }),
  task('side', 1, { title: 'Side third task' }),
];

function renderShell(views = buildChannelViews(goals, tasks, [], TODAY)) {
  const ui = (v: typeof views) => (
    <AppShell views={v} connectedApps={[]} moveChains={{}} />
  );
  const result = render(ui(views));
  return { ...result, rerenderWith: (v: typeof views) => result.rerender(ui(v)) };
}

const sidebar = () => within(screen.getByRole('complementary', { name: 'Goal channels' }));
const velocity = () => screen.queryByRole('region', { name: 'Velocity' });
const channelButton = (name: string) => sidebar().getByRole('button', { name });
const current = () => sidebar().getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'page');
const bodyText = () => document.body.textContent ?? '';

beforeEach(() => Object.values(actions).forEach((fn) => fn.mockReset()));
afterEach(cleanup);

describe('the sidebar lists the user\'s real channels', () => {
  it('shows All channels first, then each active goal, instead of placeholders', () => {
    renderShell();
    const names = sidebar()
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(names.slice(0, 3)).toEqual(['All channels', 'Career Pivot', 'Side Project']);
    for (const placeholder of ['Health', 'Finances']) expect(names).not.toContain(placeholder);
  });

  it('starts on All channels', () => {
    renderShell();
    expect(current().map((b) => b.textContent)).toEqual(['All channels']);
  });

  it('a user with no goals sees only All channels and the empty state', () => {
    renderShell(EMPTY_CHANNEL_VIEWS);
    expect(current().map((b) => b.textContent)).toEqual(['All channels']);
    expect(screen.getByText('No tasks yet.')).toBeTruthy();
    expect(velocity()).toBeNull();
  });
});

describe('the default: all active channels', () => {
  it('the feed holds the earliest task across every channel, with the other channels\' tasks queued', () => {
    renderShell();
    const main = within(screen.getByRole('main'));
    // Side's week 1 task comes before Career's week 5 task.
    expect(main.getByRole('heading', { name: 'Side focus task' })).toBeTruthy();
    expect(main.getByText('Career open task')).toBeTruthy();
  });

  it('with several goals it gives no single velocity and says to choose a channel', () => {
    renderShell();
    const note = velocity()!;
    expect(note.textContent).toContain('Choose a channel in the sidebar');
    expect(note.textContent).not.toMatch(/\/100/);
  });

  it('with one goal the hero is that goal\'s velocity, as before', () => {
    renderShell(buildChannelViews([goals[0]], tasks, [], TODAY));
    expect(velocity()!.textContent).toContain('Week 5');
    expect(velocity()!.textContent).toContain('2 of 3 tasks ticked');
    expect(velocity()!.textContent).not.toContain('Choose a channel');
  });
});

describe('switching channels', () => {
  it('shows only that channel\'s tasks and updates the hero to that channel\'s velocity', () => {
    renderShell();

    fireEvent.click(channelButton('Career Pivot'));
    expect(current().map((b) => b.textContent)).toEqual(['Career Pivot']);
    let main = within(screen.getByRole('main'));
    expect(main.getByRole('heading', { name: 'Career open task' })).toBeTruthy();
    expect(bodyText()).not.toContain('Side focus task');
    expect(bodyText()).not.toContain('Side kickoff done');
    expect(main.getByText('Career Pivot')).toBeTruthy(); // the channel is named under the heading
    expect(velocity()!.textContent).toContain('Week 5');
    expect(velocity()!.textContent).toContain('2 of 3 tasks ticked');

    fireEvent.click(channelButton('Side Project'));
    expect(current().map((b) => b.textContent)).toEqual(['Side Project']);
    main = within(screen.getByRole('main'));
    expect(main.getByRole('heading', { name: 'Side focus task' })).toBeTruthy();
    expect(bodyText()).not.toContain('Career open task');
    expect(bodyText()).not.toContain('Career shipped demo');
    expect(velocity()!.textContent).toContain('Week 1');
    expect(velocity()!.textContent).toContain('1 of 4 tasks ticked');
  });

  it('the two channels show different scores, from their own start dates', () => {
    renderShell();
    fireEvent.click(channelButton('Career Pivot'));
    const careerScore = velocity()!.textContent;
    fireEvent.click(channelButton('Side Project'));
    const sideScore = velocity()!.textContent;
    expect(careerScore).toContain('67/100'); // 2 of 3
    expect(sideScore).toContain('25/100'); // 1 of 4
  });

  it('going back to All channels restores the full feed and the choose-a-channel note', () => {
    renderShell();
    fireEvent.click(channelButton('Career Pivot'));
    fireEvent.click(channelButton('All channels'));
    expect(current().map((b) => b.textContent)).toEqual(['All channels']);
    expect(screen.getByRole('heading', { name: 'Side focus task' })).toBeTruthy();
    expect(velocity()!.textContent).toContain('Choose a channel in the sidebar');
  });

  it('keeps Recently done to the selected channel, with its own Reopen buttons', () => {
    renderShell();
    fireEvent.click(channelButton('Side Project'));
    expect(screen.getByRole('button', { name: 'Reopen Side kickoff done' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reopen Career shipped demo' })).toBeNull();
  });

  it('a channel with no tasks shows the empty state and an empty velocity message', () => {
    const emptyGoals = [...goals, { id: 'new', title: 'Brand New', status: 'active' as const, start_date: TODAY }];
    renderShell(buildChannelViews(emptyGoals, tasks, [], TODAY));
    fireEvent.click(channelButton('Brand New'));
    expect(screen.getByText('No tasks yet.')).toBeTruthy();
    expect(velocity()!.textContent).toContain('appears once this week has tasks due');
  });

  it('never ticks, reopens or moves a task: switching only changes what is shown', () => {
    renderShell();
    for (const name of ['Career Pivot', 'Side Project', 'All channels', 'Career Pivot']) fireEvent.click(channelButton(name));
    expect(actions.toggleTaskStatus).not.toHaveBeenCalled();
    expect(actions.applyRebalanceProposal).not.toHaveBeenCalled();
    expect(actions.askClaudeToRebalance).not.toHaveBeenCalled();
    expect(actions.createGoalWithPlanAction).not.toHaveBeenCalled();
    expect(actions.generateWeekOnePlanAction).not.toHaveBeenCalled();
  });

  it('a click on a task in the selected channel still goes through the user\'s own toggle', async () => {
    actions.toggleTaskStatus.mockResolvedValue({ ok: true, data: {} });
    renderShell();
    fireEvent.click(channelButton('Career Pivot'));
    expect(actions.toggleTaskStatus).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox'));
    await vi.waitFor(() => expect(actions.toggleTaskStatus).toHaveBeenCalledTimes(1));
    const [id, status] = actions.toggleTaskStatus.mock.calls[0];
    expect(status).toBe('done');
    expect(id).toBe(tasks.find((t) => t.title === 'Career open task')!.id);
  });
});

describe('the selection survives the page refreshing its data', () => {
  it('keeps the selected channel when new data arrives (a tick refreshes the page)', () => {
    const view = renderShell();
    fireEvent.click(channelButton('Side Project'));

    const ticked = tasks.map((t) => (t.title === 'Side focus task' ? { ...t, status: 'done' as const, completed_at: '2026-10-23T08:00:00Z' } : t));
    view.rerenderWith(buildChannelViews(goals, ticked, [], TODAY));

    expect(current().map((b) => b.textContent)).toEqual(['Side Project']);
    expect(screen.getByRole('heading', { name: 'Side second task' })).toBeTruthy();
    expect(velocity()!.textContent).toContain('2 of 4 tasks ticked');
  });

  it('falls back to All channels if the selected channel is no longer there', () => {
    const view = renderShell();
    fireEvent.click(channelButton('Side Project'));

    const paused = [goals[0], { ...goals[1], status: 'paused' as const }];
    view.rerenderWith(buildChannelViews(paused, tasks, [], TODAY));

    expect(sidebar().queryByRole('button', { name: 'Side Project' })).toBeNull();
    expect(current().map((b) => b.textContent)).toEqual(['All channels']);
    expect(screen.getByRole('heading', { name: 'Career open task' })).toBeTruthy();
    expect(bodyText()).not.toContain('Side focus task');
  });

  it('shows a newly created goal in the sidebar without losing the selection', () => {
    const view = renderShell();
    fireEvent.click(channelButton('Career Pivot'));

    const created = [...goals, { id: 'fresh', title: 'Fresh Goal', status: 'active' as const, start_date: TODAY }];
    view.rerenderWith(buildChannelViews(created, tasks, [], TODAY));

    expect(channelButton('Fresh Goal')).toBeTruthy();
    expect(current().map((b) => b.textContent)).toEqual(['Career Pivot']);
  });
});

describe('on a phone', () => {
  it('picking a channel goes to the feed, where the result is', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Channels' }));
    expect(screen.getByRole('main').className).toContain('hidden');

    fireEvent.click(channelButton('Career Pivot'));

    expect(screen.getByRole('main').className).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(within(screen.getByRole('navigation', { name: 'Workspace sections' })).getByRole('button', { name: 'Feed' }).getAttribute('aria-current')).toBe('page');
  });
});

// MOM-87: the rebalance side card and drawer follow the selected channel too.
describe('rebalancing follows the selected channel', () => {
  // jsdom has no <dialog>.showModal; this stand-in only opens and closes it, which is all the drawer needs.
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute('open');
    };
  });

  // Career Pivot (plan week 5) has an open task left over in week 2, so it has something to carry over.
  // Side Project (week 1) is on track.
  const behindTask = task('career', 2, { title: 'Career behind task' });
  const rebalanceTasks = [...tasks, behindTask];
  const rebalanceViews = () => buildChannelViews(goals, rebalanceTasks, [], TODAY);

  const openAssistantTab = () => fireEvent.click(screen.getByRole('tab', { name: 'AI Assistant' }));
  const sideCard = () => within(screen.getByRole('region', { name: 'Rebalance' }));
  const openDrawer = () => fireEvent.click(sidebar().getByRole('button', { name: 'Adjust Weekly Pace' }));
  const drawer = () => within(screen.getByRole('dialog', { name: 'Rebalance your plan' }));
  // The drawer has a header × ("Close without changing anything") and a footer button; either closes it.
  const closeDrawer = () => fireEvent.click(screen.getAllByRole('button', { name: /^Close/ })[0]);

  describe('the side card', () => {
    it('asks for a channel under All channels when several goals are active', () => {
      renderShell(rebalanceViews());
      openAssistantTab();
      expect(sideCard().getByText(/Choose a channel in the sidebar/)).toBeTruthy();
      expect(sideCard().queryByRole('button', { name: 'Review proposal' })).toBeNull();
    });

    it('shows each channel\'s own proposal when it is selected', () => {
      renderShell(rebalanceViews());
      openAssistantTab();

      fireEvent.click(channelButton('Career Pivot'));
      expect(sideCard().getByText('1 to carry over')).toBeTruthy();
      expect(sideCard().getByRole('button', { name: 'Review proposal' })).toBeTruthy();

      fireEvent.click(channelButton('Side Project'));
      expect(sideCard().getByText(/on track/)).toBeTruthy();
      expect(sideCard().queryByText('1 to carry over')).toBeNull();
      expect(sideCard().queryByRole('button', { name: 'Review proposal' })).toBeNull();
    });

    it('with a single goal the card shows that goal\'s proposal under All channels', () => {
      renderShell(buildChannelViews([goals[0]], rebalanceTasks, [], TODAY));
      openAssistantTab();
      expect(sideCard().getByText('1 to carry over')).toBeTruthy();
    });
  });

  describe('the drawer', () => {
    it('under All channels with several goals it says to choose a channel, and offers no Claude button', () => {
      renderShell(rebalanceViews());
      openDrawer();
      expect(drawer().getByText(/Choose a channel in the sidebar, then open this again/)).toBeTruthy();
      expect(drawer().queryByRole('button', { name: /Ask Claude/ })).toBeNull();
      expect(actions.askClaudeToRebalance).not.toHaveBeenCalled();
    });

    it('shows the selected channel\'s tasks and week, and only that channel\'s', () => {
      renderShell(rebalanceViews());
      fireEvent.click(channelButton('Career Pivot'));
      openDrawer();
      expect(drawer().getByText('Career behind task')).toBeTruthy();
      expect(drawer().getByText(/week 5 of the plan/)).toBeTruthy();
      expect(drawer().queryByText(/Side/)).toBeNull();
      closeDrawer();

      fireEvent.click(channelButton('Side Project'));
      openDrawer();
      expect(drawer().getByText('Nothing is behind, so there is nothing to rebalance.')).toBeTruthy();
      expect(drawer().getByText(/week 1 of the plan/)).toBeTruthy();
      expect(drawer().queryByText('Career behind task')).toBeNull();
    });

    it('"Ask Claude" sends the id of the channel the drawer is showing, and only when clicked', async () => {
      actions.askClaudeToRebalance.mockResolvedValue({ ok: false, error: 'Please wait a few seconds before asking again.' });
      renderShell(rebalanceViews());

      fireEvent.click(channelButton('Career Pivot'));
      openDrawer();
      expect(actions.askClaudeToRebalance).not.toHaveBeenCalled();
      fireEvent.click(drawer().getByRole('button', { name: 'Ask Claude to review' }));
      await vi.waitFor(() => expect(actions.askClaudeToRebalance).toHaveBeenCalledTimes(1));
      expect(actions.askClaudeToRebalance).toHaveBeenLastCalledWith('career');
      await vi.waitFor(() => expect(drawer().getByRole('alert').textContent).toContain('Please wait'));
      closeDrawer();

      fireEvent.click(channelButton('Side Project'));
      openDrawer();
      fireEvent.click(drawer().getByRole('button', { name: 'Ask Claude to review' }));
      await vi.waitFor(() => expect(actions.askClaudeToRebalance).toHaveBeenCalledTimes(2));
      expect(actions.askClaudeToRebalance).toHaveBeenLastCalledWith('side');
    });

    it('with a single goal "Ask Claude" sends that goal\'s id even under All channels', async () => {
      actions.askClaudeToRebalance.mockResolvedValue({ ok: false, error: 'x' });
      renderShell(buildChannelViews([goals[1]], tasks, [], TODAY));
      openDrawer();
      fireEvent.click(drawer().getByRole('button', { name: 'Ask Claude to review' }));
      await vi.waitFor(() => expect(actions.askClaudeToRebalance).toHaveBeenCalledWith('side'));
    });

    it('switching channels, opening the drawer and closing it change nothing in the plan', () => {
      renderShell(rebalanceViews());
      for (const name of ['Career Pivot', 'Side Project', 'All channels']) {
        fireEvent.click(channelButton(name));
        openDrawer();
        closeDrawer();
      }
      expect(actions.applyRebalanceProposal).not.toHaveBeenCalled();
      expect(actions.askClaudeToRebalance).not.toHaveBeenCalled();
      expect(actions.toggleTaskStatus).not.toHaveBeenCalled();
    });
  });
});
