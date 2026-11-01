// @vitest-environment jsdom
//
// Home without the old model's controls (MOM-115, trial subset). The old goal wizard, the weekly-pace and rebalance entry points, the
// goal channel list and goal cards, and the empty feed heading are not on home, whatever the person's state: no setup, a saved setup,
// a scoreboard that could not be read, signed out. Their code, tables and services stay until MOM-115 is done, so the components'
// own tests (goal-wizard.test.tsx, rebalance-drawer*.test.tsx) still cover their content.

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/components/layout/AppShell';
import { ConnectedStackPanel } from '@/components/layout/ConnectedStackPanel';
import { buildChannelViews } from '@/lib/utils/channelViews';
import { EMPTY_CHANNEL_VIEWS, SIGNED_OUT_CHANNEL_VIEWS } from '@/types/channelViews';
import type { ConnectedAppPublic, MicroTask } from '@/types/database.types';
import type { HomeScoreboard } from '@/types/home';

vi.mock('@/app/actions/tasks', () => ({ toggleTaskStatus: vi.fn(), applyRebalanceProposal: vi.fn(), askClaudeToRebalance: vi.fn() }));
vi.mock('@/app/actions/goals', () => ({ createGoalWithPlanAction: vi.fn(), generateWeekOnePlanAction: vi.fn() }));
vi.mock('@/app/actions/auth', () => ({ signOutAction: vi.fn(), authenticate: vi.fn() }));
vi.mock('@/app/actions/integrations', () => ({ toggleConnectedApp: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));

afterEach(cleanup);

const READY: HomeScoreboard = { state: 'ready', today: '2026-10-29', hero: null, goals: [], tone: 'middle', celebration: 'medium' };
const states: [string, HomeScoreboard | null | undefined, typeof EMPTY_CHANNEL_VIEWS][] = [
  ['a person with no setup', { state: 'no_goals', setupSaved: false }, EMPTY_CHANNEL_VIEWS],
  ['a person with a saved setup', READY, EMPTY_CHANNEL_VIEWS],
  ['a saved setup that still needs a time zone', { state: 'needs_day_anchors', anchor: 'time_zone', reason: 'not_set' }, EMPTY_CHANNEL_VIEWS],
  ['a scoreboard that could not be read', null, EMPTY_CHANNEL_VIEWS],
  ['signed out', undefined, SIGNED_OUT_CHANNEL_VIEWS],
];

// Everything of the old model's that home used to offer or say.
const OLD_BUTTONS = ['New Goal Wizard', '+ New Goal Wizard', 'Adjust Weekly Pace', 'Set up your first goal', 'Start another goal', 'Review', 'Dismiss suggestion'];
const OLD_HEADINGS = ['No goals yet', 'No tasks yet', 'Shape your goals around real life.', 'Goal Channels', 'Your goals', 'A little room to rebalance?', 'One goal at a time'];

describe.each(states)('home for %s', (_name, home, views) => {
  const renderHome = () => render(<AppShell views={views} connectedApps={[]} moveChains={{}} home={home} />);

  it('has none of the old model\'s buttons, headings, lists or dialogs', () => {
    renderHome();
    for (const name of OLD_BUTTONS) expect(screen.queryByRole('button', { name }), name).toBeNull();
    for (const name of OLD_HEADINGS) expect(screen.queryByRole('heading', { name }), name).toBeNull();
    expect(screen.queryByRole('group', { name: 'Quick goal actions' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Your goals' })).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Goal channels' })).toBeNull();
    expect(document.querySelectorAll('dialog')).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/Choose a channel|Assistant chat coming soon/);
  });

  it('shows no heading with nothing under it', () => {
    renderHome();
    if (home !== undefined) {
      expect(screen.queryByRole('heading', { name: 'Make today count.' })).toBeNull();
      expect(within(screen.getByRole('main')).getByRole('heading', { level: 1, name: 'Momentum home' })).toBeTruthy();
    }
    // No section is left empty. (READY here has no hero and no goal cards, which a real ready scoreboard always has.)
    for (const section of Array.from(document.querySelectorAll('section:not(.home-scoreboard)'))) {
      expect((section.textContent ?? '').trim(), section.className).not.toBe('');
    }
  });

  it('keeps the workspace navigation, to the three pages that exist', () => {
    renderHome();
    const nav = within(screen.getByRole('navigation', { name: 'Workspace' }));
    expect(nav.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/', '/connections', '/settings']);
  });
});

describe('the right-hand column', () => {
  it('is the connected stack alone: no assistant tab, no rebalance card, and so no empty column', () => {
    render(<AppShell views={EMPTY_CHANNEL_VIEWS} connectedApps={[]} moveChains={{}} home={READY} />);
    const stack = within(screen.getByLabelText('Connected stack'));
    expect(stack.getByText('Connected stack')).toBeTruthy();
    expect(stack.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.queryByText('AI Assistant')).toBeNull();
    expect(document.querySelector('.desktop-right')?.children).toHaveLength(1);
  });
});

describe('what stays', () => {
  it('a person with no setup sees the setup card first after the header, with its one link', () => {
    render(<AppShell views={EMPTY_CHANNEL_VIEWS} connectedApps={[]} moveChains={{}} home={{ state: 'no_goals', setupSaved: false }} />);
    const content = document.querySelector('.workspace-content')!;
    const visible = Array.from(content.children).filter((el) => el.tagName !== 'HEADER' && !el.classList.contains('sr-only'));
    expect(visible).toHaveLength(1);
    expect(within(visible[0] as HTMLElement).getByRole('heading', { name: 'Set up your goals' })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Go to setup' })).toHaveLength(1);
  });

  it('a person whose scoreboard could not be read sees one callout with one solid Reload button, and no setup offer', () => {
    render(<AppShell views={EMPTY_CHANNEL_VIEWS} connectedApps={[]} moveChains={{}} home={null} />);
    const alert = within(screen.getByRole('alert'));
    expect(alert.getByText("Your goals didn't load just now.")).toBeTruthy();
    expect(alert.getByText('Nothing is lost.')).toBeTruthy();
    expect(screen.getAllByRole('button').filter((b) => b.textContent === 'Reload')).toHaveLength(1);
    expect(screen.queryByRole('link', { name: 'Go to setup' })).toBeNull();
  });

  it('a person whose old-model feed has tasks still sees it, with its heading, but none of the old controls', () => {
    const t = (id: string, title: string): MicroTask => ({
      id, user_id: 'u', goal_channel_id: 'g', title, task_type: 'build', minutes: 30, status: 'todo', fit: null, week_of: 1,
      due_date: null, carried_from_week: null, pulled_from_week: null, completed_at: null, source_provider: null,
      source_external_id: null, source_evidence: null, created_at: '2026-10-14T00:00:00Z', updated_at: '2026-10-14T00:00:00Z',
    });
    const views = buildChannelViews([{ id: 'g', title: 'Old goal', status: 'active', start_date: '2026-10-23' }], [t('00000000-0000-4000-8000-000000000001', 'Do the old thing')], [], '2026-10-23');
    render(<AppShell views={views} connectedApps={[]} moveChains={{}} home={READY} />);
    expect(screen.getByRole('heading', { name: 'Make today count.' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Do the old thing' })).toBeTruthy();
    // One h1 only: the hidden one is for the page without the old feed.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    for (const name of OLD_BUTTONS) expect(screen.queryByRole('button', { name }), name).toBeNull();
  });
});

describe('the connected stack count', () => {
  const app = (id: string, provider: 'hevy' | 'google_calendar', is_active: boolean): ConnectedAppPublic => ({
    id, user_id: 'u', provider, is_active, goal_channel_id: null, last_synced_at: null, created_at: '2026-10-14T00:00:00Z', updated_at: '2026-10-14T00:00:00Z',
  });
  const stack = (apps: ConnectedAppPublic[]) => {
    render(<ConnectedStackPanel connectedApps={apps} />);
    return within(screen.getByLabelText('Connected stack'));
  };

  it('0 connected: no badge at all, and no zero-padded "00"', () => {
    const panel = stack([app('a', 'hevy', false)]);
    expect(panel.queryByLabelText(/connected$/)).toBeNull();
    expect(screen.getByLabelText('Connected stack').textContent).not.toMatch(/\b0+\b/);
  });

  it('1 connected: a plain "1"', () => {
    const panel = stack([app('a', 'hevy', true), app('b', 'google_calendar', false)]);
    expect(panel.getByLabelText('1 connected').textContent).toBe('1');
  });

  it('2 connected: a plain "2", never "02"', () => {
    const panel = stack([app('a', 'hevy', true), app('b', 'google_calendar', true)]);
    expect(panel.getByLabelText('2 connected').textContent).toBe('2');
  });
});
