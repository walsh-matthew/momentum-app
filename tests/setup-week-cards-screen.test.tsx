// @vitest-environment jsdom
//
// MOM-179, the week cards code writes, on the screen. What these hold the code to:
// 1. Each card is the owner's: its question and reason in the owner's words, its controls, and nothing pre-selected on any of them.
// 2. No main button is ever dimmed: a button that has nothing to send is not there (day end, set days, planning), or is there and says what is
//    missing in a callout (time for each kind of day).
// 3. Every card keeps "Type your answer", which sends the person's own words to Claude, and "What does this mean?" in that box.
// 4. In the conversation: a tap answers the card and the next card appears with no request to the server; the first request is for Claude's
//    question about the kinds of days.
// The server actions are stubs: no Claude call, no network.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SetupConversation } from '@/components/setup/SetupConversation';
import { WeekCard } from '@/components/setup/WeekCard';
import { emptyDraft } from '@/lib/setup/draft';
import { runSetupEval } from '@/lib/setup/evals';
import { EXPLANATIONS } from '@/lib/setup/explain';
import { ASK_CLAUDE, MEANING_TEXT, setupStorageKey } from '@/lib/setup/session';
import { DAY_END_SAY } from '@/lib/setup/steps';
import { weekCard, type WeekAnswer, type WeekCardTopic } from '@/lib/setup/weekCards';
import type { AssistantTurn, SetupDraft, SetupModel, SetupSession } from '@/types/setup';
import { goal, scriptedModel, target } from './helpers/setupScript';
import { WEEK_CARDS_CASE } from './setup-evals/cases';

const USER = '11111111-1111-4111-8111-111111111111';
const KEY = setupStorageKey(USER);
const actions = vi.hoisted(() => ({ ask: vi.fn(), save: vi.fn(), fill: vi.fn() }));
vi.mock('@/app/actions/setup', () => ({ askSetupTurn: actions.ask, saveSetup: actions.save, fillQuickPathItemAction: actions.fill }));

beforeEach(() => {
  actions.ask.mockReset();
  actions.save.mockReset();
  actions.fill.mockReset();
  window.sessionStorage.clear();
});
afterEach(() => cleanup());

function draftWith(edit: (m: SetupModel) => void = () => undefined): SetupDraft {
  const draft = emptyDraft();
  const g = goal('g1', 'Run more');
  g.targets.push(target('t1', 'Runs', { floor: 3 }));
  draft.model.goals.push(g);
  edit(draft.model);
  return draft;
}
const withKinds = (m: SetupModel) => {
  m.person.dayTypes = [
    { name: 'Busy days', capacityUnit: null, capacityAmount: null },
    { name: 'Easy days', capacityUnit: null, capacityAmount: null },
  ];
};

function show(topic: WeekCardTopic, edit?: (m: SetupModel) => void) {
  const turn = weekCard(topic, draftWith(edit)) as AssistantTurn;
  const onAnswer = vi.fn<(a: WeekAnswer) => void>();
  const onType = vi.fn<(text: string) => void>();
  render(<WeekCard turn={turn} said={[]} busy={false} onAnswer={onAnswer} onType={onType} />);
  return { onAnswer, onType };
}

const pressed = () => document.querySelectorAll('[aria-pressed="true"]');
const mains = () => document.querySelectorAll('[data-tone="main"]');
const boldLines = () => document.querySelectorAll('[data-slot="card-lead"]');

