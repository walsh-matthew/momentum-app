// @vitest-environment jsdom
//
// MOM-111, the quick-path card (shown when setup stops using Claude), after the owner's rework. The card is one list: each part
// shows what was said, a missing item sits in place as an amber "Needs your answer" callout with its plain question and its control,
// and nothing is said twice. These hold the card to the owner's screen checklist:
// 1. Needed first: what has to be answered is the card's work; the top line says how many quick steps are left.
// 2. No repeated text: a goal, a line, a question or the reason is said once.
// 3. A missing item is a callout with a plain question.
// 4. No dimmed primary button: a button that cannot be used is not shown. The last step's button is "Save my setup".
// 5. No empty part: a section with nothing in it is not shown.
// 6. The words match what was asked: each control is named by its question.
// Plus: the reason shows once, only while questions are left; Start again is a small link that asks first; lists are real lists;
// and the sentence "your answers stay in this tab" is proven. The server actions are stubs: no Claude call, no network.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaybackCard } from '@/components/setup/PlaybackCard';
import { groupLines } from '@/components/setup/PlaybackLines';
import { QuickPathCard } from '@/components/setup/QuickPathCard';
import { SetupConversation } from '@/components/setup/SetupConversation';
import { runSetupEval } from '@/lib/setup/evals';
import { QUICK_PATH_WORDS, quickPathCanWait, quickPathReason } from '@/lib/setup/quickPath';
import { setupStorageKey } from '@/lib/setup/session';
import type { AssistantTurn, SetupSession } from '@/types/setup';
import type { QuickPathReason, QuickPathState, QuickStep, SetupTurnView } from '@/types/setupScreen';
import { SETUP_CASES } from './setup-evals/cases';
import { WEEKDAY_CHOICES, item, quickProps, section, step, type CardProps } from './helpers/quickPath';
import { scriptedModel } from './helpers/setupScript';

const USER = '11111111-1111-4111-8111-111111111111';
const KEY = setupStorageKey(USER);
const actions = vi.hoisted(() => ({ ask: vi.fn(), save: vi.fn(), fill: vi.fn() }));
vi.mock('@/app/actions/setup', () => ({ askSetupTurn: actions.ask, saveSetup: actions.save, fillQuickPathItemAction: actions.fill }));

const REASONS: QuickPathReason[] = ['over_turns', 'over_tokens', 'shared_cap', 'person_cap', 'unchecked'];

// The owner's example: one goal, one thing counted, and the days. Steps: the goal (when it starts and how long it runs), the
// thing counted (the least that would count, and where it is tracked), and the days.
const START = item('goals.g1.startDate', 'When do you want to start this goal?', 'date', { suggestion: 'today' });
const SHAPE = item('goals.g1.shape', 'Does this goal keep going, end on a date, or have a deadline?', 'choice', {
  choices: [
    { value: 'ongoing', label: 'It keeps going' },
    { value: 'finite', label: 'It ends on a date' },
    { value: 'project', label: 'It has a deadline' },
  ],
});
const FLOOR = item('goals.g1.targets.t1.floor', 'In a hard week, how many workouts would still count?', 'number');
const SOURCE = item('goals.g1.targets.t1.sources', 'Where do you track workouts?', 'choice', {
  choices: [
    { value: 'manual', label: "I'll log it myself" },
    { value: 'hevy', label: 'Hevy' },
  ],
});
const ZONE = item('person.timeZone', 'Which time zone are you in?', 'timeZone', { suggestion: 'device_time_zone' });
const DAY_END = item('person.dayEnd', 'What time do you check in each day?', 'time', { hint: "If you're often up past midnight, pick when your day really ends, like 2:00 AM. Late entries then count toward the day before." });
const WEEK_START = item('person.weekStart', 'Which day does your week start on?', 'weekday', { choices: WEEKDAY_CHOICES });

const STEPS = (): QuickStep[] => [
  step('goal:g1', 'Get stronger', [START, SHAPE], 'goal:g1'),
  step('target:g1.t1', 'Workouts', [FLOOR, SOURCE], 'goal:g1'),
  step('days', 'Your days', [ZONE, DAY_END, WEEK_START]),
];
const SECTIONS = () => [
  {
    id: 'goal:g1',
    title: 'Get stronger',
    lines: [{ text: "You'll count workouts each week.", stepId: 'target:g1.t1' }],
    subjects: ['goal:g1', 'target:g1.t1'],
    names: { 'goal:g1': 'Get stronger', 'target:g1.t1': 'Workouts' },
  },
  section('days', 'Your days'),
];

const card = (over: Partial<CardProps> = {}) => render(<QuickPathCard {...quickProps({ sections: SECTIONS(), steps: STEPS(), ...over })} />);
const buttons = () => [...document.querySelectorAll('button')] as HTMLButtonElement[];
const text = () => document.body.textContent ?? '';

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

