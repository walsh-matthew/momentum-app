// @vitest-environment jsdom
//
// MOM-111, the quick-path card's controls and its wide list, after the owner's rework. A control sits in its amber callout under its
// plain question, and the person sets it there. What these hold the code to:
// 1. The time zone is picked from a searchable list by city, with the IANA name as small secondary text; the device's zone is one
//    button in plain words ("Los Angeles time"), and counts as a suggestion the person took.
// 2. The week start is a compact grid of seven buttons (four, then three), each its short name on screen and its full name to a
//    screen reader; nothing is stacked in seven rows.
// 3. A box has no button until there is something new in it, and then it is "Set" (or the step's own "Next"); never a dimmed one.
// 4. The only suggestions are the device's time zone and today for a start date; the floor, day end, week start, unit and source
//    have none.
// 5. A wide screen shows every step in one list, each question in place under what it is about, and Save my setup only at the end.
// 6. On the screen, answering goes to the server, the card shows what is left, a refused value changes nothing and says so, and
//    Save my setup saves through the same quick-path save.
// The server actions are stubs: no Claude call, no network.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickPathCard } from '@/components/setup/QuickPathCard';
import { SetupConversation } from '@/components/setup/SetupConversation';
import { runSetupEval } from '@/lib/setup/evals';
import { QUICK_PATH_WORDS } from '@/lib/setup/quickPath';
import { setupStorageKey } from '@/lib/setup/session';
import type { AssistantTurn, SetupSession } from '@/types/setup';
import type { FillInItem, QuickPathState, QuickStep, RecapSection, SetupTurnView } from '@/types/setupScreen';
import { SETUP_CASES } from './setup-evals/cases';
import { WEEKDAY_CHOICES, item, quickProps, section, step, type CardProps } from './helpers/quickPath';
import { scriptedModel } from './helpers/setupScript';

const USER = '11111111-1111-4111-8111-111111111111';
const KEY = setupStorageKey(USER);
const actions = vi.hoisted(() => ({ ask: vi.fn(), save: vi.fn(), fill: vi.fn() }));
vi.mock('@/app/actions/setup', () => ({ askSetupTurn: actions.ask, saveSetup: actions.save, fillQuickPathItemAction: actions.fill }));

const ZONE = item('person.timeZone', 'Which time zone are you in?', 'timeZone', { suggestion: 'device_time_zone' });
const DAY_END = item('person.dayEnd', 'What time do you check in each day?', 'time', { hint: "If you're often up past midnight, pick when your day really ends, like 2:00 AM. Late entries then count toward the day before." });
const WEEK_START = item('person.weekStart', 'Which day does your week start on?', 'weekday', { choices: WEEKDAY_CHOICES });
const FLOOR = item('goals.g.targets.t.floor', 'In a hard week, how many workouts would still count?', 'number');
const UNIT = item('goals.g.targets.t.unit', 'What unit do you count pages in?', 'text');
const START = item('goals.g.startDate', 'When do you want to start this goal?', 'date', { suggestion: 'today' });
const DUE = item('goals.g.items.sew.dueDate', 'What date is this due?', 'date');
const SHAPE = item('goals.g.shape', 'Does this goal keep going, end on a date, or have a deadline?', 'choice', {
  choices: [
    { value: 'ongoing', label: 'It keeps going' },
    { value: 'finite', label: 'It ends on a date' },
  ],
});
const MOVE = item('goals.g.items.sew.dateCanMove', 'Can that date move?', 'yesNo', {
  choices: [
    { value: 'yes', label: 'Yes, it can move' },
    { value: 'no', label: "No, it can't move" },
  ],
});

const days = (...items: FillInItem[]) => step('days', 'Your days', items);
const card = (items: FillInItem[], over: Partial<CardProps> = {}) => {
  const onFill = vi.fn(async () => null);
  const view = render(<QuickPathCard {...quickProps({ steps: [days(...items)], sections: [section('days', 'Your days')], deviceZone: 'America/Los_Angeles', today: '2026-10-30', onFill, ...over })} />);
  return { ...view, onFill };
};
const group = (i: FillInItem): HTMLElement => document.querySelector(`[data-fill-in="${i.id}"]`) as HTMLElement;
const field = (i: FillInItem) => document.querySelector(`input[aria-label="${i.line}"]`) as HTMLInputElement;
// An all-answered card is the ready screen; Back goes to its last step, where the answers are, chosen.
const back = () => fireEvent.click(screen.getByRole('button', { name: QUICK_PATH_WORDS.back }));
const buttons = () => [...document.querySelectorAll('button')] as HTMLButtonElement[];

