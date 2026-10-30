// @vitest-environment jsdom
//
// MOM-111 setup fix round 3, from the owner's screenshot review on 2026-10-29. Every fix sits in the shared component or rule
// that every step uses, and each test below sweeps every card or every topic it applies to:
// 1. Option buttons come from the conversation, with a detail line for context; never a canned list or a fixed 1 to 7
//    (lib/setup/checks.ts checkOptionList, plain-words checks under owner decision D4; lib/setup/steps.ts PLAIN_WORDS).
// 2. A date question leads with a suggestion whenever code or the conversation has one, and never asks for an "exact date"
//    (lib/setup/codeTurns.ts normalizeDateTurn, shown by lib/services/setup.ts).
// 3. "Pick a date" opens the phone's own date picker directly: the button is the date field (components/setup/DateAnswer.tsx).
// 4. The help link reads "What does this mean?" on every card (lib/setup/session.ts MEANING_LINK).
// 5. The final recap names what is counted and the numbers, in whole sentences (lib/setup/playback.ts renderFinal).
// 6. One button on every error card: "Change my answer" when the answer could not be understood, "Try again" for a technical
//    failure, "Send it again" after a reload (components/setup/RetryNotice.tsx, lib/services/setup.ts).

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DateAnswer } from '@/components/setup/DateAnswer';
import { FinalCard } from '@/components/setup/FinalCard';
import { QuestionCard } from '@/components/setup/QuestionCard';
import { RetryNotice } from '@/components/setup/RetryNotice';
import { MACHINE_DATE } from '@/lib/dates/casual';
import { SETUP_TURN_BUDGET_MS, runCheckedTurn } from '@/lib/services/setup';
import type { RunSetupTurnArgs, SetupTurnResult } from '@/lib/services/llm';
import type { ModelSetupResult } from '@/lib/ai/setup';
import { SCALE_MIN_OPTIONS, bareNumberOption, checkOptionList, checkTurn } from '@/lib/setup/checks';
import { DATE_TOPICS, EXACT_DATE, normalizeDateTurn, suggestedDate } from '@/lib/setup/codeTurns';
import { emptyDraft } from '@/lib/setup/draft';
import { RETRY_FEEDBACK } from '@/lib/setup/feedback';
import { FINAL_MAX_LINES, renderFinal } from '@/lib/setup/playback';
import { SETUP_SYSTEM_PROMPT } from '@/lib/setup/prompt';
import {
  CHANGE_ANSWER,
  MEANING_LINK,
  MEANING_TEXT,
  PICK_DATE,
  PICK_OTHER_DATE,
  PROPOSAL_YES_TEXT,
  RETRY_CAUSES,
  SEND_AGAIN,
  TRY_AGAIN,
  TYPE_INSTEAD,
  errorText,
  type RetryCause,
} from '@/lib/setup/session';
import { SETUP_STEPS } from '@/lib/setup/steps';
import type { AssistantTurn, SetupTopic, Transcript, TurnKind } from '@/types/setup';
import { goal, item, target } from './helpers/setupScript';

vi.mock('@/app/actions/setup', () => ({ askSetupTurn: vi.fn(), saveSetup: vi.fn() }));
afterEach(cleanup);

const TODAY = '2026-10-29';
const turn = (over: Partial<AssistantTurn> = {}): AssistantTurn => ({
  kind: 'question',
  chunk: null,
  skipped: null,
  say: '',
  question: 'Which of these would you like to start from?',
  detail: null,
  topic: 'target',
  options: [],
  draft: emptyDraft(),
  ...over,
});
const asked = (over: Partial<AssistantTurn> = {}): Transcript[number] => ({ role: 'assistant', turn: turn(over) });
const said = (text: string): Transcript[number] => ({ role: 'person', text });
const codes = (t: AssistantTurn) => checkOptionList(t).map((x) => x.code);
const DATE_TOPIC_LIST = [...DATE_TOPICS] as SetupTopic[];
const ASKING: TurnKind[] = ['question', 'offer_ideas', 'ideas', 'interpretations', 'proposal'];

