// @vitest-environment jsdom
//
// The main feed's states in a DOM (MOM-18, MOM-93, MOM-115 trial subset): signed out, could not load, no goals, no tasks and all done.
// The state components are tested on their own. On home, only the signed-out card, tasks and the finished list show; the empty and failed
// states, which offered the old wizard or said "No goals yet" to a person whose setup may be saved, are hidden (the scoreboard and the
// setup card speak for the goal model). These render the real components, MainFeed and AppShell with views built by the real
// buildChannelViews. Which state applies is decided by buildChannelViews and the page (tests/feed-state.test.ts).
//
// Completion is human-only (docs/NINETY_DAY_PLAN_CONTEXT.md §3, §5 rule 6): showing a state never ticks, reopens, creates or moves
// anything.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/components/layout/AppShell';
import { MainFeed } from '@/components/layout/MainFeed';
import { AllDoneState } from '@/components/tasks/AllDoneState';
import { LoadFailedState } from '@/components/tasks/LoadFailedState';
import { NoGoalsState } from '@/components/tasks/NoGoalsState';
import { NoTasksState } from '@/components/tasks/NoTasksState';
import { SignedOutState } from '@/components/tasks/SignedOutState';
import { buildChannelViews } from '@/lib/utils/channelViews';
import {
  SIGNED_OUT_CHANNEL_VIEWS,
  EMPTY_CHANNEL_VIEWS,
  LOAD_FAILED_CHANNEL_VIEWS,
  type FeedState,
} from '@/types/channelViews';
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
  routerRefresh: vi.fn(),
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
  return {
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, read, read)),
    // Try again (MOM-93) refreshes the route; the test only needs to see that it did.
    useRouter: () => ({ refresh: actions.routerRefresh }),
  };
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

beforeEach(() => {
  Object.values(actions).forEach((fn) => fn.mockReset());
  window.history.replaceState(null, '', '/');
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

describe('LoadFailedState', () => {
  it('says the plan could not be loaded, with Try again and no goal prompt anywhere', () => {
    render(<LoadFailedState />);
    expect(screen.getByRole('heading', { name: "We couldn't load your plan" })).toBeTruthy();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Try again']);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/no goals|first goal|start another goal|wizard/i);
    noActionCalled();
  });

  it('Try again refreshes the route, and only when it is clicked', () => {
    render(<LoadFailedState />);
    expect(actions.routerRefresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(actions.routerRefresh).toHaveBeenCalledTimes(1);
  });

  it('uses the retry it is given instead of refreshing when it is given one', () => {
    const onRetry = vi.fn();
    render(<LoadFailedState onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(actions.routerRefresh).not.toHaveBeenCalled();
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
    load_failed: emptyFeed,
    no_goals: emptyFeed,
    no_tasks: emptyFeed,
    all_done: { focus: null, upNext: [], recentlyDone: [last] },
    tasks: { focus: task('g', 2, { title: 'Do this now' }), upNext: [task('g', 3, { title: 'Then this' })], recentlyDone: [] },
  };
  // Home shows the old model's feed only when it has something to show (MOM-115, trial subset): the signed-out card, tasks, or the
  // finished list. The empty and failed states are not shown; the components themselves are tested above.
  const hidden = ['load_failed', 'no_goals', 'no_tasks'] as const;
  const headings: Record<'signed_out' | 'all_done', string> = {
    signed_out: 'Sign in to see your plan',
    all_done: 'All done',
  };
  const renderFeed = (feedState: FeedState, feed: FocusFeed = feeds[feedState]) =>
    render(<MainFeed feedState={feedState} feed={feed} velocity={null} moveChains={{}} />);

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

  it.each(hidden)('%s shows nothing at all: no heading above an empty space, no offer of the old wizard', (state) => {
    const { container } = renderFeed(state);
    expect(container.textContent).toBe('');
    expect(screen.queryByRole('main')).toBeNull();
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    noActionCalled();
  });

  it('tasks shows the focus card and its lists, and no empty state', () => {
    renderFeed('tasks');
    expect(screen.getByRole('heading', { name: 'Do this now' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Up next' })).toBeTruthy();
    for (const text of ['No goals yet', 'No tasks yet', "We couldn't load your plan"]) {
      expect(screen.queryByRole('heading', { name: text })).toBeNull();
    }
  });

  it('signed_out links to /login and shows nothing of a plan', () => {
    renderFeed('signed_out');
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('a hidden state stays hidden even when the feed it is handed has work in it', () => {
    for (const state of hidden) {
      const { container } = renderFeed(state, feeds.tasks);
      expect(container.textContent, state).toBe('');
      cleanup();
    }
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
    for (const text of ['No goals yet', 'No tasks yet', "We couldn't load your plan"]) {
      expect(screen.queryByRole('heading', { name: text })).toBeNull();
    }
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('the old empty states in the app shell', () => {
  const renderShell = (views = EMPTY_CHANNEL_VIEWS) =>
    render(<AppShell views={views} connectedApps={[]} moveChains={{}} />);
  const oldControls = [
    'New Goal Wizard',
    '+ New Goal Wizard',
    'Adjust Weekly Pace',
    'Set up your first goal',
    'Start another goal',
  ];

  it('signed out: shows the sign-in call to action in the feed, with no channels and no plan', () => {
    renderShell(SIGNED_OUT_CHANNEL_VIEWS);
    const main = within(screen.getByRole('main'));
    expect(main.getByRole('heading', { name: 'Sign in to see your plan' })).toBeTruthy();
    expect(main.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login');
    expect(screen.queryByRole('region', { name: 'Velocity' })).toBeNull();
    noActionCalled();
  });

  it.each([
    ['could not load', LOAD_FAILED_CHANNEL_VIEWS],
    ['a successful read with no goals', buildChannelViews([], [], [], TODAY)],
    ['a goal with no tasks', buildChannelViews([goal('new', 'Brand New')], [], [], TODAY)],
  ])('%s: none of the old empty states and none of the old wizard\'s buttons', (_name, views) => {
    renderShell(views);
    for (const text of ["We couldn't load your plan", 'No goals yet', 'No tasks yet']) {
      expect(screen.queryByRole('heading', { name: text }), text).toBeNull();
    }
    for (const name of oldControls) expect(screen.queryByRole('button', { name }), name).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    // The page still has its one heading, out of sight, and no old heading above an empty space.
    expect(screen.getByRole('heading', { level: 1, name: 'Momentum home' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Make today count.' })).toBeNull();
    noActionCalled();
  });

  it('a finished channel shows the completion state, with its undo', () => {
    const tasks = [finished('career', 5, { title: 'Career shipped demo' }), finished('career', 5, { title: 'Career wrote notes' })];
    renderShell(buildChannelViews([goal('career', 'Career Pivot')], tasks, [], TODAY));
    const main = within(screen.getByRole('main'));
    expect(main.getByRole('heading', { name: 'All done' })).toBeTruthy();
    expect(main.getByRole('button', { name: 'Reopen Career shipped demo' })).toBeTruthy();
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
