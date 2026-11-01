// @vitest-environment jsdom
//
// A deadline task's forecast on home, in everyday words, in every state (components/home/MilestoneRow.tsx and
// components/home/wording.ts, MOM-112 slice 2, docs/DOMAIN_MODEL.md §1.4 and §2.1 plain language). The rules each test names
// are the owner's of 2026-10-29:
// - the forecast is a fact about the days set aside, never a promise, and shows no minutes, hours, free time or slot
//   (principle 12);
// - when the plan does not reach the due date, and the days set aside so far are not enough, it says how many days are set
//   aside through which date and to plan more as they go, with no tight or short claim;
// - "move the date" is offered only when the engine offered it (setup recorded that the date can move);
// - the words are the person's: "set aside", "kind of day", never capacity, slot, pick or day type (the same ban as the plan).

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HomeHeroCard } from '@/components/home/HomeHeroCard';
import { MilestoneRow } from '@/components/home/MilestoneRow';
import { forecastLine } from '@/components/home/wording';
import { INTERNAL_TERMS, unexplainedTerms } from '@/lib/setup/plainWords';
import type { ForecastView, MilestoneView } from '@/types/home';

afterEach(cleanup);

const TODAY = '2026-10-29';

const milestone = (forecast: ForecastView | null, over: Partial<MilestoneView> = {}): MilestoneView => ({
  id: 'm1',
  goalId: 'g',
  goalTitle: 'Land the new role',
  title: 'Send the application',
  kind: 'deadline_task',
  dueOn: '2026-11-06',
  steps: [
    { id: 's1', title: 'Write the letter', done: true },
    { id: 's2', title: 'Send it', done: false },
  ],
  stepsDone: 1,
  dateCanMove: false,
  forecast,
  ...over,
});

const STATES: [string, ForecastView][] = [
  ['enough time', { state: 'fits', soFar: false }],
  ['enough so far', { state: 'fits', soFar: true }],
  ['close', { state: 'tight' }],
  ['short, and the date can move', { state: 'does_not_fit', options: ['more_time', 'smaller_scope', 'move_date', 'accept_risk'] }],
  ['short, and the date cannot move', { state: 'does_not_fit', options: ['more_time', 'smaller_scope', 'accept_risk'] }],
  ['planned so far', { state: 'planned_so_far', days: 4, through: '2026-11-03' }],
  ['one day set aside so far', { state: 'planned_so_far', days: 1, through: '2026-10-29' }],
  ['past due', { state: 'past_due' }],
  ['not enough to say', { state: 'not_enough_data' }],
  ['nothing set aside', { state: 'nothing_set_aside' }],
  ['a day with no kind', { state: 'day_without_kind', date: '2026-10-30' }],
  ['a kind with no usual time', { state: 'kind_without_time', date: '2026-10-30', kindName: 'Rest day', kindId: 'k1' }],
  ['time counted in sessions', { state: 'counted_in_sessions' }],
];

// What the forecast must never say: the build's words, and any figure of time or room.
const NEVER_ON_SCREEN: { word: string; pattern: RegExp }[] = [
  { word: 'capacity', pattern: /\bcapacity\b/i },
  { word: 'slot', pattern: /\bslots?\b/i },
  { word: 'pick', pattern: /\bpick(s|ed|ing)?\b/i },
  { word: 'day type', pattern: /\bday[- ]types?\b/i },
  { word: 'target', pattern: /\btargets?\b/i },
  { word: 'milestone', pattern: /\bmilestones?\b/i },
  { word: 'forecast', pattern: /\bforecast(s|ed)?\b/i },
  { word: 'free time', pattern: /\bfree (time|minutes|hours)\b/i },
  { word: 'a figure of time', pattern: /\b\d+(\.\d+)?\s*(min|minutes|hrs?|hours)\b/i },
  { word: 'a promise', pattern: /\b(guarantee|promise|will (make|finish|fit)|on track|behind|at risk)\b/i },
];

const readable = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('h4, p, a, span')].map((el) => el.textContent ?? '').filter(Boolean);

describe('each state says its fact in everyday words', () => {
  it.each(STATES)('%s', (_name, forecast) => {
    const { container } = render(<MilestoneRow milestone={milestone(forecast)} today={TODAY} />);
    const texts = readable(container);
    expect(unexplainedTerms(texts.join('. '))).toEqual([]);
    for (const { word, pattern } of NEVER_ON_SCREEN) expect(texts.filter((t) => pattern.test(t)), word).toEqual([]);
    expect(container.querySelector('.home-forecast')).not.toBeNull();
  });

  it('the checks themselves know the words a forecast could be tempted by', () => {
    const terms = INTERNAL_TERMS.map((t) => t.term);
    for (const t of ['capacity', 'slot', 'day type', 'target', 'milestone']) expect(terms).toContain(t);
    expect(unexplainedTerms("What's your capacity for this?")).toHaveLength(1);
  });
});

