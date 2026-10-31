// @vitest-environment jsdom
//
// The weekly review's layer 1 recap in a DOM (components/review, components/home/ReviewNotice, MOM-113 block 3.2). The
// components only lay out what the server built from the engine's facts and the person's own record, so every number here
// is handed in. What these tests hold fixed:
// - the recap says, in words, when it closes the week early: "This recap counts through today, Sunday. Anything you log
//   later today will show below under Since this recap." (the last-day decision, RAID I-11),
// - a later entry is said against the stored recap in plain words and never by changing it (RAID R-26),
// - the recap asks for nothing (a celebration is never next to a request, principle 8) and gives priorities in the person's
//   own words with no score (principle 6),
// - no review appears before the week start and the planning day are chosen, and nothing is guessed (principle 1),
// - a week that has closed reads as "that week", and a slipping run is not pointed at the review the person is in.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReviewNotice } from '@/components/home/ReviewNotice';
import { ReviewScreen } from '@/components/review/ReviewScreen';
import { changeLine, closedEarlyLine, closedEarlyReviewedLine, crossingLine, fullWeekdayName, levelWords, weekLabel } from '@/components/review/wording';
import { parseStoredRecap } from '@/lib/review/storedRecap';
import type { RecapChange, RecapTarget, StoredRecap, StoredReview, WeeklyReviewFacts } from '@/types/review';

// The sitting on a ready review is a client component: it needs the router and the two actions, none of which this file calls.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/app/actions/review', () => ({ askForReviewLine: vi.fn(), finishReview: vi.fn() }));
vi.mock('@/app/actions/targetChange', () => ({ changeTarget: vi.fn() }));

afterEach(cleanup);

// The week 2026-10-19 (Monday) to 2026-10-25 (Sunday). 2026-10-25 is a Sunday.
const WINDOW = { start: '2026-10-19', end: '2026-10-25' };

const target = (over: Partial<RecapTarget> = {}): RecapTarget => ({
  id: 't1',
  title: 'Workouts',
  measure: 'count',
  unit: null,
  role: 'effort',
  period: 'weekly',
  dueOn: null,
  floor: 3,
  aspiration: 5,
  status: 'counted',
  counted: 3,
  graded: true,
  startedPartway: false,
  level: 'floor',
  remainingToFloor: 0,
  remainingToAspiration: 2,
  owed: 0,
  belowThreshold: 0,
  slots: null,
  pattern: null,
  trend: null,
  crossings: [],
  ...over,
});

const recap = (over: Partial<StoredRecap> = {}): StoredRecap => ({
  v: 1,
  window: WINDOW,
  closedEarly: false,
  goals: [{ id: 'g1', title: 'Stay fit', targets: [target()] }],
  priorities: [],
  ...over,
});

// The person's today in these fixtures (MOM-111 finding 7): every date here is this year, so none shows a year.
const TODAY = '2026-10-28';

const ready = (over: Partial<Extract<WeeklyReviewFacts, { state: 'ready' }>> = {}): WeeklyReviewFacts => ({
  state: 'ready',
  tone: 'middle',
  today: TODAY,
  window: WINDOW,
  targets: [],
  recap: recap(),
  priorities: [],
  offerReflection: true,
  adjustment: null,
  edit: null,
  changes: [],
  ...over,
});

const review = (over: Partial<StoredReview> = {}): StoredReview => ({
  id: 'r1',
  window: WINDOW,
  recap: recap(),
  adjustment: null,
  finishedOn: '2026-10-26',
  ...over,
});

const change = (over: Partial<RecapChange> = {}): RecapChange => ({
  weekStart: '2026-10-19',
  weekEnd: '2026-10-25',
  targetId: 't1',
  title: 'Workouts',
  unit: null,
  said: { counted: 1, level: 'partway', graded: true },
  now: { counted: 3, level: 'floor', graded: true },
  ...over,
});

const show = (facts: WeeklyReviewFacts) => render(<ReviewScreen facts={facts} />);

