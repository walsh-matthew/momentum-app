// @vitest-environment jsdom
//
// The main feed's empty states in a DOM (MOM-18): signed out, no goals, no tasks and all done. These render
// the real components, MainFeed and AppShell with views built by the real buildChannelViews; only the server
// actions behind the buttons are replaced. Which state applies is decided by buildChannelViews and the page
// (tests/feed-state.test.ts); here MainFeed must follow the state it is given, never the shape of the feed.
//
// Completion is human-only (docs/NINETY_DAY_PLAN_CONTEXT.md §3, §5 rule 6): opening the wizard or showing an
// empty state never ticks, reopens, creates or moves anything.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/components/layout/AppShell';
import { MainFeed } from '@/components/layout/MainFeed';
import { AllDoneState } from '@/components/tasks/AllDoneState';
import { NoGoalsState } from '@/components/tasks/NoGoalsState';
import { NoTasksState } from '@/components/tasks/NoTasksState';
import { SignedOutState } from '@/components/tasks/SignedOutState';
import { buildChannelViews } from '@/lib/utils/channelViews';
import { SIGNED_OUT_CHANNEL_VIEWS, EMPTY_CHANNEL_VIEWS, type FeedState } from '@/types/channelViews';
import type { MicroTask } from '@/types/database.types';
import type { FocusFeed } from '@/types/focusFeed';

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
// AppShell reads the selected channel from the address bar (MOM-88). This is the stand-in from
// tests/channel-selection.test.tsx for Next's useSearchParams: it reads the live URL and re-renders when it changes.
vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  const subscribe = (notify: () => void) => {
    window.addEventListener('popstate', notify);
    window.addEventListener('test:url-changed', notify);
    return () => {
      window.removeEventListener('popstate', notify);
      window.removeEventListener('test:url-changed', notify);
    };
  };
  const read = () => window.location.search;
  return { useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, read, read)) };
});

// pushState does not notify anyone by itself; Next's router does, so tell the stand-in above. Patched once.
const realPushState = window.history.pushState.bind(window.history);
window.history.pushState = (...args: Parameters<History['pushState']>) => {
  realPushState(...args);
  window.dispatchEvent(new Event('test:url-changed'));
};

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
const goal = (id: string, title: string) => ({ id, title, status: 'active' as const, start_date: '2026-09-23' });

// jsdom has no <dialog>.showModal; this stand-in only opens and closes it, which is all the wizard needs
// (the same one tests/channel-selection.test.tsx uses for the rebalance drawer).
beforeEach(() => {
  Object.values(actions).forEach((fn) => fn.mockReset());
  window.history.replaceState(null, '', '/');
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});
afterEach(cleanup);

const noActionCalled = () => {
  for (const fn of Object.values(actions)) expect(fn).not.toHaveBeenCalled();
};

