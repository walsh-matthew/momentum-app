// MOM-93: the home page tells "the plan could not be read" from "the plan was read and has no goals". It is the
// page's choice, made from the service result, so this runs the real page with the services replaced: an error
// result and a thrown error give load_failed, and a successful read that finds nothing still gives no_goals.
// The page only builds the shell's props here; it renders nothing and writes nothing.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_CHANNELS, type ChannelViews } from '@/types/channelViews';

const services = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  listConnectedApps: vi.fn(),
  getPlanSnapshot: vi.fn(),
}));
vi.mock('@/lib/services/auth', () => ({ getCurrentUser: services.getCurrentUser }));
vi.mock('@/lib/services/integrations', () => ({ listConnectedApps: services.listConnectedApps }));
vi.mock('@/lib/services/tasks', () => ({ getPlanSnapshot: services.getPlanSnapshot }));
// The page imports the shell, which pulls in client code that is not under test here.
vi.mock('@/components/layout/AppShell', () => ({ AppShell: () => null }));

import HomePage from '@/app/page';

interface ShellElement {
  props: { views: ChannelViews; connectedApps: unknown[] };
}
async function viewsOfPage() {
  const element = (await HomePage()) as unknown as ShellElement;
  return element.props.views;
}
const stateOf = (views: ChannelViews) => views.byChannel[ALL_CHANNELS].feedState;

beforeEach(() => {
  Object.values(services).forEach((fn) => fn.mockReset());
  services.getCurrentUser.mockResolvedValue({ ok: true, data: { id: 'u', email: 'a@example.com' } });
  services.listConnectedApps.mockResolvedValue({ ok: true, data: [] });
});

describe('the home page chooses between could-not-load and no-goals', () => {
  it('an error result from the plan read is load_failed', async () => {
    services.getPlanSnapshot.mockResolvedValue({ ok: false, error: 'boom' });
    expect(stateOf(await viewsOfPage())).toBe('load_failed');
  });

  it('a thrown error from the plan read is load_failed', async () => {
    services.getPlanSnapshot.mockRejectedValue(new Error('unreachable'));
    expect(stateOf(await viewsOfPage())).toBe('load_failed');
  });

  it('a successful read with no goals is no_goals, not load_failed', async () => {
    services.getPlanSnapshot.mockResolvedValue({ ok: true, data: { goals: [], tasks: [], history: [], today: '2026-10-26' } });
    expect(stateOf(await viewsOfPage())).toBe('no_goals');
  });

  it('a failed read of the connected apps alone does not make the plan look failed', async () => {
    services.getPlanSnapshot.mockResolvedValue({ ok: true, data: { goals: [], tasks: [], history: [], today: '2026-10-26' } });
    services.listConnectedApps.mockRejectedValue(new Error('unreachable'));
    expect(stateOf(await viewsOfPage())).toBe('no_goals');
  });

  it('a failed read shows no channel, so no goal title or task can appear', async () => {
    services.getPlanSnapshot.mockResolvedValue({ ok: false, error: 'boom' });
    const views = await viewsOfPage();
    expect(views.channels).toEqual([]);
    expect(Object.keys(views.byChannel)).toEqual([ALL_CHANNELS]);
  });

  it('with no session the page reads nothing and stays signed_out', async () => {
    services.getCurrentUser.mockResolvedValue({ ok: false, error: 'no session' });
    expect(stateOf(await viewsOfPage())).toBe('signed_out');
    expect(services.getPlanSnapshot).not.toHaveBeenCalled();
  });
});