describe('the last-day decision is said in words (RAID I-11)', () => {
  it('pins the sentence for a week that closed early', () => {
    expect(closedEarlyLine('2026-10-25')).toBe(
      'This recap counts through today, Sunday. Anything you log later today will show below under Since this recap.',
    );
  });

  it('names the weekday the week actually ends on, whatever it is', () => {
    expect(closedEarlyLine('2026-10-31')).toBe(
      'This recap counts through today, Saturday. Anything you log later today will show below under Since this recap.',
    );
    expect(closedEarlyLine('2026-10-26')).toContain('today, Monday.');
  });

  it('shows the pinned sentence on a recap that closed the week early', () => {
    show(ready({ recap: recap({ closedEarly: true }) }));
    expect(
      screen.getByText('This recap counts through today, Sunday. Anything you log later today will show below under Since this recap.'),
    ).toBeTruthy();
  });

  it('says nothing about it when the week closed on its own', () => {
    show(ready({ recap: recap({ closedEarly: false }) }));
    expect(screen.queryByText(/counts through today/)).toBeNull();
  });

  it('says it on a finished review read back later, in the past tense', () => {
    show({ state: 'reviewed', tone: 'middle', today: TODAY, review: review({ recap: recap({ closedEarly: true }) }), changes: [], planning: 'one_sitting' });
    expect(screen.getByText(closedEarlyReviewedLine(WINDOW))).toBeTruthy();
    expect(closedEarlyReviewedLine(WINDOW)).toBe(
      'This recap counted through Sunday, the last day of the week. Anything logged for a day in that week after you finished shows below under Since this recap.',
    );
    expect(screen.queryByText(/counts through today/)).toBeNull();
  });
});

describe('a later entry is said against the stored recap, in plain words (RAID R-26)', () => {
  it('writes the change as the recap said it, what it reads now, and why', () => {
    expect(changeLine(change())).toBe(
      'Workouts: it now reads 3 (floor met). The recap said 1 (partway). An entry logged later for a day in that week changed it.',
    );
  });

  it('keeps the person\'s unit and says "tracked, not judged" for a target that is not graded', () => {
    const line = changeLine(
      change({ title: 'Distance', unit: 'km', said: { counted: 8, level: 'partway', graded: true }, now: { counted: 9.5, level: 'floor', graded: false } }),
    );
    expect(line).toBe(
      'Distance: it now reads 9.5 km (tracked, not judged). The recap said 8 km (partway). An entry logged later for a day in that week changed it.',
    );
  });

  it('shows the lines under "Since this recap", grouped by week, newest first', () => {
    show({
      state: 'reviewed',
      tone: 'middle',
      today: TODAY,
      review: review(),
      changes: [change(), change({ weekStart: '2026-10-12', weekEnd: '2026-10-18', targetId: 't2', title: 'Reading' })],
      planning: 'one_sitting',
    });
    const section = screen.getByRole('heading', { name: 'Since this recap' }).closest('section') as HTMLElement;
    const weeks = within(section).getAllByText(/^Week of /).map((el) => el.textContent);
    expect(weeks).toEqual(['Week of Mon, Oct 19', 'Week of Mon, Oct 12']);
    expect(within(section).getByText(changeLine(change()))).toBeTruthy();
  });

  it('shows no such section when nothing changed', () => {
    show({ state: 'reviewed', tone: 'middle', today: TODAY, review: review(), changes: [], planning: 'one_sitting' });
    expect(screen.queryByRole('heading', { name: 'Since this recap' })).toBeNull();
  });

  it('shows it at the next review too, beside the new recap', () => {
    show(ready({ changes: [change()] }));
    expect(screen.getByRole('heading', { name: 'Since this recap' })).toBeTruthy();
  });

  it('shows the stored numbers as they were said, not the live ones', () => {
    // The record says 1; a later entry makes it 3. The card is drawn from the record, the change from both.
    show({ state: 'reviewed', tone: 'middle', today: TODAY, review: review({ recap: recap({ goals: [{ id: 'g1', title: 'Stay fit', targets: [target({ counted: 1, level: 'partway', remainingToFloor: 2, remainingToAspiration: 4 })] }] }) }), changes: [change()], planning: 'one_sitting' });
    const goal = screen.getByRole('region', { name: 'Stay fit' });
    expect(within(goal).getByText('Partway · 2 to floor')).toBeTruthy();
    expect(within(goal).queryByText('Floor met')).toBeNull();
  });
});