describe('what each verdict says', () => {
  const text = (forecast: ForecastView) => {
    const line = forecastLine(forecast, TODAY);
    return [line.chip?.label, line.text, line.could].filter(Boolean).join(' | ');
  };

  it('enough time, and enough so far when the days to come are not planned', () => {
    expect(forecastLine({ state: 'fits', soFar: false }, TODAY).text).toBe("The days you've set aside look like enough for what's left.");
    expect(forecastLine({ state: 'fits', soFar: true }, TODAY).text).toBe("The days you've set aside so far look like enough for what's left.");
  });

  it('close, and short with the ways forward', () => {
    expect(forecastLine({ state: 'tight' }, TODAY).text).toBe("The days you've set aside are close to what's left.");
    const movable = forecastLine({ state: 'does_not_fit', options: ['more_time', 'smaller_scope', 'move_date', 'accept_risk'] }, TODAY);
    expect(movable.text).toBe("The days you've set aside look short for what's left.");
    expect(movable.could).toBe("You could add more days, make what's left smaller, move the date or keep going as it is.");
    const fixed = forecastLine({ state: 'does_not_fit', options: ['more_time', 'smaller_scope', 'accept_risk'] }, TODAY);
    expect(fixed.could).toBe("You could add more days, make what's left smaller or keep going as it is.");
    expect(fixed.could).not.toMatch(/move the date/);
  });

  it('planned so far: the days set aside and how far the plan goes, with no tight or short claim', () => {
    expect(forecastLine({ state: 'planned_so_far', days: 4, through: '2026-11-03' }, TODAY).text).toBe("You've set aside 4 days through Tue, Nov 3. Plan more days as you go.");
    expect(forecastLine({ state: 'planned_so_far', days: 1, through: '2026-11-03' }, TODAY).text).toContain("You've set aside 1 day through");
    const said = text({ state: 'planned_so_far', days: 4, through: '2026-11-03' });
    expect(said).not.toMatch(/short|close|enough|tight|fit/i);
    expect(forecastLine({ state: 'planned_so_far', days: 4, through: '2026-11-03' }, TODAY).chip).toBeNull();
  });

  it('asks for what is missing and says nothing about whether it fits', () => {
    expect(text({ state: 'nothing_set_aside' })).toBe("You haven't set aside any days for this yet.");
    expect(text({ state: 'day_without_kind', date: '2026-10-30' })).toContain('Say what kind of day Fri, Oct 30 is');
    expect(text({ state: 'kind_without_time', date: '2026-10-30', kindName: 'Rest day', kindId: 'k1' })).toContain('"Rest day" has no usual amount of time yet');
    for (const missing of [{ state: 'nothing_set_aside' }, { state: 'day_without_kind', date: '2026-10-30' }, { state: 'counted_in_sessions' }, { state: 'not_enough_data' }] as ForecastView[]) {
      expect(text(missing)).not.toMatch(/look like enough|close to|look short/i);
    }
  });

  it('uses the person’s own kind of day name, kept as written', () => {
    expect(forecastLine({ state: 'kind_without_time', date: '2026-10-30', kindName: 'Gym + study', kindId: 'k2' }, TODAY).text).toContain('"Gym + study"');
  });
});

describe('where it sits and where it leads', () => {
  it('a deadline task shows it under its steps count, and a milestone shows none', () => {
    const { container, rerender } = render(<MilestoneRow milestone={milestone({ state: 'fits', soFar: false })} today={TODAY} />);
    expect(screen.getByText("The days you've set aside look like enough for what's left.")).toBeTruthy();
    expect(container.querySelector('.home-count + .home-forecast')).not.toBeNull();
    rerender(<MilestoneRow milestone={milestone(null, { kind: 'milestone' })} today={TODAY} />);
    expect(container.querySelector('.home-forecast')).toBeNull();
  });

  it('leads into the week plan only where the plan is the answer', () => {
    const linkOf = (forecast: ForecastView) => {
      const { container, unmount } = render(<MilestoneRow milestone={milestone(forecast)} today={TODAY} />);
      const link = container.querySelector('.home-forecast a');
      const out = link ? { label: link.textContent, href: link.getAttribute('href') } : null;
      unmount();
      return out;
    };
    expect(linkOf({ state: 'planned_so_far', days: 4, through: '2026-11-03' })).toEqual({ label: 'Plan more days', href: '/plan' });
    expect(linkOf({ state: 'does_not_fit', options: ['more_time', 'accept_risk'] })).toEqual({ label: 'Plan more days', href: '/plan' });
    expect(linkOf({ state: 'nothing_set_aside' })).toEqual({ label: 'Plan your week', href: '/plan' });
    expect(linkOf({ state: 'day_without_kind', date: '2026-10-30' })).toEqual({ label: 'Say what kind of day', href: '/plan' });
    expect(linkOf({ state: 'fits', soFar: false })).toBeNull();
    expect(linkOf({ state: 'past_due' })).toBeNull();
    expect(linkOf({ state: 'counted_in_sessions' })).toBeNull();
  });

  it('a deadline-only person sees it in their deadlines card, without the steps list', () => {
    const hero = { kind: 'deadlines' as const, items: [milestone({ state: 'tight' })] };
    const { container } = render(<HomeHeroCard hero={hero} celebration="low_key" today={TODAY} />);
    expect(screen.getByText("The days you've set aside are close to what's left.")).toBeTruthy();
    expect(container.querySelector('.home-steps')).toBeNull();
  });
});
