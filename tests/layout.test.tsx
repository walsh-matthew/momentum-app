// @vitest-environment jsdom
//
// The wireframe layout and navigation (MOM-77) in a DOM: the sticky header and goal cards that replace the mobile
// tab bar, the workspace navigation, goal progress, and the rebalance nudge. These render the real AppShell with
// views built by the real buildChannelViews and progress from the real summarizeActiveGoalProgress; only the
// server actions behind the buttons are replaced. CSS is not loaded in jsdom, so which parts show at which width
// is not tested here (it was checked in a browser at 390px and 1280px).
//
// Nothing here may complete, cut or move a task: every test that touches the nudge also checks that no action
// ran before the user's own click in the drawer (docs/NINETY_DAY_PLAN_CONTEXT.md §3, §5 rule 1 and 6).

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
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

function renderShell(over: { goals?: typeof goals; tasks?: MicroTask[]; email?: string | null; progress?: boolean } = {}) {
  const g = over.goals ?? goals;
  const t = over.tasks ?? tasks;
  const views = buildChannelViews(g, t, [], TODAY);
  const progress = over.progress === false ? undefined : summarizeActiveGoalProgress(g, t, TODAY);
  const ui = (email: string | null) => (
    <AppShell views={views} connectedApps={[]} moveChains={{}} progress={progress} userEmail={email} />
  );
  const email = over.email === undefined ? 'matt.walsh@example.com' : over.email;
  const result = render(ui(email));
  return { ...result, rerenderWith: (e: string | null) => result.rerender(ui(e)) };
}

const sidebar = () => within(screen.getByRole('complementary', { name: 'Goal channels' }));
const cards = () => within(screen.getByRole('region', { name: 'Your goals' }));
const nudge = () => screen.queryByRole('region', { name: /rebalance\?|One goal at a time/ });
const current = () => sidebar().getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'page');

