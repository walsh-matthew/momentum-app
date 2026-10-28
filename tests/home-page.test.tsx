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
  getHomeScoreboard: vi.fn(),
}));
vi.mock('@/lib/services/auth', () => ({ getCurrentUser: services.getCurrentUser }));
vi.mock('@/lib/services/integrations', () => ({ listConnectedApps: services.listConnectedApps }));
vi.mock('@/lib/services/tasks', () => ({ getPlanSnapshot: services.getPlanSnapshot }));
vi.mock('@/lib/services/scoreboard', () => ({ getHomeScoreboard: services.getHomeScoreboard }));
// The page imports the shell, which pulls in client code that is not under test here.
vi.mock('@/components/layout/AppShell', () => ({ AppShell: () => null }));

import HomePage from '@/app/page';

interface ShellElement {
  props: { views: ChannelViews; connectedApps: unknown[]; home?: unknown };
}
async function propsOfPage() {
  const element = (await HomePage()) as unknown as ShellElement;
  return element.props;
}
async function viewsOfPage() {
  return (await propsOfPage()).views;
}
const stateOf = (views: ChannelViews) => views.byChannel[ALL_CHANNELS].feedState;

beforeEach(() => {
  Object.values(services).forEach((fn) => fn.mockReset());
  services.getCurrentUser.mockResolvedValue({ ok: true, data: { id: 'u', email: 'a@example.com' } });
  services.listConnectedApps.mockResolvedValue({ ok: true, data: [] });
  services.getHomeScoreboard.mockResolvedValue({ ok: true, data: { state: 'no_goals' } });
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

// The goal model's scoreboard (MOM-112) is read on its own: neither read can make the other look failed.
describe('the home page passes the goal model scoreboard to the shell', () => {
  const planWithNoGoals = { ok: true, data: { goals: [], tasks: [], history: [], today: '2026-10-26' } };

  it('passes what the service read, and a read with no goals is no_goals, not null', async () => {
    services.getPlanSnapshot.mockResolvedValue(planWithNoGoals);
    expect((await propsOfPage()).home).toEqual({ state: 'no_goals' });
  });

  it('an error result or a thrown error is null (could not load), and the plan below is untouched', async () => {
    services.getPlanSnapshot.mockResolvedValue(planWithNoGoals);
    services.getHomeScoreboard.mockResolvedValue({ ok: false, error: 'boom' });
    let props = await propsOfPage();
    expect(props.home).toBeNull();
    expect(stateOf(props.views)).toBe('no_goals');

    services.getHomeScoreboard.mockRejectedValue(new Error('unreachable'));
    props = await propsOfPage();
    expect(props.home).toBeNull();
    expect(stateOf(props.views)).toBe('no_goals');
  });

  it('a failed plan read does not make the scoreboard look failed', async () => {
    services.getPlanSnapshot.mockResolvedValue({ ok: false, error: 'boom' });
    const props = await propsOfPage();
    expect(stateOf(props.views)).toBe('load_failed');
    expect(props.home).toEqual({ state: 'no_goals' });
  });

  it('with no session the scoreboard is not read and none is passed', async () => {
    services.getCurrentUser.mockResolvedValue({ ok: false, error: 'no session' });
    const props = await propsOfPage();
    expect(props.home).toBeUndefined();
    expect(services.getHomeScoreboard).not.toHaveBeenCalled();
  });
});
