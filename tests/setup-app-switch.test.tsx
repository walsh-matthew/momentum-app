// @vitest-environment jsdom
//
// MOM-167 part 3: switching apps in iOS Safari during a long turn. Safari cancels the request that is in flight; on the person's return it
// fails with a network error, which used to show "Couldn't connect ... Try again". The screen now notes that the page left the screen
// while a reply was awaited and, when the request then fails, sends the same conversation again once on its own, after a pause. The
// person's answer is in the conversation once; a second failure, or a failure with no app switch, shows the card as before.
// Part 2 is here too: the playback that comes back after a change starts closed. No Claude call: the server action is a stub.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SetupConversation } from '@/components/setup/SetupConversation';
import { runSetupEval } from '@/lib/setup/evals';
import { RESEND_AFTER_MS, RESEND_MARGIN_MS, setupStorageKey } from '@/lib/setup/session';
import type { AssistantTurn, SetupSession } from '@/types/setup';
import type { SetupTurnView } from '@/types/setupScreen';
import { SETUP_CASES } from './setup-evals/cases';
import { scriptedModel } from './helpers/setupScript';

const USER = '11111111-1111-4111-8111-111111111111';

const actions = vi.hoisted(() => ({ ask: vi.fn(), save: vi.fn(), pause: vi.fn() }));
vi.mock('@/app/actions/setup', () => ({ askSetupTurn: actions.ask, saveSetup: actions.save }));
vi.mock('@/components/setup/resendPause', () => ({ pauseBeforeResend: actions.pause }));

const turnView = (turn: AssistantTurn, spentTokens = 1000): { ok: true; data: SetupTurnView } => ({ ok: true, data: { kind: 'turn', turn, spentTokens, rejected: 0 } });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let script: AssistantTurn[];
beforeAll(async () => {
  const c = SETUP_CASES.find((x) => x.expect === 'clean');
  if (!c) throw new Error('no clean case');
  await runSetupEval(c, scriptedModel(c.script));
  script = c.script;
});

const sent = (call: number) => actions.ask.mock.calls[call][0] as SetupSession;

// The page goes to the background, as it does when the person switches apps, and comes back.
function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

async function startAndAnswer() {
  actions.ask.mockResolvedValueOnce(turnView(script[0]));
  render(<SetupConversation userId={USER} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Start' }));
  await screen.findByRole('heading', { name: script[0].question ?? '' });
  fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'I want to run more' } });
}
const send = () => fireEvent.click(screen.getByRole('button', { name: 'Send' }));
const peopleSaid = (call: number): string[] => sent(call).transcript.flatMap((m) => (m.role === 'person' ? [m.text] : []));

beforeEach(() => {
  actions.ask.mockReset();
  actions.save.mockReset();
  actions.pause.mockReset();
  actions.pause.mockResolvedValue(undefined);
  window.sessionStorage.clear();
  setVisibility('visible');
});
afterEach(() => {
  cleanup();
  setVisibility('visible');
});