describe('the recap (layer 1)', () => {
  it('shows each goal with its targets as the week ended, in the person\'s own words', () => {
    show(
      ready({
        recap: recap({
          goals: [
            { id: 'g1', title: 'Stay fit', targets: [target({ title: 'Workouts' }), target({ id: 't2', title: 'Long run', unit: 'km', counted: 12, floor: 15, aspiration: null, level: 'partway', remainingToFloor: 3, remainingToAspiration: null })] },
            { id: 'g2', title: 'Land the new role', targets: [target({ id: 't3', title: 'Applications sent', level: 'aspiration', counted: 5, remainingToAspiration: 0 })] },
          ],
        }),
      }),
    );
    const fit = screen.getByRole('region', { name: 'Stay fit' });
    expect(within(fit).getByRole('heading', { name: 'Workouts' })).toBeTruthy();
    expect(within(fit).getByText('Floor met')).toBeTruthy();
    expect(within(fit).getByText('Partway · 3 km to floor')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Land the new role' })).getByText('Aspiration reached')).toBeTruthy();
  });

  it('reads a closed week as "that week", never "so far", and says how far short an aspiration was', () => {
    show(ready());
    expect(screen.getByText('that week')).toBeTruthy();
    expect(screen.queryByText('so far')).toBeNull();
    expect(screen.getByText('2 short of your aspiration that week')).toBeTruthy();
    expect(screen.queryByText(/more to reach/)).toBeNull();
  });

  it('shows what crossed that week, as dates', () => {
    show(ready({ recap: recap({ goals: [{ id: 'g1', title: 'Stay fit', targets: [target({ crossings: [{ kind: 'floor', on: '2026-10-21' }, { kind: 'aspiration', on: '2026-10-24' }] })] }] }) }));
    expect(screen.getByText('Reached your floor on Wed, Oct 21')).toBeTruthy();
    expect(screen.getByText('Reached your aspiration on Sat, Oct 24')).toBeTruthy();
    expect(crossingLine({ kind: 'block_end', on: '2026-10-25' }, TODAY)).toBe('Finished your block on Sun, Oct 25');
  });

  it('shows a pattern in both directions, and does not point a slipping run at the review the person is in', () => {
    show(ready({ recap: recap({ goals: [{ id: 'g1', title: 'Stay fit', targets: [target({ level: 'partway', counted: 1, remainingToFloor: 2, pattern: { kind: 'slipping', periods: 2 } })] }] }) }));
    expect(screen.getByText('Under the floor 2 weeks running.')).toBeTruthy();
    expect(screen.queryByText(/weekly review/i)).toBeNull();
    cleanup();
    show(ready({ recap: recap({ goals: [{ id: 'g1', title: 'Stay fit', targets: [target({ pattern: { kind: 'holding', periods: 3 } })] }] }) }));
    expect(screen.getByText('Holding: floor met 3 weeks running.')).toBeTruthy();
  });

  it('gives a target that is not graded no level word and no run', () => {
    show(ready({ recap: recap({ goals: [{ id: 'g1', title: 'Stay fit', targets: [target({ graded: false, level: 'floor', pattern: { kind: 'holding', periods: 3 } })] }] }) }));
    expect(screen.getByText('Tracked, not judged')).toBeTruthy();
    expect(screen.queryByText('Floor met')).toBeNull();
    expect(screen.queryByText(/running/)).toBeNull();
  });

  it('names the priorities the person gave, in their own words, with no score', () => {
    show(ready({ recap: recap({ priorities: [{ id: 'p1', label: 'Family time' }, { id: 'p2', label: 'Deep work' }] }) }));
    const section = screen.getByRole('region', { name: 'Priorities you named' });
    expect(within(section).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Family time', 'Deep work']);
    expect(within(section).getByText('In your own words. They have no score.')).toBeTruthy();
    expect(section.textContent).not.toMatch(/\d/);
  });

  it('shows no priorities section when the person named none, and never invents one', () => {
    show(ready());
    expect(screen.queryByRole('region', { name: 'Priorities you named' })).toBeNull();
  });

  it('is calm when no target finished a week, and never reads as a miss', () => {
    show(ready({ recap: recap({ goals: [] }) }));
    expect(screen.getByText('No target finished a week in this period, so there is nothing to recap. Nothing here is a miss.')).toBeTruthy();
  });

  it('asks for nothing: no buttons, no form fields, and no question inside the recap itself', () => {
    show(ready({ recap: recap({ priorities: [{ id: 'p1', label: 'Family time' }], closedEarly: true }), changes: [change()] }));
    // The recap is layer 1; the sitting that follows it (tests/review-sitting.test.tsx) is where anything is asked.
    const recapRegion = screen.getByRole('region', { name: "This week's recap" });
    expect(within(recapRegion).queryAllByRole('button')).toHaveLength(0);
    expect(recapRegion.querySelectorAll('input, select, textarea, form')).toHaveLength(0);
    expect(recapRegion.textContent).not.toContain('?');
  });

  it('puts what follows the recap after it, in the order of the layers: the line, the one question, the finish', () => {
    show(ready({ offerReflection: true, adjustment: { kind: 'slipping_check_in', targetId: 't1', periods: 2 } }));
    // The finish is not there until the person has answered the question (MOM-146: no button that cannot be used).
    expect(screen.queryByRole('region', { name: 'Finish your review' })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'No, keep it as it is' }));
    const order = ["This week's recap", 'A one-line look back', 'One thing to decide', 'Finish your review'];
    const positions = order.map((name) => {
      const el = screen.getByRole('region', { name });
      return Array.from(document.body.querySelectorAll('section')).indexOf(el as HTMLElement);
    });
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(new Set(positions).size).toBe(4);
  });

  it('puts a number nowhere that the engine did not give: no percentages', () => {
    const { container } = show(ready());
    expect(container.textContent).not.toContain('%');
  });
});

