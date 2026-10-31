// @vitest-environment jsdom
//
// MOM-111, the quick-path card's fill-in. When setup stops using Claude the card lists what is missing; now each item the saved
// model needs has its own control, and the person sets it and saves. What these hold the code to:
// 1. Every control sits under the card's own line for the item; a line only Claude could ask for (a goal to add) stays a bullet,
//    and then the card still says to start again.
// 2. Nothing is filled in for the person: the only suggestion on the card is the device's time zone, and it is a button.
// 3. A time zone is picked from a searchable list of real names.
// 4. On the screen, setting an item goes to the server, the card shows what is left, a refused value changes nothing and says
//    so, and "Save what I have" saves through the same quick-path save once nothing is missing.
// The server actions are stubs: no Claude call, no network.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickPathCard } from '@/components/setup/QuickPathCard';
import { SetupConversation } from '@/components/setup/SetupConversation';
import { SETUP_QUICK_PATH_MESSAGES } from '@/lib/services/llm';
import { runSetupEval } from '@/lib/setup/evals';
import { QUICK_PATH_WORDS } from '@/lib/setup/quickPath';
import { setupStorageKey } from '@/lib/setup/session';
import type { AssistantTurn, SetupSession } from '@/types/setup';
import type { FillInItem, QuickPathState, SetupTurnView } from '@/types/setupScreen';
import { SETUP_CASES } from './setup-evals/cases';
import { scriptedModel } from './helpers/setupScript';

const USER = '11111111-1111-4111-8111-111111111111';
const KEY = setupStorageKey(USER);
const actions = vi.hoisted(() => ({ ask: vi.fn(), save: vi.fn(), fill: vi.fn() }));
vi.mock('@/app/actions/setup', () => ({ askSetupTurn: actions.ask, saveSetup: actions.save, fillQuickPathItemAction: actions.fill }));

const SECTIONS = [{ chunk: 'goals' as const, title: 'Your goals', lines: ['Your goal: Get stronger.'] }];
const none: Pick<FillInItem, 'choices' | 'suggestion'> = { choices: [], suggestion: null };
const ZONE: FillInItem = { id: 'person.timeZone', line: 'Your time zone.', kind: 'timeZone', choices: [], suggestion: 'device_time_zone' };
const DAY_END: FillInItem = { id: 'person.dayEnd', line: 'When your day ends.', kind: 'time', ...none };
const WEEK_START: FillInItem = {
  id: 'person.weekStart',
  line: 'Which day your week starts.',
  kind: 'weekday',
  choices: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((label, i) => ({ value: String(i + 1), label })),
  suggestion: null,
};
const FLOOR: FillInItem = { id: 'goals.g.targets.t.floor', line: 'In a hard week, how many workouts would still count?', kind: 'number', ...none };
const UNIT: FillInItem = { id: 'goals.g.targets.t.unit', line: 'The unit for "Pages".', kind: 'text', ...none };
const ALL = [ZONE, DAY_END, WEEK_START, FLOOR, UNIT];

const card = (items: FillInItem[], extra: Partial<Parameters<typeof QuickPathCard>[0]> = {}) => {
  const onFill = vi.fn();
  const missing = extra.missing ?? items.map((i) => i.line);
  const view = render(
    <QuickPathCard
      reason="over_turns"
      message={SETUP_QUICK_PATH_MESSAGES.over_turns}
      sections={SECTIONS}
      missing={missing}
      canSave={missing.length === 0}
      saving={false}
      error={null}
      onSave={() => {}}
      onStartOver={() => {}}
      items={items}
      deviceZone="Europe/Berlin"
      onFill={onFill}
      {...extra}
    />,
  );
  return { ...view, onFill };
};

const group = (item: FillInItem): HTMLElement => document.querySelector(`[data-fill-in="${item.id}"]`) as HTMLElement;

beforeEach(() => {
  actions.ask.mockReset();
  actions.save.mockReset();
  actions.fill.mockReset();
  window.sessionStorage.clear();
});
afterEach(cleanup);