describe('a request cut off by an app switch', () => {
  it('is sent again once, on its own, and the person never sees "Try again"', async () => {
    await startAndAnswer();
    const cutOff = deferred<never>();
    actions.ask.mockReturnValueOnce(cutOff.promise).mockResolvedValueOnce(turnView(script[1], 2000));
    // The pause is held, so the screen can be looked at while it waits.
    const holding = deferred<void>();
    actions.pause.mockReturnValueOnce(holding.promise);

    send();
    await screen.findByRole('status');
    // Away in another app, then back: the request fails the way Safari fails it.
    setVisibility('hidden');
    setVisibility('visible');
    cutOff.reject(new TypeError('Load failed'));

    await waitFor(() => expect(actions.pause).toHaveBeenCalledTimes(1));
    expect(actions.pause).toHaveBeenCalledWith(RESEND_AFTER_MS);
    // While it waits: the question, the answer and "Thinking…", and no error card.
    expect(screen.getByRole('heading', { name: script[0].question ?? '' })).toBeTruthy();
    expect(screen.getByText('I want to run more')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Thinking…');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();

    holding.resolve();
    await screen.findByRole('heading', { name: script[1].question ?? '' });
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    // Three calls in all: the first question, the cut-off answer, and its resend. The answer is in the conversation once, and the
    // resend carries exactly what the cut-off one did.
    expect(actions.ask).toHaveBeenCalledTimes(3);
    expect(peopleSaid(2)).toEqual(['I want to run more']);
    expect(sent(2).transcript).toEqual(sent(1).transcript);
    expect(sent(2).spentTokens).toBe(sent(1).spentTokens);
    // The conversation kept in the tab holds the answer once, followed by Claude's next turn.
    const stored = JSON.parse(window.sessionStorage.getItem(setupStorageKey(USER)) ?? '{}') as SetupSession;
    expect(stored.transcript.filter((m) => m.role === 'person')).toHaveLength(1);
  });

  it('is sent again only once: when the resend fails too, the card shows and nothing more is sent', async () => {
    await startAndAnswer();
    actions.ask
      .mockImplementationOnce(async () => {
        setVisibility('hidden');
        setVisibility('visible');
        throw new TypeError('Load failed');
      })
      .mockRejectedValueOnce(new TypeError('Load failed'));
    send();
    await screen.findByRole('button', { name: 'Try again' });
    expect(actions.ask).toHaveBeenCalledTimes(3);
    expect(actions.pause).toHaveBeenCalledTimes(1);
    // Still the one answer, kept for the person's own tap.
    expect(peopleSaid(2)).toEqual(['I want to run more']);
  });

  it('is not sent again when the page never left: a lost connection shows the card, as before', async () => {
    await startAndAnswer();
    actions.ask.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    send();
    await screen.findByRole('button', { name: 'Try again' });
    expect(actions.ask).toHaveBeenCalledTimes(2);
    expect(actions.pause).not.toHaveBeenCalled();
  });

  it('is not sent again for a refusal the server answered: only a cut-off request is', async () => {
    await startAndAnswer();
    actions.ask.mockImplementationOnce(async () => {
      setVisibility('hidden');
      setVisibility('visible');
      return { ok: false as const, error: 'Sign in again to continue.' };
    });
    send();
    await screen.findByText('Sign in again to continue.');
    expect(actions.ask).toHaveBeenCalledTimes(2);
    expect(actions.pause).not.toHaveBeenCalled();
  });

  it('waits the seconds the server names when it says "too soon" to the resend, and sends once more', async () => {
    await startAndAnswer();
    actions.ask
      .mockImplementationOnce(async () => {
        setVisibility('hidden');
        setVisibility('visible');
        throw new TypeError('Load failed');
      })
      .mockResolvedValueOnce({ ok: true, data: { kind: 'wait', message: 'Please wait a few seconds before asking again.', retryAfterSeconds: 2 } })
      .mockResolvedValueOnce(turnView(script[1], 2000));
    send();
    await screen.findByRole('heading', { name: script[1].question ?? '' });
    expect(actions.pause.mock.calls.map((c) => c[0])).toEqual([RESEND_AFTER_MS, 2 * 1000 + RESEND_MARGIN_MS]);
    expect(actions.ask).toHaveBeenCalledTimes(4);
    expect(peopleSaid(3)).toEqual(['I want to run more']);
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('ignores a late reply to the cut-off request once the resend has taken over', async () => {
    await startAndAnswer();
    const cutOff = deferred<never>();
    const late = deferred<{ ok: true; data: SetupTurnView }>();
    // The cut-off request ends in an error first; a stray reply to an even older request would arrive later. Only the newest counts.
    actions.ask.mockReturnValueOnce(cutOff.promise).mockReturnValueOnce(late.promise);
    send();
    await screen.findByRole('status');
    setVisibility('hidden');
    setVisibility('visible');
    cutOff.reject(new TypeError('Load failed'));
    await waitFor(() => expect(actions.ask).toHaveBeenCalledTimes(3));
    late.resolve(turnView(script[1], 2000));
    await screen.findByRole('heading', { name: script[1].question ?? '' });
    expect(actions.ask).toHaveBeenCalledTimes(3);
  });
});

describe('the pause is past the server’s gap between calls', () => {
  it('is longer than a second, with a margin', () => {
    expect(RESEND_AFTER_MS).toBeGreaterThan(1000);
    expect(RESEND_AFTER_MS).toBeGreaterThanOrEqual(1000 + RESEND_MARGIN_MS);
  });
});

describe('the playback after a change (part 2)', () => {
  it('comes back closed, with "Yes, that is right" as the main answer and no grey "Keep it as it is"', async () => {
    const at = script.findIndex((t) => t.kind === 'playback' && t.chunk === 'targets');
    actions.ask.mockResolvedValueOnce(turnView(script[at])).mockResolvedValueOnce(turnView(script[at]));
    render(<SetupConversation userId={USER} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start' }));
    await screen.findByRole('heading', { name: /did I get this right\?/i });

    fireEvent.click(screen.getByRole('button', { name: 'Change something' }));
    fireEvent.change(screen.getByLabelText('What would you like to change?'), { target: { value: 'Make it three instead' } });
    expect(screen.getByRole('button', { name: 'Keep it as it is' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Send the change' }));

    // The changed playback has arrived when the second turn has been asked for and answered; wait for its settled control.
    const yes = await screen.findByRole('button', { name: 'Yes, that is right' });
    await waitFor(() => expect(actions.ask).toHaveBeenCalledTimes(2));
    expect(yes.getAttribute('data-tone')).toBe('main');
    expect((yes as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Change something' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Keep it as it is' })).toBeNull();
    expect(screen.queryByLabelText('What would you like to change?')).toBeNull();
  });

  it('the final confirmation after a change comes back closed too', async () => {
    const at = script.findIndex((t) => t.kind === 'final');
    actions.ask.mockResolvedValueOnce(turnView(script[at])).mockResolvedValueOnce(turnView(script[at]));
    render(<SetupConversation userId={USER} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start' }));
    await screen.findByRole('heading', { name: 'Ready to save?' });
    fireEvent.click(screen.getByRole('button', { name: 'Change something' }));
    fireEvent.change(screen.getByLabelText('What would you like to change?'), { target: { value: 'One more change' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send the change' }));
    await waitFor(() => expect(actions.ask).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByLabelText('What would you like to change?')).toBeNull());
    expect(screen.getByRole('button', { name: 'Save my setup' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Keep it as it is' })).toBeNull();
  });
});
