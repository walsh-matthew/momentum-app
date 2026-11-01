// @vitest-environment jsdom
//
// The goal model's home in a DOM (components/home, MOM-112). The components only lay out what the server built from the
// engine's output (tests/scoreboard-rows.test.ts), so every number here is handed in. What these tests hold fixed are
// the owner's rules of 2026-10-28:
// - the hero celebrates a crossing alone: no "next level" line, which lives on the target's own card (§4.2 principle 8),
// - a target that is not graded shows no level word and no holding or slipping line, whatever level it carries,
// - only a person with a weekly or day-slot target is ever asked for a week start; deadline goals only never are (§2.2),
// - a milestone shows steps and a due date and has no forecast (only a deadline task does, see tests/forecast-screen.test.tsx),
// - the person's titles are kept as written and never singularised, and a tie names every tied target,
// - the hero follows the person's celebration setting, and the empty state is calm, never 0%.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoalScoreboardCard } from '@/components/home/GoalScoreboardCard';
import { HomeHeroCard } from '@/components/home/HomeHeroCard';
import { HomeScoreboardSection } from '@/components/home/HomeScoreboardSection';
import { MilestoneRow } from '@/components/home/MilestoneRow';
import { TargetRow } from '@/components/home/TargetRow';
import { WeekHero } from '@/components/home/WeekHero';
import { celebrationFor, formatDay, formatNumber, headlineText, joinTitles, levelChip, patternLine, trendText } from '@/components/home/wording';
import type { GoalCardView, HomeHero, HomeScoreboard, MilestoneView, TargetCardView } from '@/types/home';

afterEach(cleanup);

const DAYS = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'];
const week = (over: Partial<Extract<HomeHero, { kind: 'week' }>> = {}): Extract<HomeHero, { kind: 'week' }> => ({
  kind: 'week',
  start: DAYS[0],
  end: DAYS[6],
  floorsMet: 3,
  floorsInPlay: 4,
  headline: { kind: 'floor', titles: ['Workouts'] },
  days: DAYS.map((day, i) => ({ day, count: [5, 3, 5, 3, 0, 0, 0][i], isToday: i === 3, isFuture: i > 3 })),
  empty: false,
  ...over,
});

const base = { id: 't', title: 'Applications sent', measure: 'count', unit: null, role: 'effort', period: 'weekly', dueOn: null, floor: 5, aspiration: 7 } as const;
const counted = (over: Partial<Extract<TargetCardView, { status: 'counted' }>> = {}): TargetCardView => ({
  ...base,
  status: 'counted',
  counted: 6,
  graded: true,
  startedPartway: false,
  level: 'floor',
  remainingToFloor: 0,
  remainingToAspiration: 1,
  owed: 0,
  belowThreshold: 0,
  slots: null,
  pattern: null,
  trend: null,
  ...over,
});

const milestone = (over: Partial<MilestoneView> = {}): MilestoneView => ({
  id: 'm1',
  goalId: 'g',
  goalTitle: 'Land the new role',
  title: 'Portfolio ready',
  kind: 'deadline_task',
  dueOn: '2026-11-20',
  steps: [
    { id: 's1', title: 'Pick three projects', done: true },
    { id: 's2', title: 'Write the case studies', done: true },
    { id: 's3', title: 'Build the site', done: false },
    { id: 's4', title: 'Get two reviews', done: false },
  ],
  stepsDone: 2,
  forecast: null,
  ...over,
});

