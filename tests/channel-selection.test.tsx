// @vitest-environment jsdom
//
// Which old-model channel the feed shows (MOM-44, MOM-88, MOM-115 trial subset). Home no longer has a sidebar channel list, goal
// cards, a weekly-pace button, a rebalance drawer or a nudge: nothing on the page picks a channel. The address (?channel=<goal id>)
// still chooses the feed's channel, so an old shared link keeps working, and a bad value falls back to All channels. These render the
// real AppShell, feed and hero with views built by the real buildChannelViews; only the server actions are replaced. The views
// themselves are covered in tests/channel-views.test.ts, and the absence of the old controls in tests/old-controls-hidden.test.tsx.
//
// Completion is human-only (docs/NINETY_DAY_PLAN_CONTEXT.md §3, §5 rule 6): nothing here ticks, reopens or moves a task by itself.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/components/layout/AppShell';
import { withChannelParam } from '@/lib/utils/channelParam';
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

// The channel is the ?channel= in the address bar (MOM-88). Next.js keeps useSearchParams in sync with the browser's own history
// API. jsdom has no Next router, so this stand-in does the same job: it reads the live URL and re-renders when it changes.
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
  const ui = (v: typeof views) => <AppShell views={v} connectedApps={[]} moveChains={{}} />;
  const result = render(ui(views));
  return { ...result, rerenderWith: (v: typeof views) => result.rerender(ui(v)) };
}

const velocity = () => screen.queryByRole('region', { name: 'Velocity' });
const bodyText = () => document.body.textContent ?? '';
// The channel the feed is for is named above the heading ("All channels" when none is chosen).
const shownChannel = () => screen.getByRole('main').querySelector('.eyebrow')?.textContent;

beforeEach(() => {
  Object.values(actions).forEach((fn) => fn.mockReset());
  window.history.replaceState(null, '', '/');
});
afterEach(cleanup);

describe('the default: all active channels', () => {
  it("the feed holds the earliest task across every channel, with the other channels' tasks queued", () => {
    renderShell();
    const main = within(screen.getByRole('main'));
    expect(shownChannel()).toBe('All channels');
    // Side's week 1 task comes before Career's week 5 task.
    expect(main.getByRole('heading', { name: 'Side focus task' })).toBeTruthy();
    expect(main.getByText('Career open task')).toBeTruthy();
  });

  it('with several goals it shows no single velocity, and no note pointing at a channel list that is not there', () => {
    renderShell();
    expect(velocity()).toBeNull();
    expect(bodyText()).not.toContain('Choose a channel');
  });

  it("with one goal the hero is that goal's velocity, as before", () => {
    renderShell(buildChannelViews([goals[0]], tasks, [], TODAY));
    expect(velocity()!.textContent).toContain('Week 5');
    expect(velocity()!.textContent).toContain('2 of 3 tasks ticked');
  });

  it('a user with no goals sees no old-model feed at all: no heading, no velocity, no "No goals yet"', () => {
    renderShell(EMPTY_CHANNEL_VIEWS);
    expect(screen.queryByRole('heading', { name: 'Make today count.' })).toBeNull();
    expect(screen.getByRole('main').textContent).toBe('Momentum home');
    expect(screen.queryByRole('heading', { name: 'No goals yet' })).toBeNull();
    expect(velocity()).toBeNull();
  });
});