describe('the day end card', () => {
  it("asks the owner's question with the day-end explanation under it, and has its button from the start", () => {
    show('day_end');
    expect(screen.getByRole('heading', { name: 'When does your day end?' })).toBeTruthy();
    expect(screen.getByText(DAY_END_SAY)).toBeTruthy();
    const time = screen.getByLabelText('Time your day ends') as HTMLInputElement;
    expect(time.type).toBe('time');
    expect(time.value).toBe('');
    const button = screen.getByRole('button', { name: 'Use this time' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(mains()).toHaveLength(1);
    expect(boldLines()).toHaveLength(1);
  });

  it("sends nothing when the time changes, however often (a phone's time wheel changes it on the first scroll), and sends it only on the button", () => {
    const { onAnswer, onType } = show('day_end');
    const time = screen.getByLabelText('Time your day ends');
    fireEvent.change(time, { target: { value: '09:00' } });
    fireEvent.change(time, { target: { value: '21:00' } });
    fireEvent.blur(time);
    expect(onAnswer).not.toHaveBeenCalled();
    expect(onType).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use this time' }));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith({ topic: 'day_end', time: '21:00' });
  });

  it('shows the callout, and sends nothing, when the button is tapped with no time', () => {
    const { onAnswer } = show('day_end');
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Use this time' }));
    expect(screen.getByRole('alert').textContent).toContain('What time does your day end?');
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Time your day ends'), { target: { value: '21:00' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('the week start card', () => {
  it('has seven days and none chosen, and a tap is the answer', () => {
    const { onAnswer } = show('week_start');
    expect(screen.getByRole('heading', { name: 'Which day does your week start on?' })).toBeTruthy();
    expect(screen.getByText('Your weeks are counted from this day.')).toBeTruthy();
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
      expect(screen.getByRole('button', { name: day }).getAttribute('aria-pressed'), day).toBe('false');
    }
    expect(pressed()).toHaveLength(0);
    expect(mains()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Monday' }));
    expect(onAnswer).toHaveBeenCalledWith({ topic: 'week_start', weekday: 1 });
  });
});

describe('the time for each kind of day card', () => {
  it('has the owner\'s heading and one row for each kind, in the person\'s words, with nothing chosen and Next always there', () => {
    show('capacity', withKinds);
    expect(screen.getByRole('heading', { name: 'Time you have for your goals' })).toBeTruthy();
    expect(screen.getByText('Skip any you like.')).toBeTruthy();
    expect(document.querySelectorAll('fieldset')).toHaveLength(2);
    expect(screen.getByText('Busy days')).toBeTruthy();
    expect(screen.getByText('Easy days')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Minutes' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Hours' })).toHaveLength(2);
    expect(pressed()).toHaveLength(0);
    for (const box of document.querySelectorAll('input')) expect((box as HTMLInputElement).value).toBe('');
    const next = screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement;
    expect(next.disabled).toBe(false);
    expect(mains()).toHaveLength(1);
  });

  it('says what a half-filled row needs, naming the kind, and sends nothing until it is whole', () => {
    const { onAnswer } = show('capacity', withKinds);
    fireEvent.change(screen.getByLabelText('Amount for Busy days'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Choose minutes or hours for Busy days.')).toBeTruthy();
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Minutes' })[0]);
    expect(pressed()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.queryByText('Choose minutes or hours for Busy days.')).toBeNull();
    expect(onAnswer).toHaveBeenCalledWith({ topic: 'capacity', rows: { 'busy days': { amount: '20', unit: 'minutes' } } });
  });

  it('says a unit with no number needs one', () => {
    show('capacity', withKinds);
    fireEvent.click(screen.getAllByRole('button', { name: 'Hours' })[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Add a number for Easy days.')).toBeTruthy();
  });

  it('sends a row left empty as nothing, so it stays unset', () => {
    const { onAnswer } = show('capacity', withKinds);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    const sent = onAnswer.mock.calls[0][0];
    expect(sent.topic).toBe('capacity');
    expect(Object.values((sent as { rows: Record<string, { amount: string; unit: string | null }> }).rows).every((r) => r.amount === '' && r.unit === null)).toBe(true);
  });

  it('takes a unit back with a second tap', () => {
    show('capacity', withKinds);
    const [minutes] = screen.getAllByRole('button', { name: 'Minutes' });
    fireEvent.click(minutes);
    expect(pressed()).toHaveLength(1);
    fireEvent.click(minutes);
    expect(pressed()).toHaveLength(0);
  });
});

describe('the set days or any day card', () => {
  it('names what is counted in the person\'s words, and shows two buttons with nothing chosen and no days yet', () => {
    show('slots_or_quota');
    expect(screen.getByRole('heading', { name: 'Would you rather do runs on set days, or any day?' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'On set days' })).toBeTruthy();
    expect(screen.getByRole('button', { name: "Any day, as long as the week's number is met" })).toBeTruthy();
    expect(pressed()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Monday' })).toBeNull();
    expect(mains()).toHaveLength(0);
  });

  it('answers "any day" with one tap', () => {
    const { onAnswer } = show('slots_or_quota');
    fireEvent.click(screen.getByRole('button', { name: "Any day, as long as the week's number is met" }));
    expect(onAnswer).toHaveBeenCalledWith({ topic: 'slots_or_quota', answer: { kind: 'any' } });
  });

  it('opens the days with none chosen, asks for one, and shows no Next', () => {
    show('slots_or_quota');
    fireEvent.click(screen.getByRole('button', { name: 'On set days' }));
    expect(screen.getByText('Which days?')).toBeTruthy();
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
      expect(screen.getByRole('button', { name: day }).getAttribute('aria-pressed'), day).toBe('false');
    }
    expect(screen.getByText('Pick a day.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(mains()).toHaveLength(0);
  });

  it('says how many days a count needs, and shows Next only once the days fit', () => {
    const { onAnswer } = show('slots_or_quota');
    fireEvent.click(screen.getByRole('button', { name: 'On set days' }));
    fireEvent.click(screen.getByRole('button', { name: 'Monday' }));
    fireEvent.click(screen.getByRole('button', { name: 'Wednesday' }));
    expect(screen.getByText('Pick at least 3 days for 3 runs a week, or choose any day.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Friday' }));
    expect(screen.queryByText(/Pick at least/)).toBeNull();
    const next = screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement;
    expect(next.disabled).toBe(false);
    expect(mains()).toHaveLength(1);
    fireEvent.click(next);
    expect(onAnswer).toHaveBeenCalledWith({ topic: 'slots_or_quota', answer: { kind: 'days', weekdays: [1, 3, 5] } });
  });

  it('lets a day be taken back', () => {
    show('slots_or_quota');
    fireEvent.click(screen.getByRole('button', { name: 'On set days' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tuesday' }));
    expect(screen.getByRole('button', { name: 'Tuesday' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Tuesday' }));
    expect(screen.getByRole('button', { name: 'Tuesday' }).getAttribute('aria-pressed')).toBe('false');
  });
});

describe('the planning moment card', () => {
  it('has a day and a time, nothing chosen, and Next from the start', () => {
    show('planning_moment');
    expect(screen.getByRole('heading', { name: 'When would you like to plan your week?' })).toBeTruthy();
    expect(screen.getByText('Your look back at the week happens then too.')).toBeTruthy();
    expect(pressed()).toHaveLength(0);
    expect((screen.getByLabelText('Time to plan') as HTMLInputElement).value).toBe('');
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(false);
    expect(mains()).toHaveLength(1);
    // Nothing is called out before a tap.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('sends nothing when the day or the time changes, and sends both only on Next', () => {
    const { onAnswer } = show('planning_moment');
    fireEvent.click(screen.getByRole('button', { name: 'Sunday' }));
    fireEvent.change(screen.getByLabelText('Time to plan'), { target: { value: '17:00' } });
    fireEvent.change(screen.getByLabelText('Time to plan'), { target: { value: '18:00' } });
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith({ topic: 'planning_moment', weekday: 7, time: '18:00' });
  });

  it('names what is missing after a tap, and sends nothing', () => {
    const { onAnswer } = show('planning_moment');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Which day?')).toBeTruthy();
    expect(screen.getByText('What time?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sunday' }));
    expect(screen.queryByText('Which day?')).toBeNull();
    expect(screen.getByText('What time?')).toBeTruthy();
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('asks which day when only a time is set', () => {
    const { onAnswer } = show('planning_moment');
    fireEvent.change(screen.getByLabelText('Time to plan'), { target: { value: '18:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Which day?')).toBeTruthy();
    expect(screen.queryByText('What time?')).toBeNull();
    expect(onAnswer).not.toHaveBeenCalled();
  });
});

describe('every week card keeps a way to type', () => {
  const cards: [WeekCardTopic, ((m: SetupModel) => void) | undefined][] = [
    ['day_end', undefined],
    ['week_start', undefined],
    ['capacity', withKinds],
    ['slots_or_quota', undefined],
    ['planning_moment', undefined],
  ];
  for (const [topic, edit] of cards) {
    it(`${topic}: "Type your answer" opens the box and sends the words to Claude`, () => {
      const { onType, onAnswer } = show(topic, edit);
      fireEvent.click(screen.getByRole('button', { name: 'Type your answer' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Your answer' }), { target: { value: 'Sunday evenings, around six' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
      expect(onType).toHaveBeenCalledWith('Sunday evenings, around six');
      expect(onAnswer).not.toHaveBeenCalled();
    });
  }

  it.each(['day_end', 'week_start', 'capacity', 'slots_or_quota', 'planning_moment'] as const)(
    'explains a %s card in code\'s words, with no call to Claude and no Ask Claude link (MOM-180)',
    (topic) => {
      const { onType, onAnswer } = show(topic, topic === 'capacity' ? withKinds : undefined);
      fireEvent.click(screen.getByRole('button', { name: 'What does this mean?' }));
      expect(document.querySelector('[data-slot="help-explain"]')?.textContent).toBe(EXPLANATIONS[topic]);
      expect(screen.queryByRole('button', { name: ASK_CLAUDE })).toBeNull();
      // The same link inside the typed answer box.
      fireEvent.click(screen.getByRole('button', { name: 'Type your answer' }));
      expect(screen.getAllByRole('button', { name: 'What does this mean?' })).toHaveLength(1);
      expect(onType).not.toHaveBeenCalled();
      expect(onAnswer).not.toHaveBeenCalled();
    },
  );

  it('still reaches Claude from the typed box, so nobody is trapped', () => {
    const { onType } = show('day_end');
    fireEvent.click(screen.getByRole('button', { name: 'Type your answer' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Your answer' }), { target: { value: MEANING_TEXT } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onType).toHaveBeenCalledWith(MEANING_TEXT);
  });
});

// A finished conversation's session, cut where the day end card is on screen.
async function sessionAtDayEnd(): Promise<SetupSession> {
  const report = await runSetupEval(WEEK_CARDS_CASE, scriptedModel(WEEK_CARDS_CASE.script));
  const t = report.transcript;
  const at = t.findIndex((m) => m.role === 'assistant' && m.turn.topic === 'day_end');
  const shown = t[at];
  if (shown?.role !== 'assistant') throw new Error('no day end card');
  return { transcript: t.slice(0, at + 1), draft: shown.turn.draft, spentTokens: 0 };
}

describe('in the conversation', () => {
  it('answers the cards by tap with no request, until the kinds of days, which are Claude\'s', async () => {
    window.sessionStorage.setItem(KEY, JSON.stringify(await sessionAtDayEnd()));
    actions.ask.mockResolvedValue({ ok: false, error: 'stop here' });
    render(<SetupConversation userId={USER} />);
    expect(await screen.findByRole('heading', { name: 'When does your day end?' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Time your day ends'), { target: { value: '21:00' } });
    expect(actions.ask).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use this time' }));
    expect(await screen.findByRole('heading', { name: 'Which day does your week start on?' })).toBeTruthy();
    expect(actions.ask).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Monday' }));
    // The next question is Claude's: one request, with both answers already in the draft as the person's own.
    await waitFor(() => expect(actions.ask).toHaveBeenCalledTimes(1));
    const sent = actions.ask.mock.calls[0][0] as SetupSession;
    expect(sent.draft.model.person).toMatchObject({ dayEnd: '21:00', weekStart: 1 });
    expect(sent.transcript.at(-1)).toEqual({ role: 'person', text: 'My week starts on Monday.' });
    expect(sent.transcript.at(-3)).toEqual({ role: 'person', text: 'My day ends at 9:00 PM.' });
  });

  it('sends a typed answer to Claude as it always has', async () => {
    window.sessionStorage.setItem(KEY, JSON.stringify(await sessionAtDayEnd()));
    actions.ask.mockResolvedValue({ ok: false, error: 'stop here' });
    render(<SetupConversation userId={USER} />);
    await screen.findByRole('heading', { name: 'When does your day end?' });
    fireEvent.click(screen.getByRole('button', { name: 'Type your answer' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Your answer' }), { target: { value: 'I wrap up around 11 at night and my week starts Monday.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(actions.ask).toHaveBeenCalledTimes(1));
    const sent = actions.ask.mock.calls[0][0] as SetupSession;
    expect(sent.transcript.at(-1)).toEqual({ role: 'person', text: 'I wrap up around 11 at night and my week starts Monday.' });
    expect(sent.draft.model.person.dayEnd).toBeNull();
  });
});
