// @vitest-environment jsdom
//
// The focus card area in a DOM (MOM-36): the Up next list, the one-click reopen in Recently done, and the
// error states when a toggle fails. These render the real components and click the real buttons; only the
// server action behind them is replaced. The action itself (auth, scoping, validation) is covered in
// tests/tasks-service.test.ts and tests/focus-feed.test.ts, and the database rules in supabase/verify/.
//
// Completion is human-only (docs/NINETY_DAY_PLAN_CONTEXT.md §3, §5 rule 6): every test that checks a call
// also checks nothing was called before the click.

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MainFeed } from '@/components/layout/MainFeed';
import { FocusTaskCard } from '@/components/tasks/FocusTaskCard';
import { RecentlyDoneList } from '@/components/tasks/RecentlyDoneList';
import { UpNextList } from '@/components/tasks/UpNextList';
import { TOGGLE_NETWORK_ERROR } from '@/components/tasks/useTaskToggle';
import type { FeedState } from '@/types/channelViews';
import type { MicroTask } from '@/types/database.types';
import type { FocusFeed } from '@/types/focusFeed';

const actions = vi.hoisted(() => ({ toggle: vi.fn() }));
vi.mock('@/app/actions/tasks', () => ({ toggleTaskStatus: actions.toggle }));

let n = 0;
function task(over: Partial<MicroTask> = {}): MicroTask {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    user_id: 'u',
    goal_channel_id: 'g',
    title: `Task ${n}`,
    task_type: 'build',
    minutes: 30,
    status: 'todo',
    fit: null,
    week_of: 2,
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
const finished = (over: Partial<MicroTask> = {}) => task({ status: 'done', completed_at: '2026-10-22T09:00:00Z', ...over });

// A server action whose result the test decides, so "while it is saving" can be looked at.
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => actions.toggle.mockReset());
afterEach(cleanup);