describe('the week hero', () => {
  it('shows the floors met as a ring in words, the headline, and the entries on each day', () => {
    render(<WeekHero hero={week()} celebration="medium" />);
    expect(screen.getByRole('img', { name: '3 of 4 floors met this week' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Workouts: floor met' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Entries per day: Mon 5, Tue 3, Wed 5, Thu 3, Fri 0, Sat 0, Sun 0' })).toBeTruthy();
  });

  it('celebrates a crossing alone: no line about the next level', () => {
    const { container } = render(<WeekHero hero={week()} celebration="big" />);
    expect(container.textContent).not.toMatch(/aspiration/i);
    expect(container.textContent).not.toMatch(/more to reach|one more/i);
  });

  it('marks today, and leaves the days still to come with no number', () => {
    const { container } = render(<WeekHero hero={week()} celebration="medium" />);
    const bars = [...container.querySelectorAll('.home-bar')];
    expect(bars.map((b) => b.getAttribute('data-today'))).toEqual([null, null, null, 'true', null, null, null]);
    expect(bars.map((b) => b.querySelector('.home-bar-value')?.textContent)).toEqual(['5', '3', '5', '3', '', '', '']);
  });

  it('with nothing logged this week it is a calm empty state: a fresh week, never 0%', () => {
    const { container } = render(<WeekHero hero={week({ empty: true, headline: null, floorsMet: 0, days: week().days.map((d) => ({ ...d, count: 0 })) })} celebration="medium" />);
    expect(screen.getByRole('heading', { name: 'A fresh week' })).toBeTruthy();
    expect(screen.getByText('Nothing logged yet. Your first entry shows up here.')).toBeTruthy();
    expect(container.textContent).not.toMatch(/0\s*%|%/);
    expect(container.textContent).not.toMatch(/0 of/);
    expect(screen.getByRole('img', { name: '4 floors to reach this week' })).toBeTruthy();
  });

  it('has no ring when no floor is in play, and says so without a made-up number', () => {
    render(<WeekHero hero={week({ floorsInPlay: 0, floorsMet: 0 })} celebration="medium" />);
    expect(screen.queryByRole('img', { name: /floors? met/ })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Workouts: floor met' })).toBeTruthy();
  });

  it('names every tied target in the headline, as given, and picks none', () => {
    render(<WeekHero hero={week({ headline: { kind: 'floor', titles: ['Apples', 'Long run', 'Workouts'] } })} celebration="medium" />);
    expect(screen.getByRole('heading', { name: 'Apples, Long run and Workouts: floor met' })).toBeTruthy();
  });

  it('names a step by its own title', () => {
    render(<WeekHero hero={week({ headline: { kind: 'step', titles: ['Write the case studies'] } })} celebration="medium" />);
    expect(screen.getByRole('heading', { name: 'Step done: Write the case studies' })).toBeTruthy();
  });
});

describe('the hero follows the person’s celebration setting', () => {
  const styleOf = (level: Parameters<typeof WeekHero>[0]['celebration'], kind: 'floor' | 'aspiration' | 'step' | 'block_end') => {
    const { container, unmount } = render(<WeekHero hero={week({ headline: { kind, titles: ['Workouts'] } })} celebration={level} />);
    const style = container.querySelector('h2')?.getAttribute('data-celebration');
    unmount();
    return style;
  };

  it('low-key is quiet whatever the crossing', () => {
    for (const kind of ['floor', 'aspiration', 'step', 'block_end'] as const) expect(styleOf('low_key', kind)).toBe('quiet');
  });

  it('medium keeps the accent for the big crossings', () => {
    expect(styleOf('medium', 'floor')).toBe('quiet');
    expect(styleOf('medium', 'step')).toBe('quiet');
    expect(styleOf('medium', 'aspiration')).toBe('accent');
    expect(styleOf('medium', 'block_end')).toBe('accent');
  });

  it('big gives every crossing the accent and the big ones more', () => {
    expect(styleOf('big', 'floor')).toBe('accent');
    expect(styleOf('big', 'step')).toBe('accent');
    expect(styleOf('big', 'aspiration')).toBe('bold');
    expect(styleOf('big', 'block_end')).toBe('bold');
  });

  it('is a function of the setting and the crossing only', () => {
    expect(celebrationFor('big', 'floor')).toBe('accent');
    expect(celebrationFor('low_key', 'block_end')).toBe('quiet');
  });
});

describe('only a person with a weekly or day-slot target is ever asked for a week start', () => {
  it('the hero asks for it, with no ring and no bars, for a person who has such a target and has not set it', () => {
    const { container } = render(<HomeHeroCard hero={{ kind: 'needs_week_start' }} celebration="medium" />);
    expect(screen.getByRole('heading', { name: 'Set the day your week starts' })).toBeTruthy();
    expect(container.querySelector('.home-ring')).toBeNull();
    expect(container.querySelector('.home-bars')).toBeNull();
    expect(container.textContent).not.toContain('Entries per day');
  });

  it('a person with only deadline goals gets their milestones in the hero and no week-start prompt anywhere', () => {
    const goal: GoalCardView = { id: 'g', title: 'Land the new role', shape: 'project', targets: [], milestones: [milestone(), milestone({ id: 'm2', title: 'Prep the talk', dueOn: '2026-11-05', steps: [], stepsDone: 0 })] };
    const home: HomeScoreboard = {
      state: 'ready',
      today: '2026-10-29',
      hero: { kind: 'deadlines', items: [milestone({ id: 'm2', title: 'Prep the talk', dueOn: '2026-11-05', steps: [], stepsDone: 0 }), milestone()] },
      goals: [goal],
      tone: 'middle',
      celebration: 'medium',
    };
    const { container } = render(<HomeScoreboardSection home={home} />);
    const hero = screen.getByRole('region', { name: 'Your deadlines' });
    expect(within(hero).getByText('Prep the talk')).toBeTruthy();
    expect(within(hero).getByText('Portfolio ready')).toBeTruthy();
    expect(within(hero).getByText('Due Thu, Nov 5')).toBeTruthy();
    expect(container.textContent).not.toMatch(/week starts|week start/i);
    expect(container.textContent).not.toContain('Needs your week start');
  });

  it('a milestone card in the hero names its goal and shows how far along it is, without the step list', () => {
    render(<HomeHeroCard hero={{ kind: 'deadlines', items: [milestone()] }} celebration="medium" />);
    expect(screen.getByText('Land the new role')).toBeTruthy();
    expect(screen.getByText(/2 of 4/)).toBeTruthy();
    expect(screen.queryByText('Build the site')).toBeNull();
  });

  it('a weekly target says it needs the week start; a deadline target never does', () => {
    render(<TargetRow card={{ ...base, status: 'needs_week_start' }} tone="middle" />);
    expect(screen.getByText('Needs your week start')).toBeTruthy();
    expect(screen.getByText(/Set the day your week starts to see this week's count/)).toBeTruthy();
    cleanup();
    render(<TargetRow card={counted({ period: 'deadline', dueOn: '2026-12-18', floor: 15, aspiration: null, counted: 2, level: 'partway', remainingToFloor: 13, remainingToAspiration: null })} tone="middle" />);
    expect(screen.queryByText('Needs your week start')).toBeNull();
    expect(screen.getByText(/Floor 15 by Fri, Dec 18/)).toBeTruthy();
  });
});

describe('a target that is not graded shows no level word and no holding or slipping line', () => {
  const midweek = counted({
    counted: 55,
    graded: false,
    startedPartway: true,
    // The engine's result carries a level even though the target is not graded, and a pattern is handed in on purpose:
    // the card must not show either.
    level: 'partway',
    remainingToFloor: 35,
    remainingToAspiration: 95,
    pattern: { kind: 'slipping', periods: 3 },
    measure: 'time',
    unit: 'min',
    floor: 90,
    aspiration: 150,
  });

  it('shows the not-graded chip and nothing that grades it', () => {
    const { container } = render(<TargetRow card={midweek} tone="middle" />);
    expect(screen.getByText('Started midweek · not graded')).toBeTruthy();
    expect(container.textContent).not.toMatch(/Partway|Floor met|Aspiration reached|Not started/);
    expect(container.textContent).not.toMatch(/Under the floor|Holding|running/);
    expect(container.textContent).not.toMatch(/more to reach your aspiration/);
    expect(container.querySelector('.home-pattern')).toBeNull();
  });

  it('still shows what was counted and the person’s own levels', () => {
    render(<TargetRow card={midweek} tone="middle" />);
    expect(screen.getByText('55')).toBeTruthy();
    expect(screen.getByText(/Floor 90 min a week · aspiration 150 min/)).toBeTruthy();
  });

  it('a target with levels that is not graded for any other reason is tracked, not judged, and has no pattern line', () => {
    const { container } = render(<TargetRow card={counted({ graded: false, startedPartway: false, level: 'floor', pattern: { kind: 'holding', periods: 3 } })} tone="middle" />);
    expect(screen.getByText('Tracked, not judged')).toBeTruthy();
    expect(container.textContent).not.toMatch(/Floor met|Holding/);
    expect(container.querySelector('.home-pattern')).toBeNull();
  });

  it('the chip logic keys on graded, not on level', () => {
    expect(levelChip(counted({ graded: false, level: 'aspiration' })).label).not.toMatch(/Aspiration/);
    expect(levelChip(counted({ graded: true, level: 'aspiration' })).label).toBe('Aspiration reached');
  });
});

describe('every graded target says its level in words', () => {
  it.each([
    [{ level: 'aspiration', remainingToAspiration: 0 }, 'Aspiration reached'],
    [{ level: 'floor' }, 'Floor met'],
    [{ level: 'partway', remainingToFloor: 2 }, 'Partway · 2 to floor'],
    [{ level: 'none' }, 'Not started'],
  ] as const)('%j is "%s"', (over, label) => {
    render(<TargetRow card={counted(over)} tone="middle" />);
    expect(screen.getByText(label)).toBeTruthy();
  });

  it('a quantity says its unit in the partway words', () => {
    render(<TargetRow card={counted({ unit: 'km', measure: 'quantity', level: 'partway', remainingToFloor: 4.5, counted: 10.5, floor: 15 })} tone="middle" />);
    expect(screen.getByText('Partway · 4.5 km to floor')).toBeTruthy();
  });

  it('an outcome target is tracked, not judged, with its count and trend', () => {
    const { container } = render(<TargetRow card={{ ...counted({ graded: false, level: null, floor: null, aspiration: null, remainingToFloor: null, remainingToAspiration: null, trend: { counts: [0, 1, 2], direction: 'up' } }), role: 'outcome', title: 'Interviews' }} tone="middle" />);
    expect(screen.getByText('Tracked, not judged')).toBeTruthy();
    expect(screen.getByText('this week')).toBeTruthy();
    expect(screen.getByText('Last 3 weeks: 0, 1, 2 (rising).')).toBeTruthy();
    expect(container.querySelector('.home-track')).toBeNull();
  });
});

describe('the way to the next level lives on the target’s own card', () => {
  it('a graded target at its floor says what is left to the aspiration, with the person’s title untouched', () => {
    render(<TargetRow card={counted()} tone="middle" />);
    expect(screen.getByRole('heading', { name: 'Applications sent' })).toBeTruthy();
    expect(screen.getByText('1 more to reach your aspiration')).toBeTruthy();
  });

  it('never singularises a title: it is shaped around, not changed', () => {
    const { container } = render(<TargetRow card={counted({ counted: 6 })} tone="middle" />);
    expect(container.textContent).not.toMatch(/application(?!s)/i);
  });

  it('says it in the target’s own unit', () => {
    render(<TargetRow card={counted({ unit: 'km', measure: 'quantity', counted: 15, floor: 15, aspiration: 20, remainingToAspiration: 5 })} tone="middle" />);
    expect(screen.getByText('5 km more to reach your aspiration')).toBeTruthy();
  });

  it('has no such line before the floor is met, or once the aspiration is reached, or without an aspiration', () => {
    for (const over of [{ level: 'partway', remainingToFloor: 2 }, { level: 'aspiration', remainingToAspiration: 0 }, { level: 'floor', aspiration: null, remainingToAspiration: null }] as const) {
      const { container } = render(<TargetRow card={counted(over)} tone="middle" />);
      expect(container.textContent).not.toContain('to reach your aspiration');
      cleanup();
    }
  });
});

describe('day slots', () => {
  it('say how many named days are filled, and list the named days apart, never as if they were the filled ones', () => {
    render(<TargetRow card={counted({ ...base, title: 'Mobility', period: 'day_slots', floor: 3, aspiration: null, counted: 2, level: 'partway', remainingToFloor: 1, remainingToAspiration: null, slots: { filled: 2, total: 3, weekdays: [1, 3, 5] } })} tone="middle" />);
    expect(screen.getByText('Partway · 1 to floor')).toBeTruthy();
    expect(screen.getByText('days filled').parentElement?.textContent).toBe('2 of 3days filled');
    expect(screen.getByText('Named days: Mon, Wed, Fri')).toBeTruthy();
    expect(screen.queryByText(/days filled \(/)).toBeNull();
  });
});

describe('patterns follow the person’s tone, and only a graded target has one', () => {
  it('holding', () => {
    expect(patternLine({ kind: 'holding', periods: 3 }, 'gentle').text).toBe('Holding steady: floor met 3 weeks running.');
    expect(patternLine({ kind: 'holding', periods: 3 }, 'middle').text).toBe('Holding: floor met 3 weeks running.');
    expect(patternLine({ kind: 'holding', periods: 3 }, 'direct').text).toBe('Floor met 3 weeks running.');
  });

  it('slipping is a nudge, never a fail, and a gentle tone is softer', () => {
    const gentle = patternLine({ kind: 'slipping', periods: 2 }, 'gentle');
    const direct = patternLine({ kind: 'slipping', periods: 2 }, 'direct');
    expect(gentle.tone).toBe('nudge');
    expect(gentle.text).toContain('No rush');
    expect(direct.text).toBe('Under the floor 2 weeks running.');
    for (const tone of ['gentle', 'middle', 'direct'] as const) expect(patternLine({ kind: 'slipping', periods: 2 }, tone).text).not.toMatch(/fail|miss/i);
  });

  it('a graded target shows its pattern line in the person’s tone', () => {
    render(<TargetRow card={counted({ pattern: { kind: 'slipping', periods: 3 } })} tone="direct" />);
    expect(screen.getByText('Under the floor 3 weeks running.')).toBeTruthy();
  });

  it('points a slipping run at the weekly review until that review is finished, then keeps only "Under the floor 3 weeks running." (MOM-146)', () => {
    const slipping = (reviewed: boolean) => counted({ pattern: { kind: 'slipping', periods: 3, reviewed } });
    render(<TargetRow card={slipping(false)} tone="middle" />);
    expect(screen.getByText('Under the floor 3 weeks running. Worth a look at your weekly review.')).toBeTruthy();
    cleanup();
    render(<TargetRow card={slipping(true)} tone="middle" />);
    expect(screen.getByText('Under the floor 3 weeks running.')).toBeTruthy();
    expect(screen.queryByText(/weekly review/)).toBeNull();
    cleanup();
    // A card from before the field existed reads as not reviewed.
    render(<TargetRow card={counted({ pattern: { kind: 'slipping', periods: 3 } })} tone="middle" />);
    expect(screen.getByText(/Worth a look at your weekly review/)).toBeTruthy();
  });
});

describe('a milestone shows its steps and due date, with no forecast', () => {
  it('lists the steps with done and to do in words, and the steps done', () => {
    render(<MilestoneRow milestone={milestone()} today="2026-10-29" />);
    expect(screen.getByRole('heading', { name: 'Portfolio ready' })).toBeTruthy();
    expect(screen.getByText('Due Fri, Nov 20')).toBeTruthy();
    expect(screen.getByText(/^2 of 4/)).toBeTruthy();
    const list = screen.getByRole('list', { name: '2 of 4 steps done' });
    expect(list.textContent).toContain('Done: Pick three projects');
    expect(list.textContent).toContain('To do: Build the site');
  });

  it('says nothing about whether it fits: only a deadline task has a forecast', () => {
    const { container } = render(<MilestoneRow milestone={milestone()} />);
    expect(container.textContent).not.toMatch(/fits|tight|does not fit|doesn.t fit|on track|behind|at risk/i);
  });

  it('shows no due chip when the milestone has no date', () => {
    render(<MilestoneRow milestone={milestone({ dueOn: null })} />);
    expect(screen.queryByText(/^Due /)).toBeNull();
  });
});

describe('a goal card', () => {
  it('shows the goal in the person’s words with its targets and milestones', () => {
    const goal: GoalCardView = { id: 'g', title: 'Land the new role', shape: 'project', targets: [counted()], milestones: [milestone()] };
    render(<GoalScoreboardCard goal={goal} tone="middle" />);
    const card = screen.getByRole('region', { name: 'Land the new role' });
    expect(within(card).getByText('Project')).toBeTruthy();
    expect(within(card).getByText('Applications sent')).toBeTruthy();
    expect(within(card).getByText('Portfolio ready')).toBeTruthy();
  });

  it('a goal with nothing to measure says so', () => {
    render(<GoalScoreboardCard goal={{ id: 'g', title: 'Someday', shape: 'ongoing', targets: [], milestones: [] }} tone="middle" />);
    expect(screen.getByText('Nothing to measure on this goal yet.')).toBeTruthy();
  });

  it('a target that is not counted yet, or not started, is said in words and never graded', () => {
    render(<TargetRow card={{ ...base, status: 'not_counted' }} tone="middle" />);
    expect(screen.getByText('Tracked, not counted yet')).toBeTruthy();
    cleanup();
    render(<TargetRow card={{ ...base, status: 'not_started', startsOn: '2026-11-09' }} tone="middle" today="2026-10-29" />);
    expect(screen.getByText('Starts Mon, Nov 9')).toBeTruthy();
    cleanup();
    // MOM-111 finding 7: the one casual date formatter says tomorrow, and the year only when it is not this year.
    render(<TargetRow card={{ ...base, status: 'not_started', startsOn: '2026-10-30' }} tone="middle" today="2026-10-29" />);
    expect(screen.getByText('Starts tomorrow')).toBeTruthy();
  });
});

describe('the section above the feed', () => {
  it('says in words when the scoreboard could not be read, which is not having no goals, with one Reload button', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render(<HomeScoreboardSection home={null} />);
    const alert = within(screen.getByRole('alert'));
    expect(alert.getByRole('heading', { name: "Your goals didn't load just now." })).toBeTruthy();
    expect(alert.getByText('Nothing is lost.')).toBeTruthy();
    // One solid button, never greyed out, and no offer of setup or the old wizard (never assume).
    const buttons = alert.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Reload']);
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(false);
    expect(buttons[0].className).toContain('bg-primary');
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(reload).not.toHaveBeenCalled();
    fireEvent.click(buttons[0]);
    expect(reload).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('shows nothing for a person with no goals in the goal model', () => {
    const { container } = render(<HomeScoreboardSection home={{ state: 'no_goals' }} />);
    expect(container.innerHTML).toBe('');
  });

  it('asks for the time zone or the day end, and says nothing is graded or guessed until then', () => {
    render(<HomeScoreboardSection home={{ state: 'needs_day_anchors', anchor: 'time_zone', reason: 'not_set' }} />);
    expect(screen.getByText(/Set your time zone to see your week/)).toBeTruthy();
    cleanup();
    render(<HomeScoreboardSection home={{ state: 'needs_day_anchors', anchor: 'day_end', reason: 'invalid' }} />);
    expect(screen.getByText(/The day end you saved is not one Momentum can use/)).toBeTruthy();
  });

  it('shows the hero above the goals when ready', () => {
    const goal: GoalCardView = { id: 'g', title: 'Get stronger', shape: 'ongoing', targets: [counted()], milestones: [] };
    const { container } = render(<HomeScoreboardSection home={{ state: 'ready', today: '2026-10-29', hero: week(), goals: [goal], tone: 'middle', celebration: 'medium' }} />);
    const sections = [...container.querySelectorAll('section')].map((s) => s.getAttribute('aria-label'));
    expect(sections).toEqual(['Your week', 'This week', 'Get stronger']);
  });

  it('shows no hero when there is none', () => {
    const goal: GoalCardView = { id: 'g', title: 'Someday', shape: 'ongoing', targets: [], milestones: [] };
    render(<HomeScoreboardSection home={{ state: 'ready', today: '2026-10-29', hero: null, goals: [goal], tone: 'middle', celebration: 'medium' }} />);
    expect(screen.queryByRole('region', { name: 'This week' })).toBeNull();
  });
});

describe('wording helpers', () => {
  it('joins titles in the order given', () => {
    expect(joinTitles([])).toBe('');
    expect(joinTitles(['A'])).toBe('A');
    expect(joinTitles(['A', 'B'])).toBe('A and B');
    expect(joinTitles(['A', 'B', 'C', 'D'])).toBe('A, B, C and D');
  });

  it('formats numbers to one decimal at most, and days from a date with no time zone shift', () => {
    expect(formatNumber(15)).toBe('15');
    expect(formatNumber(8.5)).toBe('8.5');
    expect(formatNumber(2.04)).toBe('2');
    expect(formatDay('2026-11-01', '2026-10-29')).toBe('Sun, Nov 1');
    expect(formatDay('2027-01-04', '2026-10-29')).toBe('Mon, Jan 4, 2027');
    expect(formatDay('2026-10-29', '2026-10-29')).toBe('today');
    expect(formatDay('2026-10-29', '2026-10-29', { relative: false })).toBe('Thu, Oct 29');
    // Without the person's today, the year is always shown.
    expect(formatDay('2026-11-01', null)).toBe('Sun, Nov 1, 2026');
  });

  it('writes a headline for each kind of crossing', () => {
    expect(headlineText({ kind: 'floor', titles: ['Workouts'] })).toBe('Workouts: floor met');
    expect(headlineText({ kind: 'aspiration', titles: ['Workouts'] })).toBe('Workouts: aspiration reached');
    expect(headlineText({ kind: 'block_end', titles: ['Workouts'] })).toBe('Workouts: block finished');
    expect(headlineText({ kind: 'step', titles: ['Build the site'] })).toBe('Step done: Build the site');
  });

  it('says a trend without a direction word when there is too little to say', () => {
    expect(trendText({ counts: [1], direction: 'insufficient' })).toBe('Last 1 week: 1.');
    expect(trendText({ counts: [], direction: 'insufficient' })).toBeNull();
  });
});
