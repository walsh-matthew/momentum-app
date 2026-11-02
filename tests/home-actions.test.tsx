// @vitest-environment jsdom
//
// MOM-167 part 14 (owner, 2026-11-02): home gives a person with goals "Log an entry" as the one main button and "Add to your goals" as a
// secondary button under it, at the top of the page; a person with no saved setup sees the setup card and no Log button; a person whose goals
// are all set aside has nothing to log, so "Add to your goals" is their one main button. Neither is a disabled or faded button.

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeActions } from '@/components/home/HomeActions';
import { AppShell } from '@/components/layout/AppShell';
import { canLogEntry } from '@/lib/utils/setupOffer';
import { EMPTY_CHANNEL_VIEWS } from '@/types/channelViews';
import type { HomeScoreboard } from '@/types/home';

vi.mock('@/app/actions/tasks', () => ({ toggleTaskStatus: vi.fn(), applyRebalanceProposal: vi.fn(), askClaudeToRebalance: vi.fn() }));
vi.mock('@/app/actions/goals', () => ({ createGoalWithPlanAction: vi.fn(), generateWeekOnePlanAction: vi.fn() }));
vi.mock('@/app/actions/auth', () => ({ signOutAction: vi.fn(), authenticate: vi.fn() }));
vi.mock('@/app/actions/integrations', () => ({ toggleConnectedApp: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));

afterEach(cleanup);

const READY: HomeScoreboard = { state: 'ready', today: '2026-11-02', hero: null, goals: [], tone: 'middle', celebration: 'medium' };
const renderHome = (home: HomeScoreboard | null | undefined) =>
  render(<AppShell views={EMPTY_CHANNEL_VIEWS} connectedApps={[]} moveChains={{}} home={home} />);
const log = () => screen.queryByRole('link', { name: 'Log an entry' });
const add = () => screen.queryByRole('link', { name: 'Add to your goals' });

describe('who can log an entry', () => {
  it('a person with an active goal can, even while a time zone or day end is still to set', () => {
    expect(canLogEntry(READY)).toBe(true);
    expect(canLogEntry({ state: 'needs_day_anchors', anchor: 'time_zone', reason: 'not_set' })).toBe(true);
  });
  it('a person with only set-aside goals, no saved setup, or a scoreboard that was not read cannot', () => {
    expect(canLogEntry({ state: 'no_goals', setupSaved: true })).toBe(false);
    expect(canLogEntry({ state: 'no_goals', setupSaved: false })).toBe(false);
    expect(canLogEntry(null)).toBe(false);
    expect(canLogEntry(undefined)).toBe(false);
  });
});

describe('home for a person with goals', () => {
  it('shows "Log an entry" as the one main button, to /log, then "Add to your goals" as a secondary button, to /setup', () => {
    renderHome(READY);
    const nav = screen.getByRole('navigation', { name: 'Home actions' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Log an entry', 'Add to your goals']);
    expect(log()?.getAttribute('href')).toBe('/log');
    expect(add()?.getAttribute('href')).toBe('/setup');
    expect(log()?.getAttribute('data-tone')).toBe('main');
    expect(add()?.getAttribute('data-tone')).toBe('second');
    // One main button, not two; each at least 48px tall; full width on a phone, side by side from 640px.
    expect(nav.querySelectorAll('[data-tone="main"]')).toHaveLength(1);
    for (const link of links) {
      expect(link.className).toContain('min-h-12');
      expect(link.className).toContain('w-full');
    }
    expect(nav.className).toContain('flex-col');
    expect(nav.className).toContain('sm:flex-row');
  });

  it('puts the buttons at the top of the page, before the week and the goals', () => {
    renderHome(READY);
    const nav = screen.getByRole('navigation', { name: 'Home actions' });
    const week = screen.getByRole('region', { name: 'Your week' });
    expect(nav.compareDocumentPosition(week) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the old bare "Add to your goals" link at the bottom is gone: the words appear once', () => {
    renderHome(READY);
    expect(screen.getAllByText('Add to your goals')).toHaveLength(1);
    expect(document.querySelectorAll('a[href="/setup"]')).toHaveLength(1);
    expect(document.querySelectorAll('a[href="/log"]')).toHaveLength(1);
  });

  it('a person still to set a time zone or day end is offered both, under the callout that says so', () => {
    renderHome({ state: 'needs_day_anchors', anchor: 'time_zone', reason: 'not_set' });
    expect(log()).toBeTruthy();
    expect(add()).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Your week' })).toBeTruthy();
  });

  it('neither button is switched off or faded', () => {
    renderHome(READY);
    for (const link of [log(), add()]) {
      expect(link?.getAttribute('aria-disabled')).toBeNull();
      expect(link?.className).not.toMatch(/(^|\s)opacity-/);
      expect(link?.className).not.toMatch(/(^|\s)pointer-events-none/);
    }
  });
});

describe('home for a person whose goals are all set aside', () => {
  it('has nothing to log, so "Add to your goals" is the one main button', () => {
    renderHome({ state: 'no_goals', setupSaved: true });
    expect(log()).toBeNull();
    expect(add()?.getAttribute('data-tone')).toBe('main');
    expect(document.querySelectorAll('[data-tone="main"]')).toHaveLength(1);
  });
});

describe('home for a person with no saved setup, or no scoreboard', () => {
  it('sees the setup card and no Log button and no add button', () => {
    renderHome({ state: 'no_goals', setupSaved: false });
    expect(screen.getByRole('region', { name: 'Set up your goals' })).toBeTruthy();
    expect(log()).toBeNull();
    expect(add()).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Home actions' })).toBeNull();
  });

  it('a scoreboard that could not be read, or signed out, offers neither', () => {
    renderHome(null);
    expect(log()).toBeNull();
    expect(add()).toBeNull();
    cleanup();
    renderHome(undefined);
    expect(log()).toBeNull();
    expect(add()).toBeNull();
  });
});

describe('the block on its own', () => {
  it('with canLog false leaves out Log an entry, with no empty gap', () => {
    const { container } = render(<HomeActions canLog={false} />);
    expect(container.querySelectorAll('a')).toHaveLength(1);
  });
});