// ---------------------------------------------------------------------------
// Finding 1: options from the conversation, with context
// ---------------------------------------------------------------------------

describe('finding 1: option buttons come from the conversation, with a detail line for context', () => {
  it.each(['ideas', 'offer_ideas'] as const)('a %s turn with no detail line is flagged', (kind) => {
    const options = kind === 'ideas' ? ['2 sessions a week', '3 sessions a week'] : [];
    expect(codes(turn({ kind, options }))).toEqual(['choice.ideas_context']);
    expect(codes(turn({ kind, options, detail: 'Sessions a week, from what you said about where you are now.' }))).toEqual([]);
  });

  it.each(['ideas', 'interpretations', 'proposal'] as const)('a %s with a bare number, or a number and a period only, is flagged', (kind) => {
    for (const bare of ['3', '2 a week', '3 times a week', 'Three a week', 'about 4 per week']) {
      expect(codes(turn({ kind, detail: 'Sessions a week.', options: [bare, '4 sessions a week'] })), bare).toContain('choice.ideas_bare');
    }
    for (const full of ['2 sessions a week', '5 days a week', '20 minutes a day', '10 pages a day', 'Today, Thursday, Oct 29', 'A different number']) {
      expect(bareNumberOption(full), full).toBe(false);
    }
  });

  it('a run of five or more numbers in a row is a fixed scale, whatever the words', () => {
    const scale = ['1 session a week', '2 sessions a week', '3 sessions a week', '4 sessions a week', '5 sessions a week', '6 sessions a week', '7 sessions a week'];
    expect(codes(turn({ kind: 'ideas', detail: 'Sessions a week.', options: scale }))).toEqual(['choice.ideas_scale']);
    expect(codes(turn({ kind: 'ideas', detail: 'Sessions a week.', options: scale.slice(0, SCALE_MIN_OPTIONS - 1) }))).toEqual([]);
    // Numbers that follow the goal (minutes a day) are not a scale.
    expect(codes(turn({ kind: 'ideas', detail: 'Minutes a day.', options: ['10 minutes a day', '20 minutes a day', '30 minutes a day'] }))).toEqual([]);
  });

  it('flags nothing on a turn with no options to tap', () => {
    for (const kind of ASKING.filter((k) => k !== 'ideas' && k !== 'offer_ideas')) expect(codes(turn({ kind }))).toEqual([]);
  });

  it('all three are plain-words checks with fixed retry words (owner decision D4), never hard rules', () => {
    const t = turn({ kind: 'ideas', options: ['1', '2', '3', '4', '5'] });
    const found = checkOptionList(t);
    expect(found.map((x) => x.code).sort()).toEqual(['choice.ideas_bare', 'choice.ideas_context', 'choice.ideas_scale']);
    expect(found.every((x) => x.rule === 'plain_words')).toBe(true);
    for (const code of ['choice.ideas_context', 'choice.ideas_bare', 'choice.ideas_scale'] as const) expect(RETRY_FEEDBACK[code]).toBeTruthy();
  });

  it('tells Claude: options from the conversation, what is counted and its period, the range from the goal, never 1 to 7', () => {
    expect(SETUP_SYSTEM_PROMPT).toContain('Options are written from this conversation, never a fixed list.');
    expect(SETUP_SYSTEM_PROMPT).toContain('never a fixed scale such as 1 to 7');
    expect(SETUP_SYSTEM_PROMPT).toContain('something done daily gets amounts a day, or days a week');
  });

  it('a weak option list is retried once, then shown: it never ends in the stuck card', async () => {
    const transcript: Transcript = [asked({ kind: 'offer_ideas', detail: 'Sessions a week.', question: 'Do you have a number in mind, or would some starting ideas help?' }), said('Some ideas, please.')];
    const weak = turn({ kind: 'ideas', options: ['1', '2', '3', '4', '5', '6', '7'] });
    const { calls, deps } = fakeModel([weak, weak, weak]);
    const view = await runCheckedTurn({ userId: 'u', session: { transcript, draft: emptyDraft(), spentTokens: 0 }, today: TODAY, deadlineMs: SETUP_TURN_BUDGET_MS }, deps);
    expect(calls).toHaveLength(2);
    expect(calls[1].retryFeedback).toEqual(expect.arrayContaining([RETRY_FEEDBACK['choice.ideas_bare'], RETRY_FEEDBACK['choice.ideas_context'], RETRY_FEEDBACK['choice.ideas_scale']]));
    expect(view).toMatchObject({ kind: 'turn', rejected: 1 });
  });

  it('the ideas card shows the detail line between the question and the options', () => {
    render(<QuestionCard turn={turn({ kind: 'ideas', detail: 'Sessions a week, from what you said.', options: ['2 sessions a week', '3 sessions a week'] })} busy={false} onAnswer={() => {}} today={TODAY} />);
    const detail = screen.getByText('Sessions a week, from what you said.');
    const first = screen.getByRole('button', { name: '1. 2 sessions a week' });
    expect(detail.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Finding 2: a date question leads with a suggestion
// ---------------------------------------------------------------------------

// A date question Claude wrote, after the person's last answer.
const dateQ = (topic: SetupTopic, question = 'What is the exact date it has to be done by?'): AssistantTurn => turn({ topic, question, detail: null });
const shapeThen = (answer: string): Transcript => [asked({ topic: 'shape', question: 'Does it keep going, end on a date, or have a deadline?' }), said(answer)];

describe('finding 2: a date question leads with the date code or the conversation gives', () => {
  it('a start date always suggests the person\'s today', () => {
    const shown = normalizeDateTurn(dateQ('start_date', 'Which day would you like to start?'), shapeThen('It keeps going.'), emptyDraft(), TODAY);
    expect(shown).toMatchObject({ kind: 'proposal', question: 'Start today, Thursday, Oct 29?', options: [] });
  });

  it.each([
    ['deadline_date', 'It has a deadline, December 15.', 'Done by Tuesday, Dec 15?'],
    ['deadline_date', 'A deadline in two weeks.', 'Done by Thursday, Nov 12?'],
    ['end_date', 'It runs until March 1.', 'Run until Monday, Mar 1, 2027?'],
    ['parked_return', 'Bring it back on 1/15/2027, I think.', 'Bring it back on Friday, Jan 15, 2027?'],
  ] as const)('a %s question after "%s" becomes "%s"', (topic, answer, question) => {
    expect(normalizeDateTurn(dateQ(topic), shapeThen(answer), emptyDraft(), TODAY)).toMatchObject({ kind: 'proposal', question });
  });

  it('an end date from a length of time the person said, counted from the start date', () => {
    const draft = emptyDraft();
    draft.model.goals.push(goal('g1', 'Run more', { shape: 'finite', startDate: '2026-11-02' }));
    expect(suggestedDate('end_date', shapeThen('It ends after two months.'), draft, TODAY)).toBe('2027-01-02');
  });

  it('suggests nothing when nothing was said, and then never asks for an "exact date"', () => {
    for (const topic of DATE_TOPIC_LIST.filter((t) => t !== 'start_date')) {
      const shown = normalizeDateTurn(dateQ(topic), shapeThen('It has a deadline.'), emptyDraft(), TODAY);
      expect(shown.kind, topic).toBe('question');
      expect(shown.question, topic).not.toMatch(EXACT_DATE);
      expect(shown.detail ?? '', topic).not.toMatch(EXACT_DATE);
    }
    expect(normalizeDateTurn(dateQ('deadline_date'), shapeThen('It has a deadline.'), emptyDraft(), TODAY).question).toBe('Which day does it have to be done by?');
  });

  it('keeps Claude\'s own date question when it does not ask for an "exact date" and nothing can be suggested', () => {
    const own = turn({ topic: 'parked_return', question: 'When should this one come back?', detail: 'On a date, when something happens, or only when you ask.' });
    expect(normalizeDateTurn(own, shapeThen('Park it.'), emptyDraft(), TODAY)).toBe(own);
  });

  it('suggests nothing again right after the person answered the question without a date', () => {
    const t: Transcript = [...shapeThen('A deadline, December 15.'), asked({ kind: 'proposal', topic: 'deadline_date', question: 'Done by 2026-12-15?' }), said('Not sure yet.')];
    expect(suggestedDate('deadline_date', t, emptyDraft(), TODAY)).toBeNull();
    expect(suggestedDate('start_date', [asked({ topic: 'start_date', question: 'Which day would you like to start?' }), said('Not today.')], emptyDraft(), TODAY)).toBeNull();
    // Asking what the question means is not an answer: the suggestion stays.
    const meaning: Transcript = [...shapeThen('A deadline, December 15.'), asked({ topic: 'deadline_date', question: 'Which day?' }), said(MEANING_TEXT)];
    expect(suggestedDate('deadline_date', meaning, emptyDraft(), TODAY)).toBe('2026-12-15');
  });

  it('never suggests a date already in the draft, a past date, or one said before this question was last answered (D5)', () => {
    const draft = emptyDraft();
    draft.model.goals.push(goal('g1', 'Quilt', { shape: 'project', endDate: '2026-12-15' }));
    expect(suggestedDate('deadline_date', shapeThen('A deadline, December 15.'), draft, TODAY)).toBeNull();
    expect(suggestedDate('deadline_date', shapeThen('I started on October 1.'), emptyDraft(), TODAY)).toBeNull();
    expect(suggestedDate('deadline_date', shapeThen('A deadline, 2026-10-01.'), emptyDraft(), TODAY)).toBeNull();
    // A day already gone this year, with no year given, is next year's.
    expect(suggestedDate('deadline_date', shapeThen('A deadline, October 1.'), emptyDraft(), TODAY)).toBe('2027-10-01');
    // The first goal's deadline answer stands between: the second goal's question reads nothing older.
    const second: Transcript = [said('Quilt by December 15.'), asked({ topic: 'deadline_date', question: 'Which day?' }), said('Next Friday.'), ...shapeThen('It has a deadline.')];
    expect(suggestedDate('deadline_date', second, emptyDraft(), TODAY)).toBeNull();
    // A relative day is read only from the shape answer: "Mondays" in another answer is not a date.
    expect(suggestedDate('deadline_date', [asked({ topic: 'idea', question: 'What would you like to work on?' }), said('Run on Mondays.')], emptyDraft(), TODAY)).toBeNull();
  });

  it('the service shows Claude\'s plain date question as the date confirmation, and the turn passes every check', async () => {
    const transcript = shapeThen('It has a deadline, December 15.');
    const { deps } = fakeModel([dateQ('deadline_date')]);
    const view = await runCheckedTurn({ userId: 'u', session: { transcript, draft: emptyDraft(), spentTokens: 0 }, today: TODAY, deadlineMs: SETUP_TURN_BUDGET_MS }, deps);
    expect(view).toMatchObject({ kind: 'turn', rejected: 0, turn: { kind: 'proposal', question: 'Done by Tuesday, Dec 15?', detail: 'We plan back from that day.' } });
    if (view.kind !== 'turn') throw new Error('no turn');
    expect(checkTurn(view.turn, { transcript, prevDraft: emptyDraft() })).toEqual([]);
  });

  it.each(DATE_TOPIC_LIST)('a %s card: the suggestion shows as the date confirmation, Yes first', (topic) => {
    const shown = normalizeDateTurn(dateQ(topic), shapeThen('It ends on December 15.'), emptyDraft(), TODAY);
    const onAnswer = vi.fn();
    const { container } = render(<QuestionCard turn={shown} busy={false} onAnswer={onAnswer} today={TODAY} />);
    expect(container.textContent).not.toMatch(MACHINE_DATE);
    expect(container.textContent).not.toMatch(EXACT_DATE);
    expect(screen.getByRole('button', { name: 'Yes' }).getAttribute('data-tone')).toBe('main');
    expect(screen.getByLabelText(PICK_OTHER_DATE)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(onAnswer).toHaveBeenCalledWith(PROPOSAL_YES_TEXT);
  });

  it('no step example and no code question asks for an "exact date"', () => {
    for (const s of SETUP_STEPS) for (const e of s.examples) expect(`${e.question} ${e.detail ?? ''}`, s.id).not.toMatch(EXACT_DATE);
  });
});

// ---------------------------------------------------------------------------
// Finding 3: one button opens the phone's own date picker
// ---------------------------------------------------------------------------

describe('finding 3: "Pick a date" opens the phone\'s own date picker; nothing opens in place', () => {
  const layouts = DATE_TOPIC_LIST.flatMap((topic) => [
    [`${topic}, no suggestion`, turn({ topic, question: 'Which day?' }), PICK_DATE, 'main'] as const,
    [`${topic}, suggested`, turn({ kind: 'proposal', topic, question: 'On Monday, Nov 2?' }), PICK_OTHER_DATE, 'answer'] as const,
  ]);

  it.each(layouts)('%s: the button is the one date field, and choosing a date answers', (_name, t, label, tone) => {
    const onAnswer = vi.fn();
    const { container } = render(<QuestionCard turn={t} busy={false} onAnswer={onAnswer} today={TODAY} />);
    const fields = container.querySelectorAll('input[type="date"]');
    expect(fields).toHaveLength(1);
    const field = screen.getByLabelText(label);
    expect(field).toBe(fields[0]);
    const trigger = field.closest('[data-picker="date"]');
    expect(trigger?.getAttribute('data-tone')).toBe(tone);
    expect(trigger?.textContent).toBe(label);
    // The field covers the button, unseen: a tap lands on it, so the phone opens its own picker.
    expect(field.className).toMatch(/\babsolute\b/);
    expect(field.className).toMatch(/\binset-0\b/);
    expect(field.className).toMatch(/\bopacity-0\b/);
    // The tap adds nothing to the card: no picker shows in place.
    const before = container.querySelectorAll('*').length;
    fireEvent.click(field);
    expect(container.querySelectorAll('*').length).toBe(before);
    expect(container.querySelectorAll('input[type="date"]')).toHaveLength(1);
    fireEvent.change(field, { target: { value: '2026-11-12' } });
    expect(onAnswer).toHaveBeenCalledWith('Thursday, November 12, 2026');
  });

  it('asks the browser to open its picker on the tap, and copes when it cannot', () => {
    const onAnswer = vi.fn();
    render(<DateAnswer suggests={false} others={[]} locked={false} busy={false} onAnswer={onAnswer} />);
    const field = screen.getByLabelText(PICK_DATE) as HTMLInputElement;
    const showPicker = vi.fn();
    field.showPicker = showPicker;
    fireEvent.click(field);
    expect(showPicker).toHaveBeenCalledTimes(1);
    field.showPicker = () => {
      throw new Error('NotAllowedError');
    };
    expect(() => fireEvent.click(field)).not.toThrow();
  });

  it('is locked while a reply loads', () => {
    render(<DateAnswer suggests={false} others={[]} locked busy onAnswer={() => {}} />);
    expect((screen.getByLabelText(PICK_DATE) as HTMLInputElement).disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Finding 4: "What does this mean?" on every card
// ---------------------------------------------------------------------------

describe('finding 4: the help link reads "What does this mean?" on every card', () => {
  const cards: [string, AssistantTurn][] = [
    ...ASKING.map((kind) => [kind, turn({ kind, topic: 'shape', options: kind === 'ideas' || kind === 'interpretations' ? ['2 sessions a week', '3 sessions a week'] : [] })] as [string, AssistantTurn]),
    ...DATE_TOPIC_LIST.flatMap((topic) => [
      [`${topic} question`, turn({ topic, question: 'Which day?' })] as [string, AssistantTurn],
      [`${topic} confirmation`, turn({ kind: 'proposal', topic, question: 'On Monday, Nov 2?' })] as [string, AssistantTurn],
    ]),
  ];

  it.each(cards)('a %s card, before and after "Type it instead"', (_name, t) => {
    const onAnswer = vi.fn();
    const { container } = render(<QuestionCard turn={t} busy={false} onAnswer={onAnswer} today={TODAY} />);
    expect(MEANING_LINK).toBe('What does this mean?');
    expect(screen.getAllByRole('button', { name: 'What does this mean?' })).toHaveLength(1);
    const typeIt = screen.queryByRole('button', { name: TYPE_INSTEAD });
    if (typeIt) fireEvent.click(typeIt);
    expect(screen.getAllByRole('button', { name: 'What does this mean?' })).toHaveLength(1);
    expect(container.textContent).not.toContain('Not sure what I mean');
    fireEvent.click(screen.getByRole('button', { name: 'What does this mean?' }));
    expect(onAnswer).toHaveBeenCalledWith(MEANING_TEXT);
  });
});

// ---------------------------------------------------------------------------
// Finding 5: the final recap in plain words
// ---------------------------------------------------------------------------

describe('finding 5: the final recap names what is counted and the numbers, in whole sentences', () => {
  const oneGoal = (t: ReturnType<typeof target>) => {
    const m = emptyDraft().model;
    const g = goal('g1', 'Run more');
    g.targets.push(t);
    m.goals.push(g);
    return m;
  };

  it.each([
    ['a least and an aim', target('t1', 'Workouts', { floor: 2, aspiration: 3 }), 'Your goal: at least 2 workouts a week, aiming for 3.'],
    ['a least only', target('t1', 'Workouts', { floor: 2 }), 'Your goal: at least 2 workouts a week.'],
    ['an aim only', target('t1', 'Pages', { aspiration: 50 }), 'Your goal: aiming for 50 pages a week.'],
    ['no number', target('t1', 'Interviews', { role: 'outcome' }), 'Your goal: interviews, counted each week.'],
    ['minutes', target('t1', 'Practice', { measure: 'time', floor: 90 }), 'Your goal: at least 90 minutes of practice a week.'],
    ['set days', target('t1', 'Swims', { floor: 2, period: { kind: 'day_slots', weekdays: [1, 4] } }), 'Your goal: at least 2 swims a week on Monday and Thursday.'],
    ['a deadline', target('t1', 'Blocks sewn', { floor: 12, period: { kind: 'deadline', dueDate: '2026-12-15' } }), 'Your goal: at least 12 blocks sewn by Tuesday, Dec 15.'],
    ['a checklist', target('t1', 'Wedding tasks', { measure: 'checklist', period: { kind: 'deadline', dueDate: '2027-06-14' } }), 'Your goal: a checklist of wedding tasks to work through by Monday, Jun 14, 2027.'],
    ['an app name', target('t1', 'Hevy sets', { floor: 10 }), 'Your goal: at least 10 Hevy sets a week.'],
  ] as const)('%s', (_name, t, line) => {
    const lines = renderFinal(oneGoal(t), { today: TODAY });
    expect(lines[0]).toBe(line);
    for (const l of lines) {
      expect(l).toMatch(/^[A-Z].*[.]$/);
      expect(l).not.toMatch(/you'll count/i);
      expect(l).not.toMatch(MACHINE_DATE);
    }
  });

  it('names the goal on each line when there is more than one, and never shows a goal title alone', () => {
    const m = emptyDraft().model;
    const a = goal('g1', 'Run more');
    a.targets.push(target('t1', 'Runs', { floor: 2, aspiration: 3 }));
    m.goals.push(a, goal('g2', 'Read more'), goal('g3', 'Paint', { state: 'parked' }));
    expect(renderFinal(m, { today: TODAY })).toEqual([
      'Run more: at least 2 runs a week, aiming for 3.',
      'Read more: nothing is counted yet.',
      '1 goal set aside for now, with a way back.',
      'Everything can be changed on your settings page.',
    ]);
  });

  it(`stays within ${FINAL_MAX_LINES} lines, saying how many more things are counted`, () => {
    const m = emptyDraft().model;
    const g = goal('g1', 'Get fit');
    for (let i = 0; i < 8; i++) g.targets.push(target(`t${i}`, `Thing ${i}`, { floor: i + 1 }));
    m.goals.push(g);
    const lines = renderFinal(m);
    expect(lines).toHaveLength(FINAL_MAX_LINES);
    expect(lines.at(-2)).toBe('And 4 more things to count.');
  });

  it('the final card shows the lines as they are written', () => {
    const lines = renderFinal(oneGoal(target('t1', 'Workouts', { floor: 2, aspiration: 3 })), { today: TODAY });
    render(<FinalCard lines={lines} saving={false} error={null} onSave={() => {}} onChange={() => {}} />);
    expect(screen.getByText('Your goal: at least 2 workouts a week, aiming for 3.')).toBeTruthy();
  });

  it('a deadline task in the draft does not change the recap', () => {
    const m = oneGoal(target('t1', 'Workouts', { floor: 2 }));
    m.goals[0].items.push(item('i1', 'deadline_task', 'Sign up', { dueDate: '2026-11-20' }));
    expect(renderFinal(m)[0]).toBe('Your goal: at least 2 workouts a week.');
  });
});

// ---------------------------------------------------------------------------
// Finding 6: one button on every error card
// ---------------------------------------------------------------------------

describe('finding 6: every error card shows one button, never both', () => {
  const CAUSES: [RetryCause, string][] = [
    ['stuck', CHANGE_ANSWER],
    ['network', TRY_AGAIN],
    ['busy', TRY_AGAIN],
    ['wait', TRY_AGAIN],
    ['no_answer', TRY_AGAIN],
    ['timed_out', TRY_AGAIN],
    ['not_configured', TRY_AGAIN],
    ['unsent', SEND_AGAIN],
  ];

  it('every cause has a card', () => expect(CAUSES.map(([c]) => c).sort()).toEqual([...RETRY_CAUSES].sort()));

  it.each(CAUSES)('a %s card shows only "%s"', (cause, only) => {
    const onRetry = vi.fn();
    const onChangeAnswer = vi.fn();
    const { container } = render(<RetryNotice cause={cause} onRetry={onRetry} onChangeAnswer={onChangeAnswer} />);
    const buttons = [...container.querySelectorAll('button[data-tone]')];
    expect(buttons.map((b) => b.textContent)).toEqual([only]);
    expect(buttons[0].getAttribute('data-tone')).toBe('main');
    fireEvent.click(buttons[0]);
    expect(only === CHANGE_ANSWER ? onChangeAnswer : onRetry).toHaveBeenCalledTimes(1);
  });

  it('a stuck card with no answer to change (the very first turn) offers Try again alone', () => {
    const { container } = render(<RetryNotice cause="stuck" onRetry={() => {}} />);
    expect([...container.querySelectorAll('button[data-tone]')].map((b) => b.textContent)).toEqual([TRY_AGAIN]);
  });

  it.each([
    ['rate_limited', 'busy', 1_000],
    ['unavailable', 'no_answer', 1_000],
    ['unavailable', 'timed_out', SETUP_TURN_BUDGET_MS],
    ['refused', 'stuck', 1_000],
    ['not_configured', 'not_configured', 1_000],
  ] as const)('the service: a %s answer is the %s card', async (reason, cause, ms) => {
    const { deps } = fakeModel([{ failed: reason }], [ms]);
    const view = await runCheckedTurn({ userId: 'u', session: { transcript: [said('Run more')], draft: emptyDraft(), spentTokens: 0 }, deadlineMs: SETUP_TURN_BUDGET_MS }, deps);
    expect(view).toEqual({ kind: 'failed', reason: cause, message: errorText(cause), rejected: 0 });
  });
});

// A fake model for the service: each reply is a turn, or { failed: reason }. `ms` is how long each call takes on the clock.
function fakeModel(replies: (AssistantTurn | { failed: Extract<ModelSetupResult, { ok: false }>['reason'] })[], ms: number[] = []) {
  let now = 0;
  const calls: RunSetupTurnArgs[] = [];
  const runTurn = async (args: RunSetupTurnArgs): Promise<SetupTurnResult> => {
    calls.push(args);
    now += ms[calls.length - 1] ?? 1_000;
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
    const result: ModelSetupResult = 'failed' in reply ? ({ ok: false, reason: reply.failed } as ModelSetupResult) : { ok: true, raw: reply, model: 'm', usage: null };
    return { kind: 'answered', result, turns: 1, spentTokens: 0 };
  };
  return { calls, deps: { runTurn: runTurn as never, nowMs: () => now } };
}
