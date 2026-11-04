// @vitest-environment jsdom
//
// MOM-178, the two cards code writes, on the screen. What these hold the code to:
// 1. The settings card: the owner's heading and line, four rows each with its question, its reason and its choices as buttons; nothing is
//    pre-selected; a tap chooses and a second tap takes it back; "Next" is always there and never dimmed, and sends only what was tapped.
// 2. The time zone card: "Your phone is set to <zone> (<city>). Is that your time zone?" with Yes (the one main button) and A different one;
//    Yes sends the zone as accepted; A different one opens the search, and a pick is said; with no zone from the phone, only the search.
// 3. In the conversation: the card the person is on survives a reload, and answering the settings card shows the part played back with no
//    request to the server at all; answering the zone card sends one request, for Claude's next question, with the zone already in the draft.
// The server actions are stubs: no Claude call, no network.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsCard } from '@/components/setup/SettingsCard';
import { SetupConversation } from '@/components/setup/SetupConversation';
import { TimeZoneCard } from '@/components/setup/TimeZoneCard';
import { SETTINGS_SKIP_LINE, TIME_ZONE_ASK, answerTimeZone, timeZoneQuestion } from '@/lib/setup/cards';
import { cardStep } from '@/lib/setup/cardTurns';
import { emptyDraft } from '@/lib/setup/draft';
import { runSetupEval } from '@/lib/setup/evals';
import { setupStorageKey } from '@/lib/setup/session';
import type { SetupSession } from '@/types/setup';
import { SETUP_CASES } from './setup-evals/cases';
import { scriptedModel } from './helpers/setupScript';

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
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const pressed = () => document.querySelectorAll('[aria-pressed="true"]');

describe('the settings card', () => {
  const card = () => {
    const onDone = vi.fn();
    render(<SettingsCard settings={emptyDraft().model.settings} busy={false} onDone={onDone} />);
    return onDone;
  };

  it('is the owner\'s card: the heading, the skip line, four questions with their reasons, and a Next', () => {
    card();
    expect(screen.getByRole('heading', { name: 'How should Momentum talk to you?' })).toBeTruthy();
    expect(screen.getByText(SETTINGS_SKIP_LINE)).toBeTruthy();
    expect(document.querySelectorAll('fieldset')).toHaveLength(4);
    for (const text of [
      'How direct should Momentum be?',
      'Your progress and weekly look-back are worded that way.',
      'How big should a celebration be?',
      'Used when you pass a number you set.',
      'How much should your weekly look-back cover?',
      'It decides what you see when you look back on your week.',
      'Look back and plan the next week together, or separately?',
      'It sets whether those two happen in one go.',
    ]) {
      expect(screen.getByText(text), text).toBeTruthy();
    }
    for (const label of ['Gentle', 'Plain', 'Direct', 'Low-key', 'Medium', 'Big', 'Short recap only', 'Recap, with an offer to go deeper', 'Recap and a few questions', 'One sitting', 'Separately']) {
      expect(screen.getByRole('button', { name: label }), label).toBeTruthy();
    }
    expect(screen.queryByText(/reminder|check-in|quiet|balance/i)).toBeNull();
  });

  it('has nothing selected, one main button that is never dimmed, and no "What does this mean?" link', () => {
    card();
    expect(pressed()).toHaveLength(0);
    const next = screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement;
    expect(next.disabled).toBe(false);
    expect(document.querySelectorAll('[data-tone="main"]')).toHaveLength(1);
    expect(screen.queryByText('What does this mean?')).toBeNull();
  });

  it('sends only what was tapped, one choice a row, and a second tap takes a choice back', () => {
    const onDone = card();
    fireEvent.click(screen.getByRole('button', { name: 'Gentle' }));
    fireEvent.click(screen.getByRole('button', { name: 'Direct' }));
    fireEvent.click(screen.getByRole('button', { name: 'Big' }));
    fireEvent.click(screen.getByRole('button', { name: 'Big' }));
    fireEvent.click(screen.getByRole('button', { name: 'Separately' }));
    expect(pressed()).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onDone).toHaveBeenCalledWith({ tone: 'direct', review_planning: 'separate' });
  });

  it('sends nothing at all when nothing was tapped', () => {
    const onDone = card();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onDone).toHaveBeenCalledWith({});
  });

  it('asks only the rows still unset', () => {
    render(<SettingsCard settings={{ ...emptyDraft().model.settings, tone: 'gentle', reviewDepth: 'full' }} busy={false} onDone={vi.fn()} />);
    expect(document.querySelectorAll('fieldset')).toHaveLength(2);
    expect(screen.queryByText('How direct should Momentum be?')).toBeNull();
  });
});

