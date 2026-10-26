// @vitest-environment jsdom
//
// The Connected Apps page when connection status cannot be read (MOM-103): a calm fixed message with Try again, and
// none of the cards or the connect, disconnect and switch controls, because "Connected" on the old switch-only
// cards only meant "switched on". When the read works the page is unchanged. The services are mocked; the page is
// the real server component, called as a function and rendered in a DOM.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ConnectionsPage from '@/app/connections/page';
import type { ConnectedAppPublic } from '@/types/database.types';
import type { IntegrationAccount } from '@/types/integrations';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  getCurrentUser: vi.fn(),
  listConnectedApps: vi.fn(),
  listIntegrationAccounts: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock('@/lib/services/auth', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/lib/services/integrations', () => ({
  listConnectedApps: mocks.listConnectedApps,
  listIntegrationAccounts: mocks.listIntegrationAccounts,
}));
vi.mock('@/app/actions/integrations', () => ({
  saveHevyApiKey: vi.fn(),
  disconnectApp: vi.fn(),
  toggleConnectedApp: vi.fn(),
}));
// The frame is the navigation around the page; it has its own tests (layout.test.tsx).
vi.mock('@/components/layout/PageFrame', () => ({
  PageFrame: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const SECRET_ERROR = 'Missing SUPABASE_SERVICE_ROLE_KEY sb_secret_0123456789abcdef';

const account = (provider: 'hevy' | 'google_calendar'): IntegrationAccount => ({
  provider,
  authType: null,
  status: 'not_connected',
  connectedAt: null,
  lastRefreshedAt: null,
  expiresAt: null,
  scopes: [],
  lastError: null,
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

async function renderPage() {
  render(await ConnectionsPage({ searchParams: Promise.resolve({}) }));
}

function expectNoCardsOrControls() {
  expect(screen.queryByRole('switch')).toBeNull();
  expect(screen.queryByRole('listitem')).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Hevy' })).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Google Calendar' })).toBeNull();
  expect(screen.queryByRole('button', { name: /Connect|Reconnect|Disconnect/ })).toBeNull();
  expect(screen.queryByText(/^Connected$|Not connected|Syncing is/)).toBeNull();
}

beforeEach(() => {
  mocks.refresh.mockReset();
  mocks.getCurrentUser.mockResolvedValue({ ok: true, data: { id: 'u', email: 'a@example.com' } });
  mocks.listConnectedApps.mockResolvedValue({ ok: true, data: [app('hevy')] });
  mocks.listIntegrationAccounts.mockResolvedValue({ ok: true, data: [account('hevy'), account('google_calendar')] });
});
afterEach(cleanup);

describe('status cannot be read', () => {
  it.each([
    ['the connection status comes back as an error', () => mocks.listIntegrationAccounts.mockResolvedValue({ ok: false, error: SECRET_ERROR })],
    ['the connection status read throws', () => mocks.listIntegrationAccounts.mockRejectedValue(new Error(SECRET_ERROR))],
    ['the app switches come back as an error', () => mocks.listConnectedApps.mockResolvedValue({ ok: false, error: SECRET_ERROR })],
    ['the app switches read throws', () => mocks.listConnectedApps.mockRejectedValue(new Error(SECRET_ERROR))],
  ])('%s: shows the message and Try again, and no card or control', async (_name, fail) => {
    fail();
    await renderPage();
    expect(screen.getByRole('alert').textContent).toContain("We couldn't load connection status");
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expectNoCardsOrControls();
  });

  it('shows fixed text only: no thrown error, setting name or key', async () => {
    mocks.listIntegrationAccounts.mockRejectedValue(new Error(SECRET_ERROR));
    await renderPage();
    const html = document.body.innerHTML;
    expect(html).not.toContain(SECRET_ERROR);
    expect(html).not.toMatch(/SUPABASE|SERVICE_ROLE|sb_secret|api[_ ]?key|token/i);
  });

  it('Try again asks Next to render the page again, and nothing else', async () => {
    mocks.listIntegrationAccounts.mockResolvedValue({ ok: false, error: SECRET_ERROR });
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
});

describe('status can be read', () => {
  it('shows the cards with their status and no error message', async () => {
    await renderPage();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Hevy' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Google Calendar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Connect Hevy' })).toBeTruthy();
    expect(screen.getAllByText('Not connected')).toHaveLength(2);
  });

  it('with no connections at all, is the normal page and not the error', async () => {
    mocks.listConnectedApps.mockResolvedValue({ ok: true, data: [] });
    await renderPage();
    expect(screen.queryByText(/couldn't load/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Connect Google Calendar' })).toBeTruthy();
  });
});
