// @vitest-environment jsdom
//
// The connect, reconnect and disconnect controls on the Connected Apps page (MOM-62), in a DOM with the server
// actions mocked. The cards get only IntegrationAccount (status and fixed wording), never a token or a key. The
// Hevy key goes into a password field, is sent to the action and is not kept: not echoed, and the field is emptied.

import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IntegrationCardList } from '@/components/integrations/IntegrationCardList';
import type { ConnectedAppPublic } from '@/types/database.types';
import type { ConnectionStatus, IntegrationAccount } from '@/types/integrations';

// The default of 1 second is too tight when the whole suite runs in parallel.
configure({ asyncUtilTimeout: 5000 });

const actions = vi.hoisted(() => ({ saveHevy: vi.fn(), disconnect: vi.fn(), toggle: vi.fn(), sync: vi.fn() }));
vi.mock('@/app/actions/integrations', () => ({
  saveHevyApiKey: actions.saveHevy,
  disconnectApp: actions.disconnect,
  toggleConnectedApp: actions.toggle,
  syncHevyNow: actions.sync,
}));

const KEY = 'hevy-key-0123456789abcdef-do-not-echo';

const account = (provider: 'hevy' | 'google_calendar', status: ConnectionStatus, over: Partial<IntegrationAccount> = {}): IntegrationAccount => ({
  provider,
  authType: status === 'not_connected' ? null : provider === 'hevy' ? 'api_key' : 'oauth2',
  status,
  connectedAt: status === 'not_connected' ? null : '2026-10-23T00:00:00Z',
  lastRefreshedAt: null,
  expiresAt: null,
  scopes: [],
  lastError: null,
  ...over,
});
const app = (provider: string, is_active = true): ConnectedAppPublic => ({
  id: provider,
  user_id: 'u',
  provider,
  is_active,
  goal_channel_id: null,
  last_synced_at: null,
  created_at: '2026-10-23T00:00:00Z',
  updated_at: '2026-10-23T00:00:00Z',
});

function renderCards(accounts: IntegrationAccount[], apps: ConnectedAppPublic[] = []) {
  return render(<IntegrationCardList connectedApps={apps} accounts={accounts} />);
}
const card = (name: string) => within(screen.getByRole('heading', { name }).closest('li') as HTMLElement);

beforeEach(() => {
  actions.saveHevy.mockReset();
  actions.disconnect.mockReset();
  actions.toggle.mockReset();
});
afterEach(cleanup);

describe('Google Calendar', () => {
  it('not connected: a Connect button that posts to the start route, which is a full-page redirect', () => {
    renderCards([account('hevy', 'not_connected'), account('google_calendar', 'not_connected')]);
    const google = card('Google Calendar');
    expect(google.getByText('Not connected')).toBeTruthy();
    const button = google.getByRole('button', { name: 'Connect Google Calendar' });
    const form = button.closest('form') as HTMLFormElement;
    expect(form.getAttribute('method')).toBe('post');
    expect(form.getAttribute('action')).toBe('/api/integrations/google/start');
    expect(button.getAttribute('type')).toBe('submit');
    expect(google.getByText(/Read-only access to your calendar events/)).toBeTruthy();
    // No stored connection to disconnect, and nothing to switch on or off yet.
    expect(google.queryByRole('button', { name: 'Disconnect' })).toBeNull();
    expect(google.queryByRole('switch')).toBeNull();
  });

  it('connected: shows it, offers Disconnect, and the on/off switch is there', () => {
    renderCards([account('hevy', 'not_connected'), account('google_calendar', 'connected')], [app('google_calendar')]);
    const google = card('Google Calendar');
    expect(google.getByText('Connected')).toBeTruthy();
    expect(google.getByText('Syncing is on')).toBeTruthy();
    expect(google.getByRole('switch', { name: 'Google Calendar' }).getAttribute('aria-checked')).toBe('true');
    expect(google.getByRole('button', { name: 'Disconnect' })).toBeTruthy();
    expect(google.queryByRole('button', { name: /Connect Google Calendar/ })).toBeNull();
  });

  it('paused: says syncing is paused, in words', () => {
    renderCards([account('hevy', 'not_connected'), account('google_calendar', 'connected')], [app('google_calendar', false)]);
    expect(card('Google Calendar').getByText('Syncing is paused')).toBeTruthy();
  });

  it('needs reconnect: says so in words, shows the fixed reason, and offers Reconnect and Disconnect', () => {
    renderCards([
      account('hevy', 'not_connected'),
      account('google_calendar', 'needs_reauth', { lastError: 'The connection was revoked or has expired.' }),
    ]);
    const google = card('Google Calendar');
    expect(google.getByText('Needs reconnect')).toBeTruthy();
    expect(google.getByText(/The connection was revoked or has expired\. Connect it again to continue\./)).toBeTruthy();
    const reconnect = google.getByRole('button', { name: 'Reconnect Google Calendar' });
    expect((reconnect.closest('form') as HTMLFormElement).getAttribute('action')).toBe('/api/integrations/google/start');
    expect(google.getByRole('button', { name: 'Disconnect' })).toBeTruthy();
    expect(google.queryByRole('switch')).toBeNull();
  });

  it('a connection problem is its own word, not "not connected"', () => {
    renderCards([account('hevy', 'not_connected'), account('google_calendar', 'error', { lastError: 'The provider could not be reached.' })]);
    const google = card('Google Calendar');
    expect(google.getByText('Connection problem')).toBeTruthy();
    expect(google.queryByText('Not connected')).toBeNull();
    expect(google.getByRole('button', { name: 'Reconnect Google Calendar' })).toBeTruthy();
  });
});