describe('the time zone card', () => {
  const ZONE = 'America/Chicago';
  it('shows the zone and its city, with Yes as the one main button and A different one under it', () => {
    const onPick = vi.fn();
    render(<TimeZoneCard question={timeZoneQuestion(ZONE)} deviceZone={ZONE} busy={false} onPick={onPick} />);
    expect(screen.getByRole('heading', { name: 'Your phone is set to America/Chicago (Chicago). Is that your time zone?' })).toBeTruthy();
    expect(document.querySelectorAll('[data-tone="main"]')).toHaveLength(1);
    expect(within(document.querySelector('[data-tone="main"]') as HTMLElement).queryByText('Yes')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'A different one' })).toBeTruthy();
    expect(screen.queryByRole('searchbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(onPick).toHaveBeenCalledWith(ZONE, 'accepted');
  });

  it('opens the search for A different one, and a pick is the person\'s own', () => {
    const onPick = vi.fn();
    render(<TimeZoneCard question={timeZoneQuestion(ZONE)} deviceZone={ZONE} busy={false} onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: 'A different one' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search time zones' }), { target: { value: 'denver' } });
    fireEvent.click(within(screen.getByRole('list', { name: 'Matching time zones' })).getAllByRole('button')[0]);
    expect(onPick).toHaveBeenCalledWith('America/Denver', 'said');
  });

  it('with no zone from the phone, asks plainly and shows only the search', () => {
    render(<TimeZoneCard question={TIME_ZONE_ASK} deviceZone={null} busy={false} onPick={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Which time zone are you in?' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Yes' })).toBeNull();
    expect(screen.getByRole('searchbox', { name: 'Search time zones' })).toBeTruthy();
  });
});

// A finished conversation's session, cut where the card is on screen.
async function sessionAt(chunk: 'targets' | 'planning'): Promise<SetupSession> {
  const c = SETUP_CASES.find((x) => x.id === 'run-b-habit-ideas');
  if (!c) throw new Error('no case');
  const report = await runSetupEval(c, scriptedModel(c.script));
  const t = report.transcript;
  const at = t.findIndex((m) => m.role === 'assistant' && m.turn.kind === 'playback' && m.turn.chunk === chunk && t[t.indexOf(m) + 1]?.role === 'person');
  const shown = t[at];
  if (shown?.role !== 'assistant') throw new Error('no playback');
  const draft = chunk === 'targets' ? { ...shown.turn.draft, model: { ...shown.turn.draft.model, person: { ...shown.turn.draft.model.person, timeZone: null } } } : shown.turn.draft;
  const transcript = t.slice(0, at + 2);
  const card = cardStep(transcript, draft, 'America/Denver');
  if (!card) throw new Error('no card');
  return { transcript: [...transcript, { role: 'assistant', turn: card }], draft: card.draft, spentTokens: 0 };
}

describe('in the conversation', () => {
  it('shows the settings card from a saved session, and answering it plays the part back with no request to the server', async () => {
    window.sessionStorage.setItem(KEY, JSON.stringify(await sessionAt('planning')));
    render(<SetupConversation userId={USER} />);
    expect(await screen.findByRole('heading', { name: 'How should Momentum talk to you?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Gentle' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('heading', { name: 'How Momentum talks to you: did I get this right?' })).toBeTruthy();
    expect(screen.getByText('Momentum talks to you gently.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Yes, that is right' })).toBeTruthy();
    expect(actions.ask).not.toHaveBeenCalled();
    // What was tapped is kept in this tab, as the person's own answer.
    const stored = JSON.parse(window.sessionStorage.getItem(KEY) ?? '{}') as SetupSession;
    expect(stored.draft.model.settings.tone).toBe('gentle');
    expect(stored.transcript.at(-2)).toEqual({ role: 'person', text: 'Tone: Gentle.' });
  });

  it('answers the zone card with one request, for Claude\'s next question, and the zone already in the draft', async () => {
    const session = await sessionAt('targets');
    window.sessionStorage.setItem(KEY, JSON.stringify(session));
    actions.ask.mockResolvedValue({ ok: false, error: 'stop here' });
    render(<SetupConversation userId={USER} />);
    expect(await screen.findByRole('heading', { name: 'Your phone is set to America/Denver (Denver). Is that your time zone?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    await waitFor(() => expect(actions.ask).toHaveBeenCalledTimes(1));
    const sent = actions.ask.mock.calls[0][0] as SetupSession;
    expect(sent.draft.model.person.timeZone).toBe('America/Denver');
    expect(sent.transcript.at(-1)).toEqual({ role: 'person', text: 'Yes, that works.' });
    expect(answerTimeZone(session, 'America/Denver', 'accepted')?.draft.said.at(-1)).toMatchObject({ path: 'person.timeZone', how: 'accepted' });
  });
});