describe('the top of the card, and the reason, once', () => {
  it('says how many quick steps are left, and which one this is', () => {
    card();
    expect(screen.getByRole('heading', { name: 'Almost done: 3 quick steps and your setup is saved' })).toBeTruthy();
    expect(screen.getByText('1 of 3')).toBeTruthy();
  });

  it('counts steps, not answers: "Your days" holds three answers and is one step', () => {
    card({ steps: [step('days', 'Your days', [ZONE, DAY_END, WEEK_START])] });
    expect(screen.getByRole('heading', { name: 'Almost done: 1 quick step and your setup is saved' })).toBeTruthy();
    expect(screen.getByText('1 of 1')).toBeTruthy();
  });

  it.each(REASONS)('%s: says why setup stopped, once, in the words for that reason', (reason) => {
    card({ reason });
    const line = quickPathCanWait(reason) ? QUICK_PATH_WORDS.reasonWait : QUICK_PATH_WORDS.reasonLimit;
    expect(quickPathReason(reason)).toBe(line);
    expect(screen.getAllByText(line)).toHaveLength(1);
    expect(line).toContain('Everything you said is kept, and these last answers finish it.');
  });

  it('only a limit that lifts on its own is not called a question limit', () => {
    expect(QUICK_PATH_WORDS.reasonLimit).toBe('Claude has hit its question limit for this setup. Everything you said is kept, and these last answers finish it.');
    expect(QUICK_PATH_WORDS.reasonWait).toBe("Claude can't take more questions right now. Everything you said is kept, and these last answers finish it.");
    for (const r of ['over_turns', 'over_tokens'] as const) expect(quickPathCanWait(r), r).toBe(false);
    for (const r of ['shared_cap', 'person_cap', 'unchecked'] as const) expect(quickPathCanWait(r), r).toBe(true);
  });

  it('shows no reason on the ready screen, where nothing is left to answer', () => {
    card({ steps: [], sections: [section('goal:g1', 'Get stronger', ['Get stronger starts today and keeps going.'])] });
    expect(screen.getByRole('heading', { name: QUICK_PATH_WORDS.readyTop })).toBeTruthy();
    for (const reason of [QUICK_PATH_WORDS.reasonLimit, QUICK_PATH_WORDS.reasonWait]) expect(screen.queryByText(reason)).toBeNull();
  });

  it('keeps the one bold line: only the top line is heavy', () => {
    const { container } = card();
    const heavy = [...container.querySelectorAll('*')].filter((el) => /\b(font-(medium|semibold|bold)|section-title)\b/.test(el.getAttribute('class') ?? ''));
    expect(heavy.map((el) => el.textContent)).toEqual(['Almost done: 3 quick steps and your setup is saved']);
  });
});

