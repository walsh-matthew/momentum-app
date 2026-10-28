// @vitest-environment jsdom
//
// The "Sync now" button on the Hevy card (MOM-129), in a DOM with the server action mocked: where it appears, and
// what it shows in each state. The card is told words, never a key or a raw result.

import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IntegrationCardList } from '@/components/integrations/IntegrationCardList';
import type { ConnectedAppPublic } from '@/types/database.types';
import type { ConnectionStatus, HevySyncView, IntegrationAccount } from '@/types/integrations';

configure({ asyncUtilTimeout: 5000 });

const actions = vi.hoisted(() => ({ sync: vi.fn() }));
vi.mock('@/app/actions/integrations', () => ({
  saveHevyApiKey: vi.fn(),
  disconnectApp: vi.fn(),
  toggleConnectedApp: vi.fn(),
  syncHevyNow: actions.sync,
}));

const account = (provider: 'hevy' | 'google_calendar', status: ConnectionStatus): IntegrationAccount => ({
  provider,
  authType: status === 'not_connected' ? null : provider === 'hevy' ? 'api_key' : 'oauth2',
  status,
  connectedAt: status === 'not_connected' ? null : '2026-10-23T00:00:00Z',
  lastRefreshedAt: null,
  expiresAt: null,
  scopes: [],
  lastError: status === 'needs_reauth' ? 'The provider refused the key.' : null,
});
const app = (provider: string): ConnectedAppPublic => ({
  id: provider,
  user_id: 'u',
  provider,
  is_active: true,
  goal_channel_id: null,
  last_synced_at: null,
  created_at: '2026-10-23T00:00:00Z',
  updated_at: '2026-10-23T00:00:00Z',
});

function renderCards(hevy: ConnectionStatus, google: ConnectionStatus = 'not_connected') {
  return render(
    <IntegrationCardList connectedApps={[app('hevy'), app('google_calendar')]} accounts={[account('hevy', hevy), account('google_calendar', google)]} />,
  );
}
const card = (name: string) => within(screen.getByRole('heading', { name }).closest('li') as HTMLElement);
const view = (over: Partial<HevySyncView>): HevySyncView => ({ kind: 'done', message: 'Added 2 entries.', added: 2, updated: 0, ...over });

beforeEach(() => actions.sync.mockReset());
afterEach(cleanup);

describe('where the button appears', () => {
  it('on a connected Hevy card', () => {
    renderCards('connected');
    expect(card('Hevy').getByRole('button', { name: 'Sync now' })).toBeTruthy();
  });

  it('not before Hevy is connected, not when it needs reconnecting, not on another card', () => {
    for (const status of ['not_connected', 'needs_reauth', 'error'] as const) {
      renderCards(status, 'connected');
      expect(card('Hevy').queryByRole('button', { name: 'Sync now' }), status).toBeNull();
      expect(card('Google Calendar').queryByRole('button', { name: 'Sync now' }), status).toBeNull();
      cleanup();
    }
  });
});

describe('the states', () => {
  it('idle: nothing is said until it is tapped', () => {
    renderCards('connected');
    expect(card('Hevy').queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('syncing: the button is disabled and busy, then ready again with the counts', async () => {
    let finish: (v: { ok: true; data: HevySyncView }) => void = () => {};
    actions.sync.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderCards('connected');
    fireEvent.click(card('Hevy').getByRole('button', { name: 'Sync now' }));

    const busy = await card('Hevy').findByRole('button', { name: 'Syncing…' });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    expect(busy.getAttribute('aria-busy')).toBe('true');

    finish({ ok: true, data: view({}) });
    expect((await card('Hevy').findByRole('status')).textContent).toBe('Added 2 entries.');
    const ready = card('Hevy').getByRole('button', { name: 'Sync now' }) as HTMLButtonElement;
    expect(ready.disabled).toBe(false);
    expect(actions.sync).toHaveBeenCalledTimes(1);
  });

  it('done, nothing new, no target, paused and busy are said as plain status text', async () => {
    renderCards('connected');
    const cases: Array<[Partial<HevySyncView>, string]> = [
      [{}, 'Added 2 entries.'],
      [{ kind: 'nothing_new', message: 'Up to date. Nothing new from Hevy.', added: 0 }, 'Up to date. Nothing new from Hevy.'],
      [{ kind: 'no_target', message: 'No target uses Hevy yet, so nothing was counted.', added: 0 }, 'No target uses Hevy yet, so nothing was counted.'],
      [{ kind: 'sync_off', message: 'Syncing is paused. Switch it on to sync.', added: 0 }, 'Syncing is paused. Switch it on to sync.'],
      [{ kind: 'busy', message: 'A sync is already running.', added: 0 }, 'A sync is already running.'],
    ];
    for (const [over, text] of cases) {
      actions.sync.mockResolvedValueOnce({ ok: true, data: view(over) });
      fireEvent.click(await card('Hevy').findByRole('button', { name: 'Sync now' }));
      await waitFor(() => expect(card('Hevy').getByRole('status').textContent).toBe(text));
    }
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a refused key and a timeout are alerts, and the button is ready to try again', async () => {
    renderCards('connected');
    for (const [kind, message] of [
      ['failed_fixable', 'Hevy refused your key. Reconnect it to continue.'],
      ['failed_retry', "Hevy didn't answer. Nothing was changed. Try again."],
    ] as const) {
      actions.sync.mockResolvedValueOnce({ ok: true, data: view({ kind, message, added: 0 }) });
      fireEvent.click(await card('Hevy').findByRole('button', { name: 'Sync now' }));
      await waitFor(() => expect(card('Hevy').getByRole('alert').textContent).toBe(message));
      expect((card('Hevy').getByRole('button', { name: 'Sync now' }) as HTMLButtonElement).disabled).toBe(false);
    }
  });

  it('a service error is shown as the service worded it', async () => {
    actions.sync.mockResolvedValue({ ok: false, error: 'Sign in to sync your workouts.' });
    renderCards('connected');
    fireEvent.click(card('Hevy').getByRole('button', { name: 'Sync now' }));
    expect((await card('Hevy').findByRole('alert')).textContent).toBe('Sign in to sync your workouts.');
  });

  it('a dropped connection says nothing was changed, and the next tap clears the old message', async () => {
    actions.sync.mockRejectedValueOnce(new Error('fetch failed'));
    renderCards('connected');
    fireEvent.click(card('Hevy').getByRole('button', { name: 'Sync now' }));
    expect((await card('Hevy').findByRole('alert')).textContent).toBe('Could not reach the server. Nothing was changed. Try again.');

    actions.sync.mockResolvedValueOnce({ ok: true, data: view({}) });
    fireEvent.click(await card('Hevy').findByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(card('Hevy').getByRole('status').textContent).toBe('Added 2 entries.'));
    expect(card('Hevy').queryByRole('alert')).toBeNull();
  });
});