beforeEach(() => {
  actions.ask.mockReset();
  actions.save.mockReset();
  actions.fill.mockReset();
  window.sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the time zone', () => {
  it("offers the device's zone as one button, in plain words, and a taken suggestion counts as accepted", () => {
    const { onFill } = card([ZONE]);
    const button = within(group(ZONE)).getByRole('button', { name: "Use this device's time zone: Los Angeles time" });
    expect(within(group(ZONE)).queryByText(/America\/Los_Angeles/)).toBeNull();
    fireEvent.click(button);
    expect(onFill).toHaveBeenCalledWith(ZONE, 'America/Los_Angeles', 'accepted');
  });

  it('is picked from a searchable list by city, with the IANA name as small secondary text, and counts as said', () => {
    const { onFill } = card([ZONE]);
    const search = screen.getByRole('searchbox', { name: QUICK_PATH_WORDS.searchZones });
    expect(screen.queryByRole('list', { name: 'Matching time zones' })).toBeNull();
    fireEvent.change(search, { target: { value: 'new york' } });
    const list = screen.getByRole('list', { name: 'Matching time zones' });
    const first = within(list).getAllByRole('button')[0];
    expect(first.textContent).toBe('New YorkAmerica/New_York');
    // The city is the name; the IANA name is small and muted under it.
    const [city, name] = [...first.querySelectorAll('span > span')];
    expect(city.textContent).toBe('New York');
    expect(name.textContent).toBe('America/New_York');
    expect(name.className).toMatch(/text-sm/);
    expect(name.className).toMatch(/text-muted/);
    fireEvent.click(first);
    expect(onFill).toHaveBeenCalledWith(ZONE, 'America/New_York', 'said');
  });

  it('can be searched by the IANA name too, and says so when nothing matches', () => {
    card([ZONE]);
    const search = screen.getByRole('searchbox', { name: QUICK_PATH_WORDS.searchZones });
    fireEvent.change(search, { target: { value: 'Europe/Lon' } });
    expect(within(screen.getByRole('list', { name: 'Matching time zones' })).getAllByRole('button').map((b) => b.textContent)).toContain('LondonEurope/London');
    fireEvent.change(search, { target: { value: 'zzzzqq' } });
    expect(screen.getByText(QUICK_PATH_WORDS.noZones)).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Matching time zones' })).toBeNull();
  });

  it('shows the chosen zone, in plain words, as selected', () => {
    card([{ ...ZONE, answered: true, answer: 'America/Los_Angeles' }]);
    back();
    expect(screen.getByText('Selected: Los Angeles time')).toBeTruthy();
    expect(screen.getByRole('button', { name: "Use this device's time zone: Los Angeles time" }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('the week start', () => {
  it('is a compact grid of seven buttons, four then three, each its short name on screen and its full name to a screen reader', () => {
    const { onFill } = card([WEEK_START]);
    const grid = group(WEEK_START).querySelector('.grid') as HTMLElement;
    expect(grid.className).toContain('grid-cols-4');
    const days7 = within(grid).getAllByRole('button');
    expect(days7).toHaveLength(7);
    expect(days7.map((b) => b.textContent)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(days7.map((b) => b.getAttribute('aria-label'))).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
    // Not seven stacked rows: the buttons are in a grid, not in a column.
    expect(group(WEEK_START).querySelector('.flex-col')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sunday' }));
    expect(onFill).toHaveBeenCalledWith(WEEK_START, '7', 'said');
  });

  it('gives each cell the compact padding, so the check and the short name both fit in a cell of a phone\'s grid', () => {
    card([{ ...WEEK_START, answered: true, answer: '1' }]);
    back();
    for (const b of within(group(WEEK_START)).getAllByRole('button')) {
      expect(b.className, b.getAttribute('aria-label') ?? '').toMatch(/\bpx-1\b/);
      expect(b.className, b.getAttribute('aria-label') ?? '').toMatch(/\bjustify-center\b/);
      // The full padding of an ordinary choice would clip the name beside a check.
      expect(b.className, b.getAttribute('aria-label') ?? '').not.toMatch(/\bpx-4\b/);
    }
    const monday = screen.getByRole('button', { name: 'Monday' });
    expect(monday.textContent).toBe('Mon');
    expect(monday.querySelector('[data-slot="choice-check"]')).not.toBeNull();
  });

  it('shows the answer given as chosen', () => {
    card([{ ...WEEK_START, answered: true, answer: '3' }]);
    back();
    expect(screen.getByRole('button', { name: 'Wednesday' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Thursday' }).getAttribute('aria-pressed')).toBe('false');
  });
});

describe('a chosen answer cannot be mistaken for the others', () => {
  // The choices a person makes on the card, each with one answer chosen, as they are when they come back to them.
  const chosen = (): FillInItem[] => [
    { ...SHAPE, answered: true, answer: 'ongoing' },
    { ...MOVE, answered: true, answer: 'no' },
    { ...WEEK_START, answered: true, answer: '3' },
    { ...ZONE, answered: true, answer: 'America/Los_Angeles' },
    { ...START, answered: true, answer: '2026-10-30' },
  ];
  const isChosen = (b: Element) => b.getAttribute('aria-pressed') === 'true';

  it('marks the chosen button with aria-pressed, and every other choice with aria-pressed false, in every kind of choice', () => {
    card(chosen());
    back();
    for (const [i, name] of [[SHAPE, 'It keeps going'], [MOVE, "No, it can't move"], [WEEK_START, 'Wednesday'], [ZONE, /Los Angeles time/], [START, /^Use today/]] as const) {
      const g = within(group(i));
      expect(g.getByRole('button', { name }).getAttribute('aria-pressed'), i.id).toBe('true');
      const others = g.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') !== null && !isChosen(b));
      for (const b of others) expect(b.getAttribute('aria-pressed'), `${i.id}: ${b.textContent}`).toBe('false');
    }
    // One answer is chosen in a group, never two.
    for (const i of [SHAPE, MOVE, WEEK_START]) expect(within(group(i)).getAllByRole('button').filter(isChosen), i.id).toHaveLength(1);
  });

  it('gives the chosen button a check mark and the accent fill, and the others the card\'s own colour with a border', () => {
    card(chosen());
    back();
    const buttonsOf = (i: FillInItem) => within(group(i)).getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') !== null);
    for (const i of [SHAPE, MOVE, WEEK_START]) {
      const [on, off] = [buttonsOf(i).filter(isChosen), buttonsOf(i).filter((b) => !isChosen(b))];
      for (const b of on) {
        expect(b.className, `${i.id} chosen`).toMatch(/\bbg-primary\b/);
        expect(b.className, `${i.id} chosen`).toMatch(/\btext-primary-foreground\b/);
        expect(b.querySelector('[data-slot="choice-check"]'), `${i.id} chosen`).not.toBeNull();
        expect(b.getAttribute('data-selected')).toBe('true');
      }
      for (const b of off) {
        // Plain: the unchosen look every choice has since MOM-145 (no fill, the accent border), the ordinary text colour, and no check.
        expect(b.className, `${i.id} ${b.textContent}`).toMatch(/\banswer-choice\b/);
        expect(b.className, `${i.id} ${b.textContent}`).toMatch(/\btext-foreground\b/);
        expect(b.className, `${i.id} ${b.textContent}`).not.toMatch(/\bctl-45\b|\bbg-primary\b/);
        expect(b.querySelector('[data-slot="choice-check"]'), `${i.id} ${b.textContent}`).toBeNull();
        expect(b.getAttribute('data-selected')).toBe('false');
      }
    }
  });

  it('shows the time zone and today the same way: the one taken is filled and checked, and the list names it', () => {
    card([{ ...ZONE, answered: true, answer: 'America/Los_Angeles' }, { ...START, answered: true, answer: '2026-10-30' }]);
    back();
    const device = within(group(ZONE)).getByRole('button', { name: /Los Angeles time/ });
    expect(device.getAttribute('aria-pressed')).toBe('true');
    expect(device.querySelector('[data-slot="choice-check"]')).not.toBeNull();
    const today = within(group(START)).getByRole('button', { name: /^Use today/ });
    expect(today.getAttribute('aria-pressed')).toBe('true');
    // Another day, and the suggestion is no longer the chosen one.
    cleanup();
    card([{ ...START, answered: true, answer: '2026-11-02' }]);
    back();
    const other = within(group(START)).getByRole('button', { name: /^Use today/ });
    expect(other.getAttribute('aria-pressed')).toBe('false');
    expect(other.querySelector('[data-slot="choice-check"]')).toBeNull();
  });

  it('a zone chosen from the list is the filled one there, and its small print stays readable on the fill', () => {
    card([{ ...ZONE, answered: true, answer: 'America/Adak' }]);
    back();
    fireEvent.change(screen.getByRole('searchbox', { name: QUICK_PATH_WORDS.searchZones }), { target: { value: 'america' } });
    const list = within(screen.getByRole('list', { name: 'Matching time zones' }));
    const on = list.getAllByRole('button').find(isChosen) as HTMLElement;
    expect(on.textContent).toBe('AdakAmerica/Adak');
    // The IANA name takes the button's own text colour on the fill: muted grey would not read there.
    const small = on.querySelector('span.text-sm') as HTMLElement;
    expect(small.textContent).toBe('America/Adak');
    expect(small.className).not.toMatch(/text-muted/);
    // A choice that is not chosen keeps its small print muted.
    const offSmall = (list.getAllByRole('button').find((b) => !isChosen(b)) as HTMLElement).querySelector('span.text-sm') as HTMLElement;
    expect(offSmall.className).toMatch(/text-muted/);
  });

  it('before any answer every choice is plain: nothing looks chosen', () => {
    card([SHAPE, WEEK_START]);
    for (const b of document.querySelectorAll('[data-slot="answer-choice"]')) {
      expect(b.getAttribute('aria-pressed')).toBe('false');
      expect(b.querySelector('[data-slot="choice-check"]')).toBeNull();
      expect((b as HTMLElement).className).not.toMatch(/\bbg-primary\b/);
    }
  });
});

describe('a box, and the button it earns', () => {
  it('has no button until there is something new in it, then "Set"; a time, a number and a few words alike', () => {
    const { onFill } = card([DAY_END, FLOOR, UNIT]);
    for (const [i, value] of [[DAY_END, '21:00'], [FLOOR, '3'], [UNIT, 'pages']] as const) {
      const g = within(group(i));
      expect(g.queryByRole('button', { name: QUICK_PATH_WORDS.setItem }), i.id).toBeNull();
      fireEvent.change(field(i), { target: { value } });
      fireEvent.click(g.getByRole('button', { name: QUICK_PATH_WORDS.setItem }));
      expect(onFill).toHaveBeenLastCalledWith(i, value, 'said');
    }
    expect(buttons().filter((b) => b.disabled)).toEqual([]);
  });

  it('holds an answer already given, and offers a button again only when it is changed', () => {
    card([{ ...DAY_END, answered: true, answer: '21:00' }]);
    back();
    expect(field(DAY_END).value).toBe('21:00');
    expect(within(group(DAY_END)).queryByRole('button', { name: QUICK_PATH_WORDS.setItem })).toBeNull();
    fireEvent.change(field(DAY_END), { target: { value: '22:30' } });
    expect(within(group(DAY_END)).getByRole('button', { name: QUICK_PATH_WORDS.setItem })).toBeTruthy();
    fireEvent.change(field(DAY_END), { target: { value: '21:00' } });
    expect(within(group(DAY_END)).queryByRole('button', { name: QUICK_PATH_WORDS.setItem })).toBeNull();
  });

  it('a date is a date field, and only a start date shows today as a button, which counts as accepted', () => {
    const { onFill } = card([START, DUE]);
    fireEvent.click(within(group(START)).getByRole('button', { name: 'Use today, Friday, Oct 30' }));
    expect(onFill).toHaveBeenLastCalledWith(START, '2026-10-30', 'accepted');
    expect(within(group(DUE)).queryByRole('button', { name: /use today/i })).toBeNull();
    for (const i of [START, DUE]) {
      fireEvent.change(field(i), { target: { value: '2026-11-02' } });
      fireEvent.click(within(group(i)).getByRole('button', { name: QUICK_PATH_WORDS.setItem }));
      expect(onFill).toHaveBeenLastCalledWith(i, '2026-11-02', 'said');
    }
  });

  it('a shape and a yes or no are buttons, each sending its value, and none is a suggestion', () => {
    const { onFill } = card([SHAPE, MOVE]);
    fireEvent.click(within(group(SHAPE)).getByRole('button', { name: 'It ends on a date' }));
    expect(onFill).toHaveBeenLastCalledWith(SHAPE, 'finite', 'said');
    fireEvent.click(within(group(MOVE)).getByRole('button', { name: "No, it can't move" }));
    expect(onFill).toHaveBeenLastCalledWith(MOVE, 'no', 'said');
    expect(within(group(SHAPE)).queryByRole('button', { name: /use this|today|suggest/i })).toBeNull();
  });

  it('offers no suggestion for the day end, week start, floor or unit; only the time zone and a start date have one', () => {
    card([ZONE, DAY_END, WEEK_START, FLOOR, UNIT, START]);
    for (const i of [DAY_END, WEEK_START, FLOOR, UNIT]) expect(within(group(i)).queryByRole('button', { name: /use this|use today|suggest/i }), i.id).toBeNull();
    expect(within(group(ZONE)).getByRole('button', { name: /^Use this device's time zone/ })).toBeTruthy();
    expect(within(group(START)).getByRole('button', { name: /^Use today/ })).toBeTruthy();
  });

  it('turns every control off while an answer is being set, and shows no dimmed button the rest of the time', () => {
    card([DAY_END, WEEK_START], { filling: true });
    for (const control of document.querySelectorAll('[data-fill-in] input, [data-fill-in] button')) expect((control as HTMLInputElement).disabled).toBe(true);
    cleanup();
    card([DAY_END, WEEK_START]);
    expect(buttons().filter((b) => b.disabled)).toEqual([]);
  });
});

describe('a wide screen shows every step in one list', () => {
  const wide = () =>
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} }));
  const sections = (): RecapSection[] => [
    {
      id: 'goal:g',
      title: 'Get stronger',
      lines: [
        { text: 'Get stronger starts Friday, Oct 30 and keeps going.', stepId: 'goal:g' },
        { text: "You'll count workouts each week.", stepId: 'target:g.t' },
      ],
      subjects: ['goal:g', 'target:g.t'],
      names: { 'goal:g': 'Get stronger', 'target:g.t': 'Workouts' },
    },
    section('days', 'Your days', ['You check in at 9:00 PM.']),
  ];
  const steps = (): QuickStep[] => [
    step('goal:g', 'Get stronger', [{ ...START, answered: true, answer: '2026-10-30' }, { ...SHAPE, answered: true, answer: 'ongoing' }]),
    step('target:g.t', 'Workouts', [FLOOR], 'goal:g'),
    step('days', 'Your days', [ZONE, { ...DAY_END, answered: true, answer: '21:00' }, WEEK_START]),
  ];

  it('puts each open question in place after what it is about, and has no step counter, no Back, and no Save yet', () => {
    wide();
    render(<QuickPathCard {...quickProps({ sections: sections(), steps: steps(), deviceZone: 'Europe/London', today: '2026-10-30' })} />);
    expect(screen.getByRole('heading', { name: QUICK_PATH_WORDS.topLine(2) })).toBeTruthy();
    expect(screen.queryByText(/\d of \d/)).toBeNull();
    expect(screen.queryByRole('button', { name: QUICK_PATH_WORDS.back })).toBeNull();
    expect(screen.queryByRole('button', { name: QUICK_PATH_WORDS.save })).toBeNull();
    // Only the open questions are callouts; what was answered is a line.
    const callouts = [...document.querySelectorAll('[data-slot="needs-answer"]')].map((c) => c.getAttribute('data-fill-in'));
    expect(callouts).toEqual([FLOOR.id, ZONE.id, WEEK_START.id]);
    // The floor's question follows the line about what is counted, in its own section; the days' questions follow what was said of them.
    const counted = screen.getByText("You'll count workouts each week.");
    expect(counted.compareDocumentPosition(group(FLOOR)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const checkIn = screen.getByText('You check in at 9:00 PM.');
    expect(checkIn.compareDocumentPosition(group(ZONE)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The reason is said once.
    expect(screen.getAllByText(QUICK_PATH_WORDS.reasonLimit)).toHaveLength(1);
    expect(buttons().filter((b) => b.disabled)).toEqual([]);
  });

  it('says every part once, and each goal and its title once', () => {
    wide();
    render(<QuickPathCard {...quickProps({ sections: sections(), steps: steps() })} />);
    expect(screen.getAllByRole('heading', { name: 'Get stronger' })).toHaveLength(1);
    expect(screen.getAllByText('You check in at 9:00 PM.')).toHaveLength(1);
    expect(screen.getAllByRole('heading', { name: 'Workouts' })).toHaveLength(1);
  });

  it('shows each goal and each thing it counts as a heading, the same as on a phone, not as small grey text', () => {
    wide();
    const { unmount } = render(<QuickPathCard {...quickProps({ sections: sections(), steps: steps() })} />);
    const classesOf = (name: string) => screen.getByRole('heading', { name }).className;
    for (const name of ['Get stronger', 'Workouts', 'Your days']) {
      expect(classesOf(name), name).toMatch(/text-base/);
      expect(classesOf(name), name).not.toMatch(/text-muted|text-sm/);
    }
    // The goal is the part's heading and the thing it counts sits under it, in the order a person reads them.
    const levels = ['Get stronger', 'Workouts', 'Your days'].map((name) => screen.getByRole('heading', { name }).tagName);
    expect(levels).toEqual(['H3', 'H4', 'H3']);
    unmount();

    // On a phone the same names are the step's heading, in the same type.
    vi.unstubAllGlobals();
    render(<QuickPathCard {...quickProps({ sections: sections(), steps: steps() })} />);
    expect(screen.getByRole('heading', { name: 'Workouts' }).className).toBe(classesOf('Workouts'));
  });

  it('names a thing it counts that has something said about it, a work item only when it has a question, and never repeats the goal', () => {
    wide();
    const withItems: RecapSection[] = [
      {
        id: 'goal:g',
        title: 'Make the quilt',
        lines: [
          { text: 'Habit: Walk.', stepId: 'item:g.walk' },
          { text: "You'll count blocks each week.", stepId: 'target:g.t' },
        ],
        subjects: ['goal:g', 'target:g.t', 'item:g.sew', 'item:g.walk'],
        names: { 'goal:g': 'Make the quilt', 'target:g.t': 'Blocks', 'item:g.sew': 'Sew the quilt', 'item:g.walk': 'Walk' },
      },
    ];
    const open = [step('item:g.sew', 'Sew the quilt', [DUE], 'goal:g')];
    render(<QuickPathCard {...quickProps({ sections: withItems, steps: open })} />);
    const headings = screen.getAllByRole('heading').map((h) => h.textContent);
    expect(headings).toContain('Blocks');
    expect(headings).toContain('Sew the quilt');
    // "Habit: Walk." already says its name, so it has no heading of its own.
    expect(headings).not.toContain('Walk');
    expect(headings.filter((h) => h === 'Make the quilt')).toHaveLength(1);
  });

  it('ends in Save my setup once nothing is open', () => {
    wide();
    const onSave = vi.fn();
    const done = steps().map((s) => ({ ...s, items: s.items.map((i) => ({ ...i, answered: true, answer: 'x' })) }));
    render(<QuickPathCard {...quickProps({ sections: sections(), steps: done, onSave })} />);
    expect(screen.getByRole('heading', { name: QUICK_PATH_WORDS.readyTop })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: QUICK_PATH_WORDS.save }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(QUICK_PATH_WORDS.reasonLimit)).toBeNull();
  });
});

describe('on the screen', () => {
  let script: AssistantTurn[];
  beforeAll(async () => {
    const c = SETUP_CASES.find((x) => x.expect === 'clean');
    if (!c) throw new Error('no clean case');
    await runSetupEval(c, scriptedModel(c.script));
    script = c.script;
  });

  const sections = (): RecapSection[] => [section('days', 'Your days', ['You check in at 9:00 PM.'])];
  const stateOf = (steps: QuickStep[], over: Partial<QuickPathState> = {}): QuickPathState => ({
    sections: sections(),
    steps,
    items: steps.flatMap((s) => s.items.filter((i) => !i.answered)),
    stuck: [],
    missing: [],
    canSave: steps.every((s) => s.items.every((i) => i.answered)),
    ...over,
  });
  const turnView = (turn: AssistantTurn): { ok: true; data: SetupTurnView } => ({ ok: true, data: { kind: 'turn', turn, spentTokens: 1000, rejected: 0 } });
  const limit = (state: QuickPathState): { ok: true; data: SetupTurnView } => ({ ok: true, data: { kind: 'quick_path', reason: 'over_turns', message: 'x', ...state } });

  async function toTheCard(state: QuickPathState) {
    actions.ask.mockResolvedValueOnce(turnView(script[0])).mockResolvedValueOnce(limit(state));
    render(<SetupConversation userId={USER} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start' }));
    await screen.findByRole('heading', { name: script[0].question ?? '' });
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'Run more' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByRole('heading', { name: QUICK_PATH_WORDS.topLine(state.steps.filter((s) => s.items.some((i) => !i.answered)).length) });
  }
  const stored = (): SetupSession => JSON.parse(window.sessionStorage.getItem(KEY) ?? 'null');

  it('answers a question, shows the ready screen, keeps the answer in this tab, and saves through the quick-path save', async () => {
    await toTheCard(stateOf([days({ ...DAY_END })]));
    const before = stored();
    const after: SetupSession = {
      ...before,
      transcript: [...before.transcript, { role: 'assistant', turn: { ...script[0], question: DAY_END.line } }, { role: 'person', text: '21:00' }],
    };
    actions.fill.mockResolvedValue({ ok: true, data: { session: after, ...stateOf([days({ ...DAY_END, answered: true, answer: '21:00' })]) } });

    fireEvent.change(field(DAY_END), { target: { value: '21:00' } });
    fireEvent.click(within(group(DAY_END)).getByRole('button', { name: QUICK_PATH_WORDS.setItem }));

    // The last step is answered: the card settles in one render, with Save my setup on it.
    const save = await screen.findByRole('button', { name: QUICK_PATH_WORDS.save });
    expect(screen.getByRole('heading', { name: QUICK_PATH_WORDS.readyTop })).toBeTruthy();
    expect(screen.queryByText(QUICK_PATH_WORDS.reasonLimit)).toBeNull();

    // The request carried the session as it stood, the item, the value and how, and no person.
    expect(actions.fill).toHaveBeenCalledTimes(1);
    const sent = actions.fill.mock.calls[0][0] as Record<string, unknown>;
    expect(sent.itemId).toBe('person.dayEnd');
    expect(sent.value).toBe('21:00');
    expect(sent.how).toBe('said');
    expect(sent.session).toEqual(before);
    expect(sent).not.toHaveProperty('userId');
    expect(stored()).toEqual(after);

    actions.save.mockResolvedValue({ ok: true, data: { goals: 1, targets: 1 } });
    fireEvent.click(save);
    await screen.findByRole('heading', { name: 'Your setup is saved' });
    expect(actions.save).toHaveBeenCalledWith(after, true);
  });

  it('a refused value says why, changes nothing, and leaves the controls ready', async () => {
    await toTheCard(stateOf([days({ ...DAY_END })]));
    const before = window.sessionStorage.getItem(KEY);
    actions.fill.mockResolvedValue({ ok: false, error: "That doesn't look right. Nothing was changed." });

    fireEvent.change(field(DAY_END), { target: { value: '21:00' } });
    fireEvent.click(within(group(DAY_END)).getByRole('button', { name: QUICK_PATH_WORDS.setItem }));

    expect(await screen.findByText("That doesn't look right. Nothing was changed.")).toBeTruthy();
    await waitFor(() => expect(field(DAY_END).disabled).toBe(false));
    expect(window.sessionStorage.getItem(KEY)).toBe(before);
    expect(screen.queryByRole('button', { name: QUICK_PATH_WORDS.save })).toBeNull();
    expect(buttons().filter((b) => b.disabled)).toEqual([]);
  });

  it('a request that never reached the server says so in plain words and changes nothing', async () => {
    await toTheCard(stateOf([days({ ...DAY_END })]));
    actions.fill.mockRejectedValue(new Error('offline'));
    fireEvent.change(field(DAY_END), { target: { value: '21:00' } });
    fireEvent.click(within(group(DAY_END)).getByRole('button', { name: QUICK_PATH_WORDS.setItem }));
    expect(await screen.findByText(QUICK_PATH_WORDS.fillFailed)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: QUICK_PATH_WORDS.readyTop })).toBeNull();
  });
});