describe('the empty state: step 1, a question in place, nothing dimmed', () => {
  it('shows the step, what it is about, and each open question as a "Needs your answer" callout with its plain question', () => {
    card();
    expect(screen.getByRole('heading', { name: 'Get stronger' })).toBeTruthy();
    const callouts = [...document.querySelectorAll('[data-slot="needs-answer"]')];
    expect(callouts.map((c) => c.getAttribute('data-fill-in'))).toEqual([START.id, SHAPE.id]);
    for (const c of callouts) {
      expect(c.getAttribute('data-state')).toBe('missing');
      expect(c.textContent).toContain(QUICK_PATH_WORDS.needsAnswer);
    }
    expect(screen.getByText(START.line)).toBeTruthy();
    expect(screen.getByText(SHAPE.line)).toBeTruthy();
    // The question is a plain one, not a list entry about what is not set.
    expect(text()).not.toMatch(/isn't set yet|not set yet|Still needed|A start date for/);
  });

  it('has no Back (it is the first step), no confirmation line, and no Save yet', () => {
    card();
    expect(screen.queryByRole('button', { name: QUICK_PATH_WORDS.back })).toBeNull();
    expect(text()).not.toContain('✓');
    expect(screen.queryByRole('button', { name: QUICK_PATH_WORDS.save })).toBeNull();
    expect(screen.queryByRole('button', { name: QUICK_PATH_WORDS.next })).toBeNull();
  });

  it('has no dimmed button anywhere: a button that cannot be used is not shown', () => {
    card();
    expect(buttons().filter((b) => b.disabled)).toEqual([]);
    expect(buttons().filter((b) => b.getAttribute('aria-disabled') === 'true')).toEqual([]);
  });

  it('names each control by its question, so the words match what was asked', () => {
    card({ steps: [step('days', 'Your days', [DAY_END, ZONE])] });
    const group = document.querySelector(`[data-fill-in="${DAY_END.id}"]`) as HTMLElement;
    expect(group.getAttribute('aria-labelledby')).toBeTruthy();
    expect(document.getElementById(group.getAttribute('aria-labelledby') ?? '')?.textContent).toBe(DAY_END.line);
    expect(document.querySelector(`input[aria-label="${DAY_END.line}"]`)).not.toBeNull();
    expect(screen.getByText(DAY_END.hint ?? '')).toBeTruthy();
  });

  it('says nothing twice: not the goal, not a line, not a question', () => {
    const lines = [
      { text: 'Get stronger starts today and keeps going.', stepId: 'goal:g1' },
      { text: "You'll count workouts each week.", stepId: 'target:g1.t1' },
    ];
    card({ sections: [{ id: 'goal:g1', title: 'Get stronger', lines, subjects: ['goal:g1', 'target:g1.t1'], names: { 'goal:g1': 'Get stronger', 'target:g1.t1': 'Workouts' } }, section('days', 'Your days')] });
    for (const phrase of ['Get stronger', START.line, SHAPE.line]) expect(text().split(phrase).length - 1, phrase).toBe(phrase === 'Get stronger' ? 2 : 1);
    // "Get stronger" is the step's name and, once, in the line that says it starts today: never a repeated heading or a goal list.
    expect(screen.getAllByRole('heading', { name: 'Get stronger' })).toHaveLength(1);
  });
});

describe('one step on, and back', () => {
  const answeredFirst = (): QuickStep[] => {
    const steps = STEPS();
    steps[0] = step('goal:g1', 'Get stronger', [{ ...START, answered: true, answer: '2026-10-30' }, { ...SHAPE, answered: true, answer: 'ongoing' }], 'goal:g1');
    return steps;
  };
  const sections = () => [
    {
      id: 'goal:g1',
      title: 'Get stronger',
      lines: [
        { text: 'Get stronger starts today and keeps going.', stepId: 'goal:g1' },
        { text: "You'll count workouts each week.", stepId: 'target:g1.t1' },
      ],
      subjects: ['goal:g1', 'target:g1.t1'],
    names: { 'goal:g1': 'Get stronger', 'target:g1.t1': 'Workouts' },
    },
    section('days', 'Your days'),
  ];

  it('shows the step before it as one small line above the step, not under its heading', () => {
    card({ steps: answeredFirst(), sections: sections() });
    expect(screen.getByRole('heading', { name: 'Almost done: 2 quick steps and your setup is saved' })).toBeTruthy();
    expect(screen.getByText('2 of 3')).toBeTruthy();
    const confirmation = screen.getByText('✓ Get stronger starts today and keeps going.');
    const heading = screen.getByRole('heading', { name: 'Workouts' });
    // Above the step's heading in the page, and not inside it.
    expect(confirmation.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(heading.textContent).not.toContain('✓');
    // The reason is still said once.
    expect(screen.getAllByText(QUICK_PATH_WORDS.reasonLimit)).toHaveLength(1);
  });

  it('shows only what this step is about, and the step\'s own lines before its questions', () => {
    card({ steps: answeredFirst(), sections: sections() });
    const own = screen.getByText("You'll count workouts each week.");
    const callout = document.querySelector(`[data-fill-in="${FLOOR.id}"]`) as HTMLElement;
    expect(own.compareDocumentPosition(callout) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The goal's own line is the small ✓ line above, once, and not repeated under this step.
    expect(screen.getAllByText(/Get stronger starts today/)).toHaveLength(1);
  });

  it('does not say an answer twice: once a step has an answer, its lines give way to the answers shown below', () => {
    const days = [{ ...ZONE, answered: true, answer: 'Europe/London' }, DAY_END];
    card({
      steps: [step('days', 'Your days', days)],
      sections: [section('days', 'Your days', ["You're on London time."])],
    });
    expect(screen.queryByText("You're on London time.")).toBeNull();
    expect(screen.getByText('Selected: London time')).toBeTruthy();
    cleanup();
    // Before any answer, what was said about the step is shown.
    card({
      steps: [step('days', 'Your days', [ZONE, DAY_END])],
      sections: [section('days', 'Your days', ['Your week starts on Monday.'])],
    });
    expect(screen.getByText('Your week starts on Monday.')).toBeTruthy();
  });

  it('has a Back link on a step after the first', () => {
    card({ steps: answeredFirst(), sections: sections() });
    expect(screen.getByRole('button', { name: QUICK_PATH_WORDS.back })).toBeTruthy();
  });

  it('Back shows the earlier step with the chosen answer selected, and its answers can be changed', () => {
    const onFill = vi.fn(async () => null);
    card({ steps: answeredFirst(), sections: sections(), onFill });
    fireEvent.click(screen.getByRole('button', { name: QUICK_PATH_WORDS.back }));
    expect(screen.getByText('1 of 3')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Get stronger' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'It keeps going' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'It ends on a date' }).getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector(`[data-fill-in="${SHAPE.id}"]`)?.getAttribute('data-state')).toBe('answered');
    expect(screen.getAllByText(QUICK_PATH_WORDS.yourAnswer).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'It has a deadline' }));
    expect(onFill).toHaveBeenCalledWith(expect.objectContaining({ id: SHAPE.id }), 'project', 'said');
  });

  it('a step that is done offers Next to go on, and there is no dimmed button', () => {
    card({ steps: answeredFirst(), sections: sections() });
    fireEvent.click(screen.getByRole('button', { name: QUICK_PATH_WORDS.back }));
    fireEvent.click(screen.getByRole('button', { name: QUICK_PATH_WORDS.next }));
    expect(screen.getByText('2 of 3')).toBeTruthy();
    expect(buttons().filter((b) => b.disabled)).toEqual([]);
  });
});

describe('the last step: Save my setup', () => {
  const finished = (): QuickStep[] => [
    step('days', 'Your days', [
      { ...ZONE, answered: true, answer: 'Europe/London' },
      { ...DAY_END, answered: true, answer: '21:00' },
      { ...WEEK_START, answered: true, answer: '1' },
    ]),
  ];

  it('is not there while an answer is missing, however far along the card is', () => {
    card({ steps: [step('days', 'Your days', [{ ...ZONE, answered: true, answer: 'Europe/London' }, DAY_END, WEEK_START])] });
    expect(screen.queryByRole('button', { name: QUICK_PATH_WORDS.save })).toBeNull();
    expect(screen.queryByRole('button', { name: QUICK_PATH_WORDS.next })).toBeNull();
  });

  it('is the one button once every answer is in: "Save my setup", main, and it saves', () => {
    const onSave = vi.fn();
    // The last step, reached by stepping to it, with everything answered.
    card({ steps: [...STEPS().slice(0, 2).map((s) => ({ ...s, items: s.items.map((i) => ({ ...i, answered: true, answer: 'x' })) })), ...finished()], onSave });
    expect(screen.getByRole('heading', { name: QUICK_PATH_WORDS.readyTop })).toBeTruthy();
    const save = screen.getByRole('button', { name: QUICK_PATH_WORDS.save }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    expect(save.getAttribute('data-tone')).toBe('main');
    expect(document.querySelectorAll('[data-tone="main"]')).toHaveLength(1);
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('never says "Save what I have", and never shows a dimmed Save', () => {
    card();
    expect(text()).not.toMatch(/Save what I have|Save is off/);
    expect(buttons().map((b) => b.textContent)).not.toContain('Save what I have');
  });

  it('says "Saving…" while it saves, and the button is then the only thing it takes away', () => {
    card({ steps: [], sections: [section('goal:g1', 'Get stronger', ['Get stronger keeps going.'])], saving: true });
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeTruthy();
  });
});

describe('the ready screen', () => {
  const sections = () => [
    section('goal:g1', 'Get stronger', ['Get stronger starts today and keeps going.', 'Even in a hard week: at least 3 workouts a week.', 'You log workouts yourself.']),
    section('days', 'Your days', ["You're on London time.", 'You check in at 9:00 PM.', 'Your week starts on Monday.']),
  ];

  it('looks it over: every part with what was said, no questions, one Save my setup', () => {
    card({ steps: [], sections: sections() });
    expect(screen.getByRole('heading', { name: QUICK_PATH_WORDS.readyTop })).toBeTruthy();
    for (const s of sections()) {
      expect(screen.getByText(s.title)).toBeTruthy();
      // The goal's own first line starts at what it says of the goal: its name is the heading above it.
      for (const l of s.lines) expect(screen.getByText(l.text.replace(/^Get stronger s/, 'S'))).toBeTruthy();
    }
    expect(document.querySelector('[data-slot="needs-answer"]')).toBeNull();
    expect(screen.getAllByRole('button', { name: QUICK_PATH_WORDS.save })).toHaveLength(1);
    expect(text()).not.toMatch(/Needs your answer|Almost done/);
  });

  it('shows no part that has nothing in it', () => {
    card({ steps: [], sections: [section('goal:g1', 'Get stronger', ['Get stronger keeps going.'])] });
    expect(text()).not.toMatch(/Nothing in this part yet|How Momentum talks/);
    expect(screen.queryByRole('heading', { name: 'Your days' })).toBeNull();
  });

  it('shows the words of the owner\'s review: the floor, the day end and the time zone in plain words', () => {
    card({ steps: [], sections: sections() });
    expect(text()).toContain('Even in a hard week: at least 3 workouts a week.');
    expect(text()).toContain('You check in at 9:00 PM.');
    expect(text()).toContain('London time');
    expect(text()).not.toMatch(/Your goal|Europe\/London|isn't set yet/);
  });

  it('has a Back link to the last step when the person answered on the card, so a mistake can be changed without starting again', () => {
    const answered = STEPS().map((s) => ({ ...s, items: s.items.map((i) => ({ ...i, answered: true, answer: i.choices[0]?.value ?? 'x' })) }));
    card({ steps: answered, sections: sections() });
    expect(screen.getByRole('heading', { name: QUICK_PATH_WORDS.readyTop })).toBeTruthy();
    const back = screen.getByRole('button', { name: QUICK_PATH_WORDS.back });
    // At the top of the screen, before any part, and not another button.
    expect(back.compareDocumentPosition(screen.getByText('Get stronger')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole('button', { name: QUICK_PATH_WORDS.back })).toHaveLength(1);
    fireEvent.click(back);
    // The last step, with its answers chosen and Save my setup still on it.
    expect(screen.getByText('3 of 3')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Your days' })).toBeTruthy();
    expect(document.querySelector(`[data-fill-in="${WEEK_START.id}"]`)?.getAttribute('data-state')).toBe('answered');
    expect(screen.getByRole('button', { name: 'Monday' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: QUICK_PATH_WORDS.save })).toBeTruthy();
  });

  it('does not say the goal\'s name twice: the heading is the name, and its first line starts at what it says of it; a phone\'s small ✓ line keeps the name', () => {
    const goalSection = {
      id: 'goal:g1',
      title: 'Get stronger',
      lines: [
        { text: 'Get stronger starts today and keeps going.', stepId: 'goal:g1' },
        { text: 'Even in a hard week: at least 3 workouts a week.', stepId: 'target:g1.t1' },
      ],
      subjects: ['goal:g1', 'target:g1.t1'],
      names: { 'goal:g1': 'Get stronger', 'target:g1.t1': 'Workouts' },
    };
    card({ steps: [], sections: [goalSection] });
    expect(screen.getByText('Starts today and keeps going.')).toBeTruthy();
    expect(screen.queryByText(/^Get stronger starts today/)).toBeNull();
    expect(screen.getAllByText(/Get stronger/)).toHaveLength(1);
    cleanup();
    // On a phone, the step before is one small line that names it.
    const steps = [step('goal:g1', 'Get stronger', [{ ...START, answered: true, answer: '2026-10-30' }], 'goal:g1'), step('target:g1.t1', 'Workouts', [FLOOR], 'goal:g1')];
    card({ steps, sections: [goalSection] });
    expect(screen.getByText('✓ Get stronger starts today and keeps going.')).toBeTruthy();
  });

  it('has no Back when nothing was answered on the card: there is no step to go back to', () => {
    card({ steps: [], sections: sections() });
    expect(screen.queryByRole('button', { name: QUICK_PATH_WORDS.back })).toBeNull();
  });
});

describe('what only Claude could ask for', () => {
  it('is said where it is, with no Save, and tells the person to start again', () => {
    card({ steps: [], sections: [section('goal:g1', 'Get stronger', ['Get stronger keeps going.'])], stuck: ['At least one goal.'] });
    expect(screen.getByRole('heading', { name: QUICK_PATH_WORDS.stuckTop })).toBeTruthy();
    const callout = document.querySelector('[data-slot="needs-answer"]') as HTMLElement;
    expect(callout.textContent).toContain('At least one goal.');
    expect(callout.textContent).toContain(QUICK_PATH_WORDS.cantAnswerHere);
    expect(callout.textContent).toContain('Start again');
    expect(screen.queryByRole('button', { name: QUICK_PATH_WORDS.save })).toBeNull();
    expect(screen.getAllByText(QUICK_PATH_WORDS.reasonLimit)).toHaveLength(1);
  });

  it('keeps Save away from a card whose questions are all answered but that still has such a line', () => {
    const done = STEPS().map((s) => ({ ...s, items: s.items.map((i) => ({ ...i, answered: true, answer: 'x' })) }));
    card({ steps: done, stuck: ['At least one goal.'] });
    expect(screen.queryByRole('button', { name: QUICK_PATH_WORDS.save })).toBeNull();
  });
});

describe('Start again is a small link that asks first', () => {
  it('shows the question and two ways out; only "Yes, start again" clears', () => {
    const onStartOver = vi.fn();
    card({ onStartOver });
    const link = screen.getByRole('button', { name: QUICK_PATH_WORDS.startAgain });
    expect(link.className).toContain('underline');
    expect(link.getAttribute('data-tone')).toBeNull();
    fireEvent.click(link);
    expect(onStartOver).not.toHaveBeenCalled();
    expect(screen.getByText('This clears everything you told me. Start again?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: QUICK_PATH_WORDS.confirmNo }));
    expect(screen.getByRole('button', { name: QUICK_PATH_WORDS.startAgain })).toBeTruthy();
    expect(onStartOver).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: QUICK_PATH_WORDS.startAgain }));
    fireEvent.click(screen.getByRole('button', { name: QUICK_PATH_WORDS.confirmYes }));
    expect(onStartOver).toHaveBeenCalledTimes(1);
  });
});

describe('lists: real bullets, nested, hanging indent, no pre-wrap', () => {
  it('groups an indented line under the line above it', () => {
    expect(groupLines(['Get stronger: how long it runs is not set yet.', '  Workouts: counted each week.', '  Runs: counted each week, at least 2.'])).toEqual([
      { text: 'Get stronger: how long it runs is not set yet.', children: ['Workouts: counted each week.', 'Runs: counted each week, at least 2.'] },
    ]);
    expect(groupLines(['  Alone.', 'Next. '])).toEqual([{ text: 'Alone.', children: [] }, { text: 'Next.', children: [] }]);
    expect(groupLines([])).toEqual([]);
  });

  it('the card renders what was said as one real bulleted list per part, with no pre-wrap and no leading spaces', () => {
    const { container } = card({ steps: [], sections: [section('goal:g1', 'Get stronger', ['One.', 'Two.']), section('days', 'Your days', ['Three.'])] });
    const lists = [...container.querySelectorAll('ul')];
    expect(lists).toHaveLength(2);
    for (const ul of lists) {
      expect(ul.className).toMatch(/(^|\s)list-disc(\s|$)/);
      expect(ul.className).toContain('[overflow-wrap:anywhere]');
    }
    for (const li of container.querySelectorAll('li')) expect(li.firstChild?.textContent ?? '').not.toMatch(/^\s/);
    expect(container.innerHTML).not.toContain('whitespace-pre');
  });

  it('the playback card uses the same list', () => {
    const { container } = render(<PlaybackCard chunk="targets" lines={['Get stronger: how long it runs is not set yet.', '  Workouts: counted each week.']} busy={false} onApprove={() => {}} onChange={() => {}} />);
    expect(container.querySelector('ul.list-disc')).not.toBeNull();
    expect(container.querySelector('li > ul.list-\\[circle\\]')).not.toBeNull();
    expect(container.innerHTML).not.toContain('whitespace-pre');
  });
});

describe('no source file promises a default', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) ? [p] : [];
    });
  it('"sensible default" appears in no file of lib/, components/ or app/', () => {
    const files = ['lib', 'components', 'app'].flatMap((d) => walk(join(process.cwd(), d)));
    const found = files.filter((f) => /sensible default/i.test(readFileSync(f, 'utf8'))).map((f) => f.replace(process.cwd(), ''));
    expect(found).toEqual([]);
    expect(files.length).toBeGreaterThan(100);
  });

  it('the card says no default anywhere', () => {
    for (const reason of REASONS) {
      const { unmount } = card({ reason });
      expect(text()).not.toMatch(/default|sensible/i);
      unmount();
    }
  });
});

describe('a card that keeps its own state, answered one step at a time', () => {
  // A stand-in for the screen: it holds the steps, and answering marks the item answered, as the server's new state would.
  function Harness({ initial, onSave }: { initial: QuickStep[]; onSave?: () => void }) {
    const [steps, setSteps] = useState<QuickStep[]>(initial);
    const onFill: CardProps['onFill'] = async (it, value) => {
      const next = steps.map((s) => ({ ...s, items: s.items.map((i) => (i.id === it.id ? { ...i, answered: true, answer: value } : i)) }));
      setSteps(next);
      return { sections: SECTIONS(), steps: next, items: next.flatMap((s) => s.items.filter((i) => !i.answered)), stuck: [], missing: [], canSave: false } satisfies QuickPathState;
    };
    return <QuickPathCard {...quickProps({ sections: SECTIONS(), steps, onFill, onSave, deviceZone: 'Europe/London', today: '2026-10-30' })} />;
  }
  const field = (label: string) => document.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;

  it('walks the owner\'s example: each step stays until it is answered, Next appears only when it is, and the last step ends in Save my setup', async () => {
    const onSave = vi.fn();
    render(<Harness initial={STEPS()} onSave={onSave} />);

    // Step 1 holds two answers. Answering one leaves the step where it is, with no Next.
    fireEvent.click(screen.getByRole('button', { name: 'It keeps going' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'It keeps going' }).getAttribute('aria-pressed')).toBe('true'));
    expect(screen.getByText('1 of 3')).toBeTruthy();
    expect(screen.queryByRole('button', { name: QUICK_PATH_WORDS.next })).toBeNull();
    // Today is the one suggestion, and it counts as accepted.
    fireEvent.click(screen.getByRole('button', { name: 'Use today, Friday, Oct 30' }));
    const next = await screen.findByRole('button', { name: QUICK_PATH_WORDS.next });
    expect(next.getAttribute('data-tone')).toBe('main');
    expect(screen.getByRole('heading', { name: 'Almost done: 2 quick steps and your setup is saved' })).toBeTruthy();
    fireEvent.click(next);

    // Step 2: also two answers. A box has no button until there is something to set; its button is "Set", since Next waits for both.
    expect(screen.getByText('2 of 3')).toBeTruthy();
    expect(screen.queryByRole('button', { name: QUICK_PATH_WORDS.setItem })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: "I'll log it myself" }));
    await waitFor(() => expect(screen.getByRole('button', { name: "I'll log it myself" }).getAttribute('aria-pressed')).toBe('true'));
    fireEvent.change(field(FLOOR.line), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: QUICK_PATH_WORDS.setItem }));
    fireEvent.click(await screen.findByRole('button', { name: QUICK_PATH_WORDS.next }));

    // Step 3, "Your days": three answers in one step. Nothing is saved until the last of them is in and Save my setup is tapped.
    expect(screen.getByText('3 of 3')).toBeTruthy();
    expect(screen.queryByRole('button', { name: QUICK_PATH_WORDS.save })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: "Use this device's time zone: London time" }));
    await waitFor(() => expect(screen.getByText('Selected: London time')).toBeTruthy());
    fireEvent.change(field(DAY_END.line), { target: { value: '21:00' } });
    fireEvent.click(screen.getByRole('button', { name: QUICK_PATH_WORDS.setItem }));
    await waitFor(() => expect(document.querySelector(`[data-fill-in="${DAY_END.id}"]`)?.getAttribute('data-state')).toBe('answered'));
    expect(screen.queryByRole('button', { name: QUICK_PATH_WORDS.save })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Monday' }));
    const save = await screen.findByRole('button', { name: QUICK_PATH_WORDS.save });
    expect(screen.getByRole('heading', { name: QUICK_PATH_WORDS.readyTop })).toBeTruthy();
    // The reason is gone with the last question, and nothing is dimmed.
    expect(screen.queryByText(QUICK_PATH_WORDS.reasonLimit)).toBeNull();
    expect(buttons().filter((b) => b.disabled)).toEqual([]);
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('a step with one answer moves on at once when it is answered, and the last step stays to offer Save my setup', async () => {
    const one = (id: string, title: string): QuickStep => step(id, title, [item(`goals.${id}.shape`, `Does ${title} keep going?`, 'choice', { choices: [{ value: 'ongoing', label: `Yes, ${title}` }] })]);
    render(<Harness initial={[one('a', 'A'), one('b', 'B')]} />);
    expect(screen.getByText('1 of 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, A' }));
    await screen.findByText('2 of 2');
    // The step before it, as one line above, and Back to change it.
    expect(screen.getByRole('button', { name: QUICK_PATH_WORDS.back })).toBeTruthy();
    expect(screen.queryByRole('button', { name: QUICK_PATH_WORDS.save })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, B' }));
    await screen.findByRole('button', { name: QUICK_PATH_WORDS.save });
    expect(screen.getByText('2 of 2')).toBeTruthy();
  });

  it('a box that is a step\'s only answer carries the step\'s own "Next", and it appears only when there is something to set', async () => {
    const only = step('a', 'Pages', [item('goals.a.targets.t.floor', 'In a hard week, how many pages would still count?', 'number')]);
    render(<Harness initial={[only, step('b', 'Days', [item('person.dayEnd', 'When does your day end?', 'time')])]} />);
    expect(screen.queryByRole('button', { name: QUICK_PATH_WORDS.next })).toBeNull();
    fireEvent.change(field('In a hard week, how many pages would still count?'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: QUICK_PATH_WORDS.next }));
    await screen.findByText('2 of 2');
  });

  it('a step with more than one question moves on only once every question in it is answered; a one-tap answer on an unfinished step stays', async () => {
    const onSave = vi.fn();
    const first = step('goal:a', 'Goal', [item('goals.a.shape', 'Does this goal keep going?', 'choice', { choices: [{ value: 'ongoing', label: 'It keeps going' }, { value: 'finite', label: 'It ends on a date' }] }), item('goals.a.startDate', 'When do you start?', 'date')]);
    const days = step('days', 'Your days', [ZONE, DAY_END, WEEK_START]);
    render(<Harness initial={[first, days]} onSave={onSave} />);

    // Two questions. The one-tap answer is the first: the step stays, however it is answered, and nothing offers to move on.
    expect(screen.getByText('1 of 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'It keeps going' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'It keeps going' }).getAttribute('aria-pressed')).toBe('true'));
    expect(screen.getByText('1 of 2')).toBeTruthy();
    expect(screen.queryByRole('button', { name: QUICK_PATH_WORDS.next })).toBeNull();
    // Changing that answer is also one tap on an unfinished step: it stays.
    fireEvent.click(screen.getByRole('button', { name: 'It ends on a date' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'It ends on a date' }).getAttribute('aria-pressed')).toBe('true'));
    expect(screen.getByText('1 of 2')).toBeTruthy();
    // The second question is a box: answering it finishes the step, and only now can the person move on.
    fireEvent.change(document.querySelector('input[aria-label="When do you start?"]') as HTMLInputElement, { target: { value: '2026-11-02' } });
    fireEvent.click(screen.getByRole('button', { name: QUICK_PATH_WORDS.setItem }));
    const next = await screen.findByRole('button', { name: QUICK_PATH_WORDS.next });
    expect(screen.getByText('1 of 2')).toBeTruthy();
    fireEvent.click(next);
    expect(screen.getByText('2 of 2')).toBeTruthy();

    // Three questions, the last one first: a one-tap answer out of order still leaves the step where it is, until the third is in.
    fireEvent.click(screen.getByRole('button', { name: 'Monday' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Monday' }).getAttribute('aria-pressed')).toBe('true'));
    expect(screen.getByText('2 of 2')).toBeTruthy();
    expect(screen.queryByRole('button', { name: QUICK_PATH_WORDS.save })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: "Use this device's time zone: London time" }));
    await waitFor(() => expect(screen.getByText('Selected: London time')).toBeTruthy());
    expect(screen.queryByRole('button', { name: QUICK_PATH_WORDS.save })).toBeNull();
    expect(document.querySelectorAll('[data-state="missing"]')).toHaveLength(1);
    fireEvent.change(document.querySelector(`input[aria-label="${DAY_END.line}"]`) as HTMLInputElement, { target: { value: '21:00' } });
    fireEvent.click(screen.getByRole('button', { name: QUICK_PATH_WORDS.setItem }));
    // Every question is answered: now, and only now, the step offers its end.
    expect(await screen.findByRole('button', { name: QUICK_PATH_WORDS.save })).toBeTruthy();
    expect(document.querySelectorAll('[data-state="missing"]')).toHaveLength(0);
  });

  it('a one-tap answer on a step viewed again through Back stays on it, and the card does not jump past a change that adds a question', async () => {
    const shape = item('goals.a.shape', 'Does this goal keep going?', 'choice', { choices: [{ value: 'ongoing', label: 'It keeps going' }, { value: 'finite', label: 'It ends on a date' }] });
    const end = item('goals.a.endDate', 'What date should this goal end on?', 'date');
    function Growing() {
      const [steps, setSteps] = useState<QuickStep[]>([step('goal:a', 'Goal', [shape]), step('days', 'Your days', [DAY_END])]);
      const onFill: CardProps['onFill'] = async (it, value) => {
        const next = steps.map((s) => {
          if (s.id !== 'goal:a') return s;
          const items = s.items.map((i) => (i.id === it.id ? { ...i, answered: true, answer: value } : i));
          // Choosing an end date makes the end date the next question, in the same step.
          return { ...s, items: value === 'finite' && !items.some((i) => i.id === end.id) ? [...items, end] : items };
        });
        setSteps(next);
        return { sections: [], steps: next, items: [], stuck: [], missing: [], canSave: false } satisfies QuickPathState;
      };
      return <QuickPathCard {...quickProps({ steps, onFill })} />;
    }
    render(<Growing />);
    fireEvent.click(screen.getByRole('button', { name: 'It ends on a date' }));
    // The step had one question, so it would move on; it now has two, and the second is open, so it stays.
    await waitFor(() => expect(document.querySelector(`[data-fill-in="${end.id}"]`)).not.toBeNull());
    expect(screen.getByText('1 of 2')).toBeTruthy();
  });

  it('a refused answer leaves the card where it was', async () => {
    const onFill = vi.fn(async () => null);
    render(<QuickPathCard {...quickProps({ sections: SECTIONS(), steps: STEPS(), onFill })} />);
    fireEvent.click(screen.getByRole('button', { name: 'It keeps going' }));
    await waitFor(() => expect(onFill).toHaveBeenCalledTimes(1));
    expect(screen.getByText('1 of 3')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'It keeps going' }).getAttribute('aria-pressed')).toBe('false');
  });
});