describe('the states before a review exists', () => {
  it('asks for nothing and guesses nothing before the week start and the planning day are chosen', () => {
    show({ state: 'needs_planning_setup' });
    expect(screen.getByText('Choose the day your week starts and the day you plan it, and your weekly review will come on that day. Nothing is guessed.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open settings' }).getAttribute('href')).toBe('/settings');
    expect(screen.queryByRole('region', { name: 'Stay fit' })).toBeNull();
  });

  it('asks for the time zone or the day end, in the same words as home', () => {
    show({ state: 'needs_day_anchors', anchor: 'time_zone', reason: 'not_set' });
    expect(screen.getByText('Set your time zone to get a weekly review. Nothing is graded until you do, and nothing is guessed.')).toBeTruthy();
    cleanup();
    show({ state: 'needs_day_anchors', anchor: 'day_end', reason: 'invalid' });
    expect(screen.getByText('The day end you saved is not one Momentum can use. Set it again to get a weekly review.')).toBeTruthy();
  });

  it('says there is nothing to review yet with no goal', () => {
    show({ state: 'no_goals' });
    expect(screen.getByText(/starts once you have a goal/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/');
  });

  it('says which day the review comes on when it is not due, with no recap of this week', () => {
    show({ state: 'not_due', tone: 'middle', today: TODAY, planningWeekday: 1, last: null, changes: [] });
    expect(screen.getByText('Your weekly review comes on Mondays, the day you chose to plan your week.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Your last review' })).toBeNull();
  });

  it('keeps the last finished review there to read when it is not due', () => {
    show({ state: 'not_due', tone: 'middle', today: TODAY, planningWeekday: 3, last: review(), changes: [change()] });
    expect(screen.getByText('Your weekly review comes on Wednesdays, the day you chose to plan your week.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Your last review' })).toBeTruthy();
    expect(screen.getByText('You finished it on Mon, Oct 26.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Since this recap' })).toBeTruthy();
  });
});

