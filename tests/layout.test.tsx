// @vitest-environment jsdom
//
// The wireframe layout and navigation (MOM-77) in a DOM: the sticky header, the workspace navigation and the home page's
// sections. These render the real AppShell with views built by the real buildChannelViews; only the server actions behind the
// buttons are replaced. CSS is not loaded in jsdom, so which parts show at which width is not tested here (it is checked in a
// browser at 390px and 1280px). The goal cards, sidebar channel list, rebalance nudge, drawer and wizard are not on home any more
// (MOM-115, trial subset); tests/old-controls-hidden.test.tsx checks that they are gone.

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/components/layout/AppShell';
import { buildChannelViews } from '@/lib/utils/channelViews';
import { initialsFrom } from '@/lib/utils/initials';
import { summarizeActiveGoalProgress } from '@/lib/utils/progress';
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

// The same stand-in for Next's useSearchParams as tests/channel-selection.test.tsx: it reads the live URL and
// re-renders when it changes.
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

// Career Pivot (plan week 5): 2 of 3 done, and one open task left over in week 2, so it has a proposal.
// Side Project (week 1): 1 of 4 done, on track.
const goals = [
  { id: 'career', title: 'Career Pivot', status: 'active' as const, start_date: '2026-09-23' },
  { id: 'side', title: 'Side Project', status: 'active' as const, start_date: '2026-10-23' },
];
const tasks = [
  finished('career', 5, { title: 'Career shipped demo' }),
  finished('career', 5, { title: 'Career wrote notes' }),
  task('career', 5, { title: 'Career open task' }),
  task('career', 2, { title: 'Career behind task' }),
  finished('side', 1, { title: 'Side kickoff done' }),
  task('side', 1, { title: 'Side focus task' }),
  task('side', 1, { title: 'Side second task' }),
  task('side', 1, { title: 'Side third task' }),
];

function renderShell(over: { goals?: typeof goals; tasks?: MicroTask[]; email?: string | null } = {}) {
  const g = over.goals ?? goals;
  const t = over.tasks ?? tasks;
  const views = buildChannelViews(g, t, [], TODAY);
  const ui = (email: string | null) => (
    <AppShell views={views} connectedApps={[]} moveChains={{}} userEmail={email} />
  );
  const email = over.email === undefined ? 'matt.walsh@example.com' : over.email;
  const result = render(ui(email));
  return { ...result, rerenderWith: (e: string | null) => result.rerender(ui(e)) };
}

const sidebar = () => within(screen.getByRole('complementary', { name: 'Workspace' }));

beforeEach(() => {
  Object.values(actions).forEach((fn) => fn.mockReset());
  window.history.replaceState(null, '', '/');
});
afterEach(cleanup);

describe('the header and navigation', () => {
  it('has no tab bar and no per-panel buttons', () => {
    renderShell();
    expect(screen.queryByRole('navigation', { name: 'Workspace sections' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Channels' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Stack & AI' })).toBeNull();
  });

  it('the header links home, to Connected Apps and to Settings, with the user\'s initials on the avatar', () => {
    renderShell();
    const header = within(screen.getByRole('banner'));
    expect(header.getByRole('link', { name: 'Momentum home' }).getAttribute('href')).toBe('/');
    expect(header.getByRole('link', { name: 'Connected apps' }).getAttribute('href')).toBe('/connections');
    const avatar = header.getByRole('link', { name: 'Settings and account' });
    expect(avatar.getAttribute('href')).toBe('/settings');
    expect(avatar.textContent).toBe('MW');
  });

  it('shows no initials of anyone else when there is no session', () => {
    renderShell({ email: null });
    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'Settings and account' }).textContent).toBe('?');
  });

  it('the workspace navigation has its three destinations and marks the dashboard as current', () => {
    renderShell();
    const nav = within(sidebar().getByRole('navigation', { name: 'Workspace' }));
    const hrefs = Object.fromEntries(nav.getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')]));
    expect(hrefs).toEqual({
      'Daily Dashboard': '/',
      'Connected Apps': '/connections',
      Settings: '/settings',
    });
    expect(nav.getByRole('link', { name: 'Daily Dashboard' }).getAttribute('aria-current')).toBe('page');
    expect(nav.getByRole('link', { name: 'Connected Apps' }).getAttribute('aria-current')).toBeNull();
  });

});

describe('initialsFrom', () => {
  it.each([
    ['matt.walsh@example.com', 'MW'],
    ['ada_lovelace+x@example.com', 'AL'],
    ['matt@example.com', 'MA'],
    ['m@example.com', 'M'],
    ['', '?'],
    [null, '?'],
    ['@example.com', '?'],
  ])('%j gives %j', (email, expected) => {
    expect(initialsFrom(email)).toBe(expected);
  });
});

describe('summarizeActiveGoalProgress', () => {
  it('counts only the active goals, in the order given, and ignores tasks of goals it was not given', () => {
    const list = [goals[0], { id: 'paused', title: 'Paused', status: 'paused' as const, start_date: '2026-10-01' }, goals[1]];
    const all = [...tasks, task('paused', 1), finished('paused', 1), task('someone-elses-goal', 1)];
    const p = summarizeActiveGoalProgress(list, all, TODAY);
    expect(p.map((x) => [x.goalId, x.done, x.total])).toEqual([
      ['career', 2, 4],
      ['side', 1, 4],
    ]);
  });

  it('counts a carried-over task once, however many times it moved', () => {
    const carried = task('career', 4, { title: 'Carried twice', carried_from_week: 3 });
    const p = summarizeActiveGoalProgress([goals[0]], [carried, finished('career', 5)], TODAY);
    expect(p[0]).toMatchObject({ done: 1, total: 2, remaining: 1 });
  });

  it('a goal with no tasks is listed as 0 of 0, not left out', () => {
    expect(summarizeActiveGoalProgress([goals[0]], [], TODAY)[0]).toMatchObject({ done: 0, total: 0, percent: 0 });
  });
});

// The one line about the weekly review (MOM-113 block 3.2), above the scoreboard and below the header.
describe('the weekly review notice on home', () => {
  const shellWith = (reviewPrompt?: { state: 'none' | 'due' | 'reviewed' }) => {
    const views = buildChannelViews(goals, tasks, [], TODAY);
    return render(
      <AppShell views={views} connectedApps={[]} moveChains={{}} home={{ state: 'no_goals' }} reviewPrompt={reviewPrompt} />,
    );
  };

  it('shows a way into the review on the planning day, and a way back to the finished one afterwards', () => {
    shellWith({ state: 'due' });
    expect(screen.getByRole('link', { name: 'See your weekly review' }).getAttribute('href')).toBe('/review');
    cleanup();
    shellWith({ state: 'reviewed' });
    expect(screen.getByText("This week's review is done.")).toBeTruthy();
  });

  it('shows nothing on any other day, and nothing when home does not pass one', () => {
    shellWith({ state: 'none' });
    expect(screen.queryByRole('region', { name: 'Weekly review' })).toBeNull();
    cleanup();
    shellWith(undefined);
    expect(screen.queryByRole('region', { name: 'Weekly review' })).toBeNull();
  });
});