describe('the channel in the address', () => {
  const careerId = 'career';
  const sideId = 'side';
  const views = () => buildChannelViews(goals, tasks, [], TODAY);
  const renderAt = (search: string, v = views()) => {
    window.history.replaceState(null, '', `/${search}`);
    return renderShell(v);
  };

  it('lands on that channel straight away, as a reload or a shared link would, and shows only its tasks', () => {
    renderAt(`?channel=${careerId}`);
    expect(shownChannel()).toBe('Career Pivot');
    expect(screen.getByRole('heading', { name: 'Career open task' })).toBeTruthy();
    expect(bodyText()).not.toContain('Side focus task');
    expect(bodyText()).not.toContain('Side kickoff done');
    expect(velocity()!.textContent).toContain('Week 5');
    expect(velocity()!.textContent).toContain('2 of 3 tasks ticked');
  });

  it('lands on the other channel just as well, with its own score from its own start date', () => {
    renderAt(`?channel=${sideId}`);
    expect(shownChannel()).toBe('Side Project');
    expect(screen.getByRole('heading', { name: 'Side focus task' })).toBeTruthy();
    expect(bodyText()).not.toContain('Career open task');
    expect(velocity()!.textContent).toContain('Week 1');
    expect(velocity()!.textContent).toContain('1 of 4 tasks ticked');
  });

  it('is decided while rendering, so the server HTML and the first browser render agree (no flash, no hydration warning)', () => {
    window.history.replaceState(null, '', `/?channel=${careerId}`);
    const ui = <AppShell views={views()} connectedApps={[]} moveChains={{}} />;

    const html = renderToString(ui);
    expect(html).toContain('Career open task');
    expect(html).not.toContain('Side focus task');

    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const container = document.body.appendChild(document.createElement('div'));
    container.innerHTML = html;
    render(ui, { container, hydrate: true });
    expect(errors.mock.calls.map((c) => String(c[0]))).toEqual([]);
    errors.mockRestore();
    expect(shownChannel()).toBe('Career Pivot');
  });

  it('does not call a server action just by opening on a channel', () => {
    renderAt(`?channel=${careerId}`);
    for (const fn of Object.values(actions)) expect(fn).not.toHaveBeenCalled();
  });

  it("a click on a task in that channel still goes through the user's own toggle", async () => {
    actions.toggleTaskStatus.mockResolvedValue({ ok: true, data: {} });
    renderAt(`?channel=${careerId}`);
    expect(actions.toggleTaskStatus).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox'));
    await vi.waitFor(() => expect(actions.toggleTaskStatus).toHaveBeenCalledTimes(1));
    const [id, status] = actions.toggleTaskStatus.mock.calls[0];
    expect(status).toBe('done');
    expect(id).toBe(tasks.find((t) => t.title === 'Career open task')!.id);
  });

  describe("a value that is not one of the user's channels falls back to All channels", () => {
    it.each([
      ['an id that does not exist', '?channel=00000000-0000-4000-8000-00000000dead'],
      ['an id with the wrong case', '?channel=CAREER'],
      ['an empty value', '?channel='],
      ['a name, not an id', '?channel=Career%20Pivot'],
      ['an object property name', '?channel=toString'],
      ['the prototype key', '?channel=__proto__'],
      ['a constructor name', '?channel=constructor'],
      ['markup', '?channel=%3Cscript%3Ealert(1)%3C%2Fscript%3E'],
      ['a very long value', `?channel=${'x'.repeat(5000)}`],
    ])('%s', (_name, search) => {
      renderAt(search);
      expect(shownChannel()).toBe('All channels');
      expect(screen.getByRole('heading', { name: 'Side focus task' })).toBeTruthy();
    });

    it('a repeated parameter uses the first value, and an invalid first value means All channels', () => {
      renderAt(`?channel=${careerId}&channel=${sideId}`);
      expect(shownChannel()).toBe('Career Pivot');
      cleanup();
      renderAt(`?channel=nope&channel=${careerId}`);
      expect(shownChannel()).toBe('All channels');
    });

    it("another user's goal id is not a channel here, and none of their data is shown", () => {
      // The page only builds views from the signed-in user's own goals, so a foreign id is simply not in them.
      const foreign = '99999999-9999-4999-8999-999999999999';
      renderAt(`?channel=${foreign}`);
      expect(shownChannel()).toBe('All channels');
      expect(bodyText()).not.toContain(foreign);
    });

    it('a goal that has been paused is not a channel, and the page does not show its tasks', () => {
      const paused = [goals[0], { ...goals[1], status: 'paused' as const }];
      renderAt(`?channel=${sideId}`, buildChannelViews(paused, tasks, [], TODAY));
      expect(shownChannel()).toBe('All channels');
      expect(bodyText()).not.toContain('Side focus task');
    });

    it('the address comes back to its channel by itself if the goal becomes active again', () => {
      const paused = [goals[0], { ...goals[1], status: 'paused' as const }];
      const view = renderAt(`?channel=${sideId}`, buildChannelViews(paused, tasks, [], TODAY));
      expect(shownChannel()).toBe('All channels');
      view.rerenderWith(views());
      expect(shownChannel()).toBe('Side Project');
    });
  });

  it('keeps the channel from the address when new data arrives (a tick refreshes the page)', () => {
    const view = renderAt(`?channel=${careerId}`);
    const ticked = tasks.map((t) => (t.title === 'Career open task' ? { ...t, status: 'done' as const, completed_at: '2026-10-23T08:00:00Z' } : t));
    view.rerenderWith(buildChannelViews(goals, ticked, [], TODAY));
    expect(shownChannel()).toBe('Career Pivot');
    expect(velocity()!.textContent).toContain('3 of 3 tasks ticked');
  });
});

describe('withChannelParam builds the new address', () => {
  it.each([
    ['', 'career', '?channel=career'],
    ['?channel=side', 'career', '?channel=career'],
    ['?channel=side', 'all', ''],
    ['', 'all', ''],
    ['?a=1', 'career', '?a=1&channel=career'],
    ['?a=1&channel=side&b=2', 'career', '?a=1&channel=career&b=2'],
    ['?a=1&channel=side', 'all', '?a=1'],
    ['?channel=a&channel=b', 'career', '?channel=career'],
    ['?channel=a&channel=b', 'all', ''],
    ['channel=side', 'career', '?channel=career'],
    ['?q=a%20b', 'career', '?q=a+b&channel=career'],
  ])('%j with %s gives %j', (search, id, expected) => {
    expect(withChannelParam(search, id)).toBe(expected);
  });

  it('encodes an id instead of trusting it', () => {
    expect(withChannelParam('', 'a&b=c')).toBe('?channel=a%26b%3Dc');
  });
});
