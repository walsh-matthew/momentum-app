// @vitest-environment jsdom
//
// The guided setup screen in a DOM (MOM-111): one question on screen at a time; a part played back by code and approved with a
// tap; a changed answer replacing the old one; nothing saved until the person taps Save; a failed reply or save leaving the
// conversation as it was; the quick path; and the conversation kept in this tab's session storage until it is saved. The two
// server actions are stubs, and the turns come from the validated eval conversations, so no Claude call is made. What the
// server does with the conversation is in tests/setup-service.test.ts.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SetupConversation } from '@/components/setup/SetupConversation';
import { renderFinal, renderPlayback } from '@/lib/setup/playback';
import { APPROVE_TEXT, MEANING_LINK, MEANING_TEXT, STUCK_MESSAGE, setupStorageKey } from '@/lib/setup/session';
import { runSetupEval } from '@/lib/setup/evals';
import type { AssistantTurn, SetupSession, Transcript } from '@/types/setup';
import type { SetupTurnView } from '@/types/setupScreen';
import { SETUP_CASES } from './setup-evals/cases';
import { scriptedModel } from './helpers/setupScript';

const USER = '11111111-1111-4111-8111-111111111111';
const KEY = setupStorageKey(USER);

const actions = vi.hoisted(() => ({ ask: vi.fn(), save: vi.fn() }));
vi.mock('@/app/actions/setup', () => ({ askSetupTurn: actions.ask, saveSetup: actions.save }));

const turnView = (turn: AssistantTurn, spentTokens = 1000): { ok: true; data: SetupTurnView } => ({
  ok: true,
  data: { kind: 'turn', turn, spentTokens, rejected: 0 },
});
const refused = (error: string) => ({ ok: false as const, error });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

// A whole validated conversation, its turns and the transcript it makes.
let script: AssistantTurn[];
let transcript: Transcript;
let ideasTurn: AssistantTurn;
beforeAll(async () => {
  const c = SETUP_CASES.find((x) => x.expect === 'clean');
  if (!c) throw new Error('no clean case');
  const report = await runSetupEval(c, scriptedModel(c.script));
  script = c.script;
  transcript = report.transcript;
  const withIdeas = SETUP_CASES.flatMap((x) => x.script).find((t) => t.kind === 'ideas');
  if (!withIdeas) throw new Error('no case offers ideas');
  ideasTurn = withIdeas;
});

const firstOf = (kind: AssistantTurn['kind']): number => script.findIndex((t) => t.kind === kind);

// The date on this device, as the screen works it out.
const deviceToday = () => new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

const sent = (call = 0) => actions.ask.mock.calls[call][0] as SetupSession & { today: string };