describe('"your answers stay in this tab and setup picks up where it stopped": proven', () => {
  let script: AssistantTurn[];
  beforeAll(async () => {
    const c = SETUP_CASES.find((x) => x.expect === 'clean');
    if (!c) throw new Error('no clean case');
    await runSetupEval(c, scriptedModel(c.script));
    script = c.script;
  });

  const turnView = (turn: AssistantTurn): { ok: true; data: SetupTurnView } => ({ ok: true, data: { kind: 'turn', turn, spentTokens: 1000, rejected: 0 } });
  const limitView = (reason: QuickPathReason): { ok: true; data: SetupTurnView } => ({
    ok: true,
    data: { kind: 'quick_path', reason, message: 'x', sections: SECTIONS(), steps: STEPS(), items: STEPS().flatMap((s) => s.items), stuck: [], missing: ['x'], canSave: false },
  });
  const TOP = QUICK_PATH_WORDS.topLine(3);

  it('a limit stops setup; after a reload the same conversation is still there, and one tap carries on from it when Claude can answer', async () => {
    actions.ask.mockResolvedValueOnce(turnView(script[0])).mockResolvedValueOnce(limitView('shared_cap'));
    render(<SetupConversation userId={USER} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start' }));
    await screen.findByRole('heading', { name: script[0].question ?? '' });
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'Run more' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    // The limit: the card says so once and asks its questions, and the conversation is in this tab's storage as it was.
    await screen.findByRole('heading', { name: TOP });
    expect(screen.getAllByText(QUICK_PATH_WORDS.reasonWait)).toHaveLength(1);
    const stored: SetupSession = JSON.parse(window.sessionStorage.getItem(KEY) ?? 'null');
    expect(stored.transcript).toHaveLength(2);
    expect(stored.transcript[1]).toEqual({ role: 'person', text: 'Run more' });
    expect(stored.draft).toEqual(script[0].draft);

    // The reload: nothing of the page survives but this tab's storage.
    cleanup();
    actions.ask.mockReset();
    actions.ask.mockResolvedValue(turnView(script[1]));
    render(<SetupConversation userId={USER} />);

    // It opens on the question, with the answer waiting, and asks nothing until the person taps.
    await screen.findByRole('heading', { name: script[0].question ?? '' });
    expect(screen.getByText('Run more')).toBeTruthy();
    expect(actions.ask).not.toHaveBeenCalled();

    // Claude can answer again: one tap sends the very same conversation and setup moves on to its next question.
    fireEvent.click(screen.getByRole('button', { name: 'Send it again' }));
    await screen.findByRole('heading', { name: script[1].question ?? '' });
    expect(actions.ask).toHaveBeenCalledTimes(1);
    const sentSession = actions.ask.mock.calls[0][0] as SetupSession;
    expect(sentSession.transcript).toEqual(stored.transcript);
    expect(sentSession.draft).toEqual(stored.draft);
    expect(sentSession.spentTokens).toBe(stored.spentTokens);
    await waitFor(() => expect((JSON.parse(window.sessionStorage.getItem(KEY) ?? 'null') as SetupSession).transcript).toHaveLength(3));
  });

  it('a spent budget is the same card after a reload, and it is the question-limit line, not the wait line', async () => {
    actions.ask.mockResolvedValueOnce(turnView(script[0])).mockResolvedValue(limitView('over_turns'));
    render(<SetupConversation userId={USER} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start' }));
    await screen.findByRole('heading', { name: script[0].question ?? '' });
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'Run more' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByRole('heading', { name: TOP });
    expect(screen.getByText(QUICK_PATH_WORDS.reasonLimit)).toBeTruthy();
    cleanup();
    render(<SetupConversation userId={USER} />);
    await screen.findByRole('heading', { name: script[0].question ?? '' });
    fireEvent.click(screen.getByRole('button', { name: 'Send it again' }));
    await screen.findByRole('heading', { name: TOP });
    expect(screen.getByText(QUICK_PATH_WORDS.reasonLimit)).toBeTruthy();
    expect(screen.queryByText(QUICK_PATH_WORDS.reasonWait)).toBeNull();
  });
});
