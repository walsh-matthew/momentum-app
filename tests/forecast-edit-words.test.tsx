// @vitest-environment jsdom
//
// The forecast's edit screens in everyday words (MOM-138, docs/DOMAIN_MODEL.md §2.1 plain language, as for the plan and the
// forecast itself). Two checks over everything a person can read, in every state each screen can be in:
// 1. the plain-words glossary from setup (lib/setup/plainWords.ts): an internal word may appear only with what it means in the
//    same sentence;
// 2. a stricter ban on the words the build uses internally: capacity, day type, slot, target, milestone, forecast, floor,
//    aspiration, priority, estimate, work item. The screens say "how big", "kind of day", "steps" and "due date", and the
//    person's own names for their kinds of days and their tasks.
// Readable text is the text, the button names, the labels and the placeholders, like the plan's own check.

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KindTimesScreen } from '@/components/forecast/KindTimesScreen';
import { TaskEditScreen } from '@/components/forecast/TaskEditScreen';
import * as wording from '@/components/forecast/wording';
import { MilestoneRow } from '@/components/home/MilestoneRow';
import { INTERNAL_TERMS, unexplainedTerms } from '@/lib/setup/plainWords';
import type { ForecastView, MilestoneView } from '@/types/home';
import type { DayKindTimeView, TaskEditView } from '@/types/forecastEdits';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock('@/app/actions/forecastEdits', () => ({
  changeKindTime: vi.fn(),
  changeTaskSize: vi.fn(),
  changeTaskDate: vi.fn(),
  addStep: vi.fn(),
  renameStep: vi.fn(),
  removeStep: vi.fn(),
}));
afterEach(cleanup);

const NEVER_ON_SCREEN: { word: string; pattern: RegExp }[] = [
  { word: 'capacity', pattern: /\bcapacity\b/i },
  { word: 'day type', pattern: /\bday[- ]types?\b/i },
  { word: 'slot', pattern: /\bslots?\b/i },
  { word: 'target', pattern: /\btargets?\b/i },
  { word: 'milestone', pattern: /\bmilestones?\b/i },
  { word: 'forecast', pattern: /\bforecast(s|ed)?\b/i },
  { word: 'floor', pattern: /\bfloors?\b/i },
  { word: 'aspiration', pattern: /\baspirations?\b/i },
  { word: 'priority', pattern: /\bpriorit(y|ies)\b/i },
  { word: 'estimate', pattern: /\bestimat(e|es|ed|ion)\b/i },
  { word: 'work item', pattern: /\bwork items?\b/i },
  { word: 'database', pattern: /\bdatabase\b/i },
  { word: 'a promise', pattern: /\b(guarantee|promise|on track|behind|at risk)\b/i },
];

function readable(container: HTMLElement): string[] {
  const attrs = [...container.querySelectorAll('[placeholder], [aria-label]')].flatMap((el) => [el.getAttribute('placeholder') ?? '', el.getAttribute('aria-label') ?? '']);
  const blocks = [...container.querySelectorAll('h1, h2, h3, h4, p, li, button, label, option, a, span')].map((el) => el.textContent ?? '');
  return [...blocks, ...attrs].filter(Boolean);
}

function expectPlain(container: HTMLElement) {
  const texts = readable(container);
  expect(texts.length).toBeGreaterThan(3);
  expect(unexplainedTerms(texts.join('. '))).toEqual([]);
  for (const { word, pattern } of NEVER_ON_SCREEN) expect(texts.filter((t) => pattern.test(t)), word).toEqual([]);
}

const task = (over: Partial<TaskEditView> = {}): TaskEditView => ({
  id: 't1',
  title: 'Send the application',
  goalTitle: 'Land the new role',
  today: '2026-11-01',
  dueOn: '2026-11-20',
  dateCanMove: true,
  estimateHours: 4,
  finished: false,
  steps: [
    { id: 's1', title: 'Write the letter', done: true },
    { id: 's2', title: 'Send it', done: false },
  ],
  ...over,
});

const kinds: DayKindTimeView[] = [
  { id: 'k1', name: 'Work day', unit: 'hours', amount: 3 },
  { id: 'k2', name: 'Rest day', unit: null, amount: null },
  { id: 'k3', name: 'Gym day', unit: 'sessions', amount: 1 },
  { id: 'k4', name: 'Short day', unit: 'hours', amount: 0 },
];

describe('the checks themselves', () => {
  it('flag the words these screens must not use', () => {
    for (const { word, pattern } of NEVER_ON_SCREEN.slice(0, 6)) expect(pattern.test(`The ${word} for the day`), word).toBe(true);
    expect(unexplainedTerms("Set the capacity for each day type.")).toHaveLength(2);
    expect(INTERNAL_TERMS.map((t) => t.term)).toContain('capacity');
  });
});