async function start() {
  render(<SetupConversation userId={USER} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Start' }));
}

function answerWith(text: string) {
  fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
}

beforeEach(() => {
  actions.ask.mockReset();
  actions.save.mockReset();
  window.sessionStorage.clear();
});
afterEach(cleanup);

describe('starting', () => {
  it('asks Claude nothing until the person taps Start, then sends an empty conversation and the date on their device', async () => {
    actions.ask.mockResolvedValue(turnView(script[0]));
    render(<SetupConversation userId={USER} />);
    expect(await screen.findByRole('heading', { name: /set up your goals/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'privacy notice' }).getAttribute('href')).toBe('/privacy');
    expect(actions.ask).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await screen.findByRole('heading', { name: script[0].question ?? '' });
    expect(actions.ask).toHaveBeenCalledTimes(1);
    const first = sent();
    expect(first.transcript).toEqual([]);
    expect(first.spentTokens).toBe(0);
    // The browser's own date, YYYY-MM-DD, as a suggestion.
    expect(first.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(first.today).toBe(
      new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10),
    );
  });
});

describe('one question at a time', () => {
  it('shows only the current question, and sends the person\'s words as they typed them, appended to the conversation', async () => {
    actions.ask.mockResolvedValueOnce(turnView(script[0])).mockResolvedValueOnce(turnView(script[1], 2000));
    await start();
    await screen.findByRole('heading', { name: script[0].question ?? '' });
    expect(screen.getAllByRole('textbox')).toHaveLength(1);

    answerWith('  I want to run more  ');
    await screen.findByRole('heading', { name: script[1].question ?? '' });
    // The old question is gone: one question on screen.
    expect(screen.queryByRole('heading', { name: script[0].question ?? '' })).toBeNull();
    expect(screen.getAllByRole('textbox')).toHaveLength(1);

    const second = sent(1);
    expect(second.transcript).toHaveLength(2);
    expect(second.transcript[0]).toMatchObject({ role: 'assistant' });
    expect(second.transcript[1]).toEqual({ role: 'person', text: 'I want to run more' });
    // Claude's draft is carried, and so are the tokens.
    expect(second.draft).toEqual(script[0].draft);
    expect(second.spentTokens).toBe(1000);
  });

  it('cannot be answered twice while Claude is thinking, and cannot send nothing', async () => {
    const pending = deferred<ReturnType<typeof turnView>>();
    actions.ask.mockResolvedValueOnce(turnView(script[0])).mockReturnValueOnce(pending.promise);
    await start();
    await screen.findByRole('heading', { name: script[0].question ?? '' });
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);

    answerWith('Run more');
    // MOM-111 finding 10: the question stays, with the answer just sent under it and a thinking state; there is no box to
    // send another answer from.
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Thinking…'));
    expect(screen.getByRole('heading', { name: script[0].question ?? '' })).toBeTruthy();
    expect(screen.getByText('Run more')).toBeTruthy();
    expect(screen.queryByLabelText('Your answer')).toBeNull();
    pending.resolve(turnView(script[1]));
    await screen.findByRole('heading', { name: script[1].question ?? '' });
    expect(actions.ask).toHaveBeenCalledTimes(2);
  });

  it('numbers the ideas, and tapping one sends it as "Option N"', async () => {
    actions.ask.mockResolvedValueOnce(turnView(ideasTurn)).mockResolvedValueOnce(turnView(script[0]));
    await start();
    const list = await screen.findByRole('list');
    const buttons = within(list).getAllByRole('button');
    expect(buttons).toHaveLength(ideasTurn.options.length);
    expect(buttons[0].textContent).toBe(`1. ${ideasTurn.options[0]}`);
    fireEvent.click(buttons[1]);
    await waitFor(() => expect(actions.ask).toHaveBeenCalledTimes(2));
    expect(sent(1).transcript.at(-1)).toEqual({ role: 'person', text: 'Option 2' });
  });
});