describe('the card: a control under each missing line', () => {
  it('puts each control under the card\'s own line, and says what to do before any button', () => {
    const { container } = card(ALL);
    for (const item of ALL) {
      const g = group(item);
      expect(g, item.id).toBeTruthy();
      expect(within(g).getByText(item.line)).toBeTruthy();
    }
    expect(screen.getByText(QUICK_PATH_WORDS.fillIn)).toBeTruthy();
    expect(screen.getByText(QUICK_PATH_WORDS.fillStays)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save what I have' }) as HTMLButtonElement).disabled).toBe(true);
    const text = container.textContent ?? '';
    expect(text.indexOf(QUICK_PATH_WORDS.fillIn)).toBeLessThan(text.indexOf('Save what I have'));
    expect(text).not.toMatch(/default|sensible/i);
  });

  it('keeps one bold line: only the title is heavy', () => {
    const { container } = card(ALL);
    const heavy = [...container.querySelectorAll('*')].filter((el) => /\b(font-(medium|semibold|bold)|section-title)\b/.test(el.getAttribute('class') ?? ''));
    expect(heavy.map((el) => el.textContent)).toEqual([QUICK_PATH_WORDS.missingTitle]);
  });

  it('a line only Claude could ask for stays a bullet, and the card still says to start again', () => {
    card([DAY_END], { missing: ['At least one goal.', DAY_END.line] });
    expect(screen.getByText('At least one goal.').closest('li')).not.toBeNull();
    expect(group(DAY_END)).toBeTruthy();
    expect(screen.queryByText(QUICK_PATH_WORDS.fillIn)).toBeNull();
    expect(screen.getByText(QUICK_PATH_WORDS.missingNoWait)).toBeTruthy();
  });

  it('with nothing to fill in the card is the plain list it was', () => {
    card([], { missing: ['At least one goal.'] });
    expect(screen.getByText('At least one goal.').closest('li')).not.toBeNull();
    expect(document.querySelector('[data-fill-in]')).toBeNull();
    expect(screen.queryByText(QUICK_PATH_WORDS.fillStays)).toBeNull();
  });

  it('offers no suggestion for the day end, the week start, the floor or the unit; only the time zone has one', () => {
    card(ALL);
    for (const item of [DAY_END, WEEK_START, FLOOR, UNIT]) {
      expect(within(group(item)).queryByRole('button', { name: /use this|today|suggest/i }), item.id).toBeNull();
    }
    expect(within(group(ZONE)).getByRole('button', { name: "Use this device's time zone (Europe/Berlin)" })).toBeTruthy();
  });

  it('turns every control off while an item is being set', () => {
    card(ALL, { filling: true });
    for (const control of document.querySelectorAll('[data-fill-in] input, [data-fill-in] button')) expect((control as HTMLInputElement).disabled).toBe(true);
  });
});

describe('the controls hand the value to onFill', () => {
  it('the device\'s time zone is a tap and counts as accepted', () => {
    const { onFill } = card([ZONE]);
    fireEvent.click(screen.getByRole('button', { name: "Use this device's time zone (Europe/Berlin)" }));
    expect(onFill).toHaveBeenCalledWith(ZONE, 'Europe/Berlin', 'accepted');
  });

  it('a time zone is picked from a searchable list of real names, and counts as said', () => {
    const { onFill } = card([ZONE]);
    const search = screen.getByRole('searchbox', { name: QUICK_PATH_WORDS.searchZones });
    expect(screen.queryByRole('list', { name: 'Matching time zones' })).toBeNull();
    fireEvent.change(search, { target: { value: 'new york' } });
    const list = screen.getByRole('list', { name: 'Matching time zones' });
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toContain('America/New_York');
    fireEvent.click(within(list).getByRole('button', { name: 'America/New_York' }));
    expect(onFill).toHaveBeenCalledWith(ZONE, 'America/New_York', 'said');
  });

  it('says so when no time zone matches, and offers none', () => {
    card([ZONE]);
    fireEvent.change(screen.getByRole('searchbox', { name: QUICK_PATH_WORDS.searchZones }), { target: { value: 'zzzzqq' } });
    expect(screen.getByText(QUICK_PATH_WORDS.noZones)).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Matching time zones' })).toBeNull();
  });

  it('a time, a number and a few words each need something in the box before Set, and send it as typed', () => {
    const { onFill } = card([DAY_END, FLOOR, UNIT]);
    for (const [item, value] of [[DAY_END, '21:00'], [FLOOR, '3'], [UNIT, 'pages']] as const) {
      const g = within(group(item));
      const set = g.getByRole('button', { name: QUICK_PATH_WORDS.setItem }) as HTMLButtonElement;
      expect(set.disabled).toBe(true);
      fireEvent.change(g.getByLabelText(item.line), { target: { value } });
      expect(set.disabled).toBe(false);
      fireEvent.click(set);
      expect(onFill).toHaveBeenLastCalledWith(item, value, 'said');
    }
  });

  it('a weekday is seven buttons, Monday first, each sending its number', () => {
    const { onFill } = card([WEEK_START]);
    const buttons = within(group(WEEK_START)).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
    fireEvent.click(buttons[6]);
    expect(onFill).toHaveBeenCalledWith(WEEK_START, '7', 'said');
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

  const turnView = (turn: AssistantTurn): { ok: true; data: SetupTurnView } => ({ ok: true, data: { kind: 'turn', turn, spentTokens: 1000, rejected: 0 } });
  const limit = (state: Partial<QuickPathState>): { ok: true; data: SetupTurnView } => ({
    ok: true,
    data: { kind: 'quick_path', reason: 'over_turns', message: SETUP_QUICK_PATH_MESSAGES.over_turns, sections: SECTIONS, missing: [], items: [], canSave: false, ...state },
  });

  async function toTheCard(state: Partial<QuickPathState>) {
    actions.ask.mockResolvedValueOnce(turnView(script[0])).mockResolvedValueOnce(limit(state));
    render(<SetupConversation userId={USER} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start' }));
    await screen.findByRole('heading', { name: script[0].question ?? '' });
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'Run more' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByRole('heading', { name: QUICK_PATH_WORDS.missingTitle });
  }

  const stored = (): SetupSession => JSON.parse(window.sessionStorage.getItem(KEY) ?? 'null');

  it('sets an item, shows what is left, keeps the answer in this tab, and saves through the quick-path save', async () => {
    await toTheCard({ missing: [DAY_END.line], items: [DAY_END] });
    const before = stored();
    const after: SetupSession = {
      ...before,
      transcript: [...before.transcript, { role: 'assistant', turn: { ...script[0], question: DAY_END.line } }, { role: 'person', text: '21:00' }],
    };
    actions.fill.mockResolvedValue({ ok: true, data: { session: after, sections: SECTIONS, missing: [], items: [], canSave: true } });

    const g = within(group(DAY_END));
    fireEvent.change(g.getByLabelText(DAY_END.line), { target: { value: '21:00' } });
    fireEvent.click(g.getByRole('button', { name: QUICK_PATH_WORDS.setItem }));

    // The card settles in one render: the ready title and the enabled Save together.
    const save = await screen.findByRole('button', { name: 'Save what I have' });
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByRole('heading', { name: QUICK_PATH_WORDS.readyTitle })).toBeTruthy();
    expect(document.querySelector('[data-fill-in]')).toBeNull();

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
    await toTheCard({ missing: [DAY_END.line], items: [DAY_END] });
    const before = window.sessionStorage.getItem(KEY);
    actions.fill.mockResolvedValue({ ok: false, error: "That doesn't look right. Nothing was changed." });

    const g = within(group(DAY_END));
    fireEvent.change(g.getByLabelText(DAY_END.line), { target: { value: '21:00' } });
    fireEvent.click(g.getByRole('button', { name: QUICK_PATH_WORDS.setItem }));

    expect(await screen.findByText("That doesn't look right. Nothing was changed.")).toBeTruthy();
    await waitFor(() => expect((within(group(DAY_END)).getByLabelText(DAY_END.line) as HTMLInputElement).disabled).toBe(false));
    expect(window.sessionStorage.getItem(KEY)).toBe(before);
    expect((screen.getByRole('button', { name: 'Save what I have' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a request that never reached the server says so in plain words and changes nothing', async () => {
    await toTheCard({ missing: [DAY_END.line], items: [DAY_END] });
    actions.fill.mockRejectedValue(new Error('offline'));
    const g = within(group(DAY_END));
    fireEvent.change(g.getByLabelText(DAY_END.line), { target: { value: '21:00' } });
    fireEvent.click(g.getByRole('button', { name: QUICK_PATH_WORDS.setItem }));
    expect(await screen.findByText(QUICK_PATH_WORDS.fillFailed)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: QUICK_PATH_WORDS.readyTitle })).toBeNull();
  });
});