describe('SignedOutState', () => {
  it('asks the user to sign in, with a link to /login and nothing else to click', () => {
    render(<SignedOutState />);
    expect(screen.getByRole('heading', { name: 'Sign in to see your plan' })).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Sign in' });
    expect(link.getAttribute('href')).toBe('/login');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('can point at another sign-in address', () => {
    render(<SignedOutState signInHref="/somewhere" />);
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/somewhere');
  });
});

describe('NoGoalsState', () => {
  it('explains there are no goals and opens the wizard only when the call to action is clicked', () => {
    const onNewGoal = vi.fn();
    render(<NoGoalsState onNewGoal={onNewGoal} />);
    expect(screen.getByRole('heading', { name: 'No goals yet' })).toBeTruthy();
    expect(onNewGoal).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Set up your first goal' }));
    expect(onNewGoal).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});

describe('NoTasksState', () => {
  it('names the channel and offers to start another goal', () => {
    const onNewGoal = vi.fn();
    render(<NoTasksState channelTitle="Brand New" onNewGoal={onNewGoal} />);
    expect(screen.getByRole('heading', { name: 'No tasks yet' })).toBeTruthy();
    expect(screen.getByText(/Brand New has no tasks yet/)).toBeTruthy();
    expect(onNewGoal).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Start another goal' }));
    expect(onNewGoal).toHaveBeenCalledTimes(1);
  });

  it('without a channel it speaks of the goals as a whole', () => {
    render(<NoTasksState onNewGoal={() => {}} />);
    expect(screen.getByText(/None of your goals has a task yet/)).toBeTruthy();
  });
});

describe('AllDoneState', () => {
  it('is a completion state with no controls of its own', () => {
    render(<AllDoneState />);
    expect(screen.getByRole('heading', { name: 'All done' })).toBeTruthy();
    expect(screen.getByText(/Everything on your list is done/)).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('names the channel that is finished', () => {
    render(<AllDoneState channelTitle="Career Pivot" />);
    expect(screen.getByText(/Everything in Career Pivot is done/)).toBeTruthy();
  });
});

describe('MainFeed chooses the screen from the state it is given', () => {
  const emptyFeed: FocusFeed = { focus: null, upNext: [], recentlyDone: [] };
  const last = finished('g', 2, { title: 'The very last task' });
  const feeds: Record<FeedState, FocusFeed> = {
    signed_out: emptyFeed,
    no_goals: emptyFeed,
    no_tasks: emptyFeed,
    all_done: { focus: null, upNext: [], recentlyDone: [last] },
    tasks: { focus: task('g', 2, { title: 'Do this now' }), upNext: [task('g', 3, { title: 'Then this' })], recentlyDone: [] },
  };
  const headings: Record<Exclude<FeedState, 'tasks'>, string> = {
    signed_out: 'Sign in to see your plan',
    no_goals: 'No goals yet',
    no_tasks: 'No tasks yet',
    all_done: 'All done',
  };
  const renderFeed = (feedState: FeedState, feed: FocusFeed = feeds[feedState], onNewGoal = () => {}) =>
    render(<MainFeed feedState={feedState} feed={feed} velocity={null} moveChains={{}} onNewGoal={onNewGoal} />);

  it.each(Object.keys(headings) as (keyof typeof headings)[])('%s shows its own screen and no other', (state) => {
    renderFeed(state);
    for (const [other, text] of Object.entries(headings)) {
      const heading = screen.queryByRole('heading', { name: text });
      if (other === state) expect(heading, other).toBeTruthy();
      else expect(heading, other).toBeNull();
    }
    expect(screen.queryByRole('heading', { name: 'Up next' })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    noActionCalled();
  });

  it('tasks shows the focus card and its lists, and no empty state', () => {
    renderFeed('tasks');
    expect(screen.getByRole('heading', { name: 'Do this now' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Up next' })).toBeTruthy();
    for (const text of Object.values(headings)) expect(screen.queryByRole('heading', { name: text })).toBeNull();
  });

  it('signed_out links to /login and shows nothing of a plan', () => {
    renderFeed('signed_out');
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('no_goals and no_tasks open the wizard through onNewGoal', () => {
    const onNewGoal = vi.fn();
    renderFeed('no_goals', emptyFeed, onNewGoal);
    fireEvent.click(screen.getByRole('button', { name: 'Set up your first goal' }));
    cleanup();
    renderFeed('no_tasks', emptyFeed, onNewGoal);
    fireEvent.click(screen.getByRole('button', { name: 'Start another goal' }));
    expect(onNewGoal).toHaveBeenCalledTimes(2);
  });

  it('all_done keeps the Recently done list beneath the completion state, so the last task can be reopened', async () => {
    actions.toggleTaskStatus.mockResolvedValue({ ok: true, data: { ...last, status: 'todo' } });
    renderFeed('all_done');

    const text = document.body.textContent ?? '';
    expect(text.indexOf('All done')).toBeLessThan(text.indexOf('Recently done'));
    expect(actions.toggleTaskStatus).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Reopen The very last task' }));
    await waitFor(() => expect(actions.toggleTaskStatus).toHaveBeenCalledWith(last.id, 'todo'));
  });

  it('never works the screen out from the feed: an empty feed in the tasks state shows no empty state', () => {
    renderFeed('tasks', emptyFeed);
    for (const text of Object.values(headings)) expect(screen.queryByRole('heading', { name: text })).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('never works the screen out from the feed: a feed with work in the no_tasks state still shows no tasks', () => {
    renderFeed('no_tasks', feeds.tasks);
    expect(screen.getByRole('heading', { name: 'No tasks yet' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Do this now' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Up next' })).toBeNull();
  });
});

describe('the empty states in the app shell', () => {
  const wizard = () => screen.queryByRole('dialog', { name: 'New goal wizard' });
  const wizardElements = () => document.querySelectorAll('dialog[aria-label="New goal wizard"]');
  const sidebar = () => within(screen.getByRole('complementary', { name: 'Goal channels' }));
  const renderShell = (views = EMPTY_CHANNEL_VIEWS) =>
    render(<AppShell views={views} connectedApps={[]} moveChains={{}} />);

  it('signed out: shows the sign-in call to action in the feed, with no channels and no plan', () => {
    renderShell(SIGNED_OUT_CHANNEL_VIEWS);
    const main = within(screen.getByRole('main'));
    expect(main.getByRole('heading', { name: 'Sign in to see your plan' })).toBeTruthy();
    expect(main.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login');
    expect(sidebar().getAllByRole('button').map((b) => b.textContent)).toContain('All channels');
    expect(screen.queryByRole('region', { name: 'Velocity' })).toBeNull();
    noActionCalled();
  });

  it('no goals: the call to action opens the goal wizard, which is closed until then', () => {
    renderShell(buildChannelViews([], [], [], TODAY));
    expect(wizard()).toBeNull();

    fireEvent.click(within(screen.getByRole('main')).getByRole('button', { name: 'Set up your first goal' }));

    expect(wizard()).toBeTruthy();
    expect(within(wizard()!).getByRole('heading', { name: 'New goal' })).toBeTruthy();
    // Opening it creates nothing: only the user's answers do.
    noActionCalled();
  });

  it('the call to action and "+ New Goal Wizard" open the same single wizard', () => {
    renderShell(buildChannelViews([], [], [], TODAY));
    expect(wizardElements()).toHaveLength(1);

    fireEvent.click(sidebar().getByRole('button', { name: '+ New Goal Wizard' }));
    expect(wizard()).toBeTruthy();
    expect(wizardElements()).toHaveLength(1);
    expect(wizardElements()[0].closest('aside')).toBeNull(); // not inside the sidebar panel
    expect(screen.getAllByRole('heading', { name: 'New goal' })).toHaveLength(1);

    // Cancel it in the wizard, then open it again from the feed.
    fireEvent.click(within(wizard()!).getByRole('button', { name: 'Cancel' }));
    expect(wizard()).toBeNull();
    fireEvent.click(within(screen.getByRole('main')).getByRole('button', { name: 'Set up your first goal' }));
    expect(wizard()).toBeTruthy();
    expect(wizardElements()).toHaveLength(1);
    noActionCalled();
  });

  it('a goal with no tasks: its channel shows the no-tasks state, and its button opens the wizard', () => {
    renderShell(buildChannelViews([goal('new', 'Brand New')], [], [], TODAY));
    fireEvent.click(sidebar().getByRole('button', { name: 'Brand New' }));

    const main = within(screen.getByRole('main'));
    expect(main.getByRole('heading', { name: 'No tasks yet' })).toBeTruthy();
    expect(main.getByText(/Brand New has no tasks yet/)).toBeTruthy();
    expect(wizard()).toBeNull();

    fireEvent.click(main.getByRole('button', { name: 'Start another goal' }));
    expect(wizard()).toBeTruthy();
    noActionCalled();
  });

  it('a finished channel shows the completion state beside one that still has work, and keeps its undo', () => {
    const tasks = [
      finished('career', 5, { title: 'Career shipped demo' }),
      finished('career', 5, { title: 'Career wrote notes' }),
      task('side', 1, { title: 'Side focus task' }),
    ];
    renderShell(buildChannelViews([goal('career', 'Career Pivot'), goal('side', 'Side Project')], tasks, [], TODAY));

    // All channels still has work.
    expect(screen.getByRole('heading', { name: 'Side focus task' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'All done' })).toBeNull();

    fireEvent.click(sidebar().getByRole('button', { name: 'Career Pivot' }));
    const main = within(screen.getByRole('main'));
    expect(main.getByRole('heading', { name: 'All done' })).toBeTruthy();
    expect(main.getByRole('button', { name: 'Reopen Career shipped demo' })).toBeTruthy();
    expect(main.queryByRole('heading', { name: 'Side focus task' })).toBeNull();

    fireEvent.click(sidebar().getByRole('button', { name: 'Side Project' }));
    expect(screen.getByRole('heading', { name: 'Side focus task' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'All done' })).toBeNull();
    expect(actions.toggleTaskStatus).not.toHaveBeenCalled();
  });

  it('the screen follows the data: reopening the last finished task brings the focus card back', () => {
    const last = finished('g', 2, { title: 'The very last task' });
    const view = renderShell(buildChannelViews([goal('g', 'Only Goal')], [last], [], TODAY));
    expect(screen.getByRole('heading', { name: 'All done' })).toBeTruthy();

    const reopened = { ...last, status: 'todo' as const, completed_at: null };
    view.rerender(
      <AppShell views={buildChannelViews([goal('g', 'Only Goal')], [reopened], [], TODAY)} connectedApps={[]} moveChains={{}} />,
    );
    expect(screen.queryByRole('heading', { name: 'All done' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'The very last task' })).toBeTruthy();
  });
});