describe('the task screen says everything in everyday words, in every state', () => {
  const states: [string, TaskEditView][] = [
    ['the date can move', task()],
    ['the date cannot move', task({ dateCanMove: false })],
    ['no size yet', task({ estimateHours: null })],
    ['no steps yet', task({ steps: [] })],
    ['only ticked steps are left to show', task({ steps: [{ id: 's1', title: 'Write the letter', done: true }] })],
    ['finished', task({ finished: true })],
  ];
  it.each(states)('%s', (_name, view) => {
    const { container } = render(<TaskEditScreen task={view} />);
    if (view.finished) {
      // Only one line: it is still plain.
      expect(unexplainedTerms(readable(container).join('. '))).toEqual([]);
    } else expectPlain(container);
  });

  it('every callout is plain, and so is a step being renamed', () => {
    const { container, getByRole, getByLabelText } = render(<TaskEditScreen task={task({ estimateHours: null })} />);
    for (const name of ['Save size', 'Add step']) fireEvent.click(getByRole('button', { name }));
    fireEvent.change(getByLabelText('Move the date to'), { target: { value: '2026-10-30' } });
    fireEvent.click(getByRole('button', { name: 'Move date' }));
    fireEvent.click(getByRole('button', { name: 'Rename Send it' }));
    fireEvent.change(getByLabelText('Rename Send it'), { target: { value: '' } });
    fireEvent.click(getByRole('button', { name: 'Save name' }));
    expect(container.querySelectorAll('[data-slot="missing-callout"]').length).toBeGreaterThanOrEqual(3);
    expectPlain(container);
  });
});

describe('the kinds screen says everything in everyday words, in every state', () => {
  it('with kinds, whatever each has saved', () => {
    const { container } = render(<KindTimesScreen kinds={kinds} />);
    expectPlain(container);
  });

  it('with sessions chosen, and with every callout showing', () => {
    const { container, getAllByRole, getByRole } = render(<KindTimesScreen kinds={kinds} />);
    // Rest day has nothing saved: sessions chosen with no amount, then a tap on its own Save.
    fireEvent.click(getAllByRole('button', { name: 'Sessions' })[1]);
    fireEvent.click(getByRole('button', { name: 'Save time for “Rest day”' }));
    expect(container.querySelectorAll('[data-slot="missing-callout"]')).toHaveLength(1);
    expectPlain(container);
  });

  it('with no kinds yet', () => {
    const { container } = render(<KindTimesScreen kinds={[]} />);
    expect(unexplainedTerms(readable(container).join('. '))).toEqual([]);
    for (const { word, pattern } of NEVER_ON_SCREEN) expect(readable(container).filter((t) => pattern.test(t)), word).toEqual([]);
  });
});

describe('every fixed word in the module is plain', () => {
  it('has no internal word in any string it exports', () => {
    const strings = Object.values(wording as Record<string, unknown>).filter((v): v is string => typeof v === 'string');
    expect(strings.length).toBeGreaterThan(20);
    expect(unexplainedTerms(strings.join('. '))).toEqual([]);
    for (const { word, pattern } of NEVER_ON_SCREEN) expect(strings.filter((t) => pattern.test(t)), word).toEqual([]);
  });
});

describe("home's forecast lines, with the new links, stay in everyday words", () => {
  const states: ForecastView[] = [
    { state: 'kind_without_time', date: '2026-11-02', kindName: 'Rest day', kindId: 'k2' },
    { state: 'not_enough_data' },
    { state: 'does_not_fit', options: ['more_time', 'smaller_scope', 'move_date', 'accept_risk'] },
    { state: 'past_due' },
    { state: 'fits', soFar: false },
  ];
  it.each(states.map((s) => [s.state, s] as const))('%s', (_name, forecast) => {
    const milestone: MilestoneView = {
      id: 't1',
      goalId: 'g',
      goalTitle: 'Land the new role',
      title: 'Send the application',
      kind: 'deadline_task',
      dueOn: '2026-11-20',
      steps: [{ id: 's1', title: 'Send it', done: false }],
      stepsDone: 0,
      dateCanMove: true,
      forecast,
    };
    const { container } = render(<MilestoneRow milestone={milestone} today="2026-11-01" />);
    const texts = [...container.querySelectorAll('h4, p, a, span')].map((el) => el.textContent ?? '').filter(Boolean);
    expect(unexplainedTerms(texts.join('. '))).toEqual([]);
    for (const { word, pattern } of NEVER_ON_SCREEN) expect(texts.filter((t) => pattern.test(t)), word).toEqual([]);
  });
});