describe('disconnecting', () => {
  it('takes two clicks, and the first changes nothing', async () => {
    renderCards([account('hevy', 'not_connected'), account('google_calendar', 'connected')], [app('google_calendar')]);
    const google = card('Google Calendar');

    fireEvent.click(google.getByRole('button', { name: 'Disconnect' }));
    expect(actions.disconnect).not.toHaveBeenCalled();
    expect(google.getByText(/This deletes the stored connection/)).toBeTruthy();

    actions.disconnect.mockResolvedValue({ ok: true, data: account('google_calendar', 'not_connected') });
    fireEvent.click(google.getByRole('button', { name: 'Disconnect Google Calendar' }));
    await waitFor(() => expect(actions.disconnect).toHaveBeenCalledTimes(1));
    expect(actions.disconnect).toHaveBeenCalledWith('google_calendar');
  });

  it('"Keep it connected" backs out without calling anything', () => {
    renderCards([account('hevy', 'not_connected'), account('google_calendar', 'connected')]);
    const google = card('Google Calendar');
    fireEvent.click(google.getByRole('button', { name: 'Disconnect' }));
    fireEvent.click(google.getByRole('button', { name: 'Keep it connected' }));
    expect(actions.disconnect).not.toHaveBeenCalled();
    expect(google.getByRole('button', { name: 'Disconnect' })).toBeTruthy();
  });

  it('shows the service\'s refusal and stays connected', async () => {
    actions.disconnect.mockResolvedValue({ ok: false, error: 'Could not disconnect that app.' });
    renderCards([account('hevy', 'not_connected'), account('google_calendar', 'connected')]);
    const google = card('Google Calendar');
    fireEvent.click(google.getByRole('button', { name: 'Disconnect' }));
    fireEvent.click(google.getByRole('button', { name: 'Disconnect Google Calendar' }));
    expect((await google.findByRole('alert')).textContent).toBe('Could not disconnect that app.');
  });

  it('a request that fails shows a plain message instead of failing silently', async () => {
    actions.disconnect.mockRejectedValue(new Error('NetworkError ' + KEY));
    renderCards([account('hevy', 'connected'), account('google_calendar', 'not_connected')]);
    const hevy = card('Hevy');
    fireEvent.click(hevy.getByRole('button', { name: 'Disconnect' }));
    fireEvent.click(hevy.getByRole('button', { name: 'Disconnect Hevy' }));
    const alert = await hevy.findByRole('alert');
    expect(alert.textContent).toContain('Nothing was changed');
    expect(alert.textContent).not.toContain('NetworkError');
  });

  it('is offered for a connection that needs reconnecting, so a bad one can be removed', () => {
    renderCards([account('hevy', 'needs_reauth'), account('google_calendar', 'not_connected')]);
    expect(card('Hevy').getByRole('button', { name: 'Disconnect' })).toBeTruthy();
  });
});

