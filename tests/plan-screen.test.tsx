// @vitest-environment jsdom
//
// The week plan screen and the "Your plan" card (MOM-112 block 2). Every control is the person's own tap, and nothing is
// chosen for them: a fresh plan has no day pressed and no kind set, a day that has passed cannot be changed, and each tap
// calls exactly the one action it names. The plain-words check over every state is in tests/plan-plain-words.test.tsx.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as actions from '@/app/actions/plan';
import { HomeScoreboardSection } from '@/components/home/HomeScoreboardSection';
import { YourPlanCard } from '@/components/home/YourPlanCard';
import { PlanScreen } from '@/components/plan/PlanScreen';
import type { HomeScoreboard } from '@/types/home';
import { HABIT, KINDS, STEP, WEEK, readyCard, readyPlan } from './helpers/planFixtures';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/app/actions/plan', () => ({
  planItem: vi.fn(),
  unplanItem: vi.fn(),
  chooseDayKind: vi.fn(),
  clearKindOfDay: vi.fn(),
  copyKindsFromLastWeek: vi.fn(),
  planHabitSetDays: vi.fn(),
}));

const ok = { ok: true as const, data: { changed: 1 } };

beforeEach(() => {
  refresh.mockClear();
  for (const fn of Object.values(actions)) (fn as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue(ok);
});
afterEach(cleanup);

const dayButton = (title: string, label: string) => screen.getByRole('button', { name: `${title}, ${label}` });

describe('the days', () => {
  it('shows every day of the week for each thing, with none chosen until the person taps', () => {
    render(<PlanScreen plan={readyPlan()} />);
    for (const item of [HABIT, STEP]) {
      const days = within(screen.getByRole('list', { name: `Days for ${item.title}` })).getAllByRole('button');
      expect(days).toHaveLength(7);
      for (const day of days) expect(day.getAttribute('aria-pressed')).toBe('false');
    }
    // Every kind of day starts as "Not set".
    for (const select of screen.getAllByRole('combobox')) expect((select as HTMLSelectElement).value).toBe('');
  });

  it('shows the days the person chose as pressed', () => {
    const days = readyPlan().days.map((d) => (d.date === '2026-10-30' ? { ...d, itemIds: [HABIT.id] } : d));
    render(<PlanScreen plan={readyPlan({ days })} />);
    expect(dayButton('Go for a run', 'Fri, Oct 30').getAttribute('aria-pressed')).toBe('true');
    expect(dayButton('Go for a run', 'Sat, Oct 31').getAttribute('aria-pressed')).toBe('false');
    expect(dayButton('Book the room', 'Fri, Oct 30').getAttribute('aria-pressed')).toBe('false');
  });

  it('cannot change a day that has passed, but can change today and the days ahead', () => {
    render(<PlanScreen plan={readyPlan()} />);
    for (const label of ['Mon, Oct 26', 'Tue, Oct 27', 'Wed, Oct 28']) expect((dayButton('Go for a run', label) as HTMLButtonElement).disabled).toBe(true);
    for (const label of ['Thu, Oct 29', 'Fri, Oct 30', 'Sun, Nov 1']) expect((dayButton('Go for a run', label) as HTMLButtonElement).disabled).toBe(false);
    for (const select of screen.getAllByRole('combobox').slice(0, 3)) expect((select as HTMLButtonElement).disabled).toBe(true);
  });

  it('puts a thing on a day with one tap, takes it off with the next, and refreshes after each', async () => {
    const { rerender } = render(<PlanScreen plan={readyPlan()} />);
    fireEvent.click(dayButton('Book the room', 'Fri, Oct 30'));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(((await screen.findByRole('button', { name: 'Book the room, Fri, Oct 30' })) as HTMLButtonElement).disabled).toBe(false);
    expect(actions.planItem).toHaveBeenCalledWith(STEP.id, '2026-10-30');
    expect(actions.unplanItem).not.toHaveBeenCalled();

    const days = readyPlan().days.map((d) => (d.date === '2026-10-30' ? { ...d, itemIds: [STEP.id] } : d));
    rerender(<PlanScreen plan={readyPlan({ days })} />);
    fireEvent.click(dayButton('Book the room', 'Fri, Oct 30'));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    expect(actions.unplanItem).toHaveBeenCalledWith(STEP.id, '2026-10-30');
    expect(actions.planItem).toHaveBeenCalledTimes(1);
  });

  it('says why in words when a tap is refused, and does not refresh', async () => {
    vi.mocked(actions.planItem).mockResolvedValue({ ok: false, error: "That day has already passed, so it can't be changed. Nothing was changed." });
    render(<PlanScreen plan={readyPlan()} />);
    fireEvent.click(dayButton('Go for a run', 'Fri, Oct 30'));
    expect((await screen.findByRole('alert')).textContent).toContain("That day has already passed, so it can't be changed.");
    // Settled (MOM-147): the day button is back by its ready name and enabled, in the same render as the message.
    expect(((await screen.findByRole('button', { name: 'Go for a run, Fri, Oct 30' })) as HTMLButtonElement).disabled).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('what kind of day each one is', () => {
  it('gives its reason in a few words, and the person\'s own names for their kinds of days', () => {
    render(<PlanScreen plan={readyPlan()} />);
    expect(screen.getByRole('heading', { name: 'What kind of day is each one?' })).toBeTruthy();
    expect(screen.getByText('This is so the forecast knows how much time you have.')).toBeTruthy();
    const select = screen.getByRole('combobox', { name: 'Fri, Oct 30: what kind of day' });
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Not set', ...KINDS.map((k) => k.name)]);
  });

  it('sets a date\'s kind when the person chooses one, and clears it when they choose "Not set"', async () => {
    const days = readyPlan().days.map((d) => (d.date === '2026-10-31' ? { ...d, dayTypeId: 'kind-rest' } : d));
    render(<PlanScreen plan={readyPlan({ days })} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Fri, Oct 30: what kind of day' }), { target: { value: 'kind-work' } });
    await waitFor(() => expect(actions.chooseDayKind).toHaveBeenCalledWith('2026-10-30', 'kind-work'));
    expect((screen.getByRole('combobox', { name: 'Sat, Oct 31: what kind of day' }) as HTMLSelectElement).value).toBe('kind-rest');
    fireEvent.change(screen.getByRole('combobox', { name: 'Sat, Oct 31: what kind of day' }), { target: { value: '' } });
    await waitFor(() => expect(actions.clearKindOfDay).toHaveBeenCalledWith('2026-10-31'));
  });

  it('offers "Same as last week" only when it would give a kind to a date, and copies only when tapped', async () => {
    const { rerender } = render(<PlanScreen plan={readyPlan({ copyableKinds: 0 })} />);
    expect(screen.queryByRole('button', { name: 'Same as last week' })).toBeNull();

    rerender(<PlanScreen plan={readyPlan({ offset: 1, copyableKinds: 2 })} />);
    // Showing it fills nothing in.
    for (const select of screen.getAllByRole('combobox')) expect((select as HTMLSelectElement).value).toBe('');
    expect(actions.copyKindsFromLastWeek).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Same as last week' }));
    await waitFor(() => expect(actions.copyKindsFromLastWeek).toHaveBeenCalledWith(1));
    expect(refresh).toHaveBeenCalled();
  });

  it('says there is nothing to choose from, and offers no choice, when the person has described no kinds of days', () => {
    render(<PlanScreen plan={readyPlan({ dayKinds: [], copyableKinds: 3 })} />);
    expect(screen.getByText("You haven't described your kinds of days yet, so there is nothing to choose from.")).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Same as last week' })).toBeNull();
  });
});

describe('a habit with set days, and what is left over', () => {
  it('names the days the person set, and puts the habit on them only when they tap "Use these days"', async () => {
    render(<PlanScreen plan={readyPlan({ items: [{ ...HABIT, setDays: [1, 3, 5] }, STEP] })} />);
    expect(screen.getByText('Your set days: Mon, Wed, Fri')).toBeTruthy();
    // Naming them presses nothing.
    for (const day of within(screen.getByRole('list', { name: 'Days for Go for a run' })).getAllByRole('button')) expect(day.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getAllByRole('button', { name: 'Use these days' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Use these days' }));
    await waitFor(() => expect(actions.planHabitSetDays).toHaveBeenCalledWith(HABIT.id, 0));
  });

  it('says a step is left over from last week and that nothing is cut, and does not put it on a day', () => {
    render(<PlanScreen plan={readyPlan({ items: [HABIT, { ...STEP, movedFromLastWeek: true }] })} />);
    expect(screen.getAllByText('Left over from last week')).toHaveLength(1);
    expect(screen.getByText(/Unfinished steps move forward, and nothing is cut/)).toBeTruthy();
    for (const day of within(screen.getByRole('list', { name: 'Days for Book the room' })).getAllByRole('button')) expect(day.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows what a thing is and when it is due, in plain words', () => {
    render(<PlanScreen plan={readyPlan()} />);
    expect(screen.getByText('Repeats')).toBeTruthy();
    expect(screen.getByText('One-off')).toBeTruthy();
    expect(screen.getByText('Due Tue, Dec 1')).toBeTruthy();
  });
});

describe('which days are shown', () => {
  it('steps between weeks with links, and only the ones that exist', () => {
    const { rerender } = render(<PlanScreen plan={readyPlan()} />);
    expect(screen.getByRole('heading', { name: 'This week · Oct 26 to Nov 1' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Earlier week' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Later week' }).getAttribute('href')).toBe('/plan?week=1');

    rerender(<PlanScreen plan={readyPlan({ offset: 1, hasPrevious: true, start: '2026-11-02', end: '2026-11-08' })} />);
    expect(screen.getByRole('heading', { name: 'Next week · Nov 2 to Nov 8' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Earlier week' }).getAttribute('href')).toBe('/plan');
    expect(screen.getByRole('link', { name: 'Later week' }).getAttribute('href')).toBe('/plan?week=2');
  });

  it('without a week start shows the next 14 days and no weeks to step through', () => {
    const dates = Array.from({ length: 14 }, (_, i) => new Date(Date.UTC(2026, 9, 29 + i)).toISOString().slice(0, 10));
    const plan = readyPlan({
      window: 'next_14_days',
      hasNext: false,
      start: dates[0],
      end: dates[13],
      days: dates.map((date) => ({ date, isToday: date === '2026-10-29', isPast: false, dayTypeId: null, itemIds: [] })),
    });
    render(<PlanScreen plan={plan} />);
    expect(screen.getByRole('heading', { name: 'The next 14 days' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Weeks' })).toBeNull();
    expect(within(screen.getByRole('list', { name: 'Days for Go for a run' })).getAllByRole('button')).toHaveLength(14);
  });

  it('says there is nothing to plan yet when there are no steps or habits, and shows no days', () => {
    render(<PlanScreen plan={readyPlan({ items: [] })} />);
    expect(screen.getByText('You have no steps or habits to plan yet. When you set up a goal, they show up here.')).toBeTruthy();
    expect(screen.queryByRole('list', { name: /^Days for/ })).toBeNull();
  });

  it('groups the things by goal', () => {
    render(<PlanScreen plan={readyPlan({ items: [HABIT, { ...STEP, goalId: 'goal-2', goalTitle: 'Learn to sew' }] })} />);
    expect(within(screen.getByRole('region', { name: 'Stay fit' })).getByRole('heading', { name: 'Go for a run' })).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Learn to sew' })).getByRole('heading', { name: 'Book the room' })).toBeTruthy();
  });
});

describe('the "Your plan" card on home', () => {
  it('shows nothing when there is nothing to show', () => {
    for (const plan of [null, undefined, { state: 'none' as const }]) {
      const { container } = render(<YourPlanCard plan={plan} />);
      expect(container.innerHTML).toBe('');
    }
  });

  it('lists what the person put on today, with its goal, and links to the plan', () => {
    render(<YourPlanCard plan={readyCard({ todayItems: [{ id: 'habit-1', title: 'Go for a run', goalTitle: 'Stay fit' }] })} />);
    const card = screen.getByRole('region', { name: 'Your plan' });
    expect(within(card).getByText('Go for a run')).toBeTruthy();
    expect(within(card).getByText('Stay fit')).toBeTruthy();
    expect(within(card).getByRole('link', { name: 'Plan your week' }).getAttribute('href')).toBe('/plan');
  });

  it('says calmly that nothing is planned, never nags, and never plans for the person', () => {
    const { rerender } = render(<YourPlanCard plan={readyCard()} />);
    expect(screen.getByText("Nothing planned for today yet. You haven't planned your week yet.")).toBeTruthy();
    rerender(<YourPlanCard plan={readyCard({ plannedLater: true })} />);
    expect(screen.getByText('Nothing planned for today yet. You have planned days ahead as well.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('lists a step left over from last week with a way to choose a day for it', () => {
    render(<YourPlanCard plan={readyCard({ moved: [{ id: 'step-1', title: 'Book the room', goalTitle: 'Stay fit' }] })} />);
    expect(screen.getByRole('heading', { name: 'Left over from last week' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Choose a day' }).getAttribute('href')).toBe('/plan');
  });

  it('sits after the hero on home, once the scoreboard is ready, and nowhere else', () => {
    const ready: HomeScoreboard = { state: 'ready', today: '2026-10-29', hero: { kind: 'needs_week_start' }, goals: [], tone: 'middle', celebration: 'low_key' };
    const { container, rerender } = render(<HomeScoreboardSection home={ready} plan={readyCard()} />);
    expect(screen.getByRole('region', { name: 'Your plan' })).toBeTruthy();
    expect(container.querySelector('.home-hero, .home-notice, section section')).not.toBeNull();
    rerender(<HomeScoreboardSection home={{ state: 'no_goals' }} plan={readyCard()} />);
    expect(screen.queryByRole('region', { name: 'Your plan' })).toBeNull();
    rerender(<HomeScoreboardSection home={ready} />);
    expect(screen.queryByRole('region', { name: 'Your plan' })).toBeNull();
  });
});

describe('the week used in the tests', () => {
  it('is Monday to Sunday, with Thursday as today', () => {
    expect(WEEK).toHaveLength(7);
    expect(readyPlan().days.filter((d) => d.isToday).map((d) => d.date)).toEqual(['2026-10-29']);
  });
});