beforeEach(() => {
  Object.values(actions).forEach((fn) => fn.mockReset());
  window.history.replaceState(null, '', '/');
  window.sessionStorage.clear();
  // jsdom has no <dialog>.showModal; this stand-in only opens and closes it (as in channel-selection.test.tsx).
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

  it('the workspace navigation has the four destinations and marks the dashboard as current', () => {
    renderShell();
    const nav = within(sidebar().getByRole('navigation', { name: 'Workspace' }));
    const hrefs = Object.fromEntries(nav.getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')]));
    expect(hrefs).toEqual({
      'Daily Dashboard': '/',
      'Goal Channels': '/#active-goals',
      'Connected Apps': '/connections',
      Settings: '/settings',
    });
    expect(nav.getByRole('link', { name: 'Daily Dashboard' }).getAttribute('aria-current')).toBe('page');
    expect(nav.getByRole('link', { name: 'Connected Apps' }).getAttribute('aria-current')).toBeNull();
  });

  it('the banner offers the two actions, and each opens what it opens elsewhere', () => {
    renderShell();
    const group = within(screen.getByRole('group', { name: 'Quick goal actions' }));
    expect(group.queryByRole('button', { name: /Milestones/ })).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'New goal wizard' })).toBeNull();
    fireEvent.click(group.getByRole('button', { name: 'New Goal Wizard' }));
    expect(screen.getByRole('dialog', { name: 'New goal wizard' })).toBeTruthy();
    expect(document.querySelectorAll('dialog[aria-label="New goal wizard"]')).toHaveLength(1);
    noActionCalled();
  });

  it('the banner\'s Adjust Weekly Pace opens the rebalance drawer, and changes nothing', () => {
    renderShell();
    fireEvent.click(within(screen.getByRole('group', { name: 'Quick goal actions' })).getByRole('button', { name: 'Adjust Weekly Pace' }));
    expect(screen.getByRole('dialog', { name: 'Rebalance your plan' })).toBeTruthy();
    noActionCalled();
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

describe('goal progress in the sidebar and the goal cards', () => {
  it('the sidebar shows each goal\'s done and total, while the button keeps the goal\'s name', () => {
    renderShell();
    expect(sidebar().getByRole('button', { name: 'Career Pivot' }).textContent).toBe('Career Pivot');
    expect(sidebar().getByText('2 of 4 tasks done')).toBeTruthy();
    expect(sidebar().getByText('1 of 4 tasks done')).toBeTruthy();
    const bar = sidebar().getByRole('progressbar', { name: 'Career Pivot progress' });
    expect(bar.getAttribute('aria-valuenow')).toBe('50'); // 2 of 4
    expect(sidebar().getByRole('progressbar', { name: 'Side Project progress' }).getAttribute('aria-valuenow')).toBe('25');
  });

  it('the goal cards show the same numbers, and All channels is the total', () => {
    renderShell();
    expect(cards().getByText('2 of 4 tasks done')).toBeTruthy();
    expect(cards().getByText('1 of 4 tasks done')).toBeTruthy();
    expect(cards().getByText('3 of 8 tasks done')).toBeTruthy();
  });

  it('without progress the cards and the sidebar show no counts, instead of made-up ones', () => {
    renderShell({ progress: false });
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(document.body.textContent).not.toMatch(/tasks done/);
  });

  it('each goal card is a real link to ?channel=<goal id>, and All channels is a link to /', () => {
    renderShell();
    expect(cards().getByRole('link', { name: /Career Pivot/ }).getAttribute('href')).toBe('/?channel=career');
    expect(cards().getByRole('link', { name: /Side Project/ }).getAttribute('href')).toBe('/?channel=side');
    expect(cards().getByRole('link', { name: /All channels/ }).getAttribute('href')).toBe('/');
  });

  it('a plain click on a card picks the channel without leaving the page: feed, velocity and sidebar follow', () => {
    renderShell();
    fireEvent.click(cards().getByRole('link', { name: /Side Project/ }));
    expect(window.location.search).toBe('?channel=side');
    expect(current().map((b) => b.textContent)).toEqual(['Side Project']);
    expect(screen.getByRole('heading', { name: 'Side focus task' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Career open task' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Velocity' }).textContent).toContain('Week 1');
    expect(cards().getByRole('link', { name: /Side Project/ }).getAttribute('aria-current')).toBe('page');
    noActionCalled();
  });

  it('a modified click (new tab) is left to the browser and does not change this page', () => {
    renderShell();
    fireEvent.click(cards().getByRole('link', { name: /Side Project/ }), { ctrlKey: true });
    expect(window.location.search).toBe('');
    expect(current().map((b) => b.textContent)).toEqual(['All channels']);
  });

  it('the cards keep the address\'s other parameters', () => {
    window.history.replaceState(null, '', '/?utm_source=mail');
    renderShell();
    expect(cards().getByRole('link', { name: /Career Pivot/ }).getAttribute('href')).toBe('/?utm_source=mail&channel=career');
    expect(cards().getByRole('link', { name: /All channels/ }).getAttribute('href')).toBe('/?utm_source=mail');
  });

  it('there are no cards for a user with no goals', () => {
    renderShell({ goals: [], tasks: [] });
    expect(screen.queryByRole('region', { name: 'Your goals' })).toBeNull();
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

describe('the rebalance nudge', () => {
  it('with several goals and All channels it says to choose a channel, with no Review button', () => {
    renderShell();
    const box = within(screen.getByRole('region', { name: 'One goal at a time' }));
    expect(box.getByText(/Choose a goal to see what could move/)).toBeTruthy();
    expect(box.queryByRole('button', { name: 'Review' })).toBeNull();
    expect(box.getByRole('button', { name: 'Dismiss suggestion' })).toBeTruthy();
  });

  it('on a channel with something behind it shows that channel\'s own summary and a Review action', () => {
    renderShell();
    fireEvent.click(sidebar().getByRole('button', { name: 'Career Pivot' }));
    const box = within(screen.getByRole('region', { name: 'A little room to rebalance?' }));
    const summary = buildChannelViews(goals, tasks, [], TODAY).byChannel.career.rebalance!.proposal.summary;
    expect(box.getByText(summary)).toBeTruthy();
    expect(box.getByRole('button', { name: 'Review' })).toBeTruthy();
    noActionCalled();
  });

  it('on a channel that is on track there is no nudge', () => {
    renderShell();
    fireEvent.click(sidebar().getByRole('button', { name: 'Side Project' }));
    expect(nudge()).toBeNull();
  });

  it('Review opens the existing drawer and applies nothing; there is no accept button on the nudge', () => {
    renderShell();
    fireEvent.click(sidebar().getByRole('button', { name: 'Career Pivot' }));
    const box = within(screen.getByRole('region', { name: 'A little room to rebalance?' }));
    expect(box.queryByRole('button', { name: /Accept|Apply/ })).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Rebalance your plan' })).toBeNull();

    fireEvent.click(box.getByRole('button', { name: 'Review' }));

    const drawer = within(screen.getByRole('dialog', { name: 'Rebalance your plan' }));
    expect(drawer.getByText('Career behind task')).toBeTruthy();
    noActionCalled();

    // Applying is still the drawer's own button, on the user's click.
    actions.applyRebalanceProposal.mockResolvedValue({ ok: true, data: { moved: [], skipped: [] } });
    fireEvent.click(drawer.getByRole('button', { name: /^Apply 1 shift$/ }));
    expect(actions.applyRebalanceProposal).toHaveBeenCalledTimes(1);
  });

  it('dismissing hides it for that channel, keeps it hidden after a reload, and touches no data', () => {
    const first = renderShell();
    fireEvent.click(sidebar().getByRole('button', { name: 'Career Pivot' }));
    fireEvent.click(within(screen.getByRole('region', { name: 'A little room to rebalance?' })).getByRole('button', { name: 'Dismiss suggestion' }));
    expect(nudge()).toBeNull();
    expect(JSON.parse(window.sessionStorage.getItem('momentum.nudge.dismissed') ?? '[]')).toEqual(['career']);
    noActionCalled();

    // Another channel's nudge is its own: the choose-a-channel one for All channels is still there.
    fireEvent.click(sidebar().getByRole('button', { name: 'All channels' }));
    expect(screen.getByRole('region', { name: 'One goal at a time' })).toBeTruthy();

    // A reload in the same tab starts a fresh page but the same session.
    first.unmount();
    window.history.replaceState(null, '', '/?channel=career');
    renderShell();
    expect(nudge()).toBeNull();
  });

  it('a new session (cleared storage) shows it again', () => {
    window.sessionStorage.setItem('momentum.nudge.dismissed', JSON.stringify(['career']));
    window.history.replaceState(null, '', '/?channel=career');
    renderShell();
    expect(nudge()).toBeNull();
    cleanup();
    window.sessionStorage.clear();
    renderShell();
    expect(screen.getByRole('region', { name: 'A little room to rebalance?' })).toBeTruthy();
  });

  it('survives blocked or corrupted storage by showing the nudge', () => {
    window.sessionStorage.setItem('momentum.nudge.dismissed', '{not json');
    window.history.replaceState(null, '', '/?channel=career');
    renderShell();
    expect(screen.getByRole('region', { name: 'A little room to rebalance?' })).toBeTruthy();
  });

  it('is not in the server HTML, so the first browser render matches it (the choice lives in sessionStorage)', () => {
    window.history.replaceState(null, '', '/?channel=career');
    const views = buildChannelViews(goals, tasks, [], TODAY);
    const html = renderToString(<AppShell views={views} connectedApps={[]} moveChains={{}} />);
    expect(html).not.toContain('MOMENTUM AI');
    expect(html).toContain('Make today count.');
  });
});

describe('the drawer and wizard sit outside the layout', () => {
  it('both dialogs are direct children of the page, not inside the sidebar, feed or right column', () => {
    renderShell();
    for (const label of ['New goal wizard', 'Rebalance your plan']) {
      const dialog = document.querySelector(`dialog[aria-label="${label}"], dialog[aria-labelledby]`) as HTMLElement;
      expect(dialog).toBeTruthy();
    }
    for (const dialog of Array.from(document.querySelectorAll('dialog'))) {
      expect(dialog.closest('.desktop-shell')).toBeNull();
    }
  });
});