describe('Up next', () => {
  it('lists the queued tasks in the order given, with their type, minutes and week', () => {
    const a = task({ title: 'Study cloud security', task_type: 'certify', minutes: 45, week_of: 2 });
    const b = task({ title: 'Record the demo', task_type: 'build', minutes: 30, week_of: 3 });
    const c = task({ title: 'Write the case study', task_type: 'position', minutes: 60, week_of: 4 });
    render(<UpNextList tasks={[a, b, c]} />);

    const list = screen.getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items.map((li) => within(li).getByText(/Study|Record|Write/).textContent)).toEqual([
      'Study cloud security',
      'Record the demo',
      'Write the case study',
    ]);
    expect(items[0].textContent).toContain('Certify');
    expect(items[0].textContent).toContain('45 min');
    expect(items[0].textContent).toContain('Week 2');
    expect(items[2].textContent).toContain('Week 4');
    expect(screen.getByRole('heading', { name: 'Up next' })).toBeTruthy();
  });

  it('says so when nothing is queued', () => {
    render(<UpNextList tasks={[]} />);
    expect(screen.getByText('Nothing is queued after this one.')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('shows where a queued task came from when it was moved', () => {
    render(<UpNextList tasks={[task({ carried_from_week: 2, week_of: 3 }), task({ pulled_from_week: 6, week_of: 4 })]} />);
    expect(screen.getByText('Carried over from week 2')).toBeTruthy();
    expect(screen.getByText('Pulled forward from week 6')).toBeTruthy();
  });

  it('has no controls: a queued task cannot be ticked from the list', () => {
    render(<UpNextList tasks={[task(), task()]} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(actions.toggle).not.toHaveBeenCalled();
  });
});

describe('Recently done: one-click reopen', () => {
  it('shows nothing when no task was finished', () => {
    const { container } = render(<RecentlyDoneList tasks={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('lists the finished tasks with a Reopen button each, and calls nothing until one is clicked', () => {
    const a = finished({ title: 'Ship the demo' });
    const b = finished({ title: 'Read the paper' });
    render(<RecentlyDoneList tasks={[a, b]} />);

    expect(screen.getByRole('heading', { name: 'Recently done' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reopen Ship the demo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reopen Read the paper' })).toBeTruthy();
    expect(actions.toggle).not.toHaveBeenCalled();
  });

  it('one click reopens that task: the action is called once, with its id and todo', async () => {
    const a = finished({ title: 'Ship the demo' });
    const b = finished({ title: 'Read the paper' });
    actions.toggle.mockResolvedValue({ ok: true, data: { ...b, status: 'todo' } });
    render(<RecentlyDoneList tasks={[a, b]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reopen Read the paper' }));

    await waitFor(() => expect(actions.toggle).toHaveBeenCalledTimes(1));
    expect(actions.toggle).toHaveBeenCalledWith(b.id, 'todo');
    // The other task was not touched.
    expect(actions.toggle).not.toHaveBeenCalledWith(a.id, expect.anything());
  });

  it('shows Reopening… and blocks a second click while it saves', async () => {
    const t = finished({ title: 'Ship the demo' });
    const call = deferred<{ ok: true; data: MicroTask }>();
    actions.toggle.mockReturnValue(call.promise);
    render(<RecentlyDoneList tasks={[t]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reopen Ship the demo' }));
    const busy = await screen.findByRole('button', { name: 'Reopen Ship the demo' });
    await waitFor(() => expect(busy.textContent).toBe('Reopening…'));
    expect((busy as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(busy);
    expect(actions.toggle).toHaveBeenCalledTimes(1);

    await act(async () => call.resolve({ ok: true, data: { ...t, status: 'todo' } }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reopen Ship the demo' }).textContent).toBe('Reopen'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the error when the service refuses, keeps the task listed, and lets the user try again', async () => {
    const t = finished({ title: 'Ship the demo' });
    actions.toggle.mockResolvedValueOnce({ ok: false, error: 'Task not found.' });
    render(<RecentlyDoneList tasks={[t]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reopen Ship the demo' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Task not found.');
    const button = screen.getByRole('button', { name: 'Reopen Ship the demo' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(screen.getByText('Ship the demo')).toBeTruthy();

    // A retry clears the old message, then succeeds.
    actions.toggle.mockResolvedValueOnce({ ok: true, data: { ...t, status: 'todo' } });
    fireEvent.click(button);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(actions.toggle).toHaveBeenCalledTimes(2);
  });

  it('shows a plain error when the request itself fails, instead of failing silently', async () => {
    const t = finished({ title: 'Ship the demo' });
    actions.toggle.mockRejectedValueOnce(new Error('NetworkError: fetch failed'));
    render(<RecentlyDoneList tasks={[t]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reopen Ship the demo' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(TOGGLE_NETWORK_ERROR);
    // The raw error text is never shown.
    expect(alert.textContent).not.toContain('NetworkError');
    expect((screen.getByRole('button', { name: 'Reopen Ship the demo' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('a failure on one row does not show on another', async () => {
    const a = finished({ title: 'Ship the demo' });
    const b = finished({ title: 'Read the paper' });
    actions.toggle.mockResolvedValueOnce({ ok: false, error: 'Task not found.' });
    render(<RecentlyDoneList tasks={[a, b]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reopen Ship the demo' }));
    await screen.findByRole('alert');

    expect(screen.getAllByRole('alert')).toHaveLength(1);
    const rowB = screen.getByText('Read the paper').closest('li') as HTMLElement;
    expect(within(rowB).queryByRole('alert')).toBeNull();
  });
});

describe('the focus card: mark done and its error states', () => {
  it('calls nothing until the user clicks, then asks for done with that task id', async () => {
    const t = task({ title: 'Build the core flow' });
    actions.toggle.mockResolvedValue({ ok: true, data: { ...t, status: 'done' } });
    render(<FocusTaskCard task={t} moves={[]} />);
    expect(actions.toggle).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox'));

    await waitFor(() => expect(actions.toggle).toHaveBeenCalledTimes(1));
    expect(actions.toggle).toHaveBeenCalledWith(t.id, 'done');
  });

  it('shows the error when the service refuses', async () => {
    const t = task();
    actions.toggle.mockResolvedValueOnce({ ok: false, error: 'Sign in to update tasks.' });
    render(<FocusTaskCard task={t} moves={[]} />);

    fireEvent.click(screen.getByRole('checkbox'));

    expect((await screen.findByRole('alert')).textContent).toBe('Sign in to update tasks.');
    expect((screen.getByRole('checkbox') as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows a plain error when the request itself fails', async () => {
    actions.toggle.mockRejectedValueOnce(new Error('boom'));
    render(<FocusTaskCard task={task()} moves={[]} />);

    fireEvent.click(screen.getByRole('checkbox'));

    expect((await screen.findByRole('alert')).textContent).toBe(TOGGLE_NETWORK_ERROR);
  });

  it('shows Saving… while the task is being marked done', async () => {
    const t = task();
    const call = deferred<{ ok: true; data: MicroTask }>();
    actions.toggle.mockReturnValue(call.promise);
    render(<FocusTaskCard task={t} moves={[]} />);

    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(screen.getByRole('checkbox').textContent).toBe('Saving…'));

    await act(async () => call.resolve({ ok: true, data: { ...t, status: 'done' } }));
    await waitFor(() => expect(screen.getByRole('checkbox').textContent).not.toBe('Saving…'));
  });
});

describe('the whole feed', () => {
  const feed = (over: Partial<FocusFeed> = {}): FocusFeed => ({
    focus: task({ title: 'Do this now' }),
    upNext: [task({ title: 'Then this' }), task({ title: 'After that' })],
    recentlyDone: [finished({ title: 'Already finished' })],
    ...over,
  });
  // The state is passed in, as buildChannelViews would decide it; MainFeed never works it out from the feed.
  const renderFeed = (f: FocusFeed, feedState: FeedState = 'tasks') =>
    render(<MainFeed feedState={feedState} feed={f} velocity={null} moveChains={{}} onNewGoal={() => {}} />);

  it('shows the focus task, then Up next, then Recently done, and calls nothing on load', () => {
    renderFeed(feed());
    const text = document.body.textContent ?? '';
    expect(text.indexOf('Do this now')).toBeGreaterThan(-1);
    expect(text.indexOf('Do this now')).toBeLessThan(text.indexOf('Then this'));
    expect(text.indexOf('Then this')).toBeLessThan(text.indexOf('After that'));
    expect(text.indexOf('After that')).toBeLessThan(text.indexOf('Already finished'));
    expect(screen.getByRole('button', { name: 'Reopen Already finished' })).toBeTruthy();
    expect(actions.toggle).not.toHaveBeenCalled();
  });

  it('omits Recently done when nothing was finished', () => {
    renderFeed(feed({ recentlyDone: [] }));
    expect(screen.queryByRole('heading', { name: 'Recently done' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Up next' })).toBeTruthy();
  });

  it('when everything is done the undo is still there, so the last task can be reopened', async () => {
    const last = finished({ title: 'The very last task' });
    actions.toggle.mockResolvedValue({ ok: true, data: { ...last, status: 'todo' } });
    renderFeed({ focus: null, upNext: [], recentlyDone: [last] }, 'all_done');

    expect(screen.getByText(/Everything on your list is done/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'No tasks yet' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Reopen The very last task' }));
    await waitFor(() => expect(actions.toggle).toHaveBeenCalledWith(last.id, 'todo'));
  });

  it('with no tasks at all it shows the no-tasks state, whose only control is the new-goal button', () => {
    renderFeed({ focus: null, upNext: [], recentlyDone: [] }, 'no_tasks');
    expect(screen.getByRole('heading', { name: 'No tasks yet' })).toBeTruthy();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Start another goal']);
  });
});