describe('the Hevy key form', () => {
  const keyField = () => screen.getByLabelText('Hevy API key') as HTMLInputElement;

  it('is a password field that does not autofill, with help that says the key is stored on the server', () => {
    renderCards([account('hevy', 'not_connected'), account('google_calendar', 'not_connected')]);
    const input = keyField();
    expect(input.type).toBe('password');
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.required).toBe(true);
    expect(input.value).toBe('');
    expect(card('Hevy').getByText(/stored on the server and never shown again/)).toBeTruthy();
    expect(card('Hevy').getByRole('button', { name: 'Connect Hevy' })).toBeTruthy();
    expect(actions.saveHevy).not.toHaveBeenCalled();
  });

  it('sends the key to the action, shows its message, and leaves the field empty with the key nowhere on the page', async () => {
    actions.saveHevy.mockResolvedValue({ error: null, notice: 'Hevy is connected.' });
    renderCards([account('hevy', 'not_connected'), account('google_calendar', 'not_connected')]);

    fireEvent.change(keyField(), { target: { value: KEY } });
    fireEvent.click(card('Hevy').getByRole('button', { name: 'Connect Hevy' }));

    await waitFor(() => expect(actions.saveHevy).toHaveBeenCalledTimes(1));
    const formData = actions.saveHevy.mock.calls[0][1] as FormData;
    expect(formData.get('apiKey')).toBe(KEY);
    expect((await card('Hevy').findByRole('status')).textContent).toBe('Hevy is connected.');
    await waitFor(() => expect(keyField().value).toBe(''));
    expect(document.body.innerHTML).not.toContain(KEY);
  });

  it('a rejected key shows the message, is not echoed back and leaves the field empty', async () => {
    actions.saveHevy.mockResolvedValue({ error: 'An API key has no spaces or special characters.', notice: null });
    renderCards([account('hevy', 'not_connected'), account('google_calendar', 'not_connected')]);

    fireEvent.change(keyField(), { target: { value: 'not a valid key at all' } });
    fireEvent.click(card('Hevy').getByRole('button', { name: 'Connect Hevy' }));

    expect((await card('Hevy').findByRole('alert')).textContent).toBe('An API key has no spaces or special characters.');
    await waitFor(() => expect(keyField().value).toBe(''));
    expect(document.body.innerHTML).not.toContain('not a valid key at all');
  });

  it('shows "Saving…" while it waits and blocks a second submit', async () => {
    let resolve!: (v: unknown) => void;
    actions.saveHevy.mockReturnValue(new Promise((r) => (resolve = r)));
    renderCards([account('hevy', 'not_connected'), account('google_calendar', 'not_connected')]);

    fireEvent.change(keyField(), { target: { value: KEY } });
    fireEvent.click(card('Hevy').getByRole('button', { name: 'Connect Hevy' }));

    const busy = await card('Hevy').findByRole('button', { name: 'Saving…' });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    resolve({ error: null, notice: 'Hevy is connected.' });
    expect((await card('Hevy').findByRole('status')).textContent).toBe('Hevy is connected.');
    expect(actions.saveHevy).toHaveBeenCalledTimes(1);
  });

  it('when the stored key stopped working the button says Reconnect and the status says so', () => {
    renderCards([account('hevy', 'needs_reauth', { lastError: 'No refresh token is stored.' }), account('google_calendar', 'not_connected')]);
    const hevy = card('Hevy');
    expect(hevy.getByText('Needs reconnect')).toBeTruthy();
    expect(hevy.getByRole('button', { name: 'Reconnect Hevy' })).toBeTruthy();
  });

  it('is not shown once connected: the key is never displayed, so there is nothing to edit in place', () => {
    renderCards([account('hevy', 'connected'), account('google_calendar', 'not_connected')]);
    expect(screen.queryByLabelText('Hevy API key')).toBeNull();
    expect(card('Hevy').getByRole('button', { name: 'Disconnect' })).toBeTruthy();
  });
});

describe('the cards never receive anything secret', () => {
  it('render from IntegrationAccount only: no token or key field exists on the prop, and none appears on the page', () => {
    const accounts = [
      account('hevy', 'connected'),
      account('google_calendar', 'connected', { scopes: ['https://www.googleapis.com/auth/calendar.readonly'] }),
    ];
    for (const a of accounts) {
      expect(Object.keys(a).sort()).toEqual(
        ['authType', 'connectedAt', 'expiresAt', 'lastError', 'lastRefreshedAt', 'provider', 'scopes', 'status'],
      );
    }
    renderCards(accounts);
    expect(document.body.innerHTML).not.toMatch(/access_token|refresh_token|api_key|client_secret/i);
  });

  it('without accounts (the desktop side panel) the cards are only the switches, as before', () => {
    render(<IntegrationCardList connectedApps={[app('hevy')]} />);
    expect(screen.getAllByRole('switch')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Connect|Disconnect/ })).toBeNull();
  });
});