describe('playback is written by code, and the latest answer wins', () => {
  const playbackIndex = () => script.findIndex((t) => t.kind === 'playback' && t.chunk === 'targets');

  it('plays a part back from the draft, not from Claude\'s words, and approving sends the person\'s yes', async () => {
    const at = playbackIndex();
    const turn = script[at];
    actions.ask.mockResolvedValueOnce(turnView(turn)).mockResolvedValueOnce(turnView(script[at + 1]));
    await start();
    await screen.findByRole('heading', { name: /what you'll count: did I get this right\?/i });
    // Every line of the playback is the code's rendering of the validated draft, its dates read against the device's today.
    for (const line of renderPlayback(turn.draft.model, 'targets', { today: deviceToday() })) {
      expect(screen.getByText(line.trim(), { exact: false })).toBeTruthy();
    }
    expect(turn.say).toBe(''); // Claude wrote none of it
    fireEvent.click(screen.getByRole('button', { name: 'Yes, that is right' }));
    await waitFor(() => expect(actions.ask).toHaveBeenCalledTimes(2));
    expect(sent(1).transcript.at(-1)).toEqual({ role: 'person', text: APPROVE_TEXT });
  });

  it('replaces the old answer with the new one when the person changes it, and plays the part back again', async () => {
    const at = playbackIndex();
    const first = script[at];
    const target = first.draft.model.goals.flatMap((g) => g.targets).find((t) => t.floor !== null);
    if (!target) throw new Error('the fixture has no target with a floor');
    const oldFloor = target.floor as number;
    const newFloor = oldFloor + 1;
    const changed = structuredClone(first);
    changed.draft.model.goals.flatMap((g) => g.targets).find((t) => t.key === target.key)!.floor = newFloor;

    actions.ask.mockResolvedValueOnce(turnView(first)).mockResolvedValueOnce(turnView(changed));
    await start();
    await screen.findByRole('heading', { name: /what you'll count: did I get this right\?/i });
    expect(screen.getByText(`at least ${oldFloor}`, { exact: false })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Change something' }));
    fireEvent.change(screen.getByLabelText('What would you like to change?'), { target: { value: `Make it ${newFloor} instead` } });
    fireEvent.click(screen.getByRole('button', { name: 'Send the change' }));

    await waitFor(() => expect(screen.getByText(`at least ${newFloor}`, { exact: false })).toBeTruthy());
    expect(screen.queryByText(`at least ${oldFloor}`, { exact: false })).toBeNull();
    expect(sent(1).transcript.at(-1)).toEqual({ role: 'person', text: `Make it ${newFloor} instead` });
  });
});

describe('changing your mind about changing something (production, 2026-10-29)', () => {
  it('at a playback, "Keep it as it is" sits beside "Send the change" and approves the part in one tap', async () => {
    const at = script.findIndex((t) => t.kind === 'playback' && t.chunk === 'targets');
    actions.ask.mockResolvedValueOnce(turnView(script[at])).mockResolvedValueOnce(turnView(script[at + 1]));
    await start();
    await screen.findByRole('heading', { name: /what you'll count: did I get this right\?/i });

    fireEvent.click(screen.getByRole('button', { name: 'Change something' }));
    const box = screen.getByLabelText('What would you like to change?') as HTMLTextAreaElement;
    // The same placeholder as every answer box (MOM-111 finding 1), with the question said above the box.
    expect(box.placeholder).toBe('Type your answer');
    expect(screen.getByText('What would you like to change?')).toBeTruthy();
    const send = screen.getByRole('button', { name: 'Send the change' });
    const keep = screen.getByRole('button', { name: 'Keep it as it is' });
    // The same row, the same size: a real button, not a small link.
    expect(keep.parentElement).toBe(send.parentElement);
    expect(keep.className).toContain('min-h-12');
    expect(send.className).toContain('min-h-12');
    fireEvent.change(box, { target: { value: 'half typed' } });
    fireEvent.click(keep);

    await waitFor(() => expect(actions.ask).toHaveBeenCalledTimes(2));
    // The half-typed change is not sent; the person's yes is.
    expect(sent(1).transcript.at(-1)).toEqual({ role: 'person', text: APPROVE_TEXT });
  });

  it('at the final confirmation, "Keep it as it is" only closes the box: saving still takes its own tap', async () => {
    actions.ask.mockResolvedValueOnce(turnView(script[firstOf('final')]));
    await start();
    await screen.findByRole('heading', { name: 'Ready to save?' });

    fireEvent.click(screen.getByRole('button', { name: 'Change something' }));
    expect((screen.getByLabelText('What would you like to change?') as HTMLTextAreaElement).placeholder).toBe('Type your answer');
    fireEvent.click(screen.getByRole('button', { name: 'Keep it as it is' }));

    expect(screen.queryByLabelText('What would you like to change?')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save my setup' })).toBeTruthy();
    expect(actions.ask).toHaveBeenCalledTimes(1);
    expect(actions.save).not.toHaveBeenCalled();
  });

  it('a typed "no change" in the change box is still sent as the person typed it', async () => {
    const at = script.findIndex((t) => t.kind === 'playback' && t.chunk === 'targets');
    actions.ask.mockResolvedValueOnce(turnView(script[at])).mockResolvedValueOnce(turnView(script[at + 1]));
    await start();
    await screen.findByRole('heading', { name: /what you'll count: did I get this right\?/i });
    fireEvent.click(screen.getByRole('button', { name: 'Change something' }));
    fireEvent.change(screen.getByLabelText('What would you like to change?'), { target: { value: 'No changes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send the change' }));
    await waitFor(() => expect(actions.ask).toHaveBeenCalledTimes(2));
    expect(sent(1).transcript.at(-1)).toEqual({ role: 'person', text: 'No changes' });
  });
});

describe('asking what a question means (MOM-111)', () => {
  it('offers "Not sure what I mean?" on every question and sends "What do you mean?" as the person\'s answer', async () => {
    actions.ask.mockResolvedValueOnce(turnView(script[0])).mockResolvedValueOnce(turnView(script[1]));
    await start();
    await screen.findByRole('heading', { name: script[0].question ?? '' });
    expect((screen.getByLabelText('Your answer') as HTMLTextAreaElement).placeholder).toBe('Type your answer');
    fireEvent.click(screen.getByRole('button', { name: MEANING_LINK }));
    await waitFor(() => expect(actions.ask).toHaveBeenCalledTimes(2));
    expect(sent(1).transcript.at(-1)).toEqual({ role: 'person', text: MEANING_TEXT });
  });

  it('sends the browser\'s locale with each turn, for the times in a playback the server writes', async () => {
    actions.ask.mockResolvedValueOnce(turnView(script[0]));
    await start();
    await screen.findByRole('heading', { name: script[0].question ?? '' });
    expect((sent() as SetupSession & { locale?: string }).locale).toBe(navigator.language);
  });
});

describe('nothing is saved until the person taps Save', () => {
  const finalIndex = () => firstOf('final');

  async function toFinal() {
    actions.ask.mockResolvedValueOnce(turnView(script[finalIndex()]));
    await start();
    await screen.findByRole('heading', { name: 'Ready to save?' });
  }

  it('reaches the final confirmation, written by code, without saving anything', async () => {
    await toFinal();
    for (const line of renderFinal(script[finalIndex()].draft.model)) expect(screen.getByText(line)).toBeTruthy();
    expect(screen.getByText('Nothing is saved until you tap Save.')).toBeTruthy();
    expect(actions.save).not.toHaveBeenCalled();
  });

  it('saves the conversation as it stands when Save is tapped, then clears this tab\'s copy and says what was saved', async () => {
    await toFinal();
    expect(window.sessionStorage.getItem(KEY)).not.toBeNull();
    actions.save.mockResolvedValue({ ok: true, data: { goals: 2, targets: 3 } });
    fireEvent.click(screen.getByRole('button', { name: 'Save my setup' }));
    await screen.findByRole('heading', { name: 'Your setup is saved' });
    expect(actions.save).toHaveBeenCalledTimes(1);
    const [session, quickPath] = actions.save.mock.calls[0];
    expect(quickPath).toBe(false);
    expect(session.transcript.at(-1)).toMatchObject({ role: 'assistant', turn: { kind: 'final' } });
    expect(screen.getByText(/2 goals and 3 things to count are ready/)).toBeTruthy();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it('a save that fails says so, keeps the confirmation and the conversation, and can be tried again', async () => {
    await toFinal();
    actions.save.mockResolvedValueOnce(refused('Could not save your setup. Nothing was saved.')).mockResolvedValueOnce({ ok: true, data: { goals: 1, targets: 1 } });
    fireEvent.click(screen.getByRole('button', { name: 'Save my setup' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Could not save your setup. Nothing was saved.');
    expect(screen.getByRole('heading', { name: 'Ready to save?' })).toBeTruthy();
    expect(window.sessionStorage.getItem(KEY)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save my setup' }));
    await screen.findByRole('heading', { name: 'Your setup is saved' });
  });

  it('cannot be saved twice by a double tap', async () => {
    await toFinal();
    const pending = deferred<{ ok: true; data: { goals: number; targets: number } }>();
    actions.save.mockReturnValue(pending.promise);
    const button = screen.getByRole('button', { name: 'Save my setup' });
    fireEvent.click(button);
    await waitFor(() => expect((screen.getByRole('button', { name: 'Saving…' }) as HTMLButtonElement).disabled).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Saving…' }));
    pending.resolve({ ok: true, data: { goals: 1, targets: 1 } });
    await screen.findByRole('heading', { name: 'Your setup is saved' });
    expect(actions.save).toHaveBeenCalledTimes(1);
  });
});

describe('when a turn does not come', () => {
  it('keeps what was said, shows the reason, and asking again does not repeat the person\'s message', async () => {
    actions.ask
      .mockResolvedValueOnce(turnView(script[0]))
      .mockResolvedValueOnce({ ok: true, data: { kind: 'failed', message: 'I couldn\'t put together a good reply just now.', rejected: 3 } })
      .mockResolvedValueOnce(turnView(script[1]));
    await start();
    await screen.findByRole('heading', { name: script[0].question ?? '' });
    answerWith('Run more');
    expect((await screen.findByRole('alert')).textContent).toBe('I couldn\'t put together a good reply just now.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('heading', { name: script[1].question ?? '' });
    const retried = sent(2);
    expect(retried.transcript.filter((m) => m.role === 'person')).toEqual([{ role: 'person', text: 'Run more' }]);
  });

  // MOM-111 finding 10: the error keeps the question on screen, and "Change my answer" puts the answer back in the box.
  it('keeps the question on screen, and "Change my answer" puts the answer back in the box to edit and send', async () => {
    actions.ask
      .mockResolvedValueOnce(turnView(script[0]))
      .mockResolvedValueOnce({ ok: true, data: { kind: 'failed', reason: 'stuck', message: STUCK_MESSAGE, rejected: 3 } })
      .mockResolvedValueOnce(turnView(script[1]));
    await start();
    await screen.findByRole('heading', { name: script[0].question ?? '' });
    answerWith('Run more, maybe');
    await screen.findByRole('alert');
    expect(screen.getByRole('heading', { name: script[0].question ?? '' })).toBeTruthy();
    // Round 3, finding 6: the stuck card shows only "Change my answer".
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Change my answer' }));
    const box = screen.getByLabelText('Your answer') as HTMLTextAreaElement;
    expect(box.value).toBe('Run more, maybe');
    expect(screen.queryByRole('alert')).toBeNull();
    // The taken-back answer is gone from the stored conversation too: nothing is waiting on Claude.
    expect(JSON.parse(window.sessionStorage.getItem(KEY) ?? 'null').transcript).toHaveLength(1);
    fireEvent.change(box, { target: { value: 'Run more' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByRole('heading', { name: script[1].question ?? '' });
    expect(sent(2).transcript.filter((m) => m.role === 'person')).toEqual([{ role: 'person', text: 'Run more' }]);
  });

  it('says so when the server cannot be reached, and keeps the conversation', async () => {
    actions.ask.mockResolvedValueOnce(turnView(script[0])).mockRejectedValueOnce(new Error('offline'));
    await start();
    await screen.findByRole('heading', { name: script[0].question ?? '' });
    answerWith('Run more');
    // MOM-111 round 2, findings 12 and 14; round 3, finding 6: what happened in plain words, and only Try again.
    expect((await screen.findByRole('alert')).textContent).toBe("We couldn't reach Momentum just now. Your answer is safe.");
    expect(screen.getByRole('button', { name: 'Try again' }).getAttribute('data-tone')).toBe('main');
    expect(screen.queryByRole('button', { name: 'Change my answer' })).toBeNull();
    expect(JSON.parse(window.sessionStorage.getItem(KEY) ?? 'null').transcript.at(-1)).toEqual({ role: 'person', text: 'Run more' });
  });

  it('after stuck replies, asks for it another way, with only Change my answer', async () => {
    actions.ask
      .mockResolvedValueOnce(turnView(script[0]))
      .mockResolvedValueOnce({ ok: true, data: { kind: 'failed', reason: 'stuck', message: STUCK_MESSAGE, rejected: 3 } });
    await start();
    await screen.findByRole('heading', { name: script[0].question ?? '' });
    answerWith('Run more');
    expect((await screen.findByRole('alert')).textContent).toBe("I couldn't make sense of that answer. Could you say it another way?");
    const change = screen.getByRole('button', { name: 'Change my answer' });
    expect(change.getAttribute('data-tone')).toBe('main');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    // Round 2, finding 13: the old answer comes back in the box, selected and focused, with a small clear button.
    fireEvent.click(change);
    const box = screen.getByLabelText('Your answer') as HTMLTextAreaElement;
    expect(box.value).toBe('Run more');
    expect(document.activeElement).toBe(box);
    expect([box.selectionStart, box.selectionEnd]).toEqual([0, 'Run more'.length]);
    fireEvent.click(screen.getByRole('button', { name: 'Clear answer' }));
    expect(box.value).toBe('');
  });

  it('shows the wait, not a fall-back, when two requests landed together', async () => {
    actions.ask
      .mockResolvedValueOnce(turnView(script[0]))
      .mockResolvedValueOnce({ ok: true, data: { kind: 'wait', message: 'Please wait a few seconds before asking again.', retryAfterSeconds: 2 } });
    await start();
    await screen.findByRole('heading', { name: script[0].question ?? '' });
    answerWith('Run more');
    expect((await screen.findByRole('alert')).textContent).toBe('Please wait a few seconds before asking again.');
  });
});

describe('the quick path', () => {
  const sections = (['goals', 'targets', 'planning', 'talk'] as const).map((chunk, i) => ({
    chunk,
    title: ['Your goals', "What you'll count", 'Your days and weeks', 'How Momentum talks to you'][i],
    lines: [`A line for ${chunk}.`],
  }));
  const quick = (over: Partial<Extract<SetupTurnView, { kind: 'quick_path' }>> = {}): { ok: true; data: SetupTurnView } => ({
    ok: true,
    data: { kind: 'quick_path', reason: 'over_turns', message: 'This setup has used its share of Claude\'s time.', sections, missing: [], canSave: true, ...over },
  });

  async function toQuickPath(view: ReturnType<typeof quick>) {
    actions.ask.mockResolvedValueOnce(turnView(script[0])).mockResolvedValueOnce(view);
    await start();
    await screen.findByRole('heading', { name: script[0].question ?? '' });
    answerWith('Run more');
    await screen.findByRole('heading', { name: 'Finish without more questions' });
  }

  it('shows the message, every part collected, and saves only on a tap, as the approval of what is shown', async () => {
    await toQuickPath(quick());
    expect(screen.getByText('This setup has used its share of Claude\'s time.')).toBeTruthy();
    for (const s of sections) {
      expect(screen.getByRole('heading', { name: s.title })).toBeTruthy();
      expect(screen.getByText(s.lines[0])).toBeTruthy();
    }
    expect(actions.save).not.toHaveBeenCalled();
    actions.save.mockResolvedValue({ ok: true, data: { goals: 1, targets: 1 } });
    fireEvent.click(screen.getByRole('button', { name: 'Save what I have' }));
    await screen.findByRole('heading', { name: 'Your setup is saved' });
    expect(actions.save.mock.calls[0][1]).toBe(true);
  });

  it('lists what is still missing, and will not save an incomplete setup', async () => {
    await toQuickPath(quick({ canSave: false, missing: ['Your time zone.', 'When your day ends.'] }));
    expect(screen.getByRole('heading', { name: 'Still needed before this can be saved' })).toBeTruthy();
    expect(screen.getByText('Your time zone.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save what I have' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Start again' }));
    await screen.findByRole('heading', { name: /set up your goals/i });
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });
});

describe('this tab keeps a setup in progress', () => {
  it('stores the conversation after every turn', async () => {
    actions.ask.mockResolvedValueOnce(turnView(script[0], 1500));
    await start();
    await screen.findByRole('heading', { name: script[0].question ?? '' });
    const stored = JSON.parse(window.sessionStorage.getItem(KEY) ?? 'null');
    expect(stored.spentTokens).toBe(1500);
    expect(stored.transcript).toHaveLength(1);
    expect(stored.draft).toEqual(script[0].draft);
  });

  // MOM-111 finding 10: a phone drops a background tab while Claude thinks, and the page reloads. It opens straight on the
  // question, never on a screen in front of it.
  it('opens a stored conversation straight on its newest question, without asking Claude', async () => {
    const session: SetupSession = { transcript: transcript.slice(0, 3), draft: script[1].draft, spentTokens: 4000 };
    window.sessionStorage.setItem(KEY, JSON.stringify(session));
    render(<SetupConversation userId={USER} />);
    await screen.findByRole('heading', { name: script[1].question ?? '' });
    expect(screen.queryByRole('heading', { name: 'You have a setup in progress' })).toBeNull();
    expect(actions.ask).not.toHaveBeenCalled();
  });

  it('after a reload with the person\'s answer still waiting, shows the question and the answer, and asks again only on a tap', async () => {
    const session: SetupSession = { transcript: transcript.slice(0, 2), draft: script[0].draft, spentTokens: 1000 };
    window.sessionStorage.setItem(KEY, JSON.stringify(session));
    actions.ask.mockResolvedValue(turnView(script[1]));
    render(<SetupConversation userId={USER} />);
    await screen.findByRole('heading', { name: script[0].question ?? '' });
    const waitingAnswer = transcript[1].role === 'person' ? transcript[1].text : '';
    expect(screen.getByText(waitingAnswer)).toBeTruthy();
    expect(actions.ask).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Send it again' }));
    await screen.findByRole('heading', { name: script[1].question ?? '' });
    expect(actions.ask).toHaveBeenCalledTimes(1);
    expect(sent().transcript).toEqual(session.transcript);
  });

  it('starts fresh when the stored value is not a valid conversation, and when the person says start again and confirms', async () => {
    window.sessionStorage.setItem(KEY, '{"transcript": "nonsense"}');
    render(<SetupConversation userId={USER} />);
    await screen.findByRole('button', { name: 'Start' });
    cleanup();

    const session: SetupSession = { transcript: transcript.slice(0, 3), draft: script[1].draft, spentTokens: 4000 };
    window.sessionStorage.setItem(KEY, JSON.stringify(session));
    render(<SetupConversation userId={USER} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start again' }));
    // A stray tap clears nothing: it asks first, and "Keep going" leaves everything as it was.
    fireEvent.click(screen.getByRole('button', { name: 'Keep going' }));
    expect(window.sessionStorage.getItem(KEY)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, start again' }));
    await screen.findByRole('button', { name: 'Start' });
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it('never offers, or sends on, a setup that another person left in this tab', async () => {
    const theirs: SetupSession = { transcript: transcript.slice(0, 3), draft: script[1].draft, spentTokens: 4000 };
    window.sessionStorage.setItem(setupStorageKey('22222222-2222-4222-8222-222222222222'), JSON.stringify(theirs));
    render(<SetupConversation userId={USER} />);
    await screen.findByRole('button', { name: 'Start' });
    expect(screen.queryByRole('heading', { name: 'You have a setup in progress' })).toBeNull();
    // Starting over and saving touch only this person's key.
    actions.ask.mockResolvedValueOnce(turnView(script[0]));
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await screen.findByRole('heading', { name: script[0].question ?? '' });
    expect(window.sessionStorage.getItem(KEY)).not.toBeNull();
    expect(window.sessionStorage.getItem(setupStorageKey('22222222-2222-4222-8222-222222222222'))).toBe(JSON.stringify(theirs));
  });

  it('works when the browser refuses storage', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    actions.ask.mockResolvedValueOnce(turnView(script[0]));
    await start();
    await screen.findByRole('heading', { name: script[0].question ?? '' });
    vi.restoreAllMocks();
  });
});