describe('the finished review', () => {
  it('says when it was finished and that it stays as it was said, and never asks again', () => {
    show({ state: 'reviewed', tone: 'middle', today: TODAY, review: review(), changes: [], planning: 'one_sitting' });
    expect(screen.getByText('You finished this review on Mon, Oct 26. It stays as it was said.')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByText(/start|begin|review again/i)).toBeNull();
  });

  it('is followed by the week plan in the same sitting, as a link into /plan and nothing planned for the person', () => {
    show({ state: 'reviewed', tone: 'middle', today: TODAY, review: review(), changes: [], planning: 'one_sitting' });
    const next = screen.getByRole('region', { name: 'Plan your week' });
    expect(within(next).getByRole('heading', { name: 'Plan your week' })).toBeTruthy();
    expect(within(next).getByText("Your review is done. Next, choose what you'll do on which days.")).toBeTruthy();
    expect(within(next).getByRole('link', { name: 'Plan your week' }).getAttribute('href')).toBe('/plan');
    expect(within(next).queryAllByRole('button')).toHaveLength(0);
  });

  it('leaves planning for later, with one quiet line and a way in, when the person chose to plan separately', () => {
    show({ state: 'reviewed', tone: 'middle', today: TODAY, review: review(), changes: [], planning: 'separate' });
    const next = screen.getByRole('region', { name: 'Plan your week' });
    expect(within(next).getByText("You chose to plan your week separately, so it's there when you want it.")).toBeTruthy();
    expect(within(next).getByRole('link', { name: 'Open your week plan' }).getAttribute('href')).toBe('/plan');
    expect(within(next).queryByRole('heading')).toBeNull();
    expect(screen.queryByText(/Next, choose/)).toBeNull();
  });

  it('puts no planning step on a review that is not finished or not due', () => {
    show(ready());
    expect(screen.queryByRole('region', { name: 'Plan your week' })).toBeNull();
    cleanup();
    show({ state: 'not_due', tone: 'middle', today: TODAY, planningWeekday: 1, last: review(), changes: [] });
    expect(screen.queryByRole('region', { name: 'Plan your week' })).toBeNull();
  });
});

describe('home\'s notice', () => {
  it('shows nothing when there is nothing to say', () => {
    const { container } = render(<ReviewNotice prompt={{ state: 'none' }} />);
    expect(container.textContent).toBe('');
  });

  it('points at the review when it is due, and at the finished one afterwards', () => {
    render(<ReviewNotice prompt={{ state: 'due' }} />);
    expect(screen.getByText('Your week is ready to look back on.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See your weekly review' }).getAttribute('href')).toBe('/review');
    cleanup();
    render(<ReviewNotice prompt={{ state: 'reviewed' }} />);
    expect(screen.getByText("This week's review is done.")).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See it' }).getAttribute('href')).toBe('/review');
  });
});

describe('the words around the facts', () => {
  it('says a level in words, and never a level for a target that is not graded', () => {
    expect(levelWords({ level: 'none', graded: true })).toBe('not started');
    expect(levelWords({ level: 'partway', graded: true })).toBe('partway');
    expect(levelWords({ level: 'floor', graded: true })).toBe('floor met');
    expect(levelWords({ level: 'aspiration', graded: true })).toBe('aspiration reached');
    expect(levelWords({ level: 'floor', graded: false })).toBe('tracked, not judged');
    expect(levelWords({ level: null, graded: true })).toBe('tracked, not judged');
  });

  it('labels a week and names a weekday in full', () => {
    expect(weekLabel(WINDOW, TODAY)).toBe('Mon, Oct 19 to Sun, Oct 25');
    // MOM-111 finding 7: the year only when it is not this year, through the one casual formatter.
    expect(weekLabel({ start: '2025-12-29', end: '2026-01-04' }, TODAY)).toBe('Mon, Dec 29, 2025 to Sun, Jan 4');
    expect([0, 1, 6].map(fullWeekdayName)).toEqual(['Sunday', 'Monday', 'Saturday']);
  });
});

describe('reading a stored recap back', () => {
  it('reads a recap it wrote, field for field', () => {
    const stored = recap({ closedEarly: true, priorities: [{ id: 'p1', label: 'Family time' }], goals: [{ id: 'g1', title: 'Stay fit', targets: [target({ crossings: [{ kind: 'floor', on: '2026-10-21' }], slots: { filled: 2, total: 3, weekdays: [1, 3, 5] }, trend: { counts: [1, 2, 3], direction: 'up' }, pattern: { kind: 'holding', periods: 2 } })] }] });
    expect(parseStoredRecap(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
  });

  it('returns null, and guesses nothing, for a stored value it does not know', () => {
    expect(parseStoredRecap(null)).toBeNull();
    expect(parseStoredRecap([])).toBeNull();
    expect(parseStoredRecap({ v: 2, window: WINDOW, goals: [], priorities: [], closedEarly: false })).toBeNull();
    expect(parseStoredRecap({ ...recap(), window: { start: 'Monday', end: 'Sunday' } })).toBeNull();
    expect(parseStoredRecap({ ...recap(), goals: [{ id: 'g1', title: 'x', targets: [{ id: 't', title: 'bad' }] }] })).toBeNull();
  });
});
